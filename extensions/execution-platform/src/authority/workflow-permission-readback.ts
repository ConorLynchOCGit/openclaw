export const WORKFLOW_PERMISSION_READBACK_VERSION =
  "execution-platform.workflow-permission-readback.v1";

export type WorkflowPermissionDecisionStatus =
  | "allowed_workflow_scope"
  | "allowed_local_repo_work"
  | "approval_required"
  | "blocked"
  | "needs_review";

export type WorkflowPermissionReadbackDecision =
  | "allowed_by_coding_worker_contract"
  | "requires_owner_approval"
  | "requires_separate_workflow"
  | "blocked_by_policy"
  | "not_applicable_for_workflow"
  | "unknown_or_unproven";

export type WorkflowPermissionReadback = {
  artifactKind: "workflow_permission_readback";
  permissionModelId: string;
  permissionModelVersion: typeof WORKFLOW_PERMISSION_READBACK_VERSION;
  workflowId: string;
  authorityProfile: string;
  localRepoWorkAllowed: boolean;
  deployRequiresApproval: true;
  outboundRequiresApproval: true;
  installRequiresApproval: true;
  secretsBlocked: true;
  destructiveDbMutationBlocked: true;
  modelPromotionBlocked: true;
  workQueueLifecycleMutationBlocked: true;
  decision: WorkflowPermissionDecisionStatus;
  readbackDecision: WorkflowPermissionReadbackDecision;
  rolePermissionSummaries: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  secretsStored: false;
  workQueueLifecycleMutated: false;
};

export function createWorkflowPermissionReadback(input?: {
  workflowId?: string | null;
  authorityProfile?: string | null;
}): WorkflowPermissionReadback {
  const workflowId = boundText(input?.workflowId ?? "agent_team.coding", 120);
  const authorityProfile = boundText(input?.authorityProfile ?? "local_yolo", 120);
  const policy = workflowPolicy(workflowId);
  return {
    artifactKind: "workflow_permission_readback",
    permissionModelId: policy.permissionModelId,
    permissionModelVersion: WORKFLOW_PERMISSION_READBACK_VERSION,
    workflowId,
    authorityProfile,
    localRepoWorkAllowed: policy.localRepoWorkAllowed,
    deployRequiresApproval: true,
    outboundRequiresApproval: true,
    installRequiresApproval: true,
    secretsBlocked: true,
    destructiveDbMutationBlocked: true,
    modelPromotionBlocked: true,
    workQueueLifecycleMutationBlocked: true,
    decision: policy.decision,
    readbackDecision: policy.readbackDecision,
    rolePermissionSummaries: policy.rolePermissionSummaries,
    reasonCodes: policy.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
  };
}

function workflowPolicy(workflowId: string): {
  permissionModelId: string;
  localRepoWorkAllowed: boolean;
  decision: WorkflowPermissionDecisionStatus;
  readbackDecision: WorkflowPermissionReadbackDecision;
  rolePermissionSummaries: string[];
  reasonCodes: string[];
} {
  switch (workflowId) {
    case "agent_team.coding":
      return {
        permissionModelId: "permission-model://agent_team.coding/local-repo-latitude.v1",
        localRepoWorkAllowed: true,
        decision: "allowed_local_repo_work",
        readbackDecision: "allowed_by_coding_worker_contract",
        rolePermissionSummaries: [
          "implementation engineer may inspect and edit bounded repo files",
          "test engineer may run focused validation",
          "reviewer may review bounded artifacts and closeout evidence",
        ],
        reasonCodes: ["coding_team_workflow_scope_allowed"],
      };
    case "agent_team.architecture":
      return {
        permissionModelId: "permission-model://agent_team.architecture/spec-review-readback.v1",
        localRepoWorkAllowed: false,
        decision: "allowed_workflow_scope",
        readbackDecision: "not_applicable_for_workflow",
        rolePermissionSummaries: [
          "technical spec writer may produce bounded architecture/spec artifacts",
          "reviewer may review spec quality and child workflow handoff needs",
          "observability scribe may record closeout evidence",
        ],
        reasonCodes: ["architecture_workflow_permission_model_attached"],
      };
    case "agent_team.qa_test":
      return {
        permissionModelId: "permission-model://agent_team.qa_test/test-review-readback.v1",
        localRepoWorkAllowed: true,
        decision: "allowed_workflow_scope",
        readbackDecision: "not_applicable_for_workflow",
        rolePermissionSummaries: [
          "qa reviewer may inspect tests and validation evidence",
          "failure triage reviewer may classify failures and required fixes",
          "observability scribe may record closeout evidence",
        ],
        reasonCodes: ["qa_test_workflow_permission_model_attached"],
      };
    default:
      return {
        permissionModelId: `permission-model://${workflowId || "unknown"}/needs-review.v1`,
        localRepoWorkAllowed: false,
        decision: "needs_review",
        readbackDecision: "unknown_or_unproven",
        rolePermissionSummaries: ["workflow-specific permission model is not configured"],
        reasonCodes: ["workflow_permission_model_needs_review"],
      };
  }
}

function boundText(value: string, maxChars: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxChars);
}
