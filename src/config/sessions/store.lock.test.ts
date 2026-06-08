import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionStoreCacheForTest,
  resetSessionStoreLockRuntimeForTests,
  setSessionWriteLockAcquirerForTests,
  updateSessionStore,
  withSessionStoreLockForTest,
} from "./store.js";

const acquireSessionWriteLockMock = vi.hoisted(() =>
  vi.fn(async () => ({ release: vi.fn(async () => {}) })),
);

describe("withSessionStoreLock", () => {
  beforeEach(() => {
    acquireSessionWriteLockMock.mockClear();
    setSessionWriteLockAcquirerForTests(acquireSessionWriteLockMock);
  });

  afterEach(() => {
    clearSessionStoreCacheForTest();
    resetSessionStoreLockRuntimeForTests();
    vi.restoreAllMocks();
  });

  it("derives session lock hold time from the store lock timeout", async () => {
    await withSessionStoreLockForTest("/tmp/openclaw-store.json", async () => {}, {
      timeoutMs: 10_000,
    });

    expect(acquireSessionWriteLockMock).toHaveBeenCalledWith({
      sessionFile: "/tmp/openclaw-store.json",
      timeoutMs: 10_000,
      staleMs: 30_000,
      maxHoldMs: 15_000,
    });
  });

  it("leaves the session lock hold time unset when store locking has no timeout", async () => {
    await withSessionStoreLockForTest("/tmp/openclaw-store.json", async () => {}, {
      timeoutMs: 0,
    });

    expect(acquireSessionWriteLockMock).toHaveBeenCalledWith({
      sessionFile: "/tmp/openclaw-store.json",
      timeoutMs: Number.POSITIVE_INFINITY,
      staleMs: 30_000,
      maxHoldMs: undefined,
    });
  });

  it("applies explicit lock timeout and stale thresholds to session store updates", async () => {
    await updateSessionStore(
      "/tmp/openclaw-store.json",
      (store) => {
        store["agent:test:session:1"] = {
          sessionId: "session-1",
          updatedAt: 1,
        };
      },
      {
        lockTimeoutMs: 4_000,
        lockStaleMs: 4_000,
      },
    );

    expect(acquireSessionWriteLockMock).toHaveBeenCalledWith({
      sessionFile: "/tmp/openclaw-store.json",
      timeoutMs: 4_000,
      staleMs: 4_000,
      maxHoldMs: 9_000,
    });
  });
});
