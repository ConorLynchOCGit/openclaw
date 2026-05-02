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

  it("extracts operational assistant behavior directives through the model-owned contract", async () => {
    const text =
      "If a tool schema is wrong but discoverable, inspect the tool/schema/logs and continue instead of stopping to ask.";
    const source = createMmV2TestSource(text);
    const segment = source.segmented.segments[0];
    let callCount = 0;
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-atomic-extraction-v1": () => {
        callCount += 1;
        return captureOne({
          schema_version: "atomic_extraction.v1",
          event_id: source.rawEvent.event_id,
          atomic_candidates: [
            buildAtomicCandidate(segment.segment_id, text, {
              candidate_id: "directive-001",
              kind: "directive",
              raw_statement: text,
              normalized_statement: text,
              payload: {
                payload_type: "directive",
                directive_type: "workflow_behavior",
                authority: "user",
                target: "assistant",
                strength: "soft_default",
                trigger: "the assistant encounters the described task or blocker",
                action: text,
                exceptions: [],
                overridable: true,
                derived_from_claim_candidate_ids: [],
              },
            }),
          ],
        });
      },
    });

    const result = await extractAtomicCandidates({
      rawEvent: source.rawEvent,
      sourceKind: "ordinary_turn",
      sourceId: source.sourceId,
      sourceWindow: source.sourceWindow,
      modelId: "model-001",
      interpreter,
      routedCandidates: [
        buildAtomicRoutedCandidate(segment, {
          reason_codes: ["assistant_behavior_instruction", "explicit_user_preference"],
          evidence_quote: text,
        }),
      ],
    });

    expect(callCount).toBe(1);
    expect(result.atomic_candidates[0]).toMatchObject({
      kind: "directive",
      source_grounding: "explicit",
      payload: expect.objectContaining({
        payload_type: "directive",
        directive_type: "workflow_behavior",
        authority: "user",
        target: "assistant",
        strength: "soft_default",
        trigger: "the assistant encounters the described task or blocker",
      }),
    });
    expect(JSON.stringify(result)).not.toContain("raw tool log");
  });

  it("sends routed code-block candidates to the atomic model instead of pre-filtering them", async () => {
    const text =
      "```ts\n// Always require model-owned memory-worthiness review.\nexport const memoryWorthiness = 'model-owned';\n```";
    const evidenceQuote = "Always require model-owned memory-worthiness review.";
    const source = createMmV2TestSource(text);
    const segment = source.segmented.segments[0];
    let callCount = 0;
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-atomic-extraction-v1": (input) => {
        callCount += 1;
        const payload = input.prompt.promptPayload as {
          routed_candidates: Array<{ detected_shape: string; text: string }>;
        };
        expect(payload.routed_candidates).toHaveLength(1);
        expect(payload.routed_candidates[0]).toMatchObject({
          detected_shape: "code_block",
          text,
        });
        return captureOne({
          schema_version: "atomic_extraction.v1",
          event_id: source.rawEvent.event_id,
          atomic_candidates: [
            buildAtomicCandidate(segment.segment_id, evidenceQuote, {
              candidate_id: "code-directive-001",
              kind: "directive",
              raw_statement: evidenceQuote,
              normalized_statement: evidenceQuote,
              payload: {
                payload_type: "directive",
                directive_type: "workflow_behavior",
                authority: "user",
                target: "assistant",
                strength: "hard_constraint",
                trigger: "memory capture reviews code-like source material",
                action: "require model-owned memory-worthiness review",
                exceptions: [],
                overridable: false,
                derived_from_claim_candidate_ids: [],
              },
            }),
          ],
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
      routedCandidates: [
        {
          ...buildAtomicRoutedCandidate(segment, {
            evidence_quote: text,
            reason_codes: ["assistant_behavior_instruction"],
          }),
          detected_shape: "code_block",
          text,
        },
      ],
    });

    expect(callCount).toBe(1);
    expect(result.atomic_candidates[0]).toMatchObject({
      candidate_id: "code-directive-001",
      kind: "directive",
      evidence_quote: evidenceQuote,
    });
  });

  it("sends schema-like routed candidates to the atomic model instead of pre-filtering them", async () => {
    const text =
      '{"properties":{"memoryWorthiness":{"const":"model-owned"}},"required":["memoryWorthiness"]}';
    const source = createMmV2TestSource(text);
    const segment = source.segmented.segments[0];
    let callCount = 0;
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-atomic-extraction-v1": (input) => {
        callCount += 1;
        const payload = input.prompt.promptPayload as {
          routed_candidates: Array<{ text: string }>;
        };
        expect(payload.routed_candidates[0]?.text).toBe(text);
        return captureOne({
          schema_version: "atomic_extraction.v1",
          event_id: source.rawEvent.event_id,
          atomic_candidates: [
            buildAtomicCandidate(segment.segment_id, text, {
              candidate_id: "schema-claim-001",
              raw_statement: text,
              normalized_statement: "The memory-worthiness setting is model-owned.",
              payload: {
                payload_type: "claim",
                claim_type: "project_fact",
                subject: "memory-worthiness setting",
                predicate: "is",
                object: "model-owned",
                qualifiers: [],
                temporal_status: "currently_true",
              },
            }),
          ],
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
      routedCandidates: [
        buildAtomicRoutedCandidate(segment, {
          evidence_quote: text,
          reason_codes: ["durable_project_fact"],
        }),
      ],
    });

    expect(callCount).toBe(1);
    expect(result.atomic_candidates[0]).toMatchObject({
      candidate_id: "schema-claim-001",
      kind: "claim",
      evidence_quote: text,
    });
  });

  it("rejects invalid model output from schema-like routed candidates through post-model validation", async () => {
    const text =
      '{"properties":{"memoryWorthiness":{"const":"model-owned"}},"required":["memoryWorthiness"]}';
    const source = createMmV2TestSource(text);
    const segment = source.segmented.segments[0];
    let callCount = 0;
    const invalidCandidate = buildAtomicCandidate(segment.segment_id, "not a substring", {
      candidate_id: "schema-invalid-001",
    });
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-atomic-extraction-v1": () => {
        callCount += 1;
        return captureOne({
          schema_version: "atomic_extraction.v1",
          event_id: source.rawEvent.event_id,
          atomic_candidates: [invalidCandidate],
        });
      },
      "mmv2-atomic-evidence-repair-v1": () =>
        captureOne({
          schema_version: "atomic_extraction.v1",
          event_id: source.rawEvent.event_id,
          atomic_candidates: [invalidCandidate],
        }),
      "mmv2-atomic-repair-v1": () =>
        captureOne({
          schema_version: "atomic_extraction.v1",
          event_id: source.rawEvent.event_id,
          atomic_candidates: [invalidCandidate],
        }),
    });

    const result = await extractAtomicCandidates({
      rawEvent: source.rawEvent,
      sourceKind: "document",
      sourceId: source.sourceId,
      sourceWindow: source.sourceWindow,
      modelId: "model-001",
      interpreter,
      routedCandidates: [
        buildAtomicRoutedCandidate(segment, {
          evidence_quote: text,
          reason_codes: ["durable_project_fact"],
        }),
      ],
    });

    expect(callCount).toBe(1);
    expect(result).toEqual({
      schema_version: "atomic_extraction.v1",
      event_id: source.rawEvent.event_id,
      atomic_candidates: [],
    });
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

  it("normalizes repaired atomic candidates before enforcing final semantics", async () => {
    const source = createMmV2TestSource("I prefer concise answers.");
    const segment = source.segmented.segments[0];
    const invalidCandidate = buildAtomicCandidate(
      segment.segment_id,
      '"I prefer concise answers."',
      {
        candidate_id: "candidate-001",
        normalized_statement: "The user prefers concise answers",
        source_grounding: "weakly_implied",
        confidence: 0.9,
      },
    );
    const duplicateCandidate = buildAtomicCandidate(
      segment.segment_id,
      '"I prefer concise answers."',
      {
        candidate_id: "candidate-002",
        normalized_statement: "The user prefers concise answers",
        source_grounding: "weakly_implied",
        confidence: 0.9,
      },
    );
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-atomic-extraction-v1": () =>
        captureOne({
          schema_version: "atomic_extraction.v1",
          event_id: source.rawEvent.event_id,
          atomic_candidates: [invalidCandidate],
        }),
      "mmv2-atomic-evidence-repair-v1": () =>
        captureOne({
          schema_version: "atomic_extraction.v1",
          event_id: source.rawEvent.event_id,
          atomic_candidates: [invalidCandidate, duplicateCandidate],
        }),
      "mmv2-atomic-repair-v1": () =>
        captureOne({
          schema_version: "atomic_extraction.v1",
          event_id: source.rawEvent.event_id,
          atomic_candidates: [invalidCandidate, duplicateCandidate],
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

    expect(result.atomic_candidates).toHaveLength(1);
    expect(result.atomic_candidates[0]).toMatchObject({
      evidence_quote: "I prefer concise answers.",
      normalized_statement: "The user prefers concise answers.",
      confidence: 0.65,
    });
  });

  it("skips model-routed atomic candidates when repair semantics remain invalid", async () => {
    const source = createMmV2TestSource("I prefer concise answers.");
    const segment = source.segmented.segments[0];
    const invalidCandidate = buildAtomicCandidate(segment.segment_id, "not a substring", {
      candidate_id: "candidate-001",
    });
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-atomic-extraction-v1": () =>
        captureOne({
          schema_version: "atomic_extraction.v1",
          event_id: source.rawEvent.event_id,
          atomic_candidates: [invalidCandidate],
        }),
      "mmv2-atomic-evidence-repair-v1": () =>
        captureOne({
          schema_version: "atomic_extraction.v1",
          event_id: source.rawEvent.event_id,
          atomic_candidates: [invalidCandidate],
        }),
      "mmv2-atomic-repair-v1": () =>
        captureOne({
          schema_version: "atomic_extraction.v1",
          event_id: source.rawEvent.event_id,
          atomic_candidates: [invalidCandidate],
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
