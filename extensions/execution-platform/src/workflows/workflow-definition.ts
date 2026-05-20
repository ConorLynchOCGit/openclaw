import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeToolFamily } from "../runtime-tool-call/runtime-tool-types.ts";
import type { WorkflowEvidenceClass } from "./workflow-evidence-profile.ts";
import {
  validateWorkflowOrchestrationPolicy,
  workflowOrchestrationPolicySummary,
  type WorkflowCapabilityPolicy,
  type WorkflowContextNeed,
  type WorkflowHumanDecisionPolicy,
  type WorkflowOrchestrationPolicy,
  type WorkflowPhase,
  type WorkflowRoleClass,
  type WorkflowSourcePromptPolicy,
} from "./workflow-orchestration-policy.ts";

export const WORKFLOW_DEFINITION_RESOLUTION_ARTIFACT_TYPE =
  "execution.workflow_definition_resolution";

export type WorkflowDefinitionStatus =
  | "production_ready"
  | "registered_needs_executor_migration"
  | "blocked"
  | "compatibility_only";

export type WorkflowDefinitionKind =
  | "agent_team"
  | "single_agent"
  | "workflow"
  | "planning"
  | "skillifier";

export type WorkflowCompletionReviewPolicy = {
  required: boolean;
  policyId: string;
  reviewerRoleClass: string;
  modelPolicyRef: string;
  requiredEvidenceClasses: WorkflowEvidenceClass[];
  allowedOutcomes: ["accepted", "needs_review", "failed"];
  deepCompletionQuestion: string;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type WorkflowCloseoutPolicy = {
  closeoutRequired: true;
  modelAuthoredRequired: true;
  runtimeToolFamily: "closeout.generate";
  degradedCloseoutSuccessAllowed: false;
};

export type WorkflowDefinition = {
  definitionId: string;
  workflowId: string;
  displayName: string;
  workflowKind: WorkflowDefinitionKind;
  status: WorkflowDefinitionStatus;
  productionEnabled: boolean;
  schedulerBacked: boolean;
  compatibilityOnly: boolean;
  inputContractRef: string;
  missionLedgerProfileRef: string;
  roleCoverageProfileRef: string;
  capabilityProfileRefs: string[];
  allowedNodeKinds: string[];
  requiredNodeKinds: string[];
  nodeExecutorKeys: string[];
  runtimeToolFamilies: RuntimeToolFamily[];
  modelPolicyRef: string;
  workerPolicyRef: string;
  evidenceProfileId: string;
  requiredPhases: WorkflowPhase[];
  optionalPhases: WorkflowPhase[];
  allowedCapabilityIds: string[];
  requiredRoleClasses: WorkflowRoleClass[];
  optionalRoleClasses: WorkflowRoleClass[];
  contextNeeds: WorkflowContextNeed[];
  sourcePromptPolicy: WorkflowSourcePromptPolicy;
  capabilityPolicy: WorkflowCapabilityPolicy;
  humanDecisionPolicy: WorkflowHumanDecisionPolicy;
  orchestrationPolicy: WorkflowOrchestrationPolicy;
  closeoutPolicy: WorkflowCloseoutPolicy;
  completionReviewPolicy: WorkflowCompletionReviewPolicy;
  humanTaskPolicyRef: string;
  workQueueProjectionPolicyRef: string;
  liveProofRequirements: string[];
  // c06 artifact-contract: all raw-storage flags must be false at runtime
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

export type WorkflowDefinitionValidation = {
  artifactKind: "workflow_definition_validation";
  valid: boolean;
  definitionId: string | null;
  workflowId: string | null;
  readinessStatus: WorkflowDefinitionStatus | "invalid";
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

export type WorkflowDefinitionResolution = {
  artifactKind: "workflow_definition_resolution";
  definitionId: string;
  workflowId: string;
  workflowDefinitionStatus: WorkflowDefinitionStatus;
  productionEnabled: boolean;
  schedulerBacked: boolean;
  compatibilityOnly: boolean;
  evidenceProfileId: string;
  orchestrationPolicyRef: string;
  requiredPhases: WorkflowPhase[];
  requiredRoleClasses: WorkflowRoleClass[];
  contextNeedCount: number;
  completionReviewRequired: boolean;
  engineMode: "runtime_workflow_graph_engine";
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export const DEEP_COMPLETION_REVIEW_QUESTION =
  "Did we maximally execute and implement this queue item? Are the workflow/runtime objects canonical production objects, fully wired into production workflow completion/readback, enforced against false success, and visible in owner-facing Work Queue readback? Is there any way to improve, harden, optimize, sharpen, extend, or otherwise make it stronger before moving to the next queue item? Are there any compatibility/fallback/dead-code paths that could still produce production workflow success without definition resolution, runtime graph evidence, runtime tool traces, Mission Ledger evidence claims, accepted workflow evidence profile, and model-authored closeout? Is anything still proof-shaped instead of live-wired?";

function nonEmpty(values: readonly string[]): boolean {
  return values.some((value) => value.trim().length > 0);
}

export function validateWorkflowDefinition(
  definition: WorkflowDefinition,
): WorkflowDefinitionValidation {
  const reasonCodes: string[] = [];
  if (!definition.definitionId.trim()) {
    reasonCodes.push("workflow_definition_id_missing");
  }
  if (!definition.workflowId.trim()) {
    reasonCodes.push("workflow_id_missing");
  }
  if (definition.rawPromptStored || definition.rawResponseStored || definition.rawLogsStored) {
    reasonCodes.push("workflow_definition_raw_storage_disallowed");
    reasonCodes.push("workflow_definition_raw_storage_rejected");
  }
  if (!nonEmpty(definition.requiredPhases)) {
    reasonCodes.push("workflow_definition_required_phases_empty");
  }
  if (!definition.evidenceProfileId.trim()) {
    reasonCodes.push("workflow_definition_evidence_profile_missing");
  }
  if (definition.productionEnabled && definition.compatibilityOnly) {
    reasonCodes.push("workflow_definition_production_cannot_be_compatibility_only");
  }
  if (definition.productionEnabled && !definition.schedulerBacked) {
    reasonCodes.push("workflow_definition_production_requires_scheduler_backed_engine");
  }
  if (definition.productionEnabled && !definition.evidenceProfileId.trim()) {
    reasonCodes.push("workflow_definition_evidence_profile_missing");
  }
  if (definition.productionEnabled && definition.requiredPhases.length === 0) {
    reasonCodes.push("workflow_definition_required_phases_missing");
  }
  if (definition.productionEnabled && definition.requiredRoleClasses.length === 0) {
    reasonCodes.push("workflow_definition_required_role_classes_missing");
  }
  if (definition.productionEnabled && definition.allowedCapabilityIds.length === 0) {
    reasonCodes.push("workflow_definition_allowed_capabilities_missing");
  }
  if (definition.productionEnabled && definition.contextNeeds.some((need) => need.required)) {
    if (!definition.sourcePromptPolicy.sourcePromptIndexRequired) {
      reasonCodes.push("workflow_definition_context_requires_source_prompt_index");
    }
  }
  const orchestrationValidation = validateWorkflowOrchestrationPolicy(
    definition.orchestrationPolicy,
  );
  if (!orchestrationValidation.valid) {
    reasonCodes.push(...orchestrationValidation.reasonCodes);
  }
  if (definition.orchestrationPolicy.workflowId !== definition.workflowId) {
    reasonCodes.push("workflow_definition_orchestration_policy_workflow_mismatch");
  }
  if (definition.orchestrationPolicy.evidenceProfileId !== definition.evidenceProfileId) {
    reasonCodes.push("workflow_definition_orchestration_policy_evidence_profile_mismatch");
  }
  if (definition.productionEnabled && !nonEmpty(definition.nodeExecutorKeys)) {
    reasonCodes.push("workflow_definition_node_executor_keys_missing");
  }
  if (definition.productionEnabled && !definition.closeoutPolicy.modelAuthoredRequired) {
    reasonCodes.push("workflow_definition_model_authored_closeout_required");
  }
  if (
    definition.productionEnabled &&
    (!definition.completionReviewPolicy.required ||
      !definition.completionReviewPolicy.deepCompletionQuestion.trim())
  ) {
    reasonCodes.push("workflow_definition_completion_review_policy_missing");
  }
  if (
    definition.completionReviewPolicy.rawPromptStored ||
    definition.completionReviewPolicy.rawResponseStored
  ) {
    reasonCodes.push("workflow_definition_completion_review_raw_storage_rejected");
  }
  return {
    artifactKind: "workflow_definition_validation",
    valid: reasonCodes.length === 0,
    definitionId: definition.definitionId || null,
    workflowId: definition.workflowId || null,
    readinessStatus: reasonCodes.length === 0 ? definition.status : "invalid",
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
}

export function workflowDefinitionResolutionFor(
  definition: WorkflowDefinition,
): WorkflowDefinitionResolution {
  return {
    artifactKind: "workflow_definition_resolution",
    definitionId: definition.definitionId,
    workflowId: definition.workflowId,
    workflowDefinitionStatus: definition.status,
    productionEnabled: definition.productionEnabled,
    schedulerBacked: definition.schedulerBacked,
    compatibilityOnly: definition.compatibilityOnly,
    evidenceProfileId: definition.evidenceProfileId,
    orchestrationPolicyRef: `workflow-orchestration-policy://${definition.orchestrationPolicy.policyId}`,
    requiredPhases: definition.requiredPhases,
    requiredRoleClasses: definition.requiredRoleClasses,
    contextNeedCount: definition.contextNeeds.length,
    completionReviewRequired: definition.completionReviewPolicy.required,
    engineMode: "runtime_workflow_graph_engine",
    reasonCodes: [
      "workflow_definition_resolved",
      ...(definition.productionEnabled ? ["workflow_definition_production_enabled"] : []),
      ...(definition.schedulerBacked ? ["workflow_definition_scheduler_backed"] : []),
      ...(definition.compatibilityOnly ? ["workflow_definition_compatibility_only"] : []),
      "workflow_definition_orchestration_policy_resolved",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function workflowDefinitionResolutionArtifactMetadata(
  resolution: WorkflowDefinitionResolution,
): JsonValue {
  return resolution as unknown as JsonValue;
}

export function workflowDefinitionOrchestrationPolicyArtifactMetadata(
  definition: WorkflowDefinition,
): JsonValue {
  return workflowOrchestrationPolicySummary(definition.orchestrationPolicy);
}
