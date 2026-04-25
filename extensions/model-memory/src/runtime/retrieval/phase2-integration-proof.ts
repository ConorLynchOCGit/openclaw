import {
  aggregateDerivedSourceMetadata,
  buildDerivedArtifactId,
  cloneJsonLike,
  writeBoundedDerivedJsonArtifact,
  type DerivedArtifactSourceRef,
  type JsonLike,
} from "../../derived-artifact.ts";
import {
  compileProjectStateCapsule,
  type ProjectStateCapsule,
} from "../../project-state-capsule.ts";
import {
  buildRuntimeGraph,
  type RuntimeGraphBuildResult,
  type RuntimeGraphMemoryInput,
} from "../../runtime-graph.ts";
import type {
  ContextArtifactRecord,
  RetrievalRequestRecord,
  RetrievalResultItemRecord,
  RetrievalResultSetRecord,
  RuntimeCompatibleMemoryRecord,
  RuntimeMemoryRecord,
  WorkspaceProjectionVersionRecord,
} from "../../runtime-read-models.ts";
import { projectLegacyRecordToRuntimeMemoryRecord } from "../../runtime-read-models.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../../source-authority.ts";
import { buildRetrievalPackArtifact } from "../context/retrieval-packs.ts";
import { deriveRuntimeMemoryStatus, buildProjectionDigests } from "./candidate-recall.ts";
import {
  buildHierarchicalRetrievalShadow,
  type HierarchicalRetrievalShadowResult,
  type HierarchicalRetrievalSubquery,
  type HierarchicalRetrievalSubqueryResult,
} from "./hierarchical-retrieval.ts";
import { buildProjectStateCapsuleRetrievalShadow } from "./project-state-capsules.ts";
import type {
  ProjectionDigest,
  RetrievalCandidate,
  RetrievalExclusion,
  RetrievalPlan,
} from "./types.ts";

export const PHASE2_RETRIEVAL_INTEGRATION_PROOF_SCHEMA_VERSION =
  "phase2_retrieval_integration_proof.v1" as const;
export const PHASE2_RETRIEVAL_INTEGRATION_PROOF_REPORT_SCHEMA_VERSION =
  "phase2_retrieval_integration_proof_report.v1" as const;

export type Phase2RetrievalIntegrationProofMode = "disabled" | "explicit_proof";

export type Phase2RetrievalIntegrationProofLane =
  | "object_retrieval"
  | "projection_digest"
  | "runtime_graph"
  | "project_state_capsule"
  | "capsule_retrieval_shadow"
  | "gated_capsule_context"
  | "hierarchical_retrieval_shadow"
  | "retrieval_pack_artifact";

export type Phase2RetrievalIntegrationProofExclusion = {
  lane: Phase2RetrievalIntegrationProofLane;
  id: string;
  reason: string;
};

export type Phase2RetrievalIntegrationProofTelemetry = {
  selectedLanes: Phase2RetrievalIntegrationProofLane[];
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
  objectRetrievalSelectedCount: number;
  projectionDigestCount: number;
  graphNodeCount: number;
  graphEdgeCount: number;
  capsuleCount: number;
  capsuleContextInjected: boolean;
  hierarchicalSubqueryCount: number;
  hierarchicalMergedCandidateCount: number;
  retrievalArtifactId?: string;
  exclusionReasons: Record<string, number>;
};

export type Phase2RetrievalIntegrationProofTrace = {
  traceId: string;
  schemaVersion: typeof PHASE2_RETRIEVAL_INTEGRATION_PROOF_SCHEMA_VERSION;
  mode: Phase2RetrievalIntegrationProofMode;
  lanes: {
    objectRetrieval: {
      selectedMemoryIds: string[];
      sourceObjectIds: string[];
      candidateIds: string[];
    };
    projectionDigest: {
      projectionIds: string[];
      sourceMemoryIds: string[];
      contentHashes: string[];
    };
    runtimeGraph: {
      available: boolean;
      nodeIds: string[];
      edgeIds: string[];
      excludedMemoryIds: string[];
      errors: Array<{ code: string; memoryId?: string; detail: string }>;
    };
    projectStateCapsule: {
      capsuleIds: string[];
      contentHashes: string[];
      sourceMemoryIds: string[];
    };
    capsuleRetrievalShadow: {
      wouldSelectCapsuleIds: string[];
      packIds: string[];
      exclusionReasons: Record<string, number>;
    };
    gatedCapsuleContext: {
      mode: string;
      injected: boolean;
      blockIds: string[];
      sourceMemoryIds: string[];
    };
    hierarchicalRetrievalShadow: {
      mode: string;
      planId?: string;
      subqueryIds: string[];
      mergedCandidateIds: string[];
      telemetry: HierarchicalRetrievalShadowResult["telemetry"];
    };
    retrievalPackArtifact: {
      artifactId: string;
      contentHash: string;
      tokenEstimate: number;
      structuredPayloadKeys: string[];
    };
  };
  exclusions: Phase2RetrievalIntegrationProofExclusion[];
  telemetry: Phase2RetrievalIntegrationProofTelemetry;
};

export type Phase2RetrievalIntegrationProofReport = {
  schemaVersion: typeof PHASE2_RETRIEVAL_INTEGRATION_PROOF_REPORT_SCHEMA_VERSION;
  reportId: string;
  traceId: string;
  selectedLanes: Phase2RetrievalIntegrationProofLane[];
  sourceMemoryIds: string[];
  sourceRefs: DerivedArtifactSourceRef[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  exclusionReasons: Record<string, number>;
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
  trace: Phase2RetrievalIntegrationProofTrace;
};

export type Phase2RetrievalIntegrationProofInput = {
  mode?: Phase2RetrievalIntegrationProofMode;
  projectId: string;
  retrievalRequest: RetrievalRequestRecord;
  retrievalResultSet: RetrievalResultSetRecord;
  retrievalResultItems: RetrievalResultItemRecord[];
  memoryObjects: RuntimeCompatibleMemoryRecord[];
  buildPolicyVersion: string;
  retrievalPlan?: RetrievalPlan;
  retrievalCandidates?: RetrievalCandidate[];
  retrievalExclusions?: RetrievalExclusion[];
  projectionVersions?: WorkspaceProjectionVersionRecord[];
  graphMemories?: RuntimeGraphMemoryInput[];
  capsules?: ProjectStateCapsule[];
  hierarchicalSubqueries?: HierarchicalRetrievalSubquery[];
  hierarchicalSubqueryResults?: HierarchicalRetrievalSubqueryResult[];
  now?: Date;
};

const PROHIBITED_KEYS = new Set([
  "raw_prompt",
  "rawPrompt",
  "promptText",
  "full_transcript",
  "fullTranscript",
  "raw_transcript",
  "rawTranscript",
  "raw_tool_log",
  "rawToolLog",
  "secret",
  "secrets",
  "private_phrase",
  "privatePhrase",
]);

function assertNoProhibitedKeys(value: unknown, path: string[] = []): void {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoProhibitedKeys(entry, [...path, String(index)]));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (PROHIBITED_KEYS.has(key)) {
      throw new Error(
        `phase2 retrieval proof contains prohibited field: ${[...path, key].join(".")}`,
      );
    }
    assertNoProhibitedKeys(nested, [...path, key]);
  }
}

function clone<T extends JsonLike>(value: T): T {
  return cloneJsonLike(value);
}

function uniqueSorted<T extends string>(values: Array<T | undefined>): T[] {
  return [...new Set(values.filter((value): value is T => Boolean(value)))].toSorted();
}

function runtimeMemoryToGraphMemory(memory: RuntimeMemoryRecord): RuntimeGraphMemoryInput {
  const provenanceRefs = (memory.provenance ?? []).flatMap((span): DerivedArtifactSourceRef[] => {
    const sourceId = typeof span.sourceId === "string" ? span.sourceId : undefined;
    if (!sourceId) {
      return [];
    }
    return [
      {
        sourceId,
        segmentId: typeof span.blockId === "string" ? span.blockId : undefined,
      },
    ];
  });
  return {
    memoryId: memory.id,
    status: deriveRuntimeMemoryStatus(memory),
    unitType: "atomic",
    kind: memory.kind,
    artifactType: null,
    canonicalText: memory.normalizedSearchText,
    searchText: memory.normalizedSearchText,
    scope: memory.scope,
    payload: memory.payload,
    validity: {
      valid_at: memory.activatedAt?.toISOString() ?? memory.createdAt.toISOString(),
      invalid_at: memory.expiredAt?.toISOString() ?? null,
      temporal_status: deriveRuntimeMemoryStatus(memory) === "active" ? "current" : "inactive",
    },
    sourceRefs: provenanceRefs,
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.createdAt.toISOString(),
  };
}

function countReasons(
  exclusions: Phase2RetrievalIntegrationProofExclusion[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const exclusion of exclusions) {
    counts[`${exclusion.lane}:${exclusion.reason}`] =
      (counts[`${exclusion.lane}:${exclusion.reason}`] ?? 0) + 1;
  }
  return counts;
}

function traceId(input: {
  retrievalRequestId: string;
  selectedMemoryIds: string[];
  projectionIds: string[];
  capsuleIds: string[];
  hierarchicalPlanId?: string;
}): string {
  return buildDerivedArtifactId({
    family: "retrieval_pack",
    artifactType: "phase2_retrieval_integration_trace",
    targetId: input.retrievalRequestId,
    seed: {
      retrievalRequestId: input.retrievalRequestId,
      selectedMemoryIds: input.selectedMemoryIds,
      projectionIds: input.projectionIds,
      capsuleIds: input.capsuleIds,
      ...(input.hierarchicalPlanId ? { hierarchicalPlanId: input.hierarchicalPlanId } : {}),
    },
  });
}

function activeMemoryIds(memoryObjects: RuntimeMemoryRecord[]): Set<string> {
  return new Set(
    memoryObjects
      .filter((memory) => deriveRuntimeMemoryStatus(memory) === "active")
      .map((memory) => memory.id),
  );
}

function selectedMemoryIds(items: RetrievalResultItemRecord[]): string[] {
  return items
    .filter((item) => item.selectedForContext)
    .map((item) => item.memoryObjectId)
    .toSorted();
}

function buildHierarchicalSubqueries(input: {
  retrievalRequest: RetrievalRequestRecord;
  projectId: string;
  projectionDigests: ProjectionDigest[];
  capsules: ProjectStateCapsule[];
  graph?: RuntimeGraphBuildResult;
}): HierarchicalRetrievalSubquery[] {
  return [
    {
      subqueryId: "phase2-object-retrieval",
      goal: "object retrieval proof lane",
      queryHash: `${input.retrievalRequest.id}:object`,
      redactedLabel: `sha256:${input.retrievalRequest.id}:object`,
      purpose: "object_retrieval",
      desiredResultCount: input.retrievalRequest.desiredResultCount,
      priority: 100,
      corpora: ["project"],
      packTypes: ["project_state_pack"],
      indexes: ["fielded"],
      scopeConstraints: { projectId: input.projectId },
    },
    {
      subqueryId: "phase2-projection-capsule",
      goal: "projection and capsule proof lanes",
      queryHash: `${input.retrievalRequest.id}:projection-capsule`,
      redactedLabel: `sha256:${input.retrievalRequest.id}:projection-capsule`,
      purpose: "projection_capsule",
      desiredResultCount: Math.max(1, input.projectionDigests.length + input.capsules.length),
      priority: 90,
      corpora: ["project", "projections"],
      packTypes: ["project_state_pack", "projection_digest_pack"],
      indexes: ["projection_digest"],
      scopeConstraints: { projectId: input.projectId },
    },
    {
      subqueryId: "phase2-graph-context",
      goal: "graph proof lane",
      queryHash: `${input.retrievalRequest.id}:graph`,
      redactedLabel: `sha256:${input.retrievalRequest.id}:graph`,
      purpose: "graph_context",
      desiredResultCount: Math.max(1, input.graph?.nodes.length ?? 1),
      priority: 80,
      corpora: ["project"],
      packTypes: ["project_state_pack"],
      indexes: ["graph"],
      scopeConstraints: { projectId: input.projectId },
    },
  ];
}

function buildHierarchicalSubqueryResults(input: {
  subqueries: HierarchicalRetrievalSubquery[];
  selectedMemoryIds: string[];
  projectionDigests: ProjectionDigest[];
  capsules: ProjectStateCapsule[];
  graph?: RuntimeGraphBuildResult;
}): HierarchicalRetrievalSubqueryResult[] {
  const [objectSubquery, projectionSubquery, graphSubquery] = input.subqueries;
  return [
    {
      subqueryId: objectSubquery?.subqueryId ?? "phase2-object-retrieval",
      candidates: input.selectedMemoryIds.map((memoryId) => ({
        candidateId: `proof-memory-${memoryId}`,
        lane: "fielded" as const,
        memoryId,
        sourceMemoryIds: [memoryId],
        authorityTier: "curated_authoritative" as const,
        sourceProfileId: "curated_corpus" as const,
        status: "active" as const,
        rankBand: "primary" as const,
        priority: 100,
        score: 100,
        estimatedTokens: 10,
      })),
    },
    {
      subqueryId: projectionSubquery?.subqueryId ?? "phase2-projection-capsule",
      candidates: [
        ...input.projectionDigests.map((digest) => ({
          candidateId: `proof-projection-${digest.projectionId}`,
          lane: "projection_digest" as const,
          projectionId: digest.projectionId,
          sourceMemoryIds: digest.sourceMemoryIds,
          sourceEventIds: digest.sourceEventIds,
          sourceEdgeIds: digest.sourceEdgeIds ?? [],
          authorityTier: "curated_authoritative" as const,
          sourceProfileId: "curated_corpus" as const,
          status: "active" as const,
          rankBand: "secondary" as const,
          priority: 90,
          score: digest.sourceWeight,
          estimatedTokens: 10,
        })),
        ...input.capsules.map((capsule) => ({
          candidateId: `proof-capsule-${capsule.capsuleId}`,
          lane: "capsule" as const,
          capsuleId: capsule.capsuleId,
          sourceMemoryIds: capsule.digest.sourceMemoryIds,
          sourceRefs: capsule.digest.sourceRefs,
          authorityTiers: capsule.digest.authorityTiers,
          sourceProfileIds: capsule.digest.sourceProfileIds,
          status:
            capsule.digest.freshness.status === "stale" ? ("stale" as const) : ("active" as const),
          rankBand: "secondary" as const,
          priority: 90,
          score: capsule.digest.sourceMemoryIds.length,
          estimatedTokens: 10,
        })),
      ],
    },
    {
      subqueryId: graphSubquery?.subqueryId ?? "phase2-graph-context",
      candidates:
        input.graph?.nodes.map((node) => ({
          candidateId: `proof-graph-${node.nodeId}`,
          lane: "graph" as const,
          graphNodeIds: [node.nodeId],
          sourceMemoryIds: node.sourceMemoryIds,
          sourceRefs: node.sourceRefs,
          authorityTier: node.authorityTier,
          sourceProfileId: node.sourceProfileId,
          status: node.lifecycleState === "stale" ? ("stale" as const) : ("active" as const),
          rankBand: "secondary" as const,
          priority: 80,
          score: node.sourceMemoryIds.length,
          estimatedTokens: 5,
        })) ?? [],
    },
  ];
}

function proofExclusions(input: {
  graph?: RuntimeGraphBuildResult;
  capsuleExcludedMemoryIds: Array<{ memoryId: string; reason: string }>;
  hierarchical: HierarchicalRetrievalShadowResult;
}): Phase2RetrievalIntegrationProofExclusion[] {
  return [
    ...(input.graph?.excludedMemoryIds.map((entry) => ({
      lane: "runtime_graph" as const,
      id: entry.memoryId,
      reason: entry.reason,
    })) ?? []),
    ...input.capsuleExcludedMemoryIds.map((entry) => ({
      lane: "project_state_capsule" as const,
      id: entry.memoryId,
      reason: entry.reason,
    })),
    ...input.hierarchical.exclusions.map((entry) => ({
      lane: "hierarchical_retrieval_shadow" as const,
      id: entry.id,
      reason: entry.reason,
    })),
  ];
}

function assertNoDarkData(report: Phase2RetrievalIntegrationProofReport): void {
  assertNoProhibitedKeys(report);
  const serialized = JSON.stringify(report);
  for (const marker of [
    "raw-prompt-marker",
    "raw-transcript-marker",
    "raw-tool-log-marker",
    "secret-marker",
    "private-phrase-marker",
  ]) {
    if (serialized.includes(marker)) {
      throw new Error(`phase2 retrieval proof contains prohibited marker: ${marker}`);
    }
  }
}

export function buildPhase2RetrievalIntegrationProof(
  input: Phase2RetrievalIntegrationProofInput,
): Phase2RetrievalIntegrationProofReport {
  assertNoProhibitedKeys(input);
  const mode = input.mode ?? "disabled";
  if (mode !== "explicit_proof") {
    throw new Error("phase2 retrieval integration proof requires explicit_proof mode");
  }
  const now = input.now ?? new Date(0);
  const runtimeMemories = input.memoryObjects.map(projectLegacyRecordToRuntimeMemoryRecord);
  const selectedIds = selectedMemoryIds(input.retrievalResultItems);
  const projectionDigests = buildProjectionDigests({
    projectionVersions: input.projectionVersions,
    activeMemoryIds: activeMemoryIds(runtimeMemories),
  });
  const graphMemories =
    input.graphMemories ?? runtimeMemories.map((memory) => runtimeMemoryToGraphMemory(memory));
  const graph = graphMemories.length > 0 ? buildRuntimeGraph(graphMemories, { now }) : undefined;
  const compiledCapsule = compileProjectStateCapsule({
    projectId: input.projectId,
    memories: graphMemories,
    graph,
    now,
  });
  const capsules = input.capsules ?? [compiledCapsule.capsule];
  const capsuleRetrievalShadow = buildProjectStateCapsuleRetrievalShadow({
    retrievalPlan: input.retrievalPlan,
    capsules,
    requestScope: input.retrievalRequest.scope,
    projectId: input.projectId,
    shadowModeEnabled: true,
    projectPageProjectionAvailable: projectionDigests.some(
      (digest) => digest.projectionType === "project_page",
    ),
  });
  const capsuleContextMode = "explicit_injection" as const;
  const subqueries =
    input.hierarchicalSubqueries ??
    buildHierarchicalSubqueries({
      retrievalRequest: input.retrievalRequest,
      projectId: input.projectId,
      projectionDigests,
      capsules,
      graph,
    });
  const subqueryResults =
    input.hierarchicalSubqueryResults ??
    buildHierarchicalSubqueryResults({
      subqueries,
      selectedMemoryIds: selectedIds,
      projectionDigests,
      capsules,
      graph,
    });
  const hierarchical = buildHierarchicalRetrievalShadow({
    mode: "shadow_report_only",
    parent: {
      parentPlanId: input.retrievalPlan?.planId ?? input.retrievalRequest.id,
      parentGoal: input.retrievalRequest.requestPurpose,
      parentQueryHash:
        typeof input.retrievalRequest.scope.retrievalRuntimeQueryHash === "string"
          ? input.retrievalRequest.scope.retrievalRuntimeQueryHash
          : input.retrievalRequest.id,
      parentRedactedLabel: `sha256:${
        typeof input.retrievalRequest.scope.retrievalRuntimeQueryHash === "string"
          ? input.retrievalRequest.scope.retrievalRuntimeQueryHash
          : input.retrievalRequest.id
      }`,
      retrievalPlanId: input.retrievalPlan?.planId,
      scopeKey: input.projectId,
    },
    subqueries,
    subqueryResults,
  });
  const retrievalArtifact = buildRetrievalPackArtifact({
    retrievalRequest: input.retrievalRequest,
    retrievalResultSet: input.retrievalResultSet,
    retrievalResultItems: input.retrievalResultItems,
    memoryObjects: input.memoryObjects,
    buildPolicyVersion: input.buildPolicyVersion,
    retrievalPlan: input.retrievalPlan,
    retrievalCandidates: input.retrievalCandidates,
    retrievalExclusions: input.retrievalExclusions,
    selectedProjectionDigests: projectionDigests,
    capsuleRetrievalShadow,
    capsuleContextMode,
    projectPageProjectionAvailable: projectionDigests.some(
      (digest) => digest.projectionType === "project_page",
    ),
    hierarchicalRetrievalShadow: hierarchical,
  });
  const trace = buildTrace({
    mode,
    retrievalRequest: input.retrievalRequest,
    selectedMemoryIds: selectedIds,
    retrievalResultItems: input.retrievalResultItems,
    projectionDigests,
    graph,
    capsules,
    capsuleRetrievalShadow,
    hierarchical,
    retrievalArtifact,
    capsuleExcludedMemoryIds: compiledCapsule.excludedMemoryIds,
  });
  const metadata = aggregateDerivedSourceMetadata([
    ...graphMemories.map((memory) => ({
      sourceMemoryIds: [memory.memoryId],
      sourceEventIds: memory.sourceEventIds,
      sourceEdgeIds: memory.sourceEdgeIds,
      sourceRefs: memory.sourceRefs,
      authorityTier: memory.sourceAuthorityTier,
      sourceProfileId: memory.sourceProfileId,
    })),
    ...projectionDigests.map((digest) => ({
      sourceMemoryIds: digest.sourceMemoryIds,
      sourceEventIds: digest.sourceEventIds,
      sourceEdgeIds: digest.sourceEdgeIds,
    })),
    ...capsules.map((capsule) => ({
      sourceMemoryIds: capsule.digest.sourceMemoryIds,
      sourceRefs: capsule.digest.sourceRefs,
      authorityTiers: capsule.digest.authorityTiers,
      sourceProfileIds: capsule.digest.sourceProfileIds,
    })),
  ]);
  const report: Phase2RetrievalIntegrationProofReport = {
    schemaVersion: PHASE2_RETRIEVAL_INTEGRATION_PROOF_REPORT_SCHEMA_VERSION,
    reportId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_retrieval_integration_proof_report",
      targetId: trace.traceId,
      seed: {
        sourceMemoryIds: metadata.sourceMemoryIds,
        contentHash: retrievalArtifact.contentHash,
      },
    }),
    traceId: trace.traceId,
    selectedLanes: trace.telemetry.selectedLanes,
    sourceMemoryIds: metadata.sourceMemoryIds,
    sourceRefs: metadata.sourceRefs,
    sourceProfileIds: metadata.sourceProfileIds,
    authorityTiers: metadata.authorityTiers,
    contentHashes: uniqueSorted([
      retrievalArtifact.contentHash,
      ...projectionDigests.map((digest) => digest.contentHash),
      ...capsules.map((capsule) => capsule.contentHash),
    ]),
    exclusionReasons: trace.telemetry.exclusionReasons,
    defaultRetrievalChanged: false,
    defaultContextInjectionChanged: false,
    trace,
  };
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2RetrievalIntegrationProofReport;
}

function buildTrace(input: {
  mode: Phase2RetrievalIntegrationProofMode;
  retrievalRequest: RetrievalRequestRecord;
  selectedMemoryIds: string[];
  retrievalResultItems: RetrievalResultItemRecord[];
  projectionDigests: ProjectionDigest[];
  graph?: RuntimeGraphBuildResult;
  capsules: ProjectStateCapsule[];
  capsuleRetrievalShadow: ReturnType<typeof buildProjectStateCapsuleRetrievalShadow>;
  hierarchical: HierarchicalRetrievalShadowResult;
  retrievalArtifact: ContextArtifactRecord;
  capsuleExcludedMemoryIds: Array<{ memoryId: string; reason: string }>;
}): Phase2RetrievalIntegrationProofTrace {
  const payload = input.retrievalArtifact.structuredPayload ?? {};
  const projectStateCapsuleContext = payload.projectStateCapsuleContext as
    | {
        telemetry?: { injected?: boolean };
        blocks?: Array<{ contextBlockId: string; sourceMemoryIds: string[] }>;
      }
    | undefined;
  const exclusions = proofExclusions({
    graph: input.graph,
    capsuleExcludedMemoryIds: input.capsuleExcludedMemoryIds,
    hierarchical: input.hierarchical,
  });
  const selectedLanes: Phase2RetrievalIntegrationProofLane[] = [
    "object_retrieval",
    "projection_digest",
    "runtime_graph",
    "project_state_capsule",
    "capsule_retrieval_shadow",
    "gated_capsule_context",
    "hierarchical_retrieval_shadow",
    "retrieval_pack_artifact",
  ];
  const telemetry: Phase2RetrievalIntegrationProofTelemetry = {
    selectedLanes,
    defaultRetrievalChanged: false,
    defaultContextInjectionChanged: false,
    objectRetrievalSelectedCount: input.selectedMemoryIds.length,
    projectionDigestCount: input.projectionDigests.length,
    graphNodeCount: input.graph?.nodes.length ?? 0,
    graphEdgeCount: input.graph?.edges.length ?? 0,
    capsuleCount: input.capsules.length,
    capsuleContextInjected: projectStateCapsuleContext?.telemetry?.injected ?? false,
    hierarchicalSubqueryCount: input.hierarchical.telemetry.subqueryCount,
    hierarchicalMergedCandidateCount: input.hierarchical.mergedCandidates.length,
    retrievalArtifactId: input.retrievalArtifact.id,
    exclusionReasons: countReasons(exclusions),
  };
  return {
    traceId: traceId({
      retrievalRequestId: input.retrievalRequest.id,
      selectedMemoryIds: input.selectedMemoryIds,
      projectionIds: input.projectionDigests.map((digest) => digest.projectionId),
      capsuleIds: input.capsules.map((capsule) => capsule.capsuleId),
      hierarchicalPlanId: input.hierarchical.plan?.planId,
    }),
    schemaVersion: PHASE2_RETRIEVAL_INTEGRATION_PROOF_SCHEMA_VERSION,
    mode: input.mode,
    lanes: {
      objectRetrieval: {
        selectedMemoryIds: input.selectedMemoryIds,
        sourceObjectIds: input.selectedMemoryIds,
        candidateIds: input.retrievalResultItems.map((item) => item.id).toSorted(),
      },
      projectionDigest: {
        projectionIds: input.projectionDigests.map((digest) => digest.projectionId).toSorted(),
        sourceMemoryIds: uniqueSorted(
          input.projectionDigests.flatMap((digest) => digest.sourceMemoryIds),
        ),
        contentHashes: uniqueSorted(input.projectionDigests.map((digest) => digest.contentHash)),
      },
      runtimeGraph: {
        available: Boolean(input.graph),
        nodeIds: input.graph?.nodes.map((node) => node.nodeId).toSorted() ?? [],
        edgeIds: input.graph?.edges.map((edge) => edge.edgeId).toSorted() ?? [],
        excludedMemoryIds:
          input.graph?.excludedMemoryIds.map((entry) => entry.memoryId).toSorted() ?? [],
        errors:
          input.graph?.errors.map((error) => ({
            code: error.code,
            ...(error.memoryId ? { memoryId: error.memoryId } : {}),
            detail: error.detail,
          })) ?? [],
      },
      projectStateCapsule: {
        capsuleIds: input.capsules.map((capsule) => capsule.capsuleId).toSorted(),
        contentHashes: input.capsules.map((capsule) => capsule.contentHash).toSorted(),
        sourceMemoryIds: uniqueSorted(
          input.capsules.flatMap((capsule) => capsule.digest.sourceMemoryIds),
        ),
      },
      capsuleRetrievalShadow: {
        wouldSelectCapsuleIds:
          input.capsuleRetrievalShadow.telemetry.wouldSelectCapsuleIds.toSorted(),
        packIds: input.capsuleRetrievalShadow.packs.map((pack) => pack.packId).toSorted(),
        exclusionReasons: input.capsuleRetrievalShadow.telemetry.exclusionReasons,
      },
      gatedCapsuleContext: {
        mode: projectStateCapsuleContext?.telemetry ? "explicit_injection" : "disabled",
        injected: projectStateCapsuleContext?.telemetry?.injected ?? false,
        blockIds:
          projectStateCapsuleContext?.blocks?.map((block) => block.contextBlockId).toSorted() ?? [],
        sourceMemoryIds: uniqueSorted(
          projectStateCapsuleContext?.blocks?.flatMap((block) => block.sourceMemoryIds) ?? [],
        ),
      },
      hierarchicalRetrievalShadow: {
        mode: input.hierarchical.mode,
        planId: input.hierarchical.plan?.planId,
        subqueryIds: input.hierarchical.telemetry.subqueryIds,
        mergedCandidateIds: input.hierarchical.mergedCandidates
          .map((candidate) => candidate.mergedCandidateId)
          .toSorted(),
        telemetry: input.hierarchical.telemetry,
      },
      retrievalPackArtifact: {
        artifactId: input.retrievalArtifact.id,
        contentHash: input.retrievalArtifact.contentHash,
        tokenEstimate: input.retrievalArtifact.tokenEstimate,
        structuredPayloadKeys: Object.keys(
          input.retrievalArtifact.structuredPayload ?? {},
        ).toSorted(),
      },
    },
    exclusions,
    telemetry,
  };
}

export async function writePhase2RetrievalIntegrationProofArtifact(input: {
  report: Phase2RetrievalIntegrationProofReport;
  artifactDir: string;
  artifactId?: string;
}): Promise<{ path: string; contentHash: string }> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.artifactId ?? input.report.reportId,
    suffix: "phase2-retrieval-integration-proof",
    value: input.report,
    fallbackFileId: "phase2-retrieval-proof",
  });
  return { path: written.path, contentHash: written.contentHash };
}
