import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  wait: vi.fn(),
  readReply: vi.fn(),
  waitCompletion: vi.fn(),
  latestRun: vi.fn(),
  resolveController: vi.fn(),
  kill: vi.fn(),
  findTask: vi.fn(),
  lifecycleReadback: vi.fn(),
  markRunProgress: vi.fn(),
  diagnosticSnapshot: vi.fn(),
}));

vi.mock("../subagent-spawn.js", () => ({
  spawnSubagentDirect: (...args: unknown[]) => mocks.spawn(...args),
}));

vi.mock("../run-wait.js", () => ({
  waitForAgentRun: (...args: unknown[]) => mocks.wait(...args),
  readLatestAssistantReply: (...args: unknown[]) => mocks.readReply(...args),
}));

vi.mock("../subagent-registry-read.js", () => ({
  getLatestSubagentRunByChildSessionKey: (...args: unknown[]) => mocks.latestRun(...args),
  waitForSettledSubagentCompletion: (...args: unknown[]) => mocks.waitCompletion(...args),
}));

vi.mock("../subagent-control.js", () => ({
  resolveSubagentController: (...args: unknown[]) => mocks.resolveController(...args),
  killControlledSubagentRun: (...args: unknown[]) => mocks.kill(...args),
}));

vi.mock("../../tasks/task-registry.js", () => ({
  findTaskByRunId: (...args: unknown[]) => mocks.findTask(...args),
}));

vi.mock("../../tasks/task-lifecycle-readback.js", () => ({
  buildTaskLifecycleReadback: (...args: unknown[]) => mocks.lifecycleReadback(...args),
}));

vi.mock("../../logging/diagnostic-run-activity.js", () => ({
  markDiagnosticRunProgress: (...args: unknown[]) => mocks.markRunProgress(...args),
  getDiagnosticSessionActivitySnapshot: (...args: unknown[]) => mocks.diagnosticSnapshot(...args),
}));

const { createTaskTool } = await import("./task-tool.js");

const config = {
  agents: {
    entries: {
      main: {
        subagents: { allowAgents: ["planning", "coding"], thinking: "off" as const },
      },
      planning: {
        subagents: {
          allowAgents: ["reviewer", "codebase-researcher", "operator-intent-researcher"],
        },
      },
      reviewer: {
        subagents: { allowAgents: ["review-specialist"] },
        executionWorkspace: { type: "loaded-source" as const, access: "inspect" as const },
      },
      coding: {
        thinkingDefault: "high" as const,
        executionWorkspace: { type: "loaded-source" as const, access: "modify" as const },
      },
      "codebase-researcher": {
        executionWorkspace: { type: "loaded-source" as const, access: "inspect" as const },
      },
      "operator-intent-researcher": {},
      "review-specialist": {
        executionWorkspace: { type: "loaded-source" as const, access: "inspect" as const },
      },
    },
  },
};

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
  return content
    .filter((entry) => entry.type === "text")
    .map((entry) => entry.text ?? "")
    .join("\n");
}

describe("task foreground delegation", () => {
  beforeEach(() => {
    mocks.spawn.mockReset().mockResolvedValue({
      status: "accepted",
      childSessionKey: "agent:reviewer:subagent:child",
      runId: "run-child",
      resolvedModel: "openai/gpt-5.5",
      resolvedProvider: "openai",
    });
    mocks.wait.mockReset().mockResolvedValue({ status: "ok" });
    mocks.readReply.mockReset().mockResolvedValue("Task status: complete\n\nUseful result.");
    mocks.waitCompletion.mockReset().mockResolvedValue({
      runId: "run-child",
      outcome: { status: "ok" },
      endedAt: 200,
      resultText: "Task status: complete\n\nUseful result.",
    });
    mocks.latestRun.mockReset().mockReturnValue(null);
    mocks.resolveController.mockReset().mockReturnValue({
      controllerSessionKey: "agent:main:main",
      callerSessionKey: "agent:main:main",
      callerIsSubagent: false,
      controlScope: "children",
    });
    mocks.kill.mockReset().mockResolvedValue({ status: "ok", killed: 1 });
    mocks.findTask.mockReset().mockReturnValue({ taskId: "task-child" });
    mocks.lifecycleReadback.mockReset().mockReturnValue({ lastRealActivityAt: 100 });
    mocks.markRunProgress.mockReset();
    mocks.diagnosticSnapshot.mockReset().mockReturnValue({});
  });

  it("projects only configured child roles into the schema", () => {
    const tool = createTaskTool({
      config,
      agentSessionKey: "agent:planning:main",
      requesterAgentIdOverride: "planning",
    });
    const agentId = (tool.parameters as { properties?: { agentId?: { enum?: string[] } } })
      .properties?.agentId;
    expect(agentId?.enum).toEqual([
      "codebase-researcher",
      "operator-intent-researcher",
      "reviewer",
    ]);
    expect(tool.executionMode).toBe("parallel");
  });

  it("uses the target reasoning profile and exposes no model-authored override", async () => {
    const tool = createTaskTool({
      config,
      agentSessionKey: "agent:main:main",
      requesterAgentIdOverride: "main",
    });
    const properties = (tool.parameters as { properties?: Record<string, unknown> }).properties;

    expect(properties).not.toHaveProperty("thinking");

    await tool.execute("call", {
      agentId: "coding",
      task: "Implement the accepted plan.",
      systemChange: true,
    });

    expect(mocks.spawn).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "coding",
        thinking: "high",
      }),
      expect.any(Object),
    );
  });

  it("projects only Reviewer's specialist and withholds model-authored cwd", () => {
    const tool = createTaskTool({
      config,
      agentSessionKey: "agent:reviewer:main",
      requesterAgentIdOverride: "reviewer",
    });
    const properties = (
      tool.parameters as {
        properties?: {
          agentId?: { enum?: string[] };
          checkout?: { const?: string };
          cwd?: unknown;
        };
      }
    ).properties;

    expect(properties?.agentId?.enum).toEqual(["review-specialist"]);
    expect(properties?.checkout?.const).toBe("loaded_system");
    expect(properties).not.toHaveProperty("cwd");
  });

  it("transports Main's exact operator request without changing child ownership", async () => {
    const inbound = "Preserve this exact request.\nSecond line.";
    const tool = createTaskTool({
      config,
      agentSessionKey: "agent:main:main",
      parentRunId: "run-parent",
      requesterAgentIdOverride: "main",
      currentInboundMessage: inbound,
    });
    await tool.execute("call", { agentId: "planning", task: "Produce the plan." });

    const [spawnParams, spawnContext] = mocks.spawn.mock.calls[0] ?? [];
    expect(spawnParams.task).toContain(inbound);
    expect(spawnParams.task).toContain(createHash("sha256").update(inbound).digest("hex"));
    expect(spawnParams).toMatchObject({
      agentId: "planning",
      mode: "run",
      cleanup: "keep",
      context: "isolated",
      expectsCompletionMessage: false,
    });
    expect(spawnParams).not.toHaveProperty("runTimeoutSeconds");
    expect(spawnContext).toMatchObject({
      requesterTurnRunId: "run-parent",
      requesterRunId: "run-parent",
    });
  });

  it("uses target executionWorkspace policy instead of a model-authored source path", async () => {
    const tool = createTaskTool({
      config,
      agentSessionKey: "agent:planning:main",
      requesterAgentIdOverride: "planning",
    });
    await tool.execute("call", {
      agentId: "codebase-researcher",
      task: "Inspect the source.",
      checkout: "loaded_system",
    });

    expect(mocks.spawn).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "codebase-researcher",
        executionWorkspace: { type: "loaded-source", access: "inspect" },
        context: "isolated",
      }),
      expect.any(Object),
    );
  });

  it("binds Reviewer's specialist to its native inspect-only loaded-source workspace", async () => {
    const tool = createTaskTool({
      config,
      agentSessionKey: "agent:reviewer:main",
      requesterAgentIdOverride: "reviewer",
    });
    await tool.execute("call", {
      agentId: "review-specialist",
      task: "Challenge one current-source ownership claim.",
      checkout: "loaded_system",
    });

    expect(mocks.spawn).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "review-specialist",
        executionWorkspace: { type: "loaded-source", access: "inspect" },
        context: "isolated",
        lightContext: true,
      }),
      expect.any(Object),
    );
  });

  it("lets Reviewer inspect exact loaded source directly when the task requests it", async () => {
    const tool = createTaskTool({
      config,
      agentSessionKey: "agent:planning:main",
      requesterAgentIdOverride: "planning",
    });
    await tool.execute("call", {
      agentId: "reviewer",
      task: "Review one bounded current-source claim.",
      checkout: "loaded_system",
    });

    expect(mocks.spawn).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "reviewer",
        executionWorkspace: { type: "loaded-source", access: "inspect" },
      }),
      expect.any(Object),
    );
  });

  it("keeps an authorized Reviewer in its ordinary workspace when no checkout is requested", async () => {
    const tool = createTaskTool({
      config,
      agentSessionKey: "agent:planning:main",
      requesterAgentIdOverride: "planning",
    });
    await tool.execute("call", {
      agentId: "reviewer",
      task: "Review the exact plan artifact.",
    });

    const [spawnParams] = mocks.spawn.mock.calls[0] ?? [];
    expect(spawnParams).not.toHaveProperty("executionWorkspace");
    expect(spawnParams).not.toHaveProperty("cwd");
  });

  it("uses the target operator-intent profile with lightweight native context", async () => {
    const tool = createTaskTool({
      config,
      agentSessionKey: "agent:planning:main",
      requesterAgentIdOverride: "planning",
    });
    await tool.execute("call", {
      agentId: "operator-intent-researcher",
      task: "Identify only ambiguities that can change the architecture.",
    });

    expect(mocks.spawn).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "operator-intent-researcher",
        context: "isolated",
        lightContext: true,
      }),
      expect.any(Object),
    );
  });

  it("requires configured loaded-source authorization for semantic checkout requests", async () => {
    const tool = createTaskTool({
      config: {
        agents: {
          entries: {
            planning: { subagents: { allowAgents: ["codebase-researcher"] } },
            "codebase-researcher": {},
          },
        },
      },
      agentSessionKey: "agent:planning:main",
      requesterAgentIdOverride: "planning",
    });
    const result = await tool.execute("call", {
      agentId: "codebase-researcher",
      task: "Inspect source.",
      checkout: "loaded_system",
    });

    expect((result as { details?: unknown }).details).toMatchObject({
      status: "error",
      error: "codebase-researcher is not configured for loaded-source inspection",
    });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("keeps docs and standards research on its native workspace", async () => {
    const tool = createTaskTool({
      config: {
        agents: {
          entries: {
            planning: { subagents: { allowAgents: ["docs-standards-researcher"] } },
            "docs-standards-researcher": {},
          },
        },
      },
      agentSessionKey: "agent:planning:main",
      requesterAgentIdOverride: "planning",
    });
    const result = await tool.execute("call", {
      agentId: "docs-standards-researcher",
      task: "Inspect official documentation.",
      checkout: "loaded_system",
    });

    expect((result as { details?: unknown }).details).toMatchObject({
      status: "error",
      error: "docs-standards-researcher is not configured for loaded-source inspection",
    });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("keeps waiting through bounded wait-RPC timeouts", async () => {
    mocks.wait
      .mockResolvedValueOnce({ status: "timeout" })
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "ok" });
    const result = await createTaskTool({
      config,
      agentSessionKey: "agent:planning:main",
      requesterAgentIdOverride: "planning",
    }).execute("call", { agentId: "reviewer", task: "Review the plan." });

    expect(mocks.wait).toHaveBeenCalledTimes(3);
    expect(textOf(result)).toContain('state="completed"');
    expect(textOf(result)).toContain("<task_result>");
  });

  it("uses the native durable completion without rebuilding output through chat history", async () => {
    mocks.readReply.mockRejectedValue(new Error("session history is rebuilding; retry shortly"));

    const result = await createTaskTool({
      config,
      agentSessionKey: "agent:planning:main",
      requesterAgentIdOverride: "planning",
    }).execute("call", { agentId: "reviewer", task: "Review the plan." });

    expect(textOf(result)).toContain("Useful result.");
    expect(mocks.waitCompletion).toHaveBeenCalledWith({
      taskRunId: "run-child",
      childSessionKey: "agent:reviewer:subagent:child",
      signal: undefined,
    });
    expect(mocks.readReply).not.toHaveBeenCalled();
  });

  it("falls back to legacy history only when no native registry row exists", async () => {
    mocks.waitCompletion.mockResolvedValue(null);
    mocks.readReply.mockResolvedValue("Task status: complete\n\nLegacy result.");

    const result = await createTaskTool({
      config,
      agentSessionKey: "agent:planning:main",
      requesterAgentIdOverride: "planning",
    }).execute("call", { agentId: "reviewer", task: "Review the plan." });

    expect(textOf(result)).toContain("Legacy result.");
    expect(mocks.readReply).toHaveBeenCalledTimes(1);
  });

  it("reports a clean missing-result error when legacy history is rebuilding", async () => {
    mocks.waitCompletion.mockResolvedValue(null);
    mocks.readReply.mockRejectedValue(new Error("session history is rebuilding; retry shortly"));

    const result = await createTaskTool({
      config,
      agentSessionKey: "agent:planning:main",
      requesterAgentIdOverride: "planning",
    }).execute("call", { agentId: "reviewer", task: "Review the plan." });

    expect((result as { details?: unknown }).details).toMatchObject({
      status: "error",
      error: "child task produced no assistant result",
    });
  });

  it("projects advancing native child activity into parent liveness", async () => {
    mocks.wait
      .mockResolvedValueOnce({ status: "timeout" })
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "ok" });
    mocks.lifecycleReadback
      .mockReturnValueOnce({ lastRealActivityAt: 100 })
      .mockReturnValueOnce({ lastRealActivityAt: 200 })
      .mockReturnValueOnce({ lastRealActivityAt: 200 });

    await createTaskTool({
      config,
      agentSessionKey: "agent:planning:main",
      parentRunId: "run-parent",
      requesterAgentIdOverride: "planning",
    }).execute("call", { agentId: "reviewer", task: "Review the plan." });

    expect(mocks.findTask).toHaveBeenCalledWith("run-child");
    expect(mocks.markRunProgress).toHaveBeenCalledTimes(1);
    expect(mocks.markRunProgress).toHaveBeenCalledWith({
      runId: "run-parent",
      sessionKey: "agent:planning:main",
      reason: "foreground_task:child_progress",
    });
  });

  it("propagates nested foreground progress from the child diagnostic owner", async () => {
    mocks.wait.mockResolvedValueOnce({ status: "timeout" }).mockResolvedValueOnce({ status: "ok" });
    mocks.lifecycleReadback.mockReturnValue({ lastRealActivityAt: 100 });
    mocks.diagnosticSnapshot
      .mockReturnValueOnce({ lastProgressAgeMs: 10_000 })
      .mockReturnValueOnce({ lastProgressAgeMs: 1_000 });

    await createTaskTool({
      config,
      agentSessionKey: "agent:main:main",
      parentRunId: "run-parent",
      requesterAgentIdOverride: "main",
    }).execute("call", { agentId: "planning", task: "Plan through bounded children." });

    expect(mocks.diagnosticSnapshot).toHaveBeenCalledWith(
      { sessionKey: "agent:reviewer:subagent:child" },
      expect.any(Number),
    );
    expect(mocks.markRunProgress).toHaveBeenCalledTimes(1);
  });

  it("does not manufacture progress for a stalled foreground child", async () => {
    mocks.wait.mockResolvedValueOnce({ status: "timeout" }).mockResolvedValueOnce({ status: "ok" });
    mocks.lifecycleReadback.mockReturnValue({ lastRealActivityAt: 100 });

    await createTaskTool({
      config,
      agentSessionKey: "agent:planning:main",
      parentRunId: "run-parent",
      requesterAgentIdOverride: "planning",
    }).execute("call", { agentId: "reviewer", task: "Review the plan." });

    expect(mocks.markRunProgress).not.toHaveBeenCalled();
  });

  it("keeps large child output behind native transcript pointers", async () => {
    mocks.waitCompletion.mockResolvedValue({
      runId: "run-child",
      outcome: { status: "ok" },
      endedAt: 200,
      resultText: `Task status: complete\n\n${"x".repeat(13_000)}`,
    });
    const result = await createTaskTool({
      config,
      agentSessionKey: "agent:planning:main",
      requesterAgentIdOverride: "planning",
    }).execute("call", { agentId: "reviewer", task: "Review the plan." });

    expect(textOf(result)).toContain('<task_result_ref kind="session"');
    expect(textOf(result)).toContain('<task_result_ref kind="transcript_final"');
    expect(textOf(result)).not.toContain("<task_result>");
  });

  it("cancels the exact owned child when the parent run aborts", async () => {
    const controller = new AbortController();
    mocks.latestRun.mockReturnValue({
      runId: "run-child",
      childSessionKey: "agent:reviewer:subagent:child",
    });
    mocks.spawn.mockImplementationOnce(async () => {
      controller.abort();
      return {
        status: "accepted",
        childSessionKey: "agent:reviewer:subagent:child",
        runId: "run-child",
      };
    });

    const result = await createTaskTool({
      config,
      agentSessionKey: "agent:planning:main",
      requesterAgentIdOverride: "planning",
    }).execute("call", { agentId: "reviewer", task: "Review." }, controller.signal);

    expect(mocks.kill).toHaveBeenCalledWith(
      expect.objectContaining({
        entry: expect.objectContaining({ runId: "run-child" }),
      }),
    );
    expect((result as { details?: unknown }).details).toMatchObject({
      status: "error",
      error: "task wait cancelled",
    });
  });
});
