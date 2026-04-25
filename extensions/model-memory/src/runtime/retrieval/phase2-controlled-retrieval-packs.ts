import {
  buildDerivedArtifactId,
  cloneJsonLike,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
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
import { buildProjectStateCapsuleContext } from "../context/project-state-capsule-context.ts";
import type { ProjectStateCapsuleContextResult } from "../context/project-state-capsule-context.ts";
import {
  createDefaultPhase2ProductionGatePolicy,
  evaluatePhase2ProductionGate,
  type Phase2ProductionCapability,
  type Phase2ProductionGateMode,
  type Phase2ProductionGatePolicy,
  type Phase2ProductionGatePrerequisiteReport,
  type Phase2ProductionGateProofReports,
  type Phase2ProductionGateResult,
} from "./phase2-production-gates.ts";
import {
  buildProjectStateCapsuleRetrievalShadow,
  type ProjectStateCapsuleRetrievalShadowResult,
} from "./project-state-capsules.ts";
import type { RetrievalPlan } from "./types.ts";

export const PHASE2_CONTROLLED_RETRIEVAL_PACK_SCHEMA_VERSION =
  "phase2_controlled_retrieval_pack.v1" as const;
export const PHASE2_CONTROLLED_RETRIEVAL_PACK_REPORT_SCHEMA_VERSION =
  "phase2_controlled_retrieval_pack_report.v1" as const;

export type Phase2ControlledRetrievalArtifactKind =
  | "runtime_graph"
  | "project_state_capsule"
  | "project_state_capsule_context";

export type Phase2ControlledRetrievalExclusionReason =
  | "disabled"
  | "gate_denied"
  | "gate_shadow_only"
  | "missing_project_scope"
  | "missing_graph_input"
  | "missing_capsule_input"
  | "missing_capsule_shadow"
  | "no_allowed_candidates"
  | "context_not_allowed"
  | "context_empty";

export type Phase2ControlledRetrievalArtifactSelection = {
  artifactKind: Phase2ControlledRetrievalArtifactKind;
  artifactIds: string[];
  included: boolean;
  shadowOnly: boolean;
  sourceMemoryIds: string[];
  sourceProfileIds: string[];
  authorityTiers: string[];
  contentHashes: string[];
};

export type Phase2ControlledRetrievalPackExclusion = {
  artifactKind: Phase2ControlledRetrievalArtifactKind;
  reason: Phase2ControlledRetrievalExclusionReason;
  gateId?: string;
  artifactIds: string[];
};

export type Phase2ControlledRetrievalPackTelemetry = {
  schemaVersion: typeof PHASE2_CONTROLLED_RETRIEVAL_PACK_SCHEMA_VERSION;
  enabled: boolean;
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
  gateResults: Phase2ProductionGateResult[];
  selectedArtifactIds: string[];
  excludedArtifactIds: string[];
  exclusionReasons: Record<Phase2ControlledRetrievalExclusionReason, number>;
  sourceMemoryIds: string[];
  sourceProfileIds: string[];
  authorityTiers: string[];
  contentHashes: string[];
  proofHashes: string[];
  projectPageBypassed: boolean;
  projectPageBypassReason?: "project_state_capsule_controlled_context";
};

export type Phase2ControlledRetrievalPackInput = {
  enablePhase2ControlledRetrieval?: boolean;
  projectId?: string;
  requestScope?: Record<string, unknown>;
  retrievalPlan?: RetrievalPlan;
  graphMemories?: RuntimeGraphMemoryInput[];
  runtimeGraph?: RuntimeGraphBuildResult;
  capsules?: ProjectStateCapsule[];
  policy?: Phase2ProductionGatePolicy;
  capabilityModes?: Partial<Record<Phase2ProductionCapability, Phase2ProductionGateMode>>;
  proofPrerequisites?: Phase2ProductionGatePrerequisiteReport;
  proofReports?: Phase2ProductionGateProofReports;
  explicitEvalEnabled?: boolean;
  explicitOperatorEnabled?: boolean;
  includeConflictAware?: boolean;
  includeInspection?: boolean;
  projectPageProjectionAvailable?: boolean;
  noDarkDataStatus?: "pass" | "fail";
  now?: Date;
};

export type Phase2ControlledRetrievalPackResult = {
  schemaVersion: typeof PHASE2_CONTROLLED_RETRIEVAL_PACK_SCHEMA_VERSION;
  resultId: string;
  mode: "disabled" | "shadow_report_only" | "explicit_or_controlled";
  runtimeGraph?: {
    graphId: string;
    outputHash: string;
    nodeIds: string[];
    edgeIds: string[];
    excludedMemoryIds: string[];
    sourceMemoryIds: string[];
    sourceProfileIds: string[];
    authorityTiers: string[];
    readOnly: true;
    semanticTruth: false;
  };
  capsuleRetrievalShadow?: ProjectStateCapsuleRetrievalShadowResult;
  capsuleContext?: ProjectStateCapsuleContextResult;
  selections: Phase2ControlledRetrievalArtifactSelection[];
  exclusions: Phase2ControlledRetrievalPackExclusion[];
  telemetry: Phase2ControlledRetrievalPackTelemetry;
};

export type Phase2ControlledRetrievalPackReport = {
  schemaVersion: typeof PHASE2_CONTROLLED_RETRIEVAL_PACK_REPORT_SCHEMA_VERSION;
  reportId: string;
  resultId: string;
  generatedAt: string;
  selectedArtifactIds: string[];
  excludedArtifactIds: string[];
  reasonCodes: string[];
  sourceMemoryIds: string[];
  sourceProfileIds: string[];
  authorityTiers: string[];
  contentHashes: string[];
  proofHashes: string[];
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
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

const PROHIBITED_MARKER_PARTS = [
  ["raw", "-", "prompt", "-", "marker"],
  ["raw", "-", "transcript", "-", "marker"],
  ["raw", "-", "tool", "-", "log", "-", "marker"],
  ["secret", "-", "marker"],
  ["private", "-", "phrase", "-", "marker"],
] as const;

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
        `phase2 controlled retrieval contains prohibited field: ${[...path, key].join(".")}`,
      );
    }
    assertNoProhibitedKeys(nested, [...path, key]);
  }
}

function assertNoDarkData(value: unknown): void {
  assertNoProhibitedKeys(value);
  const serialized = JSON.stringify(value);
  for (const parts of PROHIBITED_MARKER_PARTS) {
    if (serialized.includes(parts.join(""))) {
      throw new Error("phase2 controlled retrieval contains prohibited marker content");
    }
  }
}

function clone<T extends JsonLike>(value: T): T {
  return cloneJsonLike(value);
}

function readProjectId(scope: Record<string, unknown> | undefined): string | undefined {
  const projectId = scope?.projectId ?? scope?.project_id;
  return typeof projectId === "string" && projectId.trim().length > 0
    ? projectId.trim()
    : undefined;
}

function resolveProjectId(input: Phase2ControlledRetrievalPackInput): string | undefined {
  return (
    input.projectId ??
    readProjectId(input.requestScope) ??
    input.retrievalPlan?.queries
      .map((query) => readProjectId(query.filters))
      .find((value): value is string => Boolean(value))
  );
}

function policyForInput(input: Phase2ControlledRetrievalPackInput): Phase2ProductionGatePolicy {
  const base = input.policy ?? createDefaultPhase2ProductionGatePolicy();
  return {
    ...base,
    capabilityModes: {
      ...base.capabilityModes,
      ...input.capabilityModes,
    },
  };
}

function gateMode(input: {
  policy: Phase2ProductionGatePolicy;
  capability: Phase2ProductionCapability;
  enabled: boolean;
}): Phase2ProductionGateMode {
  if (!input.enabled) {
    return "disabled";
  }
  return input.policy.capabilityModes[input.capability];
}

function sourceMemoryIdsFromGraph(graph: RuntimeGraphBuildResult | undefined): string[] {
  return uniqueSortedStrings(graph?.nodes.flatMap((node) => node.sourceMemoryIds) ?? []);
}

function summarizeGraph(graph: RuntimeGraphBuildResult) {
  const sourceProfileIds = uniqueSortedStrings(graph.nodes.map((node) => node.sourceProfileId));
  const authorityTiers = uniqueSortedStrings(graph.nodes.map((node) => node.authorityTier));
  return {
    graphId: buildDerivedArtifactId({
      family: "runtime_graph",
      artifactType: "runtime_graph_read_summary",
      seed: graph.outputHash,
    }),
    outputHash: graph.outputHash,
    nodeIds: graph.nodes.map((node) => node.nodeId).toSorted(),
    edgeIds: graph.edges.map((edge) => edge.edgeId).toSorted(),
    excludedMemoryIds: graph.excludedMemoryIds.map((entry) => entry.memoryId).toSorted(),
    sourceMemoryIds: sourceMemoryIdsFromGraph(graph),
    sourceProfileIds,
    authorityTiers,
    readOnly: true as const,
    semanticTruth: false as const,
  };
}

function capabilityGate(input: {
  capability: Phase2ProductionCapability;
  enabled: boolean;
  policy: Phase2ProductionGatePolicy;
  projectId?: string;
  sourceProfileIds?: string[];
  authorityTiers?: string[];
  contentHashes?: string[];
  noDarkDataStatus?: "pass" | "fail";
  proofPrerequisites?: Phase2ProductionGatePrerequisiteReport;
  proofReports?: Phase2ProductionGateProofReports;
  explicitEvalEnabled?: boolean;
  explicitOperatorEnabled?: boolean;
  includeConflictAware?: boolean;
  includeInspection?: boolean;
  conflictMarkers?: string[];
  staleMarkers?: string[];
  freshnessStatus?: "fresh" | "stale";
  budget?: { estimatedTokens?: number; maxTokens?: number };
}): Phase2ProductionGateResult {
  return evaluatePhase2ProductionGate({
    capability: input.capability,
    requestedMode: gateMode({
      capability: input.capability,
      enabled: input.enabled,
      policy: input.policy,
    }),
    policy: input.policy,
    projectScope: input.projectId,
    sourceProfileIds: input.sourceProfileIds as never,
    authorityTiers: input.authorityTiers as never,
    contentHashes: input.contentHashes,
    noDarkDataStatus: input.noDarkDataStatus ?? "pass",
    proofPrerequisites: input.proofPrerequisites,
    proofReports: input.proofReports,
    explicitEvalEnabled: input.explicitEvalEnabled,
    explicitOperatorEnabled: input.explicitOperatorEnabled,
    allowConflictAware: input.includeConflictAware,
    allowInspectionOnly: input.includeInspection,
    conflictMarkers: input.conflictMarkers,
    staleMarkers: input.staleMarkers,
    freshnessStatus: input.freshnessStatus,
    budget: input.budget,
  });
}

function buildCapsules(input: {
  projectId?: string;
  graph?: RuntimeGraphBuildResult;
  graphMemories?: RuntimeGraphMemoryInput[];
  capsules?: ProjectStateCapsule[];
  now?: Date;
}): ProjectStateCapsule[] {
  const provided = input.capsules ?? [];
  if (provided.length > 0 || !input.projectId || !input.graphMemories) {
    return provided.map(
      (capsule) => clone(capsule as unknown as JsonLike) as unknown as ProjectStateCapsule,
    );
  }
  return [
    compileProjectStateCapsule({
      projectId: input.projectId,
      memories: input.graphMemories,
      graph: input.graph,
      now: input.now,
    }).capsule,
  ];
}

function capsuleSourceProfileIds(capsules: ProjectStateCapsule[]): string[] {
  return uniqueSortedStrings(capsules.flatMap((capsule) => capsule.digest.sourceProfileIds));
}

function capsuleAuthorityTiers(capsules: ProjectStateCapsule[]): string[] {
  return uniqueSortedStrings(capsules.flatMap((capsule) => capsule.digest.authorityTiers));
}

function capsuleContentHashes(capsules: ProjectStateCapsule[]): string[] {
  return uniqueSortedStrings(capsules.map((capsule) => capsule.contentHash));
}

function capsuleStaleMarkers(capsules: ProjectStateCapsule[]): string[] {
  return uniqueSortedStrings(
    capsules.flatMap((capsule) =>
      capsule.digest.conflictMarkers.filter((marker) => marker.startsWith("stale:")),
    ),
  );
}

function capsuleConflictMarkers(capsules: ProjectStateCapsule[]): string[] {
  return uniqueSortedStrings(
    capsules.flatMap((capsule) =>
      capsule.digest.conflictMarkers.filter((marker) => !marker.startsWith("stale:")),
    ),
  );
}

function capsuleSourceMemoryIds(capsules: ProjectStateCapsule[]): string[] {
  return uniqueSortedStrings(capsules.flatMap((capsule) => capsule.digest.sourceMemoryIds));
}

function countExclusions(
  exclusions: Phase2ControlledRetrievalPackExclusion[],
): Record<Phase2ControlledRetrievalExclusionReason, number> {
  return {
    disabled: exclusions.filter((entry) => entry.reason === "disabled").length,
    gate_denied: exclusions.filter((entry) => entry.reason === "gate_denied").length,
    gate_shadow_only: exclusions.filter((entry) => entry.reason === "gate_shadow_only").length,
    missing_project_scope: exclusions.filter((entry) => entry.reason === "missing_project_scope")
      .length,
    missing_graph_input: exclusions.filter((entry) => entry.reason === "missing_graph_input")
      .length,
    missing_capsule_input: exclusions.filter((entry) => entry.reason === "missing_capsule_input")
      .length,
    missing_capsule_shadow: exclusions.filter((entry) => entry.reason === "missing_capsule_shadow")
      .length,
    no_allowed_candidates: exclusions.filter((entry) => entry.reason === "no_allowed_candidates")
      .length,
    context_not_allowed: exclusions.filter((entry) => entry.reason === "context_not_allowed")
      .length,
    context_empty: exclusions.filter((entry) => entry.reason === "context_empty").length,
  };
}

function gateExclusionReason(
  gate: Phase2ProductionGateResult,
): Phase2ControlledRetrievalExclusionReason {
  if (gate.decision === "shadow_only") {
    return "gate_shadow_only";
  }
  if (gate.decision === "blocked_missing_scope") {
    return "missing_project_scope";
  }
  if (gate.decision === "denied") {
    return "disabled";
  }
  return "gate_denied";
}

function telemetry(input: {
  enabled: boolean;
  gates: Phase2ProductionGateResult[];
  selections: Phase2ControlledRetrievalArtifactSelection[];
  exclusions: Phase2ControlledRetrievalPackExclusion[];
  projectPageProjectionAvailable: boolean;
}): Phase2ControlledRetrievalPackTelemetry {
  const selectedArtifactIds = uniqueSortedStrings(
    input.selections.filter((entry) => entry.included).flatMap((entry) => entry.artifactIds),
  );
  const excludedArtifactIds = uniqueSortedStrings(
    input.exclusions.flatMap((entry) => entry.artifactIds),
  );
  const projectPageBypassed =
    input.projectPageProjectionAvailable &&
    input.selections.some(
      (entry) => entry.artifactKind === "project_state_capsule_context" && entry.included,
    );
  return {
    schemaVersion: PHASE2_CONTROLLED_RETRIEVAL_PACK_SCHEMA_VERSION,
    enabled: input.enabled,
    defaultRetrievalChanged: false,
    defaultContextInjectionChanged: false,
    gateResults: input.gates,
    selectedArtifactIds,
    excludedArtifactIds,
    exclusionReasons: countExclusions(input.exclusions),
    sourceMemoryIds: uniqueSortedStrings(
      input.selections.flatMap((entry) => entry.sourceMemoryIds),
    ),
    sourceProfileIds: uniqueSortedStrings(
      input.selections.flatMap((entry) => entry.sourceProfileIds),
    ),
    authorityTiers: uniqueSortedStrings(input.selections.flatMap((entry) => entry.authorityTiers)),
    contentHashes: uniqueSortedStrings(input.selections.flatMap((entry) => entry.contentHashes)),
    proofHashes: uniqueSortedStrings(input.gates.flatMap((gate) => gate.proofHashes)),
    projectPageBypassed,
    ...(projectPageBypassed
      ? { projectPageBypassReason: "project_state_capsule_controlled_context" as const }
      : {}),
  };
}

export function buildPhase2ControlledRetrievalPack(
  input: Phase2ControlledRetrievalPackInput = {},
): Phase2ControlledRetrievalPackResult {
  assertNoDarkData(input);
  const enabled = input.enablePhase2ControlledRetrieval ?? false;
  const now = input.now ?? new Date(0);
  const projectId = resolveProjectId(input);
  const policy = policyForInput(input);
  const gates: Phase2ProductionGateResult[] = [];
  const selections: Phase2ControlledRetrievalArtifactSelection[] = [];
  const exclusions: Phase2ControlledRetrievalPackExclusion[] = [];

  const graph =
    input.runtimeGraph ??
    (input.graphMemories
      ? buildRuntimeGraph(input.graphMemories, {
          now,
          includeConflictOnly: input.includeConflictAware,
          includeInspectionOnly: false,
        })
      : undefined);
  const graphSummary = graph ? summarizeGraph(graph) : undefined;
  const graphGate = capabilityGate({
    capability: "runtime_graph_reads",
    enabled,
    policy,
    projectId,
    sourceProfileIds: graphSummary?.sourceProfileIds,
    authorityTiers: graphSummary?.authorityTiers,
    contentHashes: graph ? [graph.outputHash] : [],
    noDarkDataStatus: input.noDarkDataStatus,
    proofPrerequisites: input.proofPrerequisites,
    proofReports: input.proofReports,
    explicitEvalEnabled: input.explicitEvalEnabled,
    explicitOperatorEnabled: input.explicitOperatorEnabled,
    includeConflictAware: input.includeConflictAware,
    includeInspection: input.includeInspection,
  });
  gates.push(graphGate);
  if (!graph || !graphSummary) {
    exclusions.push({
      artifactKind: "runtime_graph",
      reason: enabled ? "missing_graph_input" : "disabled",
      gateId: graphGate.gateId,
      artifactIds: [],
    });
  } else if (graphGate.allowed) {
    selections.push({
      artifactKind: "runtime_graph",
      artifactIds: [graphSummary.graphId],
      included: true,
      shadowOnly: false,
      sourceMemoryIds: graphSummary.sourceMemoryIds,
      sourceProfileIds: graphSummary.sourceProfileIds,
      authorityTiers: graphSummary.authorityTiers,
      contentHashes: [graph.outputHash],
    });
  } else {
    selections.push({
      artifactKind: "runtime_graph",
      artifactIds: [graphSummary.graphId],
      included: false,
      shadowOnly: graphGate.decision === "shadow_only",
      sourceMemoryIds: graphSummary.sourceMemoryIds,
      sourceProfileIds: graphSummary.sourceProfileIds,
      authorityTiers: graphSummary.authorityTiers,
      contentHashes: [graph.outputHash],
    });
    exclusions.push({
      artifactKind: "runtime_graph",
      reason: gateExclusionReason(graphGate),
      gateId: graphGate.gateId,
      artifactIds: [graphSummary.graphId],
    });
  }

  const capsules = buildCapsules({
    projectId,
    graph,
    graphMemories: input.graphMemories,
    capsules: input.capsules,
    now,
  });
  const capsuleGate = capabilityGate({
    capability: "project_state_capsule_retrieval",
    enabled,
    policy,
    projectId,
    sourceProfileIds: capsuleSourceProfileIds(capsules),
    authorityTiers: capsuleAuthorityTiers(capsules),
    contentHashes: capsuleContentHashes(capsules),
    noDarkDataStatus: input.noDarkDataStatus,
    proofPrerequisites: input.proofPrerequisites,
    proofReports: input.proofReports,
    explicitEvalEnabled: input.explicitEvalEnabled,
    explicitOperatorEnabled: input.explicitOperatorEnabled,
    includeConflictAware: input.includeConflictAware,
    includeInspection: input.includeInspection,
    conflictMarkers: capsuleConflictMarkers(capsules),
    staleMarkers: capsuleStaleMarkers(capsules),
    freshnessStatus: capsules.some((capsule) => capsule.digest.freshness.status === "stale")
      ? "stale"
      : "fresh",
  });
  gates.push(capsuleGate);
  const canBuildCapsuleShadow = capsuleGate.allowed || capsuleGate.decision === "shadow_only";
  const capsuleRetrievalShadow =
    canBuildCapsuleShadow && capsules.length > 0
      ? buildProjectStateCapsuleRetrievalShadow({
          retrievalPlan: input.retrievalPlan,
          capsules,
          requestScope: input.requestScope,
          projectId,
          shadowModeEnabled: true,
          includeConflictAware: input.includeConflictAware,
          includeInspection: input.includeInspection,
          projectPageProjectionAvailable: input.projectPageProjectionAvailable,
        })
      : undefined;
  if (capsules.length === 0) {
    exclusions.push({
      artifactKind: "project_state_capsule",
      reason: enabled ? "missing_capsule_input" : "disabled",
      gateId: capsuleGate.gateId,
      artifactIds: [],
    });
  } else if (capsuleRetrievalShadow && capsuleRetrievalShadow.candidates.length > 0) {
    const packIds = capsuleRetrievalShadow.packs.map((pack) => pack.packId);
    selections.push({
      artifactKind: "project_state_capsule",
      artifactIds: [
        ...capsuleRetrievalShadow.candidates.map((candidate) => candidate.candidateId),
        ...packIds,
      ],
      included: capsuleGate.allowed,
      shadowOnly: capsuleGate.decision === "shadow_only",
      sourceMemoryIds: capsuleSourceMemoryIds(capsules),
      sourceProfileIds: capsuleSourceProfileIds(capsules),
      authorityTiers: capsuleAuthorityTiers(capsules),
      contentHashes: capsuleContentHashes(capsules),
    });
    if (!capsuleGate.allowed) {
      exclusions.push({
        artifactKind: "project_state_capsule",
        reason: gateExclusionReason(capsuleGate),
        gateId: capsuleGate.gateId,
        artifactIds: packIds,
      });
    }
  } else {
    exclusions.push({
      artifactKind: "project_state_capsule",
      reason: capsuleGate.allowed ? "no_allowed_candidates" : gateExclusionReason(capsuleGate),
      gateId: capsuleGate.gateId,
      artifactIds: capsules.map((capsule) => capsule.capsuleId),
    });
  }

  const capsuleContextGate = capabilityGate({
    capability: "project_state_capsule_context",
    enabled,
    policy,
    projectId,
    sourceProfileIds: capsuleSourceProfileIds(capsules),
    authorityTiers: capsuleAuthorityTiers(capsules),
    contentHashes: capsuleContentHashes(capsules),
    noDarkDataStatus: input.noDarkDataStatus,
    proofPrerequisites: input.proofPrerequisites,
    proofReports: input.proofReports,
    explicitEvalEnabled: input.explicitEvalEnabled,
    explicitOperatorEnabled: input.explicitOperatorEnabled,
    includeConflictAware: input.includeConflictAware,
    includeInspection: input.includeInspection,
    conflictMarkers: capsuleConflictMarkers(capsules),
    staleMarkers: capsuleStaleMarkers(capsules),
    freshnessStatus: capsules.some((capsule) => capsule.digest.freshness.status === "stale")
      ? "stale"
      : "fresh",
  });
  gates.push(capsuleContextGate);
  const capsuleContext =
    capsuleRetrievalShadow &&
    (capsuleContextGate.allowed || capsuleContextGate.decision === "shadow_only")
      ? buildProjectStateCapsuleContext({
          capsuleRetrievalShadow,
          mode: capsuleContextGate.allowed ? "explicit_injection" : "shadow_report_only",
          includeConflictAware: input.includeConflictAware,
          includeInspection: input.includeInspection,
          projectPageProjectionAvailable: input.projectPageProjectionAvailable,
        })
      : undefined;
  if (!capsuleRetrievalShadow) {
    exclusions.push({
      artifactKind: "project_state_capsule_context",
      reason: "missing_capsule_shadow",
      gateId: capsuleContextGate.gateId,
      artifactIds: [],
    });
  } else if (capsuleContextGate.allowed && capsuleContext?.blocks.length) {
    selections.push({
      artifactKind: "project_state_capsule_context",
      artifactIds: capsuleContext.blocks.map((block) => block.contextBlockId),
      included: true,
      shadowOnly: false,
      sourceMemoryIds: uniqueSortedStrings(
        capsuleContext.blocks.flatMap((block) => block.sourceMemoryIds),
      ),
      sourceProfileIds: uniqueSortedStrings(
        capsuleContext.blocks.flatMap((block) => block.sourceProfileIds),
      ),
      authorityTiers: uniqueSortedStrings(
        capsuleContext.blocks.flatMap((block) => block.authorityTiers),
      ),
      contentHashes: uniqueSortedStrings(capsuleContext.blocks.map((block) => block.contentHash)),
    });
  } else {
    const packIds = capsuleRetrievalShadow.packs.map((pack) => pack.packId);
    selections.push({
      artifactKind: "project_state_capsule_context",
      artifactIds: packIds,
      included: false,
      shadowOnly: capsuleContextGate.decision === "shadow_only",
      sourceMemoryIds: capsuleSourceMemoryIds(capsules),
      sourceProfileIds: capsuleSourceProfileIds(capsules),
      authorityTiers: capsuleAuthorityTiers(capsules),
      contentHashes: capsuleContentHashes(capsules),
    });
    exclusions.push({
      artifactKind: "project_state_capsule_context",
      reason:
        capsuleContextGate.decision === "shadow_only"
          ? "gate_shadow_only"
          : capsuleContextGate.allowed
            ? "context_empty"
            : "context_not_allowed",
      gateId: capsuleContextGate.gateId,
      artifactIds: packIds,
    });
  }

  const mode = !enabled
    ? "disabled"
    : gates.some((gate) => gate.allowed)
      ? "explicit_or_controlled"
      : "shadow_report_only";
  const resultId = buildDerivedArtifactId({
    family: "retrieval_pack",
    artifactType: "phase2_controlled_retrieval_pack",
    targetId: projectId,
    seed: {
      mode,
      gateIds: gates.map((gate) => gate.gateId),
      selections: selections.map((selection) => selection.artifactIds),
      exclusions,
    },
  });
  const result: Phase2ControlledRetrievalPackResult = {
    schemaVersion: PHASE2_CONTROLLED_RETRIEVAL_PACK_SCHEMA_VERSION,
    resultId,
    mode,
    ...(graphGate.allowed && graphSummary ? { runtimeGraph: graphSummary } : {}),
    ...(capsuleRetrievalShadow ? { capsuleRetrievalShadow } : {}),
    ...(capsuleContext ? { capsuleContext } : {}),
    selections,
    exclusions,
    telemetry: telemetry({
      enabled,
      gates,
      selections,
      exclusions,
      projectPageProjectionAvailable: input.projectPageProjectionAvailable ?? false,
    }),
  };
  assertNoDarkData(result);
  return clone(result as unknown as JsonLike) as unknown as Phase2ControlledRetrievalPackResult;
}

export function buildPhase2ControlledRetrievalPackReport(input: {
  result: Phase2ControlledRetrievalPackResult;
  now?: Date;
}): Phase2ControlledRetrievalPackReport {
  assertNoDarkData(input);
  const generatedAt = (input.now ?? new Date(0)).toISOString();
  const reportId = buildDerivedArtifactId({
    family: "retrieval_pack",
    artifactType: "phase2_controlled_retrieval_pack_report",
    targetId: input.result.resultId,
    seed: {
      generatedAt,
      selectedArtifactIds: input.result.telemetry.selectedArtifactIds,
      excludedArtifactIds: input.result.telemetry.excludedArtifactIds,
      gateIds: input.result.telemetry.gateResults.map((gate) => gate.gateId),
    },
  });
  const report: Phase2ControlledRetrievalPackReport = {
    schemaVersion: PHASE2_CONTROLLED_RETRIEVAL_PACK_REPORT_SCHEMA_VERSION,
    reportId,
    resultId: input.result.resultId,
    generatedAt,
    selectedArtifactIds: [...input.result.telemetry.selectedArtifactIds],
    excludedArtifactIds: [...input.result.telemetry.excludedArtifactIds],
    reasonCodes: uniqueSortedStrings(
      input.result.telemetry.gateResults.flatMap((gate) => gate.reasonCodes),
    ),
    sourceMemoryIds: [...input.result.telemetry.sourceMemoryIds],
    sourceProfileIds: [...input.result.telemetry.sourceProfileIds],
    authorityTiers: [...input.result.telemetry.authorityTiers],
    contentHashes: [...input.result.telemetry.contentHashes],
    proofHashes: [...input.result.telemetry.proofHashes],
    defaultRetrievalChanged: false,
    defaultContextInjectionChanged: false,
  };
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2ControlledRetrievalPackReport;
}

export async function writePhase2ControlledRetrievalPackReportArtifact(input: {
  report: Phase2ControlledRetrievalPackReport;
  artifactDir: string;
}): Promise<{ path: string; contentHash: string; byteLength: number }> {
  assertNoDarkData(input.report);
  return writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: ".phase2-controlled-retrieval-pack-report.json",
    value: input.report,
    maxBytes: 128 * 1024,
    fallbackFileId: "phase2-controlled-retrieval-pack-report",
  });
}
