import { randomUUID } from "node:crypto";
import type { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { ThinkLevel } from "../../auto-reply/thinking.js";
import { resolveStorePath } from "../../config/sessions/paths.js";
import { loadSessionStore, updateSessionStore } from "../../config/sessions/store.js";
import { resolveSessionTranscriptFile } from "../../config/sessions/transcript.js";
import { mergeSessionEntry, type SessionSystemPromptReport } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { formatErrorMessage } from "../../infra/errors.js";
import type { CommandQueueEnqueueFn } from "../../process/command-queue.types.js";
import { normalizeOptionalString } from "../../shared/string-coerce.js";
import { resolveAgentConfig } from "../agent-scope.js";
import type { AgentInternalEvent } from "../internal-events.js";
import { AGENT_LANE_SUBAGENT } from "../lanes.js";
import type { ToolResultFormat } from "../pi-embedded-subscribe.shared-types.js";
import { resolveSubagentModelAndThinkingPlan, splitModelRef } from "../subagent-spawn-plan.js";
import type { RequiredProviderContextAdmission } from "../system-prompt-report.js";

const DEFAULT_NATIVE_CHILD_TASK_TIMEOUT_MS = 120_000;
const DEFAULT_CHILD_SESSION_START_LOCK_TIMEOUT_MS = 10_000;
const MIN_CHILD_SESSION_START_LOCK_TIMEOUT_MS = 1_000;

export type NativeChildSessionAgentRunParams = {
  sessionId: string;
  sessionKey?: string;
  agentId?: string;
  trigger?: "manual";
  spawnedBy?: string | null;
  parentToolCallId?: string | null;
  nodeRunId?: string | null;
  messageChannel?: string;
  messageProvider?: string;
  agentAccountId?: string;
  messageTo?: string;
  messageThreadId?: string | number;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  senderIsOwner?: boolean;
  sessionFile: string;
  workspaceDir: string;
  agentDir?: string;
  config?: OpenClawConfig;
  authStorage?: AuthStorage;
  modelRegistry?: ModelRegistry;
  prompt: string;
  provider?: string;
  model?: string;
  thinkLevel?: ThinkLevel;
  toolResultFormat?: ToolResultFormat;
  disableMessageTool?: boolean;
  requireExplicitMessageTarget?: boolean;
  allowGatewaySubagentBinding?: boolean;
  runtimePluginIds?: string[];
  modelsJsonPolicy?: "refresh" | "reuse-existing";
  requiredProviderContextAdmission?: RequiredProviderContextAdmission;
  timeoutMs: number;
  runId: string;
  lane?: string;
  enqueue?: CommandQueueEnqueueFn;
  abortSignal?: AbortSignal;
  onAgentEvent?: (evt: { stream: string; data: Record<string, unknown> }) => void;
  suppressToolErrorWarnings?: boolean;
  internalEvents?: AgentInternalEvent[];
};

export type NativeChildSessionAgentRunResult = {
  payloads?: Array<{ text?: string }>;
  meta: {
    systemPromptReport?: SessionSystemPromptReport;
    finalAssistantVisibleText?: string;
    error?: { message: string };
  };
};

export type NativeChildSessionRunAgent = (
  params: NativeChildSessionAgentRunParams,
) => Promise<NativeChildSessionAgentRunResult>;

export type NativeChildSessionParentContext = {
  sessionKey?: string;
  runId: string;
  nodeRunId?: string | null;
  messageChannel?: string;
  messageProvider?: string;
  agentAccountId?: string;
  messageTo?: string;
  messageThreadId?: string | number;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  senderIsOwner?: boolean;
  agentDir?: string;
  config?: OpenClawConfig;
  authStorage?: AuthStorage;
  modelRegistry?: ModelRegistry;
  toolResultFormat?: ToolResultFormat;
  enqueue?: CommandQueueEnqueueFn;
  abortSignal?: AbortSignal;
  onAgentEvent?: (evt: { stream: string; data: Record<string, unknown> }) => void;
  suppressToolErrorWarnings?: boolean;
};

export type NativeRunChildSessionParams = {
  parentSessionKey?: string;
  parentToolCallId: string;
  childAgentId: string;
  task: string;
  label?: string;
  runTimeoutSeconds?: number;
  requiredProviderContextAdmission?: RequiredProviderContextAdmission;
};

export type NativeChildSessionFailureKind =
  | "provider_model_failure"
  | "session_lock_failed"
  | "run_error";

export type NativeChildSessionResult = {
  status: "completed" | "error";
  childSessionKey: string;
  childSessionId: string;
  runId: string;
  startedAt: number;
  endedAt: number;
  error?: string;
  failureKind?: NativeChildSessionFailureKind;
  resultText?: string;
  providerContextReport?: SessionSystemPromptReport;
};

export type NativeRunChildSession = (
  params: NativeRunChildSessionParams,
) => Promise<NativeChildSessionResult>;

function resolveChildTaskTimeoutMs(runTimeoutSeconds?: number): number {
  if (typeof runTimeoutSeconds !== "number" || !Number.isFinite(runTimeoutSeconds)) {
    return DEFAULT_NATIVE_CHILD_TASK_TIMEOUT_MS;
  }
  const seconds = Math.max(0, Math.trunc(runTimeoutSeconds));
  return seconds === 0 ? 0 : seconds * 1000;
}

function resolveChildSessionStartLockTimeoutMs(childTaskTimeoutMs: number): number {
  if (!Number.isFinite(childTaskTimeoutMs) || childTaskTimeoutMs <= 0) {
    return DEFAULT_CHILD_SESSION_START_LOCK_TIMEOUT_MS;
  }
  return Math.max(
    MIN_CHILD_SESSION_START_LOCK_TIMEOUT_MS,
    Math.min(DEFAULT_CHILD_SESSION_START_LOCK_TIMEOUT_MS, Math.trunc(childTaskTimeoutMs)),
  );
}

function childTaskPrompt(params: { childAgentId: string; task: string; label?: string }): string {
  return [
    `[Subagent Context] You are running as ${params.childAgentId} for a native OpenClaw task delegation. Return bounded results to the parent; do not call node_finish.`,
    params.label ? `[Subagent Label]: ${params.label}` : null,
    `[Subagent Task]: ${params.task}`,
  ]
    .filter((line): line is string => typeof line === "string" && line.length > 0)
    .join("\n\n");
}

function visibleTextFromEmbeddedChildResult(
  result: NativeChildSessionAgentRunResult,
): string | undefined {
  const finalText = normalizeOptionalString(result.meta.finalAssistantVisibleText);
  if (finalText) {
    return finalText;
  }
  const payloadText = (result.payloads ?? [])
    .map((payload) => normalizeOptionalString(payload.text))
    .filter((text): text is string => Boolean(text))
    .join("\n\n")
    .trim();
  return payloadText || undefined;
}

export function createNativeRunChildSession(params: {
  parentContext: NativeChildSessionParentContext;
  resolvedWorkspace: string;
  runAgent: NativeChildSessionRunAgent;
}): NativeRunChildSession {
  return async (taskParams) => {
    const startedAt = Date.now();
    const childAgentId = taskParams.childAgentId.trim();
    const childSessionKey = `agent:${childAgentId}:subagent:${randomUUID()}`;
    const childSessionId = `native_task_${randomUUID()}`;
    const childRunId = randomUUID();
    const childTaskTimeoutMs = resolveChildTaskTimeoutMs(taskParams.runTimeoutSeconds);
    const childSessionStartLockTimeoutMs =
      resolveChildSessionStartLockTimeoutMs(childTaskTimeoutMs);
    const parentSessionKey =
      taskParams.parentSessionKey?.trim() || params.parentContext.sessionKey?.trim() || undefined;
    const storePath = resolveStorePath(params.parentContext.config?.session?.store, {
      agentId: childAgentId,
    });
    try {
      await updateSessionStore(
        storePath,
        (store) => {
          store[childSessionKey] = mergeSessionEntry(store[childSessionKey], {
            sessionId: childSessionId,
            updatedAt: Date.now(),
            ...(parentSessionKey ? { spawnedBy: parentSessionKey } : {}),
          });
        },
        {
          lockTimeoutMs: childSessionStartLockTimeoutMs,
          lockStaleMs: childSessionStartLockTimeoutMs,
        },
      );
      const childStore = loadSessionStore(storePath, { skipCache: true });
      const childEntry = childStore[childSessionKey];
      const { sessionFile } = await resolveSessionTranscriptFile({
        sessionId: childSessionId,
        sessionKey: childSessionKey,
        sessionEntry: childEntry,
        sessionStore: childStore,
        storePath,
        agentId: childAgentId,
      });
      const childConfig = params.parentContext.config;
      const childAgentConfig = childConfig ? resolveAgentConfig(childConfig, childAgentId) : null;
      const childPlan = childConfig
        ? resolveSubagentModelAndThinkingPlan({
            cfg: childConfig,
            targetAgentId: childAgentId,
            targetAgentConfig: childAgentConfig,
          })
        : null;
      if (childPlan?.status === "error") {
        return {
          status: "error",
          childSessionKey,
          childSessionId,
          runId: childRunId,
          startedAt,
          endedAt: Date.now(),
          error: childPlan.error,
          failureKind: "provider_model_failure",
        };
      }
      const { provider, model } = splitModelRef(childPlan?.resolvedModel);
      const childRun = await params.runAgent({
        sessionId: childSessionId,
        sessionKey: childSessionKey,
        agentId: childAgentId,
        trigger: "manual",
        spawnedBy: parentSessionKey,
        parentToolCallId: taskParams.parentToolCallId,
        nodeRunId: params.parentContext.nodeRunId ?? params.parentContext.runId,
        messageChannel: params.parentContext.messageChannel ?? params.parentContext.messageProvider,
        agentAccountId: params.parentContext.agentAccountId,
        messageTo: params.parentContext.messageTo,
        messageThreadId: params.parentContext.messageThreadId,
        groupId: params.parentContext.groupId,
        groupChannel: params.parentContext.groupChannel,
        groupSpace: params.parentContext.groupSpace,
        senderIsOwner: params.parentContext.senderIsOwner,
        sessionFile,
        workspaceDir: params.resolvedWorkspace,
        agentDir: params.parentContext.agentDir,
        config: params.parentContext.config,
        authStorage: params.parentContext.authStorage,
        modelRegistry: params.parentContext.modelRegistry,
        prompt: childTaskPrompt({
          childAgentId,
          task: taskParams.task,
          label: taskParams.label,
        }),
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
        ...(childPlan?.thinkingOverride ? { thinkLevel: childPlan.thinkingOverride } : {}),
        toolResultFormat: params.parentContext.toolResultFormat,
        disableMessageTool: true,
        requireExplicitMessageTarget: true,
        allowGatewaySubagentBinding: false,
        runtimePluginIds: [],
        modelsJsonPolicy: "reuse-existing",
        requiredProviderContextAdmission: taskParams.requiredProviderContextAdmission,
        timeoutMs: childTaskTimeoutMs,
        runId: childRunId,
        lane: AGENT_LANE_SUBAGENT,
        enqueue: params.parentContext.enqueue,
        abortSignal: params.parentContext.abortSignal,
        onAgentEvent: params.parentContext.onAgentEvent,
        suppressToolErrorWarnings: params.parentContext.suppressToolErrorWarnings,
      });
      const resultText = visibleTextFromEmbeddedChildResult(childRun);
      const runFailure = childRun.meta.error?.message ? "run_error" : undefined;
      return {
        status: runFailure ? "error" : "completed",
        childSessionKey,
        childSessionId,
        runId: childRunId,
        startedAt,
        endedAt: Date.now(),
        ...(childRun.meta.error?.message ? { error: childRun.meta.error.message } : {}),
        ...(runFailure ? { failureKind: runFailure } : {}),
        ...(resultText ? { resultText } : {}),
        ...(childRun.meta.systemPromptReport
          ? { providerContextReport: childRun.meta.systemPromptReport }
          : {}),
      };
    } catch (err) {
      const error = formatErrorMessage(err);
      return {
        status: "error",
        childSessionKey,
        childSessionId,
        runId: childRunId,
        startedAt,
        endedAt: Date.now(),
        error,
        failureKind: error.toLowerCase().includes("lock") ? "session_lock_failed" : "run_error",
      };
    }
  };
}
