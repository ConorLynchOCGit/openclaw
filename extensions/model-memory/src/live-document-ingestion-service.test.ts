import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyModelMemoryMigrations } from "./db/migrations.ts";
import { MmV2DatabaseMemoryObjectStore } from "./db/mmv2-memory-object-store.ts";
import { MmV2NativeRepository } from "./db/mmv2-native-repository.ts";
import { createPgMemTestDatabase } from "./db/pg-test.ts";
import { RuntimeContextRepository } from "./db/runtime-context-repository.ts";
import { ingestDocumentLive } from "./live-document-ingestion-service.ts";
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

function createProjectFactDocumentInterpreter(params: {
  evidenceQuote: string;
  canonicalText: string;
  searchText: string;
  projectId: string;
  subject: string;
  object: string;
}) {
  return createScriptedMmV2Interpreter({
    "mmv2-capture-routing-v1": (input) => {
      const payload = readMmV2Payload<{
        raw_event: { event_id: string };
        segments: Array<{ segment_id: string; text: string }>;
      }>(input);
      const factSegment =
        payload.segments.find((segment) => segment.text.includes(params.evidenceQuote)) ??
        payload.segments[0];
      return captureOne({
        schema_version: "capture_routing.v1",
        event_id: payload.raw_event.event_id,
        routing_decisions: [
          {
            segment_id: factSegment.segment_id,
            route: "atomic_candidate",
            candidate_summary: "Project fact",
            memory_likelihood: 0.92,
            durability_likelihood: 0.9,
            composite_likelihood: 0.05,
            reason_codes: ["durable_project_fact"],
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
      const factSegment =
        payload.routed_candidates.find((candidate) =>
          candidate.text.includes(params.evidenceQuote),
        ) ?? payload.routed_candidates[0];
      return captureOne({
        schema_version: "atomic_extraction.v1",
        event_id: payload.raw_event.event_id,
        atomic_candidates: [
          buildAtomicCandidate(factSegment.segment_id, params.evidenceQuote, {
            kind: "claim",
            normalized_statement: params.canonicalText,
            scope: {
              subject_type: "project",
              subject_id: params.projectId,
              project_id: params.projectId,
              workspace_id: null,
              applies_to: "current_project",
            },
            payload: {
              payload_type: "claim",
              claim_type: "project_fact",
              subject: params.subject,
              predicate: "is",
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
                claim_type: "project_fact",
                subject: params.subject,
                predicate: "is",
                object: params.object,
              },
              scope: {
                tenant_id: payload.raw_event.tenant_id,
                user_id: payload.raw_event.user_id,
                project_id: params.projectId,
                workspace_id: null,
                subject_type: "project",
                subject_id: params.projectId,
                applies_to: "current_project",
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

describe("live-document-ingestion-service", () => {
  it("persists document captures and rebuilds derived runtime state", async () => {
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
          const factSegment = payload.segments.find((segment) =>
            segment.text.includes("Deployment region is region-001."),
          )!;
          return captureOne({
            schema_version: "capture_routing.v1",
            event_id: payload.raw_event.event_id,
            routing_decisions: [
              {
                segment_id: factSegment.segment_id,
                route: "atomic_candidate",
                candidate_summary: "Project fact",
                memory_likelihood: 0.92,
                durability_likelihood: 0.9,
                composite_likelihood: 0.05,
                reason_codes: ["durable_project_fact"],
                evidence_quote: "Deployment region is region-001.",
                confidence: 0.95,
              },
            ],
          });
        },
        "mmv2-atomic-extraction-v1": (input) => {
          const payload = readPayload<{
            raw_event: { event_id: string };
            routed_candidates: Array<{ segment_id: string; text: string }>;
          }>(input);
          const factSegment = payload.routed_candidates.find((candidate) =>
            candidate.text.includes("Deployment region is region-001."),
          )!;
          return captureOne({
            schema_version: "atomic_extraction.v1",
            event_id: payload.raw_event.event_id,
            atomic_candidates: [
              buildAtomicCandidate(factSegment.segment_id, "Deployment region is region-001.", {
                kind: "claim",
                normalized_statement: "Deployment region is region-001.",
                scope: {
                  subject_type: "project",
                  subject_id: "project-001",
                  project_id: "project-001",
                  workspace_id: null,
                  applies_to: "current_project",
                },
                payload: {
                  payload_type: "claim",
                  claim_type: "project_fact",
                  subject: "deployment region",
                  predicate: "is",
                  object: "region-001",
                  qualifiers: [],
                  temporal_status: "currently_true",
                },
              }),
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
                "Deployment region is region-001.",
                {
                  candidate_id: candidate.candidate_id,
                  kind: "claim",
                  artifact_type: null,
                  canonical_text: "Deployment region is region-001.",
                  payload: {
                    claim_type: "project_fact",
                    subject: "deployment region",
                    predicate: "is",
                    object: "region-001",
                  },
                  scope: {
                    tenant_id: payload.raw_event.tenant_id,
                    user_id: payload.raw_event.user_id,
                    project_id: "project-001",
                    workspace_id: null,
                    subject_type: "project",
                    subject_id: "project-001",
                    applies_to: "current_project",
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

      const result = await ingestDocumentLive({
        canonicalRepository,
        runtimeRepository,
        ingestion: {
          document: {
            externalSourceId: "doc-001",
            text: "# Project\nDeployment region is region-001.",
            projectId: "project-001",
          },
          modelId: "model-doc-001",
          interpreter,
        },
      });

      expect(result.writeResults).toHaveLength(1);
      expect(result.writeResults[0]?.decision).toBe("write");
      expect(result.rebuild?.activeMemorySlots).toHaveLength(1);
      expect(result.rebuild?.contextArtifacts.length).toBeGreaterThan(0);
      expect(result.rebuild?.projectionVersions.length).toBe(3);
      expect(result.rebuild?.projectionOutputs["memory-md"]).toContain("deployment region");
    } finally {
      await database.close();
    }
  });

  it("persists MMV2 document ingest directly into MMV2 durable storage", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const canonicalRepository = new MmV2NativeRepository(database.sql);
      const runtimeRepository = new RuntimeContextRepository(database.sql);
      const memoryStore = new MmV2DatabaseMemoryObjectStore(canonicalRepository);
      const readPayload = <T>(input: {
        prompt: { promptPayload?: unknown; userPrompt: string };
      }): T => (input.prompt.promptPayload as T) ?? (JSON.parse(input.prompt.userPrompt) as T);
      const interpreter = createScriptedMmV2Interpreter({
        "mmv2-capture-routing-v1": (input) => {
          const payload = readPayload<{
            raw_event: { event_id: string };
            segments: Array<{ segment_id: string; text: string }>;
          }>(input);
          const factSegment = payload.segments.find((segment) =>
            segment.text.includes("Deployment region is region-001."),
          )!;
          return captureOne({
            schema_version: "capture_routing.v1",
            event_id: payload.raw_event.event_id,
            routing_decisions: [
              {
                segment_id: factSegment.segment_id,
                route: "atomic_candidate",
                candidate_summary: "Project fact",
                memory_likelihood: 0.92,
                durability_likelihood: 0.9,
                composite_likelihood: 0.05,
                reason_codes: ["durable_project_fact"],
                evidence_quote: "Deployment region is region-001.",
                confidence: 0.95,
              },
            ],
          });
        },
        "mmv2-atomic-extraction-v1": (input) => {
          const payload = readPayload<{
            raw_event: { event_id: string };
            routed_candidates: Array<{ segment_id: string; text: string }>;
          }>(input);
          const factSegment = payload.routed_candidates[0];
          return captureOne({
            schema_version: "atomic_extraction.v1",
            event_id: payload.raw_event.event_id,
            atomic_candidates: [
              buildAtomicCandidate(factSegment.segment_id, "Deployment region is region-001.", {
                kind: "claim",
                normalized_statement: "Deployment region is region-001.",
                scope: {
                  subject_type: "project",
                  subject_id: "project-001",
                  project_id: "project-001",
                  workspace_id: null,
                  applies_to: "current_project",
                },
                payload: {
                  payload_type: "claim",
                  claim_type: "project_fact",
                  subject: "deployment region",
                  predicate: "is",
                  object: "region-001",
                  qualifiers: [],
                  temporal_status: "currently_true",
                },
              }),
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
                "Deployment region is region-001.",
                {
                  candidate_id: candidate.candidate_id,
                  kind: "claim",
                  artifact_type: null,
                  canonical_text: "Deployment region is region-001.",
                  payload: {
                    claim_type: "project_fact",
                    subject: "deployment region",
                    predicate: "is",
                    object: "region-001",
                  },
                  scope: {
                    tenant_id: payload.raw_event.tenant_id,
                    user_id: payload.raw_event.user_id,
                    project_id: "project-001",
                    workspace_id: null,
                    subject_type: "project",
                    subject_id: "project-001",
                    applies_to: "current_project",
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

      const result = await ingestDocumentLive({
        canonicalRepository,
        runtimeRepository,
        memoryStore,
        ingestion: {
          document: {
            externalSourceId: "doc-001",
            text: "# Project\nDeployment region is region-001.",
            projectId: "project-001",
          },
          modelId: "model-doc-001",
          interpreter,
        },
      });

      const durableCount = await database.sql.query(
        "SELECT COUNT(*)::int AS count FROM model_memory.durable_memories",
      );
      const legacyCount = await database.sql.query(
        "SELECT COUNT(*)::int AS count FROM model_memory.memory_objects",
      );

      expect(result.writeResults).toHaveLength(1);
      expect(durableCount.rows[0]?.count).toBe(1);
      expect(legacyCount.rows[0]?.count).toBe(0);
      expect(result.rebuild?.activeMemorySlots).toHaveLength(1);
    } finally {
      await database.close();
    }
  });

  it("emits a redacted closeout artifact for document ingest when runtime-state output is configured", async () => {
    const database = await createPgMemTestDatabase();
    const stateDir = await mkdtemp(path.join(os.tmpdir(), "model-memory-doc-closeout-"));
    try {
      await applyModelMemoryMigrations(database.sql);
      const canonicalRepository = new MmV2NativeRepository(database.sql);
      const runtimeRepository = new RuntimeContextRepository(database.sql);

      const result = await ingestDocumentLive({
        canonicalRepository,
        runtimeRepository,
        closeoutRunId: "doc-run-closeout-001",
        env: {
          ...process.env,
          OPENCLAW_STATE_DIR: stateDir,
        },
        ingestion: {
          document: {
            externalSourceId: "doc-closeout-001",
            text: "# Project\nDeployment region is region-001.",
            projectId: "project-001",
          },
          modelId: "model-doc-001",
          interpreter: createProjectFactDocumentInterpreter({
            evidenceQuote: "Deployment region is region-001.",
            canonicalText: "Deployment region is region-001.",
            searchText: "deployment region region-001",
            projectId: "project-001",
            subject: "deployment region",
            object: "region-001",
          }),
        },
      });

      expect(result.closeoutArtifact?.path).toContain(
        path.join("model-memory", "closeout-reports", "document_ingest"),
      );
      const closeout = JSON.parse(await readFile(result.closeoutArtifact!.path, "utf8"));
      expect(closeout).toMatchObject({
        path: "document_ingest",
        run_id: "doc-run-closeout-001",
        source_id: result.source.id,
        source_hash: result.source.sourceFingerprint,
        dirty_state: { status: "not_required", reason: "inline_rebuild_or_runner_managed" },
      });
      expect(closeout.counts.candidates_admitted).toBeGreaterThan(0);
      expect(JSON.stringify(closeout)).not.toContain("Deployment region is region-001.");
      expect(JSON.stringify(closeout)).not.toContain("raw tool log");
    } finally {
      await database.close();
    }
  });
});
