import type { QueryResultRow } from "pg";
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
import {
  readDate,
  readNumber,
  readObject,
  readObjectArray,
  readOptionalString,
  readString,
  readStringArray,
} from "./row-codecs.ts";

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

  async persistLiveMemoryBatch(batch: ShadowMemoryBatch): Promise<void> {
    const eventMemoryIds = new Set(
      batch.memoryEvents
        .map((event) => event.memory_id)
        .filter((memoryId): memoryId is string => Boolean(memoryId)),
    );
    const durableMemoriesWithoutEvents = batch.durableMemories.filter(
      (memory) => !eventMemoryIds.has(memory.memory_id),
    );
    if (durableMemoriesWithoutEvents.length > 0) {
      throw new Error(
        `MMV2 live batch refused to persist durable memories without event evidence: ${durableMemoriesWithoutEvents
          .map((memory) => memory.memory_id)
          .join(", ")}`,
      );
    }

    await this.withTransaction(async (repository) => {
      for (const durableMemory of batch.durableMemories) {
        await repository.upsertDurableMemory(durableMemory);
      }

      const knownMemoryIds = new Set(batch.durableMemories.map((memory) => memory.memory_id));
      const deferredEdges: Array<{ edge: MemoryEdge; reason: string }> = [];
      const validEdges: MemoryEdge[] = [];
      for (const edge of batch.memoryEdges) {
        const endpointIds = [edge.from_memory_id, edge.to_memory_id];
        for (const endpointId of endpointIds) {
          if (!knownMemoryIds.has(endpointId) && (await repository.getDurableMemory(endpointId))) {
            knownMemoryIds.add(endpointId);
          }
        }

        const missingEndpointIds = endpointIds.filter(
          (endpointId) => !knownMemoryIds.has(endpointId),
        );
        if (missingEndpointIds.length > 0) {
          deferredEdges.push({
            edge,
            reason: `missing endpoint memory id(s): ${missingEndpointIds.join(", ")}`,
          });
          continue;
        }
        validEdges.push(edge);
      }

      for (const edge of validEdges) {
        await repository.upsertMemoryEdge(edge);
        if (edge.edge_type === "supersedes") {
          await repository.markDurableMemoryStatus({
            memoryId: edge.to_memory_id,
            status: "superseded",
            updatedAt: edge.created_at,
            supersededByMemoryId: edge.from_memory_id,
          });
        }
      }

      for (const event of batch.memoryEvents) {
        const deferredEdgesForMemory = deferredEdges.filter(
          (entry) => entry.edge.from_memory_id === event.memory_id,
        );
        await repository.insertMemoryEvent(
          deferredEdgesForMemory.length > 0
            ? {
                ...event,
                payload: {
                  ...event.payload,
                  deferred_memory_edges: deferredEdgesForMemory.map((entry) => ({
                    edge_id: entry.edge.edge_id,
                    edge_type: entry.edge.edge_type,
                    from_memory_id: entry.edge.from_memory_id,
                    to_memory_id: entry.edge.to_memory_id,
                    reason: entry.reason,
                  })),
                },
              }
            : event,
        );
      }
    });
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

  async listExistingMemorySummaries(): Promise<ExistingMemorySummary[]> {
    const records = await this.listDurableMemories();
    return records
      .filter((record) => record.status !== "deleted" && record.status !== "superseded")
      .map(buildExistingMemorySummary);
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
