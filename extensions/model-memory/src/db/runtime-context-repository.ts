import type { QueryResultRow } from "pg";
import type {
  ActiveMemorySetRecord,
  ActiveMemorySlotRecord,
  ContextArtifactRecord,
  ContextRunRecord,
  ContextRunSegmentRecord,
  RetrievalRequestRecord,
  RetrievalResultItemRecord,
  RetrievalResultSetRecord,
  SessionContextStateRecord,
  WorkspaceProjectionTargetRecord,
  WorkspaceProjectionVersionRecord,
} from "../runtime-read-models.ts";
import {
  readBoolean,
  readDate,
  readNumber,
  readObject,
  readOptionalNumber,
  readOptionalString,
  readString,
  readStringArray,
} from "./row-codecs.ts";
import type { SqlClient } from "./sql-client.ts";

function decodeActiveMemorySlot(row: QueryResultRow): ActiveMemorySlotRecord {
  return {
    slotKey: readString(row.slot_key),
    canonicalClass: readString(row.canonical_class),
    kind: readString(row.kind),
    scopeKey: readOptionalString(row.scope_key),
    subjectKey: readOptionalString(row.subject_key),
    currentObjectId: readString(row.current_object_id),
    currentIdentityKey: readString(row.current_identity_key),
    updatedAt: readDate(row.updated_at),
  };
}

function decodeActiveMemorySet(row: QueryResultRow): ActiveMemorySetRecord {
  return {
    id: readString(row.id),
    setKey: readString(row.set_key),
    canonicalClass: readString(row.canonical_class),
    kind: readString(row.kind),
    scopeKey: readOptionalString(row.scope_key),
    memoryObjectId: readString(row.memory_object_id),
    sortKey: readString(row.sort_key),
    updatedAt: readDate(row.updated_at),
  };
}

function decodeSessionContextState(row: QueryResultRow): SessionContextStateRecord {
  return {
    sessionId: readString(row.session_id),
    agentId: readString(row.agent_id),
    activeProjectIds: readStringArray(row.active_project_ids),
    openLoops: readStringArray(row.open_loops),
    unresolvedQuestions: readStringArray(row.unresolved_questions),
    activePlanState: readObject(row.active_plan_state),
    sessionSummaryArtifactId: readOptionalString(row.session_summary_artifact_id),
    projectionVersions: readObject(row.projection_versions) as Record<string, string>,
    compactionStatus: readString(
      row.compaction_status,
    ) as SessionContextStateRecord["compactionStatus"],
    updatedAt: readDate(row.updated_at),
  };
}

function decodeContextArtifact(row: QueryResultRow): ContextArtifactRecord {
  return {
    id: readString(row.id),
    artifactType: readString(row.artifact_type) as ContextArtifactRecord["artifactType"],
    scopeKey: readOptionalString(row.scope_key),
    sourceObjectIds: readStringArray(row.source_object_ids),
    sourceSlotKeys: readStringArray(row.source_slot_keys),
    structuredPayload:
      row.structured_payload === null || row.structured_payload === undefined
        ? undefined
        : readObject(row.structured_payload),
    renderedText: readOptionalString(row.rendered_text),
    contentHash: readString(row.content_hash),
    tokenEstimate: readNumber(row.token_estimate),
    buildPolicyVersion: readString(row.build_policy_version),
    contractName: readOptionalString(row.contract_name),
    contractVersion: readOptionalString(row.contract_version),
    modelId: readOptionalString(row.model_id),
    builtAt: readDate(row.built_at),
  };
}

function decodeProjectionTarget(row: QueryResultRow): WorkspaceProjectionTargetRecord {
  return {
    targetId: readString(row.target_id),
    targetKind: readString(row.target_kind) as WorkspaceProjectionTargetRecord["targetKind"],
    relativePath: readString(row.relative_path),
    generatedBlockId: readOptionalString(row.generated_block_id),
    allowedCanonicalClasses: readStringArray(row.allowed_canonical_classes),
    allowedKinds: readStringArray(row.allowed_kinds),
    tokenBudget: readNumber(row.token_budget),
    rankingPolicyId: readString(row.ranking_policy_id),
    enabled: readBoolean(row.enabled),
  };
}

function decodeProjectionVersion(row: QueryResultRow): WorkspaceProjectionVersionRecord {
  return {
    id: readString(row.id),
    targetId: readString(row.target_id),
    contentHash: readString(row.content_hash),
    canonicalArtifactPath: readString(row.canonical_artifact_path),
    sourceObjectIds: readStringArray(row.source_object_ids),
    sourceSlotKeys: readStringArray(row.source_slot_keys),
    sourceSetKeys: readStringArray(row.source_set_keys),
    tokenEstimate: readNumber(row.token_estimate),
    builtAt: readDate(row.built_at),
  };
}

function decodeRetrievalRequest(row: QueryResultRow): RetrievalRequestRecord {
  return {
    id: readString(row.id),
    sessionId: readOptionalString(row.session_id),
    agentId: readOptionalString(row.agent_id),
    queryText: readString(row.query_text),
    requestPurpose: readString(row.request_purpose),
    scope: readObject(row.scope),
    desiredResultCount: readNumber(row.desired_result_count),
    contractName: readString(row.contract_name),
    contractVersion: readString(row.contract_version),
    modelId: readString(row.model_id),
    createdAt: readDate(row.created_at),
  };
}

function decodeRetrievalResultSet(row: QueryResultRow): RetrievalResultSetRecord {
  return {
    id: readString(row.id),
    retrievalRequestId: readString(row.retrieval_request_id),
    contentHash: readString(row.content_hash),
    resultCount: readNumber(row.result_count),
    createdAt: readDate(row.created_at),
  };
}

function decodeRetrievalResultItem(row: QueryResultRow): RetrievalResultItemRecord {
  return {
    id: readString(row.id),
    retrievalResultSetId: readString(row.retrieval_result_set_id),
    memoryObjectId: readString(row.memory_object_id),
    rankIndex: readNumber(row.rank_index),
    rankBand: readString(row.rank_band) as RetrievalResultItemRecord["rankBand"],
    retrievalReasonCodes: readStringArray(row.retrieval_reason_codes),
    selectedForContext: readBoolean(row.selected_for_context),
    packedArtifactId: readOptionalString(row.packed_artifact_id),
    createdAt: readDate(row.created_at),
  };
}

function decodeContextRun(row: QueryResultRow): ContextRunRecord {
  return {
    id: readString(row.id),
    sessionId: readString(row.session_id),
    agentId: readString(row.agent_id),
    provider: readString(row.provider),
    model: readString(row.model),
    stableLayerHash: readString(row.stable_layer_hash),
    semiStableLayerHash: readString(row.semi_stable_layer_hash),
    volatileLayerHash: readString(row.volatile_layer_hash),
    estimatedInputTokens: readNumber(row.estimated_input_tokens),
    actualInputTokens: readOptionalNumber(row.actual_input_tokens),
    actualOutputTokens: readOptionalNumber(row.actual_output_tokens),
    cacheReadTokens: readOptionalNumber(row.cache_read_tokens),
    cacheWriteTokens: readOptionalNumber(row.cache_write_tokens),
    estimatedCost: readOptionalNumber(row.estimated_cost),
    cacheRetentionMode: readOptionalString(row.cache_retention_mode),
    promptCacheKey: readOptionalString(row.prompt_cache_key),
    compactionUsed: readBoolean(row.compaction_used),
    pruningUsed: readBoolean(row.pruning_used),
    assembledAt: readDate(row.assembled_at),
  };
}

function decodeContextRunSegment(row: QueryResultRow): ContextRunSegmentRecord {
  return {
    id: readString(row.id),
    runId: readString(row.run_id),
    segmentOrder: readNumber(row.segment_order),
    segmentType: readString(row.segment_type) as ContextRunSegmentRecord["segmentType"],
    sourceArtifactId: readOptionalString(row.source_artifact_id),
    projectionVersionId: readOptionalString(row.projection_version_id),
    sourceKind: readString(row.source_kind),
    segmentHash: readString(row.segment_hash),
    estimatedTokens: readNumber(row.estimated_tokens),
    dropped: readBoolean(row.dropped),
    trimmed: readBoolean(row.trimmed),
    trimReason: readOptionalString(row.trim_reason),
  };
}

export class RuntimeContextRepository {
  constructor(private readonly sql: SqlClient) {}

  withTransaction<T>(work: (repository: RuntimeContextRepository) => Promise<T>): Promise<T> {
    return this.sql.withTransaction((tx) => work(new RuntimeContextRepository(tx)));
  }

  async replaceActiveMemorySlots(
    records: ActiveMemorySlotRecord[],
  ): Promise<ActiveMemorySlotRecord[]> {
    return this.withTransaction(async (repository) => {
      await repository.sql.query("DELETE FROM runtime_context.active_memory_slots");
      const persisted: ActiveMemorySlotRecord[] = [];
      for (const record of records) {
        const result = await repository.sql.query(
          `
            INSERT INTO runtime_context.active_memory_slots (
              slot_key,
              canonical_class,
              kind,
              scope_key,
              subject_key,
              current_object_id,
              current_identity_key,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
          `,
          [
            record.slotKey,
            record.canonicalClass,
            record.kind,
            record.scopeKey ?? null,
            record.subjectKey ?? null,
            record.currentObjectId,
            record.currentIdentityKey,
            record.updatedAt,
          ],
        );
        persisted.push(decodeActiveMemorySlot(result.rows[0]));
      }
      return persisted;
    });
  }

  async replaceActiveMemorySets(
    records: ActiveMemorySetRecord[],
  ): Promise<ActiveMemorySetRecord[]> {
    return this.withTransaction(async (repository) => {
      await repository.sql.query("DELETE FROM runtime_context.active_memory_sets");
      const persisted: ActiveMemorySetRecord[] = [];
      for (const record of records) {
        const result = await repository.sql.query(
          `
            INSERT INTO runtime_context.active_memory_sets (
              id,
              set_key,
              canonical_class,
              kind,
              scope_key,
              memory_object_id,
              sort_key,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
          `,
          [
            record.id,
            record.setKey,
            record.canonicalClass,
            record.kind,
            record.scopeKey ?? null,
            record.memoryObjectId,
            record.sortKey,
            record.updatedAt,
          ],
        );
        persisted.push(decodeActiveMemorySet(result.rows[0]));
      }
      return persisted;
    });
  }

  async upsertSessionContextState(
    record: SessionContextStateRecord,
  ): Promise<SessionContextStateRecord> {
    const result = await this.sql.query(
      `
        INSERT INTO runtime_context.session_context_state (
          session_id,
          agent_id,
          active_project_ids,
          open_loops,
          unresolved_questions,
          active_plan_state,
          session_summary_artifact_id,
          projection_versions,
          compaction_status,
          updated_at
        )
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8::jsonb, $9, $10)
        ON CONFLICT (session_id)
        DO UPDATE SET
          agent_id = EXCLUDED.agent_id,
          active_project_ids = EXCLUDED.active_project_ids,
          open_loops = EXCLUDED.open_loops,
          unresolved_questions = EXCLUDED.unresolved_questions,
          active_plan_state = EXCLUDED.active_plan_state,
          session_summary_artifact_id = EXCLUDED.session_summary_artifact_id,
          projection_versions = EXCLUDED.projection_versions,
          compaction_status = EXCLUDED.compaction_status,
          updated_at = EXCLUDED.updated_at
        RETURNING *
      `,
      [
        record.sessionId,
        record.agentId,
        JSON.stringify(record.activeProjectIds),
        JSON.stringify(record.openLoops),
        JSON.stringify(record.unresolvedQuestions),
        JSON.stringify(record.activePlanState),
        record.sessionSummaryArtifactId ?? null,
        JSON.stringify(record.projectionVersions),
        record.compactionStatus,
        record.updatedAt,
      ],
    );
    return decodeSessionContextState(result.rows[0]);
  }

  async persistContextArtifact(record: ContextArtifactRecord): Promise<ContextArtifactRecord> {
    const result = await this.sql.query(
      `
        INSERT INTO runtime_context.context_artifacts (
          id,
          artifact_type,
          scope_key,
          source_object_ids,
          source_slot_keys,
          structured_payload,
          rendered_text,
          content_hash,
          token_estimate,
          build_policy_version,
          contract_name,
          contract_version,
          model_id,
          built_at
        )
        VALUES ($1, $2, $3, $4::uuid[], $5::text[], $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id)
        DO UPDATE SET
          artifact_type = EXCLUDED.artifact_type,
          scope_key = EXCLUDED.scope_key,
          source_object_ids = EXCLUDED.source_object_ids,
          source_slot_keys = EXCLUDED.source_slot_keys,
          structured_payload = EXCLUDED.structured_payload,
          rendered_text = EXCLUDED.rendered_text,
          content_hash = EXCLUDED.content_hash,
          token_estimate = EXCLUDED.token_estimate,
          build_policy_version = EXCLUDED.build_policy_version,
          contract_name = EXCLUDED.contract_name,
          contract_version = EXCLUDED.contract_version,
          model_id = EXCLUDED.model_id,
          built_at = EXCLUDED.built_at
        RETURNING *
      `,
      [
        record.id,
        record.artifactType,
        record.scopeKey ?? null,
        record.sourceObjectIds,
        record.sourceSlotKeys,
        record.structuredPayload ? JSON.stringify(record.structuredPayload) : null,
        record.renderedText ?? null,
        record.contentHash,
        record.tokenEstimate,
        record.buildPolicyVersion,
        record.contractName ?? null,
        record.contractVersion ?? null,
        record.modelId ?? null,
        record.builtAt,
      ],
    );
    return decodeContextArtifact(result.rows[0]);
  }

  async upsertProjectionTarget(
    record: WorkspaceProjectionTargetRecord,
  ): Promise<WorkspaceProjectionTargetRecord> {
    const result = await this.sql.query(
      `
        INSERT INTO runtime_context.workspace_projection_targets (
          target_id,
          target_kind,
          relative_path,
          generated_block_id,
          allowed_canonical_classes,
          allowed_kinds,
          token_budget,
          ranking_policy_id,
          enabled
        )
        VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7, $8, $9)
        ON CONFLICT (target_id)
        DO UPDATE SET
          target_kind = EXCLUDED.target_kind,
          relative_path = EXCLUDED.relative_path,
          generated_block_id = EXCLUDED.generated_block_id,
          allowed_canonical_classes = EXCLUDED.allowed_canonical_classes,
          allowed_kinds = EXCLUDED.allowed_kinds,
          token_budget = EXCLUDED.token_budget,
          ranking_policy_id = EXCLUDED.ranking_policy_id,
          enabled = EXCLUDED.enabled
        RETURNING *
      `,
      [
        record.targetId,
        record.targetKind,
        record.relativePath,
        record.generatedBlockId ?? null,
        record.allowedCanonicalClasses,
        record.allowedKinds,
        record.tokenBudget,
        record.rankingPolicyId,
        record.enabled,
      ],
    );
    return decodeProjectionTarget(result.rows[0]);
  }

  async persistProjectionVersion(
    record: WorkspaceProjectionVersionRecord,
  ): Promise<WorkspaceProjectionVersionRecord> {
    const result = await this.sql.query(
      `
        INSERT INTO runtime_context.workspace_projection_versions (
          id,
          target_id,
          content_hash,
          canonical_artifact_path,
          source_object_ids,
          source_slot_keys,
          source_set_keys,
          token_estimate,
          built_at
        )
        VALUES ($1, $2, $3, $4, $5::uuid[], $6::text[], $7::text[], $8, $9)
        ON CONFLICT (target_id, content_hash)
        DO UPDATE SET
          canonical_artifact_path = EXCLUDED.canonical_artifact_path,
          source_object_ids = EXCLUDED.source_object_ids,
          source_slot_keys = EXCLUDED.source_slot_keys,
          source_set_keys = EXCLUDED.source_set_keys,
          token_estimate = EXCLUDED.token_estimate,
          built_at = EXCLUDED.built_at
        RETURNING *
      `,
      [
        record.id,
        record.targetId,
        record.contentHash,
        record.canonicalArtifactPath,
        record.sourceObjectIds,
        record.sourceSlotKeys,
        record.sourceSetKeys,
        record.tokenEstimate,
        record.builtAt,
      ],
    );
    return decodeProjectionVersion(result.rows[0]);
  }

  async persistRetrievalRequest(record: RetrievalRequestRecord): Promise<RetrievalRequestRecord> {
    const result = await this.sql.query(
      `
        INSERT INTO runtime_context.retrieval_requests (
          id,
          session_id,
          agent_id,
          query_text,
          request_purpose,
          scope,
          desired_result_count,
          contract_name,
          contract_version,
          model_id,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
        RETURNING *
      `,
      [
        record.id,
        record.sessionId ?? null,
        record.agentId ?? null,
        record.queryText,
        record.requestPurpose,
        JSON.stringify(record.scope),
        record.desiredResultCount,
        record.contractName,
        record.contractVersion,
        record.modelId,
        record.createdAt,
      ],
    );
    return decodeRetrievalRequest(result.rows[0]);
  }

  async persistRetrievalResultSet(
    record: RetrievalResultSetRecord,
  ): Promise<RetrievalResultSetRecord> {
    const result = await this.sql.query(
      `
        INSERT INTO runtime_context.retrieval_result_sets (
          id,
          retrieval_request_id,
          content_hash,
          result_count,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [
        record.id,
        record.retrievalRequestId,
        record.contentHash,
        record.resultCount,
        record.createdAt,
      ],
    );
    return decodeRetrievalResultSet(result.rows[0]);
  }

  async replaceRetrievalResultItems(
    retrievalResultSetId: string,
    items: RetrievalResultItemRecord[],
  ): Promise<RetrievalResultItemRecord[]> {
    return this.withTransaction(async (repository) => {
      await repository.sql.query(
        "DELETE FROM runtime_context.retrieval_result_items WHERE retrieval_result_set_id = $1",
        [retrievalResultSetId],
      );
      const persisted: RetrievalResultItemRecord[] = [];
      for (const record of items) {
        const result = await repository.sql.query(
          `
            INSERT INTO runtime_context.retrieval_result_items (
              id,
              retrieval_result_set_id,
              memory_object_id,
              rank_index,
              rank_band,
              retrieval_reason_codes,
              selected_for_context,
              packed_artifact_id,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8, $9)
            RETURNING *
          `,
          [
            record.id,
            record.retrievalResultSetId,
            record.memoryObjectId,
            record.rankIndex,
            record.rankBand,
            record.retrievalReasonCodes,
            record.selectedForContext,
            record.packedArtifactId ?? null,
            record.createdAt,
          ],
        );
        persisted.push(decodeRetrievalResultItem(result.rows[0]));
      }
      return persisted;
    });
  }

  async updatePackedArtifactId(
    retrievalResultSetId: string,
    packedArtifactId: string,
  ): Promise<void> {
    await this.sql.query(
      `
        UPDATE runtime_context.retrieval_result_items
        SET packed_artifact_id = $2
        WHERE retrieval_result_set_id = $1
          AND selected_for_context = true
      `,
      [retrievalResultSetId, packedArtifactId],
    );
  }

  async persistContextRun(
    run: ContextRunRecord,
    segments: ContextRunSegmentRecord[],
  ): Promise<{ run: ContextRunRecord; segments: ContextRunSegmentRecord[] }> {
    return this.withTransaction(async (repository) => {
      const runResult = await repository.sql.query(
        `
          INSERT INTO runtime_context.context_runs (
            id,
            session_id,
            agent_id,
            provider,
            model,
            assembled_at,
            stable_layer_hash,
            semi_stable_layer_hash,
            volatile_layer_hash,
            estimated_input_tokens,
            actual_input_tokens,
            actual_output_tokens,
            cache_read_tokens,
            cache_write_tokens,
            estimated_cost,
            cache_retention_mode,
            prompt_cache_key,
            compaction_used,
            pruning_used
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
          )
          ON CONFLICT (id)
          DO UPDATE SET
            actual_input_tokens = EXCLUDED.actual_input_tokens,
            actual_output_tokens = EXCLUDED.actual_output_tokens,
            cache_read_tokens = EXCLUDED.cache_read_tokens,
            cache_write_tokens = EXCLUDED.cache_write_tokens,
            estimated_cost = EXCLUDED.estimated_cost,
            cache_retention_mode = EXCLUDED.cache_retention_mode,
            prompt_cache_key = EXCLUDED.prompt_cache_key,
            compaction_used = EXCLUDED.compaction_used,
            pruning_used = EXCLUDED.pruning_used
          RETURNING *
        `,
        [
          run.id,
          run.sessionId,
          run.agentId,
          run.provider,
          run.model,
          run.assembledAt,
          run.stableLayerHash,
          run.semiStableLayerHash,
          run.volatileLayerHash,
          run.estimatedInputTokens,
          run.actualInputTokens ?? null,
          run.actualOutputTokens ?? null,
          run.cacheReadTokens ?? null,
          run.cacheWriteTokens ?? null,
          run.estimatedCost ?? null,
          run.cacheRetentionMode ?? null,
          run.promptCacheKey ?? null,
          run.compactionUsed,
          run.pruningUsed,
        ],
      );

      await repository.sql.query(
        "DELETE FROM runtime_context.context_run_segments WHERE run_id = $1",
        [run.id],
      );
      const persistedSegments: ContextRunSegmentRecord[] = [];
      for (const segment of segments) {
        const result = await repository.sql.query(
          `
            INSERT INTO runtime_context.context_run_segments (
              id,
              run_id,
              segment_order,
              segment_type,
              source_artifact_id,
              projection_version_id,
              source_kind,
              segment_hash,
              estimated_tokens,
              dropped,
              trimmed,
              trim_reason
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
          `,
          [
            segment.id,
            segment.runId,
            segment.segmentOrder,
            segment.segmentType,
            segment.sourceArtifactId ?? null,
            segment.projectionVersionId ?? null,
            segment.sourceKind,
            segment.segmentHash,
            segment.estimatedTokens,
            segment.dropped,
            segment.trimmed,
            segment.trimReason ?? null,
          ],
        );
        persistedSegments.push(decodeContextRunSegment(result.rows[0]));
      }

      return {
        run: decodeContextRun(runResult.rows[0]),
        segments: persistedSegments,
      };
    });
  }

  async listActiveMemorySlots(): Promise<ActiveMemorySlotRecord[]> {
    const result = await this.sql.query(
      "SELECT * FROM runtime_context.active_memory_slots ORDER BY slot_key ASC",
    );
    return result.rows.map(decodeActiveMemorySlot);
  }

  async listActiveMemorySets(): Promise<ActiveMemorySetRecord[]> {
    const result = await this.sql.query(
      "SELECT * FROM runtime_context.active_memory_sets ORDER BY set_key ASC, sort_key ASC",
    );
    return result.rows.map(decodeActiveMemorySet);
  }

  async getSessionContextState(sessionId: string): Promise<SessionContextStateRecord | undefined> {
    const result = await this.sql.query(
      "SELECT * FROM runtime_context.session_context_state WHERE session_id = $1",
      [sessionId],
    );
    return result.rows[0] ? decodeSessionContextState(result.rows[0]) : undefined;
  }

  async listContextArtifacts(): Promise<ContextArtifactRecord[]> {
    const result = await this.sql.query(
      "SELECT * FROM runtime_context.context_artifacts ORDER BY built_at ASC, id ASC",
    );
    return result.rows.map(decodeContextArtifact);
  }

  async listProjectionTargets(): Promise<WorkspaceProjectionTargetRecord[]> {
    const result = await this.sql.query(
      "SELECT * FROM runtime_context.workspace_projection_targets ORDER BY target_id ASC",
    );
    return result.rows.map(decodeProjectionTarget);
  }

  async listProjectionVersions(): Promise<WorkspaceProjectionVersionRecord[]> {
    const result = await this.sql.query(
      "SELECT * FROM runtime_context.workspace_projection_versions ORDER BY built_at ASC, id ASC",
    );
    return result.rows.map(decodeProjectionVersion);
  }

  async listRetrievalRequests(): Promise<RetrievalRequestRecord[]> {
    const result = await this.sql.query(
      "SELECT * FROM runtime_context.retrieval_requests ORDER BY created_at ASC, id ASC",
    );
    return result.rows.map(decodeRetrievalRequest);
  }

  async listRetrievalResultSets(): Promise<RetrievalResultSetRecord[]> {
    const result = await this.sql.query(
      "SELECT * FROM runtime_context.retrieval_result_sets ORDER BY created_at ASC, id ASC",
    );
    return result.rows.map(decodeRetrievalResultSet);
  }

  async listRetrievalResultItems(): Promise<RetrievalResultItemRecord[]> {
    const result = await this.sql.query(
      `
        SELECT *
        FROM runtime_context.retrieval_result_items
        ORDER BY retrieval_result_set_id ASC, rank_index ASC
      `,
    );
    return result.rows.map(decodeRetrievalResultItem);
  }

  async listContextRuns(): Promise<ContextRunRecord[]> {
    const result = await this.sql.query(
      "SELECT * FROM runtime_context.context_runs ORDER BY assembled_at ASC, id ASC",
    );
    return result.rows.map(decodeContextRun);
  }

  async listContextRunSegments(): Promise<ContextRunSegmentRecord[]> {
    const result = await this.sql.query(
      `
        SELECT *
        FROM runtime_context.context_run_segments
        ORDER BY run_id ASC, segment_order ASC
      `,
    );
    return result.rows.map(decodeContextRunSegment);
  }

  async snapshot() {
    return {
      activeMemorySlots: await this.listActiveMemorySlots(),
      activeMemorySets: await this.listActiveMemorySets(),
      sessionContextState: await this.sql
        .query("SELECT * FROM runtime_context.session_context_state")
        .then((result) => result.rows.map(decodeSessionContextState)),
      contextArtifacts: await this.listContextArtifacts(),
      workspaceProjectionTargets: await this.listProjectionTargets(),
      workspaceProjectionVersions: await this.listProjectionVersions(),
      retrievalRequests: await this.listRetrievalRequests(),
      retrievalResultSets: await this.listRetrievalResultSets(),
      retrievalResultItems: await this.listRetrievalResultItems(),
      contextRuns: await this.listContextRuns(),
      contextRunSegments: await this.listContextRunSegments(),
    };
  }
}
