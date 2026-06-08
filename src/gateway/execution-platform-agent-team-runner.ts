import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSON5 from "json5";
import {
  AcpCodexCodingWorkerAdapter,
  CodingTeamRuntimeJobRunner,
  HumanOperatorInputRequiredError,
  ModelCloseoutCapsuleReporter,
  NODE_FINISH_ARTIFACT_TYPE,
  NODE_AGENT_WORKER_PROMPT_ARTIFACT_TYPE,
  NODE_AGENT_WORKER_PROMPT_SCHEMA_VERSION,
  NODE_PROMPT_AUTHORING_FAILURE_DIAGNOSTIC_ARTIFACT_TYPE,
  NODE_AGENT_SESSION_TRACE_ARTIFACT_TYPE,
  NODE_EXECUTION_STORAGE_POLICY,
  OpenRouterAgentTeamModelClient,
  RuntimeArtifactNodeExecutionRunStore,
  RuntimeWorkerSupervisor,
  authorNodeExecutionPrompt,
  buildNodeAgentSessionTrace,
  createExecutionPlatformResourceReadTool,
  createOpenRouterProviderTextTurnClient,
  deriveNodeAgentStepBudgetFromSnapshot,
  runNodeAgentSession,
  type RuntimeToolKernel,
  type AcpCodexCodingWorkerRunResult,
  type AgentTeamClaimedJobExecutionResult,
  type JsonValue,
  type NodeFinish,
  type NodeAgentWorkerPrompt,
  type NodeAgentStartReceipt,
  type NodeAgentToolPolicyExplanation,
  type NodeExecutionRunRecord,
  type NodeExecutionSnapshot,
  type ProviderTextTurnModelClient,
  type RuntimeJobRepository,
  type RuntimeWorkGraphNodeAgentSessionRunner,
  type RuntimeWorkGraphSchedulerOptions,
  type RuntimeWorkGraphRepository,
  type WorkQueueRepository,
} from "../../extensions/execution-platform/runtime-api.js";
import { CodexAppServerJsonExecutor } from "../../extensions/model-memory/src/mmv2/codex-app-server-json-executor.js";
import {
  findAgentPackRegistryEntry,
  loadAgentPackRegistryEntries,
  type AgentPackRegistryEntry,
} from "../agents/agent-pack-registry.js";
import {
  resolveAgentConfig,
  resolveAgentDir,
  resolveAgentEffectiveModelPrimary,
  resolveAgentProjectRootDir,
  resolveAgentSkillsFilter,
} from "../agents/agent-scope.js";
import { withExternalCliAuthSyncSuppressed } from "../agents/auth-profiles.js";
import { resolveSourceBackedAgentBootstrapFilePaths } from "../agents/bootstrap-files.js";
import { DEFAULT_PROVIDER } from "../agents/defaults.js";
import { parseModelRef } from "../agents/model-selection.js";
import { runEmbeddedPiAgent } from "../agents/pi-embedded-runner/run.js";
import { discoverAuthStorage, discoverModels } from "../agents/pi-model-discovery.js";
import { resolveEffectiveToolPolicyAccess } from "../agents/pi-tools.policy.js";
import { buildRequiredActiveSkillSnapshot, type SkillSnapshot } from "../agents/skills.js";
import {
  evaluateRequiredProviderContextAdmission,
  type RequiredProviderSkillSource,
} from "../agents/system-prompt-report.js";
import {
  getRuntimeConfigSnapshot,
  getRuntimeConfigSourceSnapshot,
  loadConfig,
  resolveConfigPath,
  resolveConfigSnapshotHash,
} from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import { normalizeRuntimePathAliases } from "../config/runtime-source-record.js";
import { updateSessionLaunch } from "../config/sessions/launch.js";
import { buildSessionLaunchLocation } from "../config/sessions/location.js";
import { resolveSessionFilePath, resolveStorePath } from "../config/sessions/paths.js";
import { readSessionTodo } from "../config/sessions/todo.js";
import type { SessionSystemPromptReport } from "../config/sessions/types.js";

export type GatewayAgentTeamRunOnceResult = {
  claimed: boolean;
  completed: boolean;
  failed: boolean;
  status: string;
  runtimeJobId: string | null;
  teamRunId: string | null;
  workflowId: "agent_team.coding";
  workerId: string;
  reasonCodes: string[];
};

function createGatewayCloseoutReporter(): ModelCloseoutCapsuleReporter {
  return new ModelCloseoutCapsuleReporter({
    executor: new CodexAppServerJsonExecutor({
      cwd: process.cwd(),
      requestTimeoutMs: 300_000,
      reasoningEffort: "medium",
    }),
    modelId: "openai-codex/gpt-5.5",
    reasoningEffort: "medium",
    maxOutputTokens: 12_000,
  });
}

export function createGatewayRoleModelClient(): OpenRouterAgentTeamModelClient | undefined {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!openRouterApiKey) {
    return undefined;
  }
  return new OpenRouterAgentTeamModelClient({
    apiKey: openRouterApiKey,
    retryPolicy: {
      maxAttempts: 2,
      timeoutMs: 600_000,
    },
    requestProfilesByModelId: {
      "deepseek/deepseek-v4-pro": {
        responseFormatMode: "native",
        reasoningMode: "omit",
        maxTokens: 1_600,
      },
      "moonshotai/kimi-k2.6": {
        responseFormatMode: "prompt_only",
        reasoningMode: "omit",
        maxTokens: 8_000,
      },
      "qwen/qwen3-coder-next": {
        responseFormatMode: "prompt_only",
        reasoningMode: "none",
        maxTokens: 8_000,
      },
    },
  });
}

type GatewayThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "adaptive";

function normalizeGatewayThinkingLevel(value: unknown): GatewayThinkingLevel | undefined {
  return value === "off" ||
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh" ||
    value === "adaptive"
    ? value
    : undefined;
}

function normalizeGatewayReasoningLevel(value: unknown): "on" | "off" | "stream" | undefined {
  return value === "on" || value === "off" || value === "stream" ? value : undefined;
}

function resolveGatewayAgentThinkingLevel(input: {
  config: ReturnType<typeof loadConfig>;
  agentId: string;
}): GatewayThinkingLevel | undefined {
  const agent = resolveAgentConfig(input.config, input.agentId);
  return (
    normalizeGatewayThinkingLevel(agent?.thinkingDefault) ??
    normalizeGatewayThinkingLevel(input.config.agents?.defaults?.thinkingDefault)
  );
}

function resolveGatewayAgentReasoningLevel(input: {
  config: ReturnType<typeof loadConfig>;
  agentId: string;
}): "on" | "off" | "stream" | undefined {
  const agent = resolveAgentConfig(input.config, input.agentId);
  return normalizeGatewayReasoningLevel(agent?.reasoningDefault);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadSourceBackedConfigForNodeLaunch(): ReturnType<typeof loadConfig> {
  const configPath = resolveConfigPath();
  try {
    const parsed = JSON5.parse(fs.readFileSync(configPath, "utf8")) as unknown;
    if (!isRecord(parsed) || Object.hasOwn(parsed, "$include")) {
      return loadConfig();
    }
    return parsed as ReturnType<typeof loadConfig>;
  } catch {
    return loadConfig();
  }
}

function logNodeAgentStartTiming(
  label: string,
  startedAt: number,
  details: Record<string, unknown> = {},
): void {
  if (process.env.OPENCLAW_NODE_AGENT_START_TIMING !== "1") {
    return;
  }
  process.stderr.write(
    `${JSON.stringify({
      event: "node_agent_start_timing",
      label,
      elapsedMs: Date.now() - startedAt,
      ...details,
    })}\n`,
  );
}

function resolveAgentSessionDir(agentDir: string): string {
  return path.join(path.dirname(path.resolve(agentDir)), "sessions");
}

function canEnsureWritableDirectory(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function existingDirectoryAvailabilityDiagnostic(input: {
  label: string;
  agentId: string;
  dir: string;
}): string | null {
  try {
    const stat = fs.statSync(input.dir);
    if (!stat.isDirectory()) {
      return `${input.label}_not_directory:${input.agentId}`;
    }
    fs.accessSync(input.dir, fs.constants.W_OK);
    return null;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : null;
    return code === "ENOENT"
      ? `${input.label}_missing:${input.agentId}`
      : `${input.label}_unwritable:${input.agentId}`;
  }
}

const MAX_ACTIVE_REQUIRED_SKILL_BYTES = 120_000;

function nodeAgentRequiredSkillNamesFromRegistryEntry(
  entry: AgentPackRegistryEntry | null | undefined,
): string[] {
  return entry?.primarySkills?.length ? [...entry.primarySkills] : [];
}

function nodeAgentRequiredDocNamesFromRegistryEntry(
  entry: AgentPackRegistryEntry | null | undefined,
): string[] {
  return entry?.requiredDocs?.length ? [...entry.requiredDocs] : [];
}

function executionAgentPackContractIssues(input: {
  agentId: string;
  entry: AgentPackRegistryEntry | null | undefined;
  requireAllowedChildAgents?: boolean;
}): string[] {
  const issues: string[] = [];
  if (!input.entry) {
    return [`node_agent_registry_contract_missing:${input.agentId}`];
  }
  if (!input.entry.requiredDocs?.length) {
    issues.push(`node_agent_registry_contract_field_missing:${input.agentId}:requiredDocs`);
  }
  if (!input.entry.primarySkills?.length) {
    issues.push(`node_agent_registry_contract_field_missing:${input.agentId}:primarySkills`);
  }
  if (input.requireAllowedChildAgents && !input.entry.allowedChildAgents?.length) {
    issues.push(`node_agent_registry_contract_field_missing:${input.agentId}:allowedChildAgents`);
  }
  if (!input.entry.requiredTools?.length) {
    issues.push(`node_agent_registry_contract_field_missing:${input.agentId}:requiredTools`);
  }
  if (!input.entry.forbiddenTools?.length) {
    issues.push(`node_agent_registry_contract_field_missing:${input.agentId}:forbiddenTools`);
  }
  return issues;
}

function nodeAgentAllowedChildAgentIdsFromRegistryEntry(
  entry: AgentPackRegistryEntry | null | undefined,
): string[] {
  return entry?.allowedChildAgents?.length ? [...entry.allowedChildAgents] : [];
}

export async function resolveNodeAgentRequiredSkillNames(input: {
  agentId: string;
  entries?: AgentPackRegistryEntry[];
}): Promise<string[]> {
  const entries = input.entries ?? (await loadAgentPackRegistryEntries());
  return nodeAgentRequiredSkillNamesFromRegistryEntry(
    findAgentPackRegistryEntry({ entries, agentId: input.agentId }),
  );
}

export async function resolveNodeAgentAllowedChildAgentIds(input: {
  agentId: string;
  entries?: AgentPackRegistryEntry[];
}): Promise<string[]> {
  const entries = input.entries ?? (await loadAgentPackRegistryEntries());
  return nodeAgentAllowedChildAgentIdsFromRegistryEntry(
    findAgentPackRegistryEntry({ entries, agentId: input.agentId }),
  );
}

export function resolveOpenClawNodeExecutionWorkspaceDir(
  config?: ReturnType<typeof loadConfig>,
  agentId?: string | null,
): string {
  const override = process.env.OPENCLAW_NODE_EXECUTION_WORKSPACE_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  if (config && agentId) {
    return resolveAgentProjectRootDir(config, agentId);
  }
  return path.resolve(process.cwd());
}

function readBoundedUtf8File(filePath: string, maxBytes: number): string | null {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > maxBytes) {
      return null;
    }
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

export function buildNodeExecutionRequiredSkillsSnapshot(input: {
  config: ReturnType<typeof loadConfig>;
  agentId: string;
  requiredSkillNames: readonly string[];
}): SkillSnapshot {
  const requiredSkillNames = [...input.requiredSkillNames];
  const agentSkillWorkspaceDir = resolveAgentProjectRootDir(input.config, input.agentId);
  return buildRequiredActiveSkillSnapshot(agentSkillWorkspaceDir, {
    config: input.config,
    agentId: input.agentId,
    requiredSkillNames,
    maxActiveSkillBytes: MAX_ACTIVE_REQUIRED_SKILL_BYTES,
  });
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

function executionAgentRuntimeDiagnostics(input: {
  agentId: string;
  agentDir: string;
  workspaceDir: string;
}): string[] {
  const diagnostics: string[] = [];
  const workspaceDiagnostic = existingDirectoryAvailabilityDiagnostic({
    label: "node_agent_runtime_workspace",
    agentId: input.agentId,
    dir: input.workspaceDir,
  });
  if (workspaceDiagnostic) {
    diagnostics.push(workspaceDiagnostic);
  }
  if (fs.existsSync(input.agentDir)) {
    const sessionDir = resolveAgentSessionDir(input.agentDir);
    if (!canEnsureWritableDirectory(sessionDir)) {
      diagnostics.push(`node_agent_runtime_session_dir_unwritable:${input.agentId}`);
    }
  }
  return diagnostics;
}

const SOURCE_RUNTIME_UNIFICATION_MANIFEST_REF =
  "repo://docs/system/registries/source-runtime-unification.yaml";

function nodeAgentRequiredToolNamesFromRegistryEntry(
  entry: AgentPackRegistryEntry | null | undefined,
): string[] {
  return entry?.requiredTools?.length ? [...entry.requiredTools] : [];
}

function nodeAgentForbiddenToolNamesFromRegistryEntry(
  entry: AgentPackRegistryEntry | null | undefined,
): string[] {
  return entry?.forbiddenTools?.length ? [...entry.forbiddenTools] : [];
}

function scoutRequiredSkillNamesFromRegistryEntry(input: {
  entry: AgentPackRegistryEntry | null | undefined;
}): string[] {
  return input.entry?.primarySkills?.length ? [...input.entry.primarySkills] : [];
}

function scoutRequiredToolNamesFromRegistryEntry(input: {
  entry: AgentPackRegistryEntry | null | undefined;
}): string[] {
  return input.entry?.requiredTools?.length ? [...input.entry.requiredTools] : [];
}

function scoutForbiddenToolNamesFromRegistryEntry(
  entry: AgentPackRegistryEntry | null | undefined,
): string[] {
  return entry?.forbiddenTools?.length ? [...entry.forbiddenTools] : [];
}

type NodeAgentLaunchProofState = Omit<NodeAgentStartReceipt, "artifactKind" | "schemaVersion">;

type GatewayNodeStartPreparation =
  | {
      status: "accepted";
      receipt: NodeAgentLaunchProofState;
      reasonCodes: string[];
    }
  | {
      status: "blocked";
      blockerKind: string;
      receipt: NodeAgentLaunchProofState;
      reasonCodes: string[];
    };

function uniqueStringList(values: readonly (string | null | undefined)[], max = 120): string[] {
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim()),
    ),
  ].slice(0, max);
}

function stringFromRecord(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function buildNativeTaskParentCatalogBlocker(input: {
  agentId: string;
  toolName: string;
  blockedBy: string;
}): NodeAgentToolPolicyExplanation {
  return {
    agentId: input.agentId,
    toolName: input.toolName,
    allowed: false,
    blockedBy: [input.blockedBy],
    effectiveProfileSource: "none",
    localPolicyExplicit: false,
  };
}

function resolveParentNativeTaskEffectiveToolNames(input: {
  config: ReturnType<typeof loadConfig>;
  nodeRun: NodeExecutionRunRecord;
  requiredToolNames?: readonly string[];
  forbiddenToolNames?: readonly string[];
  modelProvider?: string;
  modelId?: string;
}): string[] {
  const requiredToolNames = input.requiredToolNames?.length ? [...input.requiredToolNames] : [];
  const forbiddenToolNames = input.forbiddenToolNames?.length ? [...input.forbiddenToolNames] : [];
  const nativeTaskParentAllowed = new Set<string>(requiredToolNames);
  const candidateToolNames = uniqueStringList([
    ...requiredToolNames,
    ...forbiddenToolNames,
    "write",
    "apply_patch",
  ]);
  const access = resolveEffectiveToolPolicyAccess({
    config: input.config,
    agentId: input.nodeRun.agentId,
    modelProvider: input.modelProvider,
    modelId: input.modelId,
    toolNames: candidateToolNames,
  });
  return uniqueStringList(
    access
      .filter((entry) => entry.allowed && nativeTaskParentAllowed.has(entry.toolName))
      .map((entry) => entry.toolName),
  );
}

type NodeAgentBootstrapAdmissionProjection = {
  canonicalAgentDocAdmissions: NodeAgentLaunchProofState["canonicalAgentDocAdmissions"];
  requiredSkillContextAdmissions: NodeAgentLaunchProofState["requiredSkillContextAdmissions"];
  summary: NodeAgentLaunchProofState["bootstrapAdmission"];
  reasonCodes: string[];
};

function emptyBootstrapAdmissionSummary(): NodeAgentLaunchProofState["bootstrapAdmission"] {
  return {
    providerReportObserved: false,
    parentCanonicalDocsAdmitted: false,
    parentRequiredSkillsAdmitted: false,
    missingRequiredSources: [],
    truncatedRequiredSources: [],
  };
}

function providerToolNamesFromSystemPromptReport(
  report: SessionSystemPromptReport | null | undefined,
): string[] {
  return uniqueStringList(report?.tools.entries.map((entry) => entry.name) ?? []);
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function normalizeAdmissionName(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? path.basename(trimmed) : "";
}

function normalizeAdmissionPath(value: string | null | undefined): string {
  return value?.trim().replace(/\\/gu, "/").replace(/\/+/gu, "/") ?? "";
}

function admissionLookupHasPathSeparator(value: string): boolean {
  return /[\\/]/u.test(value);
}

function findProviderWorkspaceFileEntry(
  report: SessionSystemPromptReport,
  lookup: string,
): SessionSystemPromptReport["injectedWorkspaceFiles"][number] | undefined {
  if (admissionLookupHasPathSeparator(lookup)) {
    const normalizedLookup = normalizeAdmissionPath(lookup);
    return report.injectedWorkspaceFiles.find(
      (entry) =>
        normalizeAdmissionPath(entry.path) === normalizedLookup ||
        normalizeAdmissionPath(entry.name) === normalizedLookup,
    );
  }
  const normalizedName = normalizeAdmissionName(lookup);
  return report.injectedWorkspaceFiles.find(
    (entry) => normalizeAdmissionName(entry.name || entry.path) === normalizedName,
  );
}

function requiredParentCanonicalDocLookups(
  requiredCanonicalDocNames: readonly string[] | undefined,
  requiredCanonicalDocPaths: readonly string[] | undefined,
): Array<{ docName: string; lookup: string }> {
  const docNames = requiredCanonicalDocNames?.length ? [...requiredCanonicalDocNames] : [];
  return docNames.map((docName, index) => ({
    docName,
    lookup: requiredCanonicalDocPaths?.[index]?.trim() || docName,
  }));
}

function sourceLabel(kind: "agent-doc" | "skill", agentId: string, name: string): string {
  return `${kind}:${agentId}:${name}`;
}

export function buildNodeAgentBootstrapAdmissionFromSystemPromptReport(input: {
  report?: SessionSystemPromptReport | null;
  parentAgentId: string;
  requiredSkillNames: readonly string[];
  requiredSkillSources?: readonly RequiredProviderSkillSource[];
  requiredCanonicalDocNames?: readonly string[];
  requiredCanonicalDocPaths?: readonly string[];
}): NodeAgentBootstrapAdmissionProjection {
  const parentAgentId = input.parentAgentId.trim() || "execution-coding";
  if (!input.report) {
    return {
      canonicalAgentDocAdmissions: [],
      requiredSkillContextAdmissions: [],
      summary: emptyBootstrapAdmissionSummary(),
      reasonCodes: ["node_agent_session_launch_provider_prompt_report_not_observed"],
    };
  }

  const report = input.report;
  const docLookups = requiredParentCanonicalDocLookups(
    input.requiredCanonicalDocNames,
    input.requiredCanonicalDocPaths,
  );
  const admissionDecision = evaluateRequiredProviderContextAdmission({
    report,
    required: {
      workspaceFileNames: docLookups.map((doc) => doc.lookup),
      skillNames: input.requiredSkillNames,
      skillSources: input.requiredSkillSources,
      rejectTruncatedWorkspaceFiles: true,
    },
  });
  const canonicalAgentDocAdmissions = docLookups.map((doc) => {
    const entry = findProviderWorkspaceFileEntry(report, doc.lookup);
    const missing =
      admissionDecision.missingWorkspaceFileNames.includes(doc.lookup) ||
      !entry ||
      entry.missing ||
      entry.injectedChars <= 0;
    const truncated =
      admissionDecision.truncatedWorkspaceFileNames.includes(doc.lookup) ||
      Boolean(entry?.truncated);
    const admitted = !missing && !truncated;
    if (!entry) {
      return {
        agentId: parentAgentId,
        name: doc.docName,
        path: doc.lookup,
        admitted: false,
        missing: true,
        rawChars: 0,
        admittedChars: 0,
        truncated,
      };
    }
    return {
      agentId: parentAgentId,
      name: doc.docName,
      path: entry.path,
      admitted,
      missing,
      rawChars: entry.rawChars,
      admittedChars: entry.injectedChars,
      truncated,
    };
  });

  const skillsByName = new Map(
    input.report.skills.entries.map((entry) => [entry.name.trim(), entry]),
  );
  const requiredSkillContextAdmissions = input.requiredSkillNames.map((skillName) => {
    const entry = skillsByName.get(skillName);
    const admitted =
      (entry?.blockChars ?? 0) > 0 && !admissionDecision.missingSkillNames.includes(skillName);
    return {
      agentId: parentAgentId,
      skillName,
      admitted,
      blockChars: entry?.blockChars ?? 0,
      sourceRef: entry?.sourceRef ?? null,
      sourceHash: entry?.sourceHash ?? null,
      location: entry?.location ?? null,
    };
  });

  const missingRequiredSources = uniqueStringList([
    ...canonicalAgentDocAdmissions
      .filter((entry) => !entry.admitted)
      .map((entry) => sourceLabel("agent-doc", entry.agentId, entry.name)),
    ...requiredSkillContextAdmissions
      .filter((entry) => !entry.admitted)
      .map((entry) => sourceLabel("skill", entry.agentId, entry.skillName)),
  ]);
  const truncatedRequiredSources = uniqueStringList(
    canonicalAgentDocAdmissions
      .filter((entry) => entry.truncated)
      .map((entry) => sourceLabel("agent-doc", entry.agentId, entry.name)),
  );
  const parentCanonicalDocsAdmitted = canonicalAgentDocAdmissions.every((entry) => entry.admitted);
  const parentRequiredSkillsAdmitted = requiredSkillContextAdmissions.every(
    (entry) => entry.admitted,
  );
  return {
    canonicalAgentDocAdmissions,
    requiredSkillContextAdmissions,
    summary: {
      providerReportObserved: true,
      parentCanonicalDocsAdmitted,
      parentRequiredSkillsAdmitted,
      missingRequiredSources,
      truncatedRequiredSources,
    },
    reasonCodes: uniqueStringList([
      "node_agent_bootstrap_provider_report_observed",
      parentCanonicalDocsAdmitted
        ? "node_agent_parent_canonical_docs_admitted_to_provider_context"
        : "node_agent_parent_canonical_docs_missing_from_provider_context",
      parentRequiredSkillsAdmitted
        ? "node_agent_parent_required_skills_admitted_to_provider_context"
        : "node_agent_parent_required_skills_missing_from_provider_context",
      ...(admissionDecision.reasonCodes.includes(
        "provider_context_required_skill_sources_mismatched",
      )
        ? ["node_agent_parent_required_skill_sources_mismatched"]
        : []),
      ...(truncatedRequiredSources.length > 0
        ? ["node_agent_bootstrap_required_sources_truncated"]
        : []),
    ]),
  };
}

function toToolExplanation(input: {
  agentId: string;
  toolName: string;
  allowed: boolean;
  blockedBy: string[];
  effectiveProfileSource: "agent" | "global" | "provider" | "none";
  localPolicyExplicit: boolean;
}): NodeAgentToolPolicyExplanation {
  return {
    agentId: input.agentId,
    toolName: input.toolName,
    allowed: input.allowed,
    blockedBy: input.blockedBy,
    effectiveProfileSource: input.effectiveProfileSource,
    localPolicyExplicit: input.localPolicyExplicit,
  };
}

function resolveActiveConfigReceiptIdentity(input: {
  config: ReturnType<typeof loadConfig>;
}): Pick<
  NodeAgentLaunchProofState,
  "activeConfigPath" | "activeConfigFingerprint" | "activeConfigEpoch"
> {
  const runtimeSnapshot = getRuntimeConfigSnapshot();
  const sourceSnapshot = getRuntimeConfigSourceSnapshot();
  const raw = JSON.stringify(runtimeSnapshot ?? input.config);
  const fingerprint = resolveConfigSnapshotHash({ raw });
  const sourceFingerprint = sourceSnapshot
    ? resolveConfigSnapshotHash({ raw: JSON.stringify(sourceSnapshot) })
    : null;
  return {
    activeConfigPath: resolveConfigPath(),
    activeConfigFingerprint: fingerprint,
    activeConfigEpoch:
      fingerprint || sourceFingerprint
        ? `runtime:${(fingerprint ?? "unknown").slice(0, 16)}:source:${(sourceFingerprint ?? "unknown").slice(0, 16)}`
        : null,
  };
}

function resolveNodeAgentSourceRuntimeLaunch(input: {
  config: ReturnType<typeof loadConfig>;
  agentId: string;
}): NodeAgentLaunchProofState["sourceRuntime"] {
  const runtimeHome = resolveStateDir(process.env);
  const projectRoot = resolveAgentProjectRootDir(input.config, input.agentId);
  return {
    projectRoot,
    executionPlatformDocsRoot: path.join(projectRoot, "docs/projects/execution-platform"),
    runtimeHome,
    runtimeAliases: normalizeRuntimePathAliases(runtimeHome),
    manifestRef: SOURCE_RUNTIME_UNIFICATION_MANIFEST_REF,
  };
}

function nodeAgentSourceRuntimeMetadata(
  receipt: NodeAgentLaunchProofState,
): Record<string, JsonValue> {
  return {
    nodeAgentStartProjectRoot: receipt.sourceRuntime.projectRoot,
    nodeAgentStartExecutionPlatformDocsRoot: receipt.sourceRuntime.executionPlatformDocsRoot,
    nodeAgentStartRuntimeHome: receipt.sourceRuntime.runtimeHome,
    nodeAgentStartRuntimeAliases: receipt.sourceRuntime.runtimeAliases as unknown as JsonValue,
    nodeAgentStartSourceRuntimeManifestRef: receipt.sourceRuntime.manifestRef,
  };
}

function nodeSessionLaunchMetadata(
  launch: Awaited<ReturnType<typeof updateSessionLaunch>>,
): Record<string, JsonValue> {
  return {
    nodeAgentSessionLaunchRef: launch.launchRef,
    nodeAgentSessionLaunchEventRef: launch.persisted ? launch.launchEventRef : null,
    nodeAgentSessionLaunchPersisted: launch.persisted,
    nodeAgentSessionLaunchPersistFailureReason: launch.persisted ? null : launch.reason,
    nodeAgentSessionLaunch: launch.persisted ? (launch.event as unknown as JsonValue) : null,
    nodeAgentSessionLaunchStatus: launch.persisted ? launch.event.admissionStatus : null,
    nodeAgentSessionLaunchBlockerKind: launch.persisted ? (launch.event.blockerKind ?? null) : null,
  };
}

async function recordBlockedNodeSessionLaunch(input: {
  config: ReturnType<typeof loadConfig>;
  nodeRun: NodeExecutionRunRecord;
  receipt: NodeAgentLaunchProofState;
  blockerKind: string;
  blockers?: readonly string[];
  reasonCodes: readonly string[];
  promptHash?: string | null;
  submittedPromptHash?: string | null;
  promptHashMatched?: boolean | null;
}) {
  const location = buildSessionLaunchLocation({
    sourceRoot: input.receipt.sourceRuntime.projectRoot,
    workspaceRoot: input.receipt.cwd,
    stateRoot: input.receipt.sourceRuntime.runtimeHome,
  });
  return await updateSessionLaunch({
    storePath: resolveStorePath(input.config.session?.store, {
      agentId: input.nodeRun.agentId,
    }),
    input: {
      sessionKey: input.nodeRun.sessionKey,
      agentId: input.nodeRun.agentId,
      runId: input.nodeRun.nodeRunId,
      nodeRunId: input.nodeRun.nodeRunId,
      admissionStatus: "blocked",
      blockerKind: input.blockerKind,
      provider: input.receipt.modelProvider ?? undefined,
      model: input.receipt.modelId ?? undefined,
      cwd: input.receipt.cwd ?? undefined,
      resolvedLocation: location.resolvedLocation,
      sourceIdentity: location.sourceIdentity,
      workspaceIdentity: location.workspaceIdentity,
      reasoningLevel: input.receipt.reasoningLevel ?? undefined,
      thinkingLevel: input.receipt.thinkingLevel ?? undefined,
      ...(input.promptHash !== undefined ? { promptHash: input.promptHash } : {}),
      ...(input.submittedPromptHash !== undefined
        ? { submittedPromptHash: input.submittedPromptHash }
        : {}),
      ...(input.promptHashMatched !== undefined
        ? { promptHashMatched: input.promptHashMatched }
        : {}),
      toolCatalogRef: input.receipt.openClawEffectiveToolInventoryRef,
      effectiveToolNames: input.receipt.effectiveToolNames,
      allowedChildAgentIds: input.receipt.allowedSubagentIds,
      blockers: uniqueStringList([...(input.blockers ?? []), input.blockerKind]),
      reasonCodes: input.reasonCodes,
    },
  });
}

function baseNodeAgentLaunchProofState(input: {
  status: "accepted" | "blocked";
  nodeRun: NodeExecutionRunRecord;
  nodeExecutionSnapshot: NodeExecutionSnapshot;
  sessionFilePath: string;
  config: ReturnType<typeof loadConfig>;
  cwd: string | null;
  modelProvider?: string | null;
  modelId?: string | null;
  reasoningLevel?: string | null;
  thinkingLevel?: string | null;
  activeSkillNames?: string[];
  effectiveToolNames?: string[];
  allowedSubagentIds?: string[];
  acceptedRequiredToolNames: string[];
  blockedTools?: NodeAgentToolPolicyExplanation[];
  missingSkills?: Array<{ agentId: string; skillName: string }>;
  missingAssets?: Array<{ agentId: string; assetPath: string }>;
  workspaceFailure?: string | null;
  blockerKind?: string | null;
  reasonCodes: string[];
}): NodeAgentLaunchProofState {
  const configIdentity = resolveActiveConfigReceiptIdentity({ config: input.config });
  const sourceRuntime = resolveNodeAgentSourceRuntimeLaunch({
    config: input.config,
    agentId: input.nodeRun.agentId,
  });
  return {
    status: input.status,
    nodeAttemptId: input.nodeRun.attemptId,
    nodeRunId: input.nodeRun.nodeRunId,
    sessionKey: input.nodeRun.sessionKey,
    promptRef: null,
    promptHash: null,
    submittedPromptHash: null,
    sessionLaunchRef: null,
    sessionLaunchEventRef: null,
    cwd: input.cwd,
    modelProvider: input.modelProvider ?? null,
    modelId: input.modelId ?? null,
    reasoningLevel: input.reasoningLevel ?? null,
    thinkingLevel: input.thinkingLevel ?? null,
    sourceRuntime,
    activeSkillNames: input.activeSkillNames ?? [],
    effectiveToolNames: input.effectiveToolNames ?? input.acceptedRequiredToolNames,
    allowedSubagentIds: input.allowedSubagentIds ?? [],
    snapshotRef: input.nodeExecutionSnapshot.snapshotRef,
    openClawSessionRef: sessionTranscriptRef(input.sessionFilePath),
    openClawSystemPromptReportRef: null,
    openClawEffectiveToolInventoryRef: `openclaw-effective-tool-inventory://${encodeURIComponent(
      input.nodeRun.sessionKey,
    )}`,
    blockers: input.blockerKind ? [input.blockerKind] : [],
    ...configIdentity,
    parentAgentId: input.nodeRun.agentId,
    scoutAgentIds: input.allowedSubagentIds ?? [],
    acceptedRequiredToolNames: input.acceptedRequiredToolNames,
    canonicalAgentDocAdmissions: [],
    requiredSkillContextAdmissions: [],
    bootstrapAdmission: emptyBootstrapAdmissionSummary(),
    sessionFilePath: input.sessionFilePath,
    workerPromptRef: null,
    workerPromptArtifactRef: null,
    workerPromptHash: null,
    workerPromptByteCount: null,
    nativeSessionMessageId: null,
    nativeSessionInitialMessageHash: null,
    nativeSessionTranscriptRef: null,
    promptSessionHashMatch: null,
    promptAuthorModelRunRef: null,
    lockAcquisitionOutcome: "not_observed",
    lockAcquisition: null,
    blockerKind: input.blockerKind ?? null,
    blockedTools: input.blockedTools ?? [],
    missingSkills: input.missingSkills ?? [],
    missingAssets: input.missingAssets ?? [],
    workspaceFailure: input.workspaceFailure ?? null,
    lockOwnerPid: null,
    lockOwnerPidAlive: null,
    reasonCodes: input.reasonCodes,
    storagePolicy: NODE_EXECUTION_STORAGE_POLICY,
  };
}

function lockReasonCodeForReceipt(receipt: NodeAgentLaunchProofState): string | null {
  switch (receipt.lockAcquisitionOutcome) {
    case "stale_lock_reclaimed_acquired":
    case "dead_pid_reclaimed_acquired":
    case "recycled_pid_reclaimed_acquired":
    case "orphan_self_pid_reclaimed_acquired":
      return "node_agent_session_lock_stale_reclaimed";
    case "active_current_session_acquired":
      return "node_agent_session_lock_active";
    case "active_lock_owner_live":
      return "node_agent_session_lock_owner_live";
    case "unreclaimable_lock":
      return "node_agent_session_lock_unreclaimable";
    case "acquisition_timeout":
      return "node_agent_session_lock_acquisition_timeout";
    case "acquired":
      return "node_agent_session_lock_acquired";
    case "not_observed":
    default:
      return null;
  }
}

function blockerKindForLockOutcome(
  outcome: NodeAgentLaunchProofState["lockAcquisitionOutcome"],
): string | null {
  switch (outcome) {
    case "active_lock_owner_live":
      return "node_agent_session_lock_owner_live";
    case "unreclaimable_lock":
      return "node_agent_session_lock_unreclaimable";
    case "acquisition_timeout":
      return "node_agent_session_lock_acquisition_timeout";
    default:
      return null;
  }
}

function withNativeLockTrace(input: {
  receipt: NodeAgentLaunchProofState;
  lockAcquisitionTrace: NodeAgentLaunchProofState["lockAcquisition"] | null | undefined;
}): NodeAgentLaunchProofState {
  const trace = input.lockAcquisitionTrace ?? null;
  const lockAcquisitionOutcome = trace?.outcome ?? input.receipt.lockAcquisitionOutcome;
  const lockBlockerKind = blockerKindForLockOutcome(lockAcquisitionOutcome);
  const next: NodeAgentLaunchProofState = {
    ...input.receipt,
    status: lockBlockerKind ? "blocked" : input.receipt.status,
    lockAcquisitionOutcome,
    lockAcquisition: trace,
    blockerKind: lockBlockerKind ?? input.receipt.blockerKind,
    blockers: lockBlockerKind
      ? uniqueStringList([...input.receipt.blockers, lockBlockerKind])
      : input.receipt.blockers,
    lockOwnerPid: trace?.ownerPid ?? input.receipt.lockOwnerPid,
    lockOwnerPidAlive: trace?.ownerPidAlive ?? input.receipt.lockOwnerPidAlive,
    reasonCodes: uniqueStringList([
      ...input.receipt.reasonCodes,
      trace
        ? "node_agent_session_launch_recorded_native_lock_trace"
        : "node_agent_session_launch_lock_trace_not_observed",
    ]),
  };
  const lockReasonCode = lockReasonCodeForReceipt(next);
  return lockReasonCode
    ? {
        ...next,
        reasonCodes: uniqueStringList([...next.reasonCodes, lockReasonCode]),
      }
    : next;
}

function stableTextHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sessionTranscriptRef(sessionFilePath: string): string {
  return `openclaw-session-file://${encodeURIComponent(sessionFilePath)}`;
}

export function withWorkerPromptSessionProof(input: {
  receipt: NodeAgentLaunchProofState;
  workerPrompt: {
    promptRef: string;
    nodeRunId: string;
    promptHash: string;
    promptByteCount: number;
    modelRunRef: string;
    promptText: string;
  };
  workerPromptArtifactRef: string;
  sessionFilePath: string;
  finalPromptText?: string | null;
  systemPromptReport?: SessionSystemPromptReport | null;
  effectiveToolNames?: string[] | null;
  requiredCanonicalDocNames?: readonly string[];
  requiredCanonicalDocPaths?: readonly string[];
  requiredSkillNames?: readonly string[];
  requiredSkillSources?: readonly RequiredProviderSkillSource[];
  requiredToolNames?: readonly string[];
  forbiddenToolNames?: readonly string[];
  enforceProviderBootstrapAdmission?: boolean;
}): NodeAgentLaunchProofState {
  const nativeInitialPromptText =
    typeof input.finalPromptText === "string"
      ? input.finalPromptText
      : input.workerPrompt.promptText;
  const nativeInitialMessageHash = stableTextHash(nativeInitialPromptText);
  const hashMatches = nativeInitialMessageHash === input.workerPrompt.promptHash;
  const suppliedEffectiveToolNames = uniqueStringList(input.effectiveToolNames ?? []);
  const reportEffectiveToolNames = providerToolNamesFromSystemPromptReport(
    input.systemPromptReport,
  );
  const providerEffectiveToolNames =
    reportEffectiveToolNames.length > 0 ? reportEffectiveToolNames : suppliedEffectiveToolNames;
  const providerToolNameSet = new Set(providerEffectiveToolNames);
  const providerToolCatalogMismatch =
    reportEffectiveToolNames.length > 0 &&
    suppliedEffectiveToolNames.length > 0 &&
    !sameStringSet(reportEffectiveToolNames, suppliedEffectiveToolNames);
  const requiredToolNames = input.requiredToolNames?.length ? [...input.requiredToolNames] : [];
  const forbiddenToolNames = input.forbiddenToolNames?.length ? [...input.forbiddenToolNames] : [];
  const providerMissingRequiredTools =
    input.enforceProviderBootstrapAdmission === true
      ? requiredToolNames.filter((toolName) => !providerToolNameSet.has(toolName))
      : [];
  const providerForbiddenVisibleTools =
    input.enforceProviderBootstrapAdmission === true
      ? forbiddenToolNames.filter((toolName) => providerToolNameSet.has(toolName))
      : [];
  const bootstrapAdmission = buildNodeAgentBootstrapAdmissionFromSystemPromptReport({
    report: input.systemPromptReport,
    parentAgentId: input.receipt.parentAgentId,
    requiredSkillNames: input.requiredSkillNames?.length ? input.requiredSkillNames : [],
    requiredCanonicalDocNames: input.requiredCanonicalDocNames,
    requiredCanonicalDocPaths: input.requiredCanonicalDocPaths,
    requiredSkillSources: input.requiredSkillSources,
  });
  const providerBootstrapBlockers =
    input.enforceProviderBootstrapAdmission === true
      ? uniqueStringList([
          bootstrapAdmission.summary.providerReportObserved
            ? null
            : "node_agent_provider_bootstrap_report_missing",
          bootstrapAdmission.summary.parentCanonicalDocsAdmitted
            ? null
            : "node_agent_provider_canonical_docs_missing",
          bootstrapAdmission.summary.parentRequiredSkillsAdmitted
            ? null
            : "node_agent_provider_required_skills_missing",
          bootstrapAdmission.summary.truncatedRequiredSources.length > 0
            ? "node_agent_provider_bootstrap_sources_truncated"
            : null,
        ])
      : [];
  const providerToolCatalogBlockers =
    input.enforceProviderBootstrapAdmission === true
      ? uniqueStringList([
          providerToolCatalogMismatch ? "node_agent_provider_tool_catalog_mismatch" : null,
          providerMissingRequiredTools.length > 0
            ? "node_agent_provider_tool_catalog_missing_required_tool"
            : null,
          providerForbiddenVisibleTools.length > 0
            ? "node_agent_provider_forbidden_tool_visible_in_catalog"
            : null,
        ])
      : [];
  const bootstrapBlocked = providerBootstrapBlockers.length > 0;
  const providerToolCatalogBlocked = providerToolCatalogBlockers.length > 0;
  const blockerKind = !hashMatches
    ? "node_agent_prompt_session_write_mismatch"
    : bootstrapBlocked
      ? providerBootstrapBlockers[0]
      : providerToolCatalogBlocked
        ? providerToolCatalogBlockers[0]
        : input.receipt.blockerKind;
  return {
    ...input.receipt,
    promptRef: input.workerPrompt.promptRef,
    promptHash: input.workerPrompt.promptHash,
    submittedPromptHash: nativeInitialMessageHash,
    workerPromptRef: input.workerPrompt.promptRef,
    workerPromptArtifactRef: input.workerPromptArtifactRef,
    workerPromptHash: input.workerPrompt.promptHash,
    workerPromptByteCount: input.workerPrompt.promptByteCount,
    nativeSessionMessageId: `openclaw-session-message://${encodeURIComponent(
      input.receipt.sessionKey,
    )}/initial/${input.workerPrompt.promptHash.slice(0, 20)}`,
    nativeSessionInitialMessageHash: nativeInitialMessageHash,
    nativeSessionTranscriptRef: sessionTranscriptRef(input.sessionFilePath),
    openClawSystemPromptReportRef: input.systemPromptReport
      ? `openclaw-system-prompt-report://${encodeURIComponent(
          input.receipt.sessionKey,
        )}/${stableTextHash(JSON.stringify(input.systemPromptReport)).slice(0, 20)}`
      : input.receipt.openClawSystemPromptReportRef,
    canonicalAgentDocAdmissions: bootstrapAdmission.canonicalAgentDocAdmissions,
    requiredSkillContextAdmissions: bootstrapAdmission.requiredSkillContextAdmissions,
    bootstrapAdmission: bootstrapAdmission.summary,
    effectiveToolNames: providerEffectiveToolNames.length
      ? providerEffectiveToolNames
      : input.receipt.effectiveToolNames,
    promptSessionHashMatch: hashMatches,
    promptAuthorModelRunRef: input.workerPrompt.modelRunRef,
    blockerKind,
    status:
      hashMatches && !bootstrapBlocked && !providerToolCatalogBlocked
        ? input.receipt.status
        : "blocked",
    blockers: uniqueStringList([
      ...input.receipt.blockers,
      ...(!hashMatches ? ["node_agent_prompt_session_write_mismatch"] : []),
      ...providerBootstrapBlockers,
      ...providerToolCatalogBlockers,
    ]),
    reasonCodes: uniqueStringList([
      ...input.receipt.reasonCodes,
      "node_agent_session_launch_records_worker_prompt_ref",
      "node_agent_session_launch_records_submitted_prompt_hash",
      ...(reportEffectiveToolNames.length
        ? ["node_agent_session_launch_records_provider_report_tool_names"]
        : []),
      ...(providerEffectiveToolNames.length
        ? ["node_agent_session_launch_records_provider_effective_tool_names"]
        : []),
      ...(providerToolCatalogMismatch ? ["node_agent_provider_tool_catalog_mismatch"] : []),
      ...providerMissingRequiredTools.map(
        (toolName) => `node_agent_provider_tool_catalog_missing_required_tool:${toolName}`,
      ),
      ...providerForbiddenVisibleTools.map(
        (toolName) => `node_agent_provider_forbidden_tool_visible_in_catalog:${toolName}`,
      ),
      ...(providerToolCatalogBlocked
        ? ["node_agent_provider_tool_catalog_admission_blocked"]
        : ["node_agent_provider_tool_catalog_admitted"]),
      hashMatches
        ? "node_agent_prompt_session_hash_match"
        : "node_agent_prompt_session_write_mismatch",
      ...(input.enforceProviderBootstrapAdmission === true
        ? ["node_agent_session_launch_enforces_provider_bootstrap_admission"]
        : ["node_agent_session_launch_provider_bootstrap_admission_deferred_to_native_precheck"]),
      ...(bootstrapBlocked ? ["node_agent_provider_bootstrap_admission_blocked"] : []),
      ...providerBootstrapBlockers,
      ...bootstrapAdmission.reasonCodes,
    ]),
  };
}

function fixedWorkerPromptDiagnostics(promptText: string): string[] {
  const lower = promptText.toLowerCase();
  const diagnostics: string[] = [];
  if (/```json|^\s*\{[\s\S]*"requirementId"/u.test(promptText)) {
    diagnostics.push("prompt_quality_possible_artifact_dump");
  }
  if (!lower.includes("update_plan")) {
    diagnostics.push("prompt_quality_missing_update_plan");
  }
  if (!lower.includes("node_finish") && !lower.includes("node.finish")) {
    diagnostics.push("prompt_quality_missing_node_finish");
  }
  if (!/done when|success gates?|completion criteria/u.test(lower)) {
    diagnostics.push("prompt_quality_missing_done_when");
  }
  if (!lower.includes("validation")) {
    diagnostics.push("prompt_quality_missing_validation_expectation");
  }
  if (!lower.includes("context scout") && !lower.includes("execution-context-scout")) {
    diagnostics.push("prompt_quality_missing_context_scout_guidance");
  }
  return uniqueStringList(diagnostics);
}

function buildFixedNodeAgentWorkerPrompt(input: {
  nodeExecutionSnapshot: NodeExecutionSnapshot;
  promptText: string;
  modelRunRef: string;
  reasonCodes: string[];
}): NodeAgentWorkerPrompt {
  const promptText = input.promptText;
  const promptHash = stableTextHash(promptText);
  return {
    artifactKind: NODE_AGENT_WORKER_PROMPT_ARTIFACT_TYPE,
    schemaVersion: NODE_AGENT_WORKER_PROMPT_SCHEMA_VERSION,
    promptRef: `node-agent-worker-prompt://${input.nodeExecutionSnapshot.nodeRunId}/${promptHash.slice(0, 20)}`,
    nodeRunId: input.nodeExecutionSnapshot.nodeRunId,
    nodeId: input.nodeExecutionSnapshot.nodeId,
    runtimeJobId: input.nodeExecutionSnapshot.runtimeJobId,
    sessionKey: input.nodeExecutionSnapshot.sessionKey,
    snapshotRef: input.nodeExecutionSnapshot.snapshotRef,
    requirementRefs: input.nodeExecutionSnapshot.requirementRefs,
    sourcePromptRefs: input.nodeExecutionSnapshot.sourcePromptRefs,
    modelRunRef: input.modelRunRef,
    promptText,
    promptHash,
    promptByteCount: Buffer.byteLength(promptText, "utf8"),
    promptQualityDiagnostics: fixedWorkerPromptDiagnostics(promptText),
    reasonCodes: input.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    hiddenReasoningStored: false,
    storagePolicy: NODE_EXECUTION_STORAGE_POLICY,
  };
}

async function attachNodeAgentWorkerPromptArtifact(input: {
  runtimeJobs: RuntimeJobRepository;
  nodeExecutionSnapshot: NodeExecutionSnapshot;
  workerPrompt: {
    promptRef: string;
    nodeRunId: string;
    promptHash: string;
    promptByteCount: number;
    promptText: string;
    modelRunRef: string;
    reasonCodes: string[];
    storagePolicy: typeof NODE_EXECUTION_STORAGE_POLICY;
  };
}) {
  return input.runtimeJobs.attachRuntimeArtifactByContract({
    jobId: input.nodeExecutionSnapshot.runtimeJobId,
    artifactType: NODE_AGENT_WORKER_PROMPT_ARTIFACT_TYPE,
    uri: input.workerPrompt.promptRef,
    body: input.workerPrompt as unknown as JsonValue,
    boundedSummary: `Node worker prompt ${input.workerPrompt.promptHash.slice(0, 16)} for ${input.nodeExecutionSnapshot.nodeId}.`,
    targetNodeIds: [input.nodeExecutionSnapshot.nodeId],
    reasonCodes: ["node_agent_worker_prompt_artifact_attached", ...input.workerPrompt.reasonCodes],
    createdBy: "openclaw_node_session_executor",
    metadata: {
      nodeRunId: input.workerPrompt.nodeRunId,
      nodeId: input.nodeExecutionSnapshot.nodeId,
      graphId: input.nodeExecutionSnapshot.graphId,
      sessionKey: input.nodeExecutionSnapshot.sessionKey,
      nodeWorkerPromptRef: input.workerPrompt.promptRef,
      nodeWorkerPromptHash: input.workerPrompt.promptHash,
      nodeWorkerPromptByteCount: input.workerPrompt.promptByteCount,
      nodeWorkerPromptAuthorModelRunRef: input.workerPrompt.modelRunRef,
      artifactPolicyRef: input.workerPrompt.storagePolicy.artifactPolicyRef,
      rawStoragePolicyRef: input.workerPrompt.storagePolicy.rawStoragePolicyRef,
      boundedRefsOnly: input.workerPrompt.storagePolicy.boundedRefsOnly,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawTranscriptStored: false,
      hiddenReasoningStored: false,
    } satisfies Record<string, JsonValue>,
  });
}

async function attachNodePromptAuthoringFailureDiagnosticArtifact(input: {
  runtimeJobs: RuntimeJobRepository;
  nodeExecutionSnapshot: NodeExecutionSnapshot;
  diagnostic: JsonValue;
}) {
  return input.runtimeJobs.attachRuntimeArtifactByContract({
    jobId: input.nodeExecutionSnapshot.runtimeJobId,
    artifactType: NODE_PROMPT_AUTHORING_FAILURE_DIAGNOSTIC_ARTIFACT_TYPE,
    uri: `node-prompt-authoring-failure://${input.nodeExecutionSnapshot.nodeRunId}/${stableTextHash(
      JSON.stringify(input.diagnostic),
    ).slice(0, 20)}`,
    body: input.diagnostic,
    boundedSummary: `Node prompt authoring failure diagnostic for ${input.nodeExecutionSnapshot.nodeId}.`,
    targetNodeIds: [input.nodeExecutionSnapshot.nodeId],
    reasonCodes: ["node_prompt_authoring_failure_diagnostic_artifact_attached"],
    createdBy: "openclaw_node_session_executor",
    metadata: {
      nodeRunId: input.nodeExecutionSnapshot.nodeRunId,
      nodeId: input.nodeExecutionSnapshot.nodeId,
      graphId: input.nodeExecutionSnapshot.graphId,
      sessionKey: input.nodeExecutionSnapshot.sessionKey,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawTranscriptStored: false,
      hiddenReasoningStored: false,
    } satisfies Record<string, JsonValue>,
  });
}

export function prepareOpenClawNodeStart(input: {
  config: ReturnType<typeof loadConfig>;
  nodeRun: NodeExecutionRunRecord;
  nodeExecutionSnapshot: NodeExecutionSnapshot;
  sessionFilePath: string;
  requiredSkillNames?: readonly string[];
  expectedChildAgentIds?: readonly string[];
  agentPackRegistryEntries: readonly AgentPackRegistryEntry[];
}): GatewayNodeStartPreparation {
  const config = input.config;
  const parentAgent = resolveAgentConfig(config, input.nodeRun.agentId);
  const cwd = resolveOpenClawNodeExecutionWorkspaceDir(config, input.nodeRun.agentId);
  const agentModelRef = resolveAgentEffectiveModelPrimary(config, input.nodeRun.agentId);
  const agentModel = agentModelRef ? parseModelRef(agentModelRef, DEFAULT_PROVIDER) : null;
  const agentThinkingLevel = resolveGatewayAgentThinkingLevel({
    config,
    agentId: input.nodeRun.agentId,
  });
  const agentReasoningLevel = resolveGatewayAgentReasoningLevel({
    config,
    agentId: input.nodeRun.agentId,
  });
  const acceptedRequiredToolNames: string[] = [];
  const blockedTools: NodeAgentToolPolicyExplanation[] = [];
  const missingSkills: Array<{ agentId: string; skillName: string }> = [];
  const missingAssets: Array<{ agentId: string; assetPath: string }> = [];
  const reasonCodes: string[] = ["node_agent_start_prepared_from_native_openclaw_surfaces"];
  const parentAgentPackEntry = findAgentPackRegistryEntry({
    entries: input.agentPackRegistryEntries,
    agentId: input.nodeRun.agentId,
  });
  const requiredSkillNames = input.requiredSkillNames?.length
    ? [...input.requiredSkillNames]
    : nodeAgentRequiredSkillNamesFromRegistryEntry(parentAgentPackEntry);
  const registryContractIssues = executionAgentPackContractIssues({
    agentId: input.nodeRun.agentId,
    entry: parentAgentPackEntry,
    requireAllowedChildAgents: true,
  });
  const requiredParentToolNames = nodeAgentRequiredToolNamesFromRegistryEntry(parentAgentPackEntry);
  const forbiddenParentToolNames =
    nodeAgentForbiddenToolNamesFromRegistryEntry(parentAgentPackEntry);
  const expectedChildAgentIds = input.expectedChildAgentIds?.length
    ? [...input.expectedChildAgentIds]
    : nodeAgentAllowedChildAgentIdsFromRegistryEntry(parentAgentPackEntry);
  const baseReceiptFacts = () => ({
    nodeExecutionSnapshot: input.nodeExecutionSnapshot,
    cwd,
    modelProvider: agentModel?.provider ?? null,
    modelId: agentModel?.model ?? null,
    reasoningLevel: agentReasoningLevel ?? null,
    thinkingLevel: agentThinkingLevel ?? null,
    activeSkillNames: requiredSkillNames,
    allowedSubagentIds: parentAgent?.subagents?.allowAgents ?? [],
  });

  if (!parentAgent) {
    const receipt = baseNodeAgentLaunchProofState({
      status: "blocked",
      nodeRun: input.nodeRun,
      ...baseReceiptFacts(),
      sessionFilePath: input.sessionFilePath,
      config,
      acceptedRequiredToolNames,
      blockerKind: "node_agent_profile_missing",
      reasonCodes: [
        ...reasonCodes,
        "node_agent_profile_missing",
        `node_agent_profile_missing:${input.nodeRun.agentId}`,
      ],
    });
    return {
      status: "blocked",
      blockerKind: "node_agent_profile_missing",
      receipt,
      reasonCodes: receipt.reasonCodes,
    };
  }

  const agentDir = resolveAgentDir(config, input.nodeRun.agentId);
  const projectRootDir = resolveAgentProjectRootDir(config, input.nodeRun.agentId);
  const parentSkills = resolveAgentSkillsFilter(config, input.nodeRun.agentId);
  for (const requiredSkillName of requiredSkillNames) {
    if (parentSkills && !parentSkills.includes(requiredSkillName)) {
      missingSkills.push({ agentId: input.nodeRun.agentId, skillName: requiredSkillName });
    }
  }
  if (!agentModel?.model || !/kimi/i.test(agentModel.model)) {
    reasonCodes.push("node_agent_model_profile_not_kimi");
  }
  if (agentThinkingLevel !== "xhigh") {
    reasonCodes.push("node_agent_thinking_level_below_required_xhigh");
  }
  if (agentReasoningLevel !== "stream" && agentReasoningLevel !== "on") {
    reasonCodes.push("node_agent_reasoning_level_below_required");
  }
  const parentEffectiveToolNames = resolveParentNativeTaskEffectiveToolNames({
    config,
    nodeRun: input.nodeRun,
    requiredToolNames: requiredParentToolNames,
    forbiddenToolNames: forbiddenParentToolNames,
    modelProvider: agentModel?.provider ?? undefined,
    modelId: agentModel?.model ?? undefined,
  });
  const parentEffectiveToolNameSet = new Set(parentEffectiveToolNames);
  for (const toolName of requiredParentToolNames) {
    if (parentEffectiveToolNameSet.has(toolName)) {
      acceptedRequiredToolNames.push(toolName);
    } else {
      blockedTools.push(
        buildNativeTaskParentCatalogBlocker({
          agentId: input.nodeRun.agentId,
          toolName,
          blockedBy: "node_agent_native_task_effective_catalog_missing_required_tool",
        }),
      );
    }
  }

  const allowedSubagents = parentAgent.subagents?.allowAgents ?? [];
  const allowAnySubagent = allowedSubagents.some((value) => value.trim() === "*");
  const missingScoutPolicies = allowAnySubagent
    ? []
    : expectedChildAgentIds.filter(
        (required) => !allowedSubagents.some((value) => value.trim() === required),
      );
  const requiresExplicitSubagentTarget =
    parentAgent.subagents?.requireAgentId ??
    config.agents?.defaults?.subagents?.requireAgentId ??
    false;
  if (!requiresExplicitSubagentTarget) {
    reasonCodes.push("node_agent_subagent_identity_policy_requires_explicit_agent_id_missing");
  }

  for (const toolName of forbiddenParentToolNames) {
    if (parentEffectiveToolNameSet.has(toolName)) {
      blockedTools.push(
        buildNativeTaskParentCatalogBlocker({
          agentId: input.nodeRun.agentId,
          toolName,
          blockedBy: "execution_node_parent_forbidden_tool_visible_in_effective_catalog",
        }),
      );
    }
  }

  for (const scoutAgentId of expectedChildAgentIds) {
    const scoutAgent = resolveAgentConfig(config, scoutAgentId);
    const scoutAgentPackEntry = findAgentPackRegistryEntry({
      entries: input.agentPackRegistryEntries,
      agentId: scoutAgentId,
    });
    registryContractIssues.push(
      ...executionAgentPackContractIssues({
        agentId: scoutAgentId,
        entry: scoutAgentPackEntry,
      }),
    );
    const scoutRequiredSkillNames = scoutRequiredSkillNamesFromRegistryEntry({
      entry: scoutAgentPackEntry,
    });
    const scoutProjectRootDir = resolveAgentProjectRootDir(config, scoutAgentId);
    const scoutAgentDir = resolveAgentDir(config, scoutAgentId);
    const scoutSkills = resolveAgentSkillsFilter(config, scoutAgentId) ?? [];
    if (!scoutAgent) {
      reasonCodes.push(`node_agent_required_scout_profile_missing:${scoutAgentId}`);
    }
    for (const scoutSkill of scoutRequiredSkillNames) {
      const scoutSkillPath = path.join(scoutProjectRootDir, "skills", scoutSkill, "SKILL.md");
      if (!scoutSkills.includes(scoutSkill)) {
        missingSkills.push({ agentId: scoutAgentId, skillName: scoutSkill });
      }
      if (!fs.existsSync(scoutSkillPath)) {
        missingAssets.push({ agentId: scoutAgentId, assetPath: scoutSkillPath });
      } else if (!readBoundedUtf8File(scoutSkillPath, MAX_ACTIVE_REQUIRED_SKILL_BYTES)?.trim()) {
        missingAssets.push({
          agentId: scoutAgentId,
          assetPath: `${scoutSkillPath}#active-skill-body-unavailable`,
        });
      }
    }
    if (!fs.existsSync(scoutAgentDir)) {
      missingAssets.push({ agentId: scoutAgentId, assetPath: scoutAgentDir });
    }
    for (const diagnostic of executionAgentRuntimeDiagnostics({
      agentId: scoutAgentId,
      agentDir: scoutAgentDir,
      workspaceDir: scoutProjectRootDir,
    })) {
      reasonCodes.push(diagnostic);
    }
    const scoutAccess = resolveEffectiveToolPolicyAccess({
      config,
      agentId: scoutAgentId,
      toolNames: scoutRequiredToolNamesFromRegistryEntry({
        entry: scoutAgentPackEntry,
      }),
    });
    for (const entry of scoutAccess) {
      if (entry.allowed) {
        acceptedRequiredToolNames.push(`${scoutAgentId}:${entry.toolName}`);
      } else {
        blockedTools.push(toToolExplanation({ agentId: scoutAgentId, ...entry }));
      }
    }
    const forbiddenScoutAccess = resolveEffectiveToolPolicyAccess({
      config,
      agentId: scoutAgentId,
      toolNames: scoutForbiddenToolNamesFromRegistryEntry(scoutAgentPackEntry),
    });
    for (const entry of forbiddenScoutAccess) {
      if (entry.allowed) {
        blockedTools.push(
          toToolExplanation({
            agentId: scoutAgentId,
            ...entry,
            allowed: false,
            blockedBy: uniqueStringList([
              ...entry.blockedBy,
              "execution_node_scout_mode_separation",
            ]),
          }),
        );
      }
    }
  }

  if (!fs.existsSync(agentDir)) {
    missingAssets.push({ agentId: input.nodeRun.agentId, assetPath: agentDir });
  }
  for (const requiredSkillName of requiredSkillNames) {
    const requiredSkillPath = path.join(projectRootDir, "skills", requiredSkillName, "SKILL.md");
    if (!fs.existsSync(requiredSkillPath)) {
      missingAssets.push({ agentId: input.nodeRun.agentId, assetPath: requiredSkillPath });
    } else if (!readBoundedUtf8File(requiredSkillPath, MAX_ACTIVE_REQUIRED_SKILL_BYTES)?.trim()) {
      missingAssets.push({
        agentId: input.nodeRun.agentId,
        assetPath: `${requiredSkillPath}#active-skill-body-unavailable`,
      });
    }
  }
  const workspaceDiagnostics = executionAgentRuntimeDiagnostics({
    agentId: input.nodeRun.agentId,
    agentDir,
    workspaceDir: projectRootDir,
  });
  const nodeExecutionWorkspaceDiagnostic = existingDirectoryAvailabilityDiagnostic({
    label: "node_agent_execution_workspace",
    agentId: input.nodeRun.agentId,
    dir: resolveOpenClawNodeExecutionWorkspaceDir(config, input.nodeRun.agentId),
  });
  reasonCodes.push(
    ...workspaceDiagnostics,
    ...(nodeExecutionWorkspaceDiagnostic ? [nodeExecutionWorkspaceDiagnostic] : []),
  );

  const workspaceFailure =
    nodeExecutionWorkspaceDiagnostic ??
    workspaceDiagnostics.find((diagnostic) => diagnostic.includes("missing")) ??
    workspaceDiagnostics.find((diagnostic) => diagnostic.includes("not_directory")) ??
    workspaceDiagnostics.find((diagnostic) => diagnostic.includes("unwritable")) ??
    null;
  const blockerKind =
    registryContractIssues.length > 0
      ? "node_agent_registry_contract_incomplete"
      : missingSkills.length > 0
        ? "node_agent_skill_missing"
        : missingScoutPolicies.length > 0 || !requiresExplicitSubagentTarget
          ? "node_agent_subagent_policy_insufficient"
          : !agentModel?.model || !/kimi/i.test(agentModel.model)
            ? "node_agent_model_profile_not_kimi"
            : agentThinkingLevel !== "xhigh" ||
                (agentReasoningLevel !== "stream" && agentReasoningLevel !== "on")
              ? "node_agent_model_reasoning_profile_insufficient"
              : blockedTools.length > 0
                ? blockedTools.some((tool) => tool.agentId !== input.nodeRun.agentId)
                  ? "node_agent_required_scout_tool_policy_insufficient"
                  : "node_agent_tool_policy_insufficient"
                : missingAssets.length > 0
                  ? "node_agent_asset_missing"
                  : workspaceFailure
                    ? "node_agent_runtime_workspace_unavailable"
                    : null;

  if (blockerKind) {
    const receipt = baseNodeAgentLaunchProofState({
      status: "blocked",
      nodeRun: input.nodeRun,
      ...baseReceiptFacts(),
      effectiveToolNames: uniqueStringList(parentEffectiveToolNames),
      allowedSubagentIds: allowedSubagents,
      sessionFilePath: input.sessionFilePath,
      config,
      acceptedRequiredToolNames: uniqueStringList(acceptedRequiredToolNames),
      blockedTools,
      missingSkills,
      missingAssets,
      workspaceFailure,
      blockerKind,
      reasonCodes: uniqueStringList([
        ...reasonCodes,
        blockerKind,
        ...missingSkills.map(
          (entry) => `node_agent_skill_missing:${entry.agentId}:${entry.skillName}`,
        ),
        ...missingScoutPolicies.map((agentId) => `node_agent_subagent_policy_missing:${agentId}`),
        !requiresExplicitSubagentTarget
          ? "node_agent_subagent_policy_requires_explicit_agent_id_missing"
          : null,
        !agentModel?.model || !/kimi/i.test(agentModel.model)
          ? "node_agent_model_profile_not_kimi"
          : null,
        agentThinkingLevel !== "xhigh" ? "node_agent_thinking_level_below_required_xhigh" : null,
        agentReasoningLevel !== "stream" && agentReasoningLevel !== "on"
          ? "node_agent_reasoning_level_below_required"
          : null,
        ...blockedTools.map(
          (tool) => `node_agent_tool_policy_blocked:${tool.agentId}:${tool.toolName}`,
        ),
        ...blockedTools.flatMap((tool) =>
          tool.blockedBy.map(
            (layer) =>
              `node_agent_tool_policy_blocked_by:${tool.agentId}:${layer}:${tool.toolName}`,
          ),
        ),
        ...missingAssets.map(
          (entry) => `node_agent_asset_missing:${entry.agentId}:${entry.assetPath}`,
        ),
        ...registryContractIssues,
      ]),
    });
    return {
      status: "blocked",
      blockerKind,
      receipt,
      reasonCodes: receipt.reasonCodes,
    };
  }

  const receipt = baseNodeAgentLaunchProofState({
    status: "accepted",
    nodeRun: input.nodeRun,
    ...baseReceiptFacts(),
    effectiveToolNames: uniqueStringList(parentEffectiveToolNames),
    allowedSubagentIds: allowedSubagents,
    sessionFilePath: input.sessionFilePath,
    config,
    acceptedRequiredToolNames: uniqueStringList(acceptedRequiredToolNames),
    reasonCodes: uniqueStringList([
      ...reasonCodes,
      "node_agent_start_native_openclaw_facts_accepted",
      "node_agent_config_epoch_recorded",
      `node_agent_profile_resolved:${input.nodeRun.agentId}`,
    ]),
  });
  return {
    status: "accepted",
    receipt,
    reasonCodes: receipt.reasonCodes,
  };
}

export function resolveGatewayNodeAgentProfile(input: {
  config: ReturnType<typeof loadConfig>;
  proposedAgentId: string;
  requireAgentAssets?: boolean;
}): ReturnType<NonNullable<RuntimeWorkGraphSchedulerOptions["resolveNodeAgentProfile"]>> {
  void input.config;
  void input.requireAgentAssets;
  return {
    status: "accepted",
    agentId: input.proposedAgentId,
    reasonCodes: [
      "node_agent_profile_resolution_delegated_to_node_start_adapter",
      `node_agent_profile_proposed:${input.proposedAgentId}`,
    ],
  };
}

export function createGatewayNodeAgentProfileResolver(): NonNullable<
  RuntimeWorkGraphSchedulerOptions["resolveNodeAgentProfile"]
> {
  return async ({ proposedAgentId }) =>
    await withExternalCliAuthSyncSuppressed(async () =>
      resolveGatewayNodeAgentProfile({
        config: {} as ReturnType<typeof loadConfig>,
        proposedAgentId,
        requireAgentAssets: true,
      }),
    );
}

export function createOpenClawNodeSessionExecutor(input: {
  runtimeJobs: RuntimeJobRepository;
  promptTextModelClient: ProviderTextTurnModelClient | null;
  fixedWorkerPrompt?: {
    promptText: string;
    modelRunRef: string;
    promptHash: string;
  } | null;
}): RuntimeWorkGraphNodeAgentSessionRunner {
  return async (params) =>
    await withExternalCliAuthSyncSuppressed(async () => {
      const nodeAgentStartTimingStartedAt = Date.now();
      const { node, nodeExecutionSnapshot } = params;
      logNodeAgentStartTiming("executor_enter", nodeAgentStartTimingStartedAt, {
        nodeId: nodeExecutionSnapshot.nodeId,
        nodeRunId: nodeExecutionSnapshot.nodeRunId,
      });
      const nodeRuns = new RuntimeArtifactNodeExecutionRunStore(input.runtimeJobs, {
        runtimeJobIdsForLookup: async () => [nodeExecutionSnapshot.runtimeJobId],
      });
      const nodeRun = await nodeRuns.allocateOrLoadNodeRun({
        runtimeJobId: nodeExecutionSnapshot.runtimeJobId,
        graphId: nodeExecutionSnapshot.graphId,
        nodeId: nodeExecutionSnapshot.nodeId,
        attemptId: nodeExecutionSnapshot.attemptId,
        agentId: nodeExecutionSnapshot.agentId,
        snapshotRef: nodeExecutionSnapshot.snapshotRef,
      });
      logNodeAgentStartTiming("node_run_allocated", nodeAgentStartTimingStartedAt, {
        nodeRunId: nodeRun.nodeRunId,
      });
      const config = loadSourceBackedConfigForNodeLaunch();
      logNodeAgentStartTiming("config_loaded", nodeAgentStartTimingStartedAt, {
        agentCount: Array.isArray(config.agents?.list) ? config.agents.list.length : 0,
      });
      const agentPackRegistryEntries = await loadAgentPackRegistryEntries();
      logNodeAgentStartTiming("agent_pack_registry_loaded", nodeAgentStartTimingStartedAt, {
        entryCount: agentPackRegistryEntries.length,
      });
      const requiredSkillNames = await resolveNodeAgentRequiredSkillNames({
        agentId: nodeRun.agentId,
        entries: agentPackRegistryEntries,
      });
      const expectedChildAgentIds = await resolveNodeAgentAllowedChildAgentIds({
        agentId: nodeRun.agentId,
        entries: agentPackRegistryEntries,
      });
      const nodeAgentPackEntry = findAgentPackRegistryEntry({
        entries: agentPackRegistryEntries,
        agentId: nodeRun.agentId,
      });
      const requiredToolNames = nodeAgentRequiredToolNamesFromRegistryEntry(nodeAgentPackEntry);
      const forbiddenToolNames = nodeAgentForbiddenToolNamesFromRegistryEntry(nodeAgentPackEntry);
      const requiredDocNames = nodeAgentRequiredDocNamesFromRegistryEntry(nodeAgentPackEntry);
      const sessionFilePath = resolveSessionFilePath(nodeRun.nodeRunId, undefined, {
        agentId: nodeRun.agentId,
      });
      const startPreparation = prepareOpenClawNodeStart({
        config,
        nodeRun,
        nodeExecutionSnapshot,
        sessionFilePath,
        requiredSkillNames,
        expectedChildAgentIds,
        agentPackRegistryEntries,
      });
      logNodeAgentStartTiming("node_start_prepared", nodeAgentStartTimingStartedAt, {
        status: startPreparation.status,
        blockerKind: startPreparation.status === "blocked" ? startPreparation.blockerKind : null,
      });
      if (startPreparation.status === "blocked") {
        const blockedLaunch = await recordBlockedNodeSessionLaunch({
          config,
          nodeRun,
          receipt: startPreparation.receipt,
          blockerKind: startPreparation.blockerKind,
          blockers: startPreparation.receipt.blockers,
          reasonCodes: uniqueStringList([
            ...startPreparation.reasonCodes,
            "node_agent_start_blocked_recorded_as_native_session_launch",
          ]),
        });
        const metadata: JsonValue = {
          nodeRunId: nodeRun.nodeRunId,
          nodeAgentId: nodeRun.agentId,
          nodeAgentSessionKey: nodeRun.sessionKey,
          nodeExecutionSnapshotRef: nodeExecutionSnapshot.snapshotRef,
          nodeAgentStartReceiptRef: null,
          nodeAgentStartBlockerKind: startPreparation.blockerKind,
          ...nodeSessionLaunchMetadata(blockedLaunch),
          ...nodeAgentSourceRuntimeMetadata(startPreparation.receipt),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawTranscriptStored: false,
          hiddenReasoningStored: false,
        };
        return {
          status: "blocked",
          outputArtifactRefs: [nodeExecutionSnapshot.snapshotRef],
          producedOutputRefs: [nodeExecutionSnapshot.snapshotRef],
          artifactRefs: [nodeExecutionSnapshot.snapshotRef],
          modelRunRefs: [nodeRun.sessionKey],
          validationRefs: [],
          changedFileRefs: [],
          ownerSummary: `OpenClaw node start blocked: ${startPreparation.blockerKind}`,
          eli5Summary:
            "The node worker did not start because native OpenClaw start facts were blocked.",
          reasonCodes: uniqueStringList([
            ...startPreparation.reasonCodes,
            blockedLaunch.persisted
              ? "node_agent_start_blocked_native_session_launch_recorded"
              : `node_agent_start_blocked_native_session_launch_not_persisted:${blockedLaunch.reason}`,
          ]),
          metadata,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          workQueueLifecycleMutated: false,
          runtimeLifecycleMutated: false,
        };
      }
      const recordFinishArtifact = async (finish: NodeFinish): Promise<string | null> => {
        const artifact = await input.runtimeJobs.attachRuntimeArtifactByContract({
          jobId: nodeExecutionSnapshot.runtimeJobId,
          artifactType: NODE_FINISH_ARTIFACT_TYPE,
          uri: `node-finish://${finish.nodeRunId}/${finish.status}`,
          body: finish as unknown as JsonValue,
          boundedSummary: finish.summary,
          targetNodeIds: [nodeExecutionSnapshot.nodeId],
          reasonCodes: [
            "node_finish_payload_artifact_attached",
            `node_finish_status:${finish.status}`,
          ],
          createdBy: "openclaw_node_session_executor",
          metadata: {
            nodeRunId: finish.nodeRunId,
            nodeId: nodeExecutionSnapshot.nodeId,
            graphId: nodeExecutionSnapshot.graphId,
            sessionKey: nodeExecutionSnapshot.sessionKey,
            status: finish.status,
            blockerKind: finish.blockerKind ?? null,
            evidenceRefCount: finish.evidenceRefs.length,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawTranscriptStored: false,
            hiddenReasoningStored: false,
          },
        });
        return artifact.uri;
      };
      const agentModelRef = resolveAgentEffectiveModelPrimary(config, nodeRun.agentId);
      const agentModel = agentModelRef ? parseModelRef(agentModelRef, DEFAULT_PROVIDER) : null;
      const agentThinkingLevel = resolveGatewayAgentThinkingLevel({
        config,
        agentId: nodeRun.agentId,
      });
      const agentReasoningLevel = resolveGatewayAgentReasoningLevel({
        config,
        agentId: nodeRun.agentId,
      });
      const nodeExecutionWorkspaceDir = resolveOpenClawNodeExecutionWorkspaceDir(
        config,
        nodeRun.agentId,
      );
      const skillsSnapshot = buildNodeExecutionRequiredSkillsSnapshot({
        config,
        agentId: nodeRun.agentId,
        requiredSkillNames,
      });
      const parentRequiredSkillSources = requiredProviderSkillSourcesFromSnapshot(skillsSnapshot);
      const fixedWorkerPrompt = input.fixedWorkerPrompt;
      const fixedPromptText =
        typeof fixedWorkerPrompt?.promptText === "string" ? fixedWorkerPrompt.promptText : null;
      const promptResult =
        fixedWorkerPrompt && fixedPromptText !== null && fixedPromptText.length > 0
          ? {
              status: "accepted" as const,
              promptText: fixedPromptText,
              workerPrompt: buildFixedNodeAgentWorkerPrompt({
                nodeExecutionSnapshot,
                promptText: fixedPromptText,
                modelRunRef: fixedWorkerPrompt.modelRunRef,
                reasonCodes: [
                  "node_agent_worker_prompt_supplied_by_boundary_replay_fixed_artifact",
                  "node_agent_worker_prompt_authoring_bypassed_for_worker_only_proof",
                  "node_agent_worker_prompt_is_direct_native_session_input",
                ],
              }),
              modelRunRef: fixedWorkerPrompt.modelRunRef,
              responseHash: fixedWorkerPrompt.promptHash,
              latencyMs: 0,
              reasonCodes: [
                "node_agent_worker_prompt_supplied_by_boundary_replay_fixed_artifact",
                "node_agent_worker_prompt_authoring_bypassed_for_worker_only_proof",
                "node_agent_worker_prompt_is_direct_native_session_input",
              ],
              rawPromptStored: false as const,
              rawResponseStored: false as const,
              rawProviderLogStored: false as const,
            }
          : await authorNodeExecutionPrompt({
              nodeExecutionSnapshot,
              repository: input.runtimeJobs,
              modelClient: input.promptTextModelClient,
              modelRef: agentModel?.model ?? null,
              providerPath: agentModel?.provider ?? null,
              reasoningEffort: "none",
              maxOutputTokens: 8_000,
              timeoutMs: 90_000,
              maxPromptChars: 140_000,
            });
      if (promptResult.status === "blocked") {
        const diagnosticArtifact = promptResult.diagnostic
          ? await attachNodePromptAuthoringFailureDiagnosticArtifact({
              runtimeJobs: input.runtimeJobs,
              nodeExecutionSnapshot,
              diagnostic: promptResult.diagnostic as unknown as JsonValue,
            })
          : null;
        const metadata: JsonValue = {
          nodeRunId: nodeRun.nodeRunId,
          nodeAgentId: nodeRun.agentId,
          nodeAgentSessionKey: nodeRun.sessionKey,
          nodeExecutionSnapshotRef: nodeExecutionSnapshot.snapshotRef,
          nodeAgentStartReceiptRef: null,
          nodeAgentSessionLaunchRef: null,
          nodeAgentSessionLaunchEventRef: null,
          nodeAgentSessionLaunchStatus: null,
          nodeAgentSessionLaunchBlockerKind: null,
          ...nodeAgentSourceRuntimeMetadata(startPreparation.receipt),
          nodeWorkerPromptStatus: "blocked",
          nodeWorkerPromptBlockerKind: promptResult.blockerKind,
          nodePromptAuthoringFailureDiagnosticRef: diagnosticArtifact?.uri ?? null,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawTranscriptStored: false,
          hiddenReasoningStored: false,
        };
        return {
          status: "needs_review",
          outputArtifactRefs: [
            nodeExecutionSnapshot.snapshotRef,
            ...(diagnosticArtifact ? [diagnosticArtifact.uri] : []),
          ],
          producedOutputRefs: [
            nodeExecutionSnapshot.snapshotRef,
            ...(diagnosticArtifact ? [diagnosticArtifact.uri] : []),
          ],
          artifactRefs: [
            nodeExecutionSnapshot.snapshotRef,
            ...(diagnosticArtifact ? [diagnosticArtifact.uri] : []),
          ],
          modelRunRefs: [nodeRun.sessionKey],
          validationRefs: [],
          changedFileRefs: [],
          ownerSummary: `OpenClaw node worker prompt authoring blocked: ${promptResult.blockerKind}`,
          eli5Summary:
            "The node worker did not start because NodeLifecycleRunner could not author a complete worker prompt.",
          reasonCodes: [
            ...promptResult.reasonCodes,
            `node_worker_prompt_blocker:${promptResult.blockerKind}`,
          ],
          metadata,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          workQueueLifecycleMutated: false,
          runtimeLifecycleMutated: false,
        };
      }
      const workerPromptArtifact = await attachNodeAgentWorkerPromptArtifact({
        runtimeJobs: input.runtimeJobs,
        nodeExecutionSnapshot,
        workerPrompt: promptResult.workerPrompt,
      });
      logNodeAgentStartTiming("worker_prompt_artifact_attached", nodeAgentStartTimingStartedAt, {
        promptHash: promptResult.workerPrompt.promptHash,
        promptByteCount: promptResult.workerPrompt.promptByteCount,
      });
      const parentRequiredCanonicalDocPaths =
        (await resolveSourceBackedAgentBootstrapFilePaths({
          config,
          sessionKey: nodeRun.sessionKey,
          sessionId: nodeRun.nodeRunId,
          agentId: nodeRun.agentId,
          fileNames: requiredDocNames,
        })) ??
        requiredDocNames.map((docName) =>
          path.join(
            resolveAgentProjectRootDir(config, nodeRun.agentId),
            "docs",
            "agents",
            nodeRun.agentId,
            "runtime",
            docName,
          ),
        );
      logNodeAgentStartTiming("parent_bootstrap_paths_resolved", nodeAgentStartTimingStartedAt, {
        docCount: parentRequiredCanonicalDocPaths.length,
      });
      const preSessionReceipt = withWorkerPromptSessionProof({
        receipt: {
          ...startPreparation.receipt,
          reasonCodes: uniqueStringList([
            ...startPreparation.receipt.reasonCodes,
            "node_agent_session_launch_prepared_before_native_session_invocation",
          ]),
        },
        workerPrompt: promptResult.workerPrompt,
        workerPromptArtifactRef: workerPromptArtifact.uri,
        sessionFilePath,
        finalPromptText: null,
        systemPromptReport: null,
        effectiveToolNames: null,
        requiredCanonicalDocNames: requiredDocNames,
        requiredCanonicalDocPaths: parentRequiredCanonicalDocPaths,
        requiredSkillNames,
        requiredSkillSources: parentRequiredSkillSources,
        requiredToolNames,
        forbiddenToolNames,
        enforceProviderBootstrapAdmission: false,
      });
      const nodeAgentStepBudget = deriveNodeAgentStepBudgetFromSnapshot(nodeExecutionSnapshot);
      const nodeAgentDir = resolveAgentDir(config, nodeRun.agentId);
      const nodeAgentAuthStorage = discoverAuthStorage(nodeAgentDir, { syncExternalCli: false });
      const nodeAgentModelRegistry = discoverModels(nodeAgentAuthStorage, nodeAgentDir);
      logNodeAgentStartTiming("node_model_runtime_admitted", nodeAgentStartTimingStartedAt, {
        agentDir: nodeAgentDir,
      });
      let sessionResult: Awaited<ReturnType<typeof runNodeAgentSession>>;
      try {
        logNodeAgentStartTiming("before_run_node_agent_session", nodeAgentStartTimingStartedAt, {
          sessionFilePath,
          workspaceDir: nodeExecutionWorkspaceDir,
        });
        sessionResult = await runNodeAgentSession({
          nodeRunId: nodeRun.nodeRunId,
          nodeRuns,
          hydrateSnapshot: async (snapshotRef) =>
            snapshotRef === nodeExecutionSnapshot.snapshotRef ? nodeExecutionSnapshot : null,
          recordFinishArtifact,
          runEmbeddedAgent: runEmbeddedPiAgent,
          workerPromptText: promptResult.promptText,
          stepBudget: nodeAgentStepBudget,
          agentParams: {
            sessionId: nodeRun.nodeRunId,
            sessionFile: sessionFilePath,
            workspaceDir: nodeExecutionWorkspaceDir,
            agentDir: nodeAgentDir,
            config,
            authStorage: nodeAgentAuthStorage,
            modelRegistry: nodeAgentModelRegistry,
            skillsSnapshot,
            ...(agentModel ? { provider: agentModel.provider, model: agentModel.model } : {}),
            ...(agentThinkingLevel ? { thinkLevel: agentThinkingLevel } : {}),
            ...(agentReasoningLevel ? { reasoningLevel: agentReasoningLevel } : {}),
            trigger: "manual",
            timeoutMs: 1_200_000,
            runId: nodeRun.nodeRunId,
            disableMessageTool: true,
            requireExplicitMessageTarget: true,
            allowGatewaySubagentBinding: true,
            runtimePluginIds: [],
            modelsJsonPolicy: "reuse-existing",
            nodeAgentNativeTaskMode: {
              enabled: true,
              allowedAgentIds: expectedChildAgentIds,
              mutationToolName: "edit",
            },
            requiredProviderContextAdmission: {
              workspaceFileNames: parentRequiredCanonicalDocPaths,
              skillNames: requiredSkillNames,
              skillSources: parentRequiredSkillSources,
              rejectTruncatedWorkspaceFiles: true,
            },
            bootstrapContextMode: "full",
            bootstrapContextRunKind: "default",
            toolResultFormat: "markdown",
            nativeRuntimeTools: [
              createExecutionPlatformResourceReadTool({
                runtimeJobId: nodeExecutionSnapshot.runtimeJobId,
                nodeExecutionSnapshot,
                repository: input.runtimeJobs,
              }),
            ],
          },
        });
      } catch (error) {
        const errorName = error instanceof Error ? error.name : "unknown_error";
        const errorMessage = error instanceof Error ? error.message : String(error);
        const blockedReceipt = {
          ...preSessionReceipt,
          status: "blocked" as const,
          blockerKind: "node_agent_session_invocation_failed",
          blockers: uniqueStringList([
            ...preSessionReceipt.blockers,
            "node_agent_session_invocation_failed",
          ]),
          reasonCodes: uniqueStringList([
            ...preSessionReceipt.reasonCodes,
            "node_agent_session_invocation_failed",
            `node_agent_session_invocation_error_name:${errorName}`,
            `node_agent_session_invocation_error_hash:${stableTextHash(errorMessage).slice(0, 20)}`,
          ]),
        };
        const blockedLaunch = await recordBlockedNodeSessionLaunch({
          config,
          nodeRun,
          receipt: blockedReceipt,
          blockerKind: "node_agent_session_invocation_failed",
          blockers: blockedReceipt.blockers,
          reasonCodes: blockedReceipt.reasonCodes,
          promptHash: blockedReceipt.promptHash,
          submittedPromptHash: blockedReceipt.submittedPromptHash,
          promptHashMatched: blockedReceipt.promptSessionHashMatch,
        });
        return {
          status: "blocked",
          outputArtifactRefs: [nodeExecutionSnapshot.snapshotRef, workerPromptArtifact.uri],
          producedOutputRefs: [nodeExecutionSnapshot.snapshotRef, workerPromptArtifact.uri],
          artifactRefs: [nodeExecutionSnapshot.snapshotRef, workerPromptArtifact.uri],
          modelRunRefs: [nodeRun.sessionKey, promptResult.workerPrompt.modelRunRef],
          validationRefs: [],
          changedFileRefs: [],
          ownerSummary: `OpenClaw node agent session invocation failed before a terminal trace: ${errorName}.`,
          eli5Summary:
            "The node worker prompt was ready, but the native OpenClaw agent session failed before it returned a session trace.",
          reasonCodes: uniqueStringList([
            ...blockedReceipt.reasonCodes,
            blockedLaunch.persisted
              ? "node_agent_session_invocation_failed_native_session_launch_recorded"
              : `node_agent_session_invocation_failed_native_session_launch_not_persisted:${blockedLaunch.reason}`,
          ]),
          metadata: {
            nodeRunId: nodeRun.nodeRunId,
            nodeAgentId: nodeRun.agentId,
            nodeAgentSessionKey: nodeRun.sessionKey,
            nodeExecutionSnapshotRef: nodeExecutionSnapshot.snapshotRef,
            nodeAgentStartReceiptRef: null,
            ...nodeSessionLaunchMetadata(blockedLaunch),
            nodeWorkerPromptRef: promptResult.workerPrompt.promptRef,
            nodeWorkerPromptArtifactRef: workerPromptArtifact.uri,
            nodeWorkerPromptHash: promptResult.workerPrompt.promptHash,
            nodeWorkerPromptByteCount: promptResult.workerPrompt.promptByteCount,
            nodeWorkerPromptStatus: "accepted",
            nodeAgentStartStatus: "blocked",
            nodeAgentSessionInvocationErrorName: errorName,
            nodeAgentSessionInvocationErrorHash: stableTextHash(errorMessage).slice(0, 20),
            ...nodeAgentSourceRuntimeMetadata(blockedReceipt),
            nodeFinishArtifactRef: null,
            nodeFinishStatus: null,
            nodeFinishBlockerKind: "node_agent_session_invocation_failed",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawTranscriptStored: false,
            hiddenReasoningStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          workQueueLifecycleMutated: false,
          runtimeLifecycleMutated: false,
        };
      }
      const nativeSessionTrace = sessionResult.runResult?.meta.nodeAgentSessionTrace;
      const startReceipt = {
        ...withWorkerPromptSessionProof({
          receipt: withNativeLockTrace({
            receipt: startPreparation.receipt,
            lockAcquisitionTrace: sessionResult.lockAcquisitionTrace,
          }),
          workerPrompt: promptResult.workerPrompt,
          workerPromptArtifactRef: workerPromptArtifact.uri,
          sessionFilePath,
          finalPromptText: sessionResult.runResult?.meta.finalPromptText ?? null,
          systemPromptReport: sessionResult.runResult?.meta.systemPromptReport,
          effectiveToolNames: sessionResult.runResult?.meta.effectiveToolNames ?? null,
          requiredCanonicalDocNames: requiredDocNames,
          requiredCanonicalDocPaths: parentRequiredCanonicalDocPaths,
          requiredSkillNames,
          requiredSkillSources: parentRequiredSkillSources,
          requiredToolNames,
          forbiddenToolNames,
          enforceProviderBootstrapAdmission: true,
        }),
        sessionLaunchRef: stringFromRecord(nativeSessionTrace, "sessionLaunchRef"),
        sessionLaunchEventRef: stringFromRecord(nativeSessionTrace, "sessionLaunchEventRef"),
      };
      const nodeStartBlocked = startReceipt.status === "blocked";
      const finish = sessionResult.finish;
      const finishArtifactRef = sessionResult.nodeRun.finishArtifactRef;
      const sessionTodo = readSessionTodo({
        storePath: resolveStorePath(config.session?.store, {
          agentId: sessionResult.nodeRun.agentId,
        }),
        sessionKey: sessionResult.nodeRun.sessionKey,
      });
      const sessionTrace = buildNodeAgentSessionTrace({
        nodeRun: sessionResult.nodeRun,
        nodeExecutionSnapshot,
        workerPrompt: promptResult.workerPrompt,
        workerPromptArtifactRef: workerPromptArtifact.uri,
        sessionTodo,
        stepBudget: nodeAgentStepBudget,
        status: sessionResult.status,
        runResult: sessionResult.runResult,
        finish,
        finishArtifactRef,
      });
      const sessionTraceArtifact = await input.runtimeJobs.attachRuntimeArtifactByContract({
        jobId: nodeExecutionSnapshot.runtimeJobId,
        artifactType: NODE_AGENT_SESSION_TRACE_ARTIFACT_TYPE,
        uri: sessionTrace.traceRef,
        body: sessionTrace as unknown as JsonValue,
        boundedSummary: `Node agent session trace for ${nodeExecutionSnapshot.nodeId}: ${sessionTrace.status}.`,
        targetNodeIds: [nodeExecutionSnapshot.nodeId],
        reasonCodes: ["node_agent_session_trace_artifact_attached", ...sessionTrace.reasonCodes],
        createdBy: "openclaw_node_session_executor",
        metadata: {
          nodeRunId: sessionTrace.nodeRunId,
          nodeId: sessionTrace.nodeId,
          graphId: sessionTrace.graphId,
          nodeAgentId: sessionTrace.agentId,
          nodeAgentSessionKey: sessionTrace.parentSessionKey,
          nodeExecutionSnapshotRef: sessionTrace.snapshotRef,
          nodeWorkerPromptRef: sessionTrace.workerPromptRef,
          nodeWorkerPromptArtifactRef: sessionTrace.workerPromptArtifactRef,
          nodeWorkerPromptHash: sessionTrace.promptHash,
          nodeWorkerPromptAuthorModelRunRef: sessionTrace.promptAuthorModelRunRef,
          nodeFinishArtifactRef: sessionTrace.finishArtifactRef,
          nodeAgentSessionStatus: sessionTrace.status,
          nodeAgentSessionStopReason: sessionTrace.stopReason,
          nodeExecutionWaitingOnSubagent: sessionTrace.yieldedForSubagent,
          nodeAgentObservedToolNames: sessionTrace.observedToolNames,
          nodeAgentToolCallCount: sessionTrace.toolCallCount,
          nodeAgentStepBudget: sessionTrace.stepBudget as unknown as JsonValue,
          nodeAgentTraceMissingOptics: sessionTrace.missingOptics,
          nodeAgentTraceEventRefs: sessionTrace.eventRefs as unknown as JsonValue,
          nodeAgentSessionLaunch: sessionTrace.sessionLaunch as unknown as JsonValue,
          nodeAgentSessionLaunchStatus: sessionTrace.sessionLaunch.admissionStatus,
          nodeAgentSessionLaunchBlockerKind: sessionTrace.sessionLaunch.blockerKind,
          nodeAgentSessionLaunchCwd: sessionTrace.sessionLaunch.cwd,
          nodeAgentSessionLaunchProvider: sessionTrace.sessionLaunch.provider,
          nodeAgentSessionLaunchModel: sessionTrace.sessionLaunch.model,
          nodeAgentSessionLaunchReasoningLevel: sessionTrace.sessionLaunch.reasoningLevel,
          nodeAgentSessionLaunchThinkingLevel: sessionTrace.sessionLaunch.thinkingLevel,
          nodeAgentSessionLaunchToolCatalogRef: sessionTrace.sessionLaunch.toolCatalogRef,
          nodeAgentTraceChildBootstrapAdmissions:
            sessionTrace.childBootstrapAdmissions as unknown as JsonValue,
          nodeAgentTraceObservations: sessionTrace.observations as unknown as JsonValue,
          nodeAgentNativeCompactionCount: sessionTrace.contextManagement.nativeCompactionCount,
          artifactPolicyRef: sessionTrace.storagePolicy.artifactPolicyRef,
          rawStoragePolicyRef: sessionTrace.storagePolicy.rawStoragePolicyRef,
          boundedRefsOnly: sessionTrace.storagePolicy.boundedRefsOnly,
        },
      });
      const outputArtifactRefs = [
        nodeExecutionSnapshot.snapshotRef,
        workerPromptArtifact.uri,
        sessionTraceArtifact.uri,
        ...(finishArtifactRef ? [finishArtifactRef] : []),
        ...(finish?.evidenceRefs ?? []),
      ];
      const ownerSummary = nodeStartBlocked
        ? `OpenClaw node agent start blocked: ${startReceipt.blockerKind ?? "provider bootstrap admission failed"}.`
        : (finish?.summary ??
          (sessionResult.status === "waiting_on_subagent"
            ? "OpenClaw node agent yielded while waiting for a native subagent result."
            : "OpenClaw node agent session did not produce node_finish."));
      const eli5Summary = nodeStartBlocked
        ? "The OpenClaw node agent session did not satisfy native start proof because required bootstrap or skill context was not proven in the provider-visible prompt."
        : sessionResult.status === "completed"
          ? "The OpenClaw node agent finished the graph node and supplied evidence."
          : sessionResult.status === "waiting_on_subagent"
            ? "The OpenClaw node agent yielded while waiting for a native subagent result."
            : "The OpenClaw node agent could not complete the graph node and returned a typed blocker.";
      const executionStatus = nodeStartBlocked
        ? "blocked"
        : sessionResult.status === "completed"
          ? "succeeded"
          : sessionResult.status === "waiting_on_subagent"
            ? "waiting_for_human"
            : "blocked";
      return {
        status: executionStatus,
        outputArtifactRefs,
        producedOutputRefs: outputArtifactRefs,
        artifactRefs: outputArtifactRefs,
        modelRunRefs: [nodeRun.sessionKey, promptResult.workerPrompt.modelRunRef],
        validationRefs: finish?.evidenceRefs.filter((ref) => ref.includes("validation")) ?? [],
        changedFileRefs: finish?.evidenceRefs.filter((ref) => ref.includes("file")) ?? [],
        ownerSummary,
        eli5Summary,
        reasonCodes: [
          ...startReceipt.reasonCodes,
          ...sessionResult.reasonCodes,
          `node_agent_session_status:${sessionResult.status}`,
        ],
        metadata: {
          nodeRunId: nodeRun.nodeRunId,
          nodeAgentId: nodeRun.agentId,
          nodeAgentSessionKey: nodeRun.sessionKey,
          nodeExecutionSnapshotRef: nodeExecutionSnapshot.snapshotRef,
          nodeAgentStartReceiptRef: null,
          nodeAgentStartStatus: startReceipt.status,
          nodeWorkerPromptRef: promptResult.workerPrompt.promptRef,
          nodeWorkerPromptArtifactRef: workerPromptArtifact.uri,
          nodeWorkerPromptHash: promptResult.workerPrompt.promptHash,
          nodeWorkerPromptByteCount: promptResult.workerPrompt.promptByteCount,
          nodeWorkerPromptStatus: "accepted",
          nodeAgentSessionMessageId: startReceipt.nativeSessionMessageId,
          nodeAgentInitialMessageHash: startReceipt.nativeSessionInitialMessageHash,
          nodeAgentPromptSessionHashMatch: startReceipt.promptSessionHashMatch,
          nodeAgentSessionTranscriptRef: startReceipt.nativeSessionTranscriptRef,
          nodeAgentStartLockAcquisitionOutcome: startReceipt.lockAcquisitionOutcome,
          nodeAgentStartConfigFingerprint: startReceipt.activeConfigFingerprint,
          nodeAgentStartConfigEpoch: startReceipt.activeConfigEpoch,
          ...nodeAgentSourceRuntimeMetadata(startReceipt),
          nodeAgentSessionTraceRef: sessionTraceArtifact.uri,
          nodeAgentSessionTraceMissingOptics: sessionTrace.missingOptics,
          nodeAgentSessionTraceEventRefs: sessionTrace.eventRefs as unknown as JsonValue,
          nodeFinishArtifactRef: finishArtifactRef,
          nodeFinishStatus: finish?.status ?? null,
          nodeFinishBlockerKind: finish?.blockerKind ?? null,
          nodeExecutionWaitingOnSubagent: sessionResult.status === "waiting_on_subagent",
          nodeKind: node.nodeKind ?? null,
          assignedRole: node.assignedRole ?? null,
          artifactPolicyRef: sessionTrace.storagePolicy.artifactPolicyRef,
          rawStoragePolicyRef: sessionTrace.storagePolicy.rawStoragePolicyRef,
          boundedRefsOnly: sessionTrace.storagePolicy.boundedRefsOnly,
        } satisfies JsonValue,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        workQueueLifecycleMutated: false,
        runtimeLifecycleMutated: false,
      };
    });
}

export async function runGatewayAgentTeamRuntimeJobOnce(input: {
  runtimeJobs: RuntimeJobRepository;
  runtimeWorkGraphs: RuntimeWorkGraphRepository;
  runtimeToolKernel?: RuntimeToolKernel | null;
  workQueue: WorkQueueRepository;
  runtimeJobId: string;
  workerId: string;
  queueName?: string | null;
  stopAfterBoundary?: "requirement_map" | null;
}): Promise<GatewayAgentTeamRunOnceResult> {
  let claimedExecution: AgentTeamClaimedJobExecutionResult | null = null;
  let claimedTeamRunId: string | null = null;
  const roleModelClient = createGatewayRoleModelClient();
  const promptTextModelClient = createOpenRouterProviderTextTurnClient({
    client: roleModelClient,
    defaultRoleId: "implementation_engineer",
  });
  const queuedRunner = new CodingTeamRuntimeJobRunner({
    runtimeJobs: input.runtimeJobs,
    runtimeWorkGraphs: input.runtimeWorkGraphs,
    runtimeToolKernel: input.runtimeToolKernel ?? null,
    workQueue: input.workQueue,
    workerId: input.workerId,
    queueName: input.queueName ?? "agent-team",
    runtimeJobId: input.runtimeJobId,
    closeoutReporter: createGatewayCloseoutReporter(),
    roleModelClient,
    nodeAgentSessionRunner: createOpenClawNodeSessionExecutor({
      runtimeJobs: input.runtimeJobs,
      promptTextModelClient,
    }),
    resolveNodeAgentProfile: createGatewayNodeAgentProfileResolver(),
    stopAfterBoundary: input.stopAfterBoundary ?? null,
  });
  const workerAdapter = new AcpCodexCodingWorkerAdapter({
    runtimeJobs: input.runtimeJobs,
    runner: {
      async run({ job }): Promise<AcpCodexCodingWorkerRunResult> {
        try {
          claimedExecution = await queuedRunner.runClaimedJobForAdapter(job);
          claimedTeamRunId = claimedExecution.evidence.teamRunId;
          const evidence = claimedExecution.evidence;
          const closeoutCapsule = claimedExecution.closeoutCapsule;
          const closeoutRefs = [
            `runtime-job://${job.jobId}/closeout-capsule/${closeoutCapsule.capsuleId}`,
          ];
          const roleRefs = evidence.roster.map((role) => `role://${role.roleId}`).slice(0, 20);
          const modelRefs = evidence.roster.map((role) => role.modelId).slice(0, 20);
          const validationRefs =
            claimedExecution.validationRefs.length > 0
              ? claimedExecution.validationRefs
              : [`runtime-job://${job.jobId}/agent-team/validation`];
          const reviewRefs = evidence.artifactRefs
            .filter((ref) => ref.includes("security-review") || ref.includes("result-review"))
            .slice(0, 20);
          const completedWorkEvidenceRefs = claimedExecution.cleanSuccessAccepted
            ? [...evidence.artifactRefs, ...closeoutRefs].slice(0, 40)
            : [];
          return {
            status: claimedExecution.cleanSuccessAccepted ? "completed" : "needs_review",
            summary: claimedExecution.cleanSuccessAccepted
              ? "Coding worker completed bounded work with model-authored closeout evidence."
              : `Coding worker needs review: ${claimedExecution.blockingReasonCodes.join(", ")}`,
            teamRunId: evidence.teamRunId,
            workflowId: "agent_team.coding",
            roleRefs,
            modelRefs,
            validationRefs: validationRefs.slice(0, 20),
            reviewRefs,
            closeoutRefs,
            completedWorkEvidenceRefs,
            artifactRefs: [...evidence.artifactRefs, ...closeoutRefs].slice(0, 40),
            closeoutCapsule,
            evidence,
            roleExecutionEvidence: evidence.roleExecutionEvidence,
            reasonCodes: claimedExecution.cleanSuccessAccepted
              ? ["agent_team_queued_runner_completed"]
              : claimedExecution.blockingReasonCodes,
            result: {
              teamRunId: evidence.teamRunId,
              closeoutCapsuleId: closeoutCapsule.capsuleId,
              cleanSuccessAccepted: claimedExecution.cleanSuccessAccepted,
              changedFileRefs: claimedExecution.changedFileRefs,
              validationRefs,
              rawPromptStored: false,
              rawResponseStored: false,
              rawLogsStored: false,
              workQueueLifecycleMutated: false,
            },
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            workQueueLifecycleMutated: false,
          };
        } catch (error) {
          if (error instanceof HumanOperatorInputRequiredError) {
            return {
              status: "deferred",
              summary: `Waiting for owner decision for human task ${error.humanTaskId}.`,
              teamRunId: claimedTeamRunId,
              workflowId: "agent_team.coding",
              roleRefs: ["role://human_operator"],
              modelRefs: ["human/operator"],
              validationRefs: [],
              reviewRefs: [],
              closeoutRefs: [],
              completedWorkEvidenceRefs: [],
              artifactRefs: error.artifactRefs,
              reasonCodes: error.reasonCodes,
              retryDelayMs: 86_400_000,
              result: {
                status: "waiting_for_human",
                runtimeJobId: error.runtimeJobId,
                graphId: error.graphId,
                humanTaskId: error.humanTaskId,
                rawPromptStored: false,
                rawResponseStored: false,
                rawLogsStored: false,
                workQueueLifecycleMutated: false,
              },
              rawPromptStored: false,
              rawResponseStored: false,
              rawLogsStored: false,
              workQueueLifecycleMutated: false,
            };
          }
          throw error;
        }
      },
    },
  });
  const supervisorResult = await new RuntimeWorkerSupervisor({
    repository: input.runtimeJobs,
    workerId: input.workerId,
    queueName: input.queueName ?? "agent-team",
    adapters: [workerAdapter],
  }).runOnce({ runtimeJobId: input.runtimeJobId });
  return {
    claimed: supervisorResult.claimed,
    completed: supervisorResult.completed,
    failed:
      supervisorResult.claimed &&
      !supervisorResult.completed &&
      supervisorResult.status !== "deferred",
    status: supervisorResult.status,
    runtimeJobId: supervisorResult.runtimeJobId,
    workflowId: "agent_team.coding",
    workerId: input.workerId,
    teamRunId: claimedTeamRunId,
    reasonCodes: supervisorResult.reasonCodes,
  };
}
