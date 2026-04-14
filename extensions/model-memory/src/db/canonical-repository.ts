import type { QueryResultRow } from "pg";
import type {
  ModelMemoryObjectRecord,
  ModelMemorySourceRecord,
  ModelMemorySourceWindowRecord,
  ModelMemorySupersessionLinkRecord,
  ModelMemoryWriteEventRecord,
} from "../storage-database-contract.ts";
import {
  readDate,
  readObject,
  readObjectArray,
  readOptionalString,
  readString,
  readStringArray,
} from "./row-codecs.ts";
import type { SqlClient } from "./sql-client.ts";

function decodeSource(row: QueryResultRow): ModelMemorySourceRecord {
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

function decodeSourceWindow(row: QueryResultRow): ModelMemorySourceWindowRecord {
  return {
    id: readString(row.id),
    sourceId: readString(row.source_id),
    windowIndex: Number(row.window_index),
    normalizedText: readString(row.normalized_text),
    normalizedFingerprint: readString(row.normalized_fingerprint),
    tokenEstimate: Number(row.token_estimate),
    headingPath: readStringArray(row.heading_path),
    blockDescriptors: readObjectArray(row.block_descriptors),
    lineStart:
      row.line_start === null || row.line_start === undefined ? undefined : Number(row.line_start),
    lineEnd: row.line_end === null || row.line_end === undefined ? undefined : Number(row.line_end),
    createdAt: readDate(row.created_at),
  };
}

function decodeMemoryObject(row: QueryResultRow): ModelMemoryObjectRecord {
  return {
    id: readString(row.id),
    sourceWindowId: readString(row.source_window_id),
    canonicalClass: readString(row.canonical_class),
    kind: readString(row.kind),
    payload: readObject(row.payload),
    normalizedSubject: readOptionalString(row.normalized_subject),
    normalizedTitle: readOptionalString(row.normalized_title),
    normalizedSearchText: readString(row.normalized_search_text),
    scope: readObject(row.scope),
    scopeKey: readOptionalString(row.scope_key),
    provenance: readObjectArray(row.provenance),
    confidence: readString(row.confidence),
    durability: readString(row.durability),
    suggestedReviewMode: readString(row.suggested_review_mode),
    executedReviewMode: readString(row.executed_review_mode),
    rationaleCodes: readStringArray(row.rationale_codes),
    identityKey: readString(row.identity_key),
    slotKey: readOptionalString(row.slot_key),
    contractName: readString(row.contract_name),
    contractVersion: readString(row.contract_version),
    modelId: readString(row.model_id),
    createdAt: readDate(row.created_at),
    supersededAt:
      row.superseded_at === null || row.superseded_at === undefined
        ? undefined
        : readDate(row.superseded_at),
  };
}

function decodeWriteEvent(row: QueryResultRow): ModelMemoryWriteEventRecord {
  return {
    id: readString(row.id),
    sourceWindowId: readString(row.source_window_id),
    candidateIdentityKey: readOptionalString(row.candidate_identity_key),
    decision: readString(row.decision),
    memoryObjectId: readOptionalString(row.memory_object_id),
    supersededObjectId: readOptionalString(row.superseded_object_id),
    decisionCodes: readStringArray(row.decision_codes),
    contractName: readString(row.contract_name),
    contractVersion: readString(row.contract_version),
    modelId: readString(row.model_id),
    createdAt: readDate(row.created_at),
  };
}

function decodeSupersessionLink(row: QueryResultRow): ModelMemorySupersessionLinkRecord {
  return {
    id: readString(row.id),
    priorObjectId: readString(row.prior_object_id),
    replacementObjectId: readString(row.replacement_object_id),
    reasonCode: readString(row.reason_code),
    createdAt: readDate(row.created_at),
  };
}

export class ModelMemoryCanonicalRepository {
  constructor(private readonly sql: SqlClient) {}

  withTransaction<T>(work: (repository: ModelMemoryCanonicalRepository) => Promise<T>): Promise<T> {
    return this.sql.withTransaction((tx) => work(new ModelMemoryCanonicalRepository(tx)));
  }

  async persistSource(record: ModelMemorySourceRecord): Promise<ModelMemorySourceRecord> {
    const result = await this.sql.query(
      `
        INSERT INTO model_memory.sources (
          id,
          source_kind,
          external_source_id,
          source_fingerprint,
          project_id,
          session_id,
          source_metadata,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        ON CONFLICT (source_kind, source_fingerprint)
        DO UPDATE SET
          external_source_id = EXCLUDED.external_source_id,
          project_id = EXCLUDED.project_id,
          session_id = EXCLUDED.session_id,
          source_metadata = EXCLUDED.source_metadata
        RETURNING *
      `,
      [
        record.id,
        record.sourceKind,
        record.externalSourceId ?? null,
        record.sourceFingerprint,
        record.projectId ?? null,
        record.sessionId ?? null,
        JSON.stringify(record.sourceMetadata),
        record.createdAt,
      ],
    );
    return decodeSource(result.rows[0]);
  }

  async persistSourceWindows(
    windows: ModelMemorySourceWindowRecord[],
  ): Promise<ModelMemorySourceWindowRecord[]> {
    const persisted: ModelMemorySourceWindowRecord[] = [];
    for (const record of windows) {
      const result = await this.sql.query(
        `
          INSERT INTO model_memory.source_windows (
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
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11)
          ON CONFLICT (source_id, window_index)
          DO UPDATE SET
            normalized_text = EXCLUDED.normalized_text,
            normalized_fingerprint = EXCLUDED.normalized_fingerprint,
            token_estimate = EXCLUDED.token_estimate,
            heading_path = EXCLUDED.heading_path,
            block_descriptors = EXCLUDED.block_descriptors,
            line_start = EXCLUDED.line_start,
            line_end = EXCLUDED.line_end
          RETURNING *
        `,
        [
          record.id,
          record.sourceId,
          record.windowIndex,
          record.normalizedText,
          record.normalizedFingerprint,
          record.tokenEstimate,
          JSON.stringify(record.headingPath),
          JSON.stringify(record.blockDescriptors),
          record.lineStart ?? null,
          record.lineEnd ?? null,
          record.createdAt,
        ],
      );
      persisted.push(decodeSourceWindow(result.rows[0]));
    }
    return persisted.toSorted((left, right) => left.windowIndex - right.windowIndex);
  }

  async findActiveMemoryObjectByIdentity(
    identityKey: string,
  ): Promise<ModelMemoryObjectRecord | undefined> {
    const result = await this.sql.query(
      `
        SELECT *
        FROM model_memory.memory_objects
        WHERE identity_key = $1
          AND superseded_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [identityKey],
    );
    return result.rows[0] ? decodeMemoryObject(result.rows[0]) : undefined;
  }

  async findActiveMemoryObjectBySlot(
    slotKey: string,
  ): Promise<ModelMemoryObjectRecord | undefined> {
    const result = await this.sql.query(
      `
        SELECT *
        FROM model_memory.memory_objects
        WHERE slot_key = $1
          AND superseded_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [slotKey],
    );
    return result.rows[0] ? decodeMemoryObject(result.rows[0]) : undefined;
  }

  async insertMemoryObject(record: ModelMemoryObjectRecord): Promise<ModelMemoryObjectRecord> {
    const result = await this.sql.query(
      `
        INSERT INTO model_memory.memory_objects (
          id,
          source_window_id,
          canonical_class,
          kind,
          payload,
          normalized_subject,
          normalized_title,
          normalized_search_text,
          scope,
          scope_key,
          provenance,
          confidence,
          durability,
          suggested_review_mode,
          executed_review_mode,
          rationale_codes,
          identity_key,
          slot_key,
          contract_name,
          contract_version,
          model_id,
          created_at,
          superseded_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5::jsonb,
          $6,
          $7,
          $8,
          $9::jsonb,
          $10,
          $11::jsonb,
          $12,
          $13,
          $14,
          $15,
          $16::text[],
          $17,
          $18,
          $19,
          $20,
          $21,
          $22,
          $23
        )
        RETURNING *
      `,
      [
        record.id,
        record.sourceWindowId,
        record.canonicalClass,
        record.kind,
        JSON.stringify(record.payload),
        record.normalizedSubject ?? null,
        record.normalizedTitle ?? null,
        record.normalizedSearchText,
        JSON.stringify(record.scope),
        record.scopeKey ?? null,
        JSON.stringify(record.provenance),
        record.confidence,
        record.durability,
        record.suggestedReviewMode,
        record.executedReviewMode,
        record.rationaleCodes,
        record.identityKey,
        record.slotKey ?? null,
        record.contractName,
        record.contractVersion,
        record.modelId,
        record.createdAt,
        record.supersededAt ?? null,
      ],
    );
    return decodeMemoryObject(result.rows[0]);
  }

  async markMemoryObjectSuperseded(id: string, supersededAt: Date): Promise<void> {
    await this.sql.query(
      `
        UPDATE model_memory.memory_objects
        SET superseded_at = $2
        WHERE id = $1
      `,
      [id, supersededAt],
    );
  }

  async insertWriteEvent(
    record: ModelMemoryWriteEventRecord,
  ): Promise<ModelMemoryWriteEventRecord> {
    const result = await this.sql.query(
      `
        INSERT INTO model_memory.write_events (
          id,
          source_window_id,
          candidate_identity_key,
          decision,
          memory_object_id,
          superseded_object_id,
          decision_codes,
          contract_name,
          contract_version,
          model_id,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, $11)
        RETURNING *
      `,
      [
        record.id,
        record.sourceWindowId,
        record.candidateIdentityKey ?? null,
        record.decision,
        record.memoryObjectId ?? null,
        record.supersededObjectId ?? null,
        record.decisionCodes,
        record.contractName,
        record.contractVersion,
        record.modelId,
        record.createdAt,
      ],
    );
    return decodeWriteEvent(result.rows[0]);
  }

  async insertSupersessionLink(
    record: ModelMemorySupersessionLinkRecord,
  ): Promise<ModelMemorySupersessionLinkRecord> {
    const result = await this.sql.query(
      `
        INSERT INTO model_memory.supersession_links (
          id,
          prior_object_id,
          replacement_object_id,
          reason_code,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [
        record.id,
        record.priorObjectId,
        record.replacementObjectId,
        record.reasonCode,
        record.createdAt,
      ],
    );
    return decodeSupersessionLink(result.rows[0]);
  }

  async listSources(): Promise<ModelMemorySourceRecord[]> {
    const result = await this.sql.query(
      "SELECT * FROM model_memory.sources ORDER BY created_at ASC, id ASC",
    );
    return result.rows.map(decodeSource);
  }

  async listSourceWindows(sourceId?: string): Promise<ModelMemorySourceWindowRecord[]> {
    const result = sourceId
      ? await this.sql.query(
          `
            SELECT *
            FROM model_memory.source_windows
            WHERE source_id = $1
            ORDER BY window_index ASC
          `,
          [sourceId],
        )
      : await this.sql.query(
          `
            SELECT *
            FROM model_memory.source_windows
            ORDER BY source_id ASC, window_index ASC
          `,
        );
    return result.rows.map(decodeSourceWindow);
  }

  async listMemoryObjects(): Promise<ModelMemoryObjectRecord[]> {
    const result = await this.sql.query(
      "SELECT * FROM model_memory.memory_objects ORDER BY created_at ASC, id ASC",
    );
    return result.rows.map(decodeMemoryObject);
  }

  async listWriteEvents(): Promise<ModelMemoryWriteEventRecord[]> {
    const result = await this.sql.query(
      "SELECT * FROM model_memory.write_events ORDER BY created_at ASC, id ASC",
    );
    return result.rows.map(decodeWriteEvent);
  }

  async listSupersessionLinks(): Promise<ModelMemorySupersessionLinkRecord[]> {
    const result = await this.sql.query(
      "SELECT * FROM model_memory.supersession_links ORDER BY created_at ASC, id ASC",
    );
    return result.rows.map(decodeSupersessionLink);
  }

  async snapshot() {
    return {
      sources: await this.listSources(),
      sourceWindows: await this.listSourceWindows(),
      memoryObjects: await this.listMemoryObjects(),
      writeEvents: await this.listWriteEvents(),
      supersessionLinks: await this.listSupersessionLinks(),
    };
  }
}
