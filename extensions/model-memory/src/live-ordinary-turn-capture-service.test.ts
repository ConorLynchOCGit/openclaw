import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyModelMemoryMigrations } from "./db/migrations.ts";
import { MmV2NativeRepository } from "./db/mmv2-native-repository.ts";
import { createPgMemTestDatabase } from "./db/pg-test.ts";
import { RuntimeContextRepository } from "./db/runtime-context-repository.ts";
import { captureOrdinaryTurnLive } from "./live-ordinary-turn-capture-service.ts";
import type { DurableMemoryRecord } from "./mmv2/contracts.ts";
import {
  buildAdmissionDecision,
  buildAtomicCandidate,
  buildCanonicalCandidate,
  captureOne,
  createScriptedMmV2Interpreter,
} from "./mmv2/test-helpers.ts";

function readMmV2Payload<T>(input: { prompt: { promptPayload?: unknown; userPrompt: string } }): T {
  return (input.prompt.promptPayload as T) ?? (JSON.parse(input.prompt.userPrompt) as T);
}

function createPreferenceTurnInterpreter(params: {
  evidenceQuote: string;
  canonicalText: string;
  searchText: string;
  object: string;
}) {
  return createScriptedMmV2Interpreter({
    "mmv2-capture-routing-v1": (input) => {
      const payload = readMmV2Payload<{
        raw_event: { event_id: string };
        segments: Array<{ segment_id: string; text: string }>;
      }>(input);
      const segment =
        payload.segments.find((entry) => entry.text.includes(params.evidenceQuote)) ??
        payload.segments[0];
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
            evidence_quote: params.evidenceQuote,
            confidence: 0.95,
          },
        ],
      });
    },
    "mmv2-atomic-extraction-v1": (input) => {
      const payload = readMmV2Payload<{
        raw_event: { event_id: string };
        routed_candidates: Array<{ segment_id: string; text: string }>;
      }>(input);
      const segment =
        payload.routed_candidates.find((entry) => entry.text.includes(params.evidenceQuote)) ??
        payload.routed_candidates[0];
      return captureOne({
        schema_version: "atomic_extraction.v1",
        event_id: payload.raw_event.event_id,
        atomic_candidates: [
          buildAtomicCandidate(segment.segment_id, params.evidenceQuote, {
            kind: "claim",
            normalized_statement: params.canonicalText,
            payload: {
              payload_type: "claim",
              claim_type: "preference_state",
              subject: "response format",
              predicate: "prefers",
              object: params.object,
              qualifiers: [],
              temporal_status: "currently_true",
            },
          }),
        ],
      });
    },
    "mmv2-canonicalization-v1": (input) => {
      const payload = readMmV2Payload<{
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
            params.evidenceQuote,
            {
              candidate_id: candidate.candidate_id,
              kind: "claim",
              artifact_type: null,
              canonical_text: params.canonicalText,
              search_text: params.searchText,
              payload: {
                claim_type: "preference_state",
                subject: "response format",
                predicate: "prefers",
                object: params.object,
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
      const payload = readMmV2Payload<{
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
}

function buildPreferenceMemory(overrides: Partial<DurableMemoryRecord> = {}): DurableMemoryRecord {
  return {
    memory_id: overrides.memory_id ?? "existing-preference-memory",
    schema_version: "durable_memory.v1",
    status: overrides.status ?? "active",
    unit_type: "atomic",
    kind: "claim",
    artifact_type: null,
    canonical_text:
      overrides.canonical_text ??
      "The user prefers concise status first, then detailed evidence, then exact artifact paths.",
    search_text:
      overrides.search_text ?? "user prefers concise status detailed evidence exact artifact paths",
    scope: overrides.scope ?? {
      tenant_id: "openclaw",
      user_id: "unknown-user",
      project_id: null,
      workspace_id: null,
      subject_type: "user",
      subject_id: "user",
      applies_to: "current_workspace",
    },
    payload: overrides.payload ?? {
      payload_type: "claim",
      claim_type: "preference_state",
      subject: "user",
      predicate: "prefers",
      object: "concise status first, then detailed evidence, then exact artifact paths",
      qualifiers: [],
      temporal_status: "currently_true",
    },
    validity: overrides.validity ?? {
      valid_at: null,
      invalid_at: null,
      ttl_seconds: null,
      temporal_status: "current",
    },
    confidence: overrides.confidence ?? 0.9,
    quality: overrides.quality ?? {
      atomicity: 0.95,
      specificity: 0.8,
      durability: 0.72,
      actionability: 0.55,
      grounding: 1,
    },
    source_refs: overrides.source_refs ?? [
      {
        source_ingest_event_id: "event-existing",
        source_type: "conversation_turn",
        source_id: "source-existing",
        speaker: "user",
        created_at: "2026-04-21T00:00:00.000Z",
        segment_id: "segment-existing",
        start_char: 0,
        end_char: 0,
        evidence_quote:
          "I prefer concise status first, then detailed evidence, then exact artifact paths.",
      },
    ],
    lineage: overrides.lineage ?? {
      candidate_ids: ["candidate-existing"],
      derived_from_memory_ids: [],
      supersedes_memory_ids: [],
      superseded_by_memory_id: null,
      conflicts_with_memory_ids: [],
      parent_memory_id: null,
      child_memory_ids: [],
    },
    created_at: overrides.created_at ?? "2026-04-21T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-04-21T00:00:00.000Z",
    last_accessed_at: null,
    access_count: 0,
    tags: overrides.tags ?? ["claim"],
  };
}

describe("live-ordinary-turn-capture-service", () => {
  it("persists ordinary-turn captures and rebuilds derived runtime state", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const canonicalRepository = new MmV2NativeRepository(database.sql);
      const runtimeRepository = new RuntimeContextRepository(database.sql);
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
                durability_likelihood: 0.88,
                composite_likelihood: 0.02,
                reason_codes: ["durable_user_preference"],
                evidence_quote: "Please keep explanations high level by default.",
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
                "Please keep explanations high level by default.",
                {
                  kind: "claim",
                  normalized_statement: "The user prefers high-level explanations by default.",
                  payload: {
                    payload_type: "claim",
                    claim_type: "preference_state",
                    subject: "response detail",
                    predicate: "prefers",
                    object: "high-level explanations",
                    qualifiers: ["by default"],
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
                "Please keep explanations high level by default.",
                {
                  candidate_id: candidate.candidate_id,
                  kind: "claim",
                  artifact_type: null,
                  canonical_text: "The user prefers high-level explanations by default.",
                  search_text: "user prefers high-level explanations by default",
                  payload: {
                    claim_type: "preference_state",
                    subject: "response detail",
                    predicate: "prefers",
                    object: "high-level explanations",
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

      const result = await captureOrdinaryTurnLive({
        canonicalRepository,
        runtimeRepository,
        rebuildRuntime: true,
        capture: {
          turn: {
            currentTurnText: "Please keep explanations high level by default.",
            sessionId: "session-001",
          },
          modelId: "model-turn-001",
          candidateModelId: "model-turn-001",
          interpreter,
        },
      });

      expect(result.writeResults).toHaveLength(1);
      expect(result.rebuild?.activeMemorySlots).toHaveLength(1);
      expect(result.rebuild?.contextArtifacts[0]?.artifactType).toBe("user_memory_pack");
      expect(result.rebuild?.projectionOutputs["user-md"]).toContain("response detail");
    } finally {
      await database.close();
    }
  });

  it("persists ordinary-turn MMV2 live batches directly into MMV2 durable storage", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const canonicalRepository = new MmV2NativeRepository(database.sql);
      const runtimeRepository = new RuntimeContextRepository(database.sql);
      const readPayload = <T>(input: {
        prompt: { promptPayload?: unknown; userPrompt: string };
      }): T => (input.prompt.promptPayload as T) ?? (JSON.parse(input.prompt.userPrompt) as T);
      const interpreter = createScriptedMmV2Interpreter({
        "mmv2-capture-routing-v1": (input) => {
          const payload = readPayload<{
            raw_event: { event_id: string };
            segments: Array<{ segment_id: string; text: string }>;
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
                durability_likelihood: 0.88,
                composite_likelihood: 0.02,
                reason_codes: ["durable_user_preference"],
                evidence_quote: "Please keep explanations high level by default.",
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
                "Please keep explanations high level by default.",
                {
                  kind: "claim",
                  normalized_statement: "The user prefers high-level explanations by default.",
                  payload: {
                    payload_type: "claim",
                    claim_type: "preference_state",
                    subject: "response detail",
                    predicate: "prefers",
                    object: "high-level explanations",
                    qualifiers: ["by default"],
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
                "Please keep explanations high level by default.",
                {
                  candidate_id: candidate.candidate_id,
                  kind: "claim",
                  artifact_type: null,
                  canonical_text: "The user prefers high-level explanations by default.",
                  search_text: "user prefers high-level explanations by default",
                  payload: {
                    claim_type: "preference_state",
                    subject: "response detail",
                    predicate: "prefers",
                    object: "high-level explanations",
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

      const result = await captureOrdinaryTurnLive({
        canonicalRepository,
        runtimeRepository,
        rebuildRuntime: true,
        collisionAdjudicator: {
          async adjudicate() {
            throw new Error("legacy semantic collision adjudicator must not run on MMV2 live path");
          },
          async adjudicateBatch() {
            throw new Error("legacy semantic collision adjudicator must not run on MMV2 live path");
          },
        },
        capture: {
          turn: {
            currentTurnText: "Please keep explanations high level by default.",
            sessionId: "session-001",
          },
          modelId: "model-turn-001",
          candidateModelId: "model-turn-001",
          interpreter,
        },
      });

      const durableCount = await database.sql.query(
        "SELECT COUNT(*)::int AS count FROM model_memory.durable_memories",
      );
      const legacyCount = await database.sql.query(
        "SELECT COUNT(*)::int AS count FROM model_memory.memory_objects",
      );
      const segments = await database.sql.query(
        "SELECT normalized_text, block_descriptors FROM model_memory.ingest_segments",
      );

      expect(result.writeResults).toHaveLength(1);
      expect(durableCount.rows[0]?.count).toBe(1);
      expect(legacyCount.rows[0]?.count).toBe(0);
      expect(result.rebuild?.activeMemorySlots).toHaveLength(1);
      expect(String(segments.rows[0]?.normalized_text)).toContain("[redacted ordinary_turn_window");
      expect(JSON.stringify(segments.rows[0]?.block_descriptors)).not.toContain(
        "Please keep explanations high level by default.",
      );
    } finally {
      await database.close();
    }
  });

  it("admits explicit durable project facts from ordinary turns with event evidence", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const canonicalRepository = new MmV2NativeRepository(database.sql);
      const runtimeRepository = new RuntimeContextRepository(database.sql);

      const result = await captureOrdinaryTurnLive({
        canonicalRepository,
        runtimeRepository,
        capture: {
          turn: {
            currentTurnText:
              "Durable workspace project fact: the current model-memory clean-soak lane validates direct MMV2 retrieval telemetry. Please store this as a workspace-scoped project fact if durable.",
            sessionId: "session-project-fact",
            projectId: "project-001",
          },
          modelId: "model-turn-001",
          candidateModelId: "model-turn-001",
          interpreter: createScriptedMmV2Interpreter({}),
        },
      });

      const durable = await canonicalRepository.listDurableMemories();
      const events = await canonicalRepository.listMemoryEvents();
      const projectFact = durable.find(
        (memory) => memory.kind === "claim" && memory.payload.claim_type === "project_fact",
      );

      expect(result.writeResults.some((entry) => entry.decision === "write")).toBe(true);
      expect(projectFact?.status).toBe("active");
      expect(projectFact?.scope.project_id).toBe("project-001");
      expect(projectFact?.source_refs[0]?.evidence_quote).toContain(
        "Durable workspace project fact",
      );
      expect(events.some((event) => event.memory_id === projectFact?.memory_id)).toBe(true);
    } finally {
      await database.close();
    }
  });

  it("persists directive memories with matching event evidence", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const canonicalRepository = new MmV2NativeRepository(database.sql);
      const runtimeRepository = new RuntimeContextRepository(database.sql);
      const readPayload = <T>(input: {
        prompt: { promptPayload?: unknown; userPrompt: string };
      }): T => (input.prompt.promptPayload as T) ?? (JSON.parse(input.prompt.userPrompt) as T);
      const interpreter = createScriptedMmV2Interpreter({
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
                "When I ask for validation reports, include skipped validations and the exact reason they were skipped.",
                {
                  kind: "directive",
                  normalized_statement:
                    "Include skipped validations and the exact reason they were skipped when asked for validation reports.",
                  payload: {
                    payload_type: "directive",
                    directive_type: "formatting",
                    authority: "user",
                    target: "assistant",
                    strength: "hard_constraint",
                    trigger: "asked for validation reports",
                    action: "include skipped validations and the exact reason they were skipped",
                    exceptions: [],
                    overridable: false,
                    derived_from_claim_candidate_ids: [],
                  },
                  scope: {
                    subject_type: "assistant",
                    subject_id: "assistant",
                    project_id: null,
                    workspace_id: null,
                    applies_to: "current_workspace",
                  },
                },
              ),
            ],
          });
        },
      });

      const result = await captureOrdinaryTurnLive({
        canonicalRepository,
        runtimeRepository,
        capture: {
          turn: {
            currentTurnText:
              "When I ask for validation reports, include skipped validations and the exact reason they were skipped. This is a standing instruction.",
            sessionId: "session-directive",
          },
          modelId: "model-turn-001",
          candidateModelId: "model-turn-001",
          interpreter,
        },
      });

      const durable = await canonicalRepository.listDurableMemories();
      const events = await canonicalRepository.listMemoryEvents();
      const directive = durable.find((memory) => memory.kind === "directive");

      expect(result.writeResults.some((entry) => entry.decision === "write")).toBe(true);
      expect(directive?.status).toBe("active");
      expect(events.some((event) => event.memory_id === directive?.memory_id)).toBe(true);
    } finally {
      await database.close();
    }
  });

  it("emits a redacted closeout artifact when runtime-state output is configured", async () => {
    const database = await createPgMemTestDatabase();
    const stateDir = await mkdtemp(path.join(os.tmpdir(), "model-memory-closeout-"));
    try {
      await applyModelMemoryMigrations(database.sql);
      const canonicalRepository = new MmV2NativeRepository(database.sql);
      const runtimeRepository = new RuntimeContextRepository(database.sql);

      const result = await captureOrdinaryTurnLive({
        canonicalRepository,
        runtimeRepository,
        closeoutJobId: "capture-job-closeout-001",
        env: {
          ...process.env,
          OPENCLAW_STATE_DIR: stateDir,
        },
        capture: {
          turn: {
            currentTurnText:
              "Standing preference: start with the result, then the evidence, then exact artifact paths.",
            sessionId: "session-closeout",
          },
          modelId: "model-turn-001",
          candidateModelId: "model-turn-001",
          interpreter: createPreferenceTurnInterpreter({
            evidenceQuote:
              "Standing preference: start with the result, then the evidence, then exact artifact paths.",
            canonicalText:
              "The user prefers result first, then evidence, then exact artifact paths.",
            searchText: "user prefers result first evidence exact artifact paths",
            object: "result first, then evidence, then exact artifact paths",
          }),
        },
      });

      expect(result.closeoutArtifact?.path).toContain(
        path.join("model-memory", "closeout-reports", "ordinary_turn_capture"),
      );
      const closeout = JSON.parse(await readFile(result.closeoutArtifact!.path, "utf8"));
      expect(closeout).toMatchObject({
        path: "ordinary_turn_capture",
        job_id: "capture-job-closeout-001",
        source_id: result.source.id,
        source_hash: result.source.sourceFingerprint,
        dirty_state: { status: "not_required", reason: "caller_managed" },
      });
      expect(closeout.counts.candidates_admitted).toBeGreaterThan(0);
      expect(closeout.quarantined).toEqual([]);
      expect(JSON.stringify(closeout)).not.toContain("Standing preference");
      expect(JSON.stringify(closeout)).not.toContain("raw prompt");
      expect(JSON.stringify(closeout)).not.toContain("full transcript");
    } finally {
      await database.close();
    }
  });

  it("supersedes an older preference from an explicit correction prompt", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const canonicalRepository = new MmV2NativeRepository(database.sql);
      const runtimeRepository = new RuntimeContextRepository(database.sql);
      await canonicalRepository.upsertDurableMemory(buildPreferenceMemory());

      const result = await captureOrdinaryTurnLive({
        canonicalRepository,
        runtimeRepository,
        capture: {
          turn: {
            currentTurnText:
              "Durable correction targeting memory_id=existing-preference-memory: replace PRIOR-PREF with this standing preference: concise outcome first, then detailed evidence, then exact artifact paths and skipped-validation reasons. Please store the correction and supersede the targeted preference if durable.",
            sessionId: "session-correction",
          },
          modelId: "model-turn-001",
          candidateModelId: "model-turn-001",
          interpreter: createScriptedMmV2Interpreter({}),
        },
      });

      const durable = await canonicalRepository.listDurableMemories();
      const events = await canonicalRepository.listMemoryEvents();
      const edges = await canonicalRepository.listMemoryEdges();
      const prior = durable.find((memory) => memory.memory_id === "existing-preference-memory");
      const replacement = durable.find(
        (memory) =>
          memory.memory_id !== "existing-preference-memory" &&
          memory.kind === "claim" &&
          memory.payload.claim_type === "preference_state",
      );

      expect(result.writeResults.some((entry) => entry.decision === "supersede")).toBe(true);
      expect(prior?.status).toBe("superseded");
      expect(prior?.lineage.superseded_by_memory_id).toBe(replacement?.memory_id);
      expect(replacement?.status).toBe("active");
      expect(events.some((event) => event.memory_id === replacement?.memory_id)).toBe(true);
      expect(
        edges.some(
          (edge) =>
            edge.edge_type === "supersedes" &&
            edge.from_memory_id === replacement?.memory_id &&
            edge.to_memory_id === "existing-preference-memory",
        ),
      ).toBe(true);
    } finally {
      await database.close();
    }
  });
});
