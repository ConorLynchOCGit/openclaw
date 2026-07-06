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
      eventMetadata: {
        nativeEventStream: "tool",
        nativeEventPhase: "running",
        nativeEventToolName: "coding",
      },
    });

    const { payload } = await getTaskPayload(task.taskId);

    expect(payload?.task?.activeProgress).toMatchObject({
      source: "task-receipt",
      ref: `task-event:${task.taskId}:${lastEventAt}:progress`,
      currentPhase: "running",
      activeLabel: "coding",
      observedAt: "2026-06-30T18:30:00.000Z",
      sourceEventType: "agent.tool",
      toolName: "coding",
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

  it("gets Codex-native child role timing from task execution receipts", async () => {
    const startedAt = Date.UTC(2026, 6, 1, 1, 10, 0);
    const task = createTaskRecord({
      runtime: "subagent",
      taskKind: "codex-native",
      requesterSessionKey: "agent:coding:main",
      ownerKey: "agent:coding:main",
      scopeKind: "session",
      sourceId: "codex-thread:child-readback",
      agentId: "coding",
      runId: "codex-thread:child-readback",
      label: "project_explorer",
      task: "Inspect run intelligence owner files before implementation.",
      status: "running",
      deliveryStatus: "not_applicable",
      notifyPolicy: "silent",
      startedAt,
    });
    recordTaskProgressByRunId({
      runId: "codex-thread:child-readback",
      eventSummary: "Codex native subagent spawned.",
      lastEventAt: startedAt + 1,
      eventMetadata: {
        childRole: "project_explorer",
        childAgentPath: "agents/project_explorer.toml",
        childPhase: "child_spawned",
        spawnReason: "Inspect run intelligence owner files before implementation.",
      },
    });

    const { payload } = await getTaskPayload(task.taskId);

    expect(payload?.task?.activeProgress).toMatchObject({
      source: "task-receipt",
      ref: `task-event:${task.taskId}:${startedAt + 1}:progress`,
      currentPhase: "child_spawned",
      activeLabel: "project_explorer",
      sourceEventType: "task.progress",
      note: "Codex native subagent spawned.",
      childRole: "project_explorer",
      childAgentPath: "agents/project_explorer.toml",
      childPhase: "child_spawned",
      spawnReason: "Inspect run intelligence owner files before implementation.",
      pointer: {
        kind: "task",
        ref: task.taskId,
        label: "task run receipt",
      },
      derivedBy: "resolveTaskReadbackProgressProjection",
      bounded: true,
    });
  });

  it("prefers requester trajectory progress before Codex-native child task text", async () => {
    const sessionKey = "agent:coding:main";
    const sessionId = "gateway-codex-child-parent-trajectory";
    const sessionsDir = path.join(stateDir, "agents", "coding", "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(
      path.join(sessionsDir, "sessions.json"),
      JSON.stringify(
        {
          [sessionKey]: {
            sessionId,
            sessionFile: path.join(sessionsDir, `${sessionId}.jsonl`),
            updatedAt: Date.UTC(2026, 6, 1, 1, 20, 0),
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
        ts: "2026-07-01T01:20:00.000Z",
        seq: 4,
        sourceSeq: 9,
        sessionId,
        sessionKey,
        data: {
          name: "bash",
          phase: "validation",
          summary: "parent is running validation",
        },
      })}\n`,
      "utf8",
    );
    const task = createTaskRecord({
      runtime: "subagent",
      taskKind: "codex-native",
      requesterSessionKey: sessionKey,
      ownerKey: sessionKey,
      scopeKind: "session",
      sourceId: "codex-thread:child-self-progress",
      agentId: "coding",
      runId: "codex-thread:child-self-progress",
      label: "project_explorer",
      task: "Inspect lifecycle auditor surfaces.",
      status: "running",
      deliveryStatus: "not_applicable",
      notifyPolicy: "silent",
      progressSummary: "Stale Codex native child prose should not outrank trajectory.",
    });

    const { payload } = await getTaskPayload(task.taskId);

    expect(payload?.task?.activeProgress).toMatchObject({
      source: "trajectory",
      ref: `session:${sessionId}`,
      activeLabel: "bash",
      sourceEventType: "tool.call",
      note: "parent is running validation",
    });
    expect(JSON.stringify(payload?.task?.activeProgress)).not.toContain("project_explorer");
    expect(JSON.stringify(payload?.task?.activeProgress)).not.toContain("agent_path");
  });

  it("lists active task progress from requester session trajectory before stale task text", async () => {
    const sessionKey = "agent:coding:phase0z-event-spine";
    const sessionId = "gateway-task-requester-trajectory";
    const sessionsDir = path.join(stateDir, "agents", "coding", "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(
      path.join(sessionsDir, "sessions.json"),
      JSON.stringify(
        {
          [sessionKey]: {
            sessionId,
            sessionFile: path.join(sessionsDir, `${sessionId}.jsonl`),
            updatedAt: Date.UTC(2026, 5, 30, 20, 0, 0),
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
        ts: "2026-06-30T20:00:00.000Z",
        seq: 7,
        sourceSeq: 21,
        sessionId,
        sessionKey,
        data: {
          name: "spawn_agent",
          phase: "child-work",
          elapsedMs: 5000,
          summary: "project_explorer child is inspecting readback seams",
        },
      })}\n${JSON.stringify({
        traceSchema: "openclaw-trajectory",
        schemaVersion: 1,
        traceId: sessionId,
        source: "runtime",
        type: "tool.result",
        ts: "2026-06-30T20:00:01.000Z",
        seq: 8,
        sourceSeq: 22,
        sessionId,
        sessionKey,
        data: {
          name: "spawn_agent",
          status: "completed",
        },
      })}\n`,
      "utf8",
    );
    const task = createTaskRecord({
      runtime: "cli",
      taskKind: "coding",
      requesterSessionKey: sessionKey,
      ownerKey: sessionKey,
      scopeKind: "session",
      agentId: "coding",
      runId: "run-gateway-requester-trajectory",
      task: "Runtime liveness check for Phase 0Z",
      status: "running",
      deliveryStatus: "pending",
      progressSummary: "Runtime liveness check for Phase 0Z",
    });

    const { calls, payload } = await runTaskHandler("tasks.list", {
      status: "running",
      agentId: "coding",
      sessionKey,
    });

    expect(calls[0]?.[0]).toBe(true);
    expect(payload?.tasks).toHaveLength(1);
    expect(payload?.tasks?.[0]?.id).toBe(task.taskId);
    expect(payload?.tasks?.[0]?.activeProgress).toMatchObject({
      source: "trajectory",
      ref: `session:${sessionId}`,
      currentPhase: "child-work",
      activeLabel: "spawn_agent",
      observedAt: "2026-06-30T20:00:01.000Z",
      elapsedMs: 5000,
      sourceEventType: "tool.result",
      sourceEventSeq: 22,
      note: "project_explorer child is inspecting readback seams",
      pointer: {
        kind: "trajectory",
        ref: `session:${sessionId}`,
        label: "requester session trajectory",
      },
      derivedBy: "readLatestTrajectoryProgressProjection",
      bounded: true,
    });
  });

  it("lists bounded validation failure evidence from requester session trajectory", async () => {
    const sessionKey = "agent:coding:phase0z-validation";
    const sessionId = "gateway-task-requester-validation";
    const sessionsDir = path.join(stateDir, "agents", "coding", "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(
      path.join(sessionsDir, "sessions.json"),
      JSON.stringify(
        {
          [sessionKey]: {
            sessionId,
            sessionFile: path.join(sessionsDir, `${sessionId}.jsonl`),
            updatedAt: Date.UTC(2026, 6, 1, 0, 1, 0),
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
        type: "tool.result",
        ts: "2026-07-01T00:01:00.000Z",
        seq: 12,
        sourceSeq: 31,
        sessionId,
        sessionKey,
        data: {
          name: "bash",
          command: "pnpm vitest run src/gateway/session-utils.test.ts",
          exitCode: 1,
          durationMs: 2200,
          output: "FAIL src/gateway/session-utils.test.ts > readback projection evidence",
          repairAction: "Patch projection extractor and rerun focused test.",
        },
      })}\n`,
      "utf8",
    );
    const task = createTaskRecord({
      runtime: "cli",
      taskKind: "coding",
      requesterSessionKey: sessionKey,
      ownerKey: sessionKey,
      scopeKind: "session",
      agentId: "coding",
      runId: "run-gateway-requester-validation",
      task: "Fix validation readback evidence",
      status: "running",
      deliveryStatus: "pending",
      progressSummary: "stale progress text",
    });

    const { payload } = await runTaskHandler("tasks.list", {
      status: "running",
      agentId: "coding",
      sessionKey,
    });

    expect(payload?.tasks?.[0]?.id).toBe(task.taskId);
    expect(payload?.tasks?.[0]?.activeProgress).toMatchObject({
      source: "trajectory",
      ref: `session:${sessionId}`,
      activeLabel: "bash",
      observedAt: "2026-07-01T00:01:00.000Z",
      durationMs: 2200,
      sourceEventType: "tool.result",
      sourceEventSeq: 31,
      toolName: "bash",
      command: "pnpm vitest run src/gateway/session-utils.test.ts",
      exitCode: 1,
      validationClass: "test",
      outputSummary: "FAIL src/gateway/session-utils.test.ts > readback projection evidence",
      repairAction: "Patch projection extractor and rerun focused test.",
      derivedBy: "readLatestTrajectoryProgressProjection",
      bounded: true,
    });
  });

  it("uses child session trajectory progress for task summaries when available", async () => {
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
      source: "trajectory",
      ref: `session:${sessionId}`,
      currentPhase: "source-inspection",
      activeLabel: "read",
      sourceEventType: "tool.call",
      note: "reading event-spine owner files",
      pointer: {
        kind: "session",
        ref: childSessionKey,
        label: "child session trajectory",
      },
      derivedBy: "readLatestTrajectoryProgressProjection",
      bounded: true,
    });
  });

  it("does not project descendant child trajectory progress through task readback", async () => {
    const parentSessionKey = "agent:planning:main";
    const childSessionKey = "agent:codebase-researcher:subagent:active-descendant";
    const childSessionId = "gateway-task-descendant-child-trajectory";
    const sessionsDir = path.join(stateDir, "agents", "codebase-researcher", "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(
      path.join(sessionsDir, "sessions.json"),
      JSON.stringify(
        {
          [childSessionKey]: {
            sessionId: childSessionId,
            sessionFile: path.join(sessionsDir, `${childSessionId}.jsonl`),
            updatedAt: Date.UTC(2026, 6, 1, 2, 0, 0),
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    await fs.writeFile(
      path.join(sessionsDir, `${childSessionId}.trajectory.jsonl`),
      `${JSON.stringify({
        traceSchema: "openclaw-trajectory",
        schemaVersion: 1,
        traceId: childSessionId,
        source: "runtime",
        type: "tool.call",
        ts: "2026-07-01T02:00:00.000Z",
        seq: 5,
        sourceSeq: 13,
        sessionId: childSessionId,
        sessionKey: childSessionKey,
        data: {
          name: "read",
          phase: "source-inspection",
          summary: "reading exact OpenClaw skill refs",
        },
      })}\n`,
      "utf8",
    );
    addSubagentRunForTests({
      runId: "run-descendant-active",
      childSessionKey,
      requesterSessionKey: parentSessionKey,
      requesterDisplayKey: "planning",
      task: "Inspect exact skill wiring refs.",
      taskName: "source scout",
      label: "codebase scout",
      cleanup: "keep",
      createdAt: 2_000,
      startedAt: 2_100,
    });
    const task = createTaskRecord({
      runtime: "cli",
      taskKind: "planning",
      requesterSessionKey: parentSessionKey,
      ownerKey: parentSessionKey,
      scopeKind: "session",
      agentId: "planning",
      runId: "run-parent-waiting-descendant",
      task: "Plan native skill wiring",
      status: "running",
      deliveryStatus: "pending",
      startedAt: 1_000,
      progressSummary: "Child run started.",
    });

    const { payload } = await getTaskPayload(task.taskId);

    expect(payload?.task?.activeProgress).toBeUndefined();
    expect(JSON.stringify(payload?.task)).not.toContain(childSessionId);
    expect(JSON.stringify(payload?.task)).not.toContain("codebase-researcher");
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
      source: "task-receipt",
      ref: `task:${task.taskId}`,
      currentPhase: "waiting_on_child",
      activeLabel: "planning",
      sourceEventType: "task.running",
      note: `Parent is waiting on child task ${task.taskId}.`,
      pointer: {
        kind: "session",
        ref: "agent:planning:subagent:not-yet-indexed",
        label: "child session",
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

  it("keeps long subagent Context Pack text out of task progress readback", async () => {
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

    expect(payload?.task?.progressSummary).toBeUndefined();
    expect(JSON.stringify(payload?.task)).not.toContain("finding-0");
    expect(JSON.stringify(payload?.task)).not.toContain("finding-2099");
  });

  it("projects descendant child-run status and bounded terminal summaries into parent task summaries", async () => {
    const longReviewerPacket = `${"Reviewer B found a proof-finality risk. ".repeat(80)}FULL_END`;
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
        resultText: longReviewerPacket,
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
    addSubagentRunForTests({
      runId: "run-child-c",
      childSessionKey: "agent:planning:main:subagent:failed-c",
      requesterSessionKey: "agent:planning:main",
      requesterDisplayKey: "planning",
      task: "Research external docs",
      cleanup: "keep",
      createdAt: 140,
      startedAt: 140,
      endedAt: 240,
      outcome: { status: "error", error: "Context overflow while reading docs." },
      expectsCompletionMessage: true,
      completion: {
        required: true,
        resultText: null,
      },
      delivery: { status: "failed", lastError: "Delivery failed after context overflow." },
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
    expect(payload?.task).not.toHaveProperty("childRunCount");
    expect(payload?.task).not.toHaveProperty("childRuns");
    expect(JSON.stringify(payload?.task)).not.toContain("Researcher A found a routing gap.");
    expect(JSON.stringify(payload?.task)).not.toContain("FULL_END");
    expect(JSON.stringify(payload?.task)).not.toContain("stale child should not appear");
  });

  it("preserves completed child finality when linked execution-task delivery reports failure", async () => {
    addSubagentRunForTests({
      runId: "run-child-overflow",
      childSessionKey: "agent:codebase-researcher:subagent:overflow-child",
      requesterSessionKey: "agent:planning:main",
      requesterDisplayKey: "planning",
      task: "Inspect source surfaces",
      cleanup: "keep",
      createdAt: 120,
      startedAt: 120,
      endedAt: 220,
      outcome: { status: "ok" },
      expectsCompletionMessage: true,
      completion: {
        required: true,
        resultText: "Context Pack is available for parent synthesis.",
        capturedAt: 225,
      },
      delivery: { status: "delivered" },
    });
    const wrapper = createTaskRecord({
      runtime: "subagent",
      taskKind: "source-scout",
      requesterSessionKey: "agent:planning:main",
      ownerKey: "agent:planning:main",
      scopeKind: "session",
      childSessionKey: "agent:codebase-researcher:subagent:overflow-child",
      agentId: "codebase-researcher",
      runId: "run-child-overflow",
      task: "Inspect source surfaces",
      status: "succeeded",
      deliveryStatus: "not_applicable",
      startedAt: 120,
    });
    markTaskTerminalById({
      taskId: wrapper.taskId,
      status: "succeeded",
      endedAt: 220,
    });
    const execution = createTaskRecord({
      runtime: "cli",
      taskKind: "cli",
      requesterSessionKey: "agent:codebase-researcher:subagent:overflow-child",
      ownerKey: "agent:codebase-researcher:subagent:overflow-child",
      scopeKind: "session",
      childSessionKey: "agent:codebase-researcher:subagent:overflow-child",
      parentTaskId: wrapper.taskId,
      agentId: "codebase-researcher",
      runId: "run-child-overflow",
      task: "Inspect source surfaces",
      status: "failed",
      deliveryStatus: "not_applicable",
      startedAt: 125,
    });
    markTaskTerminalById({
      taskId: execution.taskId,
      status: "failed",
      endedAt: 210,
      error: "Context overflow: prompt too large for the model.",
    });
    const parent = createTaskRecord({
      runtime: "cli",
      taskKind: "planning-activation",
      requesterSessionKey: "agent:planning:main",
      ownerKey: "agent:planning:main",
      scopeKind: "session",
      childSessionKey: "agent:planning:main",
      agentId: "planning",
      runId: "run-parent-planning-overflow",
      task: "Plan skill wiring",
      status: "running",
      deliveryStatus: "not_applicable",
      startedAt: 110,
    });

    const { payload } = await getTaskPayload(parent.taskId);

    expect(payload?.task).not.toHaveProperty("childRuns");
    expect(payload?.task).not.toHaveProperty("childRunCount");
    expect(JSON.stringify(payload?.task)).not.toContain(
      "Context Pack is available for parent synthesis.",
    );
    expect(JSON.stringify(payload?.task)).not.toContain(
      "Context overflow: prompt too large for the model.",
    );
    expect(execution.taskId).toBeTruthy();
  });

  it("does not project nested child registry failure as parent task truth", async () => {
    addSubagentRunForTests({
      runId: "run-planning-active",
      childSessionKey: "agent:planning:subagent:plan",
      requesterSessionKey: "agent:main:phase0z",
      requesterDisplayKey: "main",
      task: "Plan native skill wiring",
      cleanup: "keep",
      createdAt: 120,
      startedAt: 120,
      delivery: { status: "pending" },
    });
    addSubagentRunForTests({
      runId: "run-codebase-failed",
      childSessionKey: "agent:codebase-researcher:subagent:source-overflow",
      requesterSessionKey: "agent:planning:subagent:plan",
      requesterDisplayKey: "planning",
      task: "Inspect skill and readback source surfaces",
      cleanup: "keep",
      createdAt: 140,
      startedAt: 140,
      endedAt: 240,
      outcome: { status: "error", error: "Context overflow while reading source." },
      expectsCompletionMessage: true,
      completion: {
        required: true,
        resultText: "Partial Context Pack captured source/readback refs.",
        capturedAt: 245,
      },
      delivery: { status: "failed", lastError: "Context overflow while reading source." },
    });
    const task = createTaskRecord({
      runtime: "subagent",
      taskKind: "planning",
      requesterSessionKey: "agent:main:phase0z",
      ownerKey: "agent:main:phase0z",
      scopeKind: "session",
      childSessionKey: "agent:planning:subagent:plan",
      agentId: "planning",
      runId: "run-planning-active",
      task: "Plan native skill wiring",
      status: "running",
      deliveryStatus: "pending",
      startedAt: 110,
      progressSummary: "Child run started.",
    });

    const { payload } = await getTaskPayload(task.taskId);

    expect(payload?.task?.activeProgress).toMatchObject({
      source: "task-receipt",
      ref: `task:${task.taskId}`,
      currentPhase: "waiting_on_child",
      activeLabel: "planning",
      sourceEventType: "task.running",
      note: `Parent is waiting on child task ${task.taskId}.`,
      pointer: {
        kind: "session",
        ref: "agent:planning:subagent:plan",
        label: "child session",
      },
      derivedBy: "resolveTaskReadbackProgressProjection",
      bounded: true,
    });
    expect(JSON.stringify(payload?.task)).not.toContain("Context overflow while reading source.");
    expect(JSON.stringify(payload?.task)).not.toContain("Partial Context Pack captured");
  });

  it("keeps settled child registry state out of task progress truth", async () => {
    addSubagentRunForTests({
      runId: "run-settled-child",
      childSessionKey: "agent:planning:subagent:settled",
      requesterSessionKey: "agent:main:phase0z",
      requesterDisplayKey: "main",
      task: "Plan skill wiring",
      cleanup: "keep",
      createdAt: 120,
      startedAt: 120,
      endedAt: 220,
      outcome: { status: "ok" },
      delivery: { status: "delivered" },
    });
    const task = createTaskRecord({
      runtime: "subagent",
      taskKind: "planning",
      requesterSessionKey: "agent:main:phase0z",
      ownerKey: "agent:main:phase0z",
      scopeKind: "session",
      childSessionKey: "agent:planning:subagent:settled",
      agentId: "planning",
      runId: "run-settled-child",
      task: "Plan skill wiring",
      status: "running",
      deliveryStatus: "pending",
      startedAt: 120,
      progressSummary: "Child run started.",
    });

    const { payload } = await getTaskPayload(task.taskId);

    expect(payload?.task?.activeProgress).toMatchObject({
      source: "task-receipt",
      ref: `task:${task.taskId}`,
      currentPhase: "waiting_on_child",
      note: `Parent is waiting on child task ${task.taskId}.`,
      pointer: {
        kind: "session",
        ref: "agent:planning:subagent:settled",
        label: "child session",
      },
      derivedBy: "resolveTaskReadbackProgressProjection",
      bounded: true,
    });
    expect(JSON.stringify(payload?.task)).not.toContain("Child run is done");
    expect(JSON.stringify(payload?.task)).not.toContain("settled child session");
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
