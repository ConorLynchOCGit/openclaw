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
import {
  loadSessionStore,
  readLatestAssistantTextFromSessionTranscript,
  resolveSessionFilePath,
  resolveSessionFilePathOptions,
  resolveSessionStoreEntry,
  resolveStorePath,
} from "../../config/sessions.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { resolveAgentIdFromSessionKey } from "../../routing/session-key.js";
import {
  resolveModelAuthoredTaskCloseout,
  resolveModelAuthoredTaskVerdict,
} from "../../tasks/task-completion-contract.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import { listAgentIds, resolveAgentConfig } from "../agent-scope-config.js";
import {
  computeChildResultContentDigest,
  includesChildResultTruncationMarker,
} from "../child-result-metadata.js";
import { readLatestAssistantReply, waitForAgentRun, type AgentWaitResult } from "../run-wait.js";
import type { SpawnedToolContext } from "../spawned-context.js";
import { killControlledSubagentRun, resolveSubagentController } from "../subagent-control.js";
import { getLatestSubagentRunByChildSessionKey } from "../subagent-registry-read.js";
import { spawnSubagentDirect } from "../subagent-spawn.js";
import { resolveSubagentAllowedTargetIds } from "../subagent-target-policy.js";
import { normalizeSubagentTaskName } from "../subagent-task-name.js";
import { resolveLoadedSystemSource } from "../system-change-source.js";
import { requireGit } from "../worktrees/git.js";
import type { LoadedSystemSource, LoadedSystemSourceMode } from "../worktrees/types.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, textResult } from "./common.js";

const TASK_WAIT_POLL_MS = 60_000;
const TASK_RESULT_PARENT_INLINE_MAX_CHARS = 1_800;
const PLANNING_REVIEW_TASK_RESULT_INLINE_MAX_CHARS = 12_000;
const TASK_RESULT_PARENT_PREVIEW_MAX_CHARS = 0;
const CODEX_CODING_AGENT_IDS = new Set(["coding", "execution-coding"]);
const LOADED_SYSTEM_INSPECTION_AGENT_IDS = new Set([
  "codebase-researcher",
  "docs-standards-researcher",
]);
const DEFAULT_LIGHT_CONTEXT_AGENT_IDS = new Set([
  "codebase-researcher",
  "docs-standards-researcher",
  "researcher",
  "reviewer",
  "web-researcher",
  "x-researcher",
]);

type ManagedWorktreeSettlement = {
  id: string;
  path: string;
  branch: string;
  baseRef: string;
  dirty: boolean | null;
  changedPathCount?: number;
  statusError?: string;
};

function createTaskToolSchema(params: {
  allowedAgentIds?: readonly string[];
  allowArbitraryCwd?: boolean;
}) {
  const allowedAgentIds = params.allowedAgentIds ?? [];
  const allowedDescription =
    allowedAgentIds.length > 0 ? ` Allowed for this caller: ${allowedAgentIds.join(", ")}.` : "";
  return Type.Object({
    agentId: Type.String({
      description: `Target OpenClaw agent id. Required.${allowedDescription}`,
      ...(allowedAgentIds.length > 0 ? { enum: [...allowedAgentIds] } : {}),
    }),
    task: Type.String({
      description:
        "Child route intent and bounded task context. When an exact agent-workspace artifact governs the work, pass its path/ref and digest without reproducing, paraphrasing, or compressing its requirements; the child reads that artifact as authority. Ask for decision material, not a final plan unless that is the child role.",
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
          'Native context. Cross-agent tasks must omit this or use "isolated". "fork" is valid only for same-agent continuation.',
      }),
    ),
    thinking: Type.Optional(
      Type.String({
        description:
          "Optional explicit child thinking override. Omit by default so the target agent's role profile controls reasoning level; set only when intentionally overriding that profile for this task.",
      }),
    ),
    ...(params.allowArbitraryCwd
      ? {
          cwd: Type.Optional(
            Type.String({
              description:
                "Native task checkout. Relative values resolve from the target agent workspace; absolute values must already be runtime-visible. This changes repository context, not agent identity or bootstrap.",
            }),
          ),
        }
      : {}),
    checkout: Type.Optional(
      Type.Literal("loaded_system", {
        description:
          "Bind a source-research agent to a native managed worktree of the exact source commit embedded in the running OpenClaw package. The runtime owns the source store, commit, and cwd.",
      }),
    ),
    lightContext: Type.Optional(
      Type.Boolean({
        description:
          "Use lightweight bootstrap context for bounded children that need their role contract but not root workspace memory/context.",
      }),
    ),
    systemChange: Type.Optional(
      Type.Boolean({
        description:
          "Run Coding in a native managed worktree of the currently loaded OpenClaw generation. Valid only for Main-to-Coding system upgrades; source and cwd are runtime-owned.",
      }),
    ),
  });
}

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
  resultRef: string;
  transcriptFinalRef: string;
  receiptLeadLines?: string[];
  inspectCommand: string;
  previewText?: string;
  previewChars?: number;
  recoveryHistory?: Array<{ source: string; status: string; error?: string }>;
  worktree?: ManagedWorktreeSettlement;
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
      `  <task_result_ref kind="session" ref="${escapeXmlAttr(params.resultRef)}" />`,
      `  <task_result_ref kind="transcript_final" ref="${escapeXmlAttr(
        params.transcriptFinalRef,
      )}" />`,
      "  <task_result_status>",
      "child task completed; full result remains in the child session transcript",
      "  </task_result_status>",
      ...(params.receiptLeadLines?.length
        ? [
            '  <task_result_lead modelAuthored="true">',
            ...params.receiptLeadLines.map((line) => escapeXmlText(line)),
            "  </task_result_lead>",
          ]
        : []),
      "  <inspect_command>",
      escapeXmlText(params.inspectCommand),
      "  </inspect_command>",
      ...(params.previewText
        ? [
            '  <task_result_preview previewOnly="true">',
            escapeXmlText(params.previewText.trim()),
            "  </task_result_preview>",
          ]
        : []),
      ...formatManagedWorktreeSettlement(params.worktree),
      ...formatTaskRecoveryHistory(params.recoveryHistory),
      "</task>",
    ].join("\n");
  }
  return [
    openTag,
    "  <task_result>",
    escapeXmlText(params.replyText.trim()),
    "  </task_result>",
    ...formatManagedWorktreeSettlement(params.worktree),
    ...formatTaskRecoveryHistory(params.recoveryHistory),
    "</task>",
  ].join("\n");
}

function formatManagedWorktreeSettlement(
  worktree: ManagedWorktreeSettlement | undefined,
): string[] {
  if (!worktree) {
    return [];
  }
  const dirty = worktree.dirty === null ? "unknown" : String(worktree.dirty);
  const changedPathCount =
    worktree.changedPathCount === undefined
      ? ""
      : ` changedPathCount="${worktree.changedPathCount}"`;
  const statusError = worktree.statusError
    ? ` statusError="${escapeXmlAttr(worktree.statusError)}"`
    : "";
  return [
    `  <managed_worktree id="${escapeXmlAttr(worktree.id)}" path="${escapeXmlAttr(
      worktree.path,
    )}" branch="${escapeXmlAttr(worktree.branch)}" baseRef="${escapeXmlAttr(
      worktree.baseRef,
    )}" dirty="${dirty}"${changedPathCount}${statusError} />`,
  ];
}

async function readManagedWorktreeSettlement(
  worktree: NonNullable<Awaited<ReturnType<typeof spawnSubagentDirect>>["worktree"]> | undefined,
): Promise<ManagedWorktreeSettlement | undefined> {
  if (!worktree) {
    return undefined;
  }
  try {
    const porcelain = await requireGit(worktree.path, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ]);
    return {
      ...worktree,
      dirty: porcelain.length > 0,
      changedPathCount: porcelain ? porcelain.split("\0").filter(Boolean).length : 0,
    };
  } catch (error) {
    return {
      ...worktree,
      dirty: null,
      statusError: error instanceof Error ? error.message : String(error),
    };
  }
}

function taskResultInlineLimitForRequester(requesterAgentId: string | undefined): number {
  const normalized = requesterAgentId?.trim().toLowerCase();
  return normalized === "planning" || normalized === "reviewer"
    ? PLANNING_REVIEW_TASK_RESULT_INLINE_MAX_CHARS
    : TASK_RESULT_PARENT_INLINE_MAX_CHARS;
}

function shouldInlineTaskResultForParent(params: {
  replyText: string;
  requesterAgentId?: string;
}): boolean {
  return (
    params.replyText.length <= taskResultInlineLimitForRequester(params.requesterAgentId) &&
    !includesChildResultTruncationMarker(params.replyText)
  );
}

function resolveRequesterAgentId(
  opts: { requesterAgentIdOverride?: string; agentSessionKey?: string } | undefined,
) {
  const override = opts?.requesterAgentIdOverride?.trim();
  if (override) {
    return override;
  }
  const fromSessionKey = /^agent:([^:]+)/.exec(opts?.agentSessionKey ?? "")?.[1]?.trim();
  return fromSessionKey || undefined;
}

function resolveTaskAllowedAgentIds(params: {
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

function isCodexCodingAgentId(agentId: string): boolean {
  return CODEX_CODING_AGENT_IDS.has(agentId.trim().toLowerCase());
}

function isReviewerAgentId(agentId: string): boolean {
  return agentId.trim().toLowerCase() === "reviewer";
}

function resolveTaskToolContext(params: {
  agentId: string;
  requesterAgentId?: string;
  requestedContext: unknown;
}) {
  const targetAgentId = params.agentId.trim().toLowerCase();
  const requesterAgentId = params.requesterAgentId?.trim().toLowerCase();
  if (
    isCodexCodingAgentId(params.agentId) ||
    (requesterAgentId !== undefined && requesterAgentId !== targetAgentId)
  ) {
    return "isolated" as const;
  }
  return params.requestedContext === "fork" || params.requestedContext === "isolated"
    ? params.requestedContext
    : undefined;
}

function validateTaskToolContext(params: {
  agentId: string;
  requesterAgentId?: string;
  requestedContext: unknown;
}): string | undefined {
  if (params.requestedContext !== "fork") {
    return undefined;
  }
  const requesterAgentId = params.requesterAgentId?.trim().toLowerCase();
  const targetAgentId = params.agentId.trim().toLowerCase();
  if (requesterAgentId && requesterAgentId !== targetAgentId) {
    return 'cross-agent task context must be "isolated"; "fork" is only valid for same-agent continuation';
  }
  return undefined;
}

function formatCodingTaskHandoffContract(agentId: string): string | undefined {
  if (!isCodexCodingAgentId(agentId)) {
    return undefined;
  }
  return [
    "[Coding Artifact Handoff Contract]",
    "The OpenClaw agent workspace and repository checkout are separate native roots. The Session Context names both.",
    "If the task includes an agent-workspace prompt, spec, or artifact path, resolve that path against the Agent workspace, read it in full, and treat it as authoritative scope.",
    "The task text is route/scope guidance only when a prompt/spec/artifact file is referenced; do not work from a parent summary instead of the referenced file.",
    "An OpenClaw transcript/session receipt is transport evidence, not a Codex work artifact. If a required plan has no ordinary agent-workspace file path, do not search session stores or reconstruct it from prose; close blocked with workspace_artifact_path_missing.",
    "Resolve source-relative paths against the Task checkout. System-change Coding receives an OpenClaw-managed worktree there; there is no nested src/openclaw checkout under the Agent workspace.",
    "In final closeout, report each governing file ref with observed chars and sha256 digest, or explicitly state that the ref was unreadable and why.",
  ].join("\n");
}

function formatTaskCloseoutContract(agentId: string): string {
  return [
    "[Task Closeout Contract]",
    'Start the final response with exactly one model-authored line: "Task status: complete", "Task status: partial", or "Task status: blocked".',
    "Task status reports whether you completed this delegated task. It is independent of runtime transport completion and does not approve or reject a reviewed artifact.",
    ...(isReviewerAgentId(agentId)
      ? [
          'On the next non-empty line, report exactly one model-authored artifact decision: "Review decision: approve", "Review decision: revise", "Review decision: block", or "Review decision: needs_more_research".',
          'A completed review that requires artifact revision uses "Task status: complete" and "Review decision: revise". Do not derive either axis from the other.',
        ]
      : []),
    "Choose each model-authored value from your own domain judgment and the governing requirements. The runtime may carry the exact lead lines in a parent receipt, but it will not infer one from another or turn them into runtime quality state.",
  ].join("\n");
}

function renderTaskForChild(params: {
  agentId: string;
  task: string;
  exactOperatorRequest?: string;
}): string {
  const contract = formatCodingTaskHandoffContract(params.agentId);
  const exactOperatorRequest = params.exactOperatorRequest;
  const exactOperatorRequestSection = exactOperatorRequest
    ? [
        "[Original Operator Request: exact transport]",
        `chars=${exactOperatorRequest.length} sha256=${computeChildResultContentDigest(exactOperatorRequest)}`,
        "The following operator text is unmodified. Treat it as intent and scope; routing context may add ownership or publication details but must not replace it.",
        exactOperatorRequest,
      ].join("\n")
    : undefined;
  return [
    ...(contract ? [contract] : []),
    formatTaskCloseoutContract(params.agentId),
    ...(exactOperatorRequestSection
      ? [exactOperatorRequestSection, "[Routing Context]"]
      : ["[Task Scope]"]),
    params.task,
  ].join("\n\n");
}

function resolveExactOperatorRequest(params: {
  requesterAgentId?: string;
  targetAgentId: string;
  currentInboundMessage?: string;
  task: string;
}): string | undefined {
  const requesterAgentId = params.requesterAgentId?.trim().toLowerCase();
  const targetAgentId = params.targetAgentId.trim().toLowerCase();
  const currentInboundMessage = params.currentInboundMessage;
  if (
    requesterAgentId !== "main" ||
    targetAgentId === "main" ||
    !currentInboundMessage ||
    currentInboundMessage.trim().length === 0 ||
    params.task.includes(currentInboundMessage)
  ) {
    return undefined;
  }
  return currentInboundMessage;
}

async function abortForegroundTaskChild(params: {
  cfg: OpenClawConfig;
  controllerSessionKey?: string;
  childSessionKey: string;
  runId: string;
}) {
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

function resolveTaskReceiptLeadLines(params: { agentId: string; replyText: string }): string[] {
  const closeout = resolveModelAuthoredTaskCloseout(params.replyText);
  if (closeout.taskStatus || (isReviewerAgentId(params.agentId) && closeout.reviewDecision)) {
    return [
      ...(closeout.taskStatus ? [`Task status: ${closeout.taskStatus}`] : []),
      ...(isReviewerAgentId(params.agentId) && closeout.reviewDecision
        ? [`Review decision: ${closeout.reviewDecision}`]
        : []),
    ];
  }

  // Keep the legacy first-line form readable for already-stored transcripts only.
  const legacyVerdict = resolveModelAuthoredTaskVerdict(params.replyText);
  return legacyVerdict ? [`Verdict: ${legacyVerdict}`] : [];
}

export async function buildTaskTranscriptFinalRef(params: {
  childSessionKey: string;
  cfg?: OpenClawConfig;
}): Promise<string> {
  const childSessionKey = params.childSessionKey.trim();
  const encodedSessionKey = encodeURIComponent(childSessionKey);
  if (!childSessionKey) {
    return "openclaw-transcript://unknown#assistant:last";
  }
  try {
    const agentId = resolveAgentIdFromSessionKey(childSessionKey);
    const storePath = resolveStorePath(params.cfg?.session?.store, { agentId });
    const store = loadSessionStore(storePath, { clone: false });
    const entry = resolveSessionStoreEntry({ store, sessionKey: childSessionKey }).existing;
    const sessionId = entry?.sessionId?.trim();
    if (sessionId) {
      const sessionFile = resolveSessionFilePath(
        sessionId,
        entry,
        resolveSessionFilePathOptions({ agentId, storePath }),
      );
      const assistant = await readLatestAssistantTextFromSessionTranscript(sessionFile);
      if (assistant?.id?.trim()) {
        return `openclaw-transcript://${encodedSessionKey}#message:${encodeURIComponent(
          assistant.id.trim(),
        )}`;
      }
    }
  } catch {
    // Keep task result delivery working even when readback metadata is not yet
    // available; the fallback remains a transcript ref, not task-row truth.
  }
  return `openclaw-transcript://${encodedSessionKey}#assistant:last`;
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
  worktree?: ManagedWorktreeSettlement;
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
  lines.push(...formatManagedWorktreeSettlement(params.worktree));
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
    currentInboundMessage?: string;
    agentChannel?: GatewayMessageChannel;
    agentAccountId?: string;
    agentTo?: string;
    agentThreadId?: string | number;
    config?: OpenClawConfig;
    requesterAgentIdOverride?: string;
    workspaceDir?: string;
    onProgress?: () => void;
    /** Test-only override for loaded generation/source resolution. */
    resolveLoadedSystemSource?: () => LoadedSystemSource | Promise<LoadedSystemSource>;
  } & SpawnedToolContext,
): AnyAgentTool {
  const requesterAgentId = resolveRequesterAgentId(opts);
  const allowedAgentIds = resolveTaskAllowedAgentIds({
    config: opts?.config,
    requesterAgentId,
  });
  return {
    label: "Task",
    name: "task",
    description:
      "Run one target OpenClaw subagent as a foreground child task and return a small final result or exact native result pointers here. Use for source scouts, reviewers, and other bounded specialist work when you own final synthesis. Do not use sessions_yield after task.",
    promptGuidelines: [
      "When multiple independent child tasks are useful, call `task` multiple times in the same assistant turn so the runtime can execute them in parallel.",
      "Use one `task` call per independent specialist; do not pack unrelated work into one child prompt just to avoid multiple calls.",
      "For narrow source-scout or reviewer packets that do not need root workspace memory or parent transcript, set `lightContext: true` and include the needed objective/output instructions in the child task.",
      "For current OpenClaw source evidence, target codebase-researcher or docs-standards-researcher with `checkout: loaded_system`; never provide a host source path. The runtime selects the exact commit embedded in the loaded package.",
      "For Coding handoffs that depend on a full prompt/spec/artifact, pass the workspace-relative file path and chars/digest; do not summarize that artifact into the operative scope.",
      "Do not set `thinking` unless you intentionally need to override the target agent's role profile for this specific task; ordinary specialist tasks should omit it.",
    ],
    executionMode: "parallel",
    parameters: createTaskToolSchema({
      allowedAgentIds,
      allowArbitraryCwd: requesterAgentId !== "planning",
    }),
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
      const contextError = validateTaskToolContext({
        agentId,
        requesterAgentId,
        requestedContext: params.context,
      });
      if (contextError) {
        return jsonResult({
          status: "error",
          error: contextError,
          requestedContext: params.context,
          requiredContext: "isolated",
        });
      }
      const context = resolveTaskToolContext({
        agentId,
        requesterAgentId,
        requestedContext: params.context,
      });
      const lightContext = resolveTaskToolLightContext(agentId, params.lightContext);
      const cwd = readStringParam(params, "cwd");
      const checkout = readStringParam(params, "checkout");
      const requestsLoadedSystemInspection = checkout === "loaded_system";
      const requestsSystemChange = params.systemChange === true;
      if (checkout && !requestsLoadedSystemInspection) {
        return jsonResult({ status: "error", error: `unsupported task checkout: ${checkout}` });
      }
      if (requestsLoadedSystemInspection && !LOADED_SYSTEM_INSPECTION_AGENT_IDS.has(agentId)) {
        return jsonResult({
          status: "error",
          error: "loaded-system inspection may only target a source-research agent",
        });
      }
      if (requestsLoadedSystemInspection && requestsSystemChange) {
        return jsonResult({
          status: "error",
          error: "loaded-system inspection and system-change modification are mutually exclusive",
        });
      }
      if (requestsSystemChange && !isCodexCodingAgentId(agentId)) {
        return jsonResult({
          status: "error",
          error: "system-change tasks may only target the Coding agent",
        });
      }
      if (requestsSystemChange && requesterAgentId?.trim().toLowerCase() !== "main") {
        return jsonResult({
          status: "error",
          error: "system-change Coding tasks may only be launched by Main",
        });
      }
      let loadedSystemSource: LoadedSystemSource | undefined;
      let loadedSystemSourceMode: LoadedSystemSourceMode | undefined;
      if (requestsSystemChange || requestsLoadedSystemInspection) {
        try {
          loadedSystemSource =
            (await opts?.resolveLoadedSystemSource?.()) ?? (await resolveLoadedSystemSource());
          loadedSystemSourceMode = requestsSystemChange ? "modify" : "inspect";
        } catch (error) {
          return jsonResult({
            status: "error",
            error: `loaded-system source authority is unavailable: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
      if (loadedSystemSource && cwd) {
        return jsonResult({
          status: "error",
          error: "loaded-system cwd is assigned by the native managed-worktree service",
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
          loadedSystemSource,
          loadedSystemSourceMode,
          signal,
        },
      );

      if (spawn.status !== "accepted" || !spawn.childSessionKey || !spawn.runId) {
        const worktree = await readManagedWorktreeSettlement(spawn.worktree);
        const text = formatTaskError({
          state: "error",
          childSessionKey: spawn.childSessionKey,
          runId: spawn.runId,
          agentId,
          taskName,
          error: spawn.error ?? `child task was not accepted: ${spawn.status}`,
          worktree,
        });
        return textResult(text, {
          status: spawn.status,
          error: spawn.error ?? `child task was not accepted: ${spawn.status}`,
          childResult: true,
          childSessionKey: spawn.childSessionKey,
          runId: spawn.runId,
          agentId,
          taskName,
          worktree,
        });
      }

      opts?.onProgress?.();
      let cancellationPromise: Promise<void> | undefined;
      const cancelOwnedChild = () => {
        cancellationPromise ??= abortForegroundTaskChild({
          cfg: opts?.config ?? {},
          controllerSessionKey: opts?.agentSessionKey,
          childSessionKey: spawn.childSessionKey!,
          runId: spawn.runId!,
        }).catch(() => undefined);
      };
      if (signal?.aborted) {
        cancelOwnedChild();
      } else {
        signal?.addEventListener("abort", cancelOwnedChild, { once: true });
      }
      const wait = await waitForForegroundTaskResult({
        runId: spawn.runId,
        sessionKey: spawn.childSessionKey,
        signal,
        onProgress: opts?.onProgress,
      });
      signal?.removeEventListener("abort", cancelOwnedChild);
      if (signal?.aborted) {
        cancelOwnedChild();
        await cancellationPromise;
      }
      const worktree = await readManagedWorktreeSettlement(spawn.worktree);
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
          worktree,
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
          worktree,
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
      const inlineResult = shouldInlineTaskResultForParent({ replyText, requesterAgentId });
      const resultRef = `openclaw-transcript://${encodeURIComponent(
        spawn.childSessionKey,
      )}#session`;
      const transcriptFinalRef = await buildTaskTranscriptFinalRef({
        childSessionKey: spawn.childSessionKey,
        cfg: opts?.config,
      });
      const receiptLeadLines = resolveTaskReceiptLeadLines({ agentId, replyText });
      const receiptLeadLine = receiptLeadLines[0];
      const inspectCommand = `openclaw sessions show ${spawn.childSessionKey} --agent ${agentId}`;
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
        resultRef,
        transcriptFinalRef,
        receiptLeadLines,
        inspectCommand,
        previewText,
        previewChars: previewText?.length ?? 0,
        recoveryHistory: wait.recoveryHistory,
        worktree,
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
        resultSource: "transcript",
        transcriptFinalRef,
        ...(receiptLeadLine ? { receiptLeadLine } : {}),
        ...(receiptLeadLines.length > 0 ? { receiptLeadLines } : {}),
        inspectCommand,
        previewOnly: !inlineResult,
        previewChars: previewText?.length ?? 0,
        displayTruncated: !inlineResult,
        parentInlineLimitChars: taskResultInlineLimitForRequester(requesterAgentId),
        parentPreviewLimitChars: TASK_RESULT_PARENT_PREVIEW_MAX_CHARS,
        ...(wait.recoveryHistory?.length ? { recoveryHistory: wait.recoveryHistory } : {}),
        resolvedModel: spawn.resolvedModel,
        resolvedProvider: spawn.resolvedProvider,
        worktree,
      });
    },
  };
}
