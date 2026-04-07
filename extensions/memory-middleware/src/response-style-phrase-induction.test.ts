import { describe, expect, it } from "vitest";
import { buildResponseStylePhrasePatternProposal } from "./response-style-phrase-induction.js";
import { createResponseStyleCanonicalMatch } from "./response-style-semantic.js";

describe("response-style phrase induction", () => {
  it("builds a proposal for a novel anchored paraphrase of an approved response-style target", () => {
    const proposal = buildResponseStylePhrasePatternProposal({
      text: "Please keep responses concise and short.",
      targetMatch: createResponseStyleCanonicalMatch({
        template: "responses_concise",
        family: "supported_template",
        subject: "response style",
        value: "keep responses concise",
      }),
    });

    expect(proposal).toEqual({
      patternKey: expect.any(String),
      normalizedPhrase: "please keep responses concise and short",
      phraseText: "Please keep responses concise and short.",
    });
  });

  it("rejects phrases that are too close to the canonical response-style value", () => {
    const proposal = buildResponseStylePhrasePatternProposal({
      text: "Keep responses concise.",
      targetMatch: createResponseStyleCanonicalMatch({
        template: "responses_concise",
        family: "supported_template",
        subject: "response style",
        value: "keep responses concise",
      }),
    });

    expect(proposal).toBeNull();
  });

  it("rejects phrases that are not anchored enough to the approved response-style target", () => {
    const proposal = buildResponseStylePhrasePatternProposal({
      text: "Make it excellent for everyone.",
      targetMatch: createResponseStyleCanonicalMatch({
        template: "responses_concise",
        family: "supported_template",
        subject: "response style",
        value: "keep responses concise",
      }),
    });

    expect(proposal).toBeNull();
  });
});
