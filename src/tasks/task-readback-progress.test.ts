import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskRecord } from "./task-registry.types.js";

const mocks = vi.hoisted(() => ({
  getRuntimeConfig: vi.fn(() => ({})),
  loadSessionStore: vi.fn(() => ({})),
  resolveAgentSessionStoreTargetsSync: vi.fn((_cfg: unknown, agentId: string) => [
    {
      agentId,
      storePath: `/tmp/${agentId}-sessions.json`,
      storeKeys: [],
    },
  ]),
  resolveAllAgentSessionStoreTargetsSync: vi.fn(() => []),
  resolveSessionStoreEntry: vi.fn(() => ({
    existing: {
      sessionId: "child-session-id",
      sessionFile: "child-session-id.jsonl",
    },
  })),
  readLatestTrajectoryProgressProjection: vi.fn(),
}));

vi.mock("../config/io.js", () => ({
  getRuntimeConfig: mocks.getRuntimeConfig,
}));

vi.mock("../config/sessions.js", () => ({
  loadSessionStore: mocks.loadSessionStore,
  resolveAgentSessionStoreTargetsSync: mocks.resolveAgentSessionStoreTargetsSync,
  resolveAllAgentSessionStoreTargetsSync: mocks.resolveAllAgentSessionStoreTargetsSync,
  resolveSessionStoreEntry: mocks.resolveSessionStoreEntry,
}));

vi.mock("../gateway/session-utils.fs.js", () => ({
  readLatestTrajectoryProgressProjection: mocks.readLatestTrajectoryProgressProjection,
}));

describe("task readback progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers active child session trajectory over generic task-registry fallback", async () => {
    const { createTaskReadbackProgressProjectionContext, resolveTaskReadbackProgressProjection } =
      await import("./task-readback-progress.js");
    mocks.readLatestTrajectoryProgressProjection.mockReturnValue({
      source: "trajectory",
      ref: "session:child-session-id",
      currentPhase: "source-inspection",
      activeLabel: "read",
      observedAt: "2026-07-04T14:00:00.000Z",
      sourceEventType: "tool.call",
      sourceEventSeq: 7,
      toolName: "read",
      note: "Reading the owning session readback files.",
      derivedBy: "readLatestTrajectoryProgressProjection",
      bounded: true,
    });

    const task: TaskRecord = {
      taskId: "task-parent-waiting-on-child",
      runtime: "subagent",
      taskKind: "codex-native",
      agentId: "planning",
      runId: "codex-thread:child",
      label: "codebase scout",
      requesterSessionKey: "agent:planning:main",
      ownerKey: "agent:planning:main",
      childSessionKey: "agent:codebase-researcher:subagent:child",
      scopeKind: "session",
      task: "Inspect session/readback seams.",
      status: "running",
      deliveryStatus: "pending",
      notifyPolicy: "silent",
      createdAt: Date.UTC(2026, 6, 4, 13, 55, 0),
      startedAt: Date.UTC(2026, 6, 4, 13, 56, 0),
      lastEventAt: Date.UTC(2026, 6, 4, 13, 59, 0),
    };

    const progress = resolveTaskReadbackProgressProjection(
      task,
      createTaskReadbackProgressProjectionContext({ now: Date.UTC(2026, 6, 4, 14, 0, 0) }),
    );

    expect(progress).toMatchObject({
      source: "trajectory",
      currentPhase: "source-inspection",
      activeLabel: "read",
      sourceEventType: "tool.call",
      toolName: "read",
      pointer: {
        kind: "session",
        ref: "agent:codebase-researcher:subagent:child",
        label: "child session trajectory",
      },
    });
    expect(mocks.resolveAgentSessionStoreTargetsSync).toHaveBeenCalledWith(
      expect.anything(),
      "codebase-researcher",
    );
  });

  it("uses generic child-start task receipts as bounded parent-wait progress", async () => {
    const { createTaskReadbackProgressProjectionContext, resolveTaskReadbackProgressProjection } =
      await import("./task-readback-progress.js");
    mocks.readLatestTrajectoryProgressProjection.mockReturnValue(undefined);

    const task: TaskRecord = {
      taskId: "task-generic-child-start",
      runtime: "subagent",
      taskKind: "codex-native",
      agentId: "planning",
      runId: "codex-thread:child",
      label: "codebase scout",
      requesterSessionKey: "agent:planning:main",
      ownerKey: "agent:planning:main",
      childSessionKey: "agent:codebase-researcher:subagent:child",
      scopeKind: "session",
      task: "Inspect readback seams.",
      status: "running",
      deliveryStatus: "pending",
      notifyPolicy: "silent",
      createdAt: Date.UTC(2026, 6, 4, 13, 55, 0),
      startedAt: Date.UTC(2026, 6, 4, 13, 56, 0),
      lastEventAt: Date.UTC(2026, 6, 4, 13, 59, 0),
      executionReceipt: {
        schema: "openclaw.task.execution_receipt.v1",
        eventCount: 1,
        updatedAt: Date.UTC(2026, 6, 4, 13, 59, 0),
        latestEvent: {
          at: Date.UTC(2026, 6, 4, 13, 59, 0),
          kind: "running",
          summary: "Child run started.",
        },
      },
    };

    const progress = resolveTaskReadbackProgressProjection(
      task,
      createTaskReadbackProgressProjectionContext({ now: Date.UTC(2026, 6, 4, 14, 0, 0) }),
    );

    expect(progress).toMatchObject({
      source: "task-receipt",
      ref: "task:task-generic-child-start",
      currentPhase: "waiting_on_child",
      sourceEventType: "task.running",
      pointer: {
        kind: "session",
        ref: "agent:codebase-researcher:subagent:child",
      },
    });
  });

  it("does not treat freeform task receipt progress as live child activity", async () => {
    const { createTaskReadbackProgressProjectionContext, resolveTaskReadbackProgressProjection } =
      await import("./task-readback-progress.js");
    mocks.readLatestTrajectoryProgressProjection.mockReturnValue(undefined);

    const task: TaskRecord = {
      taskId: "task-freeform-progress-receipt",
      runtime: "subagent",
      taskKind: "codex-native",
      agentId: "planning",
      runId: "codex-thread:child",
      label: "codebase scout",
      requesterSessionKey: "agent:planning:main",
      ownerKey: "agent:planning:main",
      childSessionKey: "agent:codebase-researcher:subagent:child",
      scopeKind: "session",
      task: "Inspect readback seams.",
      status: "running",
      deliveryStatus: "pending",
      notifyPolicy: "silent",
      createdAt: Date.UTC(2026, 6, 4, 13, 55, 0),
      startedAt: Date.UTC(2026, 6, 4, 13, 56, 0),
      lastEventAt: Date.UTC(2026, 6, 4, 13, 59, 0),
      executionReceipt: {
        schema: "openclaw.task.execution_receipt.v1",
        eventCount: 1,
        updatedAt: Date.UTC(2026, 6, 4, 13, 59, 0),
        latestEvent: {
          at: Date.UTC(2026, 6, 4, 13, 59, 0),
          kind: "progress",
          summary: "Child running tool: rg.",
        },
      },
    };

    const progress = resolveTaskReadbackProgressProjection(
      task,
      createTaskReadbackProgressProjectionContext({ now: Date.UTC(2026, 6, 4, 14, 0, 0) }),
    );

    expect(progress).toMatchObject({
      source: "task-receipt",
      ref: "task:task-freeform-progress-receipt",
      currentPhase: "waiting_on_child",
      sourceEventType: "task.running",
      note: "Parent is waiting on child task task-freeform-progress-receipt.",
      pointer: {
        kind: "session",
        ref: "agent:codebase-researcher:subagent:child",
      },
    });
    expect(progress?.toolName).toBeUndefined();
    expect(progress?.note).not.toContain("rg");
  });

  it("projects native child event metadata from advisory task receipts", async () => {
    const { createTaskReadbackProgressProjectionContext, resolveTaskReadbackProgressProjection } =
      await import("./task-readback-progress.js");
    mocks.readLatestTrajectoryProgressProjection.mockReturnValue(undefined);

    const task: TaskRecord = {
      taskId: "task-native-child-event-metadata",
      runtime: "subagent",
      taskKind: "codex-native",
      agentId: "planning",
      runId: "run-native-child-event-metadata",
      label: "codebase scout",
      requesterSessionKey: "agent:planning:main",
      ownerKey: "agent:planning:main",
      childSessionKey: "agent:codebase-researcher:subagent:child",
      scopeKind: "session",
      task: "Inspect readback seams.",
      status: "running",
      deliveryStatus: "pending",
      notifyPolicy: "silent",
      createdAt: Date.UTC(2026, 6, 4, 13, 55, 0),
      startedAt: Date.UTC(2026, 6, 4, 13, 56, 0),
      lastEventAt: Date.UTC(2026, 6, 4, 13, 59, 0),
      executionReceipt: {
        schema: "openclaw.task.execution_receipt.v1",
        eventCount: 1,
        updatedAt: Date.UTC(2026, 6, 4, 13, 59, 0),
        latestEvent: {
          at: Date.UTC(2026, 6, 4, 13, 59, 0),
          kind: "progress",
          summary: "Child running tool: rg.",
          metadata: {
            nativeEventStream: "tool",
            nativeEventSeq: 17,
            nativeEventRunId: "run-native-child-event-metadata",
            nativeEventSessionKey: "agent:codebase-researcher:subagent:child",
            nativeEventAgentId: "codebase-researcher",
            nativeEventPhase: "start",
            nativeEventToolName: "rg",
          },
        },
      },
    };

    const progress = resolveTaskReadbackProgressProjection(
      task,
      createTaskReadbackProgressProjectionContext({ now: Date.UTC(2026, 6, 4, 14, 0, 0) }),
    );

    expect(progress).toMatchObject({
      source: "task-receipt",
      currentPhase: "start",
      activeLabel: "rg",
      sourceEventType: "agent.tool",
      sourceEventSeq: 17,
      toolName: "rg",
      note: "Child running tool: rg.",
      pointer: {
        kind: "task",
        ref: "task-native-child-event-metadata",
      },
    });
  });

  it("prefers requester trajectory over task receipts for child tasks when child trajectory is unavailable", async () => {
    const { createTaskReadbackProgressProjectionContext, resolveTaskReadbackProgressProjection } =
      await import("./task-readback-progress.js");
    mocks.readLatestTrajectoryProgressProjection
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({
        source: "trajectory",
        ref: "session:parent-session-id",
        currentPhase: "waiting_on_child",
        activeLabel: "task",
        observedAt: "2026-07-04T14:00:00.000Z",
        sourceEventType: "agent.item",
        sourceEventSeq: 12,
        childRole: "codebase-researcher",
        childPhase: "child_spawned",
        note: "Parent spawned codebase-researcher.",
        derivedBy: "readLatestTrajectoryProgressProjection",
        bounded: true,
      });

    const task: TaskRecord = {
      taskId: "task-parent-trajectory-before-task-receipt",
      runtime: "subagent",
      taskKind: "codex-native",
      agentId: "planning",
      runId: "codex-thread:child",
      label: "codebase scout",
      requesterSessionKey: "agent:planning:main",
      ownerKey: "agent:planning:main",
      childSessionKey: "agent:codebase-researcher:subagent:child",
      scopeKind: "session",
      task: "Inspect readback seams.",
      status: "running",
      deliveryStatus: "pending",
      notifyPolicy: "silent",
      createdAt: Date.UTC(2026, 6, 4, 13, 55, 0),
      startedAt: Date.UTC(2026, 6, 4, 13, 56, 0),
      lastEventAt: Date.UTC(2026, 6, 4, 13, 59, 0),
      executionReceipt: {
        schema: "openclaw.task.execution_receipt.v1",
        eventCount: 1,
        updatedAt: Date.UTC(2026, 6, 4, 13, 59, 0),
        latestEvent: {
          at: Date.UTC(2026, 6, 4, 13, 59, 0),
          kind: "progress",
          summary: "Child running tool: rg.",
          metadata: {
            nativeEventStream: "tool",
            nativeEventSeq: 17,
            nativeEventRunId: "run-native-child-event-metadata",
            nativeEventSessionKey: "agent:codebase-researcher:subagent:child",
            nativeEventAgentId: "codebase-researcher",
            nativeEventPhase: "start",
            nativeEventToolName: "rg",
          },
        },
      },
    };

    const progress = resolveTaskReadbackProgressProjection(
      task,
      createTaskReadbackProgressProjectionContext({ now: Date.UTC(2026, 6, 4, 14, 0, 0) }),
    );

    expect(progress).toMatchObject({
      source: "trajectory",
      ref: "session:parent-session-id",
      sourceEventType: "agent.item",
      currentPhase: "waiting_on_child",
      childRole: "codebase-researcher",
      childPhase: "child_spawned",
      note: "Parent spawned codebase-researcher.",
    });
  });

  it("falls back to parent-wait task evidence when child trajectory has no valid event", async () => {
    const { createTaskReadbackProgressProjectionContext, resolveTaskReadbackProgressProjection } =
      await import("./task-readback-progress.js");
    mocks.readLatestTrajectoryProgressProjection.mockReturnValue({
      source: "trajectory",
      ref: "session:child-session-id",
      derivedBy: "readLatestTrajectoryProgressProjection",
      bounded: true,
      note: "trajectory file found but no valid recent event in bounded tail",
    });

    const task: TaskRecord = {
      taskId: "task-low-signal-trajectory",
      runtime: "subagent",
      taskKind: "planning",
      agentId: "planning",
      runId: "run-planning",
      label: "Planning run",
      requesterSessionKey: "agent:main:main",
      ownerKey: "agent:main:main",
      childSessionKey: "agent:planning:main",
      scopeKind: "session",
      task: "Create the planning packet.",
      status: "running",
      deliveryStatus: "pending",
      notifyPolicy: "silent",
      createdAt: Date.UTC(2026, 6, 4, 13, 55, 0),
      startedAt: Date.UTC(2026, 6, 4, 13, 56, 0),
      lastEventAt: Date.UTC(2026, 6, 4, 13, 59, 0),
    };

    const progress = resolveTaskReadbackProgressProjection(
      task,
      createTaskReadbackProgressProjectionContext({ now: Date.UTC(2026, 6, 4, 14, 0, 0) }),
    );

    expect(progress).toMatchObject({
      source: "task-receipt",
      ref: "task:task-low-signal-trajectory",
      currentPhase: "waiting_on_child",
      pointer: {
        kind: "session",
        ref: "agent:planning:main",
      },
    });
  });
});
