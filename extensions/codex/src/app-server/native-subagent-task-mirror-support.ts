import { readCodexSubagentThreadSpawnSource } from "./native-subagent-source.js";
import { CODEX_NATIVE_SUBAGENT_RUN_ID_PREFIX } from "./native-subagent-task-ids.js";
import type {
  CodexSessionSource,
  CodexSubAgentThreadSpawnSource,
  CodexThread,
  CodexThreadStartedNotification,
  CodexThreadStatus,
  CodexThreadStatusChangedNotification,
  JsonObject,
  JsonValue,
} from "./protocol.js";
import { isJsonObject } from "./protocol.js";

export type NativeSubagentTaskEventMetadata = Record<string, string | number | boolean | null>;

export type PendingKeyedNativeSpawn = {
  identity: NativeSubagentIdentity;
  parentTurnId?: string;
};

export type PendingNativeFollowUp = {
  parentTurnId?: string;
  prompt?: string;
};

/** Converts a Codex child thread id into the OpenClaw task-runtime run id. */
export function codexNativeSubagentRunId(threadId: string): string {
  return `${CODEX_NATIVE_SUBAGENT_RUN_ID_PREFIX}${threadId.trim()}`;
}

/** Converts one native follow-up operation into a linked task-attempt run id. */
export function codexNativeSubagentFollowUpRunId(threadId: string, operationId: string): string {
  return `${codexNativeSubagentRunId(threadId)}:followup:${operationId.trim()}`;
}

export function readCodexNativeSubagentThreadId(runId: string | undefined): string | undefined {
  const normalized = trimOptional(runId);
  if (!normalized?.startsWith(CODEX_NATIVE_SUBAGENT_RUN_ID_PREFIX)) {
    return undefined;
  }
  return trimOptional(normalized.slice(CODEX_NATIVE_SUBAGENT_RUN_ID_PREFIX.length));
}

/** Reads a subagent thread-spawn source only when it belongs to the expected parent thread. */
export function readSubagentThreadSpawnSource(
  source: CodexSessionSource | null | undefined,
  parentThreadId: string,
): CodexSubAgentThreadSpawnSource | undefined {
  return readCodexSubagentThreadSpawnSource(source, parentThreadId);
}

export function readThreadStartedNotification(
  params: JsonObject,
): CodexThreadStartedNotification | undefined {
  const thread = params.thread;
  if (!isJsonObject(thread) || typeof thread.id !== "string") {
    return undefined;
  }
  return { thread: thread as CodexThread };
}

export function readThreadStatusChangedNotification(
  params: JsonObject,
): CodexThreadStatusChangedNotification | undefined {
  if (typeof params.threadId !== "string") {
    return undefined;
  }
  const status = params.status;
  if (!isJsonObject(status) || !isCodexThreadStatusType(status.type)) {
    return undefined;
  }
  return {
    threadId: params.threadId,
    status: status as CodexThreadStatus,
  };
}

export function isCodexThreadStatusType(value: unknown): value is CodexThreadStatus["type"] {
  return value === "notLoaded" || value === "idle" || value === "systemError" || value === "active";
}

export function readAgentsStates(
  value: JsonValue | undefined,
): Map<string, { status?: string; message?: string | null }> {
  const states = new Map<string, { status?: string; message?: string | null }>();
  if (!isJsonObject(value)) {
    return states;
  }
  for (const [threadId, rawState] of Object.entries(value)) {
    if (!isJsonObject(rawState)) {
      continue;
    }
    const status = readString(rawState, "status");
    const message = readNullableString(rawState, "message");
    states.set(threadId, { status, message });
  }
  return states;
}

export function readStringArray(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

export type NativeSubagentIdentity = {
  nickname?: string;
  role?: string;
  agentPath?: string;
  spawnReason?: string;
  taskName?: string;
  model?: string;
  reasoningEffort?: string;
};

export type NativeSubagentTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningOutputTokens?: number;
  totalTokens?: number;
};

export function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" ? trimOptional(value) : undefined;
}

export function readPersistedTaskMetadata(task: {
  detail?: JsonValue;
}): Record<string, unknown> | undefined {
  if (task.detail && typeof task.detail === "object" && !Array.isArray(task.detail)) {
    return task.detail;
  }
  return undefined;
}

export function readMetadataNumber(
  metadata: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function readPersistedNativeSubagentIdentity(
  metadata: Record<string, unknown> | undefined,
): NativeSubagentIdentity {
  return {
    nickname: readMetadataString(metadata, "childNickname"),
    role: readMetadataString(metadata, "childRole"),
    agentPath: readMetadataString(metadata, "childAgentPath"),
    spawnReason: readMetadataString(metadata, "spawnReason"),
    taskName: readMetadataString(metadata, "childTaskName"),
    model: readMetadataString(metadata, "childModel"),
    reasoningEffort: readMetadataString(metadata, "childReasoningEffort"),
  };
}

export function readPersistedNativeSubagentTokenUsage(
  metadata: Record<string, unknown> | undefined,
): NativeSubagentTokenUsage {
  return {
    inputTokens: readMetadataNumber(metadata, "childInputTokens"),
    outputTokens: readMetadataNumber(metadata, "childOutputTokens"),
    cachedInputTokens: readMetadataNumber(metadata, "childCachedInputTokens"),
    reasoningOutputTokens: readMetadataNumber(metadata, "childReasoningOutputTokens"),
    totalTokens: readMetadataNumber(metadata, "childTotalTokens"),
  };
}

export function resolveThreadSubagentIdentity(
  thread: CodexThread,
  spawn: CodexSubAgentThreadSpawnSource,
  spawnReason?: string,
): NativeSubagentIdentity {
  const normalizedSpawnReason =
    trimOptional(spawnReason) ?? taskNameFromAgentPath(spawn.agent_path);
  return {
    nickname: trimOptional(spawn.agent_nickname) ?? trimOptional(thread.agentNickname),
    role: trimOptional(spawn.agent_role) ?? trimOptional(thread.agentRole),
    agentPath: trimOptional(spawn.agent_path),
    ...(normalizedSpawnReason ? { spawnReason: normalizedSpawnReason } : {}),
  };
}

export function taskNameFromAgentPath(agentPath: string | null | undefined): string | undefined {
  const normalized = trimOptional(agentPath)?.replace(/\/+$/u, "");
  if (!normalized) {
    return undefined;
  }
  return trimOptional(normalized.slice(normalized.lastIndexOf("/") + 1));
}

export function resolveCollabItemSubagentIdentity(item: JsonObject): NativeSubagentIdentity {
  return {
    nickname:
      trimOptional(readString(item, "agent_nickname")) ??
      trimOptional(readString(item, "agentNickname")),
    role:
      trimOptional(readString(item, "agent_role")) ??
      trimOptional(readString(item, "agentRole")) ??
      trimOptional(readString(item, "role")),
    agentPath:
      trimOptional(readString(item, "agent_path")) ?? trimOptional(readString(item, "agentPath")),
    taskName:
      trimOptional(readString(item, "task_name")) ?? trimOptional(readString(item, "taskName")),
    model: trimOptional(readString(item, "model")),
    reasoningEffort:
      trimOptional(readString(item, "reasoning_effort")) ??
      trimOptional(readString(item, "reasoningEffort")),
  };
}

export function resolveNativeSpawnFunctionIdentity(item: JsonObject): NativeSubagentIdentity {
  const args = readJsonObjectValue(item.arguments);
  const message = trimOptional(readString(args, "message"));
  const explicitRole =
    extractSpawnMessageRole(message) ??
    trimOptional(readString(args, "agent_type")) ??
    trimOptional(readString(args, "agentType")) ??
    trimOptional(readString(args, "role"));
  const agentPath =
    trimOptional(readString(args, "agent_path")) ??
    trimOptional(readString(args, "agentPath")) ??
    roleToAgentPath(explicitRole);
  const taskName =
    trimOptional(readString(args, "task_name")) ?? trimOptional(readString(args, "taskName"));
  return {
    role: explicitRole,
    agentPath,
    taskName,
    model: trimOptional(readString(args, "model")),
    reasoningEffort:
      trimOptional(readString(args, "reasoning_effort")) ??
      trimOptional(readString(args, "reasoningEffort")),
    spawnReason:
      extractSpawnMessageObjective(message) ??
      trimOptional(readString(args, "objective")) ??
      trimOptional(readString(args, "task")) ??
      taskName ??
      message,
  };
}

export function mergeNativeSubagentIdentity(
  previous: NativeSubagentIdentity | undefined,
  next: NativeSubagentIdentity,
): NativeSubagentIdentity {
  return {
    nickname: trimOptional(next.nickname) ?? trimOptional(previous?.nickname),
    role: trimOptional(next.role) ?? trimOptional(previous?.role),
    agentPath: trimOptional(next.agentPath) ?? trimOptional(previous?.agentPath),
    spawnReason: trimOptional(previous?.spawnReason) ?? trimOptional(next.spawnReason),
    taskName: trimOptional(next.taskName) ?? trimOptional(previous?.taskName),
    model: trimOptional(next.model) ?? trimOptional(previous?.model),
    reasoningEffort: trimOptional(next.reasoningEffort) ?? trimOptional(previous?.reasoningEffort),
  };
}

export function sameNativeSubagentIdentity(
  left: NativeSubagentIdentity | undefined,
  right: NativeSubagentIdentity | undefined,
): boolean {
  return (
    trimOptional(left?.nickname) === trimOptional(right?.nickname) &&
    trimOptional(left?.role) === trimOptional(right?.role) &&
    trimOptional(left?.agentPath) === trimOptional(right?.agentPath) &&
    trimOptional(left?.spawnReason) === trimOptional(right?.spawnReason) &&
    trimOptional(left?.taskName) === trimOptional(right?.taskName) &&
    trimOptional(left?.model) === trimOptional(right?.model) &&
    trimOptional(left?.reasoningEffort) === trimOptional(right?.reasoningEffort)
  );
}

export function hasNativeSubagentIdentity(identity: NativeSubagentIdentity): boolean {
  return Boolean(
    trimOptional(identity.nickname) ??
    trimOptional(identity.role) ??
    trimOptional(identity.agentPath) ??
    trimOptional(identity.spawnReason) ??
    trimOptional(identity.taskName) ??
    trimOptional(identity.model) ??
    trimOptional(identity.reasoningEffort),
  );
}

export function formatNativeSubagentLabel(identity: NativeSubagentIdentity): string | undefined {
  const nickname = trimOptional(identity.nickname);
  const role = trimOptional(identity.role);
  if (nickname && role && nickname !== role) {
    return `${nickname} (${role})`;
  }
  return nickname ?? role;
}

export function nativeSubagentStartSummary(
  verb: "started" | "spawned" | "identified",
  identity: NativeSubagentIdentity,
): string {
  const role = trimOptional(identity.role);
  const agentPath = trimOptional(identity.agentPath);
  const detailParts = [
    role ? `role: ${role}` : undefined,
    agentPath && agentPath !== role ? `agent_path: ${agentPath}` : undefined,
  ].filter((part): part is string => Boolean(part));
  const detail = detailParts.length > 0 ? ` (${detailParts.join("; ")})` : "";
  return `Codex native subagent ${verb}${detail}.`;
}

export function readString(value: JsonObject, key: string): string | undefined {
  const entry = value[key];
  return typeof entry === "string" ? entry : undefined;
}

export function readJsonObjectValue(value: JsonValue | undefined): JsonObject {
  if (isJsonObject(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return {};
  }
  try {
    const parsed: JsonValue = JSON.parse(value);
    return isJsonObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readFunctionCallId(item: JsonObject): string | undefined {
  return (
    trimOptional(readString(item, "call_id")) ??
    trimOptional(readString(item, "callId")) ??
    trimOptional(readString(item, "id"))
  );
}

export function readNullableString(value: JsonObject, key: string): string | null | undefined {
  const entry = value[key];
  return typeof entry === "string" || entry === null ? entry : undefined;
}

export function normalizeToolName(value: string | undefined): string | undefined {
  return value?.replace(/[^a-z0-9]/giu, "").toLowerCase();
}

export function isNativeFollowUpToolName(value: string | undefined): boolean {
  return value === "followuptask" || value === "sendinput" || value === "resumeagent";
}

export function roleToAgentPath(role: string | undefined): string | undefined {
  const normalized = trimOptional(role);
  if (
    !normalized ||
    normalized === "default" ||
    normalized === "worker" ||
    normalized === "explorer"
  ) {
    return undefined;
  }
  return `agents/${normalized}.toml`;
}

export function extractSpawnMessageRole(message: string | undefined): string | undefined {
  const match = message?.match(/(?:^|\n)\s*Role:\s*([A-Za-z0-9_-]+)/u);
  return trimOptional(match?.[1]);
}

export function extractSpawnMessageObjective(message: string | undefined): string | undefined {
  const match = message?.match(/(?:^|[\n.])\s*Objective:\s*([^\n]+)/u);
  return trimOptional(match?.[1]);
}

export function normalizeCollabToolCallStatus(value: string | undefined): string | undefined {
  const key = value?.replace(/[^a-z0-9]/giu, "").toLowerCase();
  if (key === "completed" || key === "succeeded" || key === "success") {
    return "completed";
  }
  if (key === "failed" || key === "error" || key === "errored") {
    return "failed";
  }
  if (key === "blocked" || key === "declined") {
    return "blocked";
  }
  if (key === "inprogress" || key === "running") {
    return "running";
  }
  return value?.trim();
}

export function normalizeSubagentActivityKind(
  value: string | undefined,
): "started" | "interacted" | "interrupted" | undefined {
  const key = value?.replace(/[^a-z]/giu, "").toLowerCase();
  return key === "started" || key === "interacted" || key === "interrupted" ? key : undefined;
}

export function isBlockedOrFailedCollabToolCallStatus(value: string | undefined): boolean {
  return value === "failed" || value === "blocked";
}

export function isNonTerminalAgentStateStatus(value: string | undefined): boolean {
  return value === "pendingInit" || value === "running";
}

export function isTerminalAgentStateStatus(value: string | undefined): boolean {
  return value !== undefined && !isNonTerminalAgentStateStatus(value);
}

export function normalizeAgentStateStatus(value: string | undefined): string | undefined {
  const key = value?.replace(/[^a-z0-9]/giu, "").toLowerCase();
  if (!key) {
    return undefined;
  }
  if (key === "pendinginit") {
    return "pendingInit";
  }
  if (key === "inprogress" || key === "running") {
    return "running";
  }
  if (key === "completed" || key === "succeeded" || key === "success") {
    return "completed";
  }
  if (key === "interrupted" || key === "cancelled" || key === "canceled" || key === "shutdown") {
    return key === "shutdown" ? "shutdown" : "interrupted";
  }
  if (key === "failed" || key === "error" || key === "systemerror") {
    return "failed";
  }
  if (key === "blocked" || key === "declined") {
    return "blocked";
  }
  return value?.trim();
}

export function secondsToMillis(value: number | null | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value * 1000;
}

export function nativeSubagentSummary(prefix: string, detail: string | null | undefined): string {
  const normalizedPrefix = prefix.replace(/[.:]\s*$/u, "").trim();
  const normalizedDetail = boundNativeSubagentText(detail);
  if (!normalizedDetail) {
    return `${normalizedPrefix}.`;
  }
  return `${normalizedPrefix}: ${normalizedDetail}`;
}

/** Bounds child prose used in task/session display while exact thread refs remain available. */
export function boundNativeSubagentText(
  value: string | null | undefined,
  maxChars = 800,
): string | undefined {
  const normalized = trimOptional(value)?.replace(/\s+/gu, " ");
  if (!normalized || normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

export function readFiniteNumber(value: JsonObject, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0) {
      return candidate;
    }
  }
  return undefined;
}

export function activeFlagsSummary(activeFlags: string[] | undefined): string | undefined {
  const flags = activeFlags?.map((flag) => flag.trim()).filter(Boolean);
  return flags && flags.length > 0 ? `active flags: ${flags.join(", ")}` : undefined;
}

export function trimOptional(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
