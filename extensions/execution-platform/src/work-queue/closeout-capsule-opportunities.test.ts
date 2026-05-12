import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "../workers/test-closeout-capsule-fixture.ts";
import { SKILLIFIER_RUNTIME_JOB_TYPE } from "../workflows/skillifier-runtime-workflow.ts";
import {
  createSkillifierRuntimePayloadFromCloseoutSeed,
  enqueueCloseoutCapsuleOpportunitySeedsAsSkillifierRuntimeJobs,
} from "./closeout-capsule-opportunities.ts";

async function withRepository<T>(work: (repository: RuntimeJobRepository) => Promise<T>) {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    return await work(new RuntimeJobRepository(database.sql, { claimStrategy: "basic" }));
  } finally {
    await database.close();
  }
}

describe("Closeout Capsule to Skillifier runtime integration", () => {
  it("builds bounded Skillifier runtime payloads without raw content", () => {
    const capsule = createModelAuthoredCloseoutCapsuleFixture({
      runtimeJobId: "skillifier-source-job",
    });
    const payload = createSkillifierRuntimePayloadFromCloseoutSeed({
      capsule,
      seedId: "skillifier-source-job-seed-1",
    });

    expect(payload).toMatchObject({
      workflowId: "workflow.skillifier",
      requestedOutcome: "review_candidate",
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    });
    expect(payload?.opportunitySeedRefs[0]).toContain("closeout-capsule://");
  });

  it("enqueues Skillifier runtime jobs and deduplicates repeat seeds", async () => {
    await withRepository(async (repository) => {
      const capsule = createModelAuthoredCloseoutCapsuleFixture({
        runtimeJobId: "skillifier-source-job",
      });
      const first = await enqueueCloseoutCapsuleOpportunitySeedsAsSkillifierRuntimeJobs({
        runtimeJobs: repository,
        capsule,
      });
      const second = await enqueueCloseoutCapsuleOpportunitySeedsAsSkillifierRuntimeJobs({
        runtimeJobs: repository,
        capsule,
      });

      expect(first.createdRuntimeJobIds).toHaveLength(1);
      expect(first.runtimeJobs[0]?.jobType).toBe(SKILLIFIER_RUNTIME_JOB_TYPE);
      expect(second.duplicateRuntimeJobIds).toEqual(first.createdRuntimeJobIds);
      expect(second.createdRuntimeJobIds).toHaveLength(0);
      expect(first.rawPromptStored).toBe(false);
      expect(first.workQueueLifecycleMutated).toBe(false);
    });
  });
});
