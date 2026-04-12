import { describe, expect, it } from "vitest";
import { runDocumentMemoryIngestionBenchmark } from "./document-memory-ingestion-benchmark.js";

describe("document memory ingestion benchmark", () => {
  it("meets the current benchmark bar across representative source styles", async () => {
    const report = await runDocumentMemoryIngestionBenchmark();

    expect(report.readiness.readyForLimitedBulkIngestion).toBe(true);
    expect(report.readiness.blockingIssueCount).toBe(0);
    expect(report.caseResults).toHaveLength(8);
    expect(report.caseResults.every((result) => result.pass)).toBe(true);
  });
});
