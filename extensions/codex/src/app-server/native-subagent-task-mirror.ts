/**
 * Mirrors Codex native subagent thread lifecycle events into OpenClaw task
 * runtime rows so parent sessions can observe child progress.
 */
import type { AgentHarnessTaskRuntime } from "openclaw/plugin-sdk/agent-harness-task-runtime";
import { readCodexSubagentThreadSpawnSource } from "./native-subagent-source.js";
import { CODEX_NATIVE_SUBAGENT_RUN_ID_PREFIX } from "./native-subagent-task-ids.js";
import type {
  CodexServerNotification,
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

/** Minimal task-runtime surface needed to mirror native subagent lifecycle. */
export type TaskLifecycleRuntime = Pick<
  AgentHarnessTaskRuntime,
  "tryCreateRunningTaskRun" | "recordTaskRunProgressByRunId" | "finalizeTaskRunByRunId"
>;

type NativeSubagentTaskEventMetadata = Record<string, string | number | boolean | null>;

/** Stable parent/session context used while mirroring native subagent tasks. */
export type CodexNativeSubagentTaskMirrorParams = {
  parentThreadId: string;
  requesterSessionKey?: string;
  agentId?: string;
  now?: () => number;
};

/** Projects Codex thread and collab-agent notifications into task lifecycle updates. */
export class CodexNativeSubagentTaskMirror {
  private readonly mirroredThreadIds = new Set<string>();
  private readonly failedMirrorThreadIds = new Set<string>();
  private readonly terminalRunIds = new Set<string>();
  private readonly identityByThreadId = new Map<string, NativeSubagentIdentity>();
  private readonly latestCollabStatusDetailByThreadId = new Map<string, string>();
  private readonly latestCollabTerminalDetailByThreadId = new Map<string, string>();
  private readonly now: () => number;

  constructor(
    private readonly params: CodexNativeSubagentTaskMirrorParams,
    private readonly runtime: TaskLifecycleRuntime,
  ) {
    this.now = params.now ?? Date.now;
  }

  handleNotification(notification: CodexServerNotification): void {
    const params = isJsonObject(notification.params) ? notification.params : undefined;
    if (!params) {
      return;
    }
    if (notification.method === "thread/started") {
      this.handleThreadStarted(params);
      return;
    }
    if (notification.method === "thread/status/changed") {
      this.handleThreadStatusChanged(params);
      return;
    }
    if (notification.method === "item/started" || notification.method === "item/completed") {
      this.handleCollabAgentItem(params);
    }
  }

  private handleThreadStarted(params: JsonObject): void {
    const notification = readThreadStartedNotification(params);
    if (!notification) {
      return;
    }
    const thread = notification.thread;
    const spawn = readSubagentThreadSpawnSource(thread.source, this.params.parentThreadId);
    if (!spawn) {
      return;
    }
    const threadId = thread.id.trim();
    if (!threadId || this.mirroredThreadIds.has(threadId)) {
      return;
    }
    this.mirroredThreadIds.add(threadId);
    const runId = codexNativeSubagentRunId(threadId);
    const spawnReason = trimOptional(thread.preview);
    const identity = resolveThreadSubagentIdentity(thread, spawn, spawnReason);
    this.identityByThreadId.set(threadId, identity);
    const label = formatNativeSubagentLabel(identity) ?? "Codex subagent";
    const task =
      spawnReason ?? `Codex native subagent${label === "Codex subagent" ? "" : ` ${label}`}`;
    const createdAt = secondsToMillis(thread.createdAt) ?? this.now();
    const taskRecord = this.runtime.tryCreateRunningTaskRun({
      sourceId: runId,
      agentId: this.params.agentId,
      runId,
      label,
      task,
      notifyPolicy: "silent",
      deliveryStatus: "not_applicable",
      preferMetadata: true,
      startedAt: createdAt,
      lastEventAt: this.now(),
      progressSummary: nativeSubagentStartSummary("started", identity),
      eventMetadata: this.buildEventMetadata({
        threadId,
        identity,
        phase: "child_spawned",
      }),
    });
    if (!taskRecord) {
      this.mirroredThreadIds.delete(threadId);
      this.failedMirrorThreadIds.add(threadId);
      this.identityByThreadId.delete(threadId);
      return;
    }
    this.failedMirrorThreadIds.delete(threadId);
    this.terminalRunIds.delete(runId);
    this.applyStatus(threadId, thread.status);
  }

  private handleThreadStatusChanged(params: JsonObject): void {
    const notification = readThreadStatusChangedNotification(params);
    if (!notification) {
      return;
    }
    this.applyStatus(notification.threadId, notification.status);
  }

  private applyStatus(threadId: string, status: CodexThreadStatus | null | undefined): void {
    if (!this.mirroredThreadIds.has(threadId) && this.failedMirrorThreadIds.has(threadId)) {
      return;
    }
    const statusType = status?.type;
    if (!statusType) {
      return;
    }
    const runId = codexNativeSubagentRunId(threadId);
    if (this.terminalRunIds.has(runId) && statusType !== "systemError") {
      return;
    }
    const eventAt = this.now();
    if (statusType === "active") {
      const progressSummary = nativeSubagentSummary(
        "Codex native subagent is active",
        this.latestCollabStatusDetailByThreadId.get(threadId) ??
          activeFlagsSummary(status.activeFlags),
      );
      this.runtime.recordTaskRunProgressByRunId({
        runId,
        lastEventAt: eventAt,
        progressSummary,
        eventSummary: progressSummary,
        eventMetadata: this.buildEventMetadata({
          threadId,
          phase: "child_active",
        }),
      });
      return;
    }
    if (statusType === "idle") {
      this.terminalRunIds.add(runId);
      const detail =
        this.latestCollabTerminalDetailByThreadId.get(threadId) ??
        this.latestCollabStatusDetailByThreadId.get(threadId);
      this.runtime.finalizeTaskRunByRunId({
        runId,
        status: "succeeded",
        endedAt: eventAt,
        lastEventAt: eventAt,
        progressSummary: nativeSubagentSummary("Codex native subagent is idle", detail),
        terminalSummary: nativeSubagentSummary("Codex native subagent finished", detail),
        eventMetadata: this.buildEventMetadata({
          threadId,
          phase: "child_completed",
        }),
      });
      return;
    }
    if (statusType === "systemError") {
      this.terminalRunIds.add(runId);
      const detail =
        this.latestCollabTerminalDetailByThreadId.get(threadId) ??
        this.latestCollabStatusDetailByThreadId.get(threadId);
      this.runtime.finalizeTaskRunByRunId({
        runId,
        status: "failed",
        endedAt: eventAt,
        lastEventAt: eventAt,
        error: "Codex app-server reported a system error for the native subagent thread.",
        progressSummary: nativeSubagentSummary("Codex native subagent hit a system error", detail),
        terminalSummary: nativeSubagentSummary("Codex native subagent failed", detail),
        eventMetadata: this.buildEventMetadata({
          threadId,
          phase: "child_failed",
        }),
      });
      return;
    }
    if (statusType === "notLoaded") {
      const progressSummary = nativeSubagentSummary(
        "Codex native subagent is not loaded",
        this.latestCollabStatusDetailByThreadId.get(threadId),
      );
      this.runtime.recordTaskRunProgressByRunId({
        runId,
        lastEventAt: eventAt,
        progressSummary,
        eventSummary: progressSummary,
        eventMetadata: this.buildEventMetadata({
          threadId,
          phase: "child_not_loaded",
        }),
      });
    }
  }

  private handleCollabAgentItem(params: JsonObject): void {
    const item = isJsonObject(params.item) ? params.item : undefined;
    if (!item || readString(item, "type") !== "collabAgentToolCall") {
      return;
    }
    const senderThreadId = readString(item, "senderThreadId") ?? readString(params, "threadId");
    if (senderThreadId !== this.params.parentThreadId) {
      return;
    }
    const isSpawnAgentTool = normalizeToolName(readString(item, "tool")) === "spawnagent";
    const receiverThreadIds = readStringArray(item.receiverThreadIds);
    const agentsStates = readAgentsStates(item.agentsStates);
    const spawnChildThreadIds = new Set([...receiverThreadIds, ...agentsStates.keys()]);
    if (isSpawnAgentTool) {
      for (const childThreadId of spawnChildThreadIds) {
        this.createTaskFromCollabSpawnItem(childThreadId, item);
      }
    }
    const toolCallStatus = normalizeCollabToolCallStatus(readString(item, "status"));
    const terminalToolCallThreadIds = new Set<string>();
    if (isSpawnAgentTool && isBlockedOrFailedCollabToolCallStatus(toolCallStatus)) {
      for (const threadId of spawnChildThreadIds) {
        terminalToolCallThreadIds.add(threadId);
      }
      for (const threadId of agentsStates.keys()) {
        terminalToolCallThreadIds.add(threadId);
      }
    }
    const terminalAgentStateThreadIds = new Set<string>();
    for (const [threadId, state] of agentsStates) {
      const normalizedStatus = normalizeAgentStateStatus(state.status);
      if (
        terminalToolCallThreadIds.has(threadId) &&
        isNonTerminalAgentStateStatus(normalizedStatus)
      ) {
        continue;
      }
      this.applyCollabAgentStatus(threadId, normalizedStatus, state.message);
      if (isTerminalAgentStateStatus(normalizedStatus)) {
        terminalAgentStateThreadIds.add(threadId);
      }
    }
    if (isBlockedOrFailedCollabToolCallStatus(toolCallStatus)) {
      for (const threadId of terminalToolCallThreadIds) {
        if (terminalAgentStateThreadIds.has(threadId)) {
          continue;
        }
        const state = agentsStates.get(threadId);
        this.applyCollabAgentStatus(threadId, toolCallStatus, state?.message);
      }
    }
  }

  private createTaskFromCollabSpawnItem(threadId: string, item: JsonObject): void {
    const normalizedThreadId = threadId.trim();
    if (!normalizedThreadId || this.mirroredThreadIds.has(normalizedThreadId)) {
      return;
    }
    this.mirroredThreadIds.add(normalizedThreadId);
    const prompt = trimOptional(readString(item, "prompt"));
    const identity = {
      ...resolveCollabItemSubagentIdentity(item),
      ...(prompt ? { spawnReason: prompt } : {}),
    };
    this.identityByThreadId.set(normalizedThreadId, identity);
    const label = formatNativeSubagentLabel(identity) ?? "Codex subagent";
    const runId = codexNativeSubagentRunId(normalizedThreadId);
    const createdAt = this.now();
    const taskRecord = this.runtime.tryCreateRunningTaskRun({
      sourceId: runId,
      agentId: this.params.agentId,
      runId,
      label,
      task: prompt ?? `Codex native subagent${label === "Codex subagent" ? "" : ` ${label}`}`,
      notifyPolicy: "silent",
      deliveryStatus: "not_applicable",
      preferMetadata: true,
      startedAt: createdAt,
      lastEventAt: createdAt,
      progressSummary: nativeSubagentStartSummary("spawned", identity),
      eventMetadata: this.buildEventMetadata({
        threadId: normalizedThreadId,
        identity,
        phase: "child_spawned",
      }),
    });
    if (!taskRecord) {
      this.mirroredThreadIds.delete(normalizedThreadId);
      this.failedMirrorThreadIds.add(normalizedThreadId);
      this.identityByThreadId.delete(normalizedThreadId);
      return;
    }
    this.failedMirrorThreadIds.delete(normalizedThreadId);
    this.terminalRunIds.delete(runId);
  }

  private applyCollabAgentStatus(
    threadId: string,
    status: string | undefined,
    message: string | null | undefined,
  ): void {
    if (!this.mirroredThreadIds.has(threadId) && this.failedMirrorThreadIds.has(threadId)) {
      return;
    }
    const normalizedStatus = normalizeAgentStateStatus(status);
    if (!normalizedStatus) {
      return;
    }
    const runId = codexNativeSubagentRunId(threadId);
    if (this.terminalRunIds.has(runId) && isNonTerminalAgentStateStatus(normalizedStatus)) {
      return;
    }
    const eventAt = this.now();
    if (normalizedStatus === "pendingInit" || normalizedStatus === "running") {
      const detail = trimOptional(message);
      this.rememberCollabStatusDetail(threadId, detail);
      const progressSummary = nativeSubagentSummary(
        normalizedStatus === "pendingInit"
          ? "Codex native subagent is initializing"
          : "Codex native subagent is running",
        detail,
      );
      this.runtime.recordTaskRunProgressByRunId({
        runId,
        lastEventAt: eventAt,
        progressSummary,
        eventSummary: progressSummary,
        eventMetadata: this.buildEventMetadata({
          threadId,
          phase: normalizedStatus === "pendingInit" ? "child_initializing" : "child_running",
        }),
      });
      return;
    }
    if (normalizedStatus === "completed") {
      this.terminalRunIds.add(runId);
      const detail = trimOptional(message);
      this.rememberCollabTerminalDetail(threadId, detail);
      this.runtime.finalizeTaskRunByRunId({
        runId,
        status: "succeeded",
        endedAt: eventAt,
        lastEventAt: eventAt,
        progressSummary: nativeSubagentSummary("Codex native subagent completed", detail),
        terminalSummary: nativeSubagentSummary("Codex native subagent finished", detail),
        eventMetadata: this.buildEventMetadata({
          threadId,
          phase: "child_completed",
        }),
      });
      return;
    }
    if (normalizedStatus === "blocked") {
      this.terminalRunIds.add(runId);
      const detail = trimOptional(message);
      this.rememberCollabTerminalDetail(threadId, detail);
      this.runtime.finalizeTaskRunByRunId({
        runId,
        status: "succeeded",
        endedAt: eventAt,
        lastEventAt: eventAt,
        progressSummary: nativeSubagentSummary("Codex native subagent blocked", detail),
        terminalSummary: nativeSubagentSummary("Codex native subagent blocked", detail),
        terminalOutcome: "blocked",
        eventMetadata: this.buildEventMetadata({
          threadId,
          phase: "child_blocked",
        }),
      });
      return;
    }
    this.terminalRunIds.add(runId);
    const detail = trimOptional(message) ?? `Codex native subagent status: ${normalizedStatus}`;
    this.rememberCollabTerminalDetail(threadId, detail);
    this.runtime.finalizeTaskRunByRunId({
      runId,
      status:
        normalizedStatus === "interrupted" || normalizedStatus === "shutdown"
          ? "cancelled"
          : "failed",
      endedAt: eventAt,
      lastEventAt: eventAt,
      error: detail,
      progressSummary: nativeSubagentSummary(`Codex native subagent ${normalizedStatus}`, detail),
      terminalSummary: nativeSubagentSummary("Codex native subagent did not complete", detail),
      eventMetadata: this.buildEventMetadata({
        threadId,
        phase:
          normalizedStatus === "interrupted" || normalizedStatus === "shutdown"
            ? "child_cancelled"
            : "child_failed",
      }),
    });
  }

  private buildEventMetadata(params: {
    threadId: string;
    identity?: NativeSubagentIdentity;
    phase: string;
  }): NativeSubagentTaskEventMetadata {
    const identity = params.identity ?? this.identityByThreadId.get(params.threadId);
    const spawnReason = trimOptional(identity?.spawnReason);
    return {
      codexNativeSubagent: true,
      parentThreadId: this.params.parentThreadId,
      childThreadId: params.threadId,
      childPhase: params.phase,
      ...(identity?.role ? { childRole: identity.role } : {}),
      ...(identity?.agentPath ? { childAgentPath: identity.agentPath } : {}),
      ...(identity?.nickname ? { childNickname: identity.nickname } : {}),
      ...(spawnReason ? { spawnReason } : {}),
    };
  }

  private rememberCollabStatusDetail(threadId: string, detail: string | undefined): void {
    if (detail) {
      this.latestCollabStatusDetailByThreadId.set(threadId, detail);
    }
  }

  private rememberCollabTerminalDetail(threadId: string, detail: string | undefined): void {
    if (detail) {
      this.latestCollabStatusDetailByThreadId.set(threadId, detail);
      this.latestCollabTerminalDetailByThreadId.set(threadId, detail);
    }
  }
}

/** Converts a Codex child thread id into the OpenClaw task-runtime run id. */
export function codexNativeSubagentRunId(threadId: string): string {
  return `${CODEX_NATIVE_SUBAGENT_RUN_ID_PREFIX}${threadId.trim()}`;
}

/** Reads a subagent thread-spawn source only when it belongs to the expected parent thread. */
export function readSubagentThreadSpawnSource(
  source: CodexSessionSource | null | undefined,
  parentThreadId: string,
): CodexSubAgentThreadSpawnSource | undefined {
  return readCodexSubagentThreadSpawnSource(source, parentThreadId);
}

function readThreadStartedNotification(
  params: JsonObject,
): CodexThreadStartedNotification | undefined {
  const thread = params.thread;
  if (!isJsonObject(thread) || typeof thread.id !== "string") {
    return undefined;
  }
  return { thread: thread as CodexThread };
}

function readThreadStatusChangedNotification(
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

function isCodexThreadStatusType(value: unknown): value is CodexThreadStatus["type"] {
  return value === "notLoaded" || value === "idle" || value === "systemError" || value === "active";
}

function readAgentsStates(
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

function readStringArray(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

type NativeSubagentIdentity = {
  nickname?: string;
  role?: string;
  agentPath?: string;
  spawnReason?: string;
};

function resolveThreadSubagentIdentity(
  thread: CodexThread,
  spawn: CodexSubAgentThreadSpawnSource,
  spawnReason?: string,
): NativeSubagentIdentity {
  const normalizedSpawnReason = trimOptional(spawnReason);
  return {
    nickname: trimOptional(spawn.agent_nickname) ?? trimOptional(thread.agentNickname),
    role: trimOptional(spawn.agent_role) ?? trimOptional(thread.agentRole),
    agentPath: trimOptional(spawn.agent_path),
    ...(normalizedSpawnReason ? { spawnReason: normalizedSpawnReason } : {}),
  };
}

function resolveCollabItemSubagentIdentity(item: JsonObject): NativeSubagentIdentity {
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
  };
}

function formatNativeSubagentLabel(identity: NativeSubagentIdentity): string | undefined {
  const nickname = trimOptional(identity.nickname);
  const role = trimOptional(identity.role);
  if (nickname && role && nickname !== role) {
    return `${nickname} (${role})`;
  }
  return nickname ?? role;
}

function nativeSubagentStartSummary(
  verb: "started" | "spawned",
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

function readString(value: JsonObject, key: string): string | undefined {
  const entry = value[key];
  return typeof entry === "string" ? entry : undefined;
}

function readNullableString(value: JsonObject, key: string): string | null | undefined {
  const entry = value[key];
  return typeof entry === "string" || entry === null ? entry : undefined;
}

function normalizeToolName(value: string | undefined): string | undefined {
  return value?.replace(/[^a-z0-9]/giu, "").toLowerCase();
}

function normalizeCollabToolCallStatus(value: string | undefined): string | undefined {
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

function isBlockedOrFailedCollabToolCallStatus(value: string | undefined): boolean {
  return value === "failed" || value === "blocked";
}

function isNonTerminalAgentStateStatus(value: string | undefined): boolean {
  return value === "pendingInit" || value === "running";
}

function isTerminalAgentStateStatus(value: string | undefined): boolean {
  return value !== undefined && !isNonTerminalAgentStateStatus(value);
}

function normalizeAgentStateStatus(value: string | undefined): string | undefined {
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

function secondsToMillis(value: number | null | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value * 1000;
}

function nativeSubagentSummary(prefix: string, detail: string | null | undefined): string {
  const normalizedPrefix = prefix.replace(/[.:]\s*$/u, "").trim();
  const normalizedDetail = trimOptional(detail);
  if (!normalizedDetail) {
    return `${normalizedPrefix}.`;
  }
  return `${normalizedPrefix}: ${normalizedDetail}`;
}

function activeFlagsSummary(activeFlags: string[] | undefined): string | undefined {
  const flags = activeFlags?.map((flag) => flag.trim()).filter(Boolean);
  return flags && flags.length > 0 ? `active flags: ${flags.join(", ")}` : undefined;
}

function trimOptional(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
