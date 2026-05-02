import { describe, expect, it } from "vitest";
import { applyAdmissionGuardrails, scoreAdmission } from "./admission.ts";
import {
  buildAdmissionDecision,
  buildCanonicalCandidate,
  captureOne,
  createMmV2TestSource,
  createScriptedMmV2Interpreter,
} from "./test-helpers.ts";

describe("mmv2/admission", () => {
  it("rejects low-safety model decisions through deterministic safety guardrails", () => {
    const source = createMmV2TestSource("Temporary instruction.");
    const canonicalBatch = {
      schema_version: "canonical_candidates.v1" as const,
      event_id: source.rawEvent.event_id,
      canonical_candidates: [
        buildCanonicalCandidate(
          source.rawEvent,
          source.segmented.segments[0].segment_id,
          "Temporary instruction.",
          {
            candidate_id: "candidate-001",
          },
        ),
      ],
    };

    const result = applyAdmissionGuardrails(canonicalBatch, {
      schema_version: "admission_decision.v1",
      event_id: source.rawEvent.event_id,
      decisions: [
        buildAdmissionDecision("candidate-001", {
          scores: {
            future_utility: 0.2,
            durability: 0.2,
            confidence: 0.4,
            novelty: 0.5,
            scope_clarity: 0.4,
            sensitivity_safety: 0.3,
            specificity: 0.3,
          },
        }),
      ],
    });

    expect(result.decisions[0].decision).toBe("reject");
  });

  it("marks embedded-only components as embed_only", async () => {
    const source = createMmV2TestSource("Run the test suite.");
    const canonicalBatch = {
      schema_version: "canonical_candidates.v1" as const,
      event_id: source.rawEvent.event_id,
      canonical_candidates: [
        buildCanonicalCandidate(
          source.rawEvent,
          source.segmented.segments[0].segment_id,
          "Run the test suite.",
          {
            candidate_id: "component-001",
            unit_type: "component",
            kind: "directive",
            canonical_text: "Run the test suite.",
            promotion: "embedded_only",
            payload: {
              directive_type: "workflow_behavior",
            },
          },
        ),
      ],
    };
    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-admission-v1": () =>
        captureOne({
          schema_version: "admission_decision.v1",
          event_id: source.rawEvent.event_id,
          decisions: [buildAdmissionDecision("component-001")],
        }),
    });

    const result = await scoreAdmission({
      rawEvent: source.rawEvent,
      sourceKind: "document",
      sourceId: source.sourceId,
      sourceWindow: source.sourceWindow,
      modelId: "model-001",
      interpreter,
      canonicalBatch,
    });

    expect(result.decisions[0].decision).toBe("embed_only");
  });

  it("does not auto-admit explicit durable project-fact commands without a model admission", () => {
    const source = createMmV2TestSource(
      "Durable workspace project fact: the retrieval soak validates structural correction targets.",
    );
    const candidate = buildCanonicalCandidate(
      source.rawEvent,
      source.segmented.segments[0].segment_id,
      "Durable workspace project fact: the retrieval soak validates structural correction targets.",
      {
        candidate_id: `det-project-fact:${source.segmented.segments[0].segment_id}`,
        kind: "claim",
        payload: {
          claim_type: "project_fact",
          subject: "retrieval soak",
          predicate: "validates",
          object: "structural correction targets",
        },
        scope: {
          tenant_id: source.rawEvent.tenant_id,
          user_id: source.rawEvent.user_id,
          project_id: "project-001",
          workspace_id: null,
          subject_type: "project",
          subject_id: "current_project",
          applies_to: "current_project",
        },
      },
    );

    const result = applyAdmissionGuardrails(
      {
        schema_version: "canonical_candidates.v1",
        event_id: source.rawEvent.event_id,
        canonical_candidates: [candidate],
      },
      {
        schema_version: "admission_decision.v1",
        event_id: source.rawEvent.event_id,
        decisions: [
          buildAdmissionDecision(candidate.candidate_id, {
            decision: "quarantine",
            scores: {
              future_utility: 0.45,
              durability: 0.46,
              confidence: 0.6,
              novelty: 0.5,
              scope_clarity: 0.6,
              sensitivity_safety: 0.95,
              specificity: 0.5,
            },
          }),
        ],
      },
    );

    expect(result.decisions[0].decision).toBe("quarantine");
  });

  it("does not auto-admit ordinary project chatter through deterministic scope gates", () => {
    const source = createMmV2TestSource(
      "The retrieval soak validates structural correction targets.",
    );
    const candidate = buildCanonicalCandidate(
      source.rawEvent,
      source.segmented.segments[0].segment_id,
      "The retrieval soak validates structural correction targets.",
      {
        candidate_id: "ordinary-project-fact",
        kind: "claim",
        payload: {
          claim_type: "project_fact",
          subject: "retrieval soak",
          predicate: "validates",
          object: "structural correction targets",
        },
        scope: {
          tenant_id: source.rawEvent.tenant_id,
          user_id: source.rawEvent.user_id,
          project_id: "project-001",
          workspace_id: null,
          subject_type: "project",
          subject_id: "current_project",
          applies_to: "current_project",
        },
      },
    );

    const result = applyAdmissionGuardrails(
      {
        schema_version: "canonical_candidates.v1",
        event_id: source.rawEvent.event_id,
        canonical_candidates: [candidate],
      },
      {
        schema_version: "admission_decision.v1",
        event_id: source.rawEvent.event_id,
        decisions: [
          buildAdmissionDecision(candidate.candidate_id, {
            decision: "quarantine",
            scores: {
              future_utility: 0.45,
              durability: 0.46,
              confidence: 0.6,
              novelty: 0.5,
              scope_clarity: 0.6,
              sensitivity_safety: 0.95,
              specificity: 0.5,
            },
          }),
        ],
      },
    );

    expect(result.decisions[0].decision).not.toBe("admit");
  });
});
