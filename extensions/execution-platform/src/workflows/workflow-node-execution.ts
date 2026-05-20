import type { JsonValue } from "../runtime-job-repository.ts";
import type { WorkflowEvidenceClass } from "./workflow-evidence-profile.ts";
import type {
  CommitmentEvidenceClaim,
  RuntimeWorkGraphNodeExecutionResult,
} from "./workflow-node-execution-contracts.ts";
import type { WorkflowRoleClass } from "./workflow-orchestration-policy.ts";

export type WorkflowNodeExecutionStatus =
  | "succeeded"
  | "needs_review"
  | "failed"
  | "blocked"
  | "waiting_for_human"
  | "canceled";

export type GenericWorkflowEvidenceClaim = CommitmentEvidenceClaim & {
  evidenceClaimId: string;
  producedByNodeId: string;
  producedByCapabilityId: string | null;
  producedByExecutorKey: string | null;
  validationRefs: string[];
  changedFileRefs: string[];
  artifactRefs: string[];
  sufficiencyJudgmentRef: string | null;
  rawToolLogStored: boolean;
  rawDbRowsStored: boolean;
  authorityGranted: boolean;
  workQueueLifecycleMutated: boolean;
};

export type GenericWorkflowNodeExecutionResult = {
  artifactKind: "generic_workflow_node_execution_result";
  schemaVersion: "execution-platform.generic-workflow-node-result.v1";
  nodeExecutionId: string;
  runtimeJobId: string | null;
  workflowId: string;
  graphId: string;
  nodeId: string;
  nodeKind: string;
  roleClass: WorkflowRoleClass;
  roleId: string | null;
  capabilityId: string | null;
  executorKey: string | null;
  workerRef: string | null;
  status: WorkflowNodeExecutionStatus;
  modelRunRefs: string[];
  runtimeToolInvocationRefs: string[];
  scriptJobRefs: string[];
  dbOperationRefs: string[];
  outputArtifactRefs: string[];
  producedOutputRefs: string[];
  evidenceClaims: GenericWorkflowEvidenceClaim[];
  evidenceClassesProduced: WorkflowEvidenceClass[];
  contextHandoffRefs: string[];
  validationRefs: string[];
  validationSummaryRefs: string[];
  changedFileRefs: string[];
  humanDecisionRefs: string[];
  closeoutRefs: string[];
  limitations: string[];
  reasonCodes: string[];
  nextActionRecommendation: string | null;
  repairOrEscalationRecommendation: string | null;
  ownerSummary: string | null;
  eli5Summary: string | null;
  metadata: JsonValue | null;
  rawPromptStored: boolean;
  rawResponseStored: boolean;
  rawProviderLogStored: boolean;
  rawToolLogStored: boolean;
  rawDbRowsStored: boolean;
  authorityGranted: boolean;
  controlsApplied: boolean;
  workQueueLifecycleMutated: boolean;
  runtimeLifecycleMutated: boolean;
};

export type GenericWorkflowNodeExecutionValidation = {
  artifactKind: "generic_workflow_node_execution_validation";
  valid: boolean;
  workflowId: string | null;
  nodeId: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

const EVIDENCE_CLASS_BY_KIND: Record<
  CommitmentEvidenceClaim["evidenceKind"],
  WorkflowEvidenceClass | null
> = {
  source_change: "source_change",
  test_validation: "validation",
  review: "review",
  docs: "review",
  readback: "work_queue_readback",
  artifact: null,
  human_decision: "human_decision",
  closeout: "closeout",
  research_brief: "research_brief",
  planning_capsule: "planning_capsule",
  action_graph_proposal: "action_graph_proposal",
  compile_readiness: "compile_readiness",
  other: null,
};

function unique(values: readonly string[], max = 40): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].slice(0, max);
}

function evidenceClaimId(input: {
  graphId: string;
  nodeId: string;
  commitmentId: string;
  evidenceRef: string;
  index: number;
}): string {
  return ["evidence-claim", input.graphId, input.nodeId, input.commitmentId, input.index + 1]
    .join(":")
    .replace(/[^a-zA-Z0-9_.:-]+/g, "-")
    .slice(0, 180);
}

export function genericWorkflowNodeResultFromRuntime(input: {
  nodeExecutionId?: string | null;
  runtimeJobId?: string | null;
  workflowId: string;
  graphId: string;
  nodeId: string;
  nodeKind: string;
  roleClass: WorkflowRoleClass;
  roleId?: string | null;
  capabilityId?: string | null;
  executorKey?: string | null;
  workerRef?: string | null;
  result: RuntimeWorkGraphNodeExecutionResult;
  modelRunRefs?: string[];
  runtimeToolInvocationRefs?: string[];
  scriptJobRefs?: string[];
  dbOperationRefs?: string[];
  contextHandoffRefs?: string[];
  validationRefs?: string[];
  validationSummaryRefs?: string[];
  changedFileRefs?: string[];
  humanDecisionRefs?: string[];
  closeoutRefs?: string[];
  limitations?: string[];
  nextActionRecommendation?: string | null;
  repairOrEscalationRecommendation?: string | null;
  ownerSummary?: string | null;
  eli5Summary?: string | null;
}): GenericWorkflowNodeExecutionResult {
  const resultFlags = input.result as unknown as Record<string, unknown>;
  const validationRefs = unique([
    ...(input.validationRefs ?? []),
    ...(input.result.validationRefs ?? []),
  ]);
  const changedFileRefs = unique([
    ...(input.changedFileRefs ?? []),
    ...(input.result.changedFileRefs ?? []),
  ]);
  const outputArtifactRefs = unique(input.result.outputArtifactRefs);
  const producedOutputRefs = unique([
    ...outputArtifactRefs,
    ...(input.result.producedOutputRefs ?? []),
  ]);
  const artifactRefs = unique([...outputArtifactRefs, ...(input.result.artifactRefs ?? [])]);
  const evidenceClaims = (input.result.evidenceClaims ?? []).map((claim, index) => ({
    ...claim,
    evidenceClaimId: evidenceClaimId({
      graphId: input.graphId,
      nodeId: input.nodeId,
      commitmentId: claim.commitmentId,
      evidenceRef: claim.evidenceRef,
      index,
    }),
    producedByNodeId: input.nodeId,
    producedByCapabilityId: input.capabilityId ?? null,
    producedByExecutorKey: input.executorKey ?? null,
    validationRefs,
    changedFileRefs,
    artifactRefs,
    sufficiencyJudgmentRef: input.result.sufficiencyJudgmentRef ?? null,
    rawPromptStored: claim.rawPromptStored,
    rawResponseStored: claim.rawResponseStored,
    rawProviderLogStored: claim.rawProviderLogStored,
    rawToolLogStored: (claim as { rawToolLogStored?: boolean }).rawToolLogStored === true,
    rawDbRowsStored: (claim as { rawDbRowsStored?: boolean }).rawDbRowsStored === true,
    authorityGranted: (claim as { authorityGranted?: boolean }).authorityGranted === true,
    workQueueLifecycleMutated:
      (claim as { workQueueLifecycleMutated?: boolean }).workQueueLifecycleMutated === true,
  }));
  return {
    artifactKind: "generic_workflow_node_execution_result",
    schemaVersion: "execution-platform.generic-workflow-node-result.v1",
    nodeExecutionId:
      input.nodeExecutionId ??
      `node-execution:${input.graphId}:${input.nodeId}`.replace(/[^a-zA-Z0-9_.:-]+/g, "-"),
    runtimeJobId: input.runtimeJobId ?? null,
    workflowId: input.workflowId,
    graphId: input.graphId,
    nodeId: input.nodeId,
    nodeKind: input.nodeKind,
    roleClass: input.roleClass,
    roleId: input.roleId ?? null,
    capabilityId: input.capabilityId ?? null,
    executorKey: input.executorKey ?? null,
    workerRef: input.workerRef ?? null,
    status: input.result.status,
    modelRunRefs: unique([...(input.modelRunRefs ?? []), ...(input.result.modelRunRefs ?? [])]),
    runtimeToolInvocationRefs: unique([
      ...(input.runtimeToolInvocationRefs ?? []),
      ...(input.result.runtimeToolInvocationRefs ?? []),
    ]),
    scriptJobRefs: unique([...(input.scriptJobRefs ?? []), ...(input.result.scriptJobRefs ?? [])]),
    dbOperationRefs: unique([
      ...(input.dbOperationRefs ?? []),
      ...(input.result.dbOperationRefs ?? []),
    ]),
    outputArtifactRefs,
    producedOutputRefs,
    evidenceClaims,
    evidenceClassesProduced: unique(
      evidenceClaims
        .map((claim) => EVIDENCE_CLASS_BY_KIND[claim.evidenceKind])
        .filter((value): value is WorkflowEvidenceClass => Boolean(value)),
    ) as WorkflowEvidenceClass[],
    contextHandoffRefs: unique(input.contextHandoffRefs ?? []),
    validationRefs,
    validationSummaryRefs: unique([
      ...(input.validationSummaryRefs ?? []),
      ...(input.result.validationSummaryRefs ?? []),
    ]),
    changedFileRefs,
    humanDecisionRefs: unique([
      ...(input.humanDecisionRefs ?? []),
      ...(input.result.humanDecisionRefs ?? []),
    ]),
    closeoutRefs: unique([...(input.closeoutRefs ?? []), ...(input.result.closeoutRefs ?? [])]),
    limitations: unique([...(input.limitations ?? []), ...(input.result.limitations ?? [])], 12),
    reasonCodes: unique(input.result.reasonCodes, 40),
    nextActionRecommendation: input.nextActionRecommendation ?? null,
    repairOrEscalationRecommendation: input.repairOrEscalationRecommendation ?? null,
    ownerSummary: input.ownerSummary ?? input.result.ownerSummary ?? null,
    eli5Summary: input.eli5Summary ?? input.result.eli5Summary ?? null,
    metadata: input.result.metadata ?? null,
    rawPromptStored: input.result.rawPromptStored,
    rawResponseStored: input.result.rawResponseStored,
    rawProviderLogStored: input.result.rawProviderLogStored,
    rawToolLogStored: resultFlags.rawToolLogStored === true,
    rawDbRowsStored: resultFlags.rawDbRowsStored === true,
    authorityGranted: resultFlags.authorityGranted === true,
    controlsApplied: resultFlags.controlsApplied === true,
    workQueueLifecycleMutated: input.result.workQueueLifecycleMutated,
    runtimeLifecycleMutated: resultFlags.runtimeLifecycleMutated === true,
  };
}

export function validateGenericWorkflowNodeResult(input: {
  result: GenericWorkflowNodeExecutionResult;
  knownCommitmentIds?: string[];
  evidenceClaimsRequired?: boolean;
}): GenericWorkflowNodeExecutionValidation {
  const reasonCodes: string[] = [];
  const { result } = input;
  if (!result.workflowId.trim()) {
    reasonCodes.push("generic_node_result_workflow_id_missing");
  }
  if (!result.nodeId.trim()) {
    reasonCodes.push("generic_node_result_node_id_missing");
  }
  if (
    result.rawPromptStored ||
    result.rawResponseStored ||
    result.rawProviderLogStored ||
    result.rawToolLogStored ||
    result.rawDbRowsStored
  ) {
    reasonCodes.push("generic_node_result_raw_storage_rejected");
  }
  if (
    result.workQueueLifecycleMutated ||
    result.runtimeLifecycleMutated ||
    result.authorityGranted ||
    result.controlsApplied
  ) {
    reasonCodes.push("generic_node_result_authority_or_lifecycle_mutation_rejected");
  }
  if (
    input.evidenceClaimsRequired &&
    result.status === "succeeded" &&
    result.evidenceClaims.length === 0
  ) {
    reasonCodes.push("generic_node_result_evidence_claims_required");
  }
  if (result.status === "succeeded" && result.outputArtifactRefs.length === 0) {
    reasonCodes.push("generic_node_result_success_requires_output_ref");
  }
  const validEvidenceRefs = new Set([
    ...result.outputArtifactRefs,
    ...result.producedOutputRefs,
    ...result.validationRefs,
    ...result.changedFileRefs,
    ...result.closeoutRefs,
    ...result.humanDecisionRefs,
    ...result.runtimeToolInvocationRefs,
    ...result.modelRunRefs,
  ]);
  const knownCommitments = new Set(input.knownCommitmentIds ?? []);
  for (const claim of result.evidenceClaims) {
    if (!claim.commitmentId.trim() || !claim.evidenceRef.trim() || !claim.claimSummary.trim()) {
      reasonCodes.push("generic_node_result_evidence_claim_malformed");
    }
    if (!claim.evidenceClaimId.trim() || claim.producedByNodeId !== result.nodeId) {
      reasonCodes.push("generic_node_result_evidence_claim_runtime_identity_invalid");
    }
    if (!validEvidenceRefs.has(claim.evidenceRef)) {
      reasonCodes.push(`generic_node_result_evidence_claim_ref_missing:${claim.evidenceRef}`);
    }
    if (knownCommitments.size > 0 && !knownCommitments.has(claim.commitmentId)) {
      reasonCodes.push(`generic_node_result_unknown_commitment:${claim.commitmentId}`);
    }
    if (
      claim.rawPromptStored ||
      claim.rawResponseStored ||
      claim.rawProviderLogStored ||
      claim.rawToolLogStored ||
      claim.rawDbRowsStored
    ) {
      reasonCodes.push("generic_node_result_evidence_claim_raw_storage_rejected");
    }
    if (claim.authorityGranted || claim.workQueueLifecycleMutated) {
      reasonCodes.push("generic_node_result_evidence_claim_authority_or_lifecycle_rejected");
    }
  }
  return {
    artifactKind: "generic_workflow_node_execution_validation",
    valid: reasonCodes.length === 0,
    workflowId: result.workflowId || null,
    nodeId: result.nodeId || null,
    reasonCodes: unique(reasonCodes, 30),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function workflowEvidenceClassRefsFromNodeResults(
  results: readonly GenericWorkflowNodeExecutionResult[],
): Partial<Record<WorkflowEvidenceClass, string[]>> {
  const refs: Partial<Record<WorkflowEvidenceClass, string[]>> = {};
  const add = (evidenceClass: WorkflowEvidenceClass, values: readonly string[]) => {
    const bounded = unique([...(refs[evidenceClass] ?? []), ...values], 12);
    if (bounded.length > 0) {
      refs[evidenceClass] = bounded;
    }
  };
  for (const result of results) {
    for (const claim of result.evidenceClaims) {
      const evidenceClass = EVIDENCE_CLASS_BY_KIND[claim.evidenceKind];
      if (evidenceClass) {
        add(evidenceClass, [claim.evidenceRef]);
      }
    }
    if (result.runtimeToolInvocationRefs.length > 0) {
      add("worker_tool_trace", result.runtimeToolInvocationRefs);
    }
    if (result.modelRunRefs.length > 0) {
      add("model_call_trace", result.modelRunRefs);
    }
    if (result.validationRefs.length > 0) {
      add("validation", result.validationRefs);
    }
    if (result.changedFileRefs.length > 0) {
      add("source_change", result.changedFileRefs);
    }
    if (result.closeoutRefs.length > 0) {
      add("closeout", result.closeoutRefs);
    }
    if (result.humanDecisionRefs.length > 0) {
      add("human_decision", result.humanDecisionRefs);
    }
  }
  return refs;
}
