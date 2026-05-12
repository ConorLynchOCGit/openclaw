export const CODING_TEAM_PERMISSION_MODEL_VERSION =
  "execution-platform.coding-team-permission-model.v1";
export const CODING_TEAM_PERMISSION_MODEL_ID =
  "permission-model://agent_team.coding/local-repo-latitude.v1";

export const CODING_TEAM_LOCAL_REPO_ACTION_KINDS = [
  "repo_read",
  "git_inspect",
  "file_search",
  "file_edit",
  "test_run",
  "validation_run",
  "docs_update",
  "artifact_write",
  "closeout_emit",
] as const;

export const CODING_TEAM_APPROVAL_REQUIRED_ACTION_KINDS = [
  "production_deploy",
  "external_outbound_send",
  "install_dependency",
  "gateway_restart",
] as const;

export const CODING_TEAM_BLOCKED_ACTION_KINDS = [
  "secrets_access",
  "destructive_db_mutation",
  "model_promotion",
  "authority_change",
  "work_queue_lifecycle_mutation",
  "raw_storage",
  "arbitrary_shell_from_text",
] as const;

export type CodingTeamLocalRepoActionKind = (typeof CODING_TEAM_LOCAL_REPO_ACTION_KINDS)[number];
export type CodingTeamApprovalRequiredActionKind =
  (typeof CODING_TEAM_APPROVAL_REQUIRED_ACTION_KINDS)[number];
export type CodingTeamBlockedActionKind = (typeof CODING_TEAM_BLOCKED_ACTION_KINDS)[number];
export type CodingTeamPermissionActionKind =
  | CodingTeamLocalRepoActionKind
  | CodingTeamApprovalRequiredActionKind
  | CodingTeamBlockedActionKind
  | "unknown";

export type CodingTeamPermissionDecisionStatus =
  | "allowed_local_repo_work"
  | "approval_required"
  | "blocked"
  | "needs_review";

export type CodingTeamPermissionReadbackDecision =
  | "allowed_by_coding_worker_contract"
  | "requires_owner_approval"
  | "requires_separate_workflow"
  | "blocked_by_policy"
  | "not_applicable_for_workflow"
  | "unknown_or_unproven";

export type CodingTeamPermissionActionDecision = {
  artifactKind: "coding_team_permission_action_decision";
  permissionModelVersion: typeof CODING_TEAM_PERMISSION_MODEL_VERSION;
  permissionModelId: typeof CODING_TEAM_PERMISSION_MODEL_ID;
  actionId: string;
  actionKind: CodingTeamPermissionActionKind;
  workflowId: string;
  actorRef: string | null;
  sessionRef: string | null;
  authorityProfile: string;
  decision: CodingTeamPermissionDecisionStatus;
  readbackDecision: CodingTeamPermissionReadbackDecision;
  allowed: boolean;
  requiresApproval: boolean;
  requiredApprovalRefs: string[];
  boundedSummary: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  secretsStored: false;
  workQueueLifecycleMutated: false;
};

export type CodingTeamPermissionPlan = {
  artifactKind: "coding_team_permission_plan";
  permissionModelVersion: typeof CODING_TEAM_PERMISSION_MODEL_VERSION;
  permissionModelId: typeof CODING_TEAM_PERMISSION_MODEL_ID;
  workflowId: string;
  actorRef: string | null;
  sessionRef: string | null;
  authorityProfile: string;
  decision: CodingTeamPermissionDecisionStatus;
  readbackDecision: CodingTeamPermissionReadbackDecision;
  actionDecisions: CodingTeamPermissionActionDecision[];
  allowedLocalActionSummaries: string[];
  approvalRequiredActionSummaries: string[];
  blockedActionSummaries: string[];
  needsReviewActionSummaries: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  secretsStored: false;
  workQueueLifecycleMutated: false;
};

export type CodingTeamPermissionActionInput = {
  actionId: string;
  actionKind: CodingTeamPermissionActionKind;
  workflowId?: string | null;
  actorRef?: string | null;
  sessionRef?: string | null;
  authorityProfile?: string | null;
  boundedSummary: string;
};

export type CodingTeamPermissionPlanInput = {
  workflowId?: string | null;
  actorRef?: string | null;
  sessionRef?: string | null;
  authorityProfile?: string | null;
  actions: Array<{
    actionId: string;
    actionKind: CodingTeamPermissionActionKind;
    boundedSummary: string;
  }>;
};

export function evaluateCodingTeamPermissionAction(
  input: CodingTeamPermissionActionInput,
): CodingTeamPermissionActionDecision {
  const workflowId = boundText(input.workflowId ?? "agent_team.coding", 120);
  const authorityProfile = boundText(input.authorityProfile ?? "local_yolo", 120);
  const boundedSummary = boundText(input.boundedSummary, 240);
  const base = {
    artifactKind: "coding_team_permission_action_decision" as const,
    permissionModelVersion:
      CODING_TEAM_PERMISSION_MODEL_VERSION as typeof CODING_TEAM_PERMISSION_MODEL_VERSION,
    permissionModelId: CODING_TEAM_PERMISSION_MODEL_ID as typeof CODING_TEAM_PERMISSION_MODEL_ID,
    actionId: boundText(input.actionId, 120),
    actionKind: input.actionKind,
    workflowId,
    actorRef: input.actorRef ? boundText(input.actorRef, 120) : null,
    sessionRef: input.sessionRef ? boundText(input.sessionRef, 120) : null,
    authorityProfile,
    boundedSummary,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawLogsStored: false as const,
    secretsStored: false as const,
    workQueueLifecycleMutated: false as const,
  };

  if (workflowId !== "agent_team.coding") {
    return {
      ...base,
      decision: "needs_review",
      readbackDecision: "requires_separate_workflow",
      allowed: false,
      requiresApproval: false,
      requiredApprovalRefs: [],
      reasonCodes: ["coding_team_permission_requires_separate_workflow"],
    };
  }

  if (isLocalRepoAction(input.actionKind)) {
    return {
      ...base,
      decision: "allowed_local_repo_work",
      readbackDecision: "allowed_by_coding_worker_contract",
      allowed: true,
      requiresApproval: false,
      requiredApprovalRefs: [],
      reasonCodes: ["coding_team_local_repo_work_allowed"],
    };
  }

  if (isApprovalRequiredAction(input.actionKind)) {
    return {
      ...base,
      decision: "approval_required",
      readbackDecision: "requires_owner_approval",
      allowed: false,
      requiresApproval: true,
      requiredApprovalRefs: [`approval://${input.actionKind}`],
      reasonCodes: [`coding_team_${input.actionKind}_requires_approval`],
    };
  }

  if (isBlockedAction(input.actionKind)) {
    return {
      ...base,
      decision: "blocked",
      readbackDecision: "blocked_by_policy",
      allowed: false,
      requiresApproval: false,
      requiredApprovalRefs: [],
      reasonCodes: [`coding_team_${input.actionKind}_blocked`],
    };
  }

  return {
    ...base,
    decision: "needs_review",
    readbackDecision: "unknown_or_unproven",
    allowed: false,
    requiresApproval: false,
    requiredApprovalRefs: [],
    reasonCodes: ["coding_team_unknown_action_needs_review"],
  };
}

export function evaluateCodingTeamPermissionPlan(
  input: CodingTeamPermissionPlanInput,
): CodingTeamPermissionPlan {
  const actionDecisions = input.actions.map((action) =>
    evaluateCodingTeamPermissionAction({
      ...action,
      workflowId: input.workflowId,
      actorRef: input.actorRef,
      sessionRef: input.sessionRef,
      authorityProfile: input.authorityProfile,
    }),
  );
  const blocked = actionDecisions.filter((decision) => decision.decision === "blocked");
  const approvalRequired = actionDecisions.filter(
    (decision) => decision.decision === "approval_required",
  );
  const needsReview = actionDecisions.filter((decision) => decision.decision === "needs_review");
  const allowed = actionDecisions.filter(
    (decision) => decision.decision === "allowed_local_repo_work",
  );
  const decision: CodingTeamPermissionDecisionStatus =
    blocked.length > 0
      ? "blocked"
      : approvalRequired.length > 0
        ? "approval_required"
        : needsReview.length > 0
          ? "needs_review"
          : "allowed_local_repo_work";
  const readbackDecision: CodingTeamPermissionReadbackDecision =
    blocked.length > 0
      ? "blocked_by_policy"
      : approvalRequired.length > 0
        ? "requires_owner_approval"
        : needsReview.length > 0
          ? needsReview.some((item) => item.readbackDecision === "requires_separate_workflow")
            ? "requires_separate_workflow"
            : "unknown_or_unproven"
          : "allowed_by_coding_worker_contract";
  return {
    artifactKind: "coding_team_permission_plan",
    permissionModelVersion: CODING_TEAM_PERMISSION_MODEL_VERSION,
    permissionModelId: CODING_TEAM_PERMISSION_MODEL_ID,
    workflowId: boundText(input.workflowId ?? "agent_team.coding", 120),
    actorRef: input.actorRef ? boundText(input.actorRef, 120) : null,
    sessionRef: input.sessionRef ? boundText(input.sessionRef, 120) : null,
    authorityProfile: boundText(input.authorityProfile ?? "local_yolo", 120),
    decision,
    readbackDecision,
    actionDecisions,
    allowedLocalActionSummaries: allowed.map((item) => item.boundedSummary),
    approvalRequiredActionSummaries: approvalRequired.map((item) => item.boundedSummary),
    blockedActionSummaries: blocked.map((item) => item.boundedSummary),
    needsReviewActionSummaries: needsReview.map((item) => item.boundedSummary),
    reasonCodes: [...new Set(actionDecisions.flatMap((item) => item.reasonCodes))].slice(0, 40),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function createCodingTeamPermissionReadback(plan?: CodingTeamPermissionPlan | null): {
  artifactKind: "coding_team_permission_readback";
  permissionModelId: typeof CODING_TEAM_PERMISSION_MODEL_ID;
  permissionModelVersion: typeof CODING_TEAM_PERMISSION_MODEL_VERSION;
  localRepoWorkAllowed: boolean;
  deployRequiresApproval: true;
  outboundRequiresApproval: true;
  installRequiresApproval: true;
  secretsBlocked: true;
  destructiveDbMutationBlocked: true;
  modelPromotionBlocked: true;
  workQueueLifecycleMutationBlocked: true;
  decision: CodingTeamPermissionDecisionStatus;
  readbackDecision: CodingTeamPermissionReadbackDecision;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  secretsStored: false;
  workQueueLifecycleMutated: false;
} {
  return {
    artifactKind: "coding_team_permission_readback",
    permissionModelId: CODING_TEAM_PERMISSION_MODEL_ID,
    permissionModelVersion: CODING_TEAM_PERMISSION_MODEL_VERSION,
    localRepoWorkAllowed: !plan || plan.decision === "allowed_local_repo_work",
    deployRequiresApproval: true,
    outboundRequiresApproval: true,
    installRequiresApproval: true,
    secretsBlocked: true,
    destructiveDbMutationBlocked: true,
    modelPromotionBlocked: true,
    workQueueLifecycleMutationBlocked: true,
    decision: plan?.decision ?? "allowed_local_repo_work",
    readbackDecision: plan?.readbackDecision ?? "allowed_by_coding_worker_contract",
    reasonCodes: plan?.reasonCodes ?? ["coding_team_permission_model_attached"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
  };
}

function isLocalRepoAction(
  value: CodingTeamPermissionActionKind,
): value is CodingTeamLocalRepoActionKind {
  return (CODING_TEAM_LOCAL_REPO_ACTION_KINDS as readonly string[]).includes(value);
}

function isApprovalRequiredAction(
  value: CodingTeamPermissionActionKind,
): value is CodingTeamApprovalRequiredActionKind {
  return (CODING_TEAM_APPROVAL_REQUIRED_ACTION_KINDS as readonly string[]).includes(value);
}

function isBlockedAction(
  value: CodingTeamPermissionActionKind,
): value is CodingTeamBlockedActionKind {
  return (CODING_TEAM_BLOCKED_ACTION_KINDS as readonly string[]).includes(value);
}

function boundText(value: string, maxChars: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxChars);
}
