import type { ConversationRoutingContext } from "./conversation-routing-context.ts";
import { validateIntakeRouteContract, type IntakeRouteContract } from "./intake-route-contract.ts";
import type { RouterEscalationDecision } from "./router-escalation-policy.ts";
import type { CanonicalRouterOutput, CanonicalRouterParseResult } from "./router-schema.ts";
import type { WorkflowSummaryIndex, WorkflowSummaryIndexEntry } from "./workflow-summary-index.ts";

export const INTENT_FRONT_DOOR_VALIDATOR_VERSION = "intent-front-door.intent-validator.v1";

export type FrontDoorIntentValidationOutcome =
  | "accepted"
  | "clarification_required"
  | "plan_only_allowed"
  | "approval_required"
  | "blocked"
  | "needs_review";

export type IntentValidatorAuthMetadata = {
  authenticated: boolean;
  actorId?: string | null;
  sessionId?: string | null;
};

export type IntentValidatorAuthorityState = {
  snapshotFresh: boolean;
  supportedAuthorityProfiles: string[];
  approvalRefs?: string[];
  defaultEnabledAuthorityProfiles?: string[];
  approvalRequiredAuthorityProfiles?: string[];
  lifecycleMutationRequested?: boolean;
};

export type IntentValidatorInput = {
  parseResult: CanonicalRouterParseResult;
  conversationContext?: ConversationRoutingContext | null;
  workflowSummaryIndex?: WorkflowSummaryIndex | null;
  workflowSummaries?: WorkflowSummaryIndexEntry[];
  auth?: IntentValidatorAuthMetadata | null;
  authority?: IntentValidatorAuthorityState | null;
  approvalRefs?: string[];
  escalationDecision?: RouterEscalationDecision | null;
  minimumExecutionConfidence?: number;
  workQueueLifecycleMutationRequested?: boolean;
  strongerRouterResultPresent?: boolean;
  sourceRoute?: string | null;
  intakeRouteContract?: IntakeRouteContract | null;
  reasonCodes?: string[];
};

export type IntentValidationDecision = {
  artifactKind: "intent_front_door_validation_decision";
  validatorVersion: typeof INTENT_FRONT_DOOR_VALIDATOR_VERSION;
  outcome: FrontDoorIntentValidationOutcome;
  accepted: boolean;
  route: CanonicalRouterOutput["route"] | null;
  workflowId: string | null;
  jobType: string | null;
  requiresApproval: boolean;
  approvalKind: string | null;
  reasonCodes: string[];
  runtimeJobCreated: false;
  authorityGranted: false;
  workQueueLifecycleMutationAllowed: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

const LOW_RISK_NON_EXECUTION_ROUTES = new Set<CanonicalRouterOutput["route"]>([
  "chat_response",
  "status_response",
]);

const EXECUTION_OR_CONTROL_ROUTES = new Set<CanonicalRouterOutput["route"]>([
  "workflow_execution",
  "multi_workflow_plan",
  "research_only",
  "work_queue_control",
]);

const CACHEABLE_VALIDATION_ROUTES = new Set<CanonicalRouterOutput["route"]>([
  "chat_response",
  "status_response",
  "plan_only",
]);

export function validateIntentFrontDoorDecision(
  input: IntentValidatorInput,
): IntentValidationDecision {
  const reasonCodes = [...(input.reasonCodes ?? [])];
  const parseResult = input.parseResult;
  const output = parseResult.output;
  if (!parseResult.valid || !output) {
    return decision("blocked", null, reasonCodes.concat("canonical_router_schema_invalid"));
  }
  if (output.rawPromptStored || output.rawResponseStored) {
    return decision("blocked", output, reasonCodes.concat("raw_storage_flags_rejected"));
  }

  const escalationDecision = input.escalationDecision ?? null;
  const escalationOutcome = escalationDecision?.outcome;
  if (escalationOutcome === "fail_closed") {
    return decision(
      "blocked",
      output,
      reasonCodes.concat("router_escalation_failed_closed", escalationDecision?.reasonCodes ?? []),
    );
  }
  if (escalationOutcome === "ask_clarification") {
    return decision(
      "clarification_required",
      output,
      reasonCodes.concat(
        "router_escalation_asked_clarification",
        escalationDecision?.reasonCodes ?? [],
      ),
    );
  }
  if (escalationOutcome === "escalate_to_stronger_router" && !input.strongerRouterResultPresent) {
    return decision(
      "needs_review",
      output,
      reasonCodes.concat("stronger_router_required_before_validation_acceptance"),
    );
  }
  if (
    escalationOutcome === "use_cached_low_risk_route" &&
    !CACHEABLE_VALIDATION_ROUTES.has(output.route)
  ) {
    return decision("blocked", output, reasonCodes.concat("cached_route_not_valid_for_execution"));
  }

  if (output.route === "blocked") {
    return decision("blocked", output, reasonCodes.concat("router_route_blocked"));
  }
  if (output.route === "needs_review") {
    return decision("needs_review", output, reasonCodes.concat("router_route_needs_review"));
  }
  if (output.route === "clarification_required") {
    return decision(
      "clarification_required",
      output,
      reasonCodes.concat("router_route_clarification_required"),
    );
  }
  if (LOW_RISK_NON_EXECUTION_ROUTES.has(output.route)) {
    return decision("accepted", output, reasonCodes.concat("chat_or_status_route_allowed"));
  }
  if (output.route === "plan_only") {
    return decision("plan_only_allowed", output, reasonCodes.concat("plan_only_route_allowed"));
  }

  if (input.workQueueLifecycleMutationRequested || input.authority?.lifecycleMutationRequested) {
    return decision(
      "blocked",
      output,
      reasonCodes.concat("work_queue_lifecycle_mutation_rejected"),
    );
  }

  if (EXECUTION_OR_CONTROL_ROUTES.has(output.route)) {
    const auth = input.auth;
    if (!auth?.authenticated || !auth.actorId?.trim() || !auth.sessionId?.trim()) {
      return decision("blocked", output, reasonCodes.concat("authenticated_session_required"));
    }
    if (input.authority?.snapshotFresh === false) {
      return decision("blocked", output, reasonCodes.concat("authority_snapshot_stale"));
    }
  }

  if (output.route === "work_queue_control") {
    if (output.targetRefs.length === 0 && output.activeJobRefs.length === 0) {
      return decision(
        "clarification_required",
        output,
        reasonCodes.concat("control_target_required"),
      );
    }
    return decision(
      "accepted",
      output,
      reasonCodes.concat("work_queue_control_requires_later_runtime_control_validation"),
    );
  }

  const executorWorkflowId = output.executorWorkflowId ?? output.workflowId;
  const workflow = findWorkflowSummary(input, executorWorkflowId);
  if (!executorWorkflowId || !output.jobType) {
    return decision(
      "blocked",
      output,
      reasonCodes.concat("executor_workflow_id_and_job_type_required"),
    );
  }
  if (output.workflowId && output.workflowId !== executorWorkflowId) {
    return decision("blocked", output, reasonCodes.concat("legacy_workflow_id_executor_mismatch"));
  }
  if (!workflow) {
    return decision(
      "blocked",
      output,
      reasonCodes.concat("executor_workflow_not_registered", "workflow_not_registered"),
    );
  }
  if (!workflow.executable) {
    return decision(
      "blocked",
      output,
      reasonCodes.concat(`workflow_not_executable:${workflow.status}`),
    );
  }
  if (output.jobType !== workflow.jobType) {
    return decision("blocked", output, reasonCodes.concat("workflow_job_type_mismatch"));
  }
  const intakeRouteContract = validateIntakeRouteContract({
    contract: input.intakeRouteContract ?? null,
    routerOutput: output,
    workflowSummaries: input.workflowSummaries ?? input.workflowSummaryIndex?.summaries ?? [],
  });
  reasonCodes.push(...intakeRouteContract.reasonCodes);
  if (!intakeRouteContract.accepted) {
    return decision("needs_review", output, reasonCodes);
  }
  if (output.confidence < (input.minimumExecutionConfidence ?? 0.75)) {
    return decision(
      "clarification_required",
      output,
      reasonCodes.concat("execution_confidence_below_threshold"),
    );
  }
  if (!sideEffectCompatible(output, workflow)) {
    return decision(
      "blocked",
      output,
      reasonCodes.concat("side_effect_class_incompatible_with_workflow_contract"),
    );
  }
  return decision("accepted", output, reasonCodes.concat("structured_intent_validated"));
}

function findWorkflowSummary(
  input: IntentValidatorInput,
  workflowId: string | null,
): WorkflowSummaryIndexEntry | null {
  if (!workflowId) {
    return null;
  }
  const summaries = input.workflowSummaries ?? input.workflowSummaryIndex?.summaries ?? [];
  return summaries.find((summary) => summary.workflowId === workflowId) ?? null;
}

function sideEffectCompatible(
  output: CanonicalRouterOutput,
  workflow: WorkflowSummaryIndexEntry,
): boolean {
  if (output.sideEffectClass === "production_side_effect") {
    return workflow.sideEffectPolicySummary.productionDeployAllowed;
  }
  if (output.sideEffectClass === "external_outbound_write") {
    return workflow.sideEffectPolicySummary.externalOutboundWriteAllowed;
  }
  if (output.sideEffectClass === "production_model_promotion") {
    return workflow.sideEffectPolicySummary.productionModelPromotionAllowed;
  }
  return true;
}

function decision(
  outcome: FrontDoorIntentValidationOutcome,
  output: CanonicalRouterOutput | null,
  reasonCodes: string[],
): IntentValidationDecision {
  return {
    artifactKind: "intent_front_door_validation_decision",
    validatorVersion: INTENT_FRONT_DOOR_VALIDATOR_VERSION,
    outcome,
    accepted: outcome === "accepted" || outcome === "plan_only_allowed",
    route: output?.route ?? null,
    workflowId: output?.executorWorkflowId ?? output?.workflowId ?? null,
    jobType: output?.jobType ?? null,
    requiresApproval: false,
    approvalKind: null,
    reasonCodes: [...new Set(reasonCodes.flat())].slice(0, 40),
    runtimeJobCreated: false,
    authorityGranted: false,
    workQueueLifecycleMutationAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}
