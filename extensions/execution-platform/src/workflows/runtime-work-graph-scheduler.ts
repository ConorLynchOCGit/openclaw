import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import {
  costAwareDecisionReadback,
  normalizeCostAwareCapabilityUtilityDecision,
  utilityDecisionFromNodeMetadata,
  validateCostAwareCapabilityUtilityDecision,
} from "./cost-aware-capability-policy.ts";
import {
  missionLedgerBlocksExecution,
  missionLedgerHasOpenBlockingCommitments,
  missionLedgerRequiresReviewBeforeExecution,
  openBlockingMissionCommitments,
  summarizeMissionContractLedger,
  type MissionContractLedger,
  type MissionContractLedgerSummary,
} from "./mission-contract-ledger.ts";
import { validateNonCodexTaskDecompositionDecision } from "./non-codex-task-decomposition-policy.ts";
import {
  compileOrchestratorGraphDecision,
  validateOrchestratorGraphDecision,
  type OrchestratorGraphDecision,
  type OrchestratorGraphRejectedNodeDiagnostic,
  type OrchestratorGraphNodeSpec,
} from "./orchestrator-graph-decision.ts";
import {
  buildRuntimeNodeCapabilityManifest,
  runtimeNodeCapabilityManifestForModel,
  type RuntimeNodeCapabilityManifest,
} from "./runtime-node-capability-registry.ts";
import type {
  RuntimeWorkGraphRepository,
  RuntimeWorkGraphSnapshot,
} from "./runtime-work-graph-repository.ts";
import type { RuntimeWorkGraphSchedulerSnapshotSummary } from "./runtime-work-graph-scheduler-contracts.ts";
import { graphRef, type TeamGraphNode } from "./runtime-work-graph.ts";
import {
  invokeSchedulerRuntimeTool,
  type SchedulerRuntimeToolId,
} from "./scheduler-runtime-tools.ts";

export type { RuntimeWorkGraphSchedulerSnapshotSummary } from "./runtime-work-graph-scheduler-contracts.ts";

export type RuntimeWorkGraphSchedulerDecisionInput = {
  graphId: string;
  iteration: number;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  missionLedgerSummary?: MissionContractLedgerSummary | null;
  capabilityRegistrySummary?: JsonValue | null;
  repairAttempt?: number;
  rejectedDecisionReasonCodes?: string[];
  rejectedDecisionDiagnostics?: OrchestratorGraphRejectedNodeDiagnostic[];
  rejectedDecisionRef?: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
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

export type RuntimeWorkGraphNodeExecutionResult = {
  status: "succeeded" | "needs_review" | "failed" | "waiting_for_human";
  outputArtifactRefs: string[];
  reasonCodes: string[];
  evidenceClaims?: CommitmentEvidenceClaim[];
  metadata?: JsonValue;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

export type CommitmentEvidenceClaim = {
  commitmentId: string;
  evidenceRef: string;
  evidenceKind:
    | "source_change"
    | "test_validation"
    | "review"
    | "docs"
    | "readback"
    | "artifact"
    | "human_decision"
    | "closeout"
    | "other";
  claimSummary: string;
  limitations: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type RuntimeWorkGraphNodeExecutor = {
  execute(input: RuntimeWorkGraphNodeExecutionInput): Promise<RuntimeWorkGraphNodeExecutionResult>;
};

type RuntimeWorkGraphLoopGuard = {
  seenEvidenceRefs: Set<string>;
  roleIdsSeen: Set<string>;
  repeatedNoProgressBySignature: Map<string, number>;
};

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
    capabilityCostClass?: string | null;
    capabilityUtilityRationale?: string | null;
    capabilityCostRationale?: string | null;
    whyCheaperOptionsWereInsufficient?: string | null;
    consideredCapabilityIds?: string[];
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
    commitmentIdsAdvanced?: string[];
    remainingOpenCommitmentIds?: string[];
    nextDecisionNeeded?: string | null;
    blockerSummary?: string | null;
    eli5Progress?: string | null;
    schedulerPhase?: string | null;
    schedulerToolId?: string | null;
    schedulerToolInvocationRefs?: string[];
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
  requireMissionLedgerForExecutionWorkflow?: boolean;
  requireEvidenceClaimsForMissionLedger?: boolean;
  roleCoverageProfile?: RuntimeWorkGraphRoleCoverageProfile | null;
  maxIterations?: number;
  maxDecisionRepairAttempts?: number;
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
      outputArtifactRefs: node.outputArtifactRefs.slice(0, 8),
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

function jsonRecord(value: JsonValue): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

function schedulerToolPhase(toolId: SchedulerRuntimeToolId, metadata?: JsonValue): string {
  const metadataRecord = jsonRecord(metadata ?? null);
  if (typeof metadataRecord.schedulerPhase === "string" && metadataRecord.schedulerPhase) {
    return metadataRecord.schedulerPhase;
  }
  if (
    toolId === "scheduler.decompose_mission" ||
    toolId === "scheduler.create_graph_node" ||
    toolId === "scheduler.create_graph_edge"
  ) {
    return "planning_in_progress";
  }
  if (toolId === "scheduler.accept_decomposition_graph") {
    return "decomposition_accepted";
  }
  if (toolId === "scheduler.create_closeout_request") {
    return "finalization_pending";
  }
  return "execution_in_progress";
}

function jsonStringArray(value: JsonValue | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
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

function isBroadImplementationNode(node: TeamGraphNode | OrchestratorGraphNodeSpec): boolean {
  return node.nodeKind === "implementation" && nodeCapabilityId(node) === "implementation_complex";
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
  if (!input.node.evidenceExpectation) {
    reasonCodes.push(`node_evidence_expectation_missing:${input.node.nodeId || "unknown"}`);
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
      storageFlags.rawProviderLogStored !== false
    ) {
      reasonCodes.push("evidence_claim_raw_storage_flag_invalid");
    }
  }
  return reasonCodes;
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
    const broadFirst =
      input.decision.decisionKind === "add_nodes" && newNodes.some(isBroadImplementationNode);
    if (broadFirst) {
      reasonCodes.push("complex_mission_requires_decomposition_before_broad_implementation");
    }
    if (input.decision.decisionKind === "run_node" && input.decision.runNodeId) {
      reasonCodes.push("complex_mission_requires_decomposition_before_run_node");
    }
    if (newNodes.length === 1) {
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
  if (node.assignedRole === "planning_orchestrator" || node.nodeKind === "orchestrator_plan") {
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
  const evidenceAdvancesProgress =
    !(missionStillOpen && nodeIsReportOnly) && newEvidenceRefs.length > 0;
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
  private readonly capabilityManifest: RuntimeNodeCapabilityManifest;

  constructor(private readonly options: RuntimeWorkGraphSchedulerOptions) {
    this.maxIterations = options.maxIterations ?? 24;
    this.maxDecisionRepairAttempts = options.maxDecisionRepairAttempts ?? 2;
    this.capabilityManifest = options.capabilityManifest ?? buildRuntimeNodeCapabilityManifest();
  }

  async run(graphId: string): Promise<RuntimeWorkGraphSchedulerResult> {
    const executedNodeIds: string[] = [];
    const addedNodeIds: string[] = [];
    const decisionRefs: string[] = [];
    const reasonCodes: string[] = [];
    let missionLedger = this.options.missionLedger ?? null;
    if (this.options.requireSchedulerToolKernel === true && !this.options.runtimeToolKernel) {
      return this.result({
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
      const missionGateStatus = await this.evaluateMissionGateBeforeWork({
        graphId,
        iteration,
        missionLedger,
      });
      if (missionGateStatus) {
        return this.result({
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
        return this.result({
          status: "failed",
          graphId,
          iterations: iteration - 1,
          executedNodeIds,
          addedNodeIds,
          decisionRefs,
          reasonCodes: ["runtime_work_graph_not_found"],
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
        return this.result({
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
        return this.result({
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
    return this.result({
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
    let rejectedDecisionReasonCodes: string[] = [];
    let rejectedDecisionDiagnostics: OrchestratorGraphRejectedNodeDiagnostic[] = [];
    let rejectedDecisionRef: string | null = null;
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
        capabilityRegistrySummary:
          this.options.capabilityRegistrySummary ??
          runtimeNodeCapabilityManifestForModel({
            executableExecutorKeys: Object.keys(this.options.executors),
          }),
        repairAttempt,
        rejectedDecisionReasonCodes,
        rejectedDecisionDiagnostics,
        rejectedDecisionRef,
        rawPromptStored: false,
        rawResponseStored: false,
      });
      const compiled = compileOrchestratorGraphDecision(rawDecision, {
        executableExecutorKeys: Object.keys(this.options.executors),
        requireNodeCommitmentContracts: missionIsComplex(input.missionLedger),
      });
      const decision = compiled.decision;
      if (!decision) {
        const rejectedTool = await this.recordSchedulerTool({
          graphId: input.graphId,
          iteration: input.iteration,
          toolId: "scheduler.reject_decomposition_graph",
          idempotencyKey: `iteration:${input.iteration}:repair:${repairAttempt}:decision-invalid`,
          inputRef: rejectedDecisionRef,
          inputSummary:
            "Orchestrator decision could not be compiled into a canonical scheduler decision.",
          metadata: {
            repairAttempt,
            reasonCodes: ["orchestrator_decision_invalid_json"],
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
      const utilityPolicyReasonCodes = validation.valid
        ? this.costAwarePolicyReasonCodes({
            decision,
            snapshotSummary: input.snapshotSummary,
            missionLedger: input.missionLedger,
          })
        : [];
      const valid =
        validation.valid && policyReasonCodes.length === 0 && utilityPolicyReasonCodes.length === 0;
      const decisionRef = graphRef("orchestrator-decision", decision.decisionId);
      if (decision.decisionId) {
        decisionRefs.push(decisionRef);
        rejectedDecisionRef = decisionRef;
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
      ];
      rejectedDecisionDiagnostics = compiled.rejectedNodeDiagnostics;
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
      const validation = validateCostAwareCapabilityUtilityDecision({
        decision: decisionLevelUtility,
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

  private async recordSchedulerTool(input: {
    graphId: string;
    iteration: number;
    toolId: SchedulerRuntimeToolId;
    idempotencyKey: string;
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
      const invocation = await invokeSchedulerRuntimeTool({
        kernel: this.options.runtimeToolKernel,
        toolId: input.toolId,
        graphId: input.graphId,
        nodeId: input.nodeId,
        roleRef: input.roleRef,
        modelRef: input.modelRef,
        idempotencyKey: input.idempotencyKey,
        inputRef: input.inputRef,
        inputHash: input.inputHash,
        inputSummary: input.inputSummary,
        metadata: input.metadata,
      });
      const schedulerPhase = schedulerToolPhase(input.toolId, input.metadata);
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
        ],
        currentObjective: input.inputSummary,
        activeNodeKind: null,
        currentPhase: schedulerPhase,
        validationState: null,
        evidenceProducedRefs: [
          invocation.invocationRef,
          ...(invocation.outputRef ? [invocation.outputRef] : []),
        ],
        nextDecisionNeeded:
          input.toolId === "scheduler.select_next_node" ? "node_result" : "orchestrator_decision",
        eli5Progress: `${input.toolId} recorded a bounded scheduler trace.`,
        schedulerPhase,
        schedulerToolId: input.toolId,
        schedulerToolInvocationRefs: [invocation.invocationRef],
      });
      return {
        refs: [invocation.invocationRef],
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
    const { decision, graphId } = input;
    if (decision.newNodes?.length) {
      const decompositionTool = await this.recordSchedulerTool({
        graphId,
        iteration: input.iteration,
        toolId: "scheduler.decompose_mission",
        idempotencyKey: `iteration:${input.iteration}:decision:${decision.decisionId}:decompose`,
        inputRef: graphRef("orchestrator-decision", decision.decisionId),
        inputSummary:
          decision.rationaleForDecision ||
          `Compile decomposition decision ${decision.decisionId} before node creation.`,
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
      decision.reasonCodes.push(...decompositionTool.reasonCodes);
      await this.addNodes({
        graphId,
        nodes: decision.newNodes,
        edges: decision.newEdges ?? [],
        addedNodeIds: input.addedNodeIds,
        iteration: input.iteration,
      });
      const acceptedTool = await this.recordSchedulerTool({
        graphId,
        iteration: input.iteration,
        toolId: "scheduler.accept_decomposition_graph",
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
      const roleCoverageReasonCodesForCloseout = roleCoverageReasonCodes({
        snapshot: await this.options.graphs.readGraphSnapshot(graphId),
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
      const closeoutNodeId =
        decision.runNodeId ??
        decision.targetNodeId ??
        decision.newNodes?.find((node) => node.nodeKind === "closeout")?.nodeId ??
        null;
      if (closeoutNodeId) {
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

  private async addNodes(input: {
    graphId: string;
    nodes: OrchestratorGraphNodeSpec[];
    edges: NonNullable<OrchestratorGraphDecision["newEdges"]>;
    addedNodeIds: string[];
    iteration: number;
  }): Promise<void> {
    const snapshot = await this.options.graphs.readGraphSnapshot(input.graphId);
    const snapshotSummary = snapshot
      ? summarizeSnapshot(snapshot)
      : ({
          workflowId: "unknown",
          graphStatus: "running",
          nodeSummaries: [],
          edgeCount: 0,
          humanTaskCount: 0,
          latestCheckpointKinds: [],
        } satisfies RuntimeWorkGraphSchedulerSnapshotSummary);
    for (const node of input.nodes) {
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
      await this.options.graphs.addNode({
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
          ...(node.metadata && typeof node.metadata === "object" && !Array.isArray(node.metadata)
            ? node.metadata
            : {}),
          costAwareUtilityDecision: utilityDecision,
          costAwareReadback,
          costAwarePolicyReasonCodes: utilityValidation.reasonCodes,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
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
          commitmentIdsAdvanced: node.commitmentIdsAdvanced ?? [],
          schedulerPhase: "planning_in_progress",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      input.addedNodeIds.push(node.nodeId);
      const snapshot = await this.options.graphs.readGraphSnapshot(input.graphId);
      const addedNode = snapshot?.nodes.find((candidate) => candidate.nodeId === node.nodeId);
      if (addedNode) {
        await this.options.onNodeAdded?.({
          graphId: input.graphId,
          node: addedNode,
          reasonCodes: ["scheduler_node_added"],
        });
      }
    }
    for (const edge of input.edges) {
      await this.recordSchedulerTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "scheduler.create_graph_edge",
        idempotencyKey: `iteration:${input.iteration}:edge:${edge.edgeId ?? `${edge.fromNodeId ?? "start"}:${edge.toNodeId ?? "end"}`}:create`,
        inputRef: edge.edgeId ? graphRef("edge", edge.edgeId) : null,
        inputSummary: `Create ${edge.edgeKind} edge from ${edge.fromNodeId ?? "graph"} to ${edge.toNodeId ?? "graph"}.`,
        metadata: {
          edgeId: edge.edgeId ?? null,
          fromNodeId: edge.fromNodeId ?? null,
          toNodeId: edge.toNodeId ?? null,
          edgeKind: edge.edgeKind,
          schedulerPhase: "planning_in_progress",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      await this.options.graphs.addEdge({
        graphId: input.graphId,
        edgeId: edge.edgeId,
        fromNodeId: edge.fromNodeId ?? null,
        toNodeId: edge.toNodeId ?? null,
        edgeKind: edge.edgeKind,
        reasonCodes: edge.reasonCodes ?? [],
        artifactRefs: edge.artifactRefs ?? [],
        metadata: edge.metadata,
      });
    }
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
    const executor = findExecutor(this.options.executors, node);
    if (!executor) {
      return { status: "needs_review", reasonCodes: ["scheduler_node_executor_not_found"] };
    }
    const nodeMetadata = jsonRecord(node.metadata);
    const costAwareReadback = jsonRecord(nodeMetadata.costAwareReadback);
    const nodeCommitmentIds = jsonStringArray(nodeMetadata.commitmentIdsAdvanced);
    const nodeTargetRefs = jsonStringArray(nodeMetadata.targetRefs);
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
      capabilityCostClass:
        typeof costAwareReadback.costClass === "string" ? costAwareReadback.costClass : null,
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
    });
    let result: RuntimeWorkGraphNodeExecutionResult;
    let workerToolInvocationRef: string | null = null;
    if (this.options.runtimeToolKernel) {
      let nodeResult: RuntimeWorkGraphNodeExecutionResult | null = null;
      const traced = await this.options.runtimeToolKernel.invokeWithExecutor(
        {
          toolId: this.options.runtimeToolNodeToolId ?? "worker.invoke",
          runtimeJobId: node.runtimeJobId,
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
          metadata: {
            nodeKind: node.nodeKind,
            commitmentIdsAdvanced: nodeCommitmentIds,
            targetRefs: nodeTargetRefs,
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
                nodeResult.status === "waiting_for_human" ? "needs_review" : nodeResult.status,
              outputRef: nodeResult.outputArtifactRefs[0] ?? graphRef("node", node.nodeId),
              outputHash: `runtime-tool-output:${node.nodeId}:${nodeResult.status}`,
              outputSummary: `${node.assignedRole} finished ${node.nodeKind} with ${nodeResult.outputArtifactRefs.length} evidence ref(s).`,
              reasonCodes: [
                ...nodeResult.reasonCodes,
                ...(nodeResult.status === "waiting_for_human"
                  ? ["runtime_tool_node_waiting_for_human"]
                  : []),
              ],
              metadata: nodeResult.metadata,
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
      resultStatus: result.status,
    });
    const missionEvidenceReasonCodes = [...claimReasonCodes, ...claimRequirementReasonCodes];
    const evidenceClaimsAcceptedForEvaluation =
      this.options.requireEvidenceClaimsForMissionLedger !== true ||
      missionEvidenceReasonCodes.length === 0;
    if (
      missionLedger &&
      this.options.evaluateMissionLedger &&
      evidenceClaimsAcceptedForEvaluation
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
    const loopGuardDecision = evaluateLoopGuard({
      guard: input.loopGuard,
      node,
      result,
      missionLedgerBefore,
      missionLedgerAfter: missionLedger,
    });
    await this.options.graphs.updateNodeStatus({
      nodeId: node.nodeId,
      nodeStatus: loopGuardDecision.halted
        ? "needs_review"
        : executionStatusToNodeStatus(result.status),
      outputArtifactRefs: result.outputArtifactRefs,
    });
    await this.options.onNodeStatusChanged?.({
      graphId: input.graphId,
      node,
      nodeStatus: loopGuardDecision.halted
        ? "needs_review"
        : executionStatusToNodeStatus(result.status),
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
        result.status === "succeeded"
          ? "completed"
          : result.status === "waiting_for_human"
            ? "waiting_for_human"
            : result.status === "failed"
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
      capabilityCostClass:
        typeof costAwareReadback.costClass === "string" ? costAwareReadback.costClass : null,
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
      evidenceClaimRefs: (result.evidenceClaims ?? [])
        .map((claim) => claim.evidenceRef)
        .slice(0, 20),
      commitmentIdsAdvanced: nodeCommitmentIds,
      remainingOpenCommitmentIds: remainingOpenCommitmentIds(missionLedger),
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
      schedulerToolInvocationRefs: workerToolInvocationRef ? [workerToolInvocationRef] : [],
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

  private result(
    input: Omit<
      RuntimeWorkGraphSchedulerResult,
      "rawPromptStored" | "rawResponseStored" | "rawProviderLogStored" | "workQueueLifecycleMutated"
    >,
  ): RuntimeWorkGraphSchedulerResult {
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
