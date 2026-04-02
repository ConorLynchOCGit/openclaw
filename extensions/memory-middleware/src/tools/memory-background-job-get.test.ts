import { describe, expect, it, vi } from "vitest";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryBackgroundJobGetTool,
  normalizeMemoryBackgroundJobGetInput,
} from "./memory-background-job-get.js";

function createRuntime() {
  return {
    backgroundJobs: {
      get: vi.fn(async () => ({
        accepted: true,
        status: "ok",
        job: {
          jobId: "job-1",
          jobClass: "proactive_plan",
          jobKind: "maintenance",
          status: "queued",
          runAfter: "2026-04-02T00:00:00.000Z",
          attempts: 0,
          maxAttempts: 3,
          payloadFingerprint: "abc123",
        },
      })),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory background-job-get tool", () => {
  it("normalizes the required job id", () => {
    expect(normalizeMemoryBackgroundJobGetInput({ jobId: " job-1 " })).toEqual({
      jobId: "job-1",
    });
  });

  it("routes get requests through the background-job seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryBackgroundJobGetTool({ runtime });

    const result = await tool.execute("call-1", {
      jobId: "job-1",
    });

    expect(runtime.backgroundJobs.get).toHaveBeenCalledWith({
      jobId: "job-1",
    });
    expect(result.details).toMatchObject({
      accepted: true,
      status: "ok",
      job: expect.objectContaining({ jobId: "job-1" }),
    });
  });
});
