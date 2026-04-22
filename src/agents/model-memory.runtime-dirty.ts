import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import type { MemoryIngestionFailureClass } from "../plugin-sdk/model-memory.js";

const RUNTIME_DIRTY_SCHEMA_VERSION = 1;
const DEFAULT_COALESCE_WRITES = 5;
const DEFAULT_COALESCE_MS = 30_000;
const DEFAULT_MAX_CONCURRENCY = 1;
const DEFAULT_RETRY_DELAY_MS = 30_000;
const DEFAULT_MAX_RETRIES = 1;
const MAX_SAFE_STRING_LENGTH = 128;
const MAX_SAFE_ID_LIST = 16;

export type ModelMemoryRuntimeDirtyStatus =
  | "clean"
  | "dirty"
  | "scheduled"
  | "rebuilding"
  | "failed";

export type ModelMemoryRuntimeDirtyReason =
  | "ordinary_turn_capture_written"
  | "tool_result_capture_written"
  | "document_ingest_written"
  | "daily_recovery_written"
  | "bootstrap_import_written"
  | "manual_admin_request"
  | "projection_source_changed"
  | "unknown";

export type ModelMemoryRuntimeDirtyEventType =
  | "runtime_dirty_marked"
  | "runtime_rebuild_scheduled"
  | "runtime_rebuild_started"
  | "runtime_rebuild_completed"
  | "runtime_rebuild_failed"
  | "runtime_rebuild_skipped_lock_busy"
  | "runtime_rebuild_coalesced"
  | "runtime_dirty_cleared"
  | "runtime_rebuild_admin_requested";

export type ModelMemoryRuntimeRebuildFailureClass =
  | MemoryIngestionFailureClass
  | "runtime_rebuild_lock_busy"
  | "runtime_rebuild_disabled"
  | "other";

export type ModelMemoryRuntimeRebuildSchedulerReason =
  | "write_threshold"
  | "age_threshold"
  | "manual_admin_request"
  | "disabled"
  | "already_active"
  | "deferred";

export type ModelMemoryRuntimeDirtyState = {
  schemaVersion: typeof RUNTIME_DIRTY_SCHEMA_VERSION;
  dirtyId: string;
  status: ModelMemoryRuntimeDirtyStatus;
  dirtyReason?: ModelMemoryRuntimeDirtyReason;
  affectedMemoryIds: string[];
  affectedSourceIds: string[];
  affectedEventIds: string[];
  affectedEdgeIds: string[];
  affectedProjectionTargetIds: string[];
  writeCountSinceLastRebuild: number;
  markedAt?: string;
  scheduledAt?: string;
  rebuildStartedAt?: string;
  lastRebuildAt?: string;
  lastRebuildDurationMs?: number;
  lastFailureClass?: ModelMemoryRuntimeRebuildFailureClass;
  lastFailureStage?: string;
  lastFailureAt?: string;
  rebuildAttemptCount: number;
  schedulerGeneration: number;
  rawContentPersisted: false;
  containsPromptText: false;
  containsTranscript: false;
  containsRawToolLog: false;
};

export type ModelMemoryRuntimeDirtyEvent = {
  schemaVersion: typeof RUNTIME_DIRTY_SCHEMA_VERSION;
  eventId: string;
  eventType: ModelMemoryRuntimeDirtyEventType;
  dirtyId: string;
  status: ModelMemoryRuntimeDirtyStatus;
  observedAt: string;
  dirtyReason?: ModelMemoryRuntimeDirtyReason;
  captureJobId?: string;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  schedulerReason?: ModelMemoryRuntimeRebuildSchedulerReason;
  failureClass?: ModelMemoryRuntimeRebuildFailureClass;
  failureStage?: string;
  rebuildAttemptCount?: number;
  schedulerGeneration?: number;
  affectedMemoryIds?: string[];
  affectedSourceIds?: string[];
  affectedEventIds?: string[];
  affectedEdgeIds?: string[];
  affectedProjectionTargetIds?: string[];
  metrics?: {
    writeCountSinceLastRebuild?: number;
    lastRebuildDurationMs?: number;
    retryDelayMs?: number;
  };
  rawContentPersisted: false;
  containsPromptText: false;
  containsTranscript: false;
  containsRawToolLog: false;
};

export type ModelMemoryRuntimeDirtyStore = {
  baseDir: string;
  getState(): Promise<ModelMemoryRuntimeDirtyState>;
  listRecentEvents(limit?: number): Promise<ModelMemoryRuntimeDirtyEvent[]>;
  markDirty(
    input: ModelMemoryRuntimeDirtyMarkInput,
  ): Promise<{ state: ModelMemoryRuntimeDirtyState; event: ModelMemoryRuntimeDirtyEvent }>;
  markScheduled(
    input?: ModelMemoryRuntimeDirtyTransitionInput,
  ): Promise<{ state: ModelMemoryRuntimeDirtyState; event: ModelMemoryRuntimeDirtyEvent }>;
  markRebuildStarted(
    input?: ModelMemoryRuntimeDirtyTransitionInput,
  ): Promise<{ state: ModelMemoryRuntimeDirtyState; event: ModelMemoryRuntimeDirtyEvent }>;
  markRebuildCompleted(input?: {
    startedGeneration?: number;
    durationMs?: number;
  }): Promise<{ state: ModelMemoryRuntimeDirtyState; event: ModelMemoryRuntimeDirtyEvent }>;
  markRebuildFailed(
    input: ModelMemoryRuntimeDirtyTransitionInput & {
      failureClass: ModelMemoryRuntimeRebuildFailureClass;
      failureStage?: string;
    },
  ): Promise<{ state: ModelMemoryRuntimeDirtyState; event: ModelMemoryRuntimeDirtyEvent }>;
  markRebuildSkippedLockBusy(
    input?: ModelMemoryRuntimeDirtyTransitionInput,
  ): Promise<{ state: ModelMemoryRuntimeDirtyState; event: ModelMemoryRuntimeDirtyEvent }>;
  recordCoalesced(
    input?: ModelMemoryRuntimeDirtyTransitionInput,
  ): Promise<{ state: ModelMemoryRuntimeDirtyState; event: ModelMemoryRuntimeDirtyEvent }>;
  requestRebuild(
    input?: ModelMemoryRuntimeDirtyTransitionInput,
  ): Promise<{ state: ModelMemoryRuntimeDirtyState; event: ModelMemoryRuntimeDirtyEvent }>;
  clearDirty(): Promise<{
    state: ModelMemoryRuntimeDirtyState;
    event: ModelMemoryRuntimeDirtyEvent;
  }>;
};

export type ModelMemoryRuntimeDirtyMarkInput = {
  reason: ModelMemoryRuntimeDirtyReason;
  captureJobId?: string;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  memoryIds?: string[];
  sourceIds?: string[];
  eventIds?: string[];
  edgeIds?: string[];
  projectionTargetIds?: string[];
  markedAt?: Date;
};

export type ModelMemoryRuntimeDirtyTransitionInput = {
  captureJobId?: string;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  schedulerReason?: ModelMemoryRuntimeRebuildSchedulerReason;
  retryDelayMs?: number;
};

export type ModelMemoryRuntimeRebuildSchedulerSettings = {
  enabled: boolean;
  coalesceWrites: number;
  coalesceMs: number;
  maxConcurrency: number;
  retryDelayMs: number;
  maxRetries: number;
};

export type ModelMemoryRuntimeDirtyScheduleResult = {
  state: ModelMemoryRuntimeDirtyState;
  events: ModelMemoryRuntimeDirtyEvent[];
  scheduled: boolean;
  schedulerReason: ModelMemoryRuntimeRebuildSchedulerReason;
};

type RuntimeRebuildTask = (state: ModelMemoryRuntimeDirtyState) => Promise<void>;
type RuntimeDirtyEventObserver = (event: ModelMemoryRuntimeDirtyEvent) => Promise<void>;
type RuntimeDirtyTimer = ReturnType<typeof setTimeout>;

const activeRebuilds = new Set<string>();
const scheduledRebuilds = new Map<string, RuntimeDirtyTimer>();

function nowIso(date = new Date()): string {
  return date.toISOString();
}

function stateFilePath(baseDir: string) {
  return path.join(baseDir, "state.json");
}

function eventsFilePath(baseDir: string) {
  return path.join(baseDir, "events.jsonl");
}

function sanitizeSafeSegment(value: string | undefined, maxLength = MAX_SAFE_STRING_LENGTH) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > maxLength) {
    return undefined;
  }
  return /^[A-Za-z0-9_.:@/-]+$/u.test(trimmed) ? trimmed : undefined;
}

function sanitizeIdList(values: string[] | undefined) {
  return values
    ?.map((entry) => sanitizeSafeSegment(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, MAX_SAFE_ID_LIST);
}

function mergeIdLists(left: string[] | undefined, right: string[] | undefined) {
  return [...new Set([...(left ?? []), ...(right ?? [])])]
    .map((entry) => sanitizeSafeSegment(entry))
    .filter((entry): entry is string => Boolean(entry))
    .toSorted()
    .slice(0, MAX_SAFE_ID_LIST);
}

function readPositiveInteger(value: string | undefined, fallback: number, max: number) {
  const parsed = value === undefined ? NaN : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(1, parsed)) : fallback;
}

function readBoolean(value: string | undefined, fallback: boolean) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function cleanState(): ModelMemoryRuntimeDirtyState {
  return {
    schemaVersion: RUNTIME_DIRTY_SCHEMA_VERSION,
    dirtyId: "runtime_dirty_clean",
    status: "clean",
    affectedMemoryIds: [],
    affectedSourceIds: [],
    affectedEventIds: [],
    affectedEdgeIds: [],
    affectedProjectionTargetIds: [],
    writeCountSinceLastRebuild: 0,
    rebuildAttemptCount: 0,
    schedulerGeneration: 0,
    rawContentPersisted: false,
    containsPromptText: false,
    containsTranscript: false,
    containsRawToolLog: false,
  };
}

function normalizeState(state: Partial<ModelMemoryRuntimeDirtyState> | undefined) {
  const fallback = cleanState();
  if (!state) {
    return fallback;
  }
  const dirtyId =
    sanitizeSafeSegment(state.dirtyId, 96) ??
    (state.status === "clean" ? "runtime_dirty_clean" : `runtime_dirty_${randomUUID()}`);
  return {
    schemaVersion: RUNTIME_DIRTY_SCHEMA_VERSION,
    dirtyId,
    status: state.status ?? fallback.status,
    dirtyReason: state.dirtyReason,
    affectedMemoryIds: sanitizeIdList(state.affectedMemoryIds) ?? [],
    affectedSourceIds: sanitizeIdList(state.affectedSourceIds) ?? [],
    affectedEventIds: sanitizeIdList(state.affectedEventIds) ?? [],
    affectedEdgeIds: sanitizeIdList(state.affectedEdgeIds) ?? [],
    affectedProjectionTargetIds: sanitizeIdList(state.affectedProjectionTargetIds) ?? [],
    writeCountSinceLastRebuild: Math.max(0, Math.trunc(state.writeCountSinceLastRebuild ?? 0)),
    markedAt: state.markedAt,
    scheduledAt: state.scheduledAt,
    rebuildStartedAt: state.rebuildStartedAt,
    lastRebuildAt: state.lastRebuildAt,
    lastRebuildDurationMs:
      state.lastRebuildDurationMs === undefined
        ? undefined
        : Math.max(0, Math.trunc(state.lastRebuildDurationMs)),
    lastFailureClass: state.lastFailureClass,
    lastFailureStage: sanitizeSafeSegment(state.lastFailureStage),
    lastFailureAt: state.lastFailureAt,
    rebuildAttemptCount: Math.max(0, Math.trunc(state.rebuildAttemptCount ?? 0)),
    schedulerGeneration: Math.max(0, Math.trunc(state.schedulerGeneration ?? 0)),
    rawContentPersisted: false,
    containsPromptText: false,
    containsTranscript: false,
    containsRawToolLog: false,
  } satisfies ModelMemoryRuntimeDirtyState;
}

function buildEvent(input: {
  state: ModelMemoryRuntimeDirtyState;
  eventType: ModelMemoryRuntimeDirtyEventType;
  transition?: ModelMemoryRuntimeDirtyTransitionInput;
  failureClass?: ModelMemoryRuntimeRebuildFailureClass;
  failureStage?: string;
  durationMs?: number;
}): ModelMemoryRuntimeDirtyEvent {
  return {
    schemaVersion: RUNTIME_DIRTY_SCHEMA_VERSION,
    eventId: `runtime_dirty_event_${randomUUID()}`,
    eventType: input.eventType,
    dirtyId: input.state.dirtyId,
    status: input.state.status,
    observedAt: nowIso(),
    dirtyReason: input.state.dirtyReason,
    captureJobId: sanitizeSafeSegment(input.transition?.captureJobId, 96),
    sessionId: sanitizeSafeSegment(input.transition?.sessionId),
    sessionKey: sanitizeSafeSegment(input.transition?.sessionKey),
    agentId: sanitizeSafeSegment(input.transition?.agentId),
    schedulerReason: input.transition?.schedulerReason,
    failureClass: input.failureClass ?? input.state.lastFailureClass,
    failureStage: sanitizeSafeSegment(input.failureStage) ?? input.state.lastFailureStage,
    rebuildAttemptCount: input.state.rebuildAttemptCount,
    schedulerGeneration: input.state.schedulerGeneration,
    affectedMemoryIds: input.state.affectedMemoryIds,
    affectedSourceIds: input.state.affectedSourceIds,
    affectedEventIds: input.state.affectedEventIds,
    affectedEdgeIds: input.state.affectedEdgeIds,
    affectedProjectionTargetIds: input.state.affectedProjectionTargetIds,
    metrics: {
      writeCountSinceLastRebuild: input.state.writeCountSinceLastRebuild,
      lastRebuildDurationMs: input.durationMs ?? input.state.lastRebuildDurationMs,
      retryDelayMs: input.transition?.retryDelayMs,
    },
    rawContentPersisted: false,
    containsPromptText: false,
    containsTranscript: false,
    containsRawToolLog: false,
  };
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmpPath, filePath);
}

async function appendJsonLine(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

async function persistStateAndEvent(params: {
  baseDir: string;
  state: ModelMemoryRuntimeDirtyState;
  event: ModelMemoryRuntimeDirtyEvent;
}) {
  await writeJsonAtomic(stateFilePath(params.baseDir), params.state);
  await appendJsonLine(eventsFilePath(params.baseDir), params.event);
}

async function readState(filePath: string) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return normalizeState(JSON.parse(text) as ModelMemoryRuntimeDirtyState);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return cleanState();
    }
    throw error;
  }
}

export function resolveDefaultModelMemoryRuntimeDirtyStoreDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveStateDir(env), "model-memory", "runtime-dirty");
}

export function resolveModelMemoryRuntimeRebuildSchedulerSettings(
  env: NodeJS.ProcessEnv = process.env,
): ModelMemoryRuntimeRebuildSchedulerSettings {
  return {
    enabled: readBoolean(env.MODEL_MEMORY_RUNTIME_REBUILD_ENABLED, true),
    coalesceWrites: readPositiveInteger(
      env.MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_WRITES,
      DEFAULT_COALESCE_WRITES,
      1_000,
    ),
    coalesceMs: readPositiveInteger(
      env.MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_MS,
      DEFAULT_COALESCE_MS,
      3_600_000,
    ),
    maxConcurrency: readPositiveInteger(
      env.MODEL_MEMORY_RUNTIME_REBUILD_MAX_CONCURRENCY,
      DEFAULT_MAX_CONCURRENCY,
      8,
    ),
    retryDelayMs: readPositiveInteger(
      env.MODEL_MEMORY_RUNTIME_REBUILD_RETRY_DELAY_MS,
      DEFAULT_RETRY_DELAY_MS,
      3_600_000,
    ),
    maxRetries: readPositiveInteger(
      env.MODEL_MEMORY_RUNTIME_REBUILD_MAX_RETRIES,
      DEFAULT_MAX_RETRIES,
      10,
    ),
  };
}

export function createModelMemoryRuntimeDirtyStore(
  input: {
    baseDir?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): ModelMemoryRuntimeDirtyStore {
  const baseDir = path.resolve(
    input.baseDir ?? resolveDefaultModelMemoryRuntimeDirtyStoreDir(input.env ?? process.env),
  );

  async function transition(params: {
    eventType: ModelMemoryRuntimeDirtyEventType;
    update: (state: ModelMemoryRuntimeDirtyState) => ModelMemoryRuntimeDirtyState;
    transition?: ModelMemoryRuntimeDirtyTransitionInput;
    failureClass?: ModelMemoryRuntimeRebuildFailureClass;
    failureStage?: string;
    durationMs?: number;
  }) {
    const state = normalizeState(params.update(await readState(stateFilePath(baseDir))));
    const event = buildEvent({
      state,
      eventType: params.eventType,
      transition: params.transition,
      failureClass: params.failureClass,
      failureStage: params.failureStage,
      durationMs: params.durationMs,
    });
    await persistStateAndEvent({ baseDir, state, event });
    return { state, event };
  }

  return {
    baseDir,
    getState() {
      return readState(stateFilePath(baseDir));
    },
    async listRecentEvents(limit = 50) {
      try {
        const text = await fs.readFile(eventsFilePath(baseDir), "utf8");
        return text
          .split("\n")
          .filter(Boolean)
          .slice(-Math.max(0, limit))
          .map((line) => JSON.parse(line) as ModelMemoryRuntimeDirtyEvent);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return [];
        }
        throw error;
      }
    },
    markDirty(input) {
      return transition({
        eventType: "runtime_dirty_marked",
        transition: input,
        update(current) {
          const timestamp = nowIso(input.markedAt);
          const existingDirty =
            current.status !== "clean" && current.dirtyId !== "runtime_dirty_clean";
          const status =
            current.status === "scheduled" || current.status === "rebuilding"
              ? current.status
              : "dirty";
          return normalizeState({
            ...current,
            dirtyId: existingDirty ? current.dirtyId : `runtime_dirty_${randomUUID()}`,
            status,
            dirtyReason: input.reason,
            affectedMemoryIds: mergeIdLists(current.affectedMemoryIds, input.memoryIds),
            affectedSourceIds: mergeIdLists(current.affectedSourceIds, input.sourceIds),
            affectedEventIds: mergeIdLists(current.affectedEventIds, input.eventIds),
            affectedEdgeIds: mergeIdLists(current.affectedEdgeIds, input.edgeIds),
            affectedProjectionTargetIds: mergeIdLists(
              current.affectedProjectionTargetIds,
              input.projectionTargetIds,
            ),
            writeCountSinceLastRebuild: current.writeCountSinceLastRebuild + 1,
            markedAt: current.markedAt ?? timestamp,
            lastFailureClass: undefined,
            lastFailureStage: undefined,
            lastFailureAt: undefined,
            schedulerGeneration: current.schedulerGeneration + 1,
          });
        },
      });
    },
    markScheduled(input) {
      return transition({
        eventType: "runtime_rebuild_scheduled",
        transition: input,
        update(current) {
          return {
            ...current,
            status: "scheduled",
            scheduledAt: nowIso(),
          };
        },
      });
    },
    markRebuildStarted(input) {
      return transition({
        eventType: "runtime_rebuild_started",
        transition: input,
        update(current) {
          return {
            ...current,
            status: "rebuilding",
            rebuildStartedAt: nowIso(),
            rebuildAttemptCount: current.rebuildAttemptCount + 1,
          };
        },
      });
    },
    markRebuildCompleted(input) {
      return transition({
        eventType: "runtime_rebuild_completed",
        durationMs: input?.durationMs,
        update(current) {
          const concurrentDirty =
            input?.startedGeneration !== undefined &&
            current.schedulerGeneration > input.startedGeneration;
          if (concurrentDirty) {
            return {
              ...current,
              status: "dirty",
              scheduledAt: undefined,
              rebuildStartedAt: undefined,
              lastRebuildAt: nowIso(),
              lastRebuildDurationMs: input?.durationMs,
            };
          }
          return {
            ...cleanState(),
            dirtyId: current.dirtyId,
            lastRebuildAt: nowIso(),
            lastRebuildDurationMs: input?.durationMs,
          };
        },
      });
    },
    markRebuildFailed(input) {
      return transition({
        eventType: "runtime_rebuild_failed",
        transition: input,
        failureClass: input.failureClass,
        failureStage: input.failureStage,
        update(current) {
          return {
            ...current,
            status: "failed",
            lastFailureClass: input.failureClass,
            lastFailureStage: sanitizeSafeSegment(input.failureStage),
            lastFailureAt: nowIso(),
          };
        },
      });
    },
    markRebuildSkippedLockBusy(input) {
      return transition({
        eventType: "runtime_rebuild_skipped_lock_busy",
        transition: { ...input, schedulerReason: input?.schedulerReason ?? "already_active" },
        failureClass: "runtime_rebuild_lock_busy",
        failureStage: "runtime_rebuild_lock",
        update(current) {
          return {
            ...current,
            status: "dirty",
            scheduledAt: undefined,
            rebuildStartedAt: undefined,
            lastFailureClass: "runtime_rebuild_lock_busy",
            lastFailureStage: "runtime_rebuild_lock",
            lastFailureAt: nowIso(),
          };
        },
      });
    },
    recordCoalesced(input) {
      return transition({
        eventType: "runtime_rebuild_coalesced",
        transition: { ...input, schedulerReason: input?.schedulerReason ?? "already_active" },
        update(current) {
          return current;
        },
      });
    },
    requestRebuild(input) {
      return transition({
        eventType: "runtime_rebuild_admin_requested",
        transition: { ...input, schedulerReason: "manual_admin_request" },
        update(current) {
          return {
            ...current,
            status: current.status === "clean" ? "dirty" : current.status,
            dirtyId: current.status === "clean" ? `runtime_dirty_${randomUUID()}` : current.dirtyId,
            dirtyReason: "manual_admin_request",
            markedAt: current.markedAt ?? nowIso(),
            schedulerGeneration: current.schedulerGeneration + 1,
          };
        },
      });
    },
    clearDirty() {
      return transition({
        eventType: "runtime_dirty_cleared",
        update(current) {
          return {
            ...cleanState(),
            dirtyId: current.dirtyId,
            lastRebuildAt: current.lastRebuildAt,
            lastRebuildDurationMs: current.lastRebuildDurationMs,
          };
        },
      });
    },
  };
}

function defaultScheduleTimer(work: () => void, delayMs: number): RuntimeDirtyTimer {
  const timer = setTimeout(work, delayMs);
  timer.unref?.();
  return timer;
}

function shouldScheduleRebuild(params: {
  state: ModelMemoryRuntimeDirtyState;
  settings: ModelMemoryRuntimeRebuildSchedulerSettings;
  now: Date;
}): ModelMemoryRuntimeRebuildSchedulerReason {
  if (!params.settings.enabled) {
    return "disabled";
  }
  if (params.state.status === "scheduled" || params.state.status === "rebuilding") {
    return "already_active";
  }
  if (params.state.writeCountSinceLastRebuild >= params.settings.coalesceWrites) {
    return "write_threshold";
  }
  const markedAt = params.state.markedAt ? Date.parse(params.state.markedAt) : NaN;
  if (Number.isFinite(markedAt) && params.now.getTime() - markedAt >= params.settings.coalesceMs) {
    return "age_threshold";
  }
  return "deferred";
}

async function notifyEvent(
  event: ModelMemoryRuntimeDirtyEvent,
  onEvent: RuntimeDirtyEventObserver | undefined,
) {
  await onEvent?.(event).catch(() => undefined);
}

function isRuntimeRebuildLockBusy(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "RuntimeRebuildLockBusyError" ||
      error.message.toLowerCase().includes("runtime rebuild lock is busy"))
  );
}

export async function runModelMemoryRuntimeRebuildWorker(input: {
  store?: ModelMemoryRuntimeDirtyStore;
  env?: NodeJS.ProcessEnv;
  rebuild: RuntimeRebuildTask;
  classifyFailure?: (error: unknown) => ModelMemoryRuntimeRebuildFailureClass;
  onEvent?: RuntimeDirtyEventObserver;
}): Promise<ModelMemoryRuntimeDirtyState> {
  const env = input.env ?? process.env;
  const store = input.store ?? createModelMemoryRuntimeDirtyStore({ env });
  const settings = resolveModelMemoryRuntimeRebuildSchedulerSettings(env);
  const key = store.baseDir;

  if (!settings.enabled) {
    const transition = await store.recordCoalesced({ schedulerReason: "disabled" });
    await notifyEvent(transition.event, input.onEvent);
    return transition.state;
  }

  if (activeRebuilds.size >= settings.maxConcurrency || activeRebuilds.has(key)) {
    const transition = await store.recordCoalesced({ schedulerReason: "already_active" });
    await notifyEvent(transition.event, input.onEvent);
    return transition.state;
  }

  const current = await store.getState();
  if (current.status === "clean") {
    return current;
  }

  activeRebuilds.add(key);
  let startedGeneration = current.schedulerGeneration;
  const startedAt = Date.now();
  try {
    const started = await store.markRebuildStarted();
    startedGeneration = started.state.schedulerGeneration;
    await notifyEvent(started.event, input.onEvent);
    await input.rebuild(started.state);
    const completed = await store.markRebuildCompleted({
      startedGeneration,
      durationMs: Date.now() - startedAt,
    });
    await notifyEvent(completed.event, input.onEvent);
    return completed.state;
  } catch (error) {
    const transition = isRuntimeRebuildLockBusy(error)
      ? await store.markRebuildSkippedLockBusy()
      : await store.markRebuildFailed({
          failureClass: input.classifyFailure?.(error) ?? "other",
          failureStage: "runtime_rebuild",
          retryDelayMs:
            settings.maxRetries > 0 && current.rebuildAttemptCount < settings.maxRetries
              ? settings.retryDelayMs
              : undefined,
        });
    await notifyEvent(transition.event, input.onEvent);
    return transition.state;
  } finally {
    activeRebuilds.delete(key);
  }
}

export async function markModelMemoryRuntimeDirtyAndSchedule(input: {
  store?: ModelMemoryRuntimeDirtyStore;
  env?: NodeJS.ProcessEnv;
  dirty: ModelMemoryRuntimeDirtyMarkInput;
  rebuild?: RuntimeRebuildTask;
  onEvent?: RuntimeDirtyEventObserver;
  now?: Date;
  scheduleTimer?: (work: () => void, delayMs: number) => RuntimeDirtyTimer | undefined;
}): Promise<ModelMemoryRuntimeDirtyScheduleResult> {
  const env = input.env ?? process.env;
  const store = input.store ?? createModelMemoryRuntimeDirtyStore({ env });
  const settings = resolveModelMemoryRuntimeRebuildSchedulerSettings(env);
  const dirty = await store.markDirty(input.dirty);
  await notifyEvent(dirty.event, input.onEvent);

  const schedulerReason = shouldScheduleRebuild({
    state: dirty.state,
    settings,
    now: input.now ?? new Date(),
  });

  if (schedulerReason === "disabled") {
    return {
      state: dirty.state,
      events: [dirty.event],
      scheduled: false,
      schedulerReason,
    };
  }

  if (schedulerReason === "already_active") {
    const coalesced = await store.recordCoalesced({
      captureJobId: input.dirty.captureJobId,
      sessionId: input.dirty.sessionId,
      sessionKey: input.dirty.sessionKey,
      agentId: input.dirty.agentId,
      schedulerReason,
    });
    await notifyEvent(coalesced.event, input.onEvent);
    return {
      state: coalesced.state,
      events: [dirty.event, coalesced.event],
      scheduled: false,
      schedulerReason,
    };
  }

  if (schedulerReason === "deferred") {
    if (input.rebuild && !scheduledRebuilds.has(store.baseDir)) {
      const markedAt = dirty.state.markedAt ? Date.parse(dirty.state.markedAt) : Date.now();
      const ageMs = Math.max(0, (input.now ?? new Date()).getTime() - markedAt);
      const delayMs = Math.max(0, settings.coalesceMs - ageMs);
      const timer = (input.scheduleTimer ?? defaultScheduleTimer)(() => {
        scheduledRebuilds.delete(store.baseDir);
        void runModelMemoryRuntimeRebuildWorker({
          store,
          env,
          rebuild: input.rebuild as RuntimeRebuildTask,
          onEvent: input.onEvent,
        });
      }, delayMs);
      if (timer) {
        scheduledRebuilds.set(store.baseDir, timer);
      }
    }
    return {
      state: dirty.state,
      events: [dirty.event],
      scheduled: false,
      schedulerReason,
    };
  }

  const scheduled = await store.markScheduled({
    captureJobId: input.dirty.captureJobId,
    sessionId: input.dirty.sessionId,
    sessionKey: input.dirty.sessionKey,
    agentId: input.dirty.agentId,
    schedulerReason,
  });
  await notifyEvent(scheduled.event, input.onEvent);

  if (input.rebuild) {
    const existing = scheduledRebuilds.get(store.baseDir);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = (input.scheduleTimer ?? defaultScheduleTimer)(() => {
      scheduledRebuilds.delete(store.baseDir);
      void runModelMemoryRuntimeRebuildWorker({
        store,
        env,
        rebuild: input.rebuild as RuntimeRebuildTask,
        onEvent: input.onEvent,
      });
    }, 0);
    if (timer) {
      scheduledRebuilds.set(store.baseDir, timer);
    }
  }

  return {
    state: scheduled.state,
    events: [dirty.event, scheduled.event],
    scheduled: true,
    schedulerReason,
  };
}

export async function resetModelMemoryRuntimeDirtyStoreForTests(
  input: {
    baseDir?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<void> {
  const baseDir = path.resolve(
    input.baseDir ?? resolveDefaultModelMemoryRuntimeDirtyStoreDir(input.env ?? process.env),
  );
  const timer = scheduledRebuilds.get(baseDir);
  if (timer) {
    clearTimeout(timer);
    scheduledRebuilds.delete(baseDir);
  }
  activeRebuilds.delete(baseDir);
  await fs.rm(baseDir, { recursive: true, force: true });
}
