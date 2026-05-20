import { createHash } from "node:crypto";
import {
  missingField,
  repairRequestForMissingFields,
  type ModelDecisionMissingField,
  type ModelDecisionRepairRequest,
} from "../model-decision-contracts/index.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import {
  createContextSnapshotRef,
  normalizeContextSnapshotRefs,
  validateContextSnapshotFreshness,
  type ContextSnapshotRef,
} from "./context-snapshot.ts";
import {
  costAwareDecisionReadback,
  normalizeCostAwareCapabilityUtilityDecision,
  utilityDecisionFromNodeMetadata,
  validateCostAwareCapabilityUtilityDecision,
  type CostAwareCapabilityUtilityDecision,
} from "./cost-aware-capability-policy.ts";
import {
  missionLedgerBlocksExecution,
  missionLedgerHasOpenBlockingCommitments,
  missionLedgerRequiresReviewBeforeExecution,
  openBlockingMissionCommitments,
  recomputeMissionLedgerStatus,
  summarizeMissionContractLedger,
  type MissionCommitment,
  type MissionContractLedger,
  type MissionContractLedgerSummary,
} from "./mission-contract-ledger.ts";
import {
  summarizeCommitmentWorkPacketsForProgress,
  validateCommitmentWorkPacketsForScheduler,
  type CommitmentWorkPacket,
} from "./mission-work-packets.ts";
import { validateNonCodexTaskDecompositionDecision } from "./non-codex-task-decomposition-policy.ts";
import {
  compileOrchestratorGraphDecision,
  validateOrchestratorGraphDecision,
  type OrchestratorGraphDecision,
  type OrchestratorGraphRejectedNodeDiagnostic,
  type OrchestratorGraphNodeSpec,
} from "./orchestrator-graph-decision.ts";
import {
  buildPostSynthesisRoleObligationGuidance,
  validatePostSynthesisGraphDecision,
  type PostSynthesisRoleObligationGuidance,
  type PostSynthesisGraphQualityReport,
} from "./post-synthesis-graph-policy.ts";
import {
  buildRuntimeRepairClassification,
  failureClassFromReasonCodes,
  runtimeRepairClassificationSummary,
  type RuntimeRepairClassification,
} from "./repair-classification.ts";
import {
  buildRuntimeNodeCapabilityManifest,
  findRuntimeNodeCapability,
  filterRuntimeNodeCapabilityManifestForExecutors,
  providerCapabilityProfileForCapability,
  runtimeNodeCapabilityManifestForModel,
  type RuntimeNodeCapabilityManifest,
  type RuntimeNodeCapabilityPhase,
} from "./runtime-node-capability-registry.ts";
import {
  deriveRuntimeTaskBudgetPolicy,
  runtimeToolBudgetFromPolicy,
  summarizeRuntimeTaskBudgetPolicy,
  type RuntimeTaskBudgetPolicy,
} from "./runtime-task-budget-policy.ts";
import type {
  RuntimeWorkGraphRepository,
  RuntimeWorkGraphSnapshot,
} from "./runtime-work-graph-repository.ts";
import type { RuntimeWorkGraphSchedulerSnapshotSummary } from "./runtime-work-graph-scheduler-contracts.ts";
import {
  boundedRuntimeWorkGraphString,
  graphRef,
  type TeamGraphNode,
  type TeamRunGraphStatus,
} from "./runtime-work-graph.ts";
import {
  invokeSchedulerRuntimeTool,
  type SchedulerRuntimeToolId,
} from "./scheduler-runtime-tools.ts";
import type {
  CommitmentEvidenceClaim,
  RuntimeWorkGraphNodeExecutionResult,
} from "./workflow-node-execution-contracts.ts";
import {
  genericWorkflowNodeResultFromRuntime,
  validateGenericWorkflowNodeResult,
} from "./workflow-node-execution.ts";
import type { WorkflowRoleClass } from "./workflow-orchestration-policy.ts";

export type { RuntimeWorkGraphSchedulerSnapshotSummary } from "./runtime-work-graph-scheduler-contracts.ts";
export type {
  CommitmentEvidenceClaim,
  RuntimeWorkGraphNodeExecutionResult,
} from "./workflow-node-execution-contracts.ts";

export type RuntimeWorkGraphSchedulerDecisionInput = {
  graphId: string;
  iteration: number;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  missionLedgerSummary?: MissionContractLedgerSummary | null;
  commitmentWorkPackets?: CommitmentWorkPacket[];
  recentNodeResultSummaries?: RuntimeWorkGraphRecentNodeResultSummary[];
  capabilityRegistrySummary?: JsonValue | null;
  postSynthesisRoleObligationGuidance?: PostSynthesisRoleObligationGuidance | null;
  repairAttempt?: number;
  rejectedDecisionReasonCodes?: string[];
  rejectedDecisionDiagnostics?: OrchestratorGraphRejectedNodeDiagnostic[];
  rejectedDecisionRef?: string | null;
  repairFieldHints?: string[];
  repairDiagnostics?: ModelDecisionRepairRequest | null;
  acceptedDecisionFieldRefs?: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type RuntimeWorkGraphRecentNodeResultSummary = {
  nodeId: string;
  nodeKind: string;
  assignedRole: string;
  status: RuntimeWorkGraphNodeExecutionResult["status"];
  outputArtifactRefs: string[];
  ownerSummary: string | null;
  eli5Summary: string | null;
  reasonCodes: string[];
  metadataSummary: JsonValue;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type RuntimeWorkGraphSchedulerOrchestrator = {
  decide(input: RuntimeWorkGraphSchedulerDecisionInput): Promise<unknown>;
};

export type RuntimeWorkGraphNodeExecutionInput = {
  graphId: string;
  node: TeamGraphNode;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  missionLedgerSummary?: MissionContractLedgerSummary | null;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type RuntimeWorkGraphNodeExecutor = {
  execute(input: RuntimeWorkGraphNodeExecutionInput): Promise<RuntimeWorkGraphNodeExecutionResult>;
};

type RuntimeWorkGraphLoopGuard = {
  seenEvidenceRefs: Set<string>;
  roleIdsSeen: Set<string>;
  repeatedNoProgressBySignature: Map<string, number>;
};

function workflowRoleClassForNode(node: TeamGraphNode): WorkflowRoleClass {
  switch (node.nodeKind) {
    case "orchestrator_plan":
      return "orchestrator";
    case "context_scout":
    case "context_synthesis":
      return "context";
    case "implementation":
    case "repair":
      return "implementation";
    case "validation":
    case "test_review":
    case "test_authoring":
      return "qa";
    case "web_research":
      return "research";
    case "docs_update":
      return "docs";
    case "architecture_spec":
      return "architecture";
    case "planning_capsule":
    case "action_graph_compile":
    case "compiler":
      return "planning";
    case "human_task":
      return "human";
    case "reviewer":
    case "security_review":
      return "review";
    case "observability_readback":
      return "observability";
    case "closeout":
      return "closeout";
    default:
      return "observability";
  }
}

type RuntimeWorkGraphLoopGuardDecision =
  | { halted: false; reasonCodes: string[] }
  | { halted: true; reasonCodes: string[] };

export type RuntimeWorkGraphRoleCoverageClass =
  | "context"
  | "implementation"
  | "validation_or_test"
  | "review"
  | "planning"
  | "research"
  | "planning_capsule"
  | "human_decision"
  | "action_proposal_or_compile"
  | "closeout";

export type RuntimeWorkGraphRoleCoverageProfile = {
  profileId: string;
  requiredClasses: RuntimeWorkGraphRoleCoverageClass[];
};

export const CODING_TEAM_ROLE_COVERAGE_PROFILE: RuntimeWorkGraphRoleCoverageProfile = {
  profileId: "agent_team.coding.role_coverage.v1",
  requiredClasses: ["context", "implementation", "validation_or_test", "review"],
};

export const PRODUCT_SPEC_PLANNING_ROLE_COVERAGE_PROFILE: RuntimeWorkGraphRoleCoverageProfile = {
  profileId: "agent_team.product_spec_planning.role_coverage.v1",
  requiredClasses: ["planning", "planning_capsule", "action_proposal_or_compile", "closeout"],
};

export const ARCHITECTURE_RED_TEAM_ROLE_COVERAGE_PROFILE: RuntimeWorkGraphRoleCoverageProfile = {
  profileId: "agent_team.architecture_red_team.role_coverage.v1",
  requiredClasses: ["planning", "research", "review", "closeout"],
};

export type RuntimeWorkGraphSchedulerResult = {
  status: "succeeded" | "needs_review" | "failed" | "waiting_for_human" | "max_iterations";
  graphId: string;
  iterations: number;
  executedNodeIds: string[];
  addedNodeIds: string[];
  decisionRefs: string[];
  reasonCodes: string[];
  missionLedger?: MissionContractLedgerSummary | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

export type RuntimeWorkGraphSchedulerOptions = {
  graphs: RuntimeWorkGraphRepository;
  orchestrator: RuntimeWorkGraphSchedulerOrchestrator;
  executors: Record<string, RuntimeWorkGraphNodeExecutor>;
  runtimeToolKernel?: RuntimeToolKernel | null;
  runtimeToolNodeToolId?: string;
  missionLedger?: MissionContractLedger | null;
  commitmentWorkPackets?: CommitmentWorkPacket[];
  evaluateMissionLedger?: (input: {
    ledger: MissionContractLedger;
    graphId: string;
    iteration: number;
    nodeId?: string;
    decision?: OrchestratorGraphDecision;
    outputArtifactRefs: string[];
    evidenceClaims: CommitmentEvidenceClaim[];
    reasonCodes: string[];
    snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  }) => Promise<MissionContractLedger>;
  onMissionLedgerUpdated?: (ledger: MissionContractLedger) => Promise<void>;
  beforeNodeExecution?: (input: {
    graphId: string;
    iteration: number;
    node: TeamGraphNode;
    decision: OrchestratorGraphDecision;
    snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
    rawPromptStored: false;
    rawResponseStored: false;
  }) => Promise<{
    status: "continue" | "succeeded" | "needs_review" | "failed" | "waiting_for_human";
    reasonCodes: string[];
    selectedNodeId?: string | null;
    rawPromptStored: false;
    rawResponseStored: false;
    rawProviderLogStored: false;
  } | null>;
  onProgress?: (input: {
    stage: string;
    status: "started" | "completed" | "needs_review" | "failed" | "waiting_for_human";
    nodeId?: string;
    roleId?: string;
    reasonCodes?: string[];
    artifactRefs?: string[];
    currentObjective?: string | null;
    whyThisNodeWasChosen?: string | null;
    activeNodeKind?: string | null;
    capabilityId?: string | null;
    selectedCapabilityId?: string | null;
    selectedProviderCapabilityProfileId?: string | null;
    workerRef?: string | null;
    capabilityRoleClass?: string | null;
    capabilityCostClass?: string | null;
    capabilityLatencyClass?: string | null;
    capabilityContextCapacity?: string | null;
    providerProfileProductionSelectable?: boolean | null;
    providerProfileRequiresQualification?: boolean | null;
    selectedModelQualificationProfileId?: string | null;
    qualificationEvidenceRefs?: string[];
    capabilityUtilityRationale?: string | null;
    capabilityCostRationale?: string | null;
    whyCheaperOptionsWereInsufficient?: string | null;
    consideredCapabilityIds?: string[];
    consideredProviderCapabilityProfileIds?: string[];
    modelRef?: string | null;
    providerPath?: string | null;
    targetRefs?: string[];
    inputHandoffRefs?: string[];
    expectedOutput?: string | null;
    acceptanceCriteria?: string[];
    currentPhase?: string | null;
    validationState?: string | null;
    evidenceProducedRefs?: string[];
    evidenceClaimRefs?: string[];
    genericNodeExecutionResultRefs?: string[];
    evidenceClaims?: Array<{
      evidenceClaimId: string;
      commitmentId: string;
      evidenceKind: string;
      evidenceRef: string;
      claimSummary: string;
      producedByNodeId: string;
      producedByCapabilityId: string | null;
      producedByExecutorKey: string | null;
      validationRefs: string[];
      changedFileRefs: string[];
      limitations: string[];
    }>;
    commitmentIdsAdvanced?: string[];
    remainingOpenCommitmentIds?: string[];
    nextDecisionNeeded?: string | null;
    blockerSummary?: string | null;
    eli5Progress?: string | null;
    schedulerPhase?: string | null;
    schedulerToolId?: string | null;
    schedulerToolInvocationRefs?: string[];
    repairClassification?: JsonValue | null;
    parallelFrontier?: RuntimeWorkGraphParallelFrontierReadback | null;
    postSynthesisGraphQuality?: PostSynthesisGraphQualityReport | null;
    postSynthesisGraphQualityState?: string | null;
    postSynthesisMissingRoleObligations?: string[];
    postSynthesisPresentRoleObligations?: string[];
    postSynthesisBroadCodexShare?: number | null;
    postSynthesisPremiumShare?: number | null;
    commitmentWorkPackets?: Array<{
      packetRef?: string;
      commitmentId?: string;
      authoringSource?: string;
      qualityStatus?: string;
      workerObjective?: string;
      contextScoutObjective?: string;
      implementationObjective?: string;
      acceptanceCriteriaCount?: number;
      acceptanceCriteria?: string[];
      expectedEvidenceKinds?: string[];
      likelyRepoAreas?: string[];
      requiredContextQuestions?: string[];
      downstreamConsumer?: string;
    }>;
    budgetPolicyRef?: string | null;
    budgetClass?: string | null;
    budgetSummary?: JsonValue;
    runtimeToolTimeoutMs?: number | null;
    modelCallTimeoutMs?: number | null;
    workerLoopTurnTimeoutMs?: number | null;
    validationCommandTimeoutMs?: number | null;
    progressEmissionIntervalMs?: number | null;
    staleProgressAfterMs?: number | null;
    leaseTimeoutMs?: number | null;
    leaseHeartbeatMs?: number | null;
    elapsedMs?: number | null;
    budgetRemainingMs?: number | null;
    heartbeatState?: string | null;
    contextSnapshotRefs?: string[];
    staleContextSnapshotRefs?: string[];
    missingContextSnapshotRefs?: string[];
    rejectedContextSnapshotRefs?: string[];
    contextFreshnessStatus?: string | null;
    contextRefreshAction?: string | null;
    contextFreshnessSummary?: string | null;
    contextSynthesisRef?: string | null;
    contextSynthesisStatus?: string | null;
    contextSynthesisImplementationGroupCount?: number | null;
    contextSynthesisDependencyCount?: number | null;
    contextSynthesisParallelGroupCount?: number | null;
    contextSynthesisBlockerCount?: number | null;
    contextSynthesisValidationLaneCount?: number | null;
    contextSynthesisReviewLaneCount?: number | null;
    contextSynthesisWorkerFitSummary?: string | null;
    contextSynthesisGraphCompileInputSummary?: string | null;
    contextSynthesisImplementationGroupIds?: string[];
    contextSynthesisTargetRefs?: string[];
    contextSynthesisValidationLanes?: string[];
    contextSynthesisReviewLanes?: string[];
    contextSynthesisSemanticCodeIntelligenceRefs?: string[];
  }) => Promise<void>;
  onNodeAdded?: (input: {
    graphId: string;
    node: TeamGraphNode;
    reasonCodes: string[];
  }) => Promise<void>;
  onNodeStatusChanged?: (input: {
    graphId: string;
    node: TeamGraphNode;
    nodeStatus: TeamGraphNode["nodeStatus"];
    evidenceRefs: string[];
    reasonCodes: string[];
  }) => Promise<void>;
  capabilityRegistrySummary?: JsonValue | null;
  capabilityManifest?: RuntimeNodeCapabilityManifest;
  requireCostAwareCapabilityPolicy?: boolean;
  requireSchedulerToolKernel?: boolean;
  requireGenericStagedSchedulerProtocol?: boolean;
  requireMissionLedgerForExecutionWorkflow?: boolean;
  requireEvidenceClaimsForMissionLedger?: boolean;
  requireModelAuthoredCommitmentWorkPacketsForComplexMission?: boolean;
  requireFreshContextSnapshotsForWorkerExecution?: boolean;
  deferCloseoutUntilExecutableGraphComplete?: boolean;
  roleCoverageProfile?: RuntimeWorkGraphRoleCoverageProfile | null;
  maxIterations?: number;
  maxDecisionRepairAttempts?: number;
  maxParallelNodeExecutions?: number;
};

function summarizeSnapshot(
  snapshot: RuntimeWorkGraphSnapshot,
): RuntimeWorkGraphSchedulerSnapshotSummary {
  return {
    workflowId: snapshot.graph.workflowId,
    graphStatus: snapshot.graph.graphStatus,
    nodeSummaries: snapshot.nodes.map((node) => ({
      nodeId: node.nodeId,
      nodeKind: node.nodeKind,
      assignedRole: node.assignedRole,
      nodeStatus: node.nodeStatus,
      capabilityId:
        typeof jsonRecord(node.metadata).capabilityId === "string"
          ? (jsonRecord(node.metadata).capabilityId as string)
          : null,
      metadataCapabilityId:
        typeof jsonRecord(node.metadata).selectedCapabilityId === "string"
          ? (jsonRecord(node.metadata).selectedCapabilityId as string)
          : null,
      executorKey:
        typeof jsonRecord(node.metadata).executorKey === "string"
          ? (jsonRecord(node.metadata).executorKey as string)
          : null,
      commitmentIdsAdvanced: jsonStringArray(
        jsonRecord(node.metadata).commitmentIdsAdvanced ?? jsonRecord(node.metadata).commitmentIds,
      ),
      downstreamConsumer:
        typeof jsonRecord(node.metadata).downstreamConsumer === "string"
          ? (jsonRecord(node.metadata).downstreamConsumer as string)
          : null,
      noContextNeededRationale:
        typeof jsonRecord(node.metadata).noContextNeededRationale === "string"
          ? (jsonRecord(node.metadata).noContextNeededRationale as string)
          : null,
      inputHandoffRefs: node.inputHandoffRefs.slice(0, 12),
      outputArtifactRefs: node.outputArtifactRefs.slice(0, 8),
      contextSynthesisRef:
        typeof jsonRecord(node.metadata).contextSynthesisRef === "string"
          ? (jsonRecord(node.metadata).contextSynthesisRef as string)
          : null,
      contextSynthesisStatus:
        typeof jsonRecord(node.metadata).contextSynthesisStatus === "string"
          ? (jsonRecord(node.metadata).contextSynthesisStatus as string)
          : null,
      contextSynthesisAccepted: jsonRecord(node.metadata).contextSynthesisAccepted === true,
      lastStatusReasonCodes: jsonStringArray(jsonRecord(node.metadata).lastStatusReasonCodes),
      lastRepairClassificationRef:
        typeof jsonRecord(node.metadata).lastRepairClassificationRef === "string"
          ? (jsonRecord(node.metadata).lastRepairClassificationRef as string)
          : null,
      lastRepairFailureClass:
        typeof jsonRecord(node.metadata).lastRepairFailureClass === "string"
          ? (jsonRecord(node.metadata).lastRepairFailureClass as string)
          : null,
      lastRepairStrategy:
        typeof jsonRecord(node.metadata).lastRepairStrategy === "string"
          ? (jsonRecord(node.metadata).lastRepairStrategy as string)
          : null,
      lastRepairBoundary:
        typeof jsonRecord(node.metadata).lastRepairBoundary === "string"
          ? (jsonRecord(node.metadata).lastRepairBoundary as string)
          : null,
      highCapabilityEscalationRequired:
        jsonRecord(node.metadata).highCapabilityEscalationRequired === true,
    })),
    edgeSummaries: snapshot.edges.slice(0, 80).map((edge) => ({
      edgeId: edge.edgeId,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      edgeKind: edge.edgeKind,
    })),
    edgeCount: snapshot.edges.length,
    humanTaskCount: snapshot.humanTasks.length,
    latestCheckpointKinds: snapshot.checkpoints
      .slice(-8)
      .map((checkpoint) => checkpoint.checkpointKind),
  };
}

function executorKeyForNode(node: TeamGraphNode): string[] {
  const metadata = jsonRecord(node.metadata);
  return [
    typeof metadata.executorKey === "string" ? metadata.executorKey : null,
    typeof metadata.capabilityId === "string" ? `capability:${metadata.capabilityId}` : null,
    `kind:${node.nodeKind}`,
    `role:${node.assignedRole}`,
    node.nodeKind,
    node.assignedRole,
  ].filter((key): key is string => Boolean(key));
}

function selectedNodeDependencyReasonCodes(input: {
  decision: OrchestratorGraphDecision;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
}): string[] {
  if (!["run_node", "retry_node", "repair_from_validation"].includes(input.decision.decisionKind)) {
    return [];
  }
  const targetNodeId = input.decision.runNodeId ?? input.decision.targetNodeId;
  if (!targetNodeId) {
    return [];
  }
  const target = input.snapshotSummary.nodeSummaries.find((node) => node.nodeId === targetNodeId);
  if (!target) {
    return [];
  }
  const nodeStatusById = new Map(
    input.snapshotSummary.nodeSummaries.map((node) => [node.nodeId, node.nodeStatus]),
  );
  const dependencyRefs: Array<{ dependencyId: string; edgeKind: string }> = [];
  for (const edge of input.snapshotSummary.edgeSummaries ?? []) {
    if (
      edge.toNodeId === targetNodeId &&
      ["depends_on", "handoff", "closeout_source"].includes(edge.edgeKind) &&
      edge.fromNodeId
    ) {
      dependencyRefs.push({ dependencyId: edge.fromNodeId, edgeKind: edge.edgeKind });
    }
  }
  for (const handoffRef of target.inputHandoffRefs ?? []) {
    if (nodeStatusById.has(handoffRef)) {
      dependencyRefs.push({ dependencyId: handoffRef, edgeKind: "input_handoff" });
    }
  }
  const reasonCodes: string[] = [];
  for (const { dependencyId, edgeKind } of dependencyRefs) {
    const status = nodeStatusById.get(dependencyId);
    if (
      status &&
      !dependencyStatusSatisfiesTarget({
        targetNodeKind: target.nodeKind,
        edgeKind,
        dependencyStatus: status,
      })
    ) {
      reasonCodes.push(
        `selected_node_dependency_not_satisfied:${targetNodeId}:${dependencyId}:${status}`,
      );
    }
  }
  return reasonCodes;
}

function dependencyStatusSatisfiesTarget(input: {
  targetNodeKind: string;
  edgeKind: string;
  dependencyStatus: string;
}): boolean {
  if (input.dependencyStatus === "succeeded") {
    return true;
  }
  if (
    input.targetNodeKind === "reviewer" &&
    (input.edgeKind === "review_depends_on" || input.edgeKind === "input_handoff") &&
    (input.dependencyStatus === "needs_review" || input.dependencyStatus === "failed")
  ) {
    return true;
  }
  return false;
}

const RUNTIME_BLOCKING_EDGE_KINDS = new Set<string>([
  "depends_on",
  "handoff",
  "context_supplies",
  "synthesis_groups",
  "implementation_depends_on",
  "validation_depends_on",
  "review_depends_on",
  "closeout_depends_on",
  "human_decision_blocks",
  "proof_depends_on",
  "validation_failed",
  "repair_requested",
  "escalation",
  "human_wait",
  "human_resume",
  "continuation",
  "closeout_source",
]);

function nodeSchedulingTargetRefs(node: TeamGraphNode): string[] {
  const metadata = jsonRecord(node.metadata);
  return uniqueStrings([
    ...jsonStringArray(metadata.targetRefs),
    ...jsonStringArray(metadata.repoScopeRefs),
    ...jsonStringArray(metadata.validationCommandRefs),
  ]).slice(0, 16);
}

export type RuntimeWorkGraphDependencyLayer = {
  layerIndex: number;
  nodeIds: string[];
};

export type RuntimeWorkGraphParallelFrontierReadback = {
  artifactKind: "runtime_work_graph_parallel_frontier_readback";
  schemaVersion: "execution-platform.runtime-work-graph.parallel-frontier.v1";
  currentSuperstep: number;
  maxParallelNodeExecutions: number;
  dependencyLayers: RuntimeWorkGraphDependencyLayer[];
  dependencyLayerCount: number;
  readyNodeIds: string[];
  rawRunnableNodeIds: string[];
  selectedNodeIds: string[];
  runningNodeIds: string[];
  completedNodeIds: string[];
  blockedNodeIds: string[];
  failedNodeIds: string[];
  needsReviewNodeIds: string[];
  waitingForHumanNodeIds: string[];
  skippedReasonCodes: string[];
  conflictDomains: Array<{
    nodeId: string;
    keys: string[];
  }>;
  providerConcurrencyBudgets: Array<{
    key: string;
    limit: number;
    runnableNodeIds: string[];
    selectedNodeIds: string[];
    skippedNodeIds: string[];
  }>;
  joinReadyNodeIds: string[];
  contextSynthesisRefs: string[];
  implementationGroupCount: number | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

function nodeMetadataStringArray(node: TeamGraphNode, keys: string[]): string[] {
  const metadata = jsonRecord(node.metadata);
  return uniqueStrings(keys.flatMap((key) => jsonStringArray(metadata[key]))).slice(0, 24);
}

function metadataPositiveInteger(value: JsonValue | unknown | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function nodeProviderConcurrencyBudget(node: TeamGraphNode): {
  key: string;
  limit: number;
} | null {
  const metadata = jsonRecord(node.metadata);
  const explicitKey =
    typeof metadata.providerConcurrencyKey === "string" && metadata.providerConcurrencyKey.trim()
      ? metadata.providerConcurrencyKey.trim()
      : typeof metadata.providerConcurrencyClass === "string" &&
          metadata.providerConcurrencyClass.trim()
        ? `class:${metadata.providerConcurrencyClass.trim()}`
        : typeof metadata.selectedProviderCapabilityProfileId === "string" &&
            metadata.selectedProviderCapabilityProfileId.trim()
          ? `profile:${metadata.selectedProviderCapabilityProfileId.trim()}`
          : typeof metadata.modelRef === "string" && metadata.modelRef.trim()
            ? `model:${metadata.modelRef.trim()}`
            : typeof node.modelOrWorkerRef === "string" && node.modelOrWorkerRef.trim()
              ? `worker:${node.modelOrWorkerRef.trim()}`
              : null;
  const explicitLimit =
    metadataPositiveInteger(metadata.providerConcurrencyLimit) ??
    metadataPositiveInteger(metadata.maxProviderParallelism) ??
    metadataPositiveInteger(metadata.maxConcurrentProviderCalls);
  if (!explicitKey || !explicitLimit) {
    return null;
  }
  return {
    key: `provider:${explicitKey}`,
    limit: Math.min(explicitLimit, 32),
  };
}

function nodeExecutionConflictKeys(node: TeamGraphNode): string[] {
  const metadata = jsonRecord(node.metadata);
  const explicit = jsonStringArray(metadata.executionConflictKeys);
  if (explicit.length > 0) {
    return explicit.map((key) => `explicit:${key}`).slice(0, 16);
  }
  const keys: string[] = [];
  const writeScopeRefs = nodeMetadataStringArray(node, [
    "writeScopeRefs",
    "changedFileRefs",
    "targetFileRefs",
  ]);
  if (writeScopeRefs.length > 0) {
    keys.push(...writeScopeRefs.map((ref) => `write:${ref}`));
  }
  const targetRefs = nodeSchedulingTargetRefs(node);
  if (
    targetRefs.length > 0 &&
    ["implementation", "repair", "docs_update"].includes(node.nodeKind)
  ) {
    keys.push(...targetRefs.map((ref) => `write:${ref}`));
  }
  const validationRefs = nodeMetadataStringArray(node, [
    "validationCommandRefs",
    "validationScopeRefs",
  ]);
  keys.push(...validationRefs.map((ref) => `validation:${ref}`));
  keys.push(
    ...nodeMetadataStringArray(node, ["runtimeJobRefs"]).map((ref) => `runtime-job:${ref}`),
  );
  keys.push(...nodeMetadataStringArray(node, ["workQueueRefs"]).map((ref) => `work-queue:${ref}`));
  keys.push(
    ...nodeMetadataStringArray(node, ["humanDecisionRefs"]).map((ref) => `human-decision:${ref}`),
  );
  keys.push(
    ...nodeMetadataStringArray(node, ["noParallelWithRefs"]).map((ref) => `no-parallel:${ref}`),
  );
  if (keys.length > 0) {
    return uniqueStrings(keys).slice(0, 24);
  }
  if (["implementation", "repair", "docs_update"].includes(node.nodeKind)) {
    return [`${node.nodeKind}:unknown-target`];
  }
  return [];
}

function nodeHasExecutableAdapter(input: {
  node: TeamGraphNode;
  executors: Record<string, RuntimeWorkGraphNodeExecutor>;
}): boolean {
  return executorKeyForNode(input.node).some((key) => Boolean(input.executors[key]));
}

function nodeBlockingDependencyIds(input: {
  snapshot: RuntimeWorkGraphSnapshot;
  nodeId: string;
}): string[] {
  return uniqueStrings(
    nodeBlockingDependencies(input).map((dependency) => dependency.dependencyId),
  );
}

function nodeBlockingDependencies(input: {
  snapshot: RuntimeWorkGraphSnapshot;
  nodeId: string;
}): Array<{ dependencyId: string; edgeKind: string }> {
  const seen = new Set<string>();
  const dependencies: Array<{ dependencyId: string; edgeKind: string }> = [];
  for (const edge of input.snapshot.edges) {
    if (
      edge.toNodeId !== input.nodeId ||
      !edge.fromNodeId ||
      !RUNTIME_BLOCKING_EDGE_KINDS.has(edge.edgeKind)
    ) {
      continue;
    }
    const key = `${edge.fromNodeId}:${edge.edgeKind}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    dependencies.push({ dependencyId: edge.fromNodeId, edgeKind: edge.edgeKind });
  }
  return dependencies;
}

function dependencyLayersForSnapshot(
  snapshot: RuntimeWorkGraphSnapshot,
): RuntimeWorkGraphDependencyLayer[] {
  const nodesById = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));
  const blockingDependenciesByNodeId = new Map<string, string[]>();
  for (const node of snapshot.nodes) {
    blockingDependenciesByNodeId.set(
      node.nodeId,
      nodeBlockingDependencyIds({ snapshot, nodeId: node.nodeId }).filter((dependencyId) =>
        nodesById.has(dependencyId),
      ),
    );
  }
  const layerByNodeId = new Map<string, number>();
  let changed = true;
  for (let pass = 0; pass < snapshot.nodes.length && changed; pass += 1) {
    changed = false;
    for (const node of snapshot.nodes) {
      if (layerByNodeId.has(node.nodeId)) {
        continue;
      }
      const dependencies = blockingDependenciesByNodeId.get(node.nodeId) ?? [];
      if (dependencies.every((dependencyId) => layerByNodeId.has(dependencyId))) {
        const dependencyLayer =
          dependencies.length > 0
            ? Math.max(
                ...dependencies.map((dependencyId) => layerByNodeId.get(dependencyId) ?? 0),
              ) + 1
            : 0;
        layerByNodeId.set(node.nodeId, dependencyLayer);
        changed = true;
      }
    }
  }
  for (const node of snapshot.nodes) {
    if (!layerByNodeId.has(node.nodeId)) {
      layerByNodeId.set(node.nodeId, Number.MAX_SAFE_INTEGER);
    }
  }
  const layers = new Map<number, string[]>();
  for (const node of snapshot.nodes) {
    const layerIndex = layerByNodeId.get(node.nodeId) ?? Number.MAX_SAFE_INTEGER;
    const normalizedLayer =
      layerIndex === Number.MAX_SAFE_INTEGER ? snapshot.nodes.length : layerIndex;
    layers.set(normalizedLayer, [...(layers.get(normalizedLayer) ?? []), node.nodeId]);
  }
  return [...layers.entries()]
    .toSorted(([left], [right]) => left - right)
    .map(([layerIndex, nodeIds]) => ({
      layerIndex,
      nodeIds: nodeIds.slice(0, 40),
    }));
}

function implementationGroupCountFromSnapshot(snapshot: RuntimeWorkGraphSnapshot): number | null {
  for (const node of snapshot.nodes) {
    if (node.nodeKind !== "context_synthesis" && node.assignedRole !== "context_synthesis") {
      continue;
    }
    const metadata = jsonRecord(node.metadata);
    const contextSynthesis = jsonRecord(
      metadata.contextSynthesisGraphCompile ?? metadata.contextSynthesis,
    );
    const implementationGroups = Array.isArray(contextSynthesis.implementationGroups)
      ? contextSynthesis.implementationGroups
      : Array.isArray(metadata.implementationGroups)
        ? metadata.implementationGroups
        : null;
    if (implementationGroups) {
      return implementationGroups.length;
    }
  }
  return null;
}

function buildParallelFrontierReadback(input: {
  snapshot: RuntimeWorkGraphSnapshot;
  currentSuperstep: number;
  maxParallelNodeExecutions: number;
  selectedNodes: TeamGraphNode[];
  skippedReasonCodes: string[];
  rawRunnableNodeIds: string[];
  providerConcurrencyBudgets?: Array<{
    key: string;
    limit: number;
    runnableNodeIds: string[];
    selectedNodeIds: string[];
    skippedNodeIds: string[];
  }>;
}): RuntimeWorkGraphParallelFrontierReadback {
  const dependencyLayers = dependencyLayersForSnapshot(input.snapshot);
  const statusNodeIds = (status: TeamGraphNode["nodeStatus"]): string[] =>
    input.snapshot.nodes
      .filter((node) => node.nodeStatus === status)
      .map((node) => node.nodeId)
      .slice(0, 40);
  const statusByNodeId = new Map(
    input.snapshot.nodes.map((node) => [node.nodeId, node.nodeStatus]),
  );
  const joinReadyNodeIds = input.snapshot.nodes
    .filter((node) => {
      if (node.nodeStatus !== "planned") {
        return false;
      }
      const dependencies = nodeBlockingDependencies({
        snapshot: input.snapshot,
        nodeId: node.nodeId,
      });
      return (
        dependencies.length > 1 &&
        dependencies.every((dependency) => {
          const status = statusByNodeId.get(dependency.dependencyId);
          return status
            ? dependencyStatusSatisfiesTarget({
                targetNodeKind: node.nodeKind,
                edgeKind: dependency.edgeKind,
                dependencyStatus: status,
              })
            : false;
        })
      );
    })
    .map((node) => node.nodeId)
    .slice(0, 30);
  return {
    artifactKind: "runtime_work_graph_parallel_frontier_readback",
    schemaVersion: "execution-platform.runtime-work-graph.parallel-frontier.v1",
    currentSuperstep: input.currentSuperstep,
    maxParallelNodeExecutions: input.maxParallelNodeExecutions,
    dependencyLayers,
    dependencyLayerCount: dependencyLayers.length,
    readyNodeIds: input.rawRunnableNodeIds.slice(0, 40),
    rawRunnableNodeIds: input.rawRunnableNodeIds.slice(0, 40),
    selectedNodeIds: input.selectedNodes.map((node) => node.nodeId).slice(0, 40),
    runningNodeIds: statusNodeIds("running"),
    completedNodeIds: statusNodeIds("succeeded"),
    blockedNodeIds: statusNodeIds("failed"),
    failedNodeIds: statusNodeIds("failed"),
    needsReviewNodeIds: statusNodeIds("needs_review"),
    waitingForHumanNodeIds: statusNodeIds("waiting_for_human"),
    skippedReasonCodes: input.skippedReasonCodes.slice(0, 60),
    conflictDomains: input.rawRunnableNodeIds
      .map((nodeId) => input.snapshot.nodes.find((node) => node.nodeId === nodeId))
      .filter((node): node is TeamGraphNode => Boolean(node))
      .map((node) => ({ nodeId: node.nodeId, keys: nodeExecutionConflictKeys(node).slice(0, 12) }))
      .slice(0, 40),
    providerConcurrencyBudgets: (input.providerConcurrencyBudgets ?? [])
      .slice(0, 20)
      .map((budget) => ({
        key: budget.key,
        limit: budget.limit,
        runnableNodeIds: budget.runnableNodeIds.slice(0, 40),
        selectedNodeIds: budget.selectedNodeIds.slice(0, 40),
        skippedNodeIds: budget.skippedNodeIds.slice(0, 40),
      })),
    joinReadyNodeIds,
    contextSynthesisRefs: input.snapshot.nodes
      .filter((node) => node.nodeKind === "context_synthesis" && node.nodeStatus === "succeeded")
      .flatMap((node) => node.outputArtifactRefs)
      .slice(0, 12),
    implementationGroupCount: implementationGroupCountFromSnapshot(input.snapshot),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function selectRunnableParallelFrontier(input: {
  snapshot: RuntimeWorkGraphSnapshot;
  executors: Record<string, RuntimeWorkGraphNodeExecutor>;
  maxParallelNodeExecutions: number;
}): {
  selectedNodes: TeamGraphNode[];
  skippedReasonCodes: string[];
  rawRunnableNodeIds: string[];
  readback: RuntimeWorkGraphParallelFrontierReadback;
} {
  const statusByNodeId = new Map(
    input.snapshot.nodes.map((node) => [node.nodeId, node.nodeStatus]),
  );
  const candidates = input.snapshot.nodes.filter((node) => {
    if (node.nodeStatus !== "planned") {
      return false;
    }
    if (!nodeHasExecutableAdapter({ node, executors: input.executors })) {
      return false;
    }
    const dependencies = nodeBlockingDependencies({
      snapshot: input.snapshot,
      nodeId: node.nodeId,
    });
    return dependencies.every((dependency) => {
      const status = statusByNodeId.get(dependency.dependencyId);
      return status
        ? dependencyStatusSatisfiesTarget({
            targetNodeKind: node.nodeKind,
            edgeKind: dependency.edgeKind,
            dependencyStatus: status,
          })
        : false;
    });
  });
  const selectedNodes: TeamGraphNode[] = [];
  const conflictKeys = new Set<string>();
  const providerBudgetCounts = new Map<string, number>();
  const providerBudgetLimitByKey = new Map<string, number>();
  const providerBudgetRunnableIdsByKey = new Map<string, string[]>();
  const providerBudgetSelectedIdsByKey = new Map<string, string[]>();
  const providerBudgetSkippedIdsByKey = new Map<string, string[]>();
  const skippedReasonCodes: string[] = [];
  for (const node of candidates) {
    const providerBudget = nodeProviderConcurrencyBudget(node);
    if (providerBudget) {
      providerBudgetLimitByKey.set(
        providerBudget.key,
        Math.min(
          providerBudgetLimitByKey.get(providerBudget.key) ?? providerBudget.limit,
          providerBudget.limit,
        ),
      );
      providerBudgetRunnableIdsByKey.set(providerBudget.key, [
        ...(providerBudgetRunnableIdsByKey.get(providerBudget.key) ?? []),
        node.nodeId,
      ]);
    }
    if (selectedNodes.length >= input.maxParallelNodeExecutions) {
      skippedReasonCodes.push(`parallel_frontier_max_reached:${node.nodeId}`);
      continue;
    }
    const nodeConflictKeys = nodeExecutionConflictKeys(node);
    const conflict = nodeConflictKeys.find((key) => conflictKeys.has(key));
    if (conflict) {
      skippedReasonCodes.push(`parallel_frontier_conflict:${node.nodeId}:${conflict}`);
      continue;
    }
    if (providerBudget) {
      const used = providerBudgetCounts.get(providerBudget.key) ?? 0;
      const limit = providerBudgetLimitByKey.get(providerBudget.key) ?? providerBudget.limit;
      if (used >= limit) {
        skippedReasonCodes.push(
          `parallel_frontier_provider_budget_exhausted:${node.nodeId}:${providerBudget.key}:${limit}`,
        );
        providerBudgetSkippedIdsByKey.set(providerBudget.key, [
          ...(providerBudgetSkippedIdsByKey.get(providerBudget.key) ?? []),
          node.nodeId,
        ]);
        continue;
      }
      providerBudgetCounts.set(providerBudget.key, used + 1);
      providerBudgetSelectedIdsByKey.set(providerBudget.key, [
        ...(providerBudgetSelectedIdsByKey.get(providerBudget.key) ?? []),
        node.nodeId,
      ]);
    }
    selectedNodes.push(node);
    for (const key of nodeConflictKeys) {
      conflictKeys.add(key);
    }
  }
  const providerConcurrencyBudgets = [...providerBudgetLimitByKey.entries()].map(
    ([key, limit]) => ({
      key,
      limit,
      runnableNodeIds: providerBudgetRunnableIdsByKey.get(key) ?? [],
      selectedNodeIds: providerBudgetSelectedIdsByKey.get(key) ?? [],
      skippedNodeIds: providerBudgetSkippedIdsByKey.get(key) ?? [],
    }),
  );
  return {
    selectedNodes,
    skippedReasonCodes,
    rawRunnableNodeIds: candidates.map((node) => node.nodeId),
    readback: buildParallelFrontierReadback({
      snapshot: input.snapshot,
      currentSuperstep:
        input.snapshot.nodes.filter((node) => node.nodeStatus === "succeeded").length + 1,
      maxParallelNodeExecutions: input.maxParallelNodeExecutions,
      selectedNodes,
      skippedReasonCodes,
      rawRunnableNodeIds: candidates.map((node) => node.nodeId),
      providerConcurrencyBudgets,
    }),
  };
}

function mergeCommitment(base: MissionCommitment, update: MissionCommitment): MissionCommitment {
  const refsChanged =
    update.acceptedEvidenceRefs.some((ref) => !base.acceptedEvidenceRefs.includes(ref)) ||
    update.rejectedEvidenceRefs.some((ref) => !base.rejectedEvidenceRefs.includes(ref));
  const meaningfulChange =
    update.status !== base.status ||
    refsChanged ||
    update.remainingWork.join("\n") !== base.remainingWork.join("\n") ||
    update.rationale !== base.rationale;
  if (!meaningfulChange) {
    return base;
  }
  return {
    ...base,
    status: update.status,
    acceptedEvidenceRefs: uniqueStrings([
      ...base.acceptedEvidenceRefs,
      ...update.acceptedEvidenceRefs,
    ]).slice(0, 20),
    rejectedEvidenceRefs: uniqueStrings([
      ...base.rejectedEvidenceRefs,
      ...update.rejectedEvidenceRefs,
    ]).slice(0, 20),
    rationale: update.rationale ?? base.rationale,
    remainingWork: update.remainingWork,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function mergeParallelMissionLedgers(input: {
  base: MissionContractLedger | null;
  updates: Array<MissionContractLedger | null | undefined>;
}): MissionContractLedger | null {
  if (!input.base) {
    return input.updates.find((ledger): ledger is MissionContractLedger => Boolean(ledger)) ?? null;
  }
  let merged = input.base;
  for (const update of input.updates) {
    if (!update) {
      continue;
    }
    const blockingById = new Map(
      update.blockingCommitments.map((commitment) => [commitment.commitmentId, commitment]),
    );
    const nonBlockingById = new Map(
      update.nonBlockingCommitments.map((commitment) => [commitment.commitmentId, commitment]),
    );
    merged = recomputeMissionLedgerStatus({
      ...merged,
      blockingCommitments: merged.blockingCommitments.map((commitment) => {
        const updateCommitment = blockingById.get(commitment.commitmentId);
        return updateCommitment ? mergeCommitment(commitment, updateCommitment) : commitment;
      }),
      nonBlockingCommitments: merged.nonBlockingCommitments.map((commitment) => {
        const updateCommitment = nonBlockingById.get(commitment.commitmentId);
        return updateCommitment ? mergeCommitment(commitment, updateCommitment) : commitment;
      }),
      revisionProposals: [...merged.revisionProposals, ...update.revisionProposals].slice(0, 12),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    });
  }
  return merged;
}

function runtimeOwnedEdgeId(input: {
  graphId: string;
  edgeId?: string | null;
  fromNodeId?: string | null;
  toNodeId?: string | null;
  edgeKind: string;
  index: number;
}): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        graphId: input.graphId,
        modelEdgeId: input.edgeId ?? null,
        fromNodeId: input.fromNodeId ?? null,
        toNodeId: input.toNodeId ?? null,
        edgeKind: input.edgeKind,
        // Edge identity is structural. Do not include loop index: retries and
        // reordered compiler output must reuse the same runtime edge instead of
        // duplicating graph dependencies.
      }),
    )
    .digest("hex")
    .slice(0, 24);
  return `edge-${digest}`;
}

function jsonRecord(value: JsonValue): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

function boundedResultMetadataSummary(value: JsonValue): JsonValue {
  const metadata = jsonRecord(value);
  const summary: Record<string, JsonValue> = {
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
  for (const key of [
    "contextSynthesisGraphCompile",
    "contextSynthesis",
    "implementationReadiness",
    "implementationGroups",
    "dependencyMap",
    "parallelismPlan",
    "knownRisks",
    "limitations",
    "boundedAdapterDiagnostics",
    "validationSummary",
    "reviewSummary",
    "closeoutSummary",
    "ownerSummary",
  ]) {
    const candidate = metadata[key];
    if (candidate !== undefined) {
      summary[key] = candidate;
    }
  }
  return summary;
}

function compactNodeResultMetadataForRuntimeToolTrace(value: JsonValue | undefined): JsonValue {
  const metadata = jsonRecord(value ?? null);
  const encoded = JSON.stringify(metadata);
  if (Buffer.byteLength(encoded, "utf8") <= 8_000) {
    return {
      ...metadata,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    } satisfies JsonValue;
  }
  const contextSynthesis = jsonRecord(
    metadata.contextSynthesisGraphCompile ?? metadata.contextSynthesis ?? null,
  );
  const schedulerHandoff = jsonRecord(contextSynthesis.schedulerHandoff ?? null);
  const implementationGroups = Array.isArray(contextSynthesis.implementationGroups)
    ? contextSynthesis.implementationGroups
    : [];
  const dependencyMap = Array.isArray(contextSynthesis.dependencyMap)
    ? contextSynthesis.dependencyMap
    : [];
  return {
    metadataCompactedForRuntimeToolTrace: true,
    metadataOriginalByteLength: Buffer.byteLength(encoded, "utf8"),
    ownerSummary:
      typeof metadata.ownerSummary === "string"
        ? boundedRuntimeWorkGraphString(metadata.ownerSummary, 240)
        : null,
    contextSynthesisRef:
      typeof contextSynthesis.synthesisRef === "string" ? contextSynthesis.synthesisRef : null,
    contextSynthesisHash:
      typeof contextSynthesis.synthesisHash === "string" ? contextSynthesis.synthesisHash : null,
    contextSynthesisStatus:
      typeof metadata.contextSynthesisStatus === "string"
        ? metadata.contextSynthesisStatus
        : typeof contextSynthesis.implementationReadiness === "string"
          ? contextSynthesis.implementationReadiness
          : null,
    contextSynthesisImplementationGroupCount:
      typeof contextSynthesis.implementationGroupCount === "number"
        ? contextSynthesis.implementationGroupCount
        : implementationGroups.length,
    contextSynthesisDependencyCount:
      typeof contextSynthesis.dependencyCount === "number"
        ? contextSynthesis.dependencyCount
        : dependencyMap.length,
    contextSynthesisReadyForGraphCompile:
      typeof schedulerHandoff.readyForGraphCompile === "boolean"
        ? schedulerHandoff.readyForGraphCompile
        : null,
    contextSynthesisCoreModelRef:
      typeof metadata.contextSynthesisCoreModelRef === "string"
        ? metadata.contextSynthesisCoreModelRef
        : null,
    contextSynthesisExpansionModelRef:
      typeof metadata.contextSynthesisExpansionModelRef === "string"
        ? metadata.contextSynthesisExpansionModelRef
        : null,
    contextSynthesisCoreResponseHash:
      typeof metadata.contextSynthesisCoreResponseHash === "string"
        ? metadata.contextSynthesisCoreResponseHash
        : null,
    contextSynthesisExpansionResponseHash:
      typeof metadata.contextSynthesisExpansionResponseHash === "string"
        ? metadata.contextSynthesisExpansionResponseHash
        : null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}

function summarizeRecentNodeResult(input: {
  node: TeamGraphNode;
  result: RuntimeWorkGraphNodeExecutionResult;
}): RuntimeWorkGraphRecentNodeResultSummary {
  return {
    nodeId: input.node.nodeId,
    nodeKind: input.node.nodeKind,
    assignedRole: input.node.assignedRole,
    status: input.result.status,
    outputArtifactRefs: input.result.outputArtifactRefs.slice(0, 16),
    ownerSummary: input.result.ownerSummary ?? null,
    eli5Summary: input.result.eli5Summary ?? null,
    reasonCodes: input.result.reasonCodes.slice(0, 24),
    metadataSummary: boundedResultMetadataSummary(input.result.metadata ?? null),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : "";
  const constraint = typeof record.constraint === "string" ? record.constraint : "";
  const message = typeof record.message === "string" ? record.message : "";
  if (
    code === "23505" ||
    constraint.includes("runtime_work_graph_nodes_pkey") ||
    message.includes("duplicate key value violates unique constraint")
  ) {
    return true;
  }
  if ("cause" in record) {
    return isUniqueConstraintError(record.cause);
  }
  return false;
}

async function withSchedulerOperationTimeout<T>(input: {
  operation: Promise<T>;
  timeoutMs: number;
  reasonCode: string;
}): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      input.operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(input.reasonCode)),
          Math.max(1, input.timeoutMs),
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function schedulerToolPhase(toolId: SchedulerRuntimeToolId, metadata?: JsonValue): string {
  const metadataRecord = jsonRecord(metadata ?? null);
  if (typeof metadataRecord.schedulerPhase === "string" && metadataRecord.schedulerPhase) {
    return metadataRecord.schedulerPhase;
  }
  if (
    toolId === "scheduler.mission_ledger_readiness" ||
    toolId === "scheduler.commitment_work_packet_readiness" ||
    toolId === "scheduler.context_synthesis.create" ||
    toolId === "scheduler.context_synthesis.review" ||
    toolId === "scheduler.draft_work_breakdown" ||
    toolId === "scheduler.review_work_breakdown" ||
    toolId === "scheduler.draft_commitment_work_breakdown" ||
    toolId === "scheduler.propose_decomposition_outline" ||
    toolId === "scheduler.map_commitments_to_work_units" ||
    toolId === "scheduler.shortlist_capabilities_for_work_units" ||
    toolId === "scheduler.select_capability_for_work_unit" ||
    toolId === "scheduler.select_capabilities_for_work_units" ||
    toolId === "scheduler.select_capabilities" ||
    toolId === "scheduler.shortlist_capabilities" ||
    toolId === "scheduler.define_node_contract" ||
    toolId === "scheduler.define_node_contracts" ||
    toolId === "scheduler.define_edges_or_parallelism" ||
    toolId === "scheduler.compile_staged_runtime_graph" ||
    toolId === "scheduler.compile_runtime_graph" ||
    toolId === "scheduler.review_compiled_graph" ||
    toolId === "scheduler.create_graph_node" ||
    toolId === "scheduler.create_graph_edge"
  ) {
    return "planning_in_progress";
  }
  if (
    toolId === "scheduler.accept_staged_graph" ||
    toolId === "scheduler.context_synthesis.accept" ||
    toolId === "scheduler.approve_and_run_first_node"
  ) {
    return "decomposition_accepted";
  }
  if (
    toolId === "scheduler.reject_staged_graph" ||
    toolId === "scheduler.context_synthesis.reject"
  ) {
    return "decomposition_repair_needed";
  }
  if (toolId === "scheduler.review_node_result") {
    return "node_result_review";
  }
  if (toolId === "scheduler.classify_repair_or_escalation") {
    return "repair_or_escalation";
  }
  if (toolId === "scheduler.evaluate_closeout_readiness") {
    return "closeout_readiness";
  }
  if (toolId === "scheduler.evaluate_completion_readiness") {
    return "completion_review_readiness";
  }
  if (toolId === "scheduler.create_closeout_request") {
    return "finalization_pending";
  }
  if (
    toolId === "source_prompt.index" ||
    toolId === "source_prompt.request_excerpt" ||
    toolId === "source_prompt.provide_excerpt" ||
    toolId === "source_prompt.deny_excerpt"
  ) {
    return "source_prompt_context_in_progress";
  }
  return "execution_in_progress";
}

function jsonStringArray(value: JsonValue | unknown | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function jsonContextSnapshotArray(value: JsonValue | unknown | undefined): ContextSnapshotRef[] {
  return normalizeContextSnapshotRefs(value);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

function runtimeDerivedEvidenceForNode(input: {
  node: OrchestratorGraphNodeSpec;
  missionLedger: MissionContractLedger | null;
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): string[] {
  const capability = input.node.capabilityId
    ? findRuntimeNodeCapability(input.node.capabilityId, input.capabilityManifest)
    : null;
  const targetCommitments = new Set(input.node.commitmentIdsAdvanced ?? []);
  return uniqueStrings([
    ...(capability?.evidenceProducedKinds ?? []),
    ...((input.missionLedger?.blockingCommitments ?? [])
      .filter(
        (commitment) =>
          targetCommitments.size === 0 || targetCommitments.has(commitment.commitmentId),
      )
      .map((commitment) => commitment.expectedEvidenceDescription)
      .filter((value): value is string => Boolean(value))
      .map((value) => value.slice(0, 240)) ?? []),
  ]).slice(0, 32);
}

function attachRuntimeDerivedEvidenceToDecision(input: {
  decision: OrchestratorGraphDecision;
  missionLedger: MissionContractLedger | null;
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): OrchestratorGraphDecision {
  if (!input.decision.newNodes?.length) {
    return input.decision;
  }
  return {
    ...input.decision,
    newNodes: input.decision.newNodes.map((node) => {
      const metadata = jsonRecord(node.metadata ?? null);
      const expectedEvidence = runtimeDerivedEvidenceForNode({
        node,
        missionLedger: input.missionLedger,
        capabilityManifest: input.capabilityManifest,
      });
      return {
        ...node,
        metadata: {
          ...metadata,
          expectedEvidence,
          expectedEvidenceSource: "runtime_derived_from_capability_manifest_and_mission_ledger",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        } satisfies JsonValue,
      };
    }),
  };
}

function utilityDecisionForSchedulerDecision(input: {
  decision: OrchestratorGraphDecision;
  explicitDecision: CostAwareCapabilityUtilityDecision | null;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): CostAwareCapabilityUtilityDecision | null {
  const explicit = input.explicitDecision;
  const targetNodeId = input.decision.runNodeId ?? input.decision.targetNodeId ?? null;
  const targetNode = targetNodeId
    ? input.snapshotSummary.nodeSummaries.find((node) => node.nodeId === targetNodeId)
    : null;
  const selectedCapabilityId =
    explicit?.selectedCapabilityId ||
    targetNode?.capabilityId ||
    targetNode?.metadataCapabilityId ||
    "";
  if (!selectedCapabilityId) {
    return explicit;
  }
  const capability = findRuntimeNodeCapability(selectedCapabilityId, input.capabilityManifest);
  const selectedModelQualificationProfileId =
    explicit?.selectedModelQualificationProfileId ??
    (capability?.productionSelectionRequiresQualification
      ? capability.canEditSource
        ? (capability.modelQualificationProfileIds.find((profileId) =>
            profileId.includes("kimi-k2.6"),
          ) ??
          capability.modelQualificationProfileIds[0] ??
          null)
        : (capability.modelQualificationProfileIds[0] ?? null)
      : null);
  const qualificationEvidenceRefs =
    explicit?.qualificationEvidenceRefs && explicit.qualificationEvidenceRefs.length > 0
      ? explicit.qualificationEvidenceRefs
      : capability?.productionSelectionRequiresQualification && selectedModelQualificationProfileId
        ? [`model-profile://${selectedModelQualificationProfileId}/runtime-capability`]
        : [];
  return {
    decisionId: explicit?.decisionId || `${input.decision.decisionId}:utility`,
    consideredCapabilityIds:
      explicit && explicit.consideredCapabilityIds.length > 0
        ? explicit.consideredCapabilityIds
        : [selectedCapabilityId],
    selectedCapabilityId,
    selectedProviderCapabilityProfileId: explicit?.selectedProviderCapabilityProfileId ?? null,
    selectedNodeKind:
      explicit?.selectedNodeKind || capability?.graphNodeKind || targetNode?.nodeKind || "",
    selectedExecutorKey:
      explicit?.selectedExecutorKey || targetNode?.executorKey || capability?.executorKey || "",
    targetCommitmentIds:
      explicit && explicit.targetCommitmentIds.length > 0
        ? explicit.targetCommitmentIds
        : input.decision.commitmentIdsAdvanced?.length
          ? input.decision.commitmentIdsAdvanced
          : (targetNode?.commitmentIdsAdvanced ?? []),
    utilityRationale:
      explicit?.utilityRationale ||
      input.decision.rationaleForDecision ||
      `Run accepted graph node ${targetNodeId ?? selectedCapabilityId}.`,
    costRationale:
      explicit?.costRationale ||
      `Runtime selected the already-accepted graph node ${targetNodeId ?? selectedCapabilityId}; capability cost was validated during graph compilation.`,
    whyCheaperOptionsWereInsufficient:
      explicit?.whyCheaperOptionsWereInsufficient ??
      (capability && capability.costClass !== "cheap"
        ? "Cheaper capability alternatives are not being re-selected during node execution; the accepted graph node and its capability policy control this run."
        : null),
    whyThisIsNotDuplicateWork:
      explicit?.whyThisIsNotDuplicateWork ||
      `This decision runs existing graph node ${targetNodeId ?? "unknown"}; duplicate control is based on graph node status and prior scheduler progress.`,
    expectedEvidence:
      explicit?.expectedEvidence && explicit.expectedEvidence.length > 0
        ? explicit.expectedEvidence
        : (capability?.evidenceProducedKinds ?? []),
    selectedModelQualificationProfileId,
    qualificationEvidenceRefs,
    expectedDownstreamConsumer:
      explicit?.expectedDownstreamConsumer || targetNode?.downstreamConsumer || "orchestrator",
    budgetRef: explicit?.budgetRef ?? null,
    stopOrEscalationCondition:
      explicit?.stopOrEscalationCondition ||
      `Return to orchestrator if ${targetNodeId ?? "the selected node"} cannot satisfy its acceptance criteria or produce bounded evidence.`,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function nodeLoopSignature(node: TeamGraphNode): string {
  const metadata = jsonRecord(node.metadata);
  const targetRefs = jsonStringArray(metadata.targetRefs).slice(0, 8).toSorted();
  const capabilityId =
    typeof metadata.capabilityId === "string"
      ? metadata.capabilityId
      : typeof metadata.nodeCapabilityId === "string"
        ? metadata.nodeCapabilityId
        : typeof metadata.selectedCapabilityId === "string"
          ? metadata.selectedCapabilityId
          : null;
  return [
    node.nodeKind,
    node.assignedRole,
    capabilityId ?? "capability:unknown",
    targetRefs.join("|") || "targets:unknown",
  ].join("::");
}

function missionLedgerProgressed(
  before: MissionContractLedger | null,
  after: MissionContractLedger | null,
): boolean {
  if (!before && !after) {
    return false;
  }
  if (!before || !after) {
    return true;
  }
  const beforeSummary = summarizeMissionContractLedger(before);
  const afterSummary = summarizeMissionContractLedger(after);
  return (
    beforeSummary.ledgerStatus !== afterSummary.ledgerStatus ||
    beforeSummary.openBlockingCommitmentCount !== afterSummary.openBlockingCommitmentCount ||
    beforeSummary.commitments.filter((commitment) => commitment.status === "satisfied").length !==
      afterSummary.commitments.filter((commitment) => commitment.status === "satisfied").length
  );
}

function missionIsComplex(ledger: MissionContractLedger | null): boolean {
  if (!ledger) {
    return false;
  }
  const summary = summarizeMissionContractLedger(ledger);
  return summary.blockingCommitmentCount > 1 || summary.openBlockingCommitmentCount > 1;
}

function commitmentIdsForLedger(ledger: MissionContractLedger | null): Set<string> {
  return new Set(
    ledger
      ? [...ledger.blockingCommitments, ...ledger.nonBlockingCommitments].map(
          (commitment) => commitment.commitmentId,
        )
      : [],
  );
}

function remainingOpenCommitmentIds(ledger: MissionContractLedger | null): string[] {
  return ledger
    ? openBlockingMissionCommitments(ledger).map((commitment) => commitment.commitmentId)
    : [];
}

function nodeCapabilityId(node: TeamGraphNode | OrchestratorGraphNodeSpec): string | null {
  if ("capabilityId" in node && typeof node.capabilityId === "string") {
    return node.capabilityId;
  }
  const metadata = jsonRecord(node.metadata ?? {});
  return typeof metadata.capabilityId === "string" ? metadata.capabilityId : null;
}

function nodeRuntimeTaskBudgetPolicy(input: {
  node: TeamGraphNode;
  workflowId: string | null;
  capabilityManifest: RuntimeNodeCapabilityManifest;
  missionLedger: MissionContractLedger | null;
}): RuntimeTaskBudgetPolicy {
  const capabilityId = nodeCapabilityId(input.node);
  const capability = capabilityId
    ? findRuntimeNodeCapability(capabilityId, input.capabilityManifest)
    : null;
  const metadata = jsonRecord(input.node.metadata ?? {});
  const metadataBudget = jsonRecord(metadata.budgetPolicy);
  const policy = deriveRuntimeTaskBudgetPolicy({
    workflowId: input.workflowId,
    nodeKind: input.node.nodeKind,
    roleId: input.node.assignedRole,
    capability,
    missionCommitmentCount: input.missionLedger
      ? summarizeMissionContractLedger(input.missionLedger).blockingCommitmentCount
      : null,
    expectedLongRunning:
      metadataBudget.budgetClass === "long_running" ||
      metadata.expectedLongRunning === true ||
      input.workflowId === "agent_team.product_spec_planning",
  });
  const timeoutMs =
    typeof metadataBudget.timeoutMs === "number" && Number.isFinite(metadataBudget.timeoutMs)
      ? Math.max(policy.runtimeToolTimeoutMs, metadataBudget.timeoutMs)
      : policy.runtimeToolTimeoutMs;
  return {
    ...policy,
    policyRef:
      typeof metadataBudget.policyRef === "string" && metadataBudget.policyRef.length > 0
        ? metadataBudget.policyRef
        : policy.policyRef,
    runtimeToolTimeoutMs: timeoutMs,
    modelCallTimeoutMs: Math.max(policy.modelCallTimeoutMs, timeoutMs),
    maxOutputTokens:
      typeof metadataBudget.maxOutputTokens === "number" &&
      Number.isFinite(metadataBudget.maxOutputTokens)
        ? Math.max(policy.maxOutputTokens ?? 0, metadataBudget.maxOutputTokens)
        : policy.maxOutputTokens,
    maxCostUsd:
      typeof metadataBudget.maxCostUsd === "number" && Number.isFinite(metadataBudget.maxCostUsd)
        ? Math.max(policy.maxCostUsd ?? 0, metadataBudget.maxCostUsd)
        : policy.maxCostUsd,
    retryLimit:
      typeof metadataBudget.retryLimit === "number" && Number.isFinite(metadataBudget.retryLimit)
        ? Math.max(policy.retryLimit, metadataBudget.retryLimit)
        : policy.retryLimit,
    reasonCodes: [
      ...policy.reasonCodes,
      ...(capability ? ["runtime_task_budget_capability_policy_used"] : []),
      ...(Object.keys(metadataBudget).length > 0
        ? ["runtime_task_budget_node_metadata_bounds_merged"]
        : []),
    ],
  };
}

function runtimeScopedSchedulerNodeId(input: { graphId: string; nodeId: string }): string {
  const graphDigest = createHash("sha256").update(input.graphId, "utf8").digest("hex").slice(0, 10);
  const prefix = `g-${graphDigest}-`;
  if (input.nodeId.startsWith(prefix)) {
    return input.nodeId;
  }
  const suffixBudget = Math.max(12, 110 - prefix.length);
  return `${prefix}${input.nodeId}`.slice(0, prefix.length + suffixBudget);
}

function runtimeScopedStagedDecisionNodeIds(input: {
  graphId: string;
  decision: OrchestratorGraphDecision;
}): OrchestratorGraphDecision {
  const nodeIdMap = new Map<string, string>();
  const newNodes = (input.decision.newNodes ?? []).map((node) => {
    const metadata = jsonRecord(node.metadata ?? {});
    if (metadata.stagedSchedulerProtocolCompiled !== true) {
      return node;
    }
    const runtimeNodeId = runtimeScopedSchedulerNodeId({
      graphId: input.graphId,
      nodeId: node.nodeId,
    });
    nodeIdMap.set(node.nodeId, runtimeNodeId);
    return {
      ...node,
      nodeId: runtimeNodeId,
      metadata: {
        ...metadata,
        modelAuthoredNodeId: node.nodeId,
        modelAuthoredWorkUnitNodeId: node.nodeId,
        runtimeOwnedNodeId: true,
        runtimeNodeId,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } as JsonValue,
    };
  });
  if (nodeIdMap.size === 0) {
    return input.decision;
  }
  const mapNodeId = (nodeId: string | null | undefined): string | null | undefined =>
    nodeId ? (nodeIdMap.get(nodeId) ?? nodeId) : nodeId;
  const newEdges = (input.decision.newEdges ?? []).map((edge) => ({
    ...edge,
    fromNodeId: mapNodeId(edge.fromNodeId) ?? null,
    toNodeId: mapNodeId(edge.toNodeId) ?? null,
    metadata: {
      ...jsonRecord(edge.metadata ?? null),
      modelAuthoredFromNodeId: edge.fromNodeId ?? null,
      modelAuthoredToNodeId: edge.toNodeId ?? null,
      runtimeOwnedNodeEndpoints: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    } as JsonValue,
  }));
  const metadata = jsonRecord(input.decision.metadata ?? null);
  return {
    ...input.decision,
    targetNodeId: mapNodeId(input.decision.targetNodeId) ?? null,
    runNodeId: mapNodeId(input.decision.runNodeId) ?? null,
    newNodes,
    newEdges,
    metadata: {
      ...metadata,
      runtimeOwnedNodeIds: true,
      modelAuthoredToRuntimeNodeIdMap: Object.fromEntries(nodeIdMap.entries()),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    } as JsonValue,
    reasonCodes: [...input.decision.reasonCodes, "runtime_owned_graph_scoped_node_ids_applied"],
  };
}

function isBroadImplementationNode(node: TeamGraphNode | OrchestratorGraphNodeSpec): boolean {
  return node.nodeKind === "implementation" && nodeCapabilityId(node) === "implementation_complex";
}

function graphNodeSpecRoleClass(node: OrchestratorGraphNodeSpec): string {
  const metadata = jsonRecord(node.metadata ?? {});
  const joined = [
    node.nodeKind,
    node.assignedRole,
    node.capabilityId ?? "",
    typeof metadata.taskFamily === "string" ? metadata.taskFamily : "",
  ]
    .join(" ")
    .toLowerCase();
  if (joined.includes("context")) {
    return "context";
  }
  if (joined.includes("research")) {
    return "research";
  }
  if (joined.includes("planning") || joined.includes("orchestrator")) {
    return "planning";
  }
  if (joined.includes("implementation") || joined.includes("repair")) {
    return "implementation";
  }
  if (joined.includes("validation") || joined.includes("test") || joined.includes("qa")) {
    return "validation";
  }
  if (joined.includes("review")) {
    return "review";
  }
  return "other";
}

function isProgressiveContextAcquisitionFirstMove(nodes: OrchestratorGraphNodeSpec[]): boolean {
  if (nodes.length !== 1) {
    return false;
  }
  const [node] = nodes;
  if (!node) {
    return false;
  }
  return ["context", "research", "planning"].includes(graphNodeSpecRoleClass(node));
}

function schedulerDecisionCapabilityPhase(input: {
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  missionLedger: MissionContractLedger | null;
}): RuntimeNodeCapabilityPhase {
  if (input.snapshotSummary.nodeSummaries.length === 0) {
    return "decomposition";
  }
  if (
    missionIsComplex(input.missionLedger) &&
    contextSupplyExists(input.snapshotSummary) &&
    !acceptedContextSynthesisExists(input.snapshotSummary)
  ) {
    return "context_synthesis";
  }
  if (missionIsComplex(input.missionLedger)) {
    const contextSucceeded = input.snapshotSummary.nodeSummaries.some((node) => {
      const values = [node.nodeKind, node.assignedRole, node.capabilityId ?? ""]
        .join(" ")
        .toLowerCase();
      return values.includes("context") && node.nodeStatus === "succeeded";
    });
    const implementationStarted = input.snapshotSummary.nodeSummaries.some((node) => {
      const values = [node.nodeKind, node.assignedRole, node.capabilityId ?? ""]
        .join(" ")
        .toLowerCase();
      return (
        values.includes("implementation") &&
        ["running", "succeeded", "needs_review", "failed"].includes(node.nodeStatus)
      );
    });
    if (!contextSucceeded && !implementationStarted) {
      return "decomposition";
    }
    const synthesisAccepted = acceptedContextSynthesisExists(input.snapshotSummary);
    const downstreamExecutionGraphExists = input.snapshotSummary.nodeSummaries.some(
      (node) =>
        summaryNodeRequiresContextSynthesisInput(node) &&
        ["planned", "running", "succeeded", "needs_review", "failed"].includes(node.nodeStatus),
    );
    if (synthesisAccepted && !downstreamExecutionGraphExists) {
      return "capability_selection";
    }
  }
  return "execution";
}

function isProductSpecPlanningWorkflow(workflowId: string | null | undefined): boolean {
  return workflowId === "agent_team.product_spec_planning";
}

function isPlanningOrchestratorNode(node: {
  nodeId: string;
  nodeKind: string;
  assignedRole: string;
  capabilityId?: string | null;
  metadata?: JsonValue;
}): boolean {
  return (
    node.assignedRole === "planning_orchestrator" ||
    node.capabilityId === "planning_orchestrator" ||
    nodeCapabilityId(node as OrchestratorGraphNodeSpec) === "planning_orchestrator"
  );
}

function isContextSynthesisSummaryNode(node: {
  nodeKind: string;
  assignedRole: string;
  capabilityId?: string | null;
  nodeStatus?: string;
}): boolean {
  return (
    node.nodeKind === "context_synthesis" ||
    node.assignedRole === "context_synthesis" ||
    node.capabilityId === "context_synthesis"
  );
}

type ContextSynthesisLifecycleState =
  | "none"
  | "planned"
  | "running"
  | "accepted"
  | "repair_required"
  | "storage_bound_failure";

type ContextSynthesisLifecycle = {
  state: ContextSynthesisLifecycleState;
  nodeId: string | null;
  synthesisRef: string | null;
  reasonCodes: string[];
};

function contextSynthesisLifecycle(
  summary: RuntimeWorkGraphSchedulerSnapshotSummary,
): ContextSynthesisLifecycle {
  const nodes = summary.nodeSummaries.filter(isContextSynthesisSummaryNode);
  const accepted = nodes.find(
    (node) =>
      node.nodeStatus === "succeeded" ||
      node.contextSynthesisAccepted === true ||
      node.contextSynthesisStatus === "accepted" ||
      (node.lastStatusReasonCodes ?? []).includes("context_synthesis_accepted"),
  );
  if (accepted) {
    return {
      state: "accepted",
      nodeId: accepted.nodeId,
      synthesisRef: accepted.contextSynthesisRef ?? accepted.outputArtifactRefs[0] ?? null,
      reasonCodes: ["context_synthesis_lifecycle_accepted"],
    };
  }
  const running = nodes.find((node) => node.nodeStatus === "running");
  if (running) {
    return {
      state: "running",
      nodeId: running.nodeId,
      synthesisRef: running.contextSynthesisRef ?? running.outputArtifactRefs[0] ?? null,
      reasonCodes: ["context_synthesis_lifecycle_running"],
    };
  }
  const storageBound = nodes.find(
    (node) =>
      node.nodeStatus === "needs_review" &&
      (node.lastRepairFailureClass === "artifact_storage_bound_exceeded" ||
        (node.lastStatusReasonCodes ?? []).some((code) =>
          /artifact[_-](metadata|size).*limit|metadata exceeds \d+ bytes/iu.test(code),
        )),
  );
  if (storageBound) {
    return {
      state: "storage_bound_failure",
      nodeId: storageBound.nodeId,
      synthesisRef: storageBound.contextSynthesisRef ?? storageBound.outputArtifactRefs[0] ?? null,
      reasonCodes: ["context_synthesis_lifecycle_storage_bound_failure"],
    };
  }
  const repair = nodes.find(
    (node) =>
      node.nodeStatus === "needs_review" &&
      ((node.outputArtifactRefs ?? []).length > 0 ||
        (node.lastStatusReasonCodes ?? []).some((code) => code.startsWith("context_synthesis_"))),
  );
  if (repair) {
    return {
      state: "repair_required",
      nodeId: repair.nodeId,
      synthesisRef: repair.contextSynthesisRef ?? repair.outputArtifactRefs[0] ?? null,
      reasonCodes: ["context_synthesis_lifecycle_repair_required"],
    };
  }
  const planned = nodes.find((node) => node.nodeStatus === "planned");
  if (planned) {
    return {
      state: "planned",
      nodeId: planned.nodeId,
      synthesisRef: planned.contextSynthesisRef ?? planned.outputArtifactRefs[0] ?? null,
      reasonCodes: ["context_synthesis_lifecycle_planned"],
    };
  }
  return {
    state: "none",
    nodeId: null,
    synthesisRef: null,
    reasonCodes: ["context_synthesis_lifecycle_none"],
  };
}

function acceptedContextSynthesisExists(
  summary: RuntimeWorkGraphSchedulerSnapshotSummary,
): boolean {
  return contextSynthesisLifecycle(summary).state === "accepted";
}

export function activeOrAcceptedContextSynthesisExists(
  summary: RuntimeWorkGraphSchedulerSnapshotSummary,
): boolean {
  return ["running", "accepted"].includes(contextSynthesisLifecycle(summary).state);
}

export function contextSynthesisStorageBoundFailureExists(
  summary: RuntimeWorkGraphSchedulerSnapshotSummary,
): boolean {
  return summary.nodeSummaries.some(
    (node) =>
      isContextSynthesisSummaryNode(node) &&
      node.nodeStatus === "needs_review" &&
      (node.lastRepairFailureClass === "artifact_storage_bound_exceeded" ||
        (node.lastStatusReasonCodes ?? []).some((code) =>
          /artifact[_-](metadata|size).*limit|metadata exceeds \d+ bytes/iu.test(code),
        )),
  );
}

function contextSynthesisNodes(
  summary: RuntimeWorkGraphSchedulerSnapshotSummary,
): RuntimeWorkGraphSchedulerSnapshotSummary["nodeSummaries"] {
  return summary.nodeSummaries.filter(isContextSynthesisSummaryNode);
}

function plannedContextSynthesisNode(
  summary: RuntimeWorkGraphSchedulerSnapshotSummary,
): RuntimeWorkGraphSchedulerSnapshotSummary["nodeSummaries"][number] | null {
  const lifecycle = contextSynthesisLifecycle(summary);
  if (lifecycle.state === "repair_required" || lifecycle.state === "storage_bound_failure") {
    return null;
  }
  return contextSynthesisNodes(summary).find((node) => node.nodeStatus === "planned") ?? null;
}

function contextSupplyExists(summary: RuntimeWorkGraphSchedulerSnapshotSummary): boolean {
  return summary.nodeSummaries.some(
    (node) =>
      ["context_scout", "web_research"].includes(node.nodeKind) &&
      node.nodeStatus === "succeeded" &&
      node.outputArtifactRefs.length > 0,
  );
}

function nodeMayRunBeforeContextSynthesis(node: {
  nodeKind: string;
  assignedRole: string;
  capabilityId?: string | null;
}): boolean {
  return (
    isContextSynthesisSummaryNode(node) ||
    ["context_scout", "web_research", "human_task", "orchestrator_plan"].includes(node.nodeKind)
  );
}

function nodeRequiresContextSynthesisInput(node: OrchestratorGraphNodeSpec): boolean {
  return [
    "implementation",
    "validation",
    "test_review",
    "test_authoring",
    "repair",
    "reviewer",
    "security_review",
    "docs_update",
    "architecture_spec",
    "planning_capsule",
    "action_graph_compile",
    "observability_readback",
    "compiler",
    "closeout",
  ].includes(node.nodeKind);
}

function summaryNodeRequiresContextSynthesisInput(node: {
  nodeKind: string;
  assignedRole: string;
  capabilityId?: string | null;
}): boolean {
  return [
    "implementation",
    "validation",
    "test_review",
    "test_authoring",
    "repair",
    "reviewer",
    "security_review",
    "docs_update",
    "architecture_spec",
    "planning_capsule",
    "action_graph_compile",
    "observability_readback",
    "compiler",
    "closeout",
  ].includes(node.nodeKind);
}

function nodeRequiresFreshContextSnapshot(node: TeamGraphNode): boolean {
  if (
    !summaryNodeRequiresContextSynthesisInput({
      nodeKind: node.nodeKind,
      assignedRole: node.assignedRole,
      capabilityId: nodeCapabilityId(node),
    })
  ) {
    return false;
  }
  const metadata = jsonRecord(node.metadata);
  return !(
    typeof metadata.noContextNeededRationale === "string" &&
    metadata.noContextNeededRationale.trim().length > 0
  );
}

function validateNodeContextSnapshots(
  node: TeamGraphNode,
): ReturnType<typeof validateContextSnapshotFreshness> {
  const metadata = jsonRecord(node.metadata);
  return validateContextSnapshotFreshness({
    requiredRefs: jsonContextSnapshotArray(metadata.requiredContextSnapshotRefs),
    providedRefs: jsonContextSnapshotArray(metadata.providedContextSnapshotRefs),
  });
}

function nodeHasNoContextNeededRationale(node: OrchestratorGraphNodeSpec): boolean {
  const metadata = jsonRecord(node.metadata ?? {});
  return (
    typeof metadata.noContextNeededRationale === "string" &&
    metadata.noContextNeededRationale.trim().length > 0
  );
}

function contextSynthesisPolicyReasonCodes(input: {
  decision: OrchestratorGraphDecision;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  missionLedger: MissionContractLedger | null;
}): string[] {
  if (!missionIsComplex(input.missionLedger) || !contextSupplyExists(input.snapshotSummary)) {
    return [];
  }
  const reasonCodes: string[] = [];
  const synthesisAccepted = acceptedContextSynthesisExists(input.snapshotSummary);
  if (!synthesisAccepted) {
    const proposedNodes = input.decision.newNodes ?? [];
    const blockedProposed = proposedNodes.filter((node) => !nodeMayRunBeforeContextSynthesis(node));
    for (const node of blockedProposed) {
      reasonCodes.push(`context_synthesis_required_before_node:${node.nodeId}:${node.nodeKind}`);
    }
    const targetNodeId = input.decision.runNodeId ?? input.decision.targetNodeId ?? null;
    const targetNode = input.snapshotSummary.nodeSummaries.find(
      (node) => node.nodeId === targetNodeId,
    );
    if (targetNode && !nodeMayRunBeforeContextSynthesis(targetNode)) {
      reasonCodes.push(`context_synthesis_required_before_run_node:${targetNode.nodeId}`);
    }
    if (
      [
        "create_closeout",
        "request_validation",
        "request_review",
        "repair_from_validation",
      ].includes(input.decision.decisionKind)
    ) {
      reasonCodes.push(`context_synthesis_required_before_${input.decision.decisionKind}`);
    }
  }
  if (synthesisAccepted) {
    for (const node of input.decision.newNodes ?? []) {
      if (
        nodeRequiresContextSynthesisInput(node) &&
        (node.inputHandoffRefs ?? []).length === 0 &&
        !nodeHasNoContextNeededRationale(node)
      ) {
        reasonCodes.push(`context_synthesis_input_handoff_required:${node.nodeId}`);
      }
    }
    const targetNodeId = input.decision.runNodeId ?? input.decision.targetNodeId ?? null;
    const targetNode = input.snapshotSummary.nodeSummaries.find(
      (node) => node.nodeId === targetNodeId,
    );
    if (
      targetNode &&
      summaryNodeRequiresContextSynthesisInput(targetNode) &&
      (targetNode.inputHandoffRefs ?? []).length === 0 &&
      !(targetNode.noContextNeededRationale ?? "").trim()
    ) {
      reasonCodes.push(`context_synthesis_input_handoff_required:${targetNode.nodeId}`);
    }
  }
  return [...new Set(reasonCodes)];
}

function contextSupplyNodes(
  summary: RuntimeWorkGraphSchedulerSnapshotSummary,
): RuntimeWorkGraphSchedulerSnapshotSummary["nodeSummaries"] {
  return summary.nodeSummaries.filter(
    (node) =>
      ["context_scout", "web_research"].includes(node.nodeKind) &&
      node.nodeStatus === "succeeded" &&
      node.outputArtifactRefs.length > 0,
  );
}

function contextSupplyNodeIsDedicatedToPacket(input: {
  node: RuntimeWorkGraphSchedulerSnapshotSummary["nodeSummaries"][number];
  packet: CommitmentWorkPacket;
}): boolean {
  return (
    ["context_scout", "web_research"].includes(input.node.nodeKind) &&
    (input.node.inputHandoffRefs ?? []).includes(input.packet.packetRef) &&
    (input.node.commitmentIdsAdvanced ?? []).includes(input.packet.commitmentId) &&
    (input.node.commitmentIdsAdvanced ?? []).length <= 1
  );
}

function packetContextSupplyCoverage(input: {
  summary: RuntimeWorkGraphSchedulerSnapshotSummary;
  commitmentWorkPackets: CommitmentWorkPacket[];
}): {
  required: boolean;
  allDedicatedSupplyAccepted: boolean;
  missingNodePackets: CommitmentWorkPacket[];
  pendingPacketCount: number;
  acceptedPacketCount: number;
  reasonCodes: string[];
} {
  if (input.commitmentWorkPackets.length <= 1) {
    return {
      required: false,
      allDedicatedSupplyAccepted: true,
      missingNodePackets: [],
      pendingPacketCount: 0,
      acceptedPacketCount: 0,
      reasonCodes: ["packet_context_supply_fanout_not_required"],
    };
  }
  const reasonCodes: string[] = [];
  const missingNodePackets: CommitmentWorkPacket[] = [];
  let pendingPacketCount = 0;
  let acceptedPacketCount = 0;
  for (const packet of input.commitmentWorkPackets) {
    const matchingNodes = input.summary.nodeSummaries.filter((node) =>
      contextSupplyNodeIsDedicatedToPacket({ node, packet }),
    );
    if (matchingNodes.length === 0) {
      missingNodePackets.push(packet);
      reasonCodes.push(`packet_context_supply_node_missing:${packet.commitmentId}`);
      continue;
    }
    if (
      matchingNodes.some(
        (node) => node.nodeStatus === "succeeded" && node.outputArtifactRefs.length > 0,
      )
    ) {
      acceptedPacketCount += 1;
      continue;
    }
    pendingPacketCount += 1;
    reasonCodes.push(`packet_context_supply_node_not_accepted:${packet.commitmentId}`);
  }
  return {
    required: true,
    allDedicatedSupplyAccepted:
      acceptedPacketCount === input.commitmentWorkPackets.length && reasonCodes.length === 0,
    missingNodePackets,
    pendingPacketCount,
    acceptedPacketCount,
    reasonCodes,
  };
}

function packetContextScoutNodeId(packet: CommitmentWorkPacket, index: number): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({ packetRef: packet.packetRef, commitmentId: packet.commitmentId }))
    .digest("hex")
    .slice(0, 8);
  const slug = packet.commitmentId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .slice(0, 72);
  return `context_scout-${slug || `packet-${index + 1}`}-${digest}`;
}

function deterministicPacketContextScoutFanoutDecision(input: {
  graphId: string;
  iteration: number;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  missionLedger: MissionContractLedger | null;
  commitmentWorkPackets: CommitmentWorkPacket[];
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): OrchestratorGraphDecision | null {
  if (!missionIsComplex(input.missionLedger) || input.commitmentWorkPackets.length <= 1) {
    return null;
  }
  const coverage = packetContextSupplyCoverage({
    summary: input.snapshotSummary,
    commitmentWorkPackets: input.commitmentWorkPackets,
  });
  if (coverage.missingNodePackets.length === 0) {
    return null;
  }
  const capability = findRuntimeNodeCapability("context_scout", input.capabilityManifest);
  if (!capability) {
    return null;
  }
  const synthesisCapability = findRuntimeNodeCapability(
    "context_synthesis",
    input.capabilityManifest,
  );
  const commitmentIds = [
    ...(input.missionLedger?.blockingCommitments ?? []),
    ...(input.missionLedger?.nonBlockingCommitments ?? []),
  ].map((commitment) => commitment.commitmentId);
  const newNodes: OrchestratorGraphNodeSpec[] = coverage.missingNodePackets.map((packet, index) => {
    const nodeId = packetContextScoutNodeId(packet, index);
    const costAwareUtilityDecision: CostAwareCapabilityUtilityDecision = {
      decisionId: `runtime-packet-context-scout-${input.iteration}-${index + 1}`,
      consideredCapabilityIds: ["context_scout"],
      selectedCapabilityId: capability.capabilityId,
      selectedNodeKind: capability.graphNodeKind,
      selectedExecutorKey: capability.executorKey,
      targetCommitmentIds: [packet.commitmentId],
      utilityRationale:
        "Dedicated per-packet context scout is required before synthesis so downstream workers receive commitment-specific repo context instead of a broad generic handoff.",
      costRationale:
        "Context scout is the cheapest sufficient capability for locating repo context before implementation or validation work.",
      whyCheaperOptionsWereInsufficient: null,
      whyThisIsNotDuplicateWork:
        "No accepted dedicated context supply node exists for this CommitmentWorkPacket.",
      expectedEvidence: capability.evidenceProducedKinds,
      expectedDownstreamConsumer: "context_synthesis",
      budgetRef: `runtime-task-budget://scheduler/context-scout/${packet.commitmentId}`,
      stopOrEscalationCondition:
        "Return needs_review if the context scout cannot verify relevant repo files or produce a bounded handoff for this packet.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
    const expectedEvidence = runtimeDerivedEvidenceForNode({
      node: {
        nodeId,
        nodeKind: capability.graphNodeKind,
        capabilityId: capability.capabilityId,
        assignedRole: capability.roleId,
        executorKey: capability.executorKey,
        workerRef: capability.workerRef,
        requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
        modelOrWorkerRef: capability.workerRef,
        inputHandoffRefs: [packet.packetRef],
        expectedOutput: packet.expectedContextScoutOutput.join(" "),
        acceptanceCriteria: packet.expectedContextScoutOutput,
        downstreamConsumer: "context_synthesis",
        commitmentIdsAdvanced: [packet.commitmentId],
        whyThisRoleIsNeededNow:
          "Context synthesis requires a dedicated accepted context handoff for this commitment packet before implementation graph planning.",
        exactObjective: packet.contextScoutObjective,
        evidenceExpectation:
          "Bounded context handoff packet with verified file refs, edit points, risks, validation suggestions, and implementation handoff summary.",
        targetRefs: packet.likelyRepoAreas,
        metadata: null,
      },
      missionLedger: input.missionLedger,
      capabilityManifest: input.capabilityManifest,
    });
    return {
      nodeId,
      nodeKind: capability.graphNodeKind,
      capabilityId: capability.capabilityId,
      executorKey: capability.executorKey,
      workerRef: capability.workerRef,
      requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
      assignedRole: capability.roleId,
      modelOrWorkerRef: capability.workerRef,
      inputHandoffRefs: [packet.packetRef],
      expectedOutput: packet.expectedContextScoutOutput.join(" "),
      acceptanceCriteria: packet.expectedContextScoutOutput,
      downstreamConsumer: "context_synthesis",
      commitmentIdsAdvanced: [packet.commitmentId],
      whyThisRoleIsNeededNow:
        "Context synthesis requires a dedicated accepted context handoff for this commitment packet before implementation graph planning.",
      exactObjective: packet.contextScoutObjective,
      evidenceExpectation:
        "Bounded context handoff packet with verified file refs, edit points, risks, validation suggestions, and implementation handoff summary.",
      targetRefs: packet.likelyRepoAreas,
      metadata: {
        capabilityId: capability.capabilityId,
        graphNodeKind: capability.graphNodeKind,
        executorKey: capability.executorKey,
        workerRef: capability.workerRef,
        requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
        stagedSchedulerProtocolCompiled: true,
        runtimeOwnedPacketContextFanout: true,
        packetRef: packet.packetRef,
        expectedEvidence,
        expectedEvidenceSource: "runtime_derived_from_capability_manifest_and_mission_ledger",
        utilityDecision: costAwareUtilityDecision,
        costAwareUtilityDecision,
        consideredCapabilityIds: costAwareUtilityDecision.consideredCapabilityIds,
        utilityRationale: costAwareUtilityDecision.utilityRationale,
        costRationale: costAwareUtilityDecision.costRationale,
        whyThisIsNotDuplicateWork: costAwareUtilityDecision.whyThisIsNotDuplicateWork,
        stopOrEscalationCondition: costAwareUtilityDecision.stopOrEscalationCondition,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } satisfies JsonValue,
    };
  });
  const contextSynthesisNodeId = "context_synthesis_global_barrier";
  const synthesisAlreadyPlanned = input.snapshotSummary.nodeSummaries.some(
    (node) => node.nodeId === contextSynthesisNodeId || isContextSynthesisSummaryNode(node),
  );
  const synthesisCostAwareUtilityDecision: CostAwareCapabilityUtilityDecision | null =
    synthesisCapability && !synthesisAlreadyPlanned
      ? {
          decisionId: `runtime-context-synthesis-utility-${input.iteration}`,
          consideredCapabilityIds: ["context_synthesis"],
          selectedCapabilityId: synthesisCapability.capabilityId,
          selectedNodeKind: synthesisCapability.graphNodeKind,
          selectedExecutorKey: synthesisCapability.executorKey,
          targetCommitmentIds: commitmentIds,
          utilityRationale:
            "A single global context synthesis node joins accepted per-packet context handoffs into one dependency-aware implementation map before downstream work runs.",
          costRationale:
            "The synthesis barrier is runtime-required for complex missions so the scheduler can avoid repeated broad premium implementation decisions and preserve worker-ready handoffs.",
          whyCheaperOptionsWereInsufficient:
            synthesisCapability.costClass === "premium"
              ? "Cheaper implementation, validation, review, or scout capabilities cannot replace the cross-commitment synthesis barrier because they either execute downstream work or gather additional context rather than integrating accepted handoffs."
              : null,
          whyThisIsNotDuplicateWork:
            "No context synthesis barrier exists in the current graph, so this records the intended join point up front.",
          expectedEvidence: synthesisCapability.evidenceProducedKinds,
          expectedDownstreamConsumer: "scheduler_dependency_aware_implementation_graph",
          budgetRef: "runtime-task-budget://scheduler/context-synthesis-global-barrier",
          stopOrEscalationCondition:
            "Remain blocked until every dedicated context scout produces an accepted bounded handoff; then run synthesis or return needs_review with missing handoff details.",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        }
      : null;
  const synthesisExpectedEvidence =
    synthesisCapability && synthesisCostAwareUtilityDecision
      ? runtimeDerivedEvidenceForNode({
          node: {
            nodeId: contextSynthesisNodeId,
            nodeKind: synthesisCapability.graphNodeKind,
            capabilityId: synthesisCapability.capabilityId,
            assignedRole: synthesisCapability.roleId,
            executorKey: synthesisCapability.executorKey,
            workerRef: synthesisCapability.workerRef,
            requiredMetadataSchemaRef: synthesisCapability.requiredMetadataSchemaRef,
            modelOrWorkerRef: synthesisCapability.workerRef,
            inputHandoffRefs: input.commitmentWorkPackets
              .map((packet) => packet.packetRef)
              .slice(0, 80),
            expectedOutput:
              "One dependency-aware context synthesis artifact that covers all Mission Ledger commitments, groups implementation work, records dependencies/parallelism, and supplies downstream worker handoff refs.",
            acceptanceCriteria: [
              "Runs only after every dedicated per-packet context scout has produced an accepted bounded handoff.",
              "Covers every blocking Mission Ledger commitment or records an explicit bounded limitation.",
              "Produces worker-ready implementation groups with objectives, target refs, input handoff refs, success criteria, and downstream consumers.",
              "Preserves bounded refs only and does not store raw prompts, responses, provider logs, tool logs, secrets, or unbounded transcripts.",
            ],
            downstreamConsumer: "implementation_scheduler",
            commitmentIdsAdvanced: commitmentIds,
            whyThisRoleIsNeededNow:
              "The graph must expose the join point for parallel per-packet context scouts up front, while keeping synthesis blocked until accepted context handoffs exist.",
            exactObjective:
              "After all dedicated context scouts succeed, synthesize their handoffs and the commitment work packets into a worker-ready implementation, validation, review, and readback map.",
            evidenceExpectation:
              "Bounded context synthesis artifact with implementation readiness, commitment coverage, implementation groups, dependencies, risks, limitations, and evidence claim expectations.",
            targetRefs: [],
            metadata: null,
          },
          missionLedger: input.missionLedger,
          capabilityManifest: input.capabilityManifest,
        })
      : [];
  const synthesisNode: OrchestratorGraphNodeSpec | null =
    synthesisCapability && synthesisCostAwareUtilityDecision
      ? {
          nodeId: contextSynthesisNodeId,
          nodeKind: synthesisCapability.graphNodeKind,
          capabilityId: synthesisCapability.capabilityId,
          executorKey: synthesisCapability.executorKey,
          workerRef: synthesisCapability.workerRef,
          requiredMetadataSchemaRef: synthesisCapability.requiredMetadataSchemaRef,
          assignedRole: synthesisCapability.roleId,
          modelOrWorkerRef: synthesisCapability.workerRef,
          inputHandoffRefs: input.commitmentWorkPackets
            .map((packet) => packet.packetRef)
            .slice(0, 80),
          expectedOutput:
            "One dependency-aware context synthesis artifact that covers all Mission Ledger commitments, groups implementation work, records dependencies/parallelism, and supplies downstream worker handoff refs.",
          acceptanceCriteria: [
            "Runs only after every dedicated per-packet context scout has produced an accepted bounded handoff.",
            "Covers every blocking Mission Ledger commitment or records an explicit bounded limitation.",
            "Produces worker-ready implementation groups with objectives, target refs, input handoff refs, success criteria, and downstream consumers.",
            "Preserves bounded refs only and does not store raw prompts, responses, provider logs, tool logs, secrets, or unbounded transcripts.",
          ],
          downstreamConsumer: "implementation_scheduler",
          commitmentIdsAdvanced: commitmentIds,
          whyThisRoleIsNeededNow:
            "The graph must expose the join point for parallel per-packet context scouts up front, while keeping synthesis blocked until accepted context handoffs exist.",
          exactObjective:
            "After all dedicated context scouts succeed, synthesize their handoffs and the commitment work packets into a worker-ready implementation, validation, review, and readback map.",
          evidenceExpectation:
            "Bounded context synthesis artifact with implementation readiness, commitment coverage, implementation groups, dependencies, risks, limitations, and evidence claim expectations.",
          targetRefs: [],
          metadata: {
            capabilityId: synthesisCapability.capabilityId,
            graphNodeKind: synthesisCapability.graphNodeKind,
            executorKey: synthesisCapability.executorKey,
            workerRef: synthesisCapability.workerRef,
            requiredMetadataSchemaRef: synthesisCapability.requiredMetadataSchemaRef,
            stagedSchedulerProtocolCompiled: true,
            runtimeOwnedContextSynthesisBarrier: true,
            runtimeOwnedContextSynthesisBarrierPlannedUpfront: true,
            contextSupplyNodeIds: newNodes.map((node) => node.nodeId).slice(0, 80),
            expectedEvidence: synthesisExpectedEvidence,
            expectedEvidenceSource: "runtime_derived_from_capability_manifest_and_mission_ledger",
            utilityDecision: synthesisCostAwareUtilityDecision,
            costAwareUtilityDecision: synthesisCostAwareUtilityDecision,
            consideredCapabilityIds: synthesisCostAwareUtilityDecision.consideredCapabilityIds,
            utilityRationale: synthesisCostAwareUtilityDecision.utilityRationale,
            costRationale: synthesisCostAwareUtilityDecision.costRationale,
            whyCheaperOptionsWereInsufficient:
              synthesisCostAwareUtilityDecision.whyCheaperOptionsWereInsufficient ?? null,
            whyThisIsNotDuplicateWork: synthesisCostAwareUtilityDecision.whyThisIsNotDuplicateWork,
            stopOrEscalationCondition: synthesisCostAwareUtilityDecision.stopOrEscalationCondition,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } satisfies JsonValue,
        }
      : null;
  const newEdges =
    synthesisNode === null
      ? []
      : newNodes.map((node, index) => ({
          edgeId: `context-supplies-${index + 1}-${node.nodeId}`.slice(0, 96),
          fromNodeId: node.nodeId,
          toNodeId: synthesisNode.nodeId,
          edgeKind: "context_supplies" as const,
          reasonCodes: ["runtime_policy_context_supply_to_global_synthesis"],
          artifactRefs: [],
          metadata: {
            runtimeOwnedContextSynthesisBarrierEdge: true,
            runtimeOwnedContextSynthesisBarrierPlannedUpfront: true,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } satisfies JsonValue,
        }));
  const graphNodes = synthesisNode ? [...newNodes, synthesisNode] : newNodes;
  return {
    decisionId: `runtime-packet-context-fanout-${input.iteration}`,
    decisionKind: "add_nodes",
    rationaleForDecision:
      "Runtime policy created one dedicated context scout per accepted CommitmentWorkPacket plus the blocked global context synthesis join node.",
    newNodes: graphNodes,
    newEdges,
    runAfterAdd: false,
    commitmentIdsAdvanced: uniqueStrings(
      graphNodes.flatMap((node) => node.commitmentIdsAdvanced ?? []),
    ),
    reasonCodes: [
      "runtime_policy_packet_context_fanout_created",
      `runtime_policy_packet_context_fanout_node_count:${newNodes.length}`,
      ...(synthesisNode
        ? [
            "runtime_policy_context_synthesis_barrier_created",
            "runtime_policy_context_synthesis_barrier_planned_upfront",
            `runtime_policy_context_supply_edge_count:${newEdges.length}`,
          ]
        : []),
    ],
    metadata: {
      stagedSchedulerProtocolCompiled: true,
      runtimeOwnedPacketContextFanout: true,
      runtimeOwnedContextSynthesisBarrierPlannedUpfront: synthesisNode !== null,
      parallelIndependentNodesJustification:
        "Each context scout is scoped to one accepted CommitmentWorkPacket and can run independently; each scout has a blocking context_supplies edge into the global synthesis barrier.",
      packetCount: input.commitmentWorkPackets.length,
      missingPacketCount: coverage.missingNodePackets.length,
      synthesisNodeId: synthesisNode?.nodeId ?? null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    } satisfies JsonValue,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

function deterministicContextSynthesisDecision(input: {
  graphId: string;
  iteration: number;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  missionLedger: MissionContractLedger | null;
  commitmentWorkPackets: CommitmentWorkPacket[];
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): OrchestratorGraphDecision | null {
  const lifecycle = contextSynthesisLifecycle(input.snapshotSummary);
  if (
    !missionIsComplex(input.missionLedger) ||
    !contextSupplyExists(input.snapshotSummary) ||
    ["running", "accepted"].includes(lifecycle.state) ||
    lifecycle.state === "storage_bound_failure"
  ) {
    return null;
  }
  if (lifecycle.state === "repair_required") {
    return {
      decisionId: `runtime-context-synthesis-repair-required-${input.iteration}-${lifecycle.nodeId ?? "unknown"}`,
      decisionKind: "mark_needs_review",
      targetNodeId: lifecycle.nodeId ?? undefined,
      rationaleForDecision:
        "Context synthesis already produced a bounded artifact that needs boundary repair; rerunning the full synthesis model path is disabled because repair must happen at the artifact/compiler boundary.",
      reasonCodes: [
        ...lifecycle.reasonCodes,
        "context_synthesis_artifact_repair_required_not_rerun",
        ...(lifecycle.synthesisRef ? [`context_synthesis_ref:${lifecycle.synthesisRef}`] : []),
      ],
      metadata: {
        contextSynthesisLifecycle: lifecycle as unknown as JsonValue,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } satisfies JsonValue,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
  }
  const plannedNode = plannedContextSynthesisNode(input.snapshotSummary);
  if (plannedNode) {
    const packetCoverage = packetContextSupplyCoverage({
      summary: input.snapshotSummary,
      commitmentWorkPackets: input.commitmentWorkPackets,
    });
    if (packetCoverage.required && !packetCoverage.allDedicatedSupplyAccepted) {
      return null;
    }
    return {
      decisionId: `runtime-context-synthesis-run-${input.iteration}-${plannedNode.nodeId}`,
      decisionKind: plannedNode.nodeStatus === "needs_review" ? "retry_node" : "run_node",
      targetNodeId: plannedNode.nodeId,
      runNodeId: plannedNode.nodeId,
      rationaleForDecision:
        "Runtime policy requires an accepted context synthesis barrier after parallel context supply and before downstream implementation, validation, review, or closeout.",
      reasonCodes: [
        "runtime_policy_context_synthesis_barrier_run",
        `runtime_policy_context_synthesis_target:${plannedNode.nodeId}`,
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
  }
  const capability = findRuntimeNodeCapability("context_synthesis", input.capabilityManifest);
  if (!capability) {
    return null;
  }
  const packetCoverage = packetContextSupplyCoverage({
    summary: input.snapshotSummary,
    commitmentWorkPackets: input.commitmentWorkPackets,
  });
  if (packetCoverage.required && !packetCoverage.allDedicatedSupplyAccepted) {
    return null;
  }
  const commitmentIds = [
    ...(input.missionLedger?.blockingCommitments ?? []),
    ...(input.missionLedger?.nonBlockingCommitments ?? []),
  ].map((commitment) => commitment.commitmentId);
  const supplyNodes = contextSupplyNodes(input.snapshotSummary);
  const contextHandoffRefs = uniqueStrings(
    supplyNodes.flatMap((node) => node.outputArtifactRefs).slice(0, 24),
  );
  const contextSynthesisNodeId = "context_synthesis_global_barrier";
  const costAwareUtilityDecision: CostAwareCapabilityUtilityDecision = {
    decisionId: `runtime-context-synthesis-utility-${input.iteration}`,
    consideredCapabilityIds: ["context_synthesis"],
    selectedCapabilityId: capability.capabilityId,
    selectedNodeKind: capability.graphNodeKind,
    selectedExecutorKey: capability.executorKey,
    targetCommitmentIds: commitmentIds,
    utilityRationale:
      "A single global context synthesis node turns accepted context handoffs into one dependency-aware implementation map before any downstream worker runs.",
    costRationale:
      "Context synthesis is a mandatory runtime barrier for complex missions after parallel context supply; running one synthesis node avoids repeated premium scheduler decisions and duplicated synthesis calls.",
    whyCheaperOptionsWereInsufficient:
      capability.costClass === "premium"
        ? "Cheaper implementation, validation, review, or scout capabilities cannot replace the cross-commitment synthesis barrier because they either execute downstream work or gather additional context rather than integrating accepted handoffs."
        : null,
    whyThisIsNotDuplicateWork:
      "No accepted context synthesis exists in the current graph, so this creates exactly one global barrier node.",
    expectedEvidence: capability.evidenceProducedKinds,
    expectedDownstreamConsumer: "scheduler_dependency_aware_implementation_graph",
    budgetRef: "runtime-task-budget://scheduler/context-synthesis-global-barrier",
    stopOrEscalationCondition:
      "Return to the orchestrator with needs_review if the synthesis cannot cover all blocking commitments or produce worker-ready implementation groups.",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
  const expectedEvidence = runtimeDerivedEvidenceForNode({
    node: {
      nodeId: contextSynthesisNodeId,
      nodeKind: capability.graphNodeKind,
      capabilityId: capability.capabilityId,
      assignedRole: capability.roleId,
      executorKey: capability.executorKey,
      workerRef: capability.workerRef,
      requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
      modelOrWorkerRef: capability.workerRef,
      inputHandoffRefs: contextHandoffRefs,
      expectedOutput:
        "One dependency-aware context synthesis artifact that covers all Mission Ledger commitments, groups implementation work, records dependencies/parallelism, and supplies downstream worker handoff refs.",
      acceptanceCriteria: [
        "Covers every blocking Mission Ledger commitment or records an explicit bounded limitation.",
        "Produces worker-ready implementation groups with objectives, target refs, input handoff refs, success criteria, and downstream consumers.",
        "Preserves bounded refs only and does not store raw prompts, responses, provider logs, tool logs, secrets, or unbounded transcripts.",
      ],
      downstreamConsumer: "implementation_scheduler",
      commitmentIdsAdvanced: commitmentIds,
      whyThisRoleIsNeededNow:
        "Accepted per-commitment context scouts need to be synthesized into a single dependency-aware implementation map before downstream execution can be selected safely.",
      exactObjective:
        "Synthesize all accepted context handoffs and commitment work packets into a single worker-ready implementation, validation, review, and readback map for the remaining Product/Spec Planning work.",
      evidenceExpectation:
        "Bounded context synthesis artifact with implementation readiness, commitment coverage, implementation groups, dependencies, risks, limitations, and evidence claim expectations.",
      targetRefs: [],
      metadata: null,
    },
    missionLedger: input.missionLedger,
    capabilityManifest: input.capabilityManifest,
  });
  const newNode: OrchestratorGraphNodeSpec = {
    nodeId: contextSynthesisNodeId,
    nodeKind: capability.graphNodeKind,
    capabilityId: capability.capabilityId,
    executorKey: capability.executorKey,
    workerRef: capability.workerRef,
    requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
    assignedRole: capability.roleId,
    modelOrWorkerRef: capability.workerRef,
    inputHandoffRefs: contextHandoffRefs,
    expectedOutput:
      "One dependency-aware context synthesis artifact that covers all Mission Ledger commitments, groups implementation work, records dependencies/parallelism, and supplies downstream worker handoff refs.",
    acceptanceCriteria: [
      "Covers every blocking Mission Ledger commitment or records an explicit bounded limitation.",
      "Produces worker-ready implementation groups with objectives, target refs, input handoff refs, success criteria, and downstream consumers.",
      "Preserves bounded refs only and does not store raw prompts, responses, provider logs, tool logs, secrets, or unbounded transcripts.",
    ],
    downstreamConsumer: "implementation_scheduler",
    commitmentIdsAdvanced: commitmentIds,
    whyThisRoleIsNeededNow:
      "Accepted per-commitment context scouts need to be synthesized into a single dependency-aware implementation map before downstream execution can be selected safely.",
    exactObjective:
      "Synthesize all accepted context handoffs and commitment work packets into a single worker-ready implementation, validation, review, and readback map for the remaining Product/Spec Planning work.",
    evidenceExpectation:
      "Bounded context synthesis artifact with implementation readiness, commitment coverage, implementation groups, dependencies, risks, limitations, and evidence claim expectations.",
    targetRefs: [],
    metadata: {
      capabilityId: capability.capabilityId,
      graphNodeKind: capability.graphNodeKind,
      executorKey: capability.executorKey,
      workerRef: capability.workerRef,
      requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
      stagedSchedulerProtocolCompiled: true,
      runtimeOwnedContextSynthesisBarrier: true,
      contextSupplyNodeIds: supplyNodes.map((node) => node.nodeId).slice(0, 40),
      expectedEvidence,
      expectedEvidenceSource: "runtime_derived_from_capability_manifest_and_mission_ledger",
      utilityDecision: costAwareUtilityDecision,
      costAwareUtilityDecision,
      consideredCapabilityIds: costAwareUtilityDecision.consideredCapabilityIds,
      utilityRationale: costAwareUtilityDecision.utilityRationale,
      costRationale: costAwareUtilityDecision.costRationale,
      whyCheaperOptionsWereInsufficient:
        costAwareUtilityDecision.whyCheaperOptionsWereInsufficient ?? null,
      whyThisIsNotDuplicateWork: costAwareUtilityDecision.whyThisIsNotDuplicateWork,
      stopOrEscalationCondition: costAwareUtilityDecision.stopOrEscalationCondition,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    } satisfies JsonValue,
  };
  const newEdges = supplyNodes.slice(0, 80).map((node, index) => ({
    edgeId: `context-supplies-${index + 1}-${node.nodeId}`.slice(0, 96),
    fromNodeId: node.nodeId,
    toNodeId: contextSynthesisNodeId,
    edgeKind: "context_supplies" as const,
    reasonCodes: ["runtime_policy_context_supply_to_global_synthesis"],
    artifactRefs: node.outputArtifactRefs.slice(0, 8),
    metadata: {
      runtimeOwnedContextSynthesisBarrierEdge: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    } satisfies JsonValue,
  }));
  return {
    decisionId: `runtime-context-synthesis-barrier-${input.iteration}`,
    decisionKind: "add_nodes",
    rationaleForDecision:
      "Runtime policy created one mandatory global context synthesis barrier after accepted parallel context supply and before downstream execution.",
    newNodes: [newNode],
    newEdges,
    runAfterAdd: true,
    runNodeId: contextSynthesisNodeId,
    targetNodeId: contextSynthesisNodeId,
    commitmentIdsAdvanced: commitmentIds,
    reasonCodes: [
      "runtime_policy_context_synthesis_barrier_created",
      "runtime_policy_context_synthesis_single_global_node",
      `runtime_policy_context_supply_node_count:${supplyNodes.length}`,
    ],
    metadata: {
      stagedSchedulerProtocolCompiled: true,
      runtimeOwnedContextSynthesisBarrier: true,
      parallelIndependentNodesJustification:
        "Context supply nodes already ran independently; the global context synthesis barrier depends on all accepted supply nodes before downstream execution.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    } satisfies JsonValue,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

function latestAcceptedContextSynthesisSummary(
  recentNodeResultSummaries: RuntimeWorkGraphRecentNodeResultSummary[],
): Record<string, JsonValue> | null {
  for (const result of [...recentNodeResultSummaries].toReversed()) {
    if (
      result.status !== "succeeded" ||
      result.nodeKind !== "context_synthesis" ||
      result.assignedRole !== "context_synthesis"
    ) {
      continue;
    }
    const metadata = jsonRecord(result.metadataSummary);
    const compileHandoff = jsonRecord(metadata.contextSynthesisGraphCompile);
    if (
      compileHandoff.artifactKind === "context_synthesis_graph_compile_handoff" &&
      Array.isArray(compileHandoff.implementationGroups) &&
      compileHandoff.implementationGroups.length > 0
    ) {
      return compileHandoff;
    }
    const synthesis = jsonRecord(metadata.contextSynthesis);
    if (
      synthesis.artifactKind === "context_synthesis" &&
      Array.isArray(synthesis.implementationGroups) &&
      synthesis.implementationGroups.length > 0
    ) {
      return synthesis;
    }
  }
  return null;
}

function postSynthesisDownstreamGraphExists(
  summary: RuntimeWorkGraphSchedulerSnapshotSummary,
): boolean {
  return summary.nodeSummaries.some(
    (node) =>
      summaryNodeRequiresContextSynthesisInput(node) &&
      ["planned", "running", "succeeded", "needs_review", "failed"].includes(node.nodeStatus),
  );
}

function slugForRuntimeNodeId(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 58);
  return slug || fallback;
}

function runtimeCompiledPostSynthesisNodeId(input: {
  prefix: string;
  groupId?: string | null;
  role: string;
  index: number;
}): string {
  const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 10);
  const groupSlug = slugForRuntimeNodeId(
    input.groupId ?? input.role,
    `${input.role}-${input.index + 1}`,
  );
  return `${input.prefix}-${input.role}-${groupSlug}-${digest}`.slice(0, 96);
}

function synthesisSummaryGroups(
  synthesis: Record<string, JsonValue>,
): Array<Record<string, JsonValue>> {
  return Array.isArray(synthesis.implementationGroups)
    ? synthesis.implementationGroups
        .filter((item): item is Record<string, JsonValue> =>
          Boolean(item && typeof item === "object" && !Array.isArray(item)),
        )
        .slice(0, 24)
    : [];
}

function synthesisSummaryDependencies(
  synthesis: Record<string, JsonValue>,
): Array<Record<string, JsonValue>> {
  return Array.isArray(synthesis.dependencyMap)
    ? synthesis.dependencyMap
        .filter((item): item is Record<string, JsonValue> =>
          Boolean(item && typeof item === "object" && !Array.isArray(item)),
        )
        .slice(0, 60)
    : [];
}

function stringFromJson(value: JsonValue | undefined, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function capabilityAvailable(input: {
  capabilityId: string;
  capabilityManifest: RuntimeNodeCapabilityManifest;
  executableExecutorKeys: string[];
}): ReturnType<typeof findRuntimeNodeCapability> {
  const capability = findRuntimeNodeCapability(input.capabilityId, input.capabilityManifest);
  if (!capability) {
    return null;
  }
  const executable = new Set(input.executableExecutorKeys);
  if (
    executable.has(capability.executorKey) ||
    executable.has(`kind:${capability.graphNodeKind}`) ||
    executable.has(`role:${capability.roleId}`) ||
    executable.has(capability.graphNodeKind) ||
    executable.has(capability.roleId)
  ) {
    return capability;
  }
  return null;
}

function selectRuntimeCompiledImplementationCapability(input: {
  group: Record<string, JsonValue>;
  capabilityManifest: RuntimeNodeCapabilityManifest;
  executableExecutorKeys: string[];
}): ReturnType<typeof findRuntimeNodeCapability> {
  const recommended = jsonStringArray(input.group.recommendedCapabilityIds);
  for (const capabilityId of recommended) {
    const capability = capabilityAvailable({
      capabilityId,
      capabilityManifest: input.capabilityManifest,
      executableExecutorKeys: input.executableExecutorKeys,
    });
    if (
      capability &&
      capability.roleClass === "implementation" &&
      capability.capabilityId !== "implementation_complex" &&
      capability.costClass !== "premium"
    ) {
      return capability;
    }
  }
  return (
    capabilityAvailable({
      capabilityId: "implementation_microtask",
      capabilityManifest: input.capabilityManifest,
      executableExecutorKeys: input.executableExecutorKeys,
    }) ??
    capabilityAvailable({
      capabilityId: "implementation_complex",
      capabilityManifest: input.capabilityManifest,
      executableExecutorKeys: input.executableExecutorKeys,
    })
  );
}

function costAwareUtilityDecisionForCompiledNode(input: {
  decisionId: string;
  capabilityId: string;
  targetCommitmentIds: string[];
  consideredCapabilityIds: string[];
  utilityRationale: string;
  costRationale: string;
  whyCheaperOptionsWereInsufficient?: string | null;
  whyThisIsNotDuplicateWork: string;
  expectedDownstreamConsumer: string;
  budgetRef: string;
  stopOrEscalationCondition: string;
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): CostAwareCapabilityUtilityDecision {
  const capability = findRuntimeNodeCapability(input.capabilityId, input.capabilityManifest);
  const profile = capability ? providerCapabilityProfileForCapability(capability) : null;
  const selectedModelQualificationProfileId = capability?.productionSelectionRequiresQualification
    ? capability.canEditSource
      ? (capability.modelQualificationProfileIds.find((profileId) =>
          profileId.includes("kimi-k2.6"),
        ) ??
        capability.modelQualificationProfileIds[0] ??
        null)
      : (capability.modelQualificationProfileIds[0] ?? null)
    : null;
  return {
    decisionId: input.decisionId,
    consideredCapabilityIds: uniqueStrings(input.consideredCapabilityIds),
    selectedCapabilityId: input.capabilityId,
    selectedProviderCapabilityProfileId: profile?.profileId ?? null,
    selectedNodeKind: capability?.graphNodeKind ?? "implementation",
    selectedExecutorKey: capability?.executorKey ?? `capability:${input.capabilityId}`,
    targetCommitmentIds: input.targetCommitmentIds,
    utilityRationale: input.utilityRationale,
    costRationale: input.costRationale,
    whyCheaperOptionsWereInsufficient: input.whyCheaperOptionsWereInsufficient ?? null,
    whyThisIsNotDuplicateWork: input.whyThisIsNotDuplicateWork,
    expectedEvidence: capability?.evidenceProducedKinds ?? ["artifact"],
    selectedModelQualificationProfileId,
    qualificationEvidenceRefs:
      capability?.productionSelectionRequiresQualification && selectedModelQualificationProfileId
        ? [`model-profile://${selectedModelQualificationProfileId}/runtime-capability`]
        : [],
    expectedDownstreamConsumer: input.expectedDownstreamConsumer,
    budgetRef: input.budgetRef,
    stopOrEscalationCondition: input.stopOrEscalationCondition,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function compiledPostSynthesisNode(input: {
  nodeId: string;
  capabilityId: string;
  inputHandoffRefs: string[];
  targetRefs: string[];
  commitmentIds: string[];
  exactObjective: string;
  whyThisRoleIsNeededNow: string;
  expectedOutput: string;
  acceptanceCriteria: string[];
  downstreamConsumer: string;
  evidenceExpectation: string;
  utilityDecision: CostAwareCapabilityUtilityDecision;
  missionLedger: MissionContractLedger | null;
  capabilityManifest: RuntimeNodeCapabilityManifest;
  metadata?: Record<string, JsonValue>;
}): OrchestratorGraphNodeSpec | null {
  const capability = findRuntimeNodeCapability(input.capabilityId, input.capabilityManifest);
  if (!capability) {
    return null;
  }
  const baseNode: OrchestratorGraphNodeSpec = {
    nodeId: input.nodeId,
    nodeKind: capability.graphNodeKind,
    capabilityId: capability.capabilityId,
    executorKey: capability.executorKey,
    workerRef: capability.workerRef,
    requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
    assignedRole: capability.roleId,
    modelOrWorkerRef: capability.workerRef,
    inputHandoffRefs: uniqueStrings(input.inputHandoffRefs).slice(0, 80),
    targetRefs: uniqueStrings(input.targetRefs).slice(0, 80),
    commitmentIdsAdvanced: uniqueStrings(input.commitmentIds).slice(0, 40),
    exactObjective: input.exactObjective,
    whyThisRoleIsNeededNow: input.whyThisRoleIsNeededNow,
    expectedOutput: input.expectedOutput,
    acceptanceCriteria: uniqueStrings(input.acceptanceCriteria).slice(0, 16),
    downstreamConsumer: input.downstreamConsumer,
    evidenceExpectation: input.evidenceExpectation,
    metadata: null,
  };
  const expectedEvidence = runtimeDerivedEvidenceForNode({
    node: baseNode,
    missionLedger: input.missionLedger,
    capabilityManifest: input.capabilityManifest,
  });
  return {
    ...baseNode,
    metadata: {
      ...input.metadata,
      capabilityId: capability.capabilityId,
      graphNodeKind: capability.graphNodeKind,
      executorKey: capability.executorKey,
      workerRef: capability.workerRef,
      requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
      stagedSchedulerProtocolCompiled: true,
      runtimeCompiledFromContextSynthesis: true,
      expectedEvidence,
      expectedEvidenceSource:
        "runtime_derived_from_capability_manifest_mission_ledger_and_context_synthesis",
      utilityDecision: input.utilityDecision,
      costAwareUtilityDecision: input.utilityDecision,
      consideredCapabilityIds: input.utilityDecision.consideredCapabilityIds,
      utilityRationale: input.utilityDecision.utilityRationale,
      costRationale: input.utilityDecision.costRationale,
      whyCheaperOptionsWereInsufficient:
        input.utilityDecision.whyCheaperOptionsWereInsufficient ?? null,
      whyThisIsNotDuplicateWork: input.utilityDecision.whyThisIsNotDuplicateWork,
      stopOrEscalationCondition: input.utilityDecision.stopOrEscalationCondition,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    } satisfies JsonValue,
  };
}

function runtimeCompiledPostSynthesisGraphDecision(input: {
  graphId: string;
  iteration: number;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  missionLedger: MissionContractLedger | null;
  capabilityManifest: RuntimeNodeCapabilityManifest;
  executableExecutorKeys: string[];
  recentNodeResultSummaries: RuntimeWorkGraphRecentNodeResultSummary[];
}): OrchestratorGraphDecision | null {
  if (
    !missionIsComplex(input.missionLedger) ||
    !acceptedContextSynthesisExists(input.snapshotSummary) ||
    postSynthesisDownstreamGraphExists(input.snapshotSummary)
  ) {
    return null;
  }
  const synthesis = latestAcceptedContextSynthesisSummary(input.recentNodeResultSummaries);
  if (!synthesis) {
    return {
      decisionId: `runtime-post-synthesis-graph-missing-artifact-${input.iteration}`,
      decisionKind: "mark_needs_review",
      rationaleForDecision:
        "Accepted context synthesis exists, but the bounded synthesis artifact summary is not available to the runtime compiler; scheduler will not ask the model to invent a replacement graph.",
      reasonCodes: [
        "runtime_compiled_post_synthesis_graph_requires_synthesis_artifact_summary",
        "post_synthesis_monolithic_orchestrator_graph_disabled",
      ],
      metadata: {
        runtimeCompiledFromContextSynthesis: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } satisfies JsonValue,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
  }
  const groups = synthesisSummaryGroups(synthesis);
  const synthesisRef = stringFromJson(synthesis.synthesisRef);
  const schedulerHandoff = jsonRecord(synthesis.schedulerHandoff);
  const expectedGroupCount =
    typeof synthesis.implementationGroupCount === "number"
      ? synthesis.implementationGroupCount
      : typeof schedulerHandoff.implementationGroupCount === "number"
        ? schedulerHandoff.implementationGroupCount
        : groups.length;
  const compileHandoffComplete =
    synthesis.artifactKind === "context_synthesis_graph_compile_handoff"
      ? synthesis.compileHandoffComplete !== false &&
        (typeof synthesis.implementationGroupsIncludedCount !== "number" ||
          synthesis.implementationGroupsIncludedCount === expectedGroupCount)
      : expectedGroupCount === groups.length;
  if (groups.length === 0 || !synthesisRef) {
    return {
      decisionId: `runtime-post-synthesis-graph-invalid-artifact-${input.iteration}`,
      decisionKind: "mark_needs_review",
      rationaleForDecision:
        "Accepted context synthesis did not contain worker-ready implementation groups and a synthesis ref, so downstream graph compilation cannot proceed.",
      reasonCodes: [
        groups.length === 0
          ? "runtime_compiled_post_synthesis_groups_missing"
          : "runtime_compiled_post_synthesis_ref_missing",
        "post_synthesis_monolithic_orchestrator_graph_disabled",
      ],
      metadata: {
        runtimeCompiledFromContextSynthesis: true,
        synthesisSummaryAvailable: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } satisfies JsonValue,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
  }
  if (!compileHandoffComplete || groups.length < expectedGroupCount) {
    return {
      decisionId: `runtime-post-synthesis-graph-incomplete-handoff-${input.iteration}`,
      decisionKind: "mark_needs_review",
      rationaleForDecision:
        "Accepted context synthesis reported more implementation groups than the graph compiler received; scheduler refuses to compile a partial downstream graph.",
      reasonCodes: [
        "runtime_compiled_post_synthesis_compile_handoff_incomplete",
        `runtime_compiled_post_synthesis_expected_group_count:${expectedGroupCount}`,
        `runtime_compiled_post_synthesis_received_group_count:${groups.length}`,
        "post_synthesis_monolithic_orchestrator_graph_disabled",
      ],
      metadata: {
        runtimeCompiledFromContextSynthesis: true,
        synthesisSummaryAvailable: true,
        contextSynthesisRef: synthesisRef,
        expectedGroupCount,
        receivedGroupCount: groups.length,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } satisfies JsonValue,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
  }
  const nodes: OrchestratorGraphNodeSpec[] = [];
  const groupNodeIdByGroupId = new Map<string, string>();
  const allCommitmentIds = uniqueStrings(
    groups.flatMap((group) => jsonStringArray(group.commitmentIds)),
  );
  const synthesisContextSnapshot = createContextSnapshotRef({
    sourceRef: synthesisRef,
    sourceKind: "context_synthesis",
    graphId: input.graphId,
    commitmentIds: allCommitmentIds,
    scopeSummary:
      "Accepted context synthesis barrier snapshot used to authorize downstream implementation graph execution.",
    reasonCodes: ["context_snapshot_context_synthesis_accepted"],
  });
  const prefix = `g-${createHash("sha256").update(input.graphId).digest("hex").slice(0, 8)}`;
  for (const [index, group] of groups.entries()) {
    const groupId = stringFromJson(group.groupId, `group-${index + 1}`);
    const capability = selectRuntimeCompiledImplementationCapability({
      group,
      capabilityManifest: input.capabilityManifest,
      executableExecutorKeys: input.executableExecutorKeys,
    });
    if (!capability) {
      return {
        decisionId: `runtime-post-synthesis-graph-missing-implementation-capability-${input.iteration}`,
        decisionKind: "mark_needs_review",
        rationaleForDecision:
          "Context synthesis produced implementation groups, but no executable implementation capability is registered for this workflow.",
        reasonCodes: [
          "runtime_compiled_post_synthesis_implementation_capability_missing",
          "post_synthesis_monolithic_orchestrator_graph_disabled",
        ],
        metadata: {
          groupId,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        } satisfies JsonValue,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      };
    }
    const commitmentIds = jsonStringArray(group.commitmentIds);
    const targetRefs = jsonStringArray(group.targetRefs);
    const nodeId = runtimeCompiledPostSynthesisNodeId({
      prefix,
      groupId,
      role: "implementation",
      index,
    });
    groupNodeIdByGroupId.set(groupId, nodeId);
    const considered = uniqueStrings([
      ...jsonStringArray(group.recommendedCapabilityIds),
      "implementation_microtask",
      ...(capability.capabilityId === "implementation_complex" ? ["implementation_complex"] : []),
      capability.capabilityId,
    ]);
    const utilityDecision = costAwareUtilityDecisionForCompiledNode({
      decisionId: `runtime-post-synthesis-${nodeId}-utility`,
      capabilityId: capability.capabilityId,
      targetCommitmentIds: commitmentIds.length > 0 ? commitmentIds : allCommitmentIds,
      consideredCapabilityIds: considered,
      utilityRationale:
        stringFromJson(group.workerFitRationale) ||
        "Accepted context synthesis identified this as a worker-ready implementation group.",
      costRationale:
        capability.costClass === "premium"
          ? "Premium Codex implementation is used only for the synthesis group that could not be assigned to a cheaper scoped implementation capability."
          : "Use the cheapest executable implementation capability for this synthesized worker-ready group before premium escalation.",
      whyCheaperOptionsWereInsufficient:
        capability.costClass === "premium"
          ? "The accepted synthesis recommendations or runtime capability registry did not provide a cheaper executable implementation capability for this group."
          : null,
      whyThisIsNotDuplicateWork: `No implementation node exists yet for context synthesis group ${groupId}.`,
      expectedDownstreamConsumer: "validation",
      budgetRef: `runtime-task-budget://scheduler/post-synthesis/${groupId}/implementation`,
      stopOrEscalationCondition:
        "Return validation or adapter failure evidence to the scheduler; escalate only after scoped worker repair cannot satisfy the group.",
      capabilityManifest: input.capabilityManifest,
    });
    const node = compiledPostSynthesisNode({
      nodeId,
      capabilityId: capability.capabilityId,
      inputHandoffRefs: uniqueStrings([synthesisRef, ...jsonStringArray(group.inputHandoffRefs)]),
      targetRefs,
      commitmentIds: commitmentIds.length > 0 ? commitmentIds : allCommitmentIds,
      exactObjective:
        stringFromJson(group.objective) || `Implement accepted context synthesis group ${groupId}.`,
      whyThisRoleIsNeededNow:
        "Accepted context synthesis converted commitment context into this bounded implementation group; source work can now run without a broad graph-planning call.",
      expectedOutput:
        "Source/test/docs change evidence refs, touched-file refs, validation hints, and commitment evidence claims for this implementation group.",
      acceptanceCriteria:
        jsonStringArray(group.successCriteria).length > 0
          ? jsonStringArray(group.successCriteria)
          : ["Emit bounded changed-file refs and evidence claims for every target commitment."],
      downstreamConsumer: "validation",
      evidenceExpectation:
        "Changed-file refs and commitment evidence claims tied to the accepted synthesis group.",
      utilityDecision,
      missionLedger: input.missionLedger,
      capabilityManifest: input.capabilityManifest,
      metadata: {
        contextSynthesisGroupId: groupId,
        contextSynthesisRef: synthesisRef,
        requiredContextSnapshotRefs: [synthesisContextSnapshot],
        providedContextSnapshotRefs: [synthesisContextSnapshot],
        contextSnapshotRefs: [synthesisContextSnapshot.snapshotRef],
        contextFreshnessStatus: "fresh",
        contextRefreshAction: "none",
        workerFitRationale: stringFromJson(group.workerFitRationale) || null,
        cheaperWorkerSuitability: stringFromJson(group.cheaperWorkerSuitability) || null,
        codexEscalationRationale: stringFromJson(group.codexEscalationRationale) || null,
        fileOwnershipRefs: jsonStringArray(group.fileOwnershipRefs),
        groupExpectedOutput: stringFromJson(group.expectedOutput) || null,
        groupEvidenceClaimExpectations: jsonStringArray(group.evidenceClaimExpectations),
        groupValidationNeeds: jsonStringArray(group.validationNeeds),
        groupReviewNeeds: jsonStringArray(group.reviewNeeds),
        groupStopIfMissing: jsonStringArray(group.stopIfMissing),
        groupRiskRefs: jsonStringArray(group.riskRefs),
        groupIntegrationRequirements: jsonStringArray(group.integrationRequirements),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    if (node) {
      nodes.push(node);
    }
  }
  const requiredCapabilities = [
    ["validation_run", "validation"] as const,
    ["reviewer", "review"] as const,
    ["observability_readback", "readback"] as const,
    ["coding_closeout", "closeout"] as const,
  ];
  const supportNodes: OrchestratorGraphNodeSpec[] = [];
  for (const [capabilityId, role] of requiredCapabilities) {
    const capability = capabilityAvailable({
      capabilityId,
      capabilityManifest: input.capabilityManifest,
      executableExecutorKeys: input.executableExecutorKeys,
    });
    if (!capability) {
      return {
        decisionId: `runtime-post-synthesis-graph-missing-${capabilityId}-${input.iteration}`,
        decisionKind: "mark_needs_review",
        rationaleForDecision:
          "Context synthesis was accepted, but a required post-synthesis capability is not executable.",
        reasonCodes: [
          `runtime_compiled_post_synthesis_required_capability_missing:${capabilityId}`,
          "post_synthesis_monolithic_orchestrator_graph_disabled",
        ],
        metadata: {
          requiredCapabilityId: capabilityId,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        } satisfies JsonValue,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      };
    }
    const nodeId = runtimeCompiledPostSynthesisNodeId({
      prefix,
      groupId: role,
      role,
      index: supportNodes.length,
    });
    const downstream =
      role === "validation"
        ? "review"
        : role === "review"
          ? "owner_readback"
          : role === "readback"
            ? "closeout"
            : "owner";
    const utilityDecision = costAwareUtilityDecisionForCompiledNode({
      decisionId: `runtime-post-synthesis-${nodeId}-utility`,
      capabilityId,
      targetCommitmentIds: allCommitmentIds,
      consideredCapabilityIds: [capabilityId],
      utilityRationale:
        role === "validation"
          ? "Validation must produce separate command/test evidence after implementation nodes complete."
          : role === "review"
            ? "Review must judge evidence sufficiency after implementation and validation."
            : role === "readback"
              ? "Owner-facing readback must expose graph state, files, validation, limitations, and next decision."
              : "Closeout must be model-authored after accepted implementation, validation, review, and readback evidence.",
      costRationale:
        capability.costClass === "cheap"
          ? "Use a cheap specialized capability instead of absorbing this role into broad Codex implementation."
          : "Use the specialized capability for this role instead of broad implementation.",
      whyThisIsNotDuplicateWork: `No post-synthesis ${role} node exists yet for the accepted synthesis graph.`,
      expectedDownstreamConsumer: downstream,
      budgetRef: `runtime-task-budget://scheduler/post-synthesis/${role}`,
      stopOrEscalationCondition:
        role === "closeout"
          ? "Return needs_review if blocking commitments, validation, review, or closeout evidence remain missing."
          : "Return needs_review with bounded evidence if this role cannot satisfy its post-synthesis obligation.",
      capabilityManifest: input.capabilityManifest,
    });
    const node = compiledPostSynthesisNode({
      nodeId,
      capabilityId,
      inputHandoffRefs: [synthesisRef],
      targetRefs: [],
      commitmentIds: allCommitmentIds,
      exactObjective:
        role === "validation"
          ? "Run or coordinate focused validation for all post-synthesis implementation evidence and map results to Mission Ledger commitments."
          : role === "review"
            ? "Review post-synthesis implementation and validation evidence for sufficiency, storage bounds, limitations, and remaining blockers."
            : role === "readback"
              ? "Prepare owner-facing Work Queue readback showing graph nodes, worker choices, files, tests, limitations, open commitments, and next decision."
              : "Generate model-authored closeout only after implementation, validation, review, and readback evidence are accepted.",
      whyThisRoleIsNeededNow:
        role === "validation"
          ? "Post-synthesis implementation work needs a separate validation stage; validation must not be hidden inside implementation."
          : role === "review"
            ? "The workflow needs an independent review stage before closeout to prevent false success."
            : role === "readback"
              ? "The owner needs readable runtime evidence and progress before final closeout."
              : "Closeout is a distinct finalization role and cannot be replaced by implementation or degraded diagnostics.",
      expectedOutput:
        role === "validation"
          ? "Validation refs, command summaries, failure mapping, and evidence claims."
          : role === "review"
            ? "Review refs, sufficiency judgment, limitations, and repair recommendations if needed."
            : role === "readback"
              ? "Work Queue/readback refs with active graph, files, tests, workers, limitations, and ELI5."
              : "Model-authored Closeout Capsule refs citing accepted runtime evidence.",
      acceptanceCriteria:
        role === "validation"
          ? [
              "Validation refs are bounded and mapped to commitments.",
              "Failures route to repair rather than false closeout.",
            ]
          : role === "review"
            ? [
                "Review cites implementation and validation evidence.",
                "Blocking findings are explicit.",
              ]
            : role === "readback"
              ? [
                  "Readback is owner-readable and cites runtime refs.",
                  "Open commitments and limitations are visible.",
                ]
              : [
                  "Closeout cites accepted evidence refs.",
                  "No degraded/system closeout is treated as success.",
                ],
      downstreamConsumer: downstream,
      evidenceExpectation:
        role === "validation"
          ? "Focused validation evidence and commitment evidence claims."
          : role === "review"
            ? "Model review evidence and sufficiency judgment."
            : role === "readback"
              ? "Owner-facing readback refs."
              : "Model-authored closeout capsule refs.",
      utilityDecision,
      missionLedger: input.missionLedger,
      capabilityManifest: input.capabilityManifest,
      metadata: {
        contextSynthesisRef: synthesisRef,
        runtimeCompiledSupportRole: role,
        contextSynthesisValidationStrategy: jsonStringArray(synthesis.validationStrategy),
        contextSynthesisLikelyValidationLanes: jsonStringArray(synthesis.likelyValidationLanes),
        contextSynthesisReviewLanes: jsonStringArray(synthesis.reviewLanes),
        contextSynthesisIntegrationRequirements: jsonStringArray(synthesis.integrationRequirements),
        contextSynthesisWorkerFitSummary: stringFromJson(synthesis.workerFitSummary) || null,
        contextSynthesisGraphCompileInputSummary:
          stringFromJson(jsonRecord(synthesis.schedulerHandoff).graphCompileInputSummary) || null,
        requiredContextSnapshotRefs: [synthesisContextSnapshot],
        providedContextSnapshotRefs: [synthesisContextSnapshot],
        contextSnapshotRefs: [synthesisContextSnapshot.snapshotRef],
        contextFreshnessStatus: "fresh",
        contextRefreshAction: "none",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    if (node) {
      supportNodes.push(node);
    }
  }
  nodes.push(...supportNodes);
  const edges: NonNullable<OrchestratorGraphDecision["newEdges"]> = [];
  const contextSynthesisNode = input.snapshotSummary.nodeSummaries.find(
    (node) => isContextSynthesisSummaryNode(node) && node.nodeStatus === "succeeded",
  );
  for (const node of nodes.filter((candidate) => candidate.nodeKind === "implementation")) {
    if (contextSynthesisNode) {
      edges.push({
        edgeId: `synthesis-to-${node.nodeId}`.slice(0, 96),
        fromNodeId: contextSynthesisNode.nodeId,
        toNodeId: node.nodeId,
        edgeKind: "synthesis_groups",
        reasonCodes: ["runtime_compiled_context_synthesis_to_implementation_group"],
        artifactRefs: [synthesisRef],
        metadata: {
          contextSynthesisRef: synthesisRef,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        } satisfies JsonValue,
      });
    }
  }
  for (const dependency of synthesisSummaryDependencies(synthesis)) {
    const fromGroupId = stringFromJson(dependency.fromGroupId);
    const toGroupId = stringFromJson(dependency.toGroupId);
    const fromNodeId = groupNodeIdByGroupId.get(fromGroupId);
    const toNodeId = groupNodeIdByGroupId.get(toGroupId);
    if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
      continue;
    }
    edges.push({
      edgeId: `group-${fromGroupId}-to-${toGroupId}`.slice(0, 96),
      fromNodeId,
      toNodeId,
      edgeKind: "implementation_depends_on",
      reasonCodes: ["runtime_compiled_context_synthesis_group_dependency"],
      artifactRefs: [synthesisRef],
      metadata: {
        dependencyKind: stringFromJson(dependency.dependencyKind, "handoff"),
        rationale: stringFromJson(dependency.rationale) || null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } satisfies JsonValue,
    });
  }
  const validationNode = supportNodes.find((node) => node.capabilityId === "validation_run");
  const reviewNode = supportNodes.find((node) => node.capabilityId === "reviewer");
  const readbackNode = supportNodes.find((node) => node.capabilityId === "observability_readback");
  const closeoutNode = supportNodes.find((node) => node.capabilityId === "coding_closeout");
  if (validationNode) {
    for (const implementationNode of nodes.filter((node) => node.nodeKind === "implementation")) {
      edges.push({
        edgeId: `${implementationNode.nodeId}-to-${validationNode.nodeId}`.slice(0, 96),
        fromNodeId: implementationNode.nodeId,
        toNodeId: validationNode.nodeId,
        edgeKind: "validation_depends_on",
        reasonCodes: ["runtime_compiled_implementation_to_validation"],
        artifactRefs: [],
        metadata: {
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        } satisfies JsonValue,
      });
    }
  }
  const chainEdges = [
    [validationNode?.nodeId, reviewNode?.nodeId, "review_depends_on"] as const,
    [reviewNode?.nodeId, readbackNode?.nodeId, "review_depends_on"] as const,
    [readbackNode?.nodeId, closeoutNode?.nodeId, "closeout_depends_on"] as const,
  ];
  for (const [fromNodeId, toNodeId, edgeKind] of chainEdges) {
    if (!fromNodeId || !toNodeId) {
      continue;
    }
    edges.push({
      edgeId: `${fromNodeId}-to-${toNodeId}`.slice(0, 96),
      fromNodeId,
      toNodeId,
      edgeKind,
      reasonCodes: ["runtime_compiled_post_synthesis_support_chain"],
      artifactRefs: [],
      metadata: {
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } satisfies JsonValue,
    });
  }
  return {
    decisionId: `runtime-post-synthesis-compiled-graph-${input.iteration}`,
    decisionKind: "add_nodes",
    rationaleForDecision:
      "Runtime compiled the accepted context synthesis artifact into an executable post-synthesis graph with implementation groups, validation, review, readback, and closeout nodes.",
    newNodes: nodes,
    newEdges: edges,
    runAfterAdd: false,
    commitmentIdsAdvanced: uniqueStrings(nodes.flatMap((node) => node.commitmentIdsAdvanced ?? [])),
    reasonCodes: [
      "runtime_compiled_post_synthesis_graph_created",
      "post_synthesis_monolithic_orchestrator_graph_bypassed",
      `runtime_compiled_post_synthesis_implementation_group_count:${groups.length}`,
      `runtime_compiled_post_synthesis_node_count:${nodes.length}`,
      `runtime_compiled_post_synthesis_edge_count:${edges.length}`,
    ],
    metadata: {
      stagedSchedulerProtocolCompiled: true,
      runtimeCompiledFromContextSynthesis: true,
      contextSynthesisRef: synthesisRef,
      implementationGroupCount: groups.length,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      parallelIndependentNodesJustification:
        stringFromJson(synthesis.parallelismPlan) ||
        "Implementation groups without explicit dependency edges are independent after accepted context synthesis; validation waits for all implementation groups.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    } satisfies JsonValue,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

function planningOrchestratorAlreadyStarted(
  summary: RuntimeWorkGraphSchedulerSnapshotSummary,
): boolean {
  return summary.nodeSummaries.some(
    (node) =>
      isPlanningOrchestratorNode(node) &&
      ["running", "succeeded", "needs_review", "waiting_for_human"].includes(node.nodeStatus),
  );
}

function decisionMetadataString(decision: OrchestratorGraphDecision, key: string): string | null {
  const metadata = jsonRecord(decision.metadata ?? {});
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function nodeContractReasonCodes(input: {
  node: OrchestratorGraphNodeSpec;
  knownCommitmentIds: Set<string>;
}): string[] {
  const reasonCodes: string[] = [];
  if ((input.node.commitmentIdsAdvanced ?? []).length === 0) {
    reasonCodes.push(`node_commitment_ids_missing:${input.node.nodeId || "unknown"}`);
  }
  for (const commitmentId of input.node.commitmentIdsAdvanced ?? []) {
    if (!input.knownCommitmentIds.has(commitmentId)) {
      reasonCodes.push(`node_commitment_id_unknown:${input.node.nodeId}:${commitmentId}`);
    }
  }
  if (!input.node.whyThisRoleIsNeededNow) {
    reasonCodes.push(`node_role_rationale_missing:${input.node.nodeId || "unknown"}`);
  }
  if (!input.node.exactObjective) {
    reasonCodes.push(`node_exact_objective_missing:${input.node.nodeId || "unknown"}`);
  }
  return reasonCodes;
}

function validateEvidenceClaims(input: {
  claims: CommitmentEvidenceClaim[];
  ledger: MissionContractLedger | null;
  outputArtifactRefs: string[];
  nodeKind: string;
}): string[] {
  const reasonCodes: string[] = [];
  const knownCommitments = commitmentIdsForLedger(input.ledger);
  const knownEvidence = new Set(input.outputArtifactRefs);
  for (const claim of input.claims) {
    if (!knownCommitments.has(claim.commitmentId)) {
      reasonCodes.push(`evidence_claim_unknown_commitment:${claim.commitmentId}`);
    }
    if (!knownEvidence.has(claim.evidenceRef)) {
      reasonCodes.push(`evidence_claim_ref_missing:${claim.evidenceRef}`);
    }
    if (
      input.nodeKind === "closeout" &&
      ["source_change", "test_validation"].includes(claim.evidenceKind)
    ) {
      reasonCodes.push(`evidence_claim_closeout_cannot_satisfy_${claim.evidenceKind}`);
    }
    const storageFlags = claim as unknown as Record<string, unknown>;
    if (
      storageFlags.rawPromptStored !== false ||
      storageFlags.rawResponseStored !== false ||
      storageFlags.rawProviderLogStored !== false ||
      (storageFlags.rawToolLogStored !== undefined && storageFlags.rawToolLogStored !== false) ||
      (storageFlags.rawDbRowsStored !== undefined && storageFlags.rawDbRowsStored !== false)
    ) {
      reasonCodes.push("evidence_claim_raw_storage_flag_invalid");
    }
    if (storageFlags.authorityGranted === true || storageFlags.workQueueLifecycleMutated === true) {
      reasonCodes.push("evidence_claim_authority_or_lifecycle_invalid");
    }
  }
  return reasonCodes;
}

function looksLikeArtifactRef(value: string): boolean {
  return (
    value.includes("://") ||
    value.startsWith(".artifacts/") ||
    value.startsWith("artifact:") ||
    value.startsWith("work-episode:")
  );
}

function artifactRefForEvidenceKind(
  evidenceKind: CommitmentEvidenceClaim["evidenceKind"],
  outputArtifactRefs: string[],
): string | null {
  if (outputArtifactRefs.length === 0) {
    return null;
  }
  const firstMatching = (patterns: string[]): string | null =>
    outputArtifactRefs.find((ref) => {
      const lower = ref.toLowerCase();
      return patterns.some((pattern) => lower.includes(pattern));
    }) ?? null;
  if (evidenceKind === "test_validation") {
    return firstMatching(["validation", "test"]) ?? null;
  }
  if (evidenceKind === "source_change") {
    return firstMatching(["/diff/", "diff", "patch", "source", "change"]) ?? null;
  }
  if (evidenceKind === "review") {
    return firstMatching(["/review", "review"]) ?? null;
  }
  if (evidenceKind === "closeout") {
    return firstMatching(["closeout"]) ?? null;
  }
  if (evidenceKind === "readback") {
    return firstMatching(["readback", "work-queue"]) ?? null;
  }
  if (evidenceKind === "docs") {
    return firstMatching(["docs", "spec", "roadmap"]) ?? null;
  }
  return outputArtifactRefs.length === 1 ? outputArtifactRefs[0]! : null;
}

function normalizedEvidenceKindForClaim(
  claim: CommitmentEvidenceClaim,
): CommitmentEvidenceClaim["evidenceKind"] {
  const rawEvidenceKind = (claim as { evidenceKind?: unknown }).evidenceKind;
  if (
    rawEvidenceKind === "source_change" ||
    rawEvidenceKind === "test_validation" ||
    rawEvidenceKind === "review" ||
    rawEvidenceKind === "docs" ||
    rawEvidenceKind === "readback" ||
    rawEvidenceKind === "artifact" ||
    rawEvidenceKind === "human_decision" ||
    rawEvidenceKind === "closeout" ||
    rawEvidenceKind === "research_brief" ||
    rawEvidenceKind === "planning_capsule" ||
    rawEvidenceKind === "action_graph_proposal" ||
    rawEvidenceKind === "compile_readiness" ||
    rawEvidenceKind === "other"
  ) {
    return rawEvidenceKind;
  }
  const ref = claim.evidenceRef.toLowerCase();
  const validationRefs = (claim as { validationRefs?: unknown }).validationRefs;
  const changedFileRefs = (claim as { changedFileRefs?: unknown }).changedFileRefs;
  if (ref.includes("validation") || (Array.isArray(validationRefs) && validationRefs.length > 0)) {
    return "test_validation";
  }
  if (
    ref.includes("source") ||
    ref.includes("patch") ||
    ref.includes("diff") ||
    (Array.isArray(changedFileRefs) && changedFileRefs.length > 0)
  ) {
    return "source_change";
  }
  return "artifact";
}

function normalizeEvidenceClaims(input: {
  claims: CommitmentEvidenceClaim[];
  outputArtifactRefs: string[];
}): { claims: CommitmentEvidenceClaim[]; reasonCodes: string[] } {
  const knownEvidence = new Set(input.outputArtifactRefs);
  const reasonCodes: string[] = [];
  const claims = input.claims.map((claim) => {
    const evidenceKind = normalizedEvidenceKindForClaim(claim);
    const storageFlags = claim as unknown as Record<string, unknown>;
    const artifactRef =
      knownEvidence.has(claim.evidenceRef) || looksLikeArtifactRef(claim.evidenceRef)
        ? claim.evidenceRef
        : artifactRefForEvidenceKind(evidenceKind, input.outputArtifactRefs);
    if (artifactRef && artifactRef !== claim.evidenceRef) {
      reasonCodes.push(
        `evidence_claim_ref_normalized_to_output_artifact:${claim.commitmentId}:${evidenceKind}`,
      );
    }
    return {
      ...claim,
      evidenceKind,
      evidenceRef: artifactRef ?? claim.evidenceRef,
      rawPromptStored: storageFlags.rawPromptStored === true ? (true as false) : false,
      rawResponseStored: storageFlags.rawResponseStored === true ? (true as false) : false,
      rawProviderLogStored: storageFlags.rawProviderLogStored === true ? (true as false) : false,
      rawToolLogStored: storageFlags.rawToolLogStored === true ? (true as false) : false,
      rawDbRowsStored: storageFlags.rawDbRowsStored === true ? (true as false) : false,
    } as CommitmentEvidenceClaim;
  });
  return { claims, reasonCodes };
}

function evidenceClaimRequirementReasonCodes(input: {
  requireEvidenceClaims: boolean;
  claims: CommitmentEvidenceClaim[];
  claimReasonCodes: string[];
  ledger: MissionContractLedger | null;
  node: TeamGraphNode;
  nodeCommitmentIds: string[];
  resultStatus: RuntimeWorkGraphNodeExecutionResult["status"];
}): string[] {
  if (
    !input.requireEvidenceClaims ||
    !input.ledger ||
    input.resultStatus !== "succeeded" ||
    input.node.nodeKind === "context_synthesis"
  ) {
    return [];
  }
  const reasonCodes: string[] = [];
  if (input.nodeCommitmentIds.length === 0) {
    return [];
  }
  if (input.claims.length === 0) {
    reasonCodes.push(`mission_evidence_claims_required:${input.node.nodeId}`);
    for (const commitmentId of input.nodeCommitmentIds) {
      reasonCodes.push(
        `mission_evidence_claim_missing_for_commitment:${input.node.nodeId}:${commitmentId}`,
      );
    }
    return reasonCodes;
  }
  const claimedCommitments = new Set(input.claims.map((claim) => claim.commitmentId));
  for (const commitmentId of input.nodeCommitmentIds) {
    if (!claimedCommitments.has(commitmentId)) {
      reasonCodes.push(
        `mission_evidence_claim_missing_for_commitment:${input.node.nodeId}:${commitmentId}`,
      );
    }
  }
  if (input.claimReasonCodes.length > 0) {
    reasonCodes.push(`mission_evidence_claims_invalid:${input.node.nodeId}`);
  }
  return reasonCodes;
}

function policyReasonCodesForDecision(input: {
  decision: OrchestratorGraphDecision;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  missionLedger: MissionContractLedger | null;
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): string[] {
  const reasonCodes: string[] = [];
  reasonCodes.push(
    ...validateNonCodexTaskDecompositionDecision({
      decision: input.decision,
      snapshotSummary: input.snapshotSummary,
      missionLedger: input.missionLedger,
      capabilityManifest: input.capabilityManifest,
    }).reasonCodes,
  );
  reasonCodes.push(
    ...selectedNodeDependencyReasonCodes({
      decision: input.decision,
      snapshotSummary: input.snapshotSummary,
    }),
  );
  reasonCodes.push(
    ...contextSynthesisPolicyReasonCodes({
      decision: input.decision,
      snapshotSummary: input.snapshotSummary,
      missionLedger: input.missionLedger,
    }),
  );
  reasonCodes.push(
    ...validatePostSynthesisGraphDecision({
      decision: input.decision,
      snapshotSummary: input.snapshotSummary,
      missionLedger: input.missionLedger,
      capabilityManifest: input.capabilityManifest,
    }).reasonCodes,
  );
  const complex = missionIsComplex(input.missionLedger);
  const knownCommitments = commitmentIdsForLedger(input.missionLedger);
  const firstGraphDecision =
    input.snapshotSummary.nodeSummaries.length === 0 &&
    input.snapshotSummary.latestCheckpointKinds.length <= 2;
  if (
    isProductSpecPlanningWorkflow(input.snapshotSummary.workflowId) &&
    !planningOrchestratorAlreadyStarted(input.snapshotSummary)
  ) {
    const newNodes = input.decision.newNodes ?? [];
    const planningNodeIds = new Set(
      newNodes.filter(isPlanningOrchestratorNode).map((node) => node.nodeId),
    );
    const targetNodeId =
      input.decision.runNodeId ??
      input.decision.targetNodeId ??
      (input.decision.runAfterAdd
        ? (newNodes.find((node) => node.nodeKind !== "human_task")?.nodeId ?? null)
        : null);
    const existingTargetNode = input.snapshotSummary.nodeSummaries.find(
      (node) => node.nodeId === targetNodeId,
    );
    const targetIsPlanningOrchestrator =
      Boolean(targetNodeId && planningNodeIds.has(targetNodeId)) ||
      Boolean(existingTargetNode && isPlanningOrchestratorNode(existingTargetNode));
    if (firstGraphDecision && newNodes.length > 0 && planningNodeIds.size === 0) {
      reasonCodes.push("product_spec_planning_first_node_must_be_planning_orchestrator");
    }
    if (
      ["run_node", "retry_node", "repair_from_validation"].includes(input.decision.decisionKind) &&
      !targetIsPlanningOrchestrator
    ) {
      reasonCodes.push("product_spec_planning_planning_orchestrator_must_run_before_child_nodes");
    }
    if (input.decision.runAfterAdd && targetNodeId && !targetIsPlanningOrchestrator) {
      reasonCodes.push("product_spec_planning_run_after_add_must_start_planning_orchestrator");
    }
  }
  if (complex && input.decision.newNodes?.length) {
    for (const node of input.decision.newNodes) {
      reasonCodes.push(...nodeContractReasonCodes({ node, knownCommitmentIds: knownCommitments }));
    }
  }
  if (complex && firstGraphDecision) {
    const newNodes = input.decision.newNodes ?? [];
    const metadata = jsonRecord(input.decision.metadata ?? {});
    const progressiveContextFirst = isProgressiveContextAcquisitionFirstMove(newNodes);
    if (newNodes.length > 0 && metadata.stagedSchedulerProtocolCompiled !== true) {
      reasonCodes.push("complex_mission_requires_staged_scheduler_protocol");
    }
    const broadFirst =
      input.decision.decisionKind === "add_nodes" && newNodes.some(isBroadImplementationNode);
    if (broadFirst) {
      reasonCodes.push("complex_mission_requires_decomposition_before_broad_implementation");
    }
    if (input.decision.decisionKind === "run_node" && input.decision.runNodeId) {
      reasonCodes.push("complex_mission_requires_decomposition_before_run_node");
    }
    if (newNodes.length === 1 && !progressiveContextFirst) {
      reasonCodes.push("complex_mission_first_decision_requires_multi_node_decomposition");
    }
    if (newNodes.length > 1) {
      const nodeIds = new Set(newNodes.map((node) => node.nodeId));
      const edgeRefsValid = (input.decision.newEdges ?? []).every(
        (edge) =>
          (!edge.fromNodeId || nodeIds.has(edge.fromNodeId)) &&
          (!edge.toNodeId || nodeIds.has(edge.toNodeId)),
      );
      const hasGraphStructure = (input.decision.newEdges ?? []).length > 0;
      const hasParallelJustification = Boolean(
        decisionMetadataString(input.decision, "parallelIndependentNodesJustification"),
      );
      if (!edgeRefsValid) {
        reasonCodes.push("complex_mission_decomposition_edge_refs_invalid");
      }
      if (!hasGraphStructure && !hasParallelJustification) {
        reasonCodes.push("complex_mission_decomposition_edges_or_parallel_justification_missing");
      }
    }
  }
  return reasonCodes;
}

function repairFieldHintsForReasonCodes(reasonCodes: string[]): string[] {
  const fields = new Set<string>();
  for (const code of reasonCodes) {
    if (code.includes("high_capability_escalation_required")) {
      fields.add("decisionKind escalate_worker");
      fields.add("requestedCapabilityId implementation_complex");
      fields.add("targetNodeId must reference the needs-review node requiring escalation");
      fields.add("escalationContract with objective, targetCommitmentIds, and evidence refs");
    }
    if (code.includes("edge") || code.includes("parallel")) {
      fields.add("newEdges[] or metadata.parallelIndependentNodesJustification");
    }
    if (code.includes("context_synthesis")) {
      fields.add("stagedScheduler work unit selecting capabilityId context_synthesis");
      fields.add(
        "newNodes[].inputHandoffRefs must cite accepted context handoff refs after synthesis",
      );
    }
    if (code.includes("post_synthesis_graph_role_obligation_missing")) {
      fields.add("stagedScheduler.workBreakdownUnits[] with role-specific units");
      fields.add(
        "capabilitySelectionsForWorkUnits[] selecting implementation, validation, reviewer, observability_readback/docs_update, and coding_closeout capabilities",
      );
      if (code.endsWith(":validation")) {
        fields.add("validation obligation: selectedCapabilityId validation_run or test_authoring");
      }
      if (code.endsWith(":review")) {
        fields.add("review obligation: selectedCapabilityId reviewer");
      }
      if (code.endsWith(":docs_or_readback")) {
        fields.add(
          "docs/readback obligation: selectedCapabilityId observability_readback or another valid docs/readback capability shown in postSynthesisRoleObligationGuidance",
        );
      }
      if (code.endsWith(":closeout")) {
        fields.add("closeout obligation: selectedCapabilityId coding_closeout");
      }
    }
    if (code.includes("post_synthesis_graph_codex")) {
      fields.add("capabilitySelectionsForWorkUnits[].selectedCapabilityId");
      fields.add("capabilitySelectionsForWorkUnits[].whyCheaperOptionsWereInsufficient");
      fields.add("capabilitySelectionsForWorkUnits[].consideredCapabilityIds");
    }
    if (code.includes("dependency_not_satisfied")) {
      fields.add(
        "runNodeId/targetNodeId must reference a node whose handoff dependencies succeeded",
      );
    }
    if (code.includes("commitment") || code.includes("target_commitments")) {
      fields.add("newNodes[].commitmentIds");
    }
    if (code.includes("expected_evidence") || code.includes("evidence_expectation")) {
      fields.add("runtime-derived expectedEvidence needs capabilityId and commitmentIds");
    }
    if (code.includes("cost_rationale")) {
      fields.add("costRationale");
    }
    if (code.includes("duplicate") || code.includes("repeat_capability")) {
      fields.add("whyThisIsNotDuplicateWork");
    }
    if (code.includes("stop_or_escalation") || code.includes("escalation")) {
      fields.add("stopOrEscalationCondition");
    }
    if (code.includes("qualification")) {
      fields.add("selectedModelQualificationProfileId_and_qualificationEvidenceRefs");
    }
    if (code.includes("executor")) {
      fields.add("capabilityId_executorKey");
    }
  }
  return [...fields].slice(0, 16);
}

function repairMissingFieldsForReasonCodes(reasonCodes: string[]): ModelDecisionMissingField[] {
  const fields = new Map<string, ModelDecisionMissingField>();
  const add = (field: ModelDecisionMissingField) => fields.set(field.path, field);
  for (const code of reasonCodes) {
    if (code.includes("high_capability_escalation_required")) {
      add(
        missingField(
          "decisionKind + requestedCapabilityId + targetNodeId",
          "escalate_worker decision",
          "A needs-review node explicitly emitted high-capability escalation evidence, so retrying the same cheap worker is structurally invalid. Select a capable escalation worker from the capability manifest instead.",
          {
            decisionKind: "escalate_worker",
            targetNodeId: "needs-review-node-id",
            requestedCapabilityId: "implementation_complex",
            escalationContract: {
              objective:
                "Repair the failed schema/contract implementation using the previous node diagnostics and bounded refs.",
              targetCommitmentIds: ["commitment-1"],
              priorNodeOutputRefs: ["runtime-job://job/boundary-replay/worker-result/node/ref"],
            },
          },
        ),
      );
    }
    if (code.includes("edge") || code.includes("parallel")) {
      add(
        missingField(
          "newEdges[] or metadata.parallelIndependentNodesJustification",
          "array or string",
          "Complex decomposition must be inspectable as dependency edges or explicitly parallel-independent work.",
          [{ fromNodeId: "context-1", toNodeId: "implementation-1", edgeKind: "handoff" }],
        ),
      );
    }
    if (code.includes("context_synthesis")) {
      add(
        missingField(
          "stagedScheduler.capabilitySelectionsForWorkUnits[].selectedCapabilityId",
          "string",
          "After accepted context supply on complex missions, the next planning step must synthesize context before implementation can run.",
          "context_synthesis",
        ),
      );
      add(
        missingField(
          "stagedScheduler.nodeContractDrafts[].inputRefs",
          "string[]",
          "Downstream nodes created after context synthesis must cite context handoff refs or provide a bounded no-context-needed rationale.",
          ["runtime-job://job/context-handoff/context_scout-c001"],
        ),
      );
    }
    if (code.includes("post_synthesis_graph_role_obligation_missing")) {
      const missingRole = code.split(":").at(-1) ?? "";
      add(
        missingField(
          "stagedScheduler.workBreakdownUnits[]",
          "role-specific work units",
          "After accepted context synthesis, complex coding graphs must split implementation, validation, review, readback/docs, and closeout into role-specific nodes.",
          [
            {
              workUnitId: "implementation-foundation",
              objective: "Apply the source edits using synthesized context.",
              commitmentIds: ["commitment-1"],
            },
            {
              workUnitId: "validation-proof",
              objective: "Run focused validation and map results to commitments.",
              commitmentIds: ["commitment-1"],
            },
            {
              workUnitId: "review-and-closeout",
              objective: "Review evidence and prepare model-authored closeout.",
              commitmentIds: ["commitment-1"],
            },
          ],
        ),
      );
      if (missingRole === "validation") {
        add(
          missingField(
            "stagedScheduler.capabilitySelectionsForWorkUnits[] with selectedCapabilityId validation_run or test_authoring",
            "cost-aware capability selection",
            "The post-synthesis graph must include an actual validation/test capability selection, not just prose saying validation happens later.",
            {
              workUnitId: "validation-proof",
              selectedCapabilityId: "validation_run",
              consideredCapabilityIds: ["validation_run", "test_authoring"],
              utilityRationale: "Focused validation produces command refs mapped to commitments.",
              costRationale:
                "Validation runner is cheaper than Codex implementation for running approved checks.",
              whyThisIsNotDuplicateWork:
                "No validation node has produced accepted evidence for these commitments.",
              stopOrEscalationCondition:
                "Return validation failure evidence to the scheduler for repair planning.",
            },
          ),
        );
      }
      if (missingRole === "review") {
        add(
          missingField(
            "stagedScheduler.capabilitySelectionsForWorkUnits[] with selectedCapabilityId reviewer",
            "cost-aware capability selection",
            "The post-synthesis graph must include an actual reviewer capability selection before successful closeout.",
            {
              workUnitId: "model-review",
              selectedCapabilityId: "reviewer",
              consideredCapabilityIds: ["reviewer"],
              utilityRationale:
                "Reviewer judges evidence sufficiency after implementation and validation.",
              costRationale:
                "Reviewer is a specialized standard-cost role, not a broad implementation node.",
              whyThisIsNotDuplicateWork:
                "No review node has evaluated the implementation evidence.",
              stopOrEscalationCondition: "Return blocking findings to the scheduler for repair.",
            },
          ),
        );
      }
      if (missingRole === "docs_or_readback") {
        add(
          missingField(
            "stagedScheduler.capabilitySelectionsForWorkUnits[] with selectedCapabilityId observability_readback",
            "cost-aware capability selection",
            "The post-synthesis graph must include an actual docs/readback capability selection. Mentioning docs/readback in rationale is not sufficient.",
            {
              workUnitId: "owner-readback",
              selectedCapabilityId: "observability_readback",
              consideredCapabilityIds: ["observability_readback"],
              utilityRationale:
                "Owner-facing readback maps graph state, files, tests, limitations, and next decision to the Work Queue.",
              costRationale:
                "Observability readback is a cheap specialized node and should not be absorbed by Codex implementation.",
              whyThisIsNotDuplicateWork:
                "No readback node has produced owner-facing Work Queue evidence for the post-synthesis graph.",
              stopOrEscalationCondition:
                "Return needs_review if runtime evidence refs are missing or stale.",
            },
          ),
        );
      }
      if (missingRole === "closeout") {
        add(
          missingField(
            "stagedScheduler.capabilitySelectionsForWorkUnits[] with selectedCapabilityId coding_closeout",
            "cost-aware capability selection",
            "The post-synthesis graph must include an actual model-authored closeout capability selection after evidence, validation, and review.",
            {
              workUnitId: "model-authored-closeout",
              selectedCapabilityId: "coding_closeout",
              consideredCapabilityIds: ["coding_closeout"],
              utilityRationale:
                "Closeout synthesizes accepted runtime evidence into the final model-authored capsule.",
              costRationale:
                "Closeout is a specialized finalization node and cannot be replaced by implementation.",
              whyThisIsNotDuplicateWork: "No model-authored closeout exists for this graph.",
              stopOrEscalationCondition:
                "Terminalize needs_review if blocking commitments remain open.",
            },
          ),
        );
      }
    }
    if (code.includes("post_synthesis_graph_codex")) {
      add(
        missingField(
          "stagedScheduler.capabilitySelectionsForWorkUnits[]",
          "cost-aware capability selections",
          "Broad Codex implementation may be used for foundation/integration work, but the graph must also represent cheaper or specialized capabilities and explain why any premium Codex node is necessary.",
          {
            workUnitId: "implementation-foundation",
            selectedCapabilityId: "implementation_complex",
            consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
            whyCheaperOptionsWereInsufficient:
              "The edit crosses runtime contracts and scheduler integration, so a premium integration node is justified for this unit only.",
          },
        ),
      );
    }
    if (code.includes("commitment") || code.includes("target_commitments")) {
      add(
        missingField(
          "newNodes[].commitmentIds",
          "string[]",
          "Every complex-work node must declare which Mission Ledger commitments it advances.",
          ["product-spec-planning-canonical-surface"],
        ),
      );
    }
    if (code.includes("expected_evidence") || code.includes("evidence_expectation")) {
      add(
        missingField(
          "newNodes[].capabilityId + newNodes[].commitmentIds",
          "runtime-derivable fields",
          "The model should not invent runtime evidence enums; the compiler derives expectedEvidence from capability, Mission Ledger, and workflow profile.",
          { capabilityId: "context_scout", commitmentIds: ["commitment-1"] },
        ),
      );
    }
    if (code.includes("cost_rationale")) {
      add(
        missingField(
          "costAwareUtilityDecision.costRationale",
          "string",
          "The orchestrator must explain why this capability is cost-appropriate for the commitment.",
          "Cheaper context scout closes uncertainty before expensive implementation.",
        ),
      );
    }
    if (code.includes("duplicate") || code.includes("repeat_capability")) {
      add(
        missingField(
          "costAwareUtilityDecision.whyThisIsNotDuplicateWork",
          "string",
          "Repeated or same-kind capability choices need a model-authored non-duplication rationale.",
          "This second scout targets different files from the first scout.",
        ),
      );
    }
    if (code.includes("stop_or_escalation") || code.includes("escalation")) {
      add(
        missingField(
          "costAwareUtilityDecision.stopOrEscalationCondition",
          "string",
          "The scheduler needs bounded stop/escalation criteria before running a node.",
          "Escalate to Codex if validation fails after one Kimi repair turn.",
        ),
      );
    }
    if (code.includes("qualification")) {
      add(
        missingField(
          "costAwareUtilityDecision.selectedModelQualificationProfileId + qualificationEvidenceRefs",
          "string plus string[]",
          "Production model/worker selection must cite the qualification profile and evidence refs used.",
          {
            selectedModelQualificationProfileId: "kimi.standard_implementation.v1",
            qualificationEvidenceRefs: ["model-qualification://kimi/standard-edits"],
          },
        ),
      );
    }
    if (code.includes("executor")) {
      add(
        missingField(
          "newNodes[].capabilityId",
          "string",
          "The compiler needs a capabilityId that maps to an executable graph node and executor.",
          "context_scout",
        ),
      );
    }
  }
  return [...fields.values()].slice(0, 20);
}

function schedulerRepairRequestForRejection(input: {
  compiledRepairRequest: ModelDecisionRepairRequest;
  failedDecisionId: string | null;
  reasonCodes: string[];
}): ModelDecisionRepairRequest {
  return repairRequestForMissingFields({
    failedDecisionId: input.failedDecisionId,
    missingFields: [
      ...input.compiledRepairRequest.missingFields,
      ...repairMissingFieldsForReasonCodes(input.reasonCodes),
    ],
    preserveFields: input.compiledRepairRequest.preserveFields,
    acceptedFields: input.compiledRepairRequest.acceptedFields,
    rejectedReasonCodes: input.reasonCodes,
  });
}

function needsReviewRetryPolicyReasonCodesForDecision(input: {
  decision: OrchestratorGraphDecision;
  recentNodeResultSummaries: RuntimeWorkGraphRecentNodeResultSummary[];
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
}): string[] {
  if (!["retry_node", "repair_from_validation", "run_node"].includes(input.decision.decisionKind)) {
    return [];
  }
  const targetNodeId = input.decision.runNodeId ?? input.decision.targetNodeId;
  if (!targetNodeId) {
    return [];
  }
  const targetSummary = [...input.recentNodeResultSummaries]
    .toReversed()
    .find((summary) => summary.nodeId === targetNodeId);
  if (!targetSummary || targetSummary.status !== "needs_review") {
    return [];
  }
  const targetNode = input.snapshotSummary.nodeSummaries.find(
    (node) => node.nodeId === targetNodeId,
  );
  const classificationRef = targetNode?.lastRepairClassificationRef ?? null;
  const repairStrategy = targetNode?.lastRepairStrategy ?? null;
  if (!classificationRef) {
    return [
      "needs_review_retry_rejected_repair_classification_missing",
      `needs_review_retry_target_missing_repair_classification:${targetNodeId}`,
    ];
  }
  if (repairStrategy === "terminal_needs_review" || repairStrategy === "no_retry") {
    return [
      "needs_review_retry_rejected_by_repair_classification_strategy",
      `needs_review_retry_target_strategy:${targetNodeId}:${repairStrategy}`,
    ];
  }
  const requiresHighCapability = targetSummary.reasonCodes.some(
    (code) =>
      code === "non_codex_worker_schema_contract_edit_requires_high_capability_escalation" ||
      code === "non_codex_worker_model_call_timeout_escalated" ||
      code === "worker_escalation_recorded",
  );
  if (!requiresHighCapability) {
    return [];
  }
  return [
    "needs_review_retry_rejected_high_capability_escalation_required",
    `needs_review_retry_target_requires_high_capability_escalation:${targetNodeId}`,
  ];
}

function failedBoundaryKindForNode(
  node: TeamGraphNode,
): RuntimeRepairClassification["failedBoundaryKind"] {
  if (node.nodeKind === "context_scout") {
    return "context_scout";
  }
  if (node.nodeKind === "context_synthesis") {
    return "context_synthesis";
  }
  if (node.nodeKind === "validation" || node.nodeKind === "test_review") {
    return "validation";
  }
  if (node.nodeKind === "reviewer") {
    return "review";
  }
  if (node.nodeKind === "closeout") {
    return "closeout";
  }
  if (node.nodeKind === "human_task") {
    return "supervisor";
  }
  if (node.nodeKind.includes("implementation") || node.nodeKind.includes("worker")) {
    return "worker_loop";
  }
  return "node_execution";
}

function buildNodeRepairClassification(input: {
  runtimeJobId: string | null;
  workflowId: string | null;
  graphId: string;
  iteration: number;
  node: TeamGraphNode;
  decision?: OrchestratorGraphDecision;
  result: RuntimeWorkGraphNodeExecutionResult;
  missionEvidenceReasonCodes: string[];
  nodeCommitmentIds: string[];
  schedulerToolInvocationRefs: string[];
  outputArtifactRefs: string[];
  repairFieldPaths?: string[];
  resumeCheckpointRefs?: string[];
}): RuntimeRepairClassification {
  const reasonCodes = uniqueStrings([
    ...input.result.reasonCodes,
    ...input.missionEvidenceReasonCodes,
    "repair_classification_required_before_retry",
  ]).slice(0, 40);
  const failureClass = failureClassFromReasonCodes({
    reasonCodes,
    nodeKind: input.node.nodeKind,
    status: input.result.status,
  });
  const classificationId = `${input.graphId}:${input.iteration}:${input.node.nodeId}:repair`;
  return buildRuntimeRepairClassification({
    classificationId,
    classificationRef: graphRef("repair-classification", `${input.node.nodeId}/${input.iteration}`),
    runtimeJobId: input.runtimeJobId,
    workflowId: input.workflowId,
    graphId: input.graphId,
    nodeId: input.node.nodeId,
    failedSchedulerDecisionId: input.decision?.decisionId ?? null,
    failedRuntimeToolInvocationRefs: input.schedulerToolInvocationRefs,
    failedBoundaryKind: failedBoundaryKindForNode(input.node),
    failedCommitmentIds: input.nodeCommitmentIds,
    failedFieldPaths: input.repairFieldPaths ?? [],
    failedRefPaths: input.outputArtifactRefs,
    failureClass,
    runtimeExplanation:
      "Runtime recorded bounded structural failure evidence before allowing repair, retry, escalation, or upstream replay.",
    reasonCodes,
    preservedRefs: input.outputArtifactRefs,
    resumeCheckpointRefs: input.resumeCheckpointRefs,
    evidenceRefs: input.outputArtifactRefs,
    stopOrEscalationCondition:
      "If the selected repair boundary cannot produce bounded evidence, terminalize needs_review instead of retrying blindly.",
  });
}

function terminalGraphStatusForSchedulerStatus(
  status: RuntimeWorkGraphSchedulerResult["status"],
): TeamRunGraphStatus {
  if (status === "succeeded") {
    return "succeeded";
  }
  if (status === "waiting_for_human") {
    return "waiting_for_human";
  }
  if (status === "failed") {
    return "failed";
  }
  return "needs_review";
}

function schedulerGraphCompletionReady(input: {
  snapshot: RuntimeWorkGraphSnapshot;
  missionLedger: MissionContractLedger | null;
  executors: Record<string, RuntimeWorkGraphNodeExecutor>;
}): { ready: boolean; closeoutRefs: string[]; pendingNodeIds: string[]; reasonCodes: string[] } {
  const reasonCodes: string[] = [];
  if (input.missionLedger && missionLedgerHasOpenBlockingCommitments(input.missionLedger)) {
    reasonCodes.push("scheduler_completion_blocked_by_open_mission_commitments");
  }
  const executableNodes = input.snapshot.nodes.filter((node) =>
    nodeHasExecutableAdapter({ node, executors: input.executors }),
  );
  const pendingNodeIds = executableNodes
    .filter((node) => ["planned", "running", "needs_review"].includes(node.nodeStatus))
    .map((node) => node.nodeId);
  if (pendingNodeIds.length > 0) {
    reasonCodes.push("scheduler_completion_blocked_by_pending_graph_nodes");
  }
  if (executableNodes.some((node) => node.nodeStatus === "failed")) {
    reasonCodes.push("scheduler_completion_blocked_by_failed_graph_node");
  }
  const closeoutRefs = executableNodes
    .filter((node) => node.nodeKind === "closeout" && node.nodeStatus === "succeeded")
    .flatMap((node) => node.outputArtifactRefs)
    .filter((ref) => ref.includes("closeout"))
    .slice(0, 20);
  if (closeoutRefs.length === 0) {
    reasonCodes.push("scheduler_completion_blocked_by_missing_closeout_node_evidence");
  }
  return {
    ready: reasonCodes.length === 0,
    closeoutRefs,
    pendingNodeIds,
    reasonCodes,
  };
}

function roleCoverageSkipJustified(decision: OrchestratorGraphDecision): boolean {
  const metadata = jsonRecord(decision.metadata ?? {});
  return (
    (Array.isArray(metadata.roleDiversitySkipJustifications) &&
      metadata.roleDiversitySkipJustifications.length > 0) ||
    (Array.isArray(metadata.roleCoverageSkipJustifications) &&
      metadata.roleCoverageSkipJustifications.length > 0)
  );
}

function roleCoverageClassForNode(node: TeamGraphNode): RuntimeWorkGraphRoleCoverageClass | null {
  if (node.assignedRole === "context_scout" || node.nodeKind === "context_scout") {
    return "context";
  }
  if (node.assignedRole === "implementation_engineer" || node.nodeKind === "implementation") {
    return "implementation";
  }
  if (
    node.assignedRole === "test_engineer" ||
    ["validation", "test_review", "test_authoring", "repair"].includes(node.nodeKind)
  ) {
    return "validation_or_test";
  }
  if (
    node.assignedRole === "reviewer" ||
    node.nodeKind === "reviewer" ||
    node.nodeKind === "security_review"
  ) {
    return "review";
  }
  if (
    node.assignedRole === "planning_orchestrator" ||
    node.assignedRole === "context_synthesis" ||
    node.nodeKind === "orchestrator_plan" ||
    node.nodeKind === "context_synthesis"
  ) {
    return "planning";
  }
  if (node.nodeKind === "web_research") {
    return "research";
  }
  if (node.nodeKind === "planning_capsule") {
    return "planning_capsule";
  }
  if (node.nodeKind === "human_task") {
    return "human_decision";
  }
  if (node.nodeKind === "action_graph_compile" || node.nodeKind === "compiler") {
    return "action_proposal_or_compile";
  }
  if (node.nodeKind === "closeout") {
    return "closeout";
  }
  return null;
}

function roleCoverageReasonCodes(input: {
  snapshot: RuntimeWorkGraphSnapshot | null;
  decision: OrchestratorGraphDecision;
  missionLedger: MissionContractLedger | null;
  roleCoverageProfile: RuntimeWorkGraphRoleCoverageProfile | null;
}): string[] {
  if (
    !missionIsComplex(input.missionLedger) ||
    roleCoverageSkipJustified(input.decision) ||
    !input.roleCoverageProfile
  ) {
    return [];
  }
  const succeededNodes = (input.snapshot?.nodes ?? []).filter(
    (node) => node.nodeStatus === "succeeded",
  );
  const coveredClasses = new Set(
    succeededNodes
      .map(roleCoverageClassForNode)
      .filter((roleClass): roleClass is RuntimeWorkGraphRoleCoverageClass => Boolean(roleClass)),
  );
  const reasonCodes = input.roleCoverageProfile.requiredClasses
    .filter((roleClass) => !coveredClasses.has(roleClass))
    .map(
      (roleClass) =>
        `role_coverage_missing:${input.roleCoverageProfile?.profileId ?? "unknown"}:${roleClass}`,
    );
  const succeededRoles = new Set(
    (input.snapshot?.nodes ?? [])
      .filter((node) => node.nodeStatus === "succeeded")
      .map((node) => node.assignedRole),
  );
  if (succeededRoles.size < Math.min(3, input.roleCoverageProfile.requiredClasses.length)) {
    reasonCodes.push("complex_mission_role_diversity_insufficient");
  }
  return reasonCodes;
}

function evaluateLoopGuard(input: {
  guard: RuntimeWorkGraphLoopGuard;
  node: TeamGraphNode;
  result: RuntimeWorkGraphNodeExecutionResult;
  missionLedgerBefore: MissionContractLedger | null;
  missionLedgerAfter: MissionContractLedger | null;
}): RuntimeWorkGraphLoopGuardDecision {
  const signature = nodeLoopSignature(input.node);
  const newEvidenceRefs = input.result.outputArtifactRefs.filter(
    (ref) => !input.guard.seenEvidenceRefs.has(ref),
  );
  const roleDiversityAdvanced = !input.guard.roleIdsSeen.has(input.node.assignedRole);
  const ledgerAdvanced = missionLedgerProgressed(
    input.missionLedgerBefore,
    input.missionLedgerAfter,
  );
  const missionStillOpen =
    input.missionLedgerAfter !== null &&
    missionLedgerHasOpenBlockingCommitments(input.missionLedgerAfter);
  const nodeIsReportOnly = input.node.nodeKind === "closeout" || input.node.nodeKind === "reviewer";
  const nodeProducedAcceptedWork =
    input.result.status === "succeeded" ||
    input.result.status === "waiting_for_human" ||
    (input.result.evidenceClaims?.length ?? 0) > 0 ||
    ledgerAdvanced;
  const evidenceAdvancesProgress =
    !(missionStillOpen && nodeIsReportOnly) &&
    newEvidenceRefs.length > 0 &&
    nodeProducedAcceptedWork;
  for (const ref of input.result.outputArtifactRefs) {
    input.guard.seenEvidenceRefs.add(ref);
  }
  input.guard.roleIdsSeen.add(input.node.assignedRole);
  if (evidenceAdvancesProgress || roleDiversityAdvanced || ledgerAdvanced) {
    input.guard.repeatedNoProgressBySignature.set(signature, 0);
    return { halted: false, reasonCodes: [] };
  }
  const count = (input.guard.repeatedNoProgressBySignature.get(signature) ?? 0) + 1;
  input.guard.repeatedNoProgressBySignature.set(signature, count);
  if (count >= 2) {
    return {
      halted: true,
      reasonCodes: [
        "scheduler_same_kind_loop_guard_triggered",
        `scheduler_loop_signature:${signature}`,
        "scheduler_no_new_evidence_or_mission_progress",
      ],
    };
  }
  return {
    halted: false,
    reasonCodes: ["scheduler_same_kind_no_progress_observed"],
  };
}

function findExecutor(
  executors: Record<string, RuntimeWorkGraphNodeExecutor>,
  node: TeamGraphNode,
): RuntimeWorkGraphNodeExecutor | null {
  for (const key of executorKeyForNode(node)) {
    if (executors[key]) {
      return executors[key];
    }
  }
  return null;
}

function executionStatusToNodeStatus(
  status: RuntimeWorkGraphNodeExecutionResult["status"],
): "succeeded" | "needs_review" | "failed" | "waiting_for_human" {
  if (status === "blocked") {
    return "needs_review";
  }
  if (status === "canceled") {
    return "failed";
  }
  return status;
}

function nodeFailureIsExplicitlyUnrecoverable(
  result: RuntimeWorkGraphNodeExecutionResult,
): boolean {
  const metadata = jsonRecord(result.metadata ?? {});
  return (
    metadata.unrecoverable === true ||
    result.reasonCodes.some((code) =>
      [
        "unrecoverable",
        "primary_prohibited",
        "authority_denied",
        "storage_policy_violation",
        "raw_storage_violation",
      ].some((marker) => code.includes(marker)),
    )
  );
}

export class RuntimeWorkGraphScheduler {
  private readonly maxIterations: number;
  private readonly maxDecisionRepairAttempts: number;
  private readonly maxParallelNodeExecutions: number;
  private readonly capabilityManifest: RuntimeNodeCapabilityManifest;
  private readonly recentNodeResultSummaries: RuntimeWorkGraphRecentNodeResultSummary[] = [];

  constructor(private readonly options: RuntimeWorkGraphSchedulerOptions) {
    this.maxIterations = options.maxIterations ?? 24;
    this.maxDecisionRepairAttempts = options.maxDecisionRepairAttempts ?? 2;
    this.maxParallelNodeExecutions = Math.max(
      1,
      Math.min(16, options.maxParallelNodeExecutions ?? 1),
    );
    this.capabilityManifest = options.capabilityManifest ?? buildRuntimeNodeCapabilityManifest();
  }

  async run(graphId: string): Promise<RuntimeWorkGraphSchedulerResult> {
    const executedNodeIds: string[] = [];
    const addedNodeIds: string[] = [];
    const decisionRefs: string[] = [];
    const reasonCodes: string[] = [];
    let missionLedger = this.options.missionLedger ?? null;
    if (this.options.requireSchedulerToolKernel === true && !this.options.runtimeToolKernel) {
      return await this.result({
        status: "needs_review",
        graphId,
        iterations: 0,
        executedNodeIds,
        addedNodeIds,
        decisionRefs,
        reasonCodes: [
          "scheduler_tool_kernel_required_missing",
          "scheduler_toolified_path_required_for_production",
        ],
        missionLedger: missionLedger ? summarizeMissionContractLedger(missionLedger) : null,
      });
    }
    const loopGuard: RuntimeWorkGraphLoopGuard = {
      seenEvidenceRefs: new Set(),
      roleIdsSeen: new Set(),
      repeatedNoProgressBySignature: new Map(),
    };
    for (let iteration = 1; iteration <= this.maxIterations; iteration += 1) {
      const missionReadinessTool = await this.recordSchedulerTool({
        graphId,
        iteration,
        toolId: "scheduler.mission_ledger_readiness",
        idempotencyKey: `iteration:${iteration}:mission-ledger-readiness`,
        inputRef: missionLedger ? `mission-contract://${missionLedger.missionId}` : null,
        inputSummary: missionLedger
          ? `Mission Ledger ${missionLedger.missionId} is present for staged scheduler readiness.`
          : "Mission Ledger is absent; scheduler readiness must decide whether work can continue.",
        metadata: {
          ledgerPresent: Boolean(missionLedger),
          ledgerStatus: missionLedger?.ledgerStatus ?? null,
          missionGate: missionLedger?.missionGate ?? null,
          schedulerPhase: "planning_in_progress",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      decisionRefs.push(...missionReadinessTool.refs);
      reasonCodes.push(...missionReadinessTool.reasonCodes);
      const missionGateStatus = await this.evaluateMissionGateBeforeWork({
        graphId,
        iteration,
        missionLedger,
      });
      if (missionGateStatus) {
        return await this.result({
          status: missionGateStatus.status,
          graphId,
          iterations: iteration - 1,
          executedNodeIds,
          addedNodeIds,
          decisionRefs,
          reasonCodes: [...reasonCodes, ...missionGateStatus.reasonCodes],
          missionLedger: missionLedger ? summarizeMissionContractLedger(missionLedger) : null,
        });
      }
      const snapshot = await this.options.graphs.readGraphSnapshot(graphId);
      if (!snapshot) {
        return await this.result({
          status: "failed",
          graphId,
          iterations: iteration - 1,
          executedNodeIds,
          addedNodeIds,
          decisionRefs,
          reasonCodes: ["runtime_work_graph_not_found"],
        });
      }
      const parallelFrontier = await this.tryRunParallelRunnableFrontier({
        graphId,
        iteration,
        snapshot,
        missionLedger,
        executedNodeIds,
        loopGuard,
      });
      if (parallelFrontier) {
        missionLedger = parallelFrontier.missionLedger ?? missionLedger;
        reasonCodes.push(...parallelFrontier.reasonCodes);
        if (parallelFrontier.status !== "continue") {
          return await this.result({
            status: parallelFrontier.status,
            graphId,
            iterations: iteration,
            executedNodeIds,
            addedNodeIds,
            decisionRefs,
            reasonCodes,
            missionLedger: missionLedger ? summarizeMissionContractLedger(missionLedger) : null,
          });
        }
        continue;
      }
      const completionReady = schedulerGraphCompletionReady({
        snapshot,
        missionLedger,
        executors: this.options.executors,
      });
      if (completionReady.ready) {
        const completionTool = await this.recordSchedulerTool({
          graphId,
          iteration,
          toolId: "scheduler.evaluate_completion_readiness",
          idempotencyKey: `iteration:${iteration}:runtime-owned-completion-readiness`,
          inputRef: completionReady.closeoutRefs[0] ?? graphRef("graph", graphId),
          inputSummary:
            "Runtime accepted graph completion because all executable graph nodes are terminal, Mission Ledger has no blocking commitments, and closeout node evidence exists.",
          metadata: {
            closeoutRefs: completionReady.closeoutRefs,
            schedulerPhase: "completion_review_readiness",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        });
        return await this.result({
          status: "succeeded",
          graphId,
          iterations: iteration,
          executedNodeIds,
          addedNodeIds,
          decisionRefs,
          reasonCodes: [
            ...reasonCodes,
            ...completionTool.reasonCodes,
            "scheduler_runtime_owned_completion_ready",
            "scheduler_graph_terminal_closeout_evidence_present",
          ],
          missionLedger: missionLedger ? summarizeMissionContractLedger(missionLedger) : null,
        });
      }
      const decisionRequest = await this.requestValidDecision({
        graphId,
        iteration,
        snapshotSummary: summarizeSnapshot(snapshot),
        missionLedger,
      });
      decisionRefs.push(...decisionRequest.decisionRefs);
      if (!decisionRequest.decision) {
        return await this.result({
          status: "needs_review",
          graphId,
          iterations: iteration,
          executedNodeIds,
          addedNodeIds,
          decisionRefs,
          reasonCodes: [...decisionRequest.reasonCodes, "no_fallback_graph_injected"],
        });
      }
      const decision = decisionRequest.decision;
      reasonCodes.push(...decisionRequest.reasonCodes);
      const applied = await this.applyDecision({
        graphId,
        decision,
        iteration,
        missionLedger,
        executedNodeIds,
        addedNodeIds,
        loopGuard,
      });
      missionLedger = applied.missionLedger ?? missionLedger;
      reasonCodes.push(...applied.reasonCodes);
      if (applied.status !== "continue") {
        return await this.result({
          status: applied.status,
          graphId,
          iterations: iteration,
          executedNodeIds,
          addedNodeIds,
          decisionRefs,
          reasonCodes,
          missionLedger: missionLedger ? summarizeMissionContractLedger(missionLedger) : null,
        });
      }
    }
    return await this.result({
      status: "max_iterations",
      graphId,
      iterations: this.maxIterations,
      executedNodeIds,
      addedNodeIds,
      decisionRefs,
      reasonCodes: [...reasonCodes, "scheduler_max_iterations_reached"],
      missionLedger: missionLedger ? summarizeMissionContractLedger(missionLedger) : null,
    });
  }

  private async evaluateMissionGateBeforeWork(input: {
    graphId: string;
    iteration: number;
    missionLedger: MissionContractLedger | null;
  }): Promise<{ status: "failed" | "needs_review"; reasonCodes: string[] } | null> {
    if (this.options.requireMissionLedgerForExecutionWorkflow && !input.missionLedger) {
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind: "mission_contract_ledger_required_missing",
        stateSummary:
          "Execution workflow scheduler stopped before child work because a valid Mission Contract Ledger is required.",
        artifactRefs: [],
      });
      return {
        status: "needs_review",
        reasonCodes: [
          "mission_contract_ledger_required_for_execution_workflow",
          "scheduler_child_work_blocked_until_mission_ledger_valid",
        ],
      };
    }
    if (!input.missionLedger) {
      return null;
    }
    if (missionLedgerBlocksExecution(input.missionLedger)) {
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind: "mission_contract_primary_prohibited_blocked",
        stateSummary:
          "Mission Contract Ledger classified the primary mission as prohibited; scheduler stopped before child work.",
        artifactRefs: [`mission-contract://${input.missionLedger.missionId}/mission-gate`],
      });
      return {
        status: "failed",
        reasonCodes: [
          "mission_contract_primary_prohibited",
          `mission_gate:${input.missionLedger.missionGate}`,
        ],
      };
    }
    if (missionLedgerRequiresReviewBeforeExecution(input.missionLedger)) {
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind: "mission_contract_needs_review_before_work",
        stateSummary:
          "Mission Contract Ledger requires review before scheduler can start child work.",
        artifactRefs: [`mission-contract://${input.missionLedger.missionId}/mission-gate`],
      });
      return {
        status: "needs_review",
        reasonCodes: [
          "mission_contract_needs_review_before_work",
          `mission_gate:${input.missionLedger.missionGate}`,
        ],
      };
    }
    return null;
  }

  private recentNodeResultSummariesForDecision(
    snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary,
  ): RuntimeWorkGraphRecentNodeResultSummary[] {
    const existingNodeIds = new Set(
      this.recentNodeResultSummaries.map((summary) => summary.nodeId),
    );
    const persistedSummaries = snapshotSummary.nodeSummaries
      .filter(
        (node) =>
          !existingNodeIds.has(node.nodeId) &&
          node.outputArtifactRefs.length > 0 &&
          ["succeeded", "needs_review", "failed", "blocked"].includes(node.nodeStatus),
      )
      .map(
        (node): RuntimeWorkGraphRecentNodeResultSummary => ({
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          assignedRole: node.assignedRole,
          status: node.nodeStatus as RuntimeWorkGraphNodeExecutionResult["status"],
          outputArtifactRefs: node.outputArtifactRefs.slice(0, 16),
          ownerSummary: `Persisted ${node.nodeStatus} node output refs are available after scheduler resume.`,
          eli5Summary:
            node.nodeStatus === "needs_review"
              ? "A previous worker stopped with bounded diagnostic evidence; the scheduler can use those refs to repair or escalate."
              : "A previous worker produced bounded evidence; the scheduler can continue from those refs after resume.",
          reasonCodes: [
            `scheduler_resume_persisted_node_result:${node.nodeStatus}`,
            "scheduler_resume_uses_persisted_node_output_refs",
            ...(node.lastStatusReasonCodes ?? []),
            ...(node.highCapabilityEscalationRequired
              ? ["non_codex_worker_schema_contract_edit_requires_high_capability_escalation"]
              : []),
          ],
          metadataSummary: {
            artifactKind: "runtime_work_graph_persisted_node_result_summary",
            nodeId: node.nodeId,
            nodeKind: node.nodeKind,
            nodeStatus: node.nodeStatus,
            capabilityId: node.capabilityId ?? node.metadataCapabilityId ?? null,
            commitmentIdsAdvanced: node.commitmentIdsAdvanced ?? [],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        }),
      );
    return [...this.recentNodeResultSummaries, ...persistedSummaries].slice(-12);
  }

  private async requestValidDecision(input: {
    graphId: string;
    iteration: number;
    snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
    missionLedger: MissionContractLedger | null;
  }): Promise<{
    decision: OrchestratorGraphDecision | null;
    decisionRefs: string[];
    reasonCodes: string[];
  }> {
    const decisionRefs: string[] = [];
    const reasonCodes: string[] = [];
    const commitmentWorkPackets = this.options.commitmentWorkPackets ?? [];
    const packetValidation = validateCommitmentWorkPacketsForScheduler({
      packets: commitmentWorkPackets,
      ledger: input.missionLedger,
    });
    const packetReadinessTool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: "scheduler.commitment_work_packet_readiness",
      idempotencyKey: `iteration:${input.iteration}:commitment-work-packet-readiness`,
      inputRef: input.missionLedger
        ? `mission-contract://${input.missionLedger.missionId}/commitment-work-packets`
        : null,
      inputSummary: packetValidation.valid
        ? "Model-authored Commitment Work Packets are accepted for staged scheduler planning."
        : "Commitment Work Packets are missing or not ready for staged scheduler planning.",
      metadata: {
        packetCount: commitmentWorkPackets.length,
        packetValidationValid: packetValidation.valid,
        reasonCodes: packetValidation.reasonCodes,
        commitmentWorkPackets: summarizeCommitmentWorkPacketsForProgress(commitmentWorkPackets),
        schedulerPhase: "planning_in_progress",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    decisionRefs.push(...packetReadinessTool.refs);
    reasonCodes.push(...packetReadinessTool.reasonCodes);
    if (
      this.options.requireModelAuthoredCommitmentWorkPacketsForComplexMission === true &&
      !packetValidation.valid &&
      missionIsComplex(input.missionLedger)
    ) {
      const missingPacketTool = await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "scheduler.reject_staged_graph",
        idempotencyKey: `iteration:${input.iteration}:commitment-work-packets-not-ready`,
        inputRef: input.missionLedger
          ? `mission-contract://${input.missionLedger.missionId}/commitment-work-packets`
          : null,
        inputSummary:
          "Scheduler refused to start complex graph planning because model-authored commitment work packets were not accepted.",
        metadata: {
          reasonCodes: packetValidation.reasonCodes,
          packetCount: commitmentWorkPackets.length,
          commitmentWorkPackets: summarizeCommitmentWorkPacketsForProgress(commitmentWorkPackets),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      return {
        decision: null,
        decisionRefs: missingPacketTool.refs,
        reasonCodes: [
          "approved_commitment_work_packets_required",
          ...packetValidation.reasonCodes,
          ...missingPacketTool.reasonCodes,
        ],
      };
    }
    if (commitmentWorkPackets.length > 0) {
      reasonCodes.push(
        packetValidation.valid
          ? "model_authored_commitment_work_packets_accepted"
          : "commitment_work_packets_available_but_not_scheduler_ready",
      );
    }
    const packetContextScoutFanoutDecision = deterministicPacketContextScoutFanoutDecision({
      graphId: input.graphId,
      iteration: input.iteration,
      snapshotSummary: input.snapshotSummary,
      missionLedger: input.missionLedger,
      commitmentWorkPackets,
      capabilityManifest: this.capabilityManifest,
    });
    if (packetContextScoutFanoutDecision) {
      const decisionRef = graphRef(
        "orchestrator-decision",
        packetContextScoutFanoutDecision.decisionId,
      );
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind: "runtime_policy_packet_context_fanout_created",
        stateSummary: packetContextScoutFanoutDecision.rationaleForDecision,
        artifactRefs: [decisionRef],
      });
      return {
        decision: packetContextScoutFanoutDecision,
        decisionRefs: [...decisionRefs, decisionRef],
        reasonCodes: [
          ...reasonCodes,
          ...packetContextScoutFanoutDecision.reasonCodes,
          "runtime_policy_packet_context_fanout_bypassed_orchestrator_decision",
        ],
      };
    }
    const contextSynthesisDecision = deterministicContextSynthesisDecision({
      graphId: input.graphId,
      iteration: input.iteration,
      snapshotSummary: input.snapshotSummary,
      missionLedger: input.missionLedger,
      commitmentWorkPackets,
      capabilityManifest: this.capabilityManifest,
    });
    if (contextSynthesisDecision) {
      const decisionRef = graphRef("orchestrator-decision", contextSynthesisDecision.decisionId);
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind:
          contextSynthesisDecision.decisionKind === "add_nodes"
            ? "runtime_policy_context_synthesis_barrier_created"
            : "runtime_policy_context_synthesis_barrier_selected",
        stateSummary: contextSynthesisDecision.rationaleForDecision,
        artifactRefs: [decisionRef],
      });
      return {
        decision: contextSynthesisDecision,
        decisionRefs: [...decisionRefs, decisionRef],
        reasonCodes: [
          ...reasonCodes,
          ...contextSynthesisDecision.reasonCodes,
          "runtime_policy_context_synthesis_barrier_bypassed_orchestrator_decision",
        ],
      };
    }
    const postSynthesisCompiledDecision = runtimeCompiledPostSynthesisGraphDecision({
      graphId: input.graphId,
      iteration: input.iteration,
      snapshotSummary: input.snapshotSummary,
      missionLedger: input.missionLedger,
      capabilityManifest: this.capabilityManifest,
      executableExecutorKeys: Object.keys(this.options.executors),
      recentNodeResultSummaries: this.recentNodeResultSummaries,
    });
    if (postSynthesisCompiledDecision) {
      const decisionRef = graphRef(
        "orchestrator-decision",
        postSynthesisCompiledDecision.decisionId,
      );
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind:
          postSynthesisCompiledDecision.decisionKind === "add_nodes"
            ? "runtime_policy_post_synthesis_graph_compiled"
            : "runtime_policy_post_synthesis_graph_compilation_blocked",
        stateSummary: postSynthesisCompiledDecision.rationaleForDecision,
        artifactRefs: [decisionRef],
      });
      return {
        decision: postSynthesisCompiledDecision,
        decisionRefs: [...decisionRefs, decisionRef],
        reasonCodes: [
          ...reasonCodes,
          ...postSynthesisCompiledDecision.reasonCodes,
          "runtime_policy_post_synthesis_graph_bypassed_orchestrator_decision",
        ],
      };
    }
    const decisionPhase = schedulerDecisionCapabilityPhase({
      snapshotSummary: input.snapshotSummary,
      missionLedger: input.missionLedger,
    });
    const postSynthesisGraphPlanningActive =
      missionIsComplex(input.missionLedger) &&
      acceptedContextSynthesisExists(input.snapshotSummary);
    const decisionManifestPhase = postSynthesisGraphPlanningActive ? null : decisionPhase;
    const decisionCapabilityManifest = filterRuntimeNodeCapabilityManifestForExecutors({
      executableExecutorKeys: Object.keys(this.options.executors),
      workflowId: input.snapshotSummary.workflowId,
      phase: decisionManifestPhase,
      manifest: this.capabilityManifest,
    });
    const decisionCapabilityRegistrySummary = runtimeNodeCapabilityManifestForModel({
      executableExecutorKeys: Object.keys(this.options.executors),
      workflowId: input.snapshotSummary.workflowId,
      phase: decisionManifestPhase,
    });
    const postSynthesisRoleObligationGuidance = buildPostSynthesisRoleObligationGuidance({
      snapshotSummary: input.snapshotSummary,
      missionLedger: input.missionLedger,
      capabilityManifest: decisionCapabilityManifest,
    });
    const recentNodeResultSummaries = this.recentNodeResultSummariesForDecision(
      input.snapshotSummary,
    );
    let rejectedDecisionReasonCodes: string[] = [];
    let rejectedDecisionDiagnostics: OrchestratorGraphRejectedNodeDiagnostic[] = [];
    let rejectedDecisionRef: string | null = null;
    let rejectedDecisionRepairRequest: ModelDecisionRepairRequest | null = null;
    for (
      let repairAttempt = 0;
      repairAttempt <= this.maxDecisionRepairAttempts;
      repairAttempt += 1
    ) {
      const rawDecision = await this.options.orchestrator.decide({
        graphId: input.graphId,
        iteration: input.iteration,
        snapshotSummary: input.snapshotSummary,
        missionLedgerSummary: input.missionLedger
          ? summarizeMissionContractLedger(input.missionLedger)
          : null,
        commitmentWorkPackets,
        recentNodeResultSummaries: recentNodeResultSummaries.slice(-8),
        capabilityRegistrySummary: decisionCapabilityRegistrySummary,
        postSynthesisRoleObligationGuidance: postSynthesisRoleObligationGuidance.applies
          ? postSynthesisRoleObligationGuidance
          : null,
        repairAttempt,
        rejectedDecisionReasonCodes,
        rejectedDecisionDiagnostics,
        rejectedDecisionRef,
        repairFieldHints: repairFieldHintsForReasonCodes(rejectedDecisionReasonCodes),
        repairDiagnostics: rejectedDecisionRepairRequest,
        acceptedDecisionFieldRefs: [],
        rawPromptStored: false,
        rawResponseStored: false,
      });
      if (repairAttempt === 0 && commitmentWorkPackets.length > 0) {
        const packetTool = await this.recordSchedulerTool({
          graphId: input.graphId,
          iteration: input.iteration,
          toolId: "scheduler.draft_commitment_work_breakdown",
          idempotencyKey: `iteration:${input.iteration}:commitment-work-packets`,
          inputRef: `mission-contract://${input.missionLedger?.missionId ?? input.graphId}/commitment-work-packets`,
          inputSummary:
            "Runtime compiled Mission Ledger commitments into bounded work packets for child delegation.",
          metadata: {
            packetCount: commitmentWorkPackets.length,
            commitmentWorkPackets: summarizeCommitmentWorkPacketsForProgress(commitmentWorkPackets),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        });
        decisionRefs.push(...packetTool.refs);
        reasonCodes.push(...packetTool.reasonCodes);
      }
      const compiled = compileOrchestratorGraphDecision(rawDecision, {
        capabilityManifest: decisionCapabilityManifest,
        executableExecutorKeys: Object.keys(this.options.executors),
        requireNodeCommitmentContracts: missionIsComplex(input.missionLedger),
        requireStagedProtocolForNodeCreation:
          this.options.requireGenericStagedSchedulerProtocol === true &&
          missionIsComplex(input.missionLedger),
      });
      const decision = compiled.decision
        ? attachRuntimeDerivedEvidenceToDecision({
            decision: compiled.decision,
            missionLedger: input.missionLedger,
            capabilityManifest: this.capabilityManifest,
          })
        : null;
      if (!decision) {
        const rejectedTool = await this.recordSchedulerTool({
          graphId: input.graphId,
          iteration: input.iteration,
          toolId: "scheduler.reject_staged_graph",
          idempotencyKey: `iteration:${input.iteration}:repair:${repairAttempt}:decision-invalid`,
          inputRef: rejectedDecisionRef,
          inputSummary:
            "Orchestrator decision could not be compiled into a canonical scheduler decision.",
          metadata: {
            repairAttempt,
            reasonCodes: ["orchestrator_decision_invalid_json"],
            repairDiagnostics: compiled.repairRequest,
            rejectedDecisionDiagnostics: compiled.rejectedNodeDiagnostics.slice(0, 8),
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        decisionRefs.push(...rejectedTool.refs);
        reasonCodes.push(...rejectedTool.reasonCodes);
        await this.options.graphs.recordCheckpoint({
          graphId: input.graphId,
          checkpointKind: "orchestrator_decision_rejected",
          stateSummary:
            repairAttempt > 0
              ? "Repaired orchestrator decision was not valid scheduler JSON; no fallback graph was injected."
              : "Orchestrator decision was not valid scheduler JSON; no fallback graph was injected.",
          artifactRefs: rejectedDecisionRef ? [rejectedDecisionRef] : [],
        });
        rejectedDecisionReasonCodes = ["orchestrator_decision_invalid_json"];
        rejectedDecisionDiagnostics = compiled.rejectedNodeDiagnostics;
        rejectedDecisionRepairRequest = compiled.repairRequest;
        reasonCodes.push(
          repairAttempt > 0
            ? "orchestrator_decision_repair_invalid_json"
            : "orchestrator_decision_invalid_json",
        );
        continue;
      }
      const validation = validateOrchestratorGraphDecision(decision, {
        executableExecutorKeys: Object.keys(this.options.executors),
        requireNodeCommitmentContracts: missionIsComplex(input.missionLedger),
      });
      const policyReasonCodes = validation.valid
        ? policyReasonCodesForDecision({
            decision,
            snapshotSummary: input.snapshotSummary,
            missionLedger: input.missionLedger,
            capabilityManifest: this.capabilityManifest,
          })
        : [];
      const postSynthesisGraphValidation = validation.valid
        ? validatePostSynthesisGraphDecision({
            decision,
            snapshotSummary: input.snapshotSummary,
            missionLedger: input.missionLedger,
            capabilityManifest: this.capabilityManifest,
          })
        : null;
      if (postSynthesisGraphValidation?.report.applies) {
        decision.metadata = {
          ...jsonRecord(decision.metadata ?? null),
          postSynthesisGraphQuality: postSynthesisGraphValidation.report,
          postSynthesisGraphQualityState: postSynthesisGraphValidation.valid
            ? "accepted"
            : "needs_repair",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        } satisfies JsonValue;
      }
      const utilityPolicyReasonCodes = validation.valid
        ? this.costAwarePolicyReasonCodes({
            decision,
            snapshotSummary: input.snapshotSummary,
            missionLedger: input.missionLedger,
          })
        : [];
      const genericStagedPolicyReasonCodes =
        validation.valid && this.options.requireGenericStagedSchedulerProtocol === true
          ? this.genericStagedPolicyReasonCodes(decision)
          : [];
      const needsReviewRetryPolicyReasonCodes = validation.valid
        ? needsReviewRetryPolicyReasonCodesForDecision({
            decision,
            recentNodeResultSummaries,
            snapshotSummary: input.snapshotSummary,
          })
        : [];
      const valid =
        validation.valid &&
        policyReasonCodes.length === 0 &&
        utilityPolicyReasonCodes.length === 0 &&
        genericStagedPolicyReasonCodes.length === 0 &&
        needsReviewRetryPolicyReasonCodes.length === 0;
      const decisionRef = graphRef("orchestrator-decision", decision.decisionId);
      if (decision.decisionId) {
        decisionRefs.push(decisionRef);
        rejectedDecisionRef = decisionRef;
      }
      if (!valid) {
        const rejectionReasonCodes = [
          ...compiled.reasonCodes,
          ...validation.reasonCodes,
          ...policyReasonCodes,
          ...utilityPolicyReasonCodes,
          ...genericStagedPolicyReasonCodes,
          ...needsReviewRetryPolicyReasonCodes,
        ];
        const repairDiagnostics = schedulerRepairRequestForRejection({
          compiledRepairRequest: compiled.repairRequest,
          failedDecisionId: decision.decisionId || rejectedDecisionRef,
          reasonCodes: rejectionReasonCodes,
        });
        const rejectedTool = await this.recordSchedulerTool({
          graphId: input.graphId,
          iteration: input.iteration,
          toolId: "scheduler.reject_staged_graph",
          idempotencyKey: `iteration:${input.iteration}:repair:${repairAttempt}:decision:${decision.decisionId || "unknown"}:policy-rejected`,
          inputRef: decision.decisionId ? decisionRef : rejectedDecisionRef,
          inputSummary:
            decision.rationaleForDecision ||
            "Orchestrator decision was rejected by scheduler policy or utility validation.",
          metadata: {
            repairAttempt,
            decisionId: decision.decisionId || null,
            decisionKind: decision.decisionKind,
            reasonCodes: rejectionReasonCodes.slice(0, 40),
            repairFieldHints: repairFieldHintsForReasonCodes(rejectionReasonCodes),
            repairDiagnostics,
            postSynthesisRoleObligationGuidance: postSynthesisRoleObligationGuidance.applies
              ? postSynthesisRoleObligationGuidance
              : null,
            postSynthesisGraphQuality: postSynthesisGraphValidation?.report ?? null,
            postSynthesisGraphQualityState: postSynthesisGraphValidation?.report.applies
              ? "needs_repair"
              : null,
            rejectedDecisionDiagnostics: compiled.rejectedNodeDiagnostics.slice(0, 8),
            acceptedAliasFields: compiled.acceptedAliasFields.slice(0, 16),
            modelOutputSummary: decision.rationaleForDecision || null,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        });
        decisionRefs.push(...rejectedTool.refs);
        reasonCodes.push(...rejectedTool.reasonCodes);
      }
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind: valid
          ? repairAttempt > 0
            ? `orchestrator_decision_repaired_${decision.decisionKind}`
            : `orchestrator_decision_${decision.decisionKind}`
          : "orchestrator_decision_rejected",
        stateSummary: decision.rationaleForDecision || "Orchestrator decision recorded.",
        artifactRefs: [
          ...(decision.decisionId ? [decisionRef] : []),
          ...compiled.rejectedNodeDiagnostics
            .map(
              (diagnostic) =>
                `orchestrator-diagnostic://${diagnostic.errorCode}/${diagnostic.nodeIndex}`,
            )
            .slice(0, 8),
        ],
      });
      if (valid) {
        return {
          decision,
          decisionRefs,
          reasonCodes:
            repairAttempt > 0
              ? [...reasonCodes, ...compiled.reasonCodes, "orchestrator_decision_repaired"]
              : [...reasonCodes, ...compiled.reasonCodes],
        };
      }
      rejectedDecisionReasonCodes = [
        ...compiled.reasonCodes,
        ...validation.reasonCodes,
        ...policyReasonCodes,
        ...utilityPolicyReasonCodes,
        ...needsReviewRetryPolicyReasonCodes,
      ];
      rejectedDecisionDiagnostics = compiled.rejectedNodeDiagnostics;
      rejectedDecisionRepairRequest = schedulerRepairRequestForRejection({
        compiledRepairRequest: compiled.repairRequest,
        failedDecisionId: decision.decisionId || rejectedDecisionRef,
        reasonCodes: rejectedDecisionReasonCodes,
      });
      reasonCodes.push(
        ...(repairAttempt > 0
          ? rejectedDecisionReasonCodes.map((code) => `orchestrator_decision_repair_${code}`)
          : rejectedDecisionReasonCodes),
      );
    }
    return { decision: null, decisionRefs, reasonCodes };
  }

  private costAwarePolicyReasonCodes(input: {
    decision: OrchestratorGraphDecision;
    snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
    missionLedger: MissionContractLedger | null;
  }): string[] {
    const decisionMetadata = jsonRecord(input.decision.metadata ?? {});
    const decisionLevelUtility = normalizeCostAwareCapabilityUtilityDecision(
      decisionMetadata.utilityDecision ?? decisionMetadata.costAwareUtilityDecision,
    );
    const missionSummary = input.missionLedger
      ? summarizeMissionContractLedger(input.missionLedger)
      : null;
    const reasonCodes: string[] = [];
    const nodes = input.decision.newNodes ?? [];
    for (const node of nodes) {
      const nodeMetadata = jsonRecord(node.metadata ?? {});
      const hasExplicitCostAwareData = Boolean(
        nodeMetadata.utilityDecision ||
        nodeMetadata.costAwareUtilityDecision ||
        nodeMetadata.utilityRationale ||
        nodeMetadata.costRationale ||
        nodeMetadata.consideredCapabilityIds,
      );
      if (!hasExplicitCostAwareData && this.options.requireCostAwareCapabilityPolicy !== true) {
        continue;
      }
      const utilityDecision = utilityDecisionFromNodeMetadata(node) ?? decisionLevelUtility;
      if (!utilityDecision && this.options.requireCostAwareCapabilityPolicy !== true) {
        continue;
      }
      const validation = validateCostAwareCapabilityUtilityDecision({
        decision: utilityDecision,
        manifest: this.capabilityManifest,
        missionLedgerSummary: missionSummary,
        snapshotSummary: input.snapshotSummary,
      });
      if (!validation.valid) {
        reasonCodes.push(
          ...validation.reasonCodes.map((code) => `cost_aware_node:${node.nodeId}:${code}`),
        );
      }
    }
    if (
      this.options.requireCostAwareCapabilityPolicy === true &&
      ["run_node", "retry_node", "repair_from_validation"].includes(input.decision.decisionKind)
    ) {
      const schedulerDecisionUtility = utilityDecisionForSchedulerDecision({
        decision: input.decision,
        explicitDecision: decisionLevelUtility,
        snapshotSummary: input.snapshotSummary,
        capabilityManifest: this.capabilityManifest,
      });
      const validation = validateCostAwareCapabilityUtilityDecision({
        decision: schedulerDecisionUtility,
        manifest: this.capabilityManifest,
        missionLedgerSummary: missionSummary,
        snapshotSummary: input.snapshotSummary,
      });
      if (!validation.valid) {
        reasonCodes.push(...validation.reasonCodes.map((code) => `cost_aware_decision:${code}`));
      }
    }
    return [...new Set(reasonCodes)];
  }

  private genericStagedPolicyReasonCodes(decision: OrchestratorGraphDecision): string[] {
    const reasonCodes: string[] = [];
    const metadata = jsonRecord(decision.metadata ?? {});
    const addsNodes = (decision.newNodes ?? []).length > 0;
    if (addsNodes && metadata.stagedSchedulerProtocolCompiled !== true) {
      reasonCodes.push("generic_staged_scheduler_protocol_required_for_node_creation");
    }
    for (const node of decision.newNodes ?? []) {
      const nodeMetadata = jsonRecord(node.metadata ?? {});
      if (nodeMetadata.stagedSchedulerProtocolCompiled !== true) {
        reasonCodes.push(`generic_staged_scheduler_node_not_compiled:${node.nodeId}`);
      }
      if (!node.executorKey || !node.capabilityId || !node.requiredMetadataSchemaRef) {
        reasonCodes.push(
          `generic_staged_scheduler_runtime_node_envelope_incomplete:${node.nodeId}`,
        );
      }
      const evidenceSource =
        typeof nodeMetadata.expectedEvidenceSource === "string"
          ? nodeMetadata.expectedEvidenceSource
          : "";
      if (
        !Array.isArray(nodeMetadata.expectedEvidence) ||
        ![
          "runtime_derived_from_capability_manifest",
          "runtime_derived_from_capability_manifest_and_mission_ledger",
        ].includes(evidenceSource)
      ) {
        reasonCodes.push(
          `generic_staged_scheduler_expected_evidence_not_runtime_derived:${node.nodeId}`,
        );
      }
    }
    if (addsNodes) {
      const edgeCount = decision.newEdges?.length ?? 0;
      const parallelJustification = decisionMetadataString(
        decision,
        "parallelIndependentNodesJustification",
      );
      if (
        edgeCount === 0 &&
        !parallelJustification &&
        !isProgressiveContextAcquisitionFirstMove(decision.newNodes ?? [])
      ) {
        reasonCodes.push("generic_staged_scheduler_edges_or_parallel_justification_required");
      }
    }
    return [...new Set(reasonCodes)];
  }

  private async recordSchedulerTool(input: {
    graphId: string;
    iteration: number;
    toolId: SchedulerRuntimeToolId;
    idempotencyKey: string;
    runtimeJobId?: string | null;
    inputRef?: string | null;
    inputHash?: string | null;
    inputSummary: string;
    nodeId?: string | null;
    roleRef?: string | null;
    modelRef?: string | null;
    metadata?: JsonValue;
  }): Promise<{ refs: string[]; reasonCodes: string[] }> {
    if (!this.options.runtimeToolKernel) {
      return this.options.requireSchedulerToolKernel === true
        ? {
            refs: [],
            reasonCodes: [
              `scheduler_tool_kernel_missing:${input.toolId}`,
              "scheduler_toolified_path_required_for_production",
            ],
          }
        : { refs: [], reasonCodes: [] };
    }
    try {
      const runtimeJobId =
        input.runtimeJobId ??
        (await this.options.graphs.readGraphSnapshot(input.graphId))?.graph.rootRuntimeJobId ??
        null;
      const schedulerBudget = {
        budgetRef: `runtime-task-budget://scheduler/${input.toolId}`,
        timeoutMs: input.toolId.startsWith("scheduler.") ? 600_000 : 900_000,
        metadata: {
          schedulerToolId: input.toolId,
          budgetClass: "standard",
          progressEmissionIntervalMs: 10_000,
          staleProgressAfterMs: 120_000,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      };
      const invocation = await invokeSchedulerRuntimeTool({
        kernel: this.options.runtimeToolKernel,
        toolId: input.toolId,
        runtimeJobId,
        graphId: input.graphId,
        nodeId: input.nodeId,
        roleRef: input.roleRef,
        modelRef: input.modelRef,
        idempotencyKey: input.idempotencyKey,
        inputRef: input.inputRef,
        inputHash: input.inputHash,
        inputSummary: input.inputSummary,
        budget: schedulerBudget,
        metadata: input.metadata,
      });
      const schedulerPhase = schedulerToolPhase(input.toolId, input.metadata);
      const metadata = jsonRecord(input.metadata ?? {});
      const metadataReasonCodes = Array.isArray(metadata.reasonCodes)
        ? metadata.reasonCodes
            .filter((code): code is string => typeof code === "string")
            .slice(0, 20)
        : [];
      const selectedCapabilityId =
        typeof metadata.selectedCapabilityId === "string"
          ? metadata.selectedCapabilityId
          : typeof metadata.capabilityId === "string"
            ? metadata.capabilityId
            : null;
      const costAwareReadback = jsonRecord(metadata.costAwareReadback);
      const costAwareUtilityDecision = jsonRecord(metadata.costAwareUtilityDecision);
      const repairFieldHints = Array.isArray(metadata.repairFieldHints)
        ? metadata.repairFieldHints
            .filter((field): field is string => typeof field === "string")
            .slice(0, 12)
        : [];
      const repairDiagnostics = jsonRecord(metadata.repairDiagnostics);
      const runtimeRepairClassification = jsonRecord(metadata.runtimeRepairClassification);
      const postSynthesisGraphQuality = jsonRecord(metadata.postSynthesisGraphQuality);
      const postSynthesisMissingRoleObligations = Array.isArray(
        postSynthesisGraphQuality.missingRoleObligations,
      )
        ? postSynthesisGraphQuality.missingRoleObligations
            .filter((value): value is string => typeof value === "string")
            .slice(0, 12)
        : [];
      const postSynthesisPresentRoleObligations = Array.isArray(
        postSynthesisGraphQuality.presentRoleObligations,
      )
        ? postSynthesisGraphQuality.presentRoleObligations
            .filter((value): value is string => typeof value === "string")
            .slice(0, 12)
        : [];
      const repairMissingFields = Array.isArray(repairDiagnostics.missingFields)
        ? repairDiagnostics.missingFields
            .map((field) => jsonRecord(field as JsonValue))
            .map((field) => (typeof field.path === "string" ? field.path : null))
            .filter((path): path is string => Boolean(path))
            .slice(0, 12)
        : [];
      const commitmentWorkPackets = Array.isArray(metadata.commitmentWorkPackets)
        ? metadata.commitmentWorkPackets
            .map((packet) => jsonRecord(packet as JsonValue))
            .filter((packet): packet is Record<string, JsonValue> => Boolean(packet))
            .map((packet) => ({
              packetRef: typeof packet.packetRef === "string" ? packet.packetRef : undefined,
              commitmentId:
                typeof packet.commitmentId === "string" ? packet.commitmentId : undefined,
              authoringSource:
                typeof packet.authoringSource === "string" ? packet.authoringSource : undefined,
              qualityStatus:
                typeof packet.qualityStatus === "string" ? packet.qualityStatus : undefined,
              workerObjective:
                typeof packet.workerObjective === "string" ? packet.workerObjective : undefined,
              contextScoutObjective:
                typeof packet.contextScoutObjective === "string"
                  ? packet.contextScoutObjective
                  : undefined,
              implementationObjective:
                typeof packet.implementationObjective === "string"
                  ? packet.implementationObjective
                  : undefined,
              acceptanceCriteriaCount:
                typeof packet.acceptanceCriteriaCount === "number"
                  ? packet.acceptanceCriteriaCount
                  : undefined,
              acceptanceCriteria: Array.isArray(packet.acceptanceCriteria)
                ? packet.acceptanceCriteria
                    .filter((value): value is string => typeof value === "string")
                    .slice(0, 6)
                : [],
              expectedEvidenceKinds: Array.isArray(packet.expectedEvidenceKinds)
                ? packet.expectedEvidenceKinds
                    .filter((value): value is string => typeof value === "string")
                    .slice(0, 8)
                : [],
              likelyRepoAreas: Array.isArray(packet.likelyRepoAreas)
                ? packet.likelyRepoAreas
                    .filter((value): value is string => typeof value === "string")
                    .slice(0, 8)
                : [],
              requiredContextQuestions: Array.isArray(packet.requiredContextQuestions)
                ? packet.requiredContextQuestions
                    .filter((value): value is string => typeof value === "string")
                    .slice(0, 6)
                : [],
              downstreamConsumer:
                typeof packet.downstreamConsumer === "string"
                  ? packet.downstreamConsumer
                  : undefined,
            }))
            .slice(0, 30)
        : [];
      await this.options.onProgress?.({
        stage: "scheduler_tool",
        status:
          invocation.status === "failed"
            ? "failed"
            : invocation.status === "needs_review"
              ? "needs_review"
              : "completed",
        nodeId: input.nodeId ?? undefined,
        roleId: input.roleRef ?? undefined,
        modelRef: input.modelRef ?? undefined,
        artifactRefs: [
          invocation.invocationRef,
          ...(invocation.outputRef ? [invocation.outputRef] : []),
        ],
        reasonCodes: [
          `scheduler_tool_invoked:${input.toolId}`,
          ...invocation.reasonCodes.slice(0, 12),
          ...metadataReasonCodes,
        ],
        currentObjective: input.inputSummary,
        activeNodeKind: null,
        selectedCapabilityId,
        capabilityId: selectedCapabilityId,
        selectedProviderCapabilityProfileId:
          typeof costAwareReadback.selectedProviderCapabilityProfileId === "string"
            ? costAwareReadback.selectedProviderCapabilityProfileId
            : null,
        workerRef:
          typeof costAwareReadback.workerRef === "string" ? costAwareReadback.workerRef : null,
        capabilityRoleClass:
          typeof costAwareReadback.roleClass === "string" ? costAwareReadback.roleClass : null,
        capabilityCostClass:
          typeof costAwareReadback.costClass === "string" ? costAwareReadback.costClass : null,
        capabilityLatencyClass:
          typeof costAwareReadback.latencyClass === "string"
            ? costAwareReadback.latencyClass
            : null,
        capabilityContextCapacity:
          typeof costAwareReadback.contextCapacity === "string"
            ? costAwareReadback.contextCapacity
            : null,
        providerProfileProductionSelectable:
          typeof costAwareReadback.productionSelectable === "boolean"
            ? costAwareReadback.productionSelectable
            : null,
        providerProfileRequiresQualification:
          typeof costAwareReadback.productionSelectionRequiresQualification === "boolean"
            ? costAwareReadback.productionSelectionRequiresQualification
            : null,
        selectedModelQualificationProfileId:
          typeof costAwareReadback.selectedModelQualificationProfileId === "string"
            ? costAwareReadback.selectedModelQualificationProfileId
            : null,
        qualificationEvidenceRefs: jsonStringArray(costAwareReadback.qualificationEvidenceRefs),
        capabilityUtilityRationale:
          typeof costAwareUtilityDecision.utilityRationale === "string"
            ? costAwareUtilityDecision.utilityRationale
            : typeof metadata.utilityRationale === "string"
              ? metadata.utilityRationale
              : null,
        capabilityCostRationale:
          typeof costAwareUtilityDecision.costRationale === "string"
            ? costAwareUtilityDecision.costRationale
            : typeof metadata.costRationale === "string"
              ? metadata.costRationale
              : null,
        whyCheaperOptionsWereInsufficient:
          typeof costAwareUtilityDecision.whyCheaperOptionsWereInsufficient === "string"
            ? costAwareUtilityDecision.whyCheaperOptionsWereInsufficient
            : typeof metadata.whyCheaperOptionsWereInsufficient === "string"
              ? metadata.whyCheaperOptionsWereInsufficient
              : null,
        consideredCapabilityIds: Array.isArray(metadata.consideredCapabilityIds)
          ? metadata.consideredCapabilityIds
              .filter((value): value is string => typeof value === "string")
              .slice(0, 12)
          : [],
        consideredProviderCapabilityProfileIds: jsonStringArray(
          costAwareReadback.consideredProviderCapabilityProfileIds,
        ),
        currentPhase: schedulerPhase,
        validationState: null,
        evidenceProducedRefs: [
          invocation.invocationRef,
          ...(invocation.outputRef ? [invocation.outputRef] : []),
        ],
        nextDecisionNeeded:
          input.toolId === "scheduler.select_next_node"
            ? "node_result"
            : input.toolId === "scheduler.reject_staged_graph"
              ? "repair_scheduler_decision"
              : "orchestrator_decision",
        eli5Progress: `${input.toolId} recorded a bounded scheduler trace.`,
        schedulerPhase,
        schedulerToolId: input.toolId,
        schedulerToolInvocationRefs: [invocation.invocationRef],
        repairClassification:
          runtimeRepairClassification.artifactKind === "runtime_repair_classification"
            ? runtimeRepairClassificationSummary(
                runtimeRepairClassification as unknown as RuntimeRepairClassification,
              )
            : null,
        postSynthesisGraphQuality:
          postSynthesisGraphQuality.artifactKind === "post_synthesis_graph_quality_report"
            ? (postSynthesisGraphQuality as PostSynthesisGraphQualityReport)
            : null,
        postSynthesisGraphQualityState:
          typeof metadata.postSynthesisGraphQualityState === "string"
            ? metadata.postSynthesisGraphQualityState
            : null,
        postSynthesisMissingRoleObligations,
        postSynthesisPresentRoleObligations,
        postSynthesisBroadCodexShare:
          typeof postSynthesisGraphQuality.broadCodexShare === "number"
            ? postSynthesisGraphQuality.broadCodexShare
            : null,
        postSynthesisPremiumShare:
          typeof postSynthesisGraphQuality.premiumShare === "number"
            ? postSynthesisGraphQuality.premiumShare
            : null,
        commitmentWorkPackets,
        budgetPolicyRef: schedulerBudget.budgetRef,
        budgetClass: "standard",
        budgetSummary: {
          artifactKind: "runtime_task_budget_policy_summary",
          policyRef: schedulerBudget.budgetRef,
          budgetClass: "standard",
          runtimeToolTimeoutMs: schedulerBudget.timeoutMs,
          progressEmissionIntervalMs: 10_000,
          staleProgressAfterMs: 120_000,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
        runtimeToolTimeoutMs: schedulerBudget.timeoutMs,
        progressEmissionIntervalMs: 10_000,
        staleProgressAfterMs: 120_000,
        heartbeatState: "scheduler_tool_completed",
        blockerSummary:
          input.toolId === "scheduler.reject_staged_graph" &&
          (repairMissingFields.length > 0 || repairFieldHints.length > 0)
            ? `Scheduler rejected the decision; repair fields: ${
                repairMissingFields.length > 0
                  ? repairMissingFields.join(", ")
                  : repairFieldHints.join(", ")
              }.`
            : undefined,
      });
      return {
        refs: [invocation.invocationRef, ...(invocation.outputRef ? [invocation.outputRef] : [])],
        reasonCodes: [
          `scheduler_tool_invoked:${input.toolId}`,
          ...invocation.reasonCodes.slice(0, 12),
        ],
      };
    } catch (error) {
      const summary = error instanceof Error ? error.message : String(error);
      return {
        refs: [],
        reasonCodes: [`scheduler_tool_invocation_failed:${input.toolId}`, summary.slice(0, 120)],
      };
    }
  }

  private async tryRunParallelRunnableFrontier(input: {
    graphId: string;
    iteration: number;
    snapshot: RuntimeWorkGraphSnapshot;
    missionLedger: MissionContractLedger | null;
    executedNodeIds: string[];
    loopGuard: RuntimeWorkGraphLoopGuard;
  }): Promise<{
    status: "continue" | "succeeded" | "needs_review" | "failed" | "waiting_for_human";
    reasonCodes: string[];
    missionLedger?: MissionContractLedger | null;
  } | null> {
    if (this.maxParallelNodeExecutions <= 1) {
      return null;
    }
    const frontier = selectRunnableParallelFrontier({
      snapshot: input.snapshot,
      executors: this.options.executors,
      maxParallelNodeExecutions: this.maxParallelNodeExecutions,
    });
    if (frontier.rawRunnableNodeIds.length > 0 || frontier.skippedReasonCodes.length > 0) {
      await this.options.onProgress?.({
        stage: "scheduler_parallel_frontier",
        status: "started",
        reasonCodes: [
          "scheduler_parallel_frontier_evaluated",
          `parallel_frontier_ready_count:${frontier.rawRunnableNodeIds.length}`,
          `parallel_frontier_selected_count:${frontier.selectedNodes.length}`,
          ...frontier.skippedReasonCodes.slice(0, 12),
        ],
        currentPhase: "parallel_frontier_evaluated",
        schedulerPhase: "execution_in_progress",
        schedulerToolId: "scheduler.select_next_node",
        currentObjective: "Evaluate dependency-ready graph nodes for bounded superstep execution.",
        nextDecisionNeeded:
          frontier.selectedNodes.length > 0
            ? "runtime_frontier_execution"
            : "orchestrator_decision",
        eli5Progress:
          frontier.selectedNodes.length > 0
            ? "OpenClaw found graph nodes whose dependencies are satisfied and can run without another orchestrator model call."
            : "OpenClaw checked the graph frontier, but no executable node is ready yet.",
        heartbeatState: "parallel_frontier_evaluated",
        parallelFrontier: frontier.readback,
      });
    }
    if (frontier.selectedNodes.length < 1) {
      return null;
    }
    const selectedNodeIds = frontier.selectedNodes.map((node) => node.nodeId);
    const selectTool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: "scheduler.select_next_node",
      idempotencyKey: `iteration:${input.iteration}:parallel-frontier:${selectedNodeIds.join("|")}`,
      inputRef: graphRef("graph", `${input.graphId}/runnable-frontier/${input.iteration}`),
      inputSummary: `Select ${selectedNodeIds.length} dependency-ready graph node(s) for parallel execution from the accepted runtime graph frontier.`,
      metadata: {
        selectedNodeIds,
        rawRunnableNodeIds: frontier.rawRunnableNodeIds.slice(0, 24),
        skippedReasonCodes: frontier.skippedReasonCodes.slice(0, 24),
        maxParallelNodeExecutions: this.maxParallelNodeExecutions,
        parallelFrontier: frontier.readback,
        schedulerPhase: "parallel_frontier_selected",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    await this.options.onProgress?.({
      stage: "scheduler_parallel_frontier",
      status: "started",
      reasonCodes: [
        "scheduler_parallel_frontier_selected",
        `parallel_frontier_node_count:${selectedNodeIds.length}`,
        ...frontier.skippedReasonCodes.slice(0, 12),
        ...selectTool.reasonCodes,
      ],
      currentPhase: "parallel_frontier_selected",
      schedulerPhase: "execution_in_progress",
      schedulerToolId: "scheduler.select_next_node",
      schedulerToolInvocationRefs: selectTool.refs,
      evidenceProducedRefs: selectTool.refs,
      currentObjective:
        selectedNodeIds.length > 1
          ? `Run ${selectedNodeIds.length} independent graph node(s) in parallel.`
          : `Run dependency-ready graph node ${selectedNodeIds[0]} without another model selection call.`,
      eli5Progress:
        selectedNodeIds.length > 1
          ? "OpenClaw found multiple ready child nodes whose graph dependencies are already satisfied, so it is running them as one parallel frontier instead of asking the orchestrator to pick one."
          : "OpenClaw found one ready child node whose dependencies are already satisfied, so it is running that node directly instead of spending another model call on obvious scheduling.",
      heartbeatState: "parallel_frontier_started",
      parallelFrontier: frontier.readback,
    });
    const results = await Promise.all(
      frontier.selectedNodes.map(async (node) => {
        const decision: OrchestratorGraphDecision = {
          decisionId: `runtime-parallel-frontier-${input.iteration}-${node.nodeId}`,
          decisionKind: node.nodeStatus === "needs_review" ? "retry_node" : "run_node",
          rationaleForDecision: `Runtime selected ${node.nodeId} as part of a dependency-ready parallel frontier.`,
          targetNodeId: node.nodeId,
          runNodeId: node.nodeId,
          reasonCodes: [
            "runtime_parallel_frontier_selected",
            `parallel_frontier_size:${selectedNodeIds.length}`,
          ],
          metadata: {
            selectedNodeIds,
            parallelFrontierSelection: true,
            schedulerPhase: "parallel_frontier_selected",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        };
        const stop = await this.maybeStopBeforeNodeExecution({
          graphId: input.graphId,
          nodeId: node.nodeId,
          iteration: input.iteration,
          missionLedger: input.missionLedger,
          decision,
        });
        if (stop) {
          return stop;
        }
        return await this.executeNode({
          graphId: input.graphId,
          nodeId: node.nodeId,
          iteration: input.iteration,
          missionLedger: input.missionLedger,
          decision,
          executedNodeIds: input.executedNodeIds,
          loopGuard: input.loopGuard,
        });
      }),
    );
    const reasonCodes = [
      ...selectTool.reasonCodes,
      "scheduler_parallel_frontier_executed",
      `parallel_frontier_node_count:${selectedNodeIds.length}`,
      ...results.flatMap((result) => result.reasonCodes),
    ];
    const mergedMissionLedger = mergeParallelMissionLedgers({
      base: input.missionLedger,
      updates: results.map((result) => result.missionLedger),
    });
    if (mergedMissionLedger && mergedMissionLedger !== input.missionLedger) {
      await this.options.onMissionLedgerUpdated?.(mergedMissionLedger);
    }
    await this.options.onProgress?.({
      stage: "scheduler_parallel_frontier",
      status: results.some((result) => result.status === "failed")
        ? "failed"
        : results.some((result) => result.status === "waiting_for_human")
          ? "waiting_for_human"
          : results.some((result) => result.status === "needs_review")
            ? "needs_review"
            : "completed",
      reasonCodes,
      currentPhase: "parallel_frontier_completed",
      schedulerPhase: "execution_in_progress",
      schedulerToolId: "scheduler.select_next_node",
      schedulerToolInvocationRefs: selectTool.refs,
      evidenceProducedRefs: selectTool.refs,
      currentObjective: `Completed parallel frontier for ${selectedNodeIds.length} graph node(s).`,
      nextDecisionNeeded: "orchestrator_decision",
      eli5Progress:
        "OpenClaw finished the ready child-node frontier and will now let the scheduler/orchestrator evaluate the next graph step.",
      heartbeatState: "parallel_frontier_completed",
      parallelFrontier: buildParallelFrontierReadback({
        snapshot: (await this.options.graphs.readGraphSnapshot(input.graphId)) ?? input.snapshot,
        currentSuperstep: input.iteration,
        maxParallelNodeExecutions: this.maxParallelNodeExecutions,
        selectedNodes: frontier.selectedNodes,
        skippedReasonCodes: frontier.skippedReasonCodes,
        rawRunnableNodeIds: frontier.rawRunnableNodeIds,
        providerConcurrencyBudgets: frontier.readback.providerConcurrencyBudgets,
      }),
    });
    if (results.some((result) => result.status === "waiting_for_human")) {
      return { status: "waiting_for_human", reasonCodes, missionLedger: mergedMissionLedger };
    }
    if (results.some((result) => result.status === "failed" || result.status === "needs_review")) {
      return {
        status: "continue",
        reasonCodes: [
          ...reasonCodes,
          "parallel_frontier_branch_repair_returned_to_orchestrator",
          "parallel_frontier_completed_siblings_preserved",
        ],
        missionLedger: mergedMissionLedger,
      };
    }
    if (results.every((result) => result.status === "succeeded")) {
      const refreshed = await this.options.graphs.readGraphSnapshot(input.graphId);
      const hasRemainingExecutableNodes = Boolean(
        refreshed?.nodes.some(
          (node) => node.nodeStatus === "planned" || node.nodeStatus === "needs_review",
        ),
      );
      return {
        status: "continue",
        reasonCodes: [
          ...reasonCodes,
          hasRemainingExecutableNodes ||
          (mergedMissionLedger
            ? missionLedgerHasOpenBlockingCommitments(mergedMissionLedger)
            : false)
            ? "parallel_frontier_more_graph_work_remaining"
            : "parallel_frontier_complete_returned_to_finalization",
        ],
        missionLedger: mergedMissionLedger,
      };
    }
    return { status: "continue", reasonCodes, missionLedger: mergedMissionLedger };
  }

  private async applyDecision(input: {
    graphId: string;
    decision: OrchestratorGraphDecision;
    iteration: number;
    missionLedger: MissionContractLedger | null;
    executedNodeIds: string[];
    addedNodeIds: string[];
    loopGuard: RuntimeWorkGraphLoopGuard;
  }): Promise<{
    status: "continue" | "succeeded" | "needs_review" | "failed" | "waiting_for_human";
    reasonCodes: string[];
    missionLedger?: MissionContractLedger | null;
  }> {
    const graphId = input.graphId;
    const decision = runtimeScopedStagedDecisionNodeIds({
      graphId,
      decision: input.decision,
    });
    const decisionMetadata = jsonRecord(decision.metadata ?? null);
    const postSynthesisGraphQuality =
      jsonRecord(decisionMetadata.postSynthesisGraphQuality).artifactKind ===
      "post_synthesis_graph_quality_report"
        ? (decisionMetadata.postSynthesisGraphQuality as PostSynthesisGraphQualityReport)
        : null;
    if (decision.decisionKind === "request_review" && (decision.newNodes ?? []).length === 0) {
      const snapshot = await this.options.graphs.readGraphSnapshot(graphId);
      const nodeById = new Map((snapshot?.nodes ?? []).map((node) => [node.nodeId, node]));
      const targetRefCandidates = uniqueStrings([
        decision.targetNodeId ?? undefined,
        decision.runNodeId ?? undefined,
        ...jsonStringArray(jsonRecord(decision).targetNodeRefs),
        ...jsonStringArray(decisionMetadata.targetNodeRefs),
      ]);
      const targetNodeIds = uniqueStrings(
        targetRefCandidates
          .map((ref) => (nodeById.has(ref) ? ref : (ref.split("/").at(-1) ?? ref)))
          .filter((ref) => nodeById.has(ref)),
      );
      const targetNodes = targetNodeIds
        .map((nodeId) => nodeById.get(nodeId))
        .filter((node): node is TeamGraphNode => Boolean(node));
      if (targetNodeIds.length === 0) {
        decision.decisionKind = "mark_needs_review";
        decision.reasonCodes.push("request_review_target_node_missing");
        decision.reasonCodes.push("request_review_without_target_rejected");
        decision.metadata = {
          ...decisionMetadata,
          rejectedReviewRequest: {
            targetRefCandidates,
            reasonCodes: ["request_review_target_node_missing"],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        } satisfies JsonValue;
      } else {
        const targetCommitmentIds = uniqueStrings([
          ...jsonStringArray(decision.commitmentIdsAdvanced),
          ...targetNodes.flatMap((node) =>
            jsonStringArray(jsonRecord(node.metadata).commitmentIdsAdvanced),
          ),
        ]);
        const reviewNodeId = `review-${createHash("sha256")
          .update(
            JSON.stringify({
              graphId,
              decisionId: decision.decisionId,
              targetNodeIds,
              targetCommitmentIds,
            }),
          )
          .digest("hex")
          .slice(0, 18)}`;
        decision.newNodes = [
          {
            nodeId: reviewNodeId,
            nodeKind: "reviewer",
            capabilityId: "reviewer",
            executorKey: "kind:reviewer",
            workerRef: "worker.reviewer.runtime",
            assignedRole: "reviewer",
            modelOrWorkerRef: "worker.reviewer.runtime",
            inputHandoffRefs: uniqueStrings([...targetNodeIds, ...targetRefCandidates]).slice(
              0,
              20,
            ),
            expectedOutput:
              typeof decisionMetadata.reviewObjective === "string"
                ? decisionMetadata.reviewObjective
                : "Review targeted node outputs and classify whether evidence is accepted, needs repair, needs escalation, or should unblock downstream work.",
            acceptanceCriteria: [
              "Review cites targeted node refs.",
              "Review maps findings to commitment ids where available.",
              "Review produces bounded evidence and no raw provider output.",
            ],
            downstreamConsumer: "runtime_work_graph_scheduler",
            commitmentIdsAdvanced: targetCommitmentIds,
            whyThisRoleIsNeededNow:
              decision.rationaleForDecision ||
              "The orchestrator requested review of needs-review node outputs before dependent graph work continues.",
            exactObjective:
              typeof decisionMetadata.reviewObjective === "string"
                ? decisionMetadata.reviewObjective
                : "Review needs-review node outputs before scheduler continuation.",
            evidenceExpectation:
              "Bounded review evidence that helps the scheduler choose repair, escalation, or downstream continuation.",
            targetRefs: targetRefCandidates.slice(0, 20),
            metadata: {
              targetNodeIds,
              targetNodeRefs: targetRefCandidates,
              commitmentIdsAdvanced: targetCommitmentIds,
              schedulerCompiledFromDecisionKind: "request_review",
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          },
        ];
        decision.newEdges = [
          ...(decision.newEdges ?? []),
          ...targetNodeIds.map((targetNodeId, index) => ({
            edgeId: `review-edge-${reviewNodeId}-${index + 1}`,
            fromNodeId: targetNodeId,
            toNodeId: reviewNodeId,
            edgeKind: "review_depends_on" as const,
            reasonCodes: ["request_review_compiled_dependency_edge"],
            metadata: {
              decisionId: decision.decisionId,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          })),
        ];
        decision.runAfterAdd = true;
        decision.runNodeId = reviewNodeId;
        decision.reasonCodes.push("request_review_compiled_to_review_node");
      }
    }
    if (decision.newNodes?.length) {
      const stagedTools: Array<{ toolId: SchedulerRuntimeToolId; summary: string }> = [
        {
          toolId: "scheduler.draft_work_breakdown",
          summary: "Record model-authored work units before runtime graph compilation.",
        },
        {
          toolId: "scheduler.review_work_breakdown",
          summary:
            "Review work-unit coverage against Mission Ledger commitments before capability selection.",
        },
        {
          toolId: "scheduler.propose_decomposition_outline",
          summary: "Record model-authored decomposition outline before graph compilation.",
        },
        {
          toolId: "scheduler.map_commitments_to_work_units",
          summary: "Record commitment-to-work-unit mapping before graph compilation.",
        },
        {
          toolId: "scheduler.shortlist_capabilities_for_work_units",
          summary: "Record per-work-unit capability shortlist before final selection.",
        },
        {
          toolId: "scheduler.select_capability_for_work_unit",
          summary: "Record cost-aware capability selection before canonical node creation.",
        },
        {
          toolId: "scheduler.shortlist_capabilities",
          summary: "Record capability shortlist and cheapest-sufficient worker consideration.",
        },
        {
          toolId: "scheduler.select_capabilities",
          summary: "Record scheduler capability selection rollup for owner readback.",
        },
        {
          toolId: "scheduler.define_node_contract",
          summary: "Record node objectives, expected outputs, and acceptance criteria.",
        },
        {
          toolId: "scheduler.define_edges_or_parallelism",
          summary: "Record dependency edges or explicit parallel-independent justification.",
        },
        {
          toolId: "scheduler.compile_staged_runtime_graph",
          summary:
            "Compile model-authored staged planning fields into canonical runtime graph envelopes.",
        },
        {
          toolId: "scheduler.finalize_decomposition_graph",
          summary: "Finalize the accepted decomposition graph before execution.",
        },
        {
          toolId: "scheduler.review_compiled_graph",
          summary: "Record model-authored structure review after runtime graph compilation.",
        },
      ];
      for (const stage of stagedTools) {
        const stageTool = await this.recordSchedulerTool({
          graphId,
          iteration: input.iteration,
          toolId: stage.toolId,
          idempotencyKey: `iteration:${input.iteration}:decision:${decision.decisionId}:${stage.toolId}`,
          inputRef: graphRef("orchestrator-decision", decision.decisionId),
          inputSummary: stage.summary,
          metadata: {
            decisionId: decision.decisionId,
            decisionKind: decision.decisionKind,
            newNodeCount: decision.newNodes.length,
            newEdgeCount: decision.newEdges?.length ?? 0,
            postSynthesisGraphQuality,
            postSynthesisGraphQualityState:
              typeof decisionMetadata.postSynthesisGraphQualityState === "string"
                ? decisionMetadata.postSynthesisGraphQualityState
                : null,
            schedulerPhase: "planning_in_progress",
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        decision.reasonCodes.push(...stageTool.reasonCodes);
      }
      await this.addNodes({
        graphId,
        nodes: decision.newNodes,
        edges: decision.newEdges ?? [],
        addedNodeIds: input.addedNodeIds,
        iteration: input.iteration,
      });
      if (decision.newNodes.some((node) => node.nodeKind === "context_synthesis")) {
        const synthesisTool = await this.recordSchedulerTool({
          graphId,
          iteration: input.iteration,
          toolId: "scheduler.context_synthesis.create",
          idempotencyKey: `iteration:${input.iteration}:decision:${decision.decisionId}:context-synthesis-create`,
          inputRef: graphRef("orchestrator-decision", decision.decisionId),
          inputSummary:
            "Create context synthesis node to convert accepted context handoffs into a dependency-aware implementation graph.",
          metadata: {
            decisionId: decision.decisionId,
            contextSynthesisNodeIds: decision.newNodes
              .filter((node) => node.nodeKind === "context_synthesis")
              .map((node) => node.nodeId)
              .slice(0, 8),
            schedulerPhase: "context_synthesis_pending",
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        decision.reasonCodes.push(...synthesisTool.reasonCodes);
      }
      const acceptedTool = await this.recordSchedulerTool({
        graphId,
        iteration: input.iteration,
        toolId: "scheduler.accept_staged_graph",
        idempotencyKey: `iteration:${input.iteration}:decision:${decision.decisionId}:accept`,
        inputRef: graphRef("orchestrator-decision", decision.decisionId),
        inputSummary: `Accepted decomposition decision ${decision.decisionId} with ${decision.newNodes.length} node(s) and ${decision.newEdges?.length ?? 0} edge(s).`,
        metadata: {
          decisionId: decision.decisionId,
          nodeIds: decision.newNodes.map((node) => node.nodeId).slice(0, 20),
          edgeCount: decision.newEdges?.length ?? 0,
          postSynthesisGraphQuality,
          postSynthesisGraphQualityState:
            typeof decisionMetadata.postSynthesisGraphQualityState === "string"
              ? decisionMetadata.postSynthesisGraphQualityState
              : null,
          schedulerPhase: "decomposition_accepted",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      if (acceptedTool.reasonCodes.length > 0) {
        decision.reasonCodes.push(...acceptedTool.reasonCodes);
      }
    }
    if (
      [
        "add_nodes",
        "split_node",
        "request_context",
        "request_validation",
        "request_review",
        "rerun_role",
        "escalate_worker",
      ].includes(decision.decisionKind)
    ) {
      const nodeId = decision.runAfterAdd
        ? (decision.runNodeId ??
          decision.targetNodeId ??
          decision.newNodes?.find((node) => node.nodeKind !== "human_task")?.nodeId ??
          null)
        : null;
      if (nodeId) {
        const firstNodeTool = await this.recordSchedulerTool({
          graphId,
          iteration: input.iteration,
          toolId: "scheduler.approve_and_run_first_node",
          idempotencyKey: `iteration:${input.iteration}:decision:${decision.decisionId}:run-first:${nodeId}`,
          inputRef: graphRef("orchestrator-decision", decision.decisionId),
          inputSummary: `Approve scheduler-selected node ${nodeId} for execution after staged graph acceptance.`,
          nodeId,
          metadata: {
            decisionId: decision.decisionId,
            runNodeId: nodeId,
            schedulerPhase: "decomposition_accepted",
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        decision.reasonCodes.push(...firstNodeTool.reasonCodes);
        const runSnapshot = await this.options.graphs.readGraphSnapshot(graphId);
        const runNode = runSnapshot?.nodes.find((node) => node.nodeId === nodeId) ?? null;
        if (runNode && ["running", "succeeded"].includes(runNode.nodeStatus)) {
          const reasonCode =
            runNode.nodeStatus === "succeeded"
              ? "scheduler_run_first_node_skipped_already_succeeded"
              : "scheduler_run_first_node_skipped_already_running";
          const skipTool = await this.recordSchedulerTool({
            graphId,
            iteration: input.iteration,
            toolId: "scheduler.approve_and_run_first_node",
            idempotencyKey: `iteration:${input.iteration}:decision:${decision.decisionId}:run-first:${nodeId}:idempotent-skip:${runNode.nodeStatus}`,
            inputRef: graphRef("node", nodeId),
            inputSummary: `Skip duplicate execution for ${nodeId}; node is already ${runNode.nodeStatus}.`,
            nodeId,
            metadata: {
              decisionId: decision.decisionId,
              runNodeId: nodeId,
              nodeStatus: runNode.nodeStatus,
              schedulerPhase: "execution_idempotency",
              reasonCodes: [reasonCode],
              rawPromptStored: false,
              rawResponseStored: false,
            },
          });
          return {
            status: "continue",
            reasonCodes: uniqueStrings([
              ...decision.reasonCodes,
              reasonCode,
              ...skipTool.reasonCodes,
            ]),
          };
        }
        const stop = await this.maybeStopBeforeNodeExecution({
          graphId,
          nodeId,
          iteration: input.iteration,
          missionLedger: input.missionLedger,
          decision,
        });
        if (stop) {
          return stop;
        }
        const executed = await this.executeNode({
          graphId,
          nodeId,
          iteration: input.iteration,
          missionLedger: input.missionLedger,
          decision,
          executedNodeIds: input.executedNodeIds,
          loopGuard: input.loopGuard,
        });
        return {
          ...executed,
          reasonCodes: uniqueStrings([...decision.reasonCodes, ...executed.reasonCodes]),
        };
      }
      return { status: "continue", reasonCodes: decision.reasonCodes };
    }
    if (decision.decisionKind === "request_human_decision") {
      const humanTool = await this.recordSchedulerTool({
        graphId,
        iteration: input.iteration,
        toolId: "scheduler.request_human_decision",
        idempotencyKey: `iteration:${input.iteration}:decision:${decision.decisionId}:human`,
        inputRef: graphRef("orchestrator-decision", decision.decisionId),
        inputSummary: decision.rationaleForDecision || "Request bounded human decision.",
        metadata: {
          decisionId: decision.decisionId,
          targetNodeId: decision.targetNodeId ?? null,
          schedulerPhase: "execution_in_progress",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      decision.reasonCodes.push(...humanTool.reasonCodes);
      return { status: "waiting_for_human", reasonCodes: decision.reasonCodes };
    }
    if (decision.decisionKind === "mark_needs_review") {
      const needsReviewTool = await this.recordSchedulerTool({
        graphId,
        iteration: input.iteration,
        toolId: "scheduler.mark_needs_review",
        idempotencyKey: `iteration:${input.iteration}:decision:${decision.decisionId}:needs-review`,
        inputRef: graphRef("orchestrator-decision", decision.decisionId),
        inputSummary: decision.rationaleForDecision || "Mark graph as needs review.",
        metadata: {
          decisionId: decision.decisionId,
          reasonCodes: decision.reasonCodes.slice(0, 20),
          schedulerPhase: "execution_in_progress",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      decision.reasonCodes.push(...needsReviewTool.reasonCodes);
      return { status: "needs_review", reasonCodes: decision.reasonCodes };
    }
    if (decision.decisionKind === "mark_blocked") {
      return { status: "failed", reasonCodes: decision.reasonCodes };
    }
    if (decision.decisionKind === "create_closeout") {
      const closeoutReadinessTool = await this.recordSchedulerTool({
        graphId,
        iteration: input.iteration,
        toolId: "scheduler.evaluate_closeout_readiness",
        idempotencyKey: `iteration:${input.iteration}:decision:${decision.decisionId}:closeout-readiness`,
        inputRef: graphRef("orchestrator-decision", decision.decisionId),
        inputSummary:
          decision.rationaleForDecision ||
          "Evaluate whether Mission Ledger, role coverage, and closeout evidence permit final closeout.",
        metadata: {
          decisionId: decision.decisionId,
          openBlockingCommitmentCount: input.missionLedger
            ? openBlockingMissionCommitments(input.missionLedger).length
            : null,
          schedulerPhase: "closeout_readiness",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      decision.reasonCodes.push(...closeoutReadinessTool.reasonCodes);
      const closeoutTool = await this.recordSchedulerTool({
        graphId,
        iteration: input.iteration,
        toolId: "scheduler.create_closeout_request",
        idempotencyKey: `iteration:${input.iteration}:decision:${decision.decisionId}:closeout`,
        inputRef: graphRef("orchestrator-decision", decision.decisionId),
        inputSummary: decision.rationaleForDecision || "Request final model-authored closeout.",
        metadata: {
          decisionId: decision.decisionId,
          acceptedModelAuthoredCloseoutRef: decisionMetadataString(
            decision,
            "acceptedModelAuthoredCloseoutRef",
          ),
          schedulerPhase: "finalization_pending",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      decision.reasonCodes.push(...closeoutTool.reasonCodes);
      if (input.missionLedger && missionLedgerHasOpenBlockingCommitments(input.missionLedger)) {
        await this.options.graphs.recordCheckpoint({
          graphId,
          checkpointKind: "mission_contract_closeout_deferred",
          stateSummary:
            "Mission Contract Ledger still has open blocking commitments; closeout node was not executed and scheduler will ask orchestrator for more work.",
          artifactRefs: openBlockingMissionCommitments(input.missionLedger)
            .map((commitment) => `mission-contract://commitment/${commitment.commitmentId}`)
            .slice(0, 12),
        });
        return {
          status: "continue",
          reasonCodes: [
            ...decision.reasonCodes,
            "mission_contract_blocking_commitments_open",
            "mission_contract_returned_to_orchestrator_for_more_work",
            ...openBlockingMissionCommitments(input.missionLedger)
              .map((commitment) => `mission_commitment_open:${commitment.commitmentId}`)
              .slice(0, 10),
          ],
          missionLedger: input.missionLedger,
        };
      }
      const closeoutNodeId =
        decision.runNodeId ??
        decision.targetNodeId ??
        decision.newNodes?.find((node) => node.nodeKind === "closeout")?.nodeId ??
        null;
      const snapshotBeforeCloseout = await this.options.graphs.readGraphSnapshot(graphId);
      const roleCoverageReasonCodesForCloseout = roleCoverageReasonCodes({
        snapshot: snapshotBeforeCloseout,
        decision,
        missionLedger: input.missionLedger,
        roleCoverageProfile: this.options.roleCoverageProfile ?? CODING_TEAM_ROLE_COVERAGE_PROFILE,
      });
      if (roleCoverageReasonCodesForCloseout.length > 0) {
        await this.options.graphs.recordCheckpoint({
          graphId,
          checkpointKind: "complex_mission_closeout_deferred_for_role_coverage",
          stateSummary:
            "Complex mission closeout was deferred because the graph did not yet show enough workflow role coverage, and the orchestrator did not provide a bounded skip justification.",
          artifactRefs: [],
        });
        return {
          status: "continue",
          reasonCodes: [
            ...decision.reasonCodes,
            ...roleCoverageReasonCodesForCloseout,
            "complex_mission_returned_to_orchestrator_for_role_coverage",
          ],
          missionLedger: input.missionLedger,
        };
      }
      const pendingGraphNodeIds =
        this.options.deferCloseoutUntilExecutableGraphComplete === true
          ? (snapshotBeforeCloseout?.nodes ?? [])
              .filter(
                (node) =>
                  (node.nodeStatus === "planned" || node.nodeStatus === "needs_review") &&
                  node.nodeId !== closeoutNodeId &&
                  node.nodeKind !== "human_task" &&
                  nodeHasExecutableAdapter({ node, executors: this.options.executors }),
              )
              .map((node) => node.nodeId)
              .slice(0, 20)
          : [];
      if (pendingGraphNodeIds.length > 0) {
        await this.options.graphs.recordCheckpoint({
          graphId,
          checkpointKind: "closeout_deferred_pending_graph_nodes",
          stateSummary:
            "Closeout was deferred because accepted executable runtime graph nodes are still planned or need review.",
          artifactRefs: pendingGraphNodeIds.map((nodeId) => graphRef("node", nodeId)),
        });
        return {
          status: "continue",
          reasonCodes: [
            ...decision.reasonCodes,
            "closeout_deferred_pending_graph_nodes",
            ...pendingGraphNodeIds.map((nodeId) => `pending_graph_node:${nodeId}`),
          ],
          missionLedger: input.missionLedger,
        };
      }
      if (closeoutNodeId) {
        const stop = await this.maybeStopBeforeNodeExecution({
          graphId,
          nodeId: closeoutNodeId,
          iteration: input.iteration,
          missionLedger: input.missionLedger,
          decision,
        });
        if (stop) {
          return stop;
        }
        const executed = await this.executeNode({
          graphId,
          nodeId: closeoutNodeId,
          iteration: input.iteration,
          missionLedger: input.missionLedger,
          decision,
          executedNodeIds: input.executedNodeIds,
          loopGuard: input.loopGuard,
        });
        if (executed.status !== "continue") {
          return executed;
        }
        input.missionLedger = executed.missionLedger ?? input.missionLedger;
      } else if (!decisionMetadataString(decision, "acceptedModelAuthoredCloseoutRef")) {
        await this.options.graphs.recordCheckpoint({
          graphId,
          checkpointKind: "closeout_evidence_required_missing",
          stateSummary:
            "Closeout decision did not provide an executable closeout node or an accepted model-authored Closeout Capsule ref; scheduler cannot cleanly succeed.",
          artifactRefs: [],
        });
        return {
          status: "needs_review",
          reasonCodes: [
            ...decision.reasonCodes,
            "closeout_node_or_accepted_model_closeout_ref_required",
            "bare_create_closeout_cannot_succeed",
          ],
          missionLedger: input.missionLedger,
        };
      }
      const completionReadinessTool = await this.recordSchedulerTool({
        graphId,
        iteration: input.iteration,
        toolId: "scheduler.evaluate_completion_readiness",
        idempotencyKey: `iteration:${input.iteration}:decision:${decision.decisionId}:completion-readiness`,
        inputRef:
          decisionMetadataString(decision, "acceptedModelAuthoredCloseoutRef") ||
          graphRef("orchestrator-decision", decision.decisionId),
        inputSummary:
          "Evaluate final completion readiness after accepted closeout evidence and Mission Ledger gates.",
        metadata: {
          decisionId: decision.decisionId,
          schedulerPhase: "completion_review_readiness",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      decision.reasonCodes.push(...completionReadinessTool.reasonCodes);
      return {
        status: "succeeded",
        reasonCodes: decision.reasonCodes,
        missionLedger: input.missionLedger,
      };
    }
    if (["run_node", "retry_node", "repair_from_validation"].includes(decision.decisionKind)) {
      const nodeId = decision.runNodeId ?? decision.targetNodeId;
      if (!nodeId) {
        return { status: "needs_review", reasonCodes: ["scheduler_run_node_missing"] };
      }
      const selectTool = await this.recordSchedulerTool({
        graphId,
        iteration: input.iteration,
        toolId: "scheduler.select_next_node",
        idempotencyKey: `iteration:${input.iteration}:decision:${decision.decisionId}:select:${nodeId}`,
        inputRef: graphRef("node", nodeId),
        inputSummary: decision.rationaleForDecision || `Select node ${nodeId} for execution.`,
        nodeId,
        metadata: {
          decisionId: decision.decisionId,
          decisionKind: decision.decisionKind,
          schedulerPhase: "execution_in_progress",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      decision.reasonCodes.push(...selectTool.reasonCodes);
      if (input.executedNodeIds.length === 0) {
        const firstNodeTool = await this.recordSchedulerTool({
          graphId,
          iteration: input.iteration,
          toolId: "scheduler.approve_and_run_first_node",
          idempotencyKey: `iteration:${input.iteration}:decision:${decision.decisionId}:run-first:${nodeId}`,
          inputRef: graphRef("node", nodeId),
          inputSummary: `Approve scheduler-selected node ${nodeId} as the first executable node.`,
          nodeId,
          metadata: {
            decisionId: decision.decisionId,
            runNodeId: nodeId,
            schedulerPhase: "decomposition_accepted",
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        decision.reasonCodes.push(...firstNodeTool.reasonCodes);
      }
      const stop = await this.maybeStopBeforeNodeExecution({
        graphId,
        nodeId,
        iteration: input.iteration,
        missionLedger: input.missionLedger,
        decision,
      });
      if (stop) {
        return stop;
      }
      return this.executeNode({
        graphId,
        nodeId,
        iteration: input.iteration,
        missionLedger: input.missionLedger,
        decision,
        executedNodeIds: input.executedNodeIds,
        loopGuard: input.loopGuard,
      });
    }
    return { status: "needs_review", reasonCodes: ["scheduler_decision_kind_unhandled"] };
  }

  private async maybeStopBeforeNodeExecution(input: {
    graphId: string;
    nodeId: string;
    iteration: number;
    missionLedger: MissionContractLedger | null;
    decision: OrchestratorGraphDecision;
  }): Promise<{
    status: "continue" | "succeeded" | "needs_review" | "failed" | "waiting_for_human";
    reasonCodes: string[];
    missionLedger?: MissionContractLedger | null;
  } | null> {
    if (!this.options.beforeNodeExecution) {
      return null;
    }
    const snapshot = await this.options.graphs.readGraphSnapshot(input.graphId);
    const node = snapshot?.nodes.find((candidate) => candidate.nodeId === input.nodeId);
    if (!snapshot || !node) {
      return null;
    }
    const stopped = await this.options.beforeNodeExecution({
      graphId: input.graphId,
      iteration: input.iteration,
      node,
      decision: input.decision,
      snapshotSummary: summarizeSnapshot(snapshot),
      rawPromptStored: false,
      rawResponseStored: false,
    });
    if (!stopped) {
      return null;
    }
    return {
      status: stopped.status,
      reasonCodes: [
        ...input.decision.reasonCodes,
        ...stopped.reasonCodes,
        ...(stopped.selectedNodeId
          ? [`scheduler_boundary_selected_node:${stopped.selectedNodeId}`]
          : []),
      ],
      missionLedger: input.missionLedger,
    };
  }

  private async addNodes(input: {
    graphId: string;
    nodes: OrchestratorGraphNodeSpec[];
    edges: NonNullable<OrchestratorGraphDecision["newEdges"]>;
    addedNodeIds: string[];
    iteration: number;
  }): Promise<void> {
    const persistenceTimeoutMs = 60_000;
    await this.options.onProgress?.({
      stage: "scheduler_graph_node_persistence",
      status: "started",
      reasonCodes: [
        "scheduler_graph_node_persistence_started",
        `node_count:${input.nodes.length}`,
        `edge_count:${input.edges.length}`,
      ],
      currentPhase: "graph_node_persistence_starting",
      schedulerPhase: "decomposition_accepted",
      currentObjective: "Persist accepted scheduler graph nodes and edges before execution.",
      runtimeToolTimeoutMs: persistenceTimeoutMs,
      progressEmissionIntervalMs: 10_000,
      staleProgressAfterMs: 60_000,
      heartbeatState: "graph_node_persistence_starting",
      eli5Progress:
        "OpenClaw accepted the graph shape and is writing graph nodes into runtime state.",
    });
    let snapshot: RuntimeWorkGraphSnapshot | null;
    try {
      snapshot = await withSchedulerOperationTimeout({
        operation: this.options.graphs.readGraphSnapshot(input.graphId),
        timeoutMs: persistenceTimeoutMs,
        reasonCode: "runtime_work_graph_snapshot_timeout_before_node_persistence",
      });
    } catch (error) {
      const summary = error instanceof Error ? error.message : String(error);
      await this.options.onProgress?.({
        stage: "scheduler_graph_node_persistence",
        status: "failed",
        reasonCodes: [
          "scheduler_graph_node_persistence_failed",
          "runtime_work_graph_snapshot_failed_before_node_persistence",
          summary.slice(0, 180),
        ],
        currentPhase: "graph_node_persistence_failed",
        schedulerPhase: "needs_review",
        currentObjective: "Read runtime graph snapshot before persisting accepted scheduler nodes.",
        blockerSummary: `Runtime graph snapshot failed before node persistence: ${summary.slice(0, 180)}.`,
        runtimeToolTimeoutMs: persistenceTimeoutMs,
        heartbeatState: "graph_node_persistence_failed",
        eli5Progress:
          "OpenClaw accepted a graph decision but could not read the runtime graph state needed to write nodes.",
      });
      throw error;
    }
    const snapshotSummary = snapshot
      ? summarizeSnapshot(snapshot)
      : ({
          workflowId: "unknown",
          graphStatus: "running",
          nodeSummaries: [],
          edgeSummaries: [],
          edgeCount: 0,
          humanTaskCount: 0,
          latestCheckpointKinds: [],
        } satisfies RuntimeWorkGraphSchedulerSnapshotSummary);
    const existingNodesById = new Map((snapshot?.nodes ?? []).map((node) => [node.nodeId, node]));
    for (const node of input.nodes) {
      await this.options.onProgress?.({
        stage: "scheduler_graph_node_persistence",
        status: "started",
        nodeId: node.nodeId,
        roleId: node.assignedRole,
        reasonCodes: [
          "scheduler_graph_node_write_started",
          `node_kind:${node.nodeKind}`,
          ...(node.capabilityId ? [`capability_id:${node.capabilityId}`] : []),
        ],
        currentPhase: "graph_node_write_started",
        schedulerPhase: "decomposition_accepted",
        currentObjective:
          node.exactObjective || node.expectedOutput || `Persist graph node ${node.nodeId}.`,
        activeNodeKind: node.nodeKind,
        selectedCapabilityId: node.capabilityId ?? null,
        capabilityId: node.capabilityId ?? null,
        targetRefs: node.targetRefs ?? [],
        inputHandoffRefs: node.inputHandoffRefs ?? [],
        expectedOutput: node.expectedOutput ?? null,
        acceptanceCriteria: node.acceptanceCriteria ?? [],
        commitmentIdsAdvanced: node.commitmentIdsAdvanced ?? [],
        runtimeToolTimeoutMs: persistenceTimeoutMs,
        progressEmissionIntervalMs: 10_000,
        staleProgressAfterMs: 60_000,
        heartbeatState: "graph_node_write_started",
        eli5Progress: "OpenClaw is writing one accepted scheduler node into runtime state.",
      });
      const existingNode = existingNodesById.get(node.nodeId);
      if (existingNode) {
        await this.recordSchedulerTool({
          graphId: input.graphId,
          iteration: input.iteration,
          toolId: "scheduler.create_graph_node",
          idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:reuse`,
          inputRef: graphRef("node", node.nodeId),
          inputSummary:
            node.exactObjective ||
            node.expectedOutput ||
            `Reuse existing graph node ${node.nodeId}.`,
          nodeId: node.nodeId,
          roleRef: existingNode.assignedRole,
          modelRef: existingNode.modelOrWorkerRef,
          metadata: {
            nodeId: node.nodeId,
            nodeKind: existingNode.nodeKind,
            assignedRole: existingNode.assignedRole,
            proposedNodeKind: node.nodeKind,
            proposedAssignedRole: node.assignedRole,
            selectedCapabilityId: node.capabilityId ?? null,
            capabilityId: node.capabilityId ?? null,
            schedulerPhase: "planning_in_progress",
            reasonCodes: ["scheduler_node_already_exists_reused"],
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        continue;
      }
      const utilityDecision = utilityDecisionFromNodeMetadata(node);
      const utilityValidation = validateCostAwareCapabilityUtilityDecision({
        decision: utilityDecision,
        manifest: this.capabilityManifest,
        snapshotSummary,
      });
      const costAwareReadback =
        utilityDecision && utilityValidation.selectedCapability
          ? costAwareDecisionReadback({
              decision: utilityDecision,
              capability: utilityValidation.selectedCapability,
            })
          : null;
      try {
        await withSchedulerOperationTimeout({
          operation: this.options.graphs.addNode({
            graphId: input.graphId,
            nodeId: node.nodeId,
            nodeKind: node.nodeKind,
            assignedRole: node.assignedRole,
            modelOrWorkerRef: node.modelOrWorkerRef ?? null,
            inputHandoffRefs: node.inputHandoffRefs ?? [],
            nodeStatus: node.nodeKind === "human_task" ? "waiting_for_human" : "planned",
            metadata: {
              expectedOutput: node.expectedOutput,
              acceptanceCriteria: node.acceptanceCriteria,
              downstreamConsumer: node.downstreamConsumer,
              commitmentIdsAdvanced: node.commitmentIdsAdvanced ?? [],
              whyThisRoleIsNeededNow: node.whyThisRoleIsNeededNow ?? null,
              exactObjective: node.exactObjective ?? null,
              evidenceExpectation: node.evidenceExpectation ?? null,
              targetRefs: node.targetRefs ?? [],
              ...(node.metadata &&
              typeof node.metadata === "object" &&
              !Array.isArray(node.metadata)
                ? node.metadata
                : {}),
              costAwareUtilityDecision: utilityDecision,
              costAwareReadback,
              costAwarePolicyReasonCodes: utilityValidation.reasonCodes,
              rawPromptStored: false,
              rawResponseStored: false,
            },
          }),
          timeoutMs: persistenceTimeoutMs,
          reasonCode: `runtime_work_graph_add_node_timeout:${node.nodeId}`,
        });
      } catch (error) {
        const refreshedSnapshot = await withSchedulerOperationTimeout({
          operation: this.options.graphs.readGraphSnapshot(input.graphId),
          timeoutMs: persistenceTimeoutMs,
          reasonCode: `runtime_work_graph_snapshot_timeout_after_add_node_failure:${node.nodeId}`,
        });
        const refreshedNode = refreshedSnapshot?.nodes.find(
          (candidate) => candidate.nodeId === node.nodeId,
        );
        if (!refreshedNode) {
          const summary = error instanceof Error ? error.message : String(error);
          await this.options.onProgress?.({
            stage: "scheduler_graph_node_persistence",
            status: "failed",
            nodeId: node.nodeId,
            roleId: node.assignedRole,
            reasonCodes: [
              "scheduler_graph_node_write_failed",
              `node_kind:${node.nodeKind}`,
              ...(node.capabilityId ? [`capability_id:${node.capabilityId}`] : []),
              summary.slice(0, 180),
            ],
            currentPhase: "graph_node_write_failed",
            schedulerPhase: "needs_review",
            currentObjective:
              node.exactObjective || node.expectedOutput || `Persist graph node ${node.nodeId}.`,
            activeNodeKind: node.nodeKind,
            selectedCapabilityId: node.capabilityId ?? null,
            capabilityId: node.capabilityId ?? null,
            targetRefs: node.targetRefs ?? [],
            inputHandoffRefs: node.inputHandoffRefs ?? [],
            expectedOutput: node.expectedOutput ?? null,
            acceptanceCriteria: node.acceptanceCriteria ?? [],
            commitmentIdsAdvanced: node.commitmentIdsAdvanced ?? [],
            blockerSummary: `Runtime graph node write failed: ${summary.slice(0, 180)}.`,
            runtimeToolTimeoutMs: persistenceTimeoutMs,
            heartbeatState: "graph_node_write_failed",
            eli5Progress:
              "OpenClaw accepted a scheduler node but could not persist that node into runtime graph state.",
          });
          throw error;
        }
        if (
          refreshedNode.nodeKind !== node.nodeKind ||
          refreshedNode.assignedRole !== node.assignedRole
        ) {
          throw new Error(
            `runtime_work_graph_node_conflict:${node.nodeId}:${refreshedNode.nodeKind}:${node.nodeKind}`,
            { cause: error },
          );
        }
        existingNodesById.set(node.nodeId, refreshedNode);
        const duplicateLike = isUniqueConstraintError(error);
        await this.recordSchedulerTool({
          graphId: input.graphId,
          iteration: input.iteration,
          toolId: "scheduler.create_graph_node",
          idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:reuse-after-conflict`,
          inputRef: graphRef("node", node.nodeId),
          inputSummary:
            node.exactObjective ||
            node.expectedOutput ||
            `Reuse concurrently-created graph node ${node.nodeId}.`,
          nodeId: node.nodeId,
          roleRef: refreshedNode.assignedRole,
          modelRef: refreshedNode.modelOrWorkerRef,
          metadata: {
            nodeId: node.nodeId,
            nodeKind: refreshedNode.nodeKind,
            assignedRole: refreshedNode.assignedRole,
            proposedNodeKind: node.nodeKind,
            proposedAssignedRole: node.assignedRole,
            selectedCapabilityId: node.capabilityId ?? null,
            capabilityId: node.capabilityId ?? null,
            consideredCapabilityIds:
              utilityDecision?.consideredCapabilityIds ??
              (node.capabilityId ? [node.capabilityId] : []),
            costAwareUtilityDecision: utilityDecision,
            costAwareReadback,
            schedulerPhase: "planning_in_progress",
            reasonCodes: [
              duplicateLike
                ? "scheduler_node_already_exists_reused_after_unique_conflict"
                : "scheduler_node_already_exists_reused_after_add_failure",
            ],
            errorSummary:
              error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        continue;
      }
      await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "scheduler.create_graph_node",
        idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:create`,
        inputRef: graphRef("node", node.nodeId),
        inputSummary:
          node.exactObjective || node.expectedOutput || `Create graph node ${node.nodeId}.`,
        nodeId: node.nodeId,
        roleRef: node.assignedRole,
        modelRef: node.modelOrWorkerRef,
        metadata: {
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          assignedRole: node.assignedRole,
          selectedCapabilityId: node.capabilityId ?? null,
          capabilityId: node.capabilityId ?? null,
          consideredCapabilityIds:
            utilityDecision?.consideredCapabilityIds ??
            (node.capabilityId ? [node.capabilityId] : []),
          costAwareUtilityDecision: utilityDecision,
          costAwareReadback,
          commitmentIdsAdvanced: node.commitmentIdsAdvanced ?? [],
          schedulerPhase: "planning_in_progress",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      input.addedNodeIds.push(node.nodeId);
      existingNodesById.set(node.nodeId, {
        nodeId: node.nodeId,
        graphId: input.graphId,
        nodeKind: node.nodeKind,
        assignedRole: node.assignedRole,
        modelOrWorkerRef: node.modelOrWorkerRef ?? null,
        runtimeJobId: null,
        humanTaskId: null,
        inputHandoffRefs: node.inputHandoffRefs ?? [],
        outputArtifactRefs: [],
        nodeStatus: node.nodeKind === "human_task" ? "waiting_for_human" : "planned",
        budgetUsage: null,
        metadata: null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        startedAt: null,
        completedAt: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      });
      const postAddSnapshot = await withSchedulerOperationTimeout({
        operation: this.options.graphs.readGraphSnapshot(input.graphId),
        timeoutMs: persistenceTimeoutMs,
        reasonCode: `runtime_work_graph_snapshot_timeout_after_add_node:${node.nodeId}`,
      });
      const addedNode = postAddSnapshot?.nodes.find(
        (candidate) => candidate.nodeId === node.nodeId,
      );
      if (addedNode) {
        await this.options.onNodeAdded?.({
          graphId: input.graphId,
          node: addedNode,
          reasonCodes: ["scheduler_node_added"],
        });
      }
    }
    const knownNodeIds = new Set(existingNodesById.keys());
    const existingEdgeKeys = new Set(
      (snapshot?.edges ?? []).map(
        (edge) => `${edge.fromNodeId ?? ""}->${edge.toNodeId ?? ""}:${edge.edgeKind}`,
      ),
    );
    for (const [edgeIndex, edge] of input.edges.entries()) {
      const metadata = jsonRecord(edge.metadata ?? null);
      const symbolicFutureEndpoint = (value: string | null | undefined): boolean =>
        Boolean(
          value &&
          !knownNodeIds.has(value) &&
          (/^(future|milestone|phase|commitment)[:_-]/iu.test(value) ||
            value.includes("future") ||
            value.includes("milestone")),
        );
      const fromNodeId =
        edge.fromNodeId && knownNodeIds.has(edge.fromNodeId) ? edge.fromNodeId : null;
      const toNodeId = edge.toNodeId && knownNodeIds.has(edge.toNodeId) ? edge.toNodeId : null;
      if (edge.fromNodeId && !fromNodeId && !symbolicFutureEndpoint(edge.fromNodeId)) {
        await this.options.graphs.recordCheckpoint({
          graphId: input.graphId,
          checkpointKind: "scheduler_graph_edge_endpoint_rejected",
          stateSummary: `Rejected graph edge before DB write because fromNodeId ${edge.fromNodeId} is not a known node.`,
          artifactRefs: [graphRef("edge", edge.edgeId ?? `edge-${edgeIndex + 1}`)],
        });
        throw new Error(`runtime_work_graph_edge_from_node_unknown:${edge.fromNodeId}`);
      }
      if (edge.toNodeId && !toNodeId && !symbolicFutureEndpoint(edge.toNodeId)) {
        await this.options.graphs.recordCheckpoint({
          graphId: input.graphId,
          checkpointKind: "scheduler_graph_edge_endpoint_rejected",
          stateSummary: `Rejected graph edge before DB write because toNodeId ${edge.toNodeId} is not a known node.`,
          artifactRefs: [graphRef("edge", edge.edgeId ?? `edge-${edgeIndex + 1}`)],
        });
        throw new Error(`runtime_work_graph_edge_to_node_unknown:${edge.toNodeId}`);
      }
      const runtimeEdgeId = runtimeOwnedEdgeId({
        graphId: input.graphId,
        edgeId: edge.edgeId,
        fromNodeId,
        toNodeId,
        edgeKind: edge.edgeKind,
        index: edgeIndex,
      });
      const structuralEdgeKey = `${fromNodeId ?? ""}->${toNodeId ?? ""}:${edge.edgeKind}`;
      if (existingEdgeKeys.has(structuralEdgeKey)) {
        await this.recordSchedulerTool({
          graphId: input.graphId,
          iteration: input.iteration,
          toolId: "scheduler.create_graph_edge",
          idempotencyKey: `iteration:${input.iteration}:edge:${runtimeEdgeId}:reuse`,
          inputRef: graphRef("edge", runtimeEdgeId),
          inputSummary: `Reuse existing ${edge.edgeKind} edge from ${fromNodeId ?? edge.fromNodeId ?? "graph"} to ${toNodeId ?? edge.toNodeId ?? "graph"}.`,
          metadata: {
            edgeId: runtimeEdgeId,
            modelAuthoredEdgeId: edge.edgeId ?? null,
            fromNodeId,
            toNodeId,
            symbolicFromNodeId: edge.fromNodeId && !fromNodeId ? edge.fromNodeId : null,
            symbolicToNodeId: edge.toNodeId && !toNodeId ? edge.toNodeId : null,
            edgeKind: edge.edgeKind,
            schedulerPhase: "planning_in_progress",
            reasonCodes: ["scheduler_edge_already_exists_reused"],
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        continue;
      }
      await withSchedulerOperationTimeout({
        operation: this.options.graphs.addEdge({
          graphId: input.graphId,
          edgeId: runtimeEdgeId,
          fromNodeId,
          toNodeId,
          edgeKind: edge.edgeKind,
          reasonCodes: edge.reasonCodes ?? [],
          artifactRefs: edge.artifactRefs ?? [],
          metadata: {
            ...metadata,
            modelAuthoredEdgeId: edge.edgeId ?? null,
            symbolicFromNodeId: edge.fromNodeId && !fromNodeId ? edge.fromNodeId : null,
            symbolicToNodeId: edge.toNodeId && !toNodeId ? edge.toNodeId : null,
            runtimeOwnedEdgeId: true,
            rawPromptStored: false,
            rawResponseStored: false,
          },
        }),
        timeoutMs: persistenceTimeoutMs,
        reasonCode: `runtime_work_graph_add_edge_timeout:${runtimeEdgeId}`,
      });
      existingEdgeKeys.add(structuralEdgeKey);
      await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "scheduler.create_graph_edge",
        idempotencyKey: `iteration:${input.iteration}:edge:${runtimeEdgeId}:create`,
        inputRef: graphRef("edge", runtimeEdgeId),
        inputSummary: `Create ${edge.edgeKind} edge from ${fromNodeId ?? edge.fromNodeId ?? "graph"} to ${toNodeId ?? edge.toNodeId ?? "graph"}.`,
        metadata: {
          edgeId: runtimeEdgeId,
          modelAuthoredEdgeId: edge.edgeId ?? null,
          fromNodeId,
          toNodeId,
          symbolicFromNodeId: edge.fromNodeId && !fromNodeId ? edge.fromNodeId : null,
          symbolicToNodeId: edge.toNodeId && !toNodeId ? edge.toNodeId : null,
          edgeKind: edge.edgeKind,
          schedulerPhase: "planning_in_progress",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
    }
    await this.options.onProgress?.({
      stage: "scheduler_graph_node_persistence",
      status: "completed",
      reasonCodes: [
        "scheduler_graph_node_persistence_completed",
        `node_count:${input.nodes.length}`,
        `edge_count:${input.edges.length}`,
      ],
      currentPhase: "graph_node_persistence_completed",
      schedulerPhase: "decomposition_accepted",
      currentObjective: "Persist accepted scheduler graph nodes and edges before execution.",
      evidenceProducedRefs: [
        ...input.nodes.map((node) => graphRef("node", node.nodeId)),
        ...input.edges.map((edge, index) => graphRef("edge", edge.edgeId ?? `edge-${index + 1}`)),
      ].slice(0, 30),
      runtimeToolTimeoutMs: persistenceTimeoutMs,
      heartbeatState: "graph_node_persistence_completed",
      eli5Progress: "OpenClaw wrote accepted scheduler nodes and edges into runtime state.",
    });
  }

  private async executeNode(input: {
    graphId: string;
    nodeId: string;
    iteration: number;
    missionLedger: MissionContractLedger | null;
    decision?: OrchestratorGraphDecision;
    executedNodeIds: string[];
    loopGuard: RuntimeWorkGraphLoopGuard;
  }): Promise<{
    status: "continue" | "needs_review" | "failed" | "waiting_for_human";
    reasonCodes: string[];
    missionLedger?: MissionContractLedger | null;
  }> {
    const snapshot = await this.options.graphs.readGraphSnapshot(input.graphId);
    const node = snapshot?.nodes.find((candidate) => candidate.nodeId === input.nodeId);
    if (!snapshot || !node) {
      return { status: "needs_review", reasonCodes: ["scheduler_node_not_found"] };
    }
    if (node.nodeStatus === "succeeded" || node.nodeStatus === "skipped") {
      return {
        status: "continue",
        reasonCodes: [
          "scheduler_node_already_terminal_not_reexecuted",
          `scheduler_node_status:${node.nodeStatus}`,
          `scheduler_node:${node.nodeId}`,
        ],
        missionLedger: input.missionLedger,
      };
    }
    const executor = findExecutor(this.options.executors, node);
    if (!executor) {
      return { status: "needs_review", reasonCodes: ["scheduler_node_executor_not_found"] };
    }
    const nodeMetadata = jsonRecord(node.metadata);
    const nodeContextFreshness = validateNodeContextSnapshots(node);
    if (
      this.options.requireFreshContextSnapshotsForWorkerExecution === true &&
      nodeRequiresFreshContextSnapshot(node) &&
      !nodeContextFreshness.valid
    ) {
      const contextFreshnessResult: RuntimeWorkGraphNodeExecutionResult = {
        status: "needs_review",
        outputArtifactRefs: [
          ...nodeContextFreshness.freshRefs,
          ...nodeContextFreshness.staleRefs,
          ...nodeContextFreshness.missingRefs,
          ...nodeContextFreshness.rejectedRefs,
        ].slice(0, 40),
        reasonCodes: [
          "scheduler_node_context_freshness_blocked",
          ...nodeContextFreshness.reasonCodes,
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      };
      const contextRepairClassification = buildNodeRepairClassification({
        runtimeJobId: snapshot.graph.rootRuntimeJobId ?? null,
        workflowId: snapshot.graph.workflowId,
        graphId: input.graphId,
        iteration: input.iteration,
        node,
        decision: input.decision,
        result: contextFreshnessResult,
        missionEvidenceReasonCodes: nodeContextFreshness.reasonCodes,
        nodeCommitmentIds: jsonStringArray(nodeMetadata.commitmentIdsAdvanced),
        schedulerToolInvocationRefs: [],
        outputArtifactRefs: contextFreshnessResult.outputArtifactRefs,
      });
      const contextRepairTool = await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "scheduler.classify_repair_or_escalation",
        idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:context-freshness-repair`,
        inputRef: contextRepairClassification.classificationRef,
        inputSummary: `Classify context freshness failure before retry for node ${node.nodeId}.`,
        nodeId: node.nodeId,
        roleRef: node.assignedRole,
        modelRef: node.modelOrWorkerRef,
        metadata: {
          runtimeRepairClassification: contextRepairClassification as unknown as JsonValue,
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          nodeStatus: "needs_review",
          repairClassificationRef: contextRepairClassification.classificationRef,
          repairFailureClass: contextRepairClassification.failureClass,
          repairStrategy: contextRepairClassification.repairStrategy,
          repairBoundary: contextRepairClassification.selectedRepairBoundary,
          schedulerPhase: "repair_or_escalation",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      await this.options.graphs.updateNodeStatus({
        nodeId: node.nodeId,
        nodeStatus: "needs_review",
        metadataPatch: {
          lastResultStatus: "needs_review",
          lastStatusReasonCodes: [
            "scheduler_node_context_freshness_blocked",
            ...nodeContextFreshness.reasonCodes,
            ...contextRepairTool.reasonCodes,
          ].slice(0, 40),
          lastRepairClassificationRef: contextRepairClassification.classificationRef,
          lastRepairFailureClass: contextRepairClassification.failureClass,
          lastRepairStrategy: contextRepairClassification.repairStrategy,
          lastRepairBoundary: contextRepairClassification.selectedRepairBoundary,
          contextFreshnessStatus: nodeContextFreshness.freshnessStatus,
          contextRefreshAction: nodeContextFreshness.requiredRefreshAction,
          contextSnapshotRefs: nodeContextFreshness.freshRefs.slice(0, 40),
          staleContextSnapshotRefs: nodeContextFreshness.staleRefs.slice(0, 40),
          missingContextSnapshotRefs: nodeContextFreshness.missingRefs.slice(0, 40),
          rejectedContextSnapshotRefs: nodeContextFreshness.rejectedRefs.slice(0, 40),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      await this.options.onNodeStatusChanged?.({
        graphId: input.graphId,
        node,
        nodeStatus: "needs_review",
        evidenceRefs: [
          ...nodeContextFreshness.freshRefs,
          ...nodeContextFreshness.staleRefs,
          ...nodeContextFreshness.missingRefs,
          ...nodeContextFreshness.rejectedRefs,
        ].slice(0, 40),
        reasonCodes: [
          "scheduler_node_context_freshness_blocked",
          ...nodeContextFreshness.reasonCodes,
        ],
      });
      await this.options.onProgress?.({
        stage: "scheduler_node_context_freshness",
        status: "needs_review",
        nodeId: node.nodeId,
        roleId: node.assignedRole,
        reasonCodes: [
          "scheduler_node_context_freshness_blocked",
          "runtime_distinguished_context_insufficient_from_model_failure",
          ...nodeContextFreshness.reasonCodes,
          ...contextRepairTool.reasonCodes,
        ],
        currentObjective:
          typeof nodeMetadata.exactObjective === "string" ? nodeMetadata.exactObjective : null,
        activeNodeKind: node.nodeKind,
        capabilityId: nodeCapabilityId(node),
        modelRef: node.modelOrWorkerRef,
        targetRefs: nodeSchedulingTargetRefs(node),
        inputHandoffRefs: node.inputHandoffRefs,
        currentPhase: "context_freshness_blocked",
        validationState: "context_insufficient",
        evidenceProducedRefs: [
          contextRepairClassification.classificationRef,
          ...nodeContextFreshness.freshRefs,
          ...nodeContextFreshness.staleRefs,
          ...nodeContextFreshness.missingRefs,
          ...nodeContextFreshness.rejectedRefs,
        ].slice(0, 40),
        commitmentIdsAdvanced: jsonStringArray(nodeMetadata.commitmentIdsAdvanced),
        remainingOpenCommitmentIds: remainingOpenCommitmentIds(input.missionLedger),
        repairClassification: runtimeRepairClassificationSummary(contextRepairClassification),
        nextDecisionNeeded: nodeContextFreshness.requiredRefreshAction,
        blockerSummary:
          "Worker execution blocked before model/provider invocation because required context snapshots are missing, stale, rejected, or unknown.",
        eli5Progress:
          "OpenClaw stopped before calling the worker because the context packet is not fresh enough to trust.",
        schedulerPhase: "context_freshness_gate",
        schedulerToolId: "scheduler.classify_repair_or_escalation",
        schedulerToolInvocationRefs: contextRepairTool.refs,
        contextSnapshotRefs: nodeContextFreshness.freshRefs,
        staleContextSnapshotRefs: nodeContextFreshness.staleRefs,
        missingContextSnapshotRefs: nodeContextFreshness.missingRefs,
        rejectedContextSnapshotRefs: nodeContextFreshness.rejectedRefs,
        contextFreshnessStatus: nodeContextFreshness.freshnessStatus,
        contextRefreshAction: nodeContextFreshness.requiredRefreshAction,
        contextFreshnessSummary:
          "Runtime blocked worker execution on structural context freshness, not model quality.",
      });
      return {
        status: "needs_review",
        reasonCodes: [
          "scheduler_node_context_freshness_blocked",
          ...nodeContextFreshness.reasonCodes,
          ...contextRepairTool.reasonCodes,
        ],
        missionLedger: input.missionLedger,
      };
    }
    const costAwareReadback = jsonRecord(nodeMetadata.costAwareReadback);
    const nodeCommitmentIds = jsonStringArray(nodeMetadata.commitmentIdsAdvanced);
    const nodeTargetRefs = jsonStringArray(nodeMetadata.targetRefs);
    const nodeStartedAtMs = Date.now();
    const budgetPolicy = nodeRuntimeTaskBudgetPolicy({
      node,
      workflowId: snapshot.graph.workflowId,
      capabilityManifest: this.capabilityManifest,
      missionLedger: input.missionLedger,
    });
    const budgetSummary = summarizeRuntimeTaskBudgetPolicy(budgetPolicy);
    await this.options.graphs.updateNodeStatus({ nodeId: node.nodeId, nodeStatus: "running" });
    await this.options.onNodeStatusChanged?.({
      graphId: input.graphId,
      node,
      nodeStatus: "running",
      evidenceRefs: [],
      reasonCodes: [`scheduler_node_started:${node.nodeKind}`],
    });
    await this.options.onProgress?.({
      stage: "scheduler_node",
      status: "started",
      nodeId: node.nodeId,
      roleId: node.assignedRole,
      reasonCodes: [`scheduler_node_started:${node.nodeKind}`],
      currentObjective:
        typeof nodeMetadata.exactObjective === "string" ? nodeMetadata.exactObjective : null,
      whyThisNodeWasChosen:
        typeof nodeMetadata.whyThisRoleIsNeededNow === "string"
          ? nodeMetadata.whyThisRoleIsNeededNow
          : null,
      activeNodeKind: node.nodeKind,
      capabilityId: nodeCapabilityId(node),
      selectedCapabilityId:
        typeof costAwareReadback.selectedCapabilityId === "string"
          ? costAwareReadback.selectedCapabilityId
          : nodeCapabilityId(node),
      selectedProviderCapabilityProfileId:
        typeof costAwareReadback.selectedProviderCapabilityProfileId === "string"
          ? costAwareReadback.selectedProviderCapabilityProfileId
          : null,
      workerRef:
        typeof costAwareReadback.workerRef === "string" ? costAwareReadback.workerRef : null,
      capabilityRoleClass:
        typeof costAwareReadback.roleClass === "string" ? costAwareReadback.roleClass : null,
      capabilityCostClass:
        typeof costAwareReadback.costClass === "string" ? costAwareReadback.costClass : null,
      capabilityLatencyClass:
        typeof costAwareReadback.latencyClass === "string" ? costAwareReadback.latencyClass : null,
      capabilityContextCapacity:
        typeof costAwareReadback.contextCapacity === "string"
          ? costAwareReadback.contextCapacity
          : null,
      providerProfileProductionSelectable:
        typeof costAwareReadback.productionSelectable === "boolean"
          ? costAwareReadback.productionSelectable
          : null,
      providerProfileRequiresQualification:
        typeof costAwareReadback.productionSelectionRequiresQualification === "boolean"
          ? costAwareReadback.productionSelectionRequiresQualification
          : null,
      selectedModelQualificationProfileId:
        typeof costAwareReadback.selectedModelQualificationProfileId === "string"
          ? costAwareReadback.selectedModelQualificationProfileId
          : null,
      qualificationEvidenceRefs: jsonStringArray(costAwareReadback.qualificationEvidenceRefs),
      capabilityUtilityRationale:
        typeof costAwareReadback.utilityRationale === "string"
          ? costAwareReadback.utilityRationale
          : null,
      capabilityCostRationale:
        typeof costAwareReadback.costRationale === "string"
          ? costAwareReadback.costRationale
          : null,
      whyCheaperOptionsWereInsufficient:
        typeof costAwareReadback.whyCheaperOptionsWereInsufficient === "string"
          ? costAwareReadback.whyCheaperOptionsWereInsufficient
          : null,
      consideredCapabilityIds: jsonStringArray(costAwareReadback.consideredCapabilityIds),
      consideredProviderCapabilityProfileIds: jsonStringArray(
        costAwareReadback.consideredProviderCapabilityProfileIds,
      ),
      modelRef: node.modelOrWorkerRef,
      targetRefs: nodeTargetRefs,
      inputHandoffRefs: node.inputHandoffRefs,
      expectedOutput:
        typeof nodeMetadata.expectedOutput === "string" ? nodeMetadata.expectedOutput : null,
      acceptanceCriteria: jsonStringArray(nodeMetadata.acceptanceCriteria),
      currentPhase: "node_started",
      validationState: node.nodeKind === "validation" ? "started" : null,
      commitmentIdsAdvanced: nodeCommitmentIds,
      remainingOpenCommitmentIds: remainingOpenCommitmentIds(input.missionLedger),
      nextDecisionNeeded: "node_result",
      eli5Progress: `Started ${node.assignedRole} work for ${node.nodeKind}.`,
      schedulerPhase: "execution_in_progress",
      schedulerToolId: "worker.invoke",
      budgetPolicyRef: budgetPolicy.policyRef,
      budgetClass: budgetPolicy.budgetClass,
      budgetSummary,
      runtimeToolTimeoutMs: budgetPolicy.runtimeToolTimeoutMs,
      modelCallTimeoutMs: budgetPolicy.modelCallTimeoutMs,
      workerLoopTurnTimeoutMs: budgetPolicy.workerLoopTurnTimeoutMs,
      validationCommandTimeoutMs: budgetPolicy.validationCommandTimeoutMs,
      progressEmissionIntervalMs: budgetPolicy.progressEmissionIntervalMs,
      staleProgressAfterMs: budgetPolicy.staleProgressAfterMs,
      leaseTimeoutMs: budgetPolicy.leaseTimeoutMs,
      leaseHeartbeatMs: budgetPolicy.leaseHeartbeatMs,
      elapsedMs: 0,
      budgetRemainingMs: budgetPolicy.runtimeToolTimeoutMs,
      heartbeatState: "started",
    });
    let result: RuntimeWorkGraphNodeExecutionResult;
    let workerToolInvocationRef: string | null = null;
    if (this.options.runtimeToolKernel) {
      let nodeResult: RuntimeWorkGraphNodeExecutionResult | null = null;
      await this.options.onProgress?.({
        stage: "scheduler_node",
        status: "started",
        nodeId: node.nodeId,
        roleId: node.assignedRole,
        reasonCodes: ["worker_runtime_tool_call_started", ...budgetPolicy.reasonCodes],
        currentObjective:
          typeof nodeMetadata.exactObjective === "string" ? nodeMetadata.exactObjective : null,
        whyThisNodeWasChosen:
          typeof nodeMetadata.whyThisRoleIsNeededNow === "string"
            ? nodeMetadata.whyThisRoleIsNeededNow
            : null,
        activeNodeKind: node.nodeKind,
        capabilityId: nodeCapabilityId(node),
        modelRef: node.modelOrWorkerRef,
        targetRefs: nodeTargetRefs,
        inputHandoffRefs: node.inputHandoffRefs,
        currentPhase: "worker_runtime_tool_call_started",
        validationState: node.nodeKind === "validation" ? "started" : null,
        commitmentIdsAdvanced: nodeCommitmentIds,
        remainingOpenCommitmentIds: remainingOpenCommitmentIds(input.missionLedger),
        nextDecisionNeeded: "worker_result",
        eli5Progress: `${node.assignedRole} started its runtime tool call with a long-task budget.`,
        schedulerPhase: "execution_in_progress",
        schedulerToolId: "worker.invoke",
        budgetPolicyRef: budgetPolicy.policyRef,
        budgetClass: budgetPolicy.budgetClass,
        budgetSummary,
        runtimeToolTimeoutMs: budgetPolicy.runtimeToolTimeoutMs,
        modelCallTimeoutMs: budgetPolicy.modelCallTimeoutMs,
        workerLoopTurnTimeoutMs: budgetPolicy.workerLoopTurnTimeoutMs,
        validationCommandTimeoutMs: budgetPolicy.validationCommandTimeoutMs,
        progressEmissionIntervalMs: budgetPolicy.progressEmissionIntervalMs,
        staleProgressAfterMs: budgetPolicy.staleProgressAfterMs,
        leaseTimeoutMs: budgetPolicy.leaseTimeoutMs,
        leaseHeartbeatMs: budgetPolicy.leaseHeartbeatMs,
        elapsedMs: Date.now() - nodeStartedAtMs,
        budgetRemainingMs: Math.max(
          0,
          budgetPolicy.runtimeToolTimeoutMs - (Date.now() - nodeStartedAtMs),
        ),
        heartbeatState: "worker_call_started",
      });
      const traced = await this.options.runtimeToolKernel.invokeWithExecutor(
        {
          toolId: this.options.runtimeToolNodeToolId ?? "worker.invoke",
          runtimeJobId: node.runtimeJobId ?? snapshot.graph.rootRuntimeJobId,
          graphId: input.graphId,
          nodeId: node.nodeId,
          roleRef: node.assignedRole,
          modelRef: node.modelOrWorkerRef,
          idempotencyScope: `runtime-work-graph-node:${input.graphId}`,
          idempotencyKey: `${node.nodeId}:${input.iteration}:execute`,
          inputRef: graphRef("node", node.nodeId),
          inputSummary:
            typeof nodeMetadata.exactObjective === "string"
              ? nodeMetadata.exactObjective
              : `Execute ${node.nodeKind} for ${node.assignedRole}.`,
          budget: runtimeToolBudgetFromPolicy(budgetPolicy),
          metadata: {
            nodeKind: node.nodeKind,
            commitmentIdsAdvanced: nodeCommitmentIds,
            targetRefs: nodeTargetRefs,
            capabilityId: nodeCapabilityId(node),
            budgetPolicyRef: budgetPolicy.policyRef,
            budgetClass: budgetPolicy.budgetClass,
            budgetSummary,
            rawPromptStored: false,
            rawResponseStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
        },
        {
          async execute() {
            nodeResult = await executor.execute({
              graphId: input.graphId,
              node,
              snapshotSummary: summarizeSnapshot(snapshot),
              missionLedgerSummary: input.missionLedger
                ? summarizeMissionContractLedger(input.missionLedger)
                : null,
              rawPromptStored: false,
              rawResponseStored: false,
            });
            return {
              status:
                nodeResult.status === "waiting_for_human" || nodeResult.status === "blocked"
                  ? "needs_review"
                  : nodeResult.status === "canceled"
                    ? "failed"
                    : nodeResult.status,
              outputRef: nodeResult.outputArtifactRefs[0] ?? graphRef("node", node.nodeId),
              outputHash: `runtime-tool-output:${node.nodeId}:${nodeResult.status}`,
              outputSummary: `${node.assignedRole} finished ${node.nodeKind} with ${nodeResult.outputArtifactRefs.length} evidence ref(s).`,
              reasonCodes: [
                ...nodeResult.reasonCodes,
                ...(nodeResult.status === "waiting_for_human"
                  ? ["runtime_tool_node_waiting_for_human"]
                  : []),
              ],
              metadata: compactNodeResultMetadataForRuntimeToolTrace(nodeResult.metadata),
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              rawToolLogStored: false,
              rawCommandLogStored: false,
              rawDbRowsStored: false,
            };
          },
        },
      );
      workerToolInvocationRef = traced.invocationRef;
      await this.options.onProgress?.({
        stage: "scheduler_node",
        status:
          traced.invocation.status === "succeeded"
            ? "completed"
            : traced.invocation.status === "failed"
              ? "failed"
              : "needs_review",
        nodeId: node.nodeId,
        roleId: node.assignedRole,
        artifactRefs: [traced.invocationRef, ...traced.evidenceRefs],
        reasonCodes: ["worker_runtime_tool_call_completed", ...traced.reasonCodes],
        currentObjective:
          typeof nodeMetadata.exactObjective === "string" ? nodeMetadata.exactObjective : null,
        whyThisNodeWasChosen:
          typeof nodeMetadata.whyThisRoleIsNeededNow === "string"
            ? nodeMetadata.whyThisRoleIsNeededNow
            : null,
        activeNodeKind: node.nodeKind,
        capabilityId: nodeCapabilityId(node),
        modelRef: node.modelOrWorkerRef,
        targetRefs: nodeTargetRefs,
        inputHandoffRefs: node.inputHandoffRefs,
        currentPhase:
          traced.invocation.status === "failed" &&
          traced.reasonCodes.includes("runtime_tool_timeout")
            ? "worker_runtime_tool_timeout"
            : "worker_runtime_tool_call_completed",
        validationState: node.nodeKind === "validation" ? traced.invocation.status : null,
        commitmentIdsAdvanced: nodeCommitmentIds,
        remainingOpenCommitmentIds: remainingOpenCommitmentIds(input.missionLedger),
        nextDecisionNeeded: "node_result_review",
        blockerSummary:
          traced.invocation.status === "failed"
            ? (traced.invocation.errorSummary ?? traced.invocation.errorCode ?? null)
            : null,
        eli5Progress: `${node.assignedRole} runtime tool call finished with ${traced.invocation.status}.`,
        schedulerPhase: "execution_in_progress",
        schedulerToolId: "worker.invoke",
        schedulerToolInvocationRefs: [traced.invocationRef],
        budgetPolicyRef: budgetPolicy.policyRef,
        budgetClass: budgetPolicy.budgetClass,
        budgetSummary,
        runtimeToolTimeoutMs: budgetPolicy.runtimeToolTimeoutMs,
        modelCallTimeoutMs: budgetPolicy.modelCallTimeoutMs,
        workerLoopTurnTimeoutMs: budgetPolicy.workerLoopTurnTimeoutMs,
        validationCommandTimeoutMs: budgetPolicy.validationCommandTimeoutMs,
        progressEmissionIntervalMs: budgetPolicy.progressEmissionIntervalMs,
        staleProgressAfterMs: budgetPolicy.staleProgressAfterMs,
        leaseTimeoutMs: budgetPolicy.leaseTimeoutMs,
        leaseHeartbeatMs: budgetPolicy.leaseHeartbeatMs,
        elapsedMs: Date.now() - nodeStartedAtMs,
        budgetRemainingMs: Math.max(
          0,
          budgetPolicy.runtimeToolTimeoutMs - (Date.now() - nodeStartedAtMs),
        ),
        heartbeatState:
          traced.invocation.status === "failed" &&
          traced.reasonCodes.includes("runtime_tool_timeout")
            ? "timed_out"
            : "completed",
      });
      result =
        nodeResult ??
        ({
          status: traced.invocation.status === "failed" ? "failed" : "needs_review",
          outputArtifactRefs: traced.evidenceRefs,
          reasonCodes: traced.reasonCodes,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        } satisfies RuntimeWorkGraphNodeExecutionResult);
    } else {
      result = await executor.execute({
        graphId: input.graphId,
        node,
        snapshotSummary: summarizeSnapshot(snapshot),
        missionLedgerSummary: input.missionLedger
          ? summarizeMissionContractLedger(input.missionLedger)
          : null,
        rawPromptStored: false,
        rawResponseStored: false,
      });
    }
    const missionLedgerBefore = input.missionLedger;
    let missionLedger = input.missionLedger;
    this.recentNodeResultSummaries.push(summarizeRecentNodeResult({ node, result }));
    if (this.recentNodeResultSummaries.length > 12) {
      this.recentNodeResultSummaries.splice(0, this.recentNodeResultSummaries.length - 12);
    }
    const normalizedEvidence = normalizeEvidenceClaims({
      claims: result.evidenceClaims ?? [],
      outputArtifactRefs: result.outputArtifactRefs,
    });
    if (normalizedEvidence.reasonCodes.length > 0 || (result.evidenceClaims?.length ?? 0) > 0) {
      result = {
        ...result,
        evidenceClaims: normalizedEvidence.claims,
        reasonCodes: [...result.reasonCodes, ...normalizedEvidence.reasonCodes],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      };
    }
    const resultStatusBeforeGenericNodeValidation = result.status;
    const executorKey =
      typeof nodeMetadata.executorKey === "string" ? nodeMetadata.executorKey : null;
    const workerRef =
      typeof nodeMetadata.workerRef === "string" ? nodeMetadata.workerRef : node.modelOrWorkerRef;
    const validationRefs = [
      ...(result.validationRefs ?? []),
      ...result.outputArtifactRefs.filter((ref) => ref.includes("validation")),
    ];
    const changedFileRefs = [
      ...(result.changedFileRefs ?? []),
      ...result.outputArtifactRefs.filter(
        (ref) => ref.includes("source-change") || ref.includes("diff") || ref.includes("patch"),
      ),
    ];
    const closeoutRefs = [
      ...(result.closeoutRefs ?? []),
      ...result.outputArtifactRefs.filter((ref) => ref.includes("closeout")),
    ];
    const runtimeToolInvocationRefs = [
      ...(result.runtimeToolInvocationRefs ?? []),
      ...(workerToolInvocationRef ? [workerToolInvocationRef] : []),
    ];
    const genericNodeResult = genericWorkflowNodeResultFromRuntime({
      runtimeJobId: node.runtimeJobId ?? snapshot.graph.rootRuntimeJobId,
      workflowId: snapshot.graph.workflowId,
      graphId: input.graphId,
      nodeId: node.nodeId,
      nodeKind: node.nodeKind,
      roleClass: workflowRoleClassForNode(node),
      capabilityId: nodeCapabilityId(node),
      executorKey,
      workerRef,
      roleId: node.assignedRole,
      result,
      runtimeToolInvocationRefs,
      modelRunRefs: node.modelOrWorkerRef ? [node.modelOrWorkerRef] : [],
      contextHandoffRefs: node.inputHandoffRefs,
      validationRefs,
      changedFileRefs,
      humanDecisionRefs: [
        ...(result.humanDecisionRefs ?? []),
        ...result.outputArtifactRefs.filter((ref) => ref.includes("human")),
      ],
      closeoutRefs,
      limitations: result.limitations ?? [],
      ownerSummary:
        typeof result.metadata === "object" && result.metadata !== null
          ? ((jsonRecord(result.metadata).ownerSummary as string | undefined) ?? null)
          : null,
    });
    const genericNodeValidation = validateGenericWorkflowNodeResult({
      result: genericNodeResult,
      knownCommitmentIds: [
        ...(missionLedger?.blockingCommitments ?? []),
        ...(missionLedger?.nonBlockingCommitments ?? []),
      ].map((commitment) => commitment.commitmentId),
      evidenceClaimsRequired:
        this.options.requireEvidenceClaimsForMissionLedger === true &&
        node.nodeKind !== "closeout" &&
        node.nodeKind !== "human_task" &&
        node.nodeKind !== "context_synthesis",
    });
    const genericNodeResultRef = graphRef("node", `${node.nodeId}/generic-node-result`);
    if (!genericNodeValidation.valid) {
      result = {
        ...result,
        status: "needs_review",
        reasonCodes: [
          ...result.reasonCodes,
          "generic_workflow_node_result_contract_invalid",
          ...genericNodeValidation.reasonCodes,
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      };
    }
    const claimReasonCodes = validateEvidenceClaims({
      claims: result.evidenceClaims ?? [],
      ledger: missionLedger,
      outputArtifactRefs: result.outputArtifactRefs,
      nodeKind: node.nodeKind,
    });
    const claimRequirementReasonCodes = evidenceClaimRequirementReasonCodes({
      requireEvidenceClaims: this.options.requireEvidenceClaimsForMissionLedger === true,
      claims: result.evidenceClaims ?? [],
      claimReasonCodes,
      ledger: missionLedger,
      node,
      nodeCommitmentIds,
      resultStatus: resultStatusBeforeGenericNodeValidation,
    });
    const missionEvidenceReasonCodes = [...claimReasonCodes, ...claimRequirementReasonCodes];
    const nodeReviewTool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: "scheduler.review_node_result",
      idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:review-result`,
      inputRef: result.outputArtifactRefs[0] ?? graphRef("node", node.nodeId),
      inputSummary: `Review node ${node.nodeId} result against generic node contract and Mission Ledger evidence claims.`,
      nodeId: node.nodeId,
      roleRef: node.assignedRole,
      modelRef: node.modelOrWorkerRef,
      metadata: {
        nodeId: node.nodeId,
        nodeKind: node.nodeKind,
        nodeStatus: result.status,
        genericNodeValidationValid: genericNodeValidation.valid,
        evidenceClaimReasonCodes: missionEvidenceReasonCodes.slice(0, 20),
        outputArtifactRefs: result.outputArtifactRefs.slice(0, 12),
        schedulerPhase: "node_result_review",
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });
    result = {
      ...result,
      reasonCodes: [...result.reasonCodes, ...nodeReviewTool.reasonCodes],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
    if (node.nodeKind === "context_synthesis") {
      const contextSynthesisStorageBounded = result.reasonCodes.some((code) =>
        /artifact[_-](metadata|size).*limit|metadata exceeds \d+ bytes/iu.test(code),
      );
      const synthesisReviewTool = await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "scheduler.context_synthesis.review",
        idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:context-synthesis-review`,
        inputRef: result.outputArtifactRefs[0] ?? graphRef("node", node.nodeId),
        inputSummary:
          "Review context synthesis output before allowing dependency-aware implementation graph execution.",
        nodeId: node.nodeId,
        roleRef: node.assignedRole,
        modelRef: node.modelOrWorkerRef,
        metadata: {
          nodeId: node.nodeId,
          nodeStatus: result.status,
          outputArtifactRefs: result.outputArtifactRefs.slice(0, 12),
          reasonCodes: result.reasonCodes.slice(0, 20),
          schedulerPhase:
            result.status === "succeeded"
              ? "context_synthesis_accepted"
              : contextSynthesisStorageBounded
                ? "context_synthesis_storage_bound_repair_needed"
                : "context_synthesis_repair_needed",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      const synthesisGateTool = await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId:
          result.status === "succeeded"
            ? "scheduler.context_synthesis.accept"
            : "scheduler.context_synthesis.reject",
        idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:context-synthesis-gate`,
        inputRef: result.outputArtifactRefs[0] ?? graphRef("node", node.nodeId),
        inputSummary:
          result.status === "succeeded"
            ? "Accept context synthesis as the planning boundary before implementation."
            : contextSynthesisStorageBounded
              ? "Reject context synthesis persistence only; compact or shard artifact metadata before retrying, do not rerun context synthesis."
              : "Reject context synthesis; implementation remains structurally blocked.",
        nodeId: node.nodeId,
        roleRef: node.assignedRole,
        modelRef: node.modelOrWorkerRef,
        metadata: {
          nodeId: node.nodeId,
          nodeStatus: result.status,
          schedulerPhase:
            result.status === "succeeded"
              ? "context_synthesis_accepted"
              : contextSynthesisStorageBounded
                ? "context_synthesis_storage_bound_repair_needed"
                : "context_synthesis_repair_needed",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      result = {
        ...result,
        reasonCodes: [
          ...result.reasonCodes,
          ...synthesisReviewTool.reasonCodes,
          ...synthesisGateTool.reasonCodes,
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      };
    }
    let repairClassification: RuntimeRepairClassification | null = null;
    let repairClassificationToolRefs: string[] = [];
    if (result.status !== "succeeded" || missionEvidenceReasonCodes.length > 0) {
      repairClassification = buildNodeRepairClassification({
        runtimeJobId: snapshot.graph.rootRuntimeJobId ?? null,
        workflowId: snapshot.graph.workflowId,
        graphId: input.graphId,
        iteration: input.iteration,
        node,
        decision: input.decision,
        result,
        missionEvidenceReasonCodes,
        nodeCommitmentIds,
        schedulerToolInvocationRefs: workerToolInvocationRef ? [workerToolInvocationRef] : [],
        outputArtifactRefs: result.outputArtifactRefs,
        repairFieldPaths: missionEvidenceReasonCodes,
      });
      const repairTool = await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "scheduler.classify_repair_or_escalation",
        idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:repair-or-escalation`,
        inputRef:
          result.outputArtifactRefs[0] ??
          repairClassification.classificationRef ??
          graphRef("node", node.nodeId),
        inputSummary: `Classify repair or escalation path for node ${node.nodeId}.`,
        nodeId: node.nodeId,
        roleRef: node.assignedRole,
        modelRef: node.modelOrWorkerRef,
        metadata: {
          runtimeRepairClassification: repairClassification as unknown as JsonValue,
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          nodeStatus: result.status,
          evidenceClaimReasonCodes: missionEvidenceReasonCodes.slice(0, 20),
          repairClassificationRef: repairClassification.classificationRef,
          repairFailureClass: repairClassification.failureClass,
          repairStrategy: repairClassification.repairStrategy,
          repairBoundary: repairClassification.selectedRepairBoundary,
          schedulerPhase: "repair_or_escalation",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      repairClassificationToolRefs = repairTool.refs;
      result = {
        ...result,
        reasonCodes: [...result.reasonCodes, ...repairTool.reasonCodes],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      };
    }
    const evidenceClaimsAcceptedForEvaluation =
      this.options.requireEvidenceClaimsForMissionLedger !== true ||
      missionEvidenceReasonCodes.length === 0;
    if (
      missionLedger &&
      this.options.evaluateMissionLedger &&
      evidenceClaimsAcceptedForEvaluation &&
      !(
        (node.nodeKind === "context_scout" || node.assignedRole === "context_scout") &&
        snapshot.nodes.some((candidate) => candidate.nodeKind === "context_synthesis")
      )
    ) {
      missionLedger = await this.options.evaluateMissionLedger({
        ledger: missionLedger,
        graphId: input.graphId,
        iteration: input.iteration,
        nodeId: node.nodeId,
        decision: input.decision,
        outputArtifactRefs: result.outputArtifactRefs,
        evidenceClaims: result.evidenceClaims ?? [],
        reasonCodes: [...result.reasonCodes, ...claimReasonCodes],
        snapshotSummary: summarizeSnapshot(snapshot),
      });
      await this.options.onMissionLedgerUpdated?.(missionLedger);
    }
    const effectiveNodeStatus: TeamGraphNode["nodeStatus"] =
      result.status === "succeeded" && missionEvidenceReasonCodes.length > 0
        ? "needs_review"
        : executionStatusToNodeStatus(result.status);
    const loopGuardDecision = evaluateLoopGuard({
      guard: input.loopGuard,
      node,
      result,
      missionLedgerBefore,
      missionLedgerAfter: missionLedger,
    });
    await this.options.graphs.updateNodeStatus({
      nodeId: node.nodeId,
      nodeStatus: loopGuardDecision.halted ? "needs_review" : effectiveNodeStatus,
      outputArtifactRefs: result.outputArtifactRefs,
      metadataPatch: {
        ...(node.nodeKind === "context_synthesis"
          ? {
              contextSynthesisRef:
                result.outputArtifactRefs.find((ref) => ref.includes("/context-synthesis/")) ??
                result.outputArtifactRefs[0] ??
                null,
              contextSynthesisStatus:
                effectiveNodeStatus === "succeeded" ? "accepted" : "needs_review",
              contextSynthesisAccepted: effectiveNodeStatus === "succeeded",
            }
          : {}),
        lastResultStatus: result.status,
        lastStatusReasonCodes: uniqueStrings([
          ...result.reasonCodes,
          ...missionEvidenceReasonCodes,
          ...loopGuardDecision.reasonCodes,
        ]).slice(0, 40),
        lastRepairClassificationRef: repairClassification?.classificationRef ?? null,
        lastRepairFailureClass: repairClassification?.failureClass ?? null,
        lastRepairStrategy: repairClassification?.repairStrategy ?? null,
        lastRepairBoundary: repairClassification?.selectedRepairBoundary ?? null,
        highCapabilityEscalationRequired: result.reasonCodes.some(
          (code) =>
            code === "non_codex_worker_schema_contract_edit_requires_high_capability_escalation" ||
            code === "non_codex_worker_model_call_timeout_escalated" ||
            code === "worker_escalation_recorded",
        ),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    await this.options.onNodeStatusChanged?.({
      graphId: input.graphId,
      node,
      nodeStatus: loopGuardDecision.halted ? "needs_review" : effectiveNodeStatus,
      evidenceRefs: result.outputArtifactRefs,
      reasonCodes: [
        ...result.reasonCodes,
        ...missionEvidenceReasonCodes,
        ...loopGuardDecision.reasonCodes,
      ],
    });
    await this.options.onProgress?.({
      stage: "scheduler_node",
      status:
        effectiveNodeStatus === "succeeded"
          ? "completed"
          : result.status === "waiting_for_human"
            ? "waiting_for_human"
            : effectiveNodeStatus === "failed"
              ? "failed"
              : "needs_review",
      nodeId: node.nodeId,
      roleId: node.assignedRole,
      artifactRefs: result.outputArtifactRefs,
      reasonCodes: [
        ...result.reasonCodes,
        ...missionEvidenceReasonCodes,
        ...loopGuardDecision.reasonCodes,
      ],
      currentObjective:
        typeof nodeMetadata.exactObjective === "string" ? nodeMetadata.exactObjective : null,
      whyThisNodeWasChosen:
        typeof nodeMetadata.whyThisRoleIsNeededNow === "string"
          ? nodeMetadata.whyThisRoleIsNeededNow
          : null,
      activeNodeKind: node.nodeKind,
      capabilityId: nodeCapabilityId(node),
      selectedCapabilityId:
        typeof costAwareReadback.selectedCapabilityId === "string"
          ? costAwareReadback.selectedCapabilityId
          : nodeCapabilityId(node),
      selectedProviderCapabilityProfileId:
        typeof costAwareReadback.selectedProviderCapabilityProfileId === "string"
          ? costAwareReadback.selectedProviderCapabilityProfileId
          : null,
      workerRef:
        typeof costAwareReadback.workerRef === "string" ? costAwareReadback.workerRef : null,
      capabilityRoleClass:
        typeof costAwareReadback.roleClass === "string" ? costAwareReadback.roleClass : null,
      capabilityCostClass:
        typeof costAwareReadback.costClass === "string" ? costAwareReadback.costClass : null,
      capabilityLatencyClass:
        typeof costAwareReadback.latencyClass === "string" ? costAwareReadback.latencyClass : null,
      capabilityContextCapacity:
        typeof costAwareReadback.contextCapacity === "string"
          ? costAwareReadback.contextCapacity
          : null,
      providerProfileProductionSelectable:
        typeof costAwareReadback.productionSelectable === "boolean"
          ? costAwareReadback.productionSelectable
          : null,
      providerProfileRequiresQualification:
        typeof costAwareReadback.productionSelectionRequiresQualification === "boolean"
          ? costAwareReadback.productionSelectionRequiresQualification
          : null,
      selectedModelQualificationProfileId:
        typeof costAwareReadback.selectedModelQualificationProfileId === "string"
          ? costAwareReadback.selectedModelQualificationProfileId
          : null,
      qualificationEvidenceRefs: jsonStringArray(costAwareReadback.qualificationEvidenceRefs),
      capabilityUtilityRationale:
        typeof costAwareReadback.utilityRationale === "string"
          ? costAwareReadback.utilityRationale
          : null,
      capabilityCostRationale:
        typeof costAwareReadback.costRationale === "string"
          ? costAwareReadback.costRationale
          : null,
      whyCheaperOptionsWereInsufficient:
        typeof costAwareReadback.whyCheaperOptionsWereInsufficient === "string"
          ? costAwareReadback.whyCheaperOptionsWereInsufficient
          : null,
      consideredCapabilityIds: jsonStringArray(costAwareReadback.consideredCapabilityIds),
      consideredProviderCapabilityProfileIds: jsonStringArray(
        costAwareReadback.consideredProviderCapabilityProfileIds,
      ),
      modelRef: node.modelOrWorkerRef,
      targetRefs: nodeTargetRefs,
      inputHandoffRefs: node.inputHandoffRefs,
      expectedOutput:
        typeof nodeMetadata.expectedOutput === "string" ? nodeMetadata.expectedOutput : null,
      acceptanceCriteria: jsonStringArray(nodeMetadata.acceptanceCriteria),
      currentPhase: "node_completed",
      validationState:
        node.nodeKind === "validation"
          ? result.status === "succeeded"
            ? "passed"
            : result.status
          : null,
      evidenceProducedRefs: result.outputArtifactRefs,
      genericNodeExecutionResultRefs: [genericNodeResultRef],
      evidenceClaimRefs: (result.evidenceClaims ?? [])
        .map((claim) => claim.evidenceRef)
        .slice(0, 20),
      evidenceClaims: genericNodeResult.evidenceClaims
        .map((claim) => ({
          evidenceClaimId: claim.evidenceClaimId,
          commitmentId: claim.commitmentId,
          evidenceKind: claim.evidenceKind,
          evidenceRef: claim.evidenceRef,
          claimSummary: claim.claimSummary,
          producedByNodeId: claim.producedByNodeId,
          producedByCapabilityId: claim.producedByCapabilityId,
          producedByExecutorKey: claim.producedByExecutorKey,
          validationRefs: claim.validationRefs.slice(0, 8),
          changedFileRefs: claim.changedFileRefs.slice(0, 8),
          limitations: claim.limitations.slice(0, 8),
        }))
        .slice(0, 20),
      commitmentIdsAdvanced: nodeCommitmentIds,
      remainingOpenCommitmentIds: remainingOpenCommitmentIds(missionLedger),
      repairClassification: repairClassification
        ? runtimeRepairClassificationSummary(repairClassification)
        : null,
      nextDecisionNeeded:
        missionLedger && missionLedgerHasOpenBlockingCommitments(missionLedger)
          ? "orchestrator_next_action_for_open_commitments"
          : "closeout_or_next_node",
      blockerSummary:
        missionLedger && missionLedgerHasOpenBlockingCommitments(missionLedger)
          ? `${openBlockingMissionCommitments(missionLedger).length} blocking commitment(s) remain open.`
          : null,
      eli5Progress: `${node.assignedRole} finished ${node.nodeKind} with ${result.outputArtifactRefs.length} evidence ref(s).`,
      schedulerPhase: "execution_in_progress",
      schedulerToolId: workerToolInvocationRef ? "worker.invoke" : null,
      schedulerToolInvocationRefs: [
        ...(workerToolInvocationRef ? [workerToolInvocationRef] : []),
        ...repairClassificationToolRefs,
      ],
      budgetPolicyRef: budgetPolicy.policyRef,
      budgetClass: budgetPolicy.budgetClass,
      budgetSummary,
      runtimeToolTimeoutMs: budgetPolicy.runtimeToolTimeoutMs,
      modelCallTimeoutMs: budgetPolicy.modelCallTimeoutMs,
      workerLoopTurnTimeoutMs: budgetPolicy.workerLoopTurnTimeoutMs,
      validationCommandTimeoutMs: budgetPolicy.validationCommandTimeoutMs,
      progressEmissionIntervalMs: budgetPolicy.progressEmissionIntervalMs,
      staleProgressAfterMs: budgetPolicy.staleProgressAfterMs,
      leaseTimeoutMs: budgetPolicy.leaseTimeoutMs,
      leaseHeartbeatMs: budgetPolicy.leaseHeartbeatMs,
      elapsedMs: Date.now() - nodeStartedAtMs,
      budgetRemainingMs: Math.max(
        0,
        budgetPolicy.runtimeToolTimeoutMs - (Date.now() - nodeStartedAtMs),
      ),
      heartbeatState: effectiveNodeStatus === "succeeded" ? "completed" : "needs_review",
    });
    input.executedNodeIds.push(node.nodeId);
    if (loopGuardDecision.halted) {
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind: "scheduler_same_kind_loop_guard_triggered",
        stateSummary:
          "Scheduler halted repeated same-kind node execution because no new evidence refs, mission progress, or role diversity were observed.",
        artifactRefs: result.outputArtifactRefs.slice(0, 12),
      });
      return {
        status: "needs_review",
        reasonCodes: [
          ...result.reasonCodes,
          ...missionEvidenceReasonCodes,
          ...loopGuardDecision.reasonCodes,
        ],
        missionLedger,
      };
    }
    if (
      effectiveNodeStatus === "needs_review" &&
      result.status === "succeeded" &&
      missionEvidenceReasonCodes.length > 0 &&
      missionLedger &&
      missionLedgerHasOpenBlockingCommitments(missionLedger)
    ) {
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind: "node_evidence_claims_returned_to_orchestrator",
        stateSummary:
          "Node produced output but Mission Ledger evidence claims were invalid or incomplete; scheduler will ask orchestrator for repair, split, escalation, or evidence handoff.",
        artifactRefs: result.outputArtifactRefs.slice(0, 12),
      });
      return {
        status: "continue",
        reasonCodes: [
          ...result.reasonCodes,
          ...missionEvidenceReasonCodes,
          "node_evidence_claims_returned_to_orchestrator_for_repair",
        ],
        missionLedger,
      };
    }
    if (
      result.status === "failed" &&
      missionLedger &&
      missionLedgerHasOpenBlockingCommitments(missionLedger) &&
      !nodeFailureIsExplicitlyUnrecoverable(result)
    ) {
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind: "node_failure_returned_to_orchestrator",
        stateSummary:
          "Node failed with recoverable evidence while mission commitments remain open; scheduler will ask orchestrator for repair, split, escalation, or human decision.",
        artifactRefs: result.outputArtifactRefs.slice(0, 12),
      });
      return {
        status: "continue",
        reasonCodes: [
          ...result.reasonCodes,
          ...missionEvidenceReasonCodes,
          "node_failure_returned_to_orchestrator_for_repair",
        ],
        missionLedger,
      };
    }
    if (result.status === "failed") {
      return {
        status: "failed",
        reasonCodes: [...result.reasonCodes, ...missionEvidenceReasonCodes],
        missionLedger,
      };
    }
    if (result.status === "needs_review") {
      if (missionLedger && missionLedgerHasOpenBlockingCommitments(missionLedger)) {
        await this.options.graphs.recordCheckpoint({
          graphId: input.graphId,
          checkpointKind: "node_needs_review_returned_to_orchestrator",
          stateSummary:
            "Node produced needs-review evidence while mission commitments remain open; scheduler will ask orchestrator for the next repair/split/escalation action.",
          artifactRefs: result.outputArtifactRefs.slice(0, 12),
        });
        return {
          status: "continue",
          reasonCodes: [
            ...result.reasonCodes,
            ...missionEvidenceReasonCodes,
            "node_needs_review_returned_to_orchestrator",
          ],
          missionLedger,
        };
      }
      return {
        status: "needs_review",
        reasonCodes: [...result.reasonCodes, ...missionEvidenceReasonCodes],
        missionLedger,
      };
    }
    if (result.status === "waiting_for_human") {
      return {
        status: "waiting_for_human",
        reasonCodes: [...result.reasonCodes, ...missionEvidenceReasonCodes],
        missionLedger,
      };
    }
    return {
      status: "continue",
      reasonCodes: [...result.reasonCodes, ...missionEvidenceReasonCodes],
      missionLedger,
    };
  }

  private async result(
    input: Omit<
      RuntimeWorkGraphSchedulerResult,
      "rawPromptStored" | "rawResponseStored" | "rawProviderLogStored" | "workQueueLifecycleMutated"
    >,
  ): Promise<RuntimeWorkGraphSchedulerResult> {
    const graphStatus = terminalGraphStatusForSchedulerStatus(input.status);
    try {
      await this.options.graphs.updateGraphStatus({
        graphId: input.graphId,
        graphStatus,
        metadata: {
          terminalSchedulerStatus: input.status,
          terminalReasonCodes: input.reasonCodes.slice(0, 40),
          terminalIterations: input.iterations,
          terminalOpenCommitmentIds: input.missionLedger
            ? input.missionLedger.commitments
                .filter((commitment) => commitment.blocking && commitment.status !== "satisfied")
                .map((commitment) => commitment.commitmentId)
                .slice(0, 20)
            : [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind: `scheduler_terminal_${input.status}`,
        stateSummary: `Scheduler terminalized graph as ${graphStatus} from ${input.status}.`,
        artifactRefs: input.decisionRefs.slice(-8),
      });
    } catch {
      // The runtime_work_graph_not_found path reports the primary failure; terminal
      // sync cannot run without a graph row.
    }
    return {
      ...input,
      missionLedger: input.missionLedger ?? null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
  }
}
