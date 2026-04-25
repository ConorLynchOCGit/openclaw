import {
  aggregateDerivedSourceMetadata,
  buildDerivedArtifactId,
  buildDerivedConflictMarkers,
  buildDerivedFreshness,
  cloneJsonLike,
  dedupeDerivedSourceRefs,
  deriveLifecycleExclusion,
  getDerivedArtifactRolePolicy,
  hashDerivedArtifactValue,
  uniqueSortedDefined,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type DerivedArtifactRole,
  type JsonLike,
} from "./derived-artifact.ts";
import type {
  RuntimeGraphBuildResult,
  RuntimeGraphEdge,
  RuntimeGraphMemoryInput,
  RuntimeGraphNode,
  RuntimeGraphSourceRef,
} from "./runtime-graph.ts";
import type { SourceAuthorityTier, SourceProfileId } from "./source-authority.ts";

export const PROJECT_STATE_CAPSULE_SCHEMA_VERSION = "project_state_capsule.v1" as const;
export const PROJECT_STATE_CAPSULE_DERIVED_ROLES: DerivedArtifactRole[] = [
  ...getDerivedArtifactRolePolicy({
    family: "capsule",
    artifactType: "project_state",
  }).roles,
];

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
  return buildDerivedArtifactId({
    family: "capsule",
    artifactType: namespace,
    seed: value,
  });
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readProjectId(scope: Record<string, unknown>): string | undefined {
  return readString(scope.project_id) ?? readString(scope.projectId);
}

function projectScopeKey(projectId: string): string {
  return hashDerivedArtifactValue({ capsuleType: "project_state", projectId });
}

function dedupeSourceRefs(sourceRefs: RuntimeGraphSourceRef[]): RuntimeGraphSourceRef[] {
  return dedupeDerivedSourceRefs(sourceRefs);
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

function capsuleFreshness(input: {
  staleMarkers?: string[];
  reasonWhenStale?: string;
}): ProjectStateCapsuleFreshness {
  const freshness = buildDerivedFreshness(input);
  return freshness.reason
    ? { status: freshness.status, reason: freshness.reason }
    : { status: freshness.status };
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
    derivationHash: hashDerivedArtifactValue(itemWithoutHash),
  };
}

function buildSection(
  projectId: string,
  sectionType: ProjectStateCapsuleSectionType,
  items: ProjectStateCapsuleItem[],
): ProjectStateCapsuleSection {
  const sourceMetadata = aggregateDerivedSourceMetadata(items);
  const sectionWithoutHash = {
    sectionId: stableId("project-state-capsule-section", { projectId, sectionType }),
    sectionType,
    title: SECTION_TITLES[sectionType],
    items,
    sourceMemoryIds: sourceMetadata.sourceMemoryIds,
    sourceRefs: sourceRefsForItems(items),
    authorityTiers: sourceMetadata.authorityTiers,
    sourceProfileIds: sourceMetadata.sourceProfileIds,
    graphNodeIds: uniqueSortedStrings(items.flatMap((item) => item.graphNodeIds)),
    graphEdgeIds: uniqueSortedStrings(items.flatMap((item) => item.graphEdgeIds)),
    freshness: capsuleFreshness({
      staleMarkers: items
        .filter((item) => item.freshness.status === "stale")
        .map((item) => item.itemId),
    }),
    conflictMarkers: buildDerivedConflictMarkers(items.flatMap((item) => item.conflictMarkers)),
  };
  return {
    ...sectionWithoutHash,
    derivationHash: hashDerivedArtifactValue(sectionWithoutHash),
  };
}

function capsuleContentHash(
  capsule: Omit<ProjectStateCapsule, "contentHash" | "compiledAt">,
): string {
  return hashDerivedArtifactValue(capsule);
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
    const exclusionReason = deriveLifecycleExclusion({
      status: memory.status,
      invalidAt: memory.validity.invalid_at,
      authorityTier: memory.sourceAuthorityTier,
      now,
    });
    if (
      exclusionReason === "inspection_only" ||
      exclusionReason === "stale" ||
      exclusionReason === "inactive" ||
      exclusionReason === "superseded" ||
      exclusionReason === "deleted" ||
      exclusionReason === "quarantined"
    ) {
      excludedMemoryIds.push({ memoryId: memory.memoryId, reason: exclusionReason });
      if (exclusionReason === "stale") {
        staleMarkers.push(memory.memoryId);
      }
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
  const sourceMemoryIds = uniqueSortedStrings(
    sections.flatMap((section) => section.sourceMemoryIds),
  );
  const sourceRefs = sourceRefsForMemories(
    input.memories.filter((memory) => sourceMemoryIds.includes(memory.memoryId)),
  );
  const conflictMarkers = buildDerivedConflictMarkers([
    ...sections.flatMap((section) => section.conflictMarkers),
    ...staleMarkers.map((memoryId) => `stale:${memoryId}`),
  ]);
  const sourceMetadata = aggregateDerivedSourceMetadata(sections);
  const digest = {
    sourceMemoryIds,
    sourceRefs,
    authorityTiers: uniqueSortedDefined(sourceMetadata.authorityTiers),
    sourceProfileIds: uniqueSortedDefined(sourceMetadata.sourceProfileIds),
    graphNodeIds: uniqueSortedStrings(sections.flatMap((section) => section.graphNodeIds)),
    graphEdgeIds: uniqueSortedStrings(sections.flatMap((section) => section.graphEdgeIds)),
    freshness: capsuleFreshness({
      staleMarkers,
      reasonWhenStale: "one or more project-scoped source memories were stale",
    }),
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

function cloneCapsule(capsule: ProjectStateCapsule): ProjectStateCapsule {
  return cloneJsonLike(capsule as unknown as JsonLike) as unknown as ProjectStateCapsule;
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

export async function writeProjectStateCapsuleArtifact(input: {
  capsule: ProjectStateCapsule;
  artifactDir: string;
  artifactId?: string;
}): Promise<{ path: string; contentHash: string }> {
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.artifactId ?? input.capsule.projectId,
    suffix: "project-state-capsule",
    value: input.capsule,
    fallbackFileId: "project-state",
  });
  return { path: written.path, contentHash: written.contentHash };
}
