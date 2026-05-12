import { describe, expect, it } from "vitest";
import {
  CODING_TEAM_PERMISSION_MODEL_ID,
  createCodingTeamPermissionReadback,
  evaluateCodingTeamPermissionAction,
  evaluateCodingTeamPermissionPlan,
} from "./coding-team-permission-model.ts";

describe("coding team permission model", () => {
  it("allows local repo work with Codex-like latitude", () => {
    const plan = evaluateCodingTeamPermissionPlan({
      workflowId: "agent_team.coding",
      actorRef: "operator",
      sessionRef: "session-1",
      authorityProfile: "local_yolo",
      actions: [
        { actionId: "edit", actionKind: "file_edit", boundedSummary: "edit bounded repo files" },
        { actionId: "test", actionKind: "test_run", boundedSummary: "run focused tests" },
        { actionId: "review", actionKind: "validation_run", boundedSummary: "review results" },
        { actionId: "closeout", actionKind: "closeout_emit", boundedSummary: "emit closeout" },
      ],
    });

    expect(plan).toMatchObject({
      permissionModelId: CODING_TEAM_PERMISSION_MODEL_ID,
      decision: "allowed_local_repo_work",
      readbackDecision: "allowed_by_coding_worker_contract",
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
      workQueueLifecycleMutated: false,
    });
    expect(plan.allowedLocalActionSummaries).toHaveLength(4);
    expect(plan.approvalRequiredActionSummaries).toEqual([]);
    expect(plan.blockedActionSummaries).toEqual([]);
  });

  it("keeps deploy, outbound, install, and gateway restart behind approval", () => {
    for (const actionKind of [
      "production_deploy",
      "external_outbound_send",
      "install_dependency",
      "gateway_restart",
    ] as const) {
      const decision = evaluateCodingTeamPermissionAction({
        actionId: actionKind,
        actionKind,
        workflowId: "agent_team.coding",
        authorityProfile: "local_yolo",
        boundedSummary: `${actionKind} request`,
      });
      expect(decision).toMatchObject({
        decision: "approval_required",
        readbackDecision: "requires_owner_approval",
        allowed: false,
        requiresApproval: true,
        requiredApprovalRefs: [`approval://${actionKind}`],
      });
    }
  });

  it("blocks secrets, destructive DB work, model promotion, authority changes, raw storage, and lifecycle mutation", () => {
    for (const actionKind of [
      "secrets_access",
      "destructive_db_mutation",
      "model_promotion",
      "authority_change",
      "work_queue_lifecycle_mutation",
      "raw_storage",
      "arbitrary_shell_from_text",
    ] as const) {
      const decision = evaluateCodingTeamPermissionAction({
        actionId: actionKind,
        actionKind,
        workflowId: "agent_team.coding",
        authorityProfile: "local_yolo",
        boundedSummary: `${actionKind} request`,
      });
      expect(decision).toMatchObject({
        decision: "blocked",
        readbackDecision: "blocked_by_policy",
        allowed: false,
        requiresApproval: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
        workQueueLifecycleMutated: false,
      });
    }
  });

  it("keeps wrong workflow and unknown action kinds in needs-review", () => {
    expect(
      evaluateCodingTeamPermissionAction({
        actionId: "wrong-workflow",
        actionKind: "file_edit",
        workflowId: "single_agent.web_research",
        boundedSummary: "edit from wrong workflow",
      }),
    ).toMatchObject({
      decision: "needs_review",
      readbackDecision: "requires_separate_workflow",
      allowed: false,
      reasonCodes: ["coding_team_permission_requires_separate_workflow"],
    });
    expect(
      evaluateCodingTeamPermissionAction({
        actionId: "unknown",
        actionKind: "unknown",
        workflowId: "agent_team.coding",
        boundedSummary: "unknown action",
      }),
    ).toMatchObject({
      decision: "needs_review",
      allowed: false,
      reasonCodes: ["coding_team_unknown_action_needs_review"],
      readbackDecision: "unknown_or_unproven",
    });
  });

  it("exposes bounded human-readable readback evidence", () => {
    const readback = createCodingTeamPermissionReadback();
    expect(readback).toMatchObject({
      artifactKind: "coding_team_permission_readback",
      readbackDecision: "allowed_by_coding_worker_contract",
      localRepoWorkAllowed: true,
      deployRequiresApproval: true,
      outboundRequiresApproval: true,
      installRequiresApproval: true,
      secretsBlocked: true,
      destructiveDbMutationBlocked: true,
      modelPromotionBlocked: true,
      workQueueLifecycleMutationBlocked: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
      workQueueLifecycleMutated: false,
    });
  });
});
