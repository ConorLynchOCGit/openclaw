import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { runOwnerWorkBatch } from "./owner-work-batch.ts";

describe("owner work batch", () => {
  it("runs linked coding, research, handoff, and UX dogfood tasks with bounded evidence", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(db.sql, runtimeJobs);

      const result = await runOwnerWorkBatch({ runtimeJobs, workQueue });

      expect(result.status).toBe("completed");
      expect(result.taskCount).toBe(7);
      expect(result.completedCount).toBe(7);
      expect(result.runtimeJobIds.length).toBeGreaterThanOrEqual(8);
      expect(result.workQueueItemIds.length).toBeGreaterThanOrEqual(7);
      expect(result.taskResults.map((task) => task.workflowId)).toEqual(
        expect.arrayContaining([
          "workflow.docs_skills",
          "agent_team.architecture",
          "agent_team.qa_test",
        ]),
      );
      expect(result.runtimeJobsCreated).toBe(true);
      expect(result.liveWorkQueueItemsCreated).toBe(true);
      expect(result.authorityGranted).toBe(false);
      expect(result.deployPerformed).toBe(false);
      expect(result.outboundSendPerformed).toBe(false);
      expect(result.modelPromotionPerformed).toBe(false);
      expect(result.rawPromptStored).toBe(false);
      expect(result.rawResponseStored).toBe(false);
      expect(result.rawProviderLogStored).toBe(false);
      expect(result.rawToolLogStored).toBe(false);
      expect(result.rawPageStored).toBe(false);
      expect(result.workQueueLifecycleMutated).toBe(false);
    } finally {
      await db.close();
    }
  });
});
