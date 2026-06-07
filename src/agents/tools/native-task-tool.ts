import crypto from "node:crypto";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import { loadConfig } from "../../config/config.js";
import {
  resolveSessionStorePathForAgentDir,
  resolveStorePath,
} from "../../config/sessions/paths.js";
import { loadSessionStore, resolveSessionStoreEntry } from "../../config/sessions/store.js";
import type { SessionSystemPromptReport } from "../../config/sessions/types.js";
import { parseAgentSessionKey } from "../../routing/session-key.js";
import { normalizeLowercaseStringOrEmpty } from "../../shared/string-coerce.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import { resolveAgentConfig, resolveAgentDir } from "../agent-scope.js";
import { waitForAgentRun, type AgentWaitResult } from "../run-wait.js";
import type { SpawnedToolContext } from "../spawned-context.js";
import { readSubagentOutput, type SubagentRunOutcome } from "../subagent-announce-output.js";
import { spawnSubagentDirect, type SpawnSubagentResult } from "../subagent-spawn.js";
import { evaluateRequiredProviderContextAdmission } from "../system-prompt-report.js";
import type { AnyAgentTool } from "./common.js";
import {
  jsonResult,
  readNumberParam,
  readStringParam,
  textResult,
  ToolInputError,
} from "./common.js";

const DEFAULT_FOREGROUND_TASK_TIMEOUT_SECONDS = 120;
const DEFAULT_PARENT_VISIBLE_CHILD_RESULT_MAX_CHARS = 12_000;
const PARENT_VISIBLE_CHILD_RESULT_GUARD_HEADROOM_CHARS = 512;
const NATIVE_TASK_CONTINUATION_PREFIX = "openclaw-native-task-continuation://";

const NativeTaskToolSchema = Type.Object({
  agentId: Type.String({
    description:
      "Required child agent id. Executable node sessions allow execution-context-scout or execution-validation-scout.",
  }),
  task: Type.Optional(
    Type.String({
      description:
        "Detailed, self-contained task prompt for a fresh child agent task. Include node scope, relevant requirements, source excerpts/refs, expected output, and constraints. Required unless continuationId is provided.",
    }),
  ),
  continuationId: Type.Optional(
    Type.String({
      description:
        "Continuation token returned by a pending foreground task wait. Use only to wait for the same child task instead of spawning duplicate work.",
    }),
  ),
  label: Type.Optional(Type.String({ description: "Short label for the delegated task." })),
  runTimeoutSeconds: Type.Optional(
    Type.Number({ minimum: 0, description: "Optional bounded runtime for the child task." }),
  ),
});

const REQUIRED_CHILD_CANONICAL_AGENT_DOCS = [
  "IDENTITY.md",
  "AGENTS.md",
  "BOOTSTRAP.md",
  "TOOLS.md",
] as const;

const REQUIRED_CHILD_SKILL_BY_AGENT_ID: Record<string, string> = {
  "execution-context-scout": "execution-context-scout",
  "execution-validation-scout": "execution-validation-scout",
};

const REQUIRED_CHILD_PROVIDER_TOOL_NAMES_BY_AGENT_ID: Record<string, readonly string[]> = {
  "execution-context-scout": ["read", "list", "glob", "grep"],
  "execution-validation-scout": ["read", "list", "glob", "grep", "exec"],
};

function normalizeAllowedAgentIds(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => normalizeLowercaseStringOrEmpty(value)).filter(Boolean));
}

export type NativeTaskChildStartFailureKind =
  | "disallowed_child_agent"
  | "missing_child_profile"
  | "wrong_child_identity_selected"
  | "child_session_receipt_incomplete"
  | "child_provider_bootstrap_report_missing"
  | "child_provider_bootstrap_truncated"
  | "child_docs_missing"
  | "child_skill_missing"
  | "child_tool_catalog_invalid"
  | "child_workspace_unavailable"
  | "child_session_lock_failure"
  | "child_provider_model_failure"
  | "child_result_oversized"
  | "child_run_timeout"
  | "child_run_error"
  | "child_session_start_forbidden"
  | "child_session_start_failed";

export type NativeTaskForegroundResult = {
  status: "completed" | "pending" | "timeout" | "error";
  foreground: true;
  childSessionKey: string;
  runId: string;
  waitStatus: AgentWaitResult["status"];
  startedAt?: number;
  endedAt?: number;
  error?: string;
  resultText?: string;
  resultTextHash?: string;
  resultTextByteCount?: number;
  resultMaxParentVisibleChars?: number;
  resultDeliveredToParentContext: boolean;
  resultTruncated?: boolean;
  resultOversized?: boolean;
  childBootstrapAdmission?: NativeTaskChildBootstrapAdmission;
  childStartFailureKind?: NativeTaskChildStartFailureKind;
  continuationId?: string;
};

export type NativeTaskChildBootstrapAdmission = {
  providerReportObserved: boolean;
  childAgentId: string;
  canonicalDocsAdmitted: boolean;
  requiredSkillAdmitted: boolean;
  childToolCatalogAdmitted: boolean;
  providerToolNames: string[];
  requiredToolNames: string[];
  missingRequiredToolNames: string[];
  forbiddenToolNames: string[];
  requiredSkillSourceRef?: string | null;
  requiredSkillSourceHash?: string | null;
  requiredSkillLocation?: string | null;
  missingRequiredSources: string[];
  truncatedRequiredSources: string[];
  reportRef?: string;
  reasonCodes: string[];
};

type ChildSystemPromptReportReader = (params: {
  childSessionKey: string;
  childAgentId: string;
}) => Promise<SessionSystemPromptReport | null>;

function outcomeFromWait(wait: AgentWaitResult): SubagentRunOutcome {
  if (wait.status === "ok") {
    return { status: "ok" };
  }
  if (wait.status === "timeout" || wait.status === "pending") {
    return { status: "timeout" };
  }
  return {
    status: "error",
    ...(wait.error ? { error: wait.error } : {}),
  };
}

function normalizeForegroundStatus(wait: AgentWaitResult): NativeTaskForegroundResult["status"] {
  if (wait.status === "ok") {
    return "completed";
  }
  if (wait.status === "timeout" || wait.status === "pending") {
    return "pending";
  }
  return "error";
}

function buildNativeTaskContinuationId(params: { childSessionKey: string; runId: string }): string {
  return `${NATIVE_TASK_CONTINUATION_PREFIX}${encodeURIComponent(
    params.childSessionKey,
  )}/${encodeURIComponent(params.runId)}`;
}

function parseNativeTaskContinuationId(
  continuationId: string | undefined,
): { childSessionKey: string; runId: string } | null {
  const trimmed = continuationId?.trim();
  if (!trimmed?.startsWith(NATIVE_TASK_CONTINUATION_PREFIX)) {
    return null;
  }
  const rest = trimmed.slice(NATIVE_TASK_CONTINUATION_PREFIX.length);
  const separator = rest.indexOf("/");
  if (separator < 0) {
    return null;
  }
  const childSessionKey = decodeURIComponent(rest.slice(0, separator)).trim();
  const runId = decodeURIComponent(rest.slice(separator + 1)).trim();
  if (!childSessionKey || !runId) {
    return null;
  }
  return { childSessionKey, runId };
}

function continuationIdForForegroundResult(
  result: Pick<NativeTaskForegroundResult, "childSessionKey" | "runId">,
): string {
  return buildNativeTaskContinuationId({
    childSessionKey: result.childSessionKey,
    runId: result.runId,
  });
}

export function resolveParentVisibleChildResultMaxChars(
  liveToolResultMaxChars: number | undefined,
): number {
  if (typeof liveToolResultMaxChars !== "number" || !Number.isFinite(liveToolResultMaxChars)) {
    return DEFAULT_PARENT_VISIBLE_CHILD_RESULT_MAX_CHARS;
  }
  const liveCap = Math.max(1, Math.trunc(liveToolResultMaxChars));
  return Math.max(
    1,
    Math.min(
      DEFAULT_PARENT_VISIBLE_CHILD_RESULT_MAX_CHARS,
      liveCap - PARENT_VISIBLE_CHILD_RESULT_GUARD_HEADROOM_CHARS,
    ),
  );
}

export function buildParentVisibleChildResult(
  text: string | undefined,
  maxParentVisibleChars = DEFAULT_PARENT_VISIBLE_CHILD_RESULT_MAX_CHARS,
): {
  resultText?: string;
  resultTextHash?: string;
  resultTextByteCount?: number;
  resultMaxParentVisibleChars: number;
  resultTruncated?: boolean;
  resultOversized?: boolean;
} {
  const resolvedMaxParentVisibleChars = Math.max(1, Math.trunc(maxParentVisibleChars));
  const trimmed = text?.trim();
  const base = {
    resultMaxParentVisibleChars: resolvedMaxParentVisibleChars,
  };
  if (!trimmed) {
    return base;
  }
  const resultTextByteCount = Buffer.byteLength(trimmed, "utf8");
  const resultTextHash = crypto.createHash("sha256").update(trimmed).digest("hex");
  if (trimmed.length <= resolvedMaxParentVisibleChars) {
    return {
      ...base,
      resultText: trimmed,
      resultTextHash,
      resultTextByteCount,
      resultTruncated: false,
      resultOversized: false,
    };
  }
  return {
    ...base,
    resultTextHash,
    resultTextByteCount,
    resultTruncated: false,
    resultOversized: true,
  };
}

function childSessionMatchesRequestedAgent(params: {
  childSessionKey: string | undefined;
  requestedAgentId: string;
}): boolean {
  const childSessionKey = normalizeLowercaseStringOrEmpty(params.childSessionKey);
  const requestedAgentId = normalizeLowercaseStringOrEmpty(params.requestedAgentId);
  return Boolean(
    childSessionKey &&
    requestedAgentId &&
    childSessionKey.startsWith(`agent:${requestedAgentId}:subagent:`),
  );
}

function uniqueStringList(values: readonly (string | null | undefined)[], max = 80): string[] {
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim()),
    ),
  ].slice(0, max);
}

function resolveChildProviderToolCatalogAdmission(params: {
  childAgentId: string;
  report: SessionSystemPromptReport;
}): Pick<
  NativeTaskChildBootstrapAdmission,
  | "childToolCatalogAdmitted"
  | "providerToolNames"
  | "requiredToolNames"
  | "missingRequiredToolNames"
  | "forbiddenToolNames"
> {
  const childAgentId = normalizeLowercaseStringOrEmpty(params.childAgentId) || "unknown";
  const requiredToolNames = uniqueStringList(
    REQUIRED_CHILD_PROVIDER_TOOL_NAMES_BY_AGENT_ID[childAgentId] ?? [],
  );
  const requiredToolNameSet = new Set(requiredToolNames);
  const providerToolNames = uniqueStringList(
    params.report.tools.entries.map((entry) => normalizeLowercaseStringOrEmpty(entry.name)),
  );
  const providerToolNameSet = new Set(providerToolNames);
  const missingRequiredToolNames = requiredToolNames.filter(
    (name) => !providerToolNameSet.has(name),
  );
  const forbiddenToolNames = providerToolNames.filter((name) => !requiredToolNameSet.has(name));
  return {
    childToolCatalogAdmitted:
      requiredToolNames.length > 0 &&
      missingRequiredToolNames.length === 0 &&
      forbiddenToolNames.length === 0,
    providerToolNames,
    requiredToolNames,
    missingRequiredToolNames,
    forbiddenToolNames,
  };
}

function reportRefForChildSession(params: {
  childSessionKey: string;
  report: SessionSystemPromptReport;
}): string {
  const hash = crypto.createHash("sha256").update(JSON.stringify(params.report)).digest("hex");
  return `openclaw-system-prompt-report://${encodeURIComponent(params.childSessionKey)}/${hash.slice(
    0,
    20,
  )}`;
}

function sourceLabel(kind: "agent-doc" | "skill", agentId: string, name: string): string {
  return `${kind}:${agentId}:${name}`;
}

function requiredChildCanonicalDocLookups(
  requiredCanonicalDocPaths: readonly string[] | undefined,
): Array<{ docName: (typeof REQUIRED_CHILD_CANONICAL_AGENT_DOCS)[number]; lookup: string }> {
  return REQUIRED_CHILD_CANONICAL_AGENT_DOCS.map((docName, index) => ({
    docName,
    lookup: requiredCanonicalDocPaths?.[index]?.trim() || docName,
  }));
}

function resolveRequiredChildCanonicalDocPaths(childAgentId: string): string[] | undefined {
  try {
    const config = loadConfig();
    const agentDir = resolveAgentDir(config, childAgentId);
    return REQUIRED_CHILD_CANONICAL_AGENT_DOCS.map((docName) => path.join(agentDir, docName));
  } catch {
    return undefined;
  }
}

export function buildChildBootstrapAdmission(params: {
  childSessionKey: string;
  childAgentId: string;
  report: SessionSystemPromptReport | null;
  requiredCanonicalDocPaths?: readonly string[];
}): NativeTaskChildBootstrapAdmission {
  const childAgentId = normalizeLowercaseStringOrEmpty(params.childAgentId) || "unknown";
  const requiredSkillName = REQUIRED_CHILD_SKILL_BY_AGENT_ID[childAgentId];
  if (!params.report) {
    return {
      providerReportObserved: false,
      childAgentId,
      canonicalDocsAdmitted: false,
      requiredSkillAdmitted: false,
      childToolCatalogAdmitted: false,
      providerToolNames: [],
      requiredToolNames: uniqueStringList(
        REQUIRED_CHILD_PROVIDER_TOOL_NAMES_BY_AGENT_ID[childAgentId] ?? [],
      ),
      missingRequiredToolNames: uniqueStringList(
        REQUIRED_CHILD_PROVIDER_TOOL_NAMES_BY_AGENT_ID[childAgentId] ?? [],
      ),
      forbiddenToolNames: [],
      missingRequiredSources: uniqueStringList([
        ...REQUIRED_CHILD_CANONICAL_AGENT_DOCS.map((docName) =>
          sourceLabel("agent-doc", childAgentId, docName),
        ),
        requiredSkillName ? sourceLabel("skill", childAgentId, requiredSkillName) : null,
      ]),
      truncatedRequiredSources: [],
      reasonCodes: ["native_task_child_provider_prompt_report_not_observed"],
    };
  }

  const docLookups = requiredChildCanonicalDocLookups(params.requiredCanonicalDocPaths);
  const admissionDecision = evaluateRequiredProviderContextAdmission({
    report: params.report,
    required: {
      workspaceFileNames: docLookups.map((doc) => doc.lookup),
      skillNames: requiredSkillName ? [requiredSkillName] : [],
      rejectTruncatedWorkspaceFiles: true,
    },
  });
  const missingDocs = docLookups
    .filter((doc) => admissionDecision.missingWorkspaceFileNames.includes(doc.lookup))
    .map((doc) => sourceLabel("agent-doc", childAgentId, doc.docName));
  const truncatedDocs = docLookups
    .filter((doc) => admissionDecision.truncatedWorkspaceFileNames.includes(doc.lookup))
    .map((doc) => sourceLabel("agent-doc", childAgentId, doc.docName));
  const skillEntry = requiredSkillName
    ? params.report.skills.entries.find((entry) => entry.name.trim() === requiredSkillName)
    : undefined;
  const requiredSkillAdmitted = requiredSkillName
    ? !admissionDecision.missingSkillNames.includes(requiredSkillName)
    : true;
  const missingRequiredSources = uniqueStringList([
    ...missingDocs,
    requiredSkillAdmitted || !requiredSkillName
      ? null
      : sourceLabel("skill", childAgentId, requiredSkillName),
  ]);
  const truncatedRequiredSources = uniqueStringList(truncatedDocs);
  const canonicalDocsAdmitted = missingDocs.length === 0 && truncatedDocs.length === 0;
  const toolCatalogAdmission = resolveChildProviderToolCatalogAdmission({
    childAgentId,
    report: params.report,
  });
  return {
    providerReportObserved: true,
    childAgentId,
    canonicalDocsAdmitted,
    requiredSkillAdmitted,
    ...toolCatalogAdmission,
    requiredSkillSourceRef: skillEntry?.sourceRef ?? null,
    requiredSkillSourceHash: skillEntry?.sourceHash ?? null,
    requiredSkillLocation: skillEntry?.location ?? null,
    missingRequiredSources,
    truncatedRequiredSources,
    reportRef: reportRefForChildSession({
      childSessionKey: params.childSessionKey,
      report: params.report,
    }),
    reasonCodes: uniqueStringList([
      "native_task_child_provider_prompt_report_observed",
      canonicalDocsAdmitted
        ? "native_task_child_canonical_docs_admitted_to_provider_context"
        : "native_task_child_canonical_docs_missing_from_provider_context",
      requiredSkillAdmitted
        ? "native_task_child_required_skill_admitted_to_provider_context"
        : "native_task_child_required_skill_missing_from_provider_context",
      toolCatalogAdmission.childToolCatalogAdmitted
        ? "native_task_child_provider_tool_catalog_admitted"
        : "native_task_child_provider_tool_catalog_invalid",
      toolCatalogAdmission.missingRequiredToolNames.length > 0
        ? "native_task_child_provider_tool_catalog_missing_required_tools"
        : null,
      toolCatalogAdmission.forbiddenToolNames.length > 0
        ? "native_task_child_provider_tool_catalog_forbidden_tools"
        : null,
      truncatedRequiredSources.length > 0
        ? "native_task_child_bootstrap_required_sources_truncated"
        : null,
    ]),
  };
}

export function classifyChildBootstrapAdmissionFailure(
  admission: NativeTaskChildBootstrapAdmission,
): NativeTaskChildStartFailureKind | undefined {
  if (!admission.providerReportObserved) {
    return "child_provider_bootstrap_report_missing";
  }
  if (admission.truncatedRequiredSources.length > 0) {
    return "child_provider_bootstrap_truncated";
  }
  if (!admission.canonicalDocsAdmitted) {
    return "child_docs_missing";
  }
  if (!admission.requiredSkillAdmitted) {
    return "child_skill_missing";
  }
  if (!admission.childToolCatalogAdmitted) {
    return "child_tool_catalog_invalid";
  }
  return undefined;
}

async function readChildSystemPromptReport(params: {
  childSessionKey: string;
  childAgentId: string;
}): Promise<SessionSystemPromptReport | null> {
  try {
    const config = loadConfig();
    const parsed = parseAgentSessionKey(params.childSessionKey);
    const agentId = normalizeLowercaseStringOrEmpty(parsed?.agentId ?? params.childAgentId);
    const agentConfig = resolveAgentConfig(config, agentId);
    const storePath = agentConfig?.agentDir
      ? resolveSessionStorePathForAgentDir(agentConfig.agentDir)
      : resolveStorePath(config.session?.store, { agentId });
    const store = loadSessionStore(storePath, { skipCache: true });
    const resolved = resolveSessionStoreEntry({ store, sessionKey: params.childSessionKey });
    return resolved.existing?.systemPromptReport ?? null;
  } catch {
    return null;
  }
}

function classifySpawnFailure(result: SpawnSubagentResult): NativeTaskChildStartFailureKind {
  const error = result.error?.toLowerCase() ?? "";
  if (error.includes("not allowed") || error.includes("allowagents")) {
    return "disallowed_child_agent";
  }
  if (
    error.includes("profile") ||
    error.includes("agent not found") ||
    error.includes("not configured")
  ) {
    return "missing_child_profile";
  }
  if (error.includes("identity") || error.includes("bootstrap") || error.includes("agent docs")) {
    return "child_docs_missing";
  }
  if (error.includes("skill")) {
    return "child_skill_missing";
  }
  if (error.includes("tool") || error.includes("catalog")) {
    return "child_tool_catalog_invalid";
  }
  if (
    error.includes("workspace") ||
    error.includes("cwd") ||
    error.includes("directory") ||
    error.includes("permission") ||
    error.includes("unwritable") ||
    error.includes("eacces") ||
    error.includes("enoent")
  ) {
    return "child_workspace_unavailable";
  }
  if (error.includes("lock")) {
    return "child_session_lock_failure";
  }
  if (
    error.includes("provider") ||
    error.includes("model") ||
    error.includes("api") ||
    error.includes("auth")
  ) {
    return "child_provider_model_failure";
  }
  return result.status === "forbidden"
    ? "child_session_start_forbidden"
    : "child_session_start_failed";
}

function classifyForegroundFailure(
  status: NativeTaskForegroundResult["status"],
): NativeTaskChildStartFailureKind | undefined {
  if (status === "timeout") {
    return "child_run_timeout";
  }
  if (status === "error") {
    return "child_run_error";
  }
  return undefined;
}

async function waitForForegroundSubagentTaskResult(params: {
  childSessionKey: string;
  runId: string;
  requestedAgentId: string;
  runTimeoutSeconds?: number;
  parentVisibleResultMaxChars?: number;
  readChildSystemPromptReport?: ChildSystemPromptReportReader;
}): Promise<NativeTaskForegroundResult> {
  const timeoutSeconds =
    typeof params.runTimeoutSeconds === "number" && Number.isFinite(params.runTimeoutSeconds)
      ? Math.max(1, Math.trunc(params.runTimeoutSeconds))
      : DEFAULT_FOREGROUND_TASK_TIMEOUT_SECONDS;
  const wait = await waitForAgentRun({
    runId: params.runId,
    timeoutMs: timeoutSeconds * 1000,
  });
  const outcome = outcomeFromWait(wait);
  const resultText = await readSubagentOutput(params.childSessionKey, outcome).catch(
    () => undefined,
  );
  const childReport = await (params.readChildSystemPromptReport ?? readChildSystemPromptReport)({
    childSessionKey: params.childSessionKey,
    childAgentId: params.requestedAgentId,
  });
  const boundedResult = buildParentVisibleChildResult(
    resultText,
    params.parentVisibleResultMaxChars,
  );
  const childBootstrapAdmission = buildChildBootstrapAdmission({
    childSessionKey: params.childSessionKey,
    childAgentId: params.requestedAgentId,
    report: childReport,
    requiredCanonicalDocPaths: resolveRequiredChildCanonicalDocPaths(params.requestedAgentId),
  });
  const childBootstrapFailureKind =
    wait.status === "ok"
      ? classifyChildBootstrapAdmissionFailure(childBootstrapAdmission)
      : undefined;
  const childResultFailureKind =
    wait.status === "ok" && boundedResult.resultOversized === true
      ? "child_result_oversized"
      : undefined;
  const status =
    childBootstrapFailureKind || childResultFailureKind ? "error" : normalizeForegroundStatus(wait);
  const childStartFailureKind =
    childBootstrapFailureKind ?? childResultFailureKind ?? classifyForegroundFailure(status);
  return {
    status,
    foreground: true,
    childSessionKey: params.childSessionKey,
    runId: params.runId,
    waitStatus: wait.status,
    ...(typeof wait.startedAt === "number" ? { startedAt: wait.startedAt } : {}),
    ...(typeof wait.endedAt === "number" ? { endedAt: wait.endedAt } : {}),
    ...(wait.error ? { error: wait.error } : {}),
    ...boundedResult,
    continuationId: buildNativeTaskContinuationId({
      childSessionKey: params.childSessionKey,
      runId: params.runId,
    }),
    resultDeliveredToParentContext:
      status === "completed" &&
      boundedResult.resultOversized !== true &&
      Boolean(boundedResult.resultText?.trim()),
    childBootstrapAdmission,
    ...(childStartFailureKind ? { childStartFailureKind } : {}),
  };
}

function stripParentVisibleResultText<T extends NativeTaskForegroundResult>(
  result: T,
): Omit<T, "resultText"> {
  const { resultText: _resultText, ...rest } = result;
  return rest;
}

function enforceParentVisibleChildResultBudget(
  result: NativeTaskForegroundResult,
  maxParentVisibleChars: number,
): NativeTaskForegroundResult {
  if (!result.resultText?.trim()) {
    return result;
  }
  const bounded = buildParentVisibleChildResult(result.resultText, maxParentVisibleChars);
  if (bounded.resultOversized !== true) {
    return {
      ...result,
      ...bounded,
      resultDeliveredToParentContext:
        result.status === "completed" && Boolean(bounded.resultText?.trim()),
    };
  }
  return {
    ...result,
    ...bounded,
    status: "error",
    resultText: undefined,
    resultDeliveredToParentContext: false,
    childStartFailureKind: "child_result_oversized",
  };
}

function formatNativeTaskParentVisibleText(params: {
  requestedAgentId: string;
  result: NativeTaskForegroundResult;
}): string {
  const decisionFooter = buildParentDecisionFooter(params.requestedAgentId);
  if (params.result.status === "completed" && params.result.resultText?.trim()) {
    return [
      `Task result from ${params.requestedAgentId} (${params.result.status}).`,
      "",
      params.result.resultText.trim(),
      decisionFooter,
    ].join("\n");
  }
  if (params.result.childStartFailureKind === "child_result_oversized") {
    return [
      `Task result from ${params.requestedAgentId} was too large for parent-visible edit context.`,
      "",
      `The child result was ${params.result.resultTextByteCount ?? "unknown"} bytes and exceeded the ${params.result.resultMaxParentVisibleChars ?? DEFAULT_PARENT_VISIBLE_CHILD_RESULT_MAX_CHARS} character parent-visible cap.`,
      "No truncated source excerpt was delivered to the parent. Do not edit from partial context.",
      "Delegate a narrower follow-up task asking the scout for fewer, exact bounded source windows around the specific edit target.",
      decisionFooter,
    ].join("\n");
  }
  if (params.result.status === "pending") {
    return [
      `Task result from ${params.requestedAgentId} is still pending at the foreground wait checkpoint.`,
      "",
      params.result.continuationId ? `continuationId: ${params.result.continuationId}` : null,
      "Do not spawn duplicate scout work for the same question. Do not edit or finish from missing child output.",
      "Parent decision required: update todo, then call task again with the same agentId and continuationId to wait for the child result, or finish/block only if the child is no longer needed.",
    ]
      .filter((line): line is string => typeof line === "string" && line.length > 0)
      .join("\n");
  }
  return [
    `Task result from ${params.requestedAgentId} did not produce parent-visible edit context.`,
    `status: ${params.result.status}`,
    params.result.childStartFailureKind
      ? `childStartFailureKind: ${params.result.childStartFailureKind}`
      : null,
    params.result.error ? `error: ${params.result.error}` : null,
    decisionFooter,
  ]
    .filter((line): line is string => typeof line === "string" && line.length > 0)
    .join("\n");
}

function buildParentDecisionFooter(requestedAgentId: string): string {
  if (requestedAgentId === "execution-context-scout") {
    return [
      "",
      "Parent decision required: update todo, then choose one: enough for minimal edit / need more context / blocked.",
      "If enough, make the smallest useful edit from the returned bounded source windows. If not, delegate another focused context scout task with the missing question.",
    ].join("\n");
  }
  if (requestedAgentId === "execution-validation-scout") {
    return [
      "",
      "Parent decision required: update todo, then choose one: node/todo complete / repair from current context / need more context / blocked.",
      "Then repair, delegate more context, validate again, call node_finish, or finish with a typed blocker.",
    ].join("\n");
  }
  return "";
}

export function createNativeTaskTool(
  opts: {
    allowedAgentIds: readonly string[];
    agentSessionKey?: string;
    agentChannel?: GatewayMessageChannel;
    agentAccountId?: string;
    agentTo?: string;
    agentThreadId?: string | number;
    requesterAgentIdOverride?: string;
    parentVisibleResultMaxChars?: number;
    spawnSubagent?: typeof spawnSubagentDirect;
    waitForForegroundResult?: (params: {
      childSessionKey: string;
      runId: string;
      requestedAgentId: string;
      runTimeoutSeconds?: number;
      parentVisibleResultMaxChars?: number;
      readChildSystemPromptReport?: ChildSystemPromptReportReader;
    }) => Promise<NativeTaskForegroundResult>;
    readChildSystemPromptReport?: ChildSystemPromptReportReader;
  } & SpawnedToolContext,
): AnyAgentTool {
  const allowedAgentIds = normalizeAllowedAgentIds(opts.allowedAgentIds);
  const allowedText = Array.from(allowedAgentIds).join(", ") || "none";
  return {
    label: "Task",
    name: "task",
    displaySummary: "Delegate bounded work to an allowed child agent.",
    description: [
      "Delegate a bounded foreground task to an allowed child agent through native OpenClaw sessions.",
      `Allowed child agents: ${allowedText}.`,
      "Use execution-context-scout for source/search/read mapping and execution-validation-scout for validation command selection, execution, and diagnosis.",
      "For execution-context-scout, ask for bounded inline source windows plus a compact file_graph when multiple files or symbols matter.",
      "The child runs with fresh context by default and reports results back to the parent session. Do not use this for lifecycle finish; parent execution-coding owns node_finish.",
    ].join("\n"),
    parameters: NativeTaskToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const agentId = normalizeLowercaseStringOrEmpty(
        readStringParam(params, "agentId", { required: true, label: "agentId" }),
      );
      if (!allowedAgentIds.has(agentId)) {
        throw new ToolInputError(
          `task agentId must be one of ${allowedText}; got ${agentId || "<empty>"}.`,
        );
      }
      const label = readStringParam(params, "label");
      const rawTimeout = readNumberParam(params, "runTimeoutSeconds", {
        integer: true,
        label: "runTimeoutSeconds",
      });
      const runTimeoutSeconds =
        typeof rawTimeout === "number" && Number.isFinite(rawTimeout)
          ? Math.max(0, Math.trunc(rawTimeout))
          : undefined;
      const spawnSubagent = opts.spawnSubagent ?? spawnSubagentDirect;
      const waitForForegroundResult =
        opts.waitForForegroundResult ?? waitForForegroundSubagentTaskResult;
      const parentVisibleResultMaxChars = resolveParentVisibleChildResultMaxChars(
        opts.parentVisibleResultMaxChars,
      );
      const continuationId = readStringParam(params, "continuationId");
      const continuation = continuationId ? parseNativeTaskContinuationId(continuationId) : null;
      if (continuationId && !continuation) {
        throw new ToolInputError(
          "task continuationId must be a token returned by a previous pending native task result.",
        );
      }
      if (
        continuation &&
        !childSessionMatchesRequestedAgent({
          childSessionKey: continuation.childSessionKey,
          requestedAgentId: agentId,
        })
      ) {
        throw new ToolInputError(
          `task continuationId child session does not match requested agentId ${agentId}.`,
        );
      }
      if (continuation) {
        const foregroundResult = await waitForForegroundResult({
          childSessionKey: continuation.childSessionKey,
          runId: continuation.runId,
          requestedAgentId: agentId,
          runTimeoutSeconds,
          parentVisibleResultMaxChars,
          readChildSystemPromptReport: opts.readChildSystemPromptReport,
        });
        const parentVisibleForegroundResult = enforceParentVisibleChildResultBudget(
          {
            ...foregroundResult,
            continuationId: continuationIdForForegroundResult(foregroundResult),
          },
          parentVisibleResultMaxChars,
        );
        const details = {
          ...stripParentVisibleResultText(parentVisibleForegroundResult),
          sourceTool: "task",
          requestedAgentId: agentId,
          childIdentityVerified: true,
          continuationUsed: true,
        };
        return textResult(
          formatNativeTaskParentVisibleText({
            requestedAgentId: agentId,
            result: parentVisibleForegroundResult,
          }),
          details,
        );
      }
      const task = readStringParam(params, "task", { required: true, label: "task" });
      const result: SpawnSubagentResult = await spawnSubagent(
        {
          task,
          label: label || undefined,
          agentId,
          runTimeoutSeconds,
          thread: false,
          mode: "run",
          cleanup: "keep",
          sandbox: "inherit",
          lightContext: false,
          leafTask: true,
          expectsCompletionMessage: true,
        },
        {
          agentSessionKey: opts.agentSessionKey,
          agentChannel: opts.agentChannel,
          agentAccountId: opts.agentAccountId,
          agentTo: opts.agentTo,
          agentThreadId: opts.agentThreadId,
          agentGroupId: opts.agentGroupId,
          agentGroupChannel: opts.agentGroupChannel,
          agentGroupSpace: opts.agentGroupSpace,
          requesterAgentIdOverride: opts.requesterAgentIdOverride,
          workspaceDir: opts.workspaceDir,
        },
      );
      if (result.status !== "accepted") {
        return jsonResult({
          ...result,
          sourceTool: "task",
          requestedAgentId: agentId,
          foreground: true,
          resultDeliveredToParentContext: false,
          childStartFailureKind: classifySpawnFailure(result),
        });
      }
      if (!result.childSessionKey?.trim() || !result.runId?.trim()) {
        return jsonResult({
          ...result,
          status: "error",
          error: "task accepted without childSessionKey/runId; cannot wait for child result.",
          sourceTool: "task",
          requestedAgentId: agentId,
          foreground: true,
          resultDeliveredToParentContext: false,
          childStartFailureKind: "child_session_receipt_incomplete",
        });
      }
      if (
        !childSessionMatchesRequestedAgent({
          childSessionKey: result.childSessionKey,
          requestedAgentId: agentId,
        })
      ) {
        return jsonResult({
          ...result,
          status: "error",
          error: `task child session identity mismatch; requested ${agentId} but received ${result.childSessionKey}.`,
          sourceTool: "task",
          requestedAgentId: agentId,
          foreground: true,
          resultDeliveredToParentContext: false,
          childStartFailureKind: "wrong_child_identity_selected",
          childIdentityVerified: false,
        });
      }
      const foregroundResult = await waitForForegroundResult({
        childSessionKey: result.childSessionKey,
        runId: result.runId,
        requestedAgentId: agentId,
        runTimeoutSeconds,
        parentVisibleResultMaxChars,
        readChildSystemPromptReport: opts.readChildSystemPromptReport,
      });
      const parentVisibleForegroundResult = enforceParentVisibleChildResultBudget(
        {
          ...foregroundResult,
          continuationId: continuationIdForForegroundResult(foregroundResult),
        },
        parentVisibleResultMaxChars,
      );
      const details = {
        ...result,
        ...stripParentVisibleResultText(parentVisibleForegroundResult),
        sourceTool: "task",
        requestedAgentId: agentId,
        childIdentityVerified: true,
      };
      return textResult(
        formatNativeTaskParentVisibleText({
          requestedAgentId: agentId,
          result: parentVisibleForegroundResult,
        }),
        details,
      );
    },
  };
}
