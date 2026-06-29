import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentEventPayload } from "../infra/agent-events.js";
import {
  createTaskRecord,
  getTaskById,
  resetTaskRegistryForTests,
} from "../tasks/runtime-internal.js";
import {
  maybeRecordSubagentTaskProgress,
  summarizeSubagentTaskProgressEvent,
} from "./server-chat.subagent-task-progress.js";

const ORIGINAL_STATE_DIR = process.env.OPENCLAW_STATE_DIR;
let stateDir: string;

function event(overrides: Partial<AgentEventPayload>): AgentEventPayload {
  return {
    runId: "run-subagent-progress",
    seq: 1,
    stream: "tool",
    ts: 100,
    data: { phase: "start", name: "rg" },
    sessionKey: "agent:main:subagent:child",
    agentId: "main",
    ...overrides,
  };
}

beforeEach(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-subagent-task-progress-"));
  process.env.OPENCLAW_STATE_DIR = stateDir;
  resetTaskRegistryForTests();
});

afterEach(async () => {
  resetTaskRegistryForTests();
  if (ORIGINAL_STATE_DIR === undefined) {
    delete process.env.OPENCLAW_STATE_DIR;
  } else {
    process.env.OPENCLAW_STATE_DIR = ORIGINAL_STATE_DIR;
  }
  await fs.rm(stateDir, { recursive: true, force: true });
});

describe("subagent task progress event mirror", () => {
  it("summarizes native child events into bounded task progress text", () => {
    expect(summarizeSubagentTaskProgressEvent(event({}))).toBe("Child running tool: rg.");
    expect(
      summarizeSubagentTaskProgressEvent(
        event({
          stream: "item",
          data: { phase: "update", status: "running", title: "Inspecting task readback" },
        }),
      ),
    ).toBe("Child running: Inspecting task readback.");
    expect(summarizeSubagentTaskProgressEvent(event({ stream: "assistant", data: {} }))).toBe(
      "Child is producing assistant output.",
    );
  });

  it("records progress onto the matching running subagent task", () => {
    const task = createTaskRecord({
      runtime: "subagent",
      requesterSessionKey: "agent:main:main",
      ownerKey: "agent:main:main",
      scopeKind: "session",
      childSessionKey: "agent:main:subagent:child",
      runId: "run-subagent-progress",
      status: "running",
      deliveryStatus: "pending",
      task: "Run child",
      startedAt: 100,
      lastEventAt: 100,
      progressSummary: "Child started.",
    });
    expect(task).toBeTruthy();

    expect(
      maybeRecordSubagentTaskProgress({
        evt: event({}),
        sessionKey: "agent:main:subagent:child",
        now: 200,
      }),
    ).toBe(true);

    expect(getTaskById(task!.taskId)).toMatchObject({
      lastEventAt: 200,
      progressSummary: "Child running tool: rg.",
    });
  });

  it("does not update non-subagent sessions or unrelated child tasks", () => {
    const task = createTaskRecord({
      runtime: "subagent",
      requesterSessionKey: "agent:main:main",
      ownerKey: "agent:main:main",
      scopeKind: "session",
      childSessionKey: "agent:main:subagent:other",
      runId: "run-subagent-progress",
      status: "running",
      deliveryStatus: "pending",
      task: "Run child",
      startedAt: 100,
      lastEventAt: 100,
      progressSummary: "Child started.",
    });

    expect(
      maybeRecordSubagentTaskProgress({
        evt: event({}),
        sessionKey: "agent:main:main",
        now: 200,
      }),
    ).toBe(false);
    expect(
      maybeRecordSubagentTaskProgress({
        evt: event({}),
        sessionKey: "agent:main:subagent:child",
        now: 200,
      }),
    ).toBe(false);
    expect(getTaskById(task!.taskId)?.progressSummary).toBe("Child started.");
  });

  it("throttles repeated non-generic progress updates", () => {
    const task = createTaskRecord({
      runtime: "subagent",
      requesterSessionKey: "agent:main:main",
      ownerKey: "agent:main:main",
      scopeKind: "session",
      childSessionKey: "agent:main:subagent:child",
      runId: "run-subagent-progress",
      status: "running",
      deliveryStatus: "pending",
      task: "Run child",
      startedAt: 100,
      lastEventAt: 10_000,
      progressSummary: "Child running tool: rg.",
    });

    expect(
      maybeRecordSubagentTaskProgress({
        evt: event({}),
        sessionKey: "agent:main:subagent:child",
        now: 12_000,
      }),
    ).toBe(false);
    expect(getTaskById(task!.taskId)?.lastEventAt).toBe(10_000);
  });
});
