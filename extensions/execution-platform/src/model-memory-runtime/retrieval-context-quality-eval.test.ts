import { describe, expect, it } from "vitest";
import { validateModelAuthoredRetrievalContextQualityReview } from "./retrieval-context-quality-eval.ts";

const review = {
  schemaVersion: "model-memory.retrieval-context-quality-review.v1",
  reviewerModelRef: "fixture/model",
  qualityDecision: "passed",
  humanReadableAssessment:
    "Retrieval/context packs select relevant bounded refs for workflows and suppress stale legacy context.",
  retrievalQualityAssessment:
    "The bounded anchors are sufficient for model-owned quality review of precision, recall, and stale suppression without deterministic semantic scoring.",
  contextPackUsefulnessAssessment:
    "Context packs are useful when they improve workflow output without becoming authority or lifecycle truth.",
  workflowImpactAssessment:
    "Coding, research, docs, QA, and architecture surfaces receive context appropriate to their workflow boundaries.",
  staleSuppressionAssessment: "Stale legacy context is expected to be withheld from insertion.",
  distractingContextRisks: [],
  recommendedNextStep: "Run live workflow-centered quality review.",
  evidenceRefs: ["artifact://retrieval-context-quality-corpus"],
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  workQueueLifecycleMutated: false,
};

describe("model-authored retrieval/context quality review", () => {
  it("accepts bounded model-authored quality judgment without deterministic scoring", () => {
    const result = validateModelAuthoredRetrievalContextQualityReview({ review });

    expect(result.status).toBe("passed");
    expect(result.deterministicJudgmentPerformed).toBe(false);
    expect(result.deterministicRole).toBe("schema_bounds_refs_safety_only");
  });

  it("rejects lifecycle mutation flags", () => {
    expect(() =>
      validateModelAuthoredRetrievalContextQualityReview({
        review: { ...review, workQueueLifecycleMutated: true },
      }),
    ).toThrow();
  });
});
