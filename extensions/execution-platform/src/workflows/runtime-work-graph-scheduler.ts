import { createHash } from "node:crypto";
import type { ModelDecisionRepairRequest } from "../model-decision-contracts/index.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { evaluateBoundaryReplayChildEpochEligibility } from "./boundary-replay-checkpoints.ts";
import { normalizeContextSnapshotRefs, type ContextSnapshotRef } from "./context-snapshot.ts";
import {
  costAwareDecisionReadback,
  utilityDecisionFromNodeMetadata,
  validateCostAwareCapabilityUtilityDecision,
} from "./cost-aware-capability-policy.ts";
import {
  missionLedgerHasOpenBlockingCommitments,
  openBlockingMissionCommitments,
  recomputeMissionLedgerStatus,
  summarizeMissionContractLedger,
  type MissionCommitment,
  type MissionContractLedger,
  type MissionContractLedgerSummary,
} from "./mission-contract-ledger.ts";
import {
  NODE_EXECUTION_SNAPSHOT_ARTIFACT_TYPE,
  type NodeExecutionSnapshot,
} from "./node-agent-session.ts";
import {
  NODE_LIFECYCLE_PROJECTION_ARTIFACT_TYPE,
  NodeLifecycleTransitionRunner,
  buildNodeLifecycleProjectionManifest,
  type NodeLifecycleProjection,
  type NodeLifecycleProjectionManifest,
  type NodeLifecycleTransitionRunnerOptions,
} from "./node-lifecycle-transition-runner.ts";
import {
  type OrchestratorGraphEdgeSpec,
  type OrchestratorGraphDecision,
  type OrchestratorGraphRejectedNodeDiagnostic,
  type OrchestratorGraphNodeSpec,
} from "./orchestrator-graph-decision.ts";
import {
  buildRuntimeRepairClassification,
  failureClassFromReasonCodes,
  runtimeRepairClassificationSummary,
  type RuntimeRepairClassification,
} from "./repair-classification.ts";
import {
  requirementMapSchedulerRunnableIds,
  summarizeRequirementMapForScheduler,
  type RequirementMap,
} from "./requirement-map.ts";
import {
  buildRuntimeNodeCapabilityManifest,
  findRuntimeNodeCapability,
  filterRuntimeNodeCapabilityManifestForExecutors,
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
import {
  DEFAULT_EXPANSION_ADMISSION_POLICY,
  type RuntimeWorkGraphExpansionAdmissionPolicy,
} from "./runtime-work-graph-expansion-controller.ts";
import type {
  RuntimeWorkGraphRepository,
  RuntimeWorkGraphSnapshot,
  RuntimeWorkGraphTopologyEdgeInput,
  RuntimeWorkGraphTopologyNodeInput,
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
import { validateSchedulerGraphAdmission } from "./scheduler-graph-admission.ts";
import type {
  SchedulerClosurePolicy,
  SchedulerClosureRunMode,
} from "./scheduler-graph-closure-policy.ts";
import type {
  SchedulerGraphAmendmentRequest,
  SchedulerGraphPatch,
} from "./scheduler-graph-patch.ts";
import {
  invokeSchedulerRuntimeTool,
  type SchedulerRuntimeToolId,
} from "./scheduler-runtime-tools.ts";
import {
  SchedulerStageRunner,
  type SchedulerStageNativeToolCallInput,
  type SchedulerStageNativeToolCallResult,
  type SchedulerStagePhase,
  type SchedulerStageSmallVerbToolId,
} from "./scheduler-stage-runner.ts";
export {
  SCHEDULER_STAGE_SMALL_VERB_TOOL_IDS,
  type SchedulerStageSmallVerbToolId,
} from "./scheduler-stage-runner.ts";
import type { SchedulerModelCallEnvelope } from "./scheduler-model-call-envelope.ts";
import {
  evaluateEvidenceClaimValidationPhase,
  normalizeRuntimeValidationPhase,
  type RuntimeValidationPhase,
  type ValidationPhaseCompatibilityStatus,
} from "./validation-phase.ts";
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

type RuntimeNodeLifecycleState = TeamGraphNode["nodeStatus"] | "completed";

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
  requirementInventorySummary?: JsonValue | null;
  recentNodeResultSummaries?: RuntimeWorkGraphRecentNodeResultSummary[];
  capabilityRegistrySummary?: JsonValue | null;
  schedulerStagePhase?: SchedulerStagePhase | null;
  schedulerStageState?: JsonValue | null;
  schedulerStageDraft?: JsonValue | null;
  allowedSchedulerToolIds?: SchedulerStageSmallVerbToolId[];
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
  callSchedulerTool(
    input: SchedulerStageNativeToolCallInput,
  ): Promise<SchedulerStageNativeToolCallResult>;
  callSchedulerTools?(
    input: SchedulerStageNativeToolCallInput,
  ): Promise<SchedulerStageNativeToolCallResult[]>;
};

export type RuntimeWorkGraphNodeExecutionInput = {
  graphId: string;
  node: TeamGraphNode;
  snapshotSummary: JsonValue;
  missionLedgerSummary?: MissionContractLedgerSummary | null;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type RuntimeWorkGraphNodeExecutor = {
  execute(input: RuntimeWorkGraphNodeExecutionInput): Promise<RuntimeWorkGraphNodeExecutionResult>;
};

export type RuntimeWorkGraphNodeAgentSessionRunner = (input: {
  graphId: string;
  iteration: number;
  snapshot: RuntimeWorkGraphSnapshot;
  node: TeamGraphNode;
  nodeExecutionSnapshot: NodeExecutionSnapshot;
  missionLedgerSummary?: MissionContractLedgerSummary | null;
  rawPromptStored: false;
  rawResponseStored: false;
}) => Promise<RuntimeWorkGraphNodeExecutionResult>;

type RuntimeWorkGraphLoopGuard = {
  seenEvidenceRefs: Set<string>;
  roleIdsSeen: Set<string>;
  repeatedNoProgressBySignature: Map<string, number>;
};

export type RuntimeWorkGraphFrontierBlockedNodeDiagnostic = {
  artifactKind: "runtime_work_graph_frontier_blocked_node_diagnostic";
  schemaVersion: "execution-platform.runtime-work-graph.frontier-blocked-node-diagnostic.v1";
  graphId: string;
  iteration: number;
  branchId: string;
  nodeId: string;
  nodeKind: string;
  capabilityId: string | null;
  executionIntent: string | null;
  evidenceMode: string[];
  lifecycleState: RuntimeNodeLifecycleState;
  missingFields: string[];
  reasonCodes: string[];
  contractRef: string | null;
  contractVersion: string | null;
  readinessRef: string | null;
  schemaErrorPath: string | null;
  policyErrorPath: string | null;
  providerProfileId: string | null;
  branchSimilarityClass: string;
  blockerSummary: string | null;
  nextAllowedTransitions: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
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
  contextRefs: string[];
  openCommitmentIds: string[];
  lockConflictNodeIds: string[];
  providerBudgetBlockedNodeIds: string[];
  nextLegalTransition: string;
  reasonCodes: string[];
  blockedNodeDiagnostics: RuntimeWorkGraphFrontierBlockedNodeDiagnostic[];
  branchScopedFrontierStates: RuntimeWorkGraphBranchScopedFrontierState[];
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
  stage: string;
  nodeKinds: string[];
  capabilityIds: string[];
  executionIntents: string[];
  evidenceModes: string[];
  missingFields: string[];
  contractVersions: string[];
  schemaErrorPaths: string[];
  policyErrorPaths: string[];
  providerProfileIds: string[];
  branchSimilarityClasses: string[];
  nextLegalTransitions: string[];
  signatureHash: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type RuntimeWorkGraphFrontierRootCauseArtifact = {
  artifactKind: "runtime_work_graph_frontier_root_cause";
  schemaVersion: "execution-platform.runtime-work-graph.frontier-root-cause.v1";
  graphId: string;
  iteration: number;
  superstep: number;
  signatureHash: string;
  repeatCount: number;
  systemic: boolean;
  stage: string;
  affectedNodeIds: string[];
  affectedBranchIds: string[];
  unaffectedSiblingBranchIds: string[];
  successfulSiblingEvidenceRefs: string[];
  firstOccurrenceRef: string;
  lastOccurrenceRef: string;
  missingFields: string[];
  reasonCodes: string[];
  schemaErrorPaths: string[];
  policyErrorPaths: string[];
  contractRefs: string[];
  contractVersions: string[];
  providerProfileIds: string[];
  attemptedTransitions: string[];
  recommendedRepairBoundary: string;
  nextLegalTransitions: string[];
  noProgressSignature: RuntimeWorkGraphNoProgressSignature;
  branchDiagnostics: RuntimeWorkGraphFrontierBlockedNodeDiagnostic[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

export type RuntimeWorkGraphBranchScopedFrontierState = {
  artifactKind: "runtime_work_graph_branch_scoped_frontier_state";
  schemaVersion: "execution-platform.runtime-work-graph.branch-scoped-frontier.v1";
  graphId: string;
  currentSuperstep: number;
  branchId: string;
  parentBranchId: string | null;
  nodeId: string;
  nodeKind: string;
  sourceRequirementRef: string | null;
  contractRef: string | null;
  readinessRef: string | null;
  sourceMaterialRequirementRefs: string[];
  status:
    | "ready"
    | "running"
    | "succeeded"
    | "blocked"
    | "failed"
    | "needs_review"
    | "waiting_for_human"
    | "diagnostic_only";
  blocker: {
    code: string | null;
    summary: string | null;
    schemaPath: string | null;
    policyPath: string | null;
    reasonCodes: string[];
  } | null;
  blockerSignature: string | null;
  consumerRefs: string[];
  dependentConsumers: string[];
  siblingBranchIds: string[];
  successfulEvidenceRefs: string[];
  failedEvidenceRefs: string[];
  repairNodeRefs: string[];
  diagnosticOnlyNodeRefs: string[];
  nextLegalTransitions: string[];
  branchClosureState:
    | "not_applicable"
    | "commitment_evaluation_required"
    | "node_agent_session_ready"
    | "node_agent_session_escalation_required"
    | "blocked_terminal"
    | "closed_succeeded";
  branchLocalTransitionPending: boolean;
  capabilityId: string | null;
  executorKey: string | null;
  modelRef: string | null;
  workerRef: string | null;
  phase: string | null;
  objectiveSummary: string | null;
  whySelected: string | null;
  currentToolId: string | null;
  currentToolInvocationRef: string | null;
  targetRefSummary: string[];
  readinessStatus: string | null;
  rootCauseRef: string | null;
  rootCauseSystemic: boolean | null;
  updatedAt: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

function workflowRoleClassForNode(node: TeamGraphNode): WorkflowRoleClass {
  switch (node.nodeKind) {
    case "orchestrator_plan":
      return "orchestrator";
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

function nodeRequiresMissionEvidenceClaimsForLocalCloseout(node: TeamGraphNode): boolean {
  const roleClass = workflowRoleClassForNode(node);
  if (
    ["closeout", "human", "review", "research", "observability", "orchestrator"].includes(roleClass)
  ) {
    return false;
  }
  return ["implementation", "qa", "docs", "architecture", "planning"].includes(roleClass);
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
  nodeAgentSessionRunner?: RuntimeWorkGraphNodeAgentSessionRunner | null;
  resolveNodeAgentProfile?: NodeLifecycleTransitionRunnerOptions["resolveNodeAgentProfile"];
  runtimeToolKernel?: RuntimeToolKernel | null;
  missionLedger?: MissionContractLedger | null;
  requirementMap?: RequirementMap | null;
  requirementMapRef?: string | null;
  schedulerClosurePolicy?: SchedulerClosurePolicy | null;
  closureRunMode?: SchedulerClosureRunMode;
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
    nodeLifecycleProjection: NodeLifecycleProjection;
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
  attachPayloadArtifact?: (input: {
    jobId: string;
    graphId: string;
    nodeId: string;
    artifactType: string;
    uri: string;
    body: JsonValue;
    boundedSummary: string;
    metadata?: JsonValue;
  }) => Promise<{
    artifactRef: string;
    reasonCodes: string[];
  }>;
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
    validationPhase?: RuntimeValidationPhase | null;
    validationPhaseCompatibility?: ValidationPhaseCompatibilityStatus | null;
    validationPhaseReasonCodes?: string[];
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
      validationPhase: RuntimeValidationPhase;
      validationPhaseCompatibility: ValidationPhaseCompatibilityStatus;
      validationPhaseReasonCodes: string[];
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
    toolCallTelemetry?: JsonValue | null;
    repairClassification?: JsonValue | null;
    schedulerModelCallEnvelope?: SchedulerModelCallEnvelope | null;
    parallelFrontier?: RuntimeWorkGraphParallelFrontierReadback | null;
    schedulerFrontierState?: RuntimeWorkGraphSchedulerFrontierState | null;
    branchScopedFrontierStates?: RuntimeWorkGraphBranchScopedFrontierState[];
    noProgressSignature?: RuntimeWorkGraphNoProgressSignature | null;
    frontierRootCauseArtifact?: RuntimeWorkGraphFrontierRootCauseArtifact | null;
    frontierRootCauseArtifactRefs?: string[];
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
    commitmentWorkPacketSummaries?: Array<{
      packetRef?: string;
      commitmentId?: string;
      authoringSource?: string;
      qualityStatus?: string;
      workerObjective?: string;
      resourceSpecialistObjective?: string;
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
    resolvedTargetFileRefs?: string[];
    readableTargetFileRefs?: string[];
    missingTargetRefs?: string[];
    unreadableTargetRefs?: string[];
    directoryOnlyTargetRefs?: string[];
    candidateConcreteFileRefs?: string[];
    targetFileSnapshotRefs?: string[];
    targetFileSnapshotHashes?: string[];
    executionIntent?: string | null;
    evidenceMode?: string[];
    executorKey?: string | null;
    contextBrokerRequestRefs?: string[];
    contextBrokerStatuses?: string[];
    contextBrokerDedupeKeys?: string[];
    contextBrokerConsumerNodeIds?: string[];
    contextBrokerReasonCodes?: string[];
    contextBrokerNextTransition?: string | null;
    nodeLifecycleProjectionRef?: string | null;
    nodeLifecycleProjectionHash?: string | null;
    nodeLifecycleProjectionGate?: string | null;
    nodeLifecycleProjectionStatus?: string | null;
    nodeLifecycleNextLegalTransitions?: string[];
    nodeLifecycleCanCallGlobalScheduler?: boolean | null;
    nodeExecutionSnapshotRef?: string | null;
    nodeRunId?: string | null;
    nodeAgentId?: string | null;
    nodeAgentSessionKey?: string | null;
    nodeFinishArtifactRef?: string | null;
    nodeFinishStatus?: string | null;
    nodeFinishBlockerKind?: string | null;
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
  requireEvidenceClaimsForMissionLedger?: boolean;
  deferCloseoutUntilExecutableGraphComplete?: boolean;
  roleCoverageProfile?: RuntimeWorkGraphRoleCoverageProfile | null;
  entryNodePolicy?: WorkflowEntryNodePolicy | null;
  maxIterations?: number;
  maxDecisionRepairAttempts?: number;
  maxSchedulerToolTurns?: number;
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
      sourceMaterialRequirementKinds: jsonStringArray(
        jsonRecord(node.metadata).sourceMaterialRequirementKinds,
      ),
      sourceRequirementRef:
        typeof jsonRecord(node.metadata).sourceRequirementRef === "string"
          ? (jsonRecord(node.metadata).sourceRequirementRef as string)
          : typeof jsonRecord(node.metadata).requirementId === "string"
            ? (jsonRecord(node.metadata).requirementId as string)
            : null,
      executionIntent:
        typeof jsonRecord(node.metadata).executionIntent === "string"
          ? (jsonRecord(node.metadata).executionIntent as string)
          : null,
      evidenceMode: jsonStringArray(jsonRecord(node.metadata).evidenceMode),
      contextQuestions: jsonStringArray(
        jsonRecord(node.metadata).contextQuestions ??
          jsonRecord(node.metadata).targetWorkContextQuestions,
      ),
      sourceMaterialRequirementRefs: jsonStringArray(
        jsonRecord(node.metadata).sourceMaterialRequirementRefs,
      ),
      contextSnapshotRefs: [
        ...jsonContextSnapshotArray(jsonRecord(node.metadata).contextSnapshotRefs).map(
          (snapshotRef) => snapshotRef.snapshotRef,
        ),
        ...jsonContextSnapshotArray(jsonRecord(node.metadata).providedContextSnapshotRefs).map(
          (snapshotRef) => snapshotRef.snapshotRef,
        ),
      ].slice(0, 40),
      acceptedSourceMaterialRefs: jsonStringArray(
        jsonRecord(node.metadata).acceptedSourceMaterialRefs ??
          jsonRecord(node.metadata).sourceMaterialRefs,
      ),
      missingSourceMaterialRequirementRefs: jsonStringArray(
        jsonRecord(node.metadata).missingSourceMaterialRequirementRefs,
      ),
      missingSourceMaterialRefs: jsonStringArray(
        jsonRecord(node.metadata).missingSourceMaterialRefs,
      ),
      failedResourceSupplyNodeIds: jsonStringArray(
        jsonRecord(node.metadata).failedResourceSupplyNodeIds,
      ),
      pendingResourceSupplyNodeIds: jsonStringArray(
        jsonRecord(node.metadata).pendingResourceSupplyNodeIds,
      ),
      contextLimitationWaiverRefs: jsonStringArray(
        jsonRecord(node.metadata).contextLimitationWaiverRefs,
      ),
      outputArtifactRefs: node.outputArtifactRefs.slice(0, 8),
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
  branchScopedFrontierStates: RuntimeWorkGraphBranchScopedFrontierState[];
  branchResults: SuperstepBranchResult[];
  joinReadyNodeIds: string[];
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

function nodeHasNativeExecutionAdapter(input: {
  node: TeamGraphNode;
  nodeAgentSessionRunnerConfigured?: boolean;
}): boolean {
  return input.nodeAgentSessionRunnerConfigured === true && input.node.nodeKind !== "human_task";
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
  branchScopedFrontierStates?: RuntimeWorkGraphBranchScopedFrontierState[];
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
    branchScopedFrontierStates: (input.branchScopedFrontierStates ?? [])
      .slice(0, 80)
      .map((branch) => ({
        ...branch,
        siblingBranchIds: branch.siblingBranchIds.slice(0, 80),
        successfulEvidenceRefs: branch.successfulEvidenceRefs.slice(0, 80),
        failedEvidenceRefs: branch.failedEvidenceRefs.slice(0, 80),
        repairNodeRefs: branch.repairNodeRefs.slice(0, 40),
        diagnosticOnlyNodeRefs: branch.diagnosticOnlyNodeRefs.slice(0, 40),
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
      branchClosureState: branch.branchClosureState,
      branchLocalTransitionPending: branch.branchLocalTransitionPending,
      evidenceRefs: branch.evidenceRefs.slice(0, 40),
      nodeLifecycleProjectionRef: branch.nodeLifecycleProjectionRef,
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
  const pendingBranchLocalTransitionNodeIds = new Set(
    input.branchResults
      .filter((branch) => branch.branchLocalTransitionPending)
      .map((branch) => branch.nodeId),
  );
  const entries: Array<{
    signature: string;
    failureClass: string;
    errorPath: string | null;
    errorSummary: string | null;
    nodeId: string;
  }> = [];
  for (const branch of input.branchResults) {
    if (branch.branchLocalTransitionPending) {
      continue;
    }
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
    if (pendingBranchLocalTransitionNodeIds.has(node.nodeId)) {
      continue;
    }
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
  const diagnosticFailureClasses = new Set([
    "replay_boundary_stop_validation_node",
    "validation_deferred_until_worker_evidence",
  ]);
  const bySignature = new Map<string, typeof entries>();
  for (const entry of entries) {
    bySignature.set(entry.signature, [...(bySignature.get(entry.signature) ?? []), entry]);
  }
  const groups = [...bySignature.entries()].map(([signature, matches]) => ({
    signature,
    matches,
    diagnostic: matches.every((match) => diagnosticFailureClasses.has(match.failureClass)),
  }));
  const hasNonDiagnostic = groups.some((group) => !group.diagnostic);
  for (const { signature, matches } of groups.filter(
    (group) => !hasNonDiagnostic || !group.diagnostic,
  )) {
    const nodeIds = uniqueStrings(matches.map((match) => match.nodeId));
    const allOtherFailuresAreDiagnostic = entries.every(
      (entry) => matches.includes(entry) || diagnosticFailureClasses.has(entry.failureClass),
    );
    if (
      nodeIds.length < 2 &&
      (!allOtherFailuresAreDiagnostic || entries.length === matches.length)
    ) {
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

function isPostWorkValidationPhase(phase: RuntimeValidationPhase | null): boolean {
  return (
    phase === "integration_validation" ||
    phase === "final_proof_validation" ||
    phase === "review_validation" ||
    phase === "closeout_validation"
  );
}

function executableWorkerNodeKinds(): Set<string> {
  return new Set(["implementation", "test_authoring", "docs_update"]);
}

function postWorkValidationNodeBlockedByPendingExecutableWork(input: {
  snapshot: RuntimeWorkGraphSnapshot;
  node: TeamGraphNode;
}): string[] {
  if (input.node.nodeKind !== "validation" && input.node.nodeKind !== "test_review") {
    return [];
  }
  const metadata = jsonRecord(input.node.metadata);
  const validationPhase = normalizeRuntimeValidationPhase(
    metadata.validationPhase ?? metadata.validationNodePhase,
  );
  if (!isPostWorkValidationPhase(validationPhase)) {
    return [];
  }
  const workerKinds = executableWorkerNodeKinds();
  const workerNodes = input.snapshot.nodes.filter((node) => workerKinds.has(node.nodeKind));
  const pendingWorkerNodeIds = workerNodes
    .filter((node) => node.nodeStatus !== "succeeded" && node.nodeStatus !== "skipped")
    .map((node) => node.nodeId);
  if (pendingWorkerNodeIds.length === 0) {
    return [];
  }
  return pendingWorkerNodeIds.map(
    (workerNodeId) =>
      `validation_frontier_waiting_for_worker_evidence:${input.node.nodeId}:${workerNodeId}`,
  );
}

function selectRunnableParallelFrontier(input: {
  snapshot: RuntimeWorkGraphSnapshot;
  nodeAgentSessionRunnerConfigured?: boolean;
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
  const skippedReasonCodes: string[] = [];
  const candidates = input.snapshot.nodes.filter((node) => {
    if (node.nodeStatus !== "planned") {
      return false;
    }
    const replayEpochEligibility = evaluateBoundaryReplayChildEpochEligibility({
      nodeMetadata: jsonRecord(node.metadata),
      graphMetadata: jsonRecord(input.snapshot.graph.metadata),
    });
    if (!replayEpochEligibility.eligible) {
      skippedReasonCodes.push(
        ...replayEpochEligibility.reasonCodes.map((code) => `${code}:${node.nodeId}`),
      );
      return false;
    }
    if (
      !nodeHasNativeExecutionAdapter({
        node,
        nodeAgentSessionRunnerConfigured: input.nodeAgentSessionRunnerConfigured,
      })
    ) {
      return false;
    }
    const dependencies = nodeBlockingDependencies({
      snapshot: input.snapshot,
      nodeId: node.nodeId,
    });
    const dependenciesSatisfied = dependencies.every((dependency) => {
      const status = statusByNodeId.get(dependency.dependencyId);
      return status
        ? dependencyStatusSatisfiesTarget({
            targetNodeKind: node.nodeKind,
            edgeKind: dependency.edgeKind,
            dependencyStatus: status,
          })
        : false;
    });
    if (!dependenciesSatisfied) {
      return false;
    }
    const validationWaitReasonCodes = postWorkValidationNodeBlockedByPendingExecutableWork({
      snapshot: input.snapshot,
      node,
    });
    if (validationWaitReasonCodes.length > 0) {
      skippedReasonCodes.push(...validationWaitReasonCodes);
      return false;
    }
    return true;
  });
  const selectedNodes: TeamGraphNode[] = [];
  const conflictKeys = new Set<string>();
  const providerBudgetCounts = new Map<string, number>();
  const providerBudgetLimitByKey = new Map<string, number>();
  const providerBudgetRunnableIdsByKey = new Map<string, string[]>();
  const providerBudgetSelectedIdsByKey = new Map<string, string[]>();
  const providerBudgetSkippedIdsByKey = new Map<string, string[]>();
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

function firstMetadataString(metadata: Record<string, JsonValue>, keys: string[]): string | null {
  for (const key of keys) {
    const value = jsonString(metadata[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function branchSimilarityClassForDiagnostic(input: {
  nodeKind: string;
  capabilityId: string | null;
  executionIntent: string | null;
  evidenceMode: string[];
  lifecycleState: RuntimeNodeLifecycleState;
  missingFields: string[];
  reasonCodes: string[];
  contractVersion: string | null;
  schemaErrorPath: string | null;
  policyErrorPath: string | null;
  providerProfileId: string | null;
}): string {
  const stableCore = {
    nodeKind: input.nodeKind,
    capabilityId: input.capabilityId,
    executionIntent: input.executionIntent,
    evidenceMode: input.evidenceMode.slice().toSorted(),
    lifecycleState: input.lifecycleState,
    missingFields: input.missingFields.slice().toSorted(),
    reasonCodes: input.reasonCodes.slice().toSorted(),
    contractVersion: input.contractVersion,
    schemaErrorPath: input.schemaErrorPath,
    policyErrorPath: input.policyErrorPath,
    providerProfileId: input.providerProfileId,
  };
  return `frontier-root:${createHash("sha256")
    .update(JSON.stringify(stableCore))
    .digest("hex")
    .slice(0, 24)}`;
}

function frontierBlockedNodeDiagnostic(input: {
  graphId: string;
  iteration: number;
  branchIndex: number;
  node: TeamGraphNode;
}): RuntimeWorkGraphFrontierBlockedNodeDiagnostic {
  const metadata = jsonRecord(input.node.metadata ?? null);
  const executionIntent = firstMetadataString(metadata, [
    "executionIntent",
    "workIntentExecutionIntent",
    "targetWorkExecutionIntent",
  ]);
  const evidenceMode = jsonStringArray(metadata.evidenceMode).length
    ? jsonStringArray(metadata.evidenceMode)
    : jsonStringArray(metadata.targetWorkEvidenceMode);
  const projectionGate = firstMetadataString(metadata, ["nodeLifecycleProjectionGate"]);
  const missingFields = jsonStringArray(metadata.nodeLifecycleMissingFields);
  const reasonCodes = uniqueStrings([
    ...jsonStringArray(metadata.nodeLifecycleReasonCodes),
    ...jsonStringArray(metadata.lastStatusReasonCodes),
    ...(projectionGate ? [`node_lifecycle_projection_gate:${projectionGate}`] : []),
  ]).slice(0, 80);
  const contractRef = firstMetadataString(metadata, [
    "nodeExecutionContractRef",
    "parentNodeExecutionContractRef",
  ]);
  const contractVersion = firstMetadataString(metadata, [
    "nodeExecutionContractVersion",
    "contractVersion",
  ]);
  const schemaErrorPath = firstMetadataString(metadata, [
    "schemaErrorPath",
    "errorPath",
    "policySchemaPath",
  ]);
  const policyErrorPath = firstMetadataString(metadata, [
    "policyErrorPath",
    "policyPath",
    "authorityPolicyPath",
  ]);
  const providerProfileId = firstMetadataString(metadata, [
    "providerProfileId",
    "selectedProviderCapabilityProfileId",
    "modelProviderProfileId",
  ]);
  const capabilityId = nodeCapabilityId(input.node);
  const lifecycleState: RuntimeNodeLifecycleState = "needs_review";
  const diagnosticBase = {
    nodeKind: input.node.nodeKind,
    capabilityId,
    executionIntent,
    evidenceMode,
    lifecycleState,
    missingFields,
    reasonCodes,
    contractVersion,
    schemaErrorPath,
    policyErrorPath,
    providerProfileId,
  };
  return {
    artifactKind: "runtime_work_graph_frontier_blocked_node_diagnostic",
    schemaVersion: "execution-platform.runtime-work-graph.frontier-blocked-node-diagnostic.v1",
    graphId: input.graphId,
    iteration: input.iteration,
    branchId: `frontier:${input.iteration}:branch:${input.branchIndex}:${input.node.nodeId}`,
    nodeId: input.node.nodeId,
    nodeKind: input.node.nodeKind,
    capabilityId,
    executionIntent,
    evidenceMode,
    lifecycleState,
    missingFields,
    reasonCodes,
    contractRef,
    contractVersion,
    readinessRef: firstMetadataString(metadata, ["nodeLifecycleProjectionRef"]),
    schemaErrorPath,
    policyErrorPath,
    providerProfileId,
    branchSimilarityClass: branchSimilarityClassForDiagnostic(diagnosticBase),
    blockerSummary: firstMetadataString(metadata, ["blockerSummary"]),
    nextAllowedTransitions: jsonStringArray(metadata.nodeLifecycleNextLegalTransitions).slice(
      0,
      12,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function branchScopedMetadataString(
  metadata: Record<string, JsonValue>,
  keys: string[],
): string | null {
  return firstMetadataString(metadata, keys);
}

function branchScopedMetadataStrings(
  metadata: Record<string, JsonValue>,
  keys: string[],
): string[] {
  return uniqueStrings(keys.flatMap((key) => jsonStringArray(metadata[key]))).slice(0, 80);
}

function branchScopedDeclaredConsumerRefs(input: {
  snapshot: RuntimeWorkGraphSnapshot;
  node: TeamGraphNode;
  metadata: Record<string, JsonValue>;
}): string[] {
  const edgeConsumers = input.snapshot.edges
    .filter((edge) => edge.fromNodeId === input.node.nodeId && edge.toNodeId)
    .map((edge) => edge.toNodeId as string);
  return uniqueStrings([
    ...branchScopedMetadataStrings(input.metadata, [
      "consumerRefs",
      "dependentConsumers",
      "targetConsumerRefs",
      "downstreamConsumerRefs",
    ]),
    branchScopedMetadataString(input.metadata, ["consumerNodeId", "targetConsumerNodeId"]),
    ...edgeConsumers,
  ]).slice(0, 80);
}

function branchScopedDiagnosticOnly(metadata: Record<string, JsonValue>): boolean {
  return (
    metadata.diagnosticOnly === true ||
    metadata.lifecycleState === "diagnostic_only" ||
    metadata.contextNodeLifecycle === "diagnostic_only" ||
    metadata.replayStartPolicy === "diagnostic_only"
  );
}

function branchScopedRepairNodeRefs(input: {
  snapshot: RuntimeWorkGraphSnapshot;
  targetNodeId: string;
}): { repairNodeRefs: string[]; diagnosticOnlyNodeRefs: string[] } {
  const repairNodeRefs: string[] = [];
  const diagnosticOnlyNodeRefs: string[] = [];
  for (const node of input.snapshot.nodes) {
    const metadata = jsonRecord(node.metadata ?? null);
    const isRepairNode =
      node.nodeKind === "repair" ||
      metadata.runtimeOwnedContextRepairNode === true ||
      metadata.runtimeOwnedNodeScopedResourceFulfillment === true ||
      metadata.runtimeOwnedResourceRepairNode === true ||
      metadata.runtimeOwnedContractRepairNode === true;
    if (!isRepairNode) {
      continue;
    }
    const explicitTarget =
      branchScopedMetadataString(metadata, [
        "repairTargetNodeId",
        "diagnosticTargetNodeId",
        "targetNodeId",
      ]) === input.targetNodeId;
    const consumers = branchScopedDeclaredConsumerRefs({
      snapshot: input.snapshot,
      node,
      metadata,
    });
    const appliesToTarget = explicitTarget || consumers.includes(input.targetNodeId);
    if (!appliesToTarget) {
      continue;
    }
    const ref = graphRef("node", node.nodeId);
    if (branchScopedDiagnosticOnly(metadata) || consumers.length === 0) {
      diagnosticOnlyNodeRefs.push(ref);
    } else {
      repairNodeRefs.push(ref);
    }
  }
  return {
    repairNodeRefs: uniqueStrings(repairNodeRefs).slice(0, 40),
    diagnosticOnlyNodeRefs: uniqueStrings(diagnosticOnlyNodeRefs).slice(0, 40),
  };
}

function branchScopedStatus(input: {
  node: TeamGraphNode;
  readiness?: RuntimeNodeTransitionReadiness | null;
  branchResult?: SuperstepBranchResult | null;
}): RuntimeWorkGraphBranchScopedFrontierState["status"] {
  if (input.branchResult) {
    if (input.branchResult.status === "succeeded") {
      return "succeeded";
    }
    if (input.branchResult.status === "blocked_human_decision") {
      return "waiting_for_human";
    }
    if (input.branchResult.status.startsWith("blocked_")) {
      return "blocked";
    }
    if (input.branchResult.status === "failed_unrecoverable") {
      return "failed";
    }
    return "needs_review";
  }
  const metadata = jsonRecord(input.node.metadata ?? null);
  if (branchScopedDiagnosticOnly(metadata)) {
    return "diagnostic_only";
  }
  if (input.node.nodeStatus === "planned") {
    return input.readiness?.executable ? "ready" : "blocked";
  }
  if (input.node.nodeStatus === "failed") {
    return "failed";
  }
  if (input.node.nodeStatus === "needs_review") {
    return "needs_review";
  }
  if (input.node.nodeStatus === "waiting_for_human") {
    return "waiting_for_human";
  }
  if (input.node.nodeStatus === "running" || input.node.nodeStatus === "succeeded") {
    return input.node.nodeStatus;
  }
  return input.readiness?.executable ? "ready" : "blocked";
}

function branchBlockerSignature(input: {
  nodeId: string;
  status: RuntimeWorkGraphBranchScopedFrontierState["status"];
  blockerCode: string | null;
  schemaPath: string | null;
  policyPath: string | null;
  contractRef: string | null;
  readinessRef: string | null;
  reasonCodes: string[];
}): string | null {
  if (!["blocked", "failed", "needs_review", "diagnostic_only"].includes(input.status)) {
    return null;
  }
  return createHash("sha256")
    .update(
      JSON.stringify({
        nodeId: input.nodeId,
        status: input.status,
        blockerCode: input.blockerCode,
        schemaPath: input.schemaPath,
        policyPath: input.policyPath,
        contractRef: input.contractRef,
        readinessRef: input.readinessRef,
        reasonCodes: input.reasonCodes.slice().toSorted(),
      }),
    )
    .digest("hex")
    .slice(0, 24);
}

function buildBranchScopedFrontierStates(input: {
  graphId: string;
  iteration: number;
  snapshot: RuntimeWorkGraphSnapshot;
  selectedNodes: TeamGraphNode[];
  readinessByNodeId?: Map<string, RuntimeNodeTransitionReadiness>;
  blockedNodeDiagnostics?: RuntimeWorkGraphFrontierBlockedNodeDiagnostic[];
  branchResults?: SuperstepBranchResult[];
  rootCauseArtifact?: RuntimeWorkGraphFrontierRootCauseArtifact | null;
}): RuntimeWorkGraphBranchScopedFrontierState[] {
  const nodesById = new Map(input.snapshot.nodes.map((node) => [node.nodeId, node]));
  const selectedIds = new Set(input.selectedNodes.map((node) => node.nodeId));
  const branchResultByNodeId = new Map(
    (input.branchResults ?? []).map((branch) => [branch.nodeId, branch]),
  );
  const diagnosticByNodeId = new Map(
    (input.blockedNodeDiagnostics ?? []).map((diagnostic) => [diagnostic.nodeId, diagnostic]),
  );
  const candidateNodes = uniqueStrings([
    ...input.selectedNodes.map((node) => node.nodeId),
    ...(input.blockedNodeDiagnostics ?? []).map((diagnostic) => diagnostic.nodeId),
    ...(input.branchResults ?? []).map((branch) => branch.nodeId),
    ...input.snapshot.nodes
      .filter((node) =>
        ["running", "succeeded", "failed", "needs_review", "waiting_for_human"].includes(
          node.nodeStatus,
        ),
      )
      .map((node) => node.nodeId),
  ])
    .map((nodeId) => nodesById.get(nodeId))
    .filter((node): node is TeamGraphNode => Boolean(node))
    .slice(0, 80);
  const succeededNodes = input.snapshot.nodes.filter((node) => node.nodeStatus === "succeeded");
  const allSuccessfulEvidenceRefs = uniqueStrings(
    succeededNodes.flatMap((node) => node.outputArtifactRefs),
  ).slice(0, 80);
  const branchStates = candidateNodes.map((node, index) => {
    const metadata = jsonRecord(node.metadata ?? null);
    const branchResult = branchResultByNodeId.get(node.nodeId) ?? null;
    const diagnostic = diagnosticByNodeId.get(node.nodeId) ?? null;
    const readiness = input.readinessByNodeId?.get(node.nodeId) ?? null;
    const branchId =
      branchResult?.branchId ??
      diagnostic?.branchId ??
      branchScopedMetadataString(metadata, ["parallelFrontierBranchId", "branchId"]) ??
      (selectedIds.has(node.nodeId)
        ? `frontier:${input.iteration}:branch:${index + 1}:${node.nodeId}`
        : `frontier:${input.iteration}:sibling:${index + 1}:${node.nodeId}`);
    const status = branchScopedStatus({ node, readiness, branchResult });
    const reasonCodes = uniqueStrings([
      ...(branchResult?.reasonCodes ?? []),
      ...(diagnostic?.reasonCodes ?? []),
      ...(readiness?.reasonCodes ?? []),
      ...branchScopedMetadataStrings(metadata, ["lastStatusReasonCodes", "reasonCodes"]),
    ]).slice(0, 80);
    const contractRef =
      diagnostic?.contractRef ??
      branchScopedMetadataString(metadata, [
        "nodeExecutionContractRef",
        "parentNodeExecutionContractRef",
      ]);
    const readinessRef =
      branchResult?.nodeLifecycleProjectionRef ??
      diagnostic?.readinessRef ??
      branchScopedMetadataString(metadata, ["nodeLifecycleProjectionRef"]);
    const schemaPath =
      branchResult?.errorPath ??
      diagnostic?.schemaErrorPath ??
      branchScopedMetadataString(metadata, ["schemaErrorPath", "lastFailedFieldPath"]);
    const policyPath =
      diagnostic?.policyErrorPath ?? branchScopedMetadataString(metadata, ["policyErrorPath"]);
    const blockerCode = branchResult?.failureClass ?? diagnostic?.lifecycleState ?? null;
    const blockerSummary =
      branchResult?.blockerSummary ??
      diagnostic?.blockerSummary ??
      branchScopedMetadataString(metadata, ["blockerSummary"]);
    const declaredConsumers = branchScopedDeclaredConsumerRefs({
      snapshot: input.snapshot,
      node,
      metadata,
    });
    const repairRefs = branchScopedRepairNodeRefs({
      snapshot: input.snapshot,
      targetNodeId: node.nodeId,
    });
    const failedEvidenceRefs =
      status === "failed" || status === "needs_review" || status === "blocked"
        ? uniqueStrings([
            ...(branchResult?.evidenceRefs ?? []),
            ...node.outputArtifactRefs,
            ...branchScopedMetadataStrings(metadata, ["failedEvidenceRefs", "evidenceRefs"]),
          ]).slice(0, 80)
        : [];
    const successfulEvidenceRefs =
      status === "succeeded"
        ? uniqueStrings([...node.outputArtifactRefs, ...(branchResult?.evidenceRefs ?? [])]).slice(
            0,
            80,
          )
        : allSuccessfulEvidenceRefs.filter((ref) => !failedEvidenceRefs.includes(ref)).slice(0, 80);
    const nextLegalTransitions = uniqueStrings([
      branchResult?.nextTransition,
      ...(diagnostic?.nextAllowedTransitions ?? []),
      ...(readiness?.nextAllowedTransitions ?? []),
      ...branchScopedMetadataStrings(metadata, ["nextLegalTransitions"]),
    ]).slice(0, 40);
    const blockerSignature = branchBlockerSignature({
      nodeId: node.nodeId,
      status,
      blockerCode,
      schemaPath,
      policyPath,
      contractRef,
      readinessRef,
      reasonCodes,
    });
    return {
      artifactKind: "runtime_work_graph_branch_scoped_frontier_state" as const,
      schemaVersion: "execution-platform.runtime-work-graph.branch-scoped-frontier.v1" as const,
      graphId: input.graphId,
      currentSuperstep: input.iteration,
      branchId,
      parentBranchId: branchScopedMetadataString(metadata, ["parentBranchId"]),
      nodeId: node.nodeId,
      nodeKind: node.nodeKind,
      sourceRequirementRef: branchScopedMetadataString(metadata, [
        "sourceRequirementRef",
        "requirementId",
      ]),
      contractRef,
      readinessRef,
      sourceMaterialRequirementRefs: branchScopedMetadataStrings(metadata, [
        "sourceMaterialRequirementRefs",
      ]),
      status,
      blocker:
        blockerSignature || blockerSummary || reasonCodes.length > 0
          ? {
              code: blockerCode,
              summary: blockerSummary,
              schemaPath,
              policyPath,
              reasonCodes,
            }
          : null,
      blockerSignature,
      consumerRefs: declaredConsumers,
      dependentConsumers: declaredConsumers,
      siblingBranchIds: [],
      successfulEvidenceRefs,
      failedEvidenceRefs,
      repairNodeRefs: repairRefs.repairNodeRefs,
      diagnosticOnlyNodeRefs: repairRefs.diagnosticOnlyNodeRefs,
      nextLegalTransitions,
      branchClosureState: branchResult?.branchClosureState ?? "not_applicable",
      branchLocalTransitionPending: branchResult?.branchLocalTransitionPending === true,
      capabilityId: diagnostic?.capabilityId ?? nodeCapabilityId(node),
      executorKey: executorKeyForNode(node)[0] ?? null,
      modelRef: branchScopedMetadataString(metadata, ["modelRef"]),
      workerRef: node.modelOrWorkerRef ?? branchScopedMetadataString(metadata, ["workerRef"]),
      phase: branchScopedMetadataString(metadata, ["nodeLifecycleState", "schedulerPhase"]),
      objectiveSummary: boundedRuntimeWorkGraphString(
        branchScopedMetadataString(metadata, ["exactObjective", "currentObjective", "summary"]) ??
          node.assignedRole,
        500,
      ),
      whySelected: branchScopedMetadataString(metadata, ["whySelected", "whyThisNodeWasChosen"]),
      currentToolId: branchScopedMetadataString(metadata, ["currentToolId", "schedulerToolId"]),
      currentToolInvocationRef: branchScopedMetadataString(metadata, [
        "currentToolInvocationRef",
        "schedulerToolInvocationRef",
      ]),
      targetRefSummary: nodeSchedulingTargetRefs(node),
      readinessStatus:
        readiness?.lifecycleState ??
        branchScopedMetadataString(metadata, ["nodeLifecycleProjectionStatus"]),
      rootCauseRef: input.rootCauseArtifact?.lastOccurrenceRef ?? null,
      rootCauseSystemic: input.rootCauseArtifact?.systemic ?? null,
      updatedAt: new Date().toISOString(),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    } satisfies RuntimeWorkGraphBranchScopedFrontierState;
  });
  const branchIds = branchStates.map((branch) => branch.branchId);
  return branchStates.map((branch) => ({
    ...branch,
    siblingBranchIds: branchIds.filter((branchId) => branchId !== branch.branchId).slice(0, 80),
  }));
}

function buildSchedulerFrontierState(input: {
  graphId: string;
  iteration: number;
  snapshot: RuntimeWorkGraphSnapshot;
  frontier: ReturnType<typeof selectRunnableParallelFrontier>;
  missionLedger: MissionContractLedger | null;
}): RuntimeWorkGraphSchedulerFrontierState {
  const frontierReady = new Set(input.frontier.rawRunnableNodeIds);
  const selected = new Set(input.frontier.selectedNodes.map((node) => node.nodeId));
  const plannedNodes = input.snapshot.nodes.filter((node) => node.nodeStatus === "planned");
  const blocked = plannedNodes
    .filter((node) => !frontierReady.has(node.nodeId))
    .map((node) => node.nodeId)
    .slice(0, 80);
  const nodesById = new Map(input.snapshot.nodes.map((node) => [node.nodeId, node]));
  const blockedNodeDiagnostics = blocked
    .map((nodeId, index) => {
      const node = nodesById.get(nodeId);
      return node
        ? frontierBlockedNodeDiagnostic({
            graphId: input.graphId,
            iteration: input.iteration,
            branchIndex: index + 1,
            node,
          })
        : null;
    })
    .filter(
      (diagnostic): diagnostic is RuntimeWorkGraphFrontierBlockedNodeDiagnostic =>
        diagnostic !== null,
    )
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
    plannedNodes.flatMap((node) => contextRefsFromMetadata(jsonRecord(node.metadata))),
  ).slice(0, 60);
  const reasonCodes = uniqueStrings([
    "scheduler_canonical_frontier_state_evaluated",
    `scheduler_frontier_ready_count:${input.frontier.rawRunnableNodeIds.length}`,
    `scheduler_frontier_selected_count:${input.frontier.selectedNodes.length}`,
    `scheduler_frontier_blocked_count:${blocked.length}`,
    ...input.frontier.skippedReasonCodes.slice(0, 20),
  ]);
  const nextLegalTransition =
    input.frontier.selectedNodes.length > 0
      ? "execute_frontier"
      : providerBudgetBlockedNodeIds.length > 0 || skippedConflictNodeIds.length > 0
        ? "wait_for_locks_or_provider_budget"
        : blocked.length > 0
          ? "repair_or_create_prerequisite"
          : "request_orchestrator_decision";
  const branchScopedFrontierStates = buildBranchScopedFrontierStates({
    graphId: input.graphId,
    iteration: input.iteration,
    snapshot: input.snapshot,
    selectedNodes: input.frontier.selectedNodes,
    blockedNodeDiagnostics,
  });
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
    nonRunnableNodeIds: blocked,
    dependencyBlockedNodeIds: blocked.filter(
      (nodeId) => nodeBlockingDependencies({ snapshot: input.snapshot, nodeId }).length > 0,
    ),
    contextBlockedNodeIds: [],
    resourceBlockedNodeIds: [],
    validationBlockedNodeIds: [],
    reviewBlockedNodeIds: blocked.filter(
      (nodeId) => nodesById.get(nodeId)?.nodeKind === "reviewer",
    ),
    closeoutBlockedNodeIds: blocked.filter(
      (nodeId) => nodesById.get(nodeId)?.nodeKind === "closeout",
    ),
    branchIds: input.frontier.selectedNodes
      .map((node, index) => `frontier:${input.iteration}:branch:${index + 1}:${node.nodeId}`)
      .slice(0, 80),
    readinessRefs: plannedNodes
      .map((node) => node.nodeId)
      .map((nodeId) =>
        schedulerFrontierStateRef({ graphId: input.graphId, nodeId, suffix: "frontier-state" }),
      )
      .slice(0, 80),
    contextRefs,
    openCommitmentIds: remainingOpenCommitmentIds(input.missionLedger).slice(0, 80),
    lockConflictNodeIds: skippedConflictNodeIds,
    providerBudgetBlockedNodeIds,
    nextLegalTransition,
    reasonCodes,
    blockedNodeDiagnostics,
    branchScopedFrontierStates,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

type RuntimeWorkGraphPersistenceOutcome = {
  createdNodeIds: string[];
  reusedNodeIds: string[];
  createdEdgeIds: string[];
  reusedEdgeIds: string[];
  projectionFailedNodeIds: string[];
  projectionReasonCodes: string[];
};

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
    const updateBlockingCommitments = Array.isArray(update.blockingCommitments)
      ? update.blockingCommitments
      : [];
    const updateNonBlockingCommitments = Array.isArray(update.nonBlockingCommitments)
      ? update.nonBlockingCommitments
      : [];
    const mergedBlockingCommitments = Array.isArray(merged.blockingCommitments)
      ? merged.blockingCommitments
      : [];
    const mergedNonBlockingCommitments = Array.isArray(merged.nonBlockingCommitments)
      ? merged.nonBlockingCommitments
      : [];
    const mergedRevisionProposals = Array.isArray(merged.revisionProposals)
      ? merged.revisionProposals
      : [];
    const updateRevisionProposals = Array.isArray(update.revisionProposals)
      ? update.revisionProposals
      : [];
    const blockingById = new Map(
      updateBlockingCommitments.map((commitment) => [commitment.commitmentId, commitment]),
    );
    const nonBlockingById = new Map(
      updateNonBlockingCommitments.map((commitment) => [commitment.commitmentId, commitment]),
    );
    merged = recomputeMissionLedgerStatus({
      ...merged,
      blockingCommitments: mergedBlockingCommitments.map((commitment) => {
        const updateCommitment = blockingById.get(commitment.commitmentId);
        return updateCommitment ? mergeCommitment(commitment, updateCommitment) : commitment;
      }),
      nonBlockingCommitments: mergedNonBlockingCommitments.map((commitment) => {
        const updateCommitment = nonBlockingById.get(commitment.commitmentId);
        return updateCommitment ? mergeCommitment(commitment, updateCommitment) : commitment;
      }),
      revisionProposals: [...mergedRevisionProposals, ...updateRevisionProposals].slice(0, 12),
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

function runtimeOwnedGraphPatchNodeId(input: { graphId: string; nodeSeedId: string }): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        graphId: input.graphId,
        nodeSeedId: input.nodeSeedId,
      }),
    )
    .digest("hex")
    .slice(0, 24);
  return `node-${digest}`;
}

function schedulerGraphPatchNodeSeedId(input: {
  node: OrchestratorGraphNodeSpec;
  index: number;
}): string {
  const metadata = jsonRecord(input.node.metadata ?? null);
  return (
    jsonString(metadata.schedulerGraphPatchNodeSeedId) ??
    jsonString(metadata.nodeSeedId) ??
    input.node.nodeId ??
    `seed-node-${input.index + 1}`
  );
}

function remapSchedulerGraphPatchTopologyForRuntimePersistence(input: {
  graphId: string;
  nodes: OrchestratorGraphNodeSpec[];
  edges: NonNullable<OrchestratorGraphDecision["newEdges"]>;
}): {
  nodes: OrchestratorGraphNodeSpec[];
  edges: NonNullable<OrchestratorGraphDecision["newEdges"]>;
  runtimeNodeIdBySeedId: Map<string, string>;
} {
  const runtimeNodeIdBySeedId = new Map<string, string>();
  const nodes = input.nodes.map((node, index) => {
    const seedId = schedulerGraphPatchNodeSeedId({ node, index });
    const runtimeNodeId = runtimeOwnedGraphPatchNodeId({
      graphId: input.graphId,
      nodeSeedId: seedId,
    });
    runtimeNodeIdBySeedId.set(seedId, runtimeNodeId);
    runtimeNodeIdBySeedId.set(node.nodeId, runtimeNodeId);
    const metadata = jsonRecord(node.metadata ?? null);
    return {
      ...node,
      nodeId: runtimeNodeId,
      metadata: {
        ...metadata,
        schedulerGraphPatchNodeSeedId: seedId,
        schedulerGraphPatchRuntimeNodeId: runtimeNodeId,
        runtimeOwnedSchedulerGraphPatchNode: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } satisfies JsonValue,
    };
  });
  const edges = input.edges.map((edge, index) => {
    const metadata = jsonRecord(edge.metadata ?? null);
    const fromNodeSeedId = jsonString(metadata.fromNodeSeedId) ?? edge.fromNodeId ?? null;
    const toNodeSeedId = jsonString(metadata.toNodeSeedId) ?? edge.toNodeId ?? null;
    const fromNodeId = fromNodeSeedId
      ? (runtimeNodeIdBySeedId.get(fromNodeSeedId) ?? edge.fromNodeId ?? null)
      : null;
    const toNodeId = toNodeSeedId
      ? (runtimeNodeIdBySeedId.get(toNodeSeedId) ?? edge.toNodeId ?? null)
      : null;
    const edgeSeedId = jsonString(metadata.schedulerGraphPatchEdgeSeedId) ?? edge.edgeId ?? null;
    const runtimeEdgeId = runtimeOwnedEdgeId({
      graphId: input.graphId,
      edgeId: edgeSeedId,
      fromNodeId,
      toNodeId,
      edgeKind: edge.edgeKind,
      index,
    });
    return {
      ...edge,
      edgeId: runtimeEdgeId,
      fromNodeId,
      toNodeId,
      metadata: {
        ...metadata,
        schedulerGraphPatchEdgeSeedId: edgeSeedId,
        fromNodeSeedId,
        toNodeSeedId,
        schedulerGraphPatchRuntimeEdgeId: runtimeEdgeId,
        runtimeOwnedSchedulerGraphPatchEdge: true,
        rawPromptStored: false,
        rawResponseStored: false,
      } satisfies JsonValue,
    };
  });
  return { nodes, edges, runtimeNodeIdBySeedId };
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
  const canonicalContextRefs = {
    sourceMaterialRefs: uniqueStrings([
      jsonString(metadata.sourceMaterialRef),
      ...jsonStringArray(metadata.sourceMaterialRefs),
      ...jsonStringArray(metadata.contextRefs),
    ]).slice(0, 40),
    sourceMaterialRequirementRefs: jsonStringArray(metadata.sourceMaterialRequirementRefs).slice(
      0,
      40,
    ),
    sufficiencyStatus: jsonString(metadata.sufficiencyStatus),
    sourceMaterialStatus: jsonString(metadata.sourceMaterialStatus),
    consumerWorkIntentNodeId: jsonString(metadata.consumerWorkIntentNodeId),
    relevantFileRefs: jsonStringArray(metadata.relevantFileRefs).slice(0, 40),
    evidenceRefs: jsonStringArray(metadata.evidenceRefs).slice(0, 40),
  };
  const encoded = JSON.stringify(metadata);
  if (Buffer.byteLength(encoded, "utf8") <= 8_000) {
    return {
      ...metadata,
      ...canonicalContextRefs,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    } satisfies JsonValue;
  }
  return {
    metadataCompactedForRuntimeToolTrace: true,
    metadataOriginalByteLength: Buffer.byteLength(encoded, "utf8"),
    ownerSummary:
      typeof metadata.ownerSummary === "string"
        ? boundedRuntimeWorkGraphString(metadata.ownerSummary, 240)
        : null,
    ...canonicalContextRefs,
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

function jsonStringArray(value: JsonValue | unknown | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function jsonString(value: JsonValue | unknown | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function jsonContextSnapshotArray(value: JsonValue | unknown | undefined): ContextSnapshotRef[] {
  return normalizeContextSnapshotRefs(value);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

function contextRefsFromMetadata(metadata: Record<string, JsonValue>): string[] {
  return uniqueStrings([
    jsonString(metadata.contextBrokerRequestRef),
    jsonString(metadata.sourceMaterialRequirementRef),
    jsonString(metadata.sourceMaterialRef),
    ...jsonStringArray(metadata.contextBrokerRequestRefs),
    ...jsonStringArray(metadata.sourceMaterialRequirementRefs),
    ...jsonStringArray(metadata.contextPacketRefs),
    ...jsonStringArray(metadata.sourceMaterialRefs),
    ...jsonStringArray(metadata.contextRefs),
    ...jsonContextSnapshotArray(metadata.contextSnapshotRefs).map((ref) => ref.snapshotRef),
    ...jsonContextSnapshotArray(metadata.providedContextSnapshotRefs).map((ref) => ref.snapshotRef),
    ...jsonContextSnapshotArray(metadata.requiredContextSnapshotRefs).map((ref) => ref.snapshotRef),
  ]);
}

function buildSchedulerGraphAmendmentRequestForSnapshot(input: {
  graphId: string;
  iteration: number;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  requirementMap: RequirementMap | null;
}): SchedulerGraphAmendmentRequest | null {
  if (!input.requirementMap || input.snapshotSummary.nodeSummaries.length === 0) {
    return null;
  }
  const affectedNodeIds = input.snapshotSummary.nodeSummaries
    .filter((node) =>
      ["failed", "needs_review", "blocked", "planned", "waiting_for_human"].includes(
        node.nodeStatus,
      ),
    )
    .map((node) => node.nodeId)
    .slice(0, 80);
  const hasBlockedNode = input.snapshotSummary.nodeSummaries.some((node) =>
    ["failed", "needs_review", "blocked"].includes(node.nodeStatus),
  );
  return {
    artifactKind: "scheduler_graph_amendment_request",
    schemaVersion: "execution-platform.scheduler-graph-amendment-request.v1",
    requestId: `scheduler-graph-amendment-${input.graphId}-${input.iteration}`,
    graphId: input.graphId,
    amendmentKind: hasBlockedNode ? "repair_blocked_node" : "add_requirements",
    affectedRequirementIds: requirementMapSchedulerRunnableIds(input.requirementMap).slice(0, 80),
    affectedNodeIds,
    rationale:
      "Runtime graph already contains nodes; SchedulerStageRunner must compile an amendment patch instead of an initial graph.",
    reasonCodes: [
      "scheduler_graph_amendment_request_built_from_existing_graph",
      hasBlockedNode
        ? "scheduler_graph_amendment_repair_blocked_node"
        : "scheduler_graph_amendment_add_requirements",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
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
  missionLedgerCompatibleEvidenceClaims: CommitmentEvidenceClaim[];
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
  const totalEvidenceClaimCount = input.result.evidenceClaims?.length ?? 0;
  const compatibleEvidenceClaimCount = input.missionLedgerCompatibleEvidenceClaims.length;
  const hasEvidenceClaims = compatibleEvidenceClaimCount > 0;
  const hasNonStrictArtifactEvidence =
    !input.requireEvidenceClaimsForMissionLedger && input.result.outputArtifactRefs.length > 0;
  const explicitEvaluationRequest = input.result.reasonCodes.some((code) =>
    code.includes("mission_contract_evaluation_requested"),
  );
  const eventClass =
    input.node.nodeKind === "closeout" ? "closeout" : (roleClass ?? input.node.nodeKind);
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
      compatibleEvidenceClaimCount,
      incompatibleEvidenceClaimCount: Math.max(
        0,
        totalEvidenceClaimCount - compatibleEvidenceClaimCount,
      ),
      validationPhases: uniqueStrings(
        (input.result.evidenceClaims ?? [])
          .map((claim) => claim.validationPhase)
          .filter((phase): phase is NonNullable<typeof phase> => typeof phase === "string"),
      ).slice(0, 20),
      validationPhaseCompatibility: uniqueStrings(
        (input.result.evidenceClaims ?? [])
          .map((claim) => claim.validationPhaseCompatibility)
          .filter((status): status is NonNullable<typeof status> => typeof status === "string"),
      ).slice(0, 20),
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

function commitmentIdsForLedger(ledger: MissionContractLedger | null): Set<string> {
  const blockingCommitments = Array.isArray(ledger?.blockingCommitments)
    ? ledger.blockingCommitments
    : [];
  const nonBlockingCommitments = Array.isArray(ledger?.nonBlockingCommitments)
    ? ledger.nonBlockingCommitments
    : [];
  return new Set(
    ledger
      ? [...blockingCommitments, ...nonBlockingCommitments].map(
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

function schedulerDecisionCapabilityPhase(input: {
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
}): RuntimeNodeCapabilityPhase {
  if (input.snapshotSummary.nodeSummaries.length === 0) {
    return "decomposition";
  }
  return "execution";
}

type RuntimeNodeTransitionReadiness = {
  artifactKind: "runtime_node_transition_readiness";
  schemaVersion: "execution-platform.runtime-node-transition-readiness.v1";
  nodeId: string;
  nodeKind: string;
  nodeClass: "prerequisite" | "barrier" | "executable";
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
  prerequisiteTransition: null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

type NodeLifecycleSchedulerTransitionContext = {
  missionLedger: MissionContractLedger | null;
  executedNodeIds: string[];
  addedNodeIds: string[];
  loopGuard: RuntimeWorkGraphLoopGuard;
};

function validateEvidenceClaims(input: {
  claims: CommitmentEvidenceClaim[];
  ledger: MissionContractLedger | null;
  outputArtifactRefs: string[];
  validationRefs: string[];
  changedFileRefs: string[];
  nodeKind: string;
}): string[] {
  const reasonCodes: string[] = [];
  const knownCommitments = commitmentIdsForLedger(input.ledger);
  const knownEvidence = new Set([
    ...input.outputArtifactRefs,
    ...input.validationRefs,
    ...input.changedFileRefs,
  ]);
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
    const validationPhase = normalizeRuntimeValidationPhase(claim.validationPhase);
    if (!validationPhase) {
      reasonCodes.push(`evidence_claim_validation_phase_missing_or_invalid:${claim.commitmentId}`);
    } else {
      const compatibility = evaluateEvidenceClaimValidationPhase({
        evidenceKind: claim.evidenceKind,
        validationPhase,
        validationRefs: uniqueStrings([...(claim.validationRefs ?? []), ...input.validationRefs]),
        changedFileRefs: uniqueStrings([
          ...(claim.changedFileRefs ?? []),
          ...input.changedFileRefs,
        ]),
        nodeKind: input.nodeKind,
      });
      if (compatibility.status === "incompatible") {
        reasonCodes.push(
          `evidence_claim_validation_phase_incompatible:${claim.commitmentId}:${claim.evidenceKind}:${validationPhase}`,
        );
        reasonCodes.push(...compatibility.reasonCodes);
      }
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
  validationRefs: string[];
  changedFileRefs: string[];
}): { claims: CommitmentEvidenceClaim[]; reasonCodes: string[] } {
  const reasonCodes: string[] = [];
  const claims = input.claims.map((claim) => {
    const explicitEvidenceKind = normalizedEvidenceKindForClaim(claim);
    const evidenceKind = explicitEvidenceKind ?? "artifact";
    const explicitValidationPhase = normalizeRuntimeValidationPhase(claim.validationPhase);
    const validationPhase = explicitValidationPhase ?? "diagnostic_validation";
    const validationRefs = uniqueStrings([
      ...(claim.validationRefs ?? []),
      ...input.validationRefs,
    ]).slice(0, 20);
    const changedFileRefs = uniqueStrings([
      ...(claim.changedFileRefs ?? []),
      ...input.changedFileRefs,
    ]).slice(0, 20);
    const compatibility = evaluateEvidenceClaimValidationPhase({
      evidenceKind,
      validationPhase,
      validationRefs,
      changedFileRefs,
    });
    const storageFlags = claim as unknown as Record<string, unknown>;
    if (!explicitEvidenceKind) {
      reasonCodes.push(`evidence_claim_kind_missing_or_invalid:${claim.commitmentId}`);
    }
    if (!explicitValidationPhase) {
      reasonCodes.push(`evidence_claim_validation_phase_missing_or_invalid:${claim.commitmentId}`);
    }
    return {
      ...claim,
      evidenceKind,
      evidenceRef: claim.evidenceRef,
      validationPhase,
      validationRefs,
      changedFileRefs,
      validationPhaseCompatibility: compatibility.status,
      validationPhaseReasonCodes: uniqueStrings([
        ...(claim.validationPhaseReasonCodes ?? []),
        ...(!explicitValidationPhase
          ? ["evidence_claim_validation_phase_missing_normalized_to_diagnostic"]
          : []),
        ...compatibility.reasonCodes,
      ]).slice(0, 20),
      rawPromptStored: storageFlags.rawPromptStored === true ? (true as false) : false,
      rawResponseStored: storageFlags.rawResponseStored === true ? (true as false) : false,
      rawProviderLogStored: storageFlags.rawProviderLogStored === true ? (true as false) : false,
      rawToolLogStored: storageFlags.rawToolLogStored === true ? (true as false) : false,
      rawDbRowsStored: storageFlags.rawDbRowsStored === true ? (true as false) : false,
    } as CommitmentEvidenceClaim;
  });
  return { claims, reasonCodes };
}

function missionLedgerCompatibleEvidenceClaims(input: {
  claims: CommitmentEvidenceClaim[];
  nodeKind: string;
  validationRefs: string[];
  changedFileRefs: string[];
}): CommitmentEvidenceClaim[] {
  return input.claims.filter((claim) => {
    const validationPhase = normalizeRuntimeValidationPhase(claim.validationPhase);
    if (!validationPhase) {
      return false;
    }
    return evaluateEvidenceClaimValidationPhase({
      evidenceKind: claim.evidenceKind,
      validationPhase,
      validationRefs: uniqueStrings([...(claim.validationRefs ?? []), ...input.validationRefs]),
      changedFileRefs: uniqueStrings([...(claim.changedFileRefs ?? []), ...input.changedFileRefs]),
      nodeKind: input.nodeKind,
    }).compatibleForMissionLedger;
  });
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
  if (!input.requireEvidenceClaims || !input.ledger || input.resultStatus !== "succeeded") {
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
    if (input.claimReasonCodes.length > 0) {
      reasonCodes.push(`mission_evidence_claims_invalid:${input.node.nodeId}`);
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

function failedBoundaryKindForNode(
  node: TeamGraphNode,
): RuntimeRepairClassification["failedBoundaryKind"] {
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
  nodeAgentSessionRunnerConfigured?: boolean;
}): { ready: boolean; closeoutRefs: string[]; pendingNodeIds: string[]; reasonCodes: string[] } {
  const reasonCodes: string[] = [];
  if (input.missionLedger && missionLedgerHasOpenBlockingCommitments(input.missionLedger)) {
    reasonCodes.push("scheduler_completion_blocked_by_open_mission_commitments");
  }
  const executableNodes = input.snapshot.nodes.filter((node) =>
    nodeHasNativeExecutionAdapter({
      node,
      nodeAgentSessionRunnerConfigured: input.nodeAgentSessionRunnerConfigured,
    }),
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

function evaluateLoopGuard(input: {
  guard: RuntimeWorkGraphLoopGuard;
  node: TeamGraphNode;
  result: RuntimeWorkGraphNodeExecutionResult;
  missionLedgerBefore: MissionContractLedger | null;
  missionLedgerAfter: MissionContractLedger | null;
}): RuntimeWorkGraphLoopGuardDecision {
  const signature = nodeLoopSignature(input.node);
  const outputArtifactRefs = Array.isArray(input.result.outputArtifactRefs)
    ? input.result.outputArtifactRefs
    : [];
  const newEvidenceRefs = outputArtifactRefs.filter(
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
  for (const ref of outputArtifactRefs) {
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
  private readonly maxSchedulerToolTurns: number;
  private readonly maxParallelNodeExecutions: number;
  private readonly capabilityManifest: RuntimeNodeCapabilityManifest;
  private readonly expansionAdmissionPolicy: RuntimeWorkGraphExpansionAdmissionPolicy;
  private readonly nodeLifecycleTransitionRunner: NodeLifecycleTransitionRunner;
  private readonly recentNodeResultSummaries: RuntimeWorkGraphRecentNodeResultSummary[] = [];

  constructor(private readonly options: RuntimeWorkGraphSchedulerOptions) {
    this.maxIterations = options.maxIterations ?? 24;
    this.maxDecisionRepairAttempts = options.maxDecisionRepairAttempts ?? 2;
    this.maxSchedulerToolTurns = Math.max(
      this.maxDecisionRepairAttempts + 1,
      Math.min(64, options.maxSchedulerToolTurns ?? 40),
    );
    this.maxParallelNodeExecutions = Math.max(
      1,
      Math.min(16, options.maxParallelNodeExecutions ?? 1),
    );
    this.capabilityManifest = options.capabilityManifest ?? buildRuntimeNodeCapabilityManifest();
    this.expansionAdmissionPolicy = {
      ...DEFAULT_EXPANSION_ADMISSION_POLICY,
      ...options.expansionAdmissionPolicy,
    };
    this.nodeLifecycleTransitionRunner = new NodeLifecycleTransitionRunner({
      capabilityManifest: this.capabilityManifest,
      resolveNodeAgentProfile: this.options.resolveNodeAgentProfile,
      recordProjection: async (input) => this.recordNodeLifecycleProjection(input),
      recordNodeExecutionSnapshot: async (input) => this.recordNodeExecutionSnapshot(input),
    });
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
      const nodeLifecycle = await this.nodeLifecycleTransitionRunner.drain({
        graphId,
        iteration,
        snapshot,
        maxTransitions: 1,
        excludeGateKinds: ["node_agent_session_ready"],
        transitionContext: {
          missionLedger,
          executedNodeIds,
          addedNodeIds,
          loopGuard,
        } satisfies NodeLifecycleSchedulerTransitionContext,
      });
      if (nodeLifecycle.hasPendingLegalTransitions || nodeLifecycle.actionTaken) {
        decisionRefs.push(...nodeLifecycle.refs);
        reasonCodes.push(...nodeLifecycle.reasonCodes);
        if (nodeLifecycle.status !== "continue") {
          return await this.result({
            status: nodeLifecycle.status,
            graphId,
            iterations: iteration,
            executedNodeIds,
            addedNodeIds,
            decisionRefs,
            reasonCodes,
            missionLedger: missionLedger ? summarizeMissionContractLedger(missionLedger) : null,
          });
        }
        if (nodeLifecycle.continueLoop || nodeLifecycle.actionTaken) {
          continue;
        }
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
      const completionReady = schedulerGraphCompletionReady({
        snapshot,
        missionLedger,
        nodeAgentSessionRunnerConfigured: Boolean(this.options.nodeAgentSessionRunner),
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
        snapshot,
        snapshotSummary: summarizeSnapshot(snapshot),
        missionLedger,
      });
      decisionRefs.push(...decisionRequest.decisionRefs);
      reasonCodes.push(...decisionRequest.reasonCodes);
      if (decisionRequest.graphPatch) {
        const graphPatchTool = await this.recordSchedulerTool({
          graphId,
          iteration,
          toolId: "scheduler.accept_graph_patch",
          idempotencyKey: `iteration:${iteration}:scheduler-graph-patch:${decisionRequest.graphPatch.patchHash}`,
          inputRef: decisionRequest.graphPatch.patchRef,
          inputHash: decisionRequest.graphPatch.patchHash,
          inputSummary: `Persist SchedulerGraphPatch ${decisionRequest.graphPatch.patchId} with ${decisionRequest.nodeSpecs.length} node(s) and ${decisionRequest.edgeSpecs.length} edge(s).`,
          metadata: {
            schedulerGraphPatchRef: decisionRequest.graphPatch.patchRef,
            schedulerGraphPatchHash: decisionRequest.graphPatch.patchHash,
            schedulerGraphPatchNodeSeedCount: decisionRequest.graphPatch.nodeSeeds.length,
            schedulerGraphPatchEdgeCount: decisionRequest.graphPatch.edges.length,
            sourceRequirementMapRef: decisionRequest.graphPatch.sourceRequirementMapRef,
            schedulerPhase: "scheduler_graph_patch_accepted",
            reasonCodes: [
              "scheduler_graph_patch_accepted",
              "scheduler_graph_patch_runtime_persistence_start",
            ],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        });
        decisionRefs.push(...graphPatchTool.refs);
        try {
          await this.addNodes({
            graphId,
            nodes: decisionRequest.nodeSpecs,
            edges: decisionRequest.edgeSpecs,
            addedNodeIds,
            iteration,
          });
        } catch (error) {
          const summary = error instanceof Error ? error.message : String(error);
          return await this.result({
            status: "needs_review",
            graphId,
            iterations: iteration,
            executedNodeIds,
            addedNodeIds,
            decisionRefs,
            reasonCodes: uniqueStrings([
              ...reasonCodes,
              ...graphPatchTool.reasonCodes,
              "scheduler_graph_patch_persistence_needs_review",
              `scheduler_graph_patch_persistence_error:${summary.slice(0, 180)}`,
            ]),
            missionLedger: missionLedger ? summarizeMissionContractLedger(missionLedger) : null,
          });
        }
        reasonCodes.push(
          ...graphPatchTool.reasonCodes,
          "scheduler_graph_patch_persisted",
          "scheduler_graph_patch_handoff_to_node_lifecycle_runner",
        );
        continue;
      }
      return await this.result({
        status: "needs_review",
        graphId,
        iterations: iteration,
        executedNodeIds,
        addedNodeIds,
        decisionRefs,
        reasonCodes: uniqueStrings([
          ...decisionRequest.reasonCodes,
          "scheduler_stage_graph_patch_required",
          "no_fallback_graph_injected",
        ]),
        missionLedger: missionLedger ? summarizeMissionContractLedger(missionLedger) : null,
      });
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

  private async recordNodeLifecycleProjection(input: {
    graphId: string;
    iteration: number;
    snapshot: RuntimeWorkGraphSnapshot;
    node: TeamGraphNode;
    projection: NodeLifecycleProjection;
    manifest: NodeLifecycleProjectionManifest;
  }): Promise<{ refs: string[]; reasonCodes: string[] }> {
    await this.options.graphs.recordArtifactManifest({
      graphId: input.graphId,
      nodeId: input.node.nodeId,
      artifactType: NODE_LIFECYCLE_PROJECTION_ARTIFACT_TYPE,
      storageRef: input.projection.projectionRef,
      contentHash: input.projection.projectionHash,
      byteCount: input.manifest.byteCount,
      boundedSummary: `Node lifecycle projection for ${input.node.nodeId}: ${input.projection.currentGate}.`,
      metadata: input.manifest as unknown as JsonValue,
    });
    const tool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: "scheduler.record_node_transition",
      idempotencyKey: `iteration:${input.iteration}:node:${input.node.nodeId}:node-lifecycle-projection:${input.projection.projectionHash}`,
      inputRef: input.projection.projectionRef,
      inputHash: input.projection.projectionHash,
      inputSummary: `Project node-local lifecycle gate for ${input.node.nodeId}: ${input.projection.currentGate}.`,
      nodeId: input.node.nodeId,
      roleRef: input.node.assignedRole,
      modelRef: input.node.modelOrWorkerRef,
      metadata: {
        nodeLifecycleProjection: input.manifest as unknown as JsonValue,
        schedulerPhase: "node_lifecycle_projection",
        currentGate: input.projection.currentGate,
        nextLegalTransitions: input.projection.nextLegalTransitions,
        canCallGlobalScheduler: input.projection.canCallGlobalScheduler,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } satisfies JsonValue,
    });
    await this.options.graphs.updateNodeStatus({
      nodeId: input.node.nodeId,
      nodeStatus: input.node.nodeStatus,
      outputArtifactRefs: uniqueStrings([
        ...input.node.outputArtifactRefs,
        input.projection.projectionRef,
      ]).slice(0, 24),
      metadataPatch: {
        nodeLifecycleProjectionRef: input.projection.projectionRef,
        nodeLifecycleProjectionHash: input.projection.projectionHash,
        nodeLifecycleProjectionGate: input.projection.currentGate,
        nodeLifecycleProjectionStatus: input.projection.currentLifecycleState,
        nodeLifecycleCanCallGlobalScheduler: input.projection.canCallGlobalScheduler,
        nodeLifecycleNextLegalTransitions: input.projection.nextLegalTransitions,
        nodeLifecycleTransitionProfileRef: input.projection.lifecycleTransitionProfileRef,
        nodeLifecycleRootCauseSignatureRef:
          input.projection.rootCauseSignature?.signatureRef ?? null,
        nodeLifecycleRootCauseSignatureHash:
          input.projection.rootCauseSignature?.signatureHash ?? null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } satisfies JsonValue,
    });
    await this.options.onProgress?.({
      stage: "node_lifecycle_transition",
      status: input.projection.canCallGlobalScheduler ? "completed" : "needs_review",
      nodeId: input.node.nodeId,
      roleId: input.node.assignedRole,
      artifactRefs: [input.projection.projectionRef],
      reasonCodes: uniqueStrings([
        "node_lifecycle_projection_recorded",
        ...(input.projection.rootCauseSignature?.reasonCodes ?? []),
        ...tool.reasonCodes,
      ]),
      activeNodeKind: input.node.nodeKind,
      capabilityId: input.projection.capabilityId,
      modelRef: input.node.modelOrWorkerRef,
      evidenceProducedRefs: [input.projection.projectionRef],
      currentPhase: input.projection.currentGate,
      validationState: input.projection.currentLifecycleState,
      schedulerPhase: "node_lifecycle_projection",
      schedulerToolId: "scheduler.record_node_transition",
      schedulerToolInvocationRefs: tool.refs,
      nodeLifecycleProjectionRef: input.projection.projectionRef,
      nodeLifecycleProjectionHash: input.projection.projectionHash,
      nodeLifecycleProjectionGate: input.projection.currentGate,
      nodeLifecycleProjectionStatus: input.projection.currentLifecycleState,
      nodeLifecycleNextLegalTransitions: input.projection.nextLegalTransitions,
      nodeLifecycleCanCallGlobalScheduler: input.projection.canCallGlobalScheduler,
      nextDecisionNeeded: input.projection.canCallGlobalScheduler
        ? "global_scheduler_allowed"
        : (input.projection.nextLegalTransitions[0] ?? "node_lifecycle_transition_required"),
      blockerSummary: input.projection.canCallGlobalScheduler
        ? null
        : `Node-local lifecycle gate ${input.projection.currentGate} must drain before global scheduler repair.`,
      eli5Progress:
        "OpenClaw projected the node's local lifecycle gate so the runtime can advance the next legal small-verb transition before asking the global scheduler.",
    });
    return {
      refs: uniqueStrings([input.projection.projectionRef, ...tool.refs]),
      reasonCodes: uniqueStrings(["node_lifecycle_projection_recorded", ...tool.reasonCodes]),
    };
  }

  private async recordNodeExecutionSnapshot(input: {
    graphId: string;
    iteration: number;
    snapshot: RuntimeWorkGraphSnapshot;
    node: TeamGraphNode;
    nodeExecutionSnapshot: NodeExecutionSnapshot;
  }): Promise<{ refs: string[]; reasonCodes: string[] }> {
    const snapshotHash = createHash("sha256")
      .update(JSON.stringify(input.nodeExecutionSnapshot))
      .digest("hex");
    const byteCount = Buffer.byteLength(JSON.stringify(input.nodeExecutionSnapshot), "utf8");
    await this.options.graphs.recordArtifactManifest({
      graphId: input.graphId,
      nodeId: input.node.nodeId,
      artifactType: NODE_EXECUTION_SNAPSHOT_ARTIFACT_TYPE,
      storageRef: input.nodeExecutionSnapshot.snapshotRef,
      contentHash: snapshotHash,
      byteCount,
      boundedSummary: `OpenClaw-native node execution snapshot for ${input.node.nodeId}.`,
      metadata: {
        artifactKind: "execution_platform.node_execution_snapshot_manifest",
        schemaVersion: "execution-platform.node-execution-snapshot-manifest.v1",
        snapshotRef: input.nodeExecutionSnapshot.snapshotRef,
        nodeRunId: input.nodeExecutionSnapshot.nodeRunId,
        runtimeJobId: input.nodeExecutionSnapshot.runtimeJobId,
        graphId: input.nodeExecutionSnapshot.graphId,
        nodeId: input.nodeExecutionSnapshot.nodeId,
        attemptId: input.nodeExecutionSnapshot.attemptId,
        agentId: input.nodeExecutionSnapshot.agentId,
        sessionKey: input.nodeExecutionSnapshot.sessionKey,
        taskRefCount: input.nodeExecutionSnapshot.taskRefs.length,
        requirementRefCount: input.nodeExecutionSnapshot.requirementRefs.length,
        sourcePromptRefCount: input.nodeExecutionSnapshot.sourcePromptRefs.length,
        authorityReadableRepoRefCount:
          input.nodeExecutionSnapshot.authorityRefs.readableRepoRefs.length,
        authorityWritableRepoRefCount:
          input.nodeExecutionSnapshot.authorityRefs.writableRepoRefs.length,
        validationCommandRefCount:
          input.nodeExecutionSnapshot.authorityRefs.validationCommandRefs.length,
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        hiddenReasoningStored: false,
      } satisfies JsonValue,
    });
    const attached = await this.options.attachPayloadArtifact?.({
      jobId: input.nodeExecutionSnapshot.runtimeJobId,
      graphId: input.graphId,
      nodeId: input.node.nodeId,
      artifactType: NODE_EXECUTION_SNAPSHOT_ARTIFACT_TYPE,
      uri: input.nodeExecutionSnapshot.snapshotRef,
      body: input.nodeExecutionSnapshot as unknown as JsonValue,
      boundedSummary: `OpenClaw-native node execution snapshot for ${input.node.nodeId}.`,
      metadata: {
        nodeRunId: input.nodeExecutionSnapshot.nodeRunId,
        agentId: input.nodeExecutionSnapshot.agentId,
        sessionKey: input.nodeExecutionSnapshot.sessionKey,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    await this.options.graphs.updateNodeStatus({
      nodeId: input.node.nodeId,
      nodeStatus: input.node.nodeStatus,
      outputArtifactRefs: uniqueStrings([
        ...input.node.outputArtifactRefs,
        input.nodeExecutionSnapshot.snapshotRef,
        attached?.artifactRef,
      ]).slice(0, 32),
      metadataPatch: {
        nodeExecutionSnapshotRef: attached?.artifactRef ?? input.nodeExecutionSnapshot.snapshotRef,
        nodeExecutionSnapshotStorageRef: input.nodeExecutionSnapshot.snapshotRef,
        nodeRunId: input.nodeExecutionSnapshot.nodeRunId,
        nodeAgentId: input.nodeExecutionSnapshot.agentId,
        nodeAgentSessionKey: input.nodeExecutionSnapshot.sessionKey,
        nodeExecutionSnapshotHash: snapshotHash,
        nodeExecutionSnapshotByteCount: byteCount,
        nodeExecutionSnapshotRecordedBy: "node_lifecycle_runner",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } satisfies JsonValue,
    });
    return {
      refs: uniqueStrings([input.nodeExecutionSnapshot.snapshotRef, attached?.artifactRef]),
      reasonCodes: uniqueStrings([
        "node_execution_snapshot_manifest_recorded",
        attached
          ? "node_execution_snapshot_payload_artifact_attached"
          : "node_execution_snapshot_payload_artifact_callback_unavailable",
      ]),
    };
  }

  private async requestValidDecision(input: {
    graphId: string;
    iteration: number;
    snapshot: RuntimeWorkGraphSnapshot;
    snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
    missionLedger: MissionContractLedger | null;
  }): Promise<{
    decision: OrchestratorGraphDecision | null;
    graphPatch: SchedulerGraphPatch | null;
    nodeSpecs: OrchestratorGraphNodeSpec[];
    edgeSpecs: OrchestratorGraphEdgeSpec[];
    decisionRefs: string[];
    reasonCodes: string[];
  }> {
    const decisionRefs: string[] = [];
    const reasonCodes: string[] = [];
    const pendingLifecycleProjections = this.nodeLifecycleTransitionRunner
      .pendingProjections({
        graphId: input.graphId,
        snapshot: input.snapshot,
      })
      .filter((projection) => projection.currentGate !== "node_agent_session_ready");
    if (pendingLifecycleProjections.length > 0) {
      const firstProjection = pendingLifecycleProjections[0]!;
      const blockTool = await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "scheduler.record_node_transition",
        idempotencyKey: `iteration:${input.iteration}:node-lifecycle-block-global-scheduler:${firstProjection.projectionHash}`,
        inputRef: firstProjection.projectionRef,
        inputHash: firstProjection.projectionHash,
        inputSummary:
          "Global scheduler/orchestrator decision blocked because node-local lifecycle transitions are still pending.",
        nodeId: firstProjection.nodeId,
        metadata: {
          schedulerPhase: "node_lifecycle_global_scheduler_blocked",
          nodeLifecycleProjectionRef: firstProjection.projectionRef,
          nodeLifecycleProjectionHash: firstProjection.projectionHash,
          currentGate: firstProjection.currentGate,
          nextLegalTransitions: firstProjection.nextLegalTransitions,
          pendingProjectionCount: pendingLifecycleProjections.length,
          reasonCodes: [
            "node_lifecycle_pending_before_global_scheduler",
            "node_lifecycle_transition_runner_required",
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        } satisfies JsonValue,
      });
      return {
        decision: null,
        graphPatch: null,
        nodeSpecs: [],
        edgeSpecs: [],
        decisionRefs: uniqueStrings([firstProjection.projectionRef, ...blockTool.refs]),
        reasonCodes: uniqueStrings([
          "node_lifecycle_pending_before_global_scheduler",
          "node_lifecycle_global_scheduler_blocked",
          ...blockTool.reasonCodes,
        ]),
      };
    }
    const requirementMap = this.options.requirementMap ?? null;
    const requirementMapSummary = summarizeRequirementMapForScheduler(requirementMap);
    const requirementMapAccepted =
      Boolean(requirementMap) && (requirementMap?.requirements.length ?? 0) > 0;
    const graphAmendmentRequest = buildSchedulerGraphAmendmentRequestForSnapshot({
      graphId: input.graphId,
      iteration: input.iteration,
      snapshotSummary: input.snapshotSummary,
      requirementMap,
    });
    const intakeReadinessTool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: requirementMapAccepted
        ? "scheduler.accept_requirement_map"
        : "scheduler.observe_scheduler_intake",
      idempotencyKey: `iteration:${input.iteration}:requirement-map-readiness`,
      inputRef: this.options.requirementMapRef ?? requirementMap?.mapRef ?? null,
      inputSummary: requirementMapAccepted
        ? "RequirementMap is accepted as the compact scheduler intake contract."
        : "Scheduler observed no typed RequirementMap intake contract on this direct scheduler run.",
      metadata: {
        requirementMapRef: this.options.requirementMapRef ?? requirementMap?.mapRef ?? null,
        requirementMapAccepted,
        requirementMapSummary,
        graphAmendmentRequest: graphAmendmentRequest as unknown as JsonValue,
        schedulerGraphPatchMode: graphAmendmentRequest ? "graph_amendment" : "initial_graph",
        reasonCodes: requirementMapAccepted
          ? [
              "model_authored_requirement_map_accepted",
              ...(graphAmendmentRequest?.reasonCodes ?? []),
            ]
          : ["model_authored_requirement_map_required"],
        schedulerPhase: "planning_in_progress",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    decisionRefs.push(...intakeReadinessTool.refs);
    reasonCodes.push(...intakeReadinessTool.reasonCodes);
    if (requirementMapAccepted) {
      reasonCodes.push("model_authored_requirement_map_accepted");
    } else {
      reasonCodes.push("model_authored_requirement_map_missing");
    }
    const decisionPhase = schedulerDecisionCapabilityPhase({
      snapshotSummary: input.snapshotSummary,
    });
    const decisionCapabilityManifest = filterRuntimeNodeCapabilityManifestForExecutors({
      executableExecutorKeys: Object.keys(this.options.executors),
      workflowId: input.snapshotSummary.workflowId,
      phase: decisionPhase,
      manifest: this.capabilityManifest,
    });
    const decisionCapabilityRegistrySummary = runtimeNodeCapabilityManifestForModel({
      executableExecutorKeys: Object.keys(this.options.executors),
      workflowId: input.snapshotSummary.workflowId,
      phase: decisionPhase,
    });
    const recentNodeResultSummaries = this.recentNodeResultSummariesForDecision(
      input.snapshotSummary,
    );
    const stageResult = await new SchedulerStageRunner().run({
      graphId: input.graphId,
      iteration: input.iteration,
      snapshotSummary: input.snapshotSummary,
      requirementMap,
      requirementMapSummary,
      requirementMapAccepted,
      requirementInventory: null,
      requirementInventorySummary: null,
      graphAmendmentRequest,
      schedulerClosurePolicy: this.options.schedulerClosurePolicy ?? null,
      closureRunMode: this.options.closureRunMode ?? "standard",
      recentNodeResultSummaries: recentNodeResultSummaries.slice(-8) as JsonValue[],
      capabilityRegistrySummary: decisionCapabilityRegistrySummary,
      capabilityManifest: decisionCapabilityManifest,
      maxSchedulerToolTurns: this.maxSchedulerToolTurns,
      callSchedulerTool: async (toolInput) =>
        this.options.orchestrator.callSchedulerTool(toolInput),
      callSchedulerTools: this.options.orchestrator.callSchedulerTools
        ? async (toolInput) => this.options.orchestrator.callSchedulerTools!(toolInput)
        : undefined,
      recordTool: async (toolInput) =>
        this.recordSchedulerTool({
          ...toolInput,
          toolId: toolInput.toolId as SchedulerRuntimeToolId,
        }),
      recordCheckpoint: async (checkpointInput) =>
        void (await this.options.graphs.recordCheckpoint(checkpointInput)),
    });
    decisionRefs.push(...stageResult.artifactRefs);
    reasonCodes.push(...stageResult.reasonCodes);
    if (stageResult.status === "accepted_graph") {
      return {
        decision: null,
        graphPatch: stageResult.graphPatch,
        nodeSpecs: stageResult.nodeSpecs,
        edgeSpecs: stageResult.edgeSpecs,
        decisionRefs: uniqueStrings(decisionRefs),
        reasonCodes: uniqueStrings(reasonCodes),
      };
    }
    return {
      decision: null,
      graphPatch: null,
      nodeSpecs: [],
      edgeSpecs: [],
      decisionRefs: uniqueStrings(decisionRefs),
      reasonCodes: uniqueStrings(reasonCodes),
    };
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
      const metadataPhase = jsonString(jsonRecord(input.metadata ?? {}).schedulerPhase);
      const schedulerPhase = metadataPhase ?? "runtime_tool_recorded";
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
      const schedulerFrontierState = jsonRecord(metadata.schedulerFrontierState);
      const schedulerModelCallEnvelope = jsonRecord(metadata.schedulerModelCallEnvelope);
      const noProgressSignature = jsonRecord(metadata.noProgressSignature);
      const frontierRootCauseArtifact = jsonRecord(metadata.frontierRootCauseArtifact);
      const missionLedgerEvaluationThrottle = jsonRecord(metadata.missionLedgerEvaluationThrottle);
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
              resourceSpecialistObjective:
                typeof packet.resourceSpecialistObjective === "string"
                  ? packet.resourceSpecialistObjective
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
            : input.toolId === "scheduler.reject_graph_patch"
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
        schedulerModelCallEnvelope:
          schedulerModelCallEnvelope.artifactKind ===
          "runtime_work_graph_scheduler_model_call_envelope"
            ? (schedulerModelCallEnvelope as unknown as SchedulerModelCallEnvelope)
            : null,
        noProgressSignature:
          noProgressSignature.artifactKind === "runtime_work_graph_no_progress_signature"
            ? (noProgressSignature as unknown as RuntimeWorkGraphNoProgressSignature)
            : null,
        frontierRootCauseArtifact:
          frontierRootCauseArtifact.artifactKind === "runtime_work_graph_frontier_root_cause"
            ? (frontierRootCauseArtifact as unknown as RuntimeWorkGraphFrontierRootCauseArtifact)
            : null,
        frontierRootCauseArtifactRefs:
          frontierRootCauseArtifact.artifactKind === "runtime_work_graph_frontier_root_cause"
            ? [
                `runtime-work-graph://frontier-root-cause/${input.graphId}/${
                  typeof frontierRootCauseArtifact.signatureHash === "string"
                    ? frontierRootCauseArtifact.signatureHash
                    : "unknown"
                }`,
              ]
            : [],
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
          input.toolId === "scheduler.reject_graph_patch" &&
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
    const frontier = selectRunnableParallelFrontier({
      snapshot: input.snapshot,
      nodeAgentSessionRunnerConfigured: Boolean(this.options.nodeAgentSessionRunner),
      maxParallelNodeExecutions: this.maxParallelNodeExecutions,
    });
    const frontierState = buildSchedulerFrontierState({
      graphId: input.graphId,
      iteration: input.iteration,
      snapshot: input.snapshot,
      frontier,
      missionLedger: input.missionLedger,
    });
    const frontierReadback = {
      ...frontier.readback,
      branchScopedFrontierStates: frontierState.branchScopedFrontierStates,
    };
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
        branchScopedFrontierStates:
          frontierState.branchScopedFrontierStates as unknown as JsonValue,
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
    const branchStateTool =
      frontierState.branchScopedFrontierStates.length > 0
        ? await this.recordSchedulerTool({
            graphId: input.graphId,
            iteration: input.iteration,
            toolId: "scheduler.record_branch_scoped_frontier_state",
            idempotencyKey: `iteration:${input.iteration}:branch-scoped-frontier`,
            inputRef: graphRef(
              "graph",
              `${input.graphId}/branch-scoped-frontier/${input.iteration}`,
            ),
            inputSummary:
              "Record canonical branch-scoped frontier states for selected, blocked, running, completed, and needs-review branches.",
            metadata: {
              branchScopedFrontierStates:
                frontierState.branchScopedFrontierStates as unknown as JsonValue,
              schedulerFrontierState: frontierState as unknown as JsonValue,
              schedulerPhase: "branch_scoped_frontier_state",
              reasonCodes: [
                "branch_scoped_frontier_state_recorded",
                `branch_scoped_frontier_state_count:${frontierState.branchScopedFrontierStates.length}`,
              ],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          })
        : { refs: [], reasonCodes: [] };
    if (frontier.rawRunnableNodeIds.length > 0 || frontier.skippedReasonCodes.length > 0) {
      await this.options.onProgress?.({
        stage: "scheduler_parallel_frontier",
        status: "started",
        reasonCodes: [
          "scheduler_parallel_frontier_evaluated",
          `parallel_frontier_ready_count:${frontier.rawRunnableNodeIds.length}`,
          `parallel_frontier_selected_count:${frontier.selectedNodes.length}`,
          ...frontier.skippedReasonCodes.slice(0, 12),
          ...branchStateTool.reasonCodes,
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
        parallelFrontier: frontierReadback,
        schedulerFrontierState: frontierState,
        branchScopedFrontierStates: frontierState.branchScopedFrontierStates,
      });
    } else {
      await this.options.onProgress?.({
        stage: "scheduler_canonical_frontier",
        status: frontierState.blockedFrontierNodeIds.length > 0 ? "needs_review" : "completed",
        reasonCodes: [
          ...frontierState.reasonCodes,
          ...canonicalFrontierTool.reasonCodes,
          ...branchStateTool.reasonCodes,
        ].slice(0, 80),
        currentPhase: "frontier_readiness",
        schedulerPhase: "frontier_readiness",
        schedulerToolId: "scheduler.evaluate_canonical_frontier",
        schedulerToolInvocationRefs: [...canonicalFrontierTool.refs, ...branchStateTool.refs],
        evidenceProducedRefs: [...canonicalFrontierTool.refs, ...branchStateTool.refs],
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
        parallelFrontier: frontierReadback,
        schedulerFrontierState: frontierState,
        branchScopedFrontierStates: frontierState.branchScopedFrontierStates,
      });
    }
    if (frontier.selectedNodes.length < 1 && frontierState.blockedFrontierNodeIds.length > 0) {
      const blockedNodeIds = new Set(frontierState.blockedFrontierNodeIds);
      const pendingLifecycleProjections = this.nodeLifecycleTransitionRunner
        .pendingProjections({
          graphId: input.graphId,
          snapshot: input.snapshot,
        })
        .filter((projection) => projection.currentGate !== "node_agent_session_ready")
        .filter((projection) => blockedNodeIds.has(projection.nodeId));
      if (pendingLifecycleProjections.length > 0) {
        return null;
      }
      return {
        status: "needs_review",
        reasonCodes: uniqueStrings([
          ...frontierState.reasonCodes,
          ...canonicalFrontierTool.reasonCodes,
          ...branchStateTool.reasonCodes,
          "scheduler_frontier_blocked_without_global_scheduler_reentry",
          "branch_scoped_frontier_blocker_requires_typed_closeout_or_node_repair",
        ]),
        missionLedger: input.missionLedger,
      };
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
        parallelFrontier: frontierReadback,
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
        parallelFrontier: frontierReadback,
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
      parallelFrontier: frontierReadback,
      schedulerFrontierState: frontierState,
      branchScopedFrontierStates: frontierState.branchScopedFrontierStates,
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
    const postRunnableFrontier = selectRunnableParallelFrontier({
      snapshot: postFrontierSnapshot,
      nodeAgentSessionRunnerConfigured: Boolean(this.options.nodeAgentSessionRunner),
      maxParallelNodeExecutions: this.maxParallelNodeExecutions,
    });
    const postSchedulerFrontierState = buildSchedulerFrontierState({
      graphId: input.graphId,
      iteration: input.iteration,
      snapshot: postFrontierSnapshot,
      frontier: postRunnableFrontier,
      missionLedger: mergedMissionLedger,
    });
    const postBranchScopedFrontierStates = buildBranchScopedFrontierStates({
      graphId: input.graphId,
      iteration: input.iteration,
      snapshot: postFrontierSnapshot,
      selectedNodes: frontier.selectedNodes,
      branchResults,
      blockedNodeDiagnostics: postSchedulerFrontierState.blockedNodeDiagnostics,
    });
    const postBranchStateTool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: "scheduler.record_branch_scoped_frontier_state",
      idempotencyKey: `iteration:${input.iteration}:branch-scoped-frontier-post:${selectedNodeIds.join("|")}`,
      inputRef: graphRef(
        "graph",
        `${input.graphId}/branch-scoped-frontier-post/${input.iteration}`,
      ),
      inputSummary:
        "Record branch-scoped frontier state after the superstep joins so sibling evidence, blockers, and repair consumers remain independent.",
      metadata: {
        selectedNodeIds,
        branchScopedFrontierStates: postBranchScopedFrontierStates as unknown as JsonValue,
        schedulerPhase: "branch_scoped_frontier_state",
        reasonCodes: [
          "branch_scoped_frontier_state_recorded_after_superstep",
          `branch_scoped_frontier_state_count:${postBranchScopedFrontierStates.length}`,
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    const frontierReasonCodes = [...reasonCodes, ...postBranchStateTool.reasonCodes];
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
      reasonCodes: [...frontierReasonCodes, ...systemicFailureReasonCodes],
      currentPhase: "parallel_frontier_completed",
      schedulerPhase: "execution_in_progress",
      schedulerToolId: "scheduler.join_superstep_frontier",
      schedulerToolInvocationRefs: [
        ...selectTool.refs,
        ...openSuperstepTool.refs,
        ...branchResultTool.refs,
        ...joinSuperstepTool.refs,
        ...postBranchStateTool.refs,
      ],
      evidenceProducedRefs: [
        ...selectTool.refs,
        ...openSuperstepTool.refs,
        ...branchResultTool.refs,
        ...joinSuperstepTool.refs,
        ...postBranchStateTool.refs,
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
        branchScopedFrontierStates: postBranchScopedFrontierStates,
        branchResults,
      }),
      schedulerFrontierState: postSchedulerFrontierState,
      branchScopedFrontierStates: postBranchScopedFrontierStates,
      blockerSummary: systemicFailure
        ? `Repeated parallel frontier branch failure across ${systemicFailure.nodeIds.length} sibling node(s): ${
            systemicFailure.errorSummary ??
            systemicFailure.errorPath ??
            systemicFailure.failureClass
          }`
        : undefined,
    });
    if (results.some((result) => result.status === "waiting_for_human")) {
      return {
        status: "waiting_for_human",
        reasonCodes: frontierReasonCodes,
        missionLedger: mergedMissionLedger,
      };
    }
    if (results.some((result) => result.status === "failed" || result.status === "needs_review")) {
      if (systemicFailure) {
        return {
          status: "needs_review",
          reasonCodes: [
            ...frontierReasonCodes,
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
          ...frontierReasonCodes,
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
          ...frontierReasonCodes,
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
    return {
      status: "continue",
      reasonCodes: frontierReasonCodes,
      missionLedger: mergedMissionLedger,
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
    const projection = this.nodeLifecycleTransitionRunner.project({
      graphId: input.graphId,
      snapshot,
      node,
    });
    const projectionManifest = buildNodeLifecycleProjectionManifest(projection);
    const projectionRecord = await this.recordNodeLifecycleProjection({
      graphId: input.graphId,
      iteration: input.iteration,
      snapshot,
      node,
      projection,
      manifest: projectionManifest,
    });
    if (projection.rejectedLifecycleTransitions.length > 0) {
      return {
        proceed: false,
        status: "needs_review",
        reasonCodes: uniqueStrings([
          ...projectionRecord.reasonCodes,
          "node_lifecycle_transition_profile_rejected_node_agent_session_start",
          ...projection.rejectedLifecycleTransitions.map(
            (transition) => `node_lifecycle_rejected_transition:${transition}`,
          ),
        ]),
        missionLedger: input.missionLedger,
      };
    }
    if (
      !nodeHasNativeExecutionAdapter({
        node,
        nodeAgentSessionRunnerConfigured: Boolean(this.options.nodeAgentSessionRunner),
      })
    ) {
      return {
        proceed: false,
        status: "needs_review",
        reasonCodes: uniqueStrings([
          ...projectionRecord.reasonCodes,
          "node_agent_session_runner_missing",
          "node_lifecycle_runner_blocked_node_agent_session_start_missing_runner",
        ]),
        missionLedger: input.missionLedger,
      };
    }
    if (
      !projection.canCallGlobalScheduler &&
      projection.currentGate !== "node_agent_session_ready"
    ) {
      return {
        proceed: false,
        status: "needs_review",
        reasonCodes: uniqueStrings([
          ...projectionRecord.reasonCodes,
          "node_lifecycle_pending_without_transition_executor",
          `node_lifecycle_pending_gate:${projection.currentGate}`,
        ]),
        missionLedger: input.missionLedger,
      };
    }
    const agentSessionStart = await this.nodeLifecycleTransitionRunner.prepareAgentSessionStart({
      graphId: input.graphId,
      iteration: input.iteration,
      snapshot,
      node,
    });
    if (agentSessionStart.status === "blocked") {
      await this.options.graphs.updateNodeStatus({
        nodeId: node.nodeId,
        nodeStatus: "needs_review",
        metadataPatch: {
          lastResultStatus: "needs_review",
          lastStatusReasonCodes: agentSessionStart.reasonCodes,
          nodeAgentSessionStartStatus: "blocked",
          nodeAgentSessionStartBlockerKind: agentSessionStart.blockerKind,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      return {
        proceed: false,
        status: "needs_review",
        reasonCodes: uniqueStrings([
          ...projectionRecord.reasonCodes,
          ...agentSessionStart.reasonCodes,
        ]),
        missionLedger: input.missionLedger,
      };
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
        reasonCodes: uniqueStrings([
          ...projectionRecord.reasonCodes,
          ...agentSessionStart.reasonCodes,
          ...stopped.reasonCodes,
        ]),
        missionLedger: stopped.missionLedger ?? input.missionLedger,
      };
    }
    const readyTool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: "scheduler.record_node_transition",
      idempotencyKey: `iteration:${input.iteration}:node:${input.nodeId}:record-executable-frontier-transition`,
      inputRef: graphRef("node", input.nodeId),
      inputSummary: `Record node ${input.nodeId} as ready for executable frontier from NodeLifecycleTransitionRunner projection.`,
      nodeId: input.nodeId,
      roleRef: node.assignedRole,
      modelRef: node.modelOrWorkerRef,
      metadata: {
        decisionId: input.decision.decisionId,
        nodeLifecycleProjection: projectionManifest as unknown as JsonValue,
        nodeExecutionSnapshotRef: agentSessionStart.nodeExecutionSnapshot.snapshotRef,
        nodeRunId: agentSessionStart.nodeExecutionSnapshot.nodeRunId,
        nodeAgentId: agentSessionStart.nodeExecutionSnapshot.agentId,
        nodeAgentSessionKey: agentSessionStart.nodeExecutionSnapshot.sessionKey,
        schedulerPhase: "node_lifecycle_node_agent_session_start_ready",
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
      roleRef: node.assignedRole,
      modelRef: node.modelOrWorkerRef,
      metadata: {
        decisionId: input.decision.decisionId,
        nodeLifecycleProjection: projectionManifest as unknown as JsonValue,
        nodeExecutionSnapshotRef: agentSessionStart.nodeExecutionSnapshot.snapshotRef,
        nodeRunId: agentSessionStart.nodeExecutionSnapshot.nodeRunId,
        nodeAgentId: agentSessionStart.nodeExecutionSnapshot.agentId,
        nodeAgentSessionKey: agentSessionStart.nodeExecutionSnapshot.sessionKey,
        schedulerPhase: "node_lifecycle_node_agent_session_start_ready",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    return {
      proceed: true,
      reasonCodes: uniqueStrings([
        ...projectionRecord.reasonCodes,
        ...agentSessionStart.reasonCodes,
        ...readyTool.reasonCodes,
        ...openTool.reasonCodes,
        "node_lifecycle_runner_authorized_node_agent_session_start",
        "node_lifecycle_runner_authorized_openclaw_agent_session_start",
        "runtime_node_transition_executable_frontier_opened",
      ]),
      missionLedger: input.missionLedger,
    };
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
    const nodeLifecycleProjection = this.nodeLifecycleTransitionRunner.project({
      graphId: input.graphId,
      snapshot,
      node,
    });
    const stopped = await this.options.beforeNodeExecution({
      graphId: input.graphId,
      iteration: input.iteration,
      node,
      decision: input.decision,
      snapshotSummary: summarizeSnapshot(snapshot),
      nodeLifecycleProjection,
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
    const remappedTopology = remapSchedulerGraphPatchTopologyForRuntimePersistence({
      graphId: input.graphId,
      nodes: input.nodes,
      edges: input.edges,
    });
    const nodesToPersist = remappedTopology.nodes;
    const edgesToPersist = remappedTopology.edges;
    const outcome: RuntimeWorkGraphPersistenceOutcome = {
      createdNodeIds: [],
      reusedNodeIds: [],
      createdEdgeIds: [],
      reusedEdgeIds: [],
      projectionFailedNodeIds: [],
      projectionReasonCodes: [],
    };
    const createdNodesForProjection: TeamGraphNode[] = [];
    await this.options.onProgress?.({
      stage: "scheduler_graph_node_persistence",
      status: "started",
      reasonCodes: [
        "scheduler_graph_node_persistence_started",
        `node_count:${nodesToPersist.length}`,
        `edge_count:${edgesToPersist.length}`,
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
    const validationOrdering = validateSchedulerGraphAdmission({
      nodes: nodesToPersist,
      edges: edgesToPersist,
      existingNodesById,
      schedulerClosurePolicy: this.options.schedulerClosurePolicy ?? null,
      closureRunMode: this.options.closureRunMode ?? "standard",
    });
    if (!validationOrdering.valid) {
      const blockerSummary =
        validationOrdering.diagnostics[0]?.blockerSummary ??
        "Scheduler graph admission rejected validation/tail ordering.";
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind: "scheduler_graph_admission_rejected",
        stateSummary: blockerSummary,
        artifactRefs: [],
      });
      await this.options.onProgress?.({
        stage: "scheduler_graph_node_persistence",
        status: "needs_review",
        reasonCodes: ["scheduler_graph_admission_rejected", ...validationOrdering.reasonCodes],
        currentPhase: "scheduler_graph_admission_rejected",
        schedulerPhase: "needs_review",
        currentObjective:
          "Validate scheduler graph admission semantics before mutating runtime graph nodes.",
        blockerSummary: blockerSummary,
        runtimeToolTimeoutMs: persistenceTimeoutMs,
        heartbeatState: "scheduler_graph_admission_rejected",
        eli5Progress:
          "OpenClaw rejected a scheduler graph because admission rules failed before persistence.",
      });
      throw new Error(
        `scheduler_graph_admission_rejected:${validationOrdering.reasonCodes.join(",")}`,
      );
    }
    const nodeSpecsById = new Map(nodesToPersist.map((node) => [node.nodeId, node]));
    const nodeWriteInputs: RuntimeWorkGraphTopologyNodeInput[] = [];
    const edgeWriteInputs: RuntimeWorkGraphTopologyEdgeInput[] = [];
    const nodeUtilityById = new Map<
      string,
      {
        utilityDecision: ReturnType<typeof utilityDecisionFromNodeMetadata>;
        utilityValidation: ReturnType<typeof validateCostAwareCapabilityUtilityDecision>;
        costAwareReadback: JsonValue | null;
      }
    >();
    for (const node of nodesToPersist) {
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
      nodeUtilityById.set(node.nodeId, { utilityDecision, utilityValidation, costAwareReadback });
      const metadata = jsonRecord(node.metadata ?? null);
      nodeWriteInputs.push({
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
          ...metadata,
          costAwareUtilityDecision: utilityDecision,
          costAwareReadback,
          costAwarePolicyReasonCodes: utilityValidation.reasonCodes,
          rawPromptStored: false,
          rawResponseStored: false,
        } satisfies JsonValue,
      });
    }
    for (const edge of edgesToPersist) {
      edgeWriteInputs.push({
        edgeId:
          edge.edgeId ??
          runtimeOwnedEdgeId({
            graphId: input.graphId,
            edgeId: null,
            fromNodeId: edge.fromNodeId ?? null,
            toNodeId: edge.toNodeId ?? null,
            edgeKind: edge.edgeKind,
            index: edgeWriteInputs.length,
          }),
        fromNodeId: edge.fromNodeId ?? null,
        toNodeId: edge.toNodeId ?? null,
        edgeKind: edge.edgeKind,
        reasonCodes: edge.reasonCodes ?? [],
        artifactRefs: edge.artifactRefs ?? [],
        metadata: {
          ...jsonRecord(edge.metadata ?? null),
          rawPromptStored: false,
          rawResponseStored: false,
        } satisfies JsonValue,
      });
    }
    let persistedTopology: Awaited<ReturnType<RuntimeWorkGraphRepository["persistGraphTopology"]>>;
    try {
      persistedTopology = await withSchedulerOperationTimeout({
        operation: this.options.graphs.persistGraphTopology({
          graphId: input.graphId,
          nodes: nodeWriteInputs,
          edges: edgeWriteInputs,
        }),
        timeoutMs: persistenceTimeoutMs,
        reasonCode: "runtime_work_graph_persist_graph_topology_timeout",
      });
    } catch (error) {
      const summary = error instanceof Error ? error.message : String(error);
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind: "scheduler_graph_topology_persistence_failed",
        stateSummary: `Runtime graph topology persistence failed before commit: ${summary.slice(0, 180)}.`,
        artifactRefs: [],
      });
      await this.options.onProgress?.({
        stage: "scheduler_graph_node_persistence",
        status: "failed",
        reasonCodes: [
          "scheduler_graph_topology_persistence_failed",
          "scheduler_graph_patch_transaction_failed",
          summary.slice(0, 180),
        ],
        currentPhase: "graph_topology_persistence_failed",
        schedulerPhase: "needs_review",
        currentObjective: "Persist accepted scheduler graph topology atomically.",
        blockerSummary: `Runtime graph topology persistence failed before commit: ${summary.slice(0, 180)}.`,
        runtimeToolTimeoutMs: persistenceTimeoutMs,
        heartbeatState: "graph_topology_persistence_failed",
        eli5Progress:
          "OpenClaw accepted a scheduler graph but the transaction-backed runtime topology write failed before commit.",
      });
      throw error;
    }
    createdNodesForProjection.push(...persistedTopology.createdNodes);
    outcome.createdNodeIds.push(...persistedTopology.createdNodes.map((node) => node.nodeId));
    outcome.reusedNodeIds.push(...persistedTopology.reusedNodes.map((node) => node.nodeId));
    outcome.createdEdgeIds.push(...persistedTopology.createdEdges.map((edge) => edge.edgeId));
    outcome.reusedEdgeIds.push(...persistedTopology.reusedEdges.map((edge) => edge.edgeId));
    input.addedNodeIds.push(...persistedTopology.createdNodes.map((node) => node.nodeId));

    for (const node of persistedTopology.reusedNodes) {
      const spec = nodeSpecsById.get(node.nodeId);
      await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "scheduler.persist_graph_patch_node",
        idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:reuse`,
        inputRef: graphRef("node", node.nodeId),
        inputSummary:
          spec?.exactObjective ||
          spec?.expectedOutput ||
          `Reuse existing graph node ${node.nodeId}.`,
        nodeId: node.nodeId,
        roleRef: node.assignedRole,
        modelRef: node.modelOrWorkerRef,
        metadata: {
          nodeId: node.nodeId,
          nodeSeedId: jsonString(jsonRecord(node.metadata).schedulerGraphPatchNodeSeedId),
          nodeKind: node.nodeKind,
          assignedRole: node.assignedRole,
          proposedNodeKind: spec?.nodeKind ?? null,
          proposedAssignedRole: spec?.assignedRole ?? null,
          selectedCapabilityId: spec?.capabilityId ?? null,
          capabilityId: spec?.capabilityId ?? null,
          schedulerPhase: "planning_in_progress",
          reasonCodes: ["scheduler_node_already_exists_reused"],
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
    }
    for (const node of persistedTopology.createdNodes) {
      const spec = nodeSpecsById.get(node.nodeId);
      const utility = nodeUtilityById.get(node.nodeId);
      await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "scheduler.persist_graph_patch_node",
        idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:create`,
        inputRef: graphRef("node", node.nodeId),
        inputSummary:
          spec?.exactObjective || spec?.expectedOutput || `Create graph node ${node.nodeId}.`,
        nodeId: node.nodeId,
        roleRef: node.assignedRole,
        modelRef: node.modelOrWorkerRef,
        metadata: {
          nodeId: node.nodeId,
          nodeSeedId: jsonString(jsonRecord(node.metadata).schedulerGraphPatchNodeSeedId),
          nodeKind: node.nodeKind,
          assignedRole: node.assignedRole,
          selectedCapabilityId: spec?.capabilityId ?? null,
          capabilityId: spec?.capabilityId ?? null,
          consideredCapabilityIds:
            utility?.utilityDecision?.consideredCapabilityIds ??
            (spec?.capabilityId ? [spec.capabilityId] : []),
          costAwareUtilityDecision: utility?.utilityDecision ?? null,
          costAwareReadback: utility?.costAwareReadback ?? null,
          commitmentIdsAdvanced: spec?.commitmentIdsAdvanced ?? [],
          schedulerPhase: "planning_in_progress",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
    }
    for (const edge of persistedTopology.reusedEdges) {
      await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "scheduler.persist_graph_patch_edge",
        idempotencyKey: `iteration:${input.iteration}:edge:${edge.edgeId}:reuse`,
        inputRef: graphRef("edge", edge.edgeId),
        inputSummary: `Reuse existing ${edge.edgeKind} edge from ${edge.fromNodeId ?? "graph"} to ${edge.toNodeId ?? "graph"}.`,
        metadata: {
          edgeId: edge.edgeId,
          edgeSeedId: jsonString(jsonRecord(edge.metadata).schedulerGraphPatchEdgeSeedId),
          fromNodeId: edge.fromNodeId,
          toNodeId: edge.toNodeId,
          edgeKind: edge.edgeKind,
          schedulerPhase: "planning_in_progress",
          reasonCodes: ["scheduler_edge_already_exists_reused"],
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
    }
    for (const edge of persistedTopology.createdEdges) {
      await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "scheduler.persist_graph_patch_edge",
        idempotencyKey: `iteration:${input.iteration}:edge:${edge.edgeId}:create`,
        inputRef: graphRef("edge", edge.edgeId),
        inputSummary: `Create ${edge.edgeKind} edge from ${edge.fromNodeId ?? "graph"} to ${edge.toNodeId ?? "graph"}.`,
        metadata: {
          edgeId: edge.edgeId,
          edgeSeedId: jsonString(jsonRecord(edge.metadata).schedulerGraphPatchEdgeSeedId),
          fromNodeId: edge.fromNodeId,
          toNodeId: edge.toNodeId,
          edgeKind: edge.edgeKind,
          schedulerPhase: "planning_in_progress",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
    }
    for (const addedNode of createdNodesForProjection) {
      try {
        await this.options.onNodeAdded?.({
          graphId: input.graphId,
          node: addedNode,
          reasonCodes: [
            "scheduler_node_added",
            "work_queue_child_sync_after_graph_patch_persistence",
          ],
        });
      } catch (error) {
        const summary = error instanceof Error ? error.message : String(error);
        const reasonCodes = [
          "work_queue_child_sync_blocked",
          "graph_patch_persisted_projection_blocked",
          `work_queue_child_sync_error:${summary.slice(0, 160)}`,
        ];
        outcome.projectionFailedNodeIds.push(addedNode.nodeId);
        outcome.projectionReasonCodes.push(...reasonCodes);
        await this.options.onProgress?.({
          stage: "work_queue_child_sync",
          status: "needs_review",
          nodeId: addedNode.nodeId,
          roleId: addedNode.assignedRole,
          reasonCodes,
          currentPhase: "work_queue_child_sync_blocked",
          schedulerPhase: "work_queue_projection_blocked",
          currentObjective:
            jsonString(jsonRecord(addedNode.metadata).exactObjective) ??
            `Project graph node ${addedNode.nodeId} into Work Queue child state.`,
          activeNodeKind: addedNode.nodeKind,
          blockerSummary: `Work Queue child sync failed after graph topology was persisted: ${summary.slice(0, 180)}.`,
          nextDecisionNeeded: "inspect_work_queue_projection_blocker",
          evidenceProducedRefs: [graphRef("node", addedNode.nodeId)],
          heartbeatState: "work_queue_child_sync_blocked",
          eli5Progress:
            "OpenClaw persisted the runtime graph first, then Work Queue child projection failed as a separate read-model problem.",
        });
      }
    }
    await this.options.onProgress?.({
      stage: "scheduler_graph_node_persistence",
      status: "completed",
      reasonCodes: [
        "scheduler_graph_node_persistence_completed",
        "graph_patch_topology_persisted_before_work_queue_projection",
        "scheduler_graph_patch_runtime_ids_graph_scoped",
        `node_count:${nodesToPersist.length}`,
        `edge_count:${edgesToPersist.length}`,
        ...(outcome.projectionFailedNodeIds.length > 0
          ? [
              "graph_patch_persisted_projection_blocked",
              `work_queue_child_sync_failed_count:${outcome.projectionFailedNodeIds.length}`,
            ]
          : ["work_queue_child_sync_projection_completed_or_not_configured"]),
      ],
      currentPhase: "graph_node_persistence_completed",
      schedulerPhase: "decomposition_accepted",
      currentObjective: "Persist accepted scheduler graph nodes and edges before execution.",
      evidenceProducedRefs: [
        ...nodesToPersist.map((node) => graphRef("node", node.nodeId)),
        ...edgesToPersist.map((edge) => graphRef("edge", edge.edgeId ?? "unknown")),
      ].slice(0, 30),
      schedulerFrontierState: {
        artifactKind: "runtime_work_graph_scheduler_frontier_state",
        schemaVersion: "execution-platform.runtime-work-graph.scheduler-frontier.v1",
        graphId: input.graphId,
        currentSuperstep: input.iteration,
        nodeCount: nodesToPersist.length,
        edgeCount: edgesToPersist.length,
        executableReadyNodeIds: [],
        selectedExecutableNodeIds: [],
        blockedFrontierNodeIds: [],
        aggregateBlockedNodeIds: [],
        nonRunnableNodeIds: nodesToPersist.map((node) => node.nodeId).slice(0, 80),
        dependencyBlockedNodeIds: [],
        contextBlockedNodeIds: [],
        resourceBlockedNodeIds: [],
        validationBlockedNodeIds: [],
        reviewBlockedNodeIds: [],
        closeoutBlockedNodeIds: [],
        branchIds: [],
        readinessRefs: [],
        contextRefs: [],
        openCommitmentIds: [],
        lockConflictNodeIds: [],
        providerBudgetBlockedNodeIds: [],
        nextLegalTransition:
          outcome.projectionFailedNodeIds.length > 0
            ? "inspect_work_queue_projection_blocker"
            : "evaluate_frontier",
        reasonCodes: [
          "graph_patch_topology_persisted",
          "scheduler_graph_patch_runtime_identity_mapped",
          `graph_patch_node_count:${nodesToPersist.length}`,
          `graph_patch_edge_count:${edgesToPersist.length}`,
          ...outcome.projectionReasonCodes,
        ],
        blockedNodeDiagnostics: [],
        branchScopedFrontierStates: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        graphNodes: nodesToPersist.map((node) => ({
          nodeId: node.nodeId,
          nodeSeedId: jsonString(jsonRecord(node.metadata ?? null).schedulerGraphPatchNodeSeedId),
          nodeKind: node.nodeKind,
          assignedRole: node.assignedRole,
          capabilityId: node.capabilityId ?? null,
          executionIntent: jsonString(jsonRecord(node.metadata ?? null).executionIntent),
          rawPromptStored: false,
          rawResponseStored: false,
        })),
        graphEdges: edgesToPersist.map((edge) => ({
          edgeId: edge.edgeId ?? "unknown",
          edgeSeedId: jsonString(jsonRecord(edge.metadata ?? null).schedulerGraphPatchEdgeSeedId),
          fromNodeId: edge.fromNodeId ?? null,
          toNodeId: edge.toNodeId ?? null,
          edgeKind: edge.edgeKind,
          rawPromptStored: false,
          rawResponseStored: false,
        })),
      } as unknown as RuntimeWorkGraphSchedulerFrontierState,
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
    const nodeMetadata = jsonRecord(node.metadata);
    const nodeAgentSessionRunner = this.options.nodeAgentSessionRunner ?? null;
    const nodeRuntimeToolId = "node.agent_session.invoke";
    if (!nodeAgentSessionRunner) {
      return {
        status: "needs_review",
        reasonCodes: [
          "node_agent_session_runner_not_configured",
          "scheduler_legacy_worker_invoke_fallback_removed",
        ],
      };
    }
    const executionIntent =
      typeof nodeMetadata.executionIntent === "string" ? nodeMetadata.executionIntent : null;
    const evidenceMode = jsonStringArray(nodeMetadata.evidenceMode).slice(0, 12);
    const nodeExecutorKey =
      typeof nodeMetadata.executorKey === "string" ? nodeMetadata.executorKey : null;
    const nodeWorkerRef =
      typeof nodeMetadata.workerRef === "string" ? nodeMetadata.workerRef : null;
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
    const agentSessionStart = await this.nodeLifecycleTransitionRunner.prepareAgentSessionStart({
      graphId: input.graphId,
      iteration: input.iteration,
      snapshot,
      node,
    });
    if (agentSessionStart.status === "blocked") {
      await this.options.graphs.updateNodeStatus({
        nodeId: node.nodeId,
        nodeStatus: "needs_review",
        metadataPatch: {
          lastResultStatus: "needs_review",
          lastStatusReasonCodes: agentSessionStart.reasonCodes,
          nodeAgentSessionStartStatus: "blocked",
          nodeAgentSessionStartBlockerKind: agentSessionStart.blockerKind,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      return {
        status: "needs_review",
        reasonCodes: agentSessionStart.reasonCodes,
        missionLedger: input.missionLedger,
      };
    }
    const executeConfiguredNode = async (): Promise<RuntimeWorkGraphNodeExecutionResult> => {
      return nodeAgentSessionRunner({
        graphId: input.graphId,
        iteration: input.iteration,
        snapshot,
        node,
        nodeExecutionSnapshot: agentSessionStart.nodeExecutionSnapshot,
        missionLedgerSummary: input.missionLedger
          ? summarizeMissionContractLedger(input.missionLedger)
          : null,
        rawPromptStored: false,
        rawResponseStored: false,
      });
    };
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
        nodeWorkerRef ??
        (typeof costAwareReadback.workerRef === "string" ? costAwareReadback.workerRef : null),
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
      nodeExecutionSnapshotRef: agentSessionStart.nodeExecutionSnapshot.snapshotRef,
      nodeRunId: agentSessionStart.nodeExecutionSnapshot.nodeRunId,
      nodeAgentId: agentSessionStart.nodeExecutionSnapshot.agentId,
      nodeAgentSessionKey: agentSessionStart.nodeExecutionSnapshot.sessionKey,
      validationState: node.nodeKind === "validation" ? "started" : null,
      executionIntent,
      evidenceMode,
      executorKey: nodeExecutorKey,
      commitmentIdsAdvanced: nodeCommitmentIds,
      remainingOpenCommitmentIds: remainingOpenCommitmentIds(input.missionLedger),
      nextDecisionNeeded: "node_result",
      eli5Progress: `Started ${node.assignedRole} work for ${node.nodeKind}.`,
      schedulerPhase: "execution_in_progress",
      schedulerToolId: "node.agent_session.invoke",
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
        reasonCodes: ["node_agent_session_runtime_tool_call_started", ...budgetPolicy.reasonCodes],
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
        currentPhase: "node_agent_session_runtime_tool_call_started",
        nodeExecutionSnapshotRef: agentSessionStart.nodeExecutionSnapshot.snapshotRef,
        nodeRunId: agentSessionStart.nodeExecutionSnapshot.nodeRunId,
        nodeAgentId: agentSessionStart.nodeExecutionSnapshot.agentId,
        nodeAgentSessionKey: agentSessionStart.nodeExecutionSnapshot.sessionKey,
        validationState: node.nodeKind === "validation" ? "started" : null,
        executionIntent,
        evidenceMode,
        executorKey: nodeExecutorKey,
        workerRef: nodeWorkerRef,
        commitmentIdsAdvanced: nodeCommitmentIds,
        remainingOpenCommitmentIds: remainingOpenCommitmentIds(input.missionLedger),
        nextDecisionNeeded: "node_agent_session_result",
        eli5Progress: `${node.assignedRole} started its runtime tool call with a long-task budget.`,
        schedulerPhase: "execution_in_progress",
        schedulerToolId: nodeRuntimeToolId,
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
          toolId: nodeRuntimeToolId,
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
            nodeExecutionSnapshotRef: agentSessionStart.nodeExecutionSnapshot.snapshotRef,
            nodeRunId: agentSessionStart.nodeExecutionSnapshot.nodeRunId,
            nodeAgentId: agentSessionStart.nodeExecutionSnapshot.agentId,
            nodeAgentSessionKey: agentSessionStart.nodeExecutionSnapshot.sessionKey,
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
            nodeResult = await executeConfiguredNode();
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
      const tracedNodeResult = nodeResult as RuntimeWorkGraphNodeExecutionResult | null;
      const tracedNodeResultMetadata = jsonRecord(tracedNodeResult?.metadata ?? null);
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
        reasonCodes: ["node_agent_session_runtime_tool_call_completed", ...traced.reasonCodes],
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
            ? "node_agent_session_runtime_tool_timeout"
            : "node_agent_session_runtime_tool_call_completed",
        nodeExecutionSnapshotRef: agentSessionStart.nodeExecutionSnapshot.snapshotRef,
        nodeRunId: agentSessionStart.nodeExecutionSnapshot.nodeRunId,
        nodeAgentId: agentSessionStart.nodeExecutionSnapshot.agentId,
        nodeAgentSessionKey: agentSessionStart.nodeExecutionSnapshot.sessionKey,
        nodeFinishArtifactRef: jsonString(tracedNodeResultMetadata.nodeFinishArtifactRef),
        nodeFinishStatus: jsonString(tracedNodeResultMetadata.nodeFinishStatus),
        nodeFinishBlockerKind: jsonString(tracedNodeResultMetadata.nodeFinishBlockerKind),
        validationState: node.nodeKind === "validation" ? traced.invocation.status : null,
        executionIntent,
        evidenceMode,
        executorKey: nodeExecutorKey,
        workerRef: nodeWorkerRef,
        commitmentIdsAdvanced: nodeCommitmentIds,
        remainingOpenCommitmentIds: remainingOpenCommitmentIds(input.missionLedger),
        nextDecisionNeeded: "node_result_review",
        blockerSummary:
          traced.invocation.status === "failed"
            ? (traced.invocation.errorSummary ?? traced.invocation.errorCode ?? null)
            : null,
        eli5Progress: `${node.assignedRole} runtime tool call finished with ${traced.invocation.status}.`,
        schedulerPhase: "execution_in_progress",
        schedulerToolId: "node.agent_session.invoke",
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
      result = await executeConfiguredNode();
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
      validationRefs: result.validationRefs ?? [],
      changedFileRefs: result.changedFileRefs ?? [],
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
    const resultExecutorKey =
      nodeExecutorKey ??
      (typeof nodeMetadata.executorKey === "string" ? nodeMetadata.executorKey : null);
    const resultWorkerRef =
      nodeWorkerRef ??
      (typeof nodeMetadata.workerRef === "string" ? nodeMetadata.workerRef : node.modelOrWorkerRef);
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
      executorKey: resultExecutorKey,
      workerRef: resultWorkerRef,
      roleId: node.assignedRole,
      result,
      runtimeToolInvocationRefs,
      modelRunRefs: node.modelOrWorkerRef ? [node.modelOrWorkerRef] : [],
      sourceMaterialRefs: node.inputHandoffRefs,
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
        nodeRequiresMissionEvidenceClaimsForLocalCloseout(node),
    });
    const genericNodeResultRef = graphRef("node", `${node.nodeId}/generic-node-result`);
    const resultMetadata = jsonRecord(result.metadata ?? null);
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
      validationRefs,
      changedFileRefs,
      nodeKind: node.nodeKind,
    });
    const claimRequirementReasonCodes = evidenceClaimRequirementReasonCodes({
      requireEvidenceClaims:
        this.options.requireEvidenceClaimsForMissionLedger === true &&
        nodeRequiresMissionEvidenceClaimsForLocalCloseout(node),
      claims: missionLedgerCompatibleEvidenceClaims({
        claims: result.evidenceClaims ?? [],
        nodeKind: node.nodeKind,
        validationRefs,
        changedFileRefs,
      }),
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
    const missionLedgerCompatibleClaims = missionLedgerCompatibleEvidenceClaims({
      claims: result.evidenceClaims ?? [],
      nodeKind: node.nodeKind,
      validationRefs,
      changedFileRefs,
    });
    const missionEvaluationThrottle = missionLedgerEvaluationThrottleDecision({
      node,
      result,
      missionLedgerCompatibleEvidenceClaims: missionLedgerCompatibleClaims,
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
        evidenceClaims: missionLedgerCompatibleClaims,
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
    result = {
      ...result,
      outputArtifactRefs: Array.isArray(result.outputArtifactRefs) ? result.outputArtifactRefs : [],
      reasonCodes: uniqueStrings(result.reasonCodes ?? []),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
    const effectiveNodeStatus: TeamGraphNode["nodeStatus"] = executionStatusToNodeStatus(
      result.status,
    );
    const loopGuardDecision = evaluateLoopGuard({
      guard: input.loopGuard,
      node,
      result,
      missionLedgerBefore,
      missionLedgerAfter: missionLedger,
    });
    const persistedNodeResultMetadata = compactNodeResultMetadataForRuntimeToolTrace(
      result.metadata,
    );
    await this.options.graphs.updateNodeStatus({
      nodeId: node.nodeId,
      nodeStatus: loopGuardDecision.halted ? "needs_review" : effectiveNodeStatus,
      outputArtifactRefs: result.outputArtifactRefs,
      metadataPatch: {
        ...(jsonRecord(persistedNodeResultMetadata) as Record<string, JsonValue>),
        lastResultStatus: result.status,
        readinessStatus: effectiveNodeStatus,
        lifecycleState: effectiveNodeStatus === "succeeded" ? "completed" : effectiveNodeStatus,
        nodeLifecycleState: effectiveNodeStatus === "succeeded" ? "completed" : effectiveNodeStatus,
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
      nodeExecutionSnapshotRef: agentSessionStart.nodeExecutionSnapshot.snapshotRef,
      nodeRunId: agentSessionStart.nodeExecutionSnapshot.nodeRunId,
      nodeAgentId: agentSessionStart.nodeExecutionSnapshot.agentId,
      nodeAgentSessionKey: agentSessionStart.nodeExecutionSnapshot.sessionKey,
      nodeFinishArtifactRef: jsonString(resultMetadata.nodeFinishArtifactRef),
      nodeFinishStatus: jsonString(resultMetadata.nodeFinishStatus),
      nodeFinishBlockerKind: jsonString(resultMetadata.nodeFinishBlockerKind),
      validationState:
        node.nodeKind === "validation"
          ? result.status === "succeeded"
            ? "passed"
            : result.status
          : null,
      validationPhase: genericNodeResult.evidenceClaims[0]?.validationPhase ?? null,
      validationPhaseCompatibility:
        genericNodeResult.evidenceClaims[0]?.validationPhaseCompatibility ?? null,
      validationPhaseReasonCodes:
        genericNodeResult.evidenceClaims[0]?.validationPhaseReasonCodes.slice(0, 12) ?? [],
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
          validationPhase: claim.validationPhase,
          validationPhaseCompatibility: claim.validationPhaseCompatibility,
          validationPhaseReasonCodes: claim.validationPhaseReasonCodes.slice(0, 8),
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
      schedulerToolId: workerToolInvocationRef ? "node.agent_session.invoke" : null,
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
