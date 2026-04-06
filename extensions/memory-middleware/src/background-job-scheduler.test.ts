import { describe, expect, it, vi } from "vitest";
import { createBackgroundJobSchedulerPort } from "./background-job-scheduler.js";
import type { MemoryMiddlewareDb } from "./db/runtime.js";

function createDbStub(params?: {
  enqueueBackgroundJob?: () => Promise<unknown>;
  claimNextBackgroundJob?: () => Promise<unknown>;
}) {
  return {
    queries: {
      enqueueBackgroundJob:
        params?.enqueueBackgroundJob ??
        vi.fn(async () => ({
          accepted: true,
          status: "queued",
          jobId: "job-1",
          jobClass: "proactive_plan",
          jobKind: "maintenance",
          runAfter: "2026-04-06T00:00:00.000Z",
          payloadFingerprint: "fp-1",
        })),
      listBackgroundJobs: vi.fn(),
      getBackgroundJob: vi.fn(),
      claimNextBackgroundJob:
        params?.claimNextBackgroundJob ??
        vi.fn(async () => {
          throw new Error("connect ECONNREFUSED 127.0.0.1:1");
        }),
      finalizeBackgroundJob: vi.fn(async () => {}),
    },
  } as unknown as MemoryMiddlewareDb;
}

describe("background-job scheduler port", () => {
  it("fails cleanly for enqueue when the database is unavailable", async () => {
    const port = createBackgroundJobSchedulerPort({
      db: createDbStub({
        enqueueBackgroundJob: vi.fn(async () => {
          throw new Error("connect ECONNREFUSED 127.0.0.1:1");
        }),
      }),
      consolidationExecution: { execute: vi.fn() } as never,
      consolidationPlanning: { plan: vi.fn() } as never,
      proactivePlanning: { plan: vi.fn() } as never,
      proactiveExecution: { execute: vi.fn() } as never,
      inspectionMode: "enabled",
      advisorySchedulingMode: "candidate-only",
      advisoryJobClasses: ["proactive_plan", "consolidation_plan"],
      executeSchedulingMode: "candidate-only",
      executeJobClasses: ["proactive_execute_run_drift_check", "consolidation_execute"],
    });

    await expect(port.enqueue({ jobClass: "proactive_plan" })).resolves.toEqual({
      accepted: false,
      status: "failed",
      jobClass: "proactive_plan",
      reason: "memory middleware database is unavailable",
    });
  });

  it("fails cleanly for run-next when claiming a job hits an unavailable database", async () => {
    const port = createBackgroundJobSchedulerPort({
      db: createDbStub(),
      consolidationExecution: { execute: vi.fn() } as never,
      consolidationPlanning: { plan: vi.fn() } as never,
      proactivePlanning: { plan: vi.fn() } as never,
      proactiveExecution: { execute: vi.fn() } as never,
      inspectionMode: "enabled",
      advisorySchedulingMode: "candidate-only",
      advisoryJobClasses: ["proactive_plan", "consolidation_plan"],
      executeSchedulingMode: "candidate-only",
      executeJobClasses: ["proactive_execute_run_drift_check", "consolidation_execute"],
    });

    await expect(port.runNext({})).resolves.toEqual({
      accepted: false,
      status: "failed",
      reason: "memory middleware database is unavailable",
    });
  });
});
