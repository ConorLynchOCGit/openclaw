import { describe, expect, it } from "vitest";
import { anchorEvidenceQuoteToSourceSpan } from "./evidence-span-anchoring.ts";

describe("mmv2/evidence-span-anchoring", () => {
  it("anchors formatting-drifted list evidence to the exact source span", () => {
    const sourceText = [
      "  - Preserve contiguous Codex session windows where possible.",
      "  - For long user prompts, split into bounded ingestion windows.",
      "  - Feed each bounded window through MMV2 model-owned capture.",
    ].join("\n");

    const result = anchorEvidenceQuoteToSourceSpan({
      sourceText,
      evidenceQuote: [
        "Preserve contiguous Codex session windows where possible.",
        "For long user prompts, split into bounded ingestion windows.",
        "Feed each bounded window through MMV2 model-owned capture.",
      ].join("\n"),
    });

    expect(result).toMatchObject({
      status: "anchored",
      method: "formatting_normalized_unique",
    });
    expect(result.status === "anchored" ? result.quote : "").toBe(
      [
        "Preserve contiguous Codex session windows where possible.",
        "  - For long user prompts, split into bounded ingestion windows.",
        "  - Feed each bounded window through MMV2 model-owned capture.",
      ].join("\n"),
    );
    expect(sourceText.includes(result.status === "anchored" ? result.quote : "")).toBe(true);
  });

  it("does not anchor when formatting-normalized evidence is ambiguous", () => {
    const result = anchorEvidenceQuoteToSourceSpan({
      sourceText: "- Run the tests.\n- Run the tests.",
      evidenceQuote: "Run the tests.",
    });

    expect(result).toEqual({
      status: "unanchored",
      reason: "no_unique_formatting_match",
    });
  });

  it("anchors mechanical letter-number spacing drift to the exact source span", () => {
    const result = anchorEvidenceQuoteToSourceSpan({
      sourceText:
        "I prefer OpenClaw to run live UI validation before Milestone 4. The proof marker is PHASE2-001.",
      evidenceQuote: "I prefer OpenClaw to run live UI validation before Milestone4.",
    });

    expect(result).toEqual({
      status: "anchored",
      quote: "I prefer OpenClaw to run live UI validation before Milestone 4.",
      method: "formatting_normalized_unique",
    });
  });
});
