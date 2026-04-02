import { describe, expect, it, vi } from "vitest";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryBackgroundJobEnqueueTool,
  normalizeMemoryBackgroundJobEnqueueInput,
} from "./memory-background-job-enqueue.js";

function createRuntime() {
  return {
    backgroundJobs: {
      enqueue: vi.fn(async () => ({
        accepted: true,
        status: "queued",
        jobId: "job-1",
        jobClass: "proactive_plan",
        jobKind: "maintenance",
        runAfter: "2026-04-02T00:00:00.000Z",
        payloadFingerprint: "abc123",
      })),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory background-job-enqueue tool", () => {
  it("normalizes enqueue input with optional context defaults", () => {
    expect(
      normalizeMemoryBackgroundJobEnqueueInput({
        rawParams: {
          jobClass: "proactive_execute_run_drift_check",
          projectId: " project-1 ",
          runAfter: "2026-04-02T00:00:00.000Z",
          maxAttempts: "4",
          maxActions: "3",
          affectedIds: [" memory-2 ", "memory-1", "memory-2"],
        },
        context: {
          sessionId: "session-1",
          agentId: "agent-1",
        } as never,
      }),
    ).toEqual({
      jobClass: "proactive_execute_run_drift_check",
      projectId: "project-1",
      sessionId: "session-1",
      agentId: "agent-1",
      runAfter: "2026-04-02T00:00:00.000Z",
      maxAttempts: 4,
      maxActions: 3,
      affectedIds: ["memory-1", "memory-2"],
    });
  });

  it("normalizes consolidation-plan enqueue input", () => {
    expect(
      normalizeMemoryBackgroundJobEnqueueInput({
        rawParams: {
          jobClass: "consolidation_plan",
          projectId: " project-1 ",
          includeValidatedProcedures: true,
          limit: "8",
          maxFindings: "4",
        },
      }),
    ).toEqual({
      jobClass: "consolidation_plan",
      projectId: "project-1",
      includeValidatedProcedures: true,
      limit: 8,
      maxFindings: 4,
    });
  });

  it("normalizes consolidation-execute enqueue input with an explicit safe approved subset", () => {
    expect(
      normalizeMemoryBackgroundJobEnqueueInput({
        rawParams: {
          jobClass: "consolidation_execute",
          projectId: " project-1 ",
          approvedFindings: [
            {
              actionType: "stale_superseded_review",
              affectedObjectIds: [" memory-2 "],
            },
            {
              actionType: "duplicate_merge_review",
              affectedObjectIds: [" memory-1 ", "memory-3", "memory-1"],
            },
          ],
          reviewerAgentId: " reviewer-1 ",
        },
      }),
    ).toEqual({
      jobClass: "consolidation_execute",
      projectId: "project-1",
      approvedFindings: [
        {
          actionType: "duplicate_merge_review",
          affectedObjectIds: ["memory-1", "memory-3"],
        },
        {
          actionType: "stale_superseded_review",
          affectedObjectIds: ["memory-2"],
        },
      ],
      reviewerAgentId: "reviewer-1",
    });
  });

  it("routes enqueue requests through the background-job seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryBackgroundJobEnqueueTool({ runtime });

    const result = await tool.execute("call-1", {
      jobClass: "proactive_plan",
      projectId: "project-1",
      maxActions: 2,
    });

    expect(runtime.backgroundJobs.enqueue).toHaveBeenCalledWith({
      jobClass: "proactive_plan",
      projectId: "project-1",
      maxActions: 2,
    });
    expect(result.details).toMatchObject({
      accepted: true,
      status: "queued",
      jobId: "job-1",
    });
  });

  it("rejects unknown background job classes", () => {
    expect(() =>
      normalizeMemoryBackgroundJobEnqueueInput({
        rawParams: {
          jobClass: "install_skill",
        },
      }),
    ).toThrow("jobClass must be one of:");
  });
});
