import { describe, expect, it } from "vitest";
import { materializeRoutedCandidates, routeCaptureCandidates } from "./capture-routing.ts";
import type { CaptureRoutingBatch } from "./contracts.ts";
import { captureOne, createMmV2TestSource, createScriptedMmV2Interpreter } from "./test-helpers.ts";

describe("mmv2/capture-routing", () => {
  it("routes ordered list blocks to composite handling via deterministic override", async () => {
    const source = createMmV2TestSource("1. Run tests\n2. Ship build");
    const listSegment = source.segmented.segments.find(
      (segment) => segment.detected_shape === "numbered_list_block",
    )!;
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-capture-routing-v1": () =>
        captureOne({
          schema_version: "capture_routing.v1",
          event_id: source.rawEvent.event_id,
          routing_decisions: [
            {
              segment_id: listSegment.segment_id,
              route: "atomic_candidate",
              candidate_summary: "Procedure-like block",
              memory_likelihood: 0.8,
              durability_likelihood: 0.8,
              composite_likelihood: 0.9,
              reason_codes: ["ordered_steps"],
              evidence_quote: "1. Run tests",
              confidence: 0.7,
            },
          ],
        }),
    });

    const result = await routeCaptureCandidates({
      rawEvent: source.rawEvent,
      segmented: source.segmented,
      sourceKind: "document",
      sourceId: source.sourceId,
      sourceWindow: source.sourceWindow,
      modelId: "model-001",
      interpreter,
    });

    expect(result.routing_decisions[0].route).toBe("composite_candidate");
  });

  it("materializes typed routed candidates with explicit source_route ownership", async () => {
    const source = createMmV2TestSource("I prefer concise answers.");
    const segment = source.segmented.segments[0];

    const routing: CaptureRoutingBatch = {
      schema_version: "capture_routing.v1" as const,
      event_id: source.rawEvent.event_id,
      routing_decisions: [
        {
          segment_id: segment.segment_id,
          route: "atomic_candidate" as const,
          candidate_summary: "User prefers concise answers.",
          memory_likelihood: 0.78,
          durability_likelihood: 0.7,
          composite_likelihood: 0.05,
          reason_codes: ["explicit_user_preference", "ordered_steps"],
          evidence_quote: "I prefer concise answers.",
          confidence: 0.76,
        },
      ],
    };

    const result = materializeRoutedCandidates({
      segmented: source.segmented,
      routing,
    });

    expect(result).toEqual({
      schema_version: "capture_routing.v1",
      event_id: source.rawEvent.event_id,
      routed_candidates: [
        expect.objectContaining({
          segment_id: segment.segment_id,
          source_route: "atomic_candidate",
          candidate_summary: "User prefers concise answers.",
          memory_likelihood: 0.78,
          durability_likelihood: 0.7,
          composite_likelihood: 0.05,
          reason_codes: ["explicit_user_preference", "ordered_steps"],
          evidence_quote: "I prefer concise answers.",
          confidence: 0.76,
          allow_multiple_top_level_atomic: false,
          text: segment.text,
        }),
      ],
    });
  });
});
