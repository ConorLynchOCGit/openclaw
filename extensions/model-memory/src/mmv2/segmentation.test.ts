import { describe, expect, it } from "vitest";
import { createRawIngestEvent } from "./raw-ingest.ts";
import { segmentRawIngestEvent } from "./segmentation.ts";

describe("mmv2/segmentation", () => {
  it("preserves grouped lists and exact offsets", () => {
    const rawEvent = createRawIngestEvent({
      sourceId: "source-001",
      rawText: "# Release\n1. Run tests\n2. Ship build\n\nAlpha sentence. Beta sentence.",
    });
    const segmented = segmentRawIngestEvent(rawEvent);

    const numbered = segmented.segments.find(
      (segment) => segment.detected_shape === "numbered_list_block",
    );
    expect(numbered?.text).toBe("1. Run tests\n2. Ship build");
    expect(rawEvent.raw_text.slice(numbered!.start_char, numbered!.end_char)).toBe(numbered!.text);
  });

  it("creates overlapping paragraph and sentence spans", () => {
    const rawEvent = createRawIngestEvent({
      sourceId: "source-001",
      rawText: "Alpha sentence. Beta sentence.",
    });
    const segmented = segmentRawIngestEvent(rawEvent);

    const paragraph = segmented.segments.find((segment) => segment.detected_shape === "paragraph");
    const sentences = segmented.segments.filter((segment) => segment.detected_shape === "sentence");

    expect(paragraph).toBeTruthy();
    expect(sentences).toHaveLength(2);
    expect(sentences[0].start_char).toBeGreaterThanOrEqual(paragraph!.start_char);
    expect(sentences[0].end_char).toBeLessThanOrEqual(paragraph!.end_char);
  });

  it("groups heading plus body blocks", () => {
    const rawEvent = createRawIngestEvent({
      sourceId: "source-001",
      rawText: "# Workflow\nDo the thing.\nThen record it.",
    });
    const segmented = segmentRawIngestEvent(rawEvent);

    const headingPlusBody = segmented.segments.find(
      (segment) => segment.detected_shape === "heading_plus_body",
    );

    expect(headingPlusBody?.text).toContain("# Workflow");
    expect(headingPlusBody?.text).toContain("Do the thing.");
  });
});
