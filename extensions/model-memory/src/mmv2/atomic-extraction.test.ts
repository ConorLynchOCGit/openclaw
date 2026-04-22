import { describe, expect, it } from "vitest";
import { extractAtomicCandidates } from "./atomic-extraction.ts";
import {
  buildAtomicCandidate,
  buildAtomicRoutedCandidate,
  buildCompositeRoutedCandidate,
  captureOne,
  createMmV2TestSource,
  createScriptedMmV2Interpreter,
} from "./test-helpers.ts";

describe("mmv2/atomic-extraction", () => {
  it('keeps "I prefer ..." as a claim', async () => {
    const source = createMmV2TestSource("I prefer concise answers.");
    const segment = source.segmented.segments.find((entry) => entry.text.includes("I prefer"))!;
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-atomic-extraction-v1": () =>
        captureOne({
          schema_version: "atomic_extraction.v1",
          event_id: source.rawEvent.event_id,
          atomic_candidates: [
            buildAtomicCandidate(segment.segment_id, "I prefer concise answers.", {}),
          ],
        }),
    });

    const result = await extractAtomicCandidates({
      rawEvent: source.rawEvent,
      sourceKind: "document",
      sourceId: source.sourceId,
      sourceWindow: source.sourceWindow,
      modelId: "model-001",
      interpreter,
      routedCandidates: [buildAtomicRoutedCandidate(segment)],
    });

    expect(result.atomic_candidates[0].kind).toBe("claim");
    expect(result.atomic_candidates[0].payload.payload_type).toBe("claim");
  });

  it('classifies "Never do X" as a directive', async () => {
    const source = createMmV2TestSource("Never deploy without approval.");
    const segment = source.segmented.segments[0];
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-atomic-extraction-v1": () =>
        captureOne({
          schema_version: "atomic_extraction.v1",
          event_id: source.rawEvent.event_id,
          atomic_candidates: [
            buildAtomicCandidate(segment.segment_id, "Never deploy without approval.", {
              candidate_id: "directive-001",
              kind: "directive",
              raw_statement: "Never deploy without approval.",
              normalized_statement: "Do not deploy without approval.",
              payload: {
                payload_type: "directive",
                directive_type: "workflow_behavior",
                authority: "user",
                target: "assistant",
                strength: "hard_constraint",
                trigger: "deploy",
                action: "do not deploy without approval",
                exceptions: [],
                overridable: false,
                derived_from_claim_candidate_ids: [],
              },
            }),
          ],
        }),
    });

    const result = await extractAtomicCandidates({
      rawEvent: source.rawEvent,
      sourceKind: "document",
      sourceId: source.sourceId,
      sourceWindow: source.sourceWindow,
      modelId: "model-001",
      interpreter,
      routedCandidates: [buildAtomicRoutedCandidate(segment)],
    });

    expect(result.atomic_candidates[0].kind).toBe("directive");
    expect(result.atomic_candidates[0].payload.payload_type).toBe("directive");
  });

  it("returns an empty batch without calling the model when there are no routed atomic segments", async () => {
    const source = createMmV2TestSource("I prefer concise answers.");
    let callCount = 0;
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-atomic-extraction-v1": () => {
        callCount += 1;
        return captureOne({
          schema_version: "atomic_extraction.v1",
          event_id: source.rawEvent.event_id,
          atomic_candidates: [],
        });
      },
    });

    const result = await extractAtomicCandidates({
      rawEvent: source.rawEvent,
      sourceKind: "document",
      sourceId: source.sourceId,
      sourceWindow: source.sourceWindow,
      modelId: "model-001",
      interpreter,
      routedCandidates: [],
    });

    expect(callCount).toBe(0);
    expect(result).toEqual({
      schema_version: "atomic_extraction.v1",
      event_id: source.rawEvent.event_id,
      atomic_candidates: [],
    });
  });

  it("rejects composite-owned routed spans before calling the atomic extractor", async () => {
    const source = createMmV2TestSource("1. Run the test suite.\n2. Ship the build.");
    const segment = source.segmented.segments.find(
      (entry) => entry.detected_shape === "numbered_list_block",
    )!;
    let callCount = 0;
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-atomic-extraction-v1": () => {
        callCount += 1;
        return captureOne({
          schema_version: "atomic_extraction.v1",
          event_id: source.rawEvent.event_id,
          atomic_candidates: [],
        });
      },
    });

    await expect(
      extractAtomicCandidates({
        rawEvent: source.rawEvent,
        sourceKind: "document",
        sourceId: source.sourceId,
        sourceWindow: source.sourceWindow,
        modelId: "model-001",
        interpreter,
        routedCandidates: [buildCompositeRoutedCandidate(segment) as never],
      }),
    ).rejects.toThrow(/atomic_candidate/);

    expect(callCount).toBe(0);
  });
});
