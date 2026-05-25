import {
  CANONICAL_ACTION_CATEGORIES,
  type CanonicalActionCategory,
  type CanonicalRouterAction,
} from "./router-schema.ts";

export const ACTION_SEMANTICS_VERSION = "intent-front-door.action-semantics.v1";

export type ConditionalActionPolicyOutcome =
  | "satisfied"
  | "unmet"
  | "approval_required"
  | "blocked";

export type ActionSemanticsInput = {
  mentionedActions?: CanonicalRouterAction[];
  requestedActions?: CanonicalRouterAction[];
  negatedActions?: CanonicalRouterAction[];
  conditionalActions?: CanonicalRouterAction[];
  routerReasonCodes?: string[];
  allowedRequestedActionCategories?: CanonicalActionCategory[];
  approvedHighRiskActionCategories?: CanonicalActionCategory[];
  conditionalPolicyByAction?: Partial<
    Record<CanonicalActionCategory, ConditionalActionPolicyOutcome>
  >;
};

export type ActionSemanticsOutcome =
  | "actions_allowed"
  | "clarification_required"
  | "approval_required"
  | "blocked"
  | "needs_review";

export type ActionSemanticsDecision = {
  artifactKind: "intent_action_semantics_decision";
  version: typeof ACTION_SEMANTICS_VERSION;
  allowedRequestedActions: CanonicalRouterAction[];
  allowedConditionalActions: CanonicalRouterAction[];
  blockedActions: CanonicalRouterAction[];
  ignoredMentionedActions: CanonicalRouterAction[];
  negatedActions: CanonicalRouterAction[];
  outcome: ActionSemanticsOutcome;
  reasonCodes: string[];
  runtimeJobCreated: false;
  authorityGranted: false;
  workQueueLifecycleMutationAllowed: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

const DEFAULT_ALLOWED_REQUESTED_ACTIONS = new Set<CanonicalActionCategory>([
  "chat",
  "status",
  "research",
  "plan",
  "code_edit",
  "test",
  "review",
  "docs_update",
  "work_queue_control",
  "closeout",
]);

const HIGH_RISK_ACTIONS = new Set<CanonicalActionCategory>([
  "install_dependency",
  "deploy",
  "outbound_send",
  "model_promotion",
]);

const CONTROL_ACTIONS = new Set<CanonicalActionCategory>(["work_queue_control"]);

const SIDE_EFFECT_BOUNDARY_ACTIONS = new Set<CanonicalActionCategory>([
  ...HIGH_RISK_ACTIONS,
  ...CONTROL_ACTIONS,
]);

export function enforceActionSemantics(input: ActionSemanticsInput): ActionSemanticsDecision {
  const mentionedActions = [...(input.mentionedActions ?? [])];
  const requestedActions = [...(input.requestedActions ?? [])];
  const negatedActions = [...(input.negatedActions ?? [])];
  const conditionalActions = [...(input.conditionalActions ?? [])];
  const allowedRequested = new Set(
    input.allowedRequestedActionCategories ?? Array.from(DEFAULT_ALLOWED_REQUESTED_ACTIONS),
  );
  const approvedHighRisk = new Set(input.approvedHighRiskActionCategories ?? []);
  const negated = new Set(negatedActions.map((action) => action.action));
  const constraintScopedNegated = collectConstraintScopedNegatedActions(
    input.routerReasonCodes ?? [],
  );
  const reasonCodes: string[] = [];
  const allowedRequestedActions: CanonicalRouterAction[] = [];
  const allowedConditionalActions: CanonicalRouterAction[] = [];
  let blockedActions: CanonicalRouterAction[] = [];

  for (const action of requestedActions) {
    if (negated.has(action.action)) {
      if (
        constraintScopedNegated.has(action.action) &&
        !SIDE_EFFECT_BOUNDARY_ACTIONS.has(action.action)
      ) {
        reasonCodes.push(`requested_action_negation_constraint_scoped:${action.action}`);
      } else {
        blockedActions.push(action);
        reasonCodes.push(`requested_action_conflicts_with_negation:${action.action}`);
        continue;
      }
    }
    if (HIGH_RISK_ACTIONS.has(action.action) && !approvedHighRisk.has(action.action)) {
      blockedActions.push(action);
      reasonCodes.push(`requested_action_requires_approval:${action.action}`);
      continue;
    }
    if (!allowedRequested.has(action.action)) {
      blockedActions.push(action);
      reasonCodes.push(`requested_action_not_allowed:${action.action}`);
      continue;
    }
    allowedRequestedActions.push(action);
  }

  for (const action of conditionalActions) {
    if (negated.has(action.action)) {
      blockedActions.push(action);
      reasonCodes.push(`conditional_action_conflicts_with_negation:${action.action}`);
      continue;
    }
    const condition = input.conditionalPolicyByAction?.[action.action] ?? "unmet";
    if (condition === "satisfied") {
      if (HIGH_RISK_ACTIONS.has(action.action) && !approvedHighRisk.has(action.action)) {
        blockedActions.push(action);
        reasonCodes.push(`conditional_action_requires_approval:${action.action}`);
      } else {
        allowedConditionalActions.push(action);
        reasonCodes.push(`conditional_action_policy_satisfied:${action.action}`);
      }
      continue;
    }
    if (condition === "approval_required") {
      blockedActions.push(action);
      reasonCodes.push(`conditional_action_approval_required:${action.action}`);
      continue;
    }
    if (condition === "blocked") {
      blockedActions.push(action);
      reasonCodes.push(`conditional_action_policy_blocked:${action.action}`);
      continue;
    }
    reasonCodes.push(`conditional_action_policy_unmet:${action.action}`);
  }

  for (const action of negatedActions) {
    if (constraintScopedNegated.has(action.action)) {
      reasonCodes.push(`negated_action_constraint_scoped:${action.action}`);
    } else {
      reasonCodes.push(`negated_action_not_compilable:${action.action}`);
    }
  }
  for (const action of mentionedActions) {
    reasonCodes.push(`mentioned_action_display_only:${action.action}`);
  }
  const outcome = decideOutcome(reasonCodes, blockedActions, allowedRequestedActions);
  return {
    artifactKind: "intent_action_semantics_decision",
    version: ACTION_SEMANTICS_VERSION,
    allowedRequestedActions,
    allowedConditionalActions,
    blockedActions,
    ignoredMentionedActions: mentionedActions,
    negatedActions,
    outcome,
    reasonCodes: [...new Set(reasonCodes)].slice(0, 50),
    runtimeJobCreated: false,
    authorityGranted: false,
    workQueueLifecycleMutationAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function collectConstraintScopedNegatedActions(
  reasonCodes: string[],
): Set<CanonicalActionCategory> {
  const scoped = new Set<CanonicalActionCategory>();
  for (const reason of reasonCodes) {
    for (const action of CANONICAL_ACTION_CATEGORIES) {
      if (reason === `invalid_negated_action_repaired_to_constraint_scoped_${action}_action`) {
        scoped.add(action);
      }
    }
  }
  return scoped;
}

function decideOutcome(
  reasonCodes: string[],
  blockedActions: CanonicalRouterAction[],
  allowedRequestedActions: CanonicalRouterAction[],
): ActionSemanticsOutcome {
  const hasPrimaryWork = allowedRequestedActions.length > 0;
  const hasRequestedNegationConflict = reasonCodes.some((reason) =>
    reason.startsWith("requested_action_conflicts_with_negation"),
  );
  if (hasRequestedNegationConflict && !hasPrimaryWork) {
    return "blocked";
  }
  if (
    reasonCodes.some((reason) => reason.startsWith("conditional_action_conflicts_with_negation")) &&
    !hasPrimaryWork
  ) {
    return "blocked";
  }
  if (reasonCodes.some((reason) => reason.startsWith("conditional_action_policy_blocked"))) {
    return "blocked";
  }
  if (
    reasonCodes.some((reason) => reason.startsWith("requested_action_requires_approval")) ||
    reasonCodes.some((reason) => reason.startsWith("conditional_action_requires_approval")) ||
    reasonCodes.some((reason) => reason.startsWith("conditional_action_approval_required"))
  ) {
    return "approval_required";
  }
  if (
    blockedActions.some((action) => !SIDE_EFFECT_BOUNDARY_ACTIONS.has(action.action)) ||
    (blockedActions.length > 0 && !hasPrimaryWork)
  ) {
    return "needs_review";
  }
  return "actions_allowed";
}
