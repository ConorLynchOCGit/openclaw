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
  | "tryCreateRunningTaskRun"
  | "recordTaskRunProgressByRunId"
  | "finalizeTaskRunByRunId"
  | "listTaskRecords"
>;

type NativeSubagentTaskEventMetadata = Record<string, string | number | boolean | null>;
type PendingKeyedNativeSpawn = {
  identity: NativeSubagentIdentity;
  parentTurnId?: string;
};
type PendingNativeFollowUp = {
  parentTurnId?: string;
  prompt?: string;
};
type NativeSubagentAttempt = {
  kind: "follow_up";
  operationId: string;
};

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
  private readonly activeRunIdByThreadId = new Map<string, string>();
  private readonly activeAttemptByThreadId = new Map<string, NativeSubagentAttempt>();
  private readonly identityByThreadId = new Map<string, NativeSubagentIdentity>();
  private readonly parentTurnIdByThreadId = new Map<string, string>();
  private readonly pendingSpawnsByCallId = new Map<string, PendingKeyedNativeSpawn>();
  private readonly pendingFollowUpsByCallId = new Map<string, PendingNativeFollowUp>();
  private readonly latestCollabStatusDetailByThreadId = new Map<string, string>();
  private readonly latestCollabTerminalDetailByThreadId = new Map<string, string>();
  private readonly tokenUsageByThreadId = new Map<string, NativeSubagentTokenUsage>();
  private readonly now: () => number;

  constructor(
    private readonly params: CodexNativeSubagentTaskMirrorParams,
    private readonly runtime: TaskLifecycleRuntime,
  ) {
    this.now = params.now ?? Date.now;
    this.hydratePersistedTaskState();
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
    if (notification.method === "thread/tokenUsage/updated") {
      this.handleTokenUsageUpdated(params);
      return;
    }
    if (
      notification.method === "item/started" ||
      notification.method === "item/completed" ||
      notification.method === "rawResponseItem/completed"
    ) {
      this.handleNativeFunctionItem(params);
      this.handleDynamicAgentItem(params);
      this.handleCollabAgentItem(params);
      this.handleSubAgentActivityItem(params);
    }
  }

  private handleDynamicAgentItem(params: JsonObject): void {
    const item = isJsonObject(params.item) ? params.item : undefined;
    if (!item || readString(item, "type") !== "dynamicToolCall") {
      return;
    }
    const namespace = readString(item, "namespace");
    if (namespace && namespace !== "agents") {
      return;
    }
    const threadId = readString(params, "threadId")?.trim();
    if (threadId !== this.params.parentThreadId) {
      return;
    }
    const toolName = normalizeToolName(readString(item, "tool"));
    const callId = readFunctionCallId(item);
    if (!callId) {
      return;
    }
    const parentTurnId = trimOptional(readString(params, "turnId"));
    if (isNativeFollowUpToolName(toolName)) {
      this.rememberPendingFollowUp(item, callId, parentTurnId);
      return;
    }
    if (toolName !== "spawnagent") {
      return;
    }
    const identity = resolveNativeSpawnFunctionIdentity(item);
    const pending = { identity, ...(parentTurnId ? { parentTurnId } : {}) };
    if (!this.pendingSpawnsByCallId.has(callId)) {
      this.pendingSpawnsByCallId.set(callId, pending);
    }
  }

  private handleSubAgentActivityItem(params: JsonObject): void {
    const item = isJsonObject(params.item) ? params.item : undefined;
    if (
      !item ||
      readString(item, "type") !== "subAgentActivity" ||
      normalizeToolName(readString(item, "kind")) !== "started"
    ) {
      return;
    }
    const threadId = readString(params, "threadId")?.trim();
    if (threadId !== this.params.parentThreadId) {
      return;
    }
    const childThreadId = trimOptional(readString(item, "agentThreadId"));
    if (!childThreadId) {
      return;
    }
    const callId = readFunctionCallId(item);
    const pending = callId ? this.pendingSpawnsByCallId.get(callId) : undefined;
    const pendingFollowUp = callId ? this.pendingFollowUpsByCallId.get(callId) : undefined;
    if (callId) {
      this.pendingSpawnsByCallId.delete(callId);
      this.pendingFollowUpsByCallId.delete(callId);
    }
    const parentTurnId =
      pending?.parentTurnId ??
      pendingFollowUp?.parentTurnId ??
      trimOptional(readString(params, "turnId"));
    if (pendingFollowUp && callId) {
      this.beginFollowUpAttempt({
        threadId: childThreadId,
        operationId: callId,
        parentTurnId,
        prompt: pendingFollowUp.prompt,
      });
      return;
    }
    const agentPath = trimOptional(readString(item, "agentPath"));
    const activityIdentity = agentPath
      ? { agentPath, spawnReason: taskNameFromAgentPath(agentPath) }
      : undefined;
    const identity = mergeNativeSubagentIdentity(activityIdentity, pending?.identity ?? {});
    this.createOrIdentifyTaskFromSpawn({
      threadId: childThreadId,
      identity,
      prompt: identity.spawnReason,
      parentTurnId,
    });
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
    if (!threadId) {
      return;
    }
    const runId = this.currentRunId(threadId);
    const spawnReason = trimOptional(thread.preview);
    const identity = resolveThreadSubagentIdentity(thread, spawn, spawnReason);
    if (this.mirroredThreadIds.has(threadId)) {
      const previousIdentity = this.identityByThreadId.get(threadId);
      const mergedIdentity = mergeNativeSubagentIdentity(previousIdentity, identity);
      if (!sameNativeSubagentIdentity(previousIdentity, mergedIdentity)) {
        this.identityByThreadId.set(threadId, mergedIdentity);
        const progressSummary = nativeSubagentStartSummary("identified", mergedIdentity);
        this.runtime.recordTaskRunProgressByRunId({
          runId,
          lastEventAt: this.now(),
          progressSummary,
          eventSummary: progressSummary,
          eventMetadata: this.buildEventMetadata({
            threadId,
            identity: mergedIdentity,
            phase: "child_identified",
          }),
        });
      }
      this.applyStatus(threadId, thread.status);
      return;
    }
    this.mirroredThreadIds.add(threadId);
    this.identityByThreadId.set(threadId, identity);
    const label = formatNativeSubagentLabel(identity) ?? "Codex subagent";
    const task =
      identity.spawnReason ??
      `Codex native subagent${label === "Codex subagent" ? "" : ` ${label}`}`;
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
      this.parentTurnIdByThreadId.delete(threadId);
      return;
    }
    this.failedMirrorThreadIds.delete(threadId);
    this.terminalRunIds.delete(runId);
    this.activeRunIdByThreadId.set(threadId, runId);
    this.activeAttemptByThreadId.delete(threadId);
    this.applyStatus(threadId, thread.status);
  }

  private handleThreadStatusChanged(params: JsonObject): void {
    const notification = readThreadStatusChangedNotification(params);
    if (!notification) {
      return;
    }
    this.applyStatus(notification.threadId, notification.status);
  }

  private handleTokenUsageUpdated(params: JsonObject): void {
    const threadId = trimOptional(readString(params, "threadId"));
    if (!threadId || !this.mirroredThreadIds.has(threadId)) {
      return;
    }
    const tokenUsage = isJsonObject(params.tokenUsage) ? params.tokenUsage : undefined;
    const total = tokenUsage && isJsonObject(tokenUsage.total) ? tokenUsage.total : undefined;
    if (!total) {
      return;
    }
    const usage = {
      inputTokens: readFiniteNumber(total, "inputTokens", "input_tokens"),
      outputTokens: readFiniteNumber(total, "outputTokens", "output_tokens"),
      cachedInputTokens: readFiniteNumber(total, "cachedInputTokens", "cached_input_tokens"),
      reasoningOutputTokens: readFiniteNumber(
        total,
        "reasoningOutputTokens",
        "reasoning_output_tokens",
      ),
      totalTokens: readFiniteNumber(total, "totalTokens", "total_tokens"),
    } satisfies NativeSubagentTokenUsage;
    if (Object.values(usage).some((value) => value !== undefined)) {
      this.tokenUsageByThreadId.set(threadId, usage);
    }
  }

  private applyStatus(threadId: string, status: CodexThreadStatus | null | undefined): void {
    if (!this.mirroredThreadIds.has(threadId) && this.failedMirrorThreadIds.has(threadId)) {
      return;
    }
    const statusType = status?.type;
    if (!statusType) {
      return;
    }
    const runId = this.currentRunId(threadId);
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
    const isFollowUpTool = isNativeFollowUpToolName(normalizeToolName(readString(item, "tool")));
    const receiverThreadIds = readStringArray(item.receiverThreadIds);
    const agentsStates = readAgentsStates(item.agentsStates);
    const spawnChildThreadIds = new Set([...receiverThreadIds, ...agentsStates.keys()]);
    const parentTurnId = trimOptional(readString(params, "turnId"));
    const operationId = readFunctionCallId(item);
    if (isFollowUpTool && operationId) {
      const prompt = trimOptional(readString(item, "prompt"));
      for (const childThreadId of spawnChildThreadIds) {
        this.beginFollowUpAttempt({
          threadId: childThreadId,
          operationId,
          parentTurnId,
          prompt,
        });
      }
    }
    if (isSpawnAgentTool) {
      for (const childThreadId of spawnChildThreadIds) {
        this.createTaskFromCollabSpawnItem(childThreadId, item, parentTurnId);
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

  private handleNativeFunctionItem(params: JsonObject): void {
    const item = isJsonObject(params.item) ? params.item : undefined;
    if (!item) {
      return;
    }
    const threadId = readString(params, "threadId")?.trim();
    if (threadId && threadId !== this.params.parentThreadId) {
      return;
    }
    const itemType = readString(item, "type");
    const parentTurnId = trimOptional(readString(params, "turnId"));
    if (itemType === "function_call") {
      const toolName = normalizeToolName(readString(item, "name"));
      if (isNativeFollowUpToolName(toolName)) {
        const callId = readFunctionCallId(item);
        if (callId) {
          this.rememberPendingFollowUp(item, callId, parentTurnId);
        }
      } else {
        this.rememberNativeSpawnFunctionCall(item, parentTurnId);
      }
      return;
    }
    if (itemType === "function_call_output") {
      this.createTaskFromNativeFunctionOutput(item);
    }
  }

  private rememberNativeSpawnFunctionCall(item: JsonObject, parentTurnId?: string): void {
    if (normalizeToolName(readString(item, "name")) !== "spawnagent") {
      return;
    }
    const identity = resolveNativeSpawnFunctionIdentity(item);
    if (!hasNativeSubagentIdentity(identity)) {
      return;
    }
    const callId = readFunctionCallId(item);
    if (!callId) {
      return;
    }
    const pending = {
      identity,
      ...(parentTurnId ? { parentTurnId } : {}),
    } satisfies PendingKeyedNativeSpawn;
    if (!this.pendingSpawnsByCallId.has(callId)) {
      this.pendingSpawnsByCallId.set(callId, pending);
    }
  }

  private createTaskFromNativeFunctionOutput(item: JsonObject): void {
    const callId = readFunctionCallId(item);
    const output = readJsonObjectValue(item.output);
    const childThreadId =
      trimOptional(readString(output, "agent_id")) ??
      trimOptional(readString(output, "agentId")) ??
      trimOptional(readString(output, "thread_id")) ??
      trimOptional(readString(output, "threadId"));
    if (!childThreadId) {
      return;
    }
    const pendingFollowUp = callId ? this.pendingFollowUpsByCallId.get(callId) : undefined;
    if (pendingFollowUp && callId) {
      this.pendingFollowUpsByCallId.delete(callId);
      this.beginFollowUpAttempt({
        threadId: childThreadId,
        operationId: callId,
        parentTurnId: pendingFollowUp.parentTurnId,
        prompt: pendingFollowUp.prompt,
      });
      return;
    }
    const pending = callId ? this.pendingSpawnsByCallId.get(callId) : undefined;
    if (callId) {
      this.pendingSpawnsByCallId.delete(callId);
    }
    const parentTurnId = pending?.parentTurnId;
    const outputIdentity = {
      nickname: trimOptional(readString(output, "nickname")),
    };
    const identity = mergeNativeSubagentIdentity(pending?.identity, outputIdentity);
    this.createOrIdentifyTaskFromSpawn({
      threadId: childThreadId,
      identity,
      prompt: identity.spawnReason,
      parentTurnId,
    });
  }

  private createTaskFromCollabSpawnItem(
    threadId: string,
    item: JsonObject,
    parentTurnId?: string,
  ): void {
    const prompt = trimOptional(readString(item, "prompt"));
    const identity = {
      ...resolveCollabItemSubagentIdentity(item),
      ...(prompt ? { spawnReason: prompt } : {}),
    };
    this.createOrIdentifyTaskFromSpawn({ threadId, identity, prompt, parentTurnId });
  }

  private createOrIdentifyTaskFromSpawn(params: {
    threadId: string;
    identity: NativeSubagentIdentity;
    prompt?: string;
    parentTurnId?: string;
  }): void {
    const normalizedThreadId = params.threadId.trim();
    if (!normalizedThreadId) {
      return;
    }
    const parentTurnChanged = this.rememberParentTurnId(normalizedThreadId, params.parentTurnId);
    if (this.mirroredThreadIds.has(normalizedThreadId)) {
      const previousIdentity = this.identityByThreadId.get(normalizedThreadId);
      const mergedIdentity = mergeNativeSubagentIdentity(previousIdentity, params.identity);
      if (!sameNativeSubagentIdentity(previousIdentity, mergedIdentity) || parentTurnChanged) {
        this.identityByThreadId.set(normalizedThreadId, mergedIdentity);
        const progressSummary = nativeSubagentStartSummary("identified", mergedIdentity);
        this.runtime.recordTaskRunProgressByRunId({
          runId: this.currentRunId(normalizedThreadId),
          lastEventAt: this.now(),
          progressSummary,
          eventSummary: progressSummary,
          eventMetadata: this.buildEventMetadata({
            threadId: normalizedThreadId,
            identity: mergedIdentity,
            phase: "child_identified",
          }),
        });
      }
      return;
    }
    this.mirroredThreadIds.add(normalizedThreadId);
    const identity = params.identity;
    this.identityByThreadId.set(normalizedThreadId, identity);
    const label = formatNativeSubagentLabel(identity) ?? "Codex subagent";
    const runId = codexNativeSubagentRunId(normalizedThreadId);
    const createdAt = this.now();
    const taskRecord = this.runtime.tryCreateRunningTaskRun({
      sourceId: runId,
      agentId: this.params.agentId,
      runId,
      label,
      task:
        params.prompt ?? `Codex native subagent${label === "Codex subagent" ? "" : ` ${label}`}`,
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
      this.parentTurnIdByThreadId.delete(normalizedThreadId);
      return;
    }
    this.failedMirrorThreadIds.delete(normalizedThreadId);
    this.terminalRunIds.delete(runId);
    this.activeRunIdByThreadId.set(normalizedThreadId, runId);
    this.activeAttemptByThreadId.delete(normalizedThreadId);
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
    const runId = this.currentRunId(threadId);
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
    const tokenUsage = this.tokenUsageByThreadId.get(params.threadId);
    const attempt = this.activeAttemptByThreadId.get(params.threadId);
    return {
      codexNativeSubagent: true,
      parentThreadId: this.params.parentThreadId,
      ...(this.parentTurnIdByThreadId.get(params.threadId)
        ? { parentTurnId: this.parentTurnIdByThreadId.get(params.threadId) as string }
        : {}),
      childThreadId: params.threadId,
      childPhase: params.phase,
      ...(attempt
        ? {
            childAttemptKind: attempt.kind,
            childOperationId: attempt.operationId,
          }
        : {}),
      ...(identity?.role ? { childRole: identity.role } : {}),
      ...(identity?.agentPath ? { childAgentPath: identity.agentPath } : {}),
      ...(identity?.nickname ? { childNickname: identity.nickname } : {}),
      ...(identity?.taskName ? { childTaskName: identity.taskName } : {}),
      ...(identity?.model ? { childModel: identity.model } : {}),
      ...(identity?.reasoningEffort ? { childReasoningEffort: identity.reasoningEffort } : {}),
      ...(spawnReason ? { spawnReason } : {}),
      ...(tokenUsage?.inputTokens !== undefined
        ? { childInputTokens: tokenUsage.inputTokens }
        : {}),
      ...(tokenUsage?.outputTokens !== undefined
        ? { childOutputTokens: tokenUsage.outputTokens }
        : {}),
      ...(tokenUsage?.cachedInputTokens !== undefined
        ? { childCachedInputTokens: tokenUsage.cachedInputTokens }
        : {}),
      ...(tokenUsage?.reasoningOutputTokens !== undefined
        ? { childReasoningOutputTokens: tokenUsage.reasoningOutputTokens }
        : {}),
      ...(tokenUsage?.totalTokens !== undefined
        ? { childTotalTokens: tokenUsage.totalTokens }
        : {}),
    };
  }

  private hydratePersistedTaskState(): void {
    const latestTaskByThreadId = new Map<
      string,
      { lastEventAt: number; runId: string; attempt?: NativeSubagentAttempt }
    >();
    for (const task of this.runtime.listTaskRecords()) {
      const metadata = task.executionReceipt?.latestEvent?.metadata;
      if (
        metadata?.codexNativeSubagent !== true ||
        readMetadataString(metadata, "parentThreadId") !== this.params.parentThreadId
      ) {
        continue;
      }
      const childThreadId =
        readMetadataString(metadata, "childThreadId") ??
        readCodexNativeSubagentThreadId(task.runId ?? task.sourceId);
      if (!childThreadId) {
        continue;
      }
      this.mirroredThreadIds.add(childThreadId);
      this.rememberParentTurnId(childThreadId, readMetadataString(metadata, "parentTurnId"));
      const identity = readPersistedNativeSubagentIdentity(metadata);
      if (hasNativeSubagentIdentity(identity)) {
        this.identityByThreadId.set(childThreadId, identity);
      }
      const tokenUsage = readPersistedNativeSubagentTokenUsage(metadata);
      if (Object.values(tokenUsage).some((value) => value !== undefined)) {
        this.tokenUsageByThreadId.set(childThreadId, tokenUsage);
      }
      if (task.status !== "queued" && task.status !== "running") {
        if (task.runId) {
          this.terminalRunIds.add(task.runId);
        }
      }
      const taskRunId = trimOptional(task.runId);
      if (taskRunId) {
        const operationId = readMetadataString(metadata, "childOperationId");
        const attempt =
          readMetadataString(metadata, "childAttemptKind") === "follow_up" && operationId
            ? { kind: "follow_up" as const, operationId }
            : undefined;
        const candidate = {
          lastEventAt: task.lastEventAt ?? task.startedAt ?? task.createdAt,
          runId: taskRunId,
          ...(attempt ? { attempt } : {}),
        };
        const previous = latestTaskByThreadId.get(childThreadId);
        if (!previous || candidate.lastEventAt >= previous.lastEventAt) {
          latestTaskByThreadId.set(childThreadId, candidate);
        }
      }
    }
    for (const [threadId, latest] of latestTaskByThreadId) {
      this.activeRunIdByThreadId.set(threadId, latest.runId);
      if (latest.attempt) {
        this.activeAttemptByThreadId.set(threadId, latest.attempt);
      }
    }
  }

  private rememberParentTurnId(threadId: string, parentTurnId?: string): boolean {
    const normalized = trimOptional(parentTurnId);
    const existing = this.parentTurnIdByThreadId.get(threadId);
    if (!normalized || existing === normalized) {
      return false;
    }
    this.parentTurnIdByThreadId.set(threadId, normalized);
    return true;
  }

  private rememberPendingFollowUp(item: JsonObject, callId: string, parentTurnId?: string): void {
    const args = readJsonObjectValue(item.arguments);
    const prompt =
      trimOptional(readString(item, "prompt")) ??
      trimOptional(readString(args, "message")) ??
      trimOptional(readString(args, "prompt"));
    this.pendingFollowUpsByCallId.set(callId, {
      ...(parentTurnId ? { parentTurnId } : {}),
      ...(prompt ? { prompt } : {}),
    });
  }

  private beginFollowUpAttempt(params: {
    threadId: string;
    operationId: string;
    parentTurnId?: string;
    prompt?: string;
  }): void {
    const threadId = params.threadId.trim();
    const operationId = params.operationId.trim();
    if (!threadId || !operationId || !this.mirroredThreadIds.has(threadId)) {
      return;
    }
    const runId = codexNativeSubagentFollowUpRunId(threadId, operationId);
    if (this.activeRunIdByThreadId.get(threadId) === runId) {
      return;
    }
    const records = this.runtime.listTaskRecords();
    const existing = records.find((task) => task.runId === runId);
    this.rememberParentTurnId(threadId, params.parentTurnId);
    this.activeRunIdByThreadId.set(threadId, runId);
    this.activeAttemptByThreadId.set(threadId, {
      kind: "follow_up",
      operationId,
    });
    if (existing) {
      if (existing.status === "queued" || existing.status === "running") {
        this.terminalRunIds.delete(runId);
      } else {
        this.terminalRunIds.add(runId);
      }
      return;
    }
    const rootRunId = codexNativeSubagentRunId(threadId);
    const parentTask = records.find((task) => task.runId === rootRunId);
    const identity = this.identityByThreadId.get(threadId) ?? {};
    const label = formatNativeSubagentLabel(identity) ?? "Codex subagent";
    const prompt = trimOptional(params.prompt) ?? trimOptional(identity.spawnReason);
    const startedAt = this.now();
    const progressSummary = nativeSubagentSummary(
      "Codex native subagent follow-up started",
      prompt,
    );
    const taskRecord = this.runtime.tryCreateRunningTaskRun({
      sourceId: runId,
      agentId: this.params.agentId,
      runId,
      label,
      task: prompt ?? `Codex native subagent follow-up for ${label}`,
      ...(parentTask ? { parentTaskId: parentTask.taskId } : {}),
      notifyPolicy: "silent",
      deliveryStatus: "not_applicable",
      preferMetadata: true,
      startedAt,
      lastEventAt: startedAt,
      progressSummary,
      eventMetadata: this.buildEventMetadata({
        threadId,
        identity,
        phase: "child_follow_up_started",
      }),
    });
    if (!taskRecord) {
      this.activeRunIdByThreadId.set(threadId, rootRunId);
      this.activeAttemptByThreadId.delete(threadId);
      return;
    }
    this.terminalRunIds.delete(runId);
  }

  private currentRunId(threadId: string): string {
    return this.activeRunIdByThreadId.get(threadId) ?? codexNativeSubagentRunId(threadId);
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

/** Converts one native follow-up operation into a linked task-attempt run id. */
export function codexNativeSubagentFollowUpRunId(threadId: string, operationId: string): string {
  return `${codexNativeSubagentRunId(threadId)}:followup:${operationId.trim()}`;
}

function readCodexNativeSubagentThreadId(runId: string | undefined): string | undefined {
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

export type NativeSubagentIdentity = {
  nickname?: string;
  role?: string;
  agentPath?: string;
  spawnReason?: string;
  taskName?: string;
  model?: string;
  reasoningEffort?: string;
};

type NativeSubagentTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningOutputTokens?: number;
  totalTokens?: number;
};

function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" ? trimOptional(value) : undefined;
}

function readMetadataNumber(
  metadata: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function readPersistedNativeSubagentIdentity(
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

function readPersistedNativeSubagentTokenUsage(
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

function resolveThreadSubagentIdentity(
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

function taskNameFromAgentPath(agentPath: string | null | undefined): string | undefined {
  const normalized = trimOptional(agentPath)?.replace(/\/+$/u, "");
  if (!normalized) {
    return undefined;
  }
  return trimOptional(normalized.slice(normalized.lastIndexOf("/") + 1));
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

function mergeNativeSubagentIdentity(
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

function sameNativeSubagentIdentity(
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

function hasNativeSubagentIdentity(identity: NativeSubagentIdentity): boolean {
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

function formatNativeSubagentLabel(identity: NativeSubagentIdentity): string | undefined {
  const nickname = trimOptional(identity.nickname);
  const role = trimOptional(identity.role);
  if (nickname && role && nickname !== role) {
    return `${nickname} (${role})`;
  }
  return nickname ?? role;
}

function nativeSubagentStartSummary(
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

function readString(value: JsonObject, key: string): string | undefined {
  const entry = value[key];
  return typeof entry === "string" ? entry : undefined;
}

function readJsonObjectValue(value: JsonValue | undefined): JsonObject {
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

function readNullableString(value: JsonObject, key: string): string | null | undefined {
  const entry = value[key];
  return typeof entry === "string" || entry === null ? entry : undefined;
}

function normalizeToolName(value: string | undefined): string | undefined {
  return value?.replace(/[^a-z0-9]/giu, "").toLowerCase();
}

function isNativeFollowUpToolName(value: string | undefined): boolean {
  return value === "followuptask" || value === "sendinput" || value === "resumeagent";
}

function roleToAgentPath(role: string | undefined): string | undefined {
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

function extractSpawnMessageRole(message: string | undefined): string | undefined {
  const match = message?.match(/(?:^|\n)\s*Role:\s*([A-Za-z0-9_-]+)/u);
  return trimOptional(match?.[1]);
}

function extractSpawnMessageObjective(message: string | undefined): string | undefined {
  const match = message?.match(/(?:^|[\n.])\s*Objective:\s*([^\n]+)/u);
  return trimOptional(match?.[1]);
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

function readFiniteNumber(value: JsonObject, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0) {
      return candidate;
    }
  }
  return undefined;
}

function activeFlagsSummary(activeFlags: string[] | undefined): string | undefined {
  const flags = activeFlags?.map((flag) => flag.trim()).filter(Boolean);
  return flags && flags.length > 0 ? `active flags: ${flags.join(", ")}` : undefined;
}

function trimOptional(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
