import { describe, expect, it, vi } from "vitest";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryBackgroundJobListTool,
  normalizeMemoryBackgroundJobListInput,
} from "./memory-background-job-list.js";

function createRuntime() {
  return {
    backgroundJobs: {
      list: vi.fn(async () => ({
        accepted: true,
        status: "ok",
        jobs: [
          {
            jobId: "job-1",
            jobClass: "proactive_plan",
            jobKind: "maintenance",
            status: "queued",
            runAfter: "2026-04-02T00:00:00.000Z",
            attempts: 0,
            maxAttempts: 3,
            payloadFingerprint: "abc123",
          },
        ],
      })),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory background-job-list tool", () => {
  it("normalizes optional list filters", () => {
    expect(
      normalizeMemoryBackgroundJobListInput({
        projectId: " project-1 ",
        jobClass: "proactive_plan",
        status: "queued",
        limit: "10",
      }),
    ).toEqual({
      projectId: "project-1",
      jobClass: "proactive_plan",
      status: "queued",
      limit: 10,
    });
  });

  it("routes list requests through the background-job seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryBackgroundJobListTool({ runtime });

    const result = await tool.execute("call-1", {
      jobClass: "proactive_plan",
      status: "queued",
    });

    expect(runtime.backgroundJobs.list).toHaveBeenCalledWith({
      jobClass: "proactive_plan",
      status: "queued",
    });
    expect(result.details).toMatchObject({
      accepted: true,
      status: "ok",
      jobs: [expect.objectContaining({ jobId: "job-1" })],
    });
  });
});
