import { describe, expect, it, vi } from "vitest";
import type { SessionLockAcquisitionTrace } from "../session-write-lock.js";
import type {
  NativeTaskForegroundResult,
  NativeTaskRunChildTaskParams,
} from "../tools/native-task-tool.js";
import {
  bindRunChildTaskToParentSessionLockHandoff,
  createNativeChildTaskParentLockHandoff,
} from "./parent-lock-handoff.js";

function trace(outcome = "acquired"): SessionLockAcquisitionTrace {
  return {
    outcome: outcome as SessionLockAcquisitionTrace["outcome"],
    sessionFile: "/tmp/parent.jsonl",
    lockPath: "/tmp/parent.jsonl.lock",
    acquired: true,
    reclaimed: false,
    attempts: 1,
    timeoutMs: 10_000,
    staleMs: 1_800_000,
    ownerPid: null,
    ownerPidAlive: null,
    ownerCreatedAt: null,
    ownerAgeMs: null,
    staleReasons: [],
  };
}

function taskParams(): NativeTaskRunChildTaskParams {
  return {
    parentSessionKey: "agent:execution-coding:node:nrun_parent",
    parentToolCallId: "tool-call-1",
    childAgentId: "execution-context-scout",
    task: "Map the relevant source.",
    parentVisibleResultMaxChars: 12_000,
  };
}

function completedResult(): NativeTaskForegroundResult {
  return {
    status: "completed",
    foreground: true,
    childSessionKey: "agent:execution-context-scout:subagent:child-1",
    runId: "child-run-1",
    waitStatus: "ok",
    resultText: "bounded source window",
    resultDeliveredToParentContext: true,
  };
}

describe("native child task parent lock handoff", () => {
  it("releases the parent session lock before running the child and reacquires it after", async () => {
    const order: string[] = [];
    const initialLock = {
      trace: trace("acquired"),
      release: vi.fn(async () => {
        order.push("release-parent");
      }),
    };
    const reacquiredLock = {
      trace: trace("stale_lock_reclaimed_acquired"),
      release: vi.fn(async () => {
        order.push("release-reacquired");
      }),
    };
    const onSessionLockAcquired = vi.fn(async () => {
      order.push("record-reacquire");
    });
    const handoff = createNativeChildTaskParentLockHandoff({
      sessionFile: "/tmp/parent.jsonl",
      initialLock,
      maxHoldMs: 300_000,
      onSessionLockAcquired,
      acquireLock: vi.fn(async () => {
        order.push("reacquire-parent");
        return reacquiredLock;
      }),
    });
    const runChildTask = vi.fn(async () => {
      order.push("run-child");
      return completedResult();
    });

    const result = await handoff.wrapRunChildTask(runChildTask)(taskParams());

    expect(result.status).toBe("completed");
    expect(order).toEqual(["release-parent", "run-child", "reacquire-parent", "record-reacquire"]);
    expect(initialLock.release).toHaveBeenCalledTimes(1);
    expect(runChildTask).toHaveBeenCalledTimes(1);
    expect(handoff.getCurrentLock()).toBe(reacquiredLock);
    expect(onSessionLockAcquired).toHaveBeenCalledWith(reacquiredLock.trace);
  });

  it("returns typed child_session_lock_failed when parent lock release fails", async () => {
    const handoff = createNativeChildTaskParentLockHandoff({
      sessionFile: "/tmp/parent.jsonl",
      initialLock: {
        trace: trace("acquired"),
        release: vi.fn(async () => {
          throw new Error("release failed");
        }),
      },
      maxHoldMs: 300_000,
      acquireLock: vi.fn(async () => {
        throw new Error("should not reacquire after release failure");
      }),
    });
    const runChildTask = vi.fn(async () => completedResult());

    const result = await handoff.wrapRunChildTask(runChildTask)(taskParams());

    expect(runChildTask).not.toHaveBeenCalled();
    expect(result.status).toBe("error");
    expect(result.childStartFailureKind).toBe("child_session_lock_failed");
    expect(result.childSessionKey).toMatch(/^agent:execution-context-scout:subagent:lock-failed-/u);
    expect(result.resultDeliveredToParentContext).toBe(false);
  });

  it("returns typed child_session_lock_failed when parent lock reacquire fails", async () => {
    const handoff = createNativeChildTaskParentLockHandoff({
      sessionFile: "/tmp/parent.jsonl",
      initialLock: {
        trace: trace("acquired"),
        release: vi.fn(async () => undefined),
      },
      maxHoldMs: 300_000,
      acquireLock: vi.fn(async () => {
        throw new Error("reacquire failed");
      }),
    });
    const runChildTask = vi.fn(async () => completedResult());

    const result = await handoff.wrapRunChildTask(runChildTask)(taskParams());

    expect(runChildTask).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("error");
    expect(result.childStartFailureKind).toBe("child_session_lock_failed");
    expect(result.error).toContain("reacquire failed");
    expect(result.resultDeliveredToParentContext).toBe(false);
  });

  it("binds runChildTask behind a session-runtime parent lock handoff helper", async () => {
    const order: string[] = [];
    const reacquiredLock = {
      trace: trace("stale_lock_reclaimed_acquired"),
      release: vi.fn(async () => undefined),
    };
    const binding = bindRunChildTaskToParentSessionLockHandoff({
      runChildTask: vi.fn(async () => {
        order.push("run-child");
        return completedResult();
      }),
      sessionFile: "/tmp/parent.jsonl",
      initialLock: {
        trace: trace("acquired"),
        release: vi.fn(async () => {
          order.push("release-parent");
        }),
      },
      maxHoldMs: 300_000,
      acquireLock: vi.fn(async () => {
        order.push("reacquire-parent");
        return reacquiredLock;
      }),
    });

    const result = await binding.runChildTask?.(taskParams());

    expect(result?.status).toBe("completed");
    expect(order).toEqual(["release-parent", "run-child", "reacquire-parent"]);
    expect(binding.getCurrentLock()).toBe(reacquiredLock);
  });
});
