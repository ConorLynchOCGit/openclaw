import { describe, expect, it } from "vitest";
import { canonicalizeCandidates } from "./canonicalization.ts";
import {
  buildAtomicCandidate,
  buildCanonicalCandidate,
  captureOne,
  createMmV2TestSource,
  createScriptedMmV2Interpreter,
} from "./test-helpers.ts";

describe("mmv2/canonicalization", () => {
  it("does not deterministically reject canonical wording based on modality terms", async () => {
    const source = createMmV2TestSource("I prefer concise answers.");
    const segment = source.segmented.segments[0];
    const atomicBatch = {
      schema_version: "atomic_extraction.v1" as const,
      event_id: source.rawEvent.event_id,
      atomic_candidates: [buildAtomicCandidate(segment.segment_id, "I prefer concise answers.")],
    };
    const compositeBatch = {
      schema_version: "composite_extraction.v1" as const,
      event_id: source.rawEvent.event_id,
      composite_candidates: [],
    };
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-canonicalization-v1": () =>
        captureOne({
          schema_version: "canonical_candidates.v1",
          event_id: source.rawEvent.event_id,
          canonical_candidates: [
            buildCanonicalCandidate(
              source.rawEvent,
              segment.segment_id,
              "I prefer concise answers.",
              {
                canonical_text: "Always give concise answers.",
              },
            ),
          ],
        }),
    });

    const result = await canonicalizeCandidates({
      rawEvent: source.rawEvent,
      sourceKind: "document",
      sourceId: source.sourceId,
      sourceWindow: source.sourceWindow,
      modelId: "model-001",
      interpreter,
      atomicBatch,
      compositeBatch,
    });

    expect(result.canonical_candidates[0].canonical_text).toBe("Always give concise answers.");
  });
});
