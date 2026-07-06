/**
 * task built-in tool.
 *
 * Foreground subagent delegation facade. It launches a native subagent child,
 * waits for the child run, and returns either small child output or native
 * child transcript pointers as a normal parent-visible tool result. This keeps
 * manager-style orchestration out of raw sessions_spawn/sessions_yield
 * lifecycle mechanics without forcing substantial child artifacts back into the
 * parent prompt.
 */
import { Type } from "typebox";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import {
  computeChildResultContentDigest,
  includesChildResultTruncationMarker,
} from "../child-result-metadata.js";
import { readLatestAssistantReply, waitForAgentRun, type AgentWaitResult } from "../run-wait.js";
import type { SpawnedToolContext } from "../spawned-context.js";
import { spawnSubagentDirect } from "../subagent-spawn.js";
import { normalizeSubagentTaskName } from "../subagent-task-name.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, textResult } from "./common.js";

const TASK_WAIT_POLL_MS = 60_000;
const TASK_RESULT_PARENT_INLINE_MAX_CHARS = 1_800;
const TASK_RESULT_PARENT_PREVIEW_MAX_CHARS = 0;
const DEFAULT_LIGHT_CONTEXT_AGENT_IDS = new Set([
  "codebase-researcher",
  "docs-standards-researcher",
  "researcher",
  "reviewer",
  "web-researcher",
  "x-researcher",
]);

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
  thinking: Type.Optional(
    Type.String({
      description:
        "Optional explicit child thinking override. Omit by default so the target agent's role profile controls reasoning level; set only when intentionally overriding that profile for this task.",
    }),
  ),
  cwd: Type.Optional(Type.String()),
  lightContext: Type.Optional(
    Type.Boolean({
      description:
        "Use lightweight bootstrap context for bounded children that need their role contract but not root workspace memory/context.",
    }),
  ),
});

function escapeXmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeXmlAttr(value: string): string {
  return escapeXmlText(value).replaceAll('"', "&quot;");
}

function formatTaskResult(params: {
  childSessionKey: string;
  childSessionId?: string;
  runId: string;
  agentId: string;
  taskName?: string;
  replyText: string;
  contentDigest: string;
  contentChars: number;
  contentTruncated: boolean;
  inlineResult: boolean;
  inspectCommand: string;
  previewText?: string;
  previewChars?: number;
  recoveryHistory?: Array<{ source: string; status: string; error?: string }>;
}): string {
  const taskNameAttr = params.taskName ? ` taskName="${escapeXmlAttr(params.taskName)}"` : "";
  const childSessionIdAttr = params.childSessionId
    ? ` childSessionId="${escapeXmlAttr(params.childSessionId)}"`
    : "";
  const openTag = `<task id="${escapeXmlAttr(params.childSessionKey)}" runId="${escapeXmlAttr(
    params.runId,
  )}" agentId="${escapeXmlAttr(
    params.agentId,
  )}"${childSessionIdAttr}${taskNameAttr} state="completed" contentDigest="${escapeXmlAttr(
    params.contentDigest,
  )}" contentChars="${params.contentChars}" contentTruncated="${
    params.contentTruncated
  }" resultInline="${params.inlineResult}" previewOnly="${!params.inlineResult}" previewChars="${
    params.previewChars ?? 0
  }">`;
  if (!params.inlineResult) {
    return [
      openTag,
      `  <task_result_ref kind="session" ref="${escapeXmlAttr(params.childSessionKey)}" />`,
      `  <task_result_ref kind="transcript_final" ref="${escapeXmlAttr(
        `openclaw-session:${params.childSessionKey}:latest-assistant`,
      )}" />`,
      `  <task_result_inspect>${escapeXmlText(params.inspectCommand)}</task_result_inspect>`,
      "  <task_result_status>",
      "child task completed; full result remains in the child session transcript",
      "  </task_result_status>",
      ...(params.previewText
        ? [
            '  <task_result_preview previewOnly="true">',
            escapeXmlText(params.previewText.trim()),
            "  </task_result_preview>",
          ]
        : []),
      ...formatTaskRecoveryHistory(params.recoveryHistory),
      "</task>",
    ].join("\n");
  }
  return [
    openTag,
    "  <task_result>",
    escapeXmlText(params.replyText.trim()),
    "  </task_result>",
    ...formatTaskRecoveryHistory(params.recoveryHistory),
    "</task>",
  ].join("\n");
}

function shouldInlineTaskResultForParent(replyText: string): boolean {
  return (
    replyText.length <= TASK_RESULT_PARENT_INLINE_MAX_CHARS &&
    !includesChildResultTruncationMarker(replyText)
  );
}

function buildTaskResultInspectCommand(params: {
  childSessionKey: string;
  agentId: string;
}): string {
  return `openclaw sessions show ${params.childSessionKey} --agent ${params.agentId}`;
}

function buildTaskResultPreview(replyText: string, inlineResult: boolean): string | undefined {
  if (inlineResult) {
    return undefined;
  }
  if (TASK_RESULT_PARENT_PREVIEW_MAX_CHARS <= 0) {
    return undefined;
  }
  const trimmed = replyText.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, TASK_RESULT_PARENT_PREVIEW_MAX_CHARS);
}

async function waitForForegroundTaskResult(params: {
  runId: string;
  sessionKey: string;
  signal?: AbortSignal;
  onProgress?: () => void;
}): Promise<
  AgentWaitResult & {
    replyText?: string;
    recoveryHistory?: Array<{
      source: "task_wait";
      status: AgentWaitResult["status"];
      error?: string;
    }>;
  }
> {
  while (params.signal?.aborted !== true) {
    params.onProgress?.();
    const wait = await waitForAgentRun({
      runId: params.runId,
      timeoutMs: TASK_WAIT_POLL_MS,
    });
    params.onProgress?.();
    if (wait.status === "ok") {
      return {
        status: "ok",
        replyText: await readLatestAssistantReply({
          sessionKey: params.sessionKey,
        }),
      };
    }
    if (wait.status === "error") {
      const replyText = await readLatestAssistantReply({
        sessionKey: params.sessionKey,
      });
      if (replyText?.trim()) {
        return {
          status: "ok",
          replyText,
          recoveryHistory: [
            {
              source: "task_wait",
              status: wait.status,
              ...(wait.error ? { error: wait.error } : {}),
            },
          ],
        };
      }
      return {
        ...wait,
        replyText,
      };
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
  partialReplyText?: string;
  contentDigest?: string;
  contentChars?: number;
  contentTruncated?: boolean;
}): string {
  const id = params.childSessionKey ?? params.runId ?? params.agentId;
  const runIdAttr = params.runId ? ` runId="${escapeXmlAttr(params.runId)}"` : "";
  const taskNameAttr = params.taskName ? ` taskName="${escapeXmlAttr(params.taskName)}"` : "";
  const evidenceAttrs = `${params.contentDigest ? ` contentDigest="${escapeXmlAttr(params.contentDigest)}"` : ""}${
    params.contentChars !== undefined ? ` contentChars="${params.contentChars}"` : ""
  }${params.contentTruncated !== undefined ? ` contentTruncated="${params.contentTruncated}"` : ""}`;
  const partialReplyText = params.partialReplyText?.trim();
  const lines = [
    `<task id="${escapeXmlAttr(id)}"${runIdAttr} agentId="${escapeXmlAttr(
      params.agentId,
    )}"${taskNameAttr} state="${params.state}"${evidenceAttrs}>`,
    "  <task_error>",
    escapeXmlText(params.error.trim() || "child task failed"),
    "  </task_error>",
  ];
  if (partialReplyText) {
    lines.push("  <partial_task_result>");
    lines.push(escapeXmlText(partialReplyText));
    lines.push("  </partial_task_result>");
  }
  lines.push("</task>");
  return lines.join("\n");
}

function formatTaskRecoveryHistory(
  recoveryHistory: Array<{ source: string; status: string; error?: string }> | undefined,
): string[] {
  if (!recoveryHistory?.length) {
    return [];
  }
  const lines = ["  <task_recovery_history>"];
  for (const entry of recoveryHistory) {
    const errorAttr = entry.error ? ` error="${escapeXmlAttr(entry.error)}"` : "";
    lines.push(
      `    <recovery source="${escapeXmlAttr(entry.source)}" status="${escapeXmlAttr(
        entry.status,
      )}"${errorAttr} />`,
    );
  }
  lines.push("  </task_recovery_history>");
  return lines;
}

function resolveTaskToolLightContext(agentId: string, value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  return DEFAULT_LIGHT_CONTEXT_AGENT_IDS.has(agentId);
}

export function createTaskTool(
  opts?: {
    agentSessionKey?: string;
    parentRunId?: string;
    agentChannel?: GatewayMessageChannel;
    agentAccountId?: string;
    agentTo?: string;
    agentThreadId?: string | number;
    config?: OpenClawConfig;
    requesterAgentIdOverride?: string;
    workspaceDir?: string;
    onProgress?: () => void;
  } & SpawnedToolContext,
): AnyAgentTool {
  return {
    label: "Task",
    name: "task",
    description:
      "Run one target OpenClaw subagent as a foreground child task and return a small final result or exact native result pointers here. Use for source scouts, reviewers, and other bounded specialist work when you own final synthesis. Do not use sessions_yield after task.",
    promptGuidelines: [
      "When multiple independent child tasks are useful, call `task` multiple times in the same assistant turn so the runtime can execute them in parallel.",
      "Use one `task` call per independent specialist; do not pack unrelated work into one child prompt just to avoid multiple calls.",
      "For narrow source-scout or reviewer packets that do not need root workspace memory or parent transcript, set `lightContext: true` and include the needed objective/output instructions in the child task.",
      "Do not set `thinking` unless you intentionally need to override the target agent's role profile for this specific task; ordinary specialist tasks should omit it.",
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
      const lightContext = resolveTaskToolLightContext(agentId, params.lightContext);

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
          lightContext,
          expectsCompletionMessage: false,
        },
        {
          agentSessionKey: opts?.agentSessionKey,
          parentRunId: opts?.parentRunId,
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
        return textResult(text, {
          status: spawn.status,
          error: spawn.error ?? `child task was not accepted: ${spawn.status}`,
          childResult: true,
          childSessionKey: spawn.childSessionKey,
          runId: spawn.runId,
          agentId,
          taskName,
        });
      }

      opts?.onProgress?.();
      const wait = await waitForForegroundTaskResult({
        runId: spawn.runId,
        sessionKey: spawn.childSessionKey,
        signal,
        onProgress: opts?.onProgress,
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
          partialReplyText: wait.replyText,
          ...(wait.replyText?.trim()
            ? {
                contentDigest: computeChildResultContentDigest(wait.replyText.trim()),
                contentChars: wait.replyText.trim().length,
                contentTruncated: includesChildResultTruncationMarker(wait.replyText),
              }
            : {}),
        });
        const partialResultTruncated = wait.replyText?.trim()
          ? includesChildResultTruncationMarker(wait.replyText)
          : undefined;
        return textResult(text, {
          status: "error",
          error,
          childResult: true,
          childSessionKey: spawn.childSessionKey,
          runId: spawn.runId,
          agentId,
          taskName,
          producerAgentId: agentId,
          ownerAgentId: opts?.requesterAgentIdOverride,
          ...(wait.replyText?.trim()
            ? {
                partialResultChars: wait.replyText.trim().length,
                partialResultTruncated,
                contentDigest: computeChildResultContentDigest(wait.replyText.trim()),
                contentChars: wait.replyText.trim().length,
                contentTruncated: partialResultTruncated,
              }
            : {}),
        });
      }

      const replyText = wait.replyText.trim();
      const contentDigest = computeChildResultContentDigest(replyText);
      const contentTruncated = includesChildResultTruncationMarker(replyText);
      const inlineResult = shouldInlineTaskResultForParent(replyText);
      const resultRef = `openclaw-session:${spawn.childSessionKey}`;
      const transcriptFinalRef = `openclaw-session:${spawn.childSessionKey}:latest-assistant`;
      const inspectCommand = buildTaskResultInspectCommand({
        childSessionKey: spawn.childSessionKey,
        agentId,
      });
      const previewText = buildTaskResultPreview(replyText, inlineResult);
      const text = formatTaskResult({
        childSessionKey: spawn.childSessionKey,
        childSessionId: spawn.childSessionId,
        runId: spawn.runId,
        agentId,
        taskName,
        replyText,
        contentDigest,
        contentChars: replyText.length,
        contentTruncated,
        inlineResult,
        inspectCommand,
        previewText,
        previewChars: previewText?.length ?? 0,
        recoveryHistory: wait.recoveryHistory,
      });
      return textResult(text, {
        status: "ok",
        childResult: true,
        childSessionKey: spawn.childSessionKey,
        ...(spawn.childSessionId ? { childSessionId: spawn.childSessionId } : {}),
        runId: spawn.runId,
        agentId,
        taskName,
        producerAgentId: agentId,
        ownerAgentId: opts?.requesterAgentIdOverride,
        sourceSessionKey: spawn.childSessionKey,
        sourceRunId: spawn.runId,
        contentDigest,
        contentChars: replyText.length,
        contentTruncated,
        resultChars: replyText.length,
        resultTruncated: contentTruncated,
        resultInline: inlineResult,
        resultMode: inlineResult ? "inline" : "pointer",
        resultRef,
        transcriptFinalRef,
        inspectCommand,
        previewOnly: !inlineResult,
        previewChars: previewText?.length ?? 0,
        displayTruncated: !inlineResult,
        parentInlineLimitChars: TASK_RESULT_PARENT_INLINE_MAX_CHARS,
        parentPreviewLimitChars: TASK_RESULT_PARENT_PREVIEW_MAX_CHARS,
        ...(wait.recoveryHistory?.length ? { recoveryHistory: wait.recoveryHistory } : {}),
        resolvedModel: spawn.resolvedModel,
        resolvedProvider: spawn.resolvedProvider,
      });
    },
  };
}
