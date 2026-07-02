// Operator-facing run performance readback derived from native status summaries.
import fs from "node:fs";
import path from "node:path";
import { theme } from "../../packages/terminal-core/src/theme.js";
import { getRuntimeConfig } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import {
  loadSessionCostSummaryFromCache,
  resolveExistingUsageSessionFile,
} from "../infra/session-cost-usage.js";
import type { SessionCostSummary, UsageCacheStatus } from "../infra/session-cost-usage.types.js";
import { buildAdvisoryReadback, type AdvisoryReadback } from "../readback/advisory.js";
import type { RuntimeEnv } from "../runtime.js";
import { writeRuntimeJson } from "../runtime.js";
import type { ReadbackProgressProjection } from "../shared/readback-progress.js";
import {
  createTaskReadbackProgressProjectionContext,
  resolveTaskReadbackProgressProjection,
  type TaskReadbackProgressProjectionContext,
} from "../tasks/task-readback-progress.js";
import { listTaskRecords } from "../tasks/task-registry.js";
import type { TaskRecord } from "../tasks/task-registry.types.js";
import { getStatusSummary } from "./status.summary.js";
import type { SessionStatus, StatusSummary } from "./status.types.js";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const HIGH_CONTEXT_WARN_PERCENT = 80;
const HIGH_CONTEXT_ERROR_PERCENT = 90;
const LONG_ACTIVE_TASK_WARN_MS = 10 * 60_000;
const TOOL_HEAVY_SESSION_WARN_CALLS = 50;
const DELIVERY_ISSUE_STATUSES = new Set(["failed", "parent_missing", "session_queued"]);
const DEPLOY_EVENT_TAIL_LINES = 200;
const RECENT_DEPLOY_ATTENTION_MS = 30 * 60_000;
const DEPLOY_ARTIFACT_READ_MAX_BYTES = 512 * 1024;
const SUMMARY_TEXT_MAX_CHARS = 360;
const EXPENSIVE_RUN_COST_WARN_USD = 1;
const LONG_SESSION_DURATION_WARN_MS = 30 * 60_000;
const SLOW_DEPLOY_RECEIPT_WARN_MS = 5 * 60_000;

type AttentionSource = "session" | "task" | "deploy" | "status";
type EvidenceQuality = "evidence_backed" | "heuristic" | "stale" | "scoped" | "unknown";
type DiagnosticConfidence = "high" | "medium" | "low" | "unknown";
type DeployEvidenceScope = "global_unscoped";
type RunInsightSkillPromptRef = NonNullable<
  NonNullable<SessionStatus["promptContext"]>["skills"]
>["promptRef"];

export type RunInsightsOptions = {
  json?: boolean;
  agent?: string;
  session?: string;
  task?: string;
  active?: string | number;
  limit?: string | number;
};

export type RunInsightsRequest = Omit<RunInsightsOptions, "json">;

export type ResolvedRunInsightsOptions = {
  agent?: string;
  session?: string;
  task?: string;
  activeMinutes?: number;
  limit: number;
};

export type RunInsightsOptionsResult =
  | {
      ok: true;
      value: ResolvedRunInsightsOptions;
    }
  | {
      ok: false;
      message: string;
    };

type SignalSeverity = "info" | "warn" | "error";

export type RunInsightSignal = {
  severity: SignalSeverity;
  code: string;
  message: string;
  evidenceQuality?: EvidenceQuality;
  confidence?: DiagnosticConfidence;
  evidence?: Record<string, unknown>;
};

export type RunInsightAttentionItem = {
  severity: SignalSeverity;
  code: string;
  message: string;
  source: AttentionSource;
  pointer: string;
  evidenceQuality?: EvidenceQuality;
  confidence?: DiagnosticConfidence;
  evidence: Record<string, unknown>;
};

export type RunInsightSessionUsage = {
  cacheStatus: UsageCacheStatus["status"];
  totalCost: number;
  totalTokens: number;
  durationMs: number | null;
  duration: string;
  messageCount: number | null;
  toolCalls: number;
  uniqueTools: number;
  topTools: Array<{
    name: string;
    count: number;
  }>;
  errors: number;
};

export type RunInsightSession = {
  key: string;
  agentId: string | null;
  kind: string;
  sessionId: string | null;
  updatedAt: number | null;
  ageMs: number | null;
  age: string;
  model: string | null;
  runtime: string | null;
  totalTokens: number | null;
  totalTokensFresh: boolean;
  percentUsed: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  abortedLastRun: boolean;
  flags: string[];
  promptContext: SessionStatus["promptContext"] | null;
  usage: RunInsightSessionUsage | null;
  pointer: string;
};

export type RunInsightTask = {
  taskId: string;
  runtime: string;
  status: string;
  deliveryStatus: string;
  taskKind: string | null;
  agentId: string | null;
  runId: string | null;
  label: string | null;
  ownerKey: string;
  requesterSessionKey: string;
  childSessionKey: string | null;
  parentTaskId: string | null;
  parentFlowId: string | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  lastEventAt: number | null;
  ageMs: number;
  age: string;
  elapsedMs: number | null;
  elapsed: string;
  latestEvent: {
    kind: string;
    at: number;
    summary: string | null;
  } | null;
  activeProgress: ReadbackProgressProjection | null;
  progressSummary: string | null;
  attention: {
    waitClass:
      | "queued"
      | "active_child"
      | "validation_or_promotion"
      | "delivery"
      | "long_running"
      | null;
    reason: string | null;
    pointer: string;
  };
  pointer: string;
};

export type RunInsightDeployEvent = {
  eventId: string;
  eventType: string;
  status: string | null;
  generatedAt: string | null;
  ageMs: number | null;
  age: string;
  imageRef: string | null;
  imageDigest: string | null;
  sourceCommit: string | null;
  buildProfile: string | null;
  previousImageDigest: string | null;
  buildEpisodeId: string | null;
  artifactRefs: Array<{
    kind: string | null;
    path: string | null;
  }>;
  artifactSummary: RunInsightDeployArtifactSummary | null;
};

export type RunInsightDeployArtifactSummary = {
  path: string | null;
  readable: boolean;
  skippedReason: string | null;
  durationMs: number | null;
  duration: string;
  failedCount: number | null;
  slowestChecks: Array<{
    id: string;
    durationMs: number | null;
    duration: string;
    status: string | null;
    exitCode: number | null;
  }>;
};

export type RunInsightsReport = {
  schema: "openclaw.run_insights.v1";
  generatedAt: string;
  authority: string;
  advisory: AdvisoryReadback;
  filters: {
    agent: string | null;
    session: string | null;
    task: string | null;
    activeMinutes: number | null;
    limit: number;
  };
  deployEvidenceScope: {
    scope: DeployEvidenceScope;
    filteredBy: [];
    limitApplied: number;
    reason: string;
  };
  summary: {
    sessionCount: number;
    recentSessionsConsidered: number;
    sessionsDisplayed: number;
    tasks: {
      total: number;
      active: number;
      terminal: number;
      failures: number;
      recentDisplayed: number;
      activeDisplayed: number;
      childTasksDisplayed: number;
      deliveryIssues: number;
      byStatus: StatusSummary["tasks"]["byStatus"];
      byRuntime: StatusSummary["tasks"]["byRuntime"];
    };
    deploy: {
      recentDisplayed: number;
      lastEventType: string | null;
      lastPromotedImageDigest: string | null;
      recentFailures: number;
    };
  };
  attention: {
    whyWorkMayFeelSlow: RunInsightAttentionItem[];
    validationAndPromotion: RunInsightAttentionItem[];
    evidencePointers: string[];
  };
  performanceProfile: {
    expensiveRunExplanation: Array<{
      code: string;
      severity: SignalSeverity;
      message: string;
      pointer: string;
      evidence: Record<string, unknown>;
    }>;
    timeline: Array<{
      at: number | null;
      age: string;
      source: AttentionSource;
      label: string;
      pointer: string;
      evidence: Record<string, unknown>;
    }>;
    childSessionEvidence: Array<{
      taskId: string;
      childSessionKey: string;
      childRole: string | null;
      childAgentPath: string | null;
      childPhase: string | null;
      spawnReason: string | null;
      createdAt: number;
      startedAt: number | null;
      endedAt: number | null;
      status: string;
      elapsedMs: number | null;
      elapsed: string;
      pointer: string;
    }>;
    skillActivationEvidence: Array<{
      sessionKey: string;
      agentId: string | null;
      visibleSkillCount: number | null;
      visibleSkillNames: string[];
      skillFilter: string[] | null;
      promptChars: number | null;
      promptHash: string | null;
      promptRef: RunInsightSkillPromptRef | null;
      activationEvidence: "visible_skill_catalog";
      actualUsePointer: string;
      pointer: string;
    }>;
    retryBuildProofCost: {
      deployReceiptCount: number;
      totalKnownDurationMs: number;
      totalKnownDuration: string;
      slowestReceipt: {
        eventId: string;
        eventType: string;
        durationMs: number;
        duration: string;
        pointer: string;
      } | null;
    };
    validationBuildBottlenecks: Array<{
      code: string;
      message: string;
      pointer: string;
      evidence: Record<string, unknown>;
    }>;
    advisoryInefficiencyFlags: RunInsightSignal[];
  };
  diagnosticSummary: {
    currentOrLastKnownPhase: {
      label: string;
      source: AttentionSource | "none";
      pointer: string | null;
      confidence: DiagnosticConfidence;
      evidenceQuality: EvidenceQuality;
      reason: string;
    };
    timeSpent: {
      knownSessionDurationMs: number | null;
      activeTaskElapsedMs: number | null;
      deployReceiptKnownDurationMs: number;
      confidence: DiagnosticConfidence;
      evidenceQuality: EvidenceQuality;
    };
    childWork: {
      displayedChildTasks: number;
      activeChildTasks: number;
      contribution: string;
      confidence: DiagnosticConfidence;
      evidenceQuality: EvidenceQuality;
      pointer: string | null;
    };
    parentWaitState: {
      waitClass: RunInsightTask["attention"]["waitClass"] | "unknown";
      reason: string;
      pointer: string | null;
      confidence: DiagnosticConfidence;
      evidenceQuality: EvidenceQuality;
    };
    validationBuildPromotion: {
      attentionItems: number;
      bottlenecks: number;
      deployReceipts: number;
      artifactPointers: string[];
      confidence: DiagnosticConfidence;
      evidenceQuality: EvidenceQuality;
    };
    evidenceQuality: {
      evidenceBacked: number;
      heuristic: number;
      stale: number;
      scoped: number;
      unknown: number;
      missingPointers: string[];
    };
    operatorNextAction: {
      label: string;
      pointer: string;
      reason: string;
    };
  };
  signals: RunInsightSignal[];
  sessions: RunInsightSession[];
  tasks: RunInsightTask[];
  deployEvents: RunInsightDeployEvent[];
  pointers: {
    statusJson: string;
    sessions: string;
    tasksSummary: string;
    tasksAudit: string;
    deployEvents: string;
  };
};

function parsePositiveIntegerValue(
  value: string | number | undefined,
  name: string,
): { ok: true; value: number | undefined } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  const text = String(value).trim();
  if (!/^[1-9]\d*$/.test(text)) {
    return { ok: false, message: `${name} must be a positive integer.` };
  }
  return { ok: true, value: Number(text) };
}

function parseStringFilterValue(
  value: string | undefined,
  name: string,
): { ok: true; value: string | undefined } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  const text = value.trim();
  if (!text) {
    return { ok: false, message: `${name} must not be empty.` };
  }
  return { ok: true, value: text };
}

function clampLimit(limit: number | undefined): number {
  return Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
}

export function resolveRunInsightsOptions(options: RunInsightsRequest): RunInsightsOptionsResult {
  const parsedLimit = parsePositiveIntegerValue(options.limit, "limit");
  if (!parsedLimit.ok) {
    return parsedLimit;
  }
  const parsedActive = parsePositiveIntegerValue(options.active, "active");
  if (!parsedActive.ok) {
    return parsedActive;
  }
  const parsedSession = parseStringFilterValue(options.session, "session");
  if (!parsedSession.ok) {
    return parsedSession;
  }
  const parsedTask = parseStringFilterValue(options.task, "task");
  if (!parsedTask.ok) {
    return parsedTask;
  }

  return {
    ok: true,
    value: {
      ...(options.agent ? { agent: options.agent } : {}),
      ...(parsedSession.value ? { session: parsedSession.value } : {}),
      ...(parsedTask.value ? { task: parsedTask.value } : {}),
      ...(parsedActive.value !== undefined ? { activeMinutes: parsedActive.value } : {}),
      limit: clampLimit(parsedLimit.value),
    },
  };
}

function formatDurationMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) {
    return "unknown";
  }
  if (ms < 60_000) {
    return `${Math.max(0, Math.round(ms / 1000))}s`;
  }
  if (ms < 3_600_000) {
    return `${Math.round(ms / 60_000)}m`;
  }
  if (ms < 86_400_000) {
    return `${Math.round(ms / 3_600_000)}h`;
  }
  return `${Math.round(ms / 86_400_000)}d`;
}

function formatTokenCount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "unknown";
  }
  return new Intl.NumberFormat("en-US").format(value);
}

function compactSummaryText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= SUMMARY_TEXT_MAX_CHARS) {
    return normalized;
  }
  const suffix = "... [truncated; use pointer for full evidence]";
  return `${normalized.slice(0, SUMMARY_TEXT_MAX_CHARS - suffix.length).trimEnd()}${suffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function deployArtifactDurationMs(artifact: Record<string, unknown>): number | null {
  const timings = isRecord(artifact.timingsMs) ? artifact.timingsMs : null;
  return (
    finiteNumberOrNull(timings?.total) ??
    finiteNumberOrNull(timings?.build) ??
    finiteNumberOrNull(artifact.durationMs) ??
    finiteNumberOrNull(artifact.timingMs)
  );
}

function deployArtifactSlowestChecks(
  artifact: Record<string, unknown>,
): RunInsightDeployArtifactSummary["slowestChecks"] {
  const timings = isRecord(artifact.timingsMs) ? artifact.timingsMs : null;
  const rawChecks = Array.isArray(timings?.checks) ? timings.checks : [];
  return rawChecks
    .filter((check): check is Record<string, unknown> => isRecord(check))
    .map((check) => {
      const durationMs = finiteNumberOrNull(check.durationMs);
      return {
        id: stringOrNull(check.id) ?? "unknown",
        durationMs,
        duration: formatDurationMs(durationMs),
        status: stringOrNull(check.status),
        exitCode: finiteNumberOrNull(check.exitCode),
      };
    })
    .toSorted((a, b) => (b.durationMs ?? -1) - (a.durationMs ?? -1))
    .slice(0, 5);
}

function readDeployArtifactSummary(
  artifactRefs: RunInsightDeployEvent["artifactRefs"],
): RunInsightDeployArtifactSummary | null {
  const pathRef = artifactRefs.find((ref) => ref.path)?.path ?? null;
  if (!pathRef) {
    return null;
  }
  try {
    const stat = fs.statSync(pathRef);
    if (!stat.isFile()) {
      return {
        path: pathRef,
        readable: false,
        skippedReason: "not_file",
        durationMs: null,
        duration: "unknown",
        failedCount: null,
        slowestChecks: [],
      };
    }
    if (stat.size > DEPLOY_ARTIFACT_READ_MAX_BYTES) {
      return {
        path: pathRef,
        readable: false,
        skippedReason: "too_large",
        durationMs: null,
        duration: "unknown",
        failedCount: null,
        slowestChecks: [],
      };
    }
    const artifact = JSON.parse(fs.readFileSync(pathRef, "utf8")) as unknown;
    if (!isRecord(artifact)) {
      return {
        path: pathRef,
        readable: false,
        skippedReason: "not_object",
        durationMs: null,
        duration: "unknown",
        failedCount: null,
        slowestChecks: [],
      };
    }
    const durationMs = deployArtifactDurationMs(artifact);
    return {
      path: pathRef,
      readable: true,
      skippedReason: null,
      durationMs,
      duration: formatDurationMs(durationMs),
      failedCount: finiteNumberOrNull(artifact.failedCount),
      slowestChecks: deployArtifactSlowestChecks(artifact),
    };
  } catch {
    return {
      path: pathRef,
      readable: false,
      skippedReason: "unreadable",
      durationMs: null,
      duration: "unknown",
      failedCount: null,
      slowestChecks: [],
    };
  }
}

function deployEventSlowestChecks(
  summary: Record<string, unknown>,
): RunInsightDeployArtifactSummary["slowestChecks"] {
  const rawChecks = Array.isArray(summary.slowestChecks) ? summary.slowestChecks : [];
  return rawChecks
    .filter((check): check is Record<string, unknown> => isRecord(check))
    .map((check) => {
      const durationMs = finiteNumberOrNull(check.durationMs);
      return {
        id: stringOrNull(check.id) ?? "unknown",
        durationMs,
        duration: formatDurationMs(durationMs),
        status: stringOrNull(check.status),
        exitCode: finiteNumberOrNull(check.exitCode),
      };
    });
}

function deployEventArtifactSummary(
  event: Record<string, unknown>,
  artifactRefs: RunInsightDeployEvent["artifactRefs"],
): RunInsightDeployArtifactSummary | null {
  const summary = isRecord(event.artifactSummary) ? event.artifactSummary : null;
  if (summary) {
    const durationMs = finiteNumberOrNull(summary.durationMs);
    return {
      path: stringOrNull(summary.path) ?? artifactRefs.find((ref) => ref.path)?.path ?? null,
      readable: summary.readable === false ? false : true,
      skippedReason: stringOrNull(summary.skippedReason),
      durationMs,
      duration: stringOrNull(summary.duration) ?? formatDurationMs(durationMs),
      failedCount: finiteNumberOrNull(summary.failedCount),
      slowestChecks: deployEventSlowestChecks(summary),
    };
  }
  return readDeployArtifactSummary(artifactRefs);
}

function textMatchesRunStage(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  return /\b(?:validation|validate|test|smoke|build|deploy|promotion|promote|candidate|proof)\b/i.test(
    value,
  );
}

function qualityLabelForUsage(session: RunInsightSession): EvidenceQuality {
  if (!session.usage) {
    return session.totalTokens !== null && !session.totalTokensFresh ? "stale" : "unknown";
  }
  return session.usage.cacheStatus === "fresh" ? "evidence_backed" : "stale";
}

function confidenceForQuality(quality: EvidenceQuality): DiagnosticConfidence {
  switch (quality) {
    case "evidence_backed":
      return "high";
    case "scoped":
    case "heuristic":
      return "medium";
    case "stale":
      return "low";
    case "unknown":
      return "unknown";
  }
}

function selectRecentSessions(summary: StatusSummary, agent: string | undefined): SessionStatus[] {
  if (!agent) {
    return summary.sessions.recent ?? [];
  }
  return summary.sessions.byAgent?.find((entry) => entry.agentId === agent)?.recent ?? [];
}

function sessionMatchesActiveFilter(
  row: SessionStatus,
  activeMinutes: number | undefined,
): boolean {
  if (activeMinutes === undefined) {
    return true;
  }
  if (row.age === null) {
    return false;
  }
  return row.age <= activeMinutes * 60_000;
}

function sessionMatchesSessionFilter(row: SessionStatus, session: string | undefined): boolean {
  if (!session) {
    return true;
  }
  return (
    sessionReferenceMatches(row.key, session) || sessionReferenceMatches(row.sessionId, session)
  );
}

function canonicalSessionReference(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLocaleLowerCase("en-US") : null;
}

function sessionReferenceMatches(value: string | null | undefined, filter: string): boolean {
  const canonicalValue = canonicalSessionReference(value);
  const canonicalFilter = canonicalSessionReference(filter);
  return Boolean(canonicalValue && canonicalFilter && canonicalValue === canonicalFilter);
}

function toInsightSession(row: SessionStatus): RunInsightSession {
  const agentId = row.agentId ?? null;
  const agentPart = agentId ? ` --agent ${agentId}` : "";
  return {
    key: row.key,
    agentId,
    kind: row.kind,
    sessionId: row.sessionId ?? null,
    updatedAt: row.updatedAt,
    ageMs: row.age,
    age: formatDurationMs(row.age),
    model: row.model,
    runtime: row.runtime ?? null,
    totalTokens: row.totalTokens,
    totalTokensFresh: row.totalTokensFresh,
    percentUsed: row.percentUsed,
    inputTokens: row.inputTokens ?? null,
    outputTokens: row.outputTokens ?? null,
    abortedLastRun: Boolean(row.abortedLastRun || row.flags.includes("aborted")),
    flags: row.flags,
    promptContext: row.promptContext ?? null,
    usage: null,
    pointer: `openclaw sessions show ${row.key}${agentPart}`,
  };
}

function toSessionUsageInsight(params: {
  summary: SessionCostSummary | null;
  cacheStatus: UsageCacheStatus;
}): RunInsightSessionUsage | null {
  if (!params.summary) {
    return null;
  }
  const messageCounts = params.summary.messageCounts;
  const toolUsage = params.summary.toolUsage;
  return {
    cacheStatus: params.cacheStatus.status,
    totalCost: params.summary.totalCost,
    totalTokens: params.summary.totalTokens,
    durationMs: params.summary.durationMs ?? null,
    duration: formatDurationMs(params.summary.durationMs ?? null),
    messageCount: messageCounts?.total ?? null,
    toolCalls: toolUsage?.totalCalls ?? 0,
    uniqueTools: toolUsage?.uniqueTools ?? 0,
    topTools: toolUsage?.tools.slice(0, 5) ?? [],
    errors: messageCounts?.errors ?? 0,
  };
}

async function loadCachedSessionUsage(
  row: RunInsightSession,
  config = getRuntimeConfig(),
): Promise<RunInsightSessionUsage | null> {
  if (!row.sessionId) {
    return null;
  }
  const sessionFile = resolveExistingUsageSessionFile({
    sessionId: row.sessionId,
    agentId: row.agentId ?? undefined,
  });
  if (!sessionFile) {
    return null;
  }
  const usage = await loadSessionCostSummaryFromCache({
    sessionId: row.sessionId,
    sessionFile,
    agentId: row.agentId ?? undefined,
    config,
    requestRefresh: false,
  });
  return toSessionUsageInsight(usage);
}

async function attachCachedSessionUsage(
  sessions: RunInsightSession[],
): Promise<RunInsightSession[]> {
  const config = getRuntimeConfig();
  const usageRows = await Promise.all(
    sessions.map((session) => loadCachedSessionUsage(session, config)),
  );
  return sessions.map((session, index) => ({
    ...session,
    usage: usageRows[index] ?? null,
  }));
}

function taskReferenceAt(task: TaskRecord): number {
  return task.lastEventAt ?? task.startedAt ?? task.createdAt;
}

function taskElapsedMs(task: TaskRecord, now: number): number | null {
  if (typeof task.startedAt !== "number") {
    return null;
  }
  return Math.max(0, (task.endedAt ?? now) - task.startedAt);
}

function taskMatchesActiveFilter(task: TaskRecord, activeMinutes: number | undefined, now: number) {
  if (activeMinutes === undefined) {
    return true;
  }
  return now - taskReferenceAt(task) <= activeMinutes * 60_000;
}

function taskMatchesAgentFilter(task: TaskRecord, agent: string | undefined): boolean {
  if (!agent) {
    return true;
  }
  return task.agentId === agent || task.ownerKey.includes(`agent:${agent}:`);
}

function taskMatchesSessionFilter(task: TaskRecord, session: string | undefined): boolean {
  if (!session) {
    return true;
  }
  return (
    sessionReferenceMatches(task.requesterSessionKey, session) ||
    sessionReferenceMatches(task.ownerKey, session) ||
    sessionReferenceMatches(task.childSessionKey, session)
  );
}

function taskMatchesTaskFilter(task: TaskRecord, taskId: string | undefined): boolean {
  if (!taskId) {
    return true;
  }
  return task.taskId === taskId;
}

function isCodexNativeChildTask(task: Pick<RunInsightTask, "runId" | "taskKind">): boolean {
  return task.taskKind === "codex-native" || task.runId?.startsWith("codex-thread:") === true;
}

function taskHasChildEvidence(
  task: Pick<RunInsightTask, "activeProgress" | "childSessionKey" | "runId" | "taskKind">,
): boolean {
  return Boolean(
    task.childSessionKey ||
    isCodexNativeChildTask(task) ||
    task.activeProgress?.childRole ||
    task.activeProgress?.childAgentPath,
  );
}

function classifyTaskAttention(
  task: TaskRecord,
  insight: Pick<
    RunInsightTask,
    "activeProgress" | "ageMs" | "childSessionKey" | "deliveryStatus" | "status" | "latestEvent"
  >,
): RunInsightTask["attention"] {
  const pointer = `openclaw tasks show ${task.taskId}`;
  const activeProgressText =
    insight.activeProgress?.outputSummary ??
    insight.activeProgress?.command ??
    insight.activeProgress?.note ??
    insight.activeProgress?.currentPhase ??
    insight.activeProgress?.activeLabel ??
    undefined;
  const progressText =
    activeProgressText ??
    task.progressSummary ??
    task.executionReceipt?.latestEvent?.summary ??
    task.label ??
    task.taskKind;
  const compactProgressText = compactSummaryText(progressText);
  const stageText = [
    activeProgressText,
    task.progressSummary,
    task.executionReceipt?.latestEvent?.summary,
    task.label,
    task.taskKind,
    task.task,
  ].find(textMatchesRunStage);
  if (DELIVERY_ISSUE_STATUSES.has(insight.deliveryStatus)) {
    return {
      waitClass: "delivery",
      reason: `deliveryStatus=${insight.deliveryStatus}`,
      pointer,
    };
  }
  if (
    insight.activeProgress?.childRole &&
    (insight.status === "queued" || insight.status === "running")
  ) {
    return {
      waitClass: "active_child",
      reason: `active Codex child ${insight.activeProgress.childRole}`,
      pointer,
    };
  }
  if (insight.childSessionKey && (insight.status === "queued" || insight.status === "running")) {
    return {
      waitClass: "active_child",
      reason: `active child session ${insight.childSessionKey}`,
      pointer,
    };
  }
  if (
    stageText &&
    (insight.status === "queued" ||
      insight.status === "running" ||
      insight.status === "failed" ||
      insight.status === "timed_out" ||
      insight.status === "cancelled" ||
      insight.status === "lost")
  ) {
    return {
      waitClass: "validation_or_promotion",
      reason:
        compactSummaryText(stageText) ??
        compactProgressText ??
        "task text references validation, build, deploy, proof, or promotion work",
      pointer,
    };
  }
  if (insight.status === "queued") {
    return {
      waitClass: "queued",
      reason: "task is queued in native task readback",
      pointer,
    };
  }
  if (
    (insight.status === "running" || insight.status === "queued") &&
    insight.ageMs >= LONG_ACTIVE_TASK_WARN_MS
  ) {
    return {
      waitClass: "long_running",
      reason: `task has been ${insight.status} for ${formatDurationMs(insight.ageMs)}`,
      pointer,
    };
  }
  return {
    waitClass: null,
    reason: null,
    pointer,
  };
}

function readRecentDeployEventLines(stateDir = resolveStateDir(process.env)): string[] {
  const eventsPath = path.join(stateDir, "deploy", "events.ndjson");
  if (!fs.existsSync(eventsPath)) {
    return [];
  }
  const text = fs.readFileSync(eventsPath, "utf8");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-DEPLOY_EVENT_TAIL_LINES);
}

function readRecentDeployEvents(limit: number): RunInsightDeployEvent[] {
  const now = Date.now();
  return readRecentDeployEventLines()
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((event): event is Record<string, unknown> => event !== null)
    .reverse()
    .slice(0, limit)
    .map((event) => {
      const generatedAt = typeof event.generatedAt === "string" ? event.generatedAt : null;
      const eventTime = generatedAt ? Date.parse(generatedAt) : NaN;
      const ageMs = Number.isFinite(eventTime) ? Math.max(0, now - eventTime) : null;
      const buildEpisode =
        event.buildEpisode && typeof event.buildEpisode === "object"
          ? (event.buildEpisode as Record<string, unknown>)
          : null;
      const artifactRefs = Array.isArray(event.artifactRefs)
        ? event.artifactRefs
            .filter((ref): ref is Record<string, unknown> =>
              Boolean(ref && typeof ref === "object"),
            )
            .map((ref) => ({
              kind: typeof ref.kind === "string" ? ref.kind : null,
              path: typeof ref.path === "string" ? ref.path : null,
            }))
        : [];
      return {
        eventId: typeof event.eventId === "string" ? event.eventId : "unknown",
        eventType: typeof event.eventType === "string" ? event.eventType : "unknown",
        status: typeof event.status === "string" ? event.status : null,
        generatedAt,
        ageMs,
        age: formatDurationMs(ageMs),
        imageRef: typeof event.imageRef === "string" ? event.imageRef : null,
        imageDigest: typeof event.imageDigest === "string" ? event.imageDigest : null,
        sourceCommit: typeof event.sourceCommit === "string" ? event.sourceCommit : null,
        buildProfile: typeof event.buildProfile === "string" ? event.buildProfile : null,
        previousImageDigest:
          typeof event.previousImageDigest === "string" ? event.previousImageDigest : null,
        buildEpisodeId:
          buildEpisode && typeof buildEpisode.id === "string" ? buildEpisode.id : null,
        artifactRefs,
        artifactSummary: deployEventArtifactSummary(event, artifactRefs),
      };
    });
}

function toInsightTask(
  task: TaskRecord,
  now: number,
  progressContext?: TaskReadbackProgressProjectionContext,
): RunInsightTask {
  const referenceAt = taskReferenceAt(task);
  const elapsedMs = taskElapsedMs(task, now);
  const latestEvent = task.executionReceipt?.latestEvent;
  const activeProgress = resolveTaskReadbackProgressProjection(task, progressContext) ?? null;
  const insight = {
    taskId: task.taskId,
    runtime: task.runtime,
    status: task.status,
    deliveryStatus: task.deliveryStatus,
    taskKind: task.taskKind ?? null,
    agentId: task.agentId ?? null,
    runId: task.runId ?? null,
    label: task.label ?? null,
    ownerKey: task.ownerKey,
    requesterSessionKey: task.requesterSessionKey,
    childSessionKey: task.childSessionKey ?? null,
    parentTaskId: task.parentTaskId ?? null,
    parentFlowId: task.parentFlowId ?? null,
    createdAt: task.createdAt,
    startedAt: task.startedAt ?? null,
    endedAt: task.endedAt ?? null,
    lastEventAt: task.lastEventAt ?? null,
    ageMs: Math.max(0, now - referenceAt),
    age: formatDurationMs(Math.max(0, now - referenceAt)),
    elapsedMs,
    elapsed: formatDurationMs(elapsedMs),
    latestEvent: latestEvent
      ? {
          kind: latestEvent.kind,
          at: latestEvent.at,
          summary: compactSummaryText(latestEvent.summary),
        }
      : null,
    activeProgress,
    progressSummary: compactSummaryText(task.progressSummary),
    attention: {
      waitClass: null,
      reason: null,
      pointer: `openclaw tasks show ${task.taskId}`,
    },
    pointer: `openclaw tasks show ${task.taskId}`,
  };
  return {
    ...insight,
    attention: classifyTaskAttention(task, insight),
  };
}

function buildSignals(
  summary: StatusSummary,
  sessions: RunInsightSession[],
  tasks: RunInsightTask[],
  deployEvents: RunInsightDeployEvent[],
): RunInsightSignal[] {
  const signals: RunInsightSignal[] = [];

  if (summary.tasks.failures > 0) {
    signals.push({
      severity: "error",
      code: "task_failures_present",
      message: `${summary.tasks.failures} task failure(s) are present in task registry readback.`,
      evidence: {
        failures: summary.tasks.failures,
        pointer: "openclaw tasks audit --json",
      },
    });
  }

  if (summary.tasks.active > 0) {
    signals.push({
      severity: "info",
      code: "active_tasks_present",
      message: `${summary.tasks.active} active task(s) are present.`,
      evidence: {
        active: summary.tasks.active,
        pointer: "openclaw tasks list --summary",
      },
    });
  }

  for (const session of sessions) {
    if (session.abortedLastRun) {
      signals.push({
        severity: "warn",
        code: "session_aborted_last_run",
        message: `${session.key} reports an aborted last run.`,
        evidence: {
          sessionKey: session.key,
          pointer: session.pointer,
        },
      });
    }

    if (typeof session.percentUsed === "number") {
      const severity = session.percentUsed >= HIGH_CONTEXT_ERROR_PERCENT ? "error" : "warn";
      if (session.percentUsed >= HIGH_CONTEXT_WARN_PERCENT) {
        signals.push({
          severity,
          code: "high_context_pressure",
          message: `${session.key} is at ${session.percentUsed}% of configured context.`,
          evidenceQuality: session.totalTokensFresh ? "evidence_backed" : "stale",
          confidence: session.totalTokensFresh ? "high" : "low",
          evidence: {
            sessionKey: session.key,
            percentUsed: session.percentUsed,
            totalTokens: session.totalTokens,
            totalTokensFresh: session.totalTokensFresh,
            pointer: session.pointer,
          },
        });
      }
    }

    if (session.totalTokens !== null && !session.totalTokensFresh) {
      signals.push({
        severity: "info",
        code: "stale_token_estimate",
        message: `${session.key} token usage is retained but not fresh.`,
        evidenceQuality: "stale",
        confidence: "low",
        evidence: {
          sessionKey: session.key,
          totalTokens: session.totalTokens,
          pointer: session.pointer,
        },
      });
    }

    if (session.usage?.toolCalls && session.usage.toolCalls >= TOOL_HEAVY_SESSION_WARN_CALLS) {
      signals.push({
        severity: "warn",
        code: "tool_heavy_session",
        message: `${session.key} has ${session.usage.toolCalls} cached tool call(s).`,
        evidenceQuality: qualityLabelForUsage(session),
        confidence: confidenceForQuality(qualityLabelForUsage(session)),
        evidence: {
          sessionKey: session.key,
          toolCalls: session.usage.toolCalls,
          topTools: session.usage.topTools,
          pointer: session.pointer,
        },
      });
    }

    if (session.usage?.errors && session.usage.errors > 0) {
      signals.push({
        severity: "warn",
        code: "session_usage_errors",
        message: `${session.key} has ${session.usage.errors} cached usage/parsing error(s).`,
        evidenceQuality: qualityLabelForUsage(session),
        confidence: confidenceForQuality(qualityLabelForUsage(session)),
        evidence: {
          sessionKey: session.key,
          errors: session.usage.errors,
          pointer: session.pointer,
        },
      });
    }
  }

  for (const task of tasks) {
    if (task.childSessionKey && (task.status === "queued" || task.status === "running")) {
      signals.push({
        severity: "info",
        code: "active_child_task",
        message: `${task.taskId} is active child work for ${task.childSessionKey}.`,
        evidenceQuality: "evidence_backed",
        confidence: "high",
        evidence: {
          taskId: task.taskId,
          childSessionKey: task.childSessionKey,
          pointer: task.pointer,
        },
      });
    }

    if (DELIVERY_ISSUE_STATUSES.has(task.deliveryStatus)) {
      signals.push({
        severity: task.deliveryStatus === "failed" ? "error" : "warn",
        code: "task_delivery_issue",
        message: `${task.taskId} has deliveryStatus=${task.deliveryStatus}.`,
        evidenceQuality: "evidence_backed",
        confidence: "high",
        evidence: {
          taskId: task.taskId,
          deliveryStatus: task.deliveryStatus,
          pointer: task.pointer,
        },
      });
    }

    if (
      (task.status === "queued" || task.status === "running") &&
      task.ageMs >= LONG_ACTIVE_TASK_WARN_MS
    ) {
      signals.push({
        severity: "warn",
        code: "long_active_task",
        message: `${task.taskId} has been ${task.status} for ${task.age}.`,
        evidenceQuality: "heuristic",
        confidence: "medium",
        evidence: {
          taskId: task.taskId,
          status: task.status,
          ageMs: task.ageMs,
          pointer: task.pointer,
        },
      });
    }
  }

  const failedDeployEvents = deployEvents.filter(
    (event) => event.status && !["built", "passed", "prepared"].includes(event.status),
  );
  if (failedDeployEvents.length > 0) {
    signals.push({
      severity: "warn",
      code: "recent_deploy_event_failure",
      message: `${failedDeployEvents.length} recent deploy event(s) are not successful/prepared.`,
      evidenceQuality: "evidence_backed",
      confidence: "high",
      evidence: {
        eventIds: failedDeployEvents.map((event) => event.eventId),
        pointer: "openclaw run-insights --json",
      },
    });
  }

  if (signals.length === 0) {
    signals.push({
      severity: "info",
      code: "no_immediate_run_pressure",
      message: "No immediate run-pressure signals appeared in bounded status readback.",
      evidenceQuality: "scoped",
      confidence: "medium",
    });
  }

  return signals;
}

function buildAttention(params: {
  summary: StatusSummary;
  sessions: RunInsightSession[];
  tasks: RunInsightTask[];
  deployEvents: RunInsightDeployEvent[];
}): RunInsightsReport["attention"] {
  const whyWorkMayFeelSlow: RunInsightAttentionItem[] = [];
  const validationAndPromotion: RunInsightAttentionItem[] = [];
  const evidencePointers = new Set<string>([
    "openclaw status --json",
    "openclaw sessions --json",
    "openclaw tasks list --summary",
    "openclaw tasks audit --json",
    "openclaw run-insights --json",
  ]);

  if (params.summary.tasks.active > 0) {
    whyWorkMayFeelSlow.push({
      severity: "info",
      code: "active_task_work",
      message: `${params.summary.tasks.active} active native task(s) can make the parent run look quiet while child work proceeds.`,
      source: "status",
      pointer: "openclaw tasks list --summary",
      evidence: {
        active: params.summary.tasks.active,
        byRuntime: params.summary.tasks.byRuntime,
      },
      evidenceQuality: "evidence_backed",
      confidence: "high",
    });
  }

  for (const session of params.sessions) {
    if (
      typeof session.percentUsed === "number" &&
      session.percentUsed >= HIGH_CONTEXT_WARN_PERCENT
    ) {
      whyWorkMayFeelSlow.push({
        severity: session.percentUsed >= HIGH_CONTEXT_ERROR_PERCENT ? "error" : "warn",
        code: "context_pressure",
        message: `${session.key} is under high context pressure, which can slow or destabilize long turns.`,
        source: "session",
        pointer: session.pointer,
        evidence: {
          sessionKey: session.key,
          percentUsed: session.percentUsed,
          totalTokens: session.totalTokens,
          totalTokensFresh: session.totalTokensFresh,
        },
        evidenceQuality: session.totalTokensFresh ? "evidence_backed" : "stale",
        confidence: session.totalTokensFresh ? "high" : "low",
      });
      evidencePointers.add(session.pointer);
    }

    if (session.usage?.toolCalls && session.usage.toolCalls >= TOOL_HEAVY_SESSION_WARN_CALLS) {
      whyWorkMayFeelSlow.push({
        severity: "warn",
        code: "tool_volume",
        message: `${session.key} has cached evidence of heavy tool use in this run.`,
        source: "session",
        pointer: session.pointer,
        evidence: {
          sessionKey: session.key,
          toolCalls: session.usage.toolCalls,
          uniqueTools: session.usage.uniqueTools,
          topTools: session.usage.topTools,
          durationMs: session.usage.durationMs,
        },
        evidenceQuality: qualityLabelForUsage(session),
        confidence: confidenceForQuality(qualityLabelForUsage(session)),
      });
      evidencePointers.add(session.pointer);
    }
  }

  for (const task of params.tasks) {
    if (task.attention.waitClass) {
      const item: RunInsightAttentionItem = {
        severity:
          task.attention.waitClass === "delivery" || task.attention.waitClass === "long_running"
            ? "warn"
            : "info",
        code: `task_${task.attention.waitClass}`,
        message: `${task.taskId}: ${task.attention.reason ?? task.attention.waitClass}.`,
        source: "task",
        pointer: task.pointer,
        evidence: {
          taskId: task.taskId,
          status: task.status,
          deliveryStatus: task.deliveryStatus,
          ageMs: task.ageMs,
          elapsedMs: task.elapsedMs,
          childSessionKey: task.childSessionKey,
          latestEvent: task.latestEvent,
          activeProgress: task.activeProgress,
          progressSummary: task.progressSummary,
        },
        evidenceQuality:
          task.attention.waitClass === "long_running" ||
          task.attention.waitClass === "validation_or_promotion"
            ? "heuristic"
            : "evidence_backed",
        confidence:
          task.attention.waitClass === "long_running" ||
          task.attention.waitClass === "validation_or_promotion"
            ? "medium"
            : "high",
      };
      whyWorkMayFeelSlow.push(item);
      evidencePointers.add(task.pointer);
      if (task.attention.waitClass === "validation_or_promotion") {
        validationAndPromotion.push({
          ...item,
          code: "task_validation_or_promotion",
        });
      }
    }
  }

  for (const event of params.deployEvents) {
    const recent = event.ageMs !== null && event.ageMs <= RECENT_DEPLOY_ATTENTION_MS;
    const stageLike = textMatchesRunStage(event.eventType) || textMatchesRunStage(event.status);
    if (!recent && !stageLike) {
      continue;
    }
    const item: RunInsightAttentionItem = {
      severity:
        event.status && !["built", "passed", "prepared"].includes(event.status) ? "warn" : "info",
      code: "deploy_receipt_activity",
      message: `${event.eventType}${event.status ? ` status=${event.status}` : ""} is present in recent deploy receipts.`,
      source: "deploy",
      pointer: "openclaw run-insights --json",
      evidence: {
        eventId: event.eventId,
        eventType: event.eventType,
        status: event.status,
        ageMs: event.ageMs,
        durationMs: event.artifactSummary?.durationMs ?? null,
        slowestChecks: event.artifactSummary?.slowestChecks ?? [],
        buildEpisodeId: event.buildEpisodeId,
        artifactRefs: event.artifactRefs,
      },
      evidenceQuality: event.artifactSummary?.readable === false ? "unknown" : "evidence_backed",
      confidence: event.artifactSummary?.readable === false ? "unknown" : "high",
    };
    validationAndPromotion.push(item);
    evidencePointers.add("openclaw run-insights --json");
    for (const ref of event.artifactRefs) {
      if (ref.path) {
        evidencePointers.add(ref.path);
      }
    }
  }

  return {
    whyWorkMayFeelSlow,
    validationAndPromotion,
    evidencePointers: [...evidencePointers],
  };
}

function buildDiagnosticSummary(params: {
  filters: RunInsightsReport["filters"];
  attention: RunInsightsReport["attention"];
  performanceProfile: RunInsightsReport["performanceProfile"];
  sessions: RunInsightSession[];
  tasks: RunInsightTask[];
  deployEvents: RunInsightDeployEvent[];
  signals: RunInsightSignal[];
}): RunInsightsReport["diagnosticSummary"] {
  const activeTasks = params.tasks.filter(
    (task) => task.status === "queued" || task.status === "running",
  );
  const phaseTask =
    activeTasks.find((task) => task.attention.waitClass === "validation_or_promotion") ??
    activeTasks.find((task) => task.attention.waitClass) ??
    params.tasks.find((task) => task.latestEvent);
  const phaseDeploy = params.deployEvents[0] ?? null;
  const currentOrLastKnownPhase = phaseTask
    ? {
        label:
          phaseTask.attention.reason ??
          phaseTask.progressSummary ??
          phaseTask.latestEvent?.summary ??
          phaseTask.status,
        source: "task" as const,
        pointer: phaseTask.pointer,
        confidence:
          phaseTask.attention.waitClass === "validation_or_promotion"
            ? ("medium" as const)
            : ("high" as const),
        evidenceQuality:
          phaseTask.attention.waitClass === "validation_or_promotion"
            ? ("heuristic" as const)
            : ("evidence_backed" as const),
        reason: "derived from the newest bounded native task row in scope",
      }
    : phaseDeploy
      ? {
          label: `${phaseDeploy.eventType}${phaseDeploy.status ? ` ${phaseDeploy.status}` : ""}`,
          source: "deploy" as const,
          pointer:
            phaseDeploy.artifactRefs.find((ref) => ref.path)?.path ??
            "openclaw run-insights --json",
          confidence: "high" as const,
          evidenceQuality: "evidence_backed" as const,
          reason: "derived from the newest global/unscoped deploy receipt in the bounded tail",
        }
      : {
          label: "unknown",
          source: "none" as const,
          pointer: null,
          confidence: "unknown" as const,
          evidenceQuality: "unknown" as const,
          reason:
            "no active task, latest task event, or deploy receipt appeared in bounded readback",
        };

  const knownSessionDurationMs =
    params.sessions.reduce<number | null>((max, session) => {
      const duration = session.usage?.durationMs ?? null;
      if (duration === null) {
        return max;
      }
      return Math.max(max ?? 0, duration);
    }, null) ?? null;
  const activeTaskElapsedMs =
    activeTasks.reduce<number | null>((max, task) => {
      if (task.elapsedMs === null) {
        return max;
      }
      return Math.max(max ?? 0, task.elapsedMs);
    }, null) ?? null;
  const childTasks = params.tasks.filter(taskHasChildEvidence);
  const activeChildTasks = childTasks.filter(
    (task) => task.status === "queued" || task.status === "running",
  );
  const parentWaitTask =
    activeTasks.find((task) => task.attention.waitClass) ??
    params.tasks.find((task) => task.attention.waitClass);
  const artifactPointers = uniqueStrings(
    params.deployEvents.flatMap((event) => event.artifactRefs.map((ref) => ref.path)),
  );
  const missingPointers = uniqueStrings([
    params.sessions.some((session) => !session.usage) ? "native session usage cache" : undefined,
    params.deployEvents.some((event) => event.artifactSummary?.readable === false)
      ? "deploy artifact summary"
      : undefined,
    params.tasks.length === 0 ? "openclaw tasks list --summary" : undefined,
  ]);
  const qualities: EvidenceQuality[] = [
    ...params.signals.map((signal) => signal.evidenceQuality ?? "unknown"),
    ...params.attention.whyWorkMayFeelSlow.map((item) => item.evidenceQuality ?? "unknown"),
    ...params.attention.validationAndPromotion.map((item) => item.evidenceQuality ?? "unknown"),
    currentOrLastKnownPhase.evidenceQuality,
    params.filters.agent ||
    params.filters.session ||
    params.filters.task ||
    params.filters.activeMinutes
      ? "scoped"
      : "evidence_backed",
    ...missingPointers.map(() => "unknown" as const),
  ];
  const countQuality = (quality: EvidenceQuality) =>
    qualities.filter((candidate) => candidate === quality).length;
  return {
    currentOrLastKnownPhase,
    timeSpent: {
      knownSessionDurationMs,
      activeTaskElapsedMs,
      deployReceiptKnownDurationMs:
        params.performanceProfile.retryBuildProofCost.totalKnownDurationMs,
      confidence:
        knownSessionDurationMs !== null || activeTaskElapsedMs !== null
          ? "high"
          : params.performanceProfile.retryBuildProofCost.deployReceiptCount > 0
            ? "medium"
            : "unknown",
      evidenceQuality:
        knownSessionDurationMs !== null || activeTaskElapsedMs !== null
          ? "evidence_backed"
          : params.performanceProfile.retryBuildProofCost.deployReceiptCount > 0
            ? "scoped"
            : "unknown",
    },
    childWork: {
      displayedChildTasks: childTasks.length,
      activeChildTasks: activeChildTasks.length,
      contribution:
        childTasks.length > 0
          ? `${activeChildTasks.length} active child task(s), ${childTasks.length} child task(s) displayed`
          : "no child task evidence in bounded scope",
      confidence: childTasks.length > 0 ? "high" : "unknown",
      evidenceQuality: childTasks.length > 0 ? "evidence_backed" : "unknown",
      pointer: childTasks[0]?.pointer ?? null,
    },
    parentWaitState: {
      waitClass: parentWaitTask?.attention.waitClass ?? "unknown",
      reason:
        parentWaitTask?.attention.reason ??
        (activeTasks.length > 0
          ? "active native task(s) are present, but no more specific wait class was derived"
          : "no active parent wait evidence in bounded scope"),
      pointer: parentWaitTask?.pointer ?? null,
      confidence: parentWaitTask?.attention.waitClass ? "medium" : "unknown",
      evidenceQuality: parentWaitTask?.attention.waitClass ? "heuristic" : "unknown",
    },
    validationBuildPromotion: {
      attentionItems: params.attention.validationAndPromotion.length,
      bottlenecks: params.performanceProfile.validationBuildBottlenecks.length,
      deployReceipts: params.performanceProfile.retryBuildProofCost.deployReceiptCount,
      artifactPointers,
      confidence:
        params.attention.validationAndPromotion.length > 0 || artifactPointers.length > 0
          ? "medium"
          : "unknown",
      evidenceQuality:
        params.attention.validationAndPromotion.length > 0 || artifactPointers.length > 0
          ? "heuristic"
          : "unknown",
    },
    evidenceQuality: {
      evidenceBacked: countQuality("evidence_backed"),
      heuristic: countQuality("heuristic"),
      stale: countQuality("stale"),
      scoped: countQuality("scoped"),
      unknown: countQuality("unknown"),
      missingPointers,
    },
    operatorNextAction: parentWaitTask?.pointer
      ? {
          label: "Inspect native task evidence",
          pointer: parentWaitTask.pointer,
          reason:
            parentWaitTask.attention.reason ?? "task readback has the most specific wait evidence",
        }
      : artifactPointers[0]
        ? {
            label: "Inspect deploy/proof artifact",
            pointer: artifactPointers[0],
            reason: "deploy receipt artifact is the most specific bounded pointer in this report",
          }
        : {
            label: "Refresh bounded native readback",
            pointer: "openclaw run-insights --json",
            reason: "the report has unknown evidence and no more specific task or artifact pointer",
          },
  };
}

function buildPerformanceProfile(params: {
  sessions: RunInsightSession[];
  tasks: RunInsightTask[];
  deployEvents: RunInsightDeployEvent[];
  signals: RunInsightSignal[];
}): RunInsightsReport["performanceProfile"] {
  const expensiveRunExplanation: RunInsightsReport["performanceProfile"]["expensiveRunExplanation"] =
    [];
  const timeline: RunInsightsReport["performanceProfile"]["timeline"] = [];
  const validationBuildBottlenecks: RunInsightsReport["performanceProfile"]["validationBuildBottlenecks"] =
    [];

  for (const session of params.sessions) {
    if (session.usage && session.usage.totalCost >= EXPENSIVE_RUN_COST_WARN_USD) {
      expensiveRunExplanation.push({
        code: "session_cost",
        severity: "warn",
        message: `${session.key} has cached cost $${session.usage.totalCost.toFixed(4)}.`,
        pointer: session.pointer,
        evidence: {
          sessionKey: session.key,
          totalCost: session.usage.totalCost,
          totalTokens: session.usage.totalTokens,
          durationMs: session.usage.durationMs,
          cacheStatus: session.usage.cacheStatus,
        },
      });
    }
    if (session.usage && session.usage.durationMs !== null) {
      timeline.push({
        at: session.updatedAt,
        age: session.age,
        source: "session",
        label: `${session.key} cached usage duration ${session.usage.duration}`,
        pointer: session.pointer,
        evidence: {
          durationMs: session.usage.durationMs,
          toolCalls: session.usage.toolCalls,
          totalCost: session.usage.totalCost,
        },
      });
    }
    if (session.usage?.durationMs && session.usage.durationMs >= LONG_SESSION_DURATION_WARN_MS) {
      expensiveRunExplanation.push({
        code: "session_duration",
        severity: "info",
        message: `${session.key} has cached duration ${session.usage.duration}.`,
        pointer: session.pointer,
        evidence: {
          sessionKey: session.key,
          durationMs: session.usage.durationMs,
          messageCount: session.usage.messageCount,
          toolCalls: session.usage.toolCalls,
        },
      });
    }
  }

  for (const task of params.tasks) {
    if (task.latestEvent) {
      timeline.push({
        at: task.latestEvent.at,
        age: task.age,
        source: "task",
        label: `${task.taskId} latest ${task.latestEvent.kind}`,
        pointer: task.pointer,
        evidence: {
          status: task.status,
          deliveryStatus: task.deliveryStatus,
          summary: task.latestEvent.summary,
          progressSummary: task.progressSummary,
        },
      });
    }
    if (task.attention.waitClass === "validation_or_promotion") {
      validationBuildBottlenecks.push({
        code: "task_validation_or_promotion",
        message: task.attention.reason ?? "Task references validation, build, proof, or promotion.",
        pointer: task.pointer,
        evidence: {
          taskId: task.taskId,
          status: task.status,
          elapsedMs: task.elapsedMs,
          latestEvent: task.latestEvent,
          progressSummary: task.progressSummary,
        },
      });
    }
  }

  const deployDurations = params.deployEvents
    .map((event) => ({
      event,
      durationMs: event.artifactSummary?.durationMs ?? null,
    }))
    .filter(
      (entry): entry is { event: RunInsightDeployEvent; durationMs: number } =>
        typeof entry.durationMs === "number",
    );
  for (const { event, durationMs } of deployDurations) {
    timeline.push({
      at: event.generatedAt ? Date.parse(event.generatedAt) : null,
      age: event.age,
      source: "deploy",
      label: `${event.eventType}${event.status ? ` ${event.status}` : ""}`,
      pointer: event.artifactRefs.find((ref) => ref.path)?.path ?? "openclaw run-insights --json",
      evidence: {
        eventId: event.eventId,
        durationMs,
        slowestChecks: event.artifactSummary?.slowestChecks ?? [],
        buildEpisodeId: event.buildEpisodeId,
      },
    });
    if (durationMs >= SLOW_DEPLOY_RECEIPT_WARN_MS) {
      validationBuildBottlenecks.push({
        code: "slow_deploy_receipt",
        message: `${event.eventType} receipt took ${formatDurationMs(durationMs)}.`,
        pointer: event.artifactRefs.find((ref) => ref.path)?.path ?? "openclaw run-insights --json",
        evidence: {
          eventId: event.eventId,
          eventType: event.eventType,
          status: event.status,
          durationMs,
          slowestChecks: event.artifactSummary?.slowestChecks ?? [],
        },
      });
    }
  }

  const totalKnownDurationMs = deployDurations.reduce((sum, entry) => sum + entry.durationMs, 0);
  const slowestDeploy = deployDurations.toSorted((a, b) => b.durationMs - a.durationMs)[0] ?? null;
  const childSessionEvidence = params.tasks.filter(taskHasChildEvidence).map((task) => ({
    taskId: task.taskId,
    childSessionKey: task.childSessionKey ?? "",
    childRole: task.activeProgress?.childRole ?? null,
    childAgentPath: task.activeProgress?.childAgentPath ?? null,
    childPhase: task.activeProgress?.childPhase ?? null,
    spawnReason: task.activeProgress?.spawnReason ?? null,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    endedAt: task.endedAt,
    status: task.status,
    elapsedMs: task.elapsedMs,
    elapsed: task.elapsed,
    pointer: task.pointer,
  }));
  const skillActivationEvidence = params.sessions
    .filter((session) => session.promptContext?.skills)
    .map((session) => {
      const skills = session.promptContext?.skills;
      return {
        sessionKey: session.key,
        agentId: session.agentId,
        visibleSkillCount: skills?.skillCount ?? null,
        visibleSkillNames: skills?.skillNames?.slice(0, 12) ?? [],
        skillFilter: skills?.skillFilter ?? null,
        promptChars: skills?.promptChars ?? null,
        promptHash: skills?.promptHash ?? null,
        promptRef: skills?.promptRef ?? null,
        activationEvidence: "visible_skill_catalog" as const,
        actualUsePointer:
          "openclaw trajectory export marks invoked skills when SKILL.md is read via native read",
        pointer: session.pointer,
      };
    });

  const advisoryInefficiencyFlags = params.signals.filter((signal) =>
    [
      "high_context_pressure",
      "tool_heavy_session",
      "long_active_task",
      "task_delivery_issue",
      "session_usage_errors",
      "recent_deploy_event_failure",
    ].includes(signal.code),
  );

  return {
    expensiveRunExplanation,
    timeline: timeline.toSorted((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 12),
    childSessionEvidence,
    skillActivationEvidence,
    retryBuildProofCost: {
      deployReceiptCount: deployDurations.length,
      totalKnownDurationMs,
      totalKnownDuration: formatDurationMs(totalKnownDurationMs),
      slowestReceipt: slowestDeploy
        ? {
            eventId: slowestDeploy.event.eventId,
            eventType: slowestDeploy.event.eventType,
            durationMs: slowestDeploy.durationMs,
            duration: formatDurationMs(slowestDeploy.durationMs),
            pointer:
              slowestDeploy.event.artifactRefs.find((ref) => ref.path)?.path ??
              "openclaw run-insights --json",
          }
        : null,
    },
    validationBuildBottlenecks,
    advisoryInefficiencyFlags,
  };
}

export function buildRunInsightsReport(
  summary: StatusSummary,
  options: {
    agent?: string;
    session?: string;
    task?: string;
    activeMinutes?: number;
    limit: number;
    now?: number;
    taskRecords?: TaskRecord[];
    sessionUsage?: Map<string, RunInsightSessionUsage | null>;
  },
): RunInsightsReport {
  const now = options.now ?? Date.now();
  const recent = selectRecentSessions(summary, options.agent);
  const filtered = recent
    .filter((row) => sessionMatchesSessionFilter(row, options.session))
    .filter((row) => sessionMatchesActiveFilter(row, options.activeMinutes));
  const sessions = filtered
    .slice(0, options.limit)
    .map(toInsightSession)
    .map((session) => ({
      ...session,
      usage: options.sessionUsage?.get(session.key) ?? session.usage,
    }));
  const taskRecords = options.taskRecords ?? listTaskRecords();
  const progressContext = createTaskReadbackProgressProjectionContext({ now });
  const tasks = taskRecords
    .filter((task) => taskMatchesAgentFilter(task, options.agent))
    .filter((task) => taskMatchesSessionFilter(task, options.session))
    .filter((task) => taskMatchesTaskFilter(task, options.task))
    .filter((task) => taskMatchesActiveFilter(task, options.activeMinutes, now))
    .slice(0, options.limit)
    .map((task) => toInsightTask(task, now, progressContext));
  const deployEvents = readRecentDeployEvents(options.limit);
  const lastPromotedEvent = deployEvents.find(
    (event) => event.eventType === "deploy.promote" && event.status === "passed",
  );
  const failedDeployEvents = deployEvents.filter(
    (event) => event.status && !["built", "passed", "prepared"].includes(event.status),
  );

  const attention = buildAttention({
    summary,
    sessions,
    tasks,
    deployEvents,
  });
  const signals = buildSignals(summary, sessions, tasks, deployEvents);
  const performanceProfile = buildPerformanceProfile({
    sessions,
    tasks,
    deployEvents,
    signals,
  });
  const filters = {
    agent: options.agent ?? null,
    session: options.session ?? null,
    task: options.task ?? null,
    activeMinutes: options.activeMinutes ?? null,
    limit: options.limit,
  };
  const diagnosticSummary = buildDiagnosticSummary({
    filters,
    attention,
    performanceProfile,
    sessions,
    tasks,
    deployEvents,
    signals,
  });

  const advisory = buildAdvisoryReadback({
    surface: "Run Insights",
    pointers: attention.evidencePointers,
    caveats: [
      "Session usage comes from the native usage cache and may be absent or stale.",
      "Deploy/build/promote details are global/unscoped receipt pointers, not deployment authority.",
    ],
  });

  return {
    schema: "openclaw.run_insights.v1",
    generatedAt: new Date(now).toISOString(),
    authority: advisory.semantics,
    advisory,
    filters,
    deployEvidenceScope: {
      scope: "global_unscoped",
      filteredBy: [],
      limitApplied: options.limit,
      reason:
        "native deploy receipts do not carry agent/session/task keys, so run-insights applies only the bounded tail limit to deploy/build/promote evidence",
    },
    summary: {
      sessionCount: summary.sessions.count,
      recentSessionsConsidered: filtered.length,
      sessionsDisplayed: sessions.length,
      tasks: {
        total: summary.tasks.total,
        active: summary.tasks.active,
        terminal: summary.tasks.terminal,
        failures: summary.tasks.failures,
        recentDisplayed: tasks.length,
        activeDisplayed: tasks.filter(
          (task) => task.status === "queued" || task.status === "running",
        ).length,
        childTasksDisplayed: tasks.filter(taskHasChildEvidence).length,
        deliveryIssues: tasks.filter((task) => DELIVERY_ISSUE_STATUSES.has(task.deliveryStatus))
          .length,
        byStatus: summary.tasks.byStatus,
        byRuntime: summary.tasks.byRuntime,
      },
      deploy: {
        recentDisplayed: deployEvents.length,
        lastEventType: deployEvents[0]?.eventType ?? null,
        lastPromotedImageDigest: lastPromotedEvent?.imageDigest ?? null,
        recentFailures: failedDeployEvents.length,
      },
    },
    attention,
    performanceProfile,
    diagnosticSummary,
    signals,
    sessions,
    tasks,
    deployEvents,
    pointers: {
      statusJson: "openclaw status --json",
      sessions: "openclaw sessions --json",
      tasksSummary: "openclaw tasks list --summary",
      tasksAudit: "openclaw tasks audit --json",
      deployEvents: "openclaw run-insights --json",
    },
  };
}

export async function loadRunInsightsReport(
  options: ResolvedRunInsightsOptions,
): Promise<RunInsightsReport> {
  const summary = await getStatusSummary({
    includeSensitive: true,
    includeChannelSummary: false,
  });
  const initialReport = buildRunInsightsReport(summary, {
    agent: options.agent,
    session: options.session,
    task: options.task,
    activeMinutes: options.activeMinutes,
    limit: options.limit,
  });
  const sessionsWithUsage = await attachCachedSessionUsage(initialReport.sessions);
  const sessionUsage = new Map(
    sessionsWithUsage.map((session) => [session.key, session.usage] as const),
  );
  return buildRunInsightsReport(summary, {
    agent: options.agent,
    session: options.session,
    task: options.task,
    activeMinutes: options.activeMinutes,
    limit: options.limit,
    sessionUsage,
  });
}

function formatSignals(signals: RunInsightSignal[]): string[] {
  return signals.map((signal) => {
    const prefix =
      signal.severity === "error" ? "ERROR" : signal.severity === "warn" ? "WARN" : "INFO";
    return `  ${prefix} ${signal.code}: ${signal.message}`;
  });
}

function formatAttentionItems(items: RunInsightAttentionItem[], emptyMessage: string): string[] {
  if (items.length === 0) {
    return [`  ${emptyMessage}`];
  }
  return items.slice(0, 8).map((item) => {
    const prefix = item.severity === "error" ? "ERROR" : item.severity === "warn" ? "WARN" : "INFO";
    return `  ${prefix} ${item.code}: ${item.message} (${item.source}; ${item.pointer})`;
  });
}

function formatSessions(sessions: RunInsightSession[]): string[] {
  if (sessions.length === 0) {
    return ["  No recent sessions matched the filters."];
  }
  return sessions.map((session) => {
    const usage =
      typeof session.percentUsed === "number"
        ? `${session.percentUsed}% context`
        : `${formatTokenCount(session.totalTokens)} tokens`;
    const agent = session.agentId ? ` agent=${session.agentId}` : "";
    const runtime = session.runtime ? ` runtime=${session.runtime}` : "";
    const aborted = session.abortedLastRun ? " aborted-last-run" : "";
    const toolUsage =
      session.usage && session.usage.toolCalls > 0
        ? ` tools=${session.usage.toolCalls}/${session.usage.uniqueTools}`
        : "";
    const cost = session.usage ? ` cost=$${session.usage.totalCost.toFixed(4)}` : "";
    const skills =
      session.promptContext?.skills?.skillCount != null
        ? ` skills=${session.promptContext.skills.skillCount}`
        : "";
    return `  ${session.key}${agent}${runtime} age=${session.age} usage=${usage}${toolUsage}${cost}${skills}${aborted}`;
  });
}

function formatTaskActiveProgress(progress: ReadbackProgressProjection | null): string {
  if (!progress) {
    return "";
  }
  const child = progress.childRole ? `child=${progress.childRole}` : "";
  const phase = progress.currentPhase ? `phase=${progress.currentPhase}` : "";
  const tool = progress.toolName ? `tool=${progress.toolName}` : "";
  const command = progress.command ? `cmd="${compactSummaryText(progress.command)}"` : "";
  const exit = typeof progress.exitCode === "number" ? `exit=${String(progress.exitCode)}` : "";
  const output = progress.outputSummary
    ? `output="${compactSummaryText(progress.outputSummary)}"`
    : "";
  const parts = [child, phase, tool, command, exit, output].filter(Boolean);
  return parts.length > 0 ? ` active=${parts.join(" ")}` : "";
}

function formatTasks(tasks: RunInsightTask[]): string[] {
  if (tasks.length === 0) {
    return ["  No recent tasks matched the filters."];
  }
  return tasks.map((task) => {
    const label = task.label ? ` label="${task.label}"` : "";
    const child = task.childSessionKey ? ` child=${task.childSessionKey}` : "";
    const latest = task.latestEvent?.summary ? ` latest="${task.latestEvent.summary}"` : "";
    const attention = task.attention.waitClass ? ` attention=${task.attention.waitClass}` : "";
    const delivery =
      task.deliveryStatus === "delivered" || task.deliveryStatus === "not_applicable"
        ? ""
        : ` delivery=${task.deliveryStatus}`;
    const active = formatTaskActiveProgress(task.activeProgress);
    return `  ${task.taskId} runtime=${task.runtime} status=${task.status}${delivery} age=${task.age} elapsed=${task.elapsed}${label}${child}${latest}${active}${attention}`;
  });
}

function formatDeployEvents(events: RunInsightDeployEvent[]): string[] {
  if (events.length === 0) {
    return ["  No recent deploy events found."];
  }
  return events.map((event) => {
    const status = event.status ? ` status=${event.status}` : "";
    const profile = event.buildProfile ? ` profile=${event.buildProfile}` : "";
    const digest = event.imageDigest ? ` image=${event.imageDigest.slice(0, 19)}...` : "";
    const commit = event.sourceCommit ? ` commit=${event.sourceCommit.slice(0, 12)}` : "";
    const duration = event.artifactSummary?.durationMs
      ? ` duration=${event.artifactSummary.duration}`
      : "";
    const slowest =
      event.artifactSummary?.slowestChecks?.[0]?.id && event.artifactSummary.slowestChecks[0]
        ? ` slowest=${event.artifactSummary.slowestChecks[0].id}:${event.artifactSummary.slowestChecks[0].duration}`
        : "";
    const artifact =
      event.artifactRefs.length > 0 && event.artifactRefs[0]?.path
        ? ` artifact=${event.artifactRefs[0].path}`
        : "";
    return `  ${event.eventType}${status} age=${event.age}${duration}${slowest}${profile}${digest}${commit}${artifact}`;
  });
}

function formatPerformanceProfile(profile: RunInsightsReport["performanceProfile"]): string[] {
  const lines = [
    `  Expensive explanations: ${profile.expensiveRunExplanation.length}; bottlenecks: ${profile.validationBuildBottlenecks.length}; inefficiency flags: ${profile.advisoryInefficiencyFlags.length}.`,
    `  Retry/build/proof cost: receipts=${profile.retryBuildProofCost.deployReceiptCount} knownDuration=${profile.retryBuildProofCost.totalKnownDuration}`,
  ];
  if (profile.retryBuildProofCost.slowestReceipt) {
    lines.push(
      `  Slowest receipt: ${profile.retryBuildProofCost.slowestReceipt.eventType} ${profile.retryBuildProofCost.slowestReceipt.duration} (${profile.retryBuildProofCost.slowestReceipt.pointer})`,
    );
  }
  for (const item of profile.expensiveRunExplanation.slice(0, 4)) {
    lines.push(`  ${item.severity.toUpperCase()} ${item.code}: ${item.message} (${item.pointer})`);
  }
  for (const item of profile.validationBuildBottlenecks.slice(0, 4)) {
    lines.push(`  BOTTLENECK ${item.code}: ${item.message} (${item.pointer})`);
  }
  for (const event of profile.timeline.slice(0, 4)) {
    lines.push(`  Timeline ${event.source}: ${event.label} age=${event.age} (${event.pointer})`);
  }
  for (const child of profile.childSessionEvidence.slice(0, 6)) {
    const role = child.childRole ? ` role=${child.childRole}` : "";
    const phase = child.childPhase ? ` phase="${compactSummaryText(child.childPhase)}"` : "";
    const reason = child.spawnReason ? ` reason="${compactSummaryText(child.spawnReason)}"` : "";
    lines.push(
      `  Child ${child.taskId}${role} status=${child.status} elapsed=${child.elapsed}${phase}${reason} (${child.pointer})`,
    );
  }
  for (const skillEvidence of profile.skillActivationEvidence.slice(0, 6)) {
    const agent = skillEvidence.agentId ? ` agent=${skillEvidence.agentId}` : "";
    const prompt =
      skillEvidence.promptChars != null ? ` promptChars=${skillEvidence.promptChars}` : "";
    const hash = skillEvidence.promptHash ? ` hash=${skillEvidence.promptHash}` : "";
    const names =
      skillEvidence.visibleSkillNames.length > 0
        ? ` names=${skillEvidence.visibleSkillNames.map((name) => JSON.stringify(name)).join(",")}`
        : "";
    lines.push(
      `  Skills ${skillEvidence.sessionKey}${agent} visible=${skillEvidence.visibleSkillCount ?? "unknown"}${prompt}${hash}${names} (${skillEvidence.pointer})`,
    );
  }
  if (lines.length === 2) {
    lines.push("  No expensive-run, bottleneck, or timeline details found in bounded readback.");
  }
  return lines;
}

function formatDiagnosticSummary(summary: RunInsightsReport["diagnosticSummary"]): string[] {
  return [
    `  Phase: ${summary.currentOrLastKnownPhase.label} (${summary.currentOrLastKnownPhase.evidenceQuality}; confidence=${summary.currentOrLastKnownPhase.confidence})`,
    `  Parent wait: ${summary.parentWaitState.waitClass} (${summary.parentWaitState.evidenceQuality}; ${summary.parentWaitState.reason})`,
    `  Child work: ${summary.childWork.contribution} (${summary.childWork.evidenceQuality})`,
    `  Time spent: session=${formatDurationMs(summary.timeSpent.knownSessionDurationMs)} activeTask=${formatDurationMs(summary.timeSpent.activeTaskElapsedMs)} deployReceipts=${formatDurationMs(summary.timeSpent.deployReceiptKnownDurationMs)}`,
    `  Evidence quality: backed=${summary.evidenceQuality.evidenceBacked} heuristic=${summary.evidenceQuality.heuristic} stale=${summary.evidenceQuality.stale} scoped=${summary.evidenceQuality.scoped} unknown=${summary.evidenceQuality.unknown}`,
    `  Next action: ${summary.operatorNextAction.label} (${summary.operatorNextAction.pointer})`,
  ];
}

function formatHumanReport(report: RunInsightsReport): string[] {
  const lines = [
    theme.heading("Run Insights"),
    `Authority: ${report.authority}`,
    `Missing Evidence: ${report.advisory.missingEvidenceLanguage}`,
    `Deploy Evidence Scope: ${report.deployEvidenceScope.scope} (limit=${report.deployEvidenceScope.limitApplied}; ${report.deployEvidenceScope.reason})`,
    `Sessions: ${report.summary.sessionsDisplayed} shown of ${report.summary.recentSessionsConsidered} matching recent session(s); ${report.summary.sessionCount} total stored.`,
    `Tasks: ${report.summary.tasks.active} active, ${report.summary.tasks.failures} failure(s), ${report.summary.tasks.deliveryIssues} delivery issue(s), ${report.summary.tasks.terminal} terminal of ${report.summary.tasks.total} total.`,
    "",
    theme.heading("Signals"),
    ...formatSignals(report.signals),
    "",
    theme.heading("Diagnostic Summary"),
    ...formatDiagnosticSummary(report.diagnosticSummary),
    "",
    theme.heading("Why Work May Feel Slow"),
    ...formatAttentionItems(
      report.attention.whyWorkMayFeelSlow,
      "No advisory slow-run reasons found in bounded readback.",
    ),
    "",
    theme.heading("Validation / Promotion Watch"),
    ...formatAttentionItems(
      report.attention.validationAndPromotion,
      "No validation, proof, build, deploy, or promotion receipts found in bounded readback.",
    ),
    "",
    theme.heading("Performance Profile"),
    ...formatPerformanceProfile(report.performanceProfile),
    "",
    theme.heading("Recent Sessions"),
    ...formatSessions(report.sessions),
    "",
    theme.heading("Recent Tasks"),
    ...formatTasks(report.tasks),
    "",
    theme.heading("Recent Deploy Events"),
    ...formatDeployEvents(report.deployEvents),
    "",
    theme.heading("Pointers"),
    `  ${report.pointers.statusJson}`,
    `  ${report.pointers.sessions}`,
    `  ${report.pointers.tasksSummary}`,
    `  ${report.pointers.tasksAudit}`,
    `  ${report.pointers.deployEvents}`,
  ];
  return lines;
}

export async function runInsightsCommand(
  options: RunInsightsOptions,
  runtime: RuntimeEnv,
): Promise<void> {
  const resolved = resolveRunInsightsOptions(options);
  if (!resolved.ok) {
    runtime.error(`--${resolved.message}`);
    runtime.exit(1);
    return;
  }

  const report = await loadRunInsightsReport(resolved.value);

  if (options.json) {
    writeRuntimeJson(runtime, report);
    return;
  }

  for (const line of formatHumanReport(report)) {
    runtime.log(line);
  }
}
