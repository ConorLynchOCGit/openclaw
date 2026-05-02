import { describe, expect, it } from "vitest";
import { materializeRoutedCandidates, routeCaptureCandidates } from "./capture-routing.ts";
import type { CaptureRoutingBatch } from "./contracts.ts";
import { captureOne, createMmV2TestSource, createScriptedMmV2Interpreter } from "./test-helpers.ts";

describe("mmv2/capture-routing", () => {
  it("routes explicit no-store through the model-owned routing contract", async () => {
    const source = createMmV2TestSource(
      'Do not store this exact sentence as a memory: "temporary private phrase".',
    );
    const segment = source.segmented.segments[0];
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-capture-routing-v1": () =>
        captureOne({
          schema_version: "capture_routing.v1",
          event_id: source.rawEvent.event_id,
          routing_decisions: [
            {
              segment_id: segment.segment_id,
              route: "atomic_candidate",
              candidate_summary: "Explicit no-store or privacy opt-out instruction.",
              memory_likelihood: 0.18,
              durability_likelihood: 0.01,
              composite_likelihood: 0,
              reason_codes: ["explicit_no_store", "privacy_opt_out", "ambiguous"],
              evidence_quote: segment.text,
              confidence: 0.98,
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

    expect(result.routing_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          route: "atomic_candidate",
          reason_codes: ["explicit_no_store", "privacy_opt_out", "ambiguous"],
        }),
      ]),
    );
  });

  it("leaves routing empty when routing and repair output are invalid", async () => {
    const source = createMmV2TestSource(
      "The deployment reliability picture is evolving across several related areas.",
    );
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-capture-routing-v1": () => captureOne({ not_routing: true }),
      "mmv2-capture-routing-repair-v1": () => captureOne({ still_not_routing: true }),
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

    expect(result.routing_decisions).toEqual([]);
  });

  it("salvages valid model-owned routing decisions when coverage repair remains incomplete", async () => {
    const source = createMmV2TestSource(
      [
        "Please remember for project model-memory: long prompts should use document-style source windows.",
        "Scoped project memories may use TTL instead of global durability.",
      ].join("\n\n"),
    );
    const [firstSegment] = source.segmented.segments;
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-capture-routing-v1": () =>
        captureOne({
          schema_version: "capture_routing.v1",
          event_id: source.rawEvent.event_id,
          routing_decisions: [
            {
              segment_id: firstSegment.segment_id,
              route: "atomic_candidate",
              candidate_summary: "Long prompts should use document-style source windows.",
              memory_likelihood: 0.88,
              durability_likelihood: 0.84,
              composite_likelihood: 0.04,
              reason_codes: ["assistant_behavior_instruction", "durable_project_fact"],
              evidence_quote: firstSegment.text,
              confidence: 0.9,
            },
          ],
        }),
      "mmv2-capture-routing-repair-v1": () => captureOne({ still_incomplete: true }),
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

    expect(result.routing_decisions).toEqual([
      expect.objectContaining({
        segment_id: firstSegment.segment_id,
        route: "atomic_candidate",
        evidence_quote: firstSegment.text,
      }),
    ]);
  });

  it("keeps ordered list route classification model-owned without deterministic override", async () => {
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

    expect(result.routing_decisions[0]).toMatchObject({
      route: "atomic_candidate",
      reason_codes: ["ordered_steps"],
    });
  });

  it("anchors formatting-drifted routing evidence without discarding model-owned routes", async () => {
    const source = createMmV2TestSource(
      [
        "  - Model decides the candidate and content.",
        "  - Deterministic code only asks: “Can this model-provided quote be mapped back to an exact substring of the declared source segment?”",
      ].join("\n"),
    );
    const listSegment = source.segmented.segments.find(
      (segment) => segment.detected_shape === "bullet_list_block",
    )!;
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-capture-routing-v1": () =>
        captureOne({
          schema_version: "capture_routing.v1",
          event_id: source.rawEvent.event_id,
          routing_decisions: [
            {
              segment_id: listSegment.segment_id,
              route: "composite_candidate",
              candidate_summary: "Evidence-span anchoring rule.",
              memory_likelihood: 0.91,
              durability_likelihood: 0.86,
              composite_likelihood: 0.93,
              reason_codes: ["workflow_or_runbook", "ordered_steps"],
              evidence_quote:
                "Model decides the candidate and content.\n- Deterministic code only asks: “Can this model-provided quote be mapped back to an exact substring of the declared source segment?”",
              confidence: 0.94,
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

    expect(result.routing_decisions).toEqual([
      expect.objectContaining({
        route: "composite_candidate",
        evidence_quote:
          "Model decides the candidate and content.\n  - Deterministic code only asks: “Can this model-provided quote be mapped back to an exact substring of the declared source segment?”",
      }),
    ]);
  });

  it("routes operational blocker-handling instructions through the model-owned contract", async () => {
    const source = createMmV2TestSource(
      "If a tool schema is wrong but discoverable, inspect the tool/schema/logs and continue instead of stopping to ask.",
    );
    const segment = source.segmented.segments[0];
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-capture-routing-v1": () =>
        captureOne({
          schema_version: "capture_routing.v1",
          event_id: source.rawEvent.event_id,
          routing_decisions: [
            {
              segment_id: segment.segment_id,
              route: "atomic_candidate",
              candidate_summary: "Assistant behavior instruction.",
              memory_likelihood: 0.78,
              durability_likelihood: 0.65,
              composite_likelihood: 0.04,
              reason_codes: ["assistant_behavior_instruction", "explicit_user_preference"],
              evidence_quote: segment.text,
              confidence: 0.82,
            },
          ],
        }),
    });

    const result = await routeCaptureCandidates({
      rawEvent: source.rawEvent,
      segmented: source.segmented,
      sourceKind: "ordinary_turn",
      sourceId: source.sourceId,
      sourceWindow: source.sourceWindow,
      modelId: "model-001",
      interpreter,
    });

    expect(result.routing_decisions[0]).toMatchObject({
      route: "atomic_candidate",
      reason_codes: ["assistant_behavior_instruction", "explicit_user_preference"],
    });
  });

  it("tells the model to route explicit remember requests without adding deterministic routing", async () => {
    const source = createMmV2TestSource(
      "Please remember for project model-memory: I prefer model-owned capture.",
    );
    const segment = source.segmented.segments[0];
    let promptText = "";
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-capture-routing-v1": (input) => {
        promptText = input.prompt.systemPrompt;
        return captureOne({
          schema_version: "capture_routing.v1",
          event_id: source.rawEvent.event_id,
          routing_decisions: [
            {
              segment_id: segment.segment_id,
              route: "atomic_candidate",
              candidate_summary: "Explicit remember request for a durable preference.",
              memory_likelihood: 0.85,
              durability_likelihood: 0.8,
              composite_likelihood: 0.02,
              reason_codes: ["explicit_user_preference"],
              evidence_quote: segment.text,
              confidence: 0.86,
            },
          ],
        });
      },
    });

    const result = await routeCaptureCandidates({
      rawEvent: source.rawEvent,
      segmented: source.segmented,
      sourceKind: "ordinary_turn",
      sourceId: source.sourceId,
      sourceWindow: source.sourceWindow,
      modelId: "model-001",
      interpreter,
    });

    expect(promptText).toContain('"remember"');
    expect(promptText).toContain("proof marker");
    expect(promptText).toContain("use atomic_candidate unless");
    expect(promptText).toContain("durable content itself is a multi-part procedure");
    expect(promptText).toContain(
      "one durable memory statement with a proof marker/source id/run id",
    );
    expect(promptText).toContain("multiple independent durable preferences/facts/directives");
    expect(promptText).toContain("Daily summaries and memory notes");
    expect(promptText).toContain("allow_multiple_top_level_atomic");
    expect(result.routing_decisions[0]).toMatchObject({
      route: "atomic_candidate",
      reason_codes: ["explicit_user_preference"],
    });
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
          allow_multiple_top_level_atomic: true,
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
          allow_multiple_top_level_atomic: true,
          text: segment.text,
        }),
      ],
    });
  });
});
