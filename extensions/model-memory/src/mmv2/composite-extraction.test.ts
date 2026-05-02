import { describe, expect, it } from "vitest";
import {
  extractCompositeCandidates,
  suppressAtomicCandidatesOwnedByComposites,
} from "./composite-extraction.ts";
import {
  buildAtomicCandidate,
  buildCompositeCandidate,
  buildAtomicRoutedCandidate,
  buildCompositeRoutedCandidate,
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
      routedCandidates: [buildCompositeRoutedCandidate(segment)],
    });

    expect(result.composite_candidates[0].components[0].promotion).toBe("embedded_only");
  });

  it("anchors formatting-drifted composite evidence without another model repair", async () => {
    const source = createMmV2TestSource(
      [
        "  - Preserve contiguous Codex session windows where possible.",
        "  - For long user prompts, split into bounded ingestion windows.",
        "  - Feed each bounded window through MMV2 model-owned capture.",
      ].join("\n"),
    );
    const segment = source.segmented.segments[0]!;
    let repairCallCount = 0;
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-composite-extraction-v1": () =>
        captureOne({
          schema_version: "composite_extraction.v1",
          event_id: source.rawEvent.event_id,
          composite_candidates: [
            buildCompositeCandidate(
              segment.segment_id,
              [
                "Preserve contiguous Codex session windows where possible.",
                "For long user prompts, split into bounded ingestion windows.",
                "Feed each bounded window through MMV2 model-owned capture.",
              ].join("\n"),
              {
                components: [
                  {
                    component_id: "c1",
                    order_index: 0,
                    role: "step",
                    content: "Preserve contiguous Codex session windows where possible.",
                    embedded_atomic_kind: "directive",
                    promotion: "embedded_only",
                    evidence_quote: "Preserve contiguous Codex session windows where possible.",
                    required: true,
                    conditions: [],
                    outputs: [],
                  },
                  {
                    component_id: "c2",
                    order_index: 1,
                    role: "step",
                    content: "For long user prompts, split into bounded ingestion windows.",
                    embedded_atomic_kind: "directive",
                    promotion: "embedded_only",
                    evidence_quote: "For long user prompts, split into bounded ingestion windows.",
                    required: true,
                    conditions: [],
                    outputs: [],
                  },
                ],
              },
            ),
          ],
        }),
      "mmv2-composite-evidence-repair-v1": () => {
        repairCallCount += 1;
        return captureOne({
          schema_version: "composite_extraction.v1",
          event_id: source.rawEvent.event_id,
          composite_candidates: [],
        });
      },
    });

    const result = await extractCompositeCandidates({
      rawEvent: source.rawEvent,
      sourceKind: "document",
      sourceId: source.sourceId,
      sourceWindow: source.sourceWindow,
      modelId: "model-001",
      interpreter,
      routedCandidates: [buildCompositeRoutedCandidate(segment)],
    });

    expect(repairCallCount).toBe(0);
    expect(result.composite_candidates).toHaveLength(1);
    expect(segment.text.includes(result.composite_candidates[0].evidence_quote)).toBe(true);
    expect(result.composite_candidates[0].evidence_quote).toContain(
      "  - For long user prompts, split into bounded ingestion windows.",
    );
    expect(
      result.composite_candidates[0].components.every((component) =>
        segment.text.includes(component.evidence_quote),
      ),
    ).toBe(true);
  });

  it("retargets composite and component evidence to unique routed segments in the same window", async () => {
    const source = createMmV2TestSource(
      [
        "Intro section for the source window.",
        "",
        "- Parent evidence belongs to this bullet block.",
        "- Additional parent evidence also belongs here.",
        "",
        "Component evidence belongs to this later paragraph.",
      ].join("\n"),
    );
    const introSegment = source.segmented.segments.find((segment) =>
      segment.text.includes("Intro section"),
    )!;
    const parentSegment = source.segmented.segments.find((segment) =>
      segment.text.includes("Parent evidence belongs"),
    )!;
    const componentSegment = source.segmented.segments.find((segment) =>
      segment.text.includes("Component evidence belongs"),
    )!;
    const allCompositeRouted = [introSegment, parentSegment, componentSegment].map((segment) =>
      buildCompositeRoutedCandidate(segment),
    );
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-composite-extraction-v1": () =>
        captureOne({
          schema_version: "composite_extraction.v1",
          event_id: source.rawEvent.event_id,
          composite_candidates: [
            buildCompositeCandidate(
              introSegment.segment_id,
              "Parent evidence belongs to this bullet block.",
              {
                components: [
                  {
                    component_id: "c1",
                    order_index: 0,
                    role: "step",
                    content: "Component evidence belongs to this later paragraph.",
                    embedded_atomic_kind: "directive",
                    promotion: "embedded_only",
                    evidence_quote: "Component evidence belongs to this later paragraph.",
                    required: true,
                    conditions: [],
                    outputs: [],
                  },
                ],
              },
            ),
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
      routedCandidates: [buildCompositeRoutedCandidate(introSegment)],
      anchoringCandidates: allCompositeRouted,
    });

    expect(result.composite_candidates[0].source_segment_id).toBe(parentSegment.segment_id);
    expect(result.composite_candidates[0].components[0].source_segment_id).toBe(
      componentSegment.segment_id,
    );
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

  it("returns an empty batch without calling the model when there are no routed composite segments", async () => {
    const source = createMmV2TestSource("I prefer concise answers.");
    let callCount = 0;
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-composite-extraction-v1": () => {
        callCount += 1;
        return captureOne({
          schema_version: "composite_extraction.v1",
          event_id: source.rawEvent.event_id,
          composite_candidates: [],
        });
      },
    });

    const result = await extractCompositeCandidates({
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
      schema_version: "composite_extraction.v1",
      event_id: source.rawEvent.event_id,
      composite_candidates: [],
    });
  });

  it("rejects atomic-owned routed spans before calling the composite extractor", async () => {
    const source = createMmV2TestSource("I prefer concise answers.");
    const segment = source.segmented.segments[0];
    let callCount = 0;
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-composite-extraction-v1": () => {
        callCount += 1;
        return captureOne({
          schema_version: "composite_extraction.v1",
          event_id: source.rawEvent.event_id,
          composite_candidates: [],
        });
      },
    });

    await expect(
      extractCompositeCandidates({
        rawEvent: source.rawEvent,
        sourceKind: "document",
        sourceId: source.sourceId,
        sourceWindow: source.sourceWindow,
        modelId: "model-001",
        interpreter,
        routedCandidates: [buildAtomicRoutedCandidate(segment) as never],
      }),
    ).rejects.toThrow(/composite_candidate/);

    expect(callCount).toBe(0);
  });

  it("returns an empty composite batch when model repair cannot anchor evidence", async () => {
    const source = createMmV2TestSource("- Run the release test.\n- Ship the release.");
    const segment = source.segmented.segments[0]!;
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-composite-extraction-v1": () =>
        captureOne({
          schema_version: "composite_extraction.v1",
          event_id: source.rawEvent.event_id,
          composite_candidates: [
            buildCompositeCandidate(segment.segment_id, "Run a different deployment plan.", {
              components: [
                {
                  component_id: "c1",
                  order_index: 0,
                  role: "step",
                  content: "Run a different deployment plan.",
                  embedded_atomic_kind: "directive",
                  promotion: "embedded_only",
                  evidence_quote: "Run a different deployment plan.",
                  required: true,
                  conditions: [],
                  outputs: [],
                },
              ],
            }),
          ],
        }),
      "mmv2-composite-evidence-repair-v1": () =>
        captureOne({
          schema_version: "composite_extraction.v1",
          event_id: source.rawEvent.event_id,
          composite_candidates: [
            buildCompositeCandidate(segment.segment_id, "Run a different deployment plan.", {
              components: [
                {
                  component_id: "c1",
                  order_index: 0,
                  role: "step",
                  content: "Run a different deployment plan.",
                  embedded_atomic_kind: "directive",
                  promotion: "embedded_only",
                  evidence_quote: "Run a different deployment plan.",
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
      routedCandidates: [buildCompositeRoutedCandidate(segment)],
    });

    expect(result).toEqual({
      schema_version: "composite_extraction.v1",
      event_id: source.rawEvent.event_id,
      composite_candidates: [],
    });
  });
});
