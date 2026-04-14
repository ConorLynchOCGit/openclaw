import { describe, expect, it } from "vitest";
import { buildBenchmarkSummary } from "./benchmark-runner.ts";

describe("benchmark runner", () => {
  it("computes object-native proof metrics without exact-wording scoring", () => {
    const summary = buildBenchmarkSummary([
      {
        caseId: "case-001",
        pass: true,
        action: "capture",
        reasons: [],
        matchedObjectCount: 1,
        expectedObjectCount: 1,
        actualObjectCount: 1,
      },
      {
        caseId: "case-002",
        pass: false,
        action: "capture",
        reasons: ["extra_object"],
        matchedObjectCount: 0,
        expectedObjectCount: 1,
        actualObjectCount: 1,
      },
      {
        caseId: "case-003",
        pass: true,
        action: "ignore",
        reasons: [],
        matchedObjectCount: 0,
        expectedObjectCount: 0,
        actualObjectCount: 0,
      },
    ]);

    expect(summary.totalCases).toBe(3);
    expect(summary.passedCases).toBe(2);
    expect(summary.failedCases).toBe(1);
    expect(summary.expectedObjects).toBe(2);
    expect(summary.actualObjects).toBe(2);
    expect(summary.matchedObjects).toBe(1);
    expect(summary.precision).toBe(0.5);
    expect(summary.recall).toBe(0.5);
    expect(summary.omissionRate).toBe(1);
  });
});
