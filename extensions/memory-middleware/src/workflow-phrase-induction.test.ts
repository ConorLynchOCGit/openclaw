import { describe, expect, it } from "vitest";
import { createGeneralizedWorkflowImprovementMatch } from "./workflow-improvement-semantic.js";
import { buildWorkflowPhrasePatternProposal } from "./workflow-phrase-induction.js";

describe("buildWorkflowPhrasePatternProposal", () => {
  const approvedLesson = createGeneralizedWorkflowImprovementMatch({
    guidancePattern: "use_instead_of",
    subject: "release proof notes",
    recommendedAction: "bulletized proof IDs",
    avoidAction: "paraphrased rollout summaries",
  });

  it("accepts a novel anchored phrase for an approved generic workflow lesson", () => {
    expect(
      buildWorkflowPhrasePatternProposal({
        text: "For release proof notes, should I list proof IDs as bullets instead of paraphrasing rollout summaries?",
        targetMatch: approvedLesson,
      }),
    ).toEqual(
      expect.objectContaining({
        normalizedPhrase:
          "for release proof notes should i list proof ids as bullets instead of paraphrasing rollout summaries",
        patternKey: expect.any(String),
      }),
    );
  });

  it("rejects a vague phrase that does not carry enough lesson anchors", () => {
    expect(
      buildWorkflowPhrasePatternProposal({
        text: "What should I trust here?",
        targetMatch: approvedLesson,
      }),
    ).toBeNull();
  });
});
