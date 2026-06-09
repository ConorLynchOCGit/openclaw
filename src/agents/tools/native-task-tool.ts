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
import { projectStructuredWorkingContextText } from "../../config/sessions/working-context.js";
import { parseAgentSessionKey } from "../../routing/session-key.js";
import { normalizeLowercaseStringOrEmpty } from "../../shared/string-coerce.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import {
  findAgentPackRegistryEntry,
  loadAgentPackRegistryEntries,
  type AgentPackRegistryEntry,
} from "../agent-pack-registry.js";
import { resolveAgentConfig, resolveAgentProjectRootDir } from "../agent-scope.js";
import { resolveSourceBackedAgentBootstrapFilePaths } from "../bootstrap-files.js";
import { waitForAgentRun, type AgentWaitResult } from "../run-wait.js";
import type {
  NativeTaskChildBootstrapAdmission,
  NativeTaskChildStartFailureKind,
  NativeTaskForegroundResult,
  NativeTaskResultDeliveryStatus,
  NativeTaskRunChildTask,
} from "../session-runtime/native-task-types.js";
import { buildRequiredActiveSkillSnapshot, type SkillSnapshot } from "../skills.js";
import type { SpawnedToolContext } from "../spawned-context.js";
import { readSubagentOutput, type SubagentRunOutcome } from "../subagent-announce-output.js";
import { spawnSubagentDirect, type SpawnSubagentResult } from "../subagent-spawn.js";
import {
  evaluateRequiredProviderContextAdmission,
  type RequiredProviderContextAdmission,
  type RequiredProviderSkillSource,
} from "../system-prompt-report.js";
import { MAX_SAFE_AGENT_TIMEOUT_MS } from "../timeout.js";
import type { AnyAgentTool } from "./common.js";
import { readNumberParam, readStringParam, textResult, ToolInputError } from "./common.js";

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
});

function normalizeAllowedAgentIds(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => normalizeLowercaseStringOrEmpty(value)).filter(Boolean));
}

export type {
  NativeTaskChildBootstrapAdmission,
  NativeTaskChildStartFailureKind,
  NativeTaskForegroundResult,
  NativeTaskRunChildTask,
  NativeTaskRunChildTaskParams,
} from "../session-runtime/native-task-types.js";

type ChildSystemPromptReportReader = (params: {
  childSessionKey: string;
  childAgentId: string;
}) => Promise<SessionSystemPromptReport | null>;

export type RequiredChildBootstrapAdmissionSources = {
  requiredCanonicalDocNames: string[];
  requiredCanonicalDocPaths: string[];
  requiredSkillNames: string[];
  requiredSkillSources: RequiredProviderSkillSource[];
  requiredSkillsSnapshot?: SkillSnapshot;
  requiredToolNames: string[];
  forbiddenToolNames: string[];
  registryContractIssues: string[];
};

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

function projectUnstructuredChildResultPreview(params: { text: string; maxChars: number }): string {
  const maxChars = Math.max(1, Math.trunc(params.maxChars));
  const text = params.text.trim();
  const header = [
    "Projected oversized unstructured child result preview:",
    `originalBytes=${Buffer.byteLength(text, "utf8")}`,
    "OpenClaw preserved a bounded preview instead of rejecting the task result. Do not edit from this preview unless it contains sufficient exact source windows; otherwise update todo and ask a narrower scout follow-up.",
    "",
  ].join("\n");
  const suffix = "\n[unstructured child result preview truncated]";
  const previewBudget = Math.max(1, maxChars - header.length - suffix.length);
  const projected = `${header}${text.slice(0, previewBudget).trimEnd()}${suffix}`;
  if (projected.length <= maxChars) {
    return projected;
  }
  return projected.slice(0, maxChars).trimEnd();
}

export function buildParentVisibleChildResult(
  text: string | undefined,
  maxParentVisibleChars = DEFAULT_PARENT_VISIBLE_CHILD_RESULT_MAX_CHARS,
): {
  resultText?: string;
  resultTextHash?: string;
  resultTextByteCount?: number;
  resultMaxParentVisibleChars: number;
  resultDeliveryStatus: NativeTaskResultDeliveryStatus;
  resultTruncated?: boolean;
} {
  const resolvedMaxParentVisibleChars = Math.max(1, Math.trunc(maxParentVisibleChars));
  const trimmed = text?.trim();
  const base = {
    resultMaxParentVisibleChars: resolvedMaxParentVisibleChars,
  };
  if (!trimmed) {
    return { ...base, resultDeliveryStatus: "rejected" };
  }
  const resultTextByteCount = Buffer.byteLength(trimmed, "utf8");
  const resultTextHash = crypto.createHash("sha256").update(trimmed).digest("hex");
  if (trimmed.length <= resolvedMaxParentVisibleChars) {
    return {
      ...base,
      resultText: trimmed,
      resultTextHash,
      resultTextByteCount,
      resultDeliveryStatus: "full",
      resultTruncated: false,
    };
  }
  const projectedText = projectStructuredWorkingContextText({
    text: trimmed,
    maxChars: resolvedMaxParentVisibleChars,
  });
  if (projectedText) {
    return {
      ...base,
      resultText: projectedText,
      resultTextHash,
      resultTextByteCount,
      resultDeliveryStatus: "projected",
      resultTruncated: true,
    };
  }
  const previewText = projectUnstructuredChildResultPreview({
    text: trimmed,
    maxChars: resolvedMaxParentVisibleChars,
  });
  return {
    ...base,
    resultText: previewText,
    resultTextHash,
    resultTextByteCount,
    resultDeliveryStatus: "projected",
    resultTruncated: true,
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
  requiredToolNames?: readonly string[];
  forbiddenToolNames?: readonly string[];
}): Pick<
  NativeTaskChildBootstrapAdmission,
  | "childToolCatalogAdmitted"
  | "providerToolNames"
  | "requiredToolNames"
  | "missingRequiredToolNames"
  | "forbiddenToolNames"
> {
  const requiredToolNames = uniqueStringList(params.requiredToolNames ?? []);
  const requiredToolNameSet = new Set(requiredToolNames);
  const configuredForbiddenToolNameSet = new Set(uniqueStringList(params.forbiddenToolNames ?? []));
  const providerToolNames = uniqueStringList(
    params.report.tools.entries.map((entry) => normalizeLowercaseStringOrEmpty(entry.name)),
  );
  const providerToolNameSet = new Set(providerToolNames);
  const missingRequiredToolNames = requiredToolNames.filter(
    (name) => !providerToolNameSet.has(name),
  );
  const forbiddenToolNames = uniqueStringList([
    ...providerToolNames.filter((name) => !requiredToolNameSet.has(name)),
    ...providerToolNames.filter((name) => configuredForbiddenToolNameSet.has(name)),
  ]);
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
  requiredDocNames: readonly string[] | undefined,
  requiredCanonicalDocPaths: readonly string[] | undefined,
): Array<{ docName: string; lookup: string }> {
  const docNames = requiredDocNames?.length ? [...requiredDocNames] : [];
  return docNames.map((docName, index) => ({
    docName,
    lookup: requiredCanonicalDocPaths?.[index]?.trim() || docName,
  }));
}

function unresolvedChildDocPaths(
  childAgentId: string,
  requiredDocNames: readonly string[],
): string[] {
  return requiredDocNames.map(
    (docName) => `openclaw-required-child-doc-unresolved://${childAgentId}/${docName}`,
  );
}

function requiredProviderSkillSourcesFromSnapshot(
  snapshot: SkillSnapshot,
): RequiredProviderSkillSource[] {
  return (snapshot.activeContextSources ?? []).map((source) => ({
    name: source.name,
    path: source.path,
    sourceRef: source.sourceRef,
    sourceHash: source.sourceHash,
  }));
}

function requiredChildDocNamesFromRegistryEntry(
  entry: AgentPackRegistryEntry | null | undefined,
): string[] {
  return entry?.requiredDocs?.length ? [...entry.requiredDocs] : [];
}

function requiredChildSkillNamesFromRegistryEntry(input: {
  entry: AgentPackRegistryEntry | null | undefined;
}): string[] {
  return input.entry?.primarySkills?.length ? [...input.entry.primarySkills] : [];
}

function requiredChildToolNamesFromRegistryEntry(input: {
  entry: AgentPackRegistryEntry | null | undefined;
}): string[] {
  return input.entry?.requiredTools?.length ? [...input.entry.requiredTools] : [];
}

function forbiddenChildToolNamesFromRegistryEntry(
  entry: AgentPackRegistryEntry | null | undefined,
): string[] {
  return entry?.forbiddenTools?.length ? [...entry.forbiddenTools] : [];
}

function childAgentPackContractIssues(input: {
  childAgentId: string;
  entry: AgentPackRegistryEntry | null | undefined;
}): string[] {
  const issues: string[] = [];
  if (!input.entry) {
    return [`native_task_child_registry_contract_missing:${input.childAgentId}`];
  }
  if (!input.entry.requiredDocs?.length) {
    issues.push(
      `native_task_child_registry_contract_field_missing:${input.childAgentId}:requiredDocs`,
    );
  }
  if (!input.entry.primarySkills?.length) {
    issues.push(
      `native_task_child_registry_contract_field_missing:${input.childAgentId}:primarySkills`,
    );
  }
  if (!input.entry.requiredTools?.length) {
    issues.push(
      `native_task_child_registry_contract_field_missing:${input.childAgentId}:requiredTools`,
    );
  }
  if (!input.entry.forbiddenTools?.length) {
    issues.push(
      `native_task_child_registry_contract_field_missing:${input.childAgentId}:forbiddenTools`,
    );
  }
  return issues;
}

function resolveRequiredChildSkillContext(input: {
  childAgentId: string;
  requiredSkillNames: readonly string[];
}): {
  requiredSkillSources: RequiredProviderSkillSource[];
  requiredSkillsSnapshot?: SkillSnapshot;
} {
  if (input.requiredSkillNames.length === 0) {
    return { requiredSkillSources: [] };
  }
  try {
    const config = loadConfig();
    const workspaceDir = resolveAgentProjectRootDir(config, input.childAgentId);
    const requiredSkillsSnapshot = buildRequiredActiveSkillSnapshot(workspaceDir, {
      config,
      agentId: input.childAgentId,
      requiredSkillNames: input.requiredSkillNames,
    });
    return {
      requiredSkillSources: requiredProviderSkillSourcesFromSnapshot(requiredSkillsSnapshot),
      requiredSkillsSnapshot,
    };
  } catch {
    return {
      requiredSkillSources: input.requiredSkillNames.map((requiredSkillName) => ({
        name: requiredSkillName,
        path: `openclaw-required-child-skill-unresolved://${input.childAgentId}/${requiredSkillName}`,
        sourceHash: null,
      })),
    };
  }
}

export async function resolveRequiredChildBootstrapAdmissionSources(
  childAgentId: string,
): Promise<RequiredChildBootstrapAdmissionSources> {
  const normalizedChildAgentId = normalizeLowercaseStringOrEmpty(childAgentId);
  let requiredCanonicalDocNames: string[] = [];
  let requiredSkillNames: string[] = [];
  let requiredToolNames: string[] = [];
  let forbiddenToolNames: string[] = [];
  let registryContractIssues: string[] = [];
  let requiredCanonicalDocPaths: string[];
  try {
    const config = loadConfig();
    const registryEntries = await loadAgentPackRegistryEntries();
    const childPackEntry = findAgentPackRegistryEntry({
      entries: registryEntries,
      agentId: normalizedChildAgentId,
    });
    registryContractIssues = childAgentPackContractIssues({
      childAgentId: normalizedChildAgentId,
      entry: childPackEntry,
    });
    requiredCanonicalDocNames = requiredChildDocNamesFromRegistryEntry(childPackEntry);
    requiredSkillNames = requiredChildSkillNamesFromRegistryEntry({
      entry: childPackEntry,
    });
    requiredToolNames = requiredChildToolNamesFromRegistryEntry({
      entry: childPackEntry,
    });
    forbiddenToolNames = forbiddenChildToolNamesFromRegistryEntry(childPackEntry);
    requiredCanonicalDocPaths =
      (await resolveSourceBackedAgentBootstrapFilePaths({
        config,
        agentId: normalizedChildAgentId,
        fileNames: requiredCanonicalDocNames,
      })) ??
      requiredCanonicalDocNames.map((docName) =>
        path.join(
          resolveAgentProjectRootDir(config, normalizedChildAgentId),
          "docs",
          "agents",
          normalizedChildAgentId,
          "runtime",
          docName,
        ),
      );
  } catch {
    registryContractIssues = [
      `native_task_child_registry_contract_unavailable:${normalizedChildAgentId}`,
    ];
    requiredCanonicalDocPaths = unresolvedChildDocPaths(
      normalizedChildAgentId,
      requiredCanonicalDocNames,
    );
  }
  const requiredSkillContext = resolveRequiredChildSkillContext({
    childAgentId: normalizedChildAgentId,
    requiredSkillNames,
  });
  return {
    requiredCanonicalDocNames,
    requiredCanonicalDocPaths,
    requiredSkillNames,
    requiredSkillSources: requiredSkillContext.requiredSkillSources,
    ...(requiredSkillContext.requiredSkillsSnapshot
      ? { requiredSkillsSnapshot: requiredSkillContext.requiredSkillsSnapshot }
      : {}),
    requiredToolNames,
    forbiddenToolNames,
    registryContractIssues,
  };
}

function buildRequiredChildProviderContextAdmission(params: {
  childAgentId: string;
  sources: RequiredChildBootstrapAdmissionSources;
}): RequiredProviderContextAdmission {
  return {
    workspaceFileNames: params.sources.requiredCanonicalDocPaths,
    skillNames: params.sources.requiredSkillNames,
    skillSources: params.sources.requiredSkillSources,
    rejectTruncatedWorkspaceFiles: true,
  };
}

export function buildChildBootstrapAdmission(params: {
  childSessionKey: string;
  childAgentId: string;
  report: SessionSystemPromptReport | null;
  requiredCanonicalDocNames?: readonly string[];
  requiredCanonicalDocPaths?: readonly string[];
  requiredSkillNames?: readonly string[];
  requiredSkillSources?: readonly RequiredProviderSkillSource[];
  requiredToolNames?: readonly string[];
  forbiddenToolNames?: readonly string[];
}): NativeTaskChildBootstrapAdmission {
  const childAgentId = normalizeLowercaseStringOrEmpty(params.childAgentId) || "unknown";
  const requiredSkillNames = params.requiredSkillNames?.length
    ? uniqueStringList(params.requiredSkillNames)
    : [];
  const requiredToolNames = params.requiredToolNames?.length
    ? uniqueStringList(params.requiredToolNames)
    : [];
  const requiredDocNames = params.requiredCanonicalDocNames?.length
    ? uniqueStringList(params.requiredCanonicalDocNames)
    : [];
  if (!params.report) {
    return {
      providerReportObserved: false,
      childAgentId,
      canonicalDocsAdmitted: false,
      requiredSkillAdmitted: false,
      childToolCatalogAdmitted: false,
      providerToolNames: [],
      requiredToolNames,
      missingRequiredToolNames: requiredToolNames,
      forbiddenToolNames: [],
      missingRequiredSources: uniqueStringList([
        ...requiredDocNames.map((docName) => sourceLabel("agent-doc", childAgentId, docName)),
        ...requiredSkillNames.map((skillName) => sourceLabel("skill", childAgentId, skillName)),
      ]),
      truncatedRequiredSources: [],
      reasonCodes: ["native_task_child_provider_prompt_report_not_observed"],
    };
  }

  const docLookups = requiredChildCanonicalDocLookups(
    requiredDocNames,
    params.requiredCanonicalDocPaths,
  );
  const admissionDecision = evaluateRequiredProviderContextAdmission({
    report: params.report,
    required: {
      workspaceFileNames: docLookups.map((doc) => doc.lookup),
      skillNames: requiredSkillNames,
      skillSources: params.requiredSkillSources,
      rejectTruncatedWorkspaceFiles: true,
    },
  });
  const missingDocs = docLookups
    .filter((doc) => admissionDecision.missingWorkspaceFileNames.includes(doc.lookup))
    .map((doc) => sourceLabel("agent-doc", childAgentId, doc.docName));
  const truncatedDocs = docLookups
    .filter((doc) => admissionDecision.truncatedWorkspaceFileNames.includes(doc.lookup))
    .map((doc) => sourceLabel("agent-doc", childAgentId, doc.docName));
  const firstRequiredSkillName = requiredSkillNames[0] ?? null;
  const skillEntry = firstRequiredSkillName
    ? params.report.skills.entries.find((entry) => entry.name.trim() === firstRequiredSkillName)
    : undefined;
  const requiredSkillAdmitted = requiredSkillNames.every(
    (skillName) => !admissionDecision.missingSkillNames.includes(skillName),
  );
  const missingRequiredSources = uniqueStringList([
    ...missingDocs,
    ...requiredSkillNames
      .filter((skillName) => admissionDecision.missingSkillNames.includes(skillName))
      .map((skillName) => sourceLabel("skill", childAgentId, skillName)),
  ]);
  const truncatedRequiredSources = uniqueStringList(truncatedDocs);
  const canonicalDocsAdmitted = missingDocs.length === 0 && truncatedDocs.length === 0;
  const toolCatalogAdmission = resolveChildProviderToolCatalogAdmission({
    childAgentId,
    report: params.report,
    requiredToolNames,
    forbiddenToolNames: params.forbiddenToolNames,
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
      ...(admissionDecision.reasonCodes.includes(
        "provider_context_required_skill_sources_mismatched",
      )
        ? ["native_task_child_required_skill_sources_mismatched"]
        : []),
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
  return admission.providerReportObserved &&
    admission.truncatedRequiredSources.length === 0 &&
    admission.canonicalDocsAdmitted &&
    admission.requiredSkillAdmitted &&
    admission.childToolCatalogAdmitted
    ? undefined
    : "child_launch_blocked";
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
    return "child_session_lock_failed";
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
  requiredBootstrapAdmissionSources?: RequiredChildBootstrapAdmissionSources;
  readChildSystemPromptReport?: ChildSystemPromptReportReader;
}): Promise<NativeTaskForegroundResult> {
  const timeoutMs =
    typeof params.runTimeoutSeconds === "number" && Number.isFinite(params.runTimeoutSeconds)
      ? Math.trunc(params.runTimeoutSeconds) <= 0
        ? MAX_SAFE_AGENT_TIMEOUT_MS
        : Math.trunc(params.runTimeoutSeconds) * 1000
      : MAX_SAFE_AGENT_TIMEOUT_MS;
  const wait = await waitForAgentRun({
    runId: params.runId,
    timeoutMs,
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
  const requiredBootstrapSources =
    params.requiredBootstrapAdmissionSources ??
    (await resolveRequiredChildBootstrapAdmissionSources(params.requestedAgentId));
  const childBootstrapAdmission = buildChildBootstrapAdmission({
    childSessionKey: params.childSessionKey,
    childAgentId: params.requestedAgentId,
    report: childReport,
    requiredCanonicalDocNames: requiredBootstrapSources.requiredCanonicalDocNames,
    requiredCanonicalDocPaths: requiredBootstrapSources.requiredCanonicalDocPaths,
    requiredSkillNames: requiredBootstrapSources.requiredSkillNames,
    requiredSkillSources: requiredBootstrapSources.requiredSkillSources,
    requiredToolNames: requiredBootstrapSources.requiredToolNames,
    forbiddenToolNames: requiredBootstrapSources.forbiddenToolNames,
  });
  const childBootstrapFailureKind =
    wait.status === "ok"
      ? classifyChildBootstrapAdmissionFailure(childBootstrapAdmission)
      : undefined;
  const childResultFailureKind =
    wait.status === "ok" && boundedResult.resultDeliveryStatus === "rejected"
      ? "child_result_unshaped"
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
      status === "completed" && Boolean(boundedResult.resultText?.trim()),
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
  if (bounded.resultDeliveryStatus !== "rejected") {
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
    childStartFailureKind: "child_result_unshaped",
  };
}

function renderNativeTaskOutput(params: {
  childSessionKey?: string;
  state: "completed" | "running" | "error";
  summary?: string;
  text: string;
}): string {
  const tag = params.state === "error" ? "task_error" : "task_result";
  const taskId = params.childSessionKey?.trim() || "unknown";
  return [
    `<task id="${taskId}" state="${params.state}">`,
    params.summary ? `<summary>${params.summary}</summary>` : null,
    `<${tag}>`,
    params.text,
    `</${tag}>`,
    "</task>",
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");
}

function formatNativeTaskParentVisibleText(params: {
  requestedAgentId: string;
  result: NativeTaskForegroundResult;
}): string {
  const decisionFooter = buildParentDecisionFooter(params.requestedAgentId);
  if (params.result.status === "completed" && params.result.resultText?.trim()) {
    const projected = params.result.resultDeliveryStatus === "projected";
    return renderNativeTaskOutput({
      childSessionKey: params.result.childSessionKey,
      state: "completed",
      summary: `Task result from ${params.requestedAgentId} (${params.result.status}${projected ? ", projected" : ""}).`,
      text: [params.result.resultText.trim(), decisionFooter].join("\n"),
    });
  }
  if (params.result.childStartFailureKind === "child_result_unshaped") {
    return renderNativeTaskOutput({
      childSessionKey: params.result.childSessionKey,
      state: "error",
      summary: `Task result from ${params.requestedAgentId} was rejected.`,
      text: [
        `Task result from ${params.requestedAgentId} was too large and did not expose structured parent-visible edit context.`,
        "",
        `The child result was ${params.result.resultTextByteCount ?? "unknown"} bytes and exceeded the ${params.result.resultMaxParentVisibleChars ?? DEFAULT_PARENT_VISIBLE_CHILD_RESULT_MAX_CHARS} character parent-visible cap.`,
        "No structured inline_context_windows/file_graph projection was available. Do not edit from partial context.",
        "Delegate a narrower follow-up task asking the scout for one exact missing source window or finish blocked if this is repeated.",
        decisionFooter,
      ].join("\n"),
    });
  }
  if (params.result.childStartFailureKind === "child_provider_response_timeout") {
    const validationScout = params.requestedAgentId === "execution-validation-scout";
    return renderNativeTaskOutput({
      childSessionKey: params.result.childSessionKey,
      state: "error",
      summary: `Task delegation to ${params.requestedAgentId} timed out before parent-visible context was delivered.`,
      text: [
        `Task delegation to ${params.requestedAgentId} hit a provider response timeout before parent-visible child context was delivered.`,
        `status: ${params.result.status}`,
        "childStartFailureKind: child_provider_response_timeout",
        params.result.error ? `error: ${params.result.error}` : null,
        validationScout
          ? "If retrying validation, ask for the narrowest command/result needed for the current changed files and request bounded output only."
          : "If retrying context, ask for one exact missing source window or a smaller map pass; do not ask for full files or broad dumps.",
        buildParentFailureDecisionFooter(),
      ]
        .filter((line): line is string => typeof line === "string" && line.length > 0)
        .join("\n"),
    });
  }
  if (params.result.status === "pending") {
    return renderNativeTaskOutput({
      childSessionKey: params.result.childSessionKey,
      state: "running",
      summary: `Task result from ${params.requestedAgentId} is pending.`,
      text: [
        `Task result from ${params.requestedAgentId} is still pending at the foreground wait checkpoint.`,
        "",
        params.result.continuationId ? `continuationId: ${params.result.continuationId}` : null,
        "Do not spawn duplicate scout work for the same question. Do not edit or finish from missing child output.",
        "Parent decision required: update todo, then call task again with the same agentId and continuationId to wait for the child result, or finish/block only if the child is no longer needed.",
      ]
        .filter((line): line is string => typeof line === "string" && line.length > 0)
        .join("\n"),
    });
  }
  return renderNativeTaskOutput({
    childSessionKey: params.result.childSessionKey,
    state: params.result.status === "error" ? "error" : "running",
    summary: `Task result from ${params.requestedAgentId} did not deliver parent-visible context.`,
    text: [
      `Task result from ${params.requestedAgentId} did not produce parent-visible edit context.`,
      `status: ${params.result.status}`,
      params.result.childStartFailureKind
        ? `childStartFailureKind: ${params.result.childStartFailureKind}`
        : null,
      params.result.error ? `error: ${params.result.error}` : null,
      params.result.status === "error" ? buildParentFailureDecisionFooter() : decisionFooter,
    ]
      .filter((line): line is string => typeof line === "string" && line.length > 0)
      .join("\n"),
  });
}

function buildParentDecisionFooter(requestedAgentId: string): string {
  if (requestedAgentId === "execution-context-scout") {
    return [
      "",
      "Parent decision required: update todo, then choose one: enough for minimal edit / need exact follow-up / need map pass / blocked.",
      "If enough, make the smallest useful edit from the returned bounded source windows. If one local window is missing, delegate an exact follow-up. If files or architecture are still ambiguous, delegate a map pass. If source is missing, finish with a typed blocker.",
    ].join("\n");
  }
  if (requestedAgentId === "execution-validation-scout") {
    return [
      "",
      "Parent decision required: update todo, then choose one: complete / repair from current context / need more context / blocked.",
      "Then repair, delegate more context, validate again, call node_finish, or finish with a typed blocker.",
    ].join("\n");
  }
  return "";
}

function buildParentFailureDecisionFooter(): string {
  return [
    "",
    "Parent decision required: update todo, then finish with node_finish blocked unless you already have enough source context to proceed safely. Do not probe gateway-status. Do not use openclaw_resource_read for file:// paths.",
  ].join("\n");
}

function formatNativeTaskFailureParentVisibleText(params: {
  requestedAgentId: string;
  details: Record<string, unknown>;
}): string {
  const kind =
    typeof params.details.childStartFailureKind === "string"
      ? params.details.childStartFailureKind
      : "unknown";
  const status = typeof params.details.status === "string" ? params.details.status : "error";
  const error = typeof params.details.error === "string" ? params.details.error : undefined;
  return renderNativeTaskOutput({
    childSessionKey:
      typeof params.details.childSessionKey === "string"
        ? params.details.childSessionKey
        : undefined,
    state: "error",
    summary: `Task delegation to ${params.requestedAgentId} failed.`,
    text: [
      `Task delegation to ${params.requestedAgentId} failed before parent-visible child context was delivered.`,
      `status: ${status}`,
      `childStartFailureKind: ${kind}`,
      error ? `error: ${error}` : null,
      buildParentFailureDecisionFooter(),
    ]
      .filter((line): line is string => typeof line === "string" && line.length > 0)
      .join("\n"),
  });
}

function assertChildRegistryContractComplete(
  sources: RequiredChildBootstrapAdmissionSources,
): void {
  if (sources.registryContractIssues.length === 0) {
    return;
  }
  throw new ToolInputError(
    `task child agent registry contract incomplete: ${sources.registryContractIssues.join(", ")}`,
  );
}

type NativeTaskToolInternalOptions = {
  allowedAgentIds: readonly string[];
  agentSessionKey?: string;
  agentChannel?: GatewayMessageChannel;
  agentAccountId?: string;
  agentTo?: string;
  agentThreadId?: string | number;
  requesterAgentIdOverride?: string;
  parentVisibleResultMaxChars?: number;
  spawnSubagent?: typeof spawnSubagentDirect;
  runChildTask?: NativeTaskRunChildTask;
  legacyGatewayTaskRuntime?: boolean;
  waitForForegroundResult?: (params: {
    childSessionKey: string;
    runId: string;
    requestedAgentId: string;
    runTimeoutSeconds?: number;
    parentVisibleResultMaxChars?: number;
    requiredBootstrapAdmissionSources?: RequiredChildBootstrapAdmissionSources;
    readChildSystemPromptReport?: ChildSystemPromptReportReader;
  }) => Promise<NativeTaskForegroundResult>;
  readChildSystemPromptReport?: ChildSystemPromptReportReader;
} & SpawnedToolContext;

export function createNativeTaskTool(
  opts: Omit<
    NativeTaskToolInternalOptions,
    "spawnSubagent" | "waitForForegroundResult" | "legacyGatewayTaskRuntime"
  > & { runChildTask: NativeTaskRunChildTask },
): AnyAgentTool {
  if (!opts.runChildTask) {
    throw new Error("native task tool requires OpenClaw session-runtime runChildTask");
  }
  return createNativeTaskToolInternal(opts);
}

export function createLegacyGatewayNativeTaskToolForTest(
  opts: Omit<NativeTaskToolInternalOptions, "runChildTask" | "legacyGatewayTaskRuntime">,
): AnyAgentTool {
  return createNativeTaskToolInternal({
    ...opts,
    legacyGatewayTaskRuntime: true,
  });
}

function createNativeTaskToolInternal(opts: NativeTaskToolInternalOptions): AnyAgentTool {
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
      "Context scout results should include answer, edit_start_recommendation, high_signal_refs, inline_context_windows, evidence-backed file_graph edges, likely_edit_points, exact follow-up asks, and risks_or_unknowns.",
      "Do not ask context scouts for full files or broad dumps; ask for the minimum edit-start package needed for the next safe edit.",
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
      const rawTimeout =
        opts.legacyGatewayTaskRuntime === true
          ? readNumberParam(params, "runTimeoutSeconds", {
              integer: true,
              label: "runTimeoutSeconds",
            })
          : undefined;
      const runTimeoutSeconds =
        opts.legacyGatewayTaskRuntime === true &&
        typeof rawTimeout === "number" &&
        Number.isFinite(rawTimeout)
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
        if (opts.legacyGatewayTaskRuntime !== true) {
          throw new ToolInputError(
            "task continuationId is unavailable for node-worker native task runtime; legacy gateway continuation is disabled.",
          );
        }
        const requiredBootstrapSources =
          await resolveRequiredChildBootstrapAdmissionSources(agentId);
        assertChildRegistryContractComplete(requiredBootstrapSources);
        const foregroundResult = await waitForForegroundResult({
          childSessionKey: continuation.childSessionKey,
          runId: continuation.runId,
          requestedAgentId: agentId,
          runTimeoutSeconds,
          parentVisibleResultMaxChars,
          requiredBootstrapAdmissionSources: requiredBootstrapSources,
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
      if (opts.runChildTask) {
        const foregroundResult = await opts.runChildTask({
          parentSessionKey: opts.agentSessionKey,
          parentToolCallId: _toolCallId,
          childAgentId: agentId,
          task,
          ...(label ? { label } : {}),
          ...(typeof runTimeoutSeconds === "number" ? { runTimeoutSeconds } : {}),
          parentVisibleResultMaxChars,
        });
        if (
          !childSessionMatchesRequestedAgent({
            childSessionKey: foregroundResult.childSessionKey,
            requestedAgentId: agentId,
          })
        ) {
          const details = {
            ...stripParentVisibleResultText(foregroundResult),
            status: "error",
            error: `task child session identity mismatch; requested ${agentId} but received ${foregroundResult.childSessionKey}.`,
            sourceTool: "task",
            requestedAgentId: agentId,
            foreground: true,
            resultDeliveredToParentContext: false,
            childStartFailureKind: "wrong_child_identity_selected",
            childIdentityVerified: false,
          };
          return textResult(
            formatNativeTaskFailureParentVisibleText({
              requestedAgentId: agentId,
              details,
            }),
            details,
          );
        }
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
          nativeChildSessionRuntime: true,
        };
        return textResult(
          formatNativeTaskParentVisibleText({
            requestedAgentId: agentId,
            result: parentVisibleForegroundResult,
          }),
          details,
        );
      }
      if (opts.legacyGatewayTaskRuntime !== true) {
        const details = {
          status: "blocked",
          error:
            "task requires native child-session runtime; legacy gateway task fallback is disabled.",
          sourceTool: "task",
          requestedAgentId: agentId,
          foreground: true,
          resultDeliveredToParentContext: false,
          childStartFailureKind: "child_runtime_unavailable",
        };
        return textResult(
          formatNativeTaskFailureParentVisibleText({
            requestedAgentId: agentId,
            details,
          }),
          details,
        );
      }
      const requiredBootstrapSources = await resolveRequiredChildBootstrapAdmissionSources(agentId);
      assertChildRegistryContractComplete(requiredBootstrapSources);
      const requiredProviderContextAdmission = buildRequiredChildProviderContextAdmission({
        childAgentId: agentId,
        sources: requiredBootstrapSources,
      });
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
          requiredProviderContextAdmission,
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
        const details = {
          ...result,
          sourceTool: "task",
          requestedAgentId: agentId,
          foreground: true,
          resultDeliveredToParentContext: false,
          childStartFailureKind: classifySpawnFailure(result),
        };
        return textResult(
          formatNativeTaskFailureParentVisibleText({
            requestedAgentId: agentId,
            details,
          }),
          details,
        );
      }
      if (!result.childSessionKey?.trim() || !result.runId?.trim()) {
        const details = {
          ...result,
          status: "error",
          error: "task accepted without childSessionKey/runId; cannot wait for child result.",
          sourceTool: "task",
          requestedAgentId: agentId,
          foreground: true,
          resultDeliveredToParentContext: false,
          childStartFailureKind: "child_session_receipt_incomplete",
        };
        return textResult(
          formatNativeTaskFailureParentVisibleText({
            requestedAgentId: agentId,
            details,
          }),
          details,
        );
      }
      if (
        !childSessionMatchesRequestedAgent({
          childSessionKey: result.childSessionKey,
          requestedAgentId: agentId,
        })
      ) {
        const details = {
          ...result,
          status: "error",
          error: `task child session identity mismatch; requested ${agentId} but received ${result.childSessionKey}.`,
          sourceTool: "task",
          requestedAgentId: agentId,
          foreground: true,
          resultDeliveredToParentContext: false,
          childStartFailureKind: "wrong_child_identity_selected",
          childIdentityVerified: false,
        };
        return textResult(
          formatNativeTaskFailureParentVisibleText({
            requestedAgentId: agentId,
            details,
          }),
          details,
        );
      }
      const foregroundResult = await waitForForegroundResult({
        childSessionKey: result.childSessionKey,
        runId: result.runId,
        requestedAgentId: agentId,
        runTimeoutSeconds,
        parentVisibleResultMaxChars,
        requiredBootstrapAdmissionSources: requiredBootstrapSources,
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
