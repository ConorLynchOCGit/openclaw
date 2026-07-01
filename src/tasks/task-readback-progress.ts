// Task readback progress is a projection of native session evidence and task execution receipts,
// not raw task-row lifecycle state.
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import {
  getSessionDisplaySubagentRunByChildSessionKey,
  getSubagentSessionRuntimeMs,
  getSubagentSessionStartedAt,
  isSubagentRunLive,
  resolveSubagentSessionStatus,
} from "../agents/subagent-registry-read.js";
import { getRuntimeConfig } from "../config/io.js";
import {
  loadSessionStore,
  resolveAgentSessionStoreTargetsSync,
  resolveAllAgentSessionStoreTargetsSync,
  resolveSessionStoreEntry,
  type SessionEntry,
  type SessionStoreTarget,
} from "../config/sessions.js";
import { readLatestTrajectoryProgressProjection } from "../gateway/session-utils.fs.js";
import { resolveAgentIdFromSessionKey } from "../routing/session-key.js";
import type { ReadbackProgressProjection } from "../shared/readback-progress.js";
import type { TaskRecord } from "./task-registry.types.js";

const TASK_PROGRESS_NOTE_MAX_CHARS = 240;
const ALL_SESSION_TARGETS_CACHE_KEY = "__all__";

export type TaskReadbackProgressProjectionContext = {
  sessionStoreCache?: Map<string, Record<string, SessionEntry>>;
  sessionTargetCache?: Map<string, SessionStoreTarget[]>;
};

export function createTaskReadbackProgressProjectionContext(): TaskReadbackProgressProjectionContext {
  return {
    sessionStoreCache: new Map(),
    sessionTargetCache: new Map(),
  };
}

function truncateTaskProgressNote(value: string | undefined): string | undefined {
  const text = normalizeOptionalString(value);
  if (!text) {
    return undefined;
  }
  if (text.length <= TASK_PROGRESS_NOTE_MAX_CHARS) {
    return text;
  }
  return `${text.slice(0, TASK_PROGRESS_NOTE_MAX_CHARS - 1)}…`;
}

function normalizeTimestampMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

function formatTaskProgressObservedAt(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    const ts = normalizeTimestampMs(candidate);
    if (ts === undefined) {
      continue;
    }
    try {
      return new Date(ts).toISOString();
    } catch {
      // Invalid timestamp values should not make task readback unavailable.
    }
  }
  return undefined;
}

function resolveElapsedMs(now: number, ...candidates: unknown[]): number | undefined {
  for (const candidate of candidates) {
    const ts = normalizeTimestampMs(candidate);
    if (ts === undefined) {
      continue;
    }
    return Math.max(0, now - ts);
  }
  return undefined;
}

function resolveTaskRunEventProgressProjection(
  task: TaskRecord,
): ReadbackProgressProjection | undefined {
  const latestEvent = task.executionReceipt?.latestEvent;
  const note = truncateTaskProgressNote(latestEvent?.summary);
  if (!latestEvent || !note) {
    return undefined;
  }
  const now = Date.now();
  return {
    source: "task-run-event",
    ref: `task-event:${task.taskId}:${latestEvent.at}:${latestEvent.kind}`,
    currentPhase: latestEvent.kind === "progress" ? task.status : latestEvent.kind,
    activeLabel:
      normalizeOptionalString(task.label) ??
      normalizeOptionalString(task.agentId) ??
      normalizeOptionalString(task.taskKind) ??
      normalizeOptionalString(task.runtime),
    observedAt: formatTaskProgressObservedAt(latestEvent.at, task.lastEventAt),
    elapsedMs: resolveElapsedMs(now, task.startedAt, task.createdAt),
    sourceEventType: `task.${latestEvent.kind}`,
    note,
    pointer: {
      kind: "task",
      ref: task.taskId,
      label: "task run receipt",
    },
    derivedBy: "resolveTaskReadbackProgressProjection",
    bounded: true,
  };
}

function progressHasUsefulSignal(progress: ReadbackProgressProjection): boolean {
  return Boolean(
    normalizeOptionalString(progress.sourceEventType) ??
    normalizeOptionalString(progress.activeLabel) ??
    normalizeOptionalString(progress.currentPhase) ??
    normalizeOptionalString(progress.note),
  );
}

function uniqueTargets(targets: SessionStoreTarget[]): SessionStoreTarget[] {
  const seen = new Set<string>();
  const unique: SessionStoreTarget[] = [];
  for (const target of targets) {
    if (seen.has(target.storePath)) {
      continue;
    }
    seen.add(target.storePath);
    unique.push(target);
  }
  return unique;
}

function sessionTargetsForTask(
  task: TaskRecord,
  context?: TaskReadbackProgressProjectionContext,
): SessionStoreTarget[] {
  const cfg = getRuntimeConfig();
  const agentIds = new Set<string>();
  const explicitAgentId = normalizeOptionalString(task.agentId);
  if (explicitAgentId) {
    agentIds.add(explicitAgentId);
  }
  const sessionAgentId = resolveAgentIdFromSessionKey(task.requesterSessionKey);
  if (sessionAgentId) {
    agentIds.add(sessionAgentId);
  }
  const cacheKey =
    agentIds.size > 0 ? [...agentIds].toSorted().join("|") : ALL_SESSION_TARGETS_CACHE_KEY;
  const cached = context?.sessionTargetCache?.get(cacheKey);
  if (cached) {
    return cached;
  }
  const targeted = [...agentIds].flatMap((agentId) =>
    resolveAgentSessionStoreTargetsSync(cfg, agentId),
  );
  const targets = uniqueTargets(
    targeted.length > 0 ? targeted : resolveAllAgentSessionStoreTargetsSync(cfg),
  );
  context?.sessionTargetCache?.set(cacheKey, targets);
  return targets;
}

function resolveStoreEntryForTaskSession(
  target: SessionStoreTarget,
  requesterSessionKey: string,
  context?: TaskReadbackProgressProjectionContext,
): SessionEntry | undefined {
  let store = context?.sessionStoreCache?.get(target.storePath);
  if (!store) {
    store = loadSessionStore(target.storePath, { clone: false });
    context?.sessionStoreCache?.set(target.storePath, store);
  }
  return resolveSessionStoreEntry({
    store,
    sessionKey: requesterSessionKey,
  }).existing;
}

function resolveRequesterSessionTrajectoryProgressProjection(
  task: TaskRecord,
  context?: TaskReadbackProgressProjectionContext,
): ReadbackProgressProjection | undefined {
  const requesterSessionKey = normalizeOptionalString(task.requesterSessionKey);
  if (!requesterSessionKey) {
    return undefined;
  }
  for (const target of sessionTargetsForTask(task, context)) {
    const entry = resolveStoreEntryForTaskSession(target, requesterSessionKey, context);
    const sessionId = normalizeOptionalString(entry?.sessionId);
    if (!sessionId) {
      continue;
    }
    const progress = readLatestTrajectoryProgressProjection(
      sessionId,
      target.storePath,
      entry?.sessionFile,
      target.agentId,
    );
    if (progress && progressHasUsefulSignal(progress)) {
      return {
        ...progress,
        pointer: progress.pointer ?? {
          kind: "trajectory",
          ref: `session:${sessionId}`,
          label: "requester session trajectory",
        },
      };
    }
  }
  return undefined;
}

function resolveFallbackTaskProgressProjection(
  task: TaskRecord,
  context?: TaskReadbackProgressProjectionContext,
): ReadbackProgressProjection | undefined {
  const childSessionKey = normalizeOptionalString(task.childSessionKey);
  const now = Date.now();
  const taskRunEventProgress = resolveTaskRunEventProgressProjection(task);
  if (childSessionKey) {
    const subagentRun = getSessionDisplaySubagentRunByChildSessionKey(childSessionKey);
    if (subagentRun && isSubagentRunLive(subagentRun)) {
      const startedAt = getSubagentSessionStartedAt(subagentRun) ?? subagentRun.createdAt;
      return {
        source: "subagent-registry",
        ref: `subagent-run:${subagentRun.runId}`,
        currentPhase: resolveSubagentSessionStatus(subagentRun),
        activeLabel:
          normalizeOptionalString(subagentRun.label) ??
          normalizeOptionalString(subagentRun.taskName) ??
          normalizeOptionalString(task.agentId) ??
          normalizeOptionalString(task.runtime),
        observedAt: formatTaskProgressObservedAt(
          task.lastEventAt,
          subagentRun.startedAt,
          subagentRun.createdAt,
        ),
        elapsedMs:
          getSubagentSessionRuntimeMs(subagentRun, now) ?? resolveElapsedMs(now, startedAt),
        note:
          truncateTaskProgressNote(taskRunEventProgress?.note ?? undefined) ??
          truncateTaskProgressNote(task.progressSummary) ??
          "Child run is active; session trajectory progress is not indexed yet.",
        pointer: {
          kind: "session",
          ref: childSessionKey,
          label: "child session",
        },
        derivedBy: "resolveTaskReadbackProgressProjection",
        bounded: true,
      };
    }
  }

  const requesterSessionProgress = resolveRequesterSessionTrajectoryProgressProjection(
    task,
    context,
  );
  if (requesterSessionProgress) {
    return requesterSessionProgress;
  }

  return taskRunEventProgress;
}

export function resolveTaskReadbackProgressProjection(
  task: TaskRecord,
  context?: TaskReadbackProgressProjectionContext,
): ReadbackProgressProjection | undefined {
  if (task.status !== "running" && task.status !== "queued") {
    return undefined;
  }
  return resolveFallbackTaskProgressProjection(task, context);
}
