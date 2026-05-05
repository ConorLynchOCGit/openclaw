import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { SqlClient } from "./db/sql-client.ts";

export const RUNTIME_JOB_STATES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "canceled",
  "timed_out",
] as const;

export type RuntimeJobState = (typeof RUNTIME_JOB_STATES)[number];

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type RuntimeJob = {
  jobId: string;
  jobType: string;
  queueName: string;
  priority: number;
  state: RuntimeJobState;
  payload: JsonValue;
  result: JsonValue | null;
  error: JsonValue | null;
  idempotencyScope: string;
  idempotencyKey: string;
  parentJobId: string | null;
  parentWorkflowId: string | null;
  workItemId: string | null;
  attempts: number;
  maxAttempts: number;
  leaseTimeoutMs: number;
  runTimeoutMs: number | null;
  availableAt: Date;
  deadlineAt: Date | null;
  workerId: string | null;
  leaseId: string | null;
  leaseExpiresAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  canceledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RuntimeJobEvent = {
  eventId: string;
  jobId: string;
  eventType: string;
  eventTime: Date;
  workerId: string | null;
  leaseId: string | null;
  data: JsonValue;
};

export type RuntimeJobArtifact = {
  artifactId: string;
  jobId: string;
  artifactType: string;
  storageKind: string;
  uri: string;
  contentType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  metadata: JsonValue;
  createdAt: Date;
};

export type ClaimedRuntimeJob = {
  job: RuntimeJob;
  leaseId: string;
  leaseToken: string;
};

export type RuntimeJobRepositoryOptions = {
  now?: () => Date;
  claimStrategy?: "skip-locked" | "basic";
  maxArtifactSizeBytes?: number;
  maxArtifactMetadataBytes?: number;
};

export type EnqueueRuntimeJobInput = {
  jobId?: string;
  jobType: string;
  queueName?: string;
  priority?: number;
  payload?: JsonValue;
  idempotencyScope?: string;
  idempotencyKey?: string;
  parentJobId?: string | null;
  parentWorkflowId?: string | null;
  workItemId?: string | null;
  maxAttempts?: number;
  leaseTimeoutMs?: number;
  runTimeoutMs?: number | null;
  availableAt?: Date;
};

export type ClaimRuntimeJobInput = {
  workerId: string;
  queueName?: string;
  jobTypes?: string[];
  runtimeJobId?: string;
};

export type ListRecentRuntimeJobsInput = {
  states?: RuntimeJobState[];
  queueName?: string;
  jobTypes?: string[];
  limit?: number;
};

export type AttachRuntimeJobArtifactInput = {
  artifactId?: string;
  jobId: string;
  artifactType: string;
  storageKind: string;
  uri: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  sha256?: string | null;
  metadata?: JsonValue;
};

type RuntimeJobRow = QueryResultRow & {
  job_id: string;
  job_type: string;
  queue_name: string;
  priority: number;
  state: RuntimeJobState;
  payload: JsonValue;
  result: JsonValue | null;
  error: JsonValue | null;
  idempotency_scope: string;
  idempotency_key: string;
  parent_job_id: string | null;
  parent_workflow_id: string | null;
  work_item_id: string | null;
  attempts: number;
  max_attempts: number;
  lease_timeout_ms: number;
  run_timeout_ms: number | null;
  available_at: Date | string;
  deadline_at: Date | string | null;
  worker_id: string | null;
  lease_id: string | null;
  lease_expires_at: Date | string | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  canceled_at: Date | string | null;
  cancellation_reason: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type RuntimeJobEventRow = QueryResultRow & {
  event_id: string;
  job_id: string;
  event_type: string;
  event_time: Date | string;
  worker_id: string | null;
  lease_id: string | null;
  data: JsonValue;
};

type RuntimeJobArtifactRow = QueryResultRow & {
  artifact_id: string;
  job_id: string;
  artifact_type: string;
  storage_kind: string;
  uri: string;
  content_type: string | null;
  size_bytes: number | string | null;
  sha256: string | null;
  metadata: JsonValue;
  created_at: Date | string;
};

const DEFAULT_QUEUE_NAME = "default";
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_LEASE_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ARTIFACT_SIZE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_ARTIFACT_METADATA_BYTES = 64 * 1024;

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function nullableDate(value: Date | string | null): Date | null {
  return value === null ? null : toDate(value);
}

function encodeJson(value: JsonValue | undefined): string {
  return JSON.stringify(value ?? {});
}

function decodeJob(row: RuntimeJobRow): RuntimeJob {
  return {
    jobId: row.job_id,
    jobType: row.job_type,
    queueName: row.queue_name,
    priority: row.priority,
    state: row.state,
    payload: row.payload,
    result: row.result,
    error: row.error,
    idempotencyScope: row.idempotency_scope,
    idempotencyKey: row.idempotency_key,
    parentJobId: row.parent_job_id,
    parentWorkflowId: row.parent_workflow_id,
    workItemId: row.work_item_id,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    leaseTimeoutMs: row.lease_timeout_ms,
    runTimeoutMs: row.run_timeout_ms,
    availableAt: toDate(row.available_at),
    deadlineAt: nullableDate(row.deadline_at),
    workerId: row.worker_id,
    leaseId: row.lease_id,
    leaseExpiresAt: nullableDate(row.lease_expires_at),
    startedAt: nullableDate(row.started_at),
    completedAt: nullableDate(row.completed_at),
    canceledAt: nullableDate(row.canceled_at),
    cancellationReason: row.cancellation_reason,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function decodeEvent(row: RuntimeJobEventRow): RuntimeJobEvent {
  return {
    eventId: row.event_id,
    jobId: row.job_id,
    eventType: row.event_type,
    eventTime: toDate(row.event_time),
    workerId: row.worker_id,
    leaseId: row.lease_id,
    data: row.data,
  };
}

function decodeArtifact(row: RuntimeJobArtifactRow): RuntimeJobArtifact {
  return {
    artifactId: row.artifact_id,
    jobId: row.job_id,
    artifactType: row.artifact_type,
    storageKind: row.storage_kind,
    uri: row.uri,
    contentType: row.content_type,
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    sha256: row.sha256,
    metadata: row.metadata,
    createdAt: toDate(row.created_at),
  };
}

function addMilliseconds(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + milliseconds);
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function assertJsonByteLength(value: JsonValue, maxBytes: number, name: string): void {
  const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (bytes > maxBytes) {
    throw new Error(`${name} exceeds ${maxBytes} bytes`);
  }
}

export class RuntimeJobRepository {
  private readonly now: () => Date;
  private readonly claimStrategy: "skip-locked" | "basic";
  private readonly maxArtifactSizeBytes: number;
  private readonly maxArtifactMetadataBytes: number;

  constructor(
    private readonly sql: SqlClient,
    options: RuntimeJobRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.claimStrategy = options.claimStrategy ?? "skip-locked";
    this.maxArtifactSizeBytes = options.maxArtifactSizeBytes ?? DEFAULT_MAX_ARTIFACT_SIZE_BYTES;
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_ARTIFACT_METADATA_BYTES;
  }

  async enqueueJob(input: EnqueueRuntimeJobInput): Promise<RuntimeJob> {
    const jobId = input.jobId ?? randomUUID();
    const queueName = input.queueName ?? DEFAULT_QUEUE_NAME;
    const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const leaseTimeoutMs = input.leaseTimeoutMs ?? DEFAULT_LEASE_TIMEOUT_MS;
    assertPositiveInteger(maxAttempts, "maxAttempts");
    assertPositiveInteger(leaseTimeoutMs, "leaseTimeoutMs");
    if (input.runTimeoutMs !== undefined && input.runTimeoutMs !== null) {
      assertPositiveInteger(input.runTimeoutMs, "runTimeoutMs");
    }

    const idempotencyScope = input.idempotencyScope ?? input.jobType;
    const idempotencyKey = input.idempotencyKey ?? `job:${jobId}`;
    const now = this.now();

    const result = await this.sql.withTransaction(async (tx) => {
      const inserted = await tx.query<RuntimeJobRow>(
        `
          INSERT INTO execution_platform.runtime_jobs (
            job_id,
            job_type,
            queue_name,
            priority,
            payload,
            idempotency_scope,
            idempotency_key,
            parent_job_id,
            parent_workflow_id,
            work_item_id,
            max_attempts,
            lease_timeout_ms,
            run_timeout_ms,
            available_at,
            created_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14::timestamptz,
            $15::timestamptz, $15::timestamptz
          )
          ON CONFLICT (idempotency_scope, idempotency_key) DO NOTHING
          RETURNING *
        `,
        [
          jobId,
          input.jobType,
          queueName,
          input.priority ?? 0,
          encodeJson(input.payload),
          idempotencyScope,
          idempotencyKey,
          input.parentJobId ?? null,
          input.parentWorkflowId ?? null,
          input.workItemId ?? null,
          maxAttempts,
          leaseTimeoutMs,
          input.runTimeoutMs ?? null,
          input.availableAt ?? now,
          now,
        ],
      );
      const row =
        inserted.rows[0] ??
        (
          await tx.query<RuntimeJobRow>(
            `
              SELECT *
              FROM execution_platform.runtime_jobs
              WHERE idempotency_scope = $1 AND idempotency_key = $2
            `,
            [idempotencyScope, idempotencyKey],
          )
        ).rows[0];
      if (!row) {
        throw new Error("failed to enqueue or load runtime job");
      }
      if (inserted.rows[0]) {
        await this.recordEventInTx(tx, {
          jobId: row.job_id,
          eventType: "job.enqueued",
          data: { queueName, jobType: input.jobType },
          eventTime: now,
        });
      }
      return decodeJob(row);
    });
    return result;
  }

  async getJob(jobId: string): Promise<RuntimeJob | null> {
    const result = await this.sql.query<RuntimeJobRow>(
      "SELECT * FROM execution_platform.runtime_jobs WHERE job_id = $1",
      [jobId],
    );
    return result.rows[0] ? decodeJob(result.rows[0]) : null;
  }

  async listRecentJobs(input: ListRecentRuntimeJobsInput = {}): Promise<RuntimeJob[]> {
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
      throw new Error("limit must be an integer between 1 and 500");
    }
    const filters: string[] = [];
    const params: unknown[] = [];
    if (input.states && input.states.length > 0) {
      params.push(input.states);
      filters.push(`state = ANY($${params.length}::text[])`);
    }
    if (input.queueName) {
      params.push(input.queueName);
      filters.push(`queue_name = $${params.length}`);
    }
    if (input.jobTypes && input.jobTypes.length > 0) {
      params.push(input.jobTypes);
      filters.push(`job_type = ANY($${params.length}::text[])`);
    }
    params.push(limit);
    const result = await this.sql.query<RuntimeJobRow>(
      `
        SELECT *
        FROM execution_platform.runtime_jobs
        ${filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : ""}
        ORDER BY updated_at DESC, created_at DESC, job_id ASC
        LIMIT $${params.length}
      `,
      params,
    );
    return result.rows.map(decodeJob);
  }

  async claimNextJob(input: ClaimRuntimeJobInput): Promise<ClaimedRuntimeJob | null> {
    const queueName = input.queueName ?? DEFAULT_QUEUE_NAME;
    const now = this.now();
    const leaseId = randomUUID();
    const leaseToken = randomUUID();

    return this.sql.withTransaction(async (tx) => {
      const filters: string[] = [];
      const params: unknown[] = [queueName, now];
      if (input.jobTypes && input.jobTypes.length > 0) {
        params.push(input.jobTypes);
        filters.push(`job_type = ANY($${params.length}::text[])`);
      }
      if (input.runtimeJobId?.trim()) {
        params.push(input.runtimeJobId.trim());
        filters.push(`job_id = $${params.length}`);
      }
      const lockClause = this.claimStrategy === "skip-locked" ? "FOR UPDATE SKIP LOCKED" : "";
      const selected = await tx.query<RuntimeJobRow>(
        `
          SELECT *
          FROM execution_platform.runtime_jobs
          WHERE
            queue_name = $1
            AND state = 'pending'
            AND available_at <= $2::timestamptz
            ${filters.length > 0 ? `AND ${filters.join(" AND ")}` : ""}
          ORDER BY priority DESC, created_at ASC, job_id ASC
          LIMIT 1
          ${lockClause}
        `,
        params,
      );
      const candidate = selected.rows[0];
      if (!candidate) {
        return null;
      }
      const leaseExpiresAt = addMilliseconds(now, candidate.lease_timeout_ms);
      const deadlineAt =
        candidate.run_timeout_ms === null ? null : addMilliseconds(now, candidate.run_timeout_ms);
      const result = await tx.query<RuntimeJobRow>(
        `
          UPDATE execution_platform.runtime_jobs
          SET
            state = 'running',
            attempts = attempts + 1,
            worker_id = $3,
            lease_id = $4,
            lease_expires_at = $5::timestamptz,
            started_at = COALESCE(started_at, $2::timestamptz),
            deadline_at = $6::timestamptz,
            updated_at = $2::timestamptz
          WHERE job_id = $1 AND state = 'pending'
          RETURNING *
        `,
        [candidate.job_id, now, input.workerId, leaseId, leaseExpiresAt, deadlineAt],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      await tx.query(
        `
          INSERT INTO execution_platform.runtime_job_leases (
            lease_id,
            job_id,
            worker_id,
            lease_token,
            claimed_at,
            heartbeat_at,
            expires_at
          )
          VALUES ($1, $2, $3, $4, $5::timestamptz, $5::timestamptz, $6::timestamptz)
        `,
        [leaseId, row.job_id, input.workerId, leaseToken, now, row.lease_expires_at],
      );
      await this.recordEventInTx(tx, {
        jobId: row.job_id,
        eventType: "job.claimed",
        workerId: input.workerId,
        leaseId,
        data: { attempt: row.attempts },
        eventTime: now,
      });
      return {
        job: decodeJob(row),
        leaseId,
        leaseToken,
      };
    });
  }

  async renewLease(input: {
    leaseToken: string;
    extendByMs?: number;
    workerId?: string;
  }): Promise<RuntimeJob | null> {
    const now = this.now();
    return this.sql.withTransaction(async (tx) => {
      const active = await this.loadActiveLeaseJob(tx, input.leaseToken, now);
      if (!active) {
        return null;
      }
      const leaseExpiresAt = addMilliseconds(now, input.extendByMs ?? active.lease_timeout_ms);
      const result = await tx.query<RuntimeJobRow>(
        `
          UPDATE execution_platform.runtime_jobs
          SET
            lease_expires_at = $2::timestamptz,
            updated_at = $3::timestamptz
          WHERE
            job_id = $1
            AND state = 'running'
          RETURNING *
        `,
        [active.job_id, leaseExpiresAt, now],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      await tx.query(
        `
          UPDATE execution_platform.runtime_job_leases
          SET
            heartbeat_at = $2::timestamptz,
            expires_at = $3::timestamptz
          WHERE lease_token = $1 AND released_at IS NULL
        `,
        [input.leaseToken, now, leaseExpiresAt],
      );
      await this.recordEventInTx(tx, {
        jobId: row.job_id,
        eventType: "job.lease_renewed",
        workerId: input.workerId ?? row.worker_id,
        leaseId: row.lease_id,
        data: {
          leaseExpiresAt: row.lease_expires_at ? toDate(row.lease_expires_at).toISOString() : null,
        },
        eventTime: now,
      });
      return decodeJob(row);
    });
  }

  async completeJob(input: { leaseToken: string; result?: JsonValue }): Promise<RuntimeJob | null> {
    const now = this.now();
    return this.sql.withTransaction(async (tx) => {
      const row = await this.loadActiveLeaseJob(tx, input.leaseToken, now);
      if (!row) {
        return null;
      }
      const updated = await tx.query<RuntimeJobRow>(
        `
          UPDATE execution_platform.runtime_jobs
          SET
            state = 'succeeded',
            result = $2::jsonb,
            completed_at = $3::timestamptz,
            worker_id = NULL,
            lease_id = NULL,
            lease_expires_at = NULL,
            updated_at = $3::timestamptz
          WHERE job_id = $1 AND state = 'running'
          RETURNING *
        `,
        [row.job_id, encodeJson(input.result), now],
      );
      await this.releaseLeaseInTx(tx, input.leaseToken, now, "completed");
      await this.recordEventInTx(tx, {
        jobId: row.job_id,
        eventType: "job.succeeded",
        workerId: row.worker_id,
        leaseId: row.lease_id,
        data: {},
        eventTime: now,
      });
      return updated.rows[0] ? decodeJob(updated.rows[0]) : null;
    });
  }

  async failJob(input: {
    leaseToken: string;
    error: JsonValue;
    retryDelayMs?: number;
  }): Promise<RuntimeJob | null> {
    const now = this.now();
    const retryDelayMs = input.retryDelayMs ?? 0;
    if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0) {
      throw new Error("retryDelayMs must be a non-negative integer");
    }
    return this.sql.withTransaction(async (tx) => {
      const row = await this.loadActiveLeaseJob(tx, input.leaseToken, now);
      if (!row) {
        return null;
      }
      const shouldRetry = row.attempts < row.max_attempts;
      const updated = await tx.query<RuntimeJobRow>(
        `
          UPDATE execution_platform.runtime_jobs
          SET
            state = $2,
            error = $3::jsonb,
            available_at = $4::timestamptz,
            completed_at = CASE WHEN $2 = 'failed' THEN $5::timestamptz ELSE NULL END,
            worker_id = NULL,
            lease_id = NULL,
            lease_expires_at = NULL,
            deadline_at = NULL,
            updated_at = $5::timestamptz
          WHERE job_id = $1 AND state = 'running'
          RETURNING *
        `,
        [
          row.job_id,
          shouldRetry ? "pending" : "failed",
          encodeJson(input.error),
          addMilliseconds(now, retryDelayMs),
          now,
        ],
      );
      await this.releaseLeaseInTx(tx, input.leaseToken, now, shouldRetry ? "retry" : "failed");
      await this.recordEventInTx(tx, {
        jobId: row.job_id,
        eventType: shouldRetry ? "job.retry_scheduled" : "job.failed",
        workerId: row.worker_id,
        leaseId: row.lease_id,
        data: {
          attempt: row.attempts,
          maxAttempts: row.max_attempts,
          retryDelayMs,
          error: input.error,
        },
        eventTime: now,
      });
      return updated.rows[0] ? decodeJob(updated.rows[0]) : null;
    });
  }

  async cancelJob(jobId: string, reason: string): Promise<RuntimeJob | null> {
    const now = this.now();
    return this.sql.withTransaction(async (tx) => {
      const result = await tx.query<RuntimeJobRow>(
        `
          UPDATE execution_platform.runtime_jobs
          SET
            state = 'canceled',
            cancellation_reason = $2,
            canceled_at = $3::timestamptz,
            completed_at = $3::timestamptz,
            worker_id = NULL,
            lease_id = NULL,
            lease_expires_at = NULL,
            updated_at = $3::timestamptz
          WHERE job_id = $1 AND state IN ('pending', 'running')
          RETURNING *
        `,
        [jobId, reason, now],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      await tx.query(
        `
          UPDATE execution_platform.runtime_job_leases
          SET released_at = $2::timestamptz, release_reason = 'canceled'
          WHERE job_id = $1 AND released_at IS NULL
        `,
        [jobId, now],
      );
      await this.recordEventInTx(tx, {
        jobId,
        eventType: "job.canceled",
        workerId: row.worker_id,
        leaseId: row.lease_id,
        data: { reason },
        eventTime: now,
      });
      return decodeJob(row);
    });
  }

  async recoverExpiredLeases(
    input: { queueName?: string; jobTypes?: string[] } = {},
  ): Promise<RuntimeJob[]> {
    const now = this.now();
    return this.sql.withTransaction(async (tx) => {
      const filters: string[] = [];
      const params: unknown[] = [now];
      if (input.queueName) {
        params.push(input.queueName);
        filters.push(`AND queue_name = $${params.length}`);
      }
      if (input.jobTypes && input.jobTypes.length > 0) {
        params.push(input.jobTypes);
        filters.push(`AND job_type = ANY($${params.length}::text[])`);
      }
      const expired = await tx.query<RuntimeJobRow>(
        `
          SELECT *
          FROM execution_platform.runtime_jobs
          WHERE
            state = 'running'
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at <= $1::timestamptz
            AND (deadline_at IS NULL OR deadline_at > $1::timestamptz)
            ${filters.join("\n            ")}
          ORDER BY lease_expires_at ASC, job_id ASC
        `,
        params,
      );
      const recovered: RuntimeJob[] = [];
      for (const row of expired.rows) {
        const retryable = row.attempts < row.max_attempts;
        const updated = await tx.query<RuntimeJobRow>(
          `
            UPDATE execution_platform.runtime_jobs
            SET
              state = $2,
              error = CASE WHEN $2 = 'failed' THEN $3::jsonb ELSE error END,
              available_at = $4::timestamptz,
              completed_at = CASE WHEN $2 = 'failed' THEN $4::timestamptz ELSE NULL END,
              worker_id = NULL,
              lease_id = NULL,
              lease_expires_at = NULL,
              deadline_at = NULL,
              updated_at = $4::timestamptz
            WHERE job_id = $1
            RETURNING *
          `,
          [
            row.job_id,
            retryable ? "pending" : "failed",
            encodeJson({ code: "lease_expired_attempts_exhausted" }),
            now,
          ],
        );
        await tx.query(
          `
            UPDATE execution_platform.runtime_job_leases
            SET released_at = $2::timestamptz, release_reason = 'expired'
            WHERE job_id = $1 AND released_at IS NULL
          `,
          [row.job_id, now],
        );
        await this.recordEventInTx(tx, {
          jobId: row.job_id,
          eventType: retryable ? "job.lease_expired" : "job.failed",
          workerId: row.worker_id,
          leaseId: row.lease_id,
          data: { attempt: row.attempts, maxAttempts: row.max_attempts },
          eventTime: now,
        });
        if (updated.rows[0]) {
          recovered.push(decodeJob(updated.rows[0]));
        }
      }
      return recovered;
    });
  }

  async markTimedOutJobs(): Promise<RuntimeJob[]> {
    const now = this.now();
    return this.sql.withTransaction(async (tx) => {
      const result = await tx.query<RuntimeJobRow>(
        `
          UPDATE execution_platform.runtime_jobs
          SET
            state = 'timed_out',
            error = $2::jsonb,
            completed_at = $1::timestamptz,
            worker_id = NULL,
            lease_id = NULL,
            lease_expires_at = NULL,
            updated_at = $1::timestamptz
          WHERE state = 'running' AND deadline_at IS NOT NULL AND deadline_at <= $1::timestamptz
          RETURNING *
        `,
        [now, encodeJson({ code: "job_timed_out" })],
      );
      for (const row of result.rows) {
        await tx.query(
          `
            UPDATE execution_platform.runtime_job_leases
            SET released_at = $2::timestamptz, release_reason = 'timed_out'
            WHERE job_id = $1 AND released_at IS NULL
          `,
          [row.job_id, now],
        );
        await this.recordEventInTx(tx, {
          jobId: row.job_id,
          eventType: "job.timed_out",
          workerId: row.worker_id,
          leaseId: row.lease_id,
          data: {},
          eventTime: now,
        });
      }
      return result.rows.map(decodeJob);
    });
  }

  async recordEvent(input: {
    jobId: string;
    eventType: string;
    workerId?: string | null;
    leaseId?: string | null;
    data?: JsonValue;
  }): Promise<RuntimeJobEvent> {
    const event = await this.recordEventInTx(this.sql, {
      ...input,
      eventTime: this.now(),
    });
    return event;
  }

  async listEvents(jobId: string, limit = 50): Promise<RuntimeJobEvent[]> {
    const result = await this.sql.query<RuntimeJobEventRow>(
      `
        SELECT *
        FROM execution_platform.runtime_job_events
        WHERE job_id = $1
        ORDER BY event_time ASC, event_id ASC
        LIMIT $2
      `,
      [jobId, limit],
    );
    return result.rows.map(decodeEvent);
  }

  async attachArtifact(input: AttachRuntimeJobArtifactInput): Promise<RuntimeJobArtifact> {
    if (input.uri.length > 2048) {
      throw new Error("artifact uri exceeds 2048 characters");
    }
    if (input.sizeBytes !== undefined && input.sizeBytes !== null) {
      if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 0) {
        throw new Error("artifact sizeBytes must be a non-negative integer");
      }
      if (input.sizeBytes > this.maxArtifactSizeBytes) {
        throw new Error(`artifact sizeBytes exceeds ${this.maxArtifactSizeBytes}`);
      }
    }
    const metadata = input.metadata ?? {};
    assertJsonByteLength(metadata, this.maxArtifactMetadataBytes, "artifact metadata");
    const now = this.now();
    const result = await this.sql.query<RuntimeJobArtifactRow>(
      `
        INSERT INTO execution_platform.runtime_job_artifacts (
          artifact_id,
          job_id,
          artifact_type,
          storage_kind,
          uri,
          content_type,
          size_bytes,
          sha256,
          metadata,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::timestamptz)
        RETURNING *
      `,
      [
        input.artifactId ?? randomUUID(),
        input.jobId,
        input.artifactType,
        input.storageKind,
        input.uri,
        input.contentType ?? null,
        input.sizeBytes ?? null,
        input.sha256 ?? null,
        encodeJson(metadata),
        now,
      ],
    );
    await this.recordEvent({
      jobId: input.jobId,
      eventType: "job.artifact_attached",
      data: { artifactId: result.rows[0]?.artifact_id ?? null, artifactType: input.artifactType },
    });
    if (!result.rows[0]) {
      throw new Error("failed to attach runtime job artifact");
    }
    return decodeArtifact(result.rows[0]);
  }

  async listArtifacts(jobId: string): Promise<RuntimeJobArtifact[]> {
    const result = await this.sql.query<RuntimeJobArtifactRow>(
      `
        SELECT *
        FROM execution_platform.runtime_job_artifacts
        WHERE job_id = $1
        ORDER BY created_at ASC, artifact_id ASC
      `,
      [jobId],
    );
    return result.rows.map(decodeArtifact);
  }

  private async loadActiveLeaseJob(
    tx: SqlClient,
    leaseToken: string,
    now: Date,
  ): Promise<RuntimeJobRow | null> {
    const result = await tx.query<RuntimeJobRow>(
      `
        SELECT job.*
        FROM execution_platform.runtime_jobs AS job
        JOIN execution_platform.runtime_job_leases AS lease ON lease.job_id = job.job_id
        WHERE
          lease.lease_token = $1
          AND lease.released_at IS NULL
          AND lease.expires_at > $2::timestamptz
          AND job.state = 'running'
      `,
      [leaseToken, now],
    );
    return result.rows[0] ?? null;
  }

  private async releaseLeaseInTx(
    tx: SqlClient,
    leaseToken: string,
    now: Date,
    releaseReason: string,
  ): Promise<void> {
    await tx.query(
      `
        UPDATE execution_platform.runtime_job_leases
        SET released_at = $2::timestamptz, release_reason = $3
        WHERE lease_token = $1 AND released_at IS NULL
      `,
      [leaseToken, now, releaseReason],
    );
  }

  private async recordEventInTx(
    tx: SqlClient,
    input: {
      jobId: string;
      eventType: string;
      workerId?: string | null;
      leaseId?: string | null;
      data?: JsonValue;
      eventTime: Date;
    },
  ): Promise<RuntimeJobEvent> {
    const result = await tx.query<RuntimeJobEventRow>(
      `
        INSERT INTO execution_platform.runtime_job_events (
          event_id,
          job_id,
          event_type,
          event_time,
          worker_id,
          lease_id,
          data
        )
        VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7::jsonb)
        RETURNING *
      `,
      [
        randomUUID(),
        input.jobId,
        input.eventType,
        input.eventTime,
        input.workerId ?? null,
        input.leaseId ?? null,
        encodeJson(input.data),
      ],
    );
    if (!result.rows[0]) {
      throw new Error("failed to record runtime job event");
    }
    return decodeEvent(result.rows[0]);
  }
}
