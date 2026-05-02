import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { applyModelMemoryMigrations } from "./db/migrations.ts";
import { MmV2NativeRepository } from "./db/mmv2-native-repository.ts";
import { createPgMemTestDatabase } from "./db/pg-test.ts";
import { RuntimeContextRepository } from "./db/runtime-context-repository.ts";
import { captureOrdinaryTurnLive } from "./live-ordinary-turn-capture-service.ts";
import type { DurableMemoryRecord, MemoryEvent } from "./mmv2/contracts.ts";
import {
  buildAdmissionDecision,
  buildAtomicCandidate,
  buildCanonicalCandidate,
  captureOne,
  createScriptedMmV2Interpreter,
} from "./mmv2/test-helpers.ts";
import { buildSourceAuthorityMetadata } from "./source-authority.ts";

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

function createClaimTurnInterpreter(params: {
  evidenceQuote: string;
  canonicalText: string;
  searchText: string;
  claimType: "project_fact" | "preference_state";
  subject: string;
  predicate: string;
  object: string;
  projectId?: string | null;
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
            candidate_summary: "Model-reviewed durable claim candidate",
            memory_likelihood: 0.92,
            durability_likelihood: 0.88,
            composite_likelihood: 0.02,
            reason_codes:
              params.claimType === "project_fact"
                ? ["durable_project_fact"]
                : ["durable_user_preference"],
            evidence_quote: params.evidenceQuote,
            confidence: 0.94,
          },
        ],
      });
    },
    "mmv2-atomic-extraction-v1": (input) => {
      const payload = readMmV2Payload<{
        raw_event: { event_id: string };
        routed_candidates: Array<{ segment_id: string; text: string }>;
      }>(input);
      const segment = payload.routed_candidates[0];
      return captureOne({
        schema_version: "atomic_extraction.v1",
        event_id: payload.raw_event.event_id,
        atomic_candidates: [
          buildAtomicCandidate(segment.segment_id, params.evidenceQuote, {
            kind: "claim",
            normalized_statement: params.canonicalText,
            payload: {
              payload_type: "claim",
              claim_type: params.claimType,
              subject: params.subject,
              predicate: params.predicate,
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
          metadata?: { project_id?: string | null; workspace_id?: string | null };
        };
        extracted_candidates: Array<{ candidate_id: string; source_segment_id: string }>;
      }>(input);
      const candidate = payload.extracted_candidates[0];
      const projectId = params.projectId ?? payload.raw_event.metadata?.project_id ?? null;
      const rawEventForCandidate = {
        event_id: payload.raw_event.event_id,
        tenant_id: payload.raw_event.tenant_id,
        user_id: payload.raw_event.user_id,
      };
      return captureOne({
        schema_version: "canonical_candidates.v1",
        event_id: payload.raw_event.event_id,
        canonical_candidates: [
          buildCanonicalCandidate(
            rawEventForCandidate,
            candidate.source_segment_id,
            params.evidenceQuote,
            {
              candidate_id: candidate.candidate_id,
              kind: "claim",
              artifact_type: null,
              canonical_text: params.canonicalText,
              search_text: params.searchText,
              payload: {
                claim_type: params.claimType,
                subject: params.subject,
                predicate: params.predicate,
                object: params.object,
              },
              scope: {
                tenant_id: payload.raw_event.tenant_id,
                user_id: payload.raw_event.user_id,
                project_id: projectId,
                workspace_id: payload.raw_event.metadata?.workspace_id ?? null,
                subject_type: projectId ? "project" : "user",
                subject_id: projectId ?? payload.raw_event.user_id,
                applies_to: projectId ? "current_project" : "global",
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

function createDirectiveTurnInterpreter(params: {
  evidenceQuote: string;
  canonicalText: string;
  trigger: string;
  action: string;
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
            candidate_summary: "Model-reviewed durable directive candidate",
            memory_likelihood: 0.93,
            durability_likelihood: 0.9,
            composite_likelihood: 0.02,
            reason_codes: ["assistant_behavior_instruction", "explicit_user_preference"],
            evidence_quote: params.evidenceQuote,
            confidence: 0.95,
          },
        ],
      });
    },
    "mmv2-atomic-extraction-v1": (input) => {
      const payload = readMmV2Payload<{
        raw_event: { event_id: string };
        routed_candidates: Array<{ segment_id: string }>;
      }>(input);
      const segment = payload.routed_candidates[0];
      return captureOne({
        schema_version: "atomic_extraction.v1",
        event_id: payload.raw_event.event_id,
        atomic_candidates: [
          buildAtomicCandidate(segment.segment_id, params.evidenceQuote, {
            kind: "directive",
            normalized_statement: params.canonicalText,
            payload: {
              payload_type: "directive",
              directive_type: "formatting",
              authority: "user",
              target: "assistant",
              strength: "hard_constraint",
              trigger: params.trigger,
              action: params.action,
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
          metadata?: { workspace_id?: string | null };
        };
        extracted_candidates: Array<{ candidate_id: string; source_segment_id: string }>;
      }>(input);
      const candidate = payload.extracted_candidates[0];
      const rawEventForCandidate = {
        event_id: payload.raw_event.event_id,
        tenant_id: payload.raw_event.tenant_id,
        user_id: payload.raw_event.user_id,
      };
      return captureOne({
        schema_version: "canonical_candidates.v1",
        event_id: payload.raw_event.event_id,
        canonical_candidates: [
          buildCanonicalCandidate(
            rawEventForCandidate,
            candidate.source_segment_id,
            params.evidenceQuote,
            {
              candidate_id: candidate.candidate_id,
              kind: "directive",
              artifact_type: null,
              canonical_text: params.canonicalText,
              search_text: params.canonicalText.toLowerCase(),
              payload: {
                directive_type: "formatting",
                authority: "user",
                target: "assistant",
                strength: "hard_constraint",
                trigger: params.trigger,
                action: params.action,
                exceptions: [],
                overridable: false,
              },
              scope: {
                tenant_id: payload.raw_event.tenant_id,
                user_id: payload.raw_event.user_id,
                project_id: null,
                workspace_id: payload.raw_event.metadata?.workspace_id ?? null,
                subject_type: "assistant",
                subject_id: "assistant",
                applies_to: "current_workspace",
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

class FailingOrdinaryTurnRepository extends MmV2NativeRepository {
  constructor(
    sql: ConstructorParameters<typeof MmV2NativeRepository>[0],
    private readonly failingCandidateIds: ReadonlySet<string>,
  ) {
    super(sql);
  }

  override withTransaction<T>(
    work: (repository: FailingOrdinaryTurnRepository) => Promise<T>,
  ): Promise<T> {
    return this.sql.withTransaction((tx) =>
      work(new FailingOrdinaryTurnRepository(tx, this.failingCandidateIds)),
    );
  }

  override async insertMemoryEvent(record: MemoryEvent): Promise<MemoryEvent> {
    if (record.candidate_id && this.failingCandidateIds.has(record.candidate_id)) {
      throw new Error(`forced event failure for ${record.candidate_id}`);
    }
    return await super.insertMemoryEvent(record);
  }

  override async insertMemoryEvents(records: MemoryEvent[]): Promise<MemoryEvent[]> {
    if (
      records.some(
        (record) => record.candidate_id && this.failingCandidateIds.has(record.candidate_id),
      )
    ) {
      throw new Error("forced batched event failure");
    }
    return await super.insertMemoryEvents(records);
  }
}

function createMixedPersistenceIsolationInterpreter() {
  const buildAtomicExtractionResult = (input: {
    prompt: { promptPayload?: unknown; userPrompt: string };
  }) => {
    const payload = readMmV2Payload<{
      original_payload?: {
        raw_event?: { event_id: string };
        raw_event_metadata?: { event_id: string };
        routed_candidates: Array<{ segment_id: string; text: string }>;
      };
      raw_event?: { event_id: string };
      raw_event_metadata?: { event_id: string };
      routed_candidates: Array<{ segment_id: string; text: string }>;
    }>(input);
    const repairPayload = payload.original_payload ?? payload;
    const routedCandidates = repairPayload.routed_candidates ?? [];
    const firstCandidate = routedCandidates[0];
    const secondCandidate = routedCandidates[1] ?? routedCandidates[0];
    return captureOne({
      schema_version: "atomic_extraction.v1",
      event_id:
        repairPayload.raw_event?.event_id ??
        repairPayload.raw_event_metadata?.event_id ??
        "event-001",
      atomic_candidates: [
        buildAtomicCandidate(
          firstCandidate.segment_id,
          "Standing preference: start with the outcome first.",
          {
            candidate_id: "candidate-valid",
            kind: "claim",
            normalized_statement: "The user prefers outcome-first status updates.",
            payload: {
              payload_type: "claim",
              claim_type: "preference_state",
              subject: "status update ordering",
              predicate: "prefers",
              object: "outcome first",
              qualifiers: [],
              temporal_status: "currently_true",
            },
          },
        ),
        buildAtomicCandidate(
          secondCandidate.segment_id,
          "Standing preference: use concise headings for status updates.",
          {
            candidate_id: "candidate-bad",
            kind: "claim",
            normalized_statement: "The user prefers concise headings for status updates.",
            payload: {
              payload_type: "claim",
              claim_type: "preference_state",
              subject: "status update headings",
              predicate: "prefers",
              object: "concise headings",
              qualifiers: [],
              temporal_status: "currently_true",
            },
          },
        ),
      ],
    });
  };
  return createScriptedMmV2Interpreter({
    "mmv2-capture-routing-v1": (input) => {
      const payload = readMmV2Payload<{
        raw_event: { event_id: string };
        segments: Array<{ segment_id: string; text: string }>;
      }>(input);
      const firstSegment =
        payload.segments.find((segment) => segment.text.includes("outcome first")) ??
        payload.segments[0];
      const secondSegment =
        payload.segments.find((segment) => segment.text.includes("concise headings")) ??
        payload.segments[1] ??
        firstSegment;
      return captureOne({
        schema_version: "capture_routing.v1",
        event_id: payload.raw_event.event_id,
        routing_decisions: [
          {
            segment_id: firstSegment.segment_id,
            route: "atomic_candidate",
            candidate_summary: "Primary response preference",
            memory_likelihood: 0.93,
            durability_likelihood: 0.9,
            composite_likelihood: 0.02,
            reason_codes: ["durable_user_preference"],
            evidence_quote: "Standing preference: start with the outcome first.",
            confidence: 0.95,
            allow_multiple_top_level_atomic: true,
          },
          {
            segment_id: secondSegment.segment_id,
            route: "atomic_candidate",
            candidate_summary: "Secondary response preference",
            memory_likelihood: 0.9,
            durability_likelihood: 0.88,
            composite_likelihood: 0.02,
            reason_codes: ["durable_user_preference"],
            evidence_quote: "Standing preference: use concise headings for status updates.",
            confidence: 0.93,
            allow_multiple_top_level_atomic: true,
          },
        ],
      });
    },
    "mmv2-atomic-extraction-v1": buildAtomicExtractionResult,
    "mmv2-atomic-repair-v1": buildAtomicExtractionResult,
    "mmv2-atomic-evidence-repair-v1": buildAtomicExtractionResult,
    "mmv2-canonicalization-v1": (input) => {
      const payload = readMmV2Payload<{
        raw_event: {
          event_id: string;
          tenant_id: string;
          user_id: string;
        };
        extracted_candidates: Array<{ candidate_id: string; source_segment_id: string }>;
      }>(input);
      const firstCandidate = payload.extracted_candidates[0];
      const secondCandidate = payload.extracted_candidates[1];
      return captureOne({
        schema_version: "canonical_candidates.v1",
        event_id: payload.raw_event.event_id,
        canonical_candidates: [
          buildCanonicalCandidate(
            payload.raw_event,
            firstCandidate.source_segment_id,
            "Standing preference: start with the outcome first.",
            {
              candidate_id: "candidate-valid",
              kind: "claim",
              artifact_type: null,
              canonical_text: "The user prefers outcome-first status updates.",
              search_text: "user prefers outcome first status updates",
              payload: {
                claim_type: "preference_state",
                subject: "status update ordering",
                predicate: "prefers",
                object: "outcome first",
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
          buildCanonicalCandidate(
            payload.raw_event,
            secondCandidate.source_segment_id,
            "Standing preference: use concise headings for status updates.",
            {
              candidate_id: "candidate-bad",
              kind: "claim",
              artifact_type: null,
              canonical_text: "The user prefers concise headings for status updates.",
              search_text: "user prefers concise headings for status updates",
              payload: {
                claim_type: "preference_state",
                subject: "status update headings",
                predicate: "prefers",
                object: "concise headings",
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
    "mmv2-reconciliation-v1": (input) => {
      const payload = readMmV2Payload<{
        event_id: string;
        candidate: { candidate_id: string };
      }>(input);
      return captureOne(
        payload.candidate.candidate_id === "candidate-valid"
          ? {
              schema_version: "reconciliation_decision.v1",
              event_id: payload.event_id,
              candidate_id: payload.candidate.candidate_id,
              decision: "record_as_conflict",
              target_memory_ids: ["missing-conflict-target"],
              merged_canonical_text: null,
              conflict_type: "scope_narrowing",
              supersedes_memory_ids: [],
              rationale: "Deliberately exercise deferred-edge handling for one valid candidate.",
              confidence: 0.77,
            }
          : {
              schema_version: "reconciliation_decision.v1",
              event_id: payload.event_id,
              candidate_id: payload.candidate.candidate_id,
              decision: "insert_new",
              target_memory_ids: [],
              merged_canonical_text: null,
              conflict_type: "none",
              supersedes_memory_ids: [],
              rationale: "Deliberately exercise per-candidate rollback for one failing event.",
              confidence: 0.78,
            },
      );
    },
  });
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
      const recallSpy = vi.spyOn(canonicalRepository, "listExistingMemorySummariesForCapture");

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
          interpreter: createClaimTurnInterpreter({
            evidenceQuote: "Durable workspace project fact",
            canonicalText:
              "The current model-memory clean-soak lane validates direct MMV2 retrieval telemetry.",
            searchText: "model memory clean soak lane validates direct mmv2 retrieval telemetry",
            claimType: "project_fact",
            subject: "model-memory clean-soak lane",
            predicate: "validates",
            object: "direct MMV2 retrieval telemetry",
            projectId: "project-001",
          }),
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
      expect(recallSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "project-001",
          sessionId: "session-project-fact",
          queryText: expect.stringContaining("clean-soak lane"),
        }),
      );
    } finally {
      await database.close();
    }
  });

  it("persists live source authority metadata on durable MMV2 memories", async () => {
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
              "Researcher report artifact. Cited fact: the UI proof soft source marker is VALUE-005. Source ref: https://example.invalid/proof",
            sessionId: "session-soft-source",
            sourceMetadata: {
              sourceAuthority: buildSourceAuthorityMetadata("researcher_report_artifact"),
            },
          },
          modelId: "model-turn-001",
          candidateModelId: "model-turn-001",
          interpreter: createClaimTurnInterpreter({
            evidenceQuote: "the UI proof soft source marker is VALUE-005",
            canonicalText: "The UI proof soft source marker is VALUE-005.",
            searchText: "ui proof soft source marker value 005",
            claimType: "project_fact",
            subject: "UI proof soft source marker",
            predicate: "is",
            object: "VALUE-005",
          }),
        },
      });
      const durable = await canonicalRepository.listDurableMemories();
      const softMemory = durable.find((memory) => memory.canonical_text.includes("VALUE-005"));

      expect(result.writeResults.some((entry) => entry.decision === "write")).toBe(true);
      expect(softMemory?.payload).toMatchObject({
        sourceProfileId: "researcher_report_artifact",
        authorityTier: "cited_soft",
        sourceAuthority: {
          sourceProfileId: "researcher_report_artifact",
          authorityTier: "cited_soft",
        },
      });
      expect(softMemory?.tags).toEqual(
        expect.arrayContaining([
          "source_profile:researcher_report_artifact",
          "authority:cited_soft",
        ]),
      );
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
      const interpreter = createDirectiveTurnInterpreter({
        evidenceQuote:
          "When I ask for validation reports, include skipped validations and the exact reason they were skipped.",
        canonicalText:
          "Include skipped validations and the exact reason they were skipped when asked for validation reports.",
        trigger: "asked for validation reports",
        action: "include skipped validations and the exact reason they were skipped",
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
          interpreter: createPreferenceTurnInterpreter({
            evidenceQuote:
              "Durable correction targeting memory_id=existing-preference-memory: replace PRIOR-PREF with this standing preference: concise outcome first, then detailed evidence, then exact artifact paths and skipped-validation reasons. Please store the correction and supersede the targeted preference if durable.",
            canonicalText:
              "The user prefers concise outcome first, then detailed evidence, then exact artifact paths and skipped-validation reasons.",
            searchText:
              "user prefers concise outcome first detailed evidence exact artifact paths skipped validation reasons",
            object:
              "concise outcome first, then detailed evidence, then exact artifact paths and skipped-validation reasons",
          }),
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

  it("persists an ordinary-turn candidate, defers a failing sibling, and defers a missing conflict edge", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const canonicalRepository = new FailingOrdinaryTurnRepository(
        database.sql,
        new Set(["candidate-bad"]),
      );
      const runtimeRepository = new RuntimeContextRepository(database.sql);
      await canonicalRepository.upsertDurableMemory(buildPreferenceMemory());

      const result = await captureOrdinaryTurnLive({
        canonicalRepository,
        runtimeRepository,
        capture: {
          turn: {
            currentTurnText:
              "Standing preference: start with the outcome first. Standing preference: use concise headings for status updates.",
            sessionId: "session-persistence-isolation",
          },
          modelId: "model-turn-001",
          candidateModelId: "model-turn-001",
          interpreter: createMixedPersistenceIsolationInterpreter(),
        },
      });

      const durable = await canonicalRepository.listDurableMemories();
      const events = await canonicalRepository.listMemoryEvents();
      const persistedDurable = durable.filter((memory) =>
        result.persistenceResult?.durableMemoriesWritten.includes(memory.memory_id),
      );

      expect(persistedDurable).toHaveLength(1);
      expect(persistedDurable[0]?.canonical_text).toBe(
        "Status update ordering prefers outcome first.",
      );
      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toMatchObject({
        deferred_memory_edges: [
          expect.objectContaining({
            edge_id: expect.any(String),
            to_memory_id: "missing-conflict-target",
          }),
        ],
      });
      expect(result.writeResults).toHaveLength(1);
      expect(result.writeResults[0]?.memoryId).toBe(persistedDurable[0]?.memory_id);
      expect(result.persistenceResult?.durableMemoriesWritten).toEqual([
        persistedDurable[0].memory_id,
      ]);
      expect(result.persistenceResult?.memoryEventsWritten).toEqual([events[0].memory_event_id]);
      expect(result.persistenceResult?.deferredCandidates).toEqual([
        expect.objectContaining({
          memory_id: expect.any(String),
          reason: expect.stringContaining("forced event failure for candidate-bad"),
        }),
      ]);
      expect(result.persistenceResult?.deferredEdges).toEqual([
        expect.objectContaining({
          to_memory_id: "missing-conflict-target",
        }),
      ]);
      expect(result.ingestionTelemetry[1]?.candidate_counts).toMatchObject({
        admitted: 1,
        rejected: 1,
      });
      expect(result.ingestionTelemetry[1]?.ids?.memory_ids).toEqual([
        persistedDurable[0].memory_id,
      ]);
    } finally {
      await database.close();
    }
  });
});
