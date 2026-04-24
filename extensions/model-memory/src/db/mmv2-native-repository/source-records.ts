import type {
  ModelMemorySourceRecord,
  ModelMemorySourceWindowRecord,
} from "../../storage-database-contract.ts";
import type { SqlClient } from "../sql-client.ts";
import { decodeSourceRecord, decodeSourceWindowRecord } from "./codecs.ts";

export async function persistSourceRecord(
  sql: SqlClient,
  record: ModelMemorySourceRecord,
): Promise<ModelMemorySourceRecord> {
  const result = await sql.query(
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

export async function persistSourceWindowRecords(
  sql: SqlClient,
  records: ModelMemorySourceWindowRecord[],
): Promise<ModelMemorySourceWindowRecord[]> {
  const persisted: ModelMemorySourceWindowRecord[] = [];
  for (const record of records) {
    const result = await sql.query(
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

export async function listSourceRecords(sql: SqlClient): Promise<ModelMemorySourceRecord[]> {
  const result = await sql.query(
    `SELECT * FROM model_memory.ingest_sources ORDER BY created_at ASC, id ASC`,
  );
  return result.rows.map(decodeSourceRecord);
}

export async function listSourceWindowRecords(
  sql: SqlClient,
  sourceId?: string,
): Promise<ModelMemorySourceWindowRecord[]> {
  const result = sourceId
    ? await sql.query(
        `SELECT * FROM model_memory.ingest_segments WHERE source_id = $1 ORDER BY window_index ASC`,
        [sourceId],
      )
    : await sql.query(
        `SELECT * FROM model_memory.ingest_segments ORDER BY created_at ASC, source_id ASC, window_index ASC`,
      );
  return result.rows.map(decodeSourceWindowRecord);
}
