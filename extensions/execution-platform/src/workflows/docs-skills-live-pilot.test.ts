import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { runDocsSkillsLivePilot } from "./docs-skills-live-pilot.ts";

describe("docs/skills live pilot", () => {
  it("runs a bounded docs/skills runtime job with Work Queue readback and no skill promotion", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(db.sql, runtimeJobs);

      const result = await runDocsSkillsLivePilot({
        runtimeJobs,
        workQueue,
        createWorkQueueFixture: true,
        runtimeJobId: "docs-skills-live-pilot-test-job",
        reviewRunId: "docs-skills-live-pilot-test-run",
        objectiveSummary: "Update bounded runbook notes for live structured router setup.",
      });

      expect(result).toMatchObject({
        status: "completed",
        workflowId: "workflow.docs_skills",
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        skillInstalled: false,
        skillEnabled: false,
        skillPromoted: false,
        workQueueLifecycleMutated: false,
      });
      expect(result.workQueueReadback).toMatchObject({
        runtimeJobId: "docs-skills-live-pilot-test-job",
        workflowId: "workflow.docs_skills",
        validationState: "accepted",
        closeoutState: "present",
        workQueueLifecycleMutationAllowed: false,
      });
      expect(result.humanCloseoutSummary.eli5Summary).toContain("runtime job");
      await expect(runtimeJobs.getJob("docs-skills-live-pilot-test-job")).resolves.toMatchObject({
        state: "succeeded",
      });
    } finally {
      await db.close();
    }
  });
});
