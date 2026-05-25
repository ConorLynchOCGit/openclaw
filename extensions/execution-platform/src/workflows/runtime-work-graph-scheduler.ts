import { createHash } from "node:crypto";
import {
  missingField,
  repairRequestForMissingFields,
  type ModelDecisionMissingField,
  type ModelDecisionRepairRequest,
} from "../model-decision-contracts/index.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { buildContextBrokerRequest, summarizeContextBrokerRequest } from "./context-broker.ts";
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
import {
  NodeExecutionPacketSchema,
  buildMissingNodeExecutionPacketReadinessState,
  evaluateNodeExecutionPacketReadiness,
  summarizeNodeExecutionPacketForReadback,
  type NodeExecutionPacket,
  type RuntimeNodeLifecycleState,
} from "./node-resource-materialization.ts";
import { validateNonCodexTaskDecompositionDecision } from "./non-codex-task-decomposition-policy.ts";
import {
  compileOrchestratorGraphDecision,
  validateOrchestratorGraphDecision,
  type OrchestratorGraphEdgeSpec,
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
  runtimeNodeCapabilityManifestForModel,
  type RuntimeNodeCapability,
  type RuntimeNodeCapabilityManifest,
  type RuntimeNodeCapabilityPhase,
} from "./runtime-node-capability-registry.ts";
import {
  deriveRuntimeTaskBudgetPolicy,
  runtimeToolBudgetFromPolicy,
  summarizeRuntimeTaskBudgetPolicy,
  type RuntimeTaskBudgetPolicy,
} from "./runtime-task-budget-policy.ts";
import {
  DEFAULT_EXPANSION_ADMISSION_POLICY,
  evaluateRuntimeWorkGraphExpansionAdmission,
  summarizeExpansionAdmissionDecision,
  type RuntimeWorkGraphExpansionAdmissionPolicy,
} from "./runtime-work-graph-expansion-controller.ts";
import type {
  RuntimeWorkGraphRepository,
  RuntimeWorkGraphSnapshot,
} from "./runtime-work-graph-repository.ts";
import type { RuntimeWorkGraphSchedulerSnapshotSummary } from "./runtime-work-graph-scheduler-contracts.ts";
import {
  buildSuperstepBranchResult,
  type SuperstepBranchResult,
} from "./runtime-work-graph-superstep.ts";
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
import { compileWorkIntent } from "./work-intent.ts";
import type {
  CommitmentEvidenceClaim,
  RuntimeWorkGraphNodeExecutionResult,
} from "./workflow-node-execution-contracts.ts";
import {
  genericWorkflowNodeResultFromRuntime,
  validateGenericWorkflowNodeResult,
} from "./workflow-node-execution.ts";
import type {
  WorkflowEntryNodePolicy,
  WorkflowRoleClass,
} from "./workflow-orchestration-policy.ts";

const MAX_CONTEXT_SCOUT_COMMITMENTS_PER_NODE = 3;

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

export type RuntimeWorkGraphSchedulerFrontierState = {
  artifactKind: "runtime_work_graph_scheduler_frontier_state";
  schemaVersion: "execution-platform.runtime-work-graph.scheduler-frontier.v1";
  graphId: string;
  currentSuperstep: number;
  nodeCount: number;
  edgeCount: number;
  executableReadyNodeIds: string[];
  selectedExecutableNodeIds: string[];
  blockedFrontierNodeIds: string[];
  aggregateBlockedNodeIds: string[];
  nonRunnableNodeIds: string[];
  dependencyBlockedNodeIds: string[];
  contextBlockedNodeIds: string[];
  resourceBlockedNodeIds: string[];
  validationBlockedNodeIds: string[];
  reviewBlockedNodeIds: string[];
  closeoutBlockedNodeIds: string[];
  branchIds: string[];
  readinessRefs: string[];
  resourceRefs: string[];
  contextRefs: string[];
  openCommitmentIds: string[];
  lockConflictNodeIds: string[];
  providerBudgetBlockedNodeIds: string[];
  nextLegalTransition: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type RuntimeWorkGraphNoProgressSignature = {
  artifactKind: "runtime_work_graph_no_progress_signature";
  schemaVersion: "execution-platform.runtime-work-graph.no-progress-signature.v1";
  graphId: string;
  iteration: number;
  superstep: number;
  nodeCount: number;
  edgeCount: number;
  executableFrontierNodeIds: string[];
  blockedFrontierNodeIds: string[];
  blockerReasonCodes: string[];
  openCommitmentIds: string[];
  newEvidenceRefs: string[];
  newReadinessRefs: string[];
  newWorkQueueRefs: string[];
  createdNodeIds: string[];
  reusedNodeIds: string[];
  createdEdgeIds: string[];
  reusedEdgeIds: string[];
  selectedDecisionId: string | null;
  selectedDecisionKind: string | null;
  terminalBlockerCode: string | null;
  signatureHash: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
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
    schedulerFrontierState?: RuntimeWorkGraphSchedulerFrontierState | null;
    noProgressSignature?: RuntimeWorkGraphNoProgressSignature | null;
    noProgressRepeatCount?: number | null;
    missionLedgerEvaluationThrottle?: JsonValue | null;
    expansionAdmissionDecision?: JsonValue | null;
    expansionAdmissionDecisionRef?: string | null;
    expansionAdmissionPolicyRef?: string | null;
    expansionAdmissionStatus?: string | null;
    expansionAdmissionOriginalNodeCount?: number | null;
    expansionAdmissionOriginalEdgeCount?: number | null;
    expansionAdmissionAdmittedNodeCount?: number | null;
    expansionAdmissionAdmittedEdgeCount?: number | null;
    expansionAdmissionDeferredNodeCount?: number | null;
    expansionAdmissionDeferredEdgeCount?: number | null;
    expansionAdmissionReadyFrontierNodeIds?: string[];
    expansionAdmissionAdmittedNodeIds?: string[];
    expansionAdmissionDeferredNodeIds?: string[];
    expansionAdmissionNextTransition?: string | null;
    expansionAdmissionPrerequisiteCritical?: boolean | null;
    expansionAdmissionReasonCodes?: string[];
    postSynthesisGraphQuality?: PostSynthesisGraphQualityReport | null;
    postSynthesisGraphQualityState?: string | null;
    postSynthesisMissingRoleObligations?: string[];
    postSynthesisPresentRoleObligations?: string[];
    postSynthesisBroadCodexShare?: number | null;
    postSynthesisPremiumShare?: number | null;
    commitmentWorkPacketSummaries?: Array<{
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
    implementationContextPacketRef?: string | null;
    implementationContextReadinessStatus?: string | null;
    implementationTaskPacketRefs?: string[];
    resolvedTargetFileRefs?: string[];
    readableTargetFileRefs?: string[];
    missingTargetRefs?: string[];
    unreadableTargetRefs?: string[];
    directoryOnlyTargetRefs?: string[];
    candidateConcreteFileRefs?: string[];
    targetFileSnapshotRefs?: string[];
    targetFileSnapshotHashes?: string[];
    implementationContextRepairAction?: string | null;
    nodeExecutionPacketRef?: string | null;
    nodeExecutionPacketStatus?: string | null;
    resourcePacketKind?: string | null;
    resourcePacketRef?: string | null;
    resourceReadinessReasonCodes?: string[];
    resourceBlockingLimitations?: string[];
    resourceNonblockingLimitations?: string[];
    nodeReadinessState?: JsonValue | null;
    nodeReadinessStateRef?: string | null;
    nodeReadinessPhase?: string | null;
    nodeReadinessStatus?: string | null;
    nodeReadinessRepairAction?: string | null;
    nodeReadinessNextAllowedTransitions?: string[];
    nodeReadinessFreshnessStatus?: string | null;
    nodeReadinessSnapshotStatus?: string | null;
    nodeReadinessContextStatus?: string | null;
    contextBrokerRequestRefs?: string[];
    contextBrokerStatuses?: string[];
    contextBrokerDedupeKeys?: string[];
    contextBrokerConsumerNodeIds?: string[];
    contextBrokerReasonCodes?: string[];
    contextBrokerNextTransition?: string | null;
    nodeReadinessValidationStatus?: string | null;
    nodeReadinessAuthorityStatus?: string | null;
    nodeReadinessEvidenceStatus?: string | null;
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
  requireNodeExecutionPacketForWorkerExecution?: boolean;
  deferCloseoutUntilExecutableGraphComplete?: boolean;
  roleCoverageProfile?: RuntimeWorkGraphRoleCoverageProfile | null;
  entryNodePolicy?: WorkflowEntryNodePolicy | null;
  maxIterations?: number;
  maxDecisionRepairAttempts?: number;
  maxParallelNodeExecutions?: number;
  expansionAdmissionPolicy?: Partial<RuntimeWorkGraphExpansionAdmissionPolicy> | null;
  preferExecutableFrontierBeforeOrchestrator?: boolean;
};

function summarizeSnapshot(
  snapshot: RuntimeWorkGraphSnapshot,
): RuntimeWorkGraphSchedulerSnapshotSummary {
  return {
    workflowId: snapshot.graph.workflowId,
    rootRuntimeJobId: snapshot.graph.rootRuntimeJobId,
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
      targetRefs: nodeSchedulingTargetRefs(node).slice(0, 32),
      resourceRequirementKinds: jsonStringArray(jsonRecord(node.metadata).resourceRequirementKinds),
      contextQuestions: jsonStringArray(
        jsonRecord(node.metadata).contextQuestions ??
          jsonRecord(node.metadata).targetWorkContextQuestions,
      ),
      contextSnapshotRefs: [
        ...jsonContextSnapshotArray(jsonRecord(node.metadata).contextSnapshotRefs).map(
          (snapshotRef) => snapshotRef.snapshotRef,
        ),
        ...jsonContextSnapshotArray(jsonRecord(node.metadata).providedContextSnapshotRefs).map(
          (snapshotRef) => snapshotRef.snapshotRef,
        ),
      ].slice(0, 40),
      nodeReadinessContextStatus:
        typeof jsonRecord(node.metadata).nodeReadinessContextStatus === "string"
          ? (jsonRecord(node.metadata).nodeReadinessContextStatus as string)
          : null,
      nodeReadinessContextLimitationStatus:
        typeof jsonRecord(node.metadata).nodeReadinessContextLimitationStatus === "string"
          ? (jsonRecord(node.metadata).nodeReadinessContextLimitationStatus as string)
          : null,
      contextLimitationWaiverRefs: jsonStringArray(
        jsonRecord(node.metadata).contextLimitationWaiverRefs,
      ),
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
  branchResults: SuperstepBranchResult[];
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

function nodeWritableSchedulingTargetRefs(node: TeamGraphNode): string[] {
  const metadata = jsonRecord(node.metadata);
  return uniqueStrings([
    ...jsonStringArray(metadata.targetRefs),
    ...jsonStringArray(metadata.repoScopeRefs),
    ...jsonStringArray(metadata.likelyModifyRefs),
    ...jsonStringArray(metadata.resolvedTargetFileRefs),
  ]).slice(0, 16);
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
  const targetRefs = nodeWritableSchedulingTargetRefs(node);
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
  if (node.nodeKind === "validation" || node.nodeKind === "test_review") {
    keys.push(...validationRefs.map((ref) => `validation:${ref}`));
  }
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
  branchResults?: RuntimeWorkGraphParallelFrontierReadback["branchResults"];
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
    branchResults: (input.branchResults ?? []).slice(0, 40).map((branch) => ({
      artifactKind: "runtime_work_graph_superstep_branch_result",
      schemaVersion: "execution-platform.superstep-branch-result.v1",
      superstepId: branch.superstepId,
      branchId: branch.branchId,
      nodeId: branch.nodeId,
      nodeKind: branch.nodeKind,
      capabilityId: branch.capabilityId,
      targetCommitmentIds: branch.targetCommitmentIds.slice(0, 24),
      status: branch.status,
      failureClass: branch.failureClass,
      errorPath: branch.errorPath,
      errorSummary: branch.errorSummary ? branch.errorSummary.slice(0, 500) : null,
      blockerSummary: branch.blockerSummary ? branch.blockerSummary.slice(0, 500) : null,
      repairAction: branch.repairAction,
      nextTransition: branch.nextTransition,
      evidenceRefs: branch.evidenceRefs.slice(0, 40),
      readinessStateRef: branch.readinessStateRef,
      reasonCodes: branch.reasonCodes.slice(0, 40),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
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

function branchFailureSignature(input: {
  failureClass: string | null;
  errorPath: string | null;
  errorSummary: string | null;
}): string | null {
  if (!input.failureClass) {
    return null;
  }
  const summary = (input.errorSummary ?? "").replace(/\s+/gu, " ").trim().slice(0, 220);
  return [input.failureClass, input.errorPath ?? "unknown_path", summary].join("|");
}

function systemicParallelFrontierFailure(input: {
  snapshot: RuntimeWorkGraphSnapshot;
  branchResults: RuntimeWorkGraphParallelFrontierReadback["branchResults"];
}): {
  signature: string;
  signatureHash: string;
  failureClass: string;
  errorPath: string | null;
  errorSummary: string | null;
  nodeIds: string[];
} | null {
  const entries: Array<{
    signature: string;
    failureClass: string;
    errorPath: string | null;
    errorSummary: string | null;
    nodeId: string;
  }> = [];
  for (const branch of input.branchResults) {
    const signature = branchFailureSignature(branch);
    if (!signature || branch.status !== "needs_review") {
      continue;
    }
    entries.push({
      signature,
      failureClass: branch.failureClass ?? "unknown",
      errorPath: branch.errorPath,
      errorSummary: branch.errorSummary,
      nodeId: branch.nodeId,
    });
  }
  for (const node of input.snapshot.nodes) {
    if (node.nodeStatus !== "needs_review") {
      continue;
    }
    const metadata = jsonRecord(node.metadata);
    const failureClass =
      typeof metadata.parallelFrontierBranchFailureClass === "string"
        ? metadata.parallelFrontierBranchFailureClass
        : null;
    const errorPath =
      typeof metadata.parallelFrontierBranchErrorPath === "string"
        ? metadata.parallelFrontierBranchErrorPath
        : null;
    const errorSummary =
      typeof metadata.parallelFrontierBranchErrorSummary === "string"
        ? metadata.parallelFrontierBranchErrorSummary
        : null;
    const signature = branchFailureSignature({ failureClass, errorPath, errorSummary });
    if (!signature) {
      continue;
    }
    entries.push({
      signature,
      failureClass: failureClass ?? "unknown",
      errorPath,
      errorSummary,
      nodeId: node.nodeId,
    });
  }
  const bySignature = new Map<string, typeof entries>();
  for (const entry of entries) {
    bySignature.set(entry.signature, [...(bySignature.get(entry.signature) ?? []), entry]);
  }
  for (const [signature, matches] of bySignature.entries()) {
    const nodeIds = uniqueStrings(matches.map((match) => match.nodeId));
    if (nodeIds.length < 2) {
      continue;
    }
    const first = matches[0];
    return {
      signature,
      signatureHash: createHash("sha256").update(signature).digest("hex").slice(0, 16),
      failureClass: first.failureClass,
      errorPath: first.errorPath,
      errorSummary: first.errorSummary,
      nodeIds: nodeIds.slice(0, 20),
    };
  }
  return null;
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

function schedulerFrontierStateRef(input: {
  graphId: string;
  nodeId: string;
  suffix: string;
}): string {
  return `runtime-work-graph://node-transition-readiness/${input.graphId}/${input.nodeId}/${input.suffix}`;
}

function buildSchedulerFrontierState(input: {
  graphId: string;
  iteration: number;
  snapshot: RuntimeWorkGraphSnapshot;
  frontier: ReturnType<typeof selectRunnableParallelFrontier>;
  executors: Record<string, RuntimeWorkGraphNodeExecutor>;
  missionLedger: MissionContractLedger | null;
  requireFreshContextSnapshotsForWorkerExecution: boolean;
  requireNodeExecutionPacketForWorkerExecution: boolean;
}): RuntimeWorkGraphSchedulerFrontierState {
  const frontierReady = new Set(input.frontier.rawRunnableNodeIds);
  const selected = new Set(input.frontier.selectedNodes.map((node) => node.nodeId));
  const plannedNodes = input.snapshot.nodes.filter((node) => node.nodeStatus === "planned");
  const readinessByNodeId = new Map(
    plannedNodes.map((node) => [
      node.nodeId,
      evaluateRuntimeNodeTransitionReadiness({
        snapshot: input.snapshot,
        node,
        executors: input.executors,
        requireFreshContextSnapshotsForWorkerExecution:
          input.requireFreshContextSnapshotsForWorkerExecution,
        requireNodeExecutionPacketForWorkerExecution:
          input.requireNodeExecutionPacketForWorkerExecution,
      }),
    ]),
  );
  const blocked = [...readinessByNodeId.entries()]
    .filter(([nodeId, readiness]) => !frontierReady.has(nodeId) || !readiness.executable)
    .map(([nodeId]) => nodeId)
    .slice(0, 80);
  const nodesById = new Map(input.snapshot.nodes.map((node) => [node.nodeId, node]));
  const blockedBy = (predicate: (readiness: RuntimeNodeTransitionReadiness) => boolean): string[] =>
    [...readinessByNodeId.entries()]
      .filter(([, readiness]) => predicate(readiness))
      .map(([nodeId]) => nodeId)
      .slice(0, 80);
  const skippedConflictNodeIds = input.frontier.skippedReasonCodes
    .map((code) => code.match(/^parallel_frontier_conflict:([^:]+)/u)?.[1])
    .filter((nodeId): nodeId is string => Boolean(nodeId))
    .slice(0, 40);
  const providerBudgetBlockedNodeIds = input.frontier.skippedReasonCodes
    .map((code) => code.match(/^parallel_frontier_provider_budget_exhausted:([^:]+)/u)?.[1])
    .filter((nodeId): nodeId is string => Boolean(nodeId))
    .slice(0, 40);
  const contextRefs = uniqueStrings(
    plannedNodes.flatMap((node) => [
      ...node.inputHandoffRefs.filter((ref) => /context|handoff|synthesis/iu.test(ref)),
      ...jsonStringArray(jsonRecord(node.metadata).contextSnapshotRefs),
      ...jsonStringArray(jsonRecord(node.metadata).providedContextSnapshotRefs),
    ]),
  ).slice(0, 60);
  const resourceRefs = uniqueStrings(
    plannedNodes.flatMap((node) => {
      const metadata = jsonRecord(node.metadata);
      return [
        typeof metadata.nodeExecutionPacketRef === "string"
          ? metadata.nodeExecutionPacketRef
          : null,
        typeof metadata.resourcePacketRef === "string" ? metadata.resourcePacketRef : null,
        typeof metadata.implementationContextPacketRef === "string"
          ? metadata.implementationContextPacketRef
          : null,
      ].filter((ref): ref is string => Boolean(ref));
    }),
  ).slice(0, 60);
  const reasonCodes = uniqueStrings([
    "scheduler_canonical_frontier_state_evaluated",
    `scheduler_frontier_ready_count:${input.frontier.rawRunnableNodeIds.length}`,
    `scheduler_frontier_selected_count:${input.frontier.selectedNodes.length}`,
    `scheduler_frontier_blocked_count:${blocked.length}`,
    ...input.frontier.skippedReasonCodes.slice(0, 20),
    ...[...readinessByNodeId.values()].flatMap((readiness) => readiness.reasonCodes).slice(0, 40),
  ]);
  const nextLegalTransition =
    input.frontier.selectedNodes.length > 0
      ? "execute_frontier"
      : providerBudgetBlockedNodeIds.length > 0 || skippedConflictNodeIds.length > 0
        ? "wait_for_locks_or_provider_budget"
        : blocked.length > 0
          ? "repair_or_create_prerequisite"
          : "request_orchestrator_decision";
  return {
    artifactKind: "runtime_work_graph_scheduler_frontier_state",
    schemaVersion: "execution-platform.runtime-work-graph.scheduler-frontier.v1",
    graphId: input.graphId,
    currentSuperstep: input.iteration,
    nodeCount: input.snapshot.nodes.length,
    edgeCount: input.snapshot.edges.length,
    executableReadyNodeIds: input.frontier.rawRunnableNodeIds.slice(0, 80),
    selectedExecutableNodeIds: [...selected].slice(0, 80),
    blockedFrontierNodeIds: blocked,
    aggregateBlockedNodeIds: blocked
      .filter((nodeId) => {
        const node = nodesById.get(nodeId);
        return node
          ? nodeBlockingDependencies({ snapshot: input.snapshot, nodeId }).length > 1
          : false;
      })
      .slice(0, 40),
    nonRunnableNodeIds: blockedBy((readiness) => !readiness.executable),
    dependencyBlockedNodeIds: blockedBy((readiness) => readiness.dependencyStatus === "blocked"),
    contextBlockedNodeIds: blockedBy((readiness) =>
      ["required_missing", "in_progress", "accepted_with_signal"].includes(readiness.contextStatus),
    ),
    resourceBlockedNodeIds: blockedBy((readiness) => readiness.resourceStatus === "missing"),
    validationBlockedNodeIds: blockedBy(
      (readiness) => !["ready", "not_required"].includes(readiness.validationStatus),
    ),
    reviewBlockedNodeIds: blocked.filter(
      (nodeId) => nodesById.get(nodeId)?.nodeKind === "reviewer",
    ),
    closeoutBlockedNodeIds: blocked.filter(
      (nodeId) => nodesById.get(nodeId)?.nodeKind === "closeout",
    ),
    branchIds: input.frontier.selectedNodes
      .map((node, index) => `frontier:${input.iteration}:branch:${index + 1}:${node.nodeId}`)
      .slice(0, 80),
    readinessRefs: [...readinessByNodeId.keys()]
      .map((nodeId) =>
        schedulerFrontierStateRef({ graphId: input.graphId, nodeId, suffix: "frontier-state" }),
      )
      .slice(0, 80),
    resourceRefs,
    contextRefs,
    openCommitmentIds: remainingOpenCommitmentIds(input.missionLedger).slice(0, 80),
    lockConflictNodeIds: skippedConflictNodeIds,
    providerBudgetBlockedNodeIds,
    nextLegalTransition,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function pendingContextBrokerRequestRefs(snapshot: RuntimeWorkGraphSnapshot): string[] {
  return uniqueStrings(
    snapshot.nodes.flatMap((node) => {
      const metadata = jsonRecord(node.metadata ?? null);
      return [
        typeof metadata.contextBrokerRequestRef === "string"
          ? metadata.contextBrokerRequestRef
          : null,
        ...jsonStringArray(metadata.contextBrokerRequestRefs),
      ];
    }),
  ).slice(0, 120);
}

function activeImplementationOrResourceBranchNodeIds(snapshot: RuntimeWorkGraphSnapshot): string[] {
  const implementationOrResourceKinds = new Set([
    "implementation",
    "implementation_scoped",
    "repair",
    "validation",
    "test_review",
    "test_authoring",
  ]);
  const resourceLifecycleStates = new Set([
    "resources_required",
    "resource_materialization_in_progress",
    "ready",
    "ready_with_limitations",
  ]);
  return uniqueStrings(
    snapshot.nodes
      .filter((node) => node.nodeStatus === "planned" || node.nodeStatus === "running")
      .filter((node) => {
        const metadata = jsonRecord(node.metadata ?? null);
        return (
          implementationOrResourceKinds.has(node.nodeKind) ||
          resourceLifecycleStates.has(
            typeof metadata.nodeLifecycleState === "string" ? metadata.nodeLifecycleState : "",
          ) ||
          typeof metadata.nodeExecutionPacketRef === "string" ||
          typeof metadata.implementationContextPacketRef === "string"
        );
      })
      .map((node) => node.nodeId),
  ).slice(0, 120);
}

type RuntimeWorkGraphPersistenceOutcome = {
  createdNodeIds: string[];
  reusedNodeIds: string[];
  createdEdgeIds: string[];
  reusedEdgeIds: string[];
};

function buildNoProgressSignature(input: {
  graphId: string;
  iteration: number;
  snapshot: RuntimeWorkGraphSnapshot;
  frontierState: RuntimeWorkGraphSchedulerFrontierState;
  decision: OrchestratorGraphDecision | null;
  persistence: RuntimeWorkGraphPersistenceOutcome;
  terminalBlockerCode?: string | null;
}): RuntimeWorkGraphNoProgressSignature {
  const blockerReasonCodes = input.frontierState.reasonCodes
    .filter((code) => /blocked|missing|conflict|exhausted|not_satisfied|no_progress/iu.test(code))
    .slice(0, 80);
  const hashCore = {
    graphId: input.graphId,
    nodeCount: input.snapshot.nodes.length,
    edgeCount: input.snapshot.edges.length,
    executableFrontierNodeIds: input.frontierState.executableReadyNodeIds,
    blockedFrontierNodeIds: input.frontierState.blockedFrontierNodeIds,
    blockerReasonCodes,
    openCommitmentIds: input.frontierState.openCommitmentIds,
    reusedNodeIds: input.persistence.reusedNodeIds,
    reusedEdgeIds: input.persistence.reusedEdgeIds,
    selectedDecisionKind: input.decision?.decisionKind ?? null,
    terminalBlockerCode: input.terminalBlockerCode ?? null,
  };
  const signatureHash = createHash("sha256").update(JSON.stringify(hashCore)).digest("hex");
  return {
    artifactKind: "runtime_work_graph_no_progress_signature",
    schemaVersion: "execution-platform.runtime-work-graph.no-progress-signature.v1",
    graphId: input.graphId,
    iteration: input.iteration,
    superstep: input.iteration,
    nodeCount: input.snapshot.nodes.length,
    edgeCount: input.snapshot.edges.length,
    executableFrontierNodeIds: input.frontierState.executableReadyNodeIds.slice(0, 80),
    blockedFrontierNodeIds: input.frontierState.blockedFrontierNodeIds.slice(0, 80),
    blockerReasonCodes,
    openCommitmentIds: input.frontierState.openCommitmentIds.slice(0, 80),
    newEvidenceRefs: [],
    newReadinessRefs: [],
    newWorkQueueRefs: [],
    createdNodeIds: input.persistence.createdNodeIds.slice(0, 80),
    reusedNodeIds: input.persistence.reusedNodeIds.slice(0, 80),
    createdEdgeIds: input.persistence.createdEdgeIds.slice(0, 80),
    reusedEdgeIds: input.persistence.reusedEdgeIds.slice(0, 80),
    selectedDecisionId: input.decision?.decisionId ?? null,
    selectedDecisionKind: input.decision?.decisionKind ?? null,
    terminalBlockerCode: input.terminalBlockerCode ?? null,
    signatureHash,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
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
    toolId === "scheduler.compile_work_intents" ||
    toolId === "scheduler.validate_work_intent_capability" ||
    toolId === "scheduler.define_node_contract" ||
    toolId === "scheduler.define_node_contracts" ||
    toolId === "scheduler.define_edges_or_parallelism" ||
    toolId === "scheduler.compile_staged_runtime_graph" ||
    toolId === "scheduler.compile_runtime_graph" ||
    toolId === "scheduler.review_compiled_graph" ||
    toolId === "scheduler.evaluate_expansion_admission" ||
    toolId === "scheduler.accept_work_intent_graph" ||
    toolId === "scheduler.create_graph_node" ||
    toolId === "scheduler.create_graph_edge"
  ) {
    return "planning_in_progress";
  }
  if (
    toolId === "scheduler.accept_staged_graph" ||
    toolId === "scheduler.context_synthesis.accept"
  ) {
    return "decomposition_accepted";
  }
  if (
    toolId === "scheduler.evaluate_frontier_readiness" ||
    toolId === "scheduler.evaluate_canonical_frontier" ||
    toolId === "scheduler.open_executable_frontier" ||
    toolId === "scheduler.open_superstep_frontier" ||
    toolId === "scheduler.record_node_transition" ||
    toolId === "scheduler.create_prerequisite_node" ||
    toolId === "scheduler.link_prerequisite_to_target" ||
    toolId === "scheduler.block_node_for_precondition" ||
    toolId === "scheduler.promote_work_intent_to_executable" ||
    toolId === "scheduler.approve_and_run_first_node"
  ) {
    return "node_transition_readiness";
  }
  if (
    toolId === "scheduler.request_transition_repair_intent" ||
    toolId === "scheduler.accept_transition_repair" ||
    toolId === "scheduler.reject_transition_repair"
  ) {
    return "transition_repair";
  }
  if (
    toolId === "scheduler.reject_staged_graph" ||
    toolId === "scheduler.reject_work_intent_graph" ||
    toolId === "scheduler.context_synthesis.reject"
  ) {
    return "decomposition_repair_needed";
  }
  if (toolId === "scheduler.review_node_result") {
    return "node_result_review";
  }
  if (
    toolId === "scheduler.record_superstep_branch_result" ||
    toolId === "scheduler.join_superstep_frontier"
  ) {
    return "parallel_frontier_completed";
  }
  if (toolId === "scheduler.record_no_progress_signature") {
    return "no_progress_evaluation";
  }
  if (toolId === "scheduler.mission_ledger_evaluation_throttle") {
    return "mission_contract_evaluation_throttle";
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

function chunkStrings(values: string[], maxChunkSize: number): string[][] {
  if (values.length === 0) {
    return [[]];
  }
  const chunkSize = Math.max(1, maxChunkSize);
  const chunks: string[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
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

function missionLedgerEvaluationThrottleDecision(input: {
  node: TeamGraphNode;
  result: RuntimeWorkGraphNodeExecutionResult;
  evidenceClaimsAcceptedForEvaluation: boolean;
  missionEvidenceReasonCodes: string[];
  requireEvidenceClaimsForMissionLedger: boolean;
}): {
  shouldEvaluate: boolean;
  eventClass: string;
  reasonCodes: string[];
  artifact: JsonValue;
} {
  const roleClass = workflowRoleClassForNode(input.node);
  const hasEvidenceClaims = (input.result.evidenceClaims ?? []).length > 0;
  const hasNonStrictArtifactEvidence =
    !input.requireEvidenceClaimsForMissionLedger && input.result.outputArtifactRefs.length > 0;
  const explicitEvaluationRequest = input.result.reasonCodes.some((code) =>
    code.includes("mission_contract_evaluation_requested"),
  );
  const eventClass =
    input.node.nodeKind === "context_scout" || input.node.nodeKind === "context_synthesis"
      ? "context"
      : input.node.nodeKind === "closeout"
        ? "closeout"
        : (roleClass ?? input.node.nodeKind);
  const closureCapableEventClasses = new Set([
    "implementation",
    "qa",
    "review",
    "observability",
    "docs",
    "closeout",
    "human",
    "planning",
    "planning_capsule",
    "action_proposal_or_compile",
  ]);
  const reasonCodes: string[] = [
    `mission_contract_evaluation_event_class:${eventClass}`,
    hasEvidenceClaims
      ? "mission_contract_evaluation_evidence_claims_present"
      : hasNonStrictArtifactEvidence
        ? "mission_contract_evaluation_non_strict_artifact_refs_present"
        : "mission_contract_evaluation_evidence_claims_absent",
  ];
  const shouldEvaluate =
    input.evidenceClaimsAcceptedForEvaluation &&
    (hasEvidenceClaims || hasNonStrictArtifactEvidence) &&
    (explicitEvaluationRequest || closureCapableEventClasses.has(eventClass));
  if (!input.evidenceClaimsAcceptedForEvaluation) {
    reasonCodes.push("mission_contract_evaluation_throttled_invalid_claims");
  }
  if (!hasEvidenceClaims && !hasNonStrictArtifactEvidence) {
    reasonCodes.push("mission_contract_evaluation_throttled_no_closure_claims");
  }
  if (!closureCapableEventClasses.has(eventClass) && !explicitEvaluationRequest) {
    reasonCodes.push("mission_contract_evaluation_throttled_non_closure_event_class");
  }
  if (shouldEvaluate) {
    reasonCodes.push("mission_contract_evaluation_allowed_by_event_class_and_claims");
  } else {
    reasonCodes.push("mission_contract_evaluation_throttled");
  }
  return {
    shouldEvaluate,
    eventClass,
    reasonCodes: uniqueStrings([...reasonCodes, ...input.missionEvidenceReasonCodes]).slice(0, 80),
    artifact: {
      artifactKind: "runtime_work_graph_mission_ledger_evaluation_throttle",
      schemaVersion: "execution-platform.runtime-work-graph.mission-ledger-evaluation-throttle.v1",
      nodeId: input.node.nodeId,
      nodeKind: input.node.nodeKind,
      roleClass,
      eventClass,
      shouldEvaluate,
      evidenceClaimCount: input.result.evidenceClaims?.length ?? 0,
      nonStrictArtifactEvidenceCount: hasNonStrictArtifactEvidence
        ? input.result.outputArtifactRefs.length
        : 0,
      reasonCodes: uniqueStrings(reasonCodes).slice(0, 80),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    } satisfies JsonValue,
  };
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
      metadataBudget.budgetClass === "long_running" || metadata.expectedLongRunning === true,
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

function deriveContextSynthesisJoinEdges(input: {
  graphId: string;
  nodes: OrchestratorGraphNodeSpec[];
  edges: OrchestratorGraphEdgeSpec[];
  snapshot: RuntimeWorkGraphSnapshot | null;
}): OrchestratorGraphEdgeSpec[] {
  const contextSynthesisNodeIds = new Set(
    input.nodes.filter((node) => node.nodeKind === "context_synthesis").map((node) => node.nodeId),
  );
  if (contextSynthesisNodeIds.size === 0 || !input.snapshot) {
    return input.edges;
  }

  const existingIncomingKeys = new Set(
    [...input.snapshot.edges, ...input.edges].map(
      (edge) => `${edge.fromNodeId ?? ""}->${edge.toNodeId ?? ""}:${edge.edgeKind}`,
    ),
  );
  const acceptedContextSources = input.snapshot.nodes
    .filter(
      (node) =>
        ["context_scout", "web_research"].includes(node.nodeKind) &&
        node.nodeStatus === "succeeded" &&
        node.outputArtifactRefs.length > 0,
    )
    .slice(0, 32);
  if (acceptedContextSources.length === 0) {
    return input.edges;
  }

  const derivedEdges: OrchestratorGraphEdgeSpec[] = [];
  for (const toNodeId of contextSynthesisNodeIds) {
    const alreadyHasContextInput = [...existingIncomingKeys].some((key) =>
      key.endsWith(`->${toNodeId}:context_supplies`),
    );
    if (alreadyHasContextInput) {
      continue;
    }
    for (const [sourceIndex, source] of acceptedContextSources.entries()) {
      const edgeKey = `${source.nodeId}->${toNodeId}:context_supplies`;
      if (existingIncomingKeys.has(edgeKey)) {
        continue;
      }
      existingIncomingKeys.add(edgeKey);
      derivedEdges.push({
        edgeId: `context-synthesis-input-${sourceIndex + 1}-${source.nodeId}-to-${toNodeId}`.slice(
          0,
          96,
        ),
        fromNodeId: source.nodeId,
        toNodeId,
        edgeKind: "context_supplies",
        reasonCodes: [
          "runtime_derived_context_synthesis_join_edge",
          "accepted_context_handoff_supplies_context_synthesis",
        ],
        artifactRefs: source.outputArtifactRefs.slice(0, 12),
        metadata: {
          runtimeDerivedContextSynthesisJoinEdge: true,
          sourceNodeKind: source.nodeKind,
          sourceNodeStatus: source.nodeStatus,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        } satisfies JsonValue,
      });
    }
  }
  return [...input.edges, ...derivedEdges];
}

function isBroadImplementationNode(node: TeamGraphNode | OrchestratorGraphNodeSpec): boolean {
  return node.nodeKind === "implementation" && nodeCapabilityId(node) === "implementation_complex";
}

type SchedulerNodeRoleClass = RuntimeNodeCapability["roleClass"] | "other";

const WORKFLOW_ROLE_CLASS_VALUES = new Set<WorkflowRoleClass>([
  "orchestrator",
  "context",
  "implementation",
  "research",
  "planning",
  "docs",
  "qa",
  "architecture",
  "design",
  "marketing",
  "human",
  "review",
  "observability",
  "closeout",
]);

const RUNTIME_NODE_ROLE_CLASSES = new Set<RuntimeNodeCapability["roleClass"]>([
  "orchestration",
  "context",
  "implementation",
  "validation",
  "review",
  "research",
  "planning",
  "docs",
  "human",
  "closeout",
  "observability",
]);

function explicitWorkflowRoleClass(value: unknown): WorkflowRoleClass | null {
  return typeof value === "string" && WORKFLOW_ROLE_CLASS_VALUES.has(value as WorkflowRoleClass)
    ? (value as WorkflowRoleClass)
    : null;
}

function workflowRoleClassForCapabilityRole(
  roleClass: RuntimeNodeCapability["roleClass"],
): WorkflowRoleClass | null {
  if (roleClass === "orchestration") {
    return "orchestrator";
  }
  if (roleClass === "validation") {
    return "qa";
  }
  return explicitWorkflowRoleClass(roleClass);
}

function roleClassForKnownNodeKind(nodeKind: string): SchedulerNodeRoleClass {
  switch (nodeKind) {
    case "work_intent":
      return "orchestration";
    case "context_scout":
      return "context";
    case "implementation":
      return "implementation";
    case "validation":
    case "test_review":
    case "test_authoring":
    case "repair":
      return "validation";
    case "reviewer":
    case "security_review":
      return "review";
    case "orchestrator_plan":
    case "context_synthesis":
      return "planning";
    case "web_research":
      return "research";
    case "docs_update":
      return "docs";
    case "human_task":
      return "human";
    case "closeout":
      return "closeout";
    case "observability_readback":
      return "observability";
    default:
      return "other";
  }
}

function capabilityForNodeRef(
  node: Pick<TeamGraphNode | OrchestratorGraphNodeSpec, "metadata"> & {
    capabilityId?: string | null;
  },
  capabilityManifest: RuntimeNodeCapabilityManifest,
): RuntimeNodeCapability | null {
  const capabilityId = nodeCapabilityId(node as TeamGraphNode | OrchestratorGraphNodeSpec);
  return capabilityId ? findRuntimeNodeCapability(capabilityId, capabilityManifest) : null;
}

function graphNodeSpecRoleClass(
  node: OrchestratorGraphNodeSpec,
  capabilityManifest: RuntimeNodeCapabilityManifest,
): SchedulerNodeRoleClass {
  const capability = capabilityForNodeRef(node, capabilityManifest);
  if (capability) {
    return capability.roleClass;
  }
  const metadata = jsonRecord(node.metadata ?? {});
  if (node.nodeKind === "work_intent" && typeof metadata.targetCapabilityRoleClass === "string") {
    const roleClass = metadata.targetCapabilityRoleClass as RuntimeNodeCapability["roleClass"];
    return RUNTIME_NODE_ROLE_CLASSES.has(roleClass) ? roleClass : "orchestration";
  }
  const explicitRoleClass = explicitWorkflowRoleClass(metadata.roleClass);
  if (explicitRoleClass) {
    return explicitRoleClass === "qa"
      ? "validation"
      : (explicitRoleClass as SchedulerNodeRoleClass);
  }
  return roleClassForKnownNodeKind(node.nodeKind);
}

function summaryNodeRoleClass(
  node: RuntimeWorkGraphSchedulerSnapshotSummary["nodeSummaries"][number],
  capabilityManifest: RuntimeNodeCapabilityManifest,
): SchedulerNodeRoleClass {
  const capabilityId = node.capabilityId ?? node.metadataCapabilityId ?? null;
  const capability = capabilityId
    ? findRuntimeNodeCapability(capabilityId, capabilityManifest)
    : null;
  return capability?.roleClass ?? roleClassForKnownNodeKind(node.nodeKind);
}

function isProgressiveContextAcquisitionFirstMove(
  nodes: OrchestratorGraphNodeSpec[],
  capabilityManifest: RuntimeNodeCapabilityManifest,
): boolean {
  if (nodes.length !== 1) {
    return false;
  }
  const [node] = nodes;
  if (!node) {
    return false;
  }
  return ["context", "research", "planning", "orchestration"].includes(
    graphNodeSpecRoleClass(node, capabilityManifest),
  );
}

function schedulerDecisionCapabilityPhase(input: {
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  missionLedger: MissionContractLedger | null;
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): RuntimeNodeCapabilityPhase {
  if (input.snapshotSummary.nodeSummaries.length === 0) {
    return "decomposition";
  }
  if (
    missionIsComplex(input.missionLedger) &&
    plannedContextSynthesisNode(input.snapshotSummary) &&
    !acceptedContextSynthesisExists(input.snapshotSummary)
  ) {
    return "context_synthesis";
  }
  if (missionIsComplex(input.missionLedger)) {
    const contextSucceeded = input.snapshotSummary.nodeSummaries.some(
      (node) =>
        summaryNodeRoleClass(node, input.capabilityManifest) === "context" &&
        node.nodeStatus === "succeeded",
    );
    const implementationStarted = input.snapshotSummary.nodeSummaries.some(
      (node) =>
        summaryNodeRoleClass(node, input.capabilityManifest) === "implementation" &&
        ["running", "succeeded", "needs_review", "failed"].includes(node.nodeStatus),
    );
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

function nodeScopedContextSupplyRequired(node: {
  nodeId: string;
  nodeKind: string;
  assignedRole: string;
  capabilityId?: string | null;
  nodeStatus?: string;
  noContextNeededRationale?: string | null;
  contextSnapshotRefs?: string[];
  resourceRequirementKinds?: string[];
}): boolean {
  if (node.nodeStatus !== "planned") {
    return false;
  }
  if (node.noContextNeededRationale?.trim()) {
    return false;
  }
  if ((node.contextSnapshotRefs ?? []).length > 0) {
    return false;
  }
  if (node.nodeKind === "work_intent") {
    return (node.resourceRequirementKinds ?? []).includes("context_handoff");
  }
  return [
    "implementation",
    "test_authoring",
    "docs_update",
    "architecture_spec",
    "planning_capsule",
    "action_graph_compile",
    "compiler",
  ].includes(node.nodeKind);
}

function isRepoTargetRef(ref: string): boolean {
  return (
    ref.startsWith("extensions/") ||
    ref.startsWith("src/") ||
    ref.startsWith("ui/") ||
    ref.startsWith("scripts/") ||
    ref.startsWith("docs/") ||
    ref.startsWith("packages/")
  );
}

function nodeHasUpstreamContextSupply(input: {
  nodeId: string;
  summary: RuntimeWorkGraphSchedulerSnapshotSummary;
}): boolean {
  return (input.summary.edgeSummaries ?? []).some(
    (edge) =>
      edge.toNodeId === input.nodeId &&
      ["context_supplies", "repair_requested", "handoff"].includes(edge.edgeKind) &&
      input.summary.nodeSummaries.some(
        (node) =>
          node.nodeId === edge.fromNodeId &&
          ["context_scout", "web_research"].includes(node.nodeKind),
      ),
  );
}

function nodeScopedContextScoutNodeId(input: {
  targetNodeId: string;
  graphId: string;
  index: number;
}): string {
  const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 10);
  const slug = input.targetNodeId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .slice(0, 72);
  return `context_scout-for-${slug || `node-${input.index + 1}`}-${digest}`.slice(0, 120);
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
  if (!["implementation", "repair", "test_authoring", "docs_update"].includes(node.nodeKind)) {
    return false;
  }
  const metadata = jsonRecord(node.metadata);
  return !(
    typeof metadata.noContextNeededRationale === "string" &&
    metadata.noContextNeededRationale.trim().length > 0
  );
}

function nodeRequiresExecutionPacket(node: TeamGraphNode): boolean {
  const metadata = jsonRecord(node.metadata);
  if (["implementation", "repair", "test_authoring", "docs_update"].includes(node.nodeKind)) {
    return true;
  }
  if (metadata.nodeExecutionPacketRequired === true) {
    return true;
  }
  if (metadata.nodeExecutionPacketRequired === false) {
    return false;
  }
  return ["implementation", "repair", "test_authoring", "docs_update"].includes(node.nodeKind);
}

type RuntimeNodeTransitionReadiness = {
  artifactKind: "runtime_node_transition_readiness";
  schemaVersion: "execution-platform.runtime-node-transition-readiness.v1";
  nodeId: string;
  nodeKind: string;
  nodeClass: "work_intent" | "prerequisite" | "barrier" | "executable";
  lifecycleState: RuntimeNodeLifecycleState;
  executable: boolean;
  dependencyStatus: "not_applicable" | "blocked" | "ready";
  contextStatus:
    | "not_required"
    | "required_missing"
    | "in_progress"
    | "accepted"
    | "accepted_with_signal";
  resourceStatus: "not_required" | "missing" | "ready";
  validationStatus: "not_required" | "ready";
  authorityStatus: "not_evaluated" | "ready";
  storageStatus: "not_evaluated" | "ready";
  capabilityId: string | null;
  executorAvailable: boolean;
  reasonCodes: string[];
  blockerSummary: string | null;
  nextAllowedTransitions: string[];
  prerequisiteTransition: "node_scoped_context_supply" | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

function nodeHasContextInputSignal(input: {
  snapshot: RuntimeWorkGraphSnapshot;
  node: TeamGraphNode;
}): boolean {
  const metadata = jsonRecord(input.node.metadata);
  if (
    jsonContextSnapshotArray(metadata.contextSnapshotRefs).length > 0 ||
    jsonContextSnapshotArray(metadata.providedContextSnapshotRefs).length > 0 ||
    jsonContextSnapshotArray(metadata.requiredContextSnapshotRefs).length > 0
  ) {
    return true;
  }
  if (upstreamContextSupplySnapshotRefs(input).length > 0) {
    return true;
  }
  return input.node.inputHandoffRefs.some((ref) =>
    /context[-_:]?synthesis|context[-_:]?handoff|context[-_:]?snapshot|context[-_:]?scout/iu.test(
      ref,
    ),
  );
}

function nodeTransitionClass(node: TeamGraphNode): RuntimeNodeTransitionReadiness["nodeClass"] {
  if (node.nodeKind === "work_intent") {
    return "work_intent";
  }
  if (node.nodeKind === "context_synthesis") {
    return "barrier";
  }
  if (["context_scout", "web_research", "human_task"].includes(node.nodeKind)) {
    return "prerequisite";
  }
  if (["running", "succeeded"].includes(node.nodeStatus)) {
    return "executable";
  }
  return "work_intent";
}

function evaluateRuntimeNodeTransitionReadiness(input: {
  snapshot: RuntimeWorkGraphSnapshot;
  node: TeamGraphNode;
  executors: Record<string, RuntimeWorkGraphNodeExecutor>;
  requireFreshContextSnapshotsForWorkerExecution: boolean;
  requireNodeExecutionPacketForWorkerExecution: boolean;
}): RuntimeNodeTransitionReadiness {
  const statusByNodeId = new Map(
    input.snapshot.nodes.map((node) => [node.nodeId, node.nodeStatus]),
  );
  const dependencies = nodeBlockingDependencies({
    snapshot: input.snapshot,
    nodeId: input.node.nodeId,
  });
  const unsatisfiedDependencies = dependencies.filter((dependency) => {
    const status = statusByNodeId.get(dependency.dependencyId);
    return !(
      status &&
      dependencyStatusSatisfiesTarget({
        targetNodeKind: input.node.nodeKind,
        edgeKind: dependency.edgeKind,
        dependencyStatus: status,
      })
    );
  });
  const metadata = jsonRecord(input.node.metadata);
  const capabilityId = nodeCapabilityId(input.node);
  const executorAvailable = nodeHasExecutableAdapter({
    node: input.node,
    executors: input.executors,
  });
  const upstreamContextEdges = input.snapshot.edges.filter(
    (edge) =>
      edge.toNodeId === input.node.nodeId &&
      edge.edgeKind === "context_supplies" &&
      edge.fromNodeId,
  );
  const upstreamContextAccepted =
    upstreamContextEdges.length > 0 &&
    upstreamContextEdges.every((edge) => statusByNodeId.get(edge.fromNodeId ?? "") === "succeeded");
  const upstreamContextInProgress = upstreamContextEdges.some((edge) =>
    ["planned", "running", "waiting_for_human", "needs_review"].includes(
      statusByNodeId.get(edge.fromNodeId ?? "") ?? "",
    ),
  );
  const upstreamContextSnapshotRefs = upstreamContextSupplySnapshotRefs({
    snapshot: input.snapshot,
    node: input.node,
  });
  const inlineRequiredContextRefs = jsonContextSnapshotArray(metadata.requiredContextSnapshotRefs);
  const inlineProvidedContextRefs = jsonContextSnapshotArray(metadata.providedContextSnapshotRefs);
  const inlineContextFreshness = validateContextSnapshotFreshness({
    requiredRefs: inlineRequiredContextRefs,
    providedRefs: [...inlineProvidedContextRefs, ...upstreamContextSnapshotRefs],
  });
  const inlineContextAccepted =
    inlineContextFreshness.valid &&
    (inlineRequiredContextRefs.length > 0 ||
      inlineProvidedContextRefs.length > 0 ||
      upstreamContextSnapshotRefs.length > 0);
  const contextSignal = nodeHasContextInputSignal({ snapshot: input.snapshot, node: input.node });
  if (input.node.nodeKind === "work_intent") {
    const targetCapabilityId =
      typeof metadata.workIntentSelectedCapabilityId === "string"
        ? metadata.workIntentSelectedCapabilityId
        : typeof metadata.selectedCapabilityId === "string"
          ? metadata.selectedCapabilityId
          : null;
    const nextAllowedTransitions = jsonStringArray(metadata.nextLegalTransitions);
    const resourceRequirementKinds = jsonStringArray(metadata.resourceRequirementKinds);
    const workIntentNeedsContext = resourceRequirementKinds.includes("context_handoff");
    const contextStatus: RuntimeNodeTransitionReadiness["contextStatus"] = !workIntentNeedsContext
      ? "not_required"
      : upstreamContextAccepted || inlineContextAccepted
        ? "accepted"
        : upstreamContextInProgress
          ? "in_progress"
          : contextSignal
            ? "accepted_with_signal"
            : "required_missing";
    const missingContext =
      contextStatus === "required_missing" || contextStatus === "accepted_with_signal";
    const blockedInProgress = contextStatus === "in_progress";
    const readinessTransitions = missingContext
      ? ["request_context_repair", "needs_review"]
      : blockedInProgress
        ? ["wait_for_context_supply"]
        : nextAllowedTransitions.length > 0
          ? nextAllowedTransitions
          : ["compile_node_execution_packet", "needs_review"];
    return {
      artifactKind: "runtime_node_transition_readiness",
      schemaVersion: "execution-platform.runtime-node-transition-readiness.v1",
      nodeId: input.node.nodeId,
      nodeKind: input.node.nodeKind,
      nodeClass: "work_intent",
      lifecycleState: missingContext
        ? "context_required"
        : blockedInProgress
          ? "context_in_progress"
          : "work_intent",
      executable: false,
      dependencyStatus: "not_applicable",
      contextStatus,
      resourceStatus: "not_required",
      validationStatus: "not_required",
      authorityStatus: "ready",
      storageStatus: "ready",
      capabilityId: targetCapabilityId,
      executorAvailable: false,
      reasonCodes: uniqueStrings([
        "work_intent_non_runnable",
        ...(targetCapabilityId ? [`work_intent_selected_capability:${targetCapabilityId}`] : []),
        ...(missingContext
          ? [
              "work_intent_context_supply_required_before_materialization",
              "node_context_supply_required_before_execution",
              "node_context_supply_missing",
            ]
          : []),
        ...(blockedInProgress ? ["work_intent_context_supply_in_progress"] : []),
      ]),
      blockerSummary: missingContext
        ? "WorkIntent needs node-scoped context before resource materialization can create an executable worker node."
        : blockedInProgress
          ? "WorkIntent is waiting on node-scoped context supply before resource materialization."
          : "WorkIntent is a non-runnable control-plane node. Runtime must validate capability and materialize resources before creating an executable worker node.",
      nextAllowedTransitions: readinessTransitions,
      prerequisiteTransition: missingContext ? "node_scoped_context_supply" : null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
  }
  const requiresContext =
    input.requireFreshContextSnapshotsForWorkerExecution &&
    nodeRequiresFreshContextSnapshot(input.node);
  const contextStatus: RuntimeNodeTransitionReadiness["contextStatus"] = !requiresContext
    ? "not_required"
    : upstreamContextAccepted || inlineContextAccepted
      ? "accepted"
      : upstreamContextInProgress
        ? "in_progress"
        : contextSignal
          ? "accepted_with_signal"
          : "required_missing";
  const nodeExecutionPacket = nodeExecutionPacketFromMetadata(input.node);
  const nodeResourceReadiness = nodeExecutionPacket
    ? evaluateNodeExecutionPacketReadiness({
        packet: nodeExecutionPacket,
        resourcePacket: jsonRecord(metadata.resourcePacket ?? null) as JsonValue,
        implementationContextPacket: jsonRecord(metadata.implementationContextPacket ?? null),
      })
    : null;
  const manifestResourceReadiness = nodeResourceReadinessFromManifestMetadata(input.node, {
    requireFreshContextSnapshotsForWorkerExecution:
      input.requireFreshContextSnapshotsForWorkerExecution,
  });
  const requiresResource =
    input.requireNodeExecutionPacketForWorkerExecution && nodeRequiresExecutionPacket(input.node);
  const resourceStatus: RuntimeNodeTransitionReadiness["resourceStatus"] = !requiresResource
    ? "not_required"
    : nodeResourceReadiness?.valid === true || manifestResourceReadiness?.valid === true
      ? "ready"
      : "missing";
  const reasonCodes: string[] = [];
  const nextAllowedTransitions: string[] = [];
  let lifecycleState: RuntimeNodeLifecycleState = "executable";
  let blockerSummary: string | null = null;
  let prerequisiteTransition: RuntimeNodeTransitionReadiness["prerequisiteTransition"] = null;

  if (!executorAvailable && input.node.nodeKind !== "human_task") {
    reasonCodes.push("node_executor_missing");
    nextAllowedTransitions.push("needs_review");
    lifecycleState = "needs_review";
    blockerSummary = "No executable adapter is registered for this node capability/kind/role.";
  }
  if (unsatisfiedDependencies.length > 0) {
    reasonCodes.push(
      "node_dependencies_not_satisfied",
      ...unsatisfiedDependencies
        .map(
          (dependency) =>
            `node_dependency_waiting:${dependency.dependencyId}:${dependency.edgeKind}:${statusByNodeId.get(dependency.dependencyId) ?? "missing"}`,
        )
        .slice(0, 12),
    );
    nextAllowedTransitions.push("wait_for_dependencies");
    lifecycleState = upstreamContextInProgress ? "context_in_progress" : "work_intent";
    blockerSummary = "Node dependencies are not terminal/accepted yet.";
  }
  if (contextStatus === "required_missing") {
    reasonCodes.push(
      "node_context_supply_required_before_execution",
      "node_context_supply_missing",
    );
    nextAllowedTransitions.push("request_context_repair");
    lifecycleState = "context_required";
    prerequisiteTransition = "node_scoped_context_supply";
    blockerSummary =
      "Node is still a work-intent node: runtime must attach node-scoped context supply before implementation execution.";
  } else if (contextStatus === "in_progress") {
    reasonCodes.push("node_context_supply_in_progress");
    nextAllowedTransitions.push("wait_for_context_supply");
    lifecycleState = "context_in_progress";
    blockerSummary =
      "Node-scoped context supply exists but has not produced accepted handoff evidence.";
  } else if (contextStatus === "accepted_with_signal") {
    reasonCodes.push(
      "node_context_signal_present_but_unaccepted",
      "node_context_supply_required_before_execution",
      "node_context_supply_missing",
    );
    nextAllowedTransitions.push("request_context_repair");
    lifecycleState = "context_required";
    prerequisiteTransition = "node_scoped_context_supply";
    blockerSummary =
      "Node has context-like refs, but runtime has not accepted node-scoped context handoff evidence for execution.";
  }
  if (
    reasonCodes.length === 0 &&
    resourceStatus === "missing" &&
    input.node.nodeKind !== "context_scout"
  ) {
    reasonCodes.push("node_resources_required_before_worker_execution");
    nextAllowedTransitions.push("compile_node_execution_packet");
    lifecycleState = "resources_required";
    blockerSummary =
      "Runtime must materialize a NodeExecutionPacket and resource packet before worker invocation.";
  }
  const executable =
    reasonCodes.length === 0 ||
    (reasonCodes.every((code) => code === "node_resources_required_before_worker_execution") &&
      resourceStatus === "missing");
  if (executable && resourceStatus === "ready") {
    lifecycleState = "executable";
    nextAllowedTransitions.push("execute_node");
  }
  if (executable && resourceStatus === "not_required") {
    lifecycleState = "executable";
    nextAllowedTransitions.push("execute_node");
  }
  return {
    artifactKind: "runtime_node_transition_readiness",
    schemaVersion: "execution-platform.runtime-node-transition-readiness.v1",
    nodeId: input.node.nodeId,
    nodeKind: input.node.nodeKind,
    nodeClass: executable ? "executable" : nodeTransitionClass(input.node),
    lifecycleState,
    executable,
    dependencyStatus:
      dependencies.length === 0
        ? "not_applicable"
        : unsatisfiedDependencies.length > 0
          ? "blocked"
          : "ready",
    contextStatus,
    resourceStatus,
    validationStatus: "not_required",
    authorityStatus: "ready",
    storageStatus: "ready",
    capabilityId,
    executorAvailable,
    reasonCodes: uniqueStrings(reasonCodes).slice(0, 80),
    blockerSummary,
    nextAllowedTransitions: uniqueStrings(nextAllowedTransitions).slice(0, 16),
    prerequisiteTransition,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function nodeExecutionPacketFromMetadata(node: TeamGraphNode): NodeExecutionPacket | null {
  const metadata = jsonRecord(node.metadata);
  const parsed = NodeExecutionPacketSchema.safeParse(metadata.nodeExecutionPacket);
  return parsed.success ? parsed.data : null;
}

function nodeResourceReadinessFromManifestMetadata(
  node: TeamGraphNode,
  options: { requireFreshContextSnapshotsForWorkerExecution: boolean },
): {
  valid: boolean;
  status: "ready" | "ready_with_limitations" | "blocked" | "not_evaluated";
  reasonCodes: string[];
  blockingLimitations: string[];
  nodeExecutionPacketRef: string | null;
  resourcePacketRef: string | null;
  nodeReadinessStateRef: string | null;
  contextStatus: string | null;
} | null {
  const metadata = jsonRecord(node.metadata);
  const nodeExecutionPacketRef =
    typeof metadata.nodeExecutionPacketRef === "string" && metadata.nodeExecutionPacketRef.trim()
      ? metadata.nodeExecutionPacketRef.trim()
      : null;
  const resourcePacketRef =
    typeof metadata.resourcePacketRef === "string" && metadata.resourcePacketRef.trim()
      ? metadata.resourcePacketRef.trim()
      : null;
  const nodeReadinessStateRef =
    typeof metadata.nodeReadinessStateRef === "string" && metadata.nodeReadinessStateRef.trim()
      ? metadata.nodeReadinessStateRef.trim()
      : null;
  if (!nodeExecutionPacketRef || !resourcePacketRef || !nodeReadinessStateRef) {
    return null;
  }
  const readinessStatus =
    metadata.nodeReadinessStatus === "ready" ||
    metadata.nodeReadinessStatus === "ready_with_limitations"
      ? metadata.nodeReadinessStatus
      : metadata.nodeReadinessStatus === "blocked"
        ? "blocked"
        : "not_evaluated";
  const transitions = jsonStringArray(metadata.nodeReadinessNextAllowedTransitions);
  const contextStatus =
    typeof metadata.nodeReadinessContextStatus === "string"
      ? metadata.nodeReadinessContextStatus
      : null;
  const contextLimitationWaiverRefs = jsonStringArray(metadata.contextLimitationWaiverRefs);
  const acceptedWithLimitationsWithoutWaiver =
    contextStatus === "accepted_with_limitations" && contextLimitationWaiverRefs.length === 0;
  const contextReady =
    !options.requireFreshContextSnapshotsForWorkerExecution ||
    !nodeRequiresFreshContextSnapshot(node) ||
    contextStatus === "accepted" ||
    (contextStatus === "accepted_with_limitations" && !acceptedWithLimitationsWithoutWaiver) ||
    contextStatus === "not_required";
  const valid =
    (readinessStatus === "ready" || readinessStatus === "ready_with_limitations") &&
    transitions.includes("execute_node") &&
    contextReady;
  return {
    valid,
    status: readinessStatus,
    reasonCodes: [
      ...jsonStringArray(metadata.resourceReadinessReasonCodes),
      ...(contextReady ? [] : ["node_readiness_context_status_not_execution_ready"]),
      ...(acceptedWithLimitationsWithoutWaiver
        ? ["node_readiness_context_limitation_waiver_missing"]
        : []),
    ],
    blockingLimitations: [
      ...jsonStringArray(metadata.resourceBlockingLimitations),
      ...(acceptedWithLimitationsWithoutWaiver
        ? [
            "Accepted-with-limitations context cannot unlock implementation without a consumer-specific waiver ref.",
          ]
        : []),
    ],
    nodeExecutionPacketRef,
    resourcePacketRef,
    nodeReadinessStateRef,
    contextStatus,
  };
}

function validateNodeContextSnapshots(
  node: TeamGraphNode,
  upstreamProvidedRefs: ContextSnapshotRef[] = [],
): ReturnType<typeof validateContextSnapshotFreshness> {
  const metadata = jsonRecord(node.metadata);
  return validateContextSnapshotFreshness({
    requiredRefs: jsonContextSnapshotArray(metadata.requiredContextSnapshotRefs),
    providedRefs: [
      ...jsonContextSnapshotArray(metadata.providedContextSnapshotRefs),
      ...upstreamProvidedRefs,
    ],
  });
}

function upstreamContextSupplySnapshotRefs(input: {
  snapshot: RuntimeWorkGraphSnapshot;
  node: TeamGraphNode;
}): ContextSnapshotRef[] {
  const upstreamNodeIds = new Set(
    input.snapshot.edges
      .filter(
        (edge) =>
          edge.toNodeId === input.node.nodeId &&
          ["context_supplies", "repair_requested", "handoff"].includes(edge.edgeKind) &&
          edge.fromNodeId,
      )
      .map((edge) => edge.fromNodeId)
      .filter((nodeId): nodeId is string => Boolean(nodeId)),
  );
  const nodeMetadata = jsonRecord(input.node.metadata);
  const targetRefs = nodeSchedulingTargetRefs(input.node);
  const commitmentIds = jsonStringArray(nodeMetadata.commitmentIdsAdvanced);
  return input.snapshot.nodes
    .filter(
      (node) =>
        upstreamNodeIds.has(node.nodeId) &&
        ["context_scout", "web_research"].includes(node.nodeKind) &&
        node.nodeStatus === "succeeded" &&
        node.outputArtifactRefs.length > 0,
    )
    .flatMap((node) =>
      node.outputArtifactRefs.slice(0, 8).map((sourceRef) =>
        createContextSnapshotRef({
          sourceRef,
          sourceKind: "context_scout_handoff",
          runtimeJobId: input.snapshot.graph.rootRuntimeJobId ?? null,
          workflowId: input.snapshot.graph.workflowId,
          graphId: input.snapshot.graph.graphId,
          nodeId: node.nodeId,
          commitmentIds,
          targetRefs,
          scopeSummary: `Accepted node-scoped context supply ${node.nodeId} for target work node ${input.node.nodeId}.`,
          freshnessStatus: "fresh",
          refreshRequired: false,
          refreshAction: "none",
          reasonCodes: [
            "context_snapshot_from_node_scoped_context_supply",
            `context_supply_node:${node.nodeId}`,
            `target_work_node:${input.node.nodeId}`,
          ],
        }),
      ),
    )
    .slice(0, 40);
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
  const synthesisLifecycle = contextSynthesisLifecycle(input.snapshotSummary);
  const synthesisIsExplicitBoundary = ["planned", "running", "repair_required"].includes(
    synthesisLifecycle.state,
  );
  if (!synthesisAccepted && !synthesisIsExplicitBoundary) {
    return [];
  }
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

function incomingContextSupplyAccepted(input: {
  nodeId: string;
  summary: RuntimeWorkGraphSchedulerSnapshotSummary;
}): boolean {
  const incoming = (input.summary.edgeSummaries ?? []).filter(
    (edge) => edge.toNodeId === input.nodeId && edge.edgeKind === "context_supplies",
  );
  if (incoming.length === 0) {
    return true;
  }
  const statusById = new Map(
    input.summary.nodeSummaries.map((node) => [node.nodeId, node.nodeStatus]),
  );
  return incoming.every(
    (edge) => edge.fromNodeId && statusById.get(edge.fromNodeId) === "succeeded",
  );
}

function deterministicNodeScopedContextSupplyDecision(input: {
  graphId: string;
  iteration: number;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  missionLedger: MissionContractLedger | null;
  commitmentWorkPackets: CommitmentWorkPacket[];
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): OrchestratorGraphDecision | null {
  if (!missionIsComplex(input.missionLedger) || input.commitmentWorkPackets.length === 0) {
    return null;
  }
  const capability = findRuntimeNodeCapability("context_scout", input.capabilityManifest);
  if (!capability) {
    return null;
  }
  const packetByCommitment = new Map(
    input.commitmentWorkPackets.map((packet) => [packet.commitmentId, packet]),
  );
  const targetNodes = input.snapshotSummary.nodeSummaries
    .filter((node) => nodeScopedContextSupplyRequired(node))
    .filter(
      (node) =>
        !nodeHasUpstreamContextSupply({
          nodeId: node.nodeId,
          summary: input.snapshotSummary,
        }),
    )
    .slice(0, 16);
  if (targetNodes.length === 0) {
    return null;
  }
  const contextNodes: OrchestratorGraphNodeSpec[] = [];
  const contextEdges: NonNullable<OrchestratorGraphDecision["newEdges"]> = [];
  for (const [targetIndex, targetNode] of targetNodes.entries()) {
    const targetCommitmentIds = uniqueStrings(
      targetNode.commitmentIdsAdvanced && targetNode.commitmentIdsAdvanced.length > 0
        ? targetNode.commitmentIdsAdvanced
        : input.missionLedger
          ? openBlockingMissionCommitments(input.missionLedger).map(
              (commitment) => commitment.commitmentId,
            )
          : [],
    );
    const commitmentShards = chunkStrings(
      targetCommitmentIds,
      MAX_CONTEXT_SCOUT_COMMITMENTS_PER_NODE,
    );
    for (const [shardIndex, shardCommitmentIds] of commitmentShards.entries()) {
      const packets = shardCommitmentIds
        .map((commitmentId) => packetByCommitment.get(commitmentId))
        .filter((packet): packet is CommitmentWorkPacket => Boolean(packet));
      const packetRefs = packets.map((packet) => packet.packetRef);
      const packetContextQuestions = uniqueStrings([
        ...(targetNode.contextQuestions ?? []),
        ...packets.flatMap((packet) => packet.requiredContextQuestions),
      ]).slice(0, 16);
      const targetRefs = uniqueStrings([
        ...(targetNode.targetRefs ?? []),
        ...(targetNode.inputHandoffRefs ?? []).filter(isRepoTargetRef),
        ...packets.flatMap((packet) => packet.likelyRepoAreas),
      ]).slice(0, 32);
      const contextBrokerRequest = buildContextBrokerRequest({
        runtimeJobId: input.snapshotSummary.rootRuntimeJobId ?? input.graphId,
        workflowId: input.snapshotSummary.workflowId,
        graphId: input.graphId,
        requestingNodeId: targetNode.nodeId,
        consumerNodeId: targetNode.nodeId,
        targetCommitmentIds: shardCommitmentIds,
        requiredResourceKind: "context_handoff",
        neededByPhase: "context_supply",
        semanticQuestion:
          packetContextQuestions.length > 0
            ? packetContextQuestions.slice(0, 4).join(" ")
            : `Supply node-scoped context for ${targetNode.nodeId}.`,
        candidateResourceRefs: targetRefs,
        inheritedContextRefs: [],
        knownContextRefs: [
          ...(targetNode.inputHandoffRefs ?? []),
          ...(targetNode.contextSnapshotRefs ?? []),
        ],
        missingContextReasonCodes: [
          "node_context_supply_required_before_execution",
          "node_context_supply_missing",
        ],
        blockingLimitations: ["Node-scoped context handoff is missing for this consumer."],
        blockingIfMissing: true,
        inheritedContextUsable: false,
        budgetClass: "cheap",
      });
      const contextBrokerRequestSummary = summarizeContextBrokerRequest(contextBrokerRequest);
      const nodeId = nodeScopedContextScoutNodeId({
        targetNodeId:
          commitmentShards.length > 1
            ? `${targetNode.nodeId}-context-shard-${shardIndex + 1}`
            : targetNode.nodeId,
        graphId: input.graphId,
        index: contextNodes.length,
      });
      const utilityDecision: CostAwareCapabilityUtilityDecision = {
        decisionId: `runtime-node-context-scout-${input.iteration}-${targetIndex + 1}-${shardIndex + 1}`,
        consideredCapabilityIds: ["context_scout"],
        selectedCapabilityId: capability.capabilityId,
        selectedNodeKind: capability.graphNodeKind,
        selectedExecutorKey: capability.executorKey,
        targetCommitmentIds: shardCommitmentIds,
        utilityRationale:
          "A draft implementation work node needs node-scoped repo context before worker execution; context scout is the cheapest sufficient capability to resolve target refs, snapshots, validation refs, and handoff details.",
        costRationale:
          "Run focused context scout for a bounded commitment shard instead of spending broad scheduler or implementation tokens on missing context.",
        whyCheaperOptionsWereInsufficient: null,
        whyThisIsNotDuplicateWork: `No upstream context-supply node is attached to draft work node ${targetNode.nodeId} for commitment shard ${shardIndex + 1}.`,
        expectedEvidence: capability.evidenceProducedKinds,
        expectedDownstreamConsumer: targetNode.nodeId,
        budgetRef: `runtime-task-budget://scheduler/node-context-scout/${targetNode.nodeId}/shard-${shardIndex + 1}`,
        stopOrEscalationCondition:
          "Return needs_review if the scout cannot produce readable target refs, snapshots or explicit new-file intent, validation refs, and a downstream handoff for the target node.",
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
          inputHandoffRefs: [
            graphRef("node", targetNode.nodeId),
            contextBrokerRequest.requestRef,
            ...packetRefs,
          ].slice(0, 24),
          expectedOutput:
            "Node-scoped context handoff with verified target refs, readable snapshots or explicit new-file intent, validation refs, risks, and implementation handoff summary.",
          acceptanceCriteria: [
            "Answers the target work node's context questions for this commitment shard.",
            "Verifies concrete repo refs or explains explicit new-file intent.",
            "Provides validation refs or a blocking reason.",
            "Maps context evidence to the target work node and shard commitments.",
          ],
          downstreamConsumer: targetNode.nodeId,
          commitmentIdsAdvanced: shardCommitmentIds,
          whyThisRoleIsNeededNow:
            "The scheduler already identified the work unit; this scout supplies the exact context needed to make that node executable.",
          exactObjective: `Supply implementation-ready repo context for draft work node ${targetNode.nodeId}.`,
          evidenceExpectation:
            "Bounded node-scoped context handoff packet and evidence claims for the target work node.",
          targetRefs,
          metadata: null,
        },
        missionLedger: input.missionLedger,
        capabilityManifest: input.capabilityManifest,
      });
      contextNodes.push({
        nodeId,
        nodeKind: capability.graphNodeKind,
        capabilityId: capability.capabilityId,
        executorKey: capability.executorKey,
        workerRef: capability.workerRef,
        requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
        assignedRole: capability.roleId,
        modelOrWorkerRef: capability.workerRef,
        inputHandoffRefs: [
          graphRef("node", targetNode.nodeId),
          contextBrokerRequest.requestRef,
          ...packetRefs,
        ].slice(0, 24),
        expectedOutput:
          "Node-scoped context handoff with verified target refs, readable snapshots or explicit new-file intent, validation refs, risks, and implementation handoff summary.",
        acceptanceCriteria: [
          "Answers the target work node's context questions for this commitment shard.",
          "Verifies concrete repo refs or explains explicit new-file intent.",
          "Provides validation refs or a blocking reason.",
          "Maps context evidence to the target work node and shard commitments.",
        ],
        downstreamConsumer: targetNode.nodeId,
        commitmentIdsAdvanced: shardCommitmentIds,
        whyThisRoleIsNeededNow:
          "The scheduler already identified the work unit; this scout supplies the exact context needed to make that node executable.",
        exactObjective: `Supply implementation-ready repo context for draft work node ${targetNode.nodeId} commitment shard ${shardIndex + 1} of ${commitmentShards.length}. ${packetContextQuestions
          .slice(0, 6)
          .join(" ")}`,
        evidenceExpectation:
          "Bounded node-scoped context handoff packet and evidence claims for the target work node.",
        targetRefs,
        metadata: {
          capabilityId: capability.capabilityId,
          graphNodeKind: capability.graphNodeKind,
          executorKey: capability.executorKey,
          workerRef: capability.workerRef,
          requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
          stagedSchedulerProtocolCompiled: true,
          runtimeOwnedNodeScopedContextSupply: true,
          runtimeOwnedContextSupplyShard: commitmentShards.length > 1,
          commitmentIdsAdvanced: shardCommitmentIds,
          contextSupplyShardIndex: shardIndex,
          contextSupplyShardCount: commitmentShards.length,
          targetNodeIds: [targetNode.nodeId],
          targetWorkNodeId: targetNode.nodeId,
          contextBrokerRequestRef: contextBrokerRequest.requestRef,
          contextBrokerRequestStatus: contextBrokerRequest.status,
          contextBrokerConsumerNodeId: contextBrokerRequest.consumerNodeId,
          contextBrokerSemanticQuestion: contextBrokerRequest.semanticQuestion,
          contextBrokerCandidateResourceRefs: contextBrokerRequest.candidateResourceRefs,
          contextBrokerReasonCodes: contextBrokerRequest.reasonCodes,
          contextBrokerDedupeKey: contextBrokerRequest.dedupeKey,
          contextBrokerNextTransition: contextBrokerRequest.nextTransition,
          contextBrokerRequestSummary,
          targetWorkNodeKind: targetNode.nodeKind,
          targetWorkCapabilityId:
            targetNode.capabilityId ?? targetNode.metadataCapabilityId ?? null,
          targetWorkInputHandoffRefs: (targetNode.inputHandoffRefs ?? []).slice(0, 24),
          targetWorkContextQuestions: packetContextQuestions,
          targetWorkAllCommitmentIds: targetCommitmentIds,
          packetRefs,
          expectedEvidence,
          expectedEvidenceSource: "runtime_derived_from_capability_manifest_and_mission_ledger",
          utilityDecision,
          costAwareUtilityDecision: utilityDecision,
          consideredCapabilityIds: utilityDecision.consideredCapabilityIds,
          utilityRationale: utilityDecision.utilityRationale,
          costRationale: utilityDecision.costRationale,
          whyThisIsNotDuplicateWork: utilityDecision.whyThisIsNotDuplicateWork,
          stopOrEscalationCondition: utilityDecision.stopOrEscalationCondition,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        } satisfies JsonValue,
      });
      contextEdges.push({
        edgeId: `node-context-${nodeId}-to-${targetNode.nodeId}`.slice(0, 96),
        fromNodeId: nodeId,
        toNodeId: targetNode.nodeId,
        edgeKind: "context_supplies",
        reasonCodes: [
          "runtime_policy_node_scoped_context_supply_edge",
          ...(commitmentShards.length > 1
            ? ["runtime_policy_node_scoped_context_supply_sharded_edge"]
            : []),
        ],
        artifactRefs: [contextBrokerRequest.requestRef, ...packetRefs].slice(0, 12),
        metadata: {
          runtimeOwnedNodeScopedContextSupplyEdge: true,
          runtimeOwnedContextSupplyShard: commitmentShards.length > 1,
          contextSupplyShardIndex: shardIndex,
          contextSupplyShardCount: commitmentShards.length,
          targetWorkNodeId: targetNode.nodeId,
          contextBrokerRequestRef: contextBrokerRequest.requestRef,
          contextBrokerDedupeKey: contextBrokerRequest.dedupeKey,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        } satisfies JsonValue,
      });
    }
  }
  return {
    decisionId: `runtime-node-scoped-context-supply-${input.iteration}`,
    decisionKind: "add_nodes",
    rationaleForDecision:
      "Runtime policy created focused context scout nodes for scheduler-created draft work nodes before implementation execution.",
    newNodes: contextNodes,
    newEdges: contextEdges,
    runAfterAdd: false,
    commitmentIdsAdvanced: uniqueStrings(
      contextNodes.flatMap((node) => node.commitmentIdsAdvanced ?? []),
    ),
    reasonCodes: [
      "runtime_policy_node_scoped_context_supply_created",
      `runtime_policy_node_scoped_context_supply_node_count:${contextNodes.length}`,
      `runtime_policy_node_scoped_context_supply_edge_count:${contextEdges.length}`,
    ],
    metadata: {
      stagedSchedulerProtocolCompiled: true,
      runtimeOwnedNodeScopedContextSupply: true,
      targetWorkNodeIds: targetNodes.map((node) => node.nodeId),
      parallelIndependentNodesJustification:
        "Each context scout is scoped to one scheduler-created draft work node and can run independently unless the target work graph already declares dependencies.",
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
    if (
      !incomingContextSupplyAccepted({
        nodeId: plannedNode.nodeId,
        summary: input.snapshotSummary,
      })
    ) {
      return null;
    }
    return {
      decisionId: `runtime-context-synthesis-run-${input.iteration}-${plannedNode.nodeId}`,
      decisionKind: plannedNode.nodeStatus === "needs_review" ? "retry_node" : "run_node",
      targetNodeId: plannedNode.nodeId,
      runNodeId: plannedNode.nodeId,
      rationaleForDecision:
        "An explicit context synthesis coordination node is already planned; runtime will run it only after its incoming context-supply handoffs are accepted.",
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
  return null;
}

function deterministicImplementationContextRepairDecision(input: {
  graphId: string;
  iteration: number;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  missionLedger: MissionContractLedger | null;
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): OrchestratorGraphDecision | null {
  const capability = findRuntimeNodeCapability("context_scout", input.capabilityManifest);
  if (!capability) {
    return null;
  }
  const failedImplementationNodes = input.snapshotSummary.nodeSummaries.filter((node) => {
    if (node.nodeStatus !== "needs_review") {
      return false;
    }
    if (summaryNodeRoleClass(node, input.capabilityManifest) !== "implementation") {
      return false;
    }
    return (node.lastStatusReasonCodes ?? []).some((code) =>
      /context|readiness|snapshot|target_refs|validation_refs|upstream_context/iu.test(code),
    );
  });
  if (failedImplementationNodes.length === 0) {
    return null;
  }
  const existingRepairNodeIds = new Set(
    input.snapshotSummary.nodeSummaries
      .filter((node) => node.nodeKind === "context_scout")
      .flatMap((node) => node.inputHandoffRefs),
  );
  const repairNodes: OrchestratorGraphNodeSpec[] = [];
  const repairEdges: NonNullable<OrchestratorGraphDecision["newEdges"]> = [];
  for (const failedNode of failedImplementationNodes.slice(0, 8)) {
    const repairRef = graphRef("node", failedNode.nodeId);
    if (existingRepairNodeIds.has(repairRef)) {
      continue;
    }
    const nodeId = `context_repair-${failedNode.nodeId}`.slice(0, 120);
    const failedReasonCodes = failedNode.lastStatusReasonCodes ?? [];
    const failedInputHandoffRefs = failedNode.inputHandoffRefs ?? [];
    const failedOutputArtifactRefs = failedNode.outputArtifactRefs ?? [];
    const failedCommitmentIds = failedNode.commitmentIdsAdvanced ?? [];
    const targetCommitmentIds =
      failedCommitmentIds.length > 0
        ? failedCommitmentIds
        : input.missionLedger
          ? openBlockingMissionCommitments(input.missionLedger).map(
              (commitment) => commitment.commitmentId,
            )
          : [];
    const costAwareUtilityDecision: CostAwareCapabilityUtilityDecision = {
      decisionId: `runtime-context-repair-${input.iteration}-${failedNode.nodeId}`.slice(0, 180),
      consideredCapabilityIds: ["context_scout"],
      selectedCapabilityId: capability.capabilityId,
      selectedNodeKind: capability.graphNodeKind,
      selectedExecutorKey: capability.executorKey,
      targetCommitmentIds,
      utilityRationale:
        "A failed implementation node reported missing context/readiness evidence; runtime compiles a focused context repair node instead of asking the model to author graph envelopes.",
      costRationale:
        "Context scout is the cheapest sufficient repair capability for missing file snapshots, validation refs, or context handoff details.",
      whyCheaperOptionsWereInsufficient: null,
      whyThisIsNotDuplicateWork:
        "No existing context repair node is attached to this failed implementation node.",
      expectedEvidence: capability.evidenceProducedKinds,
      expectedDownstreamConsumer: failedNode.nodeId,
      budgetRef: `runtime-task-budget://scheduler/context-repair/${failedNode.nodeId}`,
      stopOrEscalationCondition:
        "Return needs_review if the context repair cannot produce readable target refs, validation refs, and a handoff summary for the failed implementation node.",
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
        inputHandoffRefs: [repairRef, ...failedInputHandoffRefs].slice(0, 12),
        expectedOutput:
          "Focused context repair handoff with readable target refs, validation refs, context handoff summary, and explicit blockers for the failed implementation node.",
        acceptanceCriteria: [
          "Identify the concrete files or refs required for the failed implementation node.",
          "Confirm whether each target ref exists and is readable before implementation retries.",
          "Provide validation command refs or state a blocking reason if validation cannot be identified.",
        ],
        downstreamConsumer: failedNode.nodeId,
        commitmentIdsAdvanced: targetCommitmentIds,
        whyThisRoleIsNeededNow:
          "Implementation readiness failed; context must be repaired before the worker is invoked again.",
        exactObjective: `Repair missing context for implementation node ${failedNode.nodeId}: ${failedReasonCodes
          .slice(0, 8)
          .join(", ")}`,
        evidenceExpectation:
          "Bounded context repair handoff mapped to the failed implementation node and target commitments.",
        targetRefs: failedOutputArtifactRefs,
        metadata: null,
      },
      missionLedger: input.missionLedger,
      capabilityManifest: input.capabilityManifest,
    });
    repairNodes.push({
      nodeId,
      nodeKind: capability.graphNodeKind,
      capabilityId: capability.capabilityId,
      executorKey: capability.executorKey,
      workerRef: capability.workerRef,
      requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
      assignedRole: capability.roleId,
      modelOrWorkerRef: capability.workerRef,
      inputHandoffRefs: [repairRef, ...failedInputHandoffRefs].slice(0, 12),
      expectedOutput:
        "Focused context repair handoff with readable target refs, validation refs, context handoff summary, and explicit blockers for the failed implementation node.",
      acceptanceCriteria: [
        "Identify the concrete files or refs required for the failed implementation node.",
        "Confirm whether each target ref exists and is readable before implementation retries.",
        "Provide validation command refs or state a blocking reason if validation cannot be identified.",
      ],
      downstreamConsumer: failedNode.nodeId,
      commitmentIdsAdvanced: targetCommitmentIds,
      whyThisRoleIsNeededNow:
        "Implementation readiness failed; context must be repaired before the worker is invoked again.",
      exactObjective: `Repair missing context for implementation node ${failedNode.nodeId}: ${failedReasonCodes
        .slice(0, 8)
        .join(", ")}`,
      evidenceExpectation:
        "Bounded context repair handoff mapped to the failed implementation node and target commitments.",
      targetRefs: failedOutputArtifactRefs,
      metadata: {
        capabilityId: capability.capabilityId,
        graphNodeKind: capability.graphNodeKind,
        executorKey: capability.executorKey,
        workerRef: capability.workerRef,
        requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
        stagedSchedulerProtocolCompiled: true,
        runtimeOwnedContextRepairNode: true,
        failedImplementationNodeId: failedNode.nodeId,
        failedImplementationReasonCodes: failedReasonCodes.slice(0, 20),
        expectedEvidence,
        expectedEvidenceSource: "runtime_derived_from_capability_manifest_and_mission_ledger",
        utilityDecision: costAwareUtilityDecision,
        costAwareUtilityDecision,
        consideredCapabilityIds: costAwareUtilityDecision.consideredCapabilityIds,
        utilityRationale: costAwareUtilityDecision.utilityRationale,
        costRationale: costAwareUtilityDecision.costRationale,
        stopOrEscalationCondition: costAwareUtilityDecision.stopOrEscalationCondition,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } satisfies JsonValue,
    });
    repairEdges.push({
      edgeId: `context-repair-${nodeId}-to-${failedNode.nodeId}`.slice(0, 96),
      fromNodeId: nodeId,
      toNodeId: failedNode.nodeId,
      edgeKind: "context_supplies",
      reasonCodes: [
        "runtime_policy_context_repair_before_implementation_retry",
        "runtime_policy_context_repair_edge_supplies_failed_consumer",
      ],
      artifactRefs: failedOutputArtifactRefs.slice(0, 8),
      metadata: {
        runtimeOwnedContextRepairEdge: true,
        contextRepairConsumerEdge: true,
        failedImplementationNodeId: failedNode.nodeId,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } satisfies JsonValue,
    });
  }
  if (repairNodes.length === 0) {
    return null;
  }
  return {
    decisionId: `runtime-implementation-context-repair-${input.iteration}`,
    decisionKind: "add_nodes",
    rationaleForDecision:
      "Runtime compiled focused context repair nodes from failed implementation readiness evidence; the model is not asked to author executable repair graph envelopes.",
    newNodes: repairNodes,
    newEdges: repairEdges,
    runAfterAdd: true,
    runNodeId: repairNodes[0]?.nodeId,
    commitmentIdsAdvanced: uniqueStrings(
      repairNodes.flatMap((node) => node.commitmentIdsAdvanced ?? []),
    ),
    reasonCodes: [
      "runtime_policy_implementation_context_repair_created",
      "runtime_owned_semantic_repair_intent_compiled",
      `runtime_policy_context_repair_node_count:${repairNodes.length}`,
    ],
    metadata: {
      stagedSchedulerProtocolCompiled: true,
      runtimeOwnedImplementationContextRepair: true,
      failedImplementationNodeIds: failedImplementationNodes.map((node) => node.nodeId),
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

function stringFromJson(value: JsonValue | undefined, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function selectedCapabilityIdFromSynthesisGroup(input: {
  group: Record<string, JsonValue>;
}): string | null {
  const explicit = stringFromJson(input.group.selectedCapabilityId);
  if (explicit) {
    return explicit;
  }
  const recommended = jsonStringArray(input.group.recommendedCapabilityIds);
  return recommended[0] ?? null;
}

function runtimeCompiledPostSynthesisGraphDecision(input: {
  graphId: string;
  iteration: number;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  missionLedger: MissionContractLedger | null;
  capabilityManifest: RuntimeNodeCapabilityManifest;
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
      decisionId: "runtime-post-synthesis-workintent-missing-artifact-" + String(input.iteration),
      decisionKind: "mark_needs_review",
      rationaleForDecision:
        "Accepted context synthesis exists, but the bounded synthesis artifact summary is not available. The retired post-synthesis executable compiler will not invent implementation nodes from hidden synthesis state.",
      reasonCodes: [
        "runtime_post_synthesis_workintent_requires_synthesis_artifact_summary",
        "post_synthesis_executable_graph_compilation_retired",
      ],
      metadata: {
        runtimeCompiledFromContextSynthesis: true,
        contextSynthesisCoordinationOnly: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
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
      decisionId: "runtime-post-synthesis-workintent-invalid-artifact-" + String(input.iteration),
      decisionKind: "mark_needs_review",
      rationaleForDecision:
        "Accepted context synthesis did not contain a complete, bounded coordination artifact. The runtime will not convert synthesis directly into executable implementation nodes.",
      reasonCodes: [
        groups.length === 0
          ? "runtime_post_synthesis_workintent_groups_missing"
          : "runtime_post_synthesis_workintent_ref_missing",
        "post_synthesis_executable_graph_compilation_retired",
      ],
      metadata: {
        runtimeCompiledFromContextSynthesis: true,
        contextSynthesisCoordinationOnly: true,
        synthesisSummaryAvailable: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } satisfies JsonValue,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
  }
  if (!compileHandoffComplete || groups.length < expectedGroupCount) {
    return {
      decisionId: "runtime-post-synthesis-workintent-incomplete-handoff-" + String(input.iteration),
      decisionKind: "mark_needs_review",
      rationaleForDecision:
        "Accepted context synthesis reported more coordination groups than the compiler received. The scheduler refuses to compile a partial WorkIntent graph.",
      reasonCodes: [
        "runtime_post_synthesis_workintent_compile_handoff_incomplete",
        "runtime_post_synthesis_workintent_expected_group_count:" + String(expectedGroupCount),
        "runtime_post_synthesis_workintent_received_group_count:" + String(groups.length),
        "post_synthesis_executable_graph_compilation_retired",
      ],
      metadata: {
        runtimeCompiledFromContextSynthesis: true,
        contextSynthesisCoordinationOnly: true,
        synthesisSummaryAvailable: true,
        contextSynthesisRef: synthesisRef,
        expectedGroupCount,
        receivedGroupCount: groups.length,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } satisfies JsonValue,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  const allCommitmentIds = uniqueStrings(
    groups.flatMap((group) => jsonStringArray(group.commitmentIds)),
  );
  const nodes: OrchestratorGraphNodeSpec[] = [];
  const groupNodeIdByGroupId = new Map<string, string>();
  const groupIdByWorkUnitId = new Map<string, string>();
  const rejectedDiagnostics: JsonValue[] = [];
  const rejectedReasonCodes: string[] = [];

  for (const [index, group] of groups.entries()) {
    const groupId = stringFromJson(group.groupId, "group-" + String(index + 1));
    const workUnitId = stringFromJson(group.workUnitId, groupId);
    const selectedCapabilityId = selectedCapabilityIdFromSynthesisGroup({ group }) ?? "";
    const executionIntent =
      stringFromJson(group.executionIntent) || stringFromJson(group.workIntentExecutionIntent);
    const commitmentIds = jsonStringArray(group.commitmentIds);
    const targetRefs = jsonStringArray(group.targetRefs);
    const inputRefs = uniqueStrings([
      synthesisRef,
      ...jsonStringArray(group.inputRefs),
      ...jsonStringArray(group.inputHandoffRefs),
    ]);
    const capabilityRationale =
      stringFromJson(group.capabilityRationale) || stringFromJson(group.workerFitRationale);
    const expectedOutput = stringFromJson(group.expectedOutput);
    const successCriteria = jsonStringArray(group.successCriteria);
    const compileResult = compileWorkIntent({
      decisionId: "runtime-post-synthesis-workintent-" + String(input.iteration),
      graphId: input.graphId,
      workUnitId,
      title: stringFromJson(group.title) || groupId,
      objective: stringFromJson(group.objective),
      commitmentIds: commitmentIds.length > 0 ? commitmentIds : allCommitmentIds,
      executionIntent,
      selectedCapabilityId,
      consideredCapabilityIds: uniqueStrings([
        selectedCapabilityId,
        ...jsonStringArray(group.recommendedCapabilityIds),
      ]),
      capabilityRationale,
      costRationale: stringFromJson(group.costRationale) || null,
      whyCheaperOptionsWereInsufficient:
        stringFromJson(group.whyCheaperOptionsWereInsufficient) ||
        stringFromJson(group.codexEscalationRationale) ||
        null,
      whyThisIsNotDuplicateWork: stringFromJson(group.whyThisIsNotDuplicateWork) || null,
      expectedOutput,
      successCriteria,
      contextQuestions: jsonStringArray(group.contextQuestions),
      targetRefs,
      inputRefs,
      validationNeeds: jsonStringArray(group.validationNeeds),
      dependencyWorkUnitIds: jsonStringArray(group.dependencyWorkUnitIds),
      downstreamConsumer: stringFromJson(group.downstreamConsumer),
      stopIfMissing: jsonStringArray(group.stopIfMissing),
      parallelismRationale: stringFromJson(group.parallelismRationale) || null,
      rationale:
        stringFromJson(group.rationale) || stringFromJson(group.workerFitRationale) || null,
      capabilityManifest: input.capabilityManifest,
      sourceRecord: group,
      sourcePath: "contextSynthesis.implementationGroups[" + String(index) + "]",
    });
    if (!compileResult.node || !compileResult.workIntent) {
      rejectedReasonCodes.push(
        ...compileResult.reasonCodes.map(
          (code) => "runtime_post_synthesis_workintent:" + groupId + ":" + code,
        ),
      );
      rejectedDiagnostics.push({
        groupId,
        workUnitId,
        executionIntent: executionIntent || null,
        selectedCapabilityId: selectedCapabilityId || null,
        diagnostics: compileResult.diagnostics.slice(0, 12).map((diagnostic) => ({
          path: diagnostic.path,
          errorCode: diagnostic.errorCode,
          message: boundedRuntimeWorkGraphString(diagnostic.message, 500),
          validValues: diagnostic.validValues?.slice(0, 16) ?? null,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        })),
        repairRequest: compileResult.repairRequest,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } satisfies JsonValue);
      continue;
    }
    const node: OrchestratorGraphNodeSpec = {
      ...compileResult.node,
      inputHandoffRefs: uniqueStrings([
        synthesisRef,
        ...(compileResult.node.inputHandoffRefs ?? []),
      ]),
      metadata: {
        ...jsonRecord(compileResult.node.metadata ?? null),
        runtimeCompiledFromContextSynthesis: true,
        contextSynthesisCoordinationOnly: true,
        contextSynthesisRef: synthesisRef,
        contextSynthesisGroupId: groupId,
        contextSynthesisWorkIntentOnly: true,
        contextSynthesisDirectExecutableCompilationRetired: true,
        compileHandoffComplete: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } satisfies JsonValue,
    };
    nodes.push(node);
    groupNodeIdByGroupId.set(groupId, node.nodeId);
    groupIdByWorkUnitId.set(workUnitId, groupId);
  }

  if (rejectedDiagnostics.length > 0 || nodes.length !== groups.length) {
    return {
      decisionId: "runtime-post-synthesis-workintent-compile-blocked-" + String(input.iteration),
      decisionKind: "mark_needs_review",
      rationaleForDecision:
        "Accepted context synthesis can only advance through explicit WorkIntent contracts. One or more groups lacked model-authored execution intent, capability selection, or required semantic fields, so no executable graph was created.",
      reasonCodes: uniqueStrings([
        "runtime_post_synthesis_workintent_compile_blocked",
        "post_synthesis_executable_graph_compilation_retired",
        ...rejectedReasonCodes,
      ]).slice(0, 120),
      metadata: {
        runtimeCompiledFromContextSynthesis: true,
        contextSynthesisCoordinationOnly: true,
        contextSynthesisRef: synthesisRef,
        groupCount: groups.length,
        compiledWorkIntentCount: nodes.length,
        rejectedWorkIntentCount: rejectedDiagnostics.length,
        rejectedWorkIntentDiagnostics: rejectedDiagnostics.slice(0, 24),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } satisfies JsonValue,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  const edges: NonNullable<OrchestratorGraphDecision["newEdges"]> = [];
  const dependencyMap = Array.isArray(synthesis.dependencyMap)
    ? synthesis.dependencyMap.filter((item): item is Record<string, JsonValue> =>
        Boolean(item && typeof item === "object" && !Array.isArray(item)),
      )
    : [];
  for (const dependency of dependencyMap.slice(0, 48)) {
    const fromGroupIdRaw =
      stringFromJson(dependency.fromGroupId) || stringFromJson(dependency.from);
    const toGroupIdRaw = stringFromJson(dependency.toGroupId) || stringFromJson(dependency.to);
    const fromGroupId = groupNodeIdByGroupId.has(fromGroupIdRaw)
      ? fromGroupIdRaw
      : (groupIdByWorkUnitId.get(fromGroupIdRaw) ?? fromGroupIdRaw);
    const toGroupId = groupNodeIdByGroupId.has(toGroupIdRaw)
      ? toGroupIdRaw
      : (groupIdByWorkUnitId.get(toGroupIdRaw) ?? toGroupIdRaw);
    const fromNodeId = groupNodeIdByGroupId.get(fromGroupId);
    const toNodeId = groupNodeIdByGroupId.get(toGroupId);
    if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
      continue;
    }
    edges.push({
      edgeId: ("workintent-" + fromGroupId + "-to-" + toGroupId).slice(0, 96),
      fromNodeId,
      toNodeId,
      edgeKind: "depends_on",
      reasonCodes: ["runtime_compiled_context_synthesis_workintent_dependency"],
      artifactRefs: [synthesisRef],
      metadata: {
        contextSynthesisRef: synthesisRef,
        contextSynthesisCoordinationOnly: true,
        dependencyKind: stringFromJson(dependency.dependencyKind, "handoff"),
        rationale: stringFromJson(dependency.rationale) || null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } satisfies JsonValue,
    });
  }

  return {
    decisionId: "runtime-post-synthesis-workintent-graph-" + String(input.iteration),
    decisionKind: "add_nodes",
    rationaleForDecision:
      "Runtime converted accepted context synthesis coordination groups into WorkIntent nodes only. Executable implementation, validation, review, readback, and closeout nodes must be compiled later from capability requirements and resource materialization readiness.",
    newNodes: nodes,
    newEdges: edges,
    runAfterAdd: false,
    commitmentIdsAdvanced: uniqueStrings(nodes.flatMap((node) => node.commitmentIdsAdvanced ?? [])),
    reasonCodes: [
      "runtime_compiled_post_synthesis_workintent_graph_created",
      "post_synthesis_executable_graph_compilation_retired",
      "runtime_compiled_post_synthesis_workintent_group_count:" + String(groups.length),
      "runtime_compiled_post_synthesis_workintent_node_count:" + String(nodes.length),
      "runtime_compiled_post_synthesis_workintent_edge_count:" + String(edges.length),
    ],
    metadata: {
      stagedSchedulerProtocolCompiled: true,
      runtimeCompiledFromContextSynthesis: true,
      contextSynthesisCoordinationOnly: true,
      contextSynthesisDirectExecutableCompilationRetired: true,
      contextSynthesisRef: synthesisRef,
      implementationGroupCount: groups.length,
      workIntentNodeCount: nodes.length,
      edgeCount: edges.length,
      parallelIndependentNodesJustification:
        stringFromJson(synthesis.parallelismPlan) ||
        stringFromJson(schedulerHandoff.parallelismPlan) ||
        null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    } satisfies JsonValue,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

function nodeSpecMatchesEntryNodePolicy(input: {
  node: OrchestratorGraphNodeSpec;
  policy: WorkflowEntryNodePolicy;
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): boolean {
  const capability = capabilityForNodeRef(input.node, input.capabilityManifest);
  if (capability && input.policy.allowedInitialCapabilityIds.includes(capability.capabilityId)) {
    return true;
  }
  const capabilityRoleClass = capability
    ? workflowRoleClassForCapabilityRole(capability.roleClass)
    : null;
  const metadataRoleClass = explicitWorkflowRoleClass(
    jsonRecord(input.node.metadata ?? {}).roleClass,
  );
  const directRoleClass = explicitWorkflowRoleClass(input.node.assignedRole);
  const roleClass = capabilityRoleClass ?? metadataRoleClass ?? directRoleClass;
  return Boolean(roleClass && input.policy.allowedInitialRoleClasses.includes(roleClass));
}

function summaryNodeMatchesEntryNodePolicy(input: {
  node: RuntimeWorkGraphSchedulerSnapshotSummary["nodeSummaries"][number];
  policy: WorkflowEntryNodePolicy;
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): boolean {
  const capabilityId = input.node.capabilityId ?? input.node.metadataCapabilityId ?? null;
  const capability = capabilityId
    ? findRuntimeNodeCapability(capabilityId, input.capabilityManifest)
    : null;
  if (capability && input.policy.allowedInitialCapabilityIds.includes(capability.capabilityId)) {
    return true;
  }
  const capabilityRoleClass = capability
    ? workflowRoleClassForCapabilityRole(capability.roleClass)
    : null;
  const directRoleClass = explicitWorkflowRoleClass(input.node.assignedRole);
  const roleClass = capabilityRoleClass ?? directRoleClass;
  return Boolean(roleClass && input.policy.allowedInitialRoleClasses.includes(roleClass));
}

function entryNodeAlreadyStarted(
  summary: RuntimeWorkGraphSchedulerSnapshotSummary,
  policy: WorkflowEntryNodePolicy,
  capabilityManifest: RuntimeNodeCapabilityManifest,
): boolean {
  return summary.nodeSummaries.some(
    (node) =>
      summaryNodeMatchesEntryNodePolicy({ node, policy, capabilityManifest }) &&
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

function normalizedEvidenceKindForClaim(
  claim: CommitmentEvidenceClaim,
): CommitmentEvidenceClaim["evidenceKind"] | null {
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
  return null;
}

function normalizeEvidenceClaims(input: {
  claims: CommitmentEvidenceClaim[];
  outputArtifactRefs: string[];
}): { claims: CommitmentEvidenceClaim[]; reasonCodes: string[] } {
  const reasonCodes: string[] = [];
  const claims = input.claims.map((claim) => {
    const explicitEvidenceKind = normalizedEvidenceKindForClaim(claim);
    const evidenceKind = explicitEvidenceKind ?? "artifact";
    const storageFlags = claim as unknown as Record<string, unknown>;
    if (!explicitEvidenceKind) {
      reasonCodes.push(`evidence_claim_kind_missing_or_invalid:${claim.commitmentId}`);
    }
    return {
      ...claim,
      evidenceKind,
      evidenceRef: claim.evidenceRef,
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
  entryNodePolicy?: WorkflowEntryNodePolicy | null;
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
    input.entryNodePolicy?.requiredBeforeOtherExecution &&
    !entryNodeAlreadyStarted(input.snapshotSummary, input.entryNodePolicy, input.capabilityManifest)
  ) {
    const newNodes = input.decision.newNodes ?? [];
    const planningNodeIds = new Set(
      newNodes
        .filter((node) =>
          nodeSpecMatchesEntryNodePolicy({
            node,
            policy: input.entryNodePolicy as WorkflowEntryNodePolicy,
            capabilityManifest: input.capabilityManifest,
          }),
        )
        .map((node) => node.nodeId),
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
      Boolean(
        existingTargetNode &&
        summaryNodeMatchesEntryNodePolicy({
          node: existingTargetNode,
          policy: input.entryNodePolicy,
          capabilityManifest: input.capabilityManifest,
        }),
      );
    if (firstGraphDecision && newNodes.length > 0 && planningNodeIds.size === 0) {
      reasonCodes.push("workflow_entry_node_policy_initial_node_missing");
    }
    if (
      ["run_node", "retry_node", "repair_from_validation"].includes(input.decision.decisionKind) &&
      !targetIsPlanningOrchestrator
    ) {
      reasonCodes.push(input.entryNodePolicy.blockedUntilStartedReasonCode);
    }
    if (input.decision.runAfterAdd && targetNodeId && !targetIsPlanningOrchestrator) {
      reasonCodes.push("workflow_entry_node_policy_run_after_add_target_invalid");
    }
  }
  if (complex && input.decision.newNodes?.length) {
    for (const node of input.decision.newNodes) {
      reasonCodes.push(...nodeContractReasonCodes({ node, knownCommitmentIds: knownCommitments }));
    }
  }
  if (input.decision.newNodes?.length) {
    const outgoingEdgesByNodeId = new Set(
      (input.decision.newEdges ?? [])
        .map((edge) => edge.fromNodeId)
        .filter((nodeId): nodeId is string => Boolean(nodeId)),
    );
    for (const node of input.decision.newNodes) {
      const nodeMetadata = jsonRecord(node.metadata ?? null);
      const isContextRepairOrAcquisition =
        nodeMetadata.runtimeOwnedContextRepairNode === true ||
        nodeMetadata.runtimeOwnedNodeScopedContextSupply === true;
      const diagnosticOnly =
        nodeMetadata.diagnosticOnly === true ||
        nodeMetadata.lifecycleState === "diagnostic_only" ||
        nodeMetadata.contextNodeLifecycle === "diagnostic_only";
      if (
        isContextRepairOrAcquisition &&
        !diagnosticOnly &&
        !outgoingEdgesByNodeId.has(node.nodeId)
      ) {
        reasonCodes.push("context_repair_or_acquisition_node_consumer_edge_missing");
      }
    }
  }
  if (complex && firstGraphDecision) {
    const newNodes = input.decision.newNodes ?? [];
    const metadata = jsonRecord(input.decision.metadata ?? {});
    const progressiveContextFirst = isProgressiveContextAcquisitionFirstMove(
      newNodes,
      input.capabilityManifest,
    );
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
  if (
    node.nodeKind === "implementation" ||
    node.nodeKind === "test_authoring" ||
    node.assignedRole === "implementation_engineer"
  ) {
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
  private readonly expansionAdmissionPolicy: RuntimeWorkGraphExpansionAdmissionPolicy;
  private readonly recentNodeResultSummaries: RuntimeWorkGraphRecentNodeResultSummary[] = [];

  constructor(private readonly options: RuntimeWorkGraphSchedulerOptions) {
    this.maxIterations = options.maxIterations ?? 24;
    this.maxDecisionRepairAttempts = options.maxDecisionRepairAttempts ?? 2;
    this.maxParallelNodeExecutions = Math.max(
      1,
      Math.min(16, options.maxParallelNodeExecutions ?? 1),
    );
    this.capabilityManifest = options.capabilityManifest ?? buildRuntimeNodeCapabilityManifest();
    this.expansionAdmissionPolicy = {
      ...DEFAULT_EXPANSION_ADMISSION_POLICY,
      ...options.expansionAdmissionPolicy,
    };
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
        addedNodeIds,
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
      const snapshotSummary = summarizeSnapshot(snapshot);
      const nodeScopedContextSupplyDecision = deterministicNodeScopedContextSupplyDecision({
        graphId,
        iteration,
        snapshotSummary,
        missionLedger,
        commitmentWorkPackets: this.options.commitmentWorkPackets ?? [],
        capabilityManifest: this.capabilityManifest,
      });
      if (nodeScopedContextSupplyDecision) {
        const decisionRef = graphRef(
          "orchestrator-decision",
          nodeScopedContextSupplyDecision.decisionId,
        );
        await this.options.graphs.recordCheckpoint({
          graphId,
          checkpointKind: "runtime_policy_node_scoped_context_supply_created",
          stateSummary: nodeScopedContextSupplyDecision.rationaleForDecision,
          artifactRefs: [decisionRef],
        });
        decisionRefs.push(decisionRef);
        reasonCodes.push(
          ...nodeScopedContextSupplyDecision.reasonCodes,
          "runtime_policy_node_scoped_context_supply_bypassed_orchestrator_decision",
        );
        const applied = await this.applyDecision({
          graphId,
          decision: nodeScopedContextSupplyDecision,
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
        commitmentWorkPacketSummaries:
          summarizeCommitmentWorkPacketsForProgress(commitmentWorkPackets),
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
          commitmentWorkPacketSummaries:
            summarizeCommitmentWorkPacketsForProgress(commitmentWorkPackets),
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
    const nodeScopedContextSupplyDecision = deterministicNodeScopedContextSupplyDecision({
      graphId: input.graphId,
      iteration: input.iteration,
      snapshotSummary: input.snapshotSummary,
      missionLedger: input.missionLedger,
      commitmentWorkPackets,
      capabilityManifest: this.capabilityManifest,
    });
    if (nodeScopedContextSupplyDecision) {
      const decisionRef = graphRef(
        "orchestrator-decision",
        nodeScopedContextSupplyDecision.decisionId,
      );
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind: "runtime_policy_node_scoped_context_supply_created",
        stateSummary: nodeScopedContextSupplyDecision.rationaleForDecision,
        artifactRefs: [decisionRef],
      });
      return {
        decision: nodeScopedContextSupplyDecision,
        decisionRefs: [...decisionRefs, decisionRef],
        reasonCodes: [
          ...reasonCodes,
          ...nodeScopedContextSupplyDecision.reasonCodes,
          "runtime_policy_node_scoped_context_supply_bypassed_orchestrator_decision",
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
    const implementationContextRepairDecision = deterministicImplementationContextRepairDecision({
      graphId: input.graphId,
      iteration: input.iteration,
      snapshotSummary: input.snapshotSummary,
      missionLedger: input.missionLedger,
      capabilityManifest: this.capabilityManifest,
    });
    if (implementationContextRepairDecision) {
      const decisionRef = graphRef(
        "orchestrator-decision",
        implementationContextRepairDecision.decisionId,
      );
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind: "runtime_policy_implementation_context_repair_created",
        stateSummary: implementationContextRepairDecision.rationaleForDecision,
        artifactRefs: [decisionRef],
      });
      return {
        decision: implementationContextRepairDecision,
        decisionRefs: [...decisionRefs, decisionRef],
        reasonCodes: [
          ...reasonCodes,
          ...implementationContextRepairDecision.reasonCodes,
          "runtime_policy_implementation_context_repair_bypassed_orchestrator_decision",
        ],
      };
    }
    const postSynthesisCompiledDecision = runtimeCompiledPostSynthesisGraphDecision({
      graphId: input.graphId,
      iteration: input.iteration,
      snapshotSummary: input.snapshotSummary,
      missionLedger: input.missionLedger,
      capabilityManifest: this.capabilityManifest,
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
            ? "runtime_policy_post_synthesis_workintent_graph_compiled"
            : "runtime_policy_post_synthesis_workintent_graph_compilation_blocked",
        stateSummary: postSynthesisCompiledDecision.rationaleForDecision,
        artifactRefs: [decisionRef],
      });
      return {
        decision: postSynthesisCompiledDecision,
        decisionRefs: [...decisionRefs, decisionRef],
        reasonCodes: [
          ...reasonCodes,
          ...postSynthesisCompiledDecision.reasonCodes,
          "runtime_policy_post_synthesis_workintent_bypassed_orchestrator_decision",
        ],
      };
    }
    const decisionPhase = schedulerDecisionCapabilityPhase({
      snapshotSummary: input.snapshotSummary,
      missionLedger: input.missionLedger,
      capabilityManifest: this.capabilityManifest,
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
            commitmentWorkPacketSummaries:
              summarizeCommitmentWorkPacketsForProgress(commitmentWorkPackets),
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
            entryNodePolicy: this.options.entryNodePolicy ?? null,
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
    const decisionCompiledBySchedulerProtocol =
      metadata.stagedSchedulerProtocolCompiled === true ||
      metadata.genericSchedulerProtocolCompiled === true;
    if (addsNodes && !decisionCompiledBySchedulerProtocol) {
      reasonCodes.push("generic_staged_scheduler_protocol_required_for_node_creation");
    }
    for (const node of decision.newNodes ?? []) {
      const nodeMetadata = jsonRecord(node.metadata ?? {});
      const nodeCompiledBySchedulerProtocol =
        nodeMetadata.stagedSchedulerProtocolCompiled === true ||
        nodeMetadata.genericSchedulerProtocolCompiled === true;
      if (!nodeCompiledBySchedulerProtocol) {
        reasonCodes.push(`generic_staged_scheduler_node_not_compiled:${node.nodeId}`);
      }
      if (node.nodeKind === "work_intent") {
        if (nodeMetadata.workIntentCompiled !== true) {
          reasonCodes.push(`generic_staged_scheduler_work_intent_not_compiled:${node.nodeId}`);
        }
        for (const [field, value] of Object.entries({
          workIntentRef: nodeMetadata.workIntentRef,
          selectedCapabilityId: nodeMetadata.workIntentSelectedCapabilityId,
          executionIntent: nodeMetadata.executionIntent,
          evidenceMode: nodeMetadata.evidenceMode,
          resourceRequirementKinds: nodeMetadata.resourceRequirementKinds,
          nextLegalTransitions: nodeMetadata.nextLegalTransitions,
        })) {
          if (
            (Array.isArray(value) && value.length === 0) ||
            (!Array.isArray(value) && (typeof value !== "string" || !value.trim()))
          ) {
            reasonCodes.push(
              `generic_staged_scheduler_work_intent_field_missing:${node.nodeId}:${field}`,
            );
          }
        }
        continue;
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
        !isProgressiveContextAcquisitionFirstMove(decision.newNodes ?? [], this.capabilityManifest)
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
      const schedulerFrontierState = jsonRecord(metadata.schedulerFrontierState);
      const noProgressSignature = jsonRecord(metadata.noProgressSignature);
      const missionLedgerEvaluationThrottle = jsonRecord(metadata.missionLedgerEvaluationThrottle);
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
      const commitmentWorkPacketSummaries = Array.isArray(metadata.commitmentWorkPacketSummaries)
        ? metadata.commitmentWorkPacketSummaries
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
        schedulerFrontierState:
          schedulerFrontierState.artifactKind === "runtime_work_graph_scheduler_frontier_state"
            ? (schedulerFrontierState as unknown as RuntimeWorkGraphSchedulerFrontierState)
            : null,
        noProgressSignature:
          noProgressSignature.artifactKind === "runtime_work_graph_no_progress_signature"
            ? (noProgressSignature as unknown as RuntimeWorkGraphNoProgressSignature)
            : null,
        noProgressRepeatCount:
          typeof metadata.noProgressRepeatCount === "number"
            ? metadata.noProgressRepeatCount
            : null,
        missionLedgerEvaluationThrottle:
          missionLedgerEvaluationThrottle.artifactKind ===
          "runtime_work_graph_mission_ledger_evaluation_throttle"
            ? (missionLedgerEvaluationThrottle as JsonValue)
            : null,
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
        commitmentWorkPacketSummaries,
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
    addedNodeIds: string[];
    loopGuard: RuntimeWorkGraphLoopGuard;
  }): Promise<{
    status: "continue" | "succeeded" | "needs_review" | "failed" | "waiting_for_human";
    reasonCodes: string[];
    missionLedger?: MissionContractLedger | null;
  } | null> {
    if (
      this.maxParallelNodeExecutions <= 1 &&
      this.options.preferExecutableFrontierBeforeOrchestrator !== true
    ) {
      return null;
    }
    const frontier = selectRunnableParallelFrontier({
      snapshot: input.snapshot,
      executors: this.options.executors,
      maxParallelNodeExecutions: this.maxParallelNodeExecutions,
    });
    const frontierState = buildSchedulerFrontierState({
      graphId: input.graphId,
      iteration: input.iteration,
      snapshot: input.snapshot,
      frontier,
      executors: this.options.executors,
      missionLedger: input.missionLedger,
      requireFreshContextSnapshotsForWorkerExecution:
        this.options.requireFreshContextSnapshotsForWorkerExecution === true,
      requireNodeExecutionPacketForWorkerExecution:
        this.options.requireNodeExecutionPacketForWorkerExecution === true,
    });
    const canonicalFrontierTool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: "scheduler.evaluate_canonical_frontier",
      idempotencyKey: `iteration:${input.iteration}:canonical-frontier`,
      inputRef: graphRef("graph", `${input.graphId}/canonical-frontier/${input.iteration}`),
      inputSummary:
        "Evaluate canonical scheduler frontier before asking the orchestrator for graph expansion or prerequisite creation.",
      metadata: {
        schedulerFrontierState: frontierState as unknown as JsonValue,
        selectedNodeIds: frontierState.selectedExecutableNodeIds,
        blockedNodeIds: frontierState.blockedFrontierNodeIds,
        nextLegalTransition: frontierState.nextLegalTransition,
        reasonCodes: frontierState.reasonCodes.slice(0, 40),
        schedulerPhase: "frontier_readiness",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
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
        schedulerFrontierState: frontierState,
      });
    } else {
      await this.options.onProgress?.({
        stage: "scheduler_canonical_frontier",
        status: frontierState.blockedFrontierNodeIds.length > 0 ? "needs_review" : "completed",
        reasonCodes: [...frontierState.reasonCodes, ...canonicalFrontierTool.reasonCodes].slice(
          0,
          80,
        ),
        currentPhase: "frontier_readiness",
        schedulerPhase: "frontier_readiness",
        schedulerToolId: "scheduler.evaluate_canonical_frontier",
        schedulerToolInvocationRefs: canonicalFrontierTool.refs,
        evidenceProducedRefs: canonicalFrontierTool.refs,
        currentObjective:
          "Evaluate whether any graph node is legally executable before expanding the graph.",
        nextDecisionNeeded: frontierState.nextLegalTransition,
        blockerSummary:
          frontierState.blockedFrontierNodeIds.length > 0
            ? `${frontierState.blockedFrontierNodeIds.length} frontier node(s) are blocked before execution.`
            : null,
        eli5Progress:
          frontierState.blockedFrontierNodeIds.length > 0
            ? "OpenClaw checked the graph frontier and found blocked nodes; it will repair the missing precondition instead of inventing unrelated work."
            : "OpenClaw checked the graph frontier and found no ready node yet.",
        heartbeatState: "canonical_frontier_evaluated",
        parallelFrontier: frontier.readback,
        schedulerFrontierState: frontierState,
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
    const openSuperstepTool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: "scheduler.open_superstep_frontier",
      idempotencyKey: `iteration:${input.iteration}:superstep-open:${selectedNodeIds.join("|")}`,
      inputRef: graphRef("graph", `${input.graphId}/superstep-frontier/${input.iteration}`),
      inputSummary: `Open superstep frontier ${input.iteration} with ${selectedNodeIds.length} selected node(s).`,
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
        ...openSuperstepTool.reasonCodes,
      ],
      currentPhase: "parallel_frontier_selected",
      schedulerPhase: "execution_in_progress",
      schedulerToolId: "scheduler.select_next_node",
      schedulerToolInvocationRefs: [...selectTool.refs, ...openSuperstepTool.refs],
      evidenceProducedRefs: [...selectTool.refs, ...openSuperstepTool.refs],
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
      schedulerFrontierState: frontierState,
    });
    const superstepId = `parallel-frontier-${input.iteration}-${selectedNodeIds
      .join("-")
      .slice(0, 80)}`;
    const settledResults = await Promise.allSettled(
      frontier.selectedNodes.map(async (node, branchIndex) => {
        const branchId = `${superstepId}:branch:${branchIndex + 1}:${node.nodeId}`;
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
        try {
          const prepared = await this.prepareNodeForExecution({
            graphId: input.graphId,
            nodeId: node.nodeId,
            iteration: input.iteration,
            missionLedger: input.missionLedger,
            decision,
            executedNodeIds: input.executedNodeIds,
            addedNodeIds: input.addedNodeIds,
            loopGuard: input.loopGuard,
          });
          decision.reasonCodes.push(...prepared.reasonCodes);
          const result = !prepared.proceed
            ? {
                status: prepared.status ?? "continue",
                reasonCodes: uniqueStrings([...decision.reasonCodes, ...prepared.reasonCodes]),
                missionLedger: prepared.missionLedger ?? input.missionLedger,
              }
            : await this.executeNode({
                graphId: input.graphId,
                nodeId: node.nodeId,
                iteration: input.iteration,
                missionLedger: input.missionLedger,
                decision,
                executedNodeIds: input.executedNodeIds,
                loopGuard: input.loopGuard,
              });
          const refreshedSnapshot = await this.options.graphs.readGraphSnapshot(input.graphId);
          const refreshedNode = refreshedSnapshot?.nodes.find(
            (candidate) => candidate.nodeId === node.nodeId,
          );
          const refreshedMetadata = jsonRecord(refreshedNode?.metadata ?? node.metadata);
          const outputArtifactRefs =
            "outputArtifactRefs" in result && Array.isArray(result.outputArtifactRefs)
              ? result.outputArtifactRefs
              : [];
          const branch = buildSuperstepBranchResult({
            superstepId,
            branchId,
            node,
            capabilityId: nodeCapabilityId(node),
            resultStatus: result.status,
            refreshedNodeStatus: refreshedNode?.nodeStatus ?? null,
            refreshedMetadata: refreshedMetadata as JsonValue,
            reasonCodes: result.reasonCodes,
            outputArtifactRefs,
            unrecoverable:
              "outputArtifactRefs" in result
                ? nodeFailureIsExplicitlyUnrecoverable(
                    result as RuntimeWorkGraphNodeExecutionResult,
                  )
                : false,
          });
          return {
            ...result,
            branch,
          };
        } catch (error) {
          const errorSummary = error instanceof Error ? error.message : String(error);
          const errorStack =
            error instanceof Error ? (error.stack ?? error.message) : String(error);
          const reasonCodes = [
            ...decision.reasonCodes,
            "parallel_frontier_branch_exception_isolated",
            `parallel_frontier_branch_node:${node.nodeId}`,
            `parallel_frontier_branch_error:${errorSummary.slice(0, 120)}`,
          ];
          await this.options.graphs.updateNodeStatus({
            nodeId: node.nodeId,
            nodeStatus: "needs_review",
            metadataPatch: {
              lastResultStatus: "needs_review",
              lastStatusReasonCodes: reasonCodes.slice(0, 60),
              parallelFrontierBranchFailureClass: "branch_exception",
              parallelFrontierBranchErrorPath: "parallel_frontier.branch.execute",
              parallelFrontierBranchErrorSummary: errorSummary.slice(0, 500),
              parallelFrontierBranchId: branchId,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          });
          await this.options.onNodeStatusChanged?.({
            graphId: input.graphId,
            node,
            nodeStatus: "needs_review",
            evidenceRefs: [],
            reasonCodes,
          });
          return {
            status: "needs_review" as const,
            reasonCodes,
            missionLedger: input.missionLedger,
            branch: buildSuperstepBranchResult({
              superstepId,
              branchId,
              node,
              capabilityId: nodeCapabilityId(node),
              resultStatus: "needs_review",
              refreshedNodeStatus: "needs_review",
              refreshedMetadata: {
                ...jsonRecord(node.metadata ?? null),
                parallelFrontierBranchFailureClass: "branch_exception",
                parallelFrontierBranchErrorPath: "parallel_frontier.branch.execute",
                parallelFrontierBranchErrorSummary: errorSummary.slice(0, 500),
                nodeReadinessRepairAction: "needs_operator_review",
              } as JsonValue,
              reasonCodes: [
                ...reasonCodes,
                `parallel_frontier_branch_stack_hash:${createHash("sha256")
                  .update(errorStack)
                  .digest("hex")
                  .slice(0, 16)}`,
              ],
              failureClass: "branch_exception",
              errorPath: "parallel_frontier.branch.execute",
              errorSummary: errorSummary.slice(0, 500),
              repairAction: "needs_operator_review",
            }),
          };
        }
      }),
    );
    const results = settledResults.map((settled, index) => {
      if (settled.status === "fulfilled") {
        return settled.value;
      }
      const node = frontier.selectedNodes[index];
      const errorSummary =
        settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
      const fallbackNode =
        node ??
        ({
          nodeId: "unknown",
          graphId: input.graphId,
          nodeKind: "orchestrator_plan",
          assignedRole: "scheduler",
          modelOrWorkerRef: null,
          runtimeJobId: null,
          humanTaskId: null,
          nodeStatus: "needs_review",
          inputHandoffRefs: [],
          outputArtifactRefs: [],
          budgetUsage: null,
          metadata: {
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          startedAt: null,
          completedAt: null,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        } satisfies TeamGraphNode);
      return {
        status: "needs_review" as const,
        reasonCodes: [
          "parallel_frontier_branch_promise_rejection_isolated",
          `parallel_frontier_branch_node:${node?.nodeId ?? "unknown"}`,
          `parallel_frontier_branch_error:${errorSummary.slice(0, 120)}`,
        ],
        missionLedger: input.missionLedger,
        branch: buildSuperstepBranchResult({
          superstepId,
          branchId: `${superstepId}:branch:${index + 1}:${node?.nodeId ?? "unknown"}`,
          node: fallbackNode,
          capabilityId: node ? nodeCapabilityId(node) : null,
          resultStatus: "needs_review",
          refreshedNodeStatus: "needs_review",
          refreshedMetadata: {
            ...jsonRecord(node?.metadata ?? null),
            parallelFrontierBranchFailureClass: "branch_promise_rejection",
            parallelFrontierBranchErrorPath: "parallel_frontier.branch.promise",
            parallelFrontierBranchErrorSummary: errorSummary.slice(0, 500),
            nodeReadinessRepairAction: "needs_operator_review",
          } as JsonValue,
          reasonCodes: ["parallel_frontier_branch_promise_rejection_isolated"],
          failureClass: "branch_promise_rejection",
          errorPath: "parallel_frontier.branch.promise",
          errorSummary: errorSummary.slice(0, 500),
          repairAction: "needs_operator_review",
        }),
      };
    });
    const branchResults = results.map((result) => result.branch);
    const branchResultTool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: "scheduler.record_superstep_branch_result",
      idempotencyKey: `iteration:${input.iteration}:superstep-branch-results:${selectedNodeIds.join("|")}`,
      inputRef: graphRef("graph", `${input.graphId}/superstep-branch-results/${input.iteration}`),
      inputSummary: `Record ${branchResults.length} canonical superstep branch result(s).`,
      metadata: {
        selectedNodeIds,
        branchResults,
        schedulerPhase: "parallel_frontier_completed",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    const joinSuperstepTool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: "scheduler.join_superstep_frontier",
      idempotencyKey: `iteration:${input.iteration}:superstep-join:${selectedNodeIds.join("|")}`,
      inputRef: graphRef("graph", `${input.graphId}/superstep-join/${input.iteration}`),
      inputSummary: `Join superstep frontier ${input.iteration} after branch results were recorded.`,
      metadata: {
        selectedNodeIds,
        branchResultStatuses: branchResults.map((branch) => branch.status).slice(0, 40),
        branchResultNodeIds: branchResults.map((branch) => branch.nodeId).slice(0, 40),
        schedulerPhase: "parallel_frontier_completed",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    const reasonCodes = [
      ...selectTool.reasonCodes,
      ...openSuperstepTool.reasonCodes,
      ...branchResultTool.reasonCodes,
      ...joinSuperstepTool.reasonCodes,
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
    const postFrontierSnapshot =
      (await this.options.graphs.readGraphSnapshot(input.graphId)) ?? input.snapshot;
    const systemicFailure = systemicParallelFrontierFailure({
      snapshot: postFrontierSnapshot,
      branchResults,
    });
    const systemicFailureReasonCodes = systemicFailure
      ? [
          "parallel_frontier_systemic_branch_failure_detected",
          `parallel_frontier_systemic_failure_class:${systemicFailure.failureClass}`,
          `parallel_frontier_systemic_failure_signature:${systemicFailure.signatureHash}`,
          `parallel_frontier_systemic_failure_nodes:${systemicFailure.nodeIds.join(",")}`,
        ]
      : [];
    await this.options.onProgress?.({
      stage: "scheduler_parallel_frontier",
      status: results.some((result) => result.status === "failed")
        ? "failed"
        : results.some((result) => result.status === "waiting_for_human")
          ? "waiting_for_human"
          : results.some((result) => result.status === "needs_review")
            ? "needs_review"
            : "completed",
      reasonCodes: [...reasonCodes, ...systemicFailureReasonCodes],
      currentPhase: "parallel_frontier_completed",
      schedulerPhase: "execution_in_progress",
      schedulerToolId: "scheduler.join_superstep_frontier",
      schedulerToolInvocationRefs: [
        ...selectTool.refs,
        ...openSuperstepTool.refs,
        ...branchResultTool.refs,
        ...joinSuperstepTool.refs,
      ],
      evidenceProducedRefs: [
        ...selectTool.refs,
        ...openSuperstepTool.refs,
        ...branchResultTool.refs,
        ...joinSuperstepTool.refs,
      ],
      currentObjective: `Completed parallel frontier for ${selectedNodeIds.length} graph node(s).`,
      nextDecisionNeeded: systemicFailure ? "operator_review" : "orchestrator_decision",
      eli5Progress: systemicFailure
        ? "Multiple sibling branches hit the same runtime failure, so OpenClaw stopped the frontier and surfaced one root cause instead of repeating the same failed work."
        : "OpenClaw finished the ready child-node frontier and will now let the scheduler/orchestrator evaluate the next graph step.",
      heartbeatState: "parallel_frontier_completed",
      parallelFrontier: buildParallelFrontierReadback({
        snapshot: postFrontierSnapshot,
        currentSuperstep: input.iteration,
        maxParallelNodeExecutions: this.maxParallelNodeExecutions,
        selectedNodes: frontier.selectedNodes,
        skippedReasonCodes: frontier.skippedReasonCodes,
        rawRunnableNodeIds: frontier.rawRunnableNodeIds,
        providerConcurrencyBudgets: frontier.readback.providerConcurrencyBudgets,
        branchResults,
      }),
      schedulerFrontierState: buildSchedulerFrontierState({
        graphId: input.graphId,
        iteration: input.iteration,
        snapshot: postFrontierSnapshot,
        frontier: selectRunnableParallelFrontier({
          snapshot: postFrontierSnapshot,
          executors: this.options.executors,
          maxParallelNodeExecutions: this.maxParallelNodeExecutions,
        }),
        executors: this.options.executors,
        missionLedger: mergedMissionLedger,
        requireFreshContextSnapshotsForWorkerExecution:
          this.options.requireFreshContextSnapshotsForWorkerExecution === true,
        requireNodeExecutionPacketForWorkerExecution:
          this.options.requireNodeExecutionPacketForWorkerExecution === true,
      }),
      blockerSummary: systemicFailure
        ? `Repeated parallel frontier branch failure across ${systemicFailure.nodeIds.length} sibling node(s): ${
            systemicFailure.errorSummary ??
            systemicFailure.errorPath ??
            systemicFailure.failureClass
          }`
        : undefined,
    });
    if (results.some((result) => result.status === "waiting_for_human")) {
      return { status: "waiting_for_human", reasonCodes, missionLedger: mergedMissionLedger };
    }
    if (results.some((result) => result.status === "failed" || result.status === "needs_review")) {
      if (systemicFailure) {
        return {
          status: "needs_review",
          reasonCodes: [
            ...reasonCodes,
            ...systemicFailureReasonCodes,
            "parallel_frontier_completed_siblings_preserved",
            "parallel_frontier_systemic_failure_halted_for_root_cause",
          ],
          missionLedger: mergedMissionLedger,
        };
      }
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

  private async recordTransitionReadiness(input: {
    graphId: string;
    iteration: number;
    node: TeamGraphNode;
    readiness: RuntimeNodeTransitionReadiness;
    decisionId?: string | null;
    idempotencySuffix: string;
  }): Promise<{ refs: string[]; reasonCodes: string[] }> {
    const tool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: "scheduler.evaluate_frontier_readiness",
      idempotencyKey: `iteration:${input.iteration}:node:${input.node.nodeId}:transition-readiness:${input.idempotencySuffix}`,
      inputRef: graphRef("node", input.node.nodeId),
      inputSummary: `Evaluate lifecycle/resource readiness for node ${input.node.nodeId} before opening the executable frontier.`,
      nodeId: input.node.nodeId,
      roleRef: input.node.assignedRole,
      modelRef: input.node.modelOrWorkerRef,
      metadata: {
        decisionId: input.decisionId ?? null,
        transitionReadiness: input.readiness as unknown as JsonValue,
        nodeLifecycleState: input.readiness.lifecycleState,
        nodeClass: input.readiness.nodeClass,
        nodeExecutable: input.readiness.executable,
        dependencyStatus: input.readiness.dependencyStatus,
        contextStatus: input.readiness.contextStatus,
        resourceStatus: input.readiness.resourceStatus,
        validationStatus: input.readiness.validationStatus,
        authorityStatus: input.readiness.authorityStatus,
        storageStatus: input.readiness.storageStatus,
        nextAllowedTransitions: input.readiness.nextAllowedTransitions,
        blockerSummary: input.readiness.blockerSummary,
        schedulerPhase: "node_transition_readiness",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    await this.options.onProgress?.({
      stage: "scheduler_node_transition_readiness",
      status: input.readiness.executable ? "completed" : "needs_review",
      nodeId: input.node.nodeId,
      roleId: input.node.assignedRole,
      reasonCodes: [...input.readiness.reasonCodes, ...tool.reasonCodes],
      currentObjective:
        typeof jsonRecord(input.node.metadata).exactObjective === "string"
          ? (jsonRecord(input.node.metadata).exactObjective as string)
          : null,
      activeNodeKind: input.node.nodeKind,
      capabilityId: input.readiness.capabilityId,
      modelRef: input.node.modelOrWorkerRef,
      targetRefs: nodeSchedulingTargetRefs(input.node),
      inputHandoffRefs: input.node.inputHandoffRefs,
      currentPhase: input.readiness.lifecycleState,
      validationState: input.readiness.executable
        ? "node_transition_executable"
        : "node_transition_blocked",
      schedulerPhase: "node_transition_readiness",
      schedulerToolId: "scheduler.evaluate_frontier_readiness",
      schedulerToolInvocationRefs: tool.refs,
      evidenceProducedRefs: tool.refs,
      nextDecisionNeeded:
        input.readiness.nextAllowedTransitions[0] ??
        (input.readiness.executable ? "execute_node" : "needs_review"),
      blockerSummary: input.readiness.blockerSummary,
      eli5Progress: input.readiness.executable
        ? "OpenClaw verified this graph node can enter the executable frontier."
        : "OpenClaw stopped before worker execution because this graph node is still missing a dependency, context handoff, or resource packet.",
      nodeReadinessState: input.readiness as unknown as JsonValue,
      nodeReadinessStateRef: `runtime-work-graph://node-transition-readiness/${input.graphId}/${input.node.nodeId}/${input.idempotencySuffix}`,
      nodeReadinessPhase: input.readiness.lifecycleState,
      nodeReadinessStatus: input.readiness.executable ? "ready" : "blocked",
      nodeReadinessRepairAction:
        input.readiness.nextAllowedTransitions[0] ?? "needs_operator_review",
      nodeReadinessNextAllowedTransitions: input.readiness.nextAllowedTransitions,
      nodeReadinessContextStatus: input.readiness.contextStatus,
      nodeReadinessValidationStatus: input.readiness.validationStatus,
      nodeReadinessAuthorityStatus: input.readiness.authorityStatus,
      nodeReadinessEvidenceStatus: input.readiness.resourceStatus,
    });
    return tool;
  }

  private async blockNodeForTransitionPrecondition(input: {
    graphId: string;
    iteration: number;
    node: TeamGraphNode;
    readiness: RuntimeNodeTransitionReadiness;
    decisionId?: string | null;
    terminalStatus?: "continue" | "needs_review";
  }): Promise<{
    status: "continue" | "needs_review";
    reasonCodes: string[];
    missionLedger?: MissionContractLedger | null;
  }> {
    const blockTool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: "scheduler.block_node_for_precondition",
      idempotencyKey: `iteration:${input.iteration}:node:${input.node.nodeId}:precondition-block:${input.readiness.lifecycleState}`,
      inputRef: graphRef("node", input.node.nodeId),
      inputSummary:
        input.readiness.blockerSummary ??
        `Block node ${input.node.nodeId} until transition preconditions are satisfied.`,
      nodeId: input.node.nodeId,
      roleRef: input.node.assignedRole,
      modelRef: input.node.modelOrWorkerRef,
      metadata: {
        decisionId: input.decisionId ?? null,
        transitionReadiness: input.readiness as unknown as JsonValue,
        schedulerPhase: "node_transition_readiness",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    if (input.terminalStatus === "needs_review") {
      await this.options.graphs.updateNodeStatus({
        nodeId: input.node.nodeId,
        nodeStatus: "needs_review",
        metadataPatch: {
          lastResultStatus: "needs_review",
          lastStatusReasonCodes: [...input.readiness.reasonCodes, ...blockTool.reasonCodes].slice(
            0,
            60,
          ),
          nodeLifecycleState: input.readiness.lifecycleState,
          nodeReadinessStateRef: `runtime-work-graph://node-transition-readiness/${input.graphId}/${input.node.nodeId}/precondition-block`,
          nodeReadinessPhase: input.readiness.lifecycleState,
          nodeReadinessStatus: "blocked",
          nodeReadinessRepairAction:
            input.readiness.nextAllowedTransitions[0] ?? "needs_operator_review",
          nodeReadinessNextAllowedTransitions: input.readiness.nextAllowedTransitions,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
    }
    return {
      status: input.terminalStatus ?? "continue",
      reasonCodes: uniqueStrings([...input.readiness.reasonCodes, ...blockTool.reasonCodes]),
    };
  }

  private async createTransitionPrerequisites(input: {
    graphId: string;
    iteration: number;
    node: TeamGraphNode;
    readiness: RuntimeNodeTransitionReadiness;
    missionLedger: MissionContractLedger | null;
    executedNodeIds: string[];
    addedNodeIds: string[];
    loopGuard: RuntimeWorkGraphLoopGuard;
  }): Promise<{
    status: "continue" | "succeeded" | "needs_review" | "failed" | "waiting_for_human";
    reasonCodes: string[];
    missionLedger?: MissionContractLedger | null;
  } | null> {
    if (input.readiness.prerequisiteTransition !== "node_scoped_context_supply") {
      return null;
    }
    const snapshot = await this.options.graphs.readGraphSnapshot(input.graphId);
    if (!snapshot) {
      return {
        status: "needs_review",
        reasonCodes: ["runtime_work_graph_not_found_for_transition_prerequisite"],
        missionLedger: input.missionLedger,
      };
    }
    const decision = deterministicNodeScopedContextSupplyDecision({
      graphId: input.graphId,
      iteration: input.iteration,
      snapshotSummary: summarizeSnapshot(snapshot),
      missionLedger: input.missionLedger,
      commitmentWorkPackets: this.options.commitmentWorkPackets ?? [],
      capabilityManifest: this.capabilityManifest,
    });
    if (!decision) {
      return await this.blockNodeForTransitionPrecondition({
        graphId: input.graphId,
        iteration: input.iteration,
        node: input.node,
        readiness: input.readiness,
        terminalStatus: "needs_review",
      });
    }
    const createTool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: "scheduler.create_prerequisite_node",
      idempotencyKey: `iteration:${input.iteration}:node:${input.node.nodeId}:create-prerequisite:${decision.decisionId}`,
      inputRef: graphRef("node", input.node.nodeId),
      inputSummary:
        "Create runtime-owned prerequisite node(s) because a work-intent node lacks accepted context supply.",
      nodeId: input.node.nodeId,
      roleRef: input.node.assignedRole,
      modelRef: input.node.modelOrWorkerRef,
      metadata: {
        targetNodeId: input.node.nodeId,
        prerequisiteNodeIds: (decision.newNodes ?? []).map((node) => node.nodeId).slice(0, 16),
        transitionReadiness: input.readiness as unknown as JsonValue,
        schedulerPhase: "node_transition_readiness",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    const linkTool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: "scheduler.link_prerequisite_to_target",
      idempotencyKey: `iteration:${input.iteration}:node:${input.node.nodeId}:link-prerequisite:${decision.decisionId}`,
      inputRef: graphRef("node", input.node.nodeId),
      inputSummary:
        "Link runtime-owned prerequisite context node(s) to the target work-intent node.",
      nodeId: input.node.nodeId,
      roleRef: input.node.assignedRole,
      modelRef: input.node.modelOrWorkerRef,
      metadata: {
        targetNodeId: input.node.nodeId,
        prerequisiteEdgeIds: (decision.newEdges ?? [])
          .map((edge, index) => edge.edgeId ?? `edge-${index + 1}`)
          .slice(0, 16),
        transitionReadiness: input.readiness as unknown as JsonValue,
        schedulerPhase: "node_transition_readiness",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    const brokerRequestRefs = uniqueStrings(
      (decision.newNodes ?? []).flatMap((node) => {
        const metadata = jsonRecord(node.metadata ?? null);
        return typeof metadata.contextBrokerRequestRef === "string"
          ? [metadata.contextBrokerRequestRef]
          : [];
      }),
    ).slice(0, 16);
    const brokerDispatchTool =
      brokerRequestRefs.length > 0
        ? await this.recordSchedulerTool({
            graphId: input.graphId,
            iteration: input.iteration,
            toolId: "context_broker.dispatch_context_scout",
            idempotencyKey: `iteration:${input.iteration}:node:${input.node.nodeId}:dispatch-context-scout:${decision.decisionId}`,
            inputRef: brokerRequestRefs[0] ?? graphRef("node", input.node.nodeId),
            inputSummary:
              "Dispatch runtime-owned context scout prerequisite(s) for branch-local context broker request(s).",
            nodeId: input.node.nodeId,
            roleRef: input.node.assignedRole,
            modelRef: input.node.modelOrWorkerRef,
            metadata: {
              targetNodeId: input.node.nodeId,
              contextBrokerRequestRefs: brokerRequestRefs,
              prerequisiteNodeIds: (decision.newNodes ?? [])
                .map((node) => node.nodeId)
                .slice(0, 16),
              schedulerPhase: "node_transition_readiness",
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              rawToolLogStored: false,
            } satisfies JsonValue,
          })
        : null;
    if (brokerDispatchTool) {
      await this.options.onProgress?.({
        stage: "context_broker",
        status: "completed",
        nodeId: input.node.nodeId,
        roleId: input.node.assignedRole,
        reasonCodes: brokerDispatchTool.reasonCodes,
        currentObjective:
          typeof jsonRecord(input.node.metadata).exactObjective === "string"
            ? (jsonRecord(input.node.metadata).exactObjective as string)
            : "Dispatch node-scoped context scout prerequisites.",
        activeNodeKind: input.node.nodeKind,
        capabilityId: nodeCapabilityId(input.node),
        modelRef: input.node.modelOrWorkerRef,
        targetRefs: nodeSchedulingTargetRefs(input.node),
        inputHandoffRefs: input.node.inputHandoffRefs,
        currentPhase: "context_broker_dispatch_context_scout",
        validationState: "context_required",
        evidenceProducedRefs: brokerRequestRefs,
        commitmentIdsAdvanced: jsonStringArray(
          jsonRecord(input.node.metadata).commitmentIdsAdvanced,
        ),
        nextDecisionNeeded: "run_context_scout_prerequisites",
        blockerSummary:
          "Node-scoped context is required before this consumer can be materialized or executed.",
        schedulerPhase: "context_broker_dispatch",
        schedulerToolId: "context_broker.dispatch_context_scout",
        schedulerToolInvocationRefs: brokerDispatchTool.refs,
        contextBrokerRequestRefs: brokerRequestRefs,
        contextBrokerStatuses: ["context_scout_required"],
        contextBrokerConsumerNodeIds: [input.node.nodeId],
        contextBrokerNextTransition: "dispatch_context_scout",
      });
    }
    const applied = await this.applyDecision({
      graphId: input.graphId,
      decision,
      iteration: input.iteration,
      missionLedger: input.missionLedger,
      executedNodeIds: input.executedNodeIds,
      addedNodeIds: input.addedNodeIds,
      loopGuard: input.loopGuard,
    });
    return {
      ...applied,
      reasonCodes: uniqueStrings([
        ...input.readiness.reasonCodes,
        ...createTool.reasonCodes,
        ...linkTool.reasonCodes,
        ...(brokerDispatchTool?.reasonCodes ?? []),
        ...applied.reasonCodes,
        "runtime_node_transition_prerequisite_created_before_execution",
      ]),
    };
  }

  private async prepareNodeForExecution(input: {
    graphId: string;
    nodeId: string;
    iteration: number;
    missionLedger: MissionContractLedger | null;
    decision: OrchestratorGraphDecision;
    executedNodeIds: string[];
    addedNodeIds: string[];
    loopGuard: RuntimeWorkGraphLoopGuard;
  }): Promise<{
    proceed: boolean;
    status?: "continue" | "succeeded" | "needs_review" | "failed" | "waiting_for_human";
    reasonCodes: string[];
    missionLedger?: MissionContractLedger | null;
  }> {
    const snapshot = await this.options.graphs.readGraphSnapshot(input.graphId);
    const node = snapshot?.nodes.find((candidate) => candidate.nodeId === input.nodeId);
    if (!snapshot || !node) {
      return {
        proceed: false,
        status: "needs_review",
        reasonCodes: ["scheduler_node_not_found"],
        missionLedger: input.missionLedger,
      };
    }
    const readiness = evaluateRuntimeNodeTransitionReadiness({
      snapshot,
      node,
      executors: this.options.executors,
      requireFreshContextSnapshotsForWorkerExecution:
        this.options.requireFreshContextSnapshotsForWorkerExecution === true,
      requireNodeExecutionPacketForWorkerExecution:
        this.options.requireNodeExecutionPacketForWorkerExecution === true,
    });
    const readinessTool = await this.recordTransitionReadiness({
      graphId: input.graphId,
      iteration: input.iteration,
      node,
      readiness,
      decisionId: input.decision.decisionId,
      idempotencySuffix: "pre-open",
    });
    if (readiness.prerequisiteTransition) {
      const prerequisite = await this.createTransitionPrerequisites({
        graphId: input.graphId,
        iteration: input.iteration,
        node,
        readiness,
        missionLedger: input.missionLedger,
        executedNodeIds: input.executedNodeIds,
        addedNodeIds: input.addedNodeIds,
        loopGuard: input.loopGuard,
      });
      if (prerequisite) {
        return {
          proceed: false,
          status: prerequisite.status,
          reasonCodes: uniqueStrings([...readinessTool.reasonCodes, ...prerequisite.reasonCodes]),
          missionLedger: prerequisite.missionLedger ?? input.missionLedger,
        };
      }
    }
    if (
      !readiness.executable &&
      readiness.lifecycleState !== "resources_required" &&
      readiness.lifecycleState !== "resource_materialization_in_progress"
    ) {
      const blocked = await this.blockNodeForTransitionPrecondition({
        graphId: input.graphId,
        iteration: input.iteration,
        node,
        readiness,
        decisionId: input.decision.decisionId,
        terminalStatus: readiness.lifecycleState === "needs_review" ? "needs_review" : "continue",
      });
      return {
        proceed: false,
        status: blocked.status,
        reasonCodes: uniqueStrings([...readinessTool.reasonCodes, ...blocked.reasonCodes]),
        missionLedger: blocked.missionLedger ?? input.missionLedger,
      };
    }
    if (readiness.lifecycleState === "resources_required") {
      const transitionTool = await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "scheduler.record_node_transition",
        idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:resource-materialization-start`,
        inputRef: graphRef("node", node.nodeId),
        inputSummary: `Transition node ${node.nodeId} from work intent to resource materialization before worker execution.`,
        nodeId: node.nodeId,
        roleRef: node.assignedRole,
        modelRef: node.modelOrWorkerRef,
        metadata: {
          decisionId: input.decision.decisionId,
          fromLifecycleState: readiness.lifecycleState,
          toLifecycleState: "resource_materialization_in_progress",
          transitionReadiness: readiness as unknown as JsonValue,
          schedulerPhase: "node_transition_readiness",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      input.decision.reasonCodes.push(...transitionTool.reasonCodes);
    }
    const stopped = await this.maybeStopBeforeNodeExecution({
      graphId: input.graphId,
      nodeId: input.nodeId,
      iteration: input.iteration,
      missionLedger: input.missionLedger,
      decision: input.decision,
    });
    if (stopped) {
      return {
        proceed: false,
        status: stopped.status,
        reasonCodes: uniqueStrings([...readinessTool.reasonCodes, ...stopped.reasonCodes]),
        missionLedger: stopped.missionLedger ?? input.missionLedger,
      };
    }
    const refreshed = await this.options.graphs.readGraphSnapshot(input.graphId);
    const refreshedNode = refreshed?.nodes.find((candidate) => candidate.nodeId === input.nodeId);
    const finalReadiness =
      refreshed && refreshedNode
        ? evaluateRuntimeNodeTransitionReadiness({
            snapshot: refreshed,
            node: refreshedNode,
            executors: this.options.executors,
            requireFreshContextSnapshotsForWorkerExecution:
              this.options.requireFreshContextSnapshotsForWorkerExecution === true,
            requireNodeExecutionPacketForWorkerExecution:
              this.options.requireNodeExecutionPacketForWorkerExecution === true,
          })
        : readiness;
    if (refreshedNode) {
      await this.recordTransitionReadiness({
        graphId: input.graphId,
        iteration: input.iteration,
        node: refreshedNode,
        readiness: finalReadiness,
        decisionId: input.decision.decisionId,
        idempotencySuffix: "post-materialization",
      });
    }
    if (
      !finalReadiness.executable &&
      finalReadiness.lifecycleState !== "resources_required" &&
      refreshedNode
    ) {
      const blocked = await this.blockNodeForTransitionPrecondition({
        graphId: input.graphId,
        iteration: input.iteration,
        node: refreshedNode,
        readiness: finalReadiness,
        decisionId: input.decision.decisionId,
        terminalStatus: "needs_review",
      });
      return {
        proceed: false,
        status: blocked.status,
        reasonCodes: uniqueStrings([...readinessTool.reasonCodes, ...blocked.reasonCodes]),
        missionLedger: blocked.missionLedger ?? input.missionLedger,
      };
    }
    const promoteTool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: "scheduler.promote_work_intent_to_executable",
      idempotencyKey: `iteration:${input.iteration}:node:${input.nodeId}:promote-executable`,
      inputRef: graphRef("node", input.nodeId),
      inputSummary: `Promote node ${input.nodeId} into the executable frontier after transition readiness checks.`,
      nodeId: input.nodeId,
      roleRef: refreshedNode?.assignedRole ?? node.assignedRole,
      modelRef: refreshedNode?.modelOrWorkerRef ?? node.modelOrWorkerRef,
      metadata: {
        decisionId: input.decision.decisionId,
        transitionReadiness: finalReadiness as unknown as JsonValue,
        schedulerPhase: "node_transition_readiness",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    const openTool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: "scheduler.open_executable_frontier",
      idempotencyKey: `iteration:${input.iteration}:node:${input.nodeId}:open-executable-frontier`,
      inputRef: graphRef("node", input.nodeId),
      inputSummary: `Open executable frontier for node ${input.nodeId}.`,
      nodeId: input.nodeId,
      roleRef: refreshedNode?.assignedRole ?? node.assignedRole,
      modelRef: refreshedNode?.modelOrWorkerRef ?? node.modelOrWorkerRef,
      metadata: {
        decisionId: input.decision.decisionId,
        transitionReadiness: finalReadiness as unknown as JsonValue,
        schedulerPhase: "node_transition_readiness",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    return {
      proceed: true,
      reasonCodes: uniqueStrings([
        ...readinessTool.reasonCodes,
        ...promoteTool.reasonCodes,
        ...openTool.reasonCodes,
        "runtime_node_transition_executable_frontier_opened",
      ]),
      missionLedger: input.missionLedger,
    };
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
      const expansionSnapshot = await this.options.graphs.readGraphSnapshot(graphId);
      const expansionSnapshotSummary = expansionSnapshot
        ? summarizeSnapshot(expansionSnapshot)
        : ({
            workflowId: "unknown",
            graphStatus: "missing",
            nodeSummaries: [],
            edgeSummaries: [],
            edgeCount: 0,
            humanTaskCount: 0,
            latestCheckpointKinds: [],
          } satisfies RuntimeWorkGraphSchedulerSnapshotSummary);
      const expansionFrontier = expansionSnapshot
        ? selectRunnableParallelFrontier({
            snapshot: expansionSnapshot,
            executors: this.options.executors,
            maxParallelNodeExecutions: this.maxParallelNodeExecutions,
          })
        : null;
      const expansionFrontierState =
        expansionSnapshot && expansionFrontier
          ? buildSchedulerFrontierState({
              graphId,
              iteration: input.iteration,
              snapshot: expansionSnapshot,
              frontier: expansionFrontier,
              executors: this.options.executors,
              missionLedger: input.missionLedger,
              requireFreshContextSnapshotsForWorkerExecution:
                this.options.requireFreshContextSnapshotsForWorkerExecution === true,
              requireNodeExecutionPacketForWorkerExecution:
                this.options.requireNodeExecutionPacketForWorkerExecution === true,
            })
          : null;
      const expansionAdmission = evaluateRuntimeWorkGraphExpansionAdmission({
        graphId,
        iteration: input.iteration,
        decision,
        snapshotSummary: expansionSnapshotSummary,
        readyFrontierNodeIds:
          expansionFrontierState?.selectedExecutableNodeIds ??
          expansionFrontier?.selectedNodes.map((node) => node.nodeId) ??
          [],
        pendingContextRequestRefs: expansionSnapshot
          ? pendingContextBrokerRequestRefs(expansionSnapshot)
          : [],
        activeImplementationOrResourceNodeIds: expansionSnapshot
          ? activeImplementationOrResourceBranchNodeIds(expansionSnapshot)
          : [],
        policy: this.expansionAdmissionPolicy,
      });
      const expansionAdmissionSummary = summarizeExpansionAdmissionDecision(
        expansionAdmission.decision,
      );
      const expansionTool = await this.recordSchedulerTool({
        graphId,
        iteration: input.iteration,
        toolId: "scheduler.evaluate_expansion_admission",
        idempotencyKey: `iteration:${input.iteration}:decision:${decision.decisionId}:expansion-admission:${expansionAdmission.decision.decisionRef.split("/").at(-1)}`,
        inputRef: graphRef("orchestrator-decision", decision.decisionId),
        inputHash: createHash("sha256")
          .update(JSON.stringify(expansionAdmissionSummary))
          .digest("hex"),
        inputSummary:
          "Evaluate whether the proposed graph expansion should persist now, page into a bounded frontier, or defer because executable work is already ready.",
        metadata: {
          decisionId: decision.decisionId,
          decisionKind: decision.decisionKind,
          expansionAdmissionDecision: expansionAdmissionSummary,
          schedulerFrontierState: expansionFrontierState as unknown as JsonValue,
          schedulerPhase: "expansion_admission",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      decision.reasonCodes.push(
        ...expansionAdmission.decision.reasonCodes,
        ...expansionTool.reasonCodes,
      );
      await this.options.onProgress?.({
        stage: "scheduler_expansion_admission",
        status:
          expansionAdmission.decision.status === "rejected_budget_exceeded" ||
          expansionAdmission.decision.status === "needs_review" ||
          expansionAdmission.decision.status === "halt_no_progress"
            ? "needs_review"
            : "completed",
        reasonCodes: uniqueStrings([
          ...expansionAdmission.decision.reasonCodes,
          ...expansionTool.reasonCodes,
        ]),
        currentPhase: "expansion_admission_evaluated",
        schedulerPhase: "expansion_admission",
        schedulerToolId: "scheduler.evaluate_expansion_admission",
        schedulerToolInvocationRefs: expansionTool.refs,
        evidenceProducedRefs: expansionTool.refs,
        nextDecisionNeeded: expansionAdmission.decision.nextTransition,
        blockerSummary:
          expansionAdmission.decision.status === "rejected_budget_exceeded" ||
          expansionAdmission.decision.status === "needs_review"
            ? "The proposed graph expansion exceeds runtime admission budgets and needs scheduler repair or owner review."
            : expansionAdmission.decision.status === "deferred_due_to_ready_frontier"
              ? "Executable frontier work is already ready, so runtime deferred this extra expansion instead of growing the graph first."
              : null,
        eli5Progress:
          expansionAdmission.decision.status === "accepted_paged"
            ? "OpenClaw accepted the graph expansion in a bounded page so the graph does not grow too much at once."
            : expansionAdmission.decision.status === "deferred_due_to_ready_frontier"
              ? "OpenClaw found work that is ready to run and delayed extra graph growth."
              : expansionAdmission.decision.status === "accepted"
                ? "OpenClaw checked the proposed graph growth and it fits the runtime limits."
                : "OpenClaw stopped because the proposed graph growth is too large or unsafe to persist.",
        heartbeatState: `expansion_admission_${expansionAdmission.decision.status}`,
        schedulerFrontierState: expansionFrontierState,
        expansionAdmissionDecision: expansionAdmissionSummary,
        expansionAdmissionDecisionRef: expansionAdmission.decision.decisionRef,
        expansionAdmissionPolicyRef: expansionAdmission.decision.policyRef,
        expansionAdmissionStatus: expansionAdmission.decision.status,
        expansionAdmissionOriginalNodeCount: expansionAdmission.decision.originalNodeCount,
        expansionAdmissionOriginalEdgeCount: expansionAdmission.decision.originalEdgeCount,
        expansionAdmissionAdmittedNodeCount: expansionAdmission.decision.admittedNodeCount,
        expansionAdmissionAdmittedEdgeCount: expansionAdmission.decision.admittedEdgeCount,
        expansionAdmissionDeferredNodeCount: expansionAdmission.decision.deferredNodeCount,
        expansionAdmissionDeferredEdgeCount: expansionAdmission.decision.deferredEdgeCount,
        expansionAdmissionReadyFrontierNodeIds: expansionAdmission.decision.readyFrontierNodeIds,
        expansionAdmissionAdmittedNodeIds: expansionAdmission.decision.admittedNodeIds,
        expansionAdmissionDeferredNodeIds: expansionAdmission.decision.deferredNodeIds,
        expansionAdmissionNextTransition: expansionAdmission.decision.nextTransition,
        expansionAdmissionPrerequisiteCritical: expansionAdmission.decision.prerequisiteCritical,
        expansionAdmissionReasonCodes: expansionAdmission.decision.reasonCodes,
      });
      if (expansionAdmission.decision.status === "deferred_due_to_ready_frontier") {
        await this.options.graphs.recordCheckpoint({
          graphId,
          checkpointKind: "scheduler_expansion_deferred_ready_frontier",
          stateSummary:
            "Scheduler deferred graph expansion because executable frontier work was already ready and the expansion was not structurally prerequisite-critical.",
          artifactRefs: [
            graphRef("orchestrator-decision", decision.decisionId),
            ...expansionTool.refs,
          ],
        });
        return {
          status: "continue",
          reasonCodes: uniqueStrings([
            ...decision.reasonCodes,
            "scheduler_expansion_deferred_ready_frontier",
          ]),
          missionLedger: input.missionLedger,
        };
      }
      if (
        expansionAdmission.decision.status === "rejected_budget_exceeded" ||
        expansionAdmission.decision.status === "needs_review" ||
        expansionAdmission.decision.status === "halt_no_progress"
      ) {
        await this.options.graphs.recordCheckpoint({
          graphId,
          checkpointKind: "scheduler_expansion_admission_needs_review",
          stateSummary:
            "Scheduler rejected graph expansion before persistence because runtime admission policy could not safely accept the proposed page.",
          artifactRefs: [
            graphRef("orchestrator-decision", decision.decisionId),
            ...expansionTool.refs,
          ],
        });
        return {
          status: "needs_review",
          reasonCodes: uniqueStrings([
            ...decision.reasonCodes,
            "scheduler_expansion_admission_needs_review",
          ]),
          missionLedger: input.missionLedger,
        };
      }
      if (expansionAdmission.decision.status === "accepted_paged") {
        decision.newNodes = expansionAdmission.admittedNodes;
        decision.newEdges = expansionAdmission.admittedEdges;
        decision.reasonCodes.push("scheduler_expansion_admitted_paged_before_persistence");
      }
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
          toolId: "scheduler.compile_work_intents",
          summary:
            "Compile model-authored semantic work units into non-runnable WorkIntent control-plane contracts.",
        },
        {
          toolId: "scheduler.validate_work_intent_capability",
          summary:
            "Validate each WorkIntent execution intent against the runtime capability manifest before executable promotion.",
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
          toolId: "scheduler.accept_work_intent_graph",
          summary: "Accept the WorkIntent graph as canonical non-runnable control-plane state.",
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
      const persistenceOutcome = await this.addNodes({
        graphId,
        nodes: decision.newNodes,
        edges: decision.newEdges ?? [],
        addedNodeIds: input.addedNodeIds,
        iteration: input.iteration,
      });
      if (
        persistenceOutcome.createdNodeIds.length === 0 &&
        persistenceOutcome.createdEdgeIds.length === 0 &&
        (persistenceOutcome.reusedNodeIds.length > 0 || persistenceOutcome.reusedEdgeIds.length > 0)
      ) {
        const refreshedSnapshot = await this.options.graphs.readGraphSnapshot(graphId);
        if (refreshedSnapshot) {
          const frontier = selectRunnableParallelFrontier({
            snapshot: refreshedSnapshot,
            executors: this.options.executors,
            maxParallelNodeExecutions: this.maxParallelNodeExecutions,
          });
          const frontierState = buildSchedulerFrontierState({
            graphId,
            iteration: input.iteration,
            snapshot: refreshedSnapshot,
            frontier,
            executors: this.options.executors,
            missionLedger: input.missionLedger,
            requireFreshContextSnapshotsForWorkerExecution:
              this.options.requireFreshContextSnapshotsForWorkerExecution === true,
            requireNodeExecutionPacketForWorkerExecution:
              this.options.requireNodeExecutionPacketForWorkerExecution === true,
          });
          const signature = buildNoProgressSignature({
            graphId,
            iteration: input.iteration,
            snapshot: refreshedSnapshot,
            frontierState,
            decision,
            persistence: persistenceOutcome,
            terminalBlockerCode: "graph_persistence_reused_only",
          });
          const repeatCount =
            (input.loopGuard.repeatedNoProgressBySignature.get(signature.signatureHash) ?? 0) + 1;
          input.loopGuard.repeatedNoProgressBySignature.set(signature.signatureHash, repeatCount);
          const noProgressTool = await this.recordSchedulerTool({
            graphId,
            iteration: input.iteration,
            toolId: "scheduler.record_no_progress_signature",
            idempotencyKey: `iteration:${input.iteration}:decision:${decision.decisionId}:no-progress:${signature.signatureHash.slice(0, 16)}`,
            inputRef: graphRef("orchestrator-decision", decision.decisionId),
            inputHash: signature.signatureHash,
            inputSummary:
              "Record no-progress signature because graph persistence reused existing nodes/edges without producing a new executable frontier, evidence ref, readiness ref, or Work Queue child.",
            metadata: {
              decisionId: decision.decisionId,
              decisionKind: decision.decisionKind,
              noProgressSignature: signature as unknown as JsonValue,
              noProgressRepeatCount: repeatCount,
              schedulerFrontierState: frontierState as unknown as JsonValue,
              schedulerPhase: "no_progress_evaluation",
              reasonCodes: [
                "scheduler_graph_persistence_reused_only_no_progress",
                `scheduler_no_progress_repeat_count:${repeatCount}`,
              ],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          });
          await this.options.onProgress?.({
            stage: "scheduler_no_progress",
            status: repeatCount >= 2 ? "needs_review" : "completed",
            reasonCodes: [
              "scheduler_graph_persistence_reused_only_no_progress",
              `scheduler_no_progress_signature:${signature.signatureHash.slice(0, 16)}`,
              `scheduler_no_progress_repeat_count:${repeatCount}`,
              ...noProgressTool.reasonCodes,
            ],
            currentPhase: "no_progress_evaluation",
            schedulerPhase: "no_progress_evaluation",
            schedulerToolId: "scheduler.record_no_progress_signature",
            schedulerToolInvocationRefs: noProgressTool.refs,
            evidenceProducedRefs: noProgressTool.refs,
            nextDecisionNeeded:
              repeatCount >= 2 ? "operator_review_root_cause" : frontierState.nextLegalTransition,
            blockerSummary:
              "The scheduler accepted a graph write decision, but runtime only reused existing nodes/edges and saw no new executable work or evidence.",
            eli5Progress:
              repeatCount >= 2
                ? "OpenClaw saw the same no-progress graph state twice, so it stopped instead of looping."
                : "OpenClaw saw a no-progress graph state and will allow one bounded repair decision.",
            heartbeatState: repeatCount >= 2 ? "needs_review" : "no_progress_observed",
            schedulerFrontierState: frontierState,
            noProgressSignature: signature,
            noProgressRepeatCount: repeatCount,
          });
          decision.reasonCodes.push(
            "scheduler_graph_persistence_reused_only_no_progress",
            `scheduler_no_progress_signature:${signature.signatureHash.slice(0, 16)}`,
            ...noProgressTool.reasonCodes,
          );
          if (repeatCount >= 2) {
            await this.options.graphs.recordCheckpoint({
              graphId,
              checkpointKind: "scheduler_repeated_no_progress_signature_halted",
              stateSummary:
                "Scheduler halted repeated no-progress graph expansion because the same reused-only signature recurred without new frontier, evidence, readiness, or Work Queue progress.",
              artifactRefs: [
                graphRef("orchestrator-decision", decision.decisionId),
                ...noProgressTool.refs,
              ],
            });
            return {
              status: "needs_review",
              reasonCodes: [
                ...decision.reasonCodes,
                "scheduler_repeated_no_progress_signature_halted",
                "scheduler_no_progress_root_cause_surface_required",
              ],
              missionLedger: input.missionLedger,
            };
          }
        }
      }
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
            toolId: "scheduler.record_node_transition",
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
        const prepared = await this.prepareNodeForExecution({
          graphId,
          nodeId,
          iteration: input.iteration,
          missionLedger: input.missionLedger,
          decision,
          executedNodeIds: input.executedNodeIds,
          addedNodeIds: input.addedNodeIds,
          loopGuard: input.loopGuard,
        });
        decision.reasonCodes.push(...prepared.reasonCodes);
        if (!prepared.proceed) {
          return {
            status: prepared.status ?? "continue",
            reasonCodes: uniqueStrings([...decision.reasonCodes, ...prepared.reasonCodes]),
            missionLedger: prepared.missionLedger ?? input.missionLedger,
          };
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
        const prepared = await this.prepareNodeForExecution({
          graphId,
          nodeId: closeoutNodeId,
          iteration: input.iteration,
          missionLedger: input.missionLedger,
          decision,
          executedNodeIds: input.executedNodeIds,
          addedNodeIds: input.addedNodeIds,
          loopGuard: input.loopGuard,
        });
        decision.reasonCodes.push(...prepared.reasonCodes);
        if (!prepared.proceed) {
          return {
            status: prepared.status ?? "continue",
            reasonCodes: uniqueStrings([...decision.reasonCodes, ...prepared.reasonCodes]),
            missionLedger: prepared.missionLedger ?? input.missionLedger,
          };
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
        decision.reasonCodes.push("first_node_execution_uses_executable_frontier");
      }
      const prepared = await this.prepareNodeForExecution({
        graphId,
        nodeId,
        iteration: input.iteration,
        missionLedger: input.missionLedger,
        decision,
        executedNodeIds: input.executedNodeIds,
        addedNodeIds: input.addedNodeIds,
        loopGuard: input.loopGuard,
      });
      decision.reasonCodes.push(...prepared.reasonCodes);
      if (!prepared.proceed) {
        return {
          status: prepared.status ?? "continue",
          reasonCodes: uniqueStrings([...decision.reasonCodes, ...prepared.reasonCodes]),
          missionLedger: prepared.missionLedger ?? input.missionLedger,
        };
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
  }): Promise<RuntimeWorkGraphPersistenceOutcome> {
    const persistenceTimeoutMs = 60_000;
    const outcome: RuntimeWorkGraphPersistenceOutcome = {
      createdNodeIds: [],
      reusedNodeIds: [],
      createdEdgeIds: [],
      reusedEdgeIds: [],
    };
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
        outcome.reusedNodeIds.push(node.nodeId);
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
        outcome.reusedNodeIds.push(node.nodeId);
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
      outcome.createdNodeIds.push(node.nodeId);
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
    const knownNodeIds = new Set([
      ...existingNodesById.keys(),
      ...input.nodes.map((node) => node.nodeId),
    ]);
    const edgesToPersist = deriveContextSynthesisJoinEdges({
      graphId: input.graphId,
      nodes: input.nodes,
      edges: input.edges,
      snapshot,
    });
    const runtimeDerivedEdgeCount = edgesToPersist.length - input.edges.length;
    if (runtimeDerivedEdgeCount > 0) {
      await this.options.onProgress?.({
        stage: "scheduler_graph_edge_persistence",
        status: "completed",
        reasonCodes: [
          "runtime_derived_context_synthesis_join_edges",
          `runtime_derived_edge_count:${runtimeDerivedEdgeCount}`,
        ],
        currentPhase: "graph_edge_runtime_derivation_completed",
        schedulerPhase: "decomposition_accepted",
        currentObjective:
          "Derive structural context-supply edges from accepted context handoffs to the context synthesis node.",
        runtimeToolTimeoutMs: persistenceTimeoutMs,
        heartbeatState: "graph_edge_runtime_derivation_completed",
        eli5Progress:
          "OpenClaw connected accepted context scout handoffs to the context synthesis node so the graph shows the real dependency.",
      });
    }
    const existingEdgeKeys = new Set(
      (snapshot?.edges ?? []).map(
        (edge) => `${edge.fromNodeId ?? ""}->${edge.toNodeId ?? ""}:${edge.edgeKind}`,
      ),
    );
    for (const [edgeIndex, edge] of edgesToPersist.entries()) {
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
        outcome.reusedEdgeIds.push(runtimeEdgeId);
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
      outcome.createdEdgeIds.push(runtimeEdgeId);
    }
    await this.options.onProgress?.({
      stage: "scheduler_graph_node_persistence",
      status: "completed",
      reasonCodes: [
        "scheduler_graph_node_persistence_completed",
        `node_count:${input.nodes.length}`,
        `edge_count:${edgesToPersist.length}`,
        ...(runtimeDerivedEdgeCount > 0
          ? [`runtime_derived_edge_count:${runtimeDerivedEdgeCount}`]
          : []),
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
    return outcome;
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
    const upstreamContextSnapshots = upstreamContextSupplySnapshotRefs({ snapshot, node });
    const nodeContextFreshness = validateNodeContextSnapshots(node, upstreamContextSnapshots);
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
    if (upstreamContextSnapshots.length > 0) {
      const boundedProvidedContextSnapshotRefs = upstreamContextSnapshots.slice(0, 12);
      await this.options.graphs.updateNodeStatus({
        nodeId: node.nodeId,
        nodeStatus: node.nodeStatus,
        metadataPatch: {
          providedContextSnapshotRefs: boundedProvidedContextSnapshotRefs,
          providedContextSnapshotRefCount: upstreamContextSnapshots.length,
          providedContextSnapshotRefsTruncated:
            upstreamContextSnapshots.length > boundedProvidedContextSnapshotRefs.length,
          contextSnapshotRefs: upstreamContextSnapshots.map((ref) => ref.snapshotRef).slice(0, 80),
          contextFreshnessStatus: "fresh",
          contextRefreshAction: "none",
          nodeScopedContextSupplyAccepted: true,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      await this.options.onProgress?.({
        stage: "scheduler_node_context_freshness",
        status: "completed",
        nodeId: node.nodeId,
        roleId: node.assignedRole,
        reasonCodes: [
          "scheduler_node_context_freshness_satisfied_by_node_scoped_supply",
          `node_scoped_context_snapshot_count:${upstreamContextSnapshots.length}`,
        ],
        currentObjective:
          typeof nodeMetadata.exactObjective === "string" ? nodeMetadata.exactObjective : null,
        activeNodeKind: node.nodeKind,
        capabilityId: nodeCapabilityId(node),
        modelRef: node.modelOrWorkerRef,
        targetRefs: nodeSchedulingTargetRefs(node),
        inputHandoffRefs: node.inputHandoffRefs,
        currentPhase: "context_freshness_satisfied",
        validationState: "context_ready",
        evidenceProducedRefs: upstreamContextSnapshots.map((ref) => ref.snapshotRef).slice(0, 40),
        commitmentIdsAdvanced: jsonStringArray(nodeMetadata.commitmentIdsAdvanced),
        remainingOpenCommitmentIds: remainingOpenCommitmentIds(input.missionLedger),
        nextDecisionNeeded: "execute_node",
        blockerSummary: null,
        eli5Progress:
          "OpenClaw found accepted node-scoped context upstream, so this worker node can execute without a global synthesis barrier.",
        schedulerPhase: "context_freshness_gate",
        contextSnapshotRefs: upstreamContextSnapshots.map((ref) => ref.snapshotRef).slice(0, 40),
        contextFreshnessStatus: "fresh",
        contextRefreshAction: "none",
        contextFreshnessSummary:
          "Runtime derived fresh context snapshots from accepted node-scoped context supply.",
      });
    }
    const nodeExecutionPacket = nodeExecutionPacketFromMetadata(node);
    const nodeResourcePacket = jsonRecord(nodeMetadata.resourcePacket ?? null) as JsonValue;
    const nodeResourceReadiness =
      nodeExecutionPacket !== null
        ? evaluateNodeExecutionPacketReadiness({
            packet: nodeExecutionPacket,
            resourcePacket: nodeResourcePacket,
            implementationContextPacket: jsonRecord(
              nodeMetadata.implementationContextPacket ?? null,
            ),
          })
        : null;
    const manifestResourceReadiness = nodeResourceReadinessFromManifestMetadata(node, {
      requireFreshContextSnapshotsForWorkerExecution:
        this.options.requireFreshContextSnapshotsForWorkerExecution === true,
    });
    const nodeReadinessState =
      nodeResourceReadiness?.state ??
      (nodeRequiresExecutionPacket(node)
        ? buildMissingNodeExecutionPacketReadinessState({
            nodeId: node.nodeId,
            runtimeJobId:
              typeof nodeMetadata.runtimeJobId === "string" ? nodeMetadata.runtimeJobId : null,
            graphId: input.graphId,
            workflowId: snapshot.graph.workflowId,
          })
        : null);
    const nodeExecutionPacketRef =
      nodeExecutionPacket?.packetRef ??
      (typeof nodeMetadata.nodeExecutionPacketRef === "string"
        ? nodeMetadata.nodeExecutionPacketRef
        : null);
    const resourcePacketRef =
      nodeExecutionPacket?.resourcePacketRef ??
      (typeof nodeMetadata.resourcePacketRef === "string" ? nodeMetadata.resourcePacketRef : null);
    const resourcePacketKind =
      nodeExecutionPacket?.resourcePacketKind ??
      (typeof nodeMetadata.resourcePacketKind === "string"
        ? nodeMetadata.resourcePacketKind
        : null);
    if (
      this.options.requireNodeExecutionPacketForWorkerExecution === true &&
      nodeRequiresExecutionPacket(node) &&
      nodeResourceReadiness?.valid !== true &&
      manifestResourceReadiness?.valid !== true
    ) {
      const reasonCodes = [
        "node_execution_packet_required_before_worker_execution",
        ...(nodeExecutionPacket || manifestResourceReadiness
          ? []
          : ["node_execution_packet_missing"]),
        ...(nodeResourceReadiness?.reasonCodes ?? manifestResourceReadiness?.reasonCodes ?? []),
      ].slice(0, 60);
      const blockerSummary =
        nodeResourceReadiness?.blockingLimitations.join("; ") ||
        manifestResourceReadiness?.blockingLimitations.join("; ") ||
        "Worker execution blocked before provider/model invocation because the runtime has not compiled a ready NodeExecutionPacket with materialized resources.";
      const resourceTool = await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "node.record_readiness_blocker",
        idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:resource-readiness-blocker`,
        inputRef: nodeExecutionPacketRef ?? graphRef("node", node.nodeId),
        inputSummary: `Record resource readiness blocker for node ${node.nodeId}.`,
        nodeId: node.nodeId,
        roleRef: node.assignedRole,
        modelRef: node.modelOrWorkerRef,
        metadata: {
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          nodeExecutionPacketRef,
          resourcePacketKind,
          resourcePacketRef,
          nodeExecutionPacket: (nodeExecutionPacket ?? null) as unknown as JsonValue,
          readiness: (nodeResourceReadiness ?? null) as unknown as JsonValue,
          nodeReadinessState: (nodeReadinessState ?? null) as unknown as JsonValue,
          schedulerPhase: "resource_materialization_gate",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      await this.options.graphs.updateNodeStatus({
        nodeId: node.nodeId,
        nodeStatus: "needs_review",
        metadataPatch: {
          lastResultStatus: "needs_review",
          lastStatusReasonCodes: [...reasonCodes, ...resourceTool.reasonCodes].slice(0, 60),
          nodeExecutionPacketRef,
          resourcePacketKind,
          resourcePacketRef,
          resourceReadinessStatus: nodeResourceReadiness?.status ?? "blocked",
          resourceReadinessReasonCodes: nodeResourceReadiness?.reasonCodes ??
            manifestResourceReadiness?.reasonCodes ?? ["node_execution_packet_missing"],
          resourceBlockingLimitations: nodeResourceReadiness?.blockingLimitations ??
            manifestResourceReadiness?.blockingLimitations ?? ["NodeExecutionPacket is missing."],
          nodeReadinessStateRef: nodeReadinessState?.stateRef ?? null,
          nodeReadinessPhase: nodeReadinessState?.phase ?? "resource_materialization",
          nodeReadinessStatus: nodeReadinessState?.readinessStatus ?? "blocked",
          nodeReadinessRepairAction: nodeReadinessState?.repairAction ?? "compile_resource_packet",
          nodeReadinessNextAllowedTransitions: nodeReadinessState?.nextAllowedTransitions ?? [
            "compile_node_execution_packet",
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      await this.options.onNodeStatusChanged?.({
        graphId: input.graphId,
        node,
        nodeStatus: "needs_review",
        evidenceRefs: [nodeExecutionPacketRef, resourcePacketRef].filter((ref): ref is string =>
          Boolean(ref),
        ),
        reasonCodes: [...reasonCodes, ...resourceTool.reasonCodes],
      });
      await this.options.onProgress?.({
        stage: "node_resource_materialization",
        status: "needs_review",
        nodeId: node.nodeId,
        roleId: node.assignedRole,
        reasonCodes: [...reasonCodes, ...resourceTool.reasonCodes],
        currentObjective:
          typeof nodeMetadata.exactObjective === "string" ? nodeMetadata.exactObjective : null,
        activeNodeKind: node.nodeKind,
        capabilityId: nodeCapabilityId(node),
        modelRef: node.modelOrWorkerRef,
        targetRefs: nodeSchedulingTargetRefs(node),
        inputHandoffRefs: node.inputHandoffRefs,
        currentPhase: "node_resource_materialization_blocked",
        validationState: "resource_materialization_blocked",
        evidenceProducedRefs: [nodeExecutionPacketRef, resourcePacketRef].filter(
          (ref): ref is string => Boolean(ref),
        ),
        commitmentIdsAdvanced: jsonStringArray(nodeMetadata.commitmentIdsAdvanced),
        remainingOpenCommitmentIds: remainingOpenCommitmentIds(input.missionLedger),
        nextDecisionNeeded: "compile_or_repair_node_execution_packet",
        blockerSummary,
        eli5Progress:
          "OpenClaw stopped before calling the worker because the runtime has not materialized a ready execution packet for this node.",
        schedulerPhase: "resource_materialization_gate",
        schedulerToolId: "node.record_readiness_blocker",
        schedulerToolInvocationRefs: resourceTool.refs,
        nodeExecutionPacketRef,
        nodeExecutionPacketStatus: nodeResourceReadiness?.status ?? "blocked",
        resourcePacketKind,
        resourcePacketRef,
        resourceReadinessReasonCodes: nodeResourceReadiness?.reasonCodes ?? [
          "node_execution_packet_missing",
        ],
        resourceBlockingLimitations: nodeResourceReadiness?.blockingLimitations ?? [
          "NodeExecutionPacket is missing.",
        ],
        resourceNonblockingLimitations: nodeResourceReadiness?.nonblockingLimitations ?? [],
        nodeReadinessState: (nodeReadinessState ?? null) as unknown as JsonValue,
        nodeReadinessStateRef: nodeReadinessState?.stateRef ?? null,
        nodeReadinessPhase: nodeReadinessState?.phase ?? "resource_materialization",
        nodeReadinessStatus: nodeReadinessState?.readinessStatus ?? "blocked",
        nodeReadinessRepairAction: nodeReadinessState?.repairAction ?? "compile_resource_packet",
        nodeReadinessNextAllowedTransitions: nodeReadinessState?.nextAllowedTransitions ?? [
          "compile_node_execution_packet",
        ],
        nodeReadinessFreshnessStatus: nodeReadinessState?.freshnessStatus ?? null,
        nodeReadinessSnapshotStatus: nodeReadinessState?.snapshotStatus ?? null,
        nodeReadinessContextStatus: nodeReadinessState?.contextStatus ?? null,
        nodeReadinessValidationStatus: nodeReadinessState?.validationStatus ?? null,
        nodeReadinessAuthorityStatus: nodeReadinessState?.authorityStatus ?? null,
        nodeReadinessEvidenceStatus: nodeReadinessState?.evidenceStatus ?? null,
      });
      return {
        status: "needs_review",
        reasonCodes: [...reasonCodes, ...resourceTool.reasonCodes],
        missionLedger: input.missionLedger,
      };
    }
    const nodeExecutionReadback = nodeExecutionPacket
      ? jsonRecord(summarizeNodeExecutionPacketForReadback(nodeExecutionPacket))
      : {};
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
      nodeExecutionPacketRef,
      nodeExecutionPacketStatus:
        typeof nodeExecutionReadback.nodeExecutionPacketStatus === "string"
          ? nodeExecutionReadback.nodeExecutionPacketStatus
          : (nodeResourceReadiness?.status ?? null),
      resourcePacketKind,
      resourcePacketRef,
      resourceReadinessReasonCodes: nodeResourceReadiness?.reasonCodes ?? [],
      resourceBlockingLimitations: nodeResourceReadiness?.blockingLimitations ?? [],
      resourceNonblockingLimitations: nodeResourceReadiness?.nonblockingLimitations ?? [],
      nodeReadinessState: (nodeReadinessState ?? null) as unknown as JsonValue,
      nodeReadinessStateRef: nodeReadinessState?.stateRef ?? null,
      nodeReadinessPhase: nodeReadinessState?.phase ?? null,
      nodeReadinessStatus: nodeReadinessState?.readinessStatus ?? null,
      nodeReadinessRepairAction: nodeReadinessState?.repairAction ?? null,
      nodeReadinessNextAllowedTransitions: nodeReadinessState?.nextAllowedTransitions ?? [],
      nodeReadinessFreshnessStatus: nodeReadinessState?.freshnessStatus ?? null,
      nodeReadinessSnapshotStatus: nodeReadinessState?.snapshotStatus ?? null,
      nodeReadinessContextStatus: nodeReadinessState?.contextStatus ?? null,
      nodeReadinessValidationStatus: nodeReadinessState?.validationStatus ?? null,
      nodeReadinessAuthorityStatus: nodeReadinessState?.authorityStatus ?? null,
      nodeReadinessEvidenceStatus: nodeReadinessState?.evidenceStatus ?? null,
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
        nodeExecutionPacketRef,
        nodeExecutionPacketStatus: nodeResourceReadiness?.status ?? null,
        resourcePacketKind,
        resourcePacketRef,
        resourceReadinessReasonCodes: nodeResourceReadiness?.reasonCodes ?? [],
        resourceBlockingLimitations: nodeResourceReadiness?.blockingLimitations ?? [],
        resourceNonblockingLimitations: nodeResourceReadiness?.nonblockingLimitations ?? [],
        nodeReadinessState: (nodeReadinessState ?? null) as unknown as JsonValue,
        nodeReadinessStateRef: nodeReadinessState?.stateRef ?? null,
        nodeReadinessPhase: nodeReadinessState?.phase ?? null,
        nodeReadinessStatus: nodeReadinessState?.readinessStatus ?? null,
        nodeReadinessRepairAction: nodeReadinessState?.repairAction ?? null,
        nodeReadinessNextAllowedTransitions: nodeReadinessState?.nextAllowedTransitions ?? [],
        nodeReadinessFreshnessStatus: nodeReadinessState?.freshnessStatus ?? null,
        nodeReadinessSnapshotStatus: nodeReadinessState?.snapshotStatus ?? null,
        nodeReadinessContextStatus: nodeReadinessState?.contextStatus ?? null,
        nodeReadinessValidationStatus: nodeReadinessState?.validationStatus ?? null,
        nodeReadinessAuthorityStatus: nodeReadinessState?.authorityStatus ?? null,
        nodeReadinessEvidenceStatus: nodeReadinessState?.evidenceStatus ?? null,
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
        nodeExecutionPacketRef,
        nodeExecutionPacketStatus: nodeResourceReadiness?.status ?? null,
        resourcePacketKind,
        resourcePacketRef,
        resourceReadinessReasonCodes: nodeResourceReadiness?.reasonCodes ?? [],
        resourceBlockingLimitations: nodeResourceReadiness?.blockingLimitations ?? [],
        resourceNonblockingLimitations: nodeResourceReadiness?.nonblockingLimitations ?? [],
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
    const validationRefs = result.validationRefs ?? [];
    const changedFileRefs = result.changedFileRefs ?? [];
    const closeoutRefs = result.closeoutRefs ?? [];
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
    const missionEvaluationThrottle = missionLedgerEvaluationThrottleDecision({
      node,
      result,
      evidenceClaimsAcceptedForEvaluation,
      missionEvidenceReasonCodes,
      requireEvidenceClaimsForMissionLedger:
        this.options.requireEvidenceClaimsForMissionLedger === true,
    });
    if (
      missionLedger &&
      this.options.evaluateMissionLedger &&
      missionEvaluationThrottle.shouldEvaluate
    ) {
      const throttleTool = await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "scheduler.mission_ledger_evaluation_throttle",
        idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:mission-ledger-evaluation-allowed`,
        inputRef: result.evidenceClaims?.[0]?.evidenceRef ?? graphRef("node", node.nodeId),
        inputSummary:
          "Mission Ledger evaluation is allowed because this node produced accepted closure-capable evidence claims.",
        nodeId: node.nodeId,
        roleRef: node.assignedRole,
        modelRef: node.modelOrWorkerRef,
        metadata: {
          missionLedgerEvaluationThrottle: missionEvaluationThrottle.artifact,
          schedulerPhase: "mission_contract_evaluation_throttle",
          reasonCodes: missionEvaluationThrottle.reasonCodes,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      result = {
        ...result,
        reasonCodes: [...result.reasonCodes, ...throttleTool.reasonCodes],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      };
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
    } else if (missionLedger && this.options.evaluateMissionLedger) {
      const throttleTool = await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "scheduler.mission_ledger_evaluation_throttle",
        idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:mission-ledger-evaluation-throttled`,
        inputRef: graphRef("node", node.nodeId),
        inputSummary:
          "Mission Ledger evaluation was skipped because this event does not carry accepted closure-capable evidence claims.",
        nodeId: node.nodeId,
        roleRef: node.assignedRole,
        modelRef: node.modelOrWorkerRef,
        metadata: {
          missionLedgerEvaluationThrottle: missionEvaluationThrottle.artifact,
          schedulerPhase: "mission_contract_evaluation_throttle",
          reasonCodes: missionEvaluationThrottle.reasonCodes,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      result = {
        ...result,
        reasonCodes: [...result.reasonCodes, ...throttleTool.reasonCodes],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      };
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
      missionLedgerEvaluationThrottle: missionEvaluationThrottle.artifact,
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
