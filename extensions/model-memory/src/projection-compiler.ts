import {
  buildDerivedConflictMarkers,
  buildDerivedFreshness,
  buildDerivedStaleMarkers,
  deriveLifecycleExclusion,
  getDerivedArtifactRolePolicy,
  hashDerivedArtifactValue,
  uniqueSortedStrings,
} from "./derived-artifact.ts";
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
import { projectLegacyRecordToRuntimeMemoryRecord } from "./runtime-read-models.ts";
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
  return uniqueSortedStrings(
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
  );
}

function collectSourceEdgeIds(memoryObjects: RuntimeMemoryRecord[]): string[] {
  return uniqueSortedStrings(
    memoryObjects.flatMap((object) =>
      (object.provenance ?? []).flatMap((span) =>
        collectStringFields(span, ["edgeId", "memoryEdgeId", "sourceEdgeId", "edge_id"]),
      ),
    ),
  );
}

function isActiveProjectionSource(object: RuntimeMemoryRecord): boolean {
  return (
    !deriveLifecycleExclusion({
      lifecycleState: object.lifecycleState,
      invalidAt: object.expiredAt?.toISOString(),
    }) && !object.supersededAt
  );
}

function buildStaleMarkers(memoryObjects: RuntimeMemoryRecord[]): string[] {
  const markers: string[] = [];
  if (memoryObjects.length === 0) {
    markers.push("no_source_memory_ids");
  }
  if (
    memoryObjects.some((object) => object.lifecycleState === "superseded" || object.supersededAt)
  ) {
    markers.push("superseded_source_memory");
  }
  if (memoryObjects.some((object) => object.lifecycleState === "expired" || object.expiredAt)) {
    markers.push("deleted_source_memory");
  }
  return buildDerivedStaleMarkers(markers);
}

function buildConflictMarkers(memoryObjects: RuntimeMemoryRecord[]): string[] {
  return buildDerivedConflictMarkers(
    memoryObjects.some((object) => object.lifecycleState === "conflict_hold")
      ? ["conflicted_source_memory"]
      : [],
  );
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

function payloadStringField(object: RuntimeMemoryRecord, keys: string[]): string | undefined {
  if (!object.payload || typeof object.payload !== "object" || Array.isArray(object.payload)) {
    return undefined;
  }
  const payload = object.payload;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function payloadStringArrayField(object: RuntimeMemoryRecord, keys: string[]): string[] {
  if (!object.payload || typeof object.payload !== "object" || Array.isArray(object.payload)) {
    return [];
  }
  const payload = object.payload;
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0)
        .slice(0, 12);
    }
  }
  return [];
}

function memorySubject(object: RuntimeMemoryRecord): string {
  return (
    object.normalizedSubject ||
    object.normalizedTitle ||
    payloadStringField(object, ["subject", "title", "entity", "path"]) ||
    "unspecified"
  );
}

function memorySummary(object: RuntimeMemoryRecord): string {
  return summarizeModelMemoryPayload({
    kind: object.kind,
    payload: object.payload,
  });
}

function memorySourceLabel(object: RuntimeMemoryRecord): string {
  const span = object.provenance?.[0];
  if (!span) {
    return "source unavailable";
  }
  const sourceId = typeof span.sourceId === "string" ? span.sourceId : undefined;
  const blockId = typeof span.blockId === "string" ? span.blockId : undefined;
  return [sourceId, blockId].filter(Boolean).join("#") || "source unavailable";
}

function renderMemoryBullets(
  memoryObjects: RuntimeMemoryRecord[],
  options: { max?: number; includeSource?: boolean } = {},
): string {
  if (memoryObjects.length === 0) {
    return "- none";
  }
  return memoryObjects
    .toSorted((left, right) => {
      const created = right.createdAt.getTime() - left.createdAt.getTime();
      return created !== 0 ? created : left.id.localeCompare(right.id);
    })
    .slice(0, options.max ?? 12)
    .map((object) => {
      const source = options.includeSource ? `; source=${memorySourceLabel(object)}` : "";
      return `- ${memorySubject(object)}: ${memorySummary(object)} [memory=${object.id}; kind=${object.kind}${source}]`;
    })
    .join("\n");
}

function renderProcedureBullets(memoryObjects: RuntimeMemoryRecord[]): string {
  if (memoryObjects.length === 0) {
    return "- none";
  }
  return memoryObjects
    .toSorted((left, right) => memorySubject(left).localeCompare(memorySubject(right)))
    .slice(0, 12)
    .map((object) => {
      const steps = payloadStringArrayField(object, ["steps", "checklist", "items"]);
      const renderedSteps =
        steps.length === 0
          ? "no structured checklist"
          : steps.map((step, index) => `${index + 1}. ${step}`).join(" ");
      return `- ${memorySubject(object)} [memory=${object.id}; source=${memorySourceLabel(object)}]: ${renderedSteps}`;
    })
    .join("\n");
}

function searchText(object: RuntimeMemoryRecord): string {
  return [
    object.kind,
    object.canonicalClass,
    object.normalizedSubject,
    object.normalizedTitle,
    object.normalizedSearchText,
    memorySummary(object),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function renderRichProjectionBody(input: {
  registryEntry: ProjectionRegistryEntry;
  digest: ProjectionDigestArtifact;
  activeSourceObjects: RuntimeMemoryRecord[];
}): string {
  const { registryEntry, activeSourceObjects } = input;
  const rolePolicy = getDerivedArtifactRolePolicy({
    family: "projection",
    artifactType: registryEntry.projectionType,
  });
  const decisions = activeSourceObjects.filter((object) => searchText(object).includes("decision"));
  const blockers = activeSourceObjects.filter((object) =>
    /\b(blocker|blocked|blocking|failed|failure|timeout|pending|stale)\b/u.test(searchText(object)),
  );
  const procedures = activeSourceObjects.filter((object) => object.kind === "procedure");
  const references = activeSourceObjects.filter(
    (object) => object.kind === "reference" || object.canonicalClass === "reference",
  );
  const preferences = activeSourceObjects.filter(
    (object) => object.kind === "preference" || object.canonicalClass === "user",
  );

  switch (registryEntry.projectionType) {
    case "project_page":
      return [
        "## Operator Project Read Model",
        "",
        "This projection is an operator/report read model. Rich project-state generation/context compilation belongs to the project_state capsule.",
        "",
        renderMemoryBullets(activeSourceObjects, { max: 10, includeSource: true }),
        "",
        "## Derived Artifact Role",
        "",
        `- generation_context_authority: ${rolePolicy.generationContextAuthority}`,
        `- roles: ${rolePolicy.roles.join(", ")}`,
      ].join("\n");
    case "procedure_page":
      return [
        "## Operational Runbooks And Checklists",
        "",
        renderProcedureBullets(procedures.length > 0 ? procedures : activeSourceObjects),
        "",
        "## Preconditions And Rollback Evidence",
        "",
        renderMemoryBullets(activeSourceObjects, { max: 8, includeSource: true }),
      ].join("\n");
    case "decision_log":
      return [
        "## Prior Decisions",
        "",
        renderMemoryBullets(decisions.length > 0 ? decisions : activeSourceObjects, {
          max: 12,
          includeSource: true,
        }),
        "",
        "## Conflict And Stale Markers",
        "",
        renderList([...input.digest.conflictMarkers, ...input.digest.staleMarkers]),
      ].join("\n");
    case "source_page":
      return [
        "## Canonical Source Evidence",
        "",
        renderMemoryBullets(references.length > 0 ? references : activeSourceObjects, {
          max: 12,
          includeSource: true,
        }),
        "",
        "## Linked Memories",
        "",
        renderList(input.digest.sourceMemoryIds),
      ].join("\n");
    case "user_profile_page":
      return [
        "## Stable Task-Relevant Preferences",
        "",
        renderMemoryBullets(preferences.length > 0 ? preferences : activeSourceObjects, {
          max: 12,
          includeSource: true,
        }),
        "",
        "## Scope And Confidence",
        "",
        renderMemoryBullets(activeSourceObjects, { max: 8 }),
      ].join("\n");
    case "entity_page": {
      const bySubject = new Map<string, RuntimeMemoryRecord[]>();
      for (const object of activeSourceObjects) {
        const subject = memorySubject(object);
        bySubject.set(subject, [...(bySubject.get(subject) ?? []), object]);
      }
      const grouped = [...bySubject.entries()]
        .toSorted(([left], [right]) => left.localeCompare(right))
        .slice(0, 10)
        .flatMap(([subject, objects]) => [
          `### ${subject}`,
          "",
          renderMemoryBullets(objects, { max: 6, includeSource: true }),
          "",
        ])
        .join("\n");
      return ["## Entity Knowledge", "", grouped || "- none"].join("\n");
    }
    case "timeline_page":
      return [
        "## Change Timeline",
        "",
        activeSourceObjects.length === 0
          ? "- none"
          : activeSourceObjects
              .toSorted((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
              .slice(0, 18)
              .map(
                (object) =>
                  `- ${object.createdAt.toISOString()}: ${memorySubject(object)} [memory=${object.id}; event=${input.digest.sourceEventIds[0] ?? "unknown"}]`,
              )
              .join("\n"),
      ].join("\n");
    case "dashboard":
      return [
        "## Memory Health Dashboard",
        "",
        `- active_source_memories: ${input.digest.sourceMemoryIds.length}`,
        `- source_events: ${input.digest.sourceEventIds.length}`,
        `- source_edges: ${input.digest.sourceEdgeIds.length}`,
        `- stale_marker_count: ${input.digest.staleMarkers.length}`,
        `- conflict_marker_count: ${input.digest.conflictMarkers.length}`,
        `- freshness: ${input.digest.freshness.status}`,
        "",
        "## Status Samples",
        "",
        renderMemoryBullets(activeSourceObjects, { max: 10 }),
      ].join("\n");
    case "agent_digest":
      return [
        "## Compact Agent Context",
        "",
        "```json",
        JSON.stringify(
          {
            role: registryEntry.retrievalRole,
            runtime_use_case: registryEntry.runtimeUseCase,
            active_memory_ids: input.digest.sourceMemoryIds.slice(0, 20),
            blocker_memory_ids: blockers.map((object) => object.id).slice(0, 10),
            procedure_memory_ids: procedures.map((object) => object.id).slice(0, 10),
          },
          null,
          2,
        ),
        "```",
      ].join("\n");
    case "projection_digest":
      return [
        "## Projection Retrieval Index",
        "",
        "```json",
        JSON.stringify(
          {
            projection_id: input.digest.projectionId,
            projection_type: input.digest.projectionType,
            retrieval_role: registryEntry.retrievalRole,
            source_memory_ids: input.digest.sourceMemoryIds.slice(0, 30),
            source_event_ids: input.digest.sourceEventIds.slice(0, 30),
            freshness: input.digest.freshness,
          },
          null,
          2,
        ),
        "```",
      ].join("\n");
    case "workspace_projection":
      return renderMemoryBullets(activeSourceObjects, { max: 12, includeSource: true });
    default:
      return renderMemoryBullets(activeSourceObjects, { max: 12, includeSource: true });
  }
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
  const sourceMemoryIds = uniqueSortedStrings(activeSourceObjects.map((object) => object.id));
  const sourceEventIds = collectSourceEventIds(activeSourceObjects);
  const sourceEdgeIds = collectSourceEdgeIds(activeSourceObjects);
  const contentHash = hashDerivedArtifactValue(
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
      ...buildDerivedFreshness({ staleMarkers }),
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
  const sourceObjectIds = uniqueSortedStrings([
    ...filteredSlots.map((slot) => slot.currentObjectId),
    ...filteredSets.map((entry) => entry.memoryObjectId),
  ]);
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
    `- runtime_use_case: ${registryEntry.runtimeUseCase}`,
    `- selection_hints: ${registryEntry.selectionHints.join(", ")}`,
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
    "## Rich Runtime Page",
    "",
    renderRichProjectionBody(input),
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
      summary: `${entry.runtimeUseCase}. ${summarizeProjectionSources(
        sourceObjects.filter(isActiveProjectionSource),
        entry.projectionType,
      )}`,
      sourceObjects,
      artifactPath: `${entry.artifactPathPrefix}/digest-${hashDerivedArtifactValue(entry.projectionType).slice(0, 12)}.json`,
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
      summary: `${registryEntry.runtimeUseCase}. ${summarizeProjectionSources(
        activeSourceObjects,
        registryEntry.projectionType,
      )}`,
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
