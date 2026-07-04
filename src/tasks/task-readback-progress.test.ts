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
      childRole: "codebase-researcher",
      childPhase: "running",
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
});
