import type { JsonValue } from "../runtime-job-repository.ts";
import type { ExecutionWorkflowContract } from "../workflows/workflow-contract.ts";
import {
  getWorkflowContract,
  workflowCanRouteToLiveExecution,
  type WorkflowRegistry,
} from "../workflows/workflow-registry.ts";
import type { StructuredIntentRouterOutput } from "./intent-router-schema.ts";
import { decideProductionDefaultEnablement } from "./production-default-enablement-gate.ts";
import { researchPolicyMetadata } from "./research-routing-policy.ts";

export type IntentValidationOutcome =
  | "accepted"
  | "clarification_required"
  | "plan_only_allowed"
  | "approval_required"
  | "blocked"
  | "needs_review";

export type IntentValidatorApprovalRef = {
  approvalId: string;
  approvalKind: string;
  workflowId?: string;
  expiresAt: string;
  revoked?: boolean;
};

export type IntentValidationResult = {
  artifactKind: "execution_intent_validation_result";
  outcome: IntentValidationOutcome;
  accepted: boolean;
  workflow: ExecutionWorkflowContract | null;
  routeDecision: StructuredIntentRouterOutput;
  reasonCodes: string[];
  requiresApproval: boolean;
  approvalKind: string | null;
  workQueueLifecycleMutated: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

function approvalValid(input: {
  approvalRefs: IntentValidatorApprovalRef[];
  workflowId: string;
  approvalKind: string;
  now: Date;
}): boolean {
  return input.approvalRefs.some(
    (approval) =>
      approval.approvalKind === input.approvalKind &&
      (approval.workflowId === undefined || approval.workflowId === input.workflowId) &&
      !approval.revoked &&
      new Date(approval.expiresAt).getTime() > input.now.getTime(),
  );
}

function highRiskAuthority(authority: string | null): boolean {
  return [
    "install_dependency",
    "deploy_dry_run",
    "model_promotion_dry_run",
    "deploy_production",
    "production_deploy",
  ].includes(authority ?? "");
}

export function validateIntentForExecution(input: {
  routeDecision: StructuredIntentRouterOutput;
  registry: WorkflowRegistry;
  approvalRefs?: IntentValidatorApprovalRef[];
  now?: Date;
  minimumConfidence?: number;
}): IntentValidationResult {
  const decision = input.routeDecision;
  const now = input.now ?? new Date();
  const reasonCodes: string[] = [];
  const workflow = getWorkflowContract(input.registry, decision.workflowId);

  if (decision.rawPromptStored || decision.rawResponseStored) {
    reasonCodes.push("raw_prompt_or_response_storage_rejected");
  }
  if (decision.route === "clarification_required" || decision.needsClarification) {
    reasonCodes.push("clarification_required");
    return result("clarification_required");
  }
  if (decision.route === "blocked") {
    reasonCodes.push(...decision.reasonCodes, "route_blocked");
    return result("blocked");
  }
  if (decision.route !== "workflow_execution") {
    reasonCodes.push(`non_workflow_route:${decision.route}`);
    return result(
      decision.route === "work_queue_control" ? "needs_review" : "clarification_required",
    );
  }
  if (!workflow) {
    reasonCodes.push("workflow_not_registered");
    return result("blocked");
  }
  if (!workflowCanRouteToLiveExecution(workflow)) {
    reasonCodes.push(`workflow_not_enabled:${workflow.status}`);
    return result(workflow.status === "needs_review" ? "needs_review" : "blocked");
  }
  if (decision.jobType !== workflow.jobType) {
    reasonCodes.push("workflow_job_type_mismatch");
  }
  if (decision.confidence < (input.minimumConfidence ?? 0.7)) {
    reasonCodes.push("intent_confidence_below_threshold");
  }
  if (!decision.objectiveSummary.trim()) {
    reasonCodes.push("objective_summary_required");
  }
  if (
    decision.requestedAuthority &&
    !workflow.supportedAuthorityProfiles.includes(decision.requestedAuthority)
  ) {
    reasonCodes.push("requested_authority_not_supported_by_workflow");
  }
  if (decision.sideEffectClass === "production_side_effect") {
    reasonCodes.push("production_side_effect_locked");
  }
  const defaultEnablement = workflow
    ? decideProductionDefaultEnablement({
        workflowId: workflow.workflowId,
        authorityProfile: decision.requestedAuthority ?? workflow.defaultAuthorityProfile,
        sideEffectClass: decision.sideEffectClass,
      })
    : null;
  if (defaultEnablement?.status === "locked") {
    reasonCodes.push(...defaultEnablement.reasonCodes);
  }
  const researchPolicy = researchPolicyMetadata(decision);
  if (researchPolicy.disposition === "blocked") {
    reasonCodes.push(...researchPolicy.reasonCodes);
  }
  if (
    researchPolicy.disposition === "clarification_required" &&
    decision.workflowId === "single_agent.web_research"
  ) {
    reasonCodes.push(...researchPolicy.reasonCodes);
    return result("clarification_required");
  }
  if (/work queue lifecycle/i.test(JSON.stringify(decision.compiledInputs))) {
    reasonCodes.push("work_queue_lifecycle_mutation_rejected");
  }
  if (
    JSON.stringify(decision.compiledInputs).includes("deepseek/deepseek-v4-pro") &&
    !JSON.stringify(decision.compiledInputs).includes("test_engineer")
  ) {
    reasonCodes.push("v4_pro_blocked_outside_test_engineer");
  }
  const approvalKind = decision.approvalKind ?? decision.requestedAuthority;
  if (decision.requiresApproval || highRiskAuthority(decision.requestedAuthority)) {
    if (!approvalKind || !workflow) {
      reasonCodes.push("approval_kind_required");
    } else if (
      !approvalValid({
        approvalRefs: input.approvalRefs ?? [],
        workflowId: workflow.workflowId,
        approvalKind,
        now,
      })
    ) {
      reasonCodes.push("valid_scoped_approval_required");
      return result("approval_required");
    }
  }
  if (reasonCodes.length > 0) {
    if (reasonCodes.includes("intent_confidence_below_threshold")) {
      return result("clarification_required");
    }
    return result("blocked");
  }
  return result("accepted");

  function result(outcome: IntentValidationOutcome): IntentValidationResult {
    return {
      artifactKind: "execution_intent_validation_result",
      outcome,
      accepted: outcome === "accepted",
      workflow,
      routeDecision: decision,
      reasonCodes: [...new Set(reasonCodes)].slice(0, 30),
      requiresApproval: outcome === "approval_required" || decision.requiresApproval,
      approvalKind: decision.approvalKind ?? decision.requestedAuthority,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
    };
  }
}

export function intentValidationMetadata(result: IntentValidationResult): JsonValue {
  return {
    artifactKind: result.artifactKind,
    outcome: result.outcome,
    accepted: result.accepted,
    workflowId: result.workflow?.workflowId ?? null,
    jobType: result.workflow?.jobType ?? null,
    reasonCodes: result.reasonCodes,
    requiresApproval: result.requiresApproval,
    approvalKind: result.approvalKind,
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}
