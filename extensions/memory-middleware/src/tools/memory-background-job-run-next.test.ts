import { describe, expect, it, vi } from "vitest";
import type { MemoryBackgroundJobRunNextResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryBackgroundJobRunNextTool,
  normalizeMemoryBackgroundJobRunNextInput,
} from "./memory-background-job-run-next.js";

function createRuntime() {
  return {
    backgroundJobs: {
      runNext: vi.fn(async () => ({
        accepted: true,
        status: "executed",
        jobId: "job-1",
        jobClass: "proactive_plan",
        jobStatus: "succeeded",
        rationale: ["bounded background job executed advisory proactive planning only"],
        proactivePlanResult: {
          accepted: true,
          status: "ok",
          outcome: "no_action",
          advisoryOnly: true,
          advisoryNote: "Advisory only. No proactive actions were executed.",
          actions: [
            {
              actionType: "no_action",
              priority: "none",
              actionClass: "none",
              requiredApprovalClass: "none",
              affectedIds: [],
              rationale: [
                "bounded middleware state does not currently suggest a useful proactive follow-up",
              ],
              advisoryOnly: true,
              advisoryNote: "Advisory only. No proactive actions were executed.",
            },
          ],
          inspectedState: {
            pendingCandidateReviewCount: 0,
            eligibleProcedureValidationCount: 0,
            candidateSkillGovernanceCount: 0,
            staleMemoryCount: 0,
            driftCheckCount: 0,
            consolidationReviewCount: 0,
          },
          rationale: ["no bounded proactive follow-up opportunities were identified"],
        },
      })),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory background-job-run-next tool", () => {
  it("normalizes optional run-next input", () => {
    expect(
      normalizeMemoryBackgroundJobRunNextInput({
        rawParams: {
          projectId: " project-1 ",
          runnerId: " runner-1 ",
        },
      }),
    ).toEqual({
      projectId: "project-1",
      runnerId: "runner-1",
    });
  });

  it("routes run-next through the background-job seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryBackgroundJobRunNextTool({ runtime });

    const result = await tool.execute("call-1", {
      projectId: "project-1",
    });

    expect(runtime.backgroundJobs.runNext).toHaveBeenCalledWith({
      projectId: "project-1",
    });
    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      jobId: "job-1",
    });
  });

  it("surfaces no-job results without mutation", async () => {
    const runtime = createRuntime();
    runtime.backgroundJobs.runNext = vi.fn(
      async () =>
        ({
          accepted: true,
          status: "no_job",
          rationale: ["no queued bounded background job is currently ready to run"],
        }) satisfies MemoryBackgroundJobRunNextResult,
    );
    const tool = createMemoryBackgroundJobRunNextTool({ runtime });

    const result = await tool.execute("call-2", {});

    expect(result.details).toEqual({
      accepted: true,
      status: "no_job",
      rationale: ["no queued bounded background job is currently ready to run"],
    });
  });

  it("surfaces advisory consolidation-planning results", async () => {
    const runtime = createRuntime();
    runtime.backgroundJobs.runNext = vi.fn(
      async () =>
        ({
          accepted: true,
          status: "executed",
          jobId: "job-2",
          jobClass: "consolidation_plan",
          jobStatus: "succeeded",
          rationale: ["bounded background job executed advisory consolidation planning only"],
          consolidationPlanResult: {
            accepted: true,
            status: "ok",
            outcome: "review_needed",
            inspectedRecordCount: 2,
            includeValidatedProcedures: false,
            findings: [
              {
                actionType: "duplicate_merge_review",
                priority: "medium",
                confidence: "high",
                affectedObjectIds: ["memory-1", "memory-2"],
                affectedObjectTypes: ["memory_object", "memory_object"],
                rationale: ["bounded approved durable memory appears duplicate"],
              },
            ],
            rationale: ["bounded consolidation review findings were identified"],
          },
        }) satisfies MemoryBackgroundJobRunNextResult,
    );
    const tool = createMemoryBackgroundJobRunNextTool({ runtime });

    const result = await tool.execute("call-3", {});

    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      jobId: "job-2",
      jobClass: "consolidation_plan",
      jobStatus: "succeeded",
      consolidationPlanResult: {
        accepted: true,
        status: "ok",
        outcome: "review_needed",
      },
    });
  });

  it("surfaces bounded consolidation-execution results", async () => {
    const runtime = createRuntime();
    runtime.backgroundJobs.runNext = vi.fn(
      async () =>
        ({
          accepted: true,
          status: "executed",
          jobId: "job-3",
          jobClass: "consolidation_execute",
          jobStatus: "succeeded",
          rationale: [
            "bounded background job routed only safe consolidation execution selections through the existing bounded seam",
          ],
          consolidationExecuteResult: {
            accepted: true,
            status: "executed",
            executionMode: "approved_subset",
            reviewedFindingCount: 1,
            executedActionCount: 1,
            alreadyExecutedCount: 0,
            skippedFindingCount: 0,
            actions: [
              {
                actionType: "duplicate_merge_review",
                status: "executed",
                affectedObjectIds: ["memory-1", "memory-2"],
                supersededObjectIds: ["memory-2"],
                survivorObjectId: "memory-1",
                reviewIds: ["review-1"],
                linkIds: ["link-1"],
                rationale: ["duplicate durable memory objects were conservatively superseded"],
              },
            ],
            rationale: [
              "1 bounded consolidation action executed without touching contradiction or drift findings",
            ],
          },
        }) satisfies MemoryBackgroundJobRunNextResult,
    );
    const tool = createMemoryBackgroundJobRunNextTool({ runtime });

    const result = await tool.execute("call-4", {});

    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      jobId: "job-3",
      jobClass: "consolidation_execute",
      jobStatus: "succeeded",
      consolidationExecuteResult: {
        accepted: true,
        status: "executed",
        executionMode: "approved_subset",
      },
    });
  });
});
