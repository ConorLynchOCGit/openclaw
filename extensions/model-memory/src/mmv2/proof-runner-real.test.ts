import { describe, expect, it } from "vitest";
import { MMV2_DOCUMENT_PROOF_CASES } from "./proof-corpus.ts";
import { runMmV2ProofCorpusReal } from "./proof-runner-real.ts";

function extractBalancedJson(text: string, startIndex: number): string {
  const open = text[startIndex];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === open) {
      depth += 1;
      continue;
    }
    if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  throw new Error("Unable to extract JSON block from prompt");
}

function extractPromptJson<T>(userPrompt: string, label: string): T {
  const labelIndex = userPrompt.indexOf(label);
  if (labelIndex === -1) {
    throw new Error(`Missing prompt label: ${label}`);
  }
  const relativeJsonStart = userPrompt.slice(labelIndex + label.length).search(/[{[]/);
  if (relativeJsonStart === -1) {
    throw new Error(`Missing JSON block after label: ${label}`);
  }
  const absoluteStart = labelIndex + label.length + relativeJsonStart;
  return JSON.parse(extractBalancedJson(userPrompt, absoluteStart)) as T;
}

describe("mmv2/proof-runner-real", () => {
  it("runs the MMV2 corpus through an executor-backed interpreter and records resolved model metadata", async () => {
    const proofCase = MMV2_DOCUMENT_PROOF_CASES.find(
      (entry) => entry.id === "mmv2-doc-001-preference-claim",
    )!;
    const executor = {
      async execute(request: {
        contract: { contractVersion: string };
        userPrompt: string;
      }): Promise<{ outputText: string; resolvedModelId: string }> {
        switch (request.contract.contractVersion) {
          case "mmv2-capture-routing-v1": {
            const rawEvent = extractPromptJson<{ event_id: string }>(
              request.userPrompt,
              "Raw event metadata:",
            );
            const segments = extractPromptJson<Array<{ segment_id: string }>>(
              request.userPrompt,
              "Segments:",
            );
            return {
              resolvedModelId: "openrouter/openai/gpt-5.4-nano",
              outputText: JSON.stringify({
                schema_version: "capture_routing.v1",
                event_id: rawEvent.event_id,
                routing_decisions: [
                  {
                    segment_id: segments[0].segment_id,
                    route: "atomic_candidate",
                    candidate_summary: "User preference",
                    memory_likelihood: 0.9,
                    durability_likelihood: 0.9,
                    composite_likelihood: 0.05,
                    reason_codes: ["explicit_user_preference"],
                    evidence_quote: "I prefer concise answers.",
                    confidence: 0.95,
                  },
                ],
              }),
            };
          }
          case "mmv2-atomic-extraction-v1": {
            const rawEvent = extractPromptJson<{ event_id: string }>(
              request.userPrompt,
              "Raw event metadata:",
            );
            const routedCandidates = extractPromptJson<Array<{ segment_id: string }>>(
              request.userPrompt,
              "Atomic routed candidates:",
            );
            return {
              resolvedModelId: "openrouter/openai/gpt-5.4-nano",
              outputText: JSON.stringify({
                schema_version: "atomic_extraction.v1",
                event_id: rawEvent.event_id,
                atomic_candidates: [
                  {
                    candidate_id: "candidate-preference-001",
                    source_segment_id: routedCandidates[0].segment_id,
                    kind: "claim",
                    raw_statement: "I prefer concise answers.",
                    normalized_statement: "The user prefers concise answers.",
                    evidence_quote: "I prefer concise answers.",
                    source_grounding: "explicit",
                    scope: {
                      subject_type: "user",
                      subject_id: "user",
                      project_id: null,
                      workspace_id: null,
                      applies_to: "global",
                    },
                    payload: {
                      payload_type: "claim",
                      claim_type: "preference_state",
                      subject: "user",
                      predicate: "prefers",
                      object: "concise answers",
                      qualifiers: [],
                      temporal_status: "currently_true",
                    },
                    confidence: 0.94,
                    risk_flags: ["none"],
                  },
                ],
              }),
            };
          }
          case "mmv2-composite-extraction-v1": {
            const rawEvent = extractPromptJson<{ event_id: string }>(
              request.userPrompt,
              "Raw event metadata:",
            );
            extractPromptJson<Array<{ segment_id: string }>>(
              request.userPrompt,
              "Composite routed candidates:",
            );
            return {
              resolvedModelId: "openrouter/openai/gpt-5.4-nano",
              outputText: JSON.stringify({
                schema_version: "composite_extraction.v1",
                event_id: rawEvent.event_id,
                composite_candidates: [],
              }),
            };
          }
          case "mmv2-canonicalization-v1": {
            const rawEvent = extractPromptJson<{
              event_id: string;
              source_type: string;
              source_id: string;
              speaker: string;
              created_at: string;
            }>(request.userPrompt, "Raw event metadata:");
            const extractedCandidates = extractPromptJson<Array<{ source_segment_id: string }>>(
              request.userPrompt,
              "Extracted candidates:",
            );
            return {
              resolvedModelId: "openrouter/openai/gpt-5.4-nano",
              outputText: JSON.stringify({
                schema_version: "canonical_candidates.v1",
                event_id: rawEvent.event_id,
                canonical_candidates: [
                  {
                    candidate_id: "candidate-preference-001",
                    unit_type: "atomic",
                    kind: "claim",
                    artifact_type: null,
                    canonical_text: "The user prefers concise answers.",
                    search_text: "user prefers concise answers",
                    source: {
                      event_id: rawEvent.event_id,
                      source_type: rawEvent.source_type,
                      source_id: rawEvent.source_id,
                      speaker: rawEvent.speaker,
                      created_at: rawEvent.created_at,
                      segment_id: extractedCandidates[0].source_segment_id,
                      start_char: 0,
                      end_char: 25,
                      evidence_quote: "I prefer concise answers.",
                    },
                    scope: {
                      tenant_id: "tenant-001",
                      user_id: "user-001",
                      project_id: null,
                      workspace_id: null,
                      subject_type: "user",
                      subject_id: "user",
                      applies_to: "global",
                    },
                    validity: {
                      valid_at: null,
                      invalid_at: null,
                      ttl_seconds: null,
                      temporal_status: "current",
                    },
                    payload: {
                      claim_type: "preference_state",
                      subject: "user",
                      predicate: "prefers",
                      object: "concise answers",
                    },
                    parent_candidate_id: null,
                    component_candidate_id: null,
                    promotion: "not_applicable",
                    confidence: 0.92,
                    quality: {
                      atomicity: 0.9,
                      specificity: 0.8,
                      durability: 0.8,
                      actionability: 0.6,
                      grounding: 0.95,
                    },
                    risk_flags: ["none"],
                    content_hash: "mmv2-doc-001",
                  },
                ],
              }),
            };
          }
          case "mmv2-admission-v1": {
            const rawEvent = extractPromptJson<{ event_id: string }>(
              request.userPrompt,
              "Raw event metadata:",
            );
            const canonicalCandidates = extractPromptJson<Array<{ candidate_id: string }>>(
              request.userPrompt,
              "Canonical candidates:",
            );
            return {
              resolvedModelId: "openrouter/openai/gpt-5.4-nano",
              outputText: JSON.stringify({
                schema_version: "admission_decision.v1",
                event_id: rawEvent.event_id,
                decisions: [
                  {
                    candidate_id: canonicalCandidates[0].candidate_id,
                    decision: "admit",
                    scores: {
                      future_utility: 0.8,
                      durability: 0.85,
                      confidence: 0.94,
                      novelty: 0.7,
                      scope_clarity: 0.85,
                      sensitivity_safety: 0.98,
                      specificity: 0.82,
                    },
                    reason_codes: ["durable", "explicit_user_statement"],
                    rationale: "Explicit durable user preference.",
                    recommended_ttl_seconds: null,
                    requires_reconciliation: false,
                  },
                ],
              }),
            };
          }
          case "mmv2-reconciliation-v1": {
            const reconciliationInput = extractPromptJson<{
              event_id: string;
              candidate: { candidate_id: string };
            }>(request.userPrompt, "Reconciliation input:");
            return {
              resolvedModelId: "openrouter/openai/gpt-5.4-nano",
              outputText: JSON.stringify({
                schema_version: "reconciliation_decision.v1",
                event_id: reconciliationInput.event_id,
                candidate_id: reconciliationInput.candidate.candidate_id,
                decision: "insert_new",
                target_memory_ids: [],
                merged_canonical_text: null,
                conflict_type: "none",
                supersedes_memory_ids: [],
                rationale: "No seeded reconciliation override supplied.",
                confidence: 0.9,
              }),
            };
          }
          default:
            throw new Error(`Unexpected contract version: ${request.contract.contractVersion}`);
        }
      },
    };

    const result = await runMmV2ProofCorpusReal({
      proofCases: [proofCase],
      modelId: "openrouter/openai/gpt-5.4-nano",
      executor,
    });

    expect(result.runMode).toBe("real-model");
    expect(result.summary.totalCases).toBe(1);
    expect(result.summary.executionFailedCases).toBe(0);
    expect(result.results[0]).toMatchObject({
      runMode: "real-model",
      modelMetadata: {
        requestedModelId: "openrouter/openai/gpt-5.4-nano",
        resolvedModelIds: ["openrouter/openai/gpt-5.4-nano"],
        executorKind: "executor-backed",
      },
    });
  });
});
