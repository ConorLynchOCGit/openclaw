import { describe, expect, it } from "vitest";
import { materializeRoutedCandidates, routeCaptureCandidates } from "./capture-routing.ts";
import type { CaptureRoutingBatch } from "./contracts.ts";
import { captureOne, createMmV2TestSource, createScriptedMmV2Interpreter } from "./test-helpers.ts";

describe("mmv2/capture-routing", () => {
  it("deterministically routes explicit no-store and temporary instructions before model routing", async () => {
    const source = createMmV2TestSource(
      'Do not store this exact sentence as a memory: "temporary private phrase".\n\nFor this answer only, reply in three bullets.',
    );
    const interpreter = createScriptedMmV2Interpreter({});

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
        expect.objectContaining({
          route: "atomic_candidate",
          reason_codes: ["temporary_context"],
        }),
      ]),
    );
  });

  it("skips model-routed segments when routing repair output is invalid", async () => {
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

    expect(result.routing_decisions).toHaveLength(1);
    expect(result.routing_decisions[0]).toMatchObject({
      route: "ignore",
      candidate_summary: "Capture routing repair failed; skipped capture safely.",
      memory_likelihood: 0,
      durability_likelihood: 0,
      reason_codes: ["not_memory"],
    });
  });

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

  it("deterministically routes operational blocker-handling instructions as durable assistant behavior", async () => {
    const source = createMmV2TestSource(
      "If a tool schema is wrong but discoverable, inspect the tool/schema/logs and continue instead of stopping to ask.",
    );
    const interpreter = createScriptedMmV2Interpreter({});

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
