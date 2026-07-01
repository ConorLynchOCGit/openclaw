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
import type { RuntimeEnv } from "../runtime.js";
import { writeRuntimeJson } from "../runtime.js";
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

type AttentionSource = "session" | "task" | "deploy" | "status";

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
  evidence?: Record<string, unknown>;
};

export type RunInsightAttentionItem = {
  severity: SignalSeverity;
  code: string;
  message: string;
  source: AttentionSource;
  pointer: string;
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
  filters: {
    agent: string | null;
    session: string | null;
    task: string | null;
    activeMinutes: number | null;
    limit: number;
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
  return row.key === session || row.sessionId === session;
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
    task.requesterSessionKey === session ||
    task.ownerKey === session ||
    task.childSessionKey === session
  );
}

function taskMatchesTaskFilter(task: TaskRecord, taskId: string | undefined): boolean {
  if (!taskId) {
    return true;
  }
  return task.taskId === taskId;
}

function classifyTaskAttention(
  task: TaskRecord,
  insight: Pick<
    RunInsightTask,
    "ageMs" | "childSessionKey" | "deliveryStatus" | "status" | "latestEvent"
  >,
): RunInsightTask["attention"] {
  const pointer = `openclaw tasks show ${task.taskId}`;
  const progressText =
    task.progressSummary ??
    task.executionReceipt?.latestEvent?.summary ??
    task.label ??
    task.taskKind;
  const compactProgressText = compactSummaryText(progressText);
  if (DELIVERY_ISSUE_STATUSES.has(insight.deliveryStatus)) {
    return {
      waitClass: "delivery",
      reason: `deliveryStatus=${insight.deliveryStatus}`,
      pointer,
    };
  }
  if (textMatchesRunStage(progressText) || textMatchesRunStage(task.task)) {
    return {
      waitClass: "validation_or_promotion",
      reason:
        compactProgressText ??
        "task text references validation, build, deploy, proof, or promotion work",
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

function toInsightTask(task: TaskRecord, now: number): RunInsightTask {
  const referenceAt = taskReferenceAt(task);
  const elapsedMs = taskElapsedMs(task, now);
  const latestEvent = task.executionReceipt?.latestEvent;
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
          progressSummary: task.progressSummary,
        },
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
  const tasks = taskRecords
    .filter((task) => taskMatchesAgentFilter(task, options.agent))
    .filter((task) => taskMatchesSessionFilter(task, options.session))
    .filter((task) => taskMatchesTaskFilter(task, options.task))
    .filter((task) => taskMatchesActiveFilter(task, options.activeMinutes, now))
    .slice(0, options.limit)
    .map((task) => toInsightTask(task, now));
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

  return {
    schema: "openclaw.run_insights.v1",
    generatedAt: new Date(now).toISOString(),
    authority:
      "Derived readback over native status/session/task summaries; advisory only, not lifecycle truth.",
    filters: {
      agent: options.agent ?? null,
      session: options.session ?? null,
      task: options.task ?? null,
      activeMinutes: options.activeMinutes ?? null,
      limit: options.limit,
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
        childTasksDisplayed: tasks.filter((task) => task.childSessionKey !== null).length,
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
    signals: buildSignals(summary, sessions, tasks, deployEvents),
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
    return `  ${session.key}${agent}${runtime} age=${session.age} usage=${usage}${toolUsage}${cost}${aborted}`;
  });
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
    return `  ${task.taskId} runtime=${task.runtime} status=${task.status}${delivery} age=${task.age} elapsed=${task.elapsed}${label}${child}${latest}${attention}`;
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

function formatHumanReport(report: RunInsightsReport): string[] {
  const lines = [
    theme.heading("Run Insights"),
    `Authority: ${report.authority}`,
    `Sessions: ${report.summary.sessionsDisplayed} shown of ${report.summary.recentSessionsConsidered} matching recent session(s); ${report.summary.sessionCount} total stored.`,
    `Tasks: ${report.summary.tasks.active} active, ${report.summary.tasks.failures} failure(s), ${report.summary.tasks.deliveryIssues} delivery issue(s), ${report.summary.tasks.terminal} terminal of ${report.summary.tasks.total} total.`,
    "",
    theme.heading("Signals"),
    ...formatSignals(report.signals),
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
