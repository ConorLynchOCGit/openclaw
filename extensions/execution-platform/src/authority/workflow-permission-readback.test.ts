import { describe, expect, it } from "vitest";
import { createWorkflowPermissionReadback } from "./workflow-permission-readback.ts";

describe("workflow permission readback", () => {
  it("uses coding-team readback for agent_team.coding", () => {
    expect(
      createWorkflowPermissionReadback({
        workflowId: "agent_team.coding",
        authorityProfile: "local_yolo",
      }),
    ).toMatchObject({
      permissionModelId: "permission-model://agent_team.coding/local-repo-latitude.v1",
      decision: "allowed_local_repo_work",
      readbackDecision: "allowed_by_coding_worker_contract",
      localRepoWorkAllowed: true,
      deployRequiresApproval: true,
      outboundRequiresApproval: true,
      installRequiresApproval: true,
      modelPromotionBlocked: true,
      workQueueLifecycleMutationBlocked: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
      workQueueLifecycleMutated: false,
    });
  });

  it("uses workflow-specific readback for architecture and QA instead of coding wrong-workflow", () => {
    const architecture = createWorkflowPermissionReadback({
      workflowId: "agent_team.architecture",
      authorityProfile: "spec_review",
    });
    const qa = createWorkflowPermissionReadback({
      workflowId: "agent_team.qa_test",
      authorityProfile: "test_review",
    });

    expect(architecture.reasonCodes).toEqual(["architecture_workflow_permission_model_attached"]);
    expect(architecture.readbackDecision).toBe("not_applicable_for_workflow");
    expect(JSON.stringify(architecture)).not.toContain("coding_team_permission_wrong_workflow");
    expect(qa.reasonCodes).toEqual(["qa_test_workflow_permission_model_attached"]);
    expect(qa.readbackDecision).toBe("not_applicable_for_workflow");
    expect(JSON.stringify(qa)).not.toContain("coding_team_permission_wrong_workflow");
  });

  it("keeps unknown workflows unproven instead of successful", () => {
    expect(createWorkflowPermissionReadback({ workflowId: "workflow.unknown" })).toMatchObject({
      decision: "needs_review",
      readbackDecision: "unknown_or_unproven",
      localRepoWorkAllowed: false,
      reasonCodes: ["workflow_permission_model_needs_review"],
    });
  });
});
