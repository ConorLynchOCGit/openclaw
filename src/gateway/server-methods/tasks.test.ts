/**
 * Tests for task gateway methods and persisted task lifecycle responses.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createResolvedAgentRunReceipt,
  finalizeAgentRunReceipt,
} from "../../agents/run-receipt.js";
import {
  addSubagentRunForTests,
  resetSubagentRegistryForTests,
} from "../../agents/subagent-registry.js";
import {
  createTaskRecord as createTaskRecordOrNull,
  markTaskTerminalById,
  recordTaskProgressByRunId,
  resetTaskRegistryForTests,
} from "../../tasks/runtime-internal.js";
import type { TaskRecord } from "../../tasks/task-registry.types.js";
import { tasksHandlers } from "./tasks.js";
import type { RespondFn } from "./types.js";

const ORIGINAL_STATE_DIR = process.env.OPENCLAW_STATE_DIR;
type TaskResponsePayload = {
  tasks?: Array<Record<string, unknown>>;
  task?: Record<string, unknown>;
  found?: boolean;
  cancelled?: boolean;
};

let stateDir: string;

function createTaskRecord(params: Parameters<typeof createTaskRecordOrNull>[0]): TaskRecord {
  const task = createTaskRecordOrNull(params);
  if (!task) {
    throw new Error("expected task creation to succeed");
  }
  return task;
}

beforeEach(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-gateway-tasks-"));
  process.env.OPENCLAW_STATE_DIR = stateDir;
  resetTaskRegistryForTests();
  resetSubagentRegistryForTests({ persist: false });
});

afterEach(async () => {
  resetTaskRegistryForTests();
  resetSubagentRegistryForTests({ persist: false });
  if (ORIGINAL_STATE_DIR === undefined) {
    delete process.env.OPENCLAW_STATE_DIR;
  } else {
    process.env.OPENCLAW_STATE_DIR = ORIGINAL_STATE_DIR;
  }
  await fs.rm(stateDir, { recursive: true, force: true });
});

function captureRespond() {
  const calls: Parameters<RespondFn>[] = [];
  const respond: RespondFn = (...args) => {
    calls.push(args);
  };
  return { calls, respond };
}

function createContext() {
  return {
    getRuntimeConfig: () => ({}),
  } as never;
}

async function runTaskHandler(
  method: "tasks.list" | "tasks.get" | "tasks.cancel",
  params: Record<string, unknown>,
) {
  const { calls, respond } = captureRespond();
  await tasksHandlers[method]({
    req: { type: "req", id: `req-${method}`, method },
    params,
    respond,
    context: createContext(),
    client: null,
    isWebchatConnect: () => false,
  });
  return {
    calls,
    payload: calls[0]?.[1] as TaskResponsePayload | undefined,
  };
}

async function getTaskPayload(taskId: string) {
  const { calls, payload } = await runTaskHandler("tasks.get", { taskId });
  expect(calls[0]?.[0]).toBe(true);
  expect(payload?.task?.id).toBe(taskId);
  return { calls, payload };
}

describe("tasks gateway handlers", () => {
  it("lists task summaries with SDK-facing statuses and filters", async () => {
    const running = createTaskRecord({
      runtime: "subagent",
      taskKind: "investigation",
      requesterSessionKey: "agent:main:main",
      ownerKey: "agent:main:main",
      scopeKind: "session",
      childSessionKey: "agent:worker:subagent:child",
      agentId: "main",
      runId: "run-running",
      task: "Investigate issue",
      status: "running",
      deliveryStatus: "pending",
    });
    createTaskRecord({
      runtime: "cli",
      requesterSessionKey: "agent:other:main",
      ownerKey: "agent:other:main",
      scopeKind: "session",
      runId: "run-other",
      task: "Other task",
      status: "running",
      deliveryStatus: "pending",
    });

    const { calls, payload } = await runTaskHandler("tasks.list", {
      status: "running",
      agentId: "main",
      sessionKey: "agent:main:main",
    });

    expect(calls[0]?.[0]).toBe(true);
    expect(payload?.tasks).toHaveLength(1);
    const listedTask = payload?.tasks?.[0];
    expect(listedTask?.id).toBe(running.taskId);
    expect(listedTask?.taskId).toBe(running.taskId);
    expect(listedTask?.kind).toBe("investigation");
    expect(listedTask?.runtime).toBe("subagent");
    expect(listedTask?.status).toBe("running");
    expect(listedTask?.title).toBe("Investigate issue");
    expect(listedTask?.agentId).toBe("main");
    expect(listedTask?.sessionKey).toBe("agent:main:main");
    expect(listedTask?.childSessionKey).toBe("agent:worker:subagent:child");
    expect(listedTask?.runId).toBe("run-running");
  });

  it("gets completed tasks with stable completed status", async () => {
    const task = createTaskRecord({
      runtime: "cli",
      requesterSessionKey: "agent:main:main",
      ownerKey: "agent:main:main",
      scopeKind: "session",
      runId: "run-completed",
      task: "Done task",
      status: "succeeded",
      deliveryStatus: "not_applicable",
    });

    const { payload } = await getTaskPayload(task.taskId);

    expect(payload?.task?.status).toBe("completed");
    expect(payload?.task?.title).toBe("Done task");
  });

  it("exposes persisted execution receipts through the native task summary", async () => {
    const receipt = finalizeAgentRunReceipt(
      createResolvedAgentRunReceipt({
        source: {
          kind: "plugin",
          id: "gbrain-context",
          hook: "message_received",
        },
        targetAgentId: "memory-curator",
        resolvedProvider: "openrouter",
        resolvedModel: "anthropic/claude-haiku-4.5",
        runtime: "openclaw",
        contextMode: "lightweight",
      }),
      {
        finalProvider: "openrouter",
        finalModel: "anthropic/claude-haiku-4.5",
        runtime: "openclaw",
        contextMode: "lightweight",
        terminalStatus: "succeeded",
      },
    );
    const task = createTaskRecord({
      runtime: "subagent",
      taskKind: "gbrain-signal-capture",
      requesterSessionKey: "agent:main:main",
      ownerKey: "agent:main:main",
      scopeKind: "session",
      childSessionKey: "agent:memory-curator:subagent:signal",
      agentId: "memory-curator",
      runId: "run-receipt-native-readback",
      task: "Capture GBrain signal",
      status: "succeeded",
      deliveryStatus: "not_applicable",
      executionReceipt: receipt,
    });

    const { payload } = await getTaskPayload(task.taskId);

    expect(payload?.task?.executionReceipt).toMatchObject({
      phase: "finalized",
      source: {
        kind: "plugin",
        id: "gbrain-context",
        hook: "message_received",
      },
      targetAgentId: "memory-curator",
      terminalStatus: "succeeded",
      final: {
        model: "openrouter/anthropic/claude-haiku-4.5",
        runtime: "openclaw",
        contextMode: "lightweight",
      },
      fallback: {
        used: false,
      },
    });
  });

  it("keeps child task summaries as pointers instead of child result projections", async () => {
    addSubagentRunForTests({
      runId: "run-child-result",
      childSessionKey: "agent:researcher:subagent:child-result",
      requesterSessionKey: "agent:planning:main",
      requesterDisplayKey: "planning",
      task: "Research source gaps",
      cleanup: "keep",
      createdAt: 100,
      startedAt: 100,
      endedAt: 200,
      outcome: { status: "ok" },
      completion: {
        required: true,
        resultText: "Child found three concrete routing gaps.",
        capturedAt: 210,
      },
      delivery: { status: "delivered" },
    });
    const task = createTaskRecord({
      runtime: "subagent",
      taskKind: "research-child",
      requesterSessionKey: "agent:planning:main",
      ownerKey: "agent:planning:main",
      scopeKind: "session",
      childSessionKey: "agent:researcher:subagent:child-result",
      agentId: "researcher",
      runId: "run-child-result",
      task: "Research source gaps",
      status: "succeeded",
      deliveryStatus: "not_applicable",
    });

    const { payload } = await getTaskPayload(task.taskId);

    expect(payload?.task).toMatchObject({
      childSessionKey: "agent:researcher:subagent:child-result",
      runId: "run-child-result",
      agentId: "researcher",
    });
    expect(payload?.task?.childResult).toBeUndefined();
    expect(JSON.stringify(payload?.task)).not.toContain("Child found three concrete routing gaps.");
  });

  it("does not project descendant child-run state into parent task summaries", async () => {
    addSubagentRunForTests({
      runId: "run-child-a",
      childSessionKey: "agent:planning:main:subagent:researcher-a",
      requesterSessionKey: "agent:planning:main",
      requesterDisplayKey: "planning",
      task: "Research local gaps",
      cleanup: "keep",
      createdAt: 120,
      startedAt: 120,
      endedAt: 220,
      outcome: { status: "ok" },
      expectsCompletionMessage: true,
      completion: {
        required: true,
        resultText: "Researcher A found a routing gap.",
        capturedAt: 225,
      },
      delivery: { status: "delivered" },
    });
    addSubagentRunForTests({
      runId: "run-child-b",
      childSessionKey: "agent:planning:main:subagent:reviewer-b",
      requesterSessionKey: "agent:planning:main",
      requesterDisplayKey: "planning",
      task: "Review plan",
      cleanup: "keep",
      createdAt: 130,
      startedAt: 130,
      endedAt: 230,
      outcome: { status: "ok" },
      expectsCompletionMessage: true,
      completion: {
        required: true,
        resultText: "Reviewer B found a proof-finality risk.",
        capturedAt: 235,
      },
      delivery: { status: "pending" },
    });
    addSubagentRunForTests({
      runId: "run-stale-child",
      childSessionKey: "agent:planning:main:subagent:stale",
      requesterSessionKey: "agent:planning:main",
      requesterDisplayKey: "planning",
      task: "Old child",
      cleanup: "keep",
      createdAt: 50,
      endedAt: 60,
      outcome: { status: "ok" },
      expectsCompletionMessage: true,
      completion: {
        required: true,
        resultText: "stale child should not appear",
      },
      delivery: { status: "delivered" },
    });
    const task = createTaskRecord({
      runtime: "cli",
      taskKind: "planning-activation",
      requesterSessionKey: "agent:planning:main",
      ownerKey: "agent:planning:main",
      scopeKind: "session",
      childSessionKey: "agent:planning:main",
      agentId: "planning",
      runId: "run-parent-planning",
      task: "Improve research/planning layer",
      status: "running",
      deliveryStatus: "not_applicable",
      startedAt: 110,
    });

    const { payload } = await getTaskPayload(task.taskId);

    expect(payload?.task).toMatchObject({
      childSessionKey: "agent:planning:main",
      runId: "run-parent-planning",
      agentId: "planning",
    });
    expect(payload?.task?.childRuns).toBeUndefined();
    expect(JSON.stringify(payload?.task)).not.toContain("Researcher A found a routing gap.");
    expect(JSON.stringify(payload?.task)).not.toContain("Reviewer B found a proof-finality risk.");
    expect(JSON.stringify(payload?.task)).not.toContain("stale child should not appear");
  });

  it("sanitizes task text before exposing SDK summaries", async () => {
    const task = createTaskRecord({
      runtime: "cli",
      requesterSessionKey: "agent:main:main",
      ownerKey: "agent:main:main",
      scopeKind: "session",
      runId: "run-sanitized",
      label:
        "Compile artifact\nOpenClaw runtime context (internal): Keep internal details private.",
      task: "Compile artifact",
      status: "running",
      deliveryStatus: "pending",
    });
    recordTaskProgressByRunId({
      runId: "run-sanitized",
      progressSummary:
        "Bundling output\nOpenClaw runtime context (internal): Keep internal details private.",
    });
    markTaskTerminalById({
      taskId: task.taskId,
      status: "failed",
      endedAt: Date.now(),
      terminalSummary:
        "Failed after build\nOpenClaw runtime context (internal): Keep internal details private.",
      error: "Tool failed\nOpenClaw runtime context (internal): Keep internal details private.",
    });

    const { calls, payload } = await getTaskPayload(task.taskId);

    expect(payload?.task?.title).toBe("Compile artifact");
    expect(payload?.task?.terminalSummary).toBe("Failed after build");
    expect(payload?.task?.error).toBe("Tool failed");
    expect(JSON.stringify(calls[0]?.[1])).not.toContain("OpenClaw runtime context");
  });

  it("cancels running task records and returns the updated task", async () => {
    const task = createTaskRecord({
      runtime: "cli",
      requesterSessionKey: "agent:main:main",
      ownerKey: "agent:main:main",
      scopeKind: "session",
      runId: "run-cancel",
      task: "Cancelable task",
      status: "running",
      deliveryStatus: "pending",
    });

    const { calls, payload } = await runTaskHandler("tasks.cancel", {
      taskId: task.taskId,
      reason: "user stopped task",
    });

    expect(calls[0]?.[0]).toBe(true);
    expect(payload?.found).toBe(true);
    expect(payload?.cancelled).toBe(true);
    expect(payload?.task?.id).toBe(task.taskId);
    expect(payload?.task?.status).toBe("cancelled");
    expect(payload?.task?.error).toBe("user stopped task");
  });
});
