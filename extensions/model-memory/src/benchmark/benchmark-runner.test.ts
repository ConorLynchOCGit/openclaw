import { describe, expect, it } from "vitest";
import {
  DEFAULT_CACHE_AWARE_MINI_MODEL_ID,
  DEFAULT_CACHE_AWARE_NANO_MODEL_ID,
  buildBenchmarkSummary,
  buildCacheAwareBenchmarkReport,
  buildCacheAwarePromptPlan,
  buildLargeDocumentCompressionReport,
  validateSourcePreservingSummaryArtifact,
} from "./benchmark-runner.ts";

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

  it("builds stable prompt cache keys while keeping source text in the dynamic tail", () => {
    const first = buildCacheAwarePromptPlan({
      contractName: "extraction",
      contractVersion: "v1",
      promptVersion: "prompt-v1",
      staticPrefix: "Extract typed MMV2 candidates. Return strict JSON.",
      schema: { type: "object", properties: { candidates: { type: "array" } } },
      dynamicTail: "Source window: DECISIONS.md section 1",
      sourceText: "DECISIONS.md section 1",
    });
    const second = buildCacheAwarePromptPlan({
      contractName: "extraction",
      contractVersion: "v1",
      promptVersion: "prompt-v1",
      staticPrefix: "Extract typed MMV2 candidates. Return strict JSON.",
      schema: { type: "object", properties: { candidates: { type: "array" } } },
      dynamicTail: "Source window: DECISIONS.md section 2",
      sourceText: "DECISIONS.md section 2",
    });

    expect(first.staticPrefixHash).toBe(second.staticPrefixHash);
    expect(first.schemaHash).toBe(second.schemaHash);
    expect(first.promptCacheKey).toBe(second.promptCacheKey);
    expect(first.sourceTextPlacement).toBe("dynamic_tail_only");
    expect(first.staticPrefix).not.toContain("DECISIONS.md section 1");
  });

  it("rejects prompt plans that place source text in the cached prefix", () => {
    expect(() =>
      buildCacheAwarePromptPlan({
        contractName: "extraction",
        contractVersion: "v1",
        promptVersion: "prompt-v1",
        staticPrefix: "Source: raw source text",
        schema: { type: "object" },
        dynamicTail: "raw source text",
        sourceText: "raw source text",
      }),
    ).toThrow("source text must only appear in the dynamic tail");
  });

  it("summarizes mini versus nano metrics including cache health", () => {
    const plan = buildCacheAwarePromptPlan({
      contractName: "canonicalization",
      contractVersion: "v1",
      promptVersion: "prompt-v1",
      staticPrefix: "Canonicalize validated MMV2 candidates.",
      schema: { type: "object" },
      dynamicTail: "candidate hash only",
    });
    const report = buildCacheAwareBenchmarkReport({
      generatedAt: new Date("2026-04-22T00:00:00.000Z"),
      observations: [
        {
          caseId: "case-preference",
          caseKind: "durable_preference_extraction",
          runIndex: 0,
          modelId: DEFAULT_CACHE_AWARE_MINI_MODEL_ID,
          contractName: "canonicalization",
          contractVersion: "v1",
          promptVersion: "prompt-v1",
          staticPrefixHash: plan.staticPrefixHash,
          schemaHash: plan.schemaHash,
          promptCacheKey: plan.promptCacheKey,
          latencyMs: 900,
          promptTokenCount: 1000,
          cachedInputTokenCount: 700,
          outputTokenCount: 80,
          schemaAdherent: true,
          emptyResponse: false,
          repairAttempted: false,
          repairSucceeded: false,
          validCandidateCount: 2,
          invalidCandidateCount: 0,
          falsePositiveCount: 0,
          missedDurableFactCount: 0,
        },
        {
          caseId: "case-preference",
          caseKind: "durable_preference_extraction",
          runIndex: 0,
          modelId: DEFAULT_CACHE_AWARE_NANO_MODEL_ID,
          contractName: "canonicalization",
          contractVersion: "v1",
          promptVersion: "prompt-v1",
          staticPrefixHash: plan.staticPrefixHash,
          schemaHash: plan.schemaHash,
          promptCacheKey: plan.promptCacheKey,
          latencyMs: 700,
          promptTokenCount: 1000,
          cachedInputTokenCount: 0,
          outputTokenCount: 60,
          schemaAdherent: false,
          emptyResponse: true,
          repairAttempted: true,
          repairSucceeded: false,
          validCandidateCount: 0,
          invalidCandidateCount: 1,
          falsePositiveCount: 0,
          missedDurableFactCount: 1,
          failureClass: "provider_empty_response",
        },
      ],
    });

    expect(report.durableDbWrites).toBe("disabled");
    expect(report.cacheHealth.cacheHitRate).toBe(0.5);
    expect(report.cacheHealth.cachedTokenPercentage).toBe(0.35);
    expect(report.recommendation.preferredModelId).toBe(DEFAULT_CACHE_AWARE_MINI_MODEL_ID);
    expect(JSON.stringify(report)).not.toContain("raw prompt");
  });

  it("validates source-preserving compression artifacts as non-canonical cache/projection outputs", () => {
    expect(
      validateSourcePreservingSummaryArtifact({
        sourceId: "source-decisions",
        sectionWindowIds: ["window-1"],
        sourceSpanIds: ["span-1"],
        quoteHashes: ["abc123"],
        candidateHints: [
          {
            candidateId: "candidate-1",
            candidateType: "decision",
            sourceSpanIds: ["span-1"],
          },
        ],
        omittedSections: [],
        uncertainSections: ["appendix"],
        canonicalTruth: false,
      }),
    ).toEqual([]);
  });

  it("ranks large-document compression strategies by evidence safety before token savings", () => {
    const report = buildLargeDocumentCompressionReport({
      sourceId: "source-decisions",
      generatedAt: new Date("2026-04-22T00:00:00.000Z"),
      observations: [
        {
          strategy: "source_preserving_summary_then_rigid_capture",
          modelCalls: 2,
          uncachedInputTokens: 2500,
          cachedInputTokens: 800,
          outputTokens: 700,
          latencyMs: 1800,
          extractionFailureRate: 0,
          canonicalizationFailureRate: 0,
          validMemoriesAdmitted: 8,
          missedKnownFacts: 0,
          hallucinatedUnsupportedCandidates: 0,
          evidenceValidationFailures: 0,
        },
        {
          strategy: "direct_rigid_capture",
          modelCalls: 4,
          uncachedInputTokens: 9000,
          cachedInputTokens: 1200,
          outputTokens: 1200,
          latencyMs: 3800,
          extractionFailureRate: 0.1,
          canonicalizationFailureRate: 0,
          validMemoriesAdmitted: 8,
          missedKnownFacts: 1,
          hallucinatedUnsupportedCandidates: 0,
          evidenceValidationFailures: 0,
        },
      ],
    });

    expect(report.recommendation.preferredStrategy).toBe(
      "source_preserving_summary_then_rigid_capture",
    );
  });
});
