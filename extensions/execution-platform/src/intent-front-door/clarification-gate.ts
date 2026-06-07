import type { ActionSemanticsDecision } from "./action-semantics.ts";
import type {
  ConversationReferenceResolution,
  ConversationRoutingContext,
  PendingClarificationRef,
} from "./conversation-routing-context.ts";
import type { IntentValidationDecision } from "./intent-validator.ts";
import type { RouterEscalationDecision } from "./router-escalation-policy.ts";
import type { CanonicalRouterOutput } from "./router-schema.ts";

export const CLARIFICATION_GATE_VERSION = "intent-front-door.clarification-gate.v1";
export const CLARIFICATION_PROMPT_SUMMARY_MAX_CHARS = 500;
export const CLARIFICATION_QUESTION_MAX_CHARS = 180;

export type ClarificationGateOutcome =
  | "clarification_required"
  | "pass_through"
  | "plan_only_allowed"
  | "chat_or_status_allowed"
  | "blocked";

export type ClarificationAllowedAnswerShape =
  | "short_text"
  | "select_target"
  | "confirm_or_cancel"
  | "provide_missing_scope"
  | "approval_reference";

export type ClarificationArtifact = {
  artifactKind: "front_door_clarification";
  gateVersion: typeof CLARIFICATION_GATE_VERSION;
  clarificationId: string;
  targetRefs: string[];
  questionSummary: string;
  allowedAnswerShape: ClarificationAllowedAnswerShape;
  promptHash: string;
  promptSummary: string;
  expiresAt: string | null;
  reviewAfter: string | null;
  pendingClarificationRef: PendingClarificationRef;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type ClarificationGateDecision = {
  artifactKind: "front_door_clarification_gate_decision";
  gateVersion: typeof CLARIFICATION_GATE_VERSION;
  outcome: ClarificationGateOutcome;
  clarification: ClarificationArtifact | null;
  reasonCodes: string[];
  runtimeJobCreated: false;
  authorityGranted: false;
  workQueueLifecycleMutationAllowed: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type ClarificationGateInput = {
  routerOutput?: CanonicalRouterOutput | null;
  validation?: IntentValidationDecision | null;
  escalationDecision?: RouterEscalationDecision | null;
  conversationContext?: ConversationRoutingContext | null;
  referenceResolution?: ConversationReferenceResolution | null;
  actionSemantics?: ActionSemanticsDecision | null;
  sourceRoute?: string | null;
  requestId: string;
  sessionId?: string | null;
  actorId?: string | null;
  promptHash: string;
  promptSummary: string;
  now?: Date;
  expiresInMs?: number | null;
  reviewAfterMs?: number | null;
};

export function runClarificationGate(input: ClarificationGateInput): ClarificationGateDecision {
  const reasonCodes = collectClarificationReasonCodes(input);
  const output = input.routerOutput ?? null;

  if (reasonCodes.length > 0) {
    return decision("clarification_required", createClarificationArtifact(input, reasonCodes), [
      "clarification_gate_required",
      ...reasonCodes,
    ]);
  }

  if (input.validation?.outcome === "blocked" || input.actionSemantics?.outcome === "blocked") {
    return decision("blocked", null, ["clarification_gate_blocked"]);
  }

  if (output?.route === "chat_response" || output?.route === "status_response") {
    return decision("chat_or_status_allowed", null, ["chat_or_status_allowed_without_runtime_job"]);
  }

  if (output?.route === "plan_only" || input.validation?.outcome === "plan_only_allowed") {
    return decision("plan_only_allowed", null, ["plan_only_allowed_without_runtime_job"]);
  }

  return decision("pass_through", null, ["clarification_gate_pass_through"]);
}

function collectClarificationReasonCodes(input: ClarificationGateInput): string[] {
  const reasonCodes: string[] = [];
  const output = input.routerOutput ?? null;
  const validation = input.validation ?? null;
  const escalation = input.escalationDecision ?? null;
  const context = input.conversationContext ?? null;
  const reference = input.referenceResolution ?? null;
  const actions = input.actionSemantics ?? null;

  if (output?.route === "clarification_required") {
    reasonCodes.push("router_route_clarification_required");
  }
  if (output?.ambiguity.ambiguous) {
    reasonCodes.push("router_output_ambiguous");
  }
  if ((output?.ambiguity.missingInputs.length ?? 0) > 0) {
    reasonCodes.push("router_output_missing_inputs");
  }
  if (validation?.outcome === "clarification_required") {
    reasonCodes.push("validator_clarification_required");
  }
  if (validation?.reasonCodes.includes("authority_snapshot_stale")) {
    reasonCodes.push("authority_snapshot_stale");
  }
  if (validation?.reasonCodes.includes("execution_confidence_below_threshold")) {
    reasonCodes.push("low_confidence_execution");
  }
  if (validation?.reasonCodes.includes("control_target_required")) {
    reasonCodes.push("control_target_required");
  }
  if (escalation?.outcome === "ask_clarification") {
    reasonCodes.push("escalation_asked_clarification");
  }
  if (
    reference &&
    ["ambiguous", "stale", "missing_target", "needs_clarification"].includes(reference.outcome)
  ) {
    reasonCodes.push(`reference_${reference.outcome}`);
  }
  if (context?.selectedWorkQueueItem?.freshness === "stale") {
    reasonCodes.push("selected_work_queue_item_stale");
  }
  if (
    !output?.targetRefs.length &&
    !reference?.targetRef &&
    (output?.route === "work_queue_control" ||
      validation?.reasonCodes.includes("control_target_required"))
  ) {
    reasonCodes.push("target_missing");
  }
  const freshActiveJobs =
    context?.activeRuntimeJobs.filter((job) => job.freshness === "fresh") ?? [];
  if (
    !reference?.targetRef &&
    freshActiveJobs.length > 1 &&
    output?.route === "work_queue_control"
  ) {
    reasonCodes.push("multiple_active_runtime_jobs");
  }
  if (
    actions?.outcome === "blocked" &&
    actions.reasonCodes.some((reason) => reason.includes("conflicts_with_negation"))
  ) {
    reasonCodes.push("requested_and_negated_action_conflict");
  }
  return [...new Set(reasonCodes)].slice(0, 40);
}

function createClarificationArtifact(
  input: ClarificationGateInput,
  reasonCodes: string[],
): ClarificationArtifact {
  const now = input.now ?? new Date();
  const clarificationId = `clarification:${input.requestId}`;
  const targetRefs = collectTargetRefs(input);
  const questionSummary = chooseQuestion(input, reasonCodes);
  const expiresAt =
    input.expiresInMs === null
      ? null
      : new Date(now.getTime() + (input.expiresInMs ?? 15 * 60_000)).toISOString();
  const reviewAfter =
    input.reviewAfterMs === null
      ? null
      : new Date(now.getTime() + (input.reviewAfterMs ?? 5 * 60_000)).toISOString();
  const pendingClarificationRef: PendingClarificationRef = {
    clarificationId,
    targetRef: targetRefs[0] ?? "target://unknown",
    questionSummary,
    createdAt: now.toISOString(),
    freshness: "fresh",
  };

  return {
    artifactKind: "front_door_clarification",
    gateVersion: CLARIFICATION_GATE_VERSION,
    clarificationId,
    targetRefs,
    questionSummary,
    allowedAnswerShape: chooseAnswerShape(reasonCodes),
    promptHash: input.promptHash,
    promptSummary: boundText(input.promptSummary, CLARIFICATION_PROMPT_SUMMARY_MAX_CHARS),
    expiresAt,
    reviewAfter,
    pendingClarificationRef,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function collectTargetRefs(input: ClarificationGateInput): string[] {
  const refs = [
    ...(input.routerOutput?.targetRefs.map((target) => target.targetRef) ?? []),
    ...(input.routerOutput?.activeJobRefs.map((jobRef) => `runtime-job://${jobRef}`) ?? []),
    ...(input.referenceResolution?.targetRef ? [input.referenceResolution.targetRef] : []),
    ...(input.conversationContext?.selectedWorkQueueItem
      ? [`work-item://${input.conversationContext.selectedWorkQueueItem.workItemId}`]
      : []),
    ...(input.conversationContext?.activeRuntimeJobs.map(
      (job) => `runtime-job://${job.runtimeJobId}`,
    ) ?? []),
  ];
  return [...new Set(refs)].slice(0, 12);
}

function chooseQuestion(input: ClarificationGateInput, reasonCodes: string[]): string {
  const routerQuestion = input.routerOutput?.ambiguity.clarificationQuestion;
  const referenceQuestion = input.referenceResolution?.clarificationQuestion;
  const question =
    routerQuestion ||
    referenceQuestion ||
    (reasonCodes.includes("multiple_active_runtime_jobs")
      ? "Which active job should this apply to?"
      : reasonCodes.includes("selected_work_queue_item_stale") ||
          reasonCodes.includes("reference_stale")
        ? "Which current work item should this use?"
        : reasonCodes.includes("requested_and_negated_action_conflict")
          ? "Should this action be skipped or should the request be revised?"
          : reasonCodes.includes("low_confidence_execution")
            ? "Should I answer in chat or start a workflow?"
            : "What target or scope should I use?");
  return boundText(question, CLARIFICATION_QUESTION_MAX_CHARS);
}

function chooseAnswerShape(reasonCodes: string[]): ClarificationAllowedAnswerShape {
  if (
    reasonCodes.includes("multiple_active_runtime_jobs") ||
    reasonCodes.includes("selected_work_queue_item_stale") ||
    reasonCodes.includes("target_missing") ||
    reasonCodes.some((reason) => reason.startsWith("reference_"))
  ) {
    return "select_target";
  }
  if (reasonCodes.includes("low_confidence_execution")) {
    return "confirm_or_cancel";
  }
  return "short_text";
}

function decision(
  outcome: ClarificationGateOutcome,
  clarification: ClarificationArtifact | null,
  reasonCodes: string[],
): ClarificationGateDecision {
  return {
    artifactKind: "front_door_clarification_gate_decision",
    gateVersion: CLARIFICATION_GATE_VERSION,
    outcome,
    clarification,
    reasonCodes: [...new Set(reasonCodes)].slice(0, 50),
    runtimeJobCreated: false,
    authorityGranted: false,
    workQueueLifecycleMutationAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function boundText(value: string, maxChars: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxChars);
}
