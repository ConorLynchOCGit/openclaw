import { createHash } from "node:crypto";
import { Client } from "pg";
import type { PluginLogger } from "../../api.js";
import type { MemoryMiddlewareDbConfig } from "../config.js";
import {
  normalizeConsolidationPlanLimit,
  normalizeConsolidationPlanMaxFindings,
  normalizeConsolidationSelectionIds,
  normalizeProactivePlanMaxActions,
} from "./maintenance-planning.js";
import { summarizeMemoryObjectQueryError } from "./memory-object-query-runtime.js";
import type {
  ConsolidationExecuteSelection,
  MemoryBackgroundJobClaimedRecord,
  MemoryBackgroundJobClass,
  MemoryBackgroundJobEnqueueInput,
  MemoryBackgroundJobEnqueueResult,
  MemoryBackgroundJobFinalizeInput,
  MemoryBackgroundJobGetInput,
  MemoryBackgroundJobGetResult,
  MemoryBackgroundJobListInput,
  MemoryBackgroundJobListResult,
  MemoryBackgroundJobRecord,
  MemoryBackgroundJobRunNextInput,
  MemoryBackgroundJobStatus,
} from "./runtime.js";
import { quoteQualifiedTable, toClientConfig, withConfiguredClient } from "./shared.js";

const DEFAULT_BACKGROUND_JOB_MAX_ATTEMPTS = 3;
const MAX_BACKGROUND_JOB_MAX_ATTEMPTS = 10;

type BackgroundJobRow = {
  id: string;
  project_id: string | null;
  session_id: string | null;
  agent_id: string | null;
  job_kind: "maintenance";
  status: MemoryBackgroundJobStatus;
  payload: Record<string, unknown> | null;
  run_after: string;
  attempts: number;
  max_attempts: number;
  metadata: Record<string, unknown> | null;
  created_at?: string | Date;
  started_at?: string | Date | null;
  finished_at?: string | Date | null;
  last_error?: string | null;
};

function normalizeBackgroundJobMaxAttempts(maxAttempts: number | undefined): number {
  if (!Number.isFinite(maxAttempts)) {
    return DEFAULT_BACKGROUND_JOB_MAX_ATTEMPTS;
  }
  return Math.min(
    Math.max(Math.trunc(maxAttempts ?? DEFAULT_BACKGROUND_JOB_MAX_ATTEMPTS), 1),
    MAX_BACKGROUND_JOB_MAX_ATTEMPTS,
  );
}

function normalizeBackgroundJobAffectedIds(ids: string[] | undefined): string[] | undefined {
  if (!ids) {
    return undefined;
  }

  const normalized = [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))].sort(
    (left, right) => left.localeCompare(right),
  );
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeBackgroundJobRunAfter(runAfter: string | undefined): string {
  if (!runAfter) {
    return new Date().toISOString();
  }

  const parsed = Date.parse(runAfter);
  if (Number.isNaN(parsed)) {
    throw new Error("background job runAfter must be a valid ISO-8601 timestamp");
  }
  return new Date(parsed).toISOString();
}

function parseMemoryBackgroundJobClass(value: unknown): MemoryBackgroundJobClass | undefined {
  return value === "proactive_plan" ||
    value === "proactive_execute_run_drift_check" ||
    value === "consolidation_plan" ||
    value === "consolidation_execute"
    ? value
    : undefined;
}

function normalizeBackgroundJobConsolidationSelections(
  selections: { actionType: unknown; affectedObjectIds: unknown }[] | undefined,
): ConsolidationExecuteSelection[] | undefined {
  if (!selections || selections.length === 0) {
    return undefined;
  }

  return selections
    .map((selection) => {
      const actionType = selection.actionType;
      if (
        actionType !== "duplicate_merge_review" &&
        actionType !== "contradiction_review" &&
        actionType !== "stale_superseded_review" &&
        actionType !== "drift_check_review"
      ) {
        return undefined;
      }
      if (!Array.isArray(selection.affectedObjectIds)) {
        return undefined;
      }
      const affectedObjectIds = [
        ...new Set(
          selection.affectedObjectIds.filter((entry): entry is string => typeof entry === "string"),
        ),
      ]
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
        .sort((left, right) => left.localeCompare(right));
      if (affectedObjectIds.length === 0) {
        return undefined;
      }
      return {
        actionType,
        affectedObjectIds,
      } satisfies ConsolidationExecuteSelection;
    })
    .filter((selection): selection is ConsolidationExecuteSelection => Boolean(selection))
    .sort((left, right) => {
      const actionDelta = left.actionType.localeCompare(right.actionType);
      if (actionDelta !== 0) {
        return actionDelta;
      }
      return left.affectedObjectIds.join(",").localeCompare(right.affectedObjectIds.join(","));
    });
}

function createBackgroundJobPayload(
  input: MemoryBackgroundJobEnqueueInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    jobClass: input.jobClass,
  };

  if (input.projectId) {
    payload.projectId = input.projectId;
  }
  if (input.maxActions !== undefined) {
    payload.maxActions = normalizeProactivePlanMaxActions(input.maxActions);
  }
  if (input.limit !== undefined) {
    payload.limit = normalizeConsolidationPlanLimit(input.limit);
  }
  if (input.maxFindings !== undefined) {
    payload.maxFindings = normalizeConsolidationPlanMaxFindings(input.maxFindings);
  }

  const affectedIds = normalizeBackgroundJobAffectedIds(input.affectedIds);
  if (affectedIds) {
    payload.affectedIds = affectedIds;
  }
  const approvedFindings = input.approvedFindings
    ? normalizeBackgroundJobConsolidationSelections(input.approvedFindings)
    : undefined;
  if (approvedFindings) {
    payload.approvedFindings = approvedFindings;
  }
  if (input.reviewerAgentId) {
    payload.reviewerAgentId = input.reviewerAgentId;
  }
  if (input.includeValidatedProcedures !== undefined) {
    payload.includeValidatedProcedures = input.includeValidatedProcedures;
  }

  return payload;
}

function createBackgroundJobPayloadFingerprint(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

function normalizeClaimedBackgroundJobRow(row: BackgroundJobRow): MemoryBackgroundJobClaimedRecord {
  const normalized = normalizeBackgroundJobRecordRow(row);

  return {
    jobId: normalized.jobId,
    jobClass: normalized.jobClass,
    jobKind: normalized.jobKind,
    ...(normalized.projectId ? { projectId: normalized.projectId } : {}),
    ...(normalized.sessionId ? { sessionId: normalized.sessionId } : {}),
    ...(normalized.agentId ? { agentId: normalized.agentId } : {}),
    attempts: normalized.attempts,
    maxAttempts: normalized.maxAttempts,
    runAfter: normalized.runAfter,
    payloadFingerprint: normalized.payloadFingerprint,
    ...(normalized.maxActions !== undefined ? { maxActions: normalized.maxActions } : {}),
    ...(normalized.limit !== undefined ? { limit: normalized.limit } : {}),
    ...(normalized.maxFindings !== undefined ? { maxFindings: normalized.maxFindings } : {}),
    ...(normalized.affectedIds ? { affectedIds: normalized.affectedIds } : {}),
    ...(normalized.approvedFindings ? { approvedFindings: normalized.approvedFindings } : {}),
    ...(normalized.reviewerAgentId ? { reviewerAgentId: normalized.reviewerAgentId } : {}),
    ...(normalized.includeValidatedProcedures !== undefined
      ? { includeValidatedProcedures: normalized.includeValidatedProcedures }
      : {}),
  };
}

function normalizeBackgroundJobTimestamp(
  value: string | Date | null | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeBackgroundJobRecordRow(row: BackgroundJobRow): MemoryBackgroundJobRecord {
  const payload = row.payload ?? {};
  const metadata = row.metadata ?? {};
  const jobClass = parseMemoryBackgroundJobClass(payload.jobClass);
  if (!jobClass) {
    throw new Error(`unsupported background job class: ${String(payload.jobClass)}`);
  }

  const affectedIds = Array.isArray(payload.affectedIds)
    ? normalizeBackgroundJobAffectedIds(
        payload.affectedIds.filter((entry): entry is string => typeof entry === "string"),
      )
    : undefined;
  const maxActions =
    typeof payload.maxActions === "number" && Number.isFinite(payload.maxActions)
      ? normalizeProactivePlanMaxActions(payload.maxActions)
      : undefined;
  const limit =
    typeof payload.limit === "number" && Number.isFinite(payload.limit)
      ? normalizeConsolidationPlanLimit(payload.limit)
      : undefined;
  const maxFindings =
    typeof payload.maxFindings === "number" && Number.isFinite(payload.maxFindings)
      ? normalizeConsolidationPlanMaxFindings(payload.maxFindings)
      : undefined;
  const approvedFindings = Array.isArray(payload.approvedFindings)
    ? normalizeBackgroundJobConsolidationSelections(
        payload.approvedFindings.map((selection) =>
          selection && typeof selection === "object" && !Array.isArray(selection)
            ? {
                actionType: (selection as Record<string, unknown>).actionType,
                affectedObjectIds: (selection as Record<string, unknown>).affectedObjectIds,
              }
            : { actionType: undefined, affectedObjectIds: undefined },
        ),
      )
    : undefined;
  const reviewerAgentId =
    typeof payload.reviewerAgentId === "string" && payload.reviewerAgentId.trim().length > 0
      ? payload.reviewerAgentId.trim()
      : undefined;
  const includeValidatedProcedures =
    typeof payload.includeValidatedProcedures === "boolean"
      ? payload.includeValidatedProcedures
      : undefined;
  const payloadFingerprint =
    typeof metadata.payloadFingerprint === "string" && metadata.payloadFingerprint.length > 0
      ? metadata.payloadFingerprint
      : createBackgroundJobPayloadFingerprint(payload);

  return {
    jobId: row.id,
    jobClass,
    jobKind: row.job_kind,
    status: row.status,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.session_id ? { sessionId: row.session_id } : {}),
    ...(row.agent_id ? { agentId: row.agent_id } : {}),
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAfter: row.run_after,
    payloadFingerprint,
    ...(normalizeBackgroundJobTimestamp(row.created_at)
      ? { createdAt: normalizeBackgroundJobTimestamp(row.created_at) }
      : {}),
    ...(normalizeBackgroundJobTimestamp(row.started_at)
      ? { startedAt: normalizeBackgroundJobTimestamp(row.started_at) }
      : {}),
    ...(normalizeBackgroundJobTimestamp(row.finished_at)
      ? { finishedAt: normalizeBackgroundJobTimestamp(row.finished_at) }
      : {}),
    ...(row.last_error ? { lastError: row.last_error } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    ...(maxActions !== undefined ? { maxActions } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(maxFindings !== undefined ? { maxFindings } : {}),
    ...(affectedIds ? { affectedIds } : {}),
    ...(approvedFindings ? { approvedFindings } : {}),
    ...(reviewerAgentId ? { reviewerAgentId } : {}),
    ...(includeValidatedProcedures !== undefined ? { includeValidatedProcedures } : {}),
  };
}

export async function enqueueBackgroundJobInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryBackgroundJobEnqueueInput;
  logger: PluginLogger;
  schema: string;
}): Promise<MemoryBackgroundJobEnqueueResult> {
  const backgroundJobsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "background_jobs",
  });

  try {
    const payload = createBackgroundJobPayload(params.input);
    const payloadFingerprint = createBackgroundJobPayloadFingerprint(payload);
    const runAfter = normalizeBackgroundJobRunAfter(params.input.runAfter);
    const maxAttempts = normalizeBackgroundJobMaxAttempts(params.input.maxAttempts);

    return withConfiguredClient({
      config: params.config,
      async run(client) {
        const existingJob = await client.query<{ id: string; run_after: string }>(
          `
            select id::text as id, run_after::text as run_after
            from ${backgroundJobsTable}
            where job_kind = 'maintenance'
              and status in ('queued', 'running')
              and metadata->>'payloadFingerprint' = $1
            order by created_at desc, id desc
            limit 1
          `,
          [payloadFingerprint],
        );
        const existingJobId = existingJob.rows[0]?.id;
        if (existingJobId) {
          return {
            accepted: true,
            status: "already_queued",
            jobId: existingJobId,
            jobClass: params.input.jobClass,
            jobKind: "maintenance",
            runAfter: existingJob.rows[0]?.run_after ?? runAfter,
            payloadFingerprint,
          };
        }

        const inserted = await client.query<{ id: string; run_after: string }>(
          `
            insert into ${backgroundJobsTable} (
              project_id,
              session_id,
              agent_id,
              job_kind,
              status,
              payload,
              run_after,
              max_attempts,
              metadata
            )
            values ($1::uuid, $2::uuid, $3::uuid, 'maintenance', 'queued', $4::jsonb, $5::timestamptz, $6, $7::jsonb)
            returning id::text as id, run_after::text as run_after
          `,
          [
            params.input.projectId ?? null,
            params.input.sessionId ?? null,
            params.input.agentId ?? null,
            JSON.stringify(payload),
            runAfter,
            maxAttempts,
            JSON.stringify({
              source: "memory_background_job_enqueue",
              payloadFingerprint,
              boundedJobClass: params.input.jobClass,
            }),
          ],
        );
        const jobId = inserted.rows[0]?.id;
        if (!jobId) {
          throw new Error("background job enqueue did not return a job id");
        }

        return {
          accepted: true,
          status: "queued",
          jobId,
          jobClass: params.input.jobClass,
          jobKind: "maintenance",
          runAfter: inserted.rows[0]?.run_after ?? runAfter,
          payloadFingerprint,
        };
      },
    });
  } catch (error) {
    const reason = summarizeMemoryObjectQueryError(error);
    params.logger.error(`memory-middleware background job enqueue failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      jobClass: params.input.jobClass,
      reason,
    };
  }
}

export async function claimNextBackgroundJobInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryBackgroundJobRunNextInput;
  logger: PluginLogger;
  schema: string;
}): Promise<MemoryBackgroundJobClaimedRecord | undefined> {
  const backgroundJobsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "background_jobs",
  });

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");
    const allowedJobClasses =
      params.input.allowedJobClasses && params.input.allowedJobClasses.length > 0
        ? params.input.allowedJobClasses
        : [
            "proactive_plan",
            "proactive_execute_run_drift_check",
            "consolidation_plan",
            "consolidation_execute",
          ];

    const claimed = await client.query<BackgroundJobRow>(
      `
        with candidate as (
          select id
          from ${backgroundJobsTable}
          where job_kind = 'maintenance'
            and status = 'queued'
            and run_after <= now()
            and payload->>'jobClass' = any($2::text[])
            and ($1::uuid is null or project_id = $1::uuid)
          order by run_after asc, created_at asc, id asc
          for update skip locked
          limit 1
        )
        update ${backgroundJobsTable} as jobs
        set
          status = 'running',
          started_at = now(),
          attempts = jobs.attempts + 1,
          last_error = null
        from candidate
        where jobs.id = candidate.id
        returning
          jobs.id::text as id,
          jobs.project_id::text as project_id,
          jobs.session_id::text as session_id,
          jobs.agent_id::text as agent_id,
          jobs.job_kind,
          jobs.status,
          jobs.payload,
          jobs.run_after::text as run_after,
          jobs.attempts,
          jobs.max_attempts,
          jobs.metadata,
          jobs.created_at,
          jobs.started_at,
          jobs.finished_at,
          jobs.last_error
      `,
      [params.input.projectId ?? null, allowedJobClasses],
    );

    const claimedRow = claimed.rows[0];
    await client.query("commit");
    return claimedRow ? normalizeClaimedBackgroundJobRow(claimedRow) : undefined;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best-effort rollback only.
    }
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

export async function finalizeBackgroundJobInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryBackgroundJobFinalizeInput;
  logger: PluginLogger;
  schema: string;
}): Promise<void> {
  const backgroundJobsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "background_jobs",
  });

  await withConfiguredClient({
    config: params.config,
    async run(client) {
      await client.query(
        `
          update ${backgroundJobsTable}
          set
            status = $2::memory_middleware.background_job_status,
            finished_at = now(),
            last_error = $3,
            metadata = coalesce(metadata, '{}'::jsonb) || $4::jsonb
          where id = $1::uuid
        `,
        [
          params.input.jobId,
          params.input.status,
          params.input.lastError ?? null,
          JSON.stringify({
            lastRun: {
              status: params.input.status,
              ...(params.input.lastError ? { lastError: params.input.lastError } : {}),
              executionMetadata: params.input.executionMetadata,
            },
          }),
        ],
      );
    },
  });
}

function normalizeBackgroundJobListLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return 20;
  }
  const truncated = Math.trunc(limit);
  if (truncated <= 0) {
    return 20;
  }
  return Math.min(truncated, 100);
}

export async function listBackgroundJobsInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryBackgroundJobListInput;
  logger: PluginLogger;
  schema: string;
}): Promise<MemoryBackgroundJobListResult> {
  const backgroundJobsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "background_jobs",
  });

  const client = new Client(toClientConfig(params.config));
  try {
    await client.connect();
    const rows = await client.query<BackgroundJobRow>(
      `
        select
          id::text as id,
          project_id::text as project_id,
          session_id::text as session_id,
          agent_id::text as agent_id,
          job_kind,
          status,
          payload,
          run_after::text as run_after,
          attempts,
          max_attempts,
          metadata,
          created_at,
          started_at,
          finished_at,
          last_error
        from ${backgroundJobsTable}
        where job_kind = 'maintenance'
          and ($1::uuid is null or project_id = $1::uuid)
          and ($2::text is null or status::text = $2::text)
          and ($3::text is null or payload->>'jobClass' = $3::text)
        order by created_at desc, id desc
        limit $4::int
      `,
      [
        params.input.projectId ?? null,
        params.input.status ?? null,
        params.input.jobClass ?? null,
        normalizeBackgroundJobListLimit(params.input.limit),
      ],
    );

    return {
      accepted: true,
      status: "ok",
      jobs: rows.rows.map(normalizeBackgroundJobRecordRow),
    };
  } catch (error) {
    const reason = summarizeMemoryObjectQueryError(error);
    params.logger.error(`memory-middleware background job list failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function getBackgroundJobInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryBackgroundJobGetInput;
  logger: PluginLogger;
  schema: string;
}): Promise<MemoryBackgroundJobGetResult> {
  const backgroundJobsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "background_jobs",
  });

  const client = new Client(toClientConfig(params.config));
  try {
    await client.connect();
    const row = await client.query<BackgroundJobRow>(
      `
        select
          id::text as id,
          project_id::text as project_id,
          session_id::text as session_id,
          agent_id::text as agent_id,
          job_kind,
          status,
          payload,
          run_after::text as run_after,
          attempts,
          max_attempts,
          metadata,
          created_at,
          started_at,
          finished_at,
          last_error
        from ${backgroundJobsTable}
        where id = $1::uuid
          and job_kind = 'maintenance'
        limit 1
      `,
      [params.input.jobId],
    );
    const record = row.rows[0];
    if (!record) {
      return {
        accepted: false,
        status: "not_found",
        reason: "background job was not found",
      };
    }
    return {
      accepted: true,
      status: "ok",
      job: normalizeBackgroundJobRecordRow(record),
    };
  } catch (error) {
    const reason = summarizeMemoryObjectQueryError(error);
    params.logger.error(`memory-middleware background job get failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}
