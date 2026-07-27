import { createTestPluginApi } from "openclaw/plugin-sdk/plugin-test-api";
import { describe, expect, it, vi } from "vitest";
import type { OpenClawPluginApi } from "../runtime-api.js";
import { createLobsterTool } from "./lobster-tool.js";
import { createFakeTaskFlow } from "./taskflow-test-helpers.js";

function fakeApi(): OpenClawPluginApi {
  return createTestPluginApi({
    id: "lobster",
    name: "lobster",
    source: "test",
    runtime: { version: "test" } as OpenClawPluginApi["runtime"],
    resolvePath: (path) => path,
  });
}

function detailsOf(result: { details?: unknown }): Record<string, unknown> {
  if (!result.details || typeof result.details !== "object" || Array.isArray(result.details)) {
    throw new Error("expected structured tool details");
  }
  return result.details as Record<string, unknown>;
}

describe("retained Lobster TaskFlow actions", () => {
  it("creates and revision-safely advances one waiting checkpoint without a pipeline", async () => {
    const runner = { run: vi.fn() };
    const taskFlow = createFakeTaskFlow();
    const tool = createLobsterTool(fakeApi(), { runner, taskFlow });

    const created = await tool.execute("checkpoint-create", {
      action: "checkpoint",
      flowControllerId: "tests/checkpoint",
      flowGoal: "Collect one operator answer",
      flowStateJson: '{"questionId":"Q-001"}',
      flowWaitingStep: "await_operator_answer",
    });
    expect(taskFlow.createManaged).toHaveBeenCalledWith({
      controllerId: "tests/checkpoint",
      goal: "Collect one operator answer",
      status: "waiting",
      currentStep: "await_operator_answer",
      stateJson: { questionId: "Q-001" },
    });
    expect(detailsOf(created).status).toBe("waiting");

    const updated = await tool.execute("checkpoint-update", {
      action: "checkpoint",
      flowId: "flow-1",
      flowExpectedRevision: 1,
      flowStateJson: '{"questionId":"Q-002"}',
      flowWaitingStep: "await_operator_Q-002",
    });
    expect(taskFlow.setWaiting).toHaveBeenCalledWith({
      flowId: "flow-1",
      expectedRevision: 1,
      currentStep: "await_operator_Q-002",
      stateJson: { questionId: "Q-002" },
      waitJson: null,
    });
    expect(detailsOf(updated).status).toBe("waiting");
    expect(runner.run).not.toHaveBeenCalled();
  });

  it("finishes the same native flow with its exact terminal step", async () => {
    const runner = { run: vi.fn() };
    const taskFlow = createFakeTaskFlow();
    const tool = createLobsterTool(fakeApi(), { runner, taskFlow });
    const stateJson = { state: "domain_specific_complete" };

    const result = await tool.execute("finish", {
      action: "finish",
      flowId: "flow-1",
      flowExpectedRevision: 1,
      flowCurrentStep: "closed_candidate_complete",
      flowStateJson: JSON.stringify(stateJson),
    });

    expect(taskFlow.finish).toHaveBeenCalledWith({
      flowId: "flow-1",
      expectedRevision: 1,
      currentStep: "closed_candidate_complete",
      stateJson,
    });
    expect(detailsOf(result).status).toBe("succeeded");
    expect(runner.run).not.toHaveBeenCalled();
  });

  it("returns the post-mutation flow and rejects stale or unauthorized correction state", async () => {
    const settled = {
      flowId: "flow-1",
      revision: 2,
      syncMode: "managed" as const,
      controllerId: "tests/lobster",
      ownerKey: "agent:main:main",
      status: "waiting" as const,
      goal: "Run Lobster workflow",
    };
    const taskFlow = createFakeTaskFlow({
      setWaiting: vi.fn().mockReturnValue({ applied: true, flow: settled }),
    });
    const tool = createLobsterTool(fakeApi(), {
      runner: {
        run: vi.fn().mockResolvedValue({
          ok: true,
          status: "needs_approval",
          output: [],
          requiresApproval: {
            type: "approval_request",
            prompt: "Approve?",
            items: [],
            approvalId: "approval-1",
          },
        }),
      },
      taskFlow,
    });
    const result = await tool.execute("run", {
      action: "run",
      pipeline: "noop",
      flowControllerId: "tests/lobster",
      flowGoal: "Run Lobster workflow",
      flowStateJson: '{"lane":"email"}',
    });
    expect(detailsOf(result).flow).toEqual(settled);

    const deniedTaskFlow = createFakeTaskFlow({
      validateCloseoutHandoff: vi.fn().mockReturnValue({
        valid: false,
        code: "revision_conflict",
      }),
    });
    const denied = createLobsterTool(fakeApi(), {
      runner: { run: vi.fn() },
      taskFlow: deniedTaskFlow,
    });
    await expect(
      denied.execute("correction", {
        action: "checkpoint",
        flowControllerId: "tests/correction",
        flowGoal: "Correct closeout",
        flowStateJson: JSON.stringify({
          continuitySchema: "openclaw.taskflow.correction.v1",
          priorFlowId: "flow-terminal",
          priorFlowRevision: 4,
          governingArtifactsDigest: "a".repeat(64),
          governingArtifactCount: 1,
        }),
      }),
    ).rejects.toThrow("TaskFlow correction handoff failed: revision_conflict");
    expect(deniedTaskFlow.createManaged).not.toHaveBeenCalled();
  });
});
