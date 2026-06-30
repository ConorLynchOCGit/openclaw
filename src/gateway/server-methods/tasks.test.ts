/**
 * Tests for task gateway methods and persisted task lifecycle responses.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    expect(listedTask?.deliveryStatus).toBe("pending");
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
    expect(payload?.task?.deliveryStatus).toBe("not_applicable");
    expect(payload?.task?.title).toBe("Done task");
  });

  it("gets running tasks with readback progress from task execution receipts", async () => {
    const childSessionKey = "agent:coding:subagent:progress-child";
    const startedAt = Date.UTC(2026, 5, 30, 18, 29, 0);
    const lastEventAt = Date.UTC(2026, 5, 30, 18, 30, 0);
    const task = createTaskRecord({
      runtime: "subagent",
      taskKind: "coding-child",
      requesterSessionKey: "agent:main:main",
      ownerKey: "agent:main:main",
      scopeKind: "session",
      childSessionKey,
      agentId: "coding",
      runId: "run-gateway-task-progress",
      task: "Inspect gateway task progress",
      status: "running",
      deliveryStatus: "pending",
      startedAt,
    });
    recordTaskProgressByRunId({
      runId: "run-gateway-task-progress",
      lastEventAt,
      progressSummary: "checking gateway task progress",
    });

    const { payload } = await getTaskPayload(task.taskId);

    expect(payload?.task?.activeProgress).toMatchObject({
      source: "task-run-event",
      ref: `task-event:${task.taskId}:${lastEventAt}:progress`,
      currentPhase: "running",
      activeLabel: "coding",
      observedAt: "2026-06-30T18:30:00.000Z",
      sourceEventType: "task.progress",
      note: "checking gateway task progress",
      pointer: {
        kind: "task",
        ref: task.taskId,
        label: "task run receipt",
      },
      derivedBy: "resolveTaskReadbackProgressProjection",
      bounded: true,
    });
  });

  it("does not read child session trajectory progress for task summaries", async () => {
    const sessionId = "gateway-task-progress-missing-status-child";
    const childSessionKey = "agent:codebase-researcher:subagent:progress-child";
    const sessionsDir = path.join(stateDir, "agents", "codebase-researcher", "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(
      path.join(sessionsDir, "sessions.json"),
      JSON.stringify(
        {
          [childSessionKey]: {
            sessionId,
            updatedAt: Date.now() - 60_000,
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    await fs.writeFile(
      path.join(sessionsDir, `${sessionId}.trajectory.jsonl`),
      `${JSON.stringify({
        traceSchema: "openclaw-trajectory",
        schemaVersion: 1,
        traceId: sessionId,
        source: "runtime",
        type: "tool.call",
        ts: "2026-06-30T19:45:00.000Z",
        seq: 9,
        sourceSeq: 15,
        sessionId,
        sessionKey: childSessionKey,
        data: {
          name: "read",
          phase: "source-inspection",
          elapsedMs: 1500,
          summary: "reading event-spine owner files",
        },
      })}\n`,
      "utf8",
    );
    const task = createTaskRecord({
      runtime: "subagent",
      taskKind: "source-scout",
      requesterSessionKey: "agent:main:phase0z",
      ownerKey: "agent:main:phase0z",
      scopeKind: "session",
      childSessionKey,
      agentId: "codebase-researcher",
      runId: "run-gateway-task-progress-missing-status",
      task: "Inspect event-spine owner files",
      status: "running",
      deliveryStatus: "pending",
      progressSummary: "Child run started.",
    });

    const { payload } = await getTaskPayload(task.taskId);

    expect(payload?.task?.activeProgress).toMatchObject({
      source: "task-run-event",
      ref: `task-event:${task.taskId}:${task.lastEventAt}:running`,
      currentPhase: "running",
      activeLabel: "codebase-researcher",
      sourceEventType: "task.running",
      note: "Child run started.",
      pointer: {
        kind: "task",
        ref: task.taskId,
        label: "task run receipt",
      },
      derivedBy: "resolveTaskReadbackProgressProjection",
      bounded: true,
    });
    expect(payload?.task?.activeProgress).not.toMatchObject({
      ref: `session:${sessionId}`,
      source: "trajectory",
    });
  });

  it("falls back to bounded task-run receipt progress when child session evidence is not indexed", async () => {
    const task = createTaskRecord({
      runtime: "subagent",
      taskKind: "source-scout",
      requesterSessionKey: "agent:main:phase0z",
      ownerKey: "agent:main:phase0z",
      scopeKind: "session",
      childSessionKey: "agent:planning:subagent:not-yet-indexed",
      agentId: "planning",
      runId: "run-gateway-task-progress-unindexed-session",
      task: "Plan native event spine completion",
      status: "running",
      deliveryStatus: "pending",
      startedAt: Date.now() - 2_000,
      lastEventAt: Date.now() - 1_000,
      progressSummary: "Child run started.",
    });

    const { payload } = await getTaskPayload(task.taskId);

    expect(payload?.task?.activeProgress).toMatchObject({
      source: "task-run-event",
      ref: `task-event:${task.taskId}:${task.lastEventAt}:running`,
      currentPhase: "running",
      activeLabel: "planning",
      sourceEventType: "task.running",
      note: "Child run started.",
      pointer: {
        kind: "task",
        ref: task.taskId,
        label: "task run receipt",
      },
      derivedBy: "resolveTaskReadbackProgressProjection",
      bounded: true,
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
      deliveryStatus: "not_applicable",
    });
    expect(payload?.task?.childResult).toBeUndefined();
    expect(JSON.stringify(payload?.task)).not.toContain("Child found three concrete routing gaps.");
  });

  it("keeps long subagent Context Pack progress visible in task readback", async () => {
    const longContextPack = Array.from({ length: 2_100 }, (_, index) => `finding-${index}`).join(
      " ",
    );
    const task = createTaskRecord({
      runtime: "subagent",
      taskKind: "research-child",
      requesterSessionKey: "agent:planning:main",
      ownerKey: "agent:planning:main",
      scopeKind: "session",
      childSessionKey: "agent:codebase-researcher:subagent:child-context-pack",
      agentId: "codebase-researcher",
      runId: "run-child-long-context-pack",
      task: "Inspect codebase and return Context Pack",
      status: "succeeded",
      deliveryStatus: "not_applicable",
      progressSummary: longContextPack,
    });

    const { payload } = await getTaskPayload(task.taskId);

    expect(payload?.task?.progressSummary).toBe(longContextPack);
    expect(String(payload?.task?.progressSummary)).toContain("finding-2099");
    expect(String(payload?.task?.progressSummary)).not.toContain("…");
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
