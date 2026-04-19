import { describe, expect, it } from "vitest";
import {
  extractCompositeCandidates,
  suppressAtomicCandidatesOwnedByComposites,
} from "./composite-extraction.ts";
import {
  buildAtomicCandidate,
  buildCompositeCandidate,
  captureOne,
  createMmV2TestSource,
  createScriptedMmV2Interpreter,
} from "./test-helpers.ts";

describe("mmv2/composite-extraction", () => {
  it("normalizes procedure steps to embedded_only by default", async () => {
    const source = createMmV2TestSource("1. Run the test suite.\n2. Ship the build.");
    const segment = source.segmented.segments.find(
      (entry) => entry.detected_shape === "numbered_list_block",
    )!;
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-composite-extraction-v1": () =>
        captureOne({
          schema_version: "composite_extraction.v1",
          event_id: source.rawEvent.event_id,
          composite_candidates: [
            buildCompositeCandidate(segment.segment_id, segment.text, {
              components: [
                {
                  component_id: "c1",
                  order_index: 0,
                  role: "step",
                  content: "Run the test suite.",
                  embedded_atomic_kind: "directive",
                  promotion: "global",
                  evidence_quote: "Run the test suite.",
                  required: true,
                  conditions: [],
                  outputs: [],
                },
              ],
            }),
          ],
        }),
    });

    const result = await extractCompositeCandidates({
      rawEvent: source.rawEvent,
      sourceKind: "document",
      sourceId: source.sourceId,
      sourceWindow: source.sourceWindow,
      modelId: "model-001",
      interpreter,
      segments: [segment],
    });

    expect(result.composite_candidates[0].components[0].promotion).toBe("embedded_only");
  });

  it("suppresses overlapping atomic children owned by a composite", () => {
    const atomicBatch = {
      schema_version: "atomic_extraction.v1" as const,
      event_id: "event-001",
      atomic_candidates: [
        buildAtomicCandidate("segment-001", "Run the test suite.", { candidate_id: "a1" }),
      ],
    };
    const compositeBatch = {
      schema_version: "composite_extraction.v1" as const,
      event_id: "event-001",
      composite_candidates: [
        buildCompositeCandidate("segment-001", "1. Run the test suite.", {
          components: [
            {
              component_id: "c1",
              order_index: 0,
              role: "step",
              content: "Run the test suite.",
              embedded_atomic_kind: "directive",
              promotion: "embedded_only",
              evidence_quote: "Run the test suite.",
              required: true,
              conditions: [],
              outputs: [],
            },
          ],
        }),
      ],
    };

    const suppressed = suppressAtomicCandidatesOwnedByComposites(atomicBatch, compositeBatch);
    expect(suppressed.atomic_candidates).toHaveLength(0);
  });
});
