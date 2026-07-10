/**
 * Monitors Codex native subagent threads and mirrors their lifecycle/completion
 * into OpenClaw task runtime records for parent sessions.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { embeddedAgentLog, formatErrorMessage } from "openclaw/plugin-sdk/agent-harness-runtime";
import {
  createAgentHarnessTaskRuntime,
  type AgentHarnessTaskRuntimeScope,
  type AgentHarnessTaskRuntime,
  type AgentHarnessTaskRecord,
} from "openclaw/plugin-sdk/agent-harness-task-runtime";
import { asFiniteNumber, normalizeOptionalString } from "openclaw/plugin-sdk/string-coerce-runtime";
import type { CodexAppServerClient } from "./client.js";
import { normalizeCodexItemToolEvent } from "./codex-item-event-normalizer.js";
import {
  extractCodexNativeSubagentCompletions,
  type CodexNativeSubagentCompletion,
  type CodexNativeSubagentNotificationCompletion,
} from "./native-subagent-notification.js";
import { readCodexSubagentThreadSpawnSourceFromThread } from "./native-subagent-source.js";
import {
  CODEX_NATIVE_SUBAGENT_RUN_ID_PREFIX,
  CODEX_NATIVE_SUBAGENT_RUNTIME,
  CODEX_NATIVE_SUBAGENT_TASK_KIND,
} from "./native-subagent-task-ids.js";
import {
  codexNativeSubagentRunId,
  CodexNativeSubagentTaskMirror,
} from "./native-subagent-task-mirror.js";
import type { CodexServerNotification, JsonObject, JsonValue } from "./protocol.js";
import { isJsonObject } from "./protocol.js";
import type { CodexTrajectoryRecorder } from "./trajectory.js";

type NativeSubagentMonitorRuntime = {
  createAgentHarnessTaskRuntime: typeof createAgentHarnessTaskRuntime;
};

type ParentState = {
  parentThreadId: string;
  requesterSessionKey?: string;
  taskRuntimeScope?: AgentHarnessTaskRuntimeScope;
  agentId?: string;
  taskRuntime?: AgentHarnessTaskRuntime;
  mirror?: CodexNativeSubagentTaskMirror;
  trajectoryRecorder?: CodexTrajectoryRecorder | null;
  mirroredCompletionKeys: Set<string>;
};

type ChildState = {
  childThreadId: string;
  parentThreadId: string;
  transcriptPath?: string;
  transcriptPollAttempt: number;
  transcriptPollTimer?: ReturnType<typeof setTimeout>;
  transcriptTerminal: boolean;
  noFinalCompletionFallbackTimer?: ReturnType<typeof setTimeout>;
  role?: string;
  objective?: string;
};

type TranscriptCompletion = CodexNativeSubagentCompletion & {
  parentThreadId?: string;
  completedAt?: number;
};

type MonitorOptions = {
  codexHome?: string;
  transcriptPollDelaysMs?: readonly number[];
  taskRowReconcileIntervalMs?: number;
};

const DEFAULT_TRANSCRIPT_POLL_DELAYS_MS = [
  2_000, 5_000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000,
];
const DEFAULT_TASK_ROW_RECONCILE_INTERVAL_MS = 10_000;
const RECENT_TERMINAL_TASK_RECONCILE_GRACE_MS = 60_000;

const defaultRuntime: NativeSubagentMonitorRuntime = {
  createAgentHarnessTaskRuntime,
};

const monitors = new WeakMap<CodexAppServerClient, CodexNativeSubagentMonitor>();

/** Registers or updates the monitor bound to a Codex app-server client. */
export function registerCodexNativeSubagentMonitor(params: {
  client: CodexAppServerClient;
  parentThreadId: string;
  requesterSessionKey?: string;
  taskRuntimeScope?: AgentHarnessTaskRuntimeScope;
  agentId?: string;
  codexHome?: string;
  trajectoryRecorder?: CodexTrajectoryRecorder | null;
  runtime?: NativeSubagentMonitorRuntime;
}): void {
  let monitor = monitors.get(params.client);
  if (!monitor) {
    monitor = new CodexNativeSubagentMonitor(params.client, params.runtime ?? defaultRuntime, {
      codexHome: params.codexHome,
    });
    monitors.set(params.client, monitor);
  } else {
    monitor.configure({ codexHome: params.codexHome });
  }
  monitor.registerParent({
    parentThreadId: params.parentThreadId,
    requesterSessionKey: params.requesterSessionKey,
    taskRuntimeScope: params.taskRuntimeScope,
    agentId: params.agentId,
    trajectoryRecorder: params.trajectoryRecorder,
  });
}

/** Tracks native subagent thread notifications and mirrors completion into task rows. */
export class CodexNativeSubagentMonitor {
  private readonly startedAt = Date.now();
  private readonly parentStates = new Map<string, ParentState>();
  private readonly childThreadParents = new Map<string, string>();
  private readonly childStates = new Map<string, ChildState>();
  private readonly childThreadIdsByAgentPath = new Map<string, string>();
  private readonly transcriptPathsByChildThreadId = new Map<string, string>();
  private codexHome?: string;
  private transcriptPollDelaysMs: readonly number[];
  private taskRowReconcileTimer?: ReturnType<typeof setInterval>;

  constructor(
    client: Pick<CodexAppServerClient, "addNotificationHandler" | "addCloseHandler">,
    private readonly runtime: NativeSubagentMonitorRuntime = defaultRuntime,
    options: MonitorOptions = {},
  ) {
    this.codexHome = normalizeOptionalString(options.codexHome);
    this.transcriptPollDelaysMs =
      options.transcriptPollDelaysMs ?? DEFAULT_TRANSCRIPT_POLL_DELAYS_MS;
    this.startTaskRowReconciler(
      options.taskRowReconcileIntervalMs ?? DEFAULT_TASK_ROW_RECONCILE_INTERVAL_MS,
    );
    client.addNotificationHandler((notification) => this.handleNotification(notification));
    client.addCloseHandler?.(() => this.dispose());
  }

  dispose(): void {
    this.clearTimers();
    this.parentStates.clear();
    this.childThreadParents.clear();
    this.childStates.clear();
    this.childThreadIdsByAgentPath.clear();
    this.transcriptPathsByChildThreadId.clear();
  }

  configure(options: MonitorOptions): void {
    const codexHome = normalizeOptionalString(options.codexHome);
    if (codexHome) {
      this.codexHome = codexHome;
    }
  }

  registerParent(params: {
    parentThreadId: string;
    requesterSessionKey?: string;
    taskRuntimeScope?: AgentHarnessTaskRuntimeScope;
    agentId?: string;
    trajectoryRecorder?: CodexTrajectoryRecorder | null;
  }): void {
    const parentThreadId = params.parentThreadId.trim();
    if (!parentThreadId) {
      return;
    }
    const existing = this.parentStates.get(parentThreadId);
    if (existing) {
      existing.requesterSessionKey = params.requesterSessionKey ?? existing.requesterSessionKey;
      existing.taskRuntimeScope = params.taskRuntimeScope ?? existing.taskRuntimeScope;
      existing.agentId = params.agentId ?? existing.agentId;
      existing.trajectoryRecorder = params.trajectoryRecorder ?? existing.trajectoryRecorder;
      this.ensureParentTaskRuntime(existing);
    } else {
      const state: ParentState = {
        parentThreadId,
        requesterSessionKey: params.requesterSessionKey,
        taskRuntimeScope: params.taskRuntimeScope,
        agentId: params.agentId,
        trajectoryRecorder: params.trajectoryRecorder,
        mirroredCompletionKeys: new Set<string>(),
      };
      this.ensureParentTaskRuntime(state);
      this.parentStates.set(parentThreadId, {
        ...state,
      });
    }
    const state = this.parentStates.get(parentThreadId);
    if (state) {
      void this.reconcileExistingRunningTasksForParent(state);
    }
  }

  async handleNotification(notification: CodexServerNotification): Promise<void> {
    const state = this.resolveMirrorState(notification);
    if (state?.mirror) {
      try {
        state.mirror.handleNotification(notification);
      } catch (error) {
        embeddedAgentLog.warn("Failed to mirror Codex native subagent lifecycle event", {
          method: notification.method,
          error: formatErrorMessage(error),
        });
      }
    }
    this.recordChildToolEvent(state, notification);
    await this.handleCompletionNotification(notification);
  }

  private ensureParentTaskRuntime(state: ParentState): void {
    if (state.taskRuntime || !state.requesterSessionKey || !state.taskRuntimeScope) {
      return;
    }
    state.taskRuntime = this.runtime.createAgentHarnessTaskRuntime({
      runtime: CODEX_NATIVE_SUBAGENT_RUNTIME,
      taskKind: CODEX_NATIVE_SUBAGENT_TASK_KIND,
      scope: state.taskRuntimeScope,
      runIdPrefix: CODEX_NATIVE_SUBAGENT_RUN_ID_PREFIX,
    });
    state.mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: state.parentThreadId,
        requesterSessionKey: state.requesterSessionKey,
        agentId: state.agentId,
      },
      state.taskRuntime,
    );
  }

  private resolveMirrorState(notification: CodexServerNotification): ParentState | undefined {
    const params = isJsonObject(notification.params) ? notification.params : undefined;
    if (!params) {
      return undefined;
    }
    if (notification.method === "thread/started") {
      const thread = isJsonObject(params.thread) ? params.thread : undefined;
      const parentThreadId = readSpawnParentThreadId(thread);
      const childThreadId = thread ? readString(thread, "id")?.trim() : undefined;
      const agentPath = readSpawnAgentPath(thread);
      const spawn = readCodexSubagentThreadSpawnSourceFromThread(thread);
      const state = parentThreadId ? this.parentStates.get(parentThreadId) : undefined;
      if (state && childThreadId && parentThreadId) {
        this.registerChildThread(parentThreadId, childThreadId, {
          agentPath,
          role: normalizeOptionalString(spawn?.agent_role),
          objective: normalizeOptionalString(thread ? readString(thread, "preview") : undefined),
        });
      }
      return state;
    }
    if (notification.method === "thread/status/changed") {
      const childThreadId = readString(params, "threadId")?.trim();
      const parentThreadId = childThreadId ? this.childThreadParents.get(childThreadId) : undefined;
      return parentThreadId ? this.parentStates.get(parentThreadId) : undefined;
    }
    if (notification.method === "item/started" || notification.method === "item/completed") {
      const item = isJsonObject(params.item) ? params.item : undefined;
      const parentThreadId = item
        ? (readString(item, "senderThreadId") ?? readString(params, "threadId"))?.trim()
        : undefined;
      const childParentThreadId = parentThreadId
        ? this.childThreadParents.get(parentThreadId)
        : undefined;
      const state = parentThreadId
        ? (this.parentStates.get(parentThreadId) ??
          (childParentThreadId ? this.parentStates.get(childParentThreadId) : undefined))
        : undefined;
      if (state && parentThreadId) {
        const nativeSpawnOutputChildThreadId = readNativeSpawnFunctionOutputChildThreadId(item);
        if (nativeSpawnOutputChildThreadId) {
          this.registerChildThread(parentThreadId, nativeSpawnOutputChildThreadId);
        }
        const isSpawnAgentTool = normalizeToolName(readString(item, "tool")) === "spawnagent";
        const childThreadIds = isSpawnAgentTool
          ? new Set([
              ...readStringArray(item?.receiverThreadIds),
              ...readObjectStringKeys(item?.agentsStates),
            ])
          : new Set(readStringArray(item?.receiverThreadIds));
        for (const childThreadId of childThreadIds) {
          this.registerChildThread(parentThreadId, childThreadId);
        }
      }
      return state;
    }
    return undefined;
  }

  private recordChildToolEvent(
    state: ParentState | undefined,
    notification: CodexServerNotification,
  ): void {
    if (!state?.trajectoryRecorder) {
      return;
    }
    const params = isJsonObject(notification.params) ? notification.params : undefined;
    const childThreadId = params ? readString(params, "threadId")?.trim() : undefined;
    if (
      !params ||
      !childThreadId ||
      this.childThreadParents.get(childThreadId) !== state.parentThreadId
    ) {
      return;
    }
    const child = this.childStates.get(childThreadId);
    const event = normalizeCodexItemToolEvent({
      method: notification.method,
      notificationParams: params,
      threadId: childThreadId,
      turnId: readString(params, "turnId"),
      role: child?.role,
      objective: child?.objective,
    });
    if (event) {
      state.trajectoryRecorder.recordEvent(event.type, event.data);
    }
  }

  private async handleCompletionNotification(notification: CodexServerNotification): Promise<void> {
    const params = isJsonObject(notification.params) ? notification.params : undefined;
    const parentThreadId = params ? readString(params, "threadId")?.trim() : undefined;
    const state = parentThreadId ? this.parentStates.get(parentThreadId) : undefined;
    if (!state) {
      return;
    }
    const completions = extractCodexNativeSubagentCompletions(notification);
    for (const nativeCompletion of completions) {
      const childThreadId = this.resolveChildThreadIdForAgentPath(
        state.parentThreadId,
        nativeCompletion.agentPath,
      );
      const childState = childThreadId ? this.childStates.get(childThreadId) : undefined;
      if (!childState || childState.parentThreadId !== state.parentThreadId) {
        embeddedAgentLog.warn(
          "Ignoring Codex native subagent completion for unknown child thread",
          {
            parentThreadId: state.parentThreadId,
            agentPath: nativeCompletion.agentPath,
          },
        );
        continue;
      }
      const completion = toThreadCompletion(nativeCompletion, childState.childThreadId);
      if (shouldWaitForTranscriptCompletion(completion, this.codexHome)) {
        // Codex can notify `completed: null` before the child transcript exposes
        // its final assistant message; poll briefly before delivering the no-final fallback.
        const eventAt = Date.now();
        const reconciled = await this.reconcileChildTranscript(childState.childThreadId);
        if (!reconciled) {
          this.scheduleTranscriptPoll(childState);
          this.scheduleNoFinalCompletionFallback(state, childState, completion, eventAt);
        }
        continue;
      }
      await this.processCompletion(state, completion);
    }
  }

  async reconcileChildTranscript(
    childThreadId: string,
    options: { allowTreeScan?: boolean } = {},
  ): Promise<boolean> {
    const childState = this.childStates.get(childThreadId.trim());
    const state = childState ? this.parentStates.get(childState.parentThreadId) : undefined;
    if (!childState || !state || childState.transcriptTerminal) {
      return false;
    }
    const codexHome = this.codexHome;
    if (!codexHome) {
      return false;
    }
    const completion = await this.findTranscriptCompletionForChild(childState, options);
    if (!completion) {
      return false;
    }
    const transcriptParentThreadId = completion.completion.parentThreadId;
    if (transcriptParentThreadId && transcriptParentThreadId !== state.parentThreadId) {
      embeddedAgentLog.warn("Codex native subagent transcript parent did not match monitor state", {
        childThreadId: childState.childThreadId,
        expectedParentThreadId: state.parentThreadId,
        transcriptParentThreadId,
      });
      childState.transcriptPath = undefined;
      this.transcriptPathsByChildThreadId.delete(childState.childThreadId);
      return false;
    }
    await this.processCompletion(state, completion.completion, completion.completion.completedAt);
    return true;
  }

  private async processCompletion(
    state: ParentState,
    completion: CodexNativeSubagentCompletion,
    eventAt: number = Date.now(),
  ): Promise<void> {
    this.finalizeCompletionTask(completion, eventAt);
    const childState = this.childStates.get(completion.childThreadId);
    if (childState) {
      childState.transcriptTerminal = true;
      if (childState.transcriptPollTimer) {
        clearTimeout(childState.transcriptPollTimer);
        childState.transcriptPollTimer = undefined;
      }
      if (childState.noFinalCompletionFallbackTimer) {
        clearTimeout(childState.noFinalCompletionFallbackTimer);
        childState.noFinalCompletionFallbackTimer = undefined;
      }
    }
    const completionKey = buildCompletionDedupeKey(state.parentThreadId, completion);
    if (state.mirroredCompletionKeys.has(completionKey)) {
      return;
    }
    state.mirroredCompletionKeys.add(completionKey);
    this.markCompletionDeliveryNotApplicable(completion);
  }

  private markCompletionDeliveryNotApplicable(completion: CodexNativeSubagentCompletion): void {
    const taskRuntime = this.getTaskRuntimeForChild(completion.childThreadId);
    if (!taskRuntime) {
      return;
    }
    taskRuntime.setDetachedTaskDeliveryStatusByRunId({
      runId: codexNativeSubagentRunId(completion.childThreadId),
      deliveryStatus: "not_applicable",
    });
  }

  private finalizeCompletionTask(completion: CodexNativeSubagentCompletion, eventAt: number): void {
    const taskRuntime = this.getTaskRuntimeForChild(completion.childThreadId);
    if (!taskRuntime) {
      return;
    }
    taskRuntime.finalizeTaskRunByRunId({
      runId: codexNativeSubagentRunId(completion.childThreadId),
      status: completion.status,
      endedAt: eventAt,
      lastEventAt: eventAt,
      ...(completion.status === "succeeded" ? {} : { error: completion.result }),
      progressSummary: completion.result,
      terminalSummary: completion.result,
    });
  }

  private getTaskRuntimeForChild(childThreadId: string): AgentHarnessTaskRuntime | undefined {
    const childState = this.childStates.get(childThreadId.trim());
    const state = childState ? this.parentStates.get(childState.parentThreadId) : undefined;
    return state?.taskRuntime;
  }

  private registerChildThread(
    parentThreadId: string,
    childThreadId: string,
    options: {
      agentPath?: string;
      role?: string;
      objective?: string;
      scheduleTranscriptPoll?: boolean;
    } = {},
  ): void {
    const normalizedParentThreadId = parentThreadId.trim();
    const normalizedChildThreadId = childThreadId.trim();
    if (!normalizedParentThreadId || !normalizedChildThreadId) {
      return;
    }
    this.childThreadParents.set(normalizedChildThreadId, normalizedParentThreadId);
    this.childThreadIdsByAgentPath.set(
      buildParentAgentPathKey(normalizedParentThreadId, normalizedChildThreadId),
      normalizedChildThreadId,
    );
    const agentPath = normalizeOptionalString(options.agentPath);
    if (agentPath) {
      this.childThreadIdsByAgentPath.set(
        buildParentAgentPathKey(normalizedParentThreadId, agentPath),
        normalizedChildThreadId,
      );
    }
    let childState = this.childStates.get(normalizedChildThreadId);
    if (!childState) {
      childState = {
        childThreadId: normalizedChildThreadId,
        parentThreadId: normalizedParentThreadId,
        transcriptPollAttempt: 0,
        transcriptTerminal: false,
      };
      this.childStates.set(normalizedChildThreadId, childState);
    }
    childState.role = options.role ?? childState.role;
    childState.objective = options.objective ?? childState.objective;
    if (options.scheduleTranscriptPoll !== false) {
      this.scheduleTranscriptPoll(childState);
    }
  }

  private resolveChildThreadIdForAgentPath(
    parentThreadId: string,
    agentPath: string,
  ): string | undefined {
    const mapped = this.childThreadIdsByAgentPath.get(
      buildParentAgentPathKey(parentThreadId, agentPath),
    );
    if (mapped) {
      return mapped;
    }
    const exactChild = this.childStates.get(agentPath);
    return exactChild?.parentThreadId === parentThreadId ? exactChild.childThreadId : undefined;
  }

  private scheduleTranscriptPoll(childState: ChildState): void {
    if (!this.codexHome || childState.transcriptTerminal || childState.transcriptPollTimer) {
      return;
    }
    const attempt = childState.transcriptPollAttempt;
    const delayMs =
      this.transcriptPollDelaysMs[Math.min(attempt, this.transcriptPollDelaysMs.length - 1)];
    childState.transcriptPollAttempt += 1;
    childState.transcriptPollTimer = setTimeout(() => {
      childState.transcriptPollTimer = undefined;
      void this.reconcileChildTranscript(childState.childThreadId)
        .catch((error: unknown) => {
          embeddedAgentLog.warn("Failed to reconcile Codex native subagent transcript", {
            childThreadId: childState.childThreadId,
            error: formatErrorMessage(error),
          });
          return false;
        })
        .then((reconciled) => {
          if (!reconciled) {
            this.scheduleTranscriptPoll(childState);
          }
        });
    }, delayMs);
    unrefTimer(childState.transcriptPollTimer);
  }

  private scheduleNoFinalCompletionFallback(
    state: ParentState,
    childState: ChildState,
    completion: CodexNativeSubagentCompletion,
    eventAt: number,
  ): void {
    if (childState.transcriptTerminal || childState.noFinalCompletionFallbackTimer) {
      return;
    }
    const delayMs = noFinalCompletionFallbackDelayMs(this.transcriptPollDelaysMs);
    childState.noFinalCompletionFallbackTimer = setTimeout(() => {
      childState.noFinalCompletionFallbackTimer = undefined;
      void this.deliverNoFinalCompletionFallback(state, childState, completion, eventAt);
    }, delayMs);
    unrefTimer(childState.noFinalCompletionFallbackTimer);
  }

  private async deliverNoFinalCompletionFallback(
    state: ParentState,
    childState: ChildState,
    completion: CodexNativeSubagentCompletion,
    eventAt: number,
  ): Promise<void> {
    const reconciled = await this.reconcileChildTranscript(childState.childThreadId).catch(
      (error: unknown): false => {
        embeddedAgentLog.warn("Failed to reconcile Codex native subagent transcript", {
          childThreadId: childState.childThreadId,
          error: formatErrorMessage(error),
        });
        return false;
      },
    );
    if (!reconciled && !childState.transcriptTerminal) {
      await this.processCompletion(state, completion, eventAt);
    }
  }

  private clearTimers(): void {
    if (this.taskRowReconcileTimer) {
      clearInterval(this.taskRowReconcileTimer);
      this.taskRowReconcileTimer = undefined;
    }
    for (const childState of this.childStates.values()) {
      if (childState.transcriptPollTimer) {
        clearTimeout(childState.transcriptPollTimer);
        childState.transcriptPollTimer = undefined;
      }
      if (childState.noFinalCompletionFallbackTimer) {
        clearTimeout(childState.noFinalCompletionFallbackTimer);
        childState.noFinalCompletionFallbackTimer = undefined;
      }
    }
  }

  private startTaskRowReconciler(intervalMs: number): void {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      return;
    }
    this.taskRowReconcileTimer = setInterval(
      () => {
        void this.reconcileKnownTaskRows().catch((error: unknown) => {
          embeddedAgentLog.warn("Failed to reconcile Codex native subagent task rows", {
            error: formatErrorMessage(error),
          });
        });
      },
      Math.max(1, Math.floor(intervalMs)),
    );
    unrefTimer(this.taskRowReconcileTimer);
  }

  async reconcileKnownTaskRows(): Promise<void> {
    if (!this.codexHome) {
      return;
    }
    for (const state of this.parentStates.values()) {
      await this.reconcileKnownTaskRowsForParent(state);
    }
  }

  private async reconcileExistingRunningTasksForParent(state: ParentState): Promise<void> {
    if (!this.codexHome || !state.taskRuntime) {
      return;
    }
    const tasks = state.taskRuntime.listTaskRecords();
    const candidates: Array<{ childThreadId: string; childState: ChildState }> = [];
    for (const task of tasks) {
      if (!this.shouldReconcileCodexNativeTask(task)) {
        continue;
      }
      if (state.requesterSessionKey && task.requesterSessionKey !== state.requesterSessionKey) {
        continue;
      }
      const childThreadId = task.runId!.slice(CODEX_NATIVE_SUBAGENT_RUN_ID_PREFIX.length).trim();
      if (!childThreadId) {
        continue;
      }
      this.registerChildThread(state.parentThreadId, childThreadId, {
        scheduleTranscriptPoll: false,
      });
      const childState = this.childStates.get(childThreadId);
      if (childState && !childState.transcriptPollTimer) {
        candidates.push({ childThreadId, childState });
      }
    }
    await this.primeTranscriptPathCacheForChildren(candidates.map(({ childState }) => childState));
    for (const { childThreadId, childState } of candidates) {
      const reconciled = await this.reconcileChildTranscript(childThreadId, {
        allowTreeScan: false,
      });
      if (!reconciled) {
        this.scheduleTranscriptPoll(childState);
      }
    }
  }

  private async reconcileKnownTaskRowsForParent(state: ParentState): Promise<void> {
    if (!this.codexHome || !state.taskRuntime) {
      return;
    }
    const tasks = state.taskRuntime.listTaskRecords();
    const candidates: Array<{
      task: AgentHarnessTaskRecord;
      childThreadId: string;
      childState: ChildState;
    }> = [];
    for (const task of tasks) {
      if (!this.shouldReconcileCodexNativeTask(task)) {
        continue;
      }
      const childThreadId = task.runId!.slice(CODEX_NATIVE_SUBAGENT_RUN_ID_PREFIX.length).trim();
      if (!childThreadId) {
        continue;
      }
      this.registerChildThread(state.parentThreadId, childThreadId, {
        scheduleTranscriptPoll: false,
      });
      const childState = this.childStates.get(childThreadId);
      if (!childState || childState.transcriptPollTimer) {
        continue;
      }
      candidates.push({ task, childThreadId, childState });
    }
    await this.primeTranscriptPathCacheForChildren(candidates.map(({ childState }) => childState));
    for (const { task, childThreadId, childState } of candidates) {
      const transcriptCompletion = await this.findTranscriptCompletionForChild(childState, {
        allowTreeScan: false,
      });
      if (!transcriptCompletion) {
        this.scheduleTranscriptPoll(childState);
        continue;
      }
      const parentThreadId =
        transcriptCompletion.completion.parentThreadId ??
        this.childThreadParents.get(childThreadId);
      if (!parentThreadId) {
        embeddedAgentLog.warn("Codex native subagent transcript did not include a parent thread", {
          childThreadId,
          transcriptPath: transcriptCompletion.transcriptPath,
        });
        continue;
      }
      if (parentThreadId !== state.parentThreadId) {
        continue;
      }
      state.agentId = state.agentId ?? task.agentId;
      await this.processCompletion(
        state,
        transcriptCompletion.completion,
        transcriptCompletion.completion.completedAt,
      );
    }
  }

  private shouldReconcileCodexNativeTask(task: AgentHarnessTaskRecord): boolean {
    if (
      task.runtime !== "subagent" ||
      task.taskKind !== "codex-native" ||
      !task.runId?.startsWith(CODEX_NATIVE_SUBAGENT_RUN_ID_PREFIX)
    ) {
      return false;
    }
    if (task.status === "running" || task.status === "queued") {
      return true;
    }
    return (
      (task.deliveryStatus === "not_applicable" || task.deliveryStatus === "pending") &&
      this.isRecentTerminalTask(task)
    );
  }

  private isRecentTerminalTask(task: AgentHarnessTaskRecord): boolean {
    if (
      task.status !== "succeeded" &&
      task.status !== "failed" &&
      task.status !== "timed_out" &&
      task.status !== "cancelled" &&
      task.status !== "lost"
    ) {
      return false;
    }
    const earliestRelevantAt = this.startedAt - RECENT_TERMINAL_TASK_RECONCILE_GRACE_MS;
    return [task.createdAt, task.startedAt, task.endedAt, task.lastEventAt].some(
      (timestamp) => typeof timestamp === "number" && timestamp >= earliestRelevantAt,
    );
  }

  private async primeTranscriptPathCacheForChildren(
    childStates: readonly ChildState[],
  ): Promise<void> {
    const codexHome = this.codexHome;
    if (!codexHome) {
      return;
    }
    const missingChildThreadIds = new Set(
      childStates
        .filter(
          (childState) =>
            !childState.transcriptPath &&
            !this.transcriptPathsByChildThreadId.has(childState.childThreadId),
        )
        .map((childState) => childState.childThreadId),
    );
    if (missingChildThreadIds.size === 0) {
      return;
    }
    const transcriptPaths = await findTranscriptPaths({
      codexHome,
      childThreadIds: missingChildThreadIds,
    });
    for (const [childThreadId, transcriptPath] of transcriptPaths) {
      this.transcriptPathsByChildThreadId.set(childThreadId, transcriptPath);
      const childState = this.childStates.get(childThreadId);
      if (childState) {
        childState.transcriptPath = transcriptPath;
      }
    }
  }

  private async findTranscriptCompletionForChild(
    childState: ChildState,
    options: { allowTreeScan?: boolean } = {},
  ): Promise<{ transcriptPath: string; completion: TranscriptCompletion } | undefined> {
    const codexHome = this.codexHome;
    if (!codexHome) {
      return undefined;
    }
    const transcriptPath =
      childState.transcriptPath ??
      this.transcriptPathsByChildThreadId.get(childState.childThreadId);
    const completion = await findTranscriptCompletion({
      codexHome,
      childThreadId: childState.childThreadId,
      transcriptPath,
      allowTreeScan: options.allowTreeScan ?? true,
    });
    if (completion) {
      childState.transcriptPath = completion.transcriptPath;
      this.transcriptPathsByChildThreadId.set(childState.childThreadId, completion.transcriptPath);
    }
    return completion;
  }
}

function buildCompletionDedupeKey(
  parentThreadId: string,
  completion: CodexNativeSubagentCompletion,
): string {
  const hash = createHash("sha256").update(completion.result).digest("hex").slice(0, 16);
  return `${parentThreadId}:${completion.childThreadId}:${completion.status}:${hash}`;
}

function buildParentAgentPathKey(parentThreadId: string, agentPath: string): string {
  return `${parentThreadId}\0${agentPath}`;
}

function toThreadCompletion(
  completion: CodexNativeSubagentNotificationCompletion,
  childThreadId: string,
): CodexNativeSubagentCompletion {
  return {
    childThreadId,
    status: completion.status,
    statusLabel: completion.statusLabel,
    result: completion.result,
  };
}

function shouldWaitForTranscriptCompletion(
  completion: CodexNativeSubagentCompletion,
  codexHome: string | undefined,
): boolean {
  return Boolean(
    codexHome &&
    completion.status === "succeeded" &&
    completion.statusLabel === "completed_without_final_message",
  );
}

function noFinalCompletionFallbackDelayMs(delays: readonly number[]): number {
  const first = delays[0] ?? 0;
  const second = delays[1] ?? 0;
  return Math.max(1, first + second);
}

function readSpawnParentThreadId(thread: JsonObject | undefined): string | undefined {
  return readCodexSubagentThreadSpawnSourceFromThread(thread)?.parent_thread_id.trim();
}

function readSpawnAgentPath(thread: JsonObject | undefined): string | undefined {
  return readCodexSubagentThreadSpawnSourceFromThread(thread)?.agent_path?.trim();
}

function readString(record: JsonObject | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function readObjectStringKeys(value: JsonValue | undefined): string[] {
  if (!isJsonObject(value)) {
    return [];
  }
  return Object.keys(value).filter((entry) => entry.trim() !== "");
}

function readNativeSpawnFunctionOutputChildThreadId(
  item: JsonObject | undefined,
): string | undefined {
  if (readString(item, "type") !== "function_call_output") {
    return undefined;
  }
  const output = readJsonObjectValue(item?.output);
  return (
    readString(output, "agent_id") ??
    readString(output, "agentId") ??
    readString(output, "thread_id") ??
    readString(output, "threadId")
  )?.trim();
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

function normalizeToolName(value: string | undefined): string | undefined {
  return value?.replace(/[^a-z0-9]/giu, "").toLowerCase();
}

async function findTranscriptCompletion(params: {
  codexHome: string;
  childThreadId: string;
  transcriptPath?: string;
  allowTreeScan?: boolean;
}): Promise<
  | {
      transcriptPath: string;
      completion: TranscriptCompletion;
    }
  | undefined
> {
  const transcriptPath =
    params.transcriptPath ??
    (params.allowTreeScan === false
      ? undefined
      : await findTranscriptPath({
          codexHome: params.codexHome,
          childThreadId: params.childThreadId,
        }));
  if (!transcriptPath) {
    return undefined;
  }
  const completion = await readTranscriptCompletion(transcriptPath, params.childThreadId);
  return completion ? { transcriptPath, completion } : undefined;
}

async function findTranscriptPaths(params: {
  codexHome: string;
  childThreadIds: ReadonlySet<string>;
}): Promise<Map<string, string>> {
  const sessionsDir = path.join(params.codexHome, "sessions");
  const found = new Map<string, string>();
  const stack = [sessionsDir];
  while (stack.length > 0 && found.size < params.childThreadIds.size) {
    const dir = stack.pop()!;
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
        continue;
      }
      for (const childThreadId of params.childThreadIds) {
        if (!found.has(childThreadId) && entry.name.includes(childThreadId)) {
          found.set(childThreadId, entryPath);
        }
      }
    }
  }
  return found;
}

async function findTranscriptPath(params: {
  codexHome: string;
  childThreadId: string;
}): Promise<string | undefined> {
  const sessionsDir = path.join(params.codexHome, "sessions");
  const stack = [sessionsDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (
        entry.isFile() &&
        entry.name.endsWith(".jsonl") &&
        entry.name.includes(params.childThreadId)
      ) {
        return entryPath;
      }
    }
  }
  return undefined;
}

async function readTranscriptCompletion(
  transcriptPath: string,
  childThreadId: string,
): Promise<TranscriptCompletion | undefined> {
  let contents: string;
  try {
    contents = await fs.readFile(transcriptPath, "utf8");
  } catch {
    return undefined;
  }
  let parentThreadId: string | undefined;
  let completion: TranscriptCompletion | undefined;
  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let entry: JsonValue;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!isJsonObject(entry)) {
      continue;
    }
    const payload = isJsonObject(entry.payload) ? entry.payload : undefined;
    if (!payload) {
      continue;
    }
    if (readString(entry, "type") === "session_meta") {
      parentThreadId = readTranscriptParentThreadId(payload) ?? parentThreadId;
      continue;
    }
    if (readString(entry, "type") !== "event_msg") {
      continue;
    }
    const payloadType = readString(payload, "type");
    if (payloadType === "task_complete") {
      const result =
        readString(payload, "last_agent_message")?.trim() || readString(payload, "message")?.trim();
      completion = {
        childThreadId,
        parentThreadId,
        status: "succeeded",
        statusLabel: result ? "task_complete" : "completed_without_final_message",
        result: result ?? "Codex native subagent completed without a final assistant message.",
        completedAt: secondsToMillis(readNumber(payload, "completed_at")) ?? readTimestamp(entry),
      };
    } else if (payloadType === "task_failed") {
      const result =
        readString(payload, "last_agent_message")?.trim() ||
        readString(payload, "error")?.trim() ||
        readString(payload, "message")?.trim() ||
        "Codex native subagent failed.";
      completion = {
        childThreadId,
        parentThreadId,
        status: "failed",
        statusLabel: "task_failed",
        result,
        completedAt: readTimestamp(entry),
      };
    }
  }
  return completion;
}

function readTranscriptParentThreadId(payload: JsonObject): string | undefined {
  const source = isJsonObject(payload.source) ? payload.source : undefined;
  const subagent =
    (isJsonObject(source?.subagent) ? source.subagent : undefined) ??
    (isJsonObject(source?.subAgent) ? source.subAgent : undefined);
  const spawn = isJsonObject(subagent?.thread_spawn) ? subagent.thread_spawn : undefined;
  return readString(spawn, "parent_thread_id")?.trim();
}

function readNumber(record: JsonObject, key: string): number | undefined {
  return asFiniteNumber(record[key]);
}

function secondsToMillis(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value * 1000);
}

function readTimestamp(entry: JsonObject): number | undefined {
  const timestamp = readString(entry, "timestamp");
  if (!timestamp) {
    return undefined;
  }
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  if (typeof timer === "object" && timer && "unref" in timer) {
    (timer as { unref: () => void }).unref();
  }
}
