import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { runResearchToCodingHandoffPilot } from "./research-to-coding-handoff-pilot.ts";

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
  sourceRef: "official-docs://research-to-coding",
  sourceKind: "official_docs" as const,
  urlHash: "url-hash",
  contentHash: "content-hash",
  titleSummary: "Official documentation source",
  citationSummary: "Bounded research finding for coding handoff.",
  retrievedAt: "2026-05-08T00:00:00.000Z",
};

describe("research-to-coding handoff pilot", () => {
  it("passes bounded web research refs into coding parent evidence", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      const result = await runResearchToCodingHandoffPilot({
        runtimeJobs,
        parentRuntimeJobId: "research-to-coding-parent",
        childRuntimeJobId: "research-to-coding-child",
        teamRunId: "research-to-coding-team-run",
        researchRunId: "research-to-coding-research-run",
        objectiveSummary: "Use current docs to make a tiny safe coding improvement.",
        boundedResearchSummary: "Use bounded current-doc source refs before coding.",
        sources: [source],
      });

      expect(result.status).toBe("completed");
      expect(result.handoffAccepted).toBe(true);
      expect(result.parentArtifactRefs.join(" ")).toContain("agent-team");
      expect(result.childArtifactRefs.join(" ")).toContain("web-research");
      expect(result.rawPageStored).toBe(false);
      expect(result.authorityGranted).toBe(false);
      expect(result.workQueueLifecycleMutated).toBe(false);
      await expect(runtimeJobs.getJob("research-to-coding-parent")).resolves.toMatchObject({
        state: "succeeded",
      });
      await expect(runtimeJobs.getJob("research-to-coding-child")).resolves.toMatchObject({
        state: "succeeded",
      });
    });
  });

  it("projects parent and child evidence through fixture Work Queue readback", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const result = await runResearchToCodingHandoffPilot({
        runtimeJobs,
        workQueue,
        createWorkQueueFixture: true,
        parentRuntimeJobId: "research-to-coding-parent-fixture",
        childRuntimeJobId: "research-to-coding-child-fixture",
        teamRunId: "research-to-coding-team-run-fixture",
        researchRunId: "research-to-coding-research-run-fixture",
        objectiveSummary: "Use current docs to make a tiny safe coding improvement.",
        boundedResearchSummary: "Use bounded current-doc source refs before coding.",
        sources: [source],
      });

      expect(result.workQueueReadback).toMatchObject({
        parentRuntimeJobId: "research-to-coding-parent-fixture",
        childRuntimeJobId: "research-to-coding-child-fixture",
        parentHandoffCount: 1,
        childSourceCount: 1,
        workQueueLifecycleMutationAllowed: false,
      });
    });
  });

  it("supports live Work Queue-linked research-to-coding handoff refs", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const result = await runResearchToCodingHandoffPilot({
        runtimeJobs,
        workQueue,
        createWorkQueueLinkage: true,
        parentRuntimeJobId: "research-to-coding-linked-parent",
        childRuntimeJobId: "research-to-coding-linked-child",
        teamRunId: "research-to-coding-linked-team-run",
        researchRunId: "research-to-coding-linked-research-run",
        objectiveSummary: "Use current docs to make a tiny safe coding improvement.",
        boundedResearchSummary: "Use bounded current-doc source refs before coding.",
        sources: [source],
      });

      expect(result.mode).toBe("runtime_with_work_queue_linkage");
      expect(result.handoffAccepted).toBe(true);
      expect(result.workQueueReadback).toMatchObject({
        parentRuntimeJobId: "research-to-coding-linked-parent",
        childRuntimeJobId: "research-to-coding-linked-child",
        parentHandoffCount: 1,
        childSourceCount: 1,
        workQueueLifecycleMutationAllowed: false,
      });
      expect(result.authorityGranted).toBe(false);
      expect(result.rawPageStored).toBe(false);
      expect(result.workQueueLifecycleMutated).toBe(false);
    });
  });
});
