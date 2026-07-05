// Task readback progress is a projection of native session evidence and task execution receipts,
// not raw task-row lifecycle state.
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import {
  getSessionDisplaySubagentRunByChildSessionKey,
  getSubagentSessionRuntimeMs,
  getSubagentSessionStartedAt,
  isSubagentRunLive,
  listDescendantRunsForRequester,
  resolveSubagentSessionStatus,
} from "../agents/subagent-registry-read.js";
import type { SubagentRunRecord } from "../agents/subagent-registry.types.js";
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

function inferAgentRoleFromSessionKey(sessionKey: string | undefined): string | undefined {
  const match = sessionKey?.match(/^agent:([^:]+):/u);
  return normalizeOptionalString(match?.[1]);
}

function candidateTaskChildRunRoots(task: TaskRecord): string[] {
  const roots = [task.childSessionKey, task.requesterSessionKey, task.ownerKey]
    .map((value) => normalizeOptionalString(value))
    .filter((value): value is string => Boolean(value));
  return [...new Set(roots)];
}

function childRunFallsWithinTaskWindow(task: TaskRecord, run: SubagentRunRecord): boolean {
  const lowerBound = task.startedAt ?? task.createdAt;
  const upperBound = task.endedAt;
  if (typeof lowerBound === "number" && run.createdAt < lowerBound) {
    return false;
  }
  if (typeof upperBound === "number" && run.createdAt > upperBound) {
    return false;
  }
  return true;
}

function collectDescendantRunsForTask(task: TaskRecord): SubagentRunRecord[] {
  const byRunId = new Map<string, SubagentRunRecord>();
  for (const root of candidateTaskChildRunRoots(task)) {
    for (const run of listDescendantRunsForRequester(root)) {
      if (!childRunFallsWithinTaskWindow(task, run)) {
        continue;
      }
      const existing = byRunId.get(run.runId);
      if (!existing || run.createdAt > existing.createdAt) {
        byRunId.set(run.runId, run);
      }
    }
  }
  return [...byRunId.values()].sort((a, b) => a.createdAt - b.createdAt);
}

function isIssueChildRunStatus(status: string | undefined): boolean {
  return status === "failed" || status === "timeout" || status === "killed";
}

function resolveChildRunRole(run: SubagentRunRecord): string | undefined {
  return (
    inferAgentRoleFromSessionKey(run.childSessionKey) ??
    truncateTaskProgressNote(run.label) ??
    truncateTaskProgressNote(run.taskName)
  );
}

function childRunLooksLikeReviewer(run: SubagentRunRecord): boolean {
  const haystack = [resolveChildRunRole(run), run.label, run.taskName]
    .map((value) => normalizeOptionalString(value)?.toLowerCase())
    .filter(Boolean)
    .join(" ");
  return /\breviewer\b|\breview\b/u.test(haystack);
}

function resolveDescendantChildRunPhase(run: SubagentRunRecord): string | undefined {
  return resolveSubagentSessionStatus(run);
}

function selectMostUsefulDescendantRun(
  task: TaskRecord,
  runs: readonly SubagentRunRecord[],
): SubagentRunRecord | undefined {
  if (runs.length === 0) {
    return undefined;
  }
  const directChildSessionKey = normalizeOptionalString(task.childSessionKey);
  const candidateRuns = directChildSessionKey
    ? runs.filter((run) => normalizeOptionalString(run.childSessionKey) !== directChildSessionKey)
    : runs;
  if (candidateRuns.length === 0) {
    return undefined;
  }
  const newestFirst = [...candidateRuns].sort((a, b) => b.createdAt - a.createdAt);
  return (
    newestFirst.find((run) => resolveDescendantChildRunPhase(run) === "running") ??
    newestFirst.find((run) => isIssueChildRunStatus(resolveDescendantChildRunPhase(run))) ??
    newestFirst[0]
  );
}

function resolveParentPhaseFromDescendantRun(run: SubagentRunRecord): string {
  const childPhase = resolveDescendantChildRunPhase(run);
  if (childPhase === "running") {
    return "waiting_on_child";
  }
  if (isIssueChildRunStatus(childPhase)) {
    return "recovering_from_failed_child";
  }
  if (childRunLooksLikeReviewer(run)) {
    return "handling_reviewer_delta";
  }
  return "synthesizing_after_child_work";
}

function resolveDescendantChildRunProgressProjection(
  task: TaskRecord,
  now = Date.now(),
  context?: TaskReadbackProgressProjectionContext,
): ReadbackProgressProjection | undefined {
  if (task.status !== "running" && task.status !== "queued") {
    return undefined;
  }
  const runs = collectDescendantRunsForTask(task);
  const selected = selectMostUsefulDescendantRun(task, runs);
  if (!selected) {
    return undefined;
  }
  const childPhase = resolveDescendantChildRunPhase(selected);
  const role = resolveChildRunRole(selected);
  const currentPhase = resolveParentPhaseFromDescendantRun(selected);
  const spawnReason = truncateTaskProgressNote(selected.task);
  const childLabel =
    role ?? truncateTaskProgressNote(selected.label) ?? truncateTaskProgressNote(selected.taskName);
  const childTrajectoryProgress = resolveTaskSessionTrajectoryProgressProjection(
    {
      task,
      sessionKey: selected.childSessionKey,
      pointerLabel: "descendant child session trajectory",
    },
    context,
  );
  const note =
    childPhase === "running"
      ? `Child run is active; parent is waiting on ${childLabel ?? "child work"}.`
      : `Child run is ${childPhase ?? "settled"}; parent is ${currentPhase.replace(/_/gu, " ")}.`;
  return {
    source: childTrajectoryProgress?.source ?? "subagent-registry",
    ref: childTrajectoryProgress?.ref ?? `subagent-run:${selected.runId}`,
    currentPhase,
    activeLabel:
      childLabel ??
      childTrajectoryProgress?.activeLabel ??
      truncateTaskProgressNote(task.label) ??
      normalizeOptionalString(task.agentId) ??
      normalizeOptionalString(task.runtime),
    observedAt:
      childTrajectoryProgress?.observedAt ??
      formatTaskProgressObservedAt(
        selected.endedAt,
        selected.startedAt,
        selected.createdAt,
        task.lastEventAt,
      ),
    elapsedMs: resolveElapsedMs(now, task.startedAt, task.createdAt),
    durationMs: childTrajectoryProgress?.durationMs ?? getSubagentSessionRuntimeMs(selected, now),
    sourceEventType: childTrajectoryProgress?.sourceEventType ?? "subagent.descendant",
    ...(childTrajectoryProgress?.sourceEventSeq !== undefined
      ? { sourceEventSeq: childTrajectoryProgress.sourceEventSeq }
      : {}),
    ...(childTrajectoryProgress?.toolName ? { toolName: childTrajectoryProgress.toolName } : {}),
    ...(childTrajectoryProgress?.command ? { command: childTrajectoryProgress.command } : {}),
    ...(childTrajectoryProgress?.exitCode !== undefined
      ? { exitCode: childTrajectoryProgress.exitCode }
      : {}),
    ...(childTrajectoryProgress?.validationClass
      ? { validationClass: childTrajectoryProgress.validationClass }
      : {}),
    ...(childTrajectoryProgress?.outputSummary
      ? { outputSummary: childTrajectoryProgress.outputSummary }
      : {}),
    ...(childTrajectoryProgress?.repairAction
      ? { repairAction: childTrajectoryProgress.repairAction }
      : {}),
    ...(role ? { childRole: role } : {}),
    ...(childPhase ? { childPhase } : {}),
    ...(spawnReason ? { spawnReason } : {}),
    note,
    pointer: {
      kind: "session",
      ref: selected.childSessionKey,
      label: "descendant child session",
    },
    derivedBy: childTrajectoryProgress
      ? "resolveTaskReadbackProgressProjection+readLatestTrajectoryProgressProjection"
      : "resolveTaskReadbackProgressProjection",
    bounded: true,
  };
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
  const childRole = inferAgentRoleFromSessionKey(task.childSessionKey);
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
  const childSessionKey = normalizeOptionalString(task.childSessionKey);
  const now = context?.now ?? Date.now();
  const taskRunEventProgress = resolveTaskRunEventProgressProjection(task, now);
  if (isCodexNativeSubagentTask(task) && taskRunEventProgress) {
    return taskRunEventProgress;
  }
  const childSessionProgress = resolveChildSessionTrajectoryProgressProjection(task, context);
  if (childSessionProgress) {
    return childSessionProgress;
  }
  const descendantChildProgress = resolveDescendantChildRunProgressProjection(task, now, context);
  if (descendantChildProgress) {
    return descendantChildProgress;
  }
  if (childSessionKey) {
    const subagentRun = getSessionDisplaySubagentRunByChildSessionKey(childSessionKey);
    if (subagentRun && isSubagentRunLive(subagentRun)) {
      const startedAt = getSubagentSessionStartedAt(subagentRun) ?? subagentRun.createdAt;
      return {
        source: "subagent-registry",
        ref: `subagent-run:${subagentRun.runId}`,
        currentPhase: resolveSubagentSessionStatus(subagentRun),
        activeLabel:
          truncateTaskProgressNote(subagentRun.label) ??
          truncateTaskProgressNote(subagentRun.taskName) ??
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
    const settledChildStatus = resolveSubagentSessionStatus(subagentRun);
    if (subagentRun && settledChildStatus && settledChildStatus !== "running") {
      const startedAt = getSubagentSessionStartedAt(subagentRun) ?? subagentRun.createdAt;
      return {
        source: "subagent-registry",
        ref: `subagent-run:${subagentRun.runId}`,
        currentPhase: settledChildStatus,
        activeLabel:
          truncateTaskProgressNote(subagentRun.label) ??
          truncateTaskProgressNote(subagentRun.taskName) ??
          normalizeOptionalString(task.agentId) ??
          normalizeOptionalString(task.runtime),
        observedAt: formatTaskProgressObservedAt(
          subagentRun.endedAt,
          task.lastEventAt,
          subagentRun.startedAt,
          subagentRun.createdAt,
        ),
        elapsedMs:
          getSubagentSessionRuntimeMs(subagentRun, now) ?? resolveElapsedMs(now, startedAt),
        note: `Child run is ${settledChildStatus}; task row has not finalized.`,
        pointer: {
          kind: "session",
          ref: childSessionKey,
          label: "settled child session",
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
