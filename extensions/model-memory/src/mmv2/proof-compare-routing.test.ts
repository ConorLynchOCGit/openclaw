import { describe, expect, it } from "vitest";
import type { CaptureRoutingBatch } from "./contracts.ts";
import { compareRoutingPhase } from "./proof-compare-routing.ts";
import { createRawIngestEvent } from "./raw-ingest.ts";
import { segmentRawIngestEvent } from "./segmentation.ts";

describe("mmv2/proof-compare-routing", () => {
  it("accepts temporary-context early ignore as directionally correct routing", () => {
    const rawEvent = createRawIngestEvent({
      sourceId: "source-001",
      rawText: "For this answer, use bullets.",
    });
    const segmented = segmentRawIngestEvent(rawEvent);
    const paragraph = segmented.segments[0];
    const routing: CaptureRoutingBatch = {
      schema_version: "capture_routing.v1",
      event_id: rawEvent.event_id,
      routing_decisions: [
        {
          segment_id: paragraph.segment_id,
          route: "ignore",
          candidate_summary: "Temporary instruction not persisted",
          memory_likelihood: 0.3,
          durability_likelihood: 0.1,
          composite_likelihood: 0,
          reason_codes: ["temporary_context", "not_memory"],
          evidence_quote: "For this answer, use bullets.",
          confidence: 0.85,
          allow_multiple_top_level_atomic: false,
        },
      ],
    };

    const result = compareRoutingPhase(routing, segmented, {
      mode: "strict",
      exactCount: 1,
      items: [
        {
          segmentTextIncludes: "For this answer, use bullets.",
          route: "atomic_candidate",
          reasonCodesInclude: ["temporary_context"],
        },
      ],
    });

    expect(result.pass).toBe(true);
    expect(result.mismatches).toHaveLength(0);
  });
});
