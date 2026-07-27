/**
 * Foreground OpenClaw role delegation.
 *
 * This is intentionally a facade over the native subagent lifecycle. It owns
 * no sessions, worktrees, cancellation state, or Codex execution.
 */
import { createHash } from "node:crypto";
import { Type } from "typebox";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import { listAgentIds, resolveAgentConfig } from "../agent-scope-config.js";
import { resolveAgentExecutionWorkspaceConfig } from "../execution-workspace.js";
import { readLatestAssistantReply, waitForAgentRun, type AgentWaitResult } from "../run-wait.js";
import type { SpawnedToolContext } from "../spawned-context.js";
import { killControlledSubagentRun, resolveSubagentController } from "../subagent-control.js";
import { getLatestSubagentRunByChildSessionKey } from "../subagent-registry-read.js";
import { spawnSubagentDirect } from "../subagent-spawn.js";
import { resolveSubagentAllowedTargetIds } from "../subagent-target-policy.js";
import { normalizeSubagentTaskName } from "../subagent-task-name.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, textResult } from "./common.js";

const TASK_WAIT_POLL_MS = 60_000;
const TASK_RESULT_INLINE_MAX_CHARS = 1_800;
const PLANNING_REVIEW_RESULT_INLINE_MAX_CHARS = 12_000;
const CODING_AGENT_IDS = new Set(["coding", "execution-coding"]);
const SOURCE_RESEARCH_AGENT_IDS = new Set([
  "codebase-researcher",
  "docs-standards-researcher",
  "review-specialist",
]);
const FIXED_TASK_CWD_REQUESTER_AGENT_IDS = new Set(["planning", "reviewer"]);
const DEFAULT_LIGHT_CONTEXT_AGENT_IDS = new Set([
  "codebase-researcher",
  "docs-standards-researcher",
  "operator-intent-researcher",
  "researcher",
  "review-specialist",
  "reviewer",
  "web-researcher",
  "x-researcher",
]);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function containsTruncationMarker(value: string): boolean {
  return (
    value.includes("...(truncated)...") ||
    value.includes("[chat.history omitted: message too large]") ||
    value.includes("chars truncated")
  );
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function resolveRequesterAgentId(
  opts: { requesterAgentIdOverride?: string; agentSessionKey?: string } | undefined,
): string | undefined {
  const explicit = opts?.requesterAgentIdOverride?.trim();
  if (explicit) {
    return explicit;
  }
  return /^agent:([^:]+)/.exec(opts?.agentSessionKey ?? "")?.[1]?.trim() || undefined;
}

function resolveAllowedAgentIds(params: {
  config?: OpenClawConfig;
  requesterAgentId?: string;
}): string[] {
  const requesterAgentId = params.requesterAgentId?.trim();
  if (!params.config || !requesterAgentId) {
    return [];
  }
  const requesterConfig = resolveAgentConfig(params.config, requesterAgentId);
  return resolveSubagentAllowedTargetIds({
    requesterAgentId,
    allowAgents:
      requesterConfig?.subagents?.allowAgents ??
      params.config.agents?.defaults?.subagents?.allowAgents,
    configuredAgentIds: listAgentIds(params.config),
  }).allowedIds;
}

function createTaskSchema(params: {
  allowedAgentIds: readonly string[];
  allowArbitraryCwd: boolean;
}) {
  const allowedDescription =
    params.allowedAgentIds.length > 0
      ? ` Allowed for this caller: ${params.allowedAgentIds.join(", ")}.`
      : "";
  return Type.Object({
    agentId: Type.String({
      description: `Target OpenClaw agent id.${allowedDescription}`,
      ...(params.allowedAgentIds.length > 0 ? { enum: [...params.allowedAgentIds] } : {}),
    }),
    task: Type.String({
      description:
        "Bounded child task. If an exact workspace artifact governs the work, pass its path/ref and digest; do not paraphrase it into replacement requirements.",
    }),
    taskName: Type.Optional(
      Type.String({
        description:
          "Stable child alias: lowercase letters, digits, underscores, or hyphens; starts with a letter.",
      }),
    ),
    label: Type.Optional(Type.String()),
    context: Type.Optional(
      Type.Union([Type.Literal("isolated"), Type.Literal("fork")], {
        description:
          'Cross-agent work is always isolated. "fork" is valid only for same-agent continuation.',
      }),
    ),
    thinking: Type.Optional(
      Type.String({
        description:
          "Optional explicit reasoning override. Omit to use the target role's configured profile.",
      }),
    ),
    ...(params.allowArbitraryCwd
      ? {
          cwd: Type.Optional(
            Type.String({
              description:
                "Optional native task cwd. Omit for roles whose configured execution workspace owns cwd.",
            }),
          ),
        }
      : {}),
    checkout: Type.Optional(
      Type.Literal("loaded_system", {
        description:
          "Require the target source-inspection role's configured read-only loaded-source workspace.",
      }),
    ),
    lightContext: Type.Optional(
      Type.Boolean({
        description:
          "Use the target role's lightweight bootstrap for a bounded, self-contained task.",
      }),
    ),
    systemChange: Type.Optional(
      Type.Boolean({
        description:
          "Require Coding's configured writable loaded-source workspace. Valid only for Main-to-Coding system changes.",
      }),
    ),
  });
}

function isCodingAgent(agentId: string): boolean {
  return CODING_AGENT_IDS.has(agentId.trim().toLowerCase());
}

function resolveContext(params: {
  targetAgentId: string;
  requesterAgentId?: string;
  requestedContext: unknown;
}): "isolated" | "fork" | undefined {
  const target = params.targetAgentId.trim().toLowerCase();
  const requester = params.requesterAgentId?.trim().toLowerCase();
  if (isCodingAgent(target) || (requester && requester !== target)) {
    return "isolated";
  }
  return params.requestedContext === "fork" || params.requestedContext === "isolated"
    ? params.requestedContext
    : undefined;
}

function validateContext(params: {
  targetAgentId: string;
  requesterAgentId?: string;
  requestedContext: unknown;
}): string | undefined {
  if (params.requestedContext !== "fork") {
    return undefined;
  }
  const requester = params.requesterAgentId?.trim().toLowerCase();
  const target = params.targetAgentId.trim().toLowerCase();
  return requester && requester !== target
    ? 'cross-agent task context must be "isolated"; "fork" is only valid for same-agent continuation'
    : undefined;
}

function resolveLightContext(agentId: string, value: unknown): boolean {
  if (value === true || value === false) {
    return value;
  }
  return DEFAULT_LIGHT_CONTEXT_AGENT_IDS.has(agentId.trim().toLowerCase());
}

function resolveExactOperatorRequest(params: {
  requesterAgentId?: string;
  targetAgentId: string;
  currentInboundMessage?: string;
  task: string;
}): string | undefined {
  const requester = params.requesterAgentId?.trim().toLowerCase();
  const target = params.targetAgentId.trim().toLowerCase();
  const inbound = params.currentInboundMessage;
  if (
    requester !== "main" ||
    target === "main" ||
    !inbound?.trim() ||
    params.task.includes(inbound)
  ) {
    return undefined;
  }
  return inbound;
}

function renderTaskForChild(params: {
  agentId: string;
  task: string;
  exactOperatorRequest?: string;
}): string {
  const sections: string[] = [];
  if (isCodingAgent(params.agentId)) {
    sections.push(
      [
        "[Coding Handoff]",
        "The OpenClaw agent workspace owns role identity and governing artifacts; the task checkout owns source.",
        "Read any referenced workspace plan/spec in full. Treat the reference as authority rather than reconstructing it from routing prose.",
        "OpenClaw owns the managed checkout. Once the Coding role enters Codex app-server, Codex owns implementation tools, MCP, sandboxing, V2 children, and settlement.",
      ].join("\n"),
    );
  }
  sections.push(
    [
      "[Task Closeout]",
      'Start the final response with exactly one line: "Task status: complete", "Task status: partial", or "Task status: blocked".',
      ...(params.agentId.trim().toLowerCase() === "reviewer"
        ? [
            'On the next non-empty line write one decision: "Review decision: approve", "Review decision: revise", "Review decision: block", or "Review decision: needs_more_research".',
          ]
        : []),
    ].join("\n"),
  );
  if (params.exactOperatorRequest) {
    sections.push(
      [
        "[Original Operator Request: exact transport]",
        `chars=${params.exactOperatorRequest.length} sha256=${sha256(params.exactOperatorRequest)}`,
        params.exactOperatorRequest,
        "[Routing Context]",
        params.task,
      ].join("\n"),
    );
  } else {
    sections.push(["[Task Scope]", params.task].join("\n"));
  }
  return sections.join("\n\n");
}

function inlineLimit(requesterAgentId?: string): number {
  const requester = requesterAgentId?.trim().toLowerCase();
  return requester === "planning" || requester === "reviewer"
    ? PLANNING_REVIEW_RESULT_INLINE_MAX_CHARS
    : TASK_RESULT_INLINE_MAX_CHARS;
}

async function waitForForegroundResult(params: {
  runId: string;
  sessionKey: string;
  signal?: AbortSignal;
}): Promise<
  AgentWaitResult & {
    replyText?: string;
    recoveryHistory?: Array<{ source: "task_wait"; status: string; error?: string }>;
  }
> {
  while (!params.signal?.aborted) {
    const wait = await waitForAgentRun({
      runId: params.runId,
      timeoutMs: TASK_WAIT_POLL_MS,
    });
    if (wait.status === "ok") {
      return {
        status: "ok",
        replyText: await readLatestAssistantReply({ sessionKey: params.sessionKey }),
      };
    }
    if (wait.status === "error") {
      const replyText = await readLatestAssistantReply({ sessionKey: params.sessionKey });
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
      return { ...wait, replyText };
    }
    // Pending/timeout belong to the bounded wait RPC, not to the child run.
    // Native child liveness and explicit cancellation remain authoritative.
  }
  return { status: "error", error: "task wait cancelled" };
}

async function cancelOwnedChild(params: {
  cfg: OpenClawConfig;
  controllerSessionKey?: string;
  childSessionKey: string;
  runId: string;
}): Promise<void> {
  const entry = getLatestSubagentRunByChildSessionKey(params.childSessionKey);
  if (!entry || entry.runId !== params.runId) {
    return;
  }
  const controller = resolveSubagentController({
    cfg: params.cfg,
    agentSessionKey: params.controllerSessionKey,
  });
  await killControlledSubagentRun({ cfg: params.cfg, controller, entry });
}

function formatError(params: {
  agentId: string;
  childSessionKey?: string;
  runId?: string;
  taskName?: string;
  error: string;
  partialReply?: string;
}): string {
  const id = params.childSessionKey ?? params.runId ?? params.agentId;
  const partial = params.partialReply?.trim();
  return [
    `<task id="${escapeXml(id)}" agentId="${escapeXml(params.agentId)}"${
      params.runId ? ` runId="${escapeXml(params.runId)}"` : ""
    }${params.taskName ? ` taskName="${escapeXml(params.taskName)}"` : ""} state="error">`,
    "  <task_error>",
    escapeXml(params.error || "child task failed"),
    "  </task_error>",
    ...(partial ? ["  <partial_task_result>", escapeXml(partial), "  </partial_task_result>"] : []),
    "</task>",
  ].join("\n");
}

function formatSuccess(params: {
  agentId: string;
  childSessionKey: string;
  runId: string;
  taskName?: string;
  replyText: string;
  inline: boolean;
  resultRef: string;
  transcriptFinalRef: string;
  recoveryHistory?: Array<{ source: string; status: string; error?: string }>;
}): string {
  const digest = sha256(params.replyText);
  const open = `<task id="${escapeXml(params.childSessionKey)}" runId="${escapeXml(
    params.runId,
  )}" agentId="${escapeXml(params.agentId)}"${
    params.taskName ? ` taskName="${escapeXml(params.taskName)}"` : ""
  } state="completed" contentDigest="${digest}" contentChars="${
    params.replyText.length
  }" contentTruncated="${containsTruncationMarker(params.replyText)}" resultInline="${
    params.inline
  }">`;
  const result = params.inline
    ? ["  <task_result>", escapeXml(params.replyText), "  </task_result>"]
    : [
        `  <task_result_ref kind="session" ref="${escapeXml(params.resultRef)}" />`,
        `  <task_result_ref kind="transcript_final" ref="${escapeXml(
          params.transcriptFinalRef,
        )}" />`,
        "  <task_result_status>",
        "child task completed; full result remains in the native child transcript",
        "  </task_result_status>",
      ];
  const recovery = params.recoveryHistory?.length
    ? [
        "  <task_recovery_history>",
        ...params.recoveryHistory.map(
          (entry) =>
            `    <recovery source="${escapeXml(entry.source)}" status="${escapeXml(
              entry.status,
            )}"${entry.error ? ` error="${escapeXml(entry.error)}"` : ""} />`,
        ),
        "  </task_recovery_history>",
      ]
    : [];
  return [open, ...result, ...recovery, "</task>"].join("\n");
}

export function createTaskTool(
  opts?: {
    agentSessionKey?: string;
    parentRunId?: string;
    completionOwnerKey?: string;
    currentInboundMessage?: string;
    agentChannel?: GatewayMessageChannel;
    agentAccountId?: string;
    agentTo?: string;
    agentThreadId?: string | number;
    currentMessagingTarget?: string;
    currentChannelId?: string;
    currentMessageId?: string | number;
    config?: OpenClawConfig;
    requesterAgentIdOverride?: string;
    workspaceDir?: string;
  } & SpawnedToolContext,
): AnyAgentTool {
  const requesterAgentId = resolveRequesterAgentId(opts);
  const allowedAgentIds = resolveAllowedAgentIds({
    config: opts?.config,
    requesterAgentId,
  });
  return {
    name: "task",
    label: "Task",
    description:
      "Run one OpenClaw role as a foreground child and return its final result or exact native transcript pointers. Give the child one bounded decision-changing question, exact refs, exclusions, and an output contract. Independent task calls may run in parallel in the same turn. Use checkout=loaded_system only for configured source-inspection roles and systemChange=true only for Main-to-Coding work. Do not call sessions_yield after task.",
    executionMode: "parallel",
    parameters: createTaskSchema({
      allowedAgentIds,
      allowArbitraryCwd: !FIXED_TASK_CWD_REQUESTER_AGENT_IDS.has(
        requesterAgentId?.trim().toLowerCase() ?? "",
      ),
    }),
    execute: async (_toolCallId, args, signal) => {
      const params = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
      const agentId = readStringParam(params, "agentId", { required: true });
      const task = readStringParam(params, "task", { required: true });
      const label = readStringParam(params, "label");
      const taskNameResult = normalizeSubagentTaskName(params.taskName);
      if (taskNameResult.error) {
        return jsonResult({ status: "error", error: taskNameResult.error });
      }
      const taskName = taskNameResult.taskName;
      const contextError = validateContext({
        targetAgentId: agentId,
        requesterAgentId,
        requestedContext: params.context,
      });
      if (contextError) {
        return jsonResult({ status: "error", error: contextError });
      }

      const cwd = readStringParam(params, "cwd");
      const checkout = readStringParam(params, "checkout");
      const requestsInspection = checkout === "loaded_system";
      const requestsSystemChange = params.systemChange === true;
      if (checkout && !requestsInspection) {
        return jsonResult({ status: "error", error: `unsupported task checkout: ${checkout}` });
      }
      if (requestsInspection && !SOURCE_RESEARCH_AGENT_IDS.has(agentId)) {
        return jsonResult({
          status: "error",
          error: "loaded-system inspection may only target a source-inspection role",
        });
      }
      if (requestsSystemChange && (!isCodingAgent(agentId) || requesterAgentId !== "main")) {
        return jsonResult({
          status: "error",
          error: "system-change tasks may only be launched by Main for Coding",
        });
      }
      if (requestsInspection && requestsSystemChange) {
        return jsonResult({
          status: "error",
          error: "loaded-system inspection and system-change modification are mutually exclusive",
        });
      }
      const executionWorkspace = opts?.config
        ? resolveAgentExecutionWorkspaceConfig(opts.config, agentId)
        : undefined;
      if (
        requestsInspection &&
        (executionWorkspace?.type !== "loaded-source" || executionWorkspace.access !== "inspect")
      ) {
        return jsonResult({
          status: "error",
          error: `${agentId} is not configured for loaded-source inspection`,
        });
      }
      if (
        requestsSystemChange &&
        (executionWorkspace?.type !== "loaded-source" || executionWorkspace.access !== "modify")
      ) {
        return jsonResult({
          status: "error",
          error: `${agentId} is not configured for loaded-source modification`,
        });
      }
      if (executionWorkspace && cwd) {
        return jsonResult({
          status: "error",
          error: "cwd is owned by the target role's configured execution workspace",
        });
      }

      const spawn = await spawnSubagentDirect(
        {
          task: renderTaskForChild({
            agentId,
            task,
            exactOperatorRequest: resolveExactOperatorRequest({
              requesterAgentId,
              targetAgentId: agentId,
              currentInboundMessage: opts?.currentInboundMessage,
              task,
            }),
          }),
          taskName,
          label,
          agentId,
          thinking: readStringParam(params, "thinking"),
          cwd,
          mode: "run",
          cleanup: "keep",
          sandbox: "inherit",
          context: resolveContext({
            targetAgentId: agentId,
            requesterAgentId,
            requestedContext: params.context,
          }),
          lightContext: resolveLightContext(agentId, params.lightContext),
          expectsCompletionMessage: false,
        },
        {
          agentSessionKey: opts?.agentSessionKey,
          requesterTurnRunId: opts?.parentRunId,
          completionOwnerKey: opts?.completionOwnerKey ?? opts?.agentSessionKey,
          agentChannel: opts?.agentChannel,
          agentAccountId: opts?.agentAccountId,
          agentTo: opts?.agentTo,
          agentThreadId: opts?.agentThreadId,
          currentMessagingTarget: opts?.currentMessagingTarget,
          currentChannelId: opts?.currentChannelId,
          currentMessageId: opts?.currentMessageId,
          agentGroupId: opts?.agentGroupId,
          agentGroupChannel: opts?.agentGroupChannel,
          agentGroupSpace: opts?.agentGroupSpace,
          agentMemberRoleIds: opts?.agentMemberRoleIds,
          requesterAgentIdOverride: opts?.requesterAgentIdOverride,
          workspaceDir: opts?.workspaceDir,
          inheritedToolAllowlist: opts?.inheritedToolAllowlist,
          inheritedToolDenylist: opts?.inheritedToolDenylist,
          requesterRunId: opts?.parentRunId,
          abortSignal: signal,
        },
      );

      if (spawn.status !== "accepted" || !spawn.childSessionKey || !spawn.runId) {
        const error = spawn.error ?? `child task was not accepted: ${spawn.status}`;
        return textResult(
          formatError({
            agentId,
            childSessionKey: spawn.childSessionKey,
            runId: spawn.runId,
            taskName,
            error,
          }),
          {
            status: spawn.status,
            error,
            childResult: true,
            childSessionKey: spawn.childSessionKey,
            runId: spawn.runId,
            agentId,
            taskName,
          },
        );
      }

      let cancellation: Promise<void> | undefined;
      const abort = () => {
        cancellation ??= cancelOwnedChild({
          cfg: opts?.config ?? {},
          controllerSessionKey: opts?.agentSessionKey,
          childSessionKey: spawn.childSessionKey!,
          runId: spawn.runId!,
        }).catch(() => undefined);
      };
      if (signal?.aborted) {
        abort();
      } else {
        signal?.addEventListener("abort", abort, { once: true });
      }
      const wait = await waitForForegroundResult({
        runId: spawn.runId,
        sessionKey: spawn.childSessionKey,
        signal,
      });
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) {
        abort();
        await cancellation;
      }

      if (wait.status !== "ok" || !wait.replyText?.trim()) {
        const error =
          wait.error ??
          (wait.status === "pending" || wait.status === "timeout"
            ? "child task wait ended before native terminal settlement"
            : "child task produced no assistant result");
        const partialReply = wait.replyText?.trim();
        return textResult(
          formatError({
            agentId,
            childSessionKey: spawn.childSessionKey,
            runId: spawn.runId,
            taskName,
            error,
            partialReply,
          }),
          {
            status: "error",
            error,
            childResult: true,
            childSessionKey: spawn.childSessionKey,
            runId: spawn.runId,
            agentId,
            taskName,
            ...(partialReply
              ? {
                  contentDigest: sha256(partialReply),
                  contentChars: partialReply.length,
                  contentTruncated: containsTruncationMarker(partialReply),
                }
              : {}),
          },
        );
      }

      const replyText = wait.replyText.trim();
      const contentDigest = sha256(replyText);
      const contentTruncated = containsTruncationMarker(replyText);
      const inline = replyText.length <= inlineLimit(requesterAgentId) && !contentTruncated;
      const encodedSessionKey = encodeURIComponent(spawn.childSessionKey);
      const resultRef = `openclaw-transcript://${encodedSessionKey}#session`;
      const transcriptFinalRef = `openclaw-transcript://${encodedSessionKey}#assistant:last`;
      return textResult(
        formatSuccess({
          agentId,
          childSessionKey: spawn.childSessionKey,
          runId: spawn.runId,
          taskName,
          replyText,
          inline,
          resultRef,
          transcriptFinalRef,
          recoveryHistory: wait.recoveryHistory,
        }),
        {
          status: "ok",
          childResult: true,
          childSessionKey: spawn.childSessionKey,
          runId: spawn.runId,
          agentId,
          taskName,
          producerAgentId: agentId,
          ownerAgentId: requesterAgentId,
          sourceSessionKey: spawn.childSessionKey,
          sourceRunId: spawn.runId,
          contentDigest,
          contentChars: replyText.length,
          contentTruncated,
          resultInline: inline,
          resultMode: inline ? "inline" : "pointer",
          resultRef,
          resultSource: "transcript",
          transcriptFinalRef,
          parentInlineLimitChars: inlineLimit(requesterAgentId),
          ...(wait.recoveryHistory?.length ? { recoveryHistory: wait.recoveryHistory } : {}),
          resolvedModel: spawn.resolvedModel,
          resolvedProvider: spawn.resolvedProvider,
        },
      );
    },
  };
}
