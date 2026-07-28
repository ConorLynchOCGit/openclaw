import {
  type NativeSubagentTaskEventMetadata,
  type PendingKeyedNativeSpawn,
  type PendingNativeFollowUp,
  readSubagentThreadSpawnSource,
  readThreadStartedNotification,
  readThreadStatusChangedNotification,
  readAgentsStates,
  readStringArray,
  type NativeSubagentIdentity,
  type NativeSubagentTokenUsage,
  resolveThreadSubagentIdentity,
  taskNameFromAgentPath,
  resolveNativeSpawnFunctionIdentity,
  mergeNativeSubagentIdentity,
  sameNativeSubagentIdentity,
  hasNativeSubagentIdentity,
  formatNativeSubagentLabel,
  nativeSubagentStartSummary,
  readString,
  readJsonObjectValue,
  readFunctionCallId,
  normalizeToolName,
  isNativeFollowUpToolName,
  normalizeCollabToolCallStatus,
  normalizeSubagentActivityKind,
  isBlockedOrFailedCollabToolCallStatus,
  isNonTerminalAgentStateStatus,
  isTerminalAgentStateStatus,
  normalizeAgentStateStatus,
  secondsToMillis,
  readFiniteNumber,
  trimOptional,
} from "./native-subagent-task-mirror-support.js";
import type {
  CodexNativeSubagentTaskMirrorParams,
  TaskLifecycleRuntime,
} from "./native-subagent-task-mirror.js";
import type { CodexThreadStatus, JsonObject } from "./protocol.js";
import { isJsonObject } from "./protocol.js";

type NativeSubagentAttempt = { kind: "follow_up"; operationId: string };

type CodexNativeSubagentTaskEventsContext = {
  params: CodexNativeSubagentTaskMirrorParams;
  runtime: TaskLifecycleRuntime;
  now: () => number;
  mirroredThreadIds: Set<string>;
  failedMirrorThreadIds: Set<string>;
  terminalRunIds: Set<string>;
  activeRunIdByThreadId: Map<string, string>;
  activeAttemptByThreadId: Map<string, NativeSubagentAttempt>;
  identityByThreadId: Map<string, NativeSubagentIdentity>;
  parentTurnIdByThreadId: Map<string, string>;
  pendingSpawnsByCallId: Map<string, PendingKeyedNativeSpawn>;
  pendingFollowUpsByCallId: Map<string, PendingNativeFollowUp>;
  tokenUsageByThreadId: Map<string, NativeSubagentTokenUsage>;
  applyStatus: (threadId: string, status: CodexThreadStatus | null | undefined) => void;
  buildTaskDetail: (params: {
    threadId: string;
    identity?: NativeSubagentIdentity;
    phase: string;
  }) => NativeSubagentTaskEventMetadata;
  currentRunId: (threadId: string) => string;
  rememberPendingFollowUp: (item: JsonObject, callId: string, parentTurnId?: string) => void;
  beginFollowUpAttempt: (params: {
    threadId: string;
    operationId: string;
    parentTurnId?: string;
    prompt?: string;
  }) => void;
  createOrIdentifyTaskFromSpawn: (params: {
    threadId: string;
    identity: NativeSubagentIdentity;
    prompt?: string;
    parentTurnId?: string;
  }) => void;
  applyCollabAgentStatus: (
    threadId: string,
    status: string | undefined,
    message: string | null | undefined,
  ) => void;
  createTaskFromCollabSpawnItem: (
    threadId: string,
    item: JsonObject,
    parentTurnId?: string,
  ) => void;
};

export class CodexNativeSubagentTaskEvents {
  constructor(private readonly context: CodexNativeSubagentTaskEventsContext) {}

  handleDynamicAgentItem(params: JsonObject): void {
    const item = isJsonObject(params.item) ? params.item : undefined;
    if (!item || readString(item, "type") !== "dynamicToolCall") {
      return;
    }
    const namespace = readString(item, "namespace");
    if (namespace && namespace !== "agents") {
      return;
    }
    const threadId = readString(params, "threadId")?.trim();
    if (threadId !== this.context.params.parentThreadId) {
      return;
    }
    const toolName = normalizeToolName(readString(item, "tool"));
    const callId = readFunctionCallId(item);
    if (!callId) {
      return;
    }
    const parentTurnId = trimOptional(readString(params, "turnId"));
    if (isNativeFollowUpToolName(toolName)) {
      this.context.rememberPendingFollowUp(item, callId, parentTurnId);
      return;
    }
    if (toolName !== "spawnagent") {
      return;
    }
    const identity = resolveNativeSpawnFunctionIdentity(item);
    const pending = { identity, ...(parentTurnId ? { parentTurnId } : {}) };
    if (!this.context.pendingSpawnsByCallId.has(callId)) {
      this.context.pendingSpawnsByCallId.set(callId, pending);
    }
  }

  handleSubAgentActivityItem(params: JsonObject): void {
    const item = isJsonObject(params.item) ? params.item : undefined;
    if (!item || readString(item, "type") !== "subAgentActivity") {
      return;
    }
    const threadId = readString(params, "threadId")?.trim();
    if (threadId !== this.context.params.parentThreadId) {
      return;
    }
    const childThreadId = trimOptional(readString(item, "agentThreadId"));
    const kind = normalizeSubagentActivityKind(readString(item, "kind"));
    if (!childThreadId || !kind) {
      return;
    }
    if (kind !== "started") {
      if (!this.context.mirroredThreadIds.has(childThreadId)) {
        return;
      }
      const message =
        kind === "interacted"
          ? "Codex native subagent received more input."
          : "Codex native subagent was interrupted.";
      this.context.applyCollabAgentStatus(
        childThreadId,
        kind === "interacted" ? "running" : "interrupted",
        message,
      );
      return;
    }
    const callId = readFunctionCallId(item);
    const pending = callId ? this.context.pendingSpawnsByCallId.get(callId) : undefined;
    const pendingFollowUp = callId ? this.context.pendingFollowUpsByCallId.get(callId) : undefined;
    if (callId) {
      this.context.pendingSpawnsByCallId.delete(callId);
      this.context.pendingFollowUpsByCallId.delete(callId);
    }
    const parentTurnId =
      pending?.parentTurnId ??
      pendingFollowUp?.parentTurnId ??
      trimOptional(readString(params, "turnId"));
    if (pendingFollowUp && callId) {
      this.context.beginFollowUpAttempt({
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
    this.context.createOrIdentifyTaskFromSpawn({
      threadId: childThreadId,
      identity,
      prompt: identity.spawnReason,
      parentTurnId,
    });
  }

  handleThreadStarted(params: JsonObject): void {
    const notification = readThreadStartedNotification(params);
    if (!notification) {
      return;
    }
    const thread = notification.thread;
    const spawn = readSubagentThreadSpawnSource(thread.source, this.context.params.parentThreadId);
    if (!spawn) {
      return;
    }
    const threadId = thread.id.trim();
    if (!threadId) {
      return;
    }
    const runId = this.context.currentRunId(threadId);
    const spawnReason = trimOptional(thread.preview);
    const identity = resolveThreadSubagentIdentity(thread, spawn, spawnReason);
    if (this.context.mirroredThreadIds.has(threadId)) {
      const previousIdentity = this.context.identityByThreadId.get(threadId);
      const mergedIdentity = mergeNativeSubagentIdentity(previousIdentity, identity);
      if (!sameNativeSubagentIdentity(previousIdentity, mergedIdentity)) {
        this.context.identityByThreadId.set(threadId, mergedIdentity);
        const progressSummary = nativeSubagentStartSummary("identified", mergedIdentity);
        this.context.runtime.recordTaskRunProgressByRunId({
          runId,
          lastEventAt: this.context.now(),
          progressSummary,
          eventSummary: progressSummary,
          detail: this.context.buildTaskDetail({
            threadId,
            identity: mergedIdentity,
            phase: "child_identified",
          }),
        });
      }
      this.context.applyStatus(threadId, thread.status);
      return;
    }
    this.context.mirroredThreadIds.add(threadId);
    this.context.identityByThreadId.set(threadId, identity);
    const label = formatNativeSubagentLabel(identity) ?? "Codex subagent";
    const task =
      identity.spawnReason ??
      `Codex native subagent${label === "Codex subagent" ? "" : ` ${label}`}`;
    const createdAt = secondsToMillis(thread.createdAt) ?? this.context.now();
    const taskRecord = this.context.runtime.tryCreateRunningTaskRun({
      sourceId: runId,
      agentId: this.context.params.agentId,
      runId,
      label,
      task,
      notifyPolicy: "silent",
      deliveryStatus: "not_applicable",
      preferMetadata: true,
      startedAt: createdAt,
      lastEventAt: this.context.now(),
      progressSummary: nativeSubagentStartSummary("started", identity),
      detail: this.context.buildTaskDetail({
        threadId,
        identity,
        phase: "child_spawned",
      }),
    });
    if (!taskRecord) {
      this.context.mirroredThreadIds.delete(threadId);
      this.context.failedMirrorThreadIds.add(threadId);
      this.context.identityByThreadId.delete(threadId);
      this.context.parentTurnIdByThreadId.delete(threadId);
      return;
    }
    this.context.failedMirrorThreadIds.delete(threadId);
    this.context.terminalRunIds.delete(runId);
    this.context.activeRunIdByThreadId.set(threadId, runId);
    this.context.activeAttemptByThreadId.delete(threadId);
    this.context.applyStatus(threadId, thread.status);
  }

  handleThreadStatusChanged(params: JsonObject): void {
    const notification = readThreadStatusChangedNotification(params);
    if (!notification) {
      return;
    }
    this.context.applyStatus(notification.threadId, notification.status);
  }

  handleTokenUsageUpdated(params: JsonObject): void {
    const threadId = trimOptional(readString(params, "threadId"));
    if (!threadId || !this.context.mirroredThreadIds.has(threadId)) {
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
      this.context.tokenUsageByThreadId.set(threadId, usage);
    }
  }

  handleCollabAgentItem(params: JsonObject): void {
    const item = isJsonObject(params.item) ? params.item : undefined;
    if (!item || readString(item, "type") !== "collabAgentToolCall") {
      return;
    }
    const senderThreadId = readString(item, "senderThreadId") ?? readString(params, "threadId");
    if (senderThreadId !== this.context.params.parentThreadId) {
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
        this.context.beginFollowUpAttempt({
          threadId: childThreadId,
          operationId,
          parentTurnId,
          prompt,
        });
      }
    }
    if (isSpawnAgentTool) {
      for (const childThreadId of spawnChildThreadIds) {
        this.context.createTaskFromCollabSpawnItem(childThreadId, item, parentTurnId);
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
      this.context.applyCollabAgentStatus(threadId, normalizedStatus, state.message);
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
        this.context.applyCollabAgentStatus(threadId, toolCallStatus, state?.message);
      }
    }
  }

  handleNativeFunctionItem(params: JsonObject): void {
    const item = isJsonObject(params.item) ? params.item : undefined;
    if (!item) {
      return;
    }
    const threadId = readString(params, "threadId")?.trim();
    if (threadId && threadId !== this.context.params.parentThreadId) {
      return;
    }
    const itemType = readString(item, "type");
    const parentTurnId = trimOptional(readString(params, "turnId"));
    if (itemType === "function_call") {
      const toolName = normalizeToolName(readString(item, "name"));
      if (isNativeFollowUpToolName(toolName)) {
        const callId = readFunctionCallId(item);
        if (callId) {
          this.context.rememberPendingFollowUp(item, callId, parentTurnId);
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
    if (!this.context.pendingSpawnsByCallId.has(callId)) {
      this.context.pendingSpawnsByCallId.set(callId, pending);
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
    const pendingFollowUp = callId ? this.context.pendingFollowUpsByCallId.get(callId) : undefined;
    if (pendingFollowUp && callId) {
      this.context.pendingFollowUpsByCallId.delete(callId);
      this.context.beginFollowUpAttempt({
        threadId: childThreadId,
        operationId: callId,
        parentTurnId: pendingFollowUp.parentTurnId,
        prompt: pendingFollowUp.prompt,
      });
      return;
    }
    const pending = callId ? this.context.pendingSpawnsByCallId.get(callId) : undefined;
    if (callId) {
      this.context.pendingSpawnsByCallId.delete(callId);
    }
    const parentTurnId = pending?.parentTurnId;
    const outputIdentity = {
      nickname: trimOptional(readString(output, "nickname")),
    };
    const identity = mergeNativeSubagentIdentity(pending?.identity, outputIdentity);
    this.context.createOrIdentifyTaskFromSpawn({
      threadId: childThreadId,
      identity,
      prompt: identity.spawnReason,
      parentTurnId,
    });
  }
}
