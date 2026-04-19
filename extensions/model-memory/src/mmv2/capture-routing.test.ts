import { describe, expect, it } from "vitest";
import { routeCaptureCandidates } from "./capture-routing.ts";
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
});
