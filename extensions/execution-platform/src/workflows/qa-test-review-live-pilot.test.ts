import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { runQaTestReviewLivePilot } from "./qa-test-review-live-pilot.ts";

describe("QA/test review live pilot", () => {
  it("runs a bounded QA/test runtime job and keeps process completion separate from lifecycle ownership", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(db.sql, runtimeJobs);

      const result = await runQaTestReviewLivePilot({
        runtimeJobs,
        workQueue,
        createWorkQueueFixture: true,
        runtimeJobId: "qa-test-live-pilot-test-job",
        reviewRunId: "qa-test-live-pilot-test-run",
        objectiveSummary: "Review focused validation coverage for the owner work batch.",
      });

      expect(result).toMatchObject({
        status: "completed",
        workflowId: "agent_team.qa_test",
        validationState: "passed",
        reviewState: "reviewed",
        closeoutState: "present",
        runtimeJobsCreated: true,
        controlsApplied: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        workQueueLifecycleMutated: false,
      });
      expect(result.workQueueReadback).toMatchObject({
        runtimeJobId: "qa-test-live-pilot-test-job",
        workflowId: "agent_team.qa_test",
        lifecycleTruthSource: "work_queue_repository",
        workQueueLifecycleMutationAllowed: false,
      });
    } finally {
      await db.close();
    }
  });
});
