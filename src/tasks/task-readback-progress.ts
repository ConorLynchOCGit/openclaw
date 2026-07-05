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
const CODEX_NATIVE_SUBAGENT_TASK_KIND = "codex-native";
const CODEX_NATIVE_SUBAGENT_RUN_ID_PREFIX = "codex-thread:";

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

function isCodexNativeSubagentTask(task: TaskRecord): boolean {
  return (
    task.taskKind === CODEX_NATIVE_SUBAGENT_TASK_KIND ||
    normalizeOptionalString(task.runId)?.startsWith(CODEX_NATIVE_SUBAGENT_RUN_ID_PREFIX) === true
  );
}

function stripRoleParenthetical(value: string): string {
  return value.replace(/\s+\([^)]*\)\s*$/u, "").trim();
}

function resolveNativeSubagentSummaryField(
  value: string | undefined,
  field: "role" | "agent_path" | "phase" | "spawn_reason",
): string | undefined {
  const text = normalizeOptionalString(value);
  if (!text) {
    return undefined;
  }
  const match = text.match(new RegExp(`\\b${field}:\\s*([^;)\\r\\n]+)`, "iu"));
  const raw = normalizeOptionalString(match?.[1]);
  return normalizeOptionalString(raw?.replace(/[.\s]+$/u, ""));
}

function resolveCodexPromptRole(value: string | undefined): string | undefined {
  const text = normalizeOptionalString(value);
  if (!text) {
    return undefined;
  }
  const match = text.match(/(?:^|\n)\s*Role:\s*([A-Za-z0-9_.-]+)/u);
  return normalizeOptionalString(match?.[1]?.replace(/[.\s]+$/u, ""));
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
  ]) {
    if (taskEventMetadataString(metadata, key)) {
      return true;
    }
  }
  return (
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

function resolveCodexNativeChildRole(
  task: TaskRecord,
  note: string | undefined,
  metadata?: TaskEventMetadata,
): string | undefined {
  const fromMetadata = taskEventMetadataString(metadata, "childRole");
  if (fromMetadata) {
    return fromMetadata;
  }
  const fromNote = resolveNativeSubagentSummaryField(note, "role");
  if (fromNote) {
    return fromNote;
  }
  const fromTaskPrompt = resolveCodexPromptRole(task.task);
  if (fromTaskPrompt) {
    return fromTaskPrompt;
  }
  const label = truncateTaskProgressNote(task.label);
  if (!label || label === "Codex subagent") {
    return undefined;
  }
  return normalizeOptionalString(stripRoleParenthetical(label));
}

function resolveCodexNativeChildAgentPath(
  note: string | undefined,
  metadata?: TaskEventMetadata,
): string | undefined {
  const fromMetadata = taskEventMetadataString(metadata, "childAgentPath");
  if (fromMetadata) {
    return fromMetadata;
  }
  const fromNote = resolveNativeSubagentSummaryField(note, "agent_path");
  return fromNote;
}

function resolveCodexNativeChildPhase(
  latestEvent: NonNullable<TaskRecord["executionReceipt"]>["latestEvent"],
  note: string | undefined,
  task: TaskRecord,
  metadata?: TaskEventMetadata,
): string | undefined {
  const fromMetadata = taskEventMetadataString(metadata, "childPhase");
  if (fromMetadata) {
    return fromMetadata;
  }
  const fromNote = resolveNativeSubagentSummaryField(note, "phase");
  if (fromNote) {
    return fromNote;
  }
  const normalized = note?.toLowerCase() ?? "";
  if (normalized.includes("initializing")) {
    return "pre_implementation_scout";
  }
  if (normalized.includes("running") || normalized.includes("active")) {
    return task.status === "running" ? "active_child_work" : undefined;
  }
  if (normalized.includes("spawned") || normalized.includes("started")) {
    return "child_spawned";
  }
  if (normalized.includes("finished") || normalized.includes("completed")) {
    return "child_completed";
  }
  if (normalized.includes("blocked")) {
    return "child_blocked";
  }
  if (latestEvent?.kind === "running") {
    return "child_spawned";
  }
  return undefined;
}

function resolveCodexNativeSpawnReason(
  task: TaskRecord,
  note: string | undefined,
  metadata?: TaskEventMetadata,
): string | undefined {
  const fromMetadata = taskEventMetadataString(metadata, "spawnReason");
  if (fromMetadata) {
    return truncateTaskProgressNote(fromMetadata);
  }
  const fromNote = resolveNativeSubagentSummaryField(note, "spawn_reason");
  if (fromNote) {
    return truncateTaskProgressNote(fromNote);
  }
  const taskText = normalizeOptionalString(task.task);
  if (!taskText || /^Codex native subagent\b/u.test(taskText)) {
    return undefined;
  }
  return truncateTaskProgressNote(taskText);
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
  const childRole = resolveAgentIdFromSessionKey(task.childSessionKey);
  return {
    source: "task-run-event",
    ref: `task-event:${task.taskId}:${task.endedAt ?? task.lastEventAt ?? task.startedAt ?? task.createdAt}:terminal`,
    currentPhase: childRole ? task.status : `task_${task.status}`,
    activeLabel:
      truncateTaskProgressNote(task.label) ??
      normalizeOptionalString(task.agentId) ??
      normalizeOptionalString(task.taskKind) ??
      normalizeOptionalString(task.runtime),
    observedAt: formatTaskProgressObservedAt(task.endedAt, task.lastEventAt, task.startedAt),
    elapsedMs: resolveElapsedMs(now, task.startedAt, task.createdAt),
    sourceEventType: `task.${task.status}`,
    outputSummary,
    ...(childRole ? { childRole, childPhase: task.status } : {}),
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

function resolveTaskRunEventProgressProjection(
  task: TaskRecord,
  now = Date.now(),
): ReadbackProgressProjection | undefined {
  const latestEvent = task.executionReceipt?.latestEvent;
  const note = truncateTaskProgressNote(latestEvent?.summary);
  if (!latestEvent) {
    return undefined;
  }
  const metadata = latestEvent.metadata;
  const codexNativeChild = isCodexNativeSubagentTask(task);
  if (!note && !codexNativeChild && !taskEventMetadataHasReadbackSignal(metadata)) {
    return undefined;
  }
  const childRole = codexNativeChild
    ? resolveCodexNativeChildRole(task, note, metadata)
    : undefined;
  const childAgentPath = codexNativeChild
    ? resolveCodexNativeChildAgentPath(note, metadata)
    : undefined;
  const childPhase = codexNativeChild
    ? resolveCodexNativeChildPhase(latestEvent, note, task, metadata)
    : undefined;
  const spawnReason = codexNativeChild
    ? resolveCodexNativeSpawnReason(task, note, metadata)
    : undefined;
  const toolName = taskEventMetadataString(metadata, "toolName");
  const command = taskEventMetadataString(metadata, "command");
  const validationClass = taskEventMetadataString(metadata, "validationClass");
  const outputSummary = taskEventMetadataString(metadata, "outputSummary");
  const repairAction = taskEventMetadataString(metadata, "repairAction");
  const exitCode = taskEventMetadataNumber(metadata, "exitCode");
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
  const projectedNote = truncateTaskProgressNote(
    [note, recoveryNote].filter(Boolean).join(" ") || undefined,
  );
  return {
    source: "task-run-event",
    ref: `task-event:${task.taskId}:${latestEvent.at}:${latestEvent.kind}`,
    currentPhase: childPhase ?? (latestEvent.kind === "progress" ? task.status : latestEvent.kind),
    activeLabel:
      childRole ??
      truncateTaskProgressNote(task.label) ??
      normalizeOptionalString(task.agentId) ??
      normalizeOptionalString(task.taskKind) ??
      normalizeOptionalString(task.runtime),
    observedAt: formatTaskProgressObservedAt(latestEvent.at, task.lastEventAt),
    elapsedMs: resolveElapsedMs(now, task.startedAt, task.createdAt),
    sourceEventType: `task.${latestEvent.kind}`,
    ...(toolName ? { toolName } : {}),
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
  const sessionAgentId = resolveAgentIdFromSessionKey(task.requesterSessionKey);
  if (sessionAgentId) {
    agentIds.add(sessionAgentId);
  }
  const childAgentId = resolveAgentIdFromSessionKey(task.childSessionKey);
  if (childAgentId) {
    agentIds.add(childAgentId);
  }
  const hintedAgentId = resolveAgentIdFromSessionKey(sessionKeyHint);
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
    childRole: progress.childRole ?? resolveAgentIdFromSessionKey(childSessionKey),
    childPhase: progress.childPhase ?? "running",
    spawnReason: progress.spawnReason ?? truncateTaskProgressNote(task.task),
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
  const taskRunEventProgress = resolveTaskRunEventProgressProjection(task, now);
  if (isCodexNativeSubagentTask(task) && taskRunEventProgress) {
    return taskRunEventProgress;
  }
  const childSessionProgress = resolveChildSessionTrajectoryProgressProjection(task, context);
  if (childSessionProgress) {
    return childSessionProgress;
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

function resolveTaskRegistryProgressProjection(
  task: TaskRecord,
  context?: TaskReadbackProgressProjectionContext,
): ReadbackProgressProjection | undefined {
  if (task.status !== "running" && task.status !== "queued") {
    return undefined;
  }
  const now = context?.now ?? Date.now();
  const note =
    truncateTaskProgressNote(task.progressSummary) ??
    truncateTaskProgressNote(task.terminalSummary) ??
    "Native task row is active; no richer task receipt or trajectory progress is available yet.";
  return {
    source: "task-registry",
    ref: `task:${task.taskId}`,
    currentPhase: task.status,
    activeLabel:
      truncateTaskProgressNote(task.label) ??
      normalizeOptionalString(task.agentId) ??
      normalizeOptionalString(task.taskKind) ??
      normalizeOptionalString(task.runtime),
    observedAt: formatTaskProgressObservedAt(task.lastEventAt, task.startedAt, task.createdAt),
    elapsedMs: resolveElapsedMs(now, task.startedAt, task.createdAt),
    sourceEventType: "task.registry",
    note,
    pointer: {
      kind: "task",
      ref: task.taskId,
      label: "native task registry row",
    },
    derivedBy: "resolveTaskReadbackProgressProjection",
    bounded: true,
  };
}

export function resolveTaskReadbackProgressProjection(
  task: TaskRecord,
  context?: TaskReadbackProgressProjectionContext,
): ReadbackProgressProjection | undefined {
  if (task.status === "running" || task.status === "queued") {
    return (
      resolveFallbackTaskProgressProjection(task, context) ??
      resolveTaskRegistryProgressProjection(task, context)
    );
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
