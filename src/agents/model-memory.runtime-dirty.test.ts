import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createModelMemoryRuntimeDirtyStore,
  markModelMemoryRuntimeDirtyAndSchedule,
  resetModelMemoryRuntimeDirtyStoreForTests,
  resolveModelMemoryRuntimeRebuildSchedulerSettings,
  runModelMemoryRuntimeRebuildWorker,
} from "./model-memory.runtime-dirty.js";

async function makeStore() {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-runtime-dirty-store-"));
  return {
    baseDir,
    store: createModelMemoryRuntimeDirtyStore({ baseDir }),
    async cleanup() {
      await fs.rm(baseDir, { recursive: true, force: true });
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("model-memory runtime dirty state", () => {
  it("persists dirty state and events across store reloads without raw content", async () => {
    const { baseDir, store, cleanup } = await makeStore();
    try {
      await store.markDirty({
        reason: "ordinary_turn_capture_written",
        captureJobId: "capture_job_001",
        sessionId: "session-001",
        sessionKey: "agent:main:main",
        agentId: "main",
        memoryIds: ["memory-2", "memory-1", "memory-1"],
        sourceIds: ["source-1"],
        markedAt: new Date("2026-04-22T00:00:00.000Z"),
      });

      const reloaded = createModelMemoryRuntimeDirtyStore({ baseDir });
      const state = await reloaded.getState();
      const events = await reloaded.listRecentEvents();

      expect(state).toMatchObject({
        status: "dirty",
        dirtyReason: "ordinary_turn_capture_written",
        affectedMemoryIds: ["memory-1", "memory-2"],
        affectedSourceIds: ["source-1"],
        writeCountSinceLastRebuild: 1,
        markedAt: "2026-04-22T00:00:00.000Z",
        rawContentPersisted: false,
        containsPromptText: false,
        containsTranscript: false,
        containsRawToolLog: false,
      });
      expect(events.map((event) => event.eventType)).toEqual(["runtime_dirty_marked"]);
      expect(JSON.stringify({ state, events })).not.toContain("Please remember");
      expect(JSON.stringify({ state, events })).not.toContain("raw prompt");
      expect(JSON.stringify({ state, events })).not.toContain("transcript");
      expect(JSON.stringify({ state, events })).not.toContain("tool log");
    } finally {
      await cleanup();
    }
  });

  it("coalesces repeated dirty marks and schedules rebuild at the write threshold", async () => {
    const { store, cleanup } = await makeStore();
    const scheduledDelays: number[] = [];
    try {
      const first = await markModelMemoryRuntimeDirtyAndSchedule({
        store,
        env: {
          MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_WRITES: "2",
          MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_MS: "60000",
        } as NodeJS.ProcessEnv,
        now: new Date("2026-04-22T00:00:01.000Z"),
        dirty: {
          reason: "ordinary_turn_capture_written",
          memoryIds: ["memory-1"],
          markedAt: new Date("2026-04-22T00:00:00.000Z"),
        },
        rebuild: async () => undefined,
        scheduleTimer: (_work, delayMs) => {
          scheduledDelays.push(delayMs);
          return undefined;
        },
      });
      const second = await markModelMemoryRuntimeDirtyAndSchedule({
        store,
        env: {
          MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_WRITES: "2",
          MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_MS: "60000",
        } as NodeJS.ProcessEnv,
        now: new Date("2026-04-22T00:00:02.000Z"),
        dirty: {
          reason: "tool_result_capture_written",
          memoryIds: ["memory-2"],
          markedAt: new Date("2026-04-22T00:00:01.000Z"),
        },
        rebuild: async () => undefined,
        scheduleTimer: (_work, delayMs) => {
          scheduledDelays.push(delayMs);
          return undefined;
        },
      });

      expect(first.schedulerReason).toBe("deferred");
      expect(second.schedulerReason).toBe("write_threshold");
      expect(second.state).toMatchObject({
        status: "scheduled",
        affectedMemoryIds: ["memory-1", "memory-2"],
        writeCountSinceLastRebuild: 2,
      });
      expect(scheduledDelays).toEqual([59_000, 0]);
      expect((await store.listRecentEvents()).map((event) => event.eventType)).toEqual([
        "runtime_dirty_marked",
        "runtime_dirty_marked",
        "runtime_rebuild_scheduled",
      ]);
    } finally {
      await cleanup();
    }
  });

  it("schedules rebuild when dirty age exceeds the coalescing threshold", async () => {
    const { store, cleanup } = await makeStore();
    try {
      await store.markDirty({
        reason: "document_ingest_written",
        memoryIds: ["memory-1"],
        markedAt: new Date("2026-04-22T00:00:00.000Z"),
      });

      const result = await markModelMemoryRuntimeDirtyAndSchedule({
        store,
        env: {
          MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_WRITES: "99",
          MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_MS: "30000",
        } as NodeJS.ProcessEnv,
        now: new Date("2026-04-22T00:00:31.000Z"),
        dirty: {
          reason: "document_ingest_written",
          memoryIds: ["memory-2"],
        },
        rebuild: async () => undefined,
        scheduleTimer: () => undefined,
      });

      expect(result.schedulerReason).toBe("age_threshold");
      expect(result.state.status).toBe("scheduled");
    } finally {
      await cleanup();
    }
  });

  it("marks dirty without scheduling when rebuilds are disabled", async () => {
    const { store, cleanup } = await makeStore();
    try {
      const result = await markModelMemoryRuntimeDirtyAndSchedule({
        store,
        env: {
          MODEL_MEMORY_RUNTIME_REBUILD_ENABLED: "false",
        } as NodeJS.ProcessEnv,
        dirty: {
          reason: "ordinary_turn_capture_written",
          memoryIds: ["memory-1"],
        },
        rebuild: async () => {
          throw new Error("must not run");
        },
      });

      expect(result).toMatchObject({
        scheduled: false,
        schedulerReason: "disabled",
      });
      expect(result.state.status).toBe("dirty");
    } finally {
      await cleanup();
    }
  });

  it("runs one rebuild at a time and records coalesced attempts", async () => {
    const { store, cleanup } = await makeStore();
    let release!: () => void;
    const events: string[] = [];
    try {
      await store.markDirty({ reason: "ordinary_turn_capture_written", memoryIds: ["memory-1"] });
      const first = runModelMemoryRuntimeRebuildWorker({
        store,
        rebuild: async () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
        onEvent: async (event) => {
          events.push(event.eventType);
        },
      });

      for (let index = 0; index < 20 && !events.includes("runtime_rebuild_started"); index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(events).toContain("runtime_rebuild_started");
      const second = await runModelMemoryRuntimeRebuildWorker({
        store,
        rebuild: async () => {
          throw new Error("must not run");
        },
        onEvent: async (event) => {
          events.push(event.eventType);
        },
      });
      release();
      await first;

      expect(second.status).toBe("rebuilding");
      expect(events).toContain("runtime_rebuild_coalesced");
      expect(events).toContain("runtime_rebuild_completed");
    } finally {
      await cleanup();
    }
  });

  it("clears dirty state after successful rebuild and preserves it on lock busy", async () => {
    const { store, cleanup } = await makeStore();
    try {
      await store.markDirty({ reason: "ordinary_turn_capture_written", memoryIds: ["memory-1"] });
      const completed = await runModelMemoryRuntimeRebuildWorker({
        store,
        rebuild: async () => undefined,
      });
      expect(completed.status).toBe("clean");
      expect(completed.lastRebuildAt).toBeTruthy();

      await store.markDirty({ reason: "tool_result_capture_written", memoryIds: ["memory-2"] });
      const lockBusyError = new Error("model-memory runtime rebuild lock is busy");
      lockBusyError.name = "RuntimeRebuildLockBusyError";
      const lockBusy = await runModelMemoryRuntimeRebuildWorker({
        store,
        rebuild: async () => {
          throw lockBusyError;
        },
      });
      expect(lockBusy).toMatchObject({
        status: "dirty",
        lastFailureClass: "runtime_rebuild_lock_busy",
        lastFailureStage: "runtime_rebuild_lock",
      });
      expect((await store.listRecentEvents()).map((event) => event.eventType)).toContain(
        "runtime_rebuild_skipped_lock_busy",
      );
    } finally {
      await cleanup();
    }
  });

  it("records failed rebuild metadata and supports explicit admin request", async () => {
    const { store, cleanup } = await makeStore();
    try {
      await store.requestRebuild({ sessionId: "session-001" });
      const failed = await runModelMemoryRuntimeRebuildWorker({
        store,
        classifyFailure: () => "db_persistence",
        rebuild: async () => {
          throw new Error("statement timeout");
        },
      });

      expect(failed).toMatchObject({
        status: "failed",
        dirtyReason: "manual_admin_request",
        lastFailureClass: "db_persistence",
        lastFailureStage: "runtime_rebuild",
      });
      expect((await store.listRecentEvents()).map((event) => event.eventType)).toEqual([
        "runtime_rebuild_admin_requested",
        "runtime_rebuild_started",
        "runtime_rebuild_failed",
      ]);
    } finally {
      await cleanup();
    }
  });

  it("resolves conservative scheduler settings from env", () => {
    expect(
      resolveModelMemoryRuntimeRebuildSchedulerSettings({
        MODEL_MEMORY_RUNTIME_REBUILD_ENABLED: "0",
        MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_WRITES: "9",
        MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_MS: "45000",
        MODEL_MEMORY_RUNTIME_REBUILD_MAX_CONCURRENCY: "2",
        MODEL_MEMORY_RUNTIME_REBUILD_RETRY_DELAY_MS: "120000",
        MODEL_MEMORY_RUNTIME_REBUILD_MAX_RETRIES: "3",
      } as NodeJS.ProcessEnv),
    ).toEqual({
      enabled: false,
      coalesceWrites: 9,
      coalesceMs: 45_000,
      maxConcurrency: 2,
      retryDelayMs: 120_000,
      maxRetries: 3,
    });
  });

  it("removes runtime dirty state for tests without touching semantic memory", async () => {
    const { baseDir, store } = await makeStore();
    await store.markDirty({ reason: "ordinary_turn_capture_written", memoryIds: ["memory-1"] });

    await resetModelMemoryRuntimeDirtyStoreForTests({ baseDir });

    await expect(fs.stat(baseDir)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
