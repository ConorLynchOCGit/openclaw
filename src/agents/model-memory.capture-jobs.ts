import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { sanitizeMemoryTraceId } from "../../extensions/model-memory/runtime-api.js";
import { resolveStateDir } from "../config/paths.js";
import type { MemoryIngestionFailureClass } from "../plugin-sdk/model-memory.js";
import { readRecoveredJsonFile } from "./model-memory.recovery-files.js";
import {
  appendJsonLine,
  nowIso,
  readPositiveIntegerFromEnvValue,
  sanitizeIdList,
  sanitizeSafeSegment,
  writeJsonAtomic,
} from "./model-memory/runtime-state-helpers.js";

const CAPTURE_JOB_SCHEMA_VERSION = 1;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const DEFAULT_CONCURRENCY = 1;

export type MemoryCaptureJobStatus =
  | "queued"
  | "started"
  | "skipped"
  | "failed"
  | "written"
  | "retry_scheduled"
  | "replay_requested";

export type MemoryCaptureJobEventType =
  | "capture_queued"
  | "capture_started"
  | "capture_skipped"
  | "capture_failed"
  | "capture_written"
  | "capture_retry_scheduled"
  | "capture_replay_requested";

export type MemoryCaptureSourceKind =
  | "ordinary_turn"
  | "tool_result"
  | "daily_recovery"
  | "document_ingest"
  | "bootstrap_import"
  | "heartbeat_proactive_capture";

export type MemoryCaptureSafeRelatedIds = {
  sourceId?: string;
  segmentIds?: string[];
  memoryIds?: string[];
  eventIds?: string[];
  projectionIds?: string[];
};

export type MemoryCaptureSafeMetrics = {
  latencyMs?: number;
  retryCount?: number;
  segments?: number;
  memories?: number;
  writeResults?: number;
};

export type MemoryCaptureJob = {
  schemaVersion: typeof CAPTURE_JOB_SCHEMA_VERSION;
  jobId: string;
  traceId?: string;
  sourceKind: MemoryCaptureSourceKind;
  status: MemoryCaptureJobStatus;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  sourceFingerprint?: string;
  sourceHash?: string;
  provider?: string;
  model?: string;
  failureClass?: MemoryIngestionFailureClass;
  stage?: string;
  retryCount: number;
  nextAttemptAt?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  safeRelatedIds?: MemoryCaptureSafeRelatedIds;
  metrics?: MemoryCaptureSafeMetrics;
  rawContentPersisted: false;
  containsPromptText: false;
  containsTranscript: false;
  containsRawToolLog: false;
};

export type MemoryCaptureJobEvent = {
  schemaVersion: typeof CAPTURE_JOB_SCHEMA_VERSION;
  eventId: string;
  eventType: MemoryCaptureJobEventType;
  jobId: string;
  traceId?: string;
  sourceKind: MemoryCaptureSourceKind;
  status: MemoryCaptureJobStatus;
  observedAt: string;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  provider?: string;
  model?: string;
  failureClass?: MemoryIngestionFailureClass;
  stage?: string;
  retryCount?: number;
  nextAttemptAt?: string;
  safeRelatedIds?: MemoryCaptureSafeRelatedIds;
  metrics?: MemoryCaptureSafeMetrics;
  rawContentPersisted: false;
  containsPromptText: false;
  containsTranscript: false;
  containsRawToolLog: false;
};

export type MemoryCaptureJobStore = {
  baseDir: string;
  enqueue(job: MemoryCaptureJob): Promise<{ job: MemoryCaptureJob; event: MemoryCaptureJobEvent }>;
  markStarted(
    jobId: string,
    update?: MemoryCaptureJobUpdate,
  ): Promise<{ job: MemoryCaptureJob; event: MemoryCaptureJobEvent }>;
  markSkipped(
    jobId: string,
    update?: MemoryCaptureJobUpdate,
  ): Promise<{ job: MemoryCaptureJob; event: MemoryCaptureJobEvent }>;
  markWritten(
    jobId: string,
    update?: MemoryCaptureJobUpdate,
  ): Promise<{ job: MemoryCaptureJob; event: MemoryCaptureJobEvent }>;
  markFailed(
    jobId: string,
    update: MemoryCaptureJobUpdate & { failureClass: MemoryIngestionFailureClass },
  ): Promise<{ job: MemoryCaptureJob; event: MemoryCaptureJobEvent }>;
  scheduleRetry(
    jobId: string,
    update: MemoryCaptureJobUpdate & { nextAttemptAt: string },
  ): Promise<{ job: MemoryCaptureJob; event: MemoryCaptureJobEvent }>;
  requestReplay(jobId: string): Promise<{ job: MemoryCaptureJob; event: MemoryCaptureJobEvent }>;
  getJob(jobId: string): Promise<MemoryCaptureJob | undefined>;
  listJobs(): Promise<MemoryCaptureJob[]>;
};

type MemoryCaptureJobUpdate = {
  status?: MemoryCaptureJobStatus;
  traceId?: string;
  failureClass?: MemoryIngestionFailureClass;
  stage?: string;
  retryCount?: number;
  nextAttemptAt?: string;
  safeRelatedIds?: MemoryCaptureSafeRelatedIds;
  metrics?: MemoryCaptureSafeMetrics;
  provider?: string;
  model?: string;
};

type CaptureJobExecutionResult =
  | {
      status: "written";
      traceId?: string;
      safeRelatedIds?: MemoryCaptureSafeRelatedIds;
      metrics?: MemoryCaptureSafeMetrics;
    }
  | {
      status: "skipped";
      reason: string;
      traceId?: string;
      safeRelatedIds?: MemoryCaptureSafeRelatedIds;
      metrics?: MemoryCaptureSafeMetrics;
    };

export type MemoryCaptureJobTaskInput = {
  job: MemoryCaptureJob;
  store?: MemoryCaptureJobStore;
  env?: NodeJS.ProcessEnv;
  maxRetries?: number;
  retryDelayMs?: number;
  maxConcurrency?: number;
  classifyFailure: (error: unknown) => MemoryIngestionFailureClass;
  execute: (params: {
    job: MemoryCaptureJob;
    attempt: number;
  }) => Promise<CaptureJobExecutionResult>;
  onEvent?: (params: { job: MemoryCaptureJob; event: MemoryCaptureJobEvent }) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
};

let activeWorkers = 0;
const workerWaiters: Array<() => void> = [];

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function sanitizeHash(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && /^[a-f0-9]{16,128}$/u.test(trimmed) ? trimmed : undefined;
}

function sanitizeRelatedIds(ids: MemoryCaptureSafeRelatedIds | undefined) {
  if (!ids) {
    return undefined;
  }
  const safe: MemoryCaptureSafeRelatedIds = {};
  const sourceId = sanitizeSafeSegment(ids.sourceId);
  if (sourceId) {
    safe.sourceId = sourceId;
  }
  const segmentIds = sanitizeIdList(ids.segmentIds);
  if (segmentIds?.length) {
    safe.segmentIds = segmentIds;
  }
  const memoryIds = sanitizeIdList(ids.memoryIds);
  if (memoryIds?.length) {
    safe.memoryIds = memoryIds;
  }
  const eventIds = sanitizeIdList(ids.eventIds);
  if (eventIds?.length) {
    safe.eventIds = eventIds;
  }
  const projectionIds = sanitizeIdList(ids.projectionIds);
  if (projectionIds?.length) {
    safe.projectionIds = projectionIds;
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

function sanitizeMetrics(metrics: MemoryCaptureSafeMetrics | undefined) {
  if (!metrics) {
    return undefined;
  }
  const safe: MemoryCaptureSafeMetrics = {};
  for (const [key, value] of Object.entries(metrics) as Array<
    [keyof MemoryCaptureSafeMetrics, number | undefined]
  >) {
    if (value !== undefined && Number.isFinite(value)) {
      safe[key] = Math.max(0, Math.trunc(value));
    }
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

function clampNonNegativeInteger(value: unknown, fallback: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(0, Math.trunc(value)));
}

function jobFilePath(baseDir: string, jobId: string) {
  return path.join(baseDir, "jobs", `${jobId}.json`);
}

function eventsFilePath(baseDir: string) {
  return path.join(baseDir, "events.jsonl");
}

function sanitizeJobId(jobId: string): string {
  const safe = sanitizeSafeSegment(jobId, 96);
  if (!safe) {
    throw new Error("Invalid memory capture job id");
  }
  return safe;
}

function normalizeJob(job: MemoryCaptureJob): MemoryCaptureJob {
  const jobId = sanitizeJobId(job.jobId);
  return {
    schemaVersion: CAPTURE_JOB_SCHEMA_VERSION,
    jobId,
    traceId: sanitizeMemoryTraceId(job.traceId),
    sourceKind: job.sourceKind,
    status: job.status,
    sessionId: sanitizeSafeSegment(job.sessionId),
    sessionKey: sanitizeSafeSegment(job.sessionKey),
    agentId: sanitizeSafeSegment(job.agentId),
    sourceFingerprint: sanitizeHash(job.sourceFingerprint),
    sourceHash: sanitizeHash(job.sourceHash),
    provider: sanitizeSafeSegment(job.provider),
    model: sanitizeSafeSegment(job.model),
    failureClass: job.failureClass,
    stage: sanitizeSafeSegment(job.stage),
    retryCount: clampNonNegativeInteger(job.retryCount, 0, 100),
    nextAttemptAt: job.nextAttemptAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    safeRelatedIds: sanitizeRelatedIds(job.safeRelatedIds),
    metrics: sanitizeMetrics(job.metrics),
    rawContentPersisted: false,
    containsPromptText: false,
    containsTranscript: false,
    containsRawToolLog: false,
  };
}

function buildEvent(input: {
  job: MemoryCaptureJob;
  eventType: MemoryCaptureJobEventType;
  status: MemoryCaptureJobStatus;
  update?: MemoryCaptureJobUpdate;
}): MemoryCaptureJobEvent {
  return {
    schemaVersion: CAPTURE_JOB_SCHEMA_VERSION,
    eventId: `capture_event_${randomUUID()}`,
    eventType: input.eventType,
    jobId: input.job.jobId,
    traceId: sanitizeMemoryTraceId(input.update?.traceId) ?? input.job.traceId,
    sourceKind: input.job.sourceKind,
    status: input.status,
    observedAt: nowIso(),
    sessionId: input.job.sessionId,
    sessionKey: input.job.sessionKey,
    agentId: input.job.agentId,
    provider: sanitizeSafeSegment(input.update?.provider) ?? input.job.provider,
    model: sanitizeSafeSegment(input.update?.model) ?? input.job.model,
    failureClass: input.update?.failureClass ?? input.job.failureClass,
    stage: sanitizeSafeSegment(input.update?.stage) ?? input.job.stage,
    retryCount: input.update?.retryCount ?? input.job.retryCount,
    nextAttemptAt: input.update?.nextAttemptAt ?? input.job.nextAttemptAt,
    safeRelatedIds: sanitizeRelatedIds(input.update?.safeRelatedIds ?? input.job.safeRelatedIds),
    metrics: sanitizeMetrics(input.update?.metrics ?? input.job.metrics),
    rawContentPersisted: false,
    containsPromptText: false,
    containsTranscript: false,
    containsRawToolLog: false,
  };
}

async function readJob(filePath: string): Promise<MemoryCaptureJob | undefined> {
  const result = await readRecoveredJsonFile<MemoryCaptureJob | undefined>({
    filePath,
    fallback: undefined,
    parse: (value) => normalizeJob(value as MemoryCaptureJob),
    quarantineDir: path.join(path.dirname(filePath), "..", "quarantine", "jobs"),
  });
  return result.value;
}

async function persistJobAndEvent(params: {
  baseDir: string;
  job: MemoryCaptureJob;
  event: MemoryCaptureJobEvent;
}) {
  await writeJsonAtomic(jobFilePath(params.baseDir, params.job.jobId), params.job);
  await appendJsonLine(eventsFilePath(params.baseDir), params.event);
}

function applyJobUpdate(
  current: MemoryCaptureJob,
  status: MemoryCaptureJobStatus,
  update: MemoryCaptureJobUpdate = {},
): MemoryCaptureJob {
  const timestamp = nowIso();
  return normalizeJob({
    ...current,
    status,
    traceId: update.traceId ?? current.traceId,
    failureClass: update.failureClass,
    stage: update.stage,
    retryCount: update.retryCount ?? current.retryCount,
    nextAttemptAt: update.nextAttemptAt,
    provider: update.provider ?? current.provider,
    model: update.model ?? current.model,
    safeRelatedIds: update.safeRelatedIds ?? current.safeRelatedIds,
    metrics: update.metrics ?? current.metrics,
    updatedAt: timestamp,
    startedAt: status === "started" ? timestamp : current.startedAt,
    completedAt:
      status === "skipped" || status === "failed" || status === "written"
        ? timestamp
        : current.completedAt,
  });
}

export function resolveDefaultMemoryCaptureJobStoreDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveStateDir(env), "model-memory", "capture-jobs");
}

export function buildMemoryCaptureJob(input: {
  jobId: string;
  sourceKind: MemoryCaptureSourceKind;
  traceId?: string;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  sourceFingerprint?: string;
  sourceHash?: string;
  provider?: string;
  model?: string;
  createdAt?: Date;
}): MemoryCaptureJob {
  const timestamp = (input.createdAt ?? new Date()).toISOString();
  return normalizeJob({
    schemaVersion: CAPTURE_JOB_SCHEMA_VERSION,
    jobId: input.jobId,
    traceId: input.traceId,
    sourceKind: input.sourceKind,
    status: "queued",
    sessionId: input.sessionId,
    sessionKey: input.sessionKey,
    agentId: input.agentId,
    sourceFingerprint: input.sourceFingerprint,
    sourceHash: input.sourceHash,
    provider: input.provider,
    model: input.model,
    retryCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    rawContentPersisted: false,
    containsPromptText: false,
    containsTranscript: false,
    containsRawToolLog: false,
  });
}

export function buildOrdinaryTurnCaptureSourceHash(input: {
  userText: string;
  assistantText: string;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
}): string {
  return sha256Text(
    JSON.stringify({
      sourceKind: "ordinary_turn",
      sessionId: input.sessionId ?? null,
      sessionKey: input.sessionKey ?? null,
      agentId: input.agentId ?? null,
      userTurnSha256: sha256Text(input.userText),
      assistantTurnSha256: sha256Text(input.assistantText),
    }),
  );
}

export function createMemoryCaptureJobStore(
  input: {
    baseDir?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): MemoryCaptureJobStore {
  const baseDir = path.resolve(
    input.baseDir ?? resolveDefaultMemoryCaptureJobStoreDir(input.env ?? process.env),
  );

  async function loadRequiredJob(jobId: string): Promise<MemoryCaptureJob> {
    const safeJobId = sanitizeJobId(jobId);
    const job = await readJob(jobFilePath(baseDir, safeJobId));
    if (!job) {
      throw new Error(`Memory capture job not found: ${safeJobId}`);
    }
    return job;
  }

  async function transition(
    jobId: string,
    eventType: MemoryCaptureJobEventType,
    status: MemoryCaptureJobStatus,
    update?: MemoryCaptureJobUpdate,
  ) {
    const current = await loadRequiredJob(jobId);
    const job = applyJobUpdate(current, status, update);
    const event = buildEvent({ job, eventType, status, update });
    await persistJobAndEvent({ baseDir, job, event });
    return { job, event };
  }

  return {
    baseDir,
    async enqueue(job) {
      const safeJob = normalizeJob({ ...job, status: "queued" });
      const event = buildEvent({
        job: safeJob,
        eventType: "capture_queued",
        status: "queued",
      });
      await persistJobAndEvent({ baseDir, job: safeJob, event });
      return { job: safeJob, event };
    },
    markStarted(jobId, update) {
      return transition(jobId, "capture_started", "started", update);
    },
    markSkipped(jobId, update) {
      return transition(jobId, "capture_skipped", "skipped", update);
    },
    markWritten(jobId, update) {
      return transition(jobId, "capture_written", "written", update);
    },
    markFailed(jobId, update) {
      return transition(jobId, "capture_failed", "failed", update);
    },
    scheduleRetry(jobId, update) {
      return transition(jobId, "capture_retry_scheduled", "retry_scheduled", update);
    },
    requestReplay(jobId) {
      return transition(jobId, "capture_replay_requested", "replay_requested", {
        stage: "admin_inspection",
      });
    },
    getJob(jobId) {
      return readJob(jobFilePath(baseDir, sanitizeJobId(jobId)));
    },
    async listJobs() {
      const jobsDir = path.join(baseDir, "jobs");
      try {
        const entries = await fs.readdir(jobsDir, { withFileTypes: true });
        const jobs = await Promise.all(
          entries
            .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
            .map((entry) => readJob(path.join(jobsDir, entry.name))),
        );
        return jobs
          .filter((job): job is MemoryCaptureJob => Boolean(job))
          .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return [];
        }
        throw error;
      }
    },
  };
}

export function isRetryableMemoryCaptureFailureClass(
  failureClass: MemoryIngestionFailureClass,
): boolean {
  return (
    failureClass === "provider_empty_response" ||
    failureClass === "provider_connection" ||
    failureClass === "pool_pressure" ||
    failureClass === "timeout"
  );
}

async function acquireWorkerSlot(maxConcurrency: number) {
  if (activeWorkers >= maxConcurrency) {
    await new Promise<void>((resolve) => workerWaiters.push(resolve));
    return acquireWorkerSlot(maxConcurrency);
  }
  activeWorkers += 1;
}

function releaseWorkerSlot() {
  activeWorkers = Math.max(0, activeWorkers - 1);
  const next = workerWaiters.shift();
  next?.();
}

function captureFailureStageForClass(failureClass: MemoryIngestionFailureClass): string {
  if (failureClass === "runtime_dirty_persistence") {
    return "runtime_dirty";
  }
  if (failureClass === "permission") {
    return "permission";
  }
  if (
    failureClass === "db_persistence" ||
    failureClass === "pool_pressure" ||
    failureClass === "timeout"
  ) {
    return "persistence_boundary";
  }
  return "execution";
}

async function notifyEvent(
  input: MemoryCaptureJobTaskInput,
  transition: { job: MemoryCaptureJob; event: MemoryCaptureJobEvent },
) {
  await input.onEvent?.(transition).catch(() => undefined);
}

export async function runMemoryCaptureJobTask(
  input: MemoryCaptureJobTaskInput,
): Promise<MemoryCaptureJob> {
  const env = input.env ?? process.env;
  const store = input.store ?? createMemoryCaptureJobStore({ env });
  const existingJob = await store.getJob(input.job.jobId);
  if (existingJob?.status === "written") {
    return existingJob;
  }
  const maxRetries =
    input.maxRetries ??
    readPositiveIntegerFromEnvValue(
      env.MODEL_MEMORY_CAPTURE_JOB_MAX_RETRIES,
      DEFAULT_MAX_RETRIES,
      5,
    );
  const retryDelayMs =
    input.retryDelayMs ??
    readPositiveIntegerFromEnvValue(
      env.MODEL_MEMORY_CAPTURE_JOB_RETRY_DELAY_MS,
      DEFAULT_RETRY_DELAY_MS,
      60_000,
    );
  const maxConcurrency =
    input.maxConcurrency ??
    readPositiveIntegerFromEnvValue(
      env.MODEL_MEMORY_CAPTURE_JOB_CONCURRENCY,
      DEFAULT_CONCURRENCY,
      16,
    );
  const sleep =
    input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  await acquireWorkerSlot(maxConcurrency);
  try {
    let transition = await store.enqueue(input.job);
    await notifyEvent(input, transition);

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      transition = await store.markStarted(input.job.jobId, { retryCount: attempt });
      await notifyEvent(input, transition);

      const startedAt = Date.now();
      try {
        const result = await input.execute({ job: transition.job, attempt });
        const metrics = {
          ...result.metrics,
          latencyMs: result.metrics?.latencyMs ?? Date.now() - startedAt,
          retryCount: attempt,
        };
        if (result.status === "skipped") {
          transition = await store.markSkipped(input.job.jobId, {
            stage: result.reason,
            traceId: result.traceId,
            retryCount: attempt,
            safeRelatedIds: result.safeRelatedIds,
            metrics,
          });
          await notifyEvent(input, transition);
          return transition.job;
        }
        transition = await store.markWritten(input.job.jobId, {
          traceId: result.traceId,
          retryCount: attempt,
          safeRelatedIds: result.safeRelatedIds,
          metrics,
        });
        await notifyEvent(input, transition);
        return transition.job;
      } catch (error) {
        const failureClass = input.classifyFailure(error);
        const retryable =
          attempt < maxRetries && isRetryableMemoryCaptureFailureClass(failureClass);
        if (retryable) {
          const nextAttemptAt = new Date(Date.now() + retryDelayMs).toISOString();
          transition = await store.scheduleRetry(input.job.jobId, {
            failureClass,
            stage:
              failureClass === "pool_pressure" || failureClass === "timeout"
                ? "pool_pressure_or_timeout"
                : "execution",
            retryCount: attempt + 1,
            nextAttemptAt,
            metrics: {
              latencyMs: Date.now() - startedAt,
              retryCount: attempt + 1,
            },
          });
          await notifyEvent(input, transition);
          await sleep(retryDelayMs);
          continue;
        }
        transition = await store.markFailed(input.job.jobId, {
          failureClass,
          stage: captureFailureStageForClass(failureClass),
          retryCount: attempt,
          metrics: {
            latencyMs: Date.now() - startedAt,
            retryCount: attempt,
          },
        });
        await notifyEvent(input, transition);
        throw error;
      }
    }

    const finalTransition = await store.markFailed(input.job.jobId, {
      failureClass: "other",
      stage: "retry_exhausted",
      retryCount: maxRetries,
    });
    await notifyEvent(input, finalTransition);
    return finalTransition.job;
  } finally {
    releaseWorkerSlot();
  }
}
