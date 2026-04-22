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

describe("mmv2/proof-corpus-shadow", () => {
  it("replays a bounded proof corpus covering claim and composite capture", async () => {
    const proofCases = [
      {
        text: "I prefer concise answers.",
        expectComposite: false,
      },
      {
        text: "1. Run the test suite.\n2. Ship the build.",
        expectComposite: true,
      },
    ];

    for (const [index, proofCase] of proofCases.entries()) {
      const source = createMmV2TestSource(proofCase.text);
      const readPayload = <T>(input: {
        prompt: { promptPayload?: unknown; userPrompt: string };
      }): T => (input.prompt.promptPayload as T) ?? (JSON.parse(input.prompt.userPrompt) as T);
      const interpreter = createScriptedMmV2Interpreter({
        "mmv2-capture-routing-v1": (input) => {
          const payload = readPayload<{
            raw_event: { event_id: string };
            segments: Array<{ segment_id: string; text: string; detected_shape: string }>;
          }>(input);
          const runtimeSegment = proofCase.expectComposite
            ? payload.segments.find((segment) => segment.detected_shape === "numbered_list_block")!
            : payload.segments.find((segment) =>
                segment.text.includes("I prefer concise answers."),
              )!;
          return captureOne({
            schema_version: "capture_routing.v1",
            event_id: payload.raw_event.event_id,
            routing_decisions: [
              {
                segment_id: runtimeSegment.segment_id,
                route: proofCase.expectComposite ? "composite_candidate" : "atomic_candidate",
                candidate_summary: "Proof candidate",
                memory_likelihood: 0.8,
                durability_likelihood: 0.8,
                composite_likelihood: proofCase.expectComposite ? 0.9 : 0.1,
                reason_codes: [
                  proofCase.expectComposite ? "ordered_steps" : "explicit_user_preference",
                ],
                evidence_quote: runtimeSegment.text.split("\n")[0],
                confidence: 0.9,
              },
            ],
          });
        },
        "mmv2-atomic-extraction-v1": (input) => {
          const payload = readPayload<{
            raw_event: typeof source.rawEvent;
            routed_candidates: Array<{ segment_id: string; text: string; source_route: string }>;
          }>(input);
          if (proofCase.expectComposite) {
            return captureOne({
              schema_version: "atomic_extraction.v1",
              event_id: payload.raw_event.event_id,
              atomic_candidates: [],
            });
          }
          const runtimeSegment = payload.routed_candidates[0];
          const atomicCandidate = buildAtomicCandidate(
            runtimeSegment.segment_id,
            runtimeSegment.text,
          );
          return captureOne({
            schema_version: "atomic_extraction.v1",
            event_id: payload.raw_event.event_id,
            atomic_candidates: proofCase.expectComposite ? [] : [atomicCandidate],
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
          if (!proofCase.expectComposite) {
            return captureOne({
              schema_version: "composite_extraction.v1",
              event_id: payload.raw_event.event_id,
              composite_candidates: [],
            });
          }
          const runtimeSegment = payload.routed_candidates.find(
            (segment) => segment.detected_shape === "numbered_list_block",
          )!;
          const compositeCandidate = buildCompositeCandidate(
            runtimeSegment.segment_id,
            runtimeSegment.text,
          );
          return captureOne({
            schema_version: "composite_extraction.v1",
            event_id: payload.raw_event.event_id,
            composite_candidates: proofCase.expectComposite ? [compositeCandidate] : [],
          });
        },
        "mmv2-canonicalization-v1": (input) => {
          const payload = readPayload<{
            raw_event: typeof source.rawEvent;
            extracted_candidates: Array<{
              candidate_id: string;
              source_segment_id: string;
              evidence_quote?: string;
            }>;
          }>(input);
          const extracted = payload.extracted_candidates[0];
          const canonical = proofCase.expectComposite
            ? buildCanonicalCandidate(
                payload.raw_event,
                extracted.source_segment_id,
                extracted.evidence_quote ?? proofCase.text,
                {
                  candidate_id: extracted.candidate_id,
                  unit_type: "composite",
                  kind: null,
                  artifact_type: "procedure",
                  canonical_text: "Ordered procedure artifact.",
                  search_text: "ordered procedure artifact",
                  payload: { payload_type: "composite_artifact" },
                },
              )
            : buildCanonicalCandidate(
                payload.raw_event,
                extracted.source_segment_id,
                extracted.evidence_quote ?? proofCase.text,
                {
                  candidate_id: extracted.candidate_id,
                },
              );
          return captureOne({
            schema_version: "canonical_candidates.v1",
            event_id: payload.raw_event.event_id,
            canonical_candidates: [canonical],
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
            rationale: "Proof corpus insert.",
            confidence: 0.9,
          });
        },
      });

      const result = await ingestDocumentV2Shadow({
        document: { externalSourceId: `proof-${index}`, text: proofCase.text },
        modelId: "model-001",
        interpreter,
      });

      expect(result.postWriteAudit.audit_status).toBe("pass");
      expect(result.canonicalization.canonical_candidates[0]?.unit_type).toBe(
        proofCase.expectComposite ? "composite" : "atomic",
      );
    }
  });
});
