import fs from "node:fs/promises";
import path from "node:path";
import { buildDeterministicUuid } from "./deterministic-uuid.ts";
import { sha256JsonValue } from "./hashing.ts";
import type {
  RuntimeGraphBuildResult,
  RuntimeGraphEdge,
  RuntimeGraphMemoryInput,
  RuntimeGraphNode,
  RuntimeGraphSourceRef,
} from "./runtime-graph.ts";
import type { SourceAuthorityTier, SourceProfileId } from "./source-authority.ts";

export const PROJECT_STATE_CAPSULE_SCHEMA_VERSION = "project_state_capsule.v1" as const;

export type ProjectStateCapsuleType = "project_state";

export type ProjectStateCapsuleSectionType =
  | "current_state"
  | "active_decisions"
  | "active_constraints"
  | "procedures"
  | "references"
  | "soft_source_evidence"
  | "conflicts"
  | "open_questions";

export type ProjectStateCapsuleFreshness = {
  status: "fresh" | "stale";
  reason?: string;
};

export type ProjectStateCapsuleItem = {
  itemId: string;
  sectionType: ProjectStateCapsuleSectionType;
  text: string;
  kind: string | null;
  artifactType: string | null;
  sourceMemoryIds: string[];
  sourceRefs: RuntimeGraphSourceRef[];
  authorityTier?: SourceAuthorityTier;
  sourceProfileId?: SourceProfileId;
  authorityLabel: "authoritative" | "lower_authority" | "unknown";
  graphNodeIds: string[];
  graphEdgeIds: string[];
  freshness: ProjectStateCapsuleFreshness;
  conflictMarkers: string[];
  derivationHash: string;
};

export type ProjectStateCapsuleSection = {
  sectionId: string;
  sectionType: ProjectStateCapsuleSectionType;
  title: string;
  items: ProjectStateCapsuleItem[];
  sourceMemoryIds: string[];
  sourceRefs: RuntimeGraphSourceRef[];
  authorityTiers: SourceAuthorityTier[];
  sourceProfileIds: SourceProfileId[];
  graphNodeIds: string[];
  graphEdgeIds: string[];
  freshness: ProjectStateCapsuleFreshness;
  conflictMarkers: string[];
  derivationHash: string;
};

export type ProjectStateCapsule = {
  capsuleId: string;
  schemaVersion: typeof PROJECT_STATE_CAPSULE_SCHEMA_VERSION;
  capsuleType: ProjectStateCapsuleType;
  projectId: string;
  scopeKey: string;
  sections: ProjectStateCapsuleSection[];
  digest: {
    sourceMemoryIds: string[];
    sourceRefs: RuntimeGraphSourceRef[];
    authorityTiers: SourceAuthorityTier[];
    sourceProfileIds: SourceProfileId[];
    graphNodeIds: string[];
    graphEdgeIds: string[];
    freshness: ProjectStateCapsuleFreshness;
    conflictMarkers: string[];
    graphInputHash?: string;
    graphOutputHash?: string;
  };
  contentHash: string;
  compiledAt: string;
};

export type ProjectStateCapsuleCompileResult = {
  capsule: ProjectStateCapsule;
  excludedMemoryIds: Array<{
    memoryId: string;
    reason:
      | "project_scope_mismatch"
      | "inspection_only"
      | "stale"
      | "inactive"
      | "superseded"
      | "deleted"
      | "quarantined";
  }>;
};

const SECTION_ORDER: ProjectStateCapsuleSectionType[] = [
  "current_state",
  "active_decisions",
  "active_constraints",
  "procedures",
  "references",
  "soft_source_evidence",
  "conflicts",
  "open_questions",
];

const SECTION_TITLES: Record<ProjectStateCapsuleSectionType, string> = {
  current_state: "Current State",
  active_decisions: "Active Decisions",
  active_constraints: "Active Constraints",
  procedures: "Procedures",
  references: "References",
  soft_source_evidence: "Soft-Source Evidence",
  conflicts: "Conflicts",
  open_questions: "Open Questions",
};

function stableId(namespace: string, value: unknown): string {
  return buildDeterministicUuid(namespace, JSON.stringify(value));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readProjectId(scope: Record<string, unknown>): string | undefined {
  return readString(scope.project_id) ?? readString(scope.projectId);
}

function projectScopeKey(projectId: string): string {
  return sha256JsonValue({ capsuleType: "project_state", projectId });
}

function uniqueSorted<T extends string>(values: Array<T | undefined>): T[] {
  return [...new Set(values.filter((value): value is T => Boolean(value)))].toSorted();
}

function dedupeSourceRefs(sourceRefs: RuntimeGraphSourceRef[]): RuntimeGraphSourceRef[] {
  const byKey = new Map<string, RuntimeGraphSourceRef>();
  for (const sourceRef of sourceRefs) {
    const key = sha256JsonValue(sourceRef);
    if (!byKey.has(key)) {
      byKey.set(key, { ...sourceRef });
    }
  }
  return [...byKey.values()].toSorted((left, right) =>
    `${left.sourceId}:${left.segmentId ?? ""}`.localeCompare(
      `${right.sourceId}:${right.segmentId ?? ""}`,
    ),
  );
}

function sourceRefsForMemories(memories: RuntimeGraphMemoryInput[]): RuntimeGraphSourceRef[] {
  return dedupeSourceRefs(memories.flatMap((memory) => memory.sourceRefs));
}

function sourceRefsForItems(items: ProjectStateCapsuleItem[]): RuntimeGraphSourceRef[] {
  return dedupeSourceRefs(items.flatMap((item) => item.sourceRefs));
}

function isLowerAuthority(authorityTier: SourceAuthorityTier | undefined): boolean {
  return authorityTier === "tool_grounded" || authorityTier === "cited_soft";
}

function authorityLabel(
  authorityTier: SourceAuthorityTier | undefined,
): ProjectStateCapsuleItem["authorityLabel"] {
  if (authorityTier === "user_authoritative" || authorityTier === "curated_authoritative") {
    return "authoritative";
  }
  if (isLowerAuthority(authorityTier)) {
    return "lower_authority";
  }
  return "unknown";
}

function isStale(memory: RuntimeGraphMemoryInput, now: Date): boolean {
  if (memory.status === "stale") {
    return true;
  }
  const invalidAt = memory.validity.invalid_at;
  return typeof invalidAt === "string" && Date.parse(invalidAt) <= now.getTime();
}

function readPayloadType(memory: RuntimeGraphMemoryInput): string | undefined {
  return readString(memory.payload.payload_type);
}

function readClaimType(memory: RuntimeGraphMemoryInput): string | undefined {
  return readString(memory.payload.claim_type);
}

function readDirectiveType(memory: RuntimeGraphMemoryInput): string | undefined {
  return readString(memory.payload.directive_type);
}

function readEventType(memory: RuntimeGraphMemoryInput): string | undefined {
  return readString(memory.payload.event_type);
}

function routeAuthoritativeSection(
  memory: RuntimeGraphMemoryInput,
): ProjectStateCapsuleSectionType {
  const payloadType = readPayloadType(memory);
  if (memory.kind === "source_ref" || payloadType === "source_ref") {
    return "references";
  }
  if (memory.kind === "directive" || payloadType === "directive" || readDirectiveType(memory)) {
    return "active_constraints";
  }
  if (memory.artifactType === "procedure" || memory.artifactType === "checklist") {
    return "procedures";
  }
  if (
    memory.artifactType === "decision_record" ||
    readClaimType(memory) === "decision" ||
    readEventType(memory) === "decision_made"
  ) {
    return "active_decisions";
  }
  if (memory.payload.open_question === true) {
    return "open_questions";
  }
  return "current_state";
}

function routeSection(memory: RuntimeGraphMemoryInput): ProjectStateCapsuleSectionType {
  if (memory.status === "conflicted") {
    return "conflicts";
  }
  if (isLowerAuthority(memory.sourceAuthorityTier)) {
    return "soft_source_evidence";
  }
  return routeAuthoritativeSection(memory);
}

function graphIdsForMemory(
  graph: Pick<RuntimeGraphBuildResult, "nodes" | "edges"> | undefined,
  memoryId: string,
): { graphNodeIds: string[]; graphEdgeIds: string[] } {
  if (!graph) {
    return { graphNodeIds: [], graphEdgeIds: [] };
  }
  return {
    graphNodeIds: graph.nodes
      .filter((node: RuntimeGraphNode) => node.sourceMemoryIds.includes(memoryId))
      .map((node) => node.nodeId)
      .toSorted(),
    graphEdgeIds: graph.edges
      .filter((edge: RuntimeGraphEdge) => edge.sourceMemoryIds.includes(memoryId))
      .map((edge) => edge.edgeId)
      .toSorted(),
  };
}

function buildItem(input: {
  memory: RuntimeGraphMemoryInput;
  sectionType: ProjectStateCapsuleSectionType;
  graph?: Pick<RuntimeGraphBuildResult, "nodes" | "edges">;
}): ProjectStateCapsuleItem {
  const graphIds = graphIdsForMemory(input.graph, input.memory.memoryId);
  const conflictMarkers =
    input.sectionType === "conflicts"
      ? [input.memory.memoryId, ...(input.memory.lineage?.conflictsWithMemoryIds ?? [])].toSorted()
      : [];
  const itemWithoutHash = {
    itemId: stableId("project-state-capsule-item", {
      sectionType: input.sectionType,
      memoryId: input.memory.memoryId,
    }),
    sectionType: input.sectionType,
    text: input.memory.canonicalText,
    kind: input.memory.kind,
    artifactType: input.memory.artifactType,
    sourceMemoryIds: [input.memory.memoryId],
    sourceRefs: input.memory.sourceRefs,
    authorityTier: input.memory.sourceAuthorityTier,
    sourceProfileId: input.memory.sourceProfileId,
    authorityLabel: authorityLabel(input.memory.sourceAuthorityTier),
    graphNodeIds: graphIds.graphNodeIds,
    graphEdgeIds: graphIds.graphEdgeIds,
    freshness: { status: "fresh" as const },
    conflictMarkers,
  };
  return {
    ...itemWithoutHash,
    derivationHash: sha256JsonValue(itemWithoutHash),
  };
}

function buildSection(
  projectId: string,
  sectionType: ProjectStateCapsuleSectionType,
  items: ProjectStateCapsuleItem[],
): ProjectStateCapsuleSection {
  const sourceMemoryIds = uniqueSorted(items.flatMap((item) => item.sourceMemoryIds));
  const sourceRefs = sourceRefsForItems(items);
  const sectionWithoutHash = {
    sectionId: stableId("project-state-capsule-section", { projectId, sectionType }),
    sectionType,
    title: SECTION_TITLES[sectionType],
    items,
    sourceMemoryIds,
    sourceRefs,
    authorityTiers: uniqueSorted(items.map((item) => item.authorityTier)),
    sourceProfileIds: uniqueSorted(items.map((item) => item.sourceProfileId)),
    graphNodeIds: uniqueSorted(items.flatMap((item) => item.graphNodeIds)),
    graphEdgeIds: uniqueSorted(items.flatMap((item) => item.graphEdgeIds)),
    freshness: {
      status: items.some((item) => item.freshness.status === "stale") ? "stale" : "fresh",
    } satisfies ProjectStateCapsuleFreshness,
    conflictMarkers: uniqueSorted(items.flatMap((item) => item.conflictMarkers)),
  };
  return {
    ...sectionWithoutHash,
    derivationHash: sha256JsonValue(sectionWithoutHash),
  };
}

function capsuleContentHash(
  capsule: Omit<ProjectStateCapsule, "contentHash" | "compiledAt">,
): string {
  return sha256JsonValue(capsule);
}

export function compileProjectStateCapsule(input: {
  projectId: string;
  memories: RuntimeGraphMemoryInput[];
  graph?: Pick<RuntimeGraphBuildResult, "nodes" | "edges" | "inputHash" | "outputHash">;
  now?: Date;
}): ProjectStateCapsuleCompileResult {
  const now = input.now ?? new Date();
  const excludedMemoryIds: ProjectStateCapsuleCompileResult["excludedMemoryIds"] = [];
  const itemsBySection = new Map<ProjectStateCapsuleSectionType, ProjectStateCapsuleItem[]>(
    SECTION_ORDER.map((sectionType) => [sectionType, []]),
  );
  const staleMarkers: string[] = [];

  for (const memory of input.memories.toSorted((left, right) =>
    left.memoryId.localeCompare(right.memoryId),
  )) {
    if (readProjectId(memory.scope) !== input.projectId) {
      excludedMemoryIds.push({ memoryId: memory.memoryId, reason: "project_scope_mismatch" });
      continue;
    }
    if (memory.sourceAuthorityTier === "inspection_only") {
      excludedMemoryIds.push({ memoryId: memory.memoryId, reason: "inspection_only" });
      continue;
    }
    if (isStale(memory, now)) {
      excludedMemoryIds.push({ memoryId: memory.memoryId, reason: "stale" });
      staleMarkers.push(memory.memoryId);
      continue;
    }
    if (
      memory.status === "inactive" ||
      memory.status === "superseded" ||
      memory.status === "deleted" ||
      memory.status === "quarantined"
    ) {
      excludedMemoryIds.push({ memoryId: memory.memoryId, reason: memory.status });
      continue;
    }

    const sectionType = routeSection(memory);
    itemsBySection.get(sectionType)!.push(
      buildItem({
        memory,
        sectionType,
        graph: input.graph,
      }),
    );
  }

  const sections = SECTION_ORDER.map((sectionType) =>
    buildSection(input.projectId, sectionType, itemsBySection.get(sectionType) ?? []),
  );
  const sourceMemoryIds = uniqueSorted(sections.flatMap((section) => section.sourceMemoryIds));
  const sourceRefs = sourceRefsForMemories(
    input.memories.filter((memory) => sourceMemoryIds.includes(memory.memoryId)),
  );
  const conflictMarkers = uniqueSorted([
    ...sections.flatMap((section) => section.conflictMarkers),
    ...staleMarkers.map((memoryId) => `stale:${memoryId}`),
  ]);
  const digest = {
    sourceMemoryIds,
    sourceRefs,
    authorityTiers: uniqueSorted(sections.flatMap((section) => section.authorityTiers)),
    sourceProfileIds: uniqueSorted(sections.flatMap((section) => section.sourceProfileIds)),
    graphNodeIds: uniqueSorted(sections.flatMap((section) => section.graphNodeIds)),
    graphEdgeIds: uniqueSorted(sections.flatMap((section) => section.graphEdgeIds)),
    freshness:
      staleMarkers.length > 0
        ? ({
            status: "stale",
            reason: "one or more project-scoped source memories were stale",
          } satisfies ProjectStateCapsuleFreshness)
        : ({ status: "fresh" } satisfies ProjectStateCapsuleFreshness),
    conflictMarkers,
    graphInputHash: input.graph?.inputHash,
    graphOutputHash: input.graph?.outputHash,
  };
  const capsuleWithoutRuntimeFields: Omit<ProjectStateCapsule, "contentHash" | "compiledAt"> = {
    capsuleId: stableId("project-state-capsule", { projectId: input.projectId }),
    schemaVersion: PROJECT_STATE_CAPSULE_SCHEMA_VERSION,
    capsuleType: "project_state",
    projectId: input.projectId,
    scopeKey: projectScopeKey(input.projectId),
    sections,
    digest,
  };
  return {
    capsule: {
      ...capsuleWithoutRuntimeFields,
      contentHash: capsuleContentHash(capsuleWithoutRuntimeFields),
      compiledAt: now.toISOString(),
    },
    excludedMemoryIds,
  };
}

function cloneSourceRef(sourceRef: RuntimeGraphSourceRef): RuntimeGraphSourceRef {
  return { ...sourceRef };
}

function cloneCapsuleItem(item: ProjectStateCapsuleItem): ProjectStateCapsuleItem {
  return {
    ...item,
    sourceMemoryIds: [...item.sourceMemoryIds],
    sourceRefs: item.sourceRefs.map(cloneSourceRef),
    graphNodeIds: [...item.graphNodeIds],
    graphEdgeIds: [...item.graphEdgeIds],
    freshness: { ...item.freshness },
    conflictMarkers: [...item.conflictMarkers],
  };
}

function cloneCapsuleSection(section: ProjectStateCapsuleSection): ProjectStateCapsuleSection {
  return {
    ...section,
    items: section.items.map(cloneCapsuleItem),
    sourceMemoryIds: [...section.sourceMemoryIds],
    sourceRefs: section.sourceRefs.map(cloneSourceRef),
    authorityTiers: [...section.authorityTiers],
    sourceProfileIds: [...section.sourceProfileIds],
    graphNodeIds: [...section.graphNodeIds],
    graphEdgeIds: [...section.graphEdgeIds],
    freshness: { ...section.freshness },
    conflictMarkers: [...section.conflictMarkers],
  };
}

function cloneCapsule(capsule: ProjectStateCapsule): ProjectStateCapsule {
  return {
    ...capsule,
    sections: capsule.sections.map(cloneCapsuleSection),
    digest: {
      ...capsule.digest,
      sourceMemoryIds: [...capsule.digest.sourceMemoryIds],
      sourceRefs: capsule.digest.sourceRefs.map(cloneSourceRef),
      authorityTiers: [...capsule.digest.authorityTiers],
      sourceProfileIds: [...capsule.digest.sourceProfileIds],
      graphNodeIds: [...capsule.digest.graphNodeIds],
      graphEdgeIds: [...capsule.digest.graphEdgeIds],
      freshness: { ...capsule.digest.freshness },
      conflictMarkers: [...capsule.digest.conflictMarkers],
    },
  };
}

export function createProjectStateCapsuleReader(capsules: ProjectStateCapsule[]) {
  const byCapsuleId = new Map(capsules.map((capsule) => [capsule.capsuleId, capsule]));
  const byProjectId = new Map(capsules.map((capsule) => [capsule.projectId, capsule]));
  return {
    getByCapsuleId(capsuleId: string): ProjectStateCapsule | undefined {
      const capsule = byCapsuleId.get(capsuleId);
      return capsule ? cloneCapsule(capsule) : undefined;
    },
    getByProjectId(projectId: string): ProjectStateCapsule | undefined {
      const capsule = byProjectId.get(projectId);
      return capsule ? cloneCapsule(capsule) : undefined;
    },
    snapshot(): ProjectStateCapsule[] {
      return capsules.map(cloneCapsule);
    },
  };
}

function sanitizeReportFileId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "project-state";
}

export async function writeProjectStateCapsuleArtifact(input: {
  capsule: ProjectStateCapsule;
  artifactDir: string;
  artifactId?: string;
}): Promise<{ path: string; contentHash: string }> {
  await fs.mkdir(input.artifactDir, { recursive: true });
  const artifactId = sanitizeReportFileId(input.artifactId ?? input.capsule.projectId);
  const artifactPath = path.join(input.artifactDir, `${artifactId}.project-state-capsule.json`);
  const serialized = `${JSON.stringify(input.capsule, null, 2)}\n`;
  await fs.writeFile(artifactPath, serialized, "utf8");
  return {
    path: artifactPath,
    contentHash: sha256JsonValue(serialized),
  };
}
