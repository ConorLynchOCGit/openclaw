import { describe, expect, it } from "vitest";
import { evaluateModelMemoryReadiness } from "./readiness-gates.ts";

describe("readiness-gates", () => {
  it("fails readiness when operational drift exceeds thresholds", () => {
    const result = evaluateModelMemoryReadiness({
      report: {
        captureRate: 0.1,
        ignoreRate: 0.9,
        duplicateRate: 0.6,
        supersessionRate: 0.1,
        retrievalRequestVolume: 0,
        averageRetrievalCandidateSetSize: 0,
        averageRetrievalPackingSize: 0,
        canonicalClassDistribution: {},
        kindDistribution: {},
        confidenceDistribution: {},
        reviewModeDistribution: {},
        contractNameDistribution: {},
        contractVersionDistribution: {},
        modelIdDistribution: {},
        shadowComparisonCount: 1,
        omissionDivergenceCount: 1,
        contextRunCount: 0,
      },
    });

    expect(result.ready).toBe(false);
    expect(result.reasons).toContain("capture_rate_below_threshold");
    expect(result.reasons).toContain("ignore_rate_above_threshold");
    expect(result.reasons).toContain("duplicate_rate_above_threshold");
    expect(result.reasons).toContain("omission_divergence_above_threshold");
  });
});
