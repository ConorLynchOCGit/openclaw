/**
 * task built-in tool.
 *
 * Foreground subagent delegation facade. It launches a native subagent child,
 * waits for the child run, and returns the child assistant output as a normal
 * parent-visible tool result. This keeps manager-style orchestration out of
 * raw sessions_spawn/sessions_yield lifecycle mechanics.
 */
import { Type } from "typebox";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import { readLatestAssistantReply, waitForAgentRun, type AgentWaitResult } from "../run-wait.js";
import type { SpawnedToolContext } from "../spawned-context.js";
import { spawnSubagentDirect } from "../subagent-spawn.js";
import { normalizeSubagentTaskName } from "../subagent-task-name.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, textResult } from "./common.js";

const TASK_WAIT_POLL_MS = 60_000;
const TASK_CHILD_REPLY_MAX_CHARS = 28_000;
const TASK_RESULT_PREVIEW_CHARS = 1_000;

const TaskToolSchema = Type.Object({
  agentId: Type.String({
    description: "Target OpenClaw agent id. Required.",
  }),
  task: Type.String({
    description:
      "Detailed child task prompt. Ask for decision material, not a final plan unless that is the child role.",
  }),
  taskName: Type.Optional(
    Type.String({
      description:
        "Stable alias for later targeting; lowercase letters/digits/underscores/hyphens, starts letter.",
    }),
  ),
  label: Type.Optional(Type.String()),
  context: Type.Optional(
    Type.Union([Type.Literal("isolated"), Type.Literal("fork")], {
      description:
        'Native context. Omit/"isolated" for clean child; "fork" only when the child needs requester transcript.',
    }),
  ),
  thinking: Type.Optional(Type.String()),
  cwd: Type.Optional(Type.String()),
});

function escapeXmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function formatTaskResult(params: {
  childSessionKey: string;
  runId: string;
  agentId: string;
  taskName?: string;
  replyText: string;
}): string {
  const taskNameAttr = params.taskName ? ` taskName="${escapeXmlText(params.taskName)}"` : "";
  return [
    `<task id="${escapeXmlText(params.childSessionKey)}" runId="${escapeXmlText(
      params.runId,
    )}" agentId="${escapeXmlText(params.agentId)}"${taskNameAttr} state="completed">`,
    "  <summary>child task completed</summary>",
    "  <task_result>",
    escapeXmlText(params.replyText.trim()),
    "  </task_result>",
    "</task>",
  ].join("\n");
}

function previewText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= TASK_RESULT_PREVIEW_CHARS) {
    return trimmed;
  }
  return `${trimmed.slice(0, TASK_RESULT_PREVIEW_CHARS).trimEnd()}\n...(preview truncated)...`;
}

async function waitForForegroundTaskResult(params: {
  runId: string;
  sessionKey: string;
  signal?: AbortSignal;
}): Promise<AgentWaitResult & { replyText?: string }> {
  while (params.signal?.aborted !== true) {
    const wait = await waitForAgentRun({
      runId: params.runId,
      timeoutMs: TASK_WAIT_POLL_MS,
    });
    if (wait.status === "ok") {
      return {
        status: "ok",
        replyText: await readLatestAssistantReply({
          sessionKey: params.sessionKey,
          maxChars: TASK_CHILD_REPLY_MAX_CHARS,
        }),
      };
    }
    if (wait.status === "error") {
      return wait;
    }
    // `timeout` and `pending` are wait-RPC states, not child task failure.
    // The child run's native liveness/timeout policy owns termination.
  }
  return {
    status: "error",
    error: "task wait cancelled",
  };
}

function formatTaskError(params: {
  state: "error" | "timeout";
  childSessionKey?: string;
  runId?: string;
  agentId: string;
  taskName?: string;
  error: string;
}): string {
  const id = params.childSessionKey ?? params.runId ?? params.agentId;
  const runIdAttr = params.runId ? ` runId="${escapeXmlText(params.runId)}"` : "";
  const taskNameAttr = params.taskName ? ` taskName="${escapeXmlText(params.taskName)}"` : "";
  return [
    `<task id="${escapeXmlText(id)}"${runIdAttr} agentId="${escapeXmlText(
      params.agentId,
    )}"${taskNameAttr} state="${params.state}">`,
    "  <task_error>",
    escapeXmlText(params.error.trim() || "child task failed"),
    "  </task_error>",
    "</task>",
  ].join("\n");
}

export function createTaskTool(
  opts?: {
    agentSessionKey?: string;
    agentChannel?: GatewayMessageChannel;
    agentAccountId?: string;
    agentTo?: string;
    agentThreadId?: string | number;
    config?: OpenClawConfig;
    requesterAgentIdOverride?: string;
    workspaceDir?: string;
  } & SpawnedToolContext,
): AnyAgentTool {
  return {
    label: "Task",
    name: "task",
    description:
      "Run one target OpenClaw subagent as a foreground child task and return its final result here. Use for source scouts, reviewers, and other bounded specialist work when you own final synthesis. Do not use sessions_yield after task.",
    promptGuidelines: [
      "When multiple independent child tasks are useful, call `task` multiple times in the same assistant turn so the runtime can execute them in parallel.",
      "Use one `task` call per independent specialist; do not pack unrelated work into one child prompt just to avoid multiple calls.",
    ],
    executionMode: "parallel",
    parameters: TaskToolSchema,
    execute: async (_toolCallId, args, signal) => {
      const params = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
      const agentId = readStringParam(params, "agentId", { required: true });
      const task = readStringParam(params, "task", { required: true });
      const label = readStringParam(params, "label");
      const taskNameResult = normalizeSubagentTaskName(params.taskName);
      if (taskNameResult.error) {
        return jsonResult({
          status: "error",
          error: taskNameResult.error,
        });
      }
      const taskName = taskNameResult.taskName;
      const context =
        params.context === "fork" || params.context === "isolated" ? params.context : undefined;

      const spawn = await spawnSubagentDirect(
        {
          task,
          taskName,
          label,
          agentId,
          thinking: readStringParam(params, "thinking"),
          cwd: readStringParam(params, "cwd"),
          mode: "run",
          cleanup: "keep",
          sandbox: "inherit",
          context,
          expectsCompletionMessage: false,
        },
        {
          agentSessionKey: opts?.agentSessionKey,
          completionOwnerKey: opts?.agentSessionKey,
          agentChannel: opts?.agentChannel,
          agentAccountId: opts?.agentAccountId,
          agentTo: opts?.agentTo,
          agentThreadId: opts?.agentThreadId,
          agentGroupId: opts?.agentGroupId,
          agentGroupChannel: opts?.agentGroupChannel,
          agentGroupSpace: opts?.agentGroupSpace,
          agentMemberRoleIds: opts?.agentMemberRoleIds,
          requesterAgentIdOverride: opts?.requesterAgentIdOverride,
          workspaceDir: opts?.workspaceDir,
          inheritedToolDenylist: opts?.inheritedToolDenylist,
        },
      );

      if (spawn.status !== "accepted" || !spawn.childSessionKey || !spawn.runId) {
        const text = formatTaskError({
          state: "error",
          childSessionKey: spawn.childSessionKey,
          runId: spawn.runId,
          agentId,
          taskName,
          error: spawn.error ?? `child task was not accepted: ${spawn.status}`,
        });
        return jsonResult({
          status: spawn.status,
          error: spawn.error ?? `child task was not accepted: ${spawn.status}`,
          childSessionKey: spawn.childSessionKey,
          runId: spawn.runId,
          agentId,
          taskName,
          text,
        });
      }

      const wait = await waitForForegroundTaskResult({
        runId: spawn.runId,
        sessionKey: spawn.childSessionKey,
        signal,
      });
      if (wait.status !== "ok" || !wait.replyText?.trim()) {
        const error =
          wait.error ??
          (wait.status === "timeout" || wait.status === "pending"
            ? "child task wait ended before the child reached a terminal result"
            : "child task produced no assistant result");
        const text = formatTaskError({
          state: "error",
          childSessionKey: spawn.childSessionKey,
          runId: spawn.runId,
          agentId,
          taskName,
          error,
        });
        return jsonResult({
          status: "error",
          error,
          childSessionKey: spawn.childSessionKey,
          runId: spawn.runId,
          agentId,
          taskName,
          text,
        });
      }

      const text = formatTaskResult({
        childSessionKey: spawn.childSessionKey,
        runId: spawn.runId,
        agentId,
        taskName,
        replyText: wait.replyText,
      });
      return textResult(text, {
        status: "ok",
        childSessionKey: spawn.childSessionKey,
        runId: spawn.runId,
        agentId,
        taskName,
        resultPreview: previewText(wait.replyText),
        resultChars: wait.replyText.trim().length,
        resultTruncated: wait.replyText.includes("...(truncated)..."),
        resolvedModel: spawn.resolvedModel,
        resolvedProvider: spawn.resolvedProvider,
      });
    },
  };
}
