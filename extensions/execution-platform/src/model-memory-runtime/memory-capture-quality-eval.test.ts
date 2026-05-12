import { describe, expect, it } from "vitest";
import { MEMORY_CAPTURE_QUALITY_CORPUS } from "./memory-capture-quality-corpus.ts";
import { validateModelAuthoredMemoryCaptureQualityReview } from "./memory-capture-quality-eval.ts";

const review = {
  schemaVersion: "model-memory.capture-quality-review.v1",
  reviewerModelRef: "fixture/model",
  qualityDecision: "passed",
  humanReadableAssessment:
    "The capture behavior preserves durable preferences and project facts from large prompts while avoiding transient instructions.",
  captureQualityAssessment:
    "Large prompts include multiple memory candidates; bounded summaries and expected not-capture anchors are sufficient for qualitative review.",
  missedMemoryRisks: [],
  junkCaptureRisks: [],
  contradictionHandlingAssessment: "The review expects supersession to be preserved explicitly.",
  salienceAssessment: "High-salience owner preferences and workflow policies are prioritized.",
  recommendedNextStep: "Run the same review through the live runtime executor.",
  evidenceRefs: ["artifact://memory-capture-quality-corpus"],
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  workQueueLifecycleMutated: false,
};

describe("model-authored memory capture quality review", () => {
  it("accepts bounded model-authored quality judgment without deterministic scoring", () => {
    const result = validateModelAuthoredMemoryCaptureQualityReview({ review });

    expect(result.status).toBe("passed");
    expect(result.deterministicJudgmentPerformed).toBe(false);
    expect(result.deterministicRole).toBe("schema_bounds_refs_safety_only");
  });

  it("uses a dense owner-style large-prompt case with at least fifteen expected memories", () => {
    const largeCase = MEMORY_CAPTURE_QUALITY_CORPUS.find(
      (testCase) => testCase.promptShape === "large_multi_memory_prompt",
    );

    expect(largeCase?.expectedCaptured.length).toBeGreaterThanOrEqual(15);
    expect(largeCase?.expectedNotCaptured.length).toBeGreaterThanOrEqual(3);
    expect(largeCase?.rawPromptStored).toBe(false);
  });

  it("rejects raw storage flags", () => {
    expect(() =>
      validateModelAuthoredMemoryCaptureQualityReview({
        review: { ...review, rawPromptStored: true },
      }),
    ).toThrow();
  });
});
