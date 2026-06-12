import { formatErrorMessage } from "../../infra/errors.js";
import {
  acquireSessionWriteLock,
  type SessionLockAcquisitionTrace,
} from "../session-write-lock.js";
import type {
  NativeTaskForegroundResult,
  NativeTaskRunChildTask,
  NativeTaskRunChildTaskParams,
} from "./native-task-types.js";

type SessionWriteLockHandle = Awaited<ReturnType<typeof acquireSessionWriteLock>>;

function safeToken(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/gu, "-")
    .slice(0, 80);
}

function buildChildSessionLockFailedResult(
  params: NativeTaskRunChildTaskParams,
  err: unknown,
): NativeTaskForegroundResult {
  const now = Date.now();
  const token = safeToken(params.parentToolCallId) || "unknown";
  return {
    status: "error",
    foreground: true,
    childSessionKey: `agent:${params.childAgentId}:subagent:lock-failed-${token}`,
    runId: `lock_failed_${token}`,
    waitStatus: "error",
    startedAt: now,
    endedAt: now,
    error: formatErrorMessage(err),
    resultDeliveredToParentContext: false,
    childStartFailureKind: "child_session_lock_failed",
  };
}

export function createNativeChildTaskParentLockHandoff(params: {
  sessionFile: string;
  initialLock: SessionWriteLockHandle;
  maxHoldMs: number;
  onSessionLockAcquired?: (trace: SessionLockAcquisitionTrace) => void | Promise<void>;
  acquireLock?: typeof acquireSessionWriteLock;
}): {
  getCurrentLock: () => SessionWriteLockHandle;
  suspendParentLockForProviderWait: () => Promise<() => Promise<void>>;
  wrapRunChildTask: (runChildTask: NativeTaskRunChildTask) => NativeTaskRunChildTask;
} {
  const acquireLock = params.acquireLock ?? acquireSessionWriteLock;
  let currentLock = params.initialLock;
  let parentLockHeld = true;
  let activeChildRuns = 0;
  let releasePromise: Promise<NativeTaskForegroundResult | null> | null = null;
  let reacquireFailure: NativeTaskForegroundResult | null = null;
  const waitForDrain: Array<() => void> = [];

  async function releaseParentLock(
    taskParams: NativeTaskRunChildTaskParams,
  ): Promise<NativeTaskForegroundResult | null> {
    if (!parentLockHeld) {
      return null;
    }
    if (!releasePromise) {
      const lockToRelease = currentLock;
      releasePromise = (async () => {
        try {
          await lockToRelease.release();
          parentLockHeld = false;
          return null;
        } catch (err) {
          return buildChildSessionLockFailedResult(taskParams, err);
        }
      })().finally(() => {
        releasePromise = null;
      });
    }
    return await releasePromise;
  }

  async function reacquireParentLock(
    taskParams: NativeTaskRunChildTaskParams,
  ): Promise<NativeTaskForegroundResult | null> {
    if (parentLockHeld) {
      return null;
    }
    try {
      currentLock = await acquireLock({
        sessionFile: params.sessionFile,
        maxHoldMs: params.maxHoldMs,
      });
      parentLockHeld = true;
      await params.onSessionLockAcquired?.(currentLock.trace);
      return null;
    } catch (err) {
      reacquireFailure = buildChildSessionLockFailedResult(taskParams, err);
      return reacquireFailure;
    } finally {
      while (waitForDrain.length > 0) {
        waitForDrain.shift()?.();
      }
    }
  }

  async function waitForOtherChildRunsToDrain(): Promise<void> {
    if (activeChildRuns === 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      waitForDrain.push(resolve);
    });
  }

  async function settleAfterChildRun(
    taskParams: NativeTaskRunChildTaskParams,
  ): Promise<NativeTaskForegroundResult | null> {
    activeChildRuns = Math.max(0, activeChildRuns - 1);
    if (activeChildRuns === 0) {
      return await reacquireParentLock(taskParams);
    }
    await waitForOtherChildRunsToDrain();
    return reacquireFailure;
  }

  function providerWaitTaskParams(): NativeTaskRunChildTaskParams {
    return {
      parentSessionKey: "provider-wait",
      parentToolCallId: "provider-wait",
      childAgentId: "provider-wait",
      task: "provider wait",
      parentVisibleResultMaxChars: 0,
    };
  }

  function throwLockFailure(result: NativeTaskForegroundResult, action: string): never {
    throw new Error(`${action}: ${result.error ?? result.childStartFailureKind ?? "unknown"}`);
  }

  return {
    getCurrentLock: () => currentLock,
    suspendParentLockForProviderWait: async () => {
      await waitForOtherChildRunsToDrain();
      const taskParams = providerWaitTaskParams();
      const releaseFailure = await releaseParentLock(taskParams);
      if (releaseFailure) {
        throwLockFailure(releaseFailure, "provider wait parent session lock release failed");
      }
      let resumed = false;
      return async () => {
        if (resumed) {
          return;
        }
        resumed = true;
        const reacquireResult = await reacquireParentLock(taskParams);
        if (reacquireResult) {
          throwLockFailure(reacquireResult, "provider wait parent session lock reacquire failed");
        }
      };
    },
    wrapRunChildTask: (runChildTask) => async (taskParams) => {
      activeChildRuns += 1;
      const releaseFailure = await releaseParentLock(taskParams);
      let result: NativeTaskForegroundResult;
      if (releaseFailure) {
        result = releaseFailure;
      } else {
        result = await runChildTask(taskParams);
      }
      const reacquireResult = await settleAfterChildRun(taskParams);
      return reacquireResult ?? result;
    },
  };
}

export function bindRunChildTaskToParentSessionLockHandoff(params: {
  runChildTask?: NativeTaskRunChildTask;
  sessionFile: string;
  initialLock: SessionWriteLockHandle;
  maxHoldMs: number;
  onSessionLockAcquired?: (trace: SessionLockAcquisitionTrace) => void | Promise<void>;
  acquireLock?: typeof acquireSessionWriteLock;
}): {
  getCurrentLock: () => SessionWriteLockHandle;
  suspendParentLockForProviderWait: () => Promise<() => Promise<void>>;
  runChildTask?: NativeTaskRunChildTask;
} {
  const handoff = createNativeChildTaskParentLockHandoff({
    sessionFile: params.sessionFile,
    initialLock: params.initialLock,
    maxHoldMs: params.maxHoldMs,
    onSessionLockAcquired: params.onSessionLockAcquired,
    acquireLock: params.acquireLock,
  });
  return {
    getCurrentLock: handoff.getCurrentLock,
    suspendParentLockForProviderWait: handoff.suspendParentLockForProviderWait,
    ...(params.runChildTask ? { runChildTask: handoff.wrapRunChildTask(params.runChildTask) } : {}),
  };
}
