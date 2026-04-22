import { summarizeModelMemoryPayload } from "./payload-summary.ts";
import type {
  ActiveMemorySetRecord,
  ActiveMemorySlotRecord,
  MemoryProjectionType,
  RuntimeCompatibleMemoryRecord,
  RuntimeMemoryRecord,
  WorkspaceProjectionTargetRecord,
  WorkspaceProjectionVersionRecord,
} from "./runtime-read-models.ts";
import {
  hashRuntimeValue,
  projectLegacyRecordToRuntimeMemoryRecord,
} from "./runtime-read-models.ts";
import { upsertGeneratedZone } from "./runtime/projections/file-writer.ts";
import {
  PROJECTION_REGISTRY,
  type ProjectionRegistryEntry,
} from "./runtime/projections/registry.ts";
import { renderAgentsMdSection } from "./runtime/projections/render-agents-md.ts";
import { renderMemoryMd } from "./runtime/projections/render-memory-md.ts";
import { renderUserMd } from "./runtime/projections/render-user-md.ts";
import {
  buildWorkspaceProjectionVersion,
  getWorkspaceProjectionTarget,
} from "./runtime/projections/targets.ts";

const GENERATED_WORKSPACE_MEMORY_BLOCK_PATTERN =
  /<!-- BEGIN GENERATED:\s*(?:model-memory|openclaw-canonical)\s*-->[\s\S]*?<!-- END GENERATED:\s*(?:model-memory|openclaw-canonical)\s*-->\n*/g;
const LEGACY_MEMORY_PROJECTION_BLOCK_PATTERN =
  /<!-- OPENCLAW:MEMORY-PROJECTION:START\b[\s\S]*?<!-- OPENCLAW:MEMORY-PROJECTION:END\b[^\n]*-->\n*/g;

export type ProjectionCompilerInput = {
  targetId: string;
  memoryObjects: RuntimeCompatibleMemoryRecord[];
  slots: ActiveMemorySlotRecord[];
  sets: ActiveMemorySetRecord[];
  existingFileContent?: string;
  builtAt?: Date;
};

export type ProjectionCompileResult = {
  target: WorkspaceProjectionTargetRecord;
  renderedText: string;
  outputFileContent: string;
  version: WorkspaceProjectionVersionRecord;
  digest: ProjectionDigestArtifact;
};

export type ProjectionCatalogCompileResult = {
  targetId: string;
  registryEntry: ProjectionRegistryEntry;
  renderedText: string;
  version: WorkspaceProjectionVersionRecord;
  digest: ProjectionDigestArtifact;
};

export type ProjectionDigestArtifact = {
  schemaVersion: "memory_projection.v1";
  projectionId: string;
  projectionType: MemoryProjectionType;
  scope: Record<string, unknown>;
  title: string;
  summary: string;
  sourceMemoryIds: string[];
  sourceEventIds: string[];
  sourceEdgeIds: string[];
  contentHash: string;
  compiledAt: string;
  freshness: {
    status: "fresh" | "stale";
    reason?: string | null;
  };
  staleMarkers: string[];
  conflictMarkers: string[];
  artifactPaths: {
    markdownPath?: string;
    jsonPath?: string;
    digestPath?: string;
  };
  retrievalDigest: {
    title: string;
    summary: string;
    sourceMemoryIds: string[];
    sourceEventIds: string[];
    contentHash: string;
  };
};

function filterSlotsForTarget(
  slots: ActiveMemorySlotRecord[],
  memoryObjects: RuntimeMemoryRecord[],
  target: WorkspaceProjectionTargetRecord,
) {
  return slots.filter((slot) => {
    const record = memoryObjects.find((entry) => entry.id === slot.currentObjectId);
    return (
      !!record &&
      target.allowedCanonicalClasses.includes(record.canonicalClass) &&
      target.allowedKinds.includes(record.kind)
    );
  });
}

function filterSetsForTarget(
  sets: ActiveMemorySetRecord[],
  memoryObjects: RuntimeMemoryRecord[],
  target: WorkspaceProjectionTargetRecord,
) {
  return sets.filter((entry) => {
    const record = memoryObjects.find((object) => object.id === entry.memoryObjectId);
    return (
      !!record &&
      target.allowedCanonicalClasses.includes(record.canonicalClass) &&
      target.allowedKinds.includes(record.kind)
    );
  });
}

function renderTarget(
  target: WorkspaceProjectionTargetRecord,
  memoryObjects: RuntimeMemoryRecord[],
  slots: ActiveMemorySlotRecord[],
  sets: ActiveMemorySetRecord[],
): string {
  if (target.targetKind === "memory_md") {
    return renderMemoryMd({ memoryObjects, slots, sets });
  }
  if (target.targetKind === "user_md") {
    return renderUserMd({ memoryObjects, slots });
  }
  return renderAgentsMdSection({ memoryObjects, slots, sets });
}

function projectionTypeForTarget(target: WorkspaceProjectionTargetRecord): MemoryProjectionType {
  if (target.targetKind === "user_md") {
    return "user_profile_page";
  }
  if (target.targetKind === "agents_md") {
    return "agent_digest";
  }
  return "projection_digest";
}

function collectStringFields(value: unknown, keys: string[]): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const record = value as Record<string, unknown>;
  return keys.flatMap((key) => {
    const candidate = record[key];
    return typeof candidate === "string" && candidate.trim().length > 0 ? [candidate] : [];
  });
}

function collectSourceEventIds(memoryObjects: RuntimeMemoryRecord[]): string[] {
  return [
    ...new Set(
      memoryObjects.flatMap((object) =>
        (object.provenance ?? []).flatMap((span) =>
          collectStringFields(span, [
            "eventId",
            "memoryEventId",
            "sourceEventId",
            "source_event_id",
            "sourceIngestEventId",
            "source_ingest_event_id",
          ]),
        ),
      ),
    ),
  ].toSorted((left, right) => left.localeCompare(right));
}

function collectSourceEdgeIds(memoryObjects: RuntimeMemoryRecord[]): string[] {
  return [
    ...new Set(
      memoryObjects.flatMap((object) =>
        (object.provenance ?? []).flatMap((span) =>
          collectStringFields(span, ["edgeId", "memoryEdgeId", "sourceEdgeId", "edge_id"]),
        ),
      ),
    ),
  ].toSorted((left, right) => left.localeCompare(right));
}

function isActiveProjectionSource(object: RuntimeMemoryRecord): boolean {
  return (
    object.lifecycleState !== "superseded" &&
    object.lifecycleState !== "expired" &&
    object.lifecycleState !== "provisional" &&
    object.lifecycleState !== "conflict_hold" &&
    !object.supersededAt &&
    !object.expiredAt
  );
}

function buildStaleMarkers(memoryObjects: RuntimeMemoryRecord[]): string[] {
  const markers = new Set<string>();
  if (memoryObjects.length === 0) {
    markers.add("no_source_memory_ids");
  }
  if (
    memoryObjects.some((object) => object.lifecycleState === "superseded" || object.supersededAt)
  ) {
    markers.add("superseded_source_memory");
  }
  if (memoryObjects.some((object) => object.lifecycleState === "expired" || object.expiredAt)) {
    markers.add("deleted_source_memory");
  }
  return [...markers].toSorted((left, right) => left.localeCompare(right));
}

function buildConflictMarkers(memoryObjects: RuntimeMemoryRecord[]): string[] {
  return memoryObjects.some((object) => object.lifecycleState === "conflict_hold")
    ? ["conflicted_source_memory"]
    : [];
}

function summarizeProjectionSources(
  memoryObjects: RuntimeMemoryRecord[],
  projectionType: MemoryProjectionType,
): string {
  const kinds = [...new Set(memoryObjects.map((object) => object.kind))].toSorted((left, right) =>
    left.localeCompare(right),
  );
  return `${projectionType} compiled from ${memoryObjects.length} active MMV2 source memories${kinds.length ? ` (${kinds.join(", ")})` : ""}.`;
}

function renderList(values: string[]): string {
  if (values.length === 0) {
    return "- none";
  }
  return values.map((value) => `- ${value}`).join("\n");
}

function renderSourceMemorySummary(memoryObjects: RuntimeMemoryRecord[]): string {
  if (memoryObjects.length === 0) {
    return "- none";
  }
  return memoryObjects
    .toSorted((left, right) => left.id.localeCompare(right.id))
    .slice(0, 25)
    .map((object) => {
      const summary = summarizeModelMemoryPayload({
        kind: object.kind,
        payload: object.payload,
      });
      return [
        `- ${object.id}`,
        `  class: ${object.canonicalClass}`,
        `  kind: ${object.kind}`,
        `  subject: ${object.normalizedSubject || object.normalizedTitle || "unspecified"}`,
        `  summary: ${summary}`,
      ].join("\n");
    })
    .join("\n");
}

function buildProjectionDigestArtifact(input: {
  projectionType: MemoryProjectionType;
  title: string;
  summary: string;
  sourceObjects: RuntimeMemoryRecord[];
  artifactPath?: string;
  builtAt: Date;
}): ProjectionDigestArtifact {
  const activeSourceObjects = input.sourceObjects.filter(isActiveProjectionSource);
  const staleMarkers = buildStaleMarkers(input.sourceObjects);
  const conflictMarkers = buildConflictMarkers(input.sourceObjects);
  const sourceMemoryIds = activeSourceObjects
    .map((object) => object.id)
    .toSorted((left, right) => left.localeCompare(right));
  const sourceEventIds = collectSourceEventIds(activeSourceObjects);
  const sourceEdgeIds = collectSourceEdgeIds(activeSourceObjects);
  const contentHash = hashRuntimeValue(
    JSON.stringify(
      {
        projectionType: input.projectionType,
        title: input.title,
        summary: input.summary,
        sourceMemoryIds,
        sourceEventIds,
        sourceEdgeIds,
        staleMarkers,
        conflictMarkers,
      },
      null,
      2,
    ),
  );
  const artifactPaths = input.artifactPath
    ? {
        markdownPath: input.artifactPath.endsWith(".md") ? input.artifactPath : undefined,
        digestPath: input.artifactPath,
      }
    : {};
  return {
    schemaVersion: "memory_projection.v1",
    projectionId: `projection:${input.projectionType}:${contentHash.slice(0, 16)}`,
    projectionType: input.projectionType,
    scope: {},
    title: input.title,
    summary: input.summary,
    sourceMemoryIds,
    sourceEventIds,
    sourceEdgeIds,
    contentHash,
    compiledAt: input.builtAt.toISOString(),
    freshness: {
      status: staleMarkers.length > 0 ? "stale" : "fresh",
      reason: staleMarkers.length > 0 ? staleMarkers.join(",") : null,
    },
    staleMarkers,
    conflictMarkers,
    artifactPaths,
    retrievalDigest: {
      title: input.title,
      summary: input.summary,
      sourceMemoryIds,
      sourceEventIds,
      contentHash,
    },
  };
}

function isArtifactOnlyProjectionTarget(target: WorkspaceProjectionTargetRecord): boolean {
  return target.targetKind === "memory_md" || target.targetKind === "user_md";
}

function buildOutputFileContent(
  target: WorkspaceProjectionTargetRecord,
  existingFileContent: string | undefined,
  renderedText: string,
): string {
  if (!isArtifactOnlyProjectionTarget(target)) {
    return upsertGeneratedZone(existingFileContent, renderedText, target.generatedBlockId);
  }
  const stripped = (existingFileContent ?? "")
    .replace(GENERATED_WORKSPACE_MEMORY_BLOCK_PATTERN, "")
    .replace(LEGACY_MEMORY_PROJECTION_BLOCK_PATTERN, "")
    .trim();
  return stripped.length > 0 ? `${stripped}\n` : "";
}

export function compileProjection(input: ProjectionCompilerInput): ProjectionCompileResult {
  const target = getWorkspaceProjectionTarget(input.targetId);
  const memoryObjects = input.memoryObjects.map(projectLegacyRecordToRuntimeMemoryRecord);
  const filteredSlots = filterSlotsForTarget(input.slots, memoryObjects, target);
  const filteredSets = filterSetsForTarget(input.sets, memoryObjects, target);
  const renderedText = renderTarget(target, memoryObjects, filteredSlots, filteredSets);
  const sourceObjectIds = [
    ...filteredSlots.map((slot) => slot.currentObjectId),
    ...filteredSets.map((entry) => entry.memoryObjectId),
  ];
  const sourceObjects = sourceObjectIds
    .map((id) => memoryObjects.find((object) => object.id === id))
    .filter((object): object is RuntimeMemoryRecord => !!object);
  const projectionType = projectionTypeForTarget(target);
  const digest = buildProjectionDigestArtifact({
    projectionType,
    title: target.targetId,
    summary: summarizeProjectionSources(
      sourceObjects.filter(isActiveProjectionSource),
      projectionType,
    ),
    sourceObjects,
    builtAt: input.builtAt ?? new Date(0),
  });
  const version = buildWorkspaceProjectionVersion({
    targetId: target.targetId,
    projectionType,
    renderedText,
    sourceObjectIds,
    sourceEventIds: digest.sourceEventIds,
    sourceEdgeIds: digest.sourceEdgeIds,
    sourceSlotKeys: filteredSlots.map((slot) => slot.slotKey),
    sourceSetKeys: filteredSets.map((entry) => entry.setKey),
    freshness: digest.freshness,
    staleMarkers: digest.staleMarkers,
    conflictMarkers: digest.conflictMarkers,
    retrievalDigest: digest.retrievalDigest,
    builtAt: input.builtAt,
  });
  const outputFileContent = buildOutputFileContent(target, input.existingFileContent, renderedText);
  digest.artifactPaths.markdownPath = version.canonicalArtifactPath;
  digest.artifactPaths.digestPath = version.canonicalArtifactPath.replace(/\.md$/u, ".json");

  return {
    target,
    renderedText,
    outputFileContent,
    version,
    digest,
  };
}

function renderProjectionCatalogPage(input: {
  registryEntry: ProjectionRegistryEntry;
  digest: ProjectionDigestArtifact;
  activeSourceObjects: RuntimeMemoryRecord[];
}): string {
  const { registryEntry, digest } = input;
  return [
    `# ${digest.title}`,
    "",
    "This projection is a compiled MMV2 view. It is not canonical truth.",
    "",
    "## Metadata",
    "",
    `- projection_id: ${digest.projectionId}`,
    `- projection_type: ${digest.projectionType}`,
    `- schema_version: ${digest.schemaVersion}`,
    `- retrieval_role: ${registryEntry.retrievalRole}`,
    `- content_hash: ${digest.contentHash}`,
    `- compiled_at: ${digest.compiledAt}`,
    `- freshness: ${digest.freshness.status}`,
    `- freshness_reason: ${digest.freshness.reason ?? "none"}`,
    `- artifact_path: ${digest.artifactPaths.markdownPath ?? "pending"}`,
    "",
    "## Source Memory IDs",
    "",
    renderList(digest.sourceMemoryIds),
    "",
    "## Source Event IDs",
    "",
    renderList(digest.sourceEventIds),
    "",
    "## Source Edge IDs",
    "",
    renderList(digest.sourceEdgeIds),
    "",
    "## Stale Markers",
    "",
    renderList(digest.staleMarkers),
    "",
    "## Conflict Markers",
    "",
    renderList(digest.conflictMarkers),
    "",
    "## Retrieval Digest",
    "",
    `- title: ${digest.retrievalDigest.title}`,
    `- summary: ${digest.retrievalDigest.summary}`,
    `- content_hash: ${digest.retrievalDigest.contentHash}`,
    "",
    "## Source Summaries",
    "",
    renderSourceMemorySummary(input.activeSourceObjects),
  ].join("\n");
}

function selectProjectionSources(
  projectionType: MemoryProjectionType,
  memoryObjects: RuntimeMemoryRecord[],
): RuntimeMemoryRecord[] {
  switch (projectionType) {
    case "user_profile_page":
      return memoryObjects.filter((object) => object.canonicalClass === "user");
    case "project_page":
      return memoryObjects.filter((object) => object.canonicalClass === "project");
    case "procedure_page":
      return memoryObjects.filter((object) => object.kind === "procedure");
    case "source_page":
      return memoryObjects.filter(
        (object) => object.kind === "reference" || object.canonicalClass === "reference",
      );
    case "decision_log":
      return memoryObjects.filter((object) =>
        [object.normalizedSubject, object.normalizedSearchText, object.kind]
          .filter(Boolean)
          .join(" ")
          .includes("decision"),
      );
    case "timeline_page":
      return memoryObjects.filter(
        (object) =>
          object.kind === "fact" ||
          object.activationBasis === "daily_recovery_candidate" ||
          object.rationaleCodes.includes("episode"),
      );
    case "entity_page":
      return memoryObjects.filter(
        (object) => object.canonicalClass === "reference" || object.canonicalClass === "project",
      );
    case "dashboard":
    case "agent_digest":
    case "projection_digest":
    case "workspace_projection":
      return memoryObjects;
  }
  return memoryObjects;
}

export function compileProjectionCatalogDigests(input: {
  memoryObjects: RuntimeCompatibleMemoryRecord[];
  builtAt?: Date;
  registry?: readonly ProjectionRegistryEntry[];
}): ProjectionDigestArtifact[] {
  const builtAt = input.builtAt ?? new Date(0);
  const memoryObjects = input.memoryObjects.map(projectLegacyRecordToRuntimeMemoryRecord);
  return (input.registry ?? PROJECTION_REGISTRY).map((entry) => {
    const sourceObjects = selectProjectionSources(entry.projectionType, memoryObjects);
    return buildProjectionDigestArtifact({
      projectionType: entry.projectionType,
      title: entry.projectionType.replace(/_/gu, " "),
      summary: summarizeProjectionSources(
        sourceObjects.filter(isActiveProjectionSource),
        entry.projectionType,
      ),
      sourceObjects,
      artifactPath: `${entry.artifactPathPrefix}/digest-${hashRuntimeValue(entry.projectionType).slice(0, 12)}.json`,
      builtAt,
    });
  });
}

export function compileProjectionCatalogPages(input: {
  memoryObjects: RuntimeCompatibleMemoryRecord[];
  builtAt?: Date;
  registry?: readonly ProjectionRegistryEntry[];
}): ProjectionCatalogCompileResult[] {
  const builtAt = input.builtAt ?? new Date(0);
  const memoryObjects = input.memoryObjects.map(projectLegacyRecordToRuntimeMemoryRecord);
  return (input.registry ?? PROJECTION_REGISTRY).map((registryEntry) => {
    const sourceObjects = selectProjectionSources(registryEntry.projectionType, memoryObjects);
    const activeSourceObjects = sourceObjects.filter(isActiveProjectionSource);
    const digest = buildProjectionDigestArtifact({
      projectionType: registryEntry.projectionType,
      title: registryEntry.projectionType.replace(/_/gu, " "),
      summary: summarizeProjectionSources(activeSourceObjects, registryEntry.projectionType),
      sourceObjects,
      builtAt,
    });
    const targetId = `catalog-${registryEntry.projectionType}`;
    const canonicalArtifactPath = `${registryEntry.artifactPathPrefix}/page.md`;
    digest.artifactPaths.markdownPath = canonicalArtifactPath;
    digest.artifactPaths.digestPath = canonicalArtifactPath.replace(/\.md$/u, ".json");
    const renderedText = renderProjectionCatalogPage({
      registryEntry,
      digest,
      activeSourceObjects,
    });
    const version = buildWorkspaceProjectionVersion({
      targetId,
      projectionType: registryEntry.projectionType,
      renderedText,
      sourceObjectIds: digest.sourceMemoryIds,
      sourceEventIds: digest.sourceEventIds,
      sourceEdgeIds: digest.sourceEdgeIds,
      sourceSlotKeys: [],
      sourceSetKeys: [],
      freshness: digest.freshness,
      staleMarkers: digest.staleMarkers,
      conflictMarkers: digest.conflictMarkers,
      retrievalDigest: digest.retrievalDigest,
      canonicalArtifactPath,
      builtAt,
    });

    return {
      targetId,
      registryEntry,
      renderedText,
      version,
      digest,
    };
  });
}
