import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  createWebResearchRuntimeEvidence,
  latestWebResearchRuntimeEvidence,
  recordWebResearchRuntimeEvidence,
  validateWebResearchRuntimeEvidence,
} from "./web-research-runtime-evidence.ts";

function source(index = 1) {
  return {
    sourceRef: `source-ref-${index}`,
    sourceKind: "official_docs" as const,
    urlHash: `url-hash-${index}`,
    contentHash: `content-hash-${index}`,
    titleSummary: `Official docs source ${index}`,
    citationSummary: `Bounded citation summary ${index}`,
    retrievedAt: "2026-05-08T00:00:00.000Z",
  };
}

async function withRuntime<T>(work: (runtimeJobs: RuntimeJobRepository) => Promise<T>): Promise<T> {
  const db = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(db.sql);
    const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
    await runtimeJobs.enqueueJob({
      jobId: "web-research-evidence-job",
      jobType: "executor.single_agent",
      queueName: "web-research",
      payload: {
        workflowId: "single_agent.web_research",
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });
    return await work(runtimeJobs);
  } finally {
    await db.close();
  }
}

describe("web research runtime evidence", () => {
  it("records bounded source and citation evidence as a runtime job artifact", async () => {
    await withRuntime(async (runtimeJobs) => {
      const evidence = createWebResearchRuntimeEvidence({
        runtimeJobId: "web-research-evidence-job",
        researchRunId: "research-run-1",
        boundedQuerySummary: "Research current structured-output docs.",
        boundedAnswerSummary: "Current structured-output guidance requires schema-shaped output.",
        sources: [source()],
      });
      const artifact = await recordWebResearchRuntimeEvidence({ runtimeJobs, evidence });
      const artifacts = await runtimeJobs.listArtifacts("web-research-evidence-job");
      const latest = latestWebResearchRuntimeEvidence(artifacts);

      expect(artifact.artifactType).toBe("web_research.runtime_evidence");
      expect(latest?.sources).toHaveLength(1);
      expect(latest?.rawPageStored).toBe(false);
      expect(latest?.externalWritePerformed).toBe(false);
      expect(latest?.workQueueLifecycleMutated).toBe(false);
    });
  });

  it("rejects unbounded source lists", () => {
    expect(() =>
      createWebResearchRuntimeEvidence({
        runtimeJobId: "web-research-evidence-job",
        researchRunId: "research-run-too-many",
        boundedQuerySummary: "Research current docs.",
        boundedAnswerSummary: "Bounded answer.",
        sources: Array.from({ length: 11 }, (_, index) => source(index + 1)),
      }),
    ).toThrow(/web_research_source_refs_unbounded/u);
  });

  it("rejects raw page and external write flags", () => {
    const evidence = createWebResearchRuntimeEvidence({
      runtimeJobId: "web-research-evidence-job",
      researchRunId: "research-run-flags",
      boundedQuerySummary: "Research current docs.",
      boundedAnswerSummary: "Bounded answer.",
      sources: [source()],
    });

    expect(
      validateWebResearchRuntimeEvidence({
        ...evidence,
        rawPageStored: true as false,
      }).reasonCodes,
    ).toContain("web_research_raw_storage_requested");
    expect(
      validateWebResearchRuntimeEvidence({
        ...evidence,
        externalWritePerformed: true as false,
      }).reasonCodes,
    ).toContain("web_research_external_write_performed");
  });

  it("rejects raw-content markers in bounded metadata", () => {
    const evidence = createWebResearchRuntimeEvidence({
      runtimeJobId: "web-research-evidence-job",
      researchRunId: "research-run-marker",
      boundedQuerySummary: "Research current docs.",
      boundedAnswerSummary: "Bounded answer.",
      sources: [source()],
    });

    expect(
      validateWebResearchRuntimeEvidence({
        ...evidence,
        boundedAnswerSummary: "raw page should not be stored here",
      }).reasonCodes,
    ).toContain("web_research_raw_content_marker_detected");
  });
});
