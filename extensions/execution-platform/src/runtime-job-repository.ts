import { createHash, randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { SqlClient } from "./db/sql-client.ts";
import {
  assertRuntimeArtifactContractStorage,
  buildRuntimeArtifactContractPayloadInput,
  findRuntimeArtifactLegacyBody,
  getRuntimeArtifactContract,
  type RuntimeArtifactContractAttachInput,
  type RuntimeArtifactContractHydrationResult,
} from "./runtime-artifact-contracts.ts";

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

export const RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND = "runtime-artifact-payload";
export const RUNTIME_JOB_ARTIFACT_PAYLOAD_MANIFEST_SCHEMA_VERSION =
  "execution-platform.runtime-job-artifact-payload-manifest.v1";

export type RuntimeJobArtifactPayload = {
  payloadRef: string;
  jobId: string;
  artifactType: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  body: JsonValue;
  createdAt: Date;
};

export type RuntimeJobArtifactPayloadParts = {
  root: RuntimeJobArtifactPayload;
  parts: RuntimeJobArtifactPayload[];
  partRefs: string[];
  totalSizeBytes: number;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type RuntimeJobArtifactPayloadManifest = {
  artifactKind: "runtime_job_artifact_payload_manifest";
  schemaVersion: typeof RUNTIME_JOB_ARTIFACT_PAYLOAD_MANIFEST_SCHEMA_VERSION;
  jobId: string;
  artifactType: string;
  artifactRef: string;
  payloadRef: string;
  storageKind: typeof RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND;
  contentType: string;
  byteCount: number;
  sha256: string;
  partCount: 1;
  partRefs: [];
  boundedSummary: string | null;
  targetCommitmentIds: string[];
  targetNodeIds: string[];
  resourcePacketKind: string | null;
  readinessStatus: string | null;
  reasonCodes: string[];
  inputCounts: JsonValue;
  outputCounts: JsonValue;
  maxBounds: JsonValue;
  hydrationToolId: "artifact.payload.get_json";
  createdBy: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
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

export type PutRuntimeJobJsonPayloadInput = {
  payloadRef?: string;
  jobId: string;
  artifactType: string;
  contentType?: string;
  body: JsonValue;
};

export type PutRuntimeJobJsonPayloadPartsInput = {
  rootPayloadRef?: string;
  jobId: string;
  artifactType: string;
  contentType?: string;
  parts: JsonValue[];
  boundedSummary?: string | null;
};

export type AttachRuntimeJobJsonPayloadArtifactInput = {
  artifactId?: string;
  jobId: string;
  artifactType: string;
  uri: string;
  contentType?: string;
  body: JsonValue;
  boundedSummary?: string | null;
  targetCommitmentIds?: string[];
  targetNodeIds?: string[];
  resourcePacketKind?: string | null;
  readinessStatus?: string | null;
  reasonCodes?: string[];
  inputCounts?: JsonValue;
  outputCounts?: JsonValue;
  maxBounds?: JsonValue;
  createdBy?: string | null;
  metadata?: Record<string, JsonValue>;
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

type RuntimeJobArtifactPayloadRow = QueryResultRow & {
  payload_ref: string;
  job_id: string;
  artifact_type: string;
  content_type: string;
  size_bytes: number | string;
  sha256: string;
  body: JsonValue;
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

function jsonByteLength(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function sha256Json(value: JsonValue): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function boundedText(value: string | null | undefined, max: number): string | null {
  const normalized = (value ?? "").trim().replace(/\s+/gu, " ");
  if (!normalized) {
    return null;
  }
  return normalized.length <= max
    ? normalized
    : `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
}

function boundedStringArray(
  values: string[] | undefined,
  maxItems: number,
  maxChars: number,
): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values ?? []) {
    const normalized = boundedText(value, maxChars);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= maxItems) {
      break;
    }
  }
  return output;
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

function decodeArtifactPayload(row: RuntimeJobArtifactPayloadRow): RuntimeJobArtifactPayload {
  return {
    payloadRef: row.payload_ref,
    jobId: row.job_id,
    artifactType: row.artifact_type,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    body: row.body,
    createdAt: toDate(row.created_at),
  };
}

export function isRuntimeJobArtifactPayloadManifest(
  value: JsonValue,
): value is RuntimeJobArtifactPayloadManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, JsonValue>;
  return (
    record.artifactKind === "runtime_job_artifact_payload_manifest" &&
    record.schemaVersion === RUNTIME_JOB_ARTIFACT_PAYLOAD_MANIFEST_SCHEMA_VERSION &&
    record.storageKind === RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND &&
    typeof record.payloadRef === "string"
  );
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

const RAW_STORAGE_FLAG_NAMES = new Set([
  "rawPromptStored",
  "rawResponseStored",
  "rawTranscriptStored",
  "rawProviderLogStored",
  "rawToolLogStored",
  "rawCommandLogStored",
  "rawDbRowsStored",
  "secretsStored",
]);

function assertNoUnsafeRawStorageFlags(value: JsonValue, path = "payload"): void {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoUnsafeRawStorageFlags(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (RAW_STORAGE_FLAG_NAMES.has(key) && entry !== false) {
      throw new Error(`${path}.${key} must be false`);
    }
    assertNoUnsafeRawStorageFlags(entry, `${path}.${key}`);
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

  async markJobNeedsReview(input: {
    leaseToken: string;
    error: JsonValue;
    result?: JsonValue;
  }): Promise<RuntimeJob | null> {
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
            state = 'failed',
            error = $2::jsonb,
            result = $3::jsonb,
            available_at = $4::timestamptz,
            completed_at = $4::timestamptz,
            worker_id = NULL,
            lease_id = NULL,
            lease_expires_at = NULL,
            deadline_at = NULL,
            updated_at = $4::timestamptz
          WHERE job_id = $1 AND state = 'running'
          RETURNING *
        `,
        [
          row.job_id,
          encodeJson(input.error),
          encodeJson(input.result ?? { status: "needs_review" }),
          now,
        ],
      );
      await this.releaseLeaseInTx(tx, input.leaseToken, now, "failed");
      await this.recordEventInTx(tx, {
        jobId: row.job_id,
        eventType: "job.needs_review",
        workerId: row.worker_id,
        leaseId: row.lease_id,
        data: {
          attempt: row.attempts,
          maxAttempts: row.max_attempts,
          error: input.error,
          retryScheduled: false,
        },
        eventTime: now,
      });
      return updated.rows[0] ? decodeJob(updated.rows[0]) : null;
    });
  }

  async resumePendingJobWithPayloadPatch(input: {
    jobId: string;
    payloadPatch: Record<string, JsonValue>;
    workerId?: string | null;
    reasonCodes?: string[];
  }): Promise<RuntimeJob | null> {
    const now = this.now();
    assertJsonByteLength(input.payloadPatch as JsonValue, 16_384, "runtime job payload patch");
    return this.sql.withTransaction(async (tx) => {
      const current = await tx.query<RuntimeJobRow>(
        `
          SELECT *
          FROM execution_platform.runtime_jobs
          WHERE job_id = $1 AND state = 'pending'
          FOR UPDATE
        `,
        [input.jobId],
      );
      const row = current.rows[0];
      if (!row) {
        return null;
      }
      const existing =
        row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
          ? (row.payload as Record<string, JsonValue>)
          : {};
      const payload = {
        ...existing,
        ...input.payloadPatch,
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutated: false,
      } satisfies Record<string, JsonValue>;
      assertJsonByteLength(payload, 131_072, "runtime job resumed payload");
      const updated = await tx.query<RuntimeJobRow>(
        `
          UPDATE execution_platform.runtime_jobs
          SET
            payload = $2::jsonb,
            error = NULL,
            available_at = $3::timestamptz,
            deadline_at = NULL,
            updated_at = $3::timestamptz
          WHERE job_id = $1 AND state = 'pending'
          RETURNING *
        `,
        [input.jobId, encodeJson(payload), now],
      );
      await this.recordEventInTx(tx, {
        jobId: input.jobId,
        eventType: "job.human_input_received",
        workerId: input.workerId ?? null,
        leaseId: null,
        data: {
          reasonCodes: (input.reasonCodes ?? ["human_operator_input_received"]).slice(0, 12),
          payloadPatchKeys: Object.keys(input.payloadPatch).toSorted().slice(0, 20),
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
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

  async listRecentEvents(jobId: string, limit = 50): Promise<RuntimeJobEvent[]> {
    const result = await this.sql.query<RuntimeJobEventRow>(
      `
        SELECT *
        FROM execution_platform.runtime_job_events
        WHERE job_id = $1
        ORDER BY event_time DESC, event_id DESC
        LIMIT $2
      `,
      [jobId, limit],
    );
    return result.rows.map(decodeEvent).toReversed();
  }

  async putJsonPayload(input: PutRuntimeJobJsonPayloadInput): Promise<RuntimeJobArtifactPayload> {
    const body = input.body;
    assertNoUnsafeRawStorageFlags(body, "artifact payload");
    const sizeBytes = jsonByteLength(body);
    if (sizeBytes > this.maxArtifactSizeBytes) {
      throw new Error(`artifact payload sizeBytes exceeds ${this.maxArtifactSizeBytes}`);
    }
    const sha256 = sha256Json(body);
    const contentType = input.contentType ?? "application/json";
    const payloadRef =
      input.payloadRef ??
      `runtime-artifact-payload://${encodeURIComponent(input.jobId)}/${encodeURIComponent(
        input.artifactType,
      )}/${sha256}`;
    const now = this.now();
    const result = await this.sql.query<RuntimeJobArtifactPayloadRow>(
      `
        INSERT INTO execution_platform.runtime_job_artifact_payloads (
          payload_ref,
          job_id,
          artifact_type,
          content_type,
          size_bytes,
          sha256,
          body,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz)
        ON CONFLICT (payload_ref) DO UPDATE
          SET payload_ref = execution_platform.runtime_job_artifact_payloads.payload_ref
        RETURNING *
      `,
      [
        payloadRef,
        input.jobId,
        input.artifactType,
        contentType,
        sizeBytes,
        sha256,
        encodeJson(body),
        now,
      ],
    );
    if (!result.rows[0]) {
      throw new Error("failed to store runtime job artifact payload");
    }
    const payload = decodeArtifactPayload(result.rows[0]);
    if (payload.sha256 !== sha256 || payload.sizeBytes !== sizeBytes) {
      throw new Error("artifact payload ref collision with different content");
    }
    await this.recordEvent({
      jobId: input.jobId,
      eventType: "job.artifact_payload_stored",
      data: {
        payloadRef,
        artifactType: input.artifactType,
        sizeBytes,
        sha256,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    });
    return payload;
  }

  async putJsonPayloadParts(
    input: PutRuntimeJobJsonPayloadPartsInput,
  ): Promise<RuntimeJobArtifactPayloadParts> {
    if (input.parts.length === 0) {
      throw new Error("artifact payload parts must include at least one part");
    }
    const parts: RuntimeJobArtifactPayload[] = [];
    for (const [index, part] of input.parts.entries()) {
      const partHash = sha256Json(part);
      parts.push(
        await this.putJsonPayload({
          jobId: input.jobId,
          artifactType: `${input.artifactType}.part`,
          contentType: input.contentType ?? "application/json",
          payloadRef: `runtime-artifact-payload://${encodeURIComponent(
            input.jobId,
          )}/${encodeURIComponent(input.artifactType)}/part/${index + 1}/${partHash}`,
          body: part,
        }),
      );
    }
    const rootBody = {
      artifactKind: "runtime_job_artifact_payload_parts_root",
      schemaVersion: RUNTIME_JOB_ARTIFACT_PAYLOAD_MANIFEST_SCHEMA_VERSION,
      jobId: input.jobId,
      artifactType: input.artifactType,
      boundedSummary: boundedText(input.boundedSummary, 1_200),
      partCount: parts.length,
      partRefs: parts.map((part) => part.payloadRef),
      partHashes: parts.map((part) => part.sha256),
      partByteCounts: parts.map((part) => part.sizeBytes),
      totalSizeBytes: parts.reduce((total, part) => total + part.sizeBytes, 0),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    } satisfies JsonValue;
    const root = await this.putJsonPayload({
      jobId: input.jobId,
      artifactType: input.artifactType,
      contentType: input.contentType ?? "application/json",
      payloadRef: input.rootPayloadRef,
      body: rootBody,
    });
    return {
      root,
      parts,
      partRefs: parts.map((part) => part.payloadRef),
      totalSizeBytes: parts.reduce((total, part) => total + part.sizeBytes, 0),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
  }

  async getJsonPayload(payloadRef: string): Promise<RuntimeJobArtifactPayload | null> {
    const result = await this.sql.query<RuntimeJobArtifactPayloadRow>(
      `
        SELECT *
        FROM execution_platform.runtime_job_artifact_payloads
        WHERE payload_ref = $1
        LIMIT 1
      `,
      [payloadRef],
    );
    return result.rows[0] ? decodeArtifactPayload(result.rows[0]) : null;
  }

  async hydrateJsonPayloadParts(
    rootPayloadRef: string,
  ): Promise<RuntimeJobArtifactPayloadParts | null> {
    const root = await this.getJsonPayload(rootPayloadRef);
    if (!root || !root.body || typeof root.body !== "object" || Array.isArray(root.body)) {
      return null;
    }
    const rootBody = root.body as Record<string, JsonValue>;
    if (rootBody.artifactKind !== "runtime_job_artifact_payload_parts_root") {
      return null;
    }
    const partRefs = Array.isArray(rootBody.partRefs)
      ? rootBody.partRefs.filter((ref): ref is string => typeof ref === "string")
      : [];
    const parts: RuntimeJobArtifactPayload[] = [];
    for (const partRef of partRefs) {
      const part = await this.getJsonPayload(partRef);
      if (!part) {
        throw new Error(`artifact payload part missing: ${partRef}`);
      }
      parts.push(part);
    }
    return {
      root,
      parts,
      partRefs,
      totalSizeBytes: parts.reduce((total, part) => total + part.sizeBytes, 0),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
  }

  async attachJsonPayloadArtifact(
    input: AttachRuntimeJobJsonPayloadArtifactInput,
  ): Promise<RuntimeJobArtifact> {
    const contract = getRuntimeArtifactContract(input.artifactType);
    const runtimeArtifactContract = input.metadata?.runtimeArtifactContract;
    const runtimeArtifactContractId =
      runtimeArtifactContract &&
      typeof runtimeArtifactContract === "object" &&
      !Array.isArray(runtimeArtifactContract) &&
      typeof runtimeArtifactContract.contractId === "string"
        ? runtimeArtifactContract.contractId
        : null;
    if (
      contract?.storagePolicy === "payload_required" &&
      runtimeArtifactContractId !== contract.contractId
    ) {
      throw new Error(
        `runtime artifact contract attach API required for artifactType=${input.artifactType}; contractId=${contract.contractId}`,
      );
    }
    assertNoUnsafeRawStorageFlags(input.metadata ?? {}, "artifact payload manifest extension");
    const payload = await this.putJsonPayload({
      jobId: input.jobId,
      artifactType: input.artifactType,
      contentType: input.contentType ?? "application/json",
      body: input.body,
    });
    const manifest: RuntimeJobArtifactPayloadManifest = {
      artifactKind: "runtime_job_artifact_payload_manifest",
      schemaVersion: RUNTIME_JOB_ARTIFACT_PAYLOAD_MANIFEST_SCHEMA_VERSION,
      jobId: input.jobId,
      artifactType: input.artifactType,
      artifactRef: input.uri,
      payloadRef: payload.payloadRef,
      storageKind: RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND,
      contentType: payload.contentType,
      byteCount: payload.sizeBytes,
      sha256: payload.sha256,
      partCount: 1,
      partRefs: [],
      boundedSummary: boundedText(input.boundedSummary, 1_200),
      targetCommitmentIds: boundedStringArray(input.targetCommitmentIds, 40, 180),
      targetNodeIds: boundedStringArray(input.targetNodeIds, 40, 180),
      resourcePacketKind: boundedText(input.resourcePacketKind, 160),
      readinessStatus: boundedText(input.readinessStatus, 160),
      reasonCodes: boundedStringArray(input.reasonCodes, 80, 200),
      inputCounts: input.inputCounts ?? {},
      outputCounts: input.outputCounts ?? {},
      maxBounds: input.maxBounds ?? {},
      hydrationToolId: "artifact.payload.get_json",
      createdBy: boundedText(input.createdBy, 240),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    };
    const metadata = {
      ...manifest,
      extension: input.metadata ?? {},
    } satisfies Record<string, JsonValue>;
    return this.attachArtifact({
      artifactId: input.artifactId,
      jobId: input.jobId,
      artifactType: input.artifactType,
      storageKind: RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND,
      uri: input.uri,
      contentType: input.contentType ?? "application/json",
      sizeBytes: payload.sizeBytes,
      sha256: payload.sha256,
      metadata,
    });
  }

  async hydrateJsonPayloadArtifact(
    artifact: RuntimeJobArtifact,
  ): Promise<RuntimeJobArtifactPayload | null> {
    if (!isRuntimeJobArtifactPayloadManifest(artifact.metadata)) {
      return null;
    }
    return this.getJsonPayload(artifact.metadata.payloadRef);
  }

  async attachRuntimeArtifactByContract(
    input: RuntimeArtifactContractAttachInput,
  ): Promise<RuntimeJobArtifact> {
    const payloadInput = buildRuntimeArtifactContractPayloadInput(input);
    const artifact = await this.attachJsonPayloadArtifact(payloadInput);
    const contract = getRuntimeArtifactContract(input.artifactType);
    await this.recordEvent({
      jobId: input.jobId,
      eventType: "job.artifact_contract_attached",
      data: {
        artifactId: artifact.artifactId,
        artifactType: artifact.artifactType,
        contractId: contract?.contractId ?? null,
        storagePolicy: contract?.storagePolicy ?? null,
        payloadRef: isRuntimeJobArtifactPayloadManifest(artifact.metadata)
          ? artifact.metadata.payloadRef
          : null,
        byteCount: isRuntimeJobArtifactPayloadManifest(artifact.metadata)
          ? artifact.metadata.byteCount
          : artifact.sizeBytes,
        manifestByteCount: Buffer.byteLength(JSON.stringify(artifact.metadata), "utf8"),
        hydrateToolId: isRuntimeJobArtifactPayloadManifest(artifact.metadata)
          ? artifact.metadata.hydrationToolId
          : (contract?.hydrateToolId ?? null),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
      },
    });
    return artifact;
  }

  async hydrateRuntimeArtifactByContract(
    artifact: RuntimeJobArtifact,
  ): Promise<RuntimeArtifactContractHydrationResult> {
    const contract = getRuntimeArtifactContract(artifact.artifactType);
    const base = {
      artifact,
      contract,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    } satisfies Omit<
      RuntimeArtifactContractHydrationResult,
      "status" | "body" | "payload" | "reasonCodes" | "legacyHydrated"
    >;
    if (!contract) {
      return {
        ...base,
        status: "metadata_manifest_only",
        body: artifact.metadata,
        payload: null,
        reasonCodes: ["runtime_artifact_contract_unregistered"],
        legacyHydrated: false,
      };
    }
    if (isRuntimeJobArtifactPayloadManifest(artifact.metadata)) {
      const payload = await this.hydrateJsonPayloadArtifact(artifact);
      if (!payload) {
        return {
          ...base,
          status: "missing_payload",
          body: null,
          payload: null,
          reasonCodes: [
            "runtime_artifact_contract_payload_missing",
            `runtime_artifact_contract:${contract.contractId}`,
          ],
          legacyHydrated: false,
        };
      }
      if (payload.sha256 !== artifact.metadata.sha256) {
        return {
          ...base,
          status: "invalid_contract_storage",
          body: null,
          payload,
          reasonCodes: [
            "runtime_artifact_contract_payload_hash_mismatch",
            `runtime_artifact_contract:${contract.contractId}`,
          ],
          legacyHydrated: false,
        };
      }
      return {
        ...base,
        status: "payload_hydrated",
        body: payload.body,
        payload,
        reasonCodes: [
          "runtime_artifact_contract_payload_hydrated",
          `runtime_artifact_contract:${contract.contractId}`,
        ],
        legacyHydrated: false,
      };
    }
    const legacyBody = findRuntimeArtifactLegacyBody(artifact);
    if (legacyBody) {
      return {
        ...base,
        status: "legacy_metadata_hydrated",
        body: legacyBody.body,
        payload: null,
        reasonCodes: [
          "runtime_artifact_contract_legacy_metadata_hydrated",
          `runtime_artifact_contract:${contract.contractId}`,
          `legacy_body_key:${legacyBody.bodyKey}`,
        ],
        legacyHydrated: true,
      };
    }
    if (contract.storagePolicy === "metadata_manifest_only") {
      return {
        ...base,
        status: "metadata_manifest_only",
        body: artifact.metadata,
        payload: null,
        reasonCodes: [
          "runtime_artifact_contract_metadata_manifest_only",
          `runtime_artifact_contract:${contract.contractId}`,
        ],
        legacyHydrated: false,
      };
    }
    return {
      ...base,
      status: "invalid_contract_storage",
      body: null,
      payload: null,
      reasonCodes: [
        "runtime_artifact_contract_invalid_storage",
        `runtime_artifact_contract:${contract.contractId}`,
      ],
      legacyHydrated: false,
    };
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
    assertRuntimeArtifactContractStorage({ ...input, metadata });
    try {
      assertJsonByteLength(metadata, this.maxArtifactMetadataBytes, "artifact metadata");
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `${error.message}; artifactType=${input.artifactType}; uri=${input.uri.slice(0, 240)}`,
          { cause: error },
        );
      }
      throw error;
    }
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
