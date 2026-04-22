import { describe, expect, it } from "vitest";
import { ModelMemoryCanonicalRepository } from "../db/canonical-repository.ts";
import { applyModelMemoryMigrations } from "../db/migrations.ts";
import { MmV2NativeRepository } from "../db/mmv2-native-repository.ts";
import { createPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeContextRepository } from "../db/runtime-context-repository.ts";
import {
  buildAdmissionDecision,
  buildAtomicCandidate,
  buildCanonicalCandidate,
  captureOne,
  createScriptedMmV2Interpreter,
} from "../mmv2/test-helpers.ts";
import { ExecutorBackedSemanticInterpreter } from "../real-semantic-interpreter.ts";
import { ModelMemoryReplayService } from "./replay-service.ts";

describe("replay-service", () => {
  it("replays controlled captures through the database-backed service path", async () => {
    const database = await createPgMemTestDatabase();
    const previousEngine = process.env.MODEL_MEMORY_DOCUMENT_INGEST_ENGINE;
    process.env.MODEL_MEMORY_DOCUMENT_INGEST_ENGINE = "v1";
    try {
      await applyModelMemoryMigrations(database.sql);
      const replay = new ModelMemoryReplayService({
        canonicalRepository: new ModelMemoryCanonicalRepository(database.sql),
        runtimeRepository: new RuntimeContextRepository(database.sql),
      });
      const interpreter = new ExecutorBackedSemanticInterpreter({
        async execute(request) {
          const prompt = JSON.parse(request.userPrompt) as {
            sourceWindow: { id: string; headingPath: string[] };
          };
          if (request.contract.contractVersion === "v2-candidate") {
            return {
              outputText: JSON.stringify({
                action: "capture",
                objects: [
                  {
                    candidateType: "preference",
                    claim: "Please use bullet points for instructions.",
                    supportingSpans: [
                      {
                        lineStart: 1,
                        lineEnd: 1,
                        headingPath: prompt.sourceWindow.headingPath,
                      },
                    ],
                    confidence: "strong",
                    shouldStore: true,
                  },
                ],
              }),
            };
          }
          return {
            outputText: JSON.stringify({
              action: "capture",
              objects: [
                {
                  canonicalClass: "user",
                  kind: "preference",
                  payload: {
                    subject: "instruction formatting",
                    instruction: "use bullet points",
                    operation: "prefer",
                  },
                  provenance: [
                    {
                      sourceId: prompt.sourceWindow.id,
                      segmentIndex: 0,
                      headingPath: prompt.sourceWindow.headingPath,
                    },
                  ],
                  confidence: "strong",
                  durability: "durable",
                  reviewMode: "auto_accept",
                },
              ],
            }),
          };
        },
      });

      const result = await replay.replayOrdinaryTurn({
        turn: {
          currentTurnText: "Please use bullet points for instructions.",
          sessionId: "session-001",
        },
        modelId: "model-doc-001",
        candidateModelId: "model-doc-001",
        interpreter,
      });

      expect(result.writeResults[0]?.decision).toBe("write");
      const rebuild = await replay.rebuildDerivedRuntime();
      expect(
        rebuild.contextArtifacts.some((artifact) => artifact.artifactType === "user_memory_pack"),
      ).toBe(true);
    } finally {
      if (previousEngine === undefined) {
        delete process.env.MODEL_MEMORY_DOCUMENT_INGEST_ENGINE;
      } else {
        process.env.MODEL_MEMORY_DOCUMENT_INGEST_ENGINE = previousEngine;
      }
      await database.close();
    }
  });

  it("replays through the MMV2-native live path when MMV2 storage is active", async () => {
    const database = await createPgMemTestDatabase();
    const previousEngine = process.env.MODEL_MEMORY_DOCUMENT_INGEST_ENGINE;
    process.env.MODEL_MEMORY_DOCUMENT_INGEST_ENGINE = "v1";
    try {
      await applyModelMemoryMigrations(database.sql);
      const canonicalRepository = new MmV2NativeRepository(database.sql);
      const replay = new ModelMemoryReplayService({
        canonicalRepository,
        runtimeRepository: new RuntimeContextRepository(database.sql),
      });
      const readPayload = <T>(input: {
        prompt: { promptPayload?: unknown; userPrompt: string };
      }): T => (input.prompt.promptPayload as T) ?? (JSON.parse(input.prompt.userPrompt) as T);
      const interpreter = createScriptedMmV2Interpreter({
        "mmv2-capture-routing-v1": (input) => {
          const payload = readPayload<{
            raw_event: { event_id: string };
            segments: Array<{ segment_id: string }>;
          }>(input);
          const segment = payload.segments[0];
          return captureOne({
            schema_version: "capture_routing.v1",
            event_id: payload.raw_event.event_id,
            routing_decisions: [
              {
                segment_id: segment.segment_id,
                route: "atomic_candidate",
                candidate_summary: "User preference",
                memory_likelihood: 0.93,
                durability_likelihood: 0.9,
                composite_likelihood: 0.02,
                reason_codes: ["durable_user_preference"],
                evidence_quote: "Please use bullet points for instructions.",
                confidence: 0.95,
              },
            ],
          });
        },
        "mmv2-atomic-extraction-v1": (input) => {
          const payload = readPayload<{
            raw_event: { event_id: string };
            routed_candidates: Array<{ segment_id: string }>;
          }>(input);
          const segment = payload.routed_candidates[0];
          return captureOne({
            schema_version: "atomic_extraction.v1",
            event_id: payload.raw_event.event_id,
            atomic_candidates: [
              buildAtomicCandidate(
                segment.segment_id,
                "Please use bullet points for instructions.",
                {
                  kind: "claim",
                  normalized_statement: "The user prefers bullet points for instructions.",
                  payload: {
                    payload_type: "claim",
                    claim_type: "preference_state",
                    subject: "instruction formatting",
                    predicate: "prefers",
                    object: "bullet points",
                    qualifiers: ["for instructions"],
                    temporal_status: "currently_true",
                  },
                },
              ),
            ],
          });
        },
        "mmv2-canonicalization-v1": (input) => {
          const payload = readPayload<{
            raw_event: {
              event_id: string;
              tenant_id: string;
              user_id: string;
            };
            extracted_candidates: Array<{ candidate_id: string; source_segment_id: string }>;
          }>(input);
          const candidate = payload.extracted_candidates[0];
          return captureOne({
            schema_version: "canonical_candidates.v1",
            event_id: payload.raw_event.event_id,
            canonical_candidates: [
              buildCanonicalCandidate(
                payload.raw_event,
                candidate.source_segment_id,
                "Please use bullet points for instructions.",
                {
                  candidate_id: candidate.candidate_id,
                  kind: "claim",
                  artifact_type: null,
                  canonical_text: "The user prefers bullet points for instructions.",
                  search_text: "user prefers bullet points for instructions",
                  payload: {
                    claim_type: "preference_state",
                    subject: "instruction formatting",
                    predicate: "prefers",
                    object: "bullet points",
                  },
                  scope: {
                    tenant_id: payload.raw_event.tenant_id,
                    user_id: payload.raw_event.user_id,
                    project_id: null,
                    workspace_id: null,
                    subject_type: "user",
                    subject_id: payload.raw_event.user_id,
                    applies_to: "global",
                  },
                },
              ),
            ],
          });
        },
        "mmv2-admission-v1": (input) => {
          const payload = readPayload<{
            raw_event: { event_id: string };
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
      });

      const result = await replay.replayOrdinaryTurn({
        turn: {
          currentTurnText: "Please use bullet points for instructions.",
          sessionId: "session-001",
        },
        modelId: "model-doc-001",
        candidateModelId: "model-doc-001",
        interpreter,
      });

      const durableCount = await database.sql.query(
        "SELECT COUNT(*)::int AS count FROM model_memory.durable_memories",
      );
      expect(result.writeResults[0]?.decision).toBe("write");
      expect(durableCount.rows[0]?.count).toBe(1);
    } finally {
      if (previousEngine === undefined) {
        delete process.env.MODEL_MEMORY_DOCUMENT_INGEST_ENGINE;
      } else {
        process.env.MODEL_MEMORY_DOCUMENT_INGEST_ENGINE = previousEngine;
      }
      await database.close();
    }
  });
});
