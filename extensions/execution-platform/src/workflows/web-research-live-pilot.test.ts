import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { runWebResearchLivePilot } from "./web-research-live-pilot.ts";

async function withRuntime<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    workQueue: WorkQueueRepository;
  }) => Promise<T>,
): Promise<T> {
  const db = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(db.sql);
    const runtimeJobs = new RuntimeJobRepository(db.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-05-08T00:00:00.000Z"),
    });
    const workQueue = new WorkQueueRepository(db.sql, runtimeJobs, {
      now: () => new Date("2026-05-08T00:00:00.000Z"),
    });
    return await work({ runtimeJobs, workQueue });
  } finally {
    await db.close();
  }
}

const source = {
  sourceRef: "official-openai-docs://structured-outputs",
  sourceKind: "official_docs" as const,
  urlHash: "url-hash",
  contentHash: "content-hash",
  titleSummary: "OpenAI structured outputs guide",
  citationSummary: "Bounded citation summary for structured output guidance.",
  retrievedAt: "2026-05-08T00:00:00.000Z",
};

describe("web research live pilot", () => {
  it("runs a runtime-only web research job with bounded evidence", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      const result = await runWebResearchLivePilot({
        runtimeJobs,
        runtimeJobId: "web-research-runtime-only-job",
        researchRunId: "web-research-runtime-only-run",
        boundedQuerySummary: "Research current structured-output docs.",
        boundedAnswerSummary: "Structured-output guidance was recorded as bounded refs only.",
        sources: [source],
      });

      expect(result.status).toBe("completed");
      expect(result.mode).toBe("runtime_only");
      expect(result.sourceCount).toBe(1);
      expect(result.humanCloseoutSummary.eli5Summary).toContain("page bodies");
      expect(result.rawPageStored).toBe(false);
      expect(result.externalWritePerformed).toBe(false);
      expect(result.workQueueLifecycleMutated).toBe(false);
      const job = await runtimeJobs.getJob("web-research-runtime-only-job");
      expect(job?.state).toBe("succeeded");
    });
  });

  it("projects fixture Work Queue readback without lifecycle mutation", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const result = await runWebResearchLivePilot({
        runtimeJobs,
        workQueue,
        createWorkQueueFixture: true,
        runtimeJobId: "web-research-fixture-job",
        researchRunId: "web-research-fixture-run",
        boundedQuerySummary: "Research current structured-output docs.",
        boundedAnswerSummary: "Structured-output guidance was recorded as bounded refs only.",
        sources: [source],
      });

      expect(result.workQueueReadback).toMatchObject({
        runtimeJobId: "web-research-fixture-job",
        webResearchState: "present",
        sourceCount: 1,
        citationCount: 1,
        workQueueLifecycleMutationAllowed: false,
      });
      expect(result.runtimeJobsCreated).toBe(true);
      expect(result.authorityGranted).toBe(false);
      expect(result.controlsApplied).toBe(false);
      expect(result.workQueueLifecycleMutated).toBe(false);
    });
  });

  it("supports live Work Queue-linked mode with bounded source evidence", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const result = await runWebResearchLivePilot({
        runtimeJobs,
        workQueue,
        createWorkQueueLinkage: true,
        runtimeJobId: "web-research-linked-job",
        researchRunId: "web-research-linked-run",
        boundedQuerySummary: "Research current structured-output docs.",
        boundedAnswerSummary: "Structured-output guidance was recorded as bounded refs only.",
        sources: [source],
      });

      expect(result.mode).toBe("runtime_with_work_queue_linkage");
      expect(result.workQueueReadback).toMatchObject({
        runtimeJobId: "web-research-linked-job",
        webResearchState: "present",
        sourceCount: 1,
        citationCount: 1,
        workQueueLifecycleMutationAllowed: false,
      });
      expect(result.rawPageStored).toBe(false);
      expect(result.rawProviderLogStored).toBe(false);
      expect(result.workQueueLifecycleMutated).toBe(false);
      await expect(runtimeJobs.getJob("web-research-linked-job")).resolves.toMatchObject({
        state: "succeeded",
      });
    });
  });
});
