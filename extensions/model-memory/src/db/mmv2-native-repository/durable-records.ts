import type {
  ExistingMemorySummary,
  MemoryEdge,
  MemoryEvent,
  DurableMemoryRecord,
} from "../../mmv2/contracts.ts";
import { readString } from "../row-codecs.ts";
import type { SqlClient } from "../sql-client.ts";
import {
  buildExistingMemorySummary,
  decodeDurableMemory,
  decodeExistingMemorySummary,
  decodeMemoryEdge,
  decodeMemoryEvent,
} from "./codecs.ts";
import type {
  ListExistingMemorySummariesForCaptureInput,
  MmV2IntegrityAuditReport,
} from "./types.ts";

const RECONCILIATION_RECALL_STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "before",
  "being",
  "from",
  "have",
  "into",
  "should",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "this",
  "through",
  "with",
  "would",
]);

function tokenizeReconciliationRecallQuery(queryText: string | null | undefined): string[] {
  if (!queryText) {
    return [];
  }
  return [
    ...new Set(
      queryText
        .toLocaleLowerCase("en-US")
        .match(/[a-z0-9][a-z0-9_-]{2,}/gu)
        ?.filter((token) => !RECONCILIATION_RECALL_STOP_WORDS.has(token)) ?? [],
    ),
  ].slice(0, 24);
}

export async function getDurableMemoryRecord(
  sql: SqlClient,
  memoryId: string,
): Promise<DurableMemoryRecord | undefined> {
  const result = await sql.query(
    `SELECT * FROM model_memory.durable_memories WHERE memory_id = $1`,
    [memoryId],
  );
  return result.rows[0] ? decodeDurableMemory(result.rows[0]) : undefined;
}

export async function listExistingDurableMemoryIds(
  sql: SqlClient,
  memoryIds: string[],
): Promise<string[]> {
  const uniqueMemoryIds = [...new Set(memoryIds.filter((memoryId) => memoryId.trim()))];
  if (uniqueMemoryIds.length === 0) {
    return [];
  }
  const placeholders = uniqueMemoryIds.map((_, index) => `$${index + 1}`).join(", ");
  const result = await sql.query<{ memory_id: string }>(
    `SELECT memory_id FROM model_memory.durable_memories WHERE memory_id IN (${placeholders})`,
    uniqueMemoryIds,
  );
  return result.rows.map((row) => readString(row.memory_id));
}

export async function upsertDurableMemoryRecord(
  sql: SqlClient,
  record: DurableMemoryRecord,
): Promise<DurableMemoryRecord> {
  const result = await sql.query(
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

export async function upsertDurableMemoryRecords(
  sql: SqlClient,
  records: DurableMemoryRecord[],
): Promise<DurableMemoryRecord[]> {
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
  const result = await sql.query(
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

export async function appendDurableMemorySourceRef(input: {
  sql: SqlClient;
  memoryId: string;
  sourceRef: DurableMemoryRecord["source_refs"][number];
  updatedAt: string;
}): Promise<DurableMemoryRecord | undefined> {
  const record = await getDurableMemoryRecord(input.sql, input.memoryId);
  if (!record) {
    return undefined;
  }
  const alreadyPresent = record.source_refs.some(
    (existing) =>
      existing.source_id === input.sourceRef.source_id &&
      existing.segment_id === input.sourceRef.segment_id &&
      existing.evidence_quote === input.sourceRef.evidence_quote,
  );
  if (alreadyPresent) {
    return record;
  }
  return upsertDurableMemoryRecord(input.sql, {
    ...record,
    source_refs: [...record.source_refs, input.sourceRef],
    updated_at: input.updatedAt,
  });
}

export async function markDurableMemoryRecordStatus(input: {
  sql: SqlClient;
  memoryId: string;
  status: DurableMemoryRecord["status"];
  updatedAt: string;
  supersededByMemoryId?: string | null;
}): Promise<DurableMemoryRecord | undefined> {
  const record = await getDurableMemoryRecord(input.sql, input.memoryId);
  if (!record) {
    return undefined;
  }
  return upsertDurableMemoryRecord(input.sql, {
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

export async function insertMemoryEventRecord(
  sql: SqlClient,
  record: MemoryEvent,
): Promise<MemoryEvent> {
  const result = await sql.query(
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

export async function insertMemoryEventRecords(
  sql: SqlClient,
  records: MemoryEvent[],
): Promise<MemoryEvent[]> {
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
  const result = await sql.query(
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

export async function upsertMemoryEdgeRecord(
  sql: SqlClient,
  record: MemoryEdge,
): Promise<MemoryEdge> {
  const result = await sql.query(
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

export async function upsertMemoryEdgeRecords(
  sql: SqlClient,
  records: MemoryEdge[],
): Promise<MemoryEdge[]> {
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
  const result = await sql.query(
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

export async function listDurableMemoryRecords(sql: SqlClient): Promise<DurableMemoryRecord[]> {
  const result = await sql.query(
    `SELECT * FROM model_memory.durable_memories ORDER BY created_at ASC, memory_id ASC`,
  );
  return result.rows.map(decodeDurableMemory);
}

export async function listMemoryEventRecords(sql: SqlClient): Promise<MemoryEvent[]> {
  const result = await sql.query(
    `SELECT * FROM model_memory.memory_events ORDER BY occurred_at ASC, memory_event_id ASC`,
  );
  return result.rows.map(decodeMemoryEvent);
}

export async function listMemoryEdgeRecords(sql: SqlClient): Promise<MemoryEdge[]> {
  const result = await sql.query(
    `SELECT * FROM model_memory.memory_edges ORDER BY created_at ASC, edge_id ASC`,
  );
  return result.rows.map(decodeMemoryEdge);
}

export async function auditMmV2Integrity(sql: SqlClient): Promise<MmV2IntegrityAuditReport> {
  const memoriesWithoutEvents = await sql.query<{ memory_id: string }>(
    `
      SELECT dm.memory_id
      FROM model_memory.durable_memories dm
      LEFT JOIN model_memory.memory_events me ON me.memory_id = dm.memory_id
      WHERE me.memory_event_id IS NULL
      ORDER BY dm.memory_id ASC
    `,
  );
  const eventsWithoutSourceRefs = await sql.query<{ memory_event_id: string }>(
    `
      SELECT memory_event_id
      FROM model_memory.memory_events
      WHERE source_ingest_event_id IS NULL OR source_ingest_event_id = ''
      ORDER BY memory_event_id ASC
    `,
  );
  const edgesWithoutEndpoints = await sql.query<{ edge_id: string }>(
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
  const activeMemoryStatus = await sql.query<{ memory_id: string; status: string }>(
    `
      SELECT memory_id, status
      FROM model_memory.durable_memories
    `,
  );
  const activeMemoryIdByStatus = new Map(
    activeMemoryStatus.rows.map((row) => [readString(row.memory_id), readString(row.status)]),
  );
  const projectionVersions = await sql.query(
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
  const orphanSourceSegments = await sql.query<{ id: string }>(
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

export async function listExistingMemorySummaries(
  sql: SqlClient,
): Promise<ExistingMemorySummary[]> {
  const records = await listDurableMemoryRecords(sql);
  return records
    .filter((record) => record.status !== "deleted" && record.status !== "superseded")
    .map(buildExistingMemorySummary);
}

export async function listExistingMemorySummariesForCapture(
  sql: SqlClient,
  input: ListExistingMemorySummariesForCaptureInput = {},
): Promise<ExistingMemorySummary[]> {
  const clauses = ["status <> 'deleted'", "status <> 'superseded'"];
  const scopedClauses: string[] = [];
  const params: unknown[] = [];
  const pushParam = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  const buildInList = (column: string, values: string[]): string =>
    `${column} IN (${values.map((value) => pushParam(value)).join(", ")})`;

  if (input.projectId !== undefined && input.projectId !== null) {
    scopedClauses.push(`(project_id IS NULL OR project_id = ${pushParam(input.projectId)})`);
  }
  if (input.workspaceId !== undefined && input.workspaceId !== null) {
    scopedClauses.push(`(workspace_id IS NULL OR workspace_id = ${pushParam(input.workspaceId)})`);
  }
  if (input.kinds && input.kinds.length > 0) {
    scopedClauses.push(buildInList("kind", input.kinds));
  }
  const exactMemoryIds = [
    ...new Set((input.memoryIds ?? []).map((entry) => entry.trim()).filter(Boolean)),
  ];
  if (exactMemoryIds.length > 0 && scopedClauses.length > 0) {
    clauses.push(
      `(${buildInList("memory_id", exactMemoryIds)} OR (${scopedClauses.join(" AND ")}))`,
    );
  } else if (exactMemoryIds.length > 0) {
    clauses.push(buildInList("memory_id", exactMemoryIds));
  } else {
    clauses.push(...scopedClauses);
  }
  const recallTokens = tokenizeReconciliationRecallQuery(input.queryText);
  const lexicalScoreParts = recallTokens.map((token) => {
    const patternParam = pushParam(`%${token}%`);
    return `CASE WHEN lower(search_text || ' ' || canonical_text) LIKE ${patternParam} THEN 1 ELSE 0 END`;
  });
  const lexicalScoreExpression = lexicalScoreParts.length > 0 ? lexicalScoreParts.join(" + ") : "0";

  const limit =
    Number.isInteger(input.limit) && input.limit !== undefined
      ? Math.min(Math.max(input.limit, 1), 1_000)
      : 240;
  params.push(limit);

  const result = await sql.query(
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
        updated_at,
        (${lexicalScoreExpression}) AS lexical_recall_score
      FROM model_memory.durable_memories
      WHERE ${clauses.join(" AND ")}
      ORDER BY
        lexical_recall_score DESC,
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
