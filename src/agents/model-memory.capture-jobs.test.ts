import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyMemoryIngestionFailure } from "../plugin-sdk/model-memory.js";
import {
  buildMemoryCaptureJob,
  buildOrdinaryTurnCaptureSourceHash,
  createMemoryCaptureJobStore,
  runMemoryCaptureJobTask,
} from "./model-memory.capture-jobs.js";

function classifyFailure(error: unknown) {
  return classifyMemoryIngestionFailure(error instanceof Error ? error.message : String(error));
}

async function withTempCaptureStore<T>(
  run: (params: {
    baseDir: string;
    store: ReturnType<typeof createMemoryCaptureJobStore>;
  }) => Promise<T>,
) {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-capture-jobs-"));
  try {
    const store = createMemoryCaptureJobStore({ baseDir });
    return await run({ baseDir, store });
  } finally {
    await fs.rm(baseDir, { recursive: true, force: true });
  }
}

function testJob(jobId = "capture_job_test") {
  return buildMemoryCaptureJob({
    jobId,
    sourceKind: "ordinary_turn",
    sessionId: "session-1",
    sessionKey: "agent:main:main",
    agentId: "main",
    sourceHash: buildOrdinaryTurnCaptureSourceHash({
      userText: "Please remember this private raw sentence must not persist.",
      assistantText: "Acknowledged.",
      sessionId: "session-1",
      sessionKey: "agent:main:main",
      agentId: "main",
    }),
    provider: "openai",
    model: "gpt-test",
  });
}

describe("memory capture jobs", () => {
  it("persists queued and failed job state across store reloads without raw turn text", async () => {
    await withTempCaptureStore(async ({ baseDir, store }) => {
      const job = testJob();
      await store.enqueue(job);
      await store.markFailed(job.jobId, {
        failureClass: "timeout",
        stage: "persistence_boundary",
        retryCount: 0,
      });

      const reloaded = createMemoryCaptureJobStore({ baseDir });
      const jobs = await reloaded.listJobs();

      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        jobId: job.jobId,
        status: "failed",
        failureClass: "timeout",
        rawContentPersisted: false,
        containsPromptText: false,
      });
      expect(JSON.stringify(jobs[0])).not.toContain("private raw sentence");
    });
  });

  it("emits queued, started, and written events on success", async () => {
    await withTempCaptureStore(async ({ store }) => {
      const events: string[] = [];
      const result = await runMemoryCaptureJobTask({
        job: testJob("capture_job_success"),
        store,
        classifyFailure,
        execute: async () => ({
          status: "written",
          safeRelatedIds: {
            sourceId: "source_1",
            segmentIds: ["segment_1"],
            memoryIds: ["memory_1"],
          },
          metrics: { memories: 1 },
        }),
        onEvent: async ({ event }) => {
          events.push(event.eventType);
        },
      });

      expect(result.status).toBe("written");
      expect(events).toEqual(["capture_queued", "capture_started", "capture_written"]);
      expect(result.safeRelatedIds?.memoryIds).toEqual(["memory_1"]);
    });
  });

  it("does not regress an already-written job on duplicate execution", async () => {
    await withTempCaptureStore(async ({ store }) => {
      const events: string[] = [];
      const job = testJob("capture_job_duplicate_written");
      const first = await runMemoryCaptureJobTask({
        job,
        store,
        classifyFailure,
        execute: async () => ({
          status: "written",
          safeRelatedIds: { memoryIds: ["memory_written_once"] },
        }),
      });

      const second = await runMemoryCaptureJobTask({
        job,
        store,
        classifyFailure,
        execute: async () => {
          throw new Error("duplicate execution should not run");
        },
        onEvent: async ({ event }) => {
          events.push(event.eventType);
        },
      });

      expect(first.status).toBe("written");
      expect(second.status).toBe("written");
      expect(second.safeRelatedIds?.memoryIds).toEqual(["memory_written_once"]);
      expect(events).toEqual([]);
      expect((await store.getJob(job.jobId))?.status).toBe("written");
    });
  });

  it("classes DB timeout failures as failed capture jobs", async () => {
    await withTempCaptureStore(async ({ store }) => {
      const events: Array<{ type: string; failureClass?: string }> = [];

      await expect(
        runMemoryCaptureJobTask({
          job: testJob("capture_job_timeout"),
          store,
          maxRetries: 0,
          classifyFailure,
          execute: async () => {
            throw new Error("canceling statement due to statement timeout");
          },
          onEvent: async ({ event }) => {
            events.push({ type: event.eventType, failureClass: event.failureClass });
          },
        }),
      ).rejects.toThrow("statement timeout");

      expect(events.at(-1)).toEqual({
        type: "capture_failed",
        failureClass: "timeout",
      });
      expect((await store.getJob("capture_job_timeout"))?.status).toBe("failed");
    });
  });

  it("schedules one bounded retry for provider empty responses", async () => {
    await withTempCaptureStore(async ({ store }) => {
      const events: string[] = [];
      let attempts = 0;

      const result = await runMemoryCaptureJobTask({
        job: testJob("capture_job_empty_response"),
        store,
        maxRetries: 1,
        retryDelayMs: 0,
        classifyFailure,
        sleep: async () => undefined,
        execute: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error("provider_response missing text content");
          }
          return { status: "written", safeRelatedIds: { memoryIds: ["memory_retry"] } };
        },
        onEvent: async ({ event }) => {
          events.push(event.eventType);
        },
      });

      expect(result.status).toBe("written");
      expect(attempts).toBe(2);
      expect(events).toEqual([
        "capture_queued",
        "capture_started",
        "capture_retry_scheduled",
        "capture_started",
        "capture_written",
      ]);
    });
  });

  it("schedules bounded retry for database pool pressure", async () => {
    await withTempCaptureStore(async ({ store }) => {
      const events: Array<{ type: string; failureClass?: string; stage?: string }> = [];
      let attempts = 0;

      const result = await runMemoryCaptureJobTask({
        job: testJob("capture_job_pool_pressure"),
        store,
        maxRetries: 1,
        retryDelayMs: 0,
        classifyFailure,
        sleep: async () => undefined,
        execute: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error("pool_pressure: capture lane deferred");
          }
          return { status: "written", safeRelatedIds: { memoryIds: ["memory_pool"] } };
        },
        onEvent: async ({ event }) => {
          events.push({
            type: event.eventType,
            failureClass: event.failureClass,
            stage: event.stage,
          });
        },
      });

      expect(result.status).toBe("written");
      expect(events).toContainEqual({
        type: "capture_retry_scheduled",
        failureClass: "pool_pressure",
        stage: "pool_pressure_or_timeout",
      });
    });
  });

  it("does not retry no-store/privacy/temp skips", async () => {
    await withTempCaptureStore(async ({ store }) => {
      let attempts = 0;
      const result = await runMemoryCaptureJobTask({
        job: testJob("capture_job_skip"),
        store,
        maxRetries: 3,
        classifyFailure,
        execute: async () => {
          attempts += 1;
          return { status: "skipped", reason: "no_durable_candidate" };
        },
      });

      expect(result.status).toBe("skipped");
      expect(result.stage).toBe("no_durable_candidate");
      expect(attempts).toBe(1);
    });
  });

  it("does not retry non-retryable schema failures", async () => {
    await withTempCaptureStore(async ({ store }) => {
      const events: string[] = [];

      await expect(
        runMemoryCaptureJobTask({
          job: testJob("capture_job_schema"),
          store,
          maxRetries: 3,
          classifyFailure: () => "provider_json_boundary",
          execute: async () => {
            throw new Error("unsupported strict schema");
          },
          onEvent: async ({ event }) => {
            events.push(event.eventType);
          },
        }),
      ).rejects.toThrow("unsupported strict schema");

      expect(events).toEqual(["capture_queued", "capture_started", "capture_failed"]);
      expect((await store.getJob("capture_job_schema"))?.retryCount).toBe(0);
    });
  });

  it("records replay requests as safe inspection events only", async () => {
    await withTempCaptureStore(async ({ store }) => {
      const job = testJob("capture_job_replay");
      await store.enqueue(job);
      const replay = await store.requestReplay(job.jobId);

      expect(replay.event.eventType).toBe("capture_replay_requested");
      expect(replay.job.status).toBe("replay_requested");
      expect(JSON.stringify(replay)).not.toContain("Please remember");
      expect(JSON.stringify(replay)).not.toContain("Acknowledged");
    });
  });
});
