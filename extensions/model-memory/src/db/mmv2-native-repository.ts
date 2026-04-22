import type { QueryResultRow } from "pg";
import { partitionMemoryEdgesByKnownEndpoints } from "../ingestion/shared-pipeline.ts";
import type {
  ExistingMemorySummary,
  MemoryEdge,
  MemoryEvent,
  DurableMemoryRecord,
} from "../mmv2/contracts.ts";
import type { ShadowMemoryBatch } from "../mmv2/recording.ts";
import {
  adaptLegacyObjectToDurableMemory,
  buildExistingMemorySummary,
  projectDurableMemoryToLegacyRecord,
  projectDurableMemoryToSupportItems,
  projectMemoryEdgeToSupersessionLink,
  projectMemoryEventToLegacyWriteEvent,
} from "../mmv2/storage-compatibility.ts";
import type { ModelMemoryObject } from "../semantic-schema.ts";
import type {
  ModelMemoryObjectRecord,
  ModelMemorySourceRecord,
  ModelMemorySourceWindowRecord,
  ModelMemorySupportItemRecord,
  ModelMemorySupersessionLinkRecord,
  ModelMemoryWriteEventRecord,
} from "../storage-database-contract.ts";
import { ModelMemoryCanonicalRepository } from "./canonical-repository.ts";
import type { ModelMemoryDbLane } from "./pool-lanes.ts";
import {
  readDate,
  readNumber,
  readObject,
  readObjectArray,
  readOptionalString,
  readString,
  readStringArray,
} from "./row-codecs.ts";
import { withSqlClientLane } from "./sql-client.ts";

export type ListExistingMemorySummariesForCaptureInput = {
  projectId?: string | null;
  workspaceId?: string | null;
  sessionId?: string | null;
  kinds?: string[];
  limit?: number;
};

export type DeferredLiveMemoryCandidate = {
  memory_id: string;
  reason: string;
  failure_class: "db_persistence";
  failure_stage: "persistence_boundary";
};

export type DeferredLiveMemoryEdge = {
  edge_id: string;
  edge_type: MemoryEdge["edge_type"];
  from_memory_id: string;
  to_memory_id: string;
  reason: string;
};

export type LiveMemoryPersistenceTelemetry = {
  rowsAttempted: {
    durableMemories: number;
    memoryEvents: number;
    memoryEdges: number;
  };
  rowsWritten: {
    durableMemories: number;
    memoryEvents: number;
    memoryEdges: number;
  };
  rowsDeferred: {
    candidates: number;
    memoryEdges: number;
  };
  transactionLatencyMs: number;
  operationCount: number;
};

export type LiveMemoryPersistenceResult = {
  durableMemoriesWritten: string[];
  memoryEventsWritten: string[];
  memoryEdgesWritten: string[];
  deferredCandidates: DeferredLiveMemoryCandidate[];
  deferredEdges: DeferredLiveMemoryEdge[];
  telemetry: LiveMemoryPersistenceTelemetry;
};

export type MmV2IntegrityAuditReport = {
  memoriesWithoutEvents: string[];
  eventsWithoutSourceRefs: string[];
  edgesWithoutEndpoints: string[];
  staleProjectionReferences: string[];
  orphanSourceSegments: string[];
};

function decodeSourceRecord(row: QueryResultRow): ModelMemorySourceRecord {
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

function decodeSourceWindowRecord(row: QueryResultRow): ModelMemorySourceWindowRecord {
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

function decodeDurableMemory(row: QueryResultRow): DurableMemoryRecord {
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

function decodeMemoryEvent(row: QueryResultRow): MemoryEvent {
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

function decodeMemoryEdge(row: QueryResultRow): MemoryEdge {
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

function decodeExistingMemorySummary(row: QueryResultRow): ExistingMemorySummary {
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

function toLegacyObject(record: ModelMemoryObjectRecord): ModelMemoryObject {
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

export class MmV2NativeRepository extends ModelMemoryCanonicalRepository {
  withDbLane(lane: ModelMemoryDbLane): MmV2NativeRepository {
    return new MmV2NativeRepository(withSqlClientLane(this.sql, lane));
  }

  withTransaction<T>(work: (repository: MmV2NativeRepository) => Promise<T>): Promise<T> {
    return this.sql.withTransaction((tx) => work(new MmV2NativeRepository(tx)));
  }

  async persistSource(record: ModelMemorySourceRecord): Promise<ModelMemorySourceRecord> {
    const result = await this.sql.query(
      `
        INSERT INTO model_memory.ingest_sources (
          id,
          source_kind,
          external_source_id,
          source_fingerprint,
          project_id,
          session_id,
          source_metadata,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE
        SET
          external_source_id = EXCLUDED.external_source_id,
          project_id = EXCLUDED.project_id,
          session_id = EXCLUDED.session_id,
          source_metadata = EXCLUDED.source_metadata,
          created_at = EXCLUDED.created_at
        RETURNING *
      `,
      [
        record.id,
        record.sourceKind,
        record.externalSourceId ?? null,
        record.sourceFingerprint,
        record.projectId ?? null,
        record.sessionId ?? null,
        JSON.stringify(record.sourceMetadata ?? {}),
        record.createdAt,
      ],
    );
    return decodeSourceRecord(result.rows[0]);
  }

  async persistSourceWindows(
    records: ModelMemorySourceWindowRecord[],
  ): Promise<ModelMemorySourceWindowRecord[]> {
    const persisted: ModelMemorySourceWindowRecord[] = [];
    for (const record of records) {
      const result = await this.sql.query(
        `
          INSERT INTO model_memory.ingest_segments (
            id,
            source_id,
            window_index,
            normalized_text,
            normalized_fingerprint,
            token_estimate,
            heading_path,
            block_descriptors,
            line_start,
            line_end,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE
          SET
            source_id = EXCLUDED.source_id,
            window_index = EXCLUDED.window_index,
            normalized_text = EXCLUDED.normalized_text,
            normalized_fingerprint = EXCLUDED.normalized_fingerprint,
            token_estimate = EXCLUDED.token_estimate,
            heading_path = EXCLUDED.heading_path,
            block_descriptors = EXCLUDED.block_descriptors,
            line_start = EXCLUDED.line_start,
            line_end = EXCLUDED.line_end,
            created_at = EXCLUDED.created_at
          RETURNING *
        `,
        [
          record.id,
          record.sourceId,
          record.windowIndex,
          record.normalizedText,
          record.normalizedFingerprint,
          record.tokenEstimate,
          JSON.stringify(record.headingPath ?? []),
          JSON.stringify(record.blockDescriptors ?? []),
          record.lineStart ?? null,
          record.lineEnd ?? null,
          record.createdAt,
        ],
      );
      persisted.push(decodeSourceWindowRecord(result.rows[0]));
    }
    return persisted;
  }

  async listSources(): Promise<ModelMemorySourceRecord[]> {
    const result = await this.sql.query(
      `SELECT * FROM model_memory.ingest_sources ORDER BY created_at ASC, id ASC`,
    );
    return result.rows.map(decodeSourceRecord);
  }

  async listSourceWindows(sourceId?: string): Promise<ModelMemorySourceWindowRecord[]> {
    const result = sourceId
      ? await this.sql.query(
          `SELECT * FROM model_memory.ingest_segments WHERE source_id = $1 ORDER BY window_index ASC`,
          [sourceId],
        )
      : await this.sql.query(
          `SELECT * FROM model_memory.ingest_segments ORDER BY created_at ASC, source_id ASC, window_index ASC`,
        );
    return result.rows.map(decodeSourceWindowRecord);
  }

  async getDurableMemory(memoryId: string): Promise<DurableMemoryRecord | undefined> {
    const result = await this.sql.query(
      `SELECT * FROM model_memory.durable_memories WHERE memory_id = $1`,
      [memoryId],
    );
    return result.rows[0] ? decodeDurableMemory(result.rows[0]) : undefined;
  }

  async listExistingDurableMemoryIds(memoryIds: string[]): Promise<string[]> {
    const uniqueMemoryIds = [...new Set(memoryIds.filter((memoryId) => memoryId.trim()))];
    if (uniqueMemoryIds.length === 0) {
      return [];
    }
    const placeholders = uniqueMemoryIds.map((_, index) => `$${index + 1}`).join(", ");
    const result = await this.sql.query<{ memory_id: string }>(
      `SELECT memory_id FROM model_memory.durable_memories WHERE memory_id IN (${placeholders})`,
      uniqueMemoryIds,
    );
    return result.rows.map((row) => readString(row.memory_id));
  }

  async upsertDurableMemory(record: DurableMemoryRecord): Promise<DurableMemoryRecord> {
    const result = await this.sql.query(
      `
        INSERT INTO model_memory.durable_memories (
          memory_id,
          schema_version,
          status,
          unit_type,
          kind,
          artifact_type,
          canonical_text,
          search_text,
          tenant_id,
          user_id,
          project_id,
          workspace_id,
          subject_type,
          subject_id,
          applies_to,
          payload,
          validity,
          confidence,
          quality,
          source_refs,
          lineage,
          created_at,
          updated_at,
          last_accessed_at,
          access_count,
          tags
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
        )
        ON CONFLICT (memory_id) DO UPDATE
        SET
          schema_version = EXCLUDED.schema_version,
          status = EXCLUDED.status,
          unit_type = EXCLUDED.unit_type,
          kind = EXCLUDED.kind,
          artifact_type = EXCLUDED.artifact_type,
          canonical_text = EXCLUDED.canonical_text,
          search_text = EXCLUDED.search_text,
          tenant_id = EXCLUDED.tenant_id,
          user_id = EXCLUDED.user_id,
          project_id = EXCLUDED.project_id,
          workspace_id = EXCLUDED.workspace_id,
          subject_type = EXCLUDED.subject_type,
          subject_id = EXCLUDED.subject_id,
          applies_to = EXCLUDED.applies_to,
          payload = EXCLUDED.payload,
          validity = EXCLUDED.validity,
          confidence = EXCLUDED.confidence,
          quality = EXCLUDED.quality,
          source_refs = EXCLUDED.source_refs,
          lineage = EXCLUDED.lineage,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          last_accessed_at = EXCLUDED.last_accessed_at,
          access_count = EXCLUDED.access_count,
          tags = EXCLUDED.tags
        RETURNING *
      `,
      [
        record.memory_id,
        record.schema_version,
        record.status,
        record.unit_type,
        record.kind,
        record.artifact_type,
        record.canonical_text,
        record.search_text,
        record.scope.tenant_id,
        record.scope.user_id,
        record.scope.project_id,
        record.scope.workspace_id,
        record.scope.subject_type,
        record.scope.subject_id,
        record.scope.applies_to,
        JSON.stringify(record.payload),
        JSON.stringify(record.validity),
        record.confidence,
        JSON.stringify(record.quality),
        JSON.stringify(record.source_refs),
        JSON.stringify(record.lineage),
        record.created_at,
        record.updated_at,
        record.last_accessed_at,
        record.access_count,
        JSON.stringify(record.tags),
      ],
    );
    return decodeDurableMemory(result.rows[0]);
  }

  async upsertDurableMemories(records: DurableMemoryRecord[]): Promise<DurableMemoryRecord[]> {
    if (records.length === 0) {
      return [];
    }
    const columnsPerRecord = 26;
    const params = records.flatMap((record) => [
      record.memory_id,
      record.schema_version,
      record.status,
      record.unit_type,
      record.kind,
      record.artifact_type,
      record.canonical_text,
      record.search_text,
      record.scope.tenant_id,
      record.scope.user_id,
      record.scope.project_id,
      record.scope.workspace_id,
      record.scope.subject_type,
      record.scope.subject_id,
      record.scope.applies_to,
      JSON.stringify(record.payload),
      JSON.stringify(record.validity),
      record.confidence,
      JSON.stringify(record.quality),
      JSON.stringify(record.source_refs),
      JSON.stringify(record.lineage),
      record.created_at,
      record.updated_at,
      record.last_accessed_at,
      record.access_count,
      JSON.stringify(record.tags),
    ]);
    const valuesSql = records
      .map((_, rowIndex) => {
        const offset = rowIndex * columnsPerRecord;
        return `(${Array.from({ length: columnsPerRecord }, (_value, columnIndex) => `$${offset + columnIndex + 1}`).join(", ")})`;
      })
      .join(", ");
    const result = await this.sql.query(
      `
        INSERT INTO model_memory.durable_memories (
          memory_id,
          schema_version,
          status,
          unit_type,
          kind,
          artifact_type,
          canonical_text,
          search_text,
          tenant_id,
          user_id,
          project_id,
          workspace_id,
          subject_type,
          subject_id,
          applies_to,
          payload,
          validity,
          confidence,
          quality,
          source_refs,
          lineage,
          created_at,
          updated_at,
          last_accessed_at,
          access_count,
          tags
        )
        VALUES ${valuesSql}
        ON CONFLICT (memory_id) DO UPDATE
        SET
          schema_version = EXCLUDED.schema_version,
          status = EXCLUDED.status,
          unit_type = EXCLUDED.unit_type,
          kind = EXCLUDED.kind,
          artifact_type = EXCLUDED.artifact_type,
          canonical_text = EXCLUDED.canonical_text,
          search_text = EXCLUDED.search_text,
          tenant_id = EXCLUDED.tenant_id,
          user_id = EXCLUDED.user_id,
          project_id = EXCLUDED.project_id,
          workspace_id = EXCLUDED.workspace_id,
          subject_type = EXCLUDED.subject_type,
          subject_id = EXCLUDED.subject_id,
          applies_to = EXCLUDED.applies_to,
          payload = EXCLUDED.payload,
          validity = EXCLUDED.validity,
          confidence = EXCLUDED.confidence,
          quality = EXCLUDED.quality,
          source_refs = EXCLUDED.source_refs,
          lineage = EXCLUDED.lineage,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          last_accessed_at = EXCLUDED.last_accessed_at,
          access_count = EXCLUDED.access_count,
          tags = EXCLUDED.tags
        RETURNING *
      `,
      params,
    );
    return result.rows.map(decodeDurableMemory);
  }

  async appendSourceRef(
    memoryId: string,
    sourceRef: DurableMemoryRecord["source_refs"][number],
    updatedAt: string,
  ): Promise<DurableMemoryRecord | undefined> {
    const record = await this.getDurableMemory(memoryId);
    if (!record) {
      return undefined;
    }
    const alreadyPresent = record.source_refs.some(
      (existing) =>
        existing.source_id === sourceRef.source_id &&
        existing.segment_id === sourceRef.segment_id &&
        existing.evidence_quote === sourceRef.evidence_quote,
    );
    if (alreadyPresent) {
      return record;
    }
    return this.upsertDurableMemory({
      ...record,
      source_refs: [...record.source_refs, sourceRef],
      updated_at: updatedAt,
    });
  }

  async markDurableMemoryStatus(input: {
    memoryId: string;
    status: DurableMemoryRecord["status"];
    updatedAt: string;
    supersededByMemoryId?: string | null;
  }): Promise<DurableMemoryRecord | undefined> {
    const record = await this.getDurableMemory(input.memoryId);
    if (!record) {
      return undefined;
    }
    return this.upsertDurableMemory({
      ...record,
      status: input.status,
      updated_at: input.updatedAt,
      lineage: {
        ...record.lineage,
        superseded_by_memory_id:
          input.supersededByMemoryId === undefined
            ? record.lineage.superseded_by_memory_id
            : input.supersededByMemoryId,
      },
    });
  }

  async insertMemoryEvent(record: MemoryEvent): Promise<MemoryEvent> {
    const result = await this.sql.query(
      `
        INSERT INTO model_memory.memory_events (
          memory_event_id,
          schema_version,
          event_type,
          occurred_at,
          actor,
          source_ingest_event_id,
          candidate_id,
          memory_id,
          target_memory_ids,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (memory_event_id) DO UPDATE
        SET
          schema_version = EXCLUDED.schema_version,
          event_type = EXCLUDED.event_type,
          occurred_at = EXCLUDED.occurred_at,
          actor = EXCLUDED.actor,
          source_ingest_event_id = EXCLUDED.source_ingest_event_id,
          candidate_id = EXCLUDED.candidate_id,
          memory_id = EXCLUDED.memory_id,
          target_memory_ids = EXCLUDED.target_memory_ids,
          payload = EXCLUDED.payload
        RETURNING *
      `,
      [
        record.memory_event_id,
        record.schema_version,
        record.event_type,
        record.occurred_at,
        record.actor,
        record.source_ingest_event_id,
        record.candidate_id,
        record.memory_id,
        JSON.stringify(record.target_memory_ids),
        JSON.stringify(record.payload),
      ],
    );
    return decodeMemoryEvent(result.rows[0]);
  }

  async insertMemoryEvents(records: MemoryEvent[]): Promise<MemoryEvent[]> {
    if (records.length === 0) {
      return [];
    }
    const columnsPerRecord = 10;
    const params = records.flatMap((record) => [
      record.memory_event_id,
      record.schema_version,
      record.event_type,
      record.occurred_at,
      record.actor,
      record.source_ingest_event_id,
      record.candidate_id,
      record.memory_id,
      JSON.stringify(record.target_memory_ids),
      JSON.stringify(record.payload),
    ]);
    const valuesSql = records
      .map((_, rowIndex) => {
        const offset = rowIndex * columnsPerRecord;
        return `(${Array.from({ length: columnsPerRecord }, (_value, columnIndex) => `$${offset + columnIndex + 1}`).join(", ")})`;
      })
      .join(", ");
    const result = await this.sql.query(
      `
        INSERT INTO model_memory.memory_events (
          memory_event_id,
          schema_version,
          event_type,
          occurred_at,
          actor,
          source_ingest_event_id,
          candidate_id,
          memory_id,
          target_memory_ids,
          payload
        )
        VALUES ${valuesSql}
        ON CONFLICT (memory_event_id) DO UPDATE
        SET
          schema_version = EXCLUDED.schema_version,
          event_type = EXCLUDED.event_type,
          occurred_at = EXCLUDED.occurred_at,
          actor = EXCLUDED.actor,
          source_ingest_event_id = EXCLUDED.source_ingest_event_id,
          candidate_id = EXCLUDED.candidate_id,
          memory_id = EXCLUDED.memory_id,
          target_memory_ids = EXCLUDED.target_memory_ids,
          payload = EXCLUDED.payload
        RETURNING *
      `,
      params,
    );
    return result.rows.map(decodeMemoryEvent);
  }

  async upsertMemoryEdge(record: MemoryEdge): Promise<MemoryEdge> {
    const result = await this.sql.query(
      `
        INSERT INTO model_memory.memory_edges (
          edge_id,
          schema_version,
          from_memory_id,
          to_memory_id,
          edge_type,
          created_at,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (edge_id) DO UPDATE
        SET
          schema_version = EXCLUDED.schema_version,
          from_memory_id = EXCLUDED.from_memory_id,
          to_memory_id = EXCLUDED.to_memory_id,
          edge_type = EXCLUDED.edge_type,
          created_at = EXCLUDED.created_at,
          metadata = EXCLUDED.metadata
        RETURNING *
      `,
      [
        record.edge_id,
        record.schema_version,
        record.from_memory_id,
        record.to_memory_id,
        record.edge_type,
        record.created_at,
        JSON.stringify(record.metadata),
      ],
    );
    return decodeMemoryEdge(result.rows[0]);
  }

  async upsertMemoryEdges(records: MemoryEdge[]): Promise<MemoryEdge[]> {
    if (records.length === 0) {
      return [];
    }
    const columnsPerRecord = 7;
    const params = records.flatMap((record) => [
      record.edge_id,
      record.schema_version,
      record.from_memory_id,
      record.to_memory_id,
      record.edge_type,
      record.created_at,
      JSON.stringify(record.metadata),
    ]);
    const valuesSql = records
      .map((_, rowIndex) => {
        const offset = rowIndex * columnsPerRecord;
        return `(${Array.from({ length: columnsPerRecord }, (_value, columnIndex) => `$${offset + columnIndex + 1}`).join(", ")})`;
      })
      .join(", ");
    const result = await this.sql.query(
      `
        INSERT INTO model_memory.memory_edges (
          edge_id,
          schema_version,
          from_memory_id,
          to_memory_id,
          edge_type,
          created_at,
          metadata
        )
        VALUES ${valuesSql}
        ON CONFLICT (edge_id) DO UPDATE
        SET
          schema_version = EXCLUDED.schema_version,
          from_memory_id = EXCLUDED.from_memory_id,
          to_memory_id = EXCLUDED.to_memory_id,
          edge_type = EXCLUDED.edge_type,
          created_at = EXCLUDED.created_at,
          metadata = EXCLUDED.metadata
        RETURNING *
      `,
      params,
    );
    return result.rows.map(decodeMemoryEdge);
  }

  private async withSavepoint<T>(name: string, work: () => Promise<T>): Promise<T> {
    try {
      await this.sql.query(`SAVEPOINT ${name}`);
    } catch {
      // pg-mem does not implement SAVEPOINT. Production Postgres does, so the
      // live path still gets rollback isolation while tests keep exercising
      // the same per-record fallback behavior.
      return work();
    }
    try {
      const result = await work();
      await this.sql.query(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (error) {
      await this.sql.query(`ROLLBACK TO SAVEPOINT ${name}`);
      await this.sql.query(`RELEASE SAVEPOINT ${name}`);
      throw error;
    }
  }

  private async batchWithPerRecordFallback<TRecord, TResult>(input: {
    savepointPrefix: string;
    records: TRecord[];
    getId: (record: TRecord) => string;
    batch: (records: TRecord[]) => Promise<TResult[]>;
    single: (record: TRecord) => Promise<TResult>;
    defer: (record: TRecord, error: unknown) => void;
  }): Promise<TResult[]> {
    if (input.records.length === 0) {
      return [];
    }
    try {
      return await this.withSavepoint(`${input.savepointPrefix}_batch`, () =>
        input.batch(input.records),
      );
    } catch {
      const persisted: TResult[] = [];
      for (const [index, record] of input.records.entries()) {
        try {
          persisted.push(
            await this.withSavepoint(`${input.savepointPrefix}_${index}`, () =>
              input.single(record),
            ),
          );
        } catch (error) {
          input.defer(record, error);
        }
      }
      return persisted;
    }
  }

  async persistLiveMemoryBatch(batch: ShadowMemoryBatch): Promise<LiveMemoryPersistenceResult> {
    const startedAt = Date.now();
    let operationCount = 0;
    const eventMemoryIds = new Set(
      batch.memoryEvents
        .map((event) => event.memory_id)
        .filter((memoryId): memoryId is string => Boolean(memoryId)),
    );
    const deferredCandidates: DeferredLiveMemoryCandidate[] = [];
    const durableMemories = batch.durableMemories.filter((memory) => {
      if (eventMemoryIds.has(memory.memory_id)) {
        return true;
      }
      deferredCandidates.push({
        memory_id: memory.memory_id,
        reason: "durable memory candidate has no event evidence",
        failure_class: "db_persistence",
        failure_stage: "persistence_boundary",
      });
      return false;
    });
    const deferredCandidateIds = new Set(
      deferredCandidates.map((candidate) => candidate.memory_id),
    );
    const memoryEvents = batch.memoryEvents.filter(
      (event) => !event.memory_id || !deferredCandidateIds.has(event.memory_id),
    );
    const writtenMemoryIds: string[] = [];
    const writtenEventIds: string[] = [];
    const writtenEdgeIds: string[] = [];
    const deferredEdgesReport: DeferredLiveMemoryEdge[] = [];

    await this.withTransaction(async (repository) => {
      const persistedMemories = await repository.batchWithPerRecordFallback({
        savepointPrefix: "durable_memory",
        records: durableMemories,
        getId: (record) => record.memory_id,
        batch: async (records) => {
          operationCount += 1;
          return repository.upsertDurableMemories(records);
        },
        single: async (record) => {
          operationCount += 1;
          return repository.upsertDurableMemory(record);
        },
        defer: (record, error) => {
          deferredCandidates.push({
            memory_id: record.memory_id,
            reason: error instanceof Error ? error.message : String(error),
            failure_class: "db_persistence",
            failure_stage: "persistence_boundary",
          });
        },
      });
      writtenMemoryIds.push(...persistedMemories.map((memory) => memory.memory_id));

      const knownMemoryIds = new Set(writtenMemoryIds);
      const endpointIds = batch.memoryEdges.flatMap((edge) => [
        edge.from_memory_id,
        edge.to_memory_id,
      ]);
      operationCount += 1;
      for (const memoryId of await repository.listExistingDurableMemoryIds(
        endpointIds.filter((endpointId) => !knownMemoryIds.has(endpointId)),
      )) {
        knownMemoryIds.add(memoryId);
      }

      const { validEdges, deferredEdges } = partitionMemoryEdgesByKnownEndpoints({
        edges: batch.memoryEdges,
        knownMemoryIds,
      });

      deferredEdgesReport.push(
        ...deferredEdges.map((entry) => ({
          edge_id: entry.edge.edge_id,
          edge_type: entry.edge.edge_type,
          from_memory_id: entry.edge.from_memory_id,
          to_memory_id: entry.edge.to_memory_id,
          reason: entry.reason,
        })),
      );

      const persistedEdges = await repository.batchWithPerRecordFallback({
        savepointPrefix: "memory_edge",
        records: validEdges,
        getId: (record) => record.edge_id,
        batch: async (records) => {
          operationCount += 1;
          return repository.upsertMemoryEdges(records);
        },
        single: async (record) => {
          operationCount += 1;
          return repository.upsertMemoryEdge(record);
        },
        defer: (record, error) => {
          deferredEdgesReport.push({
            edge_id: record.edge_id,
            edge_type: record.edge_type,
            from_memory_id: record.from_memory_id,
            to_memory_id: record.to_memory_id,
            reason: error instanceof Error ? error.message : String(error),
          });
        },
      });
      writtenEdgeIds.push(...persistedEdges.map((edge) => edge.edge_id));

      for (const edge of persistedEdges.filter((edge) => edge.edge_type === "supersedes")) {
        operationCount += 1;
        await repository.markDurableMemoryStatus({
          memoryId: edge.to_memory_id,
          status: "superseded",
          updatedAt: edge.created_at,
          supersededByMemoryId: edge.from_memory_id,
        });
      }

      const eventsWithDeferredReports = memoryEvents.map((event) => {
        const deferredEdgesForMemory = deferredEdgesReport.filter(
          (entry) => entry.from_memory_id === event.memory_id,
        );
        const deferredCandidatesForMemory = deferredCandidates.filter(
          (entry) => entry.memory_id === event.memory_id,
        );
        return deferredEdgesForMemory.length > 0 || deferredCandidatesForMemory.length > 0
          ? {
              ...event,
              payload: {
                ...event.payload,
                ...(deferredEdgesForMemory.length > 0
                  ? { deferred_memory_edges: deferredEdgesForMemory }
                  : {}),
                ...(deferredCandidatesForMemory.length > 0
                  ? { deferred_memory_candidates: deferredCandidatesForMemory }
                  : {}),
              },
            }
          : event;
      });
      const persistedEvents = await repository.batchWithPerRecordFallback({
        savepointPrefix: "memory_event",
        records: eventsWithDeferredReports,
        getId: (record) => record.memory_event_id,
        batch: async (records) => {
          operationCount += 1;
          return repository.insertMemoryEvents(records);
        },
        single: async (record) => {
          operationCount += 1;
          return repository.insertMemoryEvent(record);
        },
        defer: (record, error) => {
          if (record.memory_id) {
            deferredCandidates.push({
              memory_id: record.memory_id,
              reason: error instanceof Error ? error.message : String(error),
              failure_class: "db_persistence",
              failure_stage: "persistence_boundary",
            });
          }
        },
      });
      writtenEventIds.push(...persistedEvents.map((event) => event.memory_event_id));
    });

    return {
      durableMemoriesWritten: writtenMemoryIds,
      memoryEventsWritten: writtenEventIds,
      memoryEdgesWritten: writtenEdgeIds,
      deferredCandidates,
      deferredEdges: deferredEdgesReport,
      telemetry: {
        rowsAttempted: {
          durableMemories: batch.durableMemories.length,
          memoryEvents: batch.memoryEvents.length,
          memoryEdges: batch.memoryEdges.length,
        },
        rowsWritten: {
          durableMemories: writtenMemoryIds.length,
          memoryEvents: writtenEventIds.length,
          memoryEdges: writtenEdgeIds.length,
        },
        rowsDeferred: {
          candidates: deferredCandidates.length,
          memoryEdges: deferredEdgesReport.length,
        },
        transactionLatencyMs: Date.now() - startedAt,
        operationCount,
      },
    };
  }

  async listDurableMemories(): Promise<DurableMemoryRecord[]> {
    const result = await this.sql.query(
      `SELECT * FROM model_memory.durable_memories ORDER BY created_at ASC, memory_id ASC`,
    );
    return result.rows.map(decodeDurableMemory);
  }

  async listMemoryEvents(): Promise<MemoryEvent[]> {
    const result = await this.sql.query(
      `SELECT * FROM model_memory.memory_events ORDER BY occurred_at ASC, memory_event_id ASC`,
    );
    return result.rows.map(decodeMemoryEvent);
  }

  async listMemoryEdges(): Promise<MemoryEdge[]> {
    const result = await this.sql.query(
      `SELECT * FROM model_memory.memory_edges ORDER BY created_at ASC, edge_id ASC`,
    );
    return result.rows.map(decodeMemoryEdge);
  }

  async auditIntegrity(): Promise<MmV2IntegrityAuditReport> {
    const memoriesWithoutEvents = await this.sql.query<{ memory_id: string }>(
      `
        SELECT dm.memory_id
        FROM model_memory.durable_memories dm
        LEFT JOIN model_memory.memory_events me ON me.memory_id = dm.memory_id
        WHERE me.memory_event_id IS NULL
        ORDER BY dm.memory_id ASC
      `,
    );
    const eventsWithoutSourceRefs = await this.sql.query<{ memory_event_id: string }>(
      `
        SELECT memory_event_id
        FROM model_memory.memory_events
        WHERE source_ingest_event_id IS NULL OR source_ingest_event_id = ''
        ORDER BY memory_event_id ASC
      `,
    );
    const edgesWithoutEndpoints = await this.sql.query<{ edge_id: string }>(
      `
        SELECT edge.edge_id
        FROM model_memory.memory_edges edge
        LEFT JOIN model_memory.durable_memories from_memory
          ON from_memory.memory_id = edge.from_memory_id
        LEFT JOIN model_memory.durable_memories to_memory
          ON to_memory.memory_id = edge.to_memory_id
        WHERE from_memory.memory_id IS NULL OR to_memory.memory_id IS NULL
        ORDER BY edge.edge_id ASC
      `,
    );
    const activeMemoryStatus = await this.sql.query<{ memory_id: string; status: string }>(
      `
        SELECT memory_id, status
        FROM model_memory.durable_memories
      `,
    );
    const activeMemoryIdByStatus = new Map(
      activeMemoryStatus.rows.map((row) => [readString(row.memory_id), readString(row.status)]),
    );
    const projectionVersions = await this.sql.query(
      `
        SELECT *
        FROM runtime_context.workspace_projection_versions
        ORDER BY built_at ASC, id ASC
      `,
    );
    const staleProjectionReferences = projectionVersions.rows
      .filter((row) => {
        const sourceObjectIds = Array.isArray(row.source_object_ids) ? row.source_object_ids : [];
        return sourceObjectIds.some((sourceObjectId) => {
          const status = activeMemoryIdByStatus.get(readString(sourceObjectId));
          return status !== "active";
        });
      })
      .map((row) => readString(row.id ?? row.target_id));
    const orphanSourceSegments = await this.sql.query<{ id: string }>(
      `
        SELECT segment.id
        FROM model_memory.ingest_segments segment
        LEFT JOIN model_memory.ingest_sources source ON source.id = segment.source_id
        WHERE source.id IS NULL
        ORDER BY segment.id ASC
      `,
    );
    return {
      memoriesWithoutEvents: memoriesWithoutEvents.rows.map((row) => readString(row.memory_id)),
      eventsWithoutSourceRefs: eventsWithoutSourceRefs.rows.map((row) =>
        readString(row.memory_event_id),
      ),
      edgesWithoutEndpoints: edgesWithoutEndpoints.rows.map((row) => readString(row.edge_id)),
      staleProjectionReferences,
      orphanSourceSegments: orphanSourceSegments.rows.map((row) => readString(row.id)),
    };
  }

  async listExistingMemorySummaries(): Promise<ExistingMemorySummary[]> {
    const records = await this.listDurableMemories();
    return records
      .filter((record) => record.status !== "deleted" && record.status !== "superseded")
      .map(buildExistingMemorySummary);
  }

  async listExistingMemorySummariesForCapture(
    input: ListExistingMemorySummariesForCaptureInput = {},
  ): Promise<ExistingMemorySummary[]> {
    const clauses = ["status <> 'deleted'", "status <> 'superseded'"];
    const params: unknown[] = [];
    const pushParam = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    if (input.projectId !== undefined && input.projectId !== null) {
      clauses.push(`(project_id IS NULL OR project_id = ${pushParam(input.projectId)})`);
    }
    if (input.workspaceId !== undefined && input.workspaceId !== null) {
      clauses.push(`(workspace_id IS NULL OR workspace_id = ${pushParam(input.workspaceId)})`);
    }
    if (input.kinds && input.kinds.length > 0) {
      clauses.push(`kind = ANY(${pushParam(input.kinds)}::text[])`);
    }

    const limit =
      Number.isInteger(input.limit) && input.limit !== undefined
        ? Math.min(Math.max(input.limit, 1), 1_000)
        : 240;
    params.push(limit);

    const result = await this.sql.query(
      `
        SELECT
          memory_id,
          unit_type,
          kind,
          artifact_type,
          canonical_text,
          tenant_id,
          user_id,
          project_id,
          workspace_id,
          subject_type,
          subject_id,
          applies_to,
          payload,
          validity,
          confidence,
          created_at,
          updated_at
        FROM model_memory.durable_memories
        WHERE ${clauses.join(" AND ")}
        ORDER BY
          CASE WHEN project_id IS NOT NULL THEN 0 ELSE 1 END ASC,
          updated_at DESC,
          created_at DESC,
          memory_id ASC
        LIMIT $${params.length}
      `,
      params,
    );
    return result.rows.map(decodeExistingMemorySummary);
  }

  async findActiveMemoryObjectByIdentity(
    identityKey: string,
  ): Promise<ModelMemoryObjectRecord | undefined> {
    const memoryObjects = await this.listMemoryObjects();
    return memoryObjects.find(
      (record) =>
        record.identityKey === identityKey &&
        record.lifecycleState === "active" &&
        !record.supersededAt,
    );
  }

  async findActiveMemoryObjectBySlot(
    slotKey: string,
  ): Promise<ModelMemoryObjectRecord | undefined> {
    const memoryObjects = await this.listMemoryObjects();
    return memoryObjects.find(
      (record) =>
        record.slotKey === slotKey && record.lifecycleState === "active" && !record.supersededAt,
    );
  }

  async insertMemoryObject(record: ModelMemoryObjectRecord): Promise<ModelMemoryObjectRecord> {
    const createdAt = record.createdAt ?? new Date();
    await this.upsertDurableMemory(
      adaptLegacyObjectToDurableMemory({
        memoryId: record.id,
        object: toLegacyObject(record),
        sourceWindowId: record.sourceWindowId ?? record.id,
        sourceKind: "document",
        createdAt,
        status:
          record.lifecycleState === "superseded"
            ? "superseded"
            : record.lifecycleState === "conflict_hold"
              ? "conflicted"
              : record.lifecycleState === "expired"
                ? "deleted"
                : record.lifecycleState === "provisional"
                  ? "inactive"
                  : "active",
      }),
    );
    return (await this.listMemoryObjects()).find((entry) => entry.id === record.id)!;
  }

  async insertSupportItem(
    record: ModelMemorySupportItemRecord,
  ): Promise<ModelMemorySupportItemRecord> {
    const durable = await this.getDurableMemory(record.memoryObjectId);
    if (!durable) {
      throw new Error(`Cannot attach support to missing durable memory ${record.memoryObjectId}`);
    }
    await this.appendSourceRef(
      record.memoryObjectId,
      {
        source_ingest_event_id: record.sourceWindowId,
        source_type: record.derivedFromSourceKind,
        source_id: record.sourceWindowId,
        speaker: "unknown",
        created_at: record.createdAt.toISOString(),
        segment_id: record.sourceWindowId,
        start_char: 0,
        end_char: 0,
        evidence_quote: durable.canonical_text,
      },
      record.createdAt.toISOString(),
    );
    return record;
  }

  async markMemoryObjectSuperseded(id: string, supersededAt: Date): Promise<void> {
    await this.markDurableMemoryStatus({
      memoryId: id,
      status: "superseded",
      updatedAt: supersededAt.toISOString(),
    });
  }

  async activateMemoryObject(
    id: string,
    activatedAt: Date,
    _activationBasis: string,
  ): Promise<void> {
    await this.markDurableMemoryStatus({
      memoryId: id,
      status: "active",
      updatedAt: activatedAt.toISOString(),
    });
  }

  async expireProvisionalMemoryObjects(expiredAt: Date, olderThan: Date): Promise<void> {
    const records = await this.listDurableMemories();
    await Promise.all(
      records
        .filter(
          (record) =>
            record.status === "inactive" &&
            new Date(record.created_at).getTime() < olderThan.getTime(),
        )
        .map((record) =>
          this.markDurableMemoryStatus({
            memoryId: record.memory_id,
            status: "deleted",
            updatedAt: expiredAt.toISOString(),
          }),
        ),
    );
  }

  async insertWriteEvent(
    record: ModelMemoryWriteEventRecord,
  ): Promise<ModelMemoryWriteEventRecord> {
    const eventType =
      record.decision === "supersede"
        ? "memory_superseded"
        : record.decision === "attach_support"
          ? "memory_merged"
          : record.decision === "quarantine"
            ? "candidate_quarantined"
            : record.decision === "reject"
              ? "candidate_rejected"
              : "memory_inserted";
    await this.insertMemoryEvent({
      memory_event_id: record.id,
      schema_version: "memory_event.v1",
      event_type: eventType,
      occurred_at: record.createdAt.toISOString(),
      actor: "system",
      source_ingest_event_id: record.sourceWindowId,
      candidate_id: record.candidateIdentityKey ?? null,
      memory_id: record.memoryObjectId ?? null,
      target_memory_ids: record.supersededObjectId ? [record.supersededObjectId] : [],
      payload: {
        decision_codes: record.decisionCodes,
        contract_name: record.contractName,
        contract_version: record.contractVersion,
        model_id: record.modelId,
      },
    });
    return record;
  }

  async insertSupersessionLink(
    record: ModelMemorySupersessionLinkRecord,
  ): Promise<ModelMemorySupersessionLinkRecord> {
    await this.upsertMemoryEdge({
      edge_id: record.id,
      schema_version: "memory_edge.v1",
      from_memory_id: record.replacementObjectId,
      to_memory_id: record.priorObjectId,
      edge_type: "supersedes",
      created_at: record.createdAt.toISOString(),
      metadata: { reason_code: record.reasonCode },
    });
    return record;
  }

  async listMemoryObjects(): Promise<ModelMemoryObjectRecord[]> {
    const records = await this.listDurableMemories();
    return records.map(projectDurableMemoryToLegacyRecord);
  }

  async listSupportItems(): Promise<ModelMemorySupportItemRecord[]> {
    const records = await this.listDurableMemories();
    return records.flatMap(projectDurableMemoryToSupportItems);
  }

  async listSupportItemsForMemoryObject(
    memoryObjectId: string,
  ): Promise<ModelMemorySupportItemRecord[]> {
    const supportItems = await this.listSupportItems();
    return supportItems.filter((record) => record.memoryObjectId === memoryObjectId);
  }

  async listWriteEvents(): Promise<ModelMemoryWriteEventRecord[]> {
    const events = await this.listMemoryEvents();
    return events.map(projectMemoryEventToLegacyWriteEvent);
  }

  async listSupersessionLinks(): Promise<ModelMemorySupersessionLinkRecord[]> {
    const edges = await this.listMemoryEdges();
    return edges
      .map(projectMemoryEdgeToSupersessionLink)
      .filter((entry): entry is ModelMemorySupersessionLinkRecord => Boolean(entry));
  }

  async snapshot() {
    return {
      sources: await this.listSources(),
      sourceWindows: await this.listSourceWindows(),
      memoryObjects: await this.listMemoryObjects(),
      supportItems: await this.listSupportItems(),
      writeEvents: await this.listWriteEvents(),
      supersessionLinks: await this.listSupersessionLinks(),
      durableMemories: await this.listDurableMemories(),
      memoryEvents: await this.listMemoryEvents(),
      memoryEdges: await this.listMemoryEdges(),
    };
  }
}
