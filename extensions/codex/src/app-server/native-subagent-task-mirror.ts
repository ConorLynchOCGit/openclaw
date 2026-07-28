/**
 * Mirrors Codex native subagent thread lifecycle events into OpenClaw task
 * runtime rows so parent sessions can observe child progress.
 */
import type { AgentHarnessTaskRuntime } from "openclaw/plugin-sdk/agent-harness-task-runtime";
import { CodexNativeSubagentTaskEvents } from "./native-subagent-task-events.js";
import {
  codexNativeSubagentFollowUpRunId,
  codexNativeSubagentRunId,
  readCodexNativeSubagentThreadId,
  activeFlagsSummary,
  formatNativeSubagentLabel,
  hasNativeSubagentIdentity,
  isNonTerminalAgentStateStatus,
  mergeNativeSubagentIdentity,
  nativeSubagentStartSummary,
  nativeSubagentSummary,
  normalizeAgentStateStatus,
  type NativeSubagentIdentity,
  type NativeSubagentTaskEventMetadata,
  type NativeSubagentTokenUsage,
  type PendingKeyedNativeSpawn,
  type PendingNativeFollowUp,
  readMetadataString,
  readPersistedNativeSubagentIdentity,
  readPersistedNativeSubagentTokenUsage,
  readPersistedTaskMetadata,
  readJsonObjectValue,
  readString,
  resolveCollabItemSubagentIdentity,
  sameNativeSubagentIdentity,
  trimOptional,
} from "./native-subagent-task-mirror-support.js";
import type { CodexServerNotification, CodexThreadStatus, JsonObject } from "./protocol.js";
import { isJsonObject } from "./protocol.js";

/** Minimal task-runtime surface needed to mirror native subagent lifecycle. */
export type TaskLifecycleRuntime = Pick<
  AgentHarnessTaskRuntime,
  | "tryCreateRunningTaskRun"
  | "recordTaskRunProgressByRunId"
  | "finalizeTaskRunByRunId"
  | "listTaskRecords"
>;

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
  private readonly authoritativeRunIds = new Set<string>();
  private readonly expectedAuthoritativeRunIds = new Set<string>();
  private readonly now: () => number;
  private readonly events: CodexNativeSubagentTaskEvents;

  constructor(
    private readonly params: CodexNativeSubagentTaskMirrorParams,
    private readonly runtime: TaskLifecycleRuntime,
  ) {
    this.now = params.now ?? Date.now;
    this.events = new CodexNativeSubagentTaskEvents({
      params: this.params,
      runtime: this.runtime,
      now: this.now,
      mirroredThreadIds: this.mirroredThreadIds,
      failedMirrorThreadIds: this.failedMirrorThreadIds,
      terminalRunIds: this.terminalRunIds,
      activeRunIdByThreadId: this.activeRunIdByThreadId,
      activeAttemptByThreadId: this.activeAttemptByThreadId,
      identityByThreadId: this.identityByThreadId,
      parentTurnIdByThreadId: this.parentTurnIdByThreadId,
      pendingSpawnsByCallId: this.pendingSpawnsByCallId,
      pendingFollowUpsByCallId: this.pendingFollowUpsByCallId,
      tokenUsageByThreadId: this.tokenUsageByThreadId,
      applyStatus: (threadId, status) => this.applyStatus(threadId, status),
      buildTaskDetail: (detail) => this.buildTaskDetail(detail),
      currentRunId: (threadId) => this.currentRunId(threadId),
      rememberPendingFollowUp: (item, callId, parentTurnId) =>
        this.rememberPendingFollowUp(item, callId, parentTurnId),
      beginFollowUpAttempt: (attempt) => this.beginFollowUpAttempt(attempt),
      createOrIdentifyTaskFromSpawn: (spawn) => this.createOrIdentifyTaskFromSpawn(spawn),
      applyCollabAgentStatus: (threadId, status, message) =>
        this.applyCollabAgentStatus(threadId, status, message),
      createTaskFromCollabSpawnItem: (threadId, item, parentTurnId) =>
        this.createTaskFromCollabSpawnItem(threadId, item, parentTurnId),
    });
    this.hydratePersistedTaskState();
  }

  markAuthoritativeCompletion(childThreadId: string): void {
    const runId = this.currentRunId(childThreadId);
    this.authoritativeRunIds.add(runId);
    this.terminalRunIds.add(runId);
  }

  markAuthoritativeCompletionExpected(childThreadId: string): void {
    this.expectedAuthoritativeRunIds.add(this.currentRunId(childThreadId));
  }

  handleNotification(notification: CodexServerNotification): void {
    const params = isJsonObject(notification.params) ? notification.params : undefined;
    if (!params) {
      return;
    }
    if (notification.method === "thread/started") {
      this.events.handleThreadStarted(params);
      return;
    }
    if (notification.method === "thread/status/changed") {
      this.events.handleThreadStatusChanged(params);
      return;
    }
    if (notification.method === "thread/tokenUsage/updated") {
      this.events.handleTokenUsageUpdated(params);
      return;
    }
    if (
      notification.method === "item/started" ||
      notification.method === "item/completed" ||
      notification.method === "rawResponseItem/completed"
    ) {
      this.events.handleNativeFunctionItem(params);
      this.events.handleDynamicAgentItem(params);
      this.events.handleCollabAgentItem(params);
      if (notification.method === "item/completed") {
        this.events.handleSubAgentActivityItem(params);
      }
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
    if (this.authoritativeRunIds.has(runId)) {
      return;
    }
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
        detail: this.buildTaskDetail({
          threadId,
          phase: "child_active",
        }),
      });
      return;
    }
    if (statusType === "idle") {
      const detail =
        this.latestCollabTerminalDetailByThreadId.get(threadId) ??
        this.latestCollabStatusDetailByThreadId.get(threadId);
      const progressSummary = nativeSubagentSummary("Codex native subagent is idle", detail);
      this.runtime.recordTaskRunProgressByRunId({
        runId,
        lastEventAt: eventAt,
        progressSummary,
        eventSummary: progressSummary,
        detail: this.buildTaskDetail({
          threadId,
          phase: "child_idle",
        }),
      });
      return;
    }
    if (statusType === "systemError") {
      if (this.expectedAuthoritativeRunIds.has(runId)) {
        this.terminalRunIds.delete(runId);
        const progressSummary = nativeSubagentSummary(
          "Codex native subagent hit a system error; awaiting recovery",
          this.latestCollabTerminalDetailByThreadId.get(threadId) ??
            this.latestCollabStatusDetailByThreadId.get(threadId),
        );
        this.runtime.recordTaskRunProgressByRunId({
          runId,
          lastEventAt: eventAt,
          progressSummary,
          eventSummary: progressSummary,
          detail: this.buildTaskDetail({
            threadId,
            phase: "child_recovering",
          }),
        });
        return;
      }
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
        detail: this.buildTaskDetail({
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
        detail: this.buildTaskDetail({
          threadId,
          phase: "child_not_loaded",
        }),
      });
    }
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
          detail: this.buildTaskDetail({
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
      detail: this.buildTaskDetail({
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
    if (this.authoritativeRunIds.has(runId)) {
      return;
    }
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
        detail: this.buildTaskDetail({
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
      if (this.expectedAuthoritativeRunIds.has(runId)) {
        this.runtime.recordTaskRunProgressByRunId({
          runId,
          lastEventAt: eventAt,
          progressSummary: detail ?? "Codex native subagent completed.",
          eventSummary: detail ?? "Codex native subagent completed.",
          detail: this.buildTaskDetail({
            threadId,
            phase: "child_completed",
          }),
        });
        return;
      }
      this.runtime.finalizeTaskRunByRunId({
        runId,
        status: "succeeded",
        endedAt: eventAt,
        lastEventAt: eventAt,
        progressSummary: nativeSubagentSummary("Codex native subagent completed", detail),
        terminalSummary: nativeSubagentSummary("Codex native subagent finished", detail),
        detail: this.buildTaskDetail({
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
        detail: this.buildTaskDetail({
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
      detail: this.buildTaskDetail({
        threadId,
        phase:
          normalizedStatus === "interrupted" || normalizedStatus === "shutdown"
            ? "child_cancelled"
            : "child_failed",
      }),
    });
  }

  private buildTaskDetail(params: {
    threadId: string;
    identity?: NativeSubagentIdentity;
    phase: string;
  }): NativeSubagentTaskEventMetadata {
    const identity = params.identity ?? this.identityByThreadId.get(params.threadId);
    const spawnReason = trimOptional(identity?.spawnReason);
    const tokenUsage = this.tokenUsageByThreadId.get(params.threadId);
    const attempt = this.activeAttemptByThreadId.get(params.threadId);
    return {
      schema: "openclaw.codex.native_subagent_task.v1",
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
    for (const task of this.runtime.listTaskRecords?.() ?? []) {
      const metadata = readPersistedTaskMetadata(task);
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
      detail: this.buildTaskDetail({
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

export {
  codexNativeSubagentRunId,
  codexNativeSubagentFollowUpRunId,
  readSubagentThreadSpawnSource,
  type NativeSubagentIdentity,
  resolveNativeSpawnFunctionIdentity,
  readFunctionCallId,
  boundNativeSubagentText,
} from "./native-subagent-task-mirror-support.js";
