import { createHash } from "node:crypto";
import {
  missingField,
  repairRequestForMissingFields,
  type ModelDecisionMissingField,
  type ModelDecisionRepairRequest,
} from "../model-decision-contracts/index.ts";
import {
  classifyModelTaskCall,
  evaluateModelPolicyBindingPreflight,
} from "../model-tasks/model-task-classification.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { evaluateContextRepairNodeExecutionGate } from "./context-repair-requirement.ts";
import { evaluateBoundaryReplayChildEpochEligibility } from "./boundary-replay-checkpoints.ts";
import {
  normalizeContextSnapshotRefs,
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
  evidenceModesForCapability,
  normalizeEvidenceModes,
  normalizeExecutionIntent,
  type EvidenceMode,
  type ExecutionIntent,
} from "./execution-intent.ts";
import {
  NodeExecutionPacketSchema,
  buildMissingNodeExecutionPacketReadinessState,
  compileNodeExecutionPacketForGenericDomainResource,
  evaluateNodeExecutionPacketReadiness,
  summarizeNodeExecutionPacketForReadback,
  type NodeExecutionPacket,
  type RuntimeNodeLifecycleState,
} from "./node-resource-materialization.ts";
import {
  NODE_LIFECYCLE_PROJECTION_ARTIFACT_TYPE,
  NodeLifecycleTransitionRunner,
  buildNodeLifecycleProjectionManifest,
  nodeLifecyclePayloadBackedExecutionAuthorityFor,
  type NodeLifecycleProjection,
  type NodeLifecycleProjectionManifest,
  type NodeLifecyclePayloadBackedExecutionAuthority,
} from "./node-lifecycle-transition-runner.ts";
import {
  compareReadinessProjectionToCurrent,
  evaluateChildEpochFrontierEligibility,
  projectReadinessDriftForReadback,
} from "./readiness-recompute-authority.ts";
import { validateNonCodexTaskDecompositionDecision } from "./non-codex-task-decomposition-policy.ts";
import {
  buildWorkIntentContextResolutionManifest,
  compileWorkIntentContextResolution,
  workIntentContextResolutionMetadata,
  WORK_INTENT_CONTEXT_RESOLUTION_ARTIFACT_TYPE,
  type WorkIntentContextResolution,
} from "./work-intent-context-resolution.ts";
import {
  buildDomainResourceSelectionRequest,
  buildResourceSelectionHandleManifest,
  compileDomainResourceSelectionDecision,
  compileResourceSelectionPacket,
  DomainResourceSelectionToolCallSchema,
  domainResourceSelectionProposalFromToolCall,
  resourceSelectionDecisionFromDomainResourceSelectionDecision,
  type ResourceSelectionCandidateHandle,
  type ResourceSelectionHandleManifest,
  type DomainResourceSelectionRequest,
} from "./resource-selection.ts";
import {
  compileOrchestratorGraphDecision,
  validateOrchestratorGraphDecision,
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
import {
  buildSchedulerModelCallEnvelope,
  type SchedulerModelCallEnvelope,
} from "./scheduler-model-call-envelope.ts";
import {
  evaluateEvidenceClaimValidationPhase,
  normalizeRuntimeValidationPhase,
  type RuntimeValidationPhase,
  type ValidationPhaseCompatibilityStatus,
} from "./validation-phase.ts";
import { compileWorkIntent } from "./work-intent.ts";
import {
  summarizeObligationGraphForScheduler,
  type ObligationGraph,
} from "./obligation-graph.ts";
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

const IMPLEMENTATION_CONTEXT_REPAIR_REASON_CODE_EXACT = new Set<string>([
  "node_context_signal_present_but_unaccepted",
  "node_resources_required_before_worker_execution",
  "node_readiness_context_status_not_execution_ready",
  "node_readiness_context_limitation_waiver_missing",
]);

const IMPLEMENTATION_CONTEXT_REPAIR_REASON_CODE_PREFIXES = [
  "resource_requirement_",
  "resource_broker_",
  "implementation_context_",
  "target_refs_",
  "validation_refs_",
  "upstream_context_",
  "node_context_",
  "node_readiness_context_",
];

const DOMAIN_RESOURCE_SELECTION_REPAIR_REASON_CODES = new Set<string>([
  "implementation_context_concrete_domain_resource_selection_required",
  "implementation_context_domain_resource_selection_packet_not_accepted",
  "domain_resource_selection_selected_refs_missing",
  "domain_resource_selection_selected_refs_not_in_candidate_set",
  "domain_resource_selection_file_change_intent_coverage_missing",
]);

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
  obligationGraphSummary?: JsonValue | null;
  recentNodeResultSummaries?: RuntimeWorkGraphRecentNodeResultSummary[];
  capabilityRegistrySummary?: JsonValue | null;
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
  snapshotSummary: JsonValue;
  missionLedgerSummary?: MissionContractLedgerSummary | null;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type RuntimeWorkGraphNodeExecutor = {
  execute(input: RuntimeWorkGraphNodeExecutionInput): Promise<RuntimeWorkGraphNodeExecutionResult>;
};

export type RuntimeWorkGraphDomainResourceSelectionToolCall = {
  toolId: "resource.selection.propose" | "resource.selection.mark_blocked" | string;
  input: Record<string, JsonValue>;
  modelRef?: string | null;
  providerPath?: string | null;
  providerDiagnosticRefs?: string[];
  reasonCodes?: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type RuntimeWorkGraphDomainResourceSelectionInput = {
  graphId: string;
  iteration: number;
  nodeId: string;
  nodeKind: string;
  assignedRole: string;
  modelOrWorkerRef?: string | null;
  capabilityId: string | null;
  workIntentRef: string | null;
  workIntentContextResolutionRef: string;
  nodeExecutionContractRef: string | null;
  nodeResourceLedgerRefs: string[];
  nodeResourceLedgerEntryRefs: string[];
  nodeResourceLedgerEntryPayloadRefs: string[];
  acceptedResourceHandoffRefs: string[];
  targetCommitmentIds: string[];
  evidenceRequirements: string[];
  authorityScopeRefs: string[];
  request: DomainResourceSelectionRequest;
  candidateHandleManifest: ResourceSelectionHandleManifest;
  candidateResourceRefs: string[];
  allowedToolIds: string[];
  requiredFields: string[];
  semanticQualityJudgedByDeterministicCode: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type RuntimeWorkGraphDomainResourceSelectionSelector = {
  select(
    input: RuntimeWorkGraphDomainResourceSelectionInput,
  ): Promise<RuntimeWorkGraphDomainResourceSelectionToolCall>;
};

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
  domainResourcePacketKind: string | null;
  domainResourcePacketRef: string | null;
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
  resourceRefs: string[];
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
  domainResourcePacketKinds: string[];
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
  domainResourcePacketKinds: string[];
  domainResourcePacketRefs: string[];
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
  workIntentRef: string | null;
  contractRef: string | null;
  readinessRef: string | null;
  resourceRequirementRefs: string[];
  domainResourcePacketRef: string | null;
  resourcePacketRef: string | null;
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
    | "validation_repair_plan_required"
    | "validation_repair_patch_required"
    | "validation_terminal_blocker"
    | "escalation_required"
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
  if (["closeout", "human", "review", "research", "observability", "orchestrator"].includes(roleClass)) {
    return false;
  }
  if (node.nodeKind === "work_intent") {
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
  domainResourceSelectionSelector?: RuntimeWorkGraphDomainResourceSelectionSelector | null;
  executors: Record<string, RuntimeWorkGraphNodeExecutor>;
  runtimeToolKernel?: RuntimeToolKernel | null;
  runtimeToolNodeToolId?: string;
  missionLedger?: MissionContractLedger | null;
  obligationGraph?: ObligationGraph | null;
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
    payloadBackedExecutionAuthority: NodeLifecyclePayloadBackedExecutionAuthority;
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
    nodeExecutionContractRef?: string | null;
    nodeExecutionContractVersion?: string | null;
    nodeExecutionContractHash?: string | null;
    nodeExecutionPacketRef?: string | null;
    nodeExecutionPacketHash?: string | null;
    nodeExecutionPacketStatus?: string | null;
    resourcePacketKind?: string | null;
    resourcePacketRef?: string | null;
    resourcePacketHash?: string | null;
    executionIntent?: string | null;
    evidenceMode?: string[];
    executorKey?: string | null;
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
    readinessProjectionStatus?: string | null;
    readinessProjectionDriftReasonCodes?: string[];
    readinessProjectionMissingFields?: string[];
    readinessProjectionDrift?: JsonValue | null;
    nodeReadinessStale?: boolean | null;
    nodeLifecycleProjectionRef?: string | null;
    nodeLifecycleProjectionHash?: string | null;
    nodeLifecycleProjectionGate?: string | null;
    nodeLifecycleProjectionStatus?: string | null;
    nodeLifecycleNextLegalTransitions?: string[];
    nodeLifecycleCanCallGlobalScheduler?: boolean | null;
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
      workIntentRef:
        typeof jsonRecord(node.metadata).promotedFromWorkIntentRef === "string"
          ? (jsonRecord(node.metadata).promotedFromWorkIntentRef as string)
          : typeof jsonRecord(node.metadata).workIntentRef === "string"
            ? (jsonRecord(node.metadata).workIntentRef as string)
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
      resourceRequirementRefs: jsonStringArray(jsonRecord(node.metadata).resourceRequirementRefs),
      contextSnapshotRefs: [
        ...jsonContextSnapshotArray(jsonRecord(node.metadata).contextSnapshotRefs).map(
          (snapshotRef) => snapshotRef.snapshotRef,
        ),
        ...jsonContextSnapshotArray(jsonRecord(node.metadata).providedContextSnapshotRefs).map(
          (snapshotRef) => snapshotRef.snapshotRef,
        ),
      ].slice(0, 40),
      workIntentContextResolutionStatus:
        typeof jsonRecord(node.metadata).workIntentContextResolutionStatus === "string"
          ? (jsonRecord(node.metadata).workIntentContextResolutionStatus as string)
          : null,
      workIntentContextResolutionRefs: jsonStringArray(
        jsonRecord(node.metadata).workIntentContextResolutionRefs,
      ),
      acceptedResourceHandoffRefs: jsonStringArray(
        jsonRecord(node.metadata).acceptedResourceHandoffRefs ??
          jsonRecord(node.metadata).resourceHandoffPacketRefs,
      ),
      missingResourceRequirementRefs: jsonStringArray(
        jsonRecord(node.metadata).missingResourceRequirementRefs,
      ),
      missingResourceHandoffRefs: jsonStringArray(
        jsonRecord(node.metadata).missingResourceHandoffRefs,
      ),
      failedResourceSupplyNodeIds: jsonStringArray(
        jsonRecord(node.metadata).failedResourceSupplyNodeIds,
      ),
      pendingResourceSupplyNodeIds: jsonStringArray(
        jsonRecord(node.metadata).pendingResourceSupplyNodeIds,
      ),
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
  if (!["run_node", "retry_node"].includes(input.decision.decisionKind)) {
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

function isBroadStructuralResourceRef(ref: string): boolean {
  const text = ref.trim();
  if (!text) {
    return true;
  }
  if (text.endsWith("/") || text.endsWith("/**")) {
    return true;
  }
  if (text.startsWith('runtime-work-graph://') || text.startsWith('runtime-job://')) {
    return true;
  }
  if (text.startsWith('artifact://') || text.startsWith('resource-demand://')) {
    return true;
  }
  return false;
}

function modelSelectableDomainResourceRefs(input: {
  exactRefs: string[];
  fallbackRefs: string[];
}): string[] {
  const exactRefs = uniqueStrings(input.exactRefs).filter((ref) => !isBroadStructuralResourceRef(ref));
  if (exactRefs.length > 0) {
    return exactRefs.slice(0, 40);
  }
  return uniqueStrings(input.fallbackRefs)
    .filter((ref) => !isBroadStructuralResourceRef(ref))
    .slice(0, 40);
}

function targetCommitmentIdsForNode(node: TeamGraphNode): string[] {
  const metadata = jsonRecord(node.metadata);
  return uniqueStrings([
    ...jsonStringArray(metadata.targetCommitmentIds),
    ...jsonStringArray(metadata.commitmentIdsAdvanced),
  ]).slice(0, 40);
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
      .filter((branch) =>  branch.branchLocalTransitionPending)
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
  const skippedReasonCodes: string[] = [];
  const candidates = input.snapshot.nodes.filter((node) => {
    if (node.nodeStatus !== "planned") {
      return false;
    }
    const replayEpochEligibility = evaluateBoundaryReplayChildEpochEligibility({
      nodeMetadata: jsonRecord(node.metadata),
      graphMetadata: jsonRecord(input.snapshot.graph.metadata),
    });
    const childEpochEligibility = evaluateChildEpochFrontierEligibility({
      nodeId: node.nodeId,
      nodeMetadata: jsonRecord(node.metadata),
      graphMetadata: jsonRecord(input.snapshot.graph.metadata),
    });
    if (!replayEpochEligibility.eligible || !childEpochEligibility.eligible) {
      skippedReasonCodes.push(
        ...replayEpochEligibility.reasonCodes.map((code) => `${code}:${node.nodeId}`),
        ...childEpochEligibility.reasonCodes.map((code) => `${code}:${node.nodeId}`),
      );
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

function firstMetadataString(
  metadata: Record<string, JsonValue>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = jsonString(metadata[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function missingFieldsFromReadiness(
  readiness: RuntimeNodeTransitionReadiness,
  metadata: Record<string, JsonValue>,
): string[] {
  const missingFields: string[] = [];
  if (readiness.dependencyStatus === "blocked") {
    missingFields.push("dependency_terminal_status");
  }
  if (readiness.contextStatus === "required_missing") {
    missingFields.push("resourceRequirementRefs", "acceptedContextSnapshotRefs");
  }
  if (readiness.contextStatus === "accepted_with_signal") {
    missingFields.push("acceptedResourceHandoffRef", "acceptedContextSnapshotRefs");
  }
  if (readiness.contextStatus === "in_progress") {
    missingFields.push("acceptedResourceHandoffRef");
  }
  if (readiness.resourceStatus === "missing") {
    if (!jsonString(metadata.nodeExecutionContractRef)) {
      missingFields.push("nodeExecutionContractRef");
    }
    if (!jsonString(metadata.nodeExecutionPacketRef)) {
      missingFields.push("nodeExecutionPacketRef");
    }
    if (!jsonString(metadata.resourcePacketRef)) {
      missingFields.push("resourcePacketRef");
    }
    if (!jsonString(metadata.nodeReadinessStateRef)) {
      missingFields.push("nodeReadinessStateRef");
    }
  }
  if (!readiness.executorAvailable) {
    missingFields.push("executorKey");
  }
  if (readiness.validationStatus !== "ready" && readiness.validationStatus !== "not_required") {
    missingFields.push("validationRef");
  }
  return uniqueStrings(missingFields).toSorted();
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
  domainResourcePacketKind: string | null;
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
    domainResourcePacketKind: input.domainResourcePacketKind,
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
    "nodeExecutionPacketContractVersion",
  ]);
  const domainResourcePacketKind = firstMetadataString(metadata, [
    "domainResourcePacketKind",
    "resourcePacketKind",
  ]);
  const domainResourcePacketRef = firstMetadataString(metadata, [
    "domainResourcePacketRef",
    "resourcePacketRef",
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
    domainResourcePacketKind,
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
    readinessRef: firstMetadataString(metadata, ["nodeReadinessStateRef"]),
    domainResourcePacketKind,
    domainResourcePacketRef,
    schemaErrorPath,
    policyErrorPath,
    providerProfileId,
    branchSimilarityClass: branchSimilarityClassForDiagnostic(diagnosticBase),
    blockerSummary: firstMetadataString(metadata, ["blockerSummary"]),
    nextAllowedTransitions: jsonStringArray(metadata.nodeLifecycleNextLegalTransitions).slice(0, 12),
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
      branchResult?.readinessStateRef ??
      diagnostic?.readinessRef ??
      branchScopedMetadataString(metadata, ["nodeReadinessStateRef"]);
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
      branchScopedMetadataString(metadata, ["blockerSummary", "nodeReadinessBlockerSummary"]);
    const resourcePacketRef =
      diagnostic?.domainResourcePacketRef ??
      branchScopedMetadataString(metadata, ["resourcePacketRef", "domainResourcePacketRef"]);
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
      workIntentRef: branchScopedMetadataString(metadata, ["workIntentRef", "targetWorkIntentRef"]),
      contractRef,
      readinessRef,
      resourceRequirementRefs: branchScopedMetadataStrings(metadata, ["resourceRequirementRefs"]),
      domainResourcePacketRef: resourcePacketRef,
      resourcePacketRef,
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
      readinessStatus: readiness?.lifecycleState ?? branchScopedMetadataString(metadata, ["nodeReadinessStatus"]),
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

function recommendedRepairBoundaryForRootCause(input: {
  missingFields: string[];
  reasonCodes: string[];
  nextLegalTransitions: string[];
  providerProfileIds: string[];
  schemaErrorPaths: string[];
  policyErrorPaths: string[];
}): string {
  const nextTransitions = new Set(input.nextLegalTransitions);
  const missingFields = new Set(input.missingFields);
  if (input.providerProfileIds.length > 0 || nextTransitions.has("wait_for_locks_or_provider_budget")) {
    return "model_tool_policy_fix";
  }
  if (
    missingFields.has("resourceRequirementRefs") ||
    missingFields.has("acceptedContextSnapshotRefs")
  ) {
    return "resource_requirement_repair";
  }
  if (
    missingFields.has("nodeExecutionContractRef") ||
    input.schemaErrorPaths.length > 0 ||
    input.policyErrorPaths.length > 0
  ) {
    return "contract_repair";
  }
  if (
    missingFields.has("nodeExecutionPacketRef") ||
    missingFields.has("resourcePacketRef") ||
    missingFields.has("nodeReadinessStateRef") ||
    nextTransitions.has("compile_node_execution_packet")
  ) {
    return "resource_materializer_fix";
  }
  if (missingFields.has("executorKey")) {
    return "capability_manifest_fix";
  }
  return nextTransitions.has("needs_review") ? "owner_review" : "terminal_diagnostic";
}

function buildSchedulerFrontierState(input: {
  graphId: string;
  iteration: number;
  snapshot: RuntimeWorkGraphSnapshot;
  frontier: ReturnType<typeof selectRunnableParallelFrontier>;
  executors: Record<string, RuntimeWorkGraphNodeExecutor>;
  missionLedger: MissionContractLedger | null;
  requireNodeExecutionPacketForWorkerExecution: boolean;
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
    dependencyBlockedNodeIds: blocked.filter((nodeId) =>
      nodeBlockingDependencies({ snapshot: input.snapshot, nodeId }).length > 0,
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
    readinessRefs: plannedNodes.map((node) => node.nodeId)
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
    blockedNodeDiagnostics,
    branchScopedFrontierStates,
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
  projectionFailedNodeIds: string[];
  projectionReasonCodes: string[];
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
  const diagnostics = input.frontierState.blockedNodeDiagnostics;
  const blockerReasonCodes = uniqueStrings(
    diagnostics.length > 0
      ? diagnostics.flatMap((diagnostic) => diagnostic.reasonCodes)
      : input.frontierState.reasonCodes,
  ).slice(0, 80);
  const missingFields = uniqueStrings(
    diagnostics.flatMap((diagnostic) => diagnostic.missingFields),
  ).toSorted();
  const nodeKinds = uniqueStrings(diagnostics.map((diagnostic) => diagnostic.nodeKind)).toSorted();
  const capabilityIds = uniqueStrings(diagnostics.map((diagnostic) => diagnostic.capabilityId)).toSorted();
  const executionIntents = uniqueStrings(
    diagnostics.map((diagnostic) => diagnostic.executionIntent),
  ).toSorted();
  const evidenceModes = uniqueStrings(
    diagnostics.flatMap((diagnostic) => diagnostic.evidenceMode),
  ).toSorted();
  const contractVersions = uniqueStrings(
    diagnostics.map((diagnostic) => diagnostic.contractVersion),
  ).toSorted();
  const domainResourcePacketKinds = uniqueStrings(
    diagnostics.map((diagnostic) => diagnostic.domainResourcePacketKind),
  ).toSorted();
  const schemaErrorPaths = uniqueStrings(
    diagnostics.map((diagnostic) => diagnostic.schemaErrorPath),
  ).toSorted();
  const policyErrorPaths = uniqueStrings(
    diagnostics.map((diagnostic) => diagnostic.policyErrorPath),
  ).toSorted();
  const providerProfileIds = uniqueStrings(
    diagnostics.map((diagnostic) => diagnostic.providerProfileId),
  ).toSorted();
  const branchSimilarityClasses = uniqueStrings(
    diagnostics.map((diagnostic) => diagnostic.branchSimilarityClass),
  ).toSorted();
  const nextLegalTransitions = uniqueStrings([
    input.frontierState.nextLegalTransition,
    ...diagnostics.flatMap((diagnostic) => diagnostic.nextAllowedTransitions),
  ]).toSorted();
  const stage = input.terminalBlockerCode ?? "scheduler_frontier_blocked";
  const hashCore = {
    graphId: input.graphId,
    stage,
    nodeKinds,
    capabilityIds,
    executionIntents,
    evidenceModes,
    missingFields,
    blockerReasonCodes,
    contractVersions,
    domainResourcePacketKinds,
    schemaErrorPaths,
    policyErrorPaths,
    providerProfileIds,
    branchSimilarityClasses,
    nextLegalTransitions,
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
    stage,
    nodeKinds,
    capabilityIds,
    executionIntents,
    evidenceModes,
    missingFields,
    contractVersions,
    domainResourcePacketKinds,
    schemaErrorPaths,
    policyErrorPaths,
    providerProfileIds,
    branchSimilarityClasses,
    nextLegalTransitions,
    signatureHash,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function buildFrontierRootCauseArtifact(input: {
  graphId: string;
  iteration: number;
  snapshot: RuntimeWorkGraphSnapshot;
  frontierState: RuntimeWorkGraphSchedulerFrontierState;
  noProgressSignature: RuntimeWorkGraphNoProgressSignature;
  repeatCount: number;
}): RuntimeWorkGraphFrontierRootCauseArtifact {
  const diagnostics = input.frontierState.blockedNodeDiagnostics;
  const affectedNodeIds = uniqueStrings(diagnostics.map((diagnostic) => diagnostic.nodeId)).slice(
    0,
    80,
  );
  const affectedNodeIdSet = new Set(affectedNodeIds);
  const affectedBranchIds = uniqueStrings(
    diagnostics.map((diagnostic) => diagnostic.branchId),
  ).slice(0, 80);
  const successfulSiblingNodes = input.snapshot.nodes
    .filter((node) => node.nodeStatus === "succeeded" && !affectedNodeIdSet.has(node.nodeId))
    .slice(0, 80);
  const successfulSiblingEvidenceRefs = uniqueStrings(
    successfulSiblingNodes.flatMap((node) => node.outputArtifactRefs),
  ).slice(0, 80);
  const unaffectedSiblingBranchIds = successfulSiblingNodes
    .map((node, index) => `frontier:${input.iteration}:sibling:${index + 1}:${node.nodeId}`)
    .slice(0, 80);
  const missingFields = uniqueStrings(diagnostics.flatMap((diagnostic) => diagnostic.missingFields));
  const reasonCodes = uniqueStrings(diagnostics.flatMap((diagnostic) => diagnostic.reasonCodes));
  const schemaErrorPaths = uniqueStrings(
    diagnostics.map((diagnostic) => diagnostic.schemaErrorPath),
  );
  const policyErrorPaths = uniqueStrings(
    diagnostics.map((diagnostic) => diagnostic.policyErrorPath),
  );
  const contractRefs = uniqueStrings(diagnostics.map((diagnostic) => diagnostic.contractRef));
  const contractVersions = uniqueStrings(
    diagnostics.map((diagnostic) => diagnostic.contractVersion),
  );
  const domainResourcePacketKinds = uniqueStrings(
    diagnostics.map((diagnostic) => diagnostic.domainResourcePacketKind),
  );
  const domainResourcePacketRefs = uniqueStrings(
    diagnostics.map((diagnostic) => diagnostic.domainResourcePacketRef),
  );
  const providerProfileIds = uniqueStrings(
    diagnostics.map((diagnostic) => diagnostic.providerProfileId),
  );
  const attemptedTransitions = uniqueStrings(
    diagnostics.flatMap((diagnostic) => diagnostic.nextAllowedTransitions),
  );
  const nextLegalTransitions = uniqueStrings([
    input.frontierState.nextLegalTransition,
    ...attemptedTransitions,
  ]);
  const recommendedRepairBoundary = recommendedRepairBoundaryForRootCause({
    missingFields,
    reasonCodes,
    nextLegalTransitions,
    providerProfileIds,
    schemaErrorPaths,
    policyErrorPaths,
  });
  const occurrenceRef = `runtime-work-graph://frontier-root-cause/${input.graphId}/${input.noProgressSignature.signatureHash}`;
  return {
    artifactKind: "runtime_work_graph_frontier_root_cause",
    schemaVersion: "execution-platform.runtime-work-graph.frontier-root-cause.v1",
    graphId: input.graphId,
    iteration: input.iteration,
    superstep: input.iteration,
    signatureHash: input.noProgressSignature.signatureHash,
    repeatCount: input.repeatCount,
    systemic:
      diagnostics.length > 1 &&
      uniqueStrings(diagnostics.map((diagnostic) => diagnostic.branchSimilarityClass)).length === 1,
    stage: input.noProgressSignature.stage,
    affectedNodeIds,
    affectedBranchIds,
    unaffectedSiblingBranchIds,
    successfulSiblingEvidenceRefs,
    firstOccurrenceRef: `${occurrenceRef}/first`,
    lastOccurrenceRef: `${occurrenceRef}/repeat/${input.repeatCount}`,
    missingFields: missingFields.slice(0, 80),
    reasonCodes: reasonCodes.slice(0, 80),
    schemaErrorPaths: schemaErrorPaths.slice(0, 40),
    policyErrorPaths: policyErrorPaths.slice(0, 40),
    contractRefs: contractRefs.slice(0, 40),
    contractVersions: contractVersions.slice(0, 20),
    domainResourcePacketKinds: domainResourcePacketKinds.slice(0, 20),
    domainResourcePacketRefs: domainResourcePacketRefs.slice(0, 40),
    providerProfileIds: providerProfileIds.slice(0, 20),
    attemptedTransitions: attemptedTransitions.slice(0, 40),
    recommendedRepairBoundary,
    nextLegalTransitions: nextLegalTransitions.slice(0, 40),
    noProgressSignature: input.noProgressSignature,
    branchDiagnostics: diagnostics.slice(0, 40),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
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
    resourceHandoffPacketRef: jsonString(metadata.resourceHandoffPacketRef),
    resourceHandoffPacketRefs: uniqueStrings([
      jsonString(metadata.resourceHandoffPacketRef),
      ...jsonStringArray(metadata.resourceHandoffPacketRefs),
    ]).slice(0, 40),
    resourceSpecialistToolLoopRef: jsonString(metadata.resourceSpecialistToolLoopRef),
    resourceSpecialistExecutionPacketRef: jsonString(metadata.resourceSpecialistExecutionPacketRef),
    resourceSpecialistExecutionPacketRefs: uniqueStrings([
      jsonString(metadata.resourceSpecialistExecutionPacketRef),
      ...jsonStringArray(metadata.resourceSpecialistExecutionPacketRefs),
    ]).slice(0, 40),
    resourceRequirementRefs: jsonStringArray(metadata.resourceRequirementRefs).slice(0, 40),
    sufficiencyStatus: jsonString(metadata.sufficiencyStatus),
    handoffStatus: jsonString(metadata.handoffStatus),
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
    toolId === "scheduler.work_intent.propose" ||
    toolId === "scheduler.work_intent.accept_roots" ||
    toolId === "scheduler.work_intent.link_dependencies" ||
    toolId === "scheduler.work_intent.set_capability" ||
    toolId === "scheduler.work_intent.set_evidence_mode" ||
    toolId === "scheduler.work_intent.mark_non_runnable" ||
    toolId === "scheduler.work_intent.request_revision" ||
    toolId === "capability.lookup" ||
    toolId === "capability.validate_intent" ||
    toolId === "capability.require_resources" ||
    toolId === "capability.require_validation" ||
    toolId === "capability.require_evidence" ||
    toolId === "capability.list_legal_transitions" ||
    toolId === "scheduler.compile_work_intents" ||
    toolId === "scheduler.validate_work_intent_capability" ||
    toolId === "scheduler.compile_resource_requirements_for_work_intents" ||
    toolId === "scheduler.resolve_work_intent_resource_requirements" ||
    toolId === "scheduler.accept_resources_for_work_intent" ||
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
  if (toolId === "scheduler.accept_staged_graph") {
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
    toolId === "scheduler.mark_read_only_work_intent_satisfied_from_resources" ||
    toolId === "scheduler.promote_resource_satisfied_work_intent_to_executable" ||
    toolId === "scheduler.request_resource_requirement_for_work_intent" ||
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
    toolId === "scheduler.reject_work_intent_graph"
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
  if (toolId === "scheduler.record_frontier_root_cause") {
    return "frontier_root_cause_collapse";
  }
  if (toolId === "scheduler.record_branch_scoped_frontier_state") {
    return "branch_scoped_frontier_state";
  }
  if (toolId === "scheduler.record_model_call_envelope") {
    return "scheduler_model_call_observability";
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
    return "source_prompt_resource_in_progress";
  }
  if (toolId.startsWith("resource.demand.")) {
    return "node_resource_demand";
  }
  if (toolId.startsWith("resource.scout.")) {
    return "node_resource_demand";
  }
  if (
    toolId === "context.resolve_target_refs" ||
    toolId === "context.resolve_directory_seed" ||
    toolId === "repo.snapshot_target_files" ||
    toolId === "context.compile_implementation_context_packet" ||
    toolId === "implementation.select_target_files" ||
    toolId === "implementation.declare_new_file_intent" ||
    toolId === "implementation.compile_task_packet" ||
    toolId === "implementation.evaluate_readiness" ||
    toolId.startsWith("node.") ||
    toolId.startsWith("frontier.") ||
    toolId.startsWith("readback.")
  ) {
    return "resource_materialization";
  }
  return "execution_in_progress";
}

function jsonStringArray(value: JsonValue | unknown | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function jsonString(value: JsonValue | unknown | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function validateSchedulerValidationNodePhaseOrdering(input: {
  nodes: OrchestratorGraphNodeSpec[];
  edges: NonNullable<OrchestratorGraphDecision["newEdges"]>;
  existingNodesById: Map<string, TeamGraphNode>;
}): { valid: boolean; reasonCodes: string[]; blockerSummary: string | null } {
  const proposedNodesById = new Map(input.nodes.map((node) => [node.nodeId, node]));
  const stagedWorkerNodeIds = new Set(
    input.nodes
      .filter((node) =>
        ["implementation", "test_authoring", "docs_update"].includes(node.nodeKind),
      )
      .map((node) => node.nodeId),
  );
  const nodeKindFor = (nodeId: string | null | undefined): string | null =>
    nodeId
      ? (proposedNodesById.get(nodeId)?.nodeKind ??
        input.existingNodesById.get(nodeId)?.nodeKind ??
        null)
      : null;
  const reasonCodes: string[] = [];
  for (const node of input.nodes) {
    if (node.nodeKind !== "validation" && node.nodeKind !== "test_review") {
      continue;
    }
    const metadata = jsonRecord((node.metadata ?? null) as JsonValue);
    const validationPhase = normalizeRuntimeValidationPhase(
      metadata.validationPhase ?? metadata.validationNodePhase,
    );
    if (!validationPhase) {
      reasonCodes.push(`validation_node_phase_missing:${node.nodeId}`);
      continue;
    }
    if (
      validationPhase === "worker_post_edit_validation" ||
      validationPhase === "post_action_validation"
    ) {
      reasonCodes.push(`validation_node_worker_local_phase_rejected:${node.nodeId}`);
      continue;
    }
    if (
      validationPhase === "integration_validation" ||
      validationPhase === "final_proof_validation" ||
      validationPhase === "review_validation" ||
      validationPhase === "closeout_validation"
    ) {
      const incomingKinds = input.edges
        .filter((edge) => edge.toNodeId === node.nodeId)
        .map((edge) => nodeKindFor(edge.fromNodeId))
        .filter((kind): kind is string => Boolean(kind));
      const independentRoot =
        metadata.independentRoot === true &&
        typeof metadata.independentRootRationale === "string" &&
        metadata.independentRootRationale.trim().length > 0;
      const hasPostWorkDependency = incomingKinds.some((kind) =>
        [
          "implementation",
          "test_authoring",
          "docs_update",
          "review",
          "test_review",
          "work_intent",
        ].includes(kind),
      );
      if (!hasPostWorkDependency && (!independentRoot || stagedWorkerNodeIds.size > 0)) {
        reasonCodes.push(`validation_node_missing_post_work_dependency:${node.nodeId}`);
      }
      const outgoingToWorker = input.edges.some((edge) => {
        if (edge.fromNodeId !== node.nodeId) {
          return false;
        }
        const toKind = nodeKindFor(edge.toNodeId);
        return (
          toKind === "implementation" ||
          toKind === "test_authoring" ||
          toKind === "docs_update"
        );
      });
      if (outgoingToWorker) {
        reasonCodes.push(`validation_node_invalid_before_worker_dependency:${node.nodeId}`);
      }
    }
  }
  return {
    valid: reasonCodes.length === 0,
    reasonCodes,
    blockerSummary:
      reasonCodes.length > 0
        ? "Validation graph nodes must be phase-typed. Worker-local post-edit validation belongs inside the worker lifecycle; integration/final/review/closeout validation must depend on completed work and cannot precede implementation workers."
        : null,
  };
}

function boundedPlainText(value: JsonValue | unknown | undefined, max = 1_200): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/gu, " ")
    .slice(0, max);
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
    jsonString(metadata.resourceRequirementRef),
    jsonString(metadata.resourceHandoffPacketRef),
    jsonString(metadata.resourceSpecialistToolLoopRef),
    ...jsonStringArray(metadata.contextBrokerRequestRefs),
    ...jsonStringArray(metadata.resourceRequirementRefs),
    ...jsonStringArray(metadata.contextPacketRefs),
    ...jsonStringArray(metadata.resourceHandoffPacketRefs),
    ...jsonStringArray(metadata.resourceSpecialistToolLoopRefs),
    ...jsonContextSnapshotArray(metadata.contextSnapshotRefs).map((ref) => ref.snapshotRef),
    ...jsonContextSnapshotArray(metadata.providedContextSnapshotRefs).map((ref) => ref.snapshotRef),
    ...jsonContextSnapshotArray(metadata.requiredContextSnapshotRefs).map((ref) => ref.snapshotRef),
  ]);
}

function isImplementationContextRepairReasonCode(code: string): boolean {
  return (
    !DOMAIN_RESOURCE_SELECTION_REPAIR_REASON_CODES.has(code) &&
    (IMPLEMENTATION_CONTEXT_REPAIR_REASON_CODE_EXACT.has(code) ||
      IMPLEMENTATION_CONTEXT_REPAIR_REASON_CODE_PREFIXES.some((prefix) => code.startsWith(prefix)))
  );
}

function isDomainResourceSelectionRepairReasonCode(code: string): boolean {
  return DOMAIN_RESOURCE_SELECTION_REPAIR_REASON_CODES.has(code);
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
  const eventClass = input.node.nodeKind === "closeout" ? "closeout" : (roleClass ?? input.node.nodeKind);
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
      incompatibleEvidenceClaimCount: Math.max(0, totalEvidenceClaimCount - compatibleEvidenceClaimCount),
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

function executionIntentForNode(node: TeamGraphNode): ExecutionIntent | null {
  const metadata = jsonRecord(node.metadata ?? {});
  return normalizeExecutionIntent(metadata.executionIntent);
}

function evidenceModeForNodeDemand(input: {
  node: TeamGraphNode;
  capability: RuntimeNodeCapability | null;
}): EvidenceMode[] {
  const metadata = jsonRecord(input.node.metadata ?? {});
  const modelAuthored = normalizeEvidenceModes(metadata.evidenceMode);
  if (modelAuthored.length > 0) {
    return modelAuthored;
  }
  if (input.capability) {
    return evidenceModesForCapability({
      capability: input.capability,
      executionIntent: executionIntentForNode(input.node),
    });
  }
  return [];
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
  const promotedWorkIntentExecutablePairs = Array.isArray(
    metadata.promotedWorkIntentExecutablePairs,
  )
    ? metadata.promotedWorkIntentExecutablePairs.map((pair) => {
        const record = jsonRecord(pair as JsonValue);
        const executableNodeId =
          typeof record.executableNodeId === "string"
            ? (nodeIdMap.get(record.executableNodeId) ?? record.executableNodeId)
            : record.executableNodeId;
        return {
          ...record,
          executableNodeId,
        } as JsonValue;
      })
    : metadata.promotedWorkIntentExecutablePairs;
  const promotedExecutableNodeIds = Array.isArray(metadata.promotedExecutableNodeIds)
    ? metadata.promotedExecutableNodeIds.map((nodeId) =>
        typeof nodeId === "string" ? (nodeIdMap.get(nodeId) ?? nodeId) : nodeId,
      )
    : metadata.promotedExecutableNodeIds;
  return {
    ...input.decision,
    targetNodeId: mapNodeId(input.decision.targetNodeId) ?? null,
    runNodeId: mapNodeId(input.decision.runNodeId) ?? null,
    newNodes,
    newEdges,
    metadata: {
      ...metadata,
      promotedWorkIntentExecutablePairs,
      promotedExecutableNodeIds,
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
  return ["planning", "orchestration"].includes(
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
  }
  return "execution";
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

function nodeLifecycleSchedulerTransitionContext(
  value: unknown,
): NodeLifecycleSchedulerTransitionContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Partial<NodeLifecycleSchedulerTransitionContext>;
  if (
    !Array.isArray(record.executedNodeIds) ||
    !Array.isArray(record.addedNodeIds) ||
    !record.loopGuard ||
    typeof record.loopGuard !== "object"
  ) {
    return null;
  }
  return {
    missionLedger: record.missionLedger ?? null,
    executedNodeIds: record.executedNodeIds,
    addedNodeIds: record.addedNodeIds,
    loopGuard: record.loopGuard,
  };
}

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
  if (contextRefsFromMetadata(metadata).length > 0) {
    return true;
  }
  return false;
}

function nodeExecutionPacketFromMetadata(node: TeamGraphNode): NodeExecutionPacket | null {
  const metadata = jsonRecord(node.metadata);
  const parsed = NodeExecutionPacketSchema.safeParse(metadata.nodeExecutionPacket);
  return parsed.success ? parsed.data : null;
}

function nodeResourceReadinessFromManifestMetadata(node: TeamGraphNode): {
  valid: boolean;
  status: "ready" | "ready_with_limitations" | "blocked" | "not_evaluated";
  reasonCodes: string[];
  blockingLimitations: string[];
  nodeExecutionPacketRef: string | null;
  nodeExecutionContractRef: string | null;
  resourcePacketRef: string | null;
  nodeReadinessStateRef: string | null;
  contextStatus: string | null;
} | null {
  const metadata = jsonRecord(node.metadata);
  const nodeExecutionPacketRef =
    typeof metadata.nodeExecutionPacketRef === "string" && metadata.nodeExecutionPacketRef.trim()
      ? metadata.nodeExecutionPacketRef.trim()
      : null;
  const nodeExecutionContractRef =
    typeof metadata.nodeExecutionContractRef === "string" &&
    metadata.nodeExecutionContractRef.trim()
      ? metadata.nodeExecutionContractRef.trim()
      : null;
  const resourcePacketRef =
    typeof metadata.resourcePacketRef === "string" && metadata.resourcePacketRef.trim()
      ? metadata.resourcePacketRef.trim()
      : null;
  const nodeReadinessStateRef =
    typeof metadata.nodeReadinessStateRef === "string" && metadata.nodeReadinessStateRef.trim()
      ? metadata.nodeReadinessStateRef.trim()
      : null;
  const nodeExecutionContractHash =
    typeof metadata.nodeExecutionContractHash === "string" &&
    metadata.nodeExecutionContractHash.trim()
      ? metadata.nodeExecutionContractHash.trim()
      : null;
  const nodeExecutionPacketHash =
    typeof metadata.nodeExecutionPacketHash === "string" && metadata.nodeExecutionPacketHash.trim()
      ? metadata.nodeExecutionPacketHash.trim()
      : null;
  const resourcePacketHash =
    typeof metadata.resourcePacketHash === "string" && metadata.resourcePacketHash.trim()
      ? metadata.resourcePacketHash.trim()
      : typeof metadata.domainResourcePacketHash === "string" &&
          metadata.domainResourcePacketHash.trim()
        ? metadata.domainResourcePacketHash.trim()
        : null;
  if (!nodeExecutionContractRef || !nodeExecutionPacketRef || !resourcePacketRef || !nodeReadinessStateRef) {
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
  const staleProjection = metadata.nodeReadinessStale === true || metadata.childEpochStale === true;
  const missingProjectionHashes = [
    ...(nodeExecutionContractHash ? [] : ["nodeExecutionContractHash"]),
    ...(nodeExecutionPacketHash ? [] : ["nodeExecutionPacketHash"]),
    ...(resourcePacketHash ? [] : ["resourcePacketHash"]),
  ];
  const valid =
    (readinessStatus === "ready" || readinessStatus === "ready_with_limitations") &&
    transitions.includes("execute_node") &&
    !staleProjection &&
    missingProjectionHashes.length === 0;
  return {
    valid,
    status: valid ? readinessStatus : "blocked",
    reasonCodes: [
      ...jsonStringArray(metadata.resourceReadinessReasonCodes),
      ...(staleProjection ? ["node_readiness_projection_stale"] : []),
      ...missingProjectionHashes.map((field) => `node_readiness_projection_${field}_missing`),
    ],
    blockingLimitations: [
      ...jsonStringArray(metadata.resourceBlockingLimitations),
      ...(staleProjection
        ? ["Persisted readiness projection is stale and must be recomputed before execution."]
        : []),
      ...(missingProjectionHashes.length > 0
        ? [
            "Persisted readiness projection is missing structural hash fields required for execution.",
          ]
        : []),
    ],
    nodeExecutionPacketRef,
    nodeExecutionContractRef,
    resourcePacketRef,
    nodeReadinessStateRef,
    contextStatus,
  };
}

function uniqueContextSnapshotRefs(refs: ContextSnapshotRef[]): ContextSnapshotRef[] {
  const seen = new Set<string>();
  const result: ContextSnapshotRef[] = [];
  for (const ref of refs) {
    const key = `${ref.snapshotRef}:${ref.sourceRef}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function deterministicWorkIntentExecutablePromotionDecision(input: {
  graphId: string;
  iteration: number;
  snapshot: RuntimeWorkGraphSnapshot;
  missionLedger: MissionContractLedger | null;
  capabilityManifest: RuntimeNodeCapabilityManifest;
  executors: Record<string, RuntimeWorkGraphNodeExecutor>;
  requireNodeExecutionPacketForWorkerExecution: boolean;
}): OrchestratorGraphDecision | null {
  const statusByNodeId = new Map(
    input.snapshot.nodes.map((node) => [node.nodeId, node.nodeStatus]),
  );
  const existingPromotionSourceNodeIds = new Set(
    input.snapshot.nodes
      .map((node) => jsonRecord(node.metadata ?? null).promotedFromWorkIntentNodeId)
      .filter((nodeId): nodeId is string => typeof nodeId === "string" && nodeId.trim().length > 0),
  );
  const newNodes: OrchestratorGraphNodeSpec[] = [];
  const newEdges: NonNullable<OrchestratorGraphDecision["newEdges"]> = [];
  const promotionPairs: Array<{
    workIntentNodeId: string;
    executableNodeId: string;
    selectedCapabilityId: string;
    executableNodeKind: string;
    rawPromptStored: false;
    rawResponseStored: false;
    rawProviderLogStored: false;
  }> = [];

  for (const node of input.snapshot.nodes) {
    if (
      node.nodeKind !== "work_intent" ||
      node.nodeStatus !== "planned" ||
      existingPromotionSourceNodeIds.has(node.nodeId)
    ) {
      continue;
    }
    const metadata = jsonRecord(node.metadata ?? null);
    if (metadata.workIntentCompiled !== true) {
      continue;
    }
    const unsatisfiedDependencies = nodeBlockingDependencies({
      snapshot: input.snapshot,
      nodeId: node.nodeId,
    }).filter((dependency) => {
      const status = statusByNodeId.get(dependency.dependencyId);
      return !(
        status &&
        dependencyStatusSatisfiesTarget({
          targetNodeKind: node.nodeKind,
          edgeKind: dependency.edgeKind,
          dependencyStatus: status,
        })
      );
    });
    if (unsatisfiedDependencies.length > 0) {
      continue;
    }
    const contextResolution = compileWorkIntentContextResolution({
      snapshot: input.snapshot,
      workIntentNode: node,
      capabilityManifest: input.capabilityManifest,
    });
    if (
      contextResolution.status !== "satisfied" &&
      contextResolution.status !== "worker_action_ready"
    ) {
      continue;
    }
    const selectedCapabilityId =
      typeof metadata.workIntentSelectedCapabilityId === "string"
        ? metadata.workIntentSelectedCapabilityId
        : typeof metadata.selectedCapabilityId === "string"
          ? metadata.selectedCapabilityId
          : null;
    const capability = selectedCapabilityId
      ? findRuntimeNodeCapability(selectedCapabilityId, input.capabilityManifest)
      : null;
    if (!capability || !capability.canRunAsExecutable || capability.graphNodeKind === "work_intent") {
      continue;
    }
    const promotionHash = createHash("sha256")
      .update(`${input.graphId}:${node.nodeId}:${capability.capabilityId}`)
      .digest("hex")
      .slice(0, 12);
    const executableNodeId = `${node.nodeId}-${capability.graphNodeKind}-${promotionHash}`.slice(
      0,
      120,
    );
    if (input.snapshot.nodes.some((existing) => existing.nodeId === executableNodeId)) {
      existingPromotionSourceNodeIds.add(node.nodeId);
      continue;
    }
    const providedContextSnapshotRefs = uniqueContextSnapshotRefs([
      ...jsonContextSnapshotArray(metadata.providedContextSnapshotRefs),
      ...jsonContextSnapshotArray(metadata.contextSnapshotRefs),
    ]).slice(0, 40);
    const resourceHandoffPacketRefs = jsonStringArray(metadata.resourceHandoffPacketRefs).slice(
      0,
      40,
    );
    const targetCommitmentIds = uniqueStrings([
      ...jsonStringArray(metadata.commitmentIdsAdvanced),
      ...jsonStringArray(metadata.targetCommitmentIds),
    ]).slice(0, 40);
    const targetRefs = nodeSchedulingTargetRefs(node);
    const utilityDecision: CostAwareCapabilityUtilityDecision = {
      decisionId: `runtime-workintent-promotion-${input.iteration}-${promotionHash}`,
      consideredCapabilityIds: jsonStringArray(metadata.consideredCapabilityIds).length
        ? jsonStringArray(metadata.consideredCapabilityIds)
        : [capability.capabilityId],
      selectedCapabilityId: capability.capabilityId,
      selectedNodeKind: capability.graphNodeKind,
      selectedExecutorKey: capability.executorKey,
      targetCommitmentIds,
      utilityRationale:
        typeof metadata.utilityRationale === "string"
          ? metadata.utilityRationale
        : contextResolution.status === "worker_action_ready"
          ? "Runtime is promoting a validated WorkIntent to the model-selected executable capability; worker-owned context discovery will run inside the executable node lifecycle."
          : "Runtime is promoting a validated WorkIntent to the model-selected executable capability after required context/resource prerequisites are available.",
      costRationale:
        typeof metadata.costRationale === "string"
          ? metadata.costRationale
          : "The model already selected this capability at the WorkIntent boundary; runtime is only applying the manifest-backed transition.",
      whyCheaperOptionsWereInsufficient:
        typeof metadata.whyCheaperOptionsWereInsufficient === "string"
          ? metadata.whyCheaperOptionsWereInsufficient
          : null,
      whyThisIsNotDuplicateWork:
        typeof metadata.whyThisIsNotDuplicateWork === "string"
          ? metadata.whyThisIsNotDuplicateWork
          : `No executable node has been promoted from WorkIntent ${node.nodeId}.`,
      expectedEvidence: capability.evidenceProducedKinds,
      expectedDownstreamConsumer:
        typeof metadata.expectedDownstreamConsumer === "string"
          ? metadata.expectedDownstreamConsumer
          : node.nodeId,
      budgetRef: `runtime-task-budget://${input.snapshot.graph.workflowId}/${capability.capabilityId}/workintent-promotion`,
      stopOrEscalationCondition:
        typeof metadata.stopOrEscalationCondition === "string"
          ? metadata.stopOrEscalationCondition
          : contextResolution.status === "worker_action_ready"
            ? "Start the worker with authority bounds, legal refs, obligations, and worker-owned context/search/read tools; stop only if the worker lifecycle emits a typed blocker."
            : "Stop before worker invocation if materialized resources or validation refs are missing.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
    const executableNode: OrchestratorGraphNodeSpec = {
      nodeId: executableNodeId,
      nodeKind: capability.graphNodeKind,
      capabilityId: capability.capabilityId,
      executorKey: capability.executorKey,
      workerRef: capability.workerRef,
      requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
      assignedRole: capability.roleId,
      modelOrWorkerRef: capability.workerRef,
      inputHandoffRefs: uniqueStrings([
        graphRef("node", node.nodeId),
        typeof metadata.workIntentRef === "string" ? metadata.workIntentRef : null,
        ...node.inputHandoffRefs,
        ...resourceHandoffPacketRefs,
      ]).slice(0, 40),
      expectedOutput:
        typeof metadata.expectedOutput === "string"
          ? metadata.expectedOutput
          : node.outputArtifactRefs[0] ?? "Execute the promoted WorkIntent capability.",
      acceptanceCriteria: jsonStringArray(metadata.acceptanceCriteria).length
        ? jsonStringArray(metadata.acceptanceCriteria)
        : jsonStringArray(metadata.successCriteria),
      downstreamConsumer:
        typeof metadata.expectedDownstreamConsumer === "string"
          ? metadata.expectedDownstreamConsumer
          : "runtime_work_graph_scheduler",
      commitmentIdsAdvanced: targetCommitmentIds,
      whyThisRoleIsNeededNow:
        typeof metadata.whyThisRoleIsNeededNow === "string"
          ? metadata.whyThisRoleIsNeededNow
          : typeof metadata.utilityRationale === "string"
            ? metadata.utilityRationale
            : contextResolution.status === "worker_action_ready"
              ? "The WorkIntent has valid authority, obligations, capability, and legal refs; the worker now owns context discovery."
              : "The WorkIntent has accepted prerequisites and can now enter resource materialization or execution.",
      exactObjective:
        typeof metadata.exactObjective === "string"
          ? metadata.exactObjective
          : typeof metadata.workUnitTitle === "string"
            ? metadata.workUnitTitle
            : "Execute promoted WorkIntent.",
      evidenceExpectation:
        typeof metadata.evidenceExpectation === "string"
          ? metadata.evidenceExpectation
          : capability.evidenceProducedKinds.join(", "),
      targetRefs,
      metadata: {
        capabilityId: capability.capabilityId,
        graphNodeKind: capability.graphNodeKind,
        executorKey: capability.executorKey,
        workerRef: capability.workerRef,
        requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
        stagedSchedulerProtocolCompiled: true,
        genericSchedulerProtocolCompiled: true,
        runtimeOwnedWorkIntentPromotion: true,
        runtimeOwnedLifecycleTransition: true,
        lifecycleTransitionOwner: "NodeLifecycleTransitionRunner",
        lifecycleTransitionGate:
          contextResolution.status === "worker_action_ready"
            ? "worker_action_ready"
            : "resource_ledger_ready",
        runtimePrerequisiteCritical: true,
        promotedFromWorkIntentNodeId: node.nodeId,
        promotedFromWorkIntentRef:
          typeof metadata.workIntentRef === "string" ? metadata.workIntentRef : null,
        workIntentId: typeof metadata.workIntentId === "string" ? metadata.workIntentId : null,
        workUnitId: typeof metadata.workUnitId === "string" ? metadata.workUnitId : null,
        executionIntent:
          typeof metadata.executionIntent === "string" ? metadata.executionIntent : null,
        evidenceMode: jsonStringArray(metadata.evidenceMode),
        resourceRequirementKinds: jsonStringArray(metadata.resourceRequirementKinds),
        contextSnapshotRefs: providedContextSnapshotRefs as unknown as JsonValue,
        providedContextSnapshotRefs: providedContextSnapshotRefs as unknown as JsonValue,
        resourceHandoffPacketRefs,
        contextBrokerConsumerNodeId: node.nodeId,
        targetRefs,
        commitmentIdsAdvanced: targetCommitmentIds,
        targetCommitmentIds,
        validationNeeds: jsonStringArray(metadata.validationNeeds),
        contextQuestions: jsonStringArray(metadata.contextQuestions),
        stopIfMissing: jsonStringArray(metadata.stopIfMissing),
        expectedEvidence: runtimeDerivedEvidenceForNode({
          node: {
            nodeId: executableNodeId,
            nodeKind: capability.graphNodeKind,
            capabilityId: capability.capabilityId,
            assignedRole: capability.roleId,
            commitmentIdsAdvanced: targetCommitmentIds,
            expectedOutput: "",
            acceptanceCriteria: [],
            downstreamConsumer: "",
          },
          missionLedger: input.missionLedger,
          capabilityManifest: input.capabilityManifest,
        }),
        expectedEvidenceSource: "runtime_derived_from_capability_manifest_and_mission_ledger",
        utilityDecision,
        costAwareUtilityDecision: utilityDecision,
        consideredCapabilityIds: utilityDecision.consideredCapabilityIds,
        utilityRationale: utilityDecision.utilityRationale,
        costRationale: utilityDecision.costRationale,
        whyCheaperOptionsWereInsufficient: utilityDecision.whyCheaperOptionsWereInsufficient,
        whyThisIsNotDuplicateWork: utilityDecision.whyThisIsNotDuplicateWork,
        stopOrEscalationCondition: utilityDecision.stopOrEscalationCondition,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } as unknown as JsonValue,
    };
    newNodes.push(executableNode);
    newEdges.push({
      edgeId: `workintent-promote-${node.nodeId}-to-${executableNodeId}`.slice(0, 96),
      fromNodeId: node.nodeId,
      toNodeId: executableNodeId,
      edgeKind: "handoff",
      reasonCodes: [
        "runtime_work_intent_promotion_handoff_edge",
        "work_intent_must_succeed_before_executable_child",
      ],
      artifactRefs: [graphRef("node", node.nodeId)],
      metadata: {
        runtimeOwnedWorkIntentPromotionEdge: true,
        promotedFromWorkIntentNodeId: node.nodeId,
        promotedExecutableNodeId: executableNodeId,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } satisfies JsonValue,
    });
    promotionPairs.push({
      workIntentNodeId: node.nodeId,
      executableNodeId,
      selectedCapabilityId: capability.capabilityId,
      executableNodeKind: capability.graphNodeKind,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  }
  if (newNodes.length === 0) {
    return null;
  }
  return {
    decisionId: `runtime-workintent-promote-${input.iteration}`,
    decisionKind: "add_nodes",
    rationaleForDecision:
      "Runtime promoted accepted WorkIntent control-plane nodes into their model-selected executable capability nodes. The runtime used only manifest fields and accepted context refs; it did not infer semantic task meaning.",
    newNodes,
    newEdges,
    runAfterAdd: true,
    runNodeId: newNodes[0]?.nodeId,
    commitmentIdsAdvanced: uniqueStrings(
      newNodes.flatMap((node) => node.commitmentIdsAdvanced ?? []),
    ),
    reasonCodes: [
      "runtime_policy_work_intent_promoted_to_executable",
      `runtime_policy_work_intent_promotion_node_count:${newNodes.length}`,
    ],
    metadata: {
      stagedSchedulerProtocolCompiled: true,
      genericSchedulerProtocolCompiled: true,
      runtimeOwnedLifecycleTransition: true,
      lifecycleTransitionOwner: "NodeLifecycleTransitionRunner",
      lifecycleTransitionGate: "worker_action_ready",
      runtimePrerequisiteCritical: true,
      runtimeOwnedWorkIntentPromotion: true,
      promotedWorkIntentNodeIds: promotionPairs.map((pair) => pair.workIntentNodeId),
      promotedExecutableNodeIds: promotionPairs.map((pair) => pair.executableNodeId),
      promotedWorkIntentExecutablePairs: promotionPairs,
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
    const validationRefs = uniqueStrings([...(claim.validationRefs ?? []), ...input.validationRefs]).slice(
      0,
      20,
    );
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
  if (
    !input.requireEvidenceClaims ||
    !input.ledger ||
    input.resultStatus !== "succeeded"
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
      ["run_node", "retry_node"].includes(input.decision.decisionKind) &&
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
        nodeMetadata.runtimeOwnedNodeScopedResourceFulfillment === true;
      const diagnosticOnly =
        nodeMetadata.diagnosticOnly === true ||
        nodeMetadata.lifecycleState === "diagnostic_only" ||
        nodeMetadata.contextNodeLifecycle === "diagnostic_only";
      if (
        isContextRepairOrAcquisition &&
        !diagnosticOnly &&
        !outgoingEdgesByNodeId.has(node.nodeId)
      ) {
        reasonCodes.push("resource_repair_or_acquisition_node_consumer_edge_missing");
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
      const everyNodeIndependentRoot = newNodes.every((node) => {
        const nodeMetadata = jsonRecord(node.metadata ?? null);
        return (
          nodeMetadata.independentRoot === true &&
          typeof nodeMetadata.independentRootRationale === "string" &&
          nodeMetadata.independentRootRationale.trim().length > 0
        );
      });
      if (!edgeRefsValid) {
        reasonCodes.push("complex_mission_decomposition_edge_refs_invalid");
      }
      if (!hasGraphStructure && !hasParallelJustification) {
        reasonCodes.push("complex_mission_decomposition_edges_or_parallel_justification_missing");
      }
      if (!hasGraphStructure && hasParallelJustification && !everyNodeIndependentRoot) {
        reasonCodes.push("complex_mission_parallel_independent_root_declarations_missing");
      }
    }
  }
  return reasonCodes;
}

function repairFieldHintsForReasonCodes(reasonCodes: string[]): string[] {
  const fields = new Set<string>();
  for (const code of reasonCodes) {
    if (code.includes("edge") || code.includes("parallel")) {
      fields.add(
        "scheduler.work_intent.accept_roots for independent non-runnable WorkIntent roots",
      );
      fields.add("stagedScheduler.edgeOrParallelismDraft.parallelIndependentNodesJustification");
      fields.add("newEdges[] only when real dependency or handoff edges exist");
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
    if (code.includes("edge") || code.includes("parallel")) {
      add(
        missingField(
          "stagedScheduler.edgeOrParallelismDraft.parallelIndependentNodesJustification or stagedScheduler.edgeOrParallelismDraft.edges[]",
          "typed root acceptance or real dependency edges",
          "Complex decomposition must be inspectable as real dependency edges or as model-authored independent non-runnable WorkIntent roots. Use independent-root justification only when the WorkIntent roots can wait for consumer-bound context requirements.",
          {
            parallelIndependentNodesJustification:
              "These WorkIntent roots are independent planning contracts; runtime will compile consumer-bound context requirements before any executable work can run.",
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
          { capabilityId: "implementation_microtask", commitmentIds: ["commitment-1"] },
        ),
      );
    }
    if (code.includes("cost_rationale")) {
      add(
        missingField(
          "costAwareUtilityDecision.costRationale",
          "string",
          "The orchestrator must explain why this capability is cost-appropriate for the commitment.",
          "Cheaper resource scout closes uncertainty before expensive implementation.",
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
          "implementation_microtask",
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

function schedulerEnvelopeNodeStatusCounts(
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary,
): SchedulerModelCallEnvelope["activeFrontierCounts"] {
  return snapshotSummary.nodeSummaries.reduce<SchedulerModelCallEnvelope["activeFrontierCounts"]>(
    (counts, node) => {
      if (node.nodeStatus === "planned") {
        counts.ready = (counts.ready ?? 0) + 1;
      } else if (node.nodeStatus === "running") {
        counts.running = (counts.running ?? 0) + 1;
      } else if (node.nodeStatus === "succeeded") {
        counts.completed = (counts.completed ?? 0) + 1;
      } else if (node.nodeStatus === "failed") {
        counts.failed = (counts.failed ?? 0) + 1;
      } else if (node.nodeStatus === "needs_review") {
        counts.needsReview = (counts.needsReview ?? 0) + 1;
      } else if (node.nodeStatus === "waiting_for_human") {
        counts.waitingForHuman = (counts.waitingForHuman ?? 0) + 1;
      }
      if ((node.lastStatusReasonCodes ?? []).length > 0) {
        counts.blocked = (counts.blocked ?? 0) + 1;
      }
      return counts;
    },
    {
      ready: 0,
      selected: null,
      blocked: 0,
      running: 0,
      completed: 0,
      failed: 0,
      needsReview: 0,
      waitingForHuman: 0,
      branches: null,
    },
  );
}

function schedulerDecisionRejectionEnvelope(input: {
  graphId: string;
  iteration: number;
  repairAttempt: number;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  missionLedger: MissionContractLedger | null;
  decisionId?: string | null;
  decisionKind?: string | null;
  rejectedDecisionRef?: string | null;
  reasonCodes: string[];
  repairRequest: ModelDecisionRepairRequest;
  diagnostics: OrchestratorGraphRejectedNodeDiagnostic[];
  rejectionSummary: string;
}): SchedulerModelCallEnvelope {
  const missingFields = [
    ...input.repairRequest.missingFields.map((field) => field.path),
    ...input.diagnostics.map((diagnostic) => diagnostic.path).filter(Boolean),
  ].filter((field): field is string => typeof field === "string" && field.length > 0);
  const firstDiagnostic = input.diagnostics.find((diagnostic) => diagnostic.path);
  const classification = classifyModelTaskCall({
    taskClass: "global_reasoning",
    callSite: "scheduler.global_reasoning",
    graphId: input.graphId,
  });
  const policyPreflight = evaluateModelPolicyBindingPreflight({
    classification,
    actualAllowedToolFamily: "scheduler.orchestrator_decision",
    actualOutputContractId: "runtime_work_graph_orchestrator_plan",
    actualOutputContractVersion: "v1",
  });
  return buildSchedulerModelCallEnvelope({
    phase: "rejection",
    spanId: `${input.graphId}:scheduler:${input.iteration}:${input.repairAttempt}:rejection`,
    runtimeJobId: input.snapshotSummary.rootRuntimeJobId ?? null,
    graphId: input.graphId,
    schedulerIteration: input.iteration,
    currentSuperstep: input.iteration,
    repairAttempt: input.repairAttempt,
    decisionSlot: "scheduler.select_next_action",
    schedulerPhase: "scheduler_decision_rejected",
    modelRef: classification.selectedModelRef,
    providerPath: classification.providerPath,
    modelTaskClass: classification.taskClass,
    modelPolicyRef: classification.modelPolicyRef,
    contractBoundaryId: classification.contractBoundaryId,
    modelPolicyBindingRef: classification.modelPolicyBindingRef,
    reasoningMode: classification.reasoningMode,
    parserMode: classification.parserMode,
    allowedToolFamily: "scheduler.orchestrator_decision",
    allowedOutputContractId: "runtime_work_graph_orchestrator_plan",
    allowedOutputContractVersion: "v1",
    proofCleanlinessState: policyPreflight.proofCleanliness.state,
    proofCleanlinessReasonCodes: policyPreflight.proofCleanliness.reasonCodes,
    policyMismatchFields: policyPreflight.mismatches,
    inputRef: `runtime-work-graph://${input.graphId}/scheduler-decision-rejection/${input.iteration}/${input.repairAttempt}`,
    commitmentCount:
      (input.missionLedger?.blockingCommitments.length ?? 0) +
      (input.missionLedger?.nonBlockingCommitments.length ?? 0),
    workIntentCount: input.snapshotSummary.nodeSummaries.filter((node) =>
      Boolean(node.workIntentRef),
    ).length,
    graphNodeCount: input.snapshotSummary.nodeSummaries.length,
    graphEdgeCount: input.snapshotSummary.edgeCount,
    activeFrontierCounts: schedulerEnvelopeNodeStatusCounts(input.snapshotSummary),
    rejectedDecisionRef: input.rejectedDecisionRef,
    rejectedDecisionId: input.decisionId,
    rejectedDecisionKind: input.decisionKind,
    rejectedToolCallSummary: {
      status: "rejected",
      summary: input.rejectionSummary.slice(0, 500),
      diagnosticCount: input.diagnostics.length,
      reasonCodes: input.reasonCodes.slice(0, 20),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    schemaErrorPath: firstDiagnostic?.path ?? missingFields[0] ?? null,
    policyErrorPath: null,
    repairFieldHints: repairFieldHintsForReasonCodes(input.reasonCodes),
    missingFields,
    repairDiagnosticsRef: input.repairRequest.failedDecisionId
      ? `model-decision-repair://${input.repairRequest.failedDecisionId}`
      : null,
    reasonCodes: input.reasonCodes,
  });
}

function needsReviewRetryPolicyReasonCodesForDecision(input: {
  decision: OrchestratorGraphDecision;
  recentNodeResultSummaries: RuntimeWorkGraphRecentNodeResultSummary[];
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
}): string[] {
  if (!["retry_node", "run_node"].includes(input.decision.decisionKind)) {
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
    node.nodeKind === "orchestrator_plan"
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
  private readonly nodeLifecycleTransitionRunner: NodeLifecycleTransitionRunner;
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
    this.nodeLifecycleTransitionRunner = new NodeLifecycleTransitionRunner({
      capabilityManifest: this.capabilityManifest,
      recordProjection: async (input) => this.recordNodeLifecycleProjection(input),
      executeTransition: async (input) => this.advanceNodeLifecycleTransition(input),
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
      const nodeLifecycle = await this.nodeLifecycleTransitionRunner.drain({
        graphId,
        iteration,
        snapshot,
        maxTransitions: 1,
        excludeGateKinds: ["worker_action_ready"],
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
      const workerReadyWorkIntentLifecycle = await this.nodeLifecycleTransitionRunner.drain({
        graphId,
        iteration,
        snapshot: (await this.options.graphs.readGraphSnapshot(graphId)) ?? snapshot,
        maxTransitions: 1,
        includeGateKinds: ["worker_action_ready"],
        includeNodeKinds: ["work_intent"],
        transitionContext: {
          missionLedger,
          executedNodeIds,
          addedNodeIds,
          loopGuard,
        } satisfies NodeLifecycleSchedulerTransitionContext,
      });
      if (
        workerReadyWorkIntentLifecycle.hasPendingLegalTransitions ||
        workerReadyWorkIntentLifecycle.actionTaken
      ) {
        decisionRefs.push(...workerReadyWorkIntentLifecycle.refs);
        reasonCodes.push(...workerReadyWorkIntentLifecycle.reasonCodes);
        if (workerReadyWorkIntentLifecycle.status !== "continue") {
          return await this.result({
            status: workerReadyWorkIntentLifecycle.status,
            graphId,
            iterations: iteration,
            executedNodeIds,
            addedNodeIds,
            decisionRefs,
            reasonCodes,
            missionLedger: missionLedger ? summarizeMissionContractLedger(missionLedger) : null,
          });
        }
        if (
          workerReadyWorkIntentLifecycle.continueLoop ||
          workerReadyWorkIntentLifecycle.actionTaken
        ) {
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
        snapshot,
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
        status: "needs_review",
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
        nodeLifecycleRootCauseSignatureRef: input.projection.rootCauseSignature?.signatureRef ?? null,
        nodeLifecycleRootCauseSignatureHash: input.projection.rootCauseSignature?.signatureHash ?? null,
        nodeReadinessPhase: input.projection.currentGate,
        nodeReadinessNextAllowedTransitions: input.projection.nextLegalTransitions,
        nodeReadinessMirrorSource: "node_lifecycle_projection",
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
      nodeReadinessPhase: input.projection.currentGate,
      nodeReadinessStatus: input.projection.currentLifecycleState,
      nodeReadinessNextAllowedTransitions: input.projection.nextLegalTransitions,
      nextDecisionNeeded: input.projection.canCallGlobalScheduler
        ? "global_scheduler_allowed"
        : input.projection.nextLegalTransitions[0] ?? "node_lifecycle_transition_required",
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

  private domainResourceSelectionInputFrom(input: {
    graphId: string;
    iteration: number;
    snapshot: RuntimeWorkGraphSnapshot;
    node: TeamGraphNode;
    resolution: WorkIntentContextResolution;
  }): RuntimeWorkGraphDomainResourceSelectionInput {
    const nodeMetadata = jsonRecord(input.node.metadata ?? {});
    const runtimeJobId =
      input.snapshot.graph.rootRuntimeJobId ?? jsonString(nodeMetadata.runtimeJobId) ?? input.graphId;
    const capabilityId =
      input.resolution.capabilityId || nodeCapabilityId(input.node) || jsonString(nodeMetadata.capabilityId);
    const capability = capabilityId
      ? findRuntimeNodeCapability(capabilityId, this.capabilityManifest)
      : null;
    const targetCommitmentIds = uniqueStrings([
      ...jsonStringArray(nodeMetadata.targetCommitmentIds),
      ...jsonStringArray(nodeMetadata.commitmentIdsAdvanced),
    ]).slice(0, 24);
    const evidenceRequirements = uniqueStrings([
      ...input.resolution.evidenceMode,
      ...(capability?.requiredEvidenceClaimKinds ?? []),
      ...(capability?.domainEvidenceKinds ?? []),
    ]).slice(0, 16);
    const authorityScopeRefs = uniqueStrings([
      ...jsonStringArray(nodeMetadata.authorityScope),
      ...jsonStringArray(nodeMetadata.authorityScopeRefs),
      ...jsonStringArray(nodeMetadata.allowedPathRefs),
      ...jsonStringArray(nodeMetadata.allowedFileRefs),
      ...jsonStringArray(nodeMetadata.targetRefs),
      ...jsonStringArray(nodeMetadata.resourceNarrowingExactRefs),
    ]).slice(0, 40);
    const exactSelectionRefs = jsonStringArray(nodeMetadata.resourceNarrowingExactRefs);
    const candidateResourceRefs = modelSelectableDomainResourceRefs({
      exactRefs: exactSelectionRefs,
      fallbackRefs: [
        ...jsonStringArray(nodeMetadata.selectedResourceRefs),
        ...jsonStringArray(nodeMetadata.targetRefs),
      ],
    });
    const sourceRefs = uniqueStrings([
      ...input.resolution.acceptedResourceHandoffRefs,
      ...input.resolution.nodeResourceLedgerRefs,
      ...input.resolution.nodeResourceLedgerEntryRefs,
      ...input.resolution.nodeResourceLedgerEntryPayloadRefs,
    ]).slice(0, 24);
    const candidateHandles: ResourceSelectionCandidateHandle[] = candidateResourceRefs.map(
      (resourceRef, index) => ({
        candidateId: `${input.node.nodeId}:domain-resource-candidate:${index + 1}`,
        resourceRef,
        resourceKind:
          resourceRef.startsWith("file-window://")
            ? "source_file_window"
            : capability?.domainResourceKinds[0] ?? "domain_resource",
        candidateSource: "node_resource_ledger",
        sourceRefs: sourceRefs.slice(0, 6),
        authorityScopeRefs:
          authorityScopeRefs.length > 0 ? uniqueStrings([resourceRef, ...authorityScopeRefs]).slice(0, 8) : [resourceRef],
        targetCommitmentIds: targetCommitmentIds.slice(0, 8),
        capabilityIds: capabilityId ? [capabilityId] : [],
        evidenceRequirements: evidenceRequirements.slice(0, 6),
        objectiveSnippet:
          jsonString(nodeMetadata.exactObjective) ??
          jsonString(nodeMetadata.objectiveSnippet) ??
          input.resolution.workIntentId,
        contextSummary:
          jsonString(nodeMetadata.resourceSpecialistSpecialistHandoffSummary) ??
          jsonString(nodeMetadata.nodeResourceDemandExpectedUse) ??
          `Candidate ${index + 1} from node-local resource ledger.`,
        payloadRef: sourceRefs[index] ?? sourceRefs[0] ?? null,
        payloadHash: null,
        omittedBodyRef:
          input.resolution.nodeResourceLedgerEntryPayloadRefs[index] ??
          input.resolution.nodeResourceLedgerEntryPayloadRefs[0] ??
          null,
        omittedBodyHash: null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      }),
    );
    const manifest = buildResourceSelectionHandleManifest({
      runtimeJobId,
      workflowId: input.snapshot.graph.workflowId,
      graphId: input.graphId,
      nodeId: input.node.nodeId,
      sourceWorkUnitId: input.resolution.workIntentId,
      domainKind:
        capability?.domainProfileId ??
        capability?.domainResourceKinds[0] ??
        input.resolution.executionIntent,
      objectiveSnippet:
        jsonString(nodeMetadata.exactObjective) ??
        jsonString(nodeMetadata.objectiveSnippet) ??
        `Select domain resources for ${input.node.nodeId}.`,
      targetCommitmentIds,
      capabilityIds: capabilityId ? [capabilityId] : [],
      evidenceRequirements,
      candidateHandles,
      maxInputBytes: 32_000,
    });
    const request = buildDomainResourceSelectionRequest({
      runtimeJobId,
      workflowId: input.snapshot.graph.workflowId,
      graphId: input.graphId,
      nodeId: input.node.nodeId,
      sourceWorkUnitId: input.resolution.workIntentId,
      workIntentRef: input.resolution.workIntentRef,
      workIntentContextResolutionRef: input.resolution.resolutionRef,
      contextSatisfactionStateRef: input.resolution.nodeResourceLedgerRefs[0] ?? null,
      acceptedResourceHandoffRefs: input.resolution.acceptedResourceHandoffRefs,
      targetCommitmentIds,
      capabilityIds: capabilityId ? [capabilityId] : [],
      evidenceRequirements,
      authorityScopeRefs,
      manifest,
    });
    return {
      graphId: input.graphId,
      iteration: input.iteration,
      nodeId: input.node.nodeId,
      nodeKind: input.node.nodeKind,
      assignedRole: input.node.assignedRole,
      modelOrWorkerRef: input.node.modelOrWorkerRef,
      capabilityId,
      workIntentRef: input.resolution.workIntentRef,
      workIntentContextResolutionRef: input.resolution.resolutionRef,
      nodeExecutionContractRef: jsonString(nodeMetadata.nodeExecutionContractRef),
      nodeResourceLedgerRefs: input.resolution.nodeResourceLedgerRefs,
      nodeResourceLedgerEntryRefs: input.resolution.nodeResourceLedgerEntryRefs,
      nodeResourceLedgerEntryPayloadRefs: input.resolution.nodeResourceLedgerEntryPayloadRefs,
      acceptedResourceHandoffRefs: input.resolution.acceptedResourceHandoffRefs,
      targetCommitmentIds,
      evidenceRequirements,
      authorityScopeRefs,
      request,
      candidateHandleManifest: manifest,
      candidateResourceRefs: request.candidateResourceRefs,
      allowedToolIds: ["resource.selection.propose", "resource.selection.mark_blocked"],
      requiredFields: [
        "selectedTargetRefs",
        "fileChangeIntents",
        "validationDiscoveryPlan",
        "selectionRationale",
        "excludedCandidateRefs",
      ],
      semanticQualityJudgedByDeterministicCode: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }

  private async applyDomainResourceSelectionForPrecondition(input: {
    graphId: string;
    iteration: number;
    snapshot: RuntimeWorkGraphSnapshot;
    node: TeamGraphNode;
    resolution: WorkIntentContextResolution;
    selectionInput: RuntimeWorkGraphDomainResourceSelectionInput;
  }): Promise<{
    status: "continue" | "needs_review";
    refs: string[];
    reasonCodes: string[];
    metadataPatch: Record<string, JsonValue>;
    continueLoop: boolean;
  }> {
    const selector = this.options.domainResourceSelectionSelector ?? null;
    const nodeMetadata = jsonRecord(input.node.metadata ?? {});
    await this.options.graphs.recordArtifactManifest({
      graphId: input.graphId,
      nodeId: input.node.nodeId,
      artifactType: "execution_platform.resource_selection_handle_manifest",
      storageRef: input.selectionInput.candidateHandleManifest.manifestRef,
      contentHash: input.selectionInput.candidateHandleManifest.manifestHash,
      byteCount: input.selectionInput.candidateHandleManifest.inputByteCount,
      boundedSummary: `Domain resource selection candidates for ${input.node.nodeId}.`,
      metadata: {
        artifactKind: "resource_selection_handle_manifest_manifest",
        manifestRef: input.selectionInput.candidateHandleManifest.manifestRef,
        manifestHash: input.selectionInput.candidateHandleManifest.manifestHash,
        candidateCount: input.selectionInput.candidateHandleManifest.candidateHandles.length,
        inputByteCount: input.selectionInput.candidateHandleManifest.inputByteCount,
        budgetStatus: input.selectionInput.candidateHandleManifest.budgetStatus,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } satisfies JsonValue,
    });
    await this.options.graphs.recordArtifactManifest({
      graphId: input.graphId,
      nodeId: input.node.nodeId,
      artifactType: "execution_platform.domain_resource_selection_request",
      storageRef: input.selectionInput.request.requestRef,
      contentHash: input.selectionInput.request.requestHash,
      byteCount: Buffer.byteLength(JSON.stringify(input.selectionInput.request), "utf8"),
      boundedSummary: `Domain resource selection request for ${input.node.nodeId}.`,
      metadata: {
        artifactKind: "domain_resource_selection_request_manifest",
        requestRef: input.selectionInput.request.requestRef,
        requestHash: input.selectionInput.request.requestHash,
        candidateHandleManifestRef: input.selectionInput.request.candidateHandleManifestRef,
        candidateResourceRefCount: input.selectionInput.request.candidateResourceRefs.length,
        nextLegalTools: input.selectionInput.request.nextLegalTools,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } satisfies JsonValue,
    });
    if (!selector) {
      const tool = await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "resource.selection.mark_blocked",
        idempotencyKey: `iteration:${input.iteration}:node:${input.node.nodeId}:domain-resource-selection-selector-missing:${input.selectionInput.request.requestHash.slice(7, 23)}`,
        inputRef: input.selectionInput.request.requestRef,
        inputHash: input.selectionInput.request.requestHash,
        inputSummary:
          "Domain resource selection requires a dedicated small-verb selector; global scheduler repair is not allowed at this boundary.",
        nodeId: input.node.nodeId,
        roleRef: input.node.assignedRole,
        modelRef: input.node.modelOrWorkerRef,
        metadata: {
          schedulerPhase: "domain_resource_selection",
          domainResourceSelectionRequestRef: input.selectionInput.request.requestRef,
          candidateHandleManifestRef: input.selectionInput.candidateHandleManifest.manifestRef,
          reasonCodes: [
            "domain_resource_selection_selector_missing",
            "domain_resource_selection_must_not_fall_back_to_global_scheduler",
          ],
          semanticQualityJudgedByDeterministicCode: false,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        } satisfies JsonValue,
      });
      return {
        status: "needs_review",
        continueLoop: false,
        refs: [
          input.selectionInput.request.requestRef,
          input.selectionInput.candidateHandleManifest.manifestRef,
          ...tool.refs,
        ],
        reasonCodes: uniqueStrings([
          "domain_resource_selection_selector_missing",
          "domain_resource_selection_must_not_fall_back_to_global_scheduler",
          ...tool.reasonCodes,
        ]),
        metadataPatch: {
          domainResourceSelectionStatus: "blocked",
          domainResourceSelectionRequestRef: input.selectionInput.request.requestRef,
          domainResourceSelectionCandidateHandleManifestRef:
            input.selectionInput.candidateHandleManifest.manifestRef,
          domainResourceSelectionReasonCodes: [
            "domain_resource_selection_selector_missing",
            "domain_resource_selection_must_not_fall_back_to_global_scheduler",
          ],
          blockedArtifactRefs: uniqueStrings([
            ...jsonStringArray(nodeMetadata.blockedArtifactRefs),
            ...tool.refs,
          ]).slice(0, 80),
          nodeReadinessPhase: "domain_resource_selection_required",
          nodeReadinessRepairAction: "resource.selection.propose",
          nodeReadinessNextAllowedTransitions: [
            "resource.selection.propose",
            "resource.selection.mark_blocked",
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      };
    }

    let selected: RuntimeWorkGraphDomainResourceSelectionToolCall;
    try {
      selected = await selector.select(input.selectionInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const selectorErrorCode = boundedPlainText(message, 320).replace(/[^A-Za-z0-9:_.,-]+/gu, "_");
      const tool = await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "resource.selection.mark_blocked",
        idempotencyKey: `iteration:${input.iteration}:node:${input.node.nodeId}:domain-resource-selection-selector-failed:${input.selectionInput.request.requestHash.slice(7, 23)}`,
        inputRef: input.selectionInput.request.requestRef,
        inputHash: input.selectionInput.request.requestHash,
        inputSummary: `Domain resource selection selector failed for ${input.node.nodeId}.`,
        nodeId: input.node.nodeId,
        roleRef: input.node.assignedRole,
        modelRef: input.node.modelOrWorkerRef,
        metadata: {
          schedulerPhase: "domain_resource_selection",
          errorMessage: boundedPlainText(message, 500),
          reasonCodes: [
            "domain_resource_selection_selector_failed",
            `domain_resource_selection_selector_error:${selectorErrorCode || "unknown"}`,
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        } satisfies JsonValue,
      });
      return {
        status: "needs_review",
        continueLoop: false,
        refs: [input.selectionInput.request.requestRef, ...tool.refs],
        reasonCodes: uniqueStrings([
          "domain_resource_selection_selector_failed",
          `domain_resource_selection_selector_error:${selectorErrorCode || "unknown"}`,
          ...tool.reasonCodes,
        ]),
        metadataPatch: {
          domainResourceSelectionStatus: "blocked",
          domainResourceSelectionReasonCodes: [
            "domain_resource_selection_selector_failed",
            `domain_resource_selection_selector_error:${selectorErrorCode || "unknown"}`,
          ],
          blockedArtifactRefs: uniqueStrings([
            ...jsonStringArray(nodeMetadata.blockedArtifactRefs),
            ...tool.refs,
          ]).slice(0, 80),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      };
    }
    if (
      selected.toolId !== "resource.selection.propose" &&
      selected.toolId !== "resource.selection.mark_blocked"
    ) {
      const tool = await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "resource.selection.mark_blocked",
        idempotencyKey: `iteration:${input.iteration}:node:${input.node.nodeId}:domain-resource-selection-illegal-tool:${input.selectionInput.request.requestHash.slice(7, 23)}`,
        inputRef: input.selectionInput.request.requestRef,
        inputSummary: `Domain resource selection selector returned an illegal tool for ${input.node.nodeId}.`,
        nodeId: input.node.nodeId,
        roleRef: input.node.assignedRole,
        modelRef: selected.modelRef ?? input.node.modelOrWorkerRef,
        metadata: {
          returnedToolId: String((selected as { toolId?: unknown }).toolId ?? ""),
          allowedToolIds: input.selectionInput.allowedToolIds,
          schedulerPhase: "domain_resource_selection",
          reasonCodes: ["domain_resource_selection_selector_returned_illegal_tool"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        } satisfies JsonValue,
      });
      return {
        status: "needs_review",
        continueLoop: false,
        refs: [input.selectionInput.request.requestRef, ...tool.refs],
        reasonCodes: uniqueStrings([
          "domain_resource_selection_selector_returned_illegal_tool",
          ...tool.reasonCodes,
        ]),
        metadataPatch: {
          domainResourceSelectionStatus: "blocked",
          blockedArtifactRefs: uniqueStrings([
            ...jsonStringArray(nodeMetadata.blockedArtifactRefs),
            ...tool.refs,
          ]).slice(0, 80),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      };
    }
    const toolCall = DomainResourceSelectionToolCallSchema.parse({
      toolName: selected.toolId,
      arguments: selected.input,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
    const proposal = domainResourceSelectionProposalFromToolCall(toolCall);
    const decision = compileDomainResourceSelectionDecision({
      request: input.selectionInput.request,
      manifest: input.selectionInput.candidateHandleManifest,
      proposal,
    });
    const resourceDecision = resourceSelectionDecisionFromDomainResourceSelectionDecision(decision);
    const packet = compileResourceSelectionPacket({
      runtimeJobId: input.selectionInput.request.runtimeJobId,
      workflowId: input.selectionInput.request.workflowId,
      graphId: input.graphId,
      nodeId: input.node.nodeId,
      sourceWorkUnitId: input.resolution.workIntentId,
      domainKind: input.selectionInput.candidateHandleManifest.domainKind,
      targetCommitmentIds: input.selectionInput.targetCommitmentIds,
      manifest: input.selectionInput.candidateHandleManifest,
      decision: resourceDecision,
      modelTaskBoundaryId: "domain_resource_selection",
      providerPath: selected.providerPath ?? "unknown",
      modelRef: selected.modelRef ?? input.node.modelOrWorkerRef ?? "unknown",
    });
    const accepted = decision.status === "accepted" && packet.status === "accepted";
    const capability = input.selectionInput.capabilityId
      ? findRuntimeNodeCapability(input.selectionInput.capabilityId, this.capabilityManifest)
      : null;
    const materialized = accepted
      ? compileNodeExecutionPacketForGenericDomainResource({
          runtimeJobId: input.selectionInput.request.runtimeJobId,
          workflowId: input.selectionInput.request.workflowId,
          graphId: input.graphId,
          nodeId: input.node.nodeId,
          nodeKind: input.node.nodeKind,
          capabilityId: input.selectionInput.capabilityId ?? "unknown_capability",
          executorKey:
            capability?.executorKey ?? jsonString(nodeMetadata.executorKey) ?? input.node.assignedRole,
          workerRef:
            capability?.workerRef ??
            jsonString(nodeMetadata.workerRef) ??
            input.node.modelOrWorkerRef ??
            input.node.assignedRole,
          packetId: `${input.node.nodeId}:domain-resource-action`,
          domainKind: input.selectionInput.candidateHandleManifest.domainKind,
          executionIntent: input.resolution.executionIntent,
          evidenceMode: input.resolution.evidenceMode,
          resourceRefs: packet.selectedResourceRefs,
          contextPacketRefs: [
            input.selectionInput.request.requestRef,
            input.selectionInput.candidateHandleManifest.manifestRef,
            ...input.selectionInput.nodeResourceLedgerRefs,
            ...input.selectionInput.nodeResourceLedgerEntryRefs,
            ...input.selectionInput.nodeResourceLedgerEntryPayloadRefs,
          ],
          acceptedResourceHandoffRefs: input.selectionInput.acceptedResourceHandoffRefs,
          validationRefs: packet.validationDiscoveryPlan,
          validationDiscoveryPlan: packet.validationDiscoveryPlan,
          targetCommitmentIds: input.selectionInput.targetCommitmentIds,
          evidenceClaimExpectations:
            input.selectionInput.evidenceRequirements.length > 0
              ? input.selectionInput.evidenceRequirements
              : input.resolution.evidenceMode,
          authorityScope: input.selectionInput.authorityScopeRefs,
          allowedOperationRefs: capability?.domainWorkerActionToolIds ?? [],
          stopIfMissingOrEscalate: [
            "Do not execute a domain action unless the NodeLifecycleTransitionRunner action gate is ready.",
          ],
        })
      : null;
    const tool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: selected.toolId,
      idempotencyKey: `iteration:${input.iteration}:node:${input.node.nodeId}:domain-resource-selection:${decision.decisionHash.slice(7, 23)}:${packet.packetRef.split("/").at(-1)}`,
      inputRef: input.selectionInput.request.requestRef,
      inputHash: decision.decisionHash,
      inputSummary: accepted
        ? `Accept model-authored domain resource selection for ${input.node.nodeId}.`
        : `Record blocked domain resource selection for ${input.node.nodeId}.`,
      nodeId: input.node.nodeId,
      roleRef: input.node.assignedRole,
      modelRef: selected.modelRef ?? input.node.modelOrWorkerRef,
      metadata: {
        schedulerPhase: "domain_resource_selection",
        domainResourceSelectionRequestRef: input.selectionInput.request.requestRef,
        domainResourceSelectionDecisionRef: decision.decisionRef,
        resourceSelectionPacketRef: packet.packetRef,
        nodeExecutionPacketRef: materialized?.nodeExecutionPacket.packetRef ?? null,
        domainResourcePacketRef: materialized?.genericDomainResourcePacket.packetRef ?? null,
        selectedTargetRefCount: decision.selectedTargetRefs.length,
        providerPath: selected.providerPath ?? null,
        providerDiagnosticRefs: selected.providerDiagnosticRefs ?? [],
        semanticQualityJudgedByDeterministicCode: false,
        reasonCodes: uniqueStrings([
          ...(selected.reasonCodes ?? []),
          ...decision.reasonCodes,
          ...packet.reasonCodes,
        ]).slice(0, 80),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } satisfies JsonValue,
    });
    await this.options.graphs.recordArtifactManifest({
      graphId: input.graphId,
      nodeId: input.node.nodeId,
      artifactType: "execution_platform.domain_resource_selection_decision",
      storageRef: decision.decisionRef,
      contentHash: decision.decisionHash,
      byteCount: Buffer.byteLength(JSON.stringify(decision), "utf8"),
      boundedSummary: `Domain resource selection ${decision.status} for ${input.node.nodeId}.`,
      metadata: {
        artifactKind: "domain_resource_selection_decision_manifest",
        decisionRef: decision.decisionRef,
        decisionHash: decision.decisionHash,
        status: decision.status,
        selectedTargetRefCount: decision.selectedTargetRefs.length,
        invalidSelectionCount: decision.invalidSelections.length,
        nextLegalTransition: decision.nextLegalTransition,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } satisfies JsonValue,
    });
    await this.options.graphs.recordArtifactManifest({
      graphId: input.graphId,
      nodeId: input.node.nodeId,
      artifactType: "execution_platform.resource_selection_packet",
      storageRef: packet.packetRef,
      contentHash: createHash("sha256").update(JSON.stringify(packet), "utf8").digest("hex"),
      byteCount: Buffer.byteLength(JSON.stringify(packet), "utf8"),
      boundedSummary: `Resource selection packet ${packet.status} for ${input.node.nodeId}.`,
      metadata: {
        artifactKind: "resource_selection_packet_manifest",
        packetRef: packet.packetRef,
        packetHash: createHash("sha256").update(JSON.stringify(packet), "utf8").digest("hex"),
        status: packet.status,
        selectedResourceRefCount: packet.selectedResourceRefs.length,
        candidateHandleManifestRef: packet.candidateHandleManifestRef,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } satisfies JsonValue,
    });
    if (materialized) {
      const nodeExecutionPacketHash = createHash("sha256")
        .update(JSON.stringify(materialized.nodeExecutionPacket), "utf8")
        .digest("hex");
      const genericDomainResourcePacketHash = createHash("sha256")
        .update(JSON.stringify(materialized.genericDomainResourcePacket), "utf8")
        .digest("hex");
      await this.options.graphs.recordArtifactManifest({
        graphId: input.graphId,
        nodeId: input.node.nodeId,
        artifactType: "execution_platform.node_execution_contract",
        storageRef: materialized.nodeExecutionContract.contractRef,
        contentHash: materialized.nodeExecutionContract.contractHash,
        byteCount: Buffer.byteLength(JSON.stringify(materialized.nodeExecutionContract), "utf8"),
        boundedSummary: `Node execution contract for ${input.node.nodeId}.`,
        metadata: {
          artifactKind: "node_execution_contract_manifest",
          contractRef: materialized.nodeExecutionContract.contractRef,
          contractHash: materialized.nodeExecutionContract.contractHash,
          capabilityId: materialized.nodeExecutionContract.capabilityId,
          executorKey: materialized.nodeExecutionContract.executorKey,
          resourcePacketRef: materialized.nodeExecutionContract.domainResourcePacketRef,
          targetResourceSubsetRefCount:
            materialized.nodeExecutionContract.targetResourceSubsetRefs.length,
          authorityScopeCount: materialized.nodeExecutionContract.authorityScope.length,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        } satisfies JsonValue,
      });
      await this.options.graphs.recordArtifactManifest({
        graphId: input.graphId,
        nodeId: input.node.nodeId,
        artifactType: "execution_platform.node_execution_packet",
        storageRef: materialized.nodeExecutionPacket.packetRef,
        contentHash: nodeExecutionPacketHash,
        byteCount: Buffer.byteLength(JSON.stringify(materialized.nodeExecutionPacket), "utf8"),
        boundedSummary: `Node execution packet for ${input.node.nodeId}; action gate ${materialized.nodeExecutionPacket.actionGateStatus}.`,
        metadata: {
          artifactKind: "node_execution_packet_manifest",
          packetRef: materialized.nodeExecutionPacket.packetRef,
          packetHash: nodeExecutionPacketHash,
          readinessStatus: materialized.nodeExecutionPacket.readinessStatus,
          progressiveState: materialized.nodeExecutionPacket.progressiveState,
          actionGateStatus: materialized.nodeExecutionPacket.actionGateStatus,
          resourcePacketRef: materialized.nodeExecutionPacket.resourcePacketRef,
          nextLegalWorkerToolIds: materialized.nodeExecutionPacket.nextLegalWorkerToolIds.slice(0, 40),
          deniedWorkerToolIds: materialized.nodeExecutionPacket.deniedWorkerToolIds.slice(0, 40),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        } satisfies JsonValue,
      });
      await this.options.graphs.recordArtifactManifest({
        graphId: input.graphId,
        nodeId: input.node.nodeId,
        artifactType: "execution_platform.generic_domain_resource_packet",
        storageRef: materialized.genericDomainResourcePacket.packetRef,
        contentHash: genericDomainResourcePacketHash,
        byteCount: Buffer.byteLength(JSON.stringify(materialized.genericDomainResourcePacket), "utf8"),
        boundedSummary: `Generic domain resource packet for ${input.node.nodeId}.`,
        metadata: {
          artifactKind: "generic_domain_resource_packet_manifest",
          packetRef: materialized.genericDomainResourcePacket.packetRef,
          packetHash: genericDomainResourcePacketHash,
          domainKind: materialized.genericDomainResourcePacket.domainKind,
          resourceRefCount: materialized.genericDomainResourcePacket.resourceRefs.length,
          contextPacketRefCount: materialized.genericDomainResourcePacket.contextPacketRefs.length,
          authorityScopeCount: materialized.genericDomainResourcePacket.authorityScope.length,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        } satisfies JsonValue,
      });
    }
    return {
      status: accepted ? "continue" : "needs_review",
      continueLoop: accepted,
      refs: uniqueStrings([
        input.selectionInput.request.requestRef,
        input.selectionInput.candidateHandleManifest.manifestRef,
        decision.decisionRef,
        packet.packetRef,
        materialized?.nodeExecutionContract.contractRef,
        materialized?.nodeExecutionPacket.packetRef,
        materialized?.genericDomainResourcePacket.packetRef,
        ...(selected.providerDiagnosticRefs ?? []),
        ...tool.refs,
      ]),
      reasonCodes: uniqueStrings([
        accepted
          ? "domain_resource_selection_model_authored_and_accepted"
          : "domain_resource_selection_model_authored_but_blocked",
        ...(selected.reasonCodes ?? []),
        ...decision.reasonCodes,
        ...packet.reasonCodes,
        ...tool.reasonCodes,
      ]).slice(0, 120),
      metadataPatch: {
        domainResourceSelectionStatus: accepted ? "accepted" : "blocked",
        domainResourceSelectionDecisionStatus: decision.status,
        domainResourceSelectionRef: decision.decisionRef,
        domainResourceSelectionRefs: accepted ? [decision.decisionRef] : [],
        acceptedDomainResourceSelectionRef: accepted ? decision.decisionRef : null,
        acceptedDomainResourceSelectionRefs: accepted ? [decision.decisionRef] : [],
        domainResourceSelectionRequestRef: input.selectionInput.request.requestRef,
        domainResourceSelectionCandidateHandleManifestRef:
          input.selectionInput.candidateHandleManifest.manifestRef,
        resourceSelectionPacketRef: packet.packetRef,
        resourceSelectionPacketRefs: accepted ? [packet.packetRef] : [],
        acceptedResourceSelectionPacketRef: accepted ? packet.packetRef : null,
        acceptedResourceSelectionPacketRefs: accepted ? [packet.packetRef] : [],
        domainResourceSelectionPacketRef: packet.packetRef,
        domainResourceSelectionPacketRefs: accepted ? [packet.packetRef] : [],
        domainResourceSelectionPacketStatus: packet.status,
        domainResourceSelectionDecisionRef: decision.decisionRef,
        domainResourceSelectionDecisionRefs: accepted ? [decision.decisionRef] : [],
        acceptedDomainResourceSelectionDecisionRef: accepted ? decision.decisionRef : null,
        acceptedDomainResourceSelectionDecisionRefs: accepted ? [decision.decisionRef] : [],
        selectedResourceRefs: packet.selectedResourceRefs.slice(0, 80),
        domainResourceSelectionReasonCodes: uniqueStrings([
          ...decision.reasonCodes,
          ...packet.reasonCodes,
        ]).slice(0, 80),
        nodeExecutionContractRef: materialized?.nodeExecutionContract.contractRef ?? null,
        nodeExecutionContractHash: materialized?.nodeExecutionContract.contractHash ?? null,
        nodeExecutionPacketRef: materialized?.nodeExecutionPacket.packetRef ?? null,
        nodeExecutionPacketHash: materialized?.nodeExecutionPacket
          ? createHash("sha256").update(JSON.stringify(materialized.nodeExecutionPacket), "utf8").digest("hex")
          : null,
        nodeExecutionPacketManifest: materialized?.nodeExecutionPacket
          ? {
              packetRef: materialized.nodeExecutionPacket.packetRef,
              packetHash: createHash("sha256")
                .update(JSON.stringify(materialized.nodeExecutionPacket), "utf8")
                .digest("hex"),
              resourcePacketRef: materialized.nodeExecutionPacket.resourcePacketRef,
              sourcePacketRefCount: materialized.nodeExecutionPacket.sourcePacketRefs.length,
              sourceContextRefCount: materialized.nodeExecutionPacket.sourceContextRefs.length,
              nextLegalWorkerToolIds: materialized.nodeExecutionPacket.nextLegalWorkerToolIds.slice(0, 40),
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              rawToolLogStored: false,
            }
          : null,
        resourcePacketRef: materialized?.genericDomainResourcePacket.packetRef ?? null,
        resourcePacketKind: materialized?.genericDomainResourcePacket.packetKind ?? null,
        resourcePacketHash: materialized?.genericDomainResourcePacket
          ? createHash("sha256")
              .update(JSON.stringify(materialized.genericDomainResourcePacket), "utf8")
              .digest("hex")
          : null,
        resourcePacketManifest: materialized?.genericDomainResourcePacket
          ? {
              packetRef: materialized.genericDomainResourcePacket.packetRef,
              packetHash: createHash("sha256")
                .update(JSON.stringify(materialized.genericDomainResourcePacket), "utf8")
                .digest("hex"),
              packetKind: materialized.genericDomainResourcePacket.packetKind,
              resourceRefCount: materialized.genericDomainResourcePacket.resourceRefs.length,
              contextPacketRefCount: materialized.genericDomainResourcePacket.contextPacketRefs.length,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              rawToolLogStored: false,
            }
          : null,
        nodeReadinessStateRef: materialized?.readiness.state.stateRef ?? null,
        nodeReadinessStateManifest: materialized?.readiness.state
          ? {
              stateRef: materialized.readiness.state.stateRef,
              readinessStatus: materialized.readiness.state.readinessStatus,
              phase: materialized.readiness.state.phase,
              repairAction: materialized.readiness.state.repairAction,
              nextAllowedTransitions: materialized.readiness.state.nextAllowedTransitions.slice(0, 40),
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              rawToolLogStored: false,
            }
          : null,
        resourceReadinessStatus: materialized?.readiness.status ?? null,
        resourceReadinessReasonCodes: materialized?.readiness.reasonCodes.slice(0, 60) ?? [],
        acceptedArtifactRefs: accepted
          ? uniqueStrings([
              ...jsonStringArray(nodeMetadata.acceptedArtifactRefs),
              decision.decisionRef,
              packet.packetRef,
              materialized?.nodeExecutionPacket.packetRef,
              materialized?.genericDomainResourcePacket.packetRef,
            ]).slice(0, 80)
          : jsonStringArray(nodeMetadata.acceptedArtifactRefs),
        blockedArtifactRefs: accepted
          ? jsonStringArray(nodeMetadata.blockedArtifactRefs)
          : uniqueStrings([
              ...jsonStringArray(nodeMetadata.blockedArtifactRefs),
              decision.decisionRef,
              packet.packetRef,
            ]).slice(0, 80),
        diagnosticArtifactRefs: uniqueStrings([
          ...jsonStringArray(nodeMetadata.diagnosticArtifactRefs),
          input.selectionInput.candidateHandleManifest.manifestRef,
          input.selectionInput.request.requestRef,
          ...tool.refs,
        ]).slice(0, 80),
        providerDiagnosticRefs: uniqueStrings([
          ...jsonStringArray(nodeMetadata.providerDiagnosticRefs),
          ...(selected.providerDiagnosticRefs ?? []),
        ]).slice(0, 80),
        nodeReadinessPhase: accepted
          ? materialized?.readiness.state.phase ?? "domain_action_gate_blocked"
          : "domain_resource_selection_blocked",
        nodeReadinessStatus: materialized?.readiness.status ?? (accepted ? "blocked" : "needs_review"),
        nodeReadinessRepairAction: accepted
          ? materialized?.readiness.state.repairAction ?? "compile_resource_packet"
          : "resource.selection.propose",
        nodeReadinessNextAllowedTransitions: accepted
          ? materialized?.readiness.state.nextAllowedTransitions ?? ["evaluate_action_gate"]
          : ["resource.selection.propose", "resource.selection.mark_blocked"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
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
    decisionRefs: string[];
    reasonCodes: string[];
  }> {
    const decisionRefs: string[] = [];
    const reasonCodes: string[] = [];
    const pendingLifecycleProjections = this.nodeLifecycleTransitionRunner.pendingProjections({
      graphId: input.graphId,
      snapshot: input.snapshot,
    }).filter((projection) => projection.currentGate !== "worker_action_ready");
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
        decisionRefs: uniqueStrings([firstProjection.projectionRef, ...blockTool.refs]),
        reasonCodes: uniqueStrings([
          "node_lifecycle_pending_before_global_scheduler",
          "node_lifecycle_global_scheduler_blocked",
          ...blockTool.reasonCodes,
        ]),
      };
    }
    const obligationGraph = this.options.obligationGraph ?? null;
    const obligationGraphSummary = summarizeObligationGraphForScheduler(obligationGraph);
    const obligationGraphAccepted =
      Boolean(obligationGraph) &&
      (obligationGraph?.obligations.length ?? 0) > 0 &&
      (obligationGraph?.blockedObligationIds.length ?? 0) === 0;
    const intakeReadinessTool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: obligationGraphAccepted
        ? "scheduler.accept_obligation_graph"
        : "scheduler.observe_scheduler_intake",
      idempotencyKey: `iteration:${input.iteration}:obligation-graph-readiness`,
      inputRef: obligationGraph?.graphRef ?? null,
      inputSummary: obligationGraphAccepted
        ? "Model-authored ObligationGraph is accepted as the scheduler intake contract."
        : "Scheduler observed no typed ObligationGraph intake contract on this direct scheduler run.",
      metadata: {
        obligationGraphAccepted,
        obligationGraphSummary,
        reasonCodes: obligationGraphAccepted
          ? ["model_authored_obligation_graph_accepted"]
          : ["model_authored_obligation_graph_required"],
        schedulerPhase: "planning_in_progress",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    decisionRefs.push(...intakeReadinessTool.refs);
    reasonCodes.push(...intakeReadinessTool.reasonCodes);
    if (obligationGraphAccepted) {
      reasonCodes.push("model_authored_obligation_graph_accepted");
    } else if (missionIsComplex(input.missionLedger)) {
      reasonCodes.push("model_authored_obligation_graph_missing");
    }
    const decisionPhase = schedulerDecisionCapabilityPhase({
      snapshotSummary: input.snapshotSummary,
      missionLedger: input.missionLedger,
      capabilityManifest: this.capabilityManifest,
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
        obligationGraphSummary,
        recentNodeResultSummaries: recentNodeResultSummaries.slice(-8),
        capabilityRegistrySummary: decisionCapabilityRegistrySummary,
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
      if (repairAttempt === 0 && obligationGraphAccepted) {
        const obligationTool = await this.recordSchedulerTool({
          graphId: input.graphId,
          iteration: input.iteration,
          toolId: "scheduler.draft_obligation_work_breakdown",
          idempotencyKey: `iteration:${input.iteration}:obligation-graph`,
          inputRef: obligationGraph?.graphRef ?? null,
          inputSummary:
            "Runtime accepted a typed ObligationGraph as the scheduler-facing breakdown contract.",
          metadata: {
            obligationGraphSummary,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        });
        decisionRefs.push(...obligationTool.refs);
        reasonCodes.push(...obligationTool.reasonCodes);
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
        const schedulerModelCallEnvelope = schedulerDecisionRejectionEnvelope({
          graphId: input.graphId,
          iteration: input.iteration,
          repairAttempt,
          snapshotSummary: input.snapshotSummary,
          missionLedger: input.missionLedger,
          rejectedDecisionRef,
          reasonCodes: ["orchestrator_decision_invalid_json"],
          repairRequest: compiled.repairRequest,
          diagnostics: compiled.rejectedNodeDiagnostics,
          rejectionSummary:
            "Orchestrator decision could not be compiled into a canonical scheduler decision.",
        });
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
            schedulerModelCallEnvelope,
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
        const schedulerModelCallEnvelope = schedulerDecisionRejectionEnvelope({
          graphId: input.graphId,
          iteration: input.iteration,
          repairAttempt,
          snapshotSummary: input.snapshotSummary,
          missionLedger: input.missionLedger,
          decisionId: decision.decisionId || null,
          decisionKind: decision.decisionKind,
          rejectedDecisionRef: decision.decisionId ? decisionRef : rejectedDecisionRef,
          reasonCodes: rejectionReasonCodes,
          repairRequest: repairDiagnostics,
          diagnostics: compiled.rejectedNodeDiagnostics,
          rejectionSummary:
            decision.rationaleForDecision ||
            "Orchestrator decision was rejected by scheduler policy or utility validation.",
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
            rejectedDecisionDiagnostics: compiled.rejectedNodeDiagnostics.slice(0, 8),
            acceptedAliasFields: compiled.acceptedAliasFields.slice(0, 16),
            modelOutputSummary: decision.rationaleForDecision || null,
            schedulerModelCallEnvelope,
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

  private async advanceNodeLifecycleTransition(input: {
    graphId: string;
    iteration: number;
    snapshot: RuntimeWorkGraphSnapshot;
    node: TeamGraphNode;
    projection: NodeLifecycleProjection;
    transitionContext?: unknown;
  }): Promise<
    | {
        status: "continue" | "needs_review" | "failed";
        reasonCodes: string[];
        refs: string[];
        continueLoop: boolean;
      }
    | null
  > {
    const node = input.node;
      if (node.nodeKind !== "work_intent") {
        return null;
      }
      const nodeMetadata = jsonRecord(node.metadata ?? null);
      if (nodeMetadata.workIntentCompiled !== true) {
        return null;
      }
      const resolution = compileWorkIntentContextResolution({
        snapshot: input.snapshot,
        workIntentNode: node,
        capabilityManifest: this.capabilityManifest,
      });
      if (resolution.status === "resource_not_required" || resolution.status === "pending_resource") {
        return null;
      }
      const selectedGate = input.projection.currentGate;
      if (
        nodeMetadata.workIntentContextResolutionHash === resolution.resolutionHash &&
        nodeMetadata.workIntentContextResolutionStatus === resolution.status &&
        (resolution.status === "blocked" || resolution.status === "partially_satisfied")
      ) {
        const collapseTool = await this.recordSchedulerTool({
          graphId: input.graphId,
          iteration: input.iteration,
          toolId: "scheduler.collapse_repeated_resource_blocker",
          idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:collapse-repeated-context-blocker:${resolution.resolutionHash}`,
          inputRef: resolution.resolutionRef,
          inputHash: resolution.resolutionHash,
          inputSummary: `Collapse repeated WorkIntent context blocker for ${node.nodeId}: ${resolution.status}.`,
          nodeId: node.nodeId,
          roleRef: node.assignedRole,
          modelRef: node.modelOrWorkerRef,
          metadata: {
            workIntentContextResolutionStatus: resolution.status,
            workIntentContextResolutionRef: resolution.resolutionRef,
            workIntentContextResolutionHash: resolution.resolutionHash,
            failedResourceSupplyNodeIds: resolution.failedResourceSupplyNodeIds,
            missingResourceHandoffRefs: resolution.missingResourceHandoffRefs,
            acceptedResourceHandoffRefs: resolution.acceptedResourceHandoffRefs,
            reasonCodes: resolution.reasonCodes,
            schedulerPhase: "context_blocker_root_cause_collapsed",
            semanticQualityJudgedByDeterministicCode: false,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          } satisfies JsonValue,
        });
        return {
          status: "continue",
          continueLoop: false,
          refs: collapseTool.refs,
          reasonCodes: uniqueStrings([
            "work_intent_context_repeated_blocker_collapsed",
            ...resolution.reasonCodes,
            ...collapseTool.reasonCodes,
          ]),
        };
      }
      const manifest = buildWorkIntentContextResolutionManifest(resolution);
      await this.options.graphs.recordArtifactManifest({
        graphId: input.graphId,
        nodeId: node.nodeId,
        artifactType: WORK_INTENT_CONTEXT_RESOLUTION_ARTIFACT_TYPE,
        storageRef: resolution.resolutionRef,
        contentHash: resolution.resolutionHash,
        byteCount: manifest.byteCount,
        boundedSummary: `WorkIntent ${node.nodeId} context resolution: ${resolution.status}.`,
        metadata: manifest as unknown as JsonValue,
      });
      const resolveTool = await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "scheduler.resolve_work_intent_resource_requirements",
        idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:work-intent-context-resolution:${resolution.resolutionHash}`,
        inputRef: resolution.workIntentRef,
        inputHash: resolution.resolutionHash,
        inputSummary: `Resolve post-resource lifecycle for WorkIntent ${node.nodeId}: ${resolution.status}.`,
        nodeId: node.nodeId,
        roleRef: node.assignedRole,
        modelRef: node.modelOrWorkerRef,
        metadata: {
          workIntentContextResolution: manifest as unknown as JsonValue,
          workIntentContextResolutionRef: resolution.resolutionRef,
          workIntentContextResolutionStatus: resolution.status,
          workIntentContextResolutionHash: resolution.resolutionHash,
          reasonCodes: resolution.reasonCodes,
          nextLegalTransitions: [],
          transitionAuthority: "node_lifecycle_transition_runner",
          schedulerPhase: "work_intent_context_resolution",
          semanticQualityJudgedByDeterministicCode: false,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        } satisfies JsonValue,
      });
      const metadataPatch = {
        ...(workIntentContextResolutionMetadata(resolution) as Record<string, unknown>),
        workIntentContextResolutionHash: resolution.resolutionHash,
        lastStatusReasonCodes: resolution.reasonCodes.slice(0, 60),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } satisfies JsonValue;

      if (selectedGate === "resource_ledger_ready" && resolution.status === "read_only_satisfied") {
        const acceptTool = await this.recordSchedulerTool({
          graphId: input.graphId,
          iteration: input.iteration,
          toolId: "scheduler.accept_resources_for_work_intent",
          idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:accept-context:${resolution.resolutionHash}`,
          inputRef: resolution.resolutionRef,
          inputHash: resolution.resolutionHash,
          inputSummary: `Accept context for read-only WorkIntent ${node.nodeId}.`,
          nodeId: node.nodeId,
          roleRef: node.assignedRole,
          modelRef: node.modelOrWorkerRef,
          metadata: {
            workIntentContextResolution: manifest as unknown as JsonValue,
            schedulerPhase: "work_intent_context_accepted",
            reasonCodes: resolution.reasonCodes,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          } satisfies JsonValue,
        });
        const satisfiedTool = await this.recordSchedulerTool({
          graphId: input.graphId,
          iteration: input.iteration,
          toolId: "scheduler.mark_read_only_work_intent_satisfied_from_resources",
          idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:read-only-satisfied:${resolution.resolutionHash}`,
          inputRef: resolution.resolutionRef,
          inputHash: resolution.resolutionHash,
          inputSummary: `Mark read-only WorkIntent ${node.nodeId} satisfied from accepted context.`,
          nodeId: node.nodeId,
          roleRef: node.assignedRole,
          modelRef: node.modelOrWorkerRef,
          metadata: {
            workIntentContextResolution: manifest as unknown as JsonValue,
            schedulerPhase: "work_intent_satisfied",
            reasonCodes: resolution.reasonCodes,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          } satisfies JsonValue,
        });
        await this.options.graphs.updateNodeStatus({
          nodeId: node.nodeId,
          nodeStatus: "succeeded",
          outputArtifactRefs: uniqueStrings([
            ...node.outputArtifactRefs,
            resolution.resolutionRef,
            ...resolution.acceptedResourceHandoffRefs,
          ]).slice(0, 24),
          metadataPatch: {
            ...metadataPatch,
            lastResultStatus: "succeeded",
          } satisfies JsonValue,
        });
        await this.options.onProgress?.({
          stage: "work_intent_context_resolution",
          status: "completed",
          nodeId: node.nodeId,
          roleId: node.assignedRole,
          reasonCodes: uniqueStrings([
            ...resolution.reasonCodes,
            ...resolveTool.reasonCodes,
            ...acceptTool.reasonCodes,
            ...satisfiedTool.reasonCodes,
          ]),
          currentObjective:
            typeof nodeMetadata.exactObjective === "string"
              ? nodeMetadata.exactObjective
              : "Mark read-only WorkIntent satisfied from accepted context.",
          activeNodeKind: node.nodeKind,
          capabilityId: resolution.capabilityId,
          modelRef: node.modelOrWorkerRef,
          evidenceProducedRefs: [
            resolution.resolutionRef,
            ...resolution.acceptedResourceHandoffRefs,
            ...resolveTool.refs,
            ...acceptTool.refs,
            ...satisfiedTool.refs,
          ],
          currentPhase: "work_intent_read_only_satisfied",
          validationState: "context_satisfied",
          schedulerPhase: "work_intent_satisfied",
          schedulerToolId: "scheduler.mark_read_only_work_intent_satisfied_from_resources",
          schedulerToolInvocationRefs: [
            ...resolveTool.refs,
            ...acceptTool.refs,
            ...satisfiedTool.refs,
          ],
          nextDecisionNeeded: "continue_frontier_evaluation",
          eli5Progress:
            "OpenClaw accepted the context for a read-only WorkIntent and closed that branch without pretending it was implementation work.",
        });
        return {
          status: "continue",
          continueLoop: true,
          refs: [
            resolution.resolutionRef,
            ...resolveTool.refs,
            ...acceptTool.refs,
            ...satisfiedTool.refs,
          ],
          reasonCodes: uniqueStrings([
            "work_intent_read_only_satisfied_from_context",
            ...resolution.reasonCodes,
            ...resolveTool.reasonCodes,
            ...acceptTool.reasonCodes,
            ...satisfiedTool.reasonCodes,
          ]),
        };
      }

      if (
        selectedGate === "worker_action_ready" ||
        (selectedGate === "resource_ledger_ready" && resolution.status === "satisfied") ||
        resolution.status === "worker_action_ready"
      ) {
        const workerOwnedStart = selectedGate === "worker_action_ready" || resolution.status === "worker_action_ready";
        const acceptTool = await this.recordSchedulerTool({
          graphId: input.graphId,
          iteration: input.iteration,
          toolId: workerOwnedStart
            ? "scheduler.record_node_transition"
            : "scheduler.accept_resources_for_work_intent",
          idempotencyKey: workerOwnedStart
            ? `iteration:${input.iteration}:node:${node.nodeId}:worker-action-ready:${resolution.resolutionHash}`
            : `iteration:${input.iteration}:node:${node.nodeId}:accept-context:${resolution.resolutionHash}`,
          inputRef: resolution.resolutionRef,
          inputHash: resolution.resolutionHash,
          inputSummary: workerOwnedStart
            ? `Promote worker-owned-context WorkIntent ${node.nodeId} to executable worker start.`
            : `Accept context for executable WorkIntent ${node.nodeId}.`,
          nodeId: node.nodeId,
          roleRef: node.assignedRole,
          modelRef: node.modelOrWorkerRef,
          metadata: {
            workIntentContextResolution: manifest as unknown as JsonValue,
            schedulerPhase: workerOwnedStart
              ? "worker_action_ready"
              : "work_intent_context_accepted",
            reasonCodes: resolution.reasonCodes,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          } satisfies JsonValue,
        });
        const promoteTool = await this.recordSchedulerTool({
          graphId: input.graphId,
          iteration: input.iteration,
          toolId: workerOwnedStart
            ? "scheduler.promote_work_intent_to_executable"
            : "scheduler.promote_resource_satisfied_work_intent_to_executable",
          idempotencyKey: workerOwnedStart
            ? `iteration:${input.iteration}:node:${node.nodeId}:promote-worker-action-ready:${resolution.resolutionHash}`
            : `iteration:${input.iteration}:node:${node.nodeId}:promote-context-satisfied:${resolution.resolutionHash}`,
          inputRef: resolution.resolutionRef,
          inputHash: resolution.resolutionHash,
          inputSummary: workerOwnedStart
            ? `Promote WorkIntent ${node.nodeId} directly to worker execution; worker owns context/search/read.`
            : `Promote context-satisfied WorkIntent ${node.nodeId} toward executable materialization.`,
          nodeId: node.nodeId,
          roleRef: node.assignedRole,
          modelRef: node.modelOrWorkerRef,
          metadata: {
            workIntentContextResolution: manifest as unknown as JsonValue,
            schedulerPhase: workerOwnedStart ? "worker_action_ready" : "resource_materialization",
            reasonCodes: resolution.reasonCodes,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          } satisfies JsonValue,
        });
        const transitionContext = nodeLifecycleSchedulerTransitionContext(input.transitionContext);
        const promotionDecision = transitionContext
          ? deterministicWorkIntentExecutablePromotionDecision({
              graphId: input.graphId,
              iteration: input.iteration,
              snapshot: input.snapshot,
              missionLedger: transitionContext.missionLedger,
              capabilityManifest: this.capabilityManifest,
              executors: this.options.executors,
              requireNodeExecutionPacketForWorkerExecution:
                this.options.requireNodeExecutionPacketForWorkerExecution === true,
            })
          : null;
        if (!transitionContext || !promotionDecision) {
          const blockedTool = await this.recordSchedulerTool({
            graphId: input.graphId,
            iteration: input.iteration,
            toolId: "scheduler.record_node_transition",
            idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:workintent-promotion-missing-context:${resolution.resolutionHash}`,
            inputRef: resolution.resolutionRef,
            inputHash: resolution.resolutionHash,
            inputSummary:
              "NodeLifecycleTransitionRunner could not promote a satisfied WorkIntent because the scheduler transition context or promotion decision was missing.",
            nodeId: node.nodeId,
            roleRef: node.assignedRole,
            modelRef: node.modelOrWorkerRef,
            metadata: {
              workIntentContextResolution: manifest as unknown as JsonValue,
              schedulerPhase: "node_lifecycle_transition_blocked",
              reasonCodes: [
                "node_lifecycle_workintent_promotion_transition_context_missing",
                "work_intent_promotion_must_not_fall_back_to_global_scheduler",
              ],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              rawToolLogStored: false,
            } satisfies JsonValue,
          });
          await this.options.graphs.updateNodeStatus({
            nodeId: node.nodeId,
            nodeStatus: "needs_review",
            outputArtifactRefs: uniqueStrings([
              ...node.outputArtifactRefs,
              resolution.resolutionRef,
              ...resolveTool.refs,
              ...acceptTool.refs,
              ...promoteTool.refs,
              ...blockedTool.refs,
            ]).slice(0, 24),
            metadataPatch: {
              ...metadataPatch,
              lastResultStatus: "needs_review",
              nodeLifecycleProjectionGate: "node_lifecycle_root_cause_collapsed",
              nodeReadinessPhase: "node_lifecycle_root_cause_collapsed",
              nodeReadinessRepairAction: "node_lifecycle_transition_required",
              nodeReadinessNextAllowedTransitions: [],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              rawToolLogStored: false,
            } satisfies JsonValue,
          });
          return {
            status: "needs_review",
            continueLoop: false,
            refs: [
              resolution.resolutionRef,
              ...resolveTool.refs,
              ...acceptTool.refs,
              ...promoteTool.refs,
              ...blockedTool.refs,
            ],
            reasonCodes: uniqueStrings([
              "node_lifecycle_workintent_promotion_failed_missing_transition_context",
              "work_intent_promotion_must_not_fall_back_to_global_scheduler",
              ...resolution.reasonCodes,
              ...resolveTool.reasonCodes,
              ...acceptTool.reasonCodes,
              ...promoteTool.reasonCodes,
              ...blockedTool.reasonCodes,
            ]),
          };
        }
        const promotionDecisionRef = graphRef("orchestrator-decision", promotionDecision.decisionId);
        await this.options.graphs.recordCheckpoint({
          graphId: input.graphId,
          checkpointKind: "node_lifecycle_work_intent_promoted_to_executable",
          stateSummary:
            workerOwnedStart
              ? "NodeLifecycleTransitionRunner promoted a worker-owned-context WorkIntent into its manifest-selected executable child."
              : "NodeLifecycleTransitionRunner promoted an accepted WorkIntent into its manifest-selected executable child.",
          artifactRefs: [promotionDecisionRef],
        });
        await this.options.onProgress?.({
          stage: "work_intent_context_resolution",
          status: "completed",
          nodeId: node.nodeId,
          roleId: node.assignedRole,
          reasonCodes: uniqueStrings([
            ...resolution.reasonCodes,
            ...resolveTool.reasonCodes,
            ...acceptTool.reasonCodes,
            ...promoteTool.reasonCodes,
          ]),
          currentObjective:
            typeof nodeMetadata.exactObjective === "string"
              ? nodeMetadata.exactObjective
              : workerOwnedStart
                ? "Promote WorkIntent to executable worker-owned context start."
                : "Accept context and promote WorkIntent to executable resource materialization.",
          activeNodeKind: node.nodeKind,
          capabilityId: resolution.capabilityId,
          modelRef: node.modelOrWorkerRef,
          evidenceProducedRefs: [
            resolution.resolutionRef,
            ...resolution.acceptedResourceHandoffRefs,
            ...resolveTool.refs,
            ...acceptTool.refs,
            ...promoteTool.refs,
          ],
          currentPhase: workerOwnedStart
            ? "work_intent_worker_action_ready"
            : "work_intent_context_satisfied",
          validationState: workerOwnedStart ? "worker_action_ready" : "context_satisfied",
          schedulerPhase: workerOwnedStart ? "worker_action_ready" : "resource_materialization",
          schedulerToolId: workerOwnedStart
            ? "scheduler.promote_work_intent_to_executable"
            : "scheduler.promote_resource_satisfied_work_intent_to_executable",
          schedulerToolInvocationRefs: [...resolveTool.refs, ...acceptTool.refs, ...promoteTool.refs],
          nextDecisionNeeded: "scheduler.promote_work_intent_to_executable",
          eli5Progress:
            workerOwnedStart
              ? "OpenClaw is starting the worker directly with legal refs and worker-owned context tools instead of running a pre-worker context phase."
              : "OpenClaw accepted context for a WorkIntent and will now promote it through the manifest-backed executable path.",
        });
        const applied = await this.applyDecision({
          graphId: input.graphId,
          decision: promotionDecision,
          iteration: input.iteration,
          missionLedger: transitionContext.missionLedger,
          executedNodeIds: transitionContext.executedNodeIds,
          addedNodeIds: transitionContext.addedNodeIds,
          loopGuard: transitionContext.loopGuard,
        });
        return {
          status:
            applied.status === "succeeded" || applied.status === "waiting_for_human"
              ? "continue"
              : applied.status,
          continueLoop: applied.status === "continue" || applied.status === "succeeded",
          refs: [
            resolution.resolutionRef,
            promotionDecisionRef,
            ...resolveTool.refs,
            ...acceptTool.refs,
            ...promoteTool.refs,
          ],
          reasonCodes: uniqueStrings([
            workerOwnedStart
              ? "work_intent_worker_action_ready_promoted_by_node_lifecycle_runner"
              : "work_intent_context_satisfied_promoted_by_node_lifecycle_runner",
            ...resolution.reasonCodes,
            ...resolveTool.reasonCodes,
            ...acceptTool.reasonCodes,
            ...promoteTool.reasonCodes,
            ...applied.reasonCodes,
          ]),
        };
	      }

	      if (
	        resolution.status === "domain_resource_selection_required" ||
	        resolution.status === "domain_resource_selection_blocked"
	      ) {
	        const selectionInput = this.domainResourceSelectionInputFrom({
	          graphId: input.graphId,
	          iteration: input.iteration,
	          snapshot: input.snapshot,
	          node,
	          resolution,
	        });
	        const selected = await this.applyDomainResourceSelectionForPrecondition({
	          graphId: input.graphId,
	          iteration: input.iteration,
	          snapshot: input.snapshot,
	          node,
	          resolution,
	          selectionInput,
	        });
	        await this.options.graphs.updateNodeStatus({
	          nodeId: node.nodeId,
	          nodeStatus: selected.status === "continue" ? "planned" : "needs_review",
	          outputArtifactRefs: uniqueStrings([
	            ...node.outputArtifactRefs,
	            resolution.resolutionRef,
	            ...selected.refs,
	          ]).slice(0, 24),
	          metadataPatch: {
	            ...metadataPatch,
	            ...selected.metadataPatch,
	            lastResultStatus: selected.status === "continue" ? "planned" : "needs_review",
	            rawPromptStored: false,
	            rawResponseStored: false,
	            rawProviderLogStored: false,
	            rawToolLogStored: false,
	          } satisfies JsonValue,
	        });
	        await this.options.onProgress?.({
	          stage: "domain_resource_selection",
	          status: selected.status === "continue" ? "completed" : "needs_review",
	          nodeId: node.nodeId,
	          roleId: node.assignedRole,
	          reasonCodes: uniqueStrings([
	            ...resolution.reasonCodes,
	            ...resolveTool.reasonCodes,
	            ...selected.reasonCodes,
	          ]),
	          currentObjective:
	            typeof nodeMetadata.exactObjective === "string"
	              ? nodeMetadata.exactObjective
	              : "Select exact domain resources from the node-local resource ledger.",
	          activeNodeKind: node.nodeKind,
	          capabilityId: resolution.capabilityId,
	          modelRef: node.modelOrWorkerRef,
	          evidenceProducedRefs: selected.refs,
	          currentPhase:
	            selected.status === "continue"
	              ? "domain_resource_selection_accepted"
	              : "domain_resource_selection_blocked",
	          validationState: "domain_resource_selection_required",
	          schedulerPhase: "domain_resource_selection",
	          schedulerToolId:
	            selected.status === "continue"
	              ? "resource.selection.propose"
	              : "resource.selection.mark_blocked",
	          schedulerToolInvocationRefs: selected.refs,
	          nextDecisionNeeded:
	            selected.status === "continue"
	              ? "node.execution_packet.evaluate_action_gate"
	              : "resource.selection.propose",
	          blockerSummary:
	            selected.status === "continue"
	              ? null
	              : "Domain resource selection did not produce an accepted model-authored selection.",
	          eli5Progress:
	            selected.status === "continue"
	              ? "The model selected exact domain resources from the node-local ledger; runtime validated membership and authority only."
	              : "OpenClaw stopped at domain resource selection because no accepted small-verb selection was available.",
	        });
	        return {
	          status: selected.status,
	          continueLoop: selected.continueLoop,
	          refs: [resolution.resolutionRef, ...resolveTool.refs, ...selected.refs],
	          reasonCodes: uniqueStrings([
	            selected.status === "continue"
	              ? "work_intent_domain_resource_selection_runner_owned"
	              : "work_intent_domain_resource_selection_blocked",
	            ...resolution.reasonCodes,
	            ...resolveTool.reasonCodes,
	            ...selected.reasonCodes,
	          ]),
	        };
	      }

      const requestToolId =
        resolution.status === "resource_ledger_ready"
          ? "node.execution_packet.mark_resource_ledger_ready"
          : "scheduler.request_resource_requirement_for_work_intent";
      const requestSchedulerPhase =
        resolution.status === "resource_ledger_ready"
          ? "resource_ledger_ready"
          : "resource_required";
      const requestTool = await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: requestToolId,
        idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:${requestToolId}:${resolution.resolutionHash}`,
        inputRef: resolution.resolutionRef,
        inputHash: resolution.resolutionHash,
        inputSummary: `Record next WorkIntent context transition for ${node.nodeId}: ${resolution.status}.`,
        nodeId: node.nodeId,
        roleRef: node.assignedRole,
        modelRef: node.modelOrWorkerRef,
        metadata: {
          workIntentContextResolution: manifest as unknown as JsonValue,
          schedulerPhase: requestSchedulerPhase,
          reasonCodes: resolution.reasonCodes,
          missingResourceRequirementRefs: resolution.missingResourceRequirementRefs,
          missingResourceHandoffRefs: resolution.missingResourceHandoffRefs,
          failedResourceSupplyNodeIds: resolution.failedResourceSupplyNodeIds,
          pendingResourceSupplyNodeIds: resolution.pendingResourceSupplyNodeIds,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        } satisfies JsonValue,
      });
      const failedSupplyNodes = input.snapshot.nodes.filter((candidate) =>
        resolution.failedResourceSupplyNodeIds.includes(candidate.nodeId),
      );
      const failedByProviderInputBound = failedSupplyNodes.some((candidate) => {
        const candidateMetadata = jsonRecord(candidate.metadata ?? null);
        return (
          candidateMetadata.providerInputBudgetStatus === "blocked" ||
          jsonStringArray(candidateMetadata.lastStatusReasonCodes).includes(
            "resource_specialist_payload_over_profile_bound",
          ) ||
          jsonStringArray(candidateMetadata.reasonCodes).includes(
            "resource_specialist_payload_over_profile_bound",
          )
        );
      });
      const partialTool =
        resolution.status === "partially_satisfied"
          ? await this.recordSchedulerTool({
              graphId: input.graphId,
              iteration: input.iteration,
              toolId: "scheduler.accept_partial_resources_for_work_intent",
              idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:accept-partial-context:${resolution.resolutionHash}`,
              inputRef: resolution.resolutionRef,
              inputHash: resolution.resolutionHash,
              inputSummary: `Preserve partial accepted context for WorkIntent ${node.nodeId} while blocked shards are repaired.`,
              nodeId: node.nodeId,
              roleRef: node.assignedRole,
              modelRef: node.modelOrWorkerRef,
              metadata: {
                acceptedResourceHandoffRefs: resolution.acceptedResourceHandoffRefs,
                failedResourceSupplyNodeIds: resolution.failedResourceSupplyNodeIds,
                missingResourceHandoffRefs: resolution.missingResourceHandoffRefs,
                schedulerPhase: "partial_context_preserved",
                semanticQualityJudgedByDeterministicCode: false,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                rawToolLogStored: false,
              } satisfies JsonValue,
            })
          : null;
      const retryTool =
        resolution.failedResourceSupplyNodeIds.length > 0
          ? await this.recordSchedulerTool({
              graphId: input.graphId,
              iteration: input.iteration,
              toolId: "scheduler.retry_failed_resource_shard",
              idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:retry-failed-context-shard:${resolution.resolutionHash}`,
              inputRef: resolution.resolutionRef,
              inputHash: resolution.resolutionHash,
              inputSummary: `Record retry boundary for failed context shard(s) on WorkIntent ${node.nodeId}.`,
              nodeId: node.nodeId,
              roleRef: node.assignedRole,
              modelRef: node.modelOrWorkerRef,
              metadata: {
                failedResourceSupplyNodeIds: resolution.failedResourceSupplyNodeIds,
                missingResourceHandoffRefs: resolution.missingResourceHandoffRefs,
                acceptedResourceHandoffRefs: resolution.acceptedResourceHandoffRefs,
                schedulerPhase: "failed_context_shard_retry_boundary",
                semanticQualityJudgedByDeterministicCode: false,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                rawToolLogStored: false,
              } satisfies JsonValue,
            })
          : null;
      const reshardTool =
        failedByProviderInputBound
          ? await this.recordSchedulerTool({
              graphId: input.graphId,
              iteration: input.iteration,
              toolId: "scheduler.reshard_resource_requirement",
              idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:reshard-resource-requirement:${resolution.resolutionHash}`,
              inputRef: resolution.resolutionRef,
              inputHash: resolution.resolutionHash,
              inputSummary: `Record structural reshard requirement for over-budget resource scout input on WorkIntent ${node.nodeId}.`,
              nodeId: node.nodeId,
              roleRef: node.assignedRole,
              modelRef: node.modelOrWorkerRef,
              metadata: {
                failedResourceSupplyNodeIds: resolution.failedResourceSupplyNodeIds,
                missingResourceHandoffRefs: resolution.missingResourceHandoffRefs,
                acceptedResourceHandoffRefs: resolution.acceptedResourceHandoffRefs,
                reasonCodes: [
                  "resource_specialist_payload_over_profile_bound",
                  "resource_requirement_structural_reshard_required",
                ],
                schedulerPhase: "resource_requirement_structural_reshard_required",
                semanticQualityJudgedByDeterministicCode: false,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                rawToolLogStored: false,
              } satisfies JsonValue,
            })
          : null;
      await this.options.graphs.updateNodeStatus({
        nodeId: node.nodeId,
        nodeStatus: "planned",
        outputArtifactRefs: uniqueStrings([...node.outputArtifactRefs, resolution.resolutionRef]).slice(
          0,
          24,
        ),
        metadataPatch,
      });
      await this.options.onProgress?.({
        stage: "work_intent_context_resolution",
        status: "needs_review",
        nodeId: node.nodeId,
        roleId: node.assignedRole,
        reasonCodes: uniqueStrings([
          ...resolution.reasonCodes,
          ...resolveTool.reasonCodes,
          ...requestTool.reasonCodes,
        ]),
        currentObjective:
          typeof nodeMetadata.exactObjective === "string"
            ? nodeMetadata.exactObjective
            : "Request scoped context requirement for WorkIntent.",
        activeNodeKind: node.nodeKind,
        capabilityId: resolution.capabilityId,
        modelRef: node.modelOrWorkerRef,
        evidenceProducedRefs: [resolution.resolutionRef, ...resolveTool.refs, ...requestTool.refs],
        currentPhase: "work_intent_resource_required",
        validationState: requestSchedulerPhase,
        schedulerPhase: requestSchedulerPhase,
        schedulerToolId: requestToolId,
        schedulerToolInvocationRefs: [...resolveTool.refs, ...requestTool.refs],
        nextDecisionNeeded:
          resolution.status === "resource_ledger_ready"
              ? "node.execution_packet.mark_resource_ledger_ready"
              : "scheduler.compile_resource_requirements_for_work_intents",
        blockerSummary:
          resolution.status === "partially_satisfied"
            ? "Some context supply branches succeeded, but at least one required branch failed or omitted a handoff."
            : resolution.status === "resource_ledger_ready"
                  ? "The WorkIntent has node-local context ledger evidence and is ready for the next resource transition."
            : "The WorkIntent still needs scoped context before it can be promoted or closed.",
        eli5Progress:
          "OpenClaw found the next node-local context transition and will continue without broad graph context repair.",
      });
      return {
        status: "continue",
        continueLoop: false,
        refs: [
          resolution.resolutionRef,
          ...resolveTool.refs,
          ...requestTool.refs,
          ...(partialTool?.refs ?? []),
          ...(retryTool?.refs ?? []),
          ...(reshardTool?.refs ?? []),
        ],
        reasonCodes: uniqueStrings([
          "work_intent_resource_requirement_requested",
          ...resolution.reasonCodes,
          ...resolveTool.reasonCodes,
          ...requestTool.reasonCodes,
          ...(partialTool?.reasonCodes ?? []),
          ...(retryTool?.reasonCodes ?? []),
          ...(reshardTool?.reasonCodes ?? []),
        ]),
      };
    return null;
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
      ["run_node", "retry_node"].includes(input.decision.decisionKind)
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
                `runtime-work-graph://frontier-root-cause/${input.graphId}/${String(
                  frontierRootCauseArtifact.signatureHash ?? "unknown",
                )}`,
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
      requireNodeExecutionPacketForWorkerExecution:
        this.options.requireNodeExecutionPacketForWorkerExecution === true,
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
            inputRef: graphRef("graph", `${input.graphId}/branch-scoped-frontier/${input.iteration}`),
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
        .filter((projection) => projection.currentGate !== "worker_action_ready")
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
    const postRunnableFrontier = selectRunnableParallelFrontier({
      snapshot: postFrontierSnapshot,
      executors: this.options.executors,
      maxParallelNodeExecutions: this.maxParallelNodeExecutions,
    });
    const postSchedulerFrontierState = buildSchedulerFrontierState({
      graphId: input.graphId,
      iteration: input.iteration,
      snapshot: postFrontierSnapshot,
      frontier: postRunnableFrontier,
      executors: this.options.executors,
      missionLedger: mergedMissionLedger,
      requireNodeExecutionPacketForWorkerExecution:
        this.options.requireNodeExecutionPacketForWorkerExecution === true,
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
    return { status: "continue", reasonCodes: frontierReasonCodes, missionLedger: mergedMissionLedger };
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
    if (node.nodeKind === "work_intent") {
      const projection = this.nodeLifecycleTransitionRunner.project({
        graphId: input.graphId,
        snapshot,
        node,
      });
      const transition = await this.advanceNodeLifecycleTransition({
        graphId: input.graphId,
        iteration: input.iteration,
        snapshot,
        node,
        projection,
        transitionContext: {
          missionLedger: input.missionLedger,
          executedNodeIds: input.executedNodeIds,
          addedNodeIds: input.addedNodeIds,
          loopGuard: input.loopGuard,
        } satisfies NodeLifecycleSchedulerTransitionContext,
      });
      return {
        proceed: false,
        status: transition?.status ?? "continue",
        reasonCodes: uniqueStrings([
          "scheduler_run_node_work_intent_delegated_to_node_lifecycle_runner",
          ...(transition?.reasonCodes ?? []),
        ]),
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
          "node_lifecycle_transition_profile_rejected_worker_start",
          ...projection.rejectedLifecycleTransitions.map(
            (transition) => `node_lifecycle_rejected_transition:${transition}`,
          ),
        ]),
        missionLedger: input.missionLedger,
      };
    }
    if (!nodeHasExecutableAdapter({ node, executors: this.options.executors })) {
      return {
        proceed: false,
        status: "needs_review",
        reasonCodes: uniqueStrings([
          ...projectionRecord.reasonCodes,
          "node_executor_missing",
          "node_lifecycle_runner_blocked_worker_start_missing_executor",
        ]),
        missionLedger: input.missionLedger,
      };
    }
    if (!projection.canCallGlobalScheduler && projection.currentGate !== "worker_action_ready") {
      const transition = await this.advanceNodeLifecycleTransition({
        graphId: input.graphId,
        iteration: input.iteration,
        snapshot,
        node,
        projection,
        transitionContext: {
          missionLedger: input.missionLedger,
          executedNodeIds: input.executedNodeIds,
          addedNodeIds: input.addedNodeIds,
          loopGuard: input.loopGuard,
        } satisfies NodeLifecycleSchedulerTransitionContext,
      });
      return {
        proceed: false,
        status: transition?.status ?? "needs_review",
        reasonCodes: uniqueStrings([
          ...projectionRecord.reasonCodes,
          ...(transition?.reasonCodes ?? [
            "node_lifecycle_pending_without_transition_executor",
            `node_lifecycle_pending_gate:${projection.currentGate}`,
          ]),
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
        reasonCodes: uniqueStrings([...projectionRecord.reasonCodes, ...stopped.reasonCodes]),
        missionLedger: stopped.missionLedger ?? input.missionLedger,
      };
    }
    const promoteTool = await this.recordSchedulerTool({
      graphId: input.graphId,
      iteration: input.iteration,
      toolId: "scheduler.promote_work_intent_to_executable",
      idempotencyKey: `iteration:${input.iteration}:node:${input.nodeId}:promote-executable`,
      inputRef: graphRef("node", input.nodeId),
      inputSummary: `Promote node ${input.nodeId} into the executable frontier from NodeLifecycleTransitionRunner projection.`,
      nodeId: input.nodeId,
      roleRef: node.assignedRole,
      modelRef: node.modelOrWorkerRef,
      metadata: {
        decisionId: input.decision.decisionId,
        nodeLifecycleProjection: projectionManifest as unknown as JsonValue,
        schedulerPhase: "node_lifecycle_worker_start_ready",
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
        schedulerPhase: "node_lifecycle_worker_start_ready",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    return {
      proceed: true,
      reasonCodes: uniqueStrings([
        ...projectionRecord.reasonCodes,
        ...promoteTool.reasonCodes,
        ...openTool.reasonCodes,
        "node_lifecycle_runner_authorized_worker_start",
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
        ...decision.newNodes.some((node) => {
          const metadata = jsonRecord(node.metadata ?? null);
          return node.nodeKind === "work_intent" && metadata.workIntentRootAccepted === true;
        })
          ? [
              {
                toolId: "scheduler.work_intent.accept_roots" as const,
                summary:
                  "Accept model-authored independent non-runnable WorkIntent roots before any resource scout or executable node exists.",
              },
            ]
          : [],
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
            schedulerPhase: "planning_in_progress",
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        decision.reasonCodes.push(...stageTool.reasonCodes);
      }
      let persistenceOutcome: RuntimeWorkGraphPersistenceOutcome;
      try {
        persistenceOutcome = await this.addNodes({
          graphId,
          nodes: decision.newNodes,
          edges: decision.newEdges ?? [],
          addedNodeIds: input.addedNodeIds,
          iteration: input.iteration,
        });
      } catch (error) {
        const summary = error instanceof Error ? error.message : String(error);
        const graphPersistenceReasonCode = summary.startsWith("runtime_work_graph_edge_")
          ? summary
          : `runtime_work_graph_persistence_error:${summary.slice(0, 180)}`;
        await this.options.graphs.recordCheckpoint({
          graphId,
          checkpointKind: "scheduler_graph_persistence_needs_review",
          stateSummary: `Accepted scheduler graph could not be persisted: ${summary.slice(0, 240)}.`,
          artifactRefs: [graphRef("orchestrator-decision", decision.decisionId)],
        });
        await this.options.onProgress?.({
          stage: "scheduler_graph_persistence",
          status: "needs_review",
          reasonCodes: uniqueStrings([
            ...decision.reasonCodes,
            "scheduler_graph_persistence_needs_review",
            graphPersistenceReasonCode,
          ]),
          currentPhase: "graph_persistence_needs_review",
          schedulerPhase: "needs_review",
          currentObjective:
            "Persist the accepted scheduler graph topology before any worker execution.",
          blockerSummary: `Accepted scheduler graph could not be persisted: ${summary.slice(0, 180)}.`,
          heartbeatState: "graph_persistence_needs_review",
          eli5Progress:
            "OpenClaw accepted a graph shape, but runtime blocked it because the graph topology could not be written cleanly.",
        });
        return {
          status: "needs_review",
          reasonCodes: uniqueStrings([
            ...decision.reasonCodes,
            "scheduler_graph_persistence_needs_review",
            graphPersistenceReasonCode,
          ]),
          missionLedger: input.missionLedger,
        };
      }
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
          const frontierRootCauseArtifact =
            repeatCount >= 2
              ? buildFrontierRootCauseArtifact({
                  graphId,
                  iteration: input.iteration,
                  snapshot: refreshedSnapshot,
                  frontierState,
                  noProgressSignature: signature,
                  repeatCount,
                })
              : null;
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
          const frontierRootCauseTool = frontierRootCauseArtifact
            ? await this.recordSchedulerTool({
                graphId,
                iteration: input.iteration,
                toolId: "scheduler.record_frontier_root_cause",
                idempotencyKey: `iteration:${input.iteration}:decision:${decision.decisionId}:frontier-root-cause:${signature.signatureHash.slice(0, 16)}`,
                inputRef: graphRef("orchestrator-decision", decision.decisionId),
                inputHash: signature.signatureHash,
                inputSummary:
                  "Record canonical frontier root cause because the same structural no-progress signature repeated across the scheduler frontier.",
                metadata: {
                  decisionId: decision.decisionId,
                  decisionKind: decision.decisionKind,
                  noProgressSignature: signature as unknown as JsonValue,
                  frontierRootCauseArtifact:
                    frontierRootCauseArtifact as unknown as JsonValue,
                  noProgressRepeatCount: repeatCount,
                  schedulerFrontierState: frontierState as unknown as JsonValue,
                  schedulerPhase: "frontier_root_cause_collapse",
                  reasonCodes: [
                    "scheduler_frontier_root_cause_recorded",
                    frontierRootCauseArtifact.recommendedRepairBoundary
                      ? `scheduler_frontier_root_cause_boundary:${frontierRootCauseArtifact.recommendedRepairBoundary}`
                      : "scheduler_frontier_root_cause_boundary:terminal_diagnostic",
                  ],
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
              })
            : { refs: [], reasonCodes: [] };
          await this.options.onProgress?.({
            stage: "scheduler_no_progress",
            status: repeatCount >= 2 ? "needs_review" : "completed",
            reasonCodes: [
              "scheduler_graph_persistence_reused_only_no_progress",
              `scheduler_no_progress_signature:${signature.signatureHash.slice(0, 16)}`,
              `scheduler_no_progress_repeat_count:${repeatCount}`,
              ...noProgressTool.reasonCodes,
              ...frontierRootCauseTool.reasonCodes,
            ],
            currentPhase: "no_progress_evaluation",
            schedulerPhase:
              repeatCount >= 2 ? "frontier_root_cause_collapse" : "no_progress_evaluation",
            schedulerToolId:
              repeatCount >= 2
                ? "scheduler.record_frontier_root_cause"
                : "scheduler.record_no_progress_signature",
            schedulerToolInvocationRefs: [...noProgressTool.refs, ...frontierRootCauseTool.refs],
            evidenceProducedRefs: [...noProgressTool.refs, ...frontierRootCauseTool.refs],
            nextDecisionNeeded:
              repeatCount >= 2
                ? (frontierRootCauseArtifact?.recommendedRepairBoundary ??
                  "operator_review_root_cause")
                : frontierState.nextLegalTransition,
            blockerSummary:
              frontierRootCauseArtifact
                ? `Frontier root cause collapsed at ${frontierRootCauseArtifact.recommendedRepairBoundary}; repeated structural blocker ${signature.signatureHash.slice(0, 16)} affected ${frontierRootCauseArtifact.affectedNodeIds.length} node(s).`
                : "The scheduler accepted a graph write decision, but runtime only reused existing nodes/edges and saw no new executable work or evidence.",
            eli5Progress:
              repeatCount >= 2
                ? "OpenClaw saw the same no-progress graph state twice, so it stopped instead of looping."
                : "OpenClaw saw a no-progress graph state and will allow one bounded repair decision.",
            heartbeatState: repeatCount >= 2 ? "needs_review" : "no_progress_observed",
            schedulerFrontierState: frontierState,
            branchScopedFrontierStates: frontierState.branchScopedFrontierStates,
            noProgressSignature: signature,
            frontierRootCauseArtifact,
            frontierRootCauseArtifactRefs: frontierRootCauseTool.refs,
            noProgressRepeatCount: repeatCount,
          });
          decision.reasonCodes.push(
            "scheduler_graph_persistence_reused_only_no_progress",
            `scheduler_no_progress_signature:${signature.signatureHash.slice(0, 16)}`,
            ...noProgressTool.reasonCodes,
            ...frontierRootCauseTool.reasonCodes,
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
                ...frontierRootCauseTool.refs,
              ],
            });
            return {
              status: "needs_review",
              reasonCodes: [
                ...decision.reasonCodes,
                "scheduler_repeated_no_progress_signature_halted",
                "scheduler_no_progress_root_cause_surface_required",
                "scheduler_frontier_root_cause_collapsed",
              ],
              missionLedger: input.missionLedger,
            };
          }
        }
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
          schedulerPhase: "decomposition_accepted",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      if (acceptedTool.reasonCodes.length > 0) {
        decision.reasonCodes.push(...acceptedTool.reasonCodes);
      }
      const promotionPairs = Array.isArray(decisionMetadata.promotedWorkIntentExecutablePairs)
        ? decisionMetadata.promotedWorkIntentExecutablePairs
            .map((pair) => jsonRecord(pair as JsonValue))
            .map((pair) => ({
              workIntentNodeId:
                typeof pair.workIntentNodeId === "string" ? pair.workIntentNodeId : null,
              executableNodeId:
                typeof pair.executableNodeId === "string" ? pair.executableNodeId : null,
              selectedCapabilityId:
                typeof pair.selectedCapabilityId === "string" ? pair.selectedCapabilityId : null,
              executableNodeKind:
                typeof pair.executableNodeKind === "string" ? pair.executableNodeKind : null,
            }))
            .filter(
              (pair): pair is {
                workIntentNodeId: string;
                executableNodeId: string;
                selectedCapabilityId: string;
                executableNodeKind: string;
              } =>
                Boolean(
                  pair.workIntentNodeId &&
                    pair.executableNodeId &&
                    pair.selectedCapabilityId &&
                    pair.executableNodeKind,
                ),
            )
        : [];
      if (promotionPairs.length > 0) {
        const promoteTool = await this.recordSchedulerTool({
          graphId,
          iteration: input.iteration,
          toolId: "scheduler.promote_work_intent_to_executable",
          idempotencyKey: `iteration:${input.iteration}:decision:${decision.decisionId}:workintent-promote`,
          inputRef: graphRef("orchestrator-decision", decision.decisionId),
          inputSummary:
            "Promote accepted WorkIntent control-plane nodes into their manifest-selected executable graph nodes after graph persistence.",
          metadata: {
            decisionId: decision.decisionId,
            promotedWorkIntentExecutablePairs: promotionPairs as unknown as JsonValue,
            schedulerPhase: "node_transition_readiness",
            reasonCodes: ["runtime_policy_work_intent_promoted_to_executable"],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        });
        decision.reasonCodes.push(...promoteTool.reasonCodes);
        const postPromotionSnapshot = await this.options.graphs.readGraphSnapshot(graphId);
        const nodeById = new Map((postPromotionSnapshot?.nodes ?? []).map((node) => [node.nodeId, node]));
        for (const pair of promotionPairs) {
          const workIntentNode = nodeById.get(pair.workIntentNodeId);
          const executableNode = nodeById.get(pair.executableNodeId);
          if (!workIntentNode) {
            continue;
          }
          const workIntentMetadata = jsonRecord(workIntentNode.metadata ?? null);
          const executableNodeRef = graphRef("node", pair.executableNodeId);
          if (executableNode) {
            const acceptedSelectionPacketRefs = uniqueStrings([
              ...jsonStringArray(workIntentMetadata.acceptedResourceSelectionPacketRefs),
              ...jsonStringArray(workIntentMetadata.resourceSelectionPacketRefs),
              ...jsonStringArray(workIntentMetadata.domainResourceSelectionPacketRefs),
            ]).slice(0, 20);
            const inheritedSelectionPacketRef =
              jsonString(workIntentMetadata.acceptedResourceSelectionPacketRef) ??
              jsonString(workIntentMetadata.resourceSelectionPacketRef) ??
              jsonString(workIntentMetadata.domainResourceSelectionPacketRef);
            const inheritedLedgerRefs = uniqueStrings([
              ...jsonStringArray(workIntentMetadata.nodeResourceLedgerRefs),
              ...jsonStringArray(workIntentMetadata.nodeResourceLedgerEntryRefs),
              ...jsonStringArray(workIntentMetadata.nodeResourceLedgerEntryPayloadRefs),
            ]).slice(0, 80);
            await this.options.graphs.updateNodeStatus({
              nodeId: pair.executableNodeId,
              nodeStatus: executableNode.nodeStatus,
              metadataPatch: {
                parentWorkIntentNodeId: pair.workIntentNodeId,
                inheritedResourceLifecycleStatus: "accepted",
                inheritedResourceLifecycleSource: "node_lifecycle_transition_runner",
                resourceSelectionPacketRef: inheritedSelectionPacketRef,
                resourceSelectionPacketRefs: acceptedSelectionPacketRefs,
                acceptedResourceSelectionPacketRef: inheritedSelectionPacketRef,
                acceptedResourceSelectionPacketRefs: acceptedSelectionPacketRefs,
                domainResourceSelectionPacketRef:
                  jsonString(workIntentMetadata.domainResourceSelectionPacketRef) ??
                  inheritedSelectionPacketRef,
                domainResourceSelectionPacketRefs: uniqueStrings([
                  ...jsonStringArray(workIntentMetadata.domainResourceSelectionPacketRefs),
                  ...acceptedSelectionPacketRefs,
                ]).slice(0, 20),
                selectedResourceRefs: jsonStringArray(workIntentMetadata.selectedResourceRefs).slice(0, 80),
                resourceNarrowingExactRefs: jsonStringArray(workIntentMetadata.resourceNarrowingExactRefs).slice(0, 80),
                nodeResourceDemandSessionRefs: jsonStringArray(workIntentMetadata.nodeResourceDemandSessionRefs).slice(0, 40),
                nodeResourceDemandFulfillmentRefs: jsonStringArray(workIntentMetadata.nodeResourceDemandFulfillmentRefs).slice(0, 40),
                nodeResourceLedgerRefs: jsonStringArray(workIntentMetadata.nodeResourceLedgerRefs).slice(0, 40),
                nodeResourceLedgerEntryRefs: jsonStringArray(workIntentMetadata.nodeResourceLedgerEntryRefs).slice(0, 80),
                nodeResourceLedgerEntryPayloadRefs: jsonStringArray(workIntentMetadata.nodeResourceLedgerEntryPayloadRefs).slice(0, 80),
                acceptedResourceHandoffRefs: jsonStringArray(workIntentMetadata.acceptedResourceHandoffRefs).slice(0, 80),
                inheritedResourceArtifactRefs: inheritedLedgerRefs,
                nodeReadinessRepairAction: "materialize_from_accepted_resource_selection",
                nodeReadinessNextAllowedTransitions: ["materialize_resource_packet", "execute_node"],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              },
            });
          }
          await this.options.graphs.updateNodeStatus({
            nodeId: pair.workIntentNodeId,
            nodeStatus: "succeeded",
            outputArtifactRefs: [executableNodeRef],
            metadataPatch: {
              lastResultStatus: "succeeded",
              lastStatusReasonCodes: [
                "runtime_policy_work_intent_promoted_to_executable",
                `work_intent_promoted_executable_node:${pair.executableNodeId}`,
                `work_intent_promoted_selected_capability:${pair.selectedCapabilityId}`,
                ...promoteTool.reasonCodes,
              ].slice(0, 60),
              readinessStatus: "promoted",
              lifecycleState: "promoted_to_executable",
              nodeLifecycleState: "promoted_to_executable",
              promotedExecutableNodeId: pair.executableNodeId,
              promotedExecutableNodeKind: pair.executableNodeKind,
              promotedSelectedCapabilityId: pair.selectedCapabilityId,
              nodeReadinessStateRef: null,
              nodeReadinessStatus: null,
              nodeReadinessPhase: null,
              nodeReadinessRepairAction: null,
              nodeReadinessNextAllowedTransitions: [],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          });
          await this.options.onNodeStatusChanged?.({
            graphId,
            node: workIntentNode,
            nodeStatus: "succeeded",
            evidenceRefs: [executableNodeRef],
            reasonCodes: [
              "runtime_policy_work_intent_promoted_to_executable",
              `work_intent_promoted_executable_node:${pair.executableNodeId}`,
              ...promoteTool.reasonCodes,
            ],
          });
        }
      }
    }
    if (["add_nodes", "split_node", "request_review", "rerun_role"].includes(decision.decisionKind)) {
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
    if (["run_node", "retry_node"].includes(decision.decisionKind)) {
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
    const nodeLifecycleProjection = this.nodeLifecycleTransitionRunner.project({
      graphId: input.graphId,
      snapshot,
      node,
    });
    const payloadBackedExecutionAuthority =
      nodeLifecyclePayloadBackedExecutionAuthorityFor(node);
    const stopped = await this.options.beforeNodeExecution({
      graphId: input.graphId,
      iteration: input.iteration,
      node,
      decision: input.decision,
      snapshotSummary: summarizeSnapshot(snapshot),
      nodeLifecycleProjection,
      payloadBackedExecutionAuthority,
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
      projectionFailedNodeIds: [],
      projectionReasonCodes: [],
    };
    const createdNodesForProjection: TeamGraphNode[] = [];
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
    const validationOrdering = validateSchedulerValidationNodePhaseOrdering({
      nodes: input.nodes,
      edges: input.edges,
      existingNodesById,
    });
    if (!validationOrdering.valid) {
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind: "scheduler_validation_node_phase_ordering_rejected",
        stateSummary: validationOrdering.blockerSummary ?? "Validation node phase ordering rejected.",
        artifactRefs: [],
      });
      await this.options.onProgress?.({
        stage: "scheduler_graph_node_persistence",
        status: "needs_review",
        reasonCodes: [
          "scheduler_validation_node_phase_ordering_rejected",
          ...validationOrdering.reasonCodes,
        ],
        currentPhase: "graph_validation_node_phase_ordering_rejected",
        schedulerPhase: "needs_review",
        currentObjective:
          "Validate scheduler graph validation-node phase semantics before mutating runtime graph nodes.",
        blockerSummary:
          validationOrdering.blockerSummary ??
          "Validation node phase ordering rejected before graph persistence.",
        runtimeToolTimeoutMs: persistenceTimeoutMs,
        heartbeatState: "graph_validation_node_phase_ordering_rejected",
        eli5Progress:
          "OpenClaw rejected a validation node because validation ordering must be explicit and runner-compatible.",
      });
      throw new Error(
        `scheduler_validation_node_phase_ordering_rejected:${validationOrdering.reasonCodes.join(",")}`,
      );
    }
    const proposedKnownNodeIds = new Set([
      ...existingNodesById.keys(),
      ...input.nodes.map((node) => node.nodeId),
    ]);
    const isSymbolicFutureEndpoint = (value: string | null | undefined): boolean =>
      Boolean(
        value &&
          !proposedKnownNodeIds.has(value) &&
          (/^(future|milestone|phase|commitment)[:_-]/iu.test(value) ||
            value.includes("future") ||
            value.includes("milestone")),
      );
    for (const [edgeIndex, edge] of input.edges.entries()) {
      const missingEndpoint =
        edge.fromNodeId &&
        !proposedKnownNodeIds.has(edge.fromNodeId) &&
        !isSymbolicFutureEndpoint(edge.fromNodeId)
          ? { side: "from" as const, nodeId: edge.fromNodeId }
          : edge.toNodeId &&
              !proposedKnownNodeIds.has(edge.toNodeId) &&
              !isSymbolicFutureEndpoint(edge.toNodeId)
            ? { side: "to" as const, nodeId: edge.toNodeId }
            : null;
      if (!missingEndpoint) {
        continue;
      }
      const edgeId = edge.edgeId ?? `edge-${edgeIndex + 1}`;
      const reasonCodes = [
        "scheduler_graph_edge_endpoint_rejected",
        "scheduler_graph_patch_rejected_before_partial_node_write",
        `runtime_work_graph_edge_${missingEndpoint.side}_node_unknown:${missingEndpoint.nodeId}`,
      ];
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind: "scheduler_graph_edge_endpoint_rejected",
        stateSummary: `Rejected graph edge before any graph node write because ${missingEndpoint.side}NodeId ${missingEndpoint.nodeId} is not a known accepted node.`,
        artifactRefs: [graphRef("edge", edgeId)],
      });
      await this.options.onProgress?.({
        stage: "scheduler_graph_edge_persistence",
        status: "needs_review",
        reasonCodes,
        currentPhase: "graph_edge_endpoint_rejected_before_node_write",
        schedulerPhase: "needs_review",
        currentObjective:
          "Validate accepted scheduler graph edge endpoints before mutating runtime graph nodes.",
        blockerSummary: `Scheduler graph edge ${edgeId} references unknown ${missingEndpoint.side} node ${missingEndpoint.nodeId}.`,
        runtimeToolTimeoutMs: persistenceTimeoutMs,
        heartbeatState: "graph_edge_endpoint_rejected_before_node_write",
        eli5Progress:
          "OpenClaw stopped before writing graph nodes because an accepted edge points at a node that does not exist in the accepted graph.",
      });
      throw new Error(`runtime_work_graph_edge_${missingEndpoint.side}_node_unknown:${missingEndpoint.nodeId}`);
    }
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
        const createdNode = await withSchedulerOperationTimeout({
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
        createdNodesForProjection.push(createdNode);
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
    }
    const knownNodeIds = new Set([
      ...existingNodesById.keys(),
      ...input.nodes.map((node) => node.nodeId),
    ]);
    const edgesToPersist = input.edges;
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
        `node_count:${input.nodes.length}`,
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
        ...input.nodes.map((node) => graphRef("node", node.nodeId)),
        ...input.edges.map((edge, index) => graphRef("edge", edge.edgeId ?? `edge-${index + 1}`)),
      ].slice(0, 30),
      schedulerFrontierState: {
        artifactKind: "runtime_work_graph_scheduler_frontier_state",
        schemaVersion: "execution-platform.runtime-work-graph.scheduler-frontier.v1",
        graphId: input.graphId,
        currentSuperstep: input.iteration,
        nodeCount: input.nodes.length,
        edgeCount: edgesToPersist.length,
        executableReadyNodeIds: [],
        selectedExecutableNodeIds: [],
        blockedFrontierNodeIds: [],
        aggregateBlockedNodeIds: [],
        nonRunnableNodeIds: input.nodes.map((node) => node.nodeId).slice(0, 80),
        dependencyBlockedNodeIds: [],
        contextBlockedNodeIds: [],
        resourceBlockedNodeIds: [],
        validationBlockedNodeIds: [],
        reviewBlockedNodeIds: [],
        closeoutBlockedNodeIds: [],
        branchIds: [],
        readinessRefs: [],
        resourceRefs: [],
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
          `graph_patch_node_count:${input.nodes.length}`,
          `graph_patch_edge_count:${edgesToPersist.length}`,
          ...outcome.projectionReasonCodes,
        ],
        blockedNodeDiagnostics: [],
        branchScopedFrontierStates: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        graphNodes: input.nodes.map((node) => ({
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          assignedRole: node.assignedRole,
          capabilityId: node.capabilityId ?? null,
          executionIntent: jsonString(jsonRecord(node.metadata ?? null).executionIntent),
          rawPromptStored: false,
          rawResponseStored: false,
        })),
        graphEdges: edgesToPersist.map((edge, index) => ({
          edgeId: edge.edgeId ?? `edge-${index + 1}`,
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
    const graphMetadata = jsonRecord(snapshot.graph.metadata);
    const contextRepairGate = evaluateContextRepairNodeExecutionGate({
      node,
      edges: snapshot.edges,
    });
    if (contextRepairGate.status === "blocked") {
      const gateTool = await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "resource_repair.block_without_requirement",
        idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:context-repair-gate`,
        inputRef: contextRepairGate.contextBrokerRequestRef ?? graphRef("node", node.nodeId),
        inputSummary: `Block context repair node ${node.nodeId} before execution because the consumer-aware requirement boundary is incomplete.`,
        nodeId: node.nodeId,
        roleRef: node.assignedRole,
        modelRef: node.modelOrWorkerRef,
        metadata: {
          contextRepairExecutionGate: contextRepairGate as unknown as JsonValue,
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          schedulerPhase: "resource_repair_requirement_gate",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      const reasonCodes = [
        "scheduler_resource_repair_requirement_gate_blocked",
        ...contextRepairGate.reasonCodes,
        ...gateTool.reasonCodes,
      ].slice(0, 60);
      await this.options.graphs.updateNodeStatus({
        nodeId: node.nodeId,
        nodeStatus: "needs_review",
        metadataPatch: {
          lastResultStatus: "needs_review",
          lastStatusReasonCodes: reasonCodes,
          contextRepairRequirementGateStatus: contextRepairGate.status,
          contextRepairRequirementRefs: contextRepairGate.resourceRequirementRefs,
          contextRepairConsumerNodeId: contextRepairGate.consumerNodeId,
          contextRepairCanUnlockConsumer: contextRepairGate.canUnlockConsumer,
          schedulerContextRepairRequirementGateRef: gateTool.refs[0] ?? null,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      await this.options.onProgress?.({
        stage: "resource_repair_requirement_gate",
        status: "needs_review",
        nodeId: node.nodeId,
        roleId: node.assignedRole,
        reasonCodes,
        currentObjective: "Block context repair execution until a consumer-aware requirement packet and edge are declared.",
        activeNodeKind: node.nodeKind,
        capabilityId: nodeCapabilityId(node),
        modelRef: node.modelOrWorkerRef,
        inputHandoffRefs: node.inputHandoffRefs,
        currentPhase: "resource_repair_requirement_gate_blocked",
        validationState: "context_insufficient",
        evidenceProducedRefs: [
          contextRepairGate.contextBrokerRequestRef,
          ...contextRepairGate.resourceRequirementRefs,
          ...gateTool.refs,
        ].filter((ref): ref is string => Boolean(ref)),
        nextDecisionNeeded: "resource.demand.open",
        blockerSummary:
          "Runtime blocked a context repair node before model/provider invocation because the repair requirement boundary is incomplete.",
        eli5Progress:
          "OpenClaw stopped the context repair node before calling a model because it did not prove which consumer it repairs.",
        schedulerPhase: "resource_repair_requirement_gate",
        schedulerToolId: "resource_repair.block_without_requirement",
        schedulerToolInvocationRefs: gateTool.refs,
      });
      return { status: "needs_review", reasonCodes, missionLedger: input.missionLedger };
    }
    const childEpochEligibility = evaluateChildEpochFrontierEligibility({
      nodeId: node.nodeId,
      nodeMetadata,
      graphMetadata,
    });
    if (!childEpochEligibility.eligible) {
      const evaluateTool = await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "frontier.evaluate_epoch_eligibility",
        idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:child-epoch-eligibility`,
        inputRef: graphRef("node", node.nodeId),
        inputSummary: `Evaluate boundary epoch eligibility for node ${node.nodeId} before worker execution.`,
        nodeId: node.nodeId,
        roleRef: node.assignedRole,
        modelRef: node.modelOrWorkerRef,
        metadata: {
          childEpochEligibility: childEpochEligibility as unknown as JsonValue,
          schedulerPhase: "frontier_epoch_eligibility",
          reasonCodes: childEpochEligibility.reasonCodes,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      const blockTool = await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "frontier.block_stale_child",
        idempotencyKey: `iteration:${input.iteration}:node:${node.nodeId}:stale-child-block`,
        inputRef: graphRef("node", node.nodeId),
        inputSummary: `Block stale child node ${node.nodeId} before worker execution.`,
        nodeId: node.nodeId,
        roleRef: node.assignedRole,
        modelRef: node.modelOrWorkerRef,
        metadata: {
          childEpochEligibility: childEpochEligibility as unknown as JsonValue,
          schedulerPhase: "frontier_epoch_eligibility",
          reasonCodes: childEpochEligibility.reasonCodes,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      const reasonCodes = [
        "scheduler_child_epoch_frontier_blocked",
        ...childEpochEligibility.reasonCodes,
        ...evaluateTool.reasonCodes,
        ...blockTool.reasonCodes,
      ].slice(0, 60);
      await this.options.graphs.updateNodeStatus({
        nodeId: node.nodeId,
        nodeStatus: "needs_review",
        metadataPatch: {
          lastResultStatus: "needs_review",
          lastStatusReasonCodes: reasonCodes,
          childEpochFrontierEligible: false,
          childEpochStale: childEpochEligibility.stale,
          childEpochReasonCodes: childEpochEligibility.reasonCodes,
          boundaryEpoch: childEpochEligibility.boundaryEpoch,
          currentBoundaryEpoch: childEpochEligibility.currentBoundaryEpoch,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      await this.options.onProgress?.({
        stage: "frontier_epoch_eligibility",
        status: "needs_review",
        nodeId: node.nodeId,
        roleId: node.assignedRole,
        reasonCodes,
        currentObjective: "Block stale child node before worker execution.",
        activeNodeKind: node.nodeKind,
        capabilityId: nodeCapabilityId(node),
        modelRef: node.modelOrWorkerRef,
        inputHandoffRefs: node.inputHandoffRefs,
        currentPhase: "child_epoch_frontier_blocked",
        validationState: "resource_materialization_blocked",
        nextDecisionNeeded: "rematerialize_current_child_epoch",
        blockerSummary:
          "Runtime blocked a child node because its boundary epoch or parent resource hashes no longer match the current frontier.",
        eli5Progress:
          "OpenClaw stopped before calling the worker because this child node belongs to an old materialization epoch.",
        schedulerPhase: "frontier_epoch_eligibility",
        schedulerToolId: "frontier.block_stale_child",
        schedulerToolInvocationRefs: [...evaluateTool.refs, ...blockTool.refs],
      });
      return { status: "needs_review", reasonCodes, missionLedger: input.missionLedger };
    }
    const executor = findExecutor(this.options.executors, node);
    if (!executor) {
      return { status: "needs_review", reasonCodes: ["scheduler_node_executor_not_found"] };
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
    const manifestResourceReadiness = nodeResourceReadinessFromManifestMetadata(node);
    const nodeReadinessState =
      nodeResourceReadiness?.state ??
      (!manifestResourceReadiness && nodeRequiresExecutionPacket(node)
        ? buildMissingNodeExecutionPacketReadinessState({
            nodeId: node.nodeId,
            runtimeJobId:
              typeof nodeMetadata.runtimeJobId === "string" ? nodeMetadata.runtimeJobId : null,
            graphId: input.graphId,
            workflowId: snapshot.graph.workflowId,
          })
        : null);
    const currentBoundaryEpoch =
      typeof graphMetadata.currentBoundaryEpoch === "string"
        ? graphMetadata.currentBoundaryEpoch
        : typeof graphMetadata.boundaryEpoch === "string"
          ? graphMetadata.boundaryEpoch
          : null;
    const readinessProjectionComparison = nodeReadinessState
      ? compareReadinessProjectionToCurrent({
          nodeId: node.nodeId,
          persistedMetadata: nodeMetadata,
          currentState: nodeReadinessState,
          nodeExecutionPacket,
          resourcePacket: nodeResourcePacket,
          boundaryEpoch:
            typeof nodeMetadata.boundaryEpoch === "string"
              ? nodeMetadata.boundaryEpoch
              : currentBoundaryEpoch,
          currentBoundaryEpoch,
        })
      : null;
    const readinessProjectionPatch: JsonValue | null =
      readinessProjectionComparison && nodeResourceReadiness?.valid === true
        ? {
            nodeReadinessStateRef: readinessProjectionComparison.current.stateRef,
            nodeReadinessStatus: readinessProjectionComparison.current.readinessStatus,
            nodeExecutionContractRef:
              readinessProjectionComparison.current.nodeExecutionContractRef,
            nodeExecutionContractHash:
              readinessProjectionComparison.current.nodeExecutionContractHash,
            nodeExecutionPacketRef:
              readinessProjectionComparison.current.nodeExecutionPacketRef,
            nodeExecutionPacketHash:
              readinessProjectionComparison.current.nodeExecutionPacketHash,
            resourcePacketRef: readinessProjectionComparison.current.resourcePacketRef,
            resourcePacketHash: readinessProjectionComparison.current.resourcePacketHash,
            domainResourcePacketHash: readinessProjectionComparison.current.resourcePacketHash,
            boundaryEpoch: readinessProjectionComparison.current.boundaryEpoch,
            currentBoundaryEpoch: readinessProjectionComparison.currentBoundaryEpoch,
            readinessProjectionStatus: "current",
            readinessProjectionDriftReasonCodes: [],
            readinessProjectionMissingFields: [],
            nodeReadinessStale: false,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          }
        : readinessProjectionComparison
          ? {
              readinessProjectionStatus: readinessProjectionComparison.status,
              readinessProjectionDriftReasonCodes:
                readinessProjectionComparison.driftReasonCodes.slice(0, 40),
              readinessProjectionMissingFields:
                readinessProjectionComparison.missingFields.slice(0, 40),
              nodeReadinessStale: readinessProjectionComparison.stale,
              currentBoundaryEpoch:
                readinessProjectionComparison.currentBoundaryEpoch ??
                readinessProjectionComparison.boundaryEpoch,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            }
          : null;
    if (readinessProjectionPatch) {
      await this.options.graphs.updateNodeStatus({
        nodeId: node.nodeId,
        nodeStatus: node.nodeStatus,
        metadataPatch: readinessProjectionPatch,
      });
    }
    const nodeExecutionPacketRef =
      nodeExecutionPacket?.packetRef ??
      (typeof nodeMetadata.nodeExecutionPacketRef === "string"
        ? nodeMetadata.nodeExecutionPacketRef
        : null);
    const nodeExecutionContractRef =
      nodeExecutionPacket?.nodeExecutionContractRef ??
      (typeof nodeMetadata.nodeExecutionContractRef === "string"
        ? nodeMetadata.nodeExecutionContractRef
        : null);
    const resourcePacketRef =
      nodeExecutionPacket?.resourcePacketRef ??
      (typeof nodeMetadata.resourcePacketRef === "string" ? nodeMetadata.resourcePacketRef : null);
    const resourcePacketKind =
      nodeExecutionPacket?.resourcePacketKind ??
      (typeof nodeMetadata.resourcePacketKind === "string"
        ? nodeMetadata.resourcePacketKind
        : null);
    const executionIntent =
      nodeExecutionPacket?.executionIntent ??
      (typeof nodeMetadata.executionIntent === "string" ? nodeMetadata.executionIntent : null);
    const evidenceMode =
      nodeExecutionPacket?.evidenceMode ?? jsonStringArray(nodeMetadata.evidenceMode).slice(0, 12);
    const nodeExecutorKey =
      nodeExecutionPacket?.executorKey ??
      (typeof nodeMetadata.executorKey === "string" ? nodeMetadata.executorKey : null);
    const nodeWorkerRef =
      nodeExecutionPacket?.workerRef ??
      (typeof nodeMetadata.workerRef === "string" ? nodeMetadata.workerRef : null);
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
      validationState: node.nodeKind === "validation" ? "started" : null,
      nodeExecutionPacketRef,
      nodeExecutionPacketStatus:
        typeof nodeExecutionReadback.nodeExecutionPacketStatus === "string"
          ? nodeExecutionReadback.nodeExecutionPacketStatus
          : (nodeResourceReadiness?.status ?? null),
      resourcePacketKind,
      resourcePacketRef,
      executionIntent,
      evidenceMode,
      executorKey: nodeExecutorKey,
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
        executionIntent,
        evidenceMode,
        executorKey: nodeExecutorKey,
        workerRef: nodeWorkerRef,
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
        executionIntent,
        evidenceMode,
        executorKey: nodeExecutorKey,
        workerRef: nodeWorkerRef,
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
      resourceHandoffRefs: node.inputHandoffRefs,
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
    const effectiveNodeStatus: TeamGraphNode["nodeStatus"] = executionStatusToNodeStatus(result.status);
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
        lifecycleState:
          effectiveNodeStatus === "succeeded" ? "completed" : effectiveNodeStatus,
        nodeLifecycleState:
          effectiveNodeStatus === "succeeded" ? "completed" : effectiveNodeStatus,
        nodeReadinessStateRef: null,
        nodeReadinessStatus: null,
        nodeReadinessPhase: null,
        nodeReadinessRepairAction: null,
        nodeReadinessNextAllowedTransitions: [],
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
