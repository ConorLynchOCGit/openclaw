// Lobster tests cover lobster tool plugin behavior.
import { createTestPluginApi } from "openclaw/plugin-sdk/plugin-test-api";
import { describe, expect, it, vi } from "vitest";
import type { OpenClawPluginApi, OpenClawPluginToolContext } from "../runtime-api.js";
import { createLobsterTool } from "./lobster-tool.js";
import { createFakeTaskFlow } from "./taskflow-test-helpers.js";

function fakeApi(overrides: Partial<OpenClawPluginApi> = {}): OpenClawPluginApi {
  return createTestPluginApi({
    id: "lobster",
    name: "lobster",
    source: "test",
    runtime: { version: "test" } as any,
    resolvePath: (p) => p,
    ...overrides,
  });
}

function fakeCtx(overrides: Partial<OpenClawPluginToolContext> = {}): OpenClawPluginToolContext {
  return {
    config: {},
    workspaceDir: "/tmp",
    agentDir: "/tmp",
    agentId: "main",
    sessionKey: "main",
    messageChannel: undefined,
    agentAccountId: undefined,
    sandboxed: false,
    ...overrides,
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`expected ${label} to be a record`);
  }
  return value as Record<string, unknown>;
}

describe("lobster plugin tool", () => {
  it("returns the Lobster envelope in details", async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({
        ok: true,
        status: "ok",
        output: [{ hello: "world" }],
        requiresApproval: null,
      }),
    };

    const tool = createLobsterTool(fakeApi(), { runner });
    const res = await tool.execute("call1", {
      action: "run",
      pipeline: "noop",
      timeoutMs: 1000,
    });

    expect(runner.run).toHaveBeenCalledWith({
      action: "run",
      pipeline: "noop",
      cwd: process.cwd(),
      timeoutMs: 1000,
      maxStdoutBytes: 512_000,
    });
    const details = requireRecord(res.details, "lobster tool details");
    expect(details.ok).toBe(true);
    expect(details.status).toBe("ok");
    expect(details.output).toEqual([{ hello: "world" }]);
    expect(details.requiresApproval).toBeNull();
  });

  it("supports approval envelopes without changing the tool contract", async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({
        ok: true,
        status: "needs_approval",
        output: [],
        requiresApproval: {
          type: "approval_request",
          prompt: "Send these alerts?",
          items: [{ id: "alert-1" }],
          resumeToken: "resume-token-1",
        },
      }),
    };

    const tool = createLobsterTool(fakeApi(), { runner });
    const res = await tool.execute("call-injected-runner", {
      action: "run",
      pipeline: "noop",
      argsJson: '{"since_hours":1}',
      timeoutMs: 1500,
      maxStdoutBytes: 4096,
    });

    expect(runner.run).toHaveBeenCalledWith({
      action: "run",
      pipeline: "noop",
      argsJson: '{"since_hours":1}',
      cwd: process.cwd(),
      timeoutMs: 1500,
      maxStdoutBytes: 4096,
    });
    const details = requireRecord(res.details, "approval lobster tool details");
    expect(details.ok).toBe(true);
    expect(details.status).toBe("needs_approval");
    const approval = requireRecord(details.requiresApproval, "approval request");
    expect(approval.type).toBe("approval_request");
    expect(approval.prompt).toBe("Send these alerts?");
    expect(approval.resumeToken).toBe("resume-token-1");
  });

  it("normalizes numeric string run limits before invoking the runner", async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({
        ok: true,
        status: "ok",
        output: [],
        requiresApproval: null,
      }),
    };

    const tool = createLobsterTool(fakeApi(), { runner });
    await tool.execute("call-string-limits", {
      action: "run",
      pipeline: "noop",
      timeoutMs: "1500",
      maxStdoutBytes: "4096",
    });

    expect(runner.run).toHaveBeenCalledWith({
      action: "run",
      pipeline: "noop",
      cwd: process.cwd(),
      timeoutMs: 1500,
      maxStdoutBytes: 4096,
    });
  });

  it("rejects malformed numeric run limits before invoking the runner", async () => {
    const runner = { run: vi.fn() };
    const tool = createLobsterTool(fakeApi(), { runner });

    await expect(
      tool.execute("call-bad-timeout", {
        action: "run",
        pipeline: "noop",
        timeoutMs: "1500.5",
      }),
    ).rejects.toThrow("timeoutMs must be a positive integer");
    await expect(
      tool.execute("call-bad-stdout", {
        action: "run",
        pipeline: "noop",
        maxStdoutBytes: 0,
      }),
    ).rejects.toThrow("maxStdoutBytes must be a positive integer");
    expect(runner.run).not.toHaveBeenCalled();
  });

  it("throws when the runner returns an error envelope", async () => {
    const tool = createLobsterTool(fakeApi(), {
      runner: {
        run: vi.fn().mockResolvedValue({
          ok: false,
          error: {
            type: "runtime_error",
            message: "boom",
          },
        }),
      },
    });

    await expect(
      tool.execute("call-runner-error", {
        action: "run",
        pipeline: "noop",
      }),
    ).rejects.toThrow("boom");
  });

  it("can run through managed TaskFlow mode", async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({
        ok: true,
        status: "needs_approval",
        output: [],
        requiresApproval: {
          type: "approval_request",
          prompt: "Approve this?",
          items: [{ id: "item-1" }],
          resumeToken: "resume-1",
          approvalId: "approval-1",
        },
      }),
    };
    const taskFlow = createFakeTaskFlow();

    const tool = createLobsterTool(fakeApi(), { runner, taskFlow });
    const res = await tool.execute("call-managed-run", {
      action: "run",
      pipeline: "noop",
      flowControllerId: "tests/lobster",
      flowGoal: "Run Lobster workflow",
      flowStateJson: '{"lane":"email"}',
      flowCurrentStep: "run_lobster",
      flowWaitingStep: "await_review",
    });

    expect(taskFlow.createManaged).toHaveBeenCalledWith({
      controllerId: "tests/lobster",
      goal: "Run Lobster workflow",
      currentStep: "run_lobster",
      stateJson: { lane: "email" },
    });
    expect(taskFlow.setWaiting).toHaveBeenCalledWith({
      flowId: "flow-1",
      expectedRevision: 1,
      currentStep: "await_review",
      waitJson: {
        kind: "lobster_approval",
        prompt: "Approve this?",
        items: [{ id: "item-1" }],
        resumeToken: "resume-1",
        approvalId: "approval-1",
      },
    });
    const details = requireRecord(res.details, "managed run lobster tool details");
    expect(details.ok).toBe(true);
    expect(details.status).toBe("needs_approval");
    const flow = requireRecord(details.flow, "managed run flow details");
    expect(flow.flowId).toBe("flow-1");
    expect(flow.revision).toBe(2);
    const mutation = requireRecord(details.mutation, "managed run mutation details");
    expect(mutation.applied).toBe(true);
  });

  it("creates a waiting managed TaskFlow checkpoint without running a pipeline", async () => {
    const runner = { run: vi.fn() };
    const createdFlow = {
      flowId: "flow-checkpoint",
      revision: 1,
      syncMode: "managed" as const,
      controllerId: "tests/checkpoint",
      ownerKey: "agent:main:main",
      status: "waiting" as const,
      goal: "Collect one operator answer",
      currentStep: "await_operator_answer",
      stateJson: { questionId: "Q-001" },
    };
    const createManaged = vi.fn().mockReturnValue(createdFlow);
    const taskFlow = createFakeTaskFlow({ createManaged });
    const tool = createLobsterTool(fakeApi(), { runner, taskFlow });

    const res = await tool.execute("call-managed-checkpoint-create", {
      action: "checkpoint",
      flowControllerId: "tests/checkpoint",
      flowGoal: "Collect one operator answer",
      flowStateJson: '{"questionId":"Q-001"}',
      flowWaitingStep: "await_operator_answer",
    });

    expect(createManaged).toHaveBeenCalledWith({
      controllerId: "tests/checkpoint",
      goal: "Collect one operator answer",
      status: "waiting",
      currentStep: "await_operator_answer",
      stateJson: { questionId: "Q-001" },
    });
    expect(runner.run).not.toHaveBeenCalled();
    const details = requireRecord(res.details, "checkpoint create details");
    expect(details.status).toBe("waiting");
    expect(details.flow).toEqual(createdFlow);
  });

  it("creates a linked correction as a new managed checkpoint with model-authored lineage", async () => {
    const runner = { run: vi.fn() };
    const createdFlow = {
      flowId: "flow-correction",
      revision: 0,
      syncMode: "managed" as const,
      controllerId: "tests/correction",
      ownerKey: "agent:business-ops:subagent:same-owner",
      status: "waiting" as const,
      goal: "Correct closed proposal",
    };
    const createManaged = vi.fn().mockReturnValue(createdFlow);
    const taskFlow = createFakeTaskFlow({ createManaged });
    const tool = createLobsterTool(fakeApi(), { runner, taskFlow });
    const correctionState = {
      continuitySchema: "openclaw.taskflow.correction.v1",
      priorFlowId: "flow-terminal",
      priorFlowRevision: 5,
      governingArtifactsDigest: "a".repeat(64),
      governingArtifactCount: 1,
    };

    await tool.execute("call-linked-correction", {
      action: "checkpoint",
      flowControllerId: "tests/correction",
      flowGoal: "Correct closed proposal",
      flowStateJson: JSON.stringify(correctionState),
      flowWaitingStep: "await_correction_review",
    });

    expect(createManaged).toHaveBeenCalledWith({
      controllerId: "tests/correction",
      goal: "Correct closed proposal",
      status: "waiting",
      currentStep: "await_correction_review",
      stateJson: correctionState,
    });
    expect(taskFlow.validateCloseoutHandoff).toHaveBeenCalledWith({
      stateJson: correctionState,
    });
    expect(runner.run).not.toHaveBeenCalled();
  });

  it("does not create a correction when the exact closeout handoff is stale", async () => {
    const createManaged = vi.fn();
    const taskFlow = createFakeTaskFlow({
      createManaged,
      validateCloseoutHandoff: vi.fn().mockReturnValue({
        valid: false,
        code: "revision_conflict",
      }),
    });
    const tool = createLobsterTool(fakeApi(), { runner: { run: vi.fn() }, taskFlow });

    await expect(
      tool.execute("call-stale-correction", {
        action: "checkpoint",
        flowControllerId: "tests/correction",
        flowGoal: "Correct closed proposal",
        flowStateJson: JSON.stringify({
          continuitySchema: "openclaw.taskflow.correction.v1",
          priorFlowId: "flow-terminal",
          priorFlowRevision: 4,
          governingArtifactsDigest: "a".repeat(64),
          governingArtifactCount: 1,
        }),
      }),
    ).rejects.toThrow(/TaskFlow correction handoff failed: revision_conflict/);
    expect(createManaged).not.toHaveBeenCalled();
  });

  it("revision-safely advances one waiting TaskFlow checkpoint", async () => {
    const runner = { run: vi.fn() };
    const taskFlow = createFakeTaskFlow();
    const tool = createLobsterTool(fakeApi(), { runner, taskFlow });

    const res = await tool.execute("call-managed-checkpoint-update", {
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
    expect(runner.run).not.toHaveBeenCalled();
    const details = requireRecord(res.details, "checkpoint update details");
    const flow = requireRecord(details.flow, "checkpoint update flow");
    expect(details.status).toBe("waiting");
    expect(flow.flowId).toBe("flow-1");
    expect(flow.revision).toBe(2);
  });

  it("revision-safely finishes a managed TaskFlow without inferring from state labels", async () => {
    const runner = { run: vi.fn() };
    const taskFlow = createFakeTaskFlow();
    const tool = createLobsterTool(fakeApi(), { runner, taskFlow });
    const stateJson = {
      schemaVersion: "example.workflow.v1",
      state: "domain_specific_complete",
    };

    const res = await tool.execute("call-managed-finish", {
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
    expect(runner.run).not.toHaveBeenCalled();
    const details = requireRecord(res.details, "finish details");
    const flow = requireRecord(details.flow, "finished flow");
    expect(details.status).toBe("succeeded");
    expect(flow.status).toBe("succeeded");
    expect(flow.revision).toBe(2);
  });

  it("fails a stale or ambiguous managed TaskFlow finish without mutation", async () => {
    const finish = vi.fn().mockReturnValue({
      applied: false,
      code: "revision_conflict",
    });
    const taskFlow = createFakeTaskFlow({ finish });
    const tool = createLobsterTool(fakeApi(), { runner: { run: vi.fn() }, taskFlow });

    await expect(
      tool.execute("call-finish-missing-revision", {
        action: "finish",
        flowId: "flow-1",
      }),
    ).rejects.toThrow(/flowId and flowExpectedRevision are required/);
    await expect(
      tool.execute("call-finish-ambiguous-wait", {
        action: "finish",
        flowId: "flow-1",
        flowExpectedRevision: 1,
        flowWaitingStep: "still_waiting",
      }),
    ).rejects.toThrow(/does not accept flowControllerId, flowGoal, or flowWaitingStep/);
    await expect(
      tool.execute("call-finish-stale", {
        action: "finish",
        flowId: "flow-1",
        flowExpectedRevision: 1,
      }),
    ).rejects.toThrow(/revision_conflict/);
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it("rejects ambiguous or stale managed TaskFlow checkpoint inputs", async () => {
    const taskFlow = createFakeTaskFlow({
      setWaiting: vi.fn().mockReturnValue({
        applied: false,
        code: "revision_conflict",
      }),
    });
    const tool = createLobsterTool(fakeApi(), { runner: { run: vi.fn() }, taskFlow });

    await expect(
      tool.execute("call-checkpoint-missing-state", {
        action: "checkpoint",
        flowControllerId: "tests/checkpoint",
        flowGoal: "Collect one operator answer",
      }),
    ).rejects.toThrow(/flowStateJson required/);
    await expect(
      tool.execute("call-checkpoint-mixed-identity", {
        action: "checkpoint",
        flowControllerId: "tests/checkpoint",
        flowGoal: "Collect one operator answer",
        flowId: "flow-1",
        flowExpectedRevision: 1,
        flowStateJson: "{}",
      }),
    ).rejects.toThrow(/does not accept flowControllerId or flowGoal/);
    await expect(
      tool.execute("call-checkpoint-stale", {
        action: "checkpoint",
        flowId: "flow-1",
        flowExpectedRevision: 1,
        flowStateJson: "{}",
      }),
    ).rejects.toThrow(/revision_conflict/);
  });

  it("rejects managed TaskFlow params when no bound taskFlow runtime is available", async () => {
    const tool = createLobsterTool(fakeApi(), {
      runner: { run: vi.fn() },
    });

    await expect(
      tool.execute("call-missing-taskflow", {
        action: "run",
        pipeline: "noop",
        flowControllerId: "tests/lobster",
        flowGoal: "Run Lobster workflow",
      }),
    ).rejects.toThrow(/Managed TaskFlow run mode requires a bound taskFlow runtime/);
  });

  it("rejects invalid flowStateJson in managed TaskFlow mode", async () => {
    const tool = createLobsterTool(fakeApi(), {
      runner: { run: vi.fn() },
      taskFlow: createFakeTaskFlow(),
    });

    await expect(
      tool.execute("call-invalid-flow-json", {
        action: "run",
        pipeline: "noop",
        flowControllerId: "tests/lobster",
        flowGoal: "Run Lobster workflow",
        flowStateJson: "{bad",
      }),
    ).rejects.toThrow(/flowStateJson must be valid JSON/);
  });

  it("can resume managed TaskFlow mode with only approvalId", async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({
        ok: true,
        status: "ok",
        output: [],
        requiresApproval: null,
      }),
    };
    const taskFlow = createFakeTaskFlow();
    const tool = createLobsterTool(fakeApi(), { runner, taskFlow });

    const res = await tool.execute("call-managed-resume-approval-id", {
      action: "resume",
      approvalId: "approval-1",
      approve: true,
      flowId: "flow-1",
      flowExpectedRevision: 1,
      flowCurrentStep: "resume_lobster",
    });

    expect(taskFlow.resume).toHaveBeenCalledWith({
      flowId: "flow-1",
      expectedRevision: 1,
      status: "running",
      currentStep: "resume_lobster",
    });
    expect(runner.run).toHaveBeenCalledWith({
      action: "resume",
      approvalId: "approval-1",
      approve: true,
      cwd: process.cwd(),
      timeoutMs: 20_000,
      maxStdoutBytes: 512_000,
    });
    const details = requireRecord(res.details, "managed resume lobster tool details");
    expect(details.ok).toBe(true);
    expect(details.status).toBe("ok");
    const mutation = requireRecord(details.mutation, "managed resume mutation details");
    expect(mutation.applied).toBe(true);
  });

  it("normalizes numeric string flowExpectedRevision before managed resume", async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({
        ok: true,
        status: "ok",
        output: [],
        requiresApproval: null,
      }),
    };
    const taskFlow = createFakeTaskFlow();
    const tool = createLobsterTool(fakeApi(), { runner, taskFlow });

    await tool.execute("call-managed-resume-string-revision", {
      action: "resume",
      approvalId: "approval-1",
      approve: true,
      flowId: "flow-1",
      flowExpectedRevision: "1",
      flowCurrentStep: "resume_lobster",
    });

    expect(taskFlow.resume).toHaveBeenCalledWith({
      flowId: "flow-1",
      expectedRevision: 1,
      status: "running",
      currentStep: "resume_lobster",
    });
  });

  it("rejects managed TaskFlow resume mode without a token or approvalId", async () => {
    const tool = createLobsterTool(fakeApi(), {
      runner: { run: vi.fn() },
      taskFlow: createFakeTaskFlow(),
    });

    await expect(
      tool.execute("call-missing-resume-token", {
        action: "resume",
        flowId: "flow-1",
        flowExpectedRevision: 1,
        approve: true,
      }),
    ).rejects.toThrow(/token or approvalId required when using managed TaskFlow resume mode/);
  });

  it("rejects managed TaskFlow resume mode without approve", async () => {
    const tool = createLobsterTool(fakeApi(), {
      runner: { run: vi.fn() },
      taskFlow: createFakeTaskFlow(),
    });

    await expect(
      tool.execute("call-missing-resume-approve", {
        action: "resume",
        token: "resume-token",
        flowId: "flow-1",
        flowExpectedRevision: 1,
      }),
    ).rejects.toThrow(/approve required when using managed TaskFlow resume mode/);
  });

  it("requires action", async () => {
    const tool = createLobsterTool(fakeApi(), {
      runner: { run: vi.fn() },
    });
    await expect(tool.execute("call-action-missing", {})).rejects.toThrow(/action required/);
  });

  it("rejects unknown action", async () => {
    const tool = createLobsterTool(fakeApi(), {
      runner: { run: vi.fn() },
    });
    await expect(
      tool.execute("call-action-unknown", {
        action: "explode",
      }),
    ).rejects.toThrow(/Unknown action/);
  });

  it("rejects absolute cwd", async () => {
    const tool = createLobsterTool(fakeApi(), {
      runner: { run: vi.fn() },
    });
    await expect(
      tool.execute("call-absolute-cwd", {
        action: "run",
        pipeline: "noop",
        cwd: "/tmp",
      }),
    ).rejects.toThrow(/cwd must be a relative path/);
  });

  it("rejects cwd that escapes the gateway working directory", async () => {
    const tool = createLobsterTool(fakeApi(), {
      runner: { run: vi.fn() },
    });
    await expect(
      tool.execute("call-escape-cwd", {
        action: "run",
        pipeline: "noop",
        cwd: "../../etc",
      }),
    ).rejects.toThrow(/must stay within/);
  });

  it("can be gated off in sandboxed contexts", () => {
    const api = fakeApi();
    const factoryTool = (ctx: OpenClawPluginToolContext) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createLobsterTool(api, {
        runner: { run: vi.fn() },
      });
    };

    expect(factoryTool(fakeCtx({ sandboxed: true }))).toBeNull();
    expect(factoryTool(fakeCtx({ sandboxed: false }))?.name).toBe("lobster");
  });
});
