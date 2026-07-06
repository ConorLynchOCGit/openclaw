// Task readback progress is a projection of native session evidence and task execution receipts,
// not raw task-row lifecycle state.
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
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
import type { TaskEventMetadata, TaskRecord } from "./task-registry.types.js";
import { sanitizeTaskStatusText } from "./task-status.js";

const TASK_PROGRESS_NOTE_MAX_CHARS = 240;
const ALL_SESSION_TARGETS_CACHE_KEY = "__all__";

export type TaskReadbackProgressProjectionContext = {
  sessionStoreCache?: Map<string, Record<string, SessionEntry>>;
  sessionTargetCache?: Map<string, SessionStoreTarget[]>;
  now?: number;
};

export function createTaskReadbackProgressProjectionContext(params?: {
  now?: number;
}): TaskReadbackProgressProjectionContext {
  return {
    sessionStoreCache: new Map(),
    sessionTargetCache: new Map(),
    ...(typeof params?.now === "number" && Number.isFinite(params.now) ? { now: params.now } : {}),
  };
}

export function canonicalTaskReadbackSessionKey(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toLowerCase() : null;
}

export function taskReadbackSessionEndpoints(task: TaskRecord): string[] {
  const seen = new Set<string>();
  const endpoints: string[] = [];
  for (const value of [task.requesterSessionKey, task.ownerKey, task.childSessionKey]) {
    const normalized = normalizeOptionalString(value);
    const canonical = canonicalTaskReadbackSessionKey(normalized);
    if (!normalized || !canonical || seen.has(canonical)) {
      continue;
    }
    seen.add(canonical);
    endpoints.push(normalized);
  }
  return endpoints;
}

export function taskTouchesReadbackSessionKey(task: TaskRecord, sessionKey: string): boolean {
  const canonicalSessionKey = canonicalTaskReadbackSessionKey(sessionKey);
  if (!canonicalSessionKey) {
    return false;
  }
  return taskReadbackSessionEndpoints(task).some(
    (endpoint) => canonicalTaskReadbackSessionKey(endpoint) === canonicalSessionKey,
  );
}

export function taskTouchesKnownReadbackSession(
  task: TaskRecord,
  knownSessionKeys: ReadonlySet<string>,
): boolean {
  return taskReadbackSessionEndpoints(task).some((endpoint) => {
    const canonical = canonicalTaskReadbackSessionKey(endpoint);
    return canonical ? knownSessionKeys.has(canonical) : false;
  });
}

function truncateTaskProgressNote(value: string | undefined): string | undefined {
  const text = sanitizeTaskStatusText(value, { maxChars: TASK_PROGRESS_NOTE_MAX_CHARS });
  if (!text) {
    return undefined;
  }
  return text;
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

function isGenericChildStartNote(value: string | undefined): boolean {
  const text = normalizeOptionalString(value)?.toLowerCase();
  return (
    text === "child run started." ||
    text === "child run started" ||
    text === "child started." ||
    text === "child started"
  );
}

function isFreeformProgressReceipt(
  latestEvent: NonNullable<TaskRecord["executionReceipt"]>["latestEvent"] | undefined,
) {
  if (!latestEvent) {
    return false;
  }
  return (
    latestEvent.kind === "progress" ||
    latestEvent.kind === "running" ||
    latestEvent.kind === "queued"
  );
}

function taskEventMetadataString(
  metadata: TaskEventMetadata | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" ? truncateTaskProgressNote(value) : undefined;
}

function taskEventMetadataNumber(
  metadata: TaskEventMetadata | undefined,
  key: string,
): number | undefined {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function taskEventMetadataBoolean(
  metadata: TaskEventMetadata | undefined,
  key: string,
): boolean | undefined {
  const value = metadata?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function taskEventMetadataHasReadbackSignal(metadata: TaskEventMetadata | undefined): boolean {
  if (!metadata) {
    return false;
  }
  for (const key of [
    "toolName",
    "command",
    "validationClass",
    "outputSummary",
    "repairAction",
    "recoveryKind",
    "recoveryAction",
    "recoveryReason",
    "childRole",
    "childAgentPath",
    "childPhase",
    "spawnReason",
    "nativeEventStream",
    "nativeEventPhase",
    "nativeEventToolName",
    "nativeEventItemStatus",
  ]) {
    if (taskEventMetadataString(metadata, key)) {
      return true;
    }
  }
  return (
    typeof metadata.nativeEventSeq === "number" ||
    typeof metadata.exitCode === "number" ||
    typeof metadata.recoveryAttempts === "number" ||
    typeof metadata.compactionCount === "number" ||
    typeof metadata.toolResultTruncationAttempted === "boolean"
  );
}

function formatRecoveryNote(params: {
  recoveryKind?: string;
  recoveryAction?: string;
  recoveryReason?: string;
  recoveryAttempts?: number;
  recoveryMaxAttempts?: number;
  compactionCount?: number;
  toolResultTruncationAttempted?: boolean;
}): string | undefined {
  if (!params.recoveryKind) {
    return undefined;
  }
  const attemptText =
    typeof params.recoveryAttempts === "number"
      ? ` attempts=${params.recoveryAttempts}/${params.recoveryMaxAttempts ?? "unknown"}`
      : "";
  const compactionText =
    typeof params.compactionCount === "number" ? ` compactions=${params.compactionCount}` : "";
  const truncationText =
    typeof params.toolResultTruncationAttempted === "boolean"
      ? ` tool_truncation=${params.toolResultTruncationAttempted ? "attempted" : "not_attempted"}`
      : "";
  const reasonText = params.recoveryReason ? ` reason=${params.recoveryReason}` : "";
  const actionText = params.recoveryAction ? ` action=${params.recoveryAction}` : "";
  return truncateTaskProgressNote(
    `Recovery ${params.recoveryKind}.${attemptText}${compactionText}${truncationText}${reasonText}${actionText}`,
  );
}

function resolveTaskTerminalErrorProgressProjection(
  task: TaskRecord,
  now = Date.now(),
): ReadbackProgressProjection | undefined {
  if (task.status !== "failed" && task.status !== "timed_out" && task.status !== "lost") {
    return undefined;
  }
  const outputSummary =
    truncateTaskProgressNote(task.terminalSummary) ?? truncateTaskProgressNote(task.error);
  if (!outputSummary) {
    return undefined;
  }
  return {
    source: "task-receipt",
    ref: `task-event:${task.taskId}:${task.endedAt ?? task.lastEventAt ?? task.startedAt ?? task.createdAt}:terminal`,
    currentPhase: `task_${task.status}`,
    activeLabel:
      truncateTaskProgressNote(task.label) ??
      normalizeOptionalString(task.agentId) ??
      normalizeOptionalString(task.taskKind) ??
      normalizeOptionalString(task.runtime),
    observedAt: formatTaskProgressObservedAt(task.endedAt, task.lastEventAt, task.startedAt),
    elapsedMs: resolveElapsedMs(now, task.startedAt, task.createdAt),
    sourceEventType: `task.${task.status}`,
    outputSummary,
    note: outputSummary,
    pointer: {
      kind: "task",
      ref: task.taskId,
      label: "terminal task error",
    },
    derivedBy: "resolveTaskReadbackProgressProjection",
    bounded: true,
  };
}

function resolveTaskLaunchWaitProgressProjection(
  task: TaskRecord,
  now = Date.now(),
): ReadbackProgressProjection | undefined {
  const childSessionKey = normalizeOptionalString(task.childSessionKey);
  if (!childSessionKey || (task.status !== "running" && task.status !== "queued")) {
    return undefined;
  }
  const observedAt = formatTaskProgressObservedAt(task.lastEventAt, task.startedAt, task.createdAt);
  const elapsedMs = resolveElapsedMs(now, task.startedAt, task.createdAt);
  const label =
    truncateTaskProgressNote(task.label) ??
    normalizeOptionalString(task.agentId) ??
    normalizeOptionalString(task.taskKind) ??
    normalizeOptionalString(task.runtime);
  return {
    source: "task-receipt",
    ref: `task:${task.taskId}`,
    currentPhase: task.status === "queued" ? "queued_child_work" : "waiting_on_child",
    ...(label ? { activeLabel: label } : {}),
    ...(observedAt ? { observedAt } : {}),
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    sourceEventType: `task.${task.status}`,
    note: `${task.status === "queued" ? "Queued child task" : "Parent is waiting on child task"} ${task.taskId}.`,
    pointer: {
      kind: "session",
      ref: childSessionKey,
      label: "child session",
    },
    derivedBy: "resolveTaskReadbackProgressProjection",
    bounded: true,
  };
}

function resolveTaskRunEventProgressProjection(
  task: TaskRecord,
  now = Date.now(),
): ReadbackProgressProjection | undefined {
  const latestEvent = task.executionReceipt?.latestEvent;
  if (!latestEvent) {
    return undefined;
  }
  const latestEventNote = truncateTaskProgressNote(latestEvent.summary);
  const note = latestEventNote;
  const metadata = latestEvent.metadata;
  const taskChildSessionKey = normalizeOptionalString(task.childSessionKey);
  if (!note && !taskEventMetadataHasReadbackSignal(metadata)) {
    return undefined;
  }
  const toolName = taskEventMetadataString(metadata, "toolName");
  const command = taskEventMetadataString(metadata, "command");
  const validationClass = taskEventMetadataString(metadata, "validationClass");
  const outputSummary = taskEventMetadataString(metadata, "outputSummary");
  const repairAction = taskEventMetadataString(metadata, "repairAction");
  const exitCode = taskEventMetadataNumber(metadata, "exitCode");
  const nativeEventStream = taskEventMetadataString(metadata, "nativeEventStream");
  const nativeEventSeq = taskEventMetadataNumber(metadata, "nativeEventSeq");
  const nativeEventPhase = taskEventMetadataString(metadata, "nativeEventPhase");
  const nativeEventToolName = taskEventMetadataString(metadata, "nativeEventToolName");
  const nativeEventItemStatus = taskEventMetadataString(metadata, "nativeEventItemStatus");
  const metadataChildRole = taskEventMetadataString(metadata, "childRole");
  const metadataChildAgentPath = taskEventMetadataString(metadata, "childAgentPath");
  const metadataChildPhase = taskEventMetadataString(metadata, "childPhase");
  const metadataSpawnReason = taskEventMetadataString(metadata, "spawnReason");
  const childRole = metadataChildRole;
  const childAgentPath = metadataChildAgentPath;
  const childPhase = metadataChildPhase;
  const spawnReason = metadataSpawnReason
    ? truncateTaskProgressNote(metadataSpawnReason)
    : undefined;
  const recoveryKind = taskEventMetadataString(metadata, "recoveryKind");
  const recoveryAction = taskEventMetadataString(metadata, "recoveryAction");
  const recoveryReason = taskEventMetadataString(metadata, "recoveryReason");
  const recoveryAttempts = taskEventMetadataNumber(metadata, "recoveryAttempts");
  const recoveryMaxAttempts = taskEventMetadataNumber(metadata, "recoveryMaxAttempts");
  const compactionCount = taskEventMetadataNumber(metadata, "compactionCount");
  const compactionTokensAfter = taskEventMetadataNumber(metadata, "compactionTokensAfter");
  const toolResultTruncationAttempted = taskEventMetadataBoolean(
    metadata,
    "toolResultTruncationAttempted",
  );
  const recoveryNote = formatRecoveryNote({
    recoveryKind,
    recoveryAction,
    recoveryReason,
    recoveryAttempts,
    recoveryMaxAttempts,
    compactionCount,
    toolResultTruncationAttempted,
  });
  const hasDirectEvidence = Boolean(
    toolName ||
    nativeEventToolName ||
    nativeEventStream ||
    nativeEventPhase ||
    nativeEventItemStatus ||
    nativeEventSeq !== undefined ||
    command ||
    exitCode !== undefined ||
    validationClass ||
    outputSummary ||
    repairAction ||
    metadataChildRole ||
    metadataChildAgentPath ||
    metadataChildPhase ||
    metadataSpawnReason ||
    recoveryKind ||
    recoveryAction ||
    recoveryReason ||
    recoveryAttempts !== undefined ||
    recoveryMaxAttempts !== undefined ||
    compactionCount !== undefined ||
    compactionTokensAfter !== undefined ||
    toolResultTruncationAttempted !== undefined,
  );
  const childTerminalSummaryIsCompatibilityText =
    Boolean(taskChildSessionKey) &&
    task.status === "succeeded" &&
    latestEvent.kind !== "progress" &&
    !hasDirectEvidence;
  const projectedNote = truncateTaskProgressNote(
    [childTerminalSummaryIsCompatibilityText ? undefined : note, recoveryNote]
      .filter(Boolean)
      .join(" ") || undefined,
  );
  const hasTerminalEvidence =
    latestEvent.kind !== "progress" || task.status === "failed" || task.status === "timed_out";
  if (
    !hasDirectEvidence &&
    (isGenericChildStartNote(note) || isFreeformProgressReceipt(latestEvent))
  ) {
    return undefined;
  }
  if (task.status === "running" || task.status === "queued") {
    const phase = childPhase ?? (latestEvent.kind === "progress" ? task.status : latestEvent.kind);
    if (!hasDirectEvidence && phase === "child_spawned") {
      return undefined;
    }
    if (
      !hasDirectEvidence &&
      !projectedNote &&
      !childRole &&
      !childAgentPath &&
      !spawnReason &&
      !hasTerminalEvidence
    ) {
      return undefined;
    }
  }
  return {
    source: "task-receipt",
    ref: `task-event:${task.taskId}:${latestEvent.at}:${latestEvent.kind}`,
    currentPhase:
      childPhase ??
      nativeEventPhase ??
      (latestEvent.kind === "progress" ? task.status : latestEvent.kind),
    activeLabel: nativeEventStream
      ? (childRole ??
        nativeEventToolName ??
        nativeEventItemStatus ??
        truncateTaskProgressNote(task.label) ??
        normalizeOptionalString(task.agentId) ??
        normalizeOptionalString(task.taskKind) ??
        normalizeOptionalString(task.runtime))
      : (truncateTaskProgressNote(task.label) ??
        childRole ??
        nativeEventToolName ??
        nativeEventItemStatus ??
        normalizeOptionalString(task.agentId) ??
        normalizeOptionalString(task.taskKind) ??
        normalizeOptionalString(task.runtime)),
    observedAt: formatTaskProgressObservedAt(latestEvent.at, task.lastEventAt),
    elapsedMs: resolveElapsedMs(now, task.startedAt, task.createdAt),
    sourceEventType: nativeEventStream ? `agent.${nativeEventStream}` : `task.${latestEvent.kind}`,
    ...(nativeEventSeq !== undefined ? { sourceEventSeq: nativeEventSeq } : {}),
    ...(toolName || nativeEventToolName ? { toolName: toolName ?? nativeEventToolName } : {}),
    ...(command ? { command } : {}),
    ...(typeof exitCode === "number" ? { exitCode } : {}),
    ...(validationClass ? { validationClass } : {}),
    ...(outputSummary ? { outputSummary: truncateTaskProgressNote(outputSummary) } : {}),
    ...(repairAction ? { repairAction: truncateTaskProgressNote(repairAction) } : {}),
    ...(recoveryKind ? { recoveryKind } : {}),
    ...(recoveryAction ? { recoveryAction } : {}),
    ...(recoveryReason ? { recoveryReason } : {}),
    ...(typeof recoveryAttempts === "number" ? { recoveryAttempts } : {}),
    ...(typeof recoveryMaxAttempts === "number" ? { recoveryMaxAttempts } : {}),
    ...(typeof compactionCount === "number" ? { compactionCount } : {}),
    ...(typeof compactionTokensAfter === "number" ? { compactionTokensAfter } : {}),
    ...(typeof toolResultTruncationAttempted === "boolean"
      ? { toolResultTruncationAttempted }
      : {}),
    ...(childRole ? { childRole } : {}),
    ...(childAgentPath ? { childAgentPath } : {}),
    ...(childPhase ? { childPhase } : {}),
    ...(spawnReason ? { spawnReason } : {}),
    ...(projectedNote ? { note: projectedNote } : {}),
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
  if (
    progress.source === "trajectory" &&
    !progress.sourceEventType &&
    normalizeOptionalString(progress.note)?.includes("no valid recent event") === true
  ) {
    return false;
  }
  return Boolean(
    normalizeOptionalString(progress.sourceEventType) ??
    normalizeOptionalString(progress.activeLabel) ??
    normalizeOptionalString(progress.currentPhase) ??
    normalizeOptionalString(progress.toolName) ??
    normalizeOptionalString(progress.command) ??
    normalizeOptionalString(progress.outputSummary) ??
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
  sessionKeyHint?: string,
): SessionStoreTarget[] {
  const cfg = getRuntimeConfig();
  const agentIds = new Set<string>();
  const explicitAgentId = normalizeOptionalString(task.agentId);
  if (explicitAgentId) {
    agentIds.add(explicitAgentId);
  }
  const requesterSessionKey = normalizeOptionalString(task.requesterSessionKey);
  const sessionAgentId = requesterSessionKey
    ? resolveAgentIdFromSessionKey(requesterSessionKey)
    : undefined;
  if (sessionAgentId) {
    agentIds.add(sessionAgentId);
  }
  const childSessionKey = normalizeOptionalString(task.childSessionKey);
  const childAgentId = childSessionKey ? resolveAgentIdFromSessionKey(childSessionKey) : undefined;
  if (childAgentId) {
    agentIds.add(childAgentId);
  }
  const hintedSessionKey = normalizeOptionalString(sessionKeyHint);
  const hintedAgentId = hintedSessionKey
    ? resolveAgentIdFromSessionKey(hintedSessionKey)
    : undefined;
  if (hintedAgentId) {
    agentIds.add(hintedAgentId);
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
  sessionKey: string,
  context?: TaskReadbackProgressProjectionContext,
): SessionEntry | undefined {
  let store = context?.sessionStoreCache?.get(target.storePath);
  if (!store) {
    store = loadSessionStore(target.storePath, { clone: false });
    context?.sessionStoreCache?.set(target.storePath, store);
  }
  return resolveSessionStoreEntry({
    store,
    sessionKey,
  }).existing;
}

function resolveTaskSessionTrajectoryProgressProjection(
  params: {
    task: TaskRecord;
    sessionKey: string;
    pointerLabel: string;
  },
  context?: TaskReadbackProgressProjectionContext,
): ReadbackProgressProjection | undefined {
  const sessionKey = normalizeOptionalString(params.sessionKey);
  if (!sessionKey) {
    return undefined;
  }
  for (const target of sessionTargetsForTask(params.task, context, sessionKey)) {
    const entry = resolveStoreEntryForTaskSession(target, sessionKey, context);
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
          label: params.pointerLabel,
        },
      };
    }
  }
  return undefined;
}

function resolveRequesterSessionTrajectoryProgressProjection(
  task: TaskRecord,
  context?: TaskReadbackProgressProjectionContext,
): ReadbackProgressProjection | undefined {
  return resolveTaskSessionTrajectoryProgressProjection(
    {
      task,
      sessionKey: task.requesterSessionKey,
      pointerLabel: "requester session trajectory",
    },
    context,
  );
}

function resolveChildSessionTrajectoryProgressProjection(
  task: TaskRecord,
  context?: TaskReadbackProgressProjectionContext,
): ReadbackProgressProjection | undefined {
  const childSessionKey = normalizeOptionalString(task.childSessionKey);
  if (!childSessionKey) {
    return undefined;
  }
  const progress = resolveTaskSessionTrajectoryProgressProjection(
    {
      task,
      sessionKey: childSessionKey,
      pointerLabel: "child session trajectory",
    },
    context,
  );
  if (!progress) {
    return undefined;
  }
  return {
    ...progress,
    pointer: {
      kind: "session",
      ref: childSessionKey,
      label: "child session trajectory",
    },
  };
}

function resolveFallbackTaskProgressProjection(
  task: TaskRecord,
  context?: TaskReadbackProgressProjectionContext,
): ReadbackProgressProjection | undefined {
  const now = context?.now ?? Date.now();
  const childSessionProgress = resolveChildSessionTrajectoryProgressProjection(task, context);
  if (childSessionProgress) {
    return childSessionProgress;
  }

  const requesterSessionProgress = resolveRequesterSessionTrajectoryProgressProjection(
    task,
    context,
  );
  if (task.childSessionKey && requesterSessionProgress) {
    return requesterSessionProgress;
  }

  const taskRunEventProgress = resolveTaskRunEventProgressProjection(task, now);
  if (requesterSessionProgress) {
    return requesterSessionProgress;
  }

  const launchWaitProgress = resolveTaskLaunchWaitProgressProjection(task, now);
  return taskRunEventProgress ?? launchWaitProgress;
}

export function resolveTaskReadbackProgressProjection(
  task: TaskRecord,
  context?: TaskReadbackProgressProjectionContext,
): ReadbackProgressProjection | undefined {
  if (task.status === "running" || task.status === "queued") {
    return resolveFallbackTaskProgressProjection(task, context);
  }
  const taskRunEventProgress = resolveTaskRunEventProgressProjection(
    task,
    context?.now ?? Date.now(),
  );
  if (taskRunEventProgress && progressHasUsefulSignal(taskRunEventProgress)) {
    return taskRunEventProgress;
  }
  const terminalErrorProgress = resolveTaskTerminalErrorProgressProjection(
    task,
    context?.now ?? Date.now(),
  );
  return terminalErrorProgress && progressHasUsefulSignal(terminalErrorProgress)
    ? terminalErrorProgress
    : undefined;
}
