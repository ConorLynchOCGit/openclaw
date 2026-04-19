import { createHash } from "node:crypto";
import { buildDeterministicUuid } from "../deterministic-uuid.ts";
import type {
  AdmissionDecisionBatch,
  CanonicalCandidateBatch,
  DurableMemoryRecord,
  MemoryEdge,
  MemoryEvent,
  ReconciliationDecision,
} from "./contracts.ts";

export type ShadowMemoryBatch = {
  memoryEvents: MemoryEvent[];
  durableMemories: DurableMemoryRecord[];
  memoryEdges: MemoryEdge[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function hashSearchText(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function recordShadowMemoryBatch(input: {
  eventId: string;
  canonicalBatch: CanonicalCandidateBatch;
  admissionBatch: AdmissionDecisionBatch;
  reconciliationDecisions: ReconciliationDecision[];
}): ShadowMemoryBatch {
  const memoryEvents: MemoryEvent[] = [];
  const durableMemories: DurableMemoryRecord[] = [];
  const memoryEdges: MemoryEdge[] = [];
  const admissionById = new Map(
    input.admissionBatch.decisions.map((decision) => [decision.candidate_id, decision]),
  );
  const reconciliationById = new Map(
    input.reconciliationDecisions.map((decision) => [decision.candidate_id, decision]),
  );

  for (const candidate of input.canonicalBatch.canonical_candidates) {
    const admission = admissionById.get(candidate.candidate_id);
    const reconciliation = reconciliationById.get(candidate.candidate_id);
    if (
      !admission ||
      admission.decision === "reject" ||
      admission.decision === "quarantine" ||
      admission.decision === "embed_only"
    ) {
      memoryEvents.push({
        memory_event_id: buildDeterministicUuid(
          "mmv2-event",
          `${input.eventId}:${candidate.candidate_id}:reject`,
        ),
        schema_version: "memory_event.v1",
        event_type:
          admission?.decision === "quarantine" ? "candidate_quarantined" : "candidate_rejected",
        occurred_at: nowIso(),
        actor: "system",
        source_ingest_event_id: input.eventId,
        candidate_id: candidate.candidate_id,
        memory_id: null,
        target_memory_ids: [],
        payload: { decision: admission?.decision ?? "reject" },
      });
      continue;
    }

    const memoryId = buildDeterministicUuid(
      "mmv2-memory",
      `${candidate.candidate_id}:${hashSearchText(candidate.search_text)}`,
    );
    const record: DurableMemoryRecord = {
      memory_id: memoryId,
      schema_version: "durable_memory.v1",
      status: reconciliation?.decision === "record_as_conflict" ? "conflicted" : "active",
      unit_type: candidate.unit_type === "composite" ? "composite" : "atomic",
      kind: candidate.kind,
      artifact_type: candidate.artifact_type,
      canonical_text: candidate.canonical_text,
      search_text: candidate.search_text,
      scope: candidate.scope,
      payload: candidate.payload,
      validity: candidate.validity,
      confidence: candidate.confidence,
      quality: candidate.quality,
      source_refs: [
        {
          source_ingest_event_id: input.eventId,
          source_type: candidate.source.source_type,
          source_id: candidate.source.source_id,
          speaker: candidate.source.speaker,
          created_at: candidate.source.created_at,
          segment_id: candidate.source.segment_id,
          start_char: candidate.source.start_char,
          end_char: candidate.source.end_char,
          evidence_quote: candidate.source.evidence_quote,
        },
      ],
      lineage: {
        candidate_ids: [candidate.candidate_id],
        derived_from_memory_ids: [],
        supersedes_memory_ids: reconciliation?.supersedes_memory_ids ?? [],
        superseded_by_memory_id: null,
        conflicts_with_memory_ids:
          reconciliation?.decision === "record_as_conflict" ? reconciliation.target_memory_ids : [],
        parent_memory_id: null,
        child_memory_ids: [],
      },
      created_at: nowIso(),
      updated_at: nowIso(),
      last_accessed_at: null,
      access_count: 0,
      tags: [candidate.kind ?? candidate.artifact_type ?? "shadow"],
    };
    durableMemories.push(record);

    memoryEvents.push({
      memory_event_id: buildDeterministicUuid(
        "mmv2-event",
        `${input.eventId}:${candidate.candidate_id}:insert`,
      ),
      schema_version: "memory_event.v1",
      event_type: candidate.unit_type === "composite" ? "artifact_inserted" : "memory_inserted",
      occurred_at: nowIso(),
      actor: "system",
      source_ingest_event_id: input.eventId,
      candidate_id: candidate.candidate_id,
      memory_id: memoryId,
      target_memory_ids: reconciliation?.target_memory_ids ?? [],
      payload: {
        admission_decision: admission.decision,
        reconciliation_decision: reconciliation?.decision ?? "insert_new",
      },
    });

    if (reconciliation?.decision === "supersede_existing") {
      for (const targetId of reconciliation.supersedes_memory_ids) {
        memoryEdges.push({
          edge_id: buildDeterministicUuid("mmv2-edge", `${memoryId}:${targetId}:supersedes`),
          schema_version: "memory_edge.v1",
          from_memory_id: memoryId,
          to_memory_id: targetId,
          edge_type: "supersedes",
          created_at: nowIso(),
          metadata: { candidate_id: candidate.candidate_id },
        });
      }
    }

    if (reconciliation?.decision === "record_as_conflict") {
      for (const targetId of reconciliation.target_memory_ids) {
        memoryEdges.push({
          edge_id: buildDeterministicUuid("mmv2-edge", `${memoryId}:${targetId}:conflicts_with`),
          schema_version: "memory_edge.v1",
          from_memory_id: memoryId,
          to_memory_id: targetId,
          edge_type: "conflicts_with",
          created_at: nowIso(),
          metadata: { candidate_id: candidate.candidate_id },
        });
      }
    }
  }

  return { memoryEvents, durableMemories, memoryEdges };
}
