import type { QueryResultRow } from "pg";
import type {
  ExistingMemorySummary,
  MemoryEdge,
  MemoryEvent,
  DurableMemoryRecord,
} from "../../mmv2/contracts.ts";
import {
  buildExistingMemorySummary,
  projectDurableMemoryToLegacyRecord,
  projectDurableMemoryToSupportItems,
  projectMemoryEdgeToSupersessionLink,
  projectMemoryEventToLegacyWriteEvent,
} from "../../mmv2/storage-compatibility.ts";
import type { ModelMemoryObject } from "../../semantic-schema.ts";
import type {
  ModelMemoryObjectRecord,
  ModelMemorySourceRecord,
  ModelMemorySourceWindowRecord,
} from "../../storage-database-contract.ts";
import {
  readDate,
  readNumber,
  readObject,
  readObjectArray,
  readOptionalString,
  readString,
  readStringArray,
} from "../row-codecs.ts";

export function decodeSourceRecord(row: QueryResultRow): ModelMemorySourceRecord {
  return {
    id: readString(row.id),
    sourceKind: readString(row.source_kind) as ModelMemorySourceRecord["sourceKind"],
    externalSourceId: readOptionalString(row.external_source_id),
    sourceFingerprint: readString(row.source_fingerprint),
    projectId: readOptionalString(row.project_id),
    sessionId: readOptionalString(row.session_id),
    sourceMetadata: readObject(row.source_metadata),
    createdAt: readDate(row.created_at),
  };
}

export function decodeSourceWindowRecord(row: QueryResultRow): ModelMemorySourceWindowRecord {
  return {
    id: readString(row.id),
    sourceId: readString(row.source_id),
    windowIndex: readNumber(row.window_index),
    normalizedText: readString(row.normalized_text),
    normalizedFingerprint: readString(row.normalized_fingerprint),
    tokenEstimate: readNumber(row.token_estimate),
    headingPath: readStringArray(row.heading_path),
    blockDescriptors: readObjectArray(row.block_descriptors),
    lineStart:
      row.line_start === null || row.line_start === undefined
        ? undefined
        : readNumber(row.line_start),
    lineEnd:
      row.line_end === null || row.line_end === undefined ? undefined : readNumber(row.line_end),
    createdAt: readDate(row.created_at),
  };
}

export function decodeDurableMemory(row: QueryResultRow): DurableMemoryRecord {
  return {
    memory_id: readString(row.memory_id),
    schema_version: readString(row.schema_version) as DurableMemoryRecord["schema_version"],
    status: readString(row.status) as DurableMemoryRecord["status"],
    unit_type: readString(row.unit_type) as DurableMemoryRecord["unit_type"],
    kind: readOptionalString(row.kind) ?? null,
    artifact_type: readOptionalString(row.artifact_type) ?? null,
    canonical_text: readString(row.canonical_text),
    search_text: readString(row.search_text),
    scope: {
      tenant_id: readString(row.tenant_id),
      user_id: readString(row.user_id),
      project_id: readOptionalString(row.project_id) ?? null,
      workspace_id: readOptionalString(row.workspace_id) ?? null,
      subject_type: readString(row.subject_type),
      subject_id: readOptionalString(row.subject_id) ?? null,
      applies_to: readString(row.applies_to),
    },
    payload: readObject(row.payload),
    validity: readObject(row.validity) as DurableMemoryRecord["validity"],
    confidence: readNumber(row.confidence),
    quality: readObject(row.quality) as DurableMemoryRecord["quality"],
    source_refs: (Array.isArray(row.source_refs)
      ? row.source_refs
      : JSON.parse(String(row.source_refs ?? "[]"))) as DurableMemoryRecord["source_refs"],
    lineage: readObject(row.lineage) as DurableMemoryRecord["lineage"],
    created_at: readDate(row.created_at).toISOString(),
    updated_at: readDate(row.updated_at).toISOString(),
    last_accessed_at:
      row.last_accessed_at === null || row.last_accessed_at === undefined
        ? null
        : readDate(row.last_accessed_at).toISOString(),
    access_count: readNumber(row.access_count),
    tags: readStringArray(row.tags),
  };
}

export function decodeMemoryEvent(row: QueryResultRow): MemoryEvent {
  return {
    memory_event_id: readString(row.memory_event_id),
    schema_version: readString(row.schema_version) as MemoryEvent["schema_version"],
    event_type: readString(row.event_type) as MemoryEvent["event_type"],
    occurred_at: readDate(row.occurred_at).toISOString(),
    actor: readString(row.actor) as MemoryEvent["actor"],
    source_ingest_event_id: readString(row.source_ingest_event_id),
    candidate_id: readOptionalString(row.candidate_id) ?? null,
    memory_id: readOptionalString(row.memory_id) ?? null,
    target_memory_ids: readStringArray(row.target_memory_ids),
    payload: readObject(row.payload),
  };
}

export function decodeMemoryEdge(row: QueryResultRow): MemoryEdge {
  return {
    edge_id: readString(row.edge_id),
    schema_version: readString(row.schema_version) as MemoryEdge["schema_version"],
    from_memory_id: readString(row.from_memory_id),
    to_memory_id: readString(row.to_memory_id),
    edge_type: readString(row.edge_type) as MemoryEdge["edge_type"],
    created_at: readDate(row.created_at).toISOString(),
    metadata: readObject(row.metadata),
  };
}

export function decodeExistingMemorySummary(row: QueryResultRow): ExistingMemorySummary {
  return {
    memory_id: readString(row.memory_id),
    unit_type: readString(row.unit_type),
    kind: readOptionalString(row.kind) ?? null,
    artifact_type: readOptionalString(row.artifact_type) ?? null,
    canonical_text: readString(row.canonical_text),
    scope: {
      tenant_id: readString(row.tenant_id),
      user_id: readString(row.user_id),
      project_id: readOptionalString(row.project_id) ?? null,
      workspace_id: readOptionalString(row.workspace_id) ?? null,
      subject_type: readString(row.subject_type),
      subject_id: readOptionalString(row.subject_id) ?? null,
      applies_to: readString(row.applies_to),
    },
    payload: readObject(row.payload),
    validity: readObject(row.validity),
    confidence: readNumber(row.confidence),
    created_at: readDate(row.created_at).toISOString(),
    updated_at: readDate(row.updated_at).toISOString(),
  };
}

export function toLegacyObject(record: ModelMemoryObjectRecord): ModelMemoryObject {
  return {
    canonicalClass: record.canonicalClass as ModelMemoryObject["canonicalClass"],
    kind: record.kind as ModelMemoryObject["kind"],
    payload: record.payload as ModelMemoryObject["payload"],
    scope: Object.keys(record.scope ?? {}).length > 0 ? record.scope : undefined,
    provenance: (record.provenance ?? []) as ModelMemoryObject["provenance"],
    confidence: record.confidence as ModelMemoryObject["confidence"],
    durability: record.durability as ModelMemoryObject["durability"],
    reviewMode: record.executedReviewMode as ModelMemoryObject["reviewMode"],
    rationaleCodes: record.rationaleCodes as ModelMemoryObject["rationaleCodes"],
  } as ModelMemoryObject;
}

export {
  buildExistingMemorySummary,
  projectDurableMemoryToLegacyRecord,
  projectDurableMemoryToSupportItems,
  projectMemoryEdgeToSupersessionLink,
  projectMemoryEventToLegacyWriteEvent,
};
