import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeToolFamily } from "../runtime-tool-call/runtime-tool-types.ts";
import type { WorkflowEvidenceClass } from "./workflow-evidence-profile.ts";

export type WorkflowPhase =
  | "mission_ledger"
  | "commitment_packet_authoring"
  | "context_supply"
  | "work_breakdown"
  | "capability_selection"
  | "graph_compile"
  | "structure_review"
  | "graph_acceptance"
  | "node_execution"
  | "node_result_review"
  | "repair_or_escalation"
  | "validation"
  | "human_decision"
  | "readback"
  | "closeout"
  | "completion_review";

export type WorkflowRoleClass =
  | "orchestrator"
  | "context"
  | "implementation"
  | "research"
  | "planning"
  | "docs"
  | "qa"
  | "architecture"
  | "design"
  | "marketing"
  | "human"
  | "review"
  | "observability"
  | "closeout";

export type WorkflowContextNeed = {
  contextNeedId: string;
  roleClass: WorkflowRoleClass;
  required: boolean;
  sourcePromptAccess: "none" | "bounded_index" | "bounded_excerpt_request";
  repoContextAccess: "none" | "candidate_refs" | "verified_file_refs";
  externalContextAccess: "none" | "research_brief_refs" | "artifact_refs";
  handoffPacketRequired: boolean;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type WorkflowCapabilityPolicy = {
  policyId: string;
  cheapestSufficientWorkerRequired: boolean;
  contextDistributionValueRequired: boolean;
  roleSpecializationRequired: boolean;
  parallelismValueRequired: boolean;
  escalationCostRequired: boolean;
  expensiveBroadWorkerMonopolyBlocked: boolean;
  qualificationEvidenceRequired: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type WorkflowHumanDecisionPolicy = {
  policyId: string;
  allowed: boolean;
  requiredWhenBlocked: boolean;
  boundedInputRefsOnly: true;
  resumeRequired: boolean;
  expirationRequired: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type WorkflowSourcePromptPolicy = {
  policyId: string;
  fullPromptVolatileInputAllowed: boolean;
  sourcePromptIndexRequired: boolean;
  boundedExcerptRequestsAllowed: boolean;
  rawPromptPersistenceAllowed: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type WorkflowEntryNodePolicy = {
  policyId: string;
  requiredBeforeOtherExecution: boolean;
  allowedInitialCapabilityIds: string[];
  allowedInitialRoleClasses: WorkflowRoleClass[];
  blockedUntilStartedReasonCode: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

export type WorkflowOrchestrationPolicy = {
  policyId: string;
  workflowId: string;
  complexWorkflow: boolean;
  requiredPhases: WorkflowPhase[];
  optionalPhases: WorkflowPhase[];
  requiredRoleClasses: WorkflowRoleClass[];
  optionalRoleClasses: WorkflowRoleClass[];
  allowedCapabilityIds: string[];
  contextNeeds: WorkflowContextNeed[];
  sourcePromptPolicy: WorkflowSourcePromptPolicy;
  capabilityPolicy: WorkflowCapabilityPolicy;
  humanDecisionPolicy: WorkflowHumanDecisionPolicy;
  entryNodePolicy: WorkflowEntryNodePolicy | null;
  evidenceProfileId: string;
  evidenceClassesByPhase: Partial<Record<WorkflowPhase, WorkflowEvidenceClass[]>>;
  runtimeToolFamilies: RuntimeToolFamily[];
  closeoutPolicyRef: string;
  finalizationPolicyRef: string;
  readbackPolicyRef: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

export type WorkflowOrchestrationPolicyValidation = {
  artifactKind: "workflow_orchestration_policy_validation";
  policyId: string | null;
  workflowId: string | null;
  valid: boolean;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

const COMPLEX_REQUIRED_PHASES: WorkflowPhase[] = [
  "mission_ledger",
  "commitment_packet_authoring",
  "work_breakdown",
  "capability_selection",
  "graph_compile",
  "structure_review",
  "graph_acceptance",
  "node_execution",
  "node_result_review",
  "closeout",
  "completion_review",
];

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function validateWorkflowOrchestrationPolicy(
  policy: WorkflowOrchestrationPolicy,
): WorkflowOrchestrationPolicyValidation {
  const reasonCodes: string[] = [];
  if (!policy.policyId.trim()) {
    reasonCodes.push("workflow_orchestration_policy_id_missing");
  }
  if (!policy.workflowId.trim()) {
    reasonCodes.push("workflow_orchestration_policy_workflow_id_missing");
  }
  if (policy.rawPromptStored || policy.rawResponseStored || policy.rawLogsStored) {
    reasonCodes.push("workflow_orchestration_policy_raw_storage_rejected");
  }
  if (policy.complexWorkflow) {
    for (const phase of COMPLEX_REQUIRED_PHASES) {
      if (!policy.requiredPhases.includes(phase)) {
        reasonCodes.push(`workflow_orchestration_required_phase_missing:${phase}`);
      }
    }
    if (policy.requiredRoleClasses.length === 0) {
      reasonCodes.push("workflow_orchestration_required_role_classes_missing");
    }
    if (policy.allowedCapabilityIds.length === 0) {
      reasonCodes.push("workflow_orchestration_allowed_capabilities_missing");
    }
    if (!policy.sourcePromptPolicy.sourcePromptIndexRequired) {
      reasonCodes.push("workflow_orchestration_source_prompt_index_required");
    }
    if (!policy.capabilityPolicy.cheapestSufficientWorkerRequired) {
      reasonCodes.push("workflow_orchestration_cheapest_sufficient_policy_required");
    }
    if (!policy.capabilityPolicy.expensiveBroadWorkerMonopolyBlocked) {
      reasonCodes.push("workflow_orchestration_broad_worker_monopoly_must_be_blocked");
    }
  }
  for (const need of policy.contextNeeds) {
    if (need.rawPromptStored || need.rawResponseStored) {
      reasonCodes.push(`workflow_context_need_raw_storage_rejected:${need.contextNeedId}`);
    }
    if (need.required && need.sourcePromptAccess === "none" && need.repoContextAccess === "none") {
      reasonCodes.push(`workflow_context_need_required_but_no_access:${need.contextNeedId}`);
    }
  }
  if (policy.entryNodePolicy) {
    const entryPolicy = policy.entryNodePolicy;
    if (!entryPolicy.policyId.trim()) {
      reasonCodes.push("workflow_entry_node_policy_id_missing");
    }
    if (entryPolicy.rawPromptStored || entryPolicy.rawResponseStored || entryPolicy.rawLogsStored) {
      reasonCodes.push("workflow_entry_node_policy_raw_storage_rejected");
    }
    if (
      entryPolicy.requiredBeforeOtherExecution &&
      entryPolicy.allowedInitialCapabilityIds.length === 0 &&
      entryPolicy.allowedInitialRoleClasses.length === 0
    ) {
      reasonCodes.push("workflow_entry_node_policy_allowed_entry_missing");
    }
    for (const capabilityId of entryPolicy.allowedInitialCapabilityIds) {
      if (!policy.allowedCapabilityIds.includes(capabilityId)) {
        reasonCodes.push(`workflow_entry_node_policy_capability_not_allowed:${capabilityId}`);
      }
    }
  }
  return {
    artifactKind: "workflow_orchestration_policy_validation",
    policyId: policy.policyId || null,
    workflowId: policy.workflowId || null,
    valid: reasonCodes.length === 0,
    reasonCodes: unique(reasonCodes).slice(0, 40),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
}

export function workflowOrchestrationPolicySummary(policy: WorkflowOrchestrationPolicy): JsonValue {
  return {
    artifactKind: "workflow_orchestration_policy_summary",
    policyId: policy.policyId,
    workflowId: policy.workflowId,
    complexWorkflow: policy.complexWorkflow,
    requiredPhases: policy.requiredPhases,
    optionalPhases: policy.optionalPhases,
    requiredRoleClasses: policy.requiredRoleClasses,
    optionalRoleClasses: policy.optionalRoleClasses,
    allowedCapabilityIds: policy.allowedCapabilityIds.slice(0, 40),
    contextNeeds: policy.contextNeeds.map((need) => ({
      contextNeedId: need.contextNeedId,
      roleClass: need.roleClass,
      required: need.required,
      sourcePromptAccess: need.sourcePromptAccess,
      repoContextAccess: need.repoContextAccess,
      externalContextAccess: need.externalContextAccess,
      handoffPacketRequired: need.handoffPacketRequired,
      reasonCodes: need.reasonCodes.slice(0, 8),
      rawPromptStored: false,
      rawResponseStored: false,
    })),
    sourcePromptPolicy: policy.sourcePromptPolicy,
    capabilityPolicy: policy.capabilityPolicy,
    humanDecisionPolicy: policy.humanDecisionPolicy,
    entryNodePolicy: policy.entryNodePolicy,
    evidenceProfileId: policy.evidenceProfileId,
    runtimeToolFamilies: policy.runtimeToolFamilies,
    closeoutPolicyRef: policy.closeoutPolicyRef,
    finalizationPolicyRef: policy.finalizationPolicyRef,
    readbackPolicyRef: policy.readbackPolicyRef,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  } satisfies JsonValue;
}
