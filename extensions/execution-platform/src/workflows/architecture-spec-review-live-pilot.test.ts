import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { runArchitectureSpecReviewLivePilot } from "./architecture-spec-review-live-pilot.ts";

describe("architecture/spec review live pilot", () => {
  it("runs a bounded architecture/spec runtime job with linked Work Queue readback", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(db.sql, runtimeJobs);

      const result = await runArchitectureSpecReviewLivePilot({
        runtimeJobs,
        workQueue,
        createWorkQueueFixture: true,
        runtimeJobId: "architecture-spec-live-pilot-test-job",
        reviewRunId: "architecture-spec-live-pilot-test-run",
        objectiveSummary: "Review the architecture for Work Queue route-state projection.",
      });

      expect(result).toMatchObject({
        status: "completed",
        workflowId: "agent_team.architecture",
        jobType: "executor.agent_team",
        deployPerformed: false,
        outboundSendPerformed: false,
        modelPromotionPerformed: false,
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutated: false,
      });
      expect(result.workQueueReadback).toMatchObject({
        runtimeJobId: "architecture-spec-live-pilot-test-job",
        workflowId: "agent_team.architecture",
        validationState: "accepted",
      });
    } finally {
      await db.close();
    }
  });
});
