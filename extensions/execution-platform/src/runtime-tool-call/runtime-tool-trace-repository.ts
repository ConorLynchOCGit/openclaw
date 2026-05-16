import { randomUUID } from "node:crypto";
import type { SqlClient } from "../db/sql-client.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import type {
  RuntimeToolArtifactInput,
  RuntimeToolCancelInput,
  RuntimeToolCompletionInput,
  RuntimeToolDefinition,
  RuntimeToolEventInput,
  RuntimeToolInvocationCursorPage,
  RuntimeToolInvocationInput,
  RuntimeToolInvocationRecord,
  RuntimeToolReadbackSummary,
  RuntimeToolRetentionPolicy,
  RuntimeToolRetentionResult,
  RuntimeToolStatus,
} from "./runtime-tool-types.ts";

const MAX_SUMMARY_CHARS = 1_200;
const MAX_EVENT_SUMMARY_CHARS = 800;
const MAX_REASON_CODES = 30;
const TERMINAL_STATUSES = new Set<RuntimeToolStatus>([
  "succeeded",
  "needs_review",
  "failed",
  "canceled",
  "skipped",
]);

type RuntimeToolInvocationRow = {
  invocation_id: string;
  runtime_job_id: string | null;
  graph_id: string | null;
  node_id: string | null;
  parent_invocation_id: string | null;
  tool_id: string;
  tool_version: string;
  tool_family: string;
  executor_key: string;
  role_ref: string | null;
  model_ref: string | null;
  provider_ref: string | null;
  status: RuntimeToolStatus;
  idempotency_scope: string;
  idempotency_key: string;
  input_ref: string | null;
  input_hash: string | null;
  input_summary: string;
  output_ref: string | null;
  output_hash: string | null;
  output_summary: string | null;
  error_code: string | null;
  error_summary: string | null;
  budget_ref: string | null;
  budget_summary: JsonValue;
  reason_codes: string[];
  metadata: JsonValue;
  raw_prompt_stored: false;
  raw_response_stored: false;
  raw_transcript_stored: false;
  raw_provider_log_stored: false;
  raw_tool_log_stored: false;
  raw_command_log_stored: false;
  raw_db_rows_stored: false;
  secrets_stored: false;
  authority_granted: false;
  controls_applied: false;
  work_queue_lifecycle_mutated: false;
  runtime_lifecycle_mutated: false;
  started_at: Date | null;
  completed_at: Date | null;
  latency_ms: number | null;
  created_at: Date;
  updated_at: Date;
};

function encodeJson(value: JsonValue | undefined): string {
  return JSON.stringify(value ?? {});
}

function bounded(value: string | null | undefined, max = MAX_SUMMARY_CHARS): string {
  const trimmed = (value ?? "").trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function reasonCodes(values: string[] | undefined): string[] {
  return (values ?? [])
    .map((value) => value.trim())
    .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index)
    .slice(0, MAX_REASON_CODES);
}

function rejectRawFlags(input: Record<string, unknown>): void {
  for (const key of [
    "rawPromptStored",
    "rawResponseStored",
    "rawTranscriptStored",
    "rawProviderLogStored",
    "rawToolLogStored",
    "rawCommandLogStored",
    "rawDbRowsStored",
    "rawLogsStored",
    "rawContentStored",
    "secretsStored",
    "authorityGranted",
    "controlsApplied",
    "workQueueLifecycleMutated",
    "runtimeLifecycleMutated",
  ]) {
    if (input[key] === true) {
      throw new Error(`runtime_tool_trace_rejected_flag:${key}`);
    }
  }
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function encodeCursor(record: RuntimeToolInvocationRecord): string {
  return Buffer.from(
    JSON.stringify({ createdAt: record.createdAt, invocationId: record.invocationId }),
  ).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: string; invocationId: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      invocationId?: unknown;
    };
    if (typeof parsed.createdAt !== "string" || typeof parsed.invocationId !== "string") {
      throw new Error("invalid cursor shape");
    }
    return { createdAt: parsed.createdAt, invocationId: parsed.invocationId };
  } catch {
    throw new Error("runtime_tool_invalid_cursor");
  }
}

function rowToRecord(row: RuntimeToolInvocationRow): RuntimeToolInvocationRecord {
  return {
    invocationId: row.invocation_id,
    runtimeJobId: row.runtime_job_id,
    graphId: row.graph_id,
    nodeId: row.node_id,
    parentInvocationId: row.parent_invocation_id,
    toolId: row.tool_id,
    toolVersion: row.tool_version,
    toolFamily: row.tool_family as RuntimeToolInvocationRecord["toolFamily"],
    executorKey: row.executor_key,
    roleRef: row.role_ref,
    modelRef: row.model_ref,
    providerRef: row.provider_ref,
    status: row.status,
    idempotencyScope: row.idempotency_scope,
    idempotencyKey: row.idempotency_key,
    inputRef: row.input_ref,
    inputHash: row.input_hash,
    inputSummary: row.input_summary,
    outputRef: row.output_ref,
    outputHash: row.output_hash,
    outputSummary: row.output_summary,
    errorCode: row.error_code,
    errorSummary: row.error_summary,
    budgetRef: row.budget_ref,
    budgetSummary: row.budget_summary,
    reasonCodes: row.reason_codes,
    metadata: row.metadata,
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at),
    latencyMs: row.latency_ms,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    authorityGranted: false,
    controlsApplied: false,
    workQueueLifecycleMutated: false,
    runtimeLifecycleMutated: false,
  };
}

export class RuntimeToolTraceRepository {
  constructor(
    private readonly sql: SqlClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async upsertToolDefinition(definition: RuntimeToolDefinition): Promise<void> {
    rejectRawFlags(definition as unknown as Record<string, unknown>);
    await this.sql.query(
      `
        INSERT INTO execution_platform.runtime_tool_definitions (
          tool_id, tool_version, tool_family, executor_key, schema_ref, authority_class,
          storage_policy, enabled, metadata, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10::timestamptz, $10::timestamptz)
        ON CONFLICT (tool_id, tool_version) DO UPDATE SET
          tool_family = EXCLUDED.tool_family,
          executor_key = EXCLUDED.executor_key,
          schema_ref = EXCLUDED.schema_ref,
          authority_class = EXCLUDED.authority_class,
          storage_policy = EXCLUDED.storage_policy,
          enabled = EXCLUDED.enabled,
          metadata = EXCLUDED.metadata,
          updated_at = EXCLUDED.updated_at
      `,
      [
        definition.toolId,
        definition.toolVersion,
        definition.toolFamily,
        definition.executorKey,
        definition.schemaRef,
        definition.authorityClass,
        encodeJson(definition.storagePolicy as unknown as JsonValue),
        definition.enabled,
        encodeJson(definition.metadata),
        this.now(),
      ],
    );
  }

  async createInvocation(input: {
    definition: RuntimeToolDefinition;
    invocation: RuntimeToolInvocationInput;
  }): Promise<RuntimeToolInvocationRecord> {
    rejectRawFlags(input.invocation as unknown as Record<string, unknown>);
    const invocationId = input.invocation.invocationId ?? `runtime-tool-${randomUUID()}`;
    const budget = input.invocation.budget ?? {};
    const result = await this.sql.query<RuntimeToolInvocationRow>(
      `
        INSERT INTO execution_platform.runtime_tool_invocations (
          invocation_id, runtime_job_id, graph_id, node_id, parent_invocation_id,
          tool_id, tool_version, tool_family, executor_key, role_ref, model_ref, provider_ref,
          status, idempotency_scope, idempotency_key, input_ref, input_hash, input_summary,
          budget_ref, budget_summary, metadata, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11, $12,
          'planned', $13, $14, $15, $16, $17,
          $18, $19::jsonb, $20::jsonb, $21::timestamptz, $21::timestamptz
        )
        ON CONFLICT (idempotency_scope, idempotency_key) DO UPDATE SET
          updated_at = EXCLUDED.updated_at
        RETURNING *
      `,
      [
        invocationId,
        input.invocation.runtimeJobId ?? null,
        input.invocation.graphId ?? null,
        input.invocation.nodeId ?? null,
        input.invocation.parentInvocationId ?? null,
        input.definition.toolId,
        input.definition.toolVersion,
        input.definition.toolFamily,
        input.definition.executorKey,
        input.invocation.roleRef ?? null,
        input.invocation.modelRef ?? null,
        input.invocation.providerRef ?? null,
        input.invocation.idempotencyScope,
        input.invocation.idempotencyKey,
        input.invocation.inputRef ?? null,
        input.invocation.inputHash ?? null,
        bounded(input.invocation.inputSummary, input.definition.storagePolicy.maxInputSummaryChars),
        budget.budgetRef ?? null,
        encodeJson(budget.metadata ?? {}),
        encodeJson(input.invocation.metadata),
        this.now(),
      ],
    );
    return rowToRecord(result.rows[0]!);
  }

  async markRunning(invocationId: string): Promise<RuntimeToolInvocationRecord> {
    const now = this.now();
    const result = await this.sql.query<RuntimeToolInvocationRow>(
      `
        UPDATE execution_platform.runtime_tool_invocations
        SET status = 'running',
            started_at = COALESCE(started_at, $2::timestamptz),
            updated_at = $2::timestamptz
        WHERE invocation_id = $1
        RETURNING *
      `,
      [invocationId, now],
    );
    if (!result.rows[0]) {
      throw new Error(`runtime_tool_invocation_not_found:${invocationId}`);
    }
    return rowToRecord(result.rows[0]);
  }

  async appendEvent(input: RuntimeToolEventInput): Promise<void> {
    rejectRawFlags(input as unknown as Record<string, unknown>);
    await this.sql.query(
      `
        INSERT INTO execution_platform.runtime_tool_events (
          event_id, invocation_id, runtime_job_id, graph_id, node_id,
          event_type, phase, status, message_summary, evidence_ref, evidence_hash,
          reason_codes, metadata, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::timestamptz)
        ON CONFLICT (event_id) DO NOTHING
      `,
      [
        input.eventId ?? `runtime-tool-event-${randomUUID()}`,
        input.invocationId,
        input.runtimeJobId ?? null,
        input.graphId ?? null,
        input.nodeId ?? null,
        input.eventType,
        bounded(input.phase, 120),
        input.status,
        bounded(input.messageSummary, MAX_EVENT_SUMMARY_CHARS),
        input.evidenceRef ?? null,
        input.evidenceHash ?? null,
        encodeJson(reasonCodes(input.reasonCodes)),
        encodeJson(input.metadata),
        this.now(),
      ],
    );
  }

  async completeInvocation(
    input: RuntimeToolCompletionInput,
  ): Promise<RuntimeToolInvocationRecord> {
    rejectRawFlags(input as unknown as Record<string, unknown>);
    const now = this.now();
    const existing = await this.sql.query<{ started_at: Date | null; status: RuntimeToolStatus }>(
      "SELECT started_at, status FROM execution_platform.runtime_tool_invocations WHERE invocation_id = $1",
      [input.invocationId],
    );
    const existingRow = existing.rows[0];
    if (!existingRow) {
      throw new Error(`runtime_tool_invocation_not_found:${input.invocationId}`);
    }
    if (TERMINAL_STATUSES.has(existingRow.status)) {
      const terminal = await this.readInvocation(input.invocationId);
      if (!terminal) {
        throw new Error(`runtime_tool_invocation_not_found:${input.invocationId}`);
      }
      return terminal;
    }
    const startedAt = existingRow.started_at ?? null;
    const latencyMs = startedAt ? Math.max(0, now.getTime() - startedAt.getTime()) : null;
    const result = await this.sql.query<RuntimeToolInvocationRow>(
      `
        UPDATE execution_platform.runtime_tool_invocations
        SET status = $2,
            output_ref = $3,
            output_hash = $4,
            output_summary = $5,
            error_code = $6,
            error_summary = $7,
            reason_codes = $8::jsonb,
            metadata = $9::jsonb,
            completed_at = COALESCE(completed_at, $10::timestamptz),
            latency_ms = $11,
            updated_at = $10::timestamptz
        WHERE invocation_id = $1
        RETURNING *
      `,
      [
        input.invocationId,
        input.status,
        input.outputRef ?? null,
        input.outputHash ?? null,
        input.outputSummary ? bounded(input.outputSummary) : null,
        input.errorCode ?? null,
        input.errorSummary ? bounded(input.errorSummary) : null,
        encodeJson(reasonCodes(input.reasonCodes)),
        encodeJson(input.metadata),
        now,
        latencyMs,
      ],
    );
    return rowToRecord(result.rows[0]);
  }

  async cancelInvocation(input: RuntimeToolCancelInput): Promise<RuntimeToolInvocationRecord> {
    rejectRawFlags(input as unknown as Record<string, unknown>);
    return this.sql.withTransaction(async (tx) => {
      const scoped = new RuntimeToolTraceRepository(tx, this.now);
      const now = this.now();
      const existing = await tx.query<RuntimeToolInvocationRow>(
        "SELECT * FROM execution_platform.runtime_tool_invocations WHERE invocation_id = $1",
        [input.invocationId],
      );
      const current = existing.rows[0];
      if (!current) {
        throw new Error(`runtime_tool_invocation_not_found:${input.invocationId}`);
      }
      if (TERMINAL_STATUSES.has(current.status)) {
        return rowToRecord(current);
      }
      const latencyMs = current.started_at
        ? Math.max(0, now.getTime() - current.started_at.getTime())
        : null;
      const codes = reasonCodes(["runtime_tool_canceled", ...(input.reasonCodes ?? [])]);
      const metadata = {
        canceledByRef: input.canceledByRef ?? null,
        ...(input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
          ? input.metadata
          : { metadata: input.metadata ?? null }),
      } as JsonValue;
      const updated = await tx.query<RuntimeToolInvocationRow>(
        `
          UPDATE execution_platform.runtime_tool_invocations
          SET status = 'canceled',
              error_code = 'runtime_tool_canceled',
              error_summary = $2,
              reason_codes = $3::jsonb,
              metadata = $4::jsonb,
              completed_at = COALESCE(completed_at, $5::timestamptz),
              latency_ms = $6,
              updated_at = $5::timestamptz
          WHERE invocation_id = $1
          RETURNING *
        `,
        [
          input.invocationId,
          bounded(input.cancelSummary ?? "Runtime tool invocation was canceled."),
          encodeJson(codes),
          encodeJson(metadata),
          now,
          latencyMs,
        ],
      );
      const record = rowToRecord(updated.rows[0]!);
      await scoped.appendEvent({
        invocationId: record.invocationId,
        runtimeJobId: record.runtimeJobId,
        graphId: record.graphId,
        nodeId: record.nodeId,
        eventType: "runtime_tool.canceled",
        phase: "completed",
        status: "canceled",
        messageSummary: input.cancelSummary ?? "Runtime tool invocation canceled.",
        reasonCodes: codes,
        metadata,
      });
      return record;
    });
  }

  async attachArtifact(input: RuntimeToolArtifactInput): Promise<void> {
    rejectRawFlags(input as unknown as Record<string, unknown>);
    await this.sql.query(
      `
        INSERT INTO execution_platform.runtime_tool_artifacts (
          artifact_id, invocation_id, artifact_type, storage_kind, artifact_ref,
          content_hash, bounded_summary, metadata, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::timestamptz)
        ON CONFLICT (artifact_id) DO NOTHING
      `,
      [
        input.artifactId ?? `runtime-tool-artifact-${randomUUID()}`,
        input.invocationId,
        input.artifactType,
        input.storageKind,
        input.artifactRef,
        input.contentHash,
        bounded(input.boundedSummary),
        encodeJson(input.metadata),
        this.now(),
      ],
    );
  }

  async readInvocation(invocationId: string): Promise<RuntimeToolInvocationRecord | null> {
    const result = await this.sql.query<RuntimeToolInvocationRow>(
      "SELECT * FROM execution_platform.runtime_tool_invocations WHERE invocation_id = $1",
      [invocationId],
    );
    return result.rows[0] ? rowToRecord(result.rows[0]) : null;
  }

  async listInvocations(input: {
    runtimeJobId?: string;
    graphId?: string;
    nodeId?: string;
    toolId?: string;
    status?: RuntimeToolStatus;
    limit?: number;
  }): Promise<RuntimeToolInvocationRecord[]> {
    const page = await this.listInvocationsPage(input);
    return page.items;
  }

  async listInvocationsPage(input: {
    runtimeJobId?: string;
    graphId?: string;
    nodeId?: string;
    toolId?: string;
    status?: RuntimeToolStatus;
    limit?: number;
    cursor?: string | null;
  }): Promise<RuntimeToolInvocationCursorPage> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    const add = (clause: string, value: unknown) => {
      params.push(value);
      clauses.push(`${clause} $${params.length}`);
    };
    if (input.runtimeJobId) {
      add("runtime_job_id =", input.runtimeJobId);
    }
    if (input.graphId) {
      add("graph_id =", input.graphId);
    }
    if (input.nodeId) {
      add("node_id =", input.nodeId);
    }
    if (input.toolId) {
      add("tool_id =", input.toolId);
    }
    if (input.status) {
      add("status =", input.status);
    }
    if (input.cursor) {
      const cursor = decodeCursor(input.cursor);
      params.push(cursor.createdAt, cursor.invocationId);
      clauses.push(
        `(created_at < $${params.length - 1}::timestamptz OR (created_at = $${params.length - 1}::timestamptz AND invocation_id < $${params.length}))`,
      );
    }
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const result = await this.sql.query<RuntimeToolInvocationRow>(
      `
        SELECT * FROM execution_platform.runtime_tool_invocations
        ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
        ORDER BY created_at DESC, invocation_id DESC
        LIMIT ${limit + 1}
      `,
      params,
    );
    const records = result.rows.map(rowToRecord);
    const items = records.slice(0, limit);
    return {
      items,
      hasMore: records.length > limit,
      nextCursor:
        records.length > limit && items.length > 0 ? encodeCursor(items[items.length - 1]!) : null,
    };
  }

  async pruneInvocations(
    policy: RuntimeToolRetentionPolicy = {},
  ): Promise<RuntimeToolRetentionResult> {
    const dryRun = policy.dryRun ?? true;
    const maxDelete = Math.min(Math.max(policy.maxDelete ?? 200, 1), 5_000);
    const pruneStatuses = new Set<RuntimeToolStatus>(
      policy.pruneStatuses ?? ["succeeded", "skipped", "canceled"],
    );
    const preserveStatuses = new Set<RuntimeToolStatus>(
      policy.preserveStatuses ?? ["planned", "running", "needs_review", "failed"],
    );
    const maxAgeDays = policy.maxAgeDays ?? null;
    const cutoff =
      maxAgeDays === null
        ? null
        : new Date(this.now().getTime() - maxAgeDays * 24 * 60 * 60 * 1000);
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (policy.idempotencyScopePrefix?.trim()) {
      params.push(`${policy.idempotencyScopePrefix.trim()}%`);
      clauses.push(`idempotency_scope LIKE $${params.length}`);
    }
    if (policy.toolIdPrefix?.trim()) {
      params.push(`${policy.toolIdPrefix.trim()}%`);
      clauses.push(`tool_id LIKE $${params.length}`);
    }
    const rows = await this.sql.query<RuntimeToolInvocationRow>(
      `
        SELECT *
        FROM execution_platform.runtime_tool_invocations
        ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
        ORDER BY created_at DESC, invocation_id DESC
      `,
      params,
    );
    const artifactRows = await this.sql.query<{ invocation_id: string }>(
      "SELECT DISTINCT invocation_id FROM execution_platform.runtime_tool_artifacts",
    );
    const artifactBackedIds = new Set(artifactRows.rows.map((row) => row.invocation_id));
    const keepByRuntimeJob = new Map<string, number>();
    const keepByGraph = new Map<string, number>();
    const candidates: string[] = [];
    let preservedCount = 0;
    for (const row of rows.rows) {
      const record = rowToRecord(row);
      const artifactBacked = artifactBackedIds.has(row.invocation_id);
      const tooNew = cutoff ? new Date(record.createdAt).getTime() >= cutoff.getTime() : false;
      const runtimeJobKey = record.runtimeJobId ?? "";
      const graphKey = record.graphId ?? "";
      const runtimeJobCount = keepByRuntimeJob.get(runtimeJobKey) ?? 0;
      const graphCount = keepByGraph.get(graphKey) ?? 0;
      const exceedsRuntimeJobCap =
        policy.maxCompletedRowsPerRuntimeJob !== null &&
        policy.maxCompletedRowsPerRuntimeJob !== undefined &&
        record.runtimeJobId !== null &&
        runtimeJobCount >= policy.maxCompletedRowsPerRuntimeJob;
      const exceedsGraphCap =
        policy.maxCompletedRowsPerGraph !== null &&
        policy.maxCompletedRowsPerGraph !== undefined &&
        record.graphId !== null &&
        graphCount >= policy.maxCompletedRowsPerGraph;
      const capCandidate = exceedsRuntimeJobCap || exceedsGraphCap;
      const ageCandidate = cutoff !== null && !tooNew;
      const eligible =
        pruneStatuses.has(record.status) &&
        !preserveStatuses.has(record.status) &&
        (ageCandidate || capCandidate) &&
        !((policy.preserveArtifactBacked ?? true) && artifactBacked);
      if (eligible && candidates.length < maxDelete) {
        candidates.push(record.invocationId);
      } else {
        preservedCount += 1;
      }
      if (record.runtimeJobId && pruneStatuses.has(record.status)) {
        keepByRuntimeJob.set(runtimeJobKey, runtimeJobCount + 1);
      }
      if (record.graphId && pruneStatuses.has(record.status)) {
        keepByGraph.set(graphKey, graphCount + 1);
      }
    }
    let prunedRefs: string[] = [];
    if (!dryRun && candidates.length > 0) {
      const placeholders = candidates.map((_, index) => `$${index + 1}`).join(", ");
      const deleted = await this.sql.query<{ invocation_id: string }>(
        `
          DELETE FROM execution_platform.runtime_tool_invocations
          WHERE invocation_id IN (${placeholders})
          RETURNING invocation_id
        `,
        candidates,
      );
      prunedRefs = deleted.rows.map((row) => `runtime-tool://${row.invocation_id}`);
    }
    return {
      dryRun,
      inspectedCount: rows.rows.length,
      candidateCount: candidates.length,
      prunedCount: prunedRefs.length,
      preservedCount,
      candidateRefs: candidates.slice(0, 50).map((id) => `runtime-tool://${id}`),
      prunedRefs: prunedRefs.slice(0, 50),
      reasonCodes: [
        dryRun ? "runtime_tool_retention_dry_run" : "runtime_tool_retention_pruned",
        "runtime_tool_retention_preserved_active_and_review_rows",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    };
  }

  async summarize(input: {
    runtimeJobId?: string;
    graphId?: string;
    nodeId?: string;
    limit?: number;
  }): Promise<RuntimeToolReadbackSummary> {
    const invocations = await this.listInvocations({ ...input, limit: input.limit ?? 50 });
    const latestInvocation = invocations[0] ?? null;
    const activeInvocation =
      invocations.find((invocation) => invocation.status === "running") ?? null;
    return {
      invocationCount: invocations.length,
      latestInvocation,
      activeInvocation,
      invocationRefs: invocations.map((invocation) => `runtime-tool://${invocation.invocationId}`),
      latestPhase: latestInvocation?.status ?? null,
      latestToolId: latestInvocation?.toolId ?? null,
      latestStatus: latestInvocation?.status ?? null,
      reasonCodes:
        invocations.length > 0
          ? ["runtime_tool_trace_summary_available"]
          : ["runtime_tool_trace_summary_empty"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawLogsStored: false,
      secretsStored: false,
    };
  }
}
