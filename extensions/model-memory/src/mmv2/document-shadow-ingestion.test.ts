import { describe, expect, it } from "vitest";
import { ingestDocumentV2Shadow } from "./document-shadow-ingestion.ts";
import {
  buildAdmissionDecision,
  buildAtomicCandidate,
  buildCanonicalCandidate,
  buildCompositeCandidate,
  captureOne,
  createMmV2TestSource,
  createScriptedMmV2Interpreter,
} from "./test-helpers.ts";

describe("mmv2/document-shadow-ingestion", () => {
  it("runs end to end without any live v1 DB write", async () => {
    const text = "I prefer concise answers.\n\n1. Run the test suite.\n2. Ship the build.";
    const source = createMmV2TestSource(text);
    const readPayload = <T>(input: {
      prompt: { promptPayload?: unknown; userPrompt: string };
    }): T => (input.prompt.promptPayload as T) ?? (JSON.parse(input.prompt.userPrompt) as T);

    const interpreter = createScriptedMmV2Interpreter({
      "mmv2-capture-routing-v1": (input) => {
        const payload = readPayload<{
          raw_event: { event_id: string };
          segments: Array<{ segment_id: string; text: string; detected_shape: string }>;
        }>(input);
        const runtimePreferenceSegment = payload.segments.find((segment) =>
          segment.text.includes("I prefer concise answers."),
        )!;
        const runtimeProcedureSegment = payload.segments.find(
          (segment) => segment.detected_shape === "numbered_list_block",
        )!;
        return captureOne({
          schema_version: "capture_routing.v1",
          event_id: payload.raw_event.event_id,
          routing_decisions: [
            {
              segment_id: runtimePreferenceSegment.segment_id,
              route: "atomic_candidate",
              candidate_summary: "User preference",
              memory_likelihood: 0.8,
              durability_likelihood: 0.8,
              composite_likelihood: 0.1,
              reason_codes: ["explicit_user_preference"],
              evidence_quote: "I prefer concise answers.",
              confidence: 0.9,
            },
            {
              segment_id: runtimeProcedureSegment.segment_id,
              route: "composite_candidate",
              candidate_summary: "Procedure block",
              memory_likelihood: 0.8,
              durability_likelihood: 0.8,
              composite_likelihood: 0.95,
              reason_codes: ["ordered_steps"],
              evidence_quote: "1. Run the test suite.",
              confidence: 0.88,
            },
          ],
        });
      },
      "mmv2-atomic-extraction-v1": (input) => {
        const payload = readPayload<{
          raw_event: typeof source.rawEvent;
          routed_candidates: Array<{ segment_id: string; text: string; source_route: string }>;
        }>(input);
        const runtimePreferenceSegment = payload.routed_candidates.find((segment) =>
          segment.text.includes("I prefer concise answers."),
        )!;
        const claimCandidate = buildAtomicCandidate(
          runtimePreferenceSegment.segment_id,
          "I prefer concise answers.",
        );
        return captureOne({
          schema_version: "atomic_extraction.v1",
          event_id: payload.raw_event.event_id,
          atomic_candidates: [claimCandidate],
        });
      },
      "mmv2-composite-extraction-v1": (input) => {
        const payload = readPayload<{
          raw_event: typeof source.rawEvent;
          routed_candidates: Array<{
            segment_id: string;
            text: string;
            detected_shape: string;
            source_route: string;
          }>;
        }>(input);
        const runtimeProcedureSegment = payload.routed_candidates.find(
          (segment) => segment.detected_shape === "numbered_list_block",
        )!;
        const compositeCandidate = buildCompositeCandidate(
          runtimeProcedureSegment.segment_id,
          runtimeProcedureSegment.text,
        );
        return captureOne({
          schema_version: "composite_extraction.v1",
          event_id: payload.raw_event.event_id,
          composite_candidates: [compositeCandidate],
        });
      },
      "mmv2-canonicalization-v1": (input) => {
        const payload = readPayload<{
          raw_event: typeof source.rawEvent;
          extracted_candidates: Array<{
            candidate_id: string;
            source_segment_id: string;
            evidence_quote?: string;
            summary?: string;
          }>;
        }>(input);
        const claim = payload.extracted_candidates.find((candidate) =>
          candidate.evidence_quote?.includes("I prefer concise answers."),
        )!;
        const procedure = payload.extracted_candidates.find((candidate) =>
          candidate.evidence_quote?.includes("1. Run the test suite."),
        )!;
        const canonicalClaim = buildCanonicalCandidate(
          payload.raw_event,
          claim.source_segment_id,
          "I prefer concise answers.",
          { candidate_id: claim.candidate_id },
        );
        const canonicalProcedure = buildCanonicalCandidate(
          payload.raw_event,
          procedure.source_segment_id,
          "1. Run the test suite.\n2. Ship the build.",
          {
            candidate_id: procedure.candidate_id,
            unit_type: "composite",
            kind: null,
            artifact_type: "procedure",
            canonical_text: "Release checklist with ordered steps.",
            search_text: "release checklist ordered steps",
            payload: {
              payload_type: "composite_artifact",
              title: "Release checklist",
            },
          },
        );
        return captureOne({
          schema_version: "canonical_candidates.v1",
          event_id: payload.raw_event.event_id,
          canonical_candidates: [canonicalClaim, canonicalProcedure],
        });
      },
      "mmv2-admission-v1": (input) => {
        const payload = readPayload<{
          raw_event: typeof source.rawEvent;
          canonical_candidates: Array<{ candidate_id: string }>;
        }>(input);
        return captureOne({
          schema_version: "admission_decision.v1",
          event_id: payload.raw_event.event_id,
          decisions: payload.canonical_candidates.map((candidate) =>
            buildAdmissionDecision(candidate.candidate_id),
          ),
        });
      },
      "mmv2-reconciliation-v1": (input) => {
        const payload = readPayload<{ event_id: string; candidate: { candidate_id: string } }>(
          input,
        );
        return captureOne({
          schema_version: "reconciliation_decision.v1",
          event_id: payload.event_id,
          candidate_id: payload.candidate.candidate_id,
          decision: "insert_new",
          target_memory_ids: [],
          merged_canonical_text: null,
          conflict_type: "none",
          supersedes_memory_ids: [],
          rationale: "New shadow candidate.",
          confidence: 0.9,
        });
      },
    });

    const result = await ingestDocumentV2Shadow({
      document: { externalSourceId: "doc-001", text },
      modelId: "model-001",
      interpreter,
    });

    expect(result.postWriteAudit.audit_status).toBe("pass");
    expect(
      result.atomicExtraction.atomic_candidates.map((candidate) => candidate.candidate_id),
    ).toEqual(["candidate-001"]);
    expect(
      result.canonicalization.canonical_candidates.map((candidate) => candidate.candidate_id),
    ).toEqual(expect.arrayContaining(["candidate-001"]));
    expect(
      result.atomicExtraction.atomic_candidates.every(
        (candidate) => !candidate.candidate_id.startsWith("atomic-0:"),
      ),
    ).toBe(true);
    expect(result.shadowRecording.durableMemories).toHaveLength(2);
    expect(
      result.shadowRecording.memoryEvents.every(
        (event) => event.schema_version === "memory_event.v1",
      ),
    ).toBe(true);
  });
});
