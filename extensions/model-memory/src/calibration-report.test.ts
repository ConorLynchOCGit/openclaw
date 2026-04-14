import { describe, expect, it } from "vitest";
import { buildCalibrationReport } from "./calibration-report.ts";

describe("calibration-report", () => {
  it("computes object-native calibration and drift metrics", () => {
    const report = buildCalibrationReport({
      memoryObjects: [
        {
          id: "memory-001",
          sourceWindowId: "window-001",
          canonicalClass: "user",
          kind: "preference",
          payload: { subject: "response detail", instruction: "high level", operation: "prefer" },
          normalizedSubject: "response detail",
          normalizedTitle: undefined,
          normalizedSearchText: "response detail high level",
          scope: {},
          scopeKey: undefined,
          provenance: [],
          confidence: "strong",
          durability: "durable",
          suggestedReviewMode: "auto_accept",
          executedReviewMode: "auto_accept",
          rationaleCodes: [],
          identityKey: "pref-001",
          slotKey: "slot-001",
          contractName: "semantic_extraction",
          contractVersion: "v1",
          modelId: "model-001",
          createdAt: new Date(0),
        },
      ],
      writeEvents: [
        {
          id: "write-001",
          sourceWindowId: "window-001",
          candidateIdentityKey: "pref-001",
          decision: "write",
          memoryObjectId: "memory-001",
          decisionCodes: ["write_structural_accept"],
          contractName: "semantic_extraction",
          contractVersion: "v1",
          modelId: "model-001",
          createdAt: new Date(0),
        },
      ],
      retrievalRequests: [],
      retrievalResultSets: [],
      retrievalResultItems: [],
      contextRuns: [],
      shadowComparisons: [
        {
          matchedIdentityKeys: [],
          modelOnlyIdentityKeys: ["pref-001"],
          legacyOnlyIdentityKeys: [],
          duplicateDecisionDelta: 0,
          supersessionDecisionDelta: 0,
          omissionDivergence: true,
        },
      ],
    });

    expect(report.captureRate).toBe(1);
    expect(report.canonicalClassDistribution.user).toBe(1);
    expect(report.shadowComparisonCount).toBe(1);
    expect(report.omissionDivergenceCount).toBe(1);
  });
});
