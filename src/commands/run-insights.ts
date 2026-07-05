// Thin operator-facing run readback derived from native OpenClaw/Codex evidence.
import fs from "node:fs";
import path from "node:path";
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import { theme } from "../../packages/terminal-core/src/theme.js";
import { getRuntimeConfig } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import { readSessionStoreReadOnly } from "../config/sessions/store-read.js";
import type { SessionEntry } from "../config/sessions/types.js";
import { listSessionsFromStore, type GatewaySessionRow } from "../gateway/session-utils.js";
import { buildTaskChildRunReadback } from "../gateway/task-summary-projection.js";
import {
  loadSessionCostSummaryFromCache,
  resolveExistingUsageSessionFile,
} from "../infra/session-cost-usage.js";
import type { SessionCostSummary, UsageCacheStatus } from "../infra/session-cost-usage.types.js";
import {
  getDiagnosticStabilitySnapshot,
  type DiagnosticStabilityEventRecord,
} from "../logging/diagnostic-stability.js";
import {
  buildEmptyReadbackProjection,
  buildSessionReadbackProjection,
  buildTaskReadbackProjection,
  type ReadbackActiveWork,
  type ReadbackFinality,
} from "../readback/finality.js";
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
const DEPLOY_EVENT_TAIL_LINES = 200;
const HIGH_CONTEXT_WARN_PERCENT = 80;
const HIGH_CONTEXT_ERROR_PERCENT = 90;
const LONG_ACTIVE_TASK_WARN_MS = 10 * 60_000;

type SignalSeverity = "info" | "warn" | "error";

export type RunInsightsOptions = {
  json?: boolean;
  agent?: string;
  session?: string;
  task?: string;
  active?: string | number;
  limit?: string | number;
  includeBackground?: boolean;
};

export type RunInsightsRequest = Omit<RunInsightsOptions, "json">;

export type ResolvedRunInsightsOptions = {
  agent?: string;
  session?: string;
  task?: string;
  activeMinutes?: number;
  limit: number;
  includeBackground: boolean;
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

export type RunInsightSessionUsage = {
  cacheStatus: UsageCacheStatus["status"];
  totalCost: number;
  totalTokens: number;
  durationMs: number | null;
  duration: string;
  messageCount: number | null;
  toolCalls: number;
  uniqueTools: number;
  topTools: Array<{ name: string; count: number }>;
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
  promptContext: SessionStatus["promptContext"] | GatewaySessionRow["promptContext"] | null;
  status: string | null;
  finality: ReadbackFinality;
  activeWork: ReadbackActiveWork;
  activeProgress: ReadbackProgressProjection | null;
  readbackProvenance: GatewaySessionRow["readbackProvenance"] | null;
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
  finality: ReadbackFinality;
  activeWork: ReadbackActiveWork;
  childRunCount: number;
  pointer: string;
};

export type RunInsightChildRun = {
  parentTaskId: string;
  runId: string;
  childSessionKey: string;
  requesterSessionKey: string | null;
  agentId: string | null;
  taskName: string | null;
  label: string | null;
  status: string | null;
  deliveryStatus: string | null;
  contentDigest: string | null;
  contentChars: number | null;
  contentTruncated: boolean | null;
  createdAt: number | string | null;
  startedAt: number | string | null;
  endedAt: number | string | null;
  durationMs: number | null;
  elapsed: string;
  spawnReason: string | null;
  terminalSummary: string | null;
  errorSummary: string | null;
  provenanceMismatch: string | null;
  usage: RunInsightSessionUsage | null;
  pointer: string;
};

export type RunInsightSkillRead = {
  sessionKey: string;
  agentId: string | null;
  skillName: string | null;
  catalogVisible: boolean;
  visibleSkillCount: number | null;
  visibleSkillNames: string[];
  promptChars: number | null;
  promptHash: string | null;
  promptRef: NonNullable<NonNullable<SessionStatus["promptContext"]>["skills"]>["promptRef"] | null;
  readEvidence: "skill_used" | "catalog_only";
  readStatus: "full" | "partial" | "failed" | "visible_only" | "unknown";
  linesRead: number | null;
  totalLines: number | null;
  bytesRead: number | null;
  usedSkillNames: string[];
  source: "native_skill_used" | "visible_catalog";
  pointer: string;
};

export type RunInsightDeployEvent = {
  eventId: string | null;
  eventType: string;
  imageDigest: string | null;
  sourceCommit: string | null;
  createdAt: string | null;
  durationMs: number | null;
  duration: string;
  status: string | null;
  artifactRefs: string[];
  scope: "background";
  pointer: string;
};

export type RunInsightCostSummary = {
  sessionDurationMs: number | null;
  sessionTokens: number | null;
  sessionCostUsd: number | null;
  toolCalls: number | null;
  deployReceiptCount: number;
  deployKnownDurationMs: number;
  slowestDeployReceipt: {
    eventId: string | null;
    eventType: string;
    durationMs: number;
    pointer: string;
  } | null;
};

export type RunInsightSignal = {
  severity: SignalSeverity;
  code: string;
  message: string;
  pointer: string;
  evidence?: Record<string, unknown>;
};

export type RunInsightsReport = {
  schema: "openclaw.run_insights.v1";
  generatedAt: string;
  authority: "advisory_readback";
  filters: {
    agent: string | null;
    session: string | null;
    task: string | null;
    activeMinutes: number | null;
    limit: number;
    includeBackground: boolean;
  };
  summary: {
    sessionCount: number;
    recentSessionsConsidered: number;
    sessionsDisplayed: number;
    taskCount: number;
    tasksDisplayed: number;
    childRunsDisplayed: number;
    skillReadsDisplayed: number;
    backgroundSignalsIncluded: boolean;
  };
  finality: ReadbackFinality;
  activeWork: ReadbackActiveWork;
  sessions: RunInsightSession[];
  tasks: RunInsightTask[];
  childRuns: RunInsightChildRun[];
  skillReads: RunInsightSkillRead[];
  deployEvents: RunInsightDeployEvent[];
  costs: RunInsightCostSummary;
  signals: RunInsightSignal[];
  pointers: {
    statusJson: string;
    sessions: string;
    tasks: string;
    deployEvents: string;
  };
};

type DeployEventRecord = {
  eventId?: string;
  eventType?: string;
  imageDigest?: string;
  sourceCommit?: string;
  createdAt?: string;
  durationMs?: number;
  status?: string;
  artifactRefs?: unknown;
};

type BuildReportOptions = {
  now?: number;
  taskRecords?: TaskRecord[];
  gatewaySessionRows?: Map<string, GatewaySessionRow>;
  diagnosticSkillEvents?: DiagnosticStabilityEventRecord[];
  childSessionUsage?: Map<string, RunInsightSessionUsage | null>;
};

function parsePositiveIntegerValue(
  value: string | number | undefined,
  label: string,
): RunInsightsOptionsResult {
  if (value === undefined) {
    return {
      ok: true,
      value: {
        limit: DEFAULT_LIMIT,
        includeBackground: false,
      },
    };
  }
  const raw = typeof value === "number" ? String(value) : value.trim();
  if (!raw) {
    return { ok: false, message: `${label} must not be blank` };
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { ok: false, message: `${label} must be a positive integer` };
  }
  return {
    ok: true,
    value: {
      limit: parsed,
      includeBackground: false,
    },
  };
}

function parseStringFilterValue(
  value: string | undefined,
  label: string,
): RunInsightsOptionsResult {
  if (value === undefined) {
    return {
      ok: true,
      value: {
        limit: DEFAULT_LIMIT,
        includeBackground: false,
      },
    };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, message: `${label} must not be blank` };
  }
  return {
    ok: true,
    value: {
      limit: DEFAULT_LIMIT,
      includeBackground: false,
    },
  };
}

function clampLimit(limit: number): number {
  return Math.max(1, Math.min(MAX_LIMIT, limit));
}

export function resolveRunInsightsOptions(
  options: RunInsightsOptions = {},
): RunInsightsOptionsResult {
  const agent = parseStringFilterValue(options.agent, "agent");
  if (!agent.ok) {
    return agent;
  }
  const session = parseStringFilterValue(options.session, "session");
  if (!session.ok) {
    return session;
  }
  const task = parseStringFilterValue(options.task, "task");
  if (!task.ok) {
    return task;
  }
  const active = parsePositiveIntegerValue(options.active, "active");
  if (!active.ok) {
    return active;
  }
  const limit = parsePositiveIntegerValue(options.limit, "limit");
  if (!limit.ok) {
    return limit;
  }
  return {
    ok: true,
    value: {
      ...(options.agent ? { agent: options.agent.trim() } : {}),
      ...(options.session ? { session: options.session.trim() } : {}),
      ...(options.task ? { task: options.task.trim() } : {}),
      ...(options.active !== undefined ? { activeMinutes: active.value.limit } : {}),
      limit: clampLimit(options.limit === undefined ? DEFAULT_LIMIT : limit.value.limit),
      includeBackground: options.includeBackground === true,
    },
  };
}

function formatDurationMs(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) {
    return "unknown";
  }
  if (ms < 1_000) {
    return `${Math.max(0, Math.round(ms))}ms`;
  }
  const seconds = ms / 1_000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function compactSummaryText(value: string | null | undefined, maxChars = 240): string | null {
  const text = normalizeOptionalString(value);
  if (!text) {
    return null;
  }
  const singleLine = text.replace(/\s+/gu, " ").trim();
  if (singleLine.length <= maxChars) {
    return singleLine;
  }
  return `${singleLine.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeOptionalString(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sessionReferenceMatches(
  value: string | null | undefined,
  filter: string | undefined,
): boolean {
  const canonicalValue = normalizeOptionalString(value);
  const canonicalFilter = normalizeOptionalString(filter);
  if (!canonicalFilter) {
    return true;
  }
  if (!canonicalValue) {
    return false;
  }
  return (
    canonicalValue === canonicalFilter ||
    canonicalValue.endsWith(`:${canonicalFilter}`) ||
    canonicalValue.includes(`:${canonicalFilter}:`)
  );
}

function gatewaySessionKeyMatches(row: GatewaySessionRow, session: string | undefined): boolean {
  if (!session) {
    return true;
  }
  return (
    sessionReferenceMatches(row.key, session) || sessionReferenceMatches(row.sessionId, session)
  );
}

function rowMatchesOptions(row: SessionStatus, options: ResolvedRunInsightsOptions): boolean {
  if (options.agent && row.agentId !== options.agent) {
    return false;
  }
  if (options.session && !sessionReferenceMatches(row.key, options.session)) {
    return false;
  }
  if (
    options.activeMinutes !== undefined &&
    typeof row.age === "number" &&
    row.age > options.activeMinutes * 60_000
  ) {
    return false;
  }
  return true;
}

function selectRecentSessions(
  summary: StatusSummary,
  options: ResolvedRunInsightsOptions,
): SessionStatus[] {
  return summary.sessions.recent
    .filter((row) => rowMatchesOptions(row, options))
    .slice(0, options.limit);
}

function toSessionStatusFromGatewayRow(row: GatewaySessionRow, agentId?: string): SessionStatus {
  return {
    ...(agentId ? { agentId } : {}),
    key: row.key,
    kind: row.kind,
    ...(row.sessionId ? { sessionId: row.sessionId } : {}),
    updatedAt: row.updatedAt,
    age: null,
    ...(row.systemSent !== undefined ? { systemSent: row.systemSent } : {}),
    ...(row.abortedLastRun !== undefined ? { abortedLastRun: row.abortedLastRun } : {}),
    ...(row.inputTokens !== undefined ? { inputTokens: row.inputTokens } : {}),
    ...(row.outputTokens !== undefined ? { outputTokens: row.outputTokens } : {}),
    totalTokens: row.totalTokens ?? null,
    totalTokensFresh: row.totalTokensFresh ?? false,
    remainingTokens: null,
    percentUsed: null,
    model: row.model ?? null,
    configuredModel: null,
    selectedModel: row.model ?? null,
    modelSelectionReason: null,
    runtime: row.agentRuntime?.id ?? null,
    contextTokens: row.contextTokens ?? null,
    ...(row.promptContext ? { promptContext: row.promptContext } : {}),
    flags: row.abortedLastRun ? ["aborted"] : [],
  };
}

function compactSessionStore(
  store: Record<string, SessionEntry | undefined>,
): Record<string, SessionEntry> {
  return Object.fromEntries(
    Object.entries(store).filter((entry): entry is [string, SessionEntry] => Boolean(entry[1])),
  );
}

function resolveGatewaySessionRowsForInsights(params: {
  summary: StatusSummary;
  rows: SessionStatus[];
  options: Pick<ResolvedRunInsightsOptions, "activeMinutes" | "agent" | "limit" | "session">;
}): Map<string, GatewaySessionRow> {
  if (params.rows.length === 0) {
    return new Map();
  }
  const cfg = getRuntimeConfig();
  const storeCache = new Map<string, Record<string, SessionEntry | undefined>>();
  const resolvedRows = new Map<string, GatewaySessionRow>();
  for (const row of params.rows) {
    for (const storePath of uniqueValues(params.summary.sessions.paths)) {
      let store = storeCache.get(storePath);
      if (!store) {
        store = readSessionStoreReadOnly(storePath);
        storeCache.set(storePath, store);
      }
      if (!Object.hasOwn(store, row.key)) {
        continue;
      }
      const result = listSessionsFromStore({
        cfg,
        storePath,
        store: compactSessionStore(store),
        opts: {
          ...(params.options.agent ? { agentId: params.options.agent } : {}),
          ...(params.options.activeMinutes ? { activeMinutes: params.options.activeMinutes } : {}),
          includeLastMessage: true,
          limit: Math.max(1, Math.min(params.options.limit, MAX_LIMIT)),
          search: row.key,
        },
      });
      const gatewayRow = result.sessions.find(
        (candidate) =>
          sessionReferenceMatches(candidate.key, row.key) &&
          gatewaySessionKeyMatches(candidate, params.options.session),
      );
      if (gatewayRow) {
        resolvedRows.set(row.key, gatewayRow);
      }
      break;
    }
  }
  return resolvedRows;
}

function resolveExactGatewaySessionFallbackForInsights(params: {
  summary: StatusSummary;
  options: Pick<ResolvedRunInsightsOptions, "activeMinutes" | "agent" | "limit" | "session">;
}): { rows: SessionStatus[]; gatewayRows: Map<string, GatewaySessionRow> } {
  const session = params.options.session?.trim();
  if (!session) {
    return { rows: [], gatewayRows: new Map() };
  }
  const cfg = getRuntimeConfig();
  const rows: SessionStatus[] = [];
  const gatewayRows = new Map<string, GatewaySessionRow>();
  const seen = new Set<string>();
  for (const storePath of uniqueValues(params.summary.sessions.paths)) {
    const store = readSessionStoreReadOnly(storePath);
    const result = listSessionsFromStore({
      cfg,
      storePath,
      store: compactSessionStore(store),
      opts: {
        ...(params.options.agent ? { agentId: params.options.agent } : {}),
        ...(params.options.activeMinutes ? { activeMinutes: params.options.activeMinutes } : {}),
        includeLastMessage: true,
        limit: Math.max(1, Math.min(params.options.limit, MAX_LIMIT)),
        search: session,
      },
    });
    for (const gatewayRow of result.sessions) {
      if (!gatewaySessionKeyMatches(gatewayRow, session) || seen.has(gatewayRow.key)) {
        continue;
      }
      seen.add(gatewayRow.key);
      gatewayRows.set(gatewayRow.key, gatewayRow);
      rows.push(toSessionStatusFromGatewayRow(gatewayRow, params.options.agent));
      if (rows.length >= params.options.limit) {
        return { rows, gatewayRows };
      }
    }
  }
  return { rows, gatewayRows };
}

function toSessionUsageInsight(
  usage: { summary: SessionCostSummary | null; cacheStatus: UsageCacheStatus } | null,
): RunInsightSessionUsage | null {
  if (!usage?.summary) {
    return null;
  }
  const summary = usage.summary;
  const durationMs = typeof summary.durationMs === "number" ? summary.durationMs : null;
  const tools = summary.toolUsage?.tools ?? [];
  return {
    cacheStatus: usage.cacheStatus.status,
    totalCost: summary.totalCost,
    totalTokens: summary.totalTokens,
    durationMs,
    duration: formatDurationMs(durationMs),
    messageCount: summary.messageCounts?.total ?? null,
    toolCalls: summary.toolUsage?.totalCalls ?? 0,
    uniqueTools: summary.toolUsage?.uniqueTools ?? tools.length,
    topTools: tools.slice(0, 5),
    errors: summary.messageCounts?.errors ?? 0,
  };
}

async function loadCachedSessionUsage(
  row: {
    sessionId?: string | null;
    agentId?: string | null;
  },
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

function resolveTaskResultSessionEvidence(
  task: TaskRecord,
  gatewayRows: Map<string, GatewaySessionRow>,
): Parameters<typeof buildTaskReadbackProjection>[0]["resultSession"] {
  const candidateKeys = uniqueValues([task.childSessionKey, task.requesterSessionKey]);
  for (const key of candidateKeys) {
    const row = gatewayRows.get(key);
    if (!row?.finalAssistantText) {
      continue;
    }
    return {
      sessionKey: row.key,
      agentId: row.agentId ?? task.agentId ?? null,
      finalAssistantText: row.finalAssistantText,
      readbackProvenance: row.readbackProvenance ?? null,
    };
  }
  return null;
}

function toInsightSession(
  row: SessionStatus,
  gatewayRow: GatewaySessionRow | undefined,
  usage: RunInsightSessionUsage | null,
): RunInsightSession {
  const source = gatewayRow ?? row;
  const projection = gatewayRow
    ? buildSessionReadbackProjection({
        key: gatewayRow.key,
        status: gatewayRow.status ?? null,
        sessionId: gatewayRow.sessionId,
        finalAssistantText: gatewayRow.finalAssistantText ?? null,
        activeProgress: gatewayRow.activeProgress ?? null,
        readbackProvenance: gatewayRow.readbackProvenance ?? null,
        agentId: gatewayRow.agentId ?? row.agentId ?? null,
      })
    : buildSessionReadbackProjection({
        key: row.key,
        status: null,
        sessionId: row.sessionId,
        finalAssistantText: null,
        activeProgress: null,
        readbackProvenance: null,
        agentId: row.agentId ?? null,
      });
  const ageMs = typeof row.age === "number" ? row.age : null;
  return {
    key: row.key,
    agentId: row.agentId ?? gatewayRow?.agentId ?? null,
    kind: row.kind,
    sessionId: row.sessionId ?? gatewayRow?.sessionId ?? null,
    updatedAt: row.updatedAt,
    ageMs,
    age: formatDurationMs(ageMs),
    model: row.model ?? gatewayRow?.model ?? null,
    runtime: row.runtime ?? gatewayRow?.agentRuntime?.id ?? null,
    totalTokens: row.totalTokens ?? gatewayRow?.totalTokens ?? null,
    totalTokensFresh: row.totalTokensFresh ?? gatewayRow?.totalTokensFresh ?? false,
    percentUsed: row.percentUsed ?? null,
    inputTokens: row.inputTokens ?? gatewayRow?.inputTokens ?? null,
    outputTokens: row.outputTokens ?? gatewayRow?.outputTokens ?? null,
    abortedLastRun: row.abortedLastRun ?? gatewayRow?.abortedLastRun ?? false,
    flags: row.flags ?? [],
    promptContext: source.promptContext ?? null,
    status: gatewayRow?.status ?? null,
    finality: projection.finality,
    activeWork: projection.activeWork,
    activeProgress: gatewayRow?.activeProgress ?? null,
    readbackProvenance: gatewayRow?.readbackProvenance ?? null,
    usage,
    pointer: `openclaw sessions show ${row.key}${row.agentId ? ` --agent ${row.agentId}` : ""}`,
  };
}

function taskMatchesSession(task: TaskRecord, session: string | undefined): boolean {
  if (!session) {
    return true;
  }
  return [
    task.requesterSessionKey,
    task.ownerKey,
    task.childSessionKey,
    task.runId,
    task.sourceId,
    task.parentTaskId,
    task.parentFlowId,
  ].some((candidate) => sessionReferenceMatches(candidate, session));
}

function taskMatchesTaskFilter(task: TaskRecord, taskFilter: string | undefined): boolean {
  if (!taskFilter) {
    return true;
  }
  return [task.taskId, task.runId, task.sourceId, task.parentTaskId, task.parentFlowId].some(
    (candidate) => sessionReferenceMatches(candidate, taskFilter),
  );
}

function taskMatchesOptions(
  task: TaskRecord,
  options: ResolvedRunInsightsOptions,
  now: number,
): boolean {
  if (options.agent && task.agentId !== options.agent) {
    return false;
  }
  if (!taskMatchesSession(task, options.session)) {
    return false;
  }
  if (!taskMatchesTaskFilter(task, options.task)) {
    return false;
  }
  if (options.activeMinutes !== undefined) {
    const latest = task.lastEventAt ?? task.startedAt ?? task.createdAt;
    if (now - latest > options.activeMinutes * 60_000) {
      return false;
    }
  }
  return true;
}

function latestTaskEvent(task: TaskRecord): RunInsightTask["latestEvent"] {
  const latestAt = task.lastEventAt ?? task.endedAt ?? task.startedAt ?? task.createdAt;
  if (!latestAt) {
    return null;
  }
  return {
    kind: task.status === "running" ? "running" : task.status === "queued" ? "queued" : task.status,
    at: latestAt,
    summary:
      compactSummaryText(task.progressSummary) ??
      compactSummaryText(task.terminalSummary) ??
      compactSummaryText(task.error) ??
      null,
  };
}

function toInsightChildRun(
  parentTask: TaskRecord,
  child: ReturnType<typeof buildTaskChildRunReadback> extends { childRuns: infer T }
    ? T extends Array<infer U>
      ? U
      : never
    : never,
  usage: RunInsightSessionUsage | null,
): RunInsightChildRun {
  const durationMs = typeof child.durationMs === "number" ? child.durationMs : null;
  return {
    parentTaskId: parentTask.taskId,
    runId: child.runId,
    childSessionKey: child.childSessionKey,
    requesterSessionKey: child.requesterSessionKey ?? null,
    agentId: child.agentId ?? null,
    taskName: child.taskName ?? null,
    label: child.label ?? null,
    status: child.status ?? null,
    deliveryStatus: child.deliveryStatus ?? null,
    contentDigest: child.contentDigest ?? null,
    contentChars: child.contentChars ?? null,
    contentTruncated: child.contentTruncated ?? null,
    createdAt: child.createdAt ?? null,
    startedAt: child.startedAt ?? null,
    endedAt: child.endedAt ?? null,
    durationMs,
    elapsed: formatDurationMs(durationMs),
    spawnReason: compactSummaryText(child.spawnReason) ?? null,
    terminalSummary: compactSummaryText(child.terminalSummary) ?? null,
    errorSummary: compactSummaryText(child.errorSummary) ?? null,
    provenanceMismatch: child.provenanceMismatch ?? null,
    usage,
    pointer: `openclaw sessions show ${child.childSessionKey}${child.agentId ? ` --agent ${child.agentId}` : ""}`,
  };
}

function toInsightTask(params: {
  task: TaskRecord;
  now: number;
  progressContext: TaskReadbackProgressProjectionContext;
  tasksForReadback: TaskRecord[];
  gatewayRows: Map<string, GatewaySessionRow>;
  childSessionUsage?: Map<string, RunInsightSessionUsage | null>;
}): RunInsightTask {
  const activeProgress =
    resolveTaskReadbackProgressProjection(params.task, params.progressContext) ?? null;
  const childReadback = buildTaskChildRunReadback(params.task, params.now, params.tasksForReadback);
  const projection = buildTaskReadbackProjection({
    ...params.task,
    activeProgress,
    resultSession: resolveTaskResultSessionEvidence(params.task, params.gatewayRows),
  });
  const latestAt =
    params.task.lastEventAt ??
    params.task.endedAt ??
    params.task.startedAt ??
    params.task.createdAt;
  const ageMs = Math.max(0, params.now - latestAt);
  const elapsedMs =
    params.task.startedAt !== undefined
      ? Math.max(0, (params.task.endedAt ?? params.now) - params.task.startedAt)
      : null;
  return {
    taskId: params.task.taskId,
    runtime: params.task.runtime,
    status: params.task.status,
    deliveryStatus: params.task.deliveryStatus,
    taskKind: params.task.taskKind ?? null,
    agentId: params.task.agentId ?? null,
    runId: params.task.runId ?? null,
    label: params.task.label ?? null,
    ownerKey: params.task.ownerKey,
    requesterSessionKey: params.task.requesterSessionKey,
    childSessionKey: params.task.childSessionKey ?? null,
    parentTaskId: params.task.parentTaskId ?? null,
    parentFlowId: params.task.parentFlowId ?? null,
    createdAt: params.task.createdAt,
    startedAt: params.task.startedAt ?? null,
    endedAt: params.task.endedAt ?? null,
    lastEventAt: params.task.lastEventAt ?? null,
    ageMs,
    age: formatDurationMs(ageMs),
    elapsedMs,
    elapsed: formatDurationMs(elapsedMs),
    latestEvent: latestTaskEvent(params.task),
    activeProgress,
    finality: projection.finality,
    activeWork: projection.activeWork,
    childRunCount: childReadback?.childRunCount ?? 0,
    pointer: `openclaw tasks show ${params.task.taskId} --json`,
  };
}

function skillEventMatchesSession(
  event: DiagnosticStabilityEventRecord,
  session: RunInsightSession,
): boolean {
  if (event.type !== "skill.used") {
    return false;
  }
  const eventSessionKey = normalizeOptionalString(event.sessionKey);
  const eventSessionId = normalizeOptionalString(event.sessionId);
  if (!eventSessionKey && !eventSessionId) {
    return false;
  }
  return (
    (eventSessionKey !== undefined && eventSessionKey === session.key) ||
    (eventSessionId !== undefined && eventSessionId === session.sessionId)
  );
}

function normalizeSkillReadStatus(value: unknown): RunInsightSkillRead["readStatus"] {
  return value === "full" || value === "partial" || value === "failed" || value === "visible_only"
    ? value
    : value === "unknown"
      ? "unknown"
      : "unknown";
}

function normalizeNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function buildSkillReads(
  sessions: RunInsightSession[],
  diagnosticSkillEvents: DiagnosticStabilityEventRecord[],
): RunInsightSkillRead[] {
  const rows: RunInsightSkillRead[] = [];
  for (const session of sessions) {
    const skills = session.promptContext?.skills;
    const matchingEvents = diagnosticSkillEvents.filter((event) =>
      skillEventMatchesSession(event, session),
    );
    if (!skills && matchingEvents.length === 0) {
      continue;
    }
    const base = {
      sessionKey: session.key,
      agentId: session.agentId,
      catalogVisible: Boolean(skills),
      visibleSkillCount: skills?.skillCount ?? skills?.skillNames?.length ?? null,
      visibleSkillNames: skills?.skillNames ?? [],
      promptChars: skills?.promptChars ?? null,
      promptHash: skills?.promptHash ?? null,
      promptRef: skills?.promptRef ?? null,
      pointer: `openclaw sessions show ${session.key}${session.agentId ? ` --agent ${session.agentId}` : ""}`,
    };
    if (matchingEvents.length === 0) {
      rows.push({
        ...base,
        skillName: null,
        readEvidence: "catalog_only",
        readStatus: "visible_only",
        linesRead: null,
        totalLines: null,
        bytesRead: null,
        usedSkillNames: [],
        source: "visible_catalog",
      });
      continue;
    }
    for (const event of matchingEvents) {
      const skillName = normalizeOptionalString(event.target ?? event.reason ?? event.toolName);
      rows.push({
        ...base,
        skillName: skillName ?? null,
        readEvidence: "skill_used",
        readStatus: normalizeSkillReadStatus(event.readStatus),
        linesRead: normalizeNonNegativeInteger(event.linesRead),
        totalLines: normalizeNonNegativeInteger(event.totalLines),
        bytesRead: normalizeNonNegativeInteger(event.bytesRead),
        usedSkillNames: skillName ? [skillName] : [],
        source: "native_skill_used",
      });
    }
  }
  return rows;
}

function parseDeployEventRecord(line: string): DeployEventRecord | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function resolveArtifactRefs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function readRecentDeployEvents(limit: number): RunInsightDeployEvent[] {
  const stateDir = resolveStateDir();
  const eventsPath = path.join(stateDir, "deploy", "events.ndjson");
  if (!fs.existsSync(eventsPath)) {
    return [];
  }
  const lines = fs
    .readFileSync(eventsPath, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .slice(-DEPLOY_EVENT_TAIL_LINES)
    .reverse();
  const events: RunInsightDeployEvent[] = [];
  for (const line of lines) {
    const event = parseDeployEventRecord(line);
    if (!event?.eventType) {
      continue;
    }
    const artifactRefs = resolveArtifactRefs(event.artifactRefs);
    events.push({
      eventId: event.eventId ?? null,
      eventType: event.eventType,
      imageDigest: event.imageDigest ?? null,
      sourceCommit: event.sourceCommit ?? null,
      createdAt: event.createdAt ?? null,
      durationMs: typeof event.durationMs === "number" ? event.durationMs : null,
      duration: formatDurationMs(event.durationMs),
      status: event.status ?? null,
      artifactRefs,
      scope: "background",
      pointer: eventsPath,
    });
    if (events.length >= limit) {
      break;
    }
  }
  return events;
}

function sumNullableNumbers(values: Array<number | null | undefined>): number | null {
  const present = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (present.length === 0) {
    return null;
  }
  return present.reduce((sum, value) => sum + value, 0);
}

function buildCostSummary(params: {
  sessions: RunInsightSession[];
  deployEvents: RunInsightDeployEvent[];
}): RunInsightCostSummary {
  const sessionDurationMs = sumNullableNumbers(
    params.sessions.map((session) => session.usage?.durationMs),
  );
  const sessionTokens = sumNullableNumbers(
    params.sessions.map((session) => session.usage?.totalTokens),
  );
  const sessionCostUsd = sumNullableNumbers(
    params.sessions.map((session) => session.usage?.totalCost),
  );
  const toolCalls = sumNullableNumbers(params.sessions.map((session) => session.usage?.toolCalls));
  const deployKnownDurationMs = params.deployEvents.reduce(
    (sum, event) => sum + (event.durationMs ?? 0),
    0,
  );
  const slowestDeployReceipt = params.deployEvents
    .filter(
      (event): event is RunInsightDeployEvent & { durationMs: number } =>
        typeof event.durationMs === "number",
    )
    .sort((a, b) => b.durationMs - a.durationMs)[0];
  return {
    sessionDurationMs,
    sessionTokens,
    sessionCostUsd,
    toolCalls,
    deployReceiptCount: params.deployEvents.length,
    deployKnownDurationMs,
    slowestDeployReceipt: slowestDeployReceipt
      ? {
          eventId: slowestDeployReceipt.eventId,
          eventType: slowestDeployReceipt.eventType,
          durationMs: slowestDeployReceipt.durationMs,
          pointer: slowestDeployReceipt.pointer,
        }
      : null,
  };
}

function buildSignals(params: {
  sessions: RunInsightSession[];
  tasks: RunInsightTask[];
  childRuns: RunInsightChildRun[];
  skillReads: RunInsightSkillRead[];
  deployEvents: RunInsightDeployEvent[];
  finality: ReadbackFinality;
}): RunInsightSignal[] {
  const signals: RunInsightSignal[] = [];
  for (const session of params.sessions) {
    if (
      typeof session.percentUsed === "number" &&
      session.percentUsed >= HIGH_CONTEXT_WARN_PERCENT
    ) {
      signals.push({
        severity: session.percentUsed >= HIGH_CONTEXT_ERROR_PERCENT ? "error" : "warn",
        code: "session_high_context",
        message: `${session.key} is at ${session.percentUsed}% context.`,
        pointer: session.pointer,
        evidence: {
          percentUsed: session.percentUsed,
          totalTokens: session.totalTokens,
        },
      });
    }
  }
  for (const task of params.tasks) {
    if (
      task.status === "running" &&
      task.elapsedMs !== null &&
      task.elapsedMs >= LONG_ACTIVE_TASK_WARN_MS
    ) {
      signals.push({
        severity: "warn",
        code: "task_long_running",
        message: `${task.taskId} has been running for ${formatDurationMs(task.elapsedMs)}.`,
        pointer: task.pointer,
        evidence: {
          elapsedMs: task.elapsedMs,
        },
      });
    }
    if (task.deliveryStatus === "failed" || task.deliveryStatus === "parent_missing") {
      signals.push({
        severity: "error",
        code: "task_delivery_issue",
        message: `${task.taskId} delivery status is ${task.deliveryStatus}.`,
        pointer: task.pointer,
        evidence: {
          status: task.status,
          deliveryStatus: task.deliveryStatus,
        },
      });
    }
    const command = task.activeProgress?.command;
    if (
      command &&
      /build|deploy|promot|proof|test|validate|tsc|pnpm|npm|vitest|pytest/iu.test(command)
    ) {
      signals.push({
        severity: "info",
        code: "validation_or_build_command",
        message: compactSummaryText(command, 180) ?? "Validation/build command observed.",
        pointer: task.pointer,
        evidence: {
          command,
          exitCode: task.activeProgress?.exitCode ?? null,
          validationClass: task.activeProgress?.validationClass ?? null,
        },
      });
    }
  }
  for (const child of params.childRuns) {
    if (child.provenanceMismatch) {
      signals.push({
        severity: "warn",
        code: "child_provenance_mismatch",
        message: child.provenanceMismatch,
        pointer: child.pointer,
      });
    }
    if (child.contentTruncated === true) {
      signals.push({
        severity: "warn",
        code: "child_result_truncated",
        message: `${child.childSessionKey} child result includes a truncation marker.`,
        pointer: child.pointer,
        evidence: {
          contentChars: child.contentChars,
          contentDigest: child.contentDigest,
        },
      });
    }
  }
  for (const skillRead of params.skillReads) {
    if (skillRead.catalogVisible && skillRead.readEvidence === "catalog_only") {
      signals.push({
        severity: "info",
        code: "skill_catalog_visible_without_use",
        message: `${skillRead.sessionKey} had visible skills but no skill.used event in scoped readback.`,
        pointer: skillRead.pointer,
        evidence: {
          visibleSkillNames: skillRead.visibleSkillNames,
        },
      });
    }
    if (skillRead.readEvidence === "skill_used" && skillRead.readStatus !== "full") {
      signals.push({
        severity:
          skillRead.readStatus === "failed" || skillRead.readStatus === "partial" ? "warn" : "info",
        code: "skill_read_not_full",
        message: `${skillRead.sessionKey} skill ${skillRead.skillName ?? "unknown"} read status is ${skillRead.readStatus}.`,
        pointer: skillRead.pointer,
        evidence: {
          skillName: skillRead.skillName,
          readStatus: skillRead.readStatus,
          linesRead: skillRead.linesRead,
          totalLines: skillRead.totalLines,
        },
      });
    }
  }
  for (const deployEvent of params.deployEvents) {
    if (deployEvent.status === "failed" || deployEvent.eventType.includes("failed")) {
      signals.push({
        severity: "warn",
        code: "background_deploy_failure",
        message: `${deployEvent.eventType} deploy receipt is ${deployEvent.status ?? "failure-like"}.`,
        pointer: deployEvent.pointer,
        evidence: {
          eventId: deployEvent.eventId,
          createdAt: deployEvent.createdAt,
        },
      });
    }
  }
  if (params.finality.mismatch) {
    signals.push({
      severity: "info",
      code: "finality_mismatch",
      message: "Finality projection reported a native evidence mismatch.",
      pointer: params.finality.finalAssistantTextPointer ?? "native finality evidence",
      evidence: params.finality.mismatch,
    });
  }
  return signals;
}

function selectReportSession(
  sessions: RunInsightSession[],
  options: ResolvedRunInsightsOptions,
): RunInsightSession | null {
  if (options.session) {
    return (
      sessions.find((session) => sessionReferenceMatches(session.key, options.session)) ??
      sessions[0] ??
      null
    );
  }
  return (
    sessions.find((session) => session.finality.finalAssistantTextPresent) ?? sessions[0] ?? null
  );
}

function selectReportTask(tasks: RunInsightTask[]): RunInsightTask | null {
  return (
    tasks.find((task) => task.finality.finalAssistantTextPresent) ??
    tasks.find((task) => task.status === "running") ??
    tasks[0] ??
    null
  );
}

function selectReportReadback(params: {
  sessions: RunInsightSession[];
  tasks: RunInsightTask[];
  options: ResolvedRunInsightsOptions;
}): { finality: ReadbackFinality; activeWork: ReadbackActiveWork } {
  const session = selectReportSession(params.sessions, params.options);
  if (session) {
    return {
      finality: session.finality,
      activeWork: session.activeWork,
    };
  }
  const task = selectReportTask(params.tasks);
  if (task) {
    return {
      finality: task.finality,
      activeWork: task.activeWork,
    };
  }
  const empty = buildEmptyReadbackProjection({
    scope: "run",
    sessionKey: params.options.session ?? null,
    taskId: params.options.task ?? null,
    agentId: params.options.agent ?? null,
    reason: "No matching native session or task readback evidence found.",
  });
  return {
    finality: empty.finality,
    activeWork: empty.activeWork,
  };
}

export function buildRunInsightsReport(
  summary: StatusSummary,
  options: ResolvedRunInsightsOptions,
  buildOptions: BuildReportOptions = {},
): RunInsightsReport {
  const now = buildOptions.now ?? Date.now();
  let rows = selectRecentSessions(summary, options);
  let gatewayRows =
    buildOptions.gatewaySessionRows ??
    resolveGatewaySessionRowsForInsights({
      summary,
      rows,
      options,
    });
  if (rows.length === 0 && options.session) {
    const fallback = resolveExactGatewaySessionFallbackForInsights({ summary, options });
    rows = fallback.rows;
    gatewayRows = fallback.gatewayRows;
  }
  const sessions = rows.map((row) => toInsightSession(row, gatewayRows.get(row.key), null));
  const progressContext = createTaskReadbackProgressProjectionContext({ now });
  const taskRecords = buildOptions.taskRecords ?? listTaskRecords();
  const tasksForReadback = [...taskRecords];
  const tasks = taskRecords
    .filter((task) => taskMatchesOptions(task, options, now))
    .sort(
      (a, b) =>
        (b.lastEventAt ?? b.startedAt ?? b.createdAt) -
        (a.lastEventAt ?? a.startedAt ?? a.createdAt),
    )
    .slice(0, options.limit)
    .map((task) =>
      toInsightTask({
        task,
        now,
        progressContext,
        tasksForReadback,
        gatewayRows,
        childSessionUsage: buildOptions.childSessionUsage,
      }),
    );
  const childRuns = taskRecords
    .filter((task) => taskMatchesOptions(task, options, now))
    .sort(
      (a, b) =>
        (b.lastEventAt ?? b.startedAt ?? b.createdAt) -
        (a.lastEventAt ?? a.startedAt ?? a.createdAt),
    )
    .slice(0, options.limit)
    .flatMap((task) => {
      const readback = buildTaskChildRunReadback(task, now, tasksForReadback);
      return (readback?.childRuns ?? []).map((child) =>
        toInsightChildRun(
          task,
          child,
          buildOptions.childSessionUsage?.get(child.childSessionKey) ?? null,
        ),
      );
    });
  const skillReads = buildSkillReads(sessions, buildOptions.diagnosticSkillEvents ?? []);
  const deployEvents = options.includeBackground ? readRecentDeployEvents(options.limit) : [];
  const selected = selectReportReadback({ sessions, tasks, options });
  const costs = buildCostSummary({ sessions, deployEvents });
  const signals = buildSignals({
    sessions,
    tasks,
    childRuns,
    skillReads,
    deployEvents,
    finality: selected.finality,
  });
  return {
    schema: "openclaw.run_insights.v1",
    generatedAt: new Date(now).toISOString(),
    authority: "advisory_readback",
    filters: {
      agent: options.agent ?? null,
      session: options.session ?? null,
      task: options.task ?? null,
      activeMinutes: options.activeMinutes ?? null,
      limit: options.limit,
      includeBackground: options.includeBackground,
    },
    summary: {
      sessionCount: summary.sessions.count,
      recentSessionsConsidered: summary.sessions.recent.length,
      sessionsDisplayed: sessions.length,
      taskCount: taskRecords.length,
      tasksDisplayed: tasks.length,
      childRunsDisplayed: childRuns.length,
      skillReadsDisplayed: skillReads.length,
      backgroundSignalsIncluded: options.includeBackground,
    },
    finality: selected.finality,
    activeWork: selected.activeWork,
    sessions,
    tasks,
    childRuns,
    skillReads,
    deployEvents,
    costs,
    signals,
    pointers: {
      statusJson: "openclaw status --json",
      sessions: options.session
        ? `openclaw sessions show ${options.session}${options.agent ? ` --agent ${options.agent}` : ""}`
        : "openclaw sessions list --json",
      tasks: options.task
        ? `openclaw tasks show ${options.task} --json`
        : "openclaw tasks show --json",
      deployEvents: path.join(resolveStateDir(), "deploy", "events.ndjson"),
    },
  };
}

async function loadChildSessionUsage(
  childRuns: RunInsightChildRun[],
): Promise<Map<string, RunInsightSessionUsage | null>> {
  const entries = await Promise.all(
    uniqueValues(childRuns.map((child) => child.childSessionKey)).map(async (sessionKey) => {
      const usage = await loadCachedSessionUsage({ sessionId: sessionKey, agentId: null });
      return [sessionKey, usage] as const;
    }),
  );
  return new Map(entries);
}

export async function loadRunInsightsReport(
  options: ResolvedRunInsightsOptions,
): Promise<RunInsightsReport> {
  const config = getRuntimeConfig();
  const summary = await getStatusSummary({
    includeSensitive: false,
    includeChannelSummary: false,
    config,
  });
  const rows = selectRecentSessions(summary, options);
  const gatewayRows = resolveGatewaySessionRowsForInsights({ summary, rows, options });
  const diagnosticSkillEvents = getDiagnosticStabilitySnapshot({
    limit: 100,
    type: "skill.used",
  }).events;
  const initial = buildRunInsightsReport(summary, options, {
    gatewaySessionRows: gatewayRows,
    diagnosticSkillEvents,
  });
  const sessionsWithUsage = await attachCachedSessionUsage(initial.sessions);
  const childSessionUsage = await loadChildSessionUsage(initial.childRuns);
  const finalBase = buildRunInsightsReport(summary, options, {
    gatewaySessionRows: gatewayRows,
    diagnosticSkillEvents,
    childSessionUsage,
  });
  return {
    ...finalBase,
    sessions: sessionsWithUsage,
    costs: buildCostSummary({
      sessions: sessionsWithUsage,
      deployEvents: finalBase.deployEvents,
    }),
  };
}

function formatSignals(signals: RunInsightSignal[]): string[] {
  if (signals.length === 0) {
    return ["  No scoped run signals found."];
  }
  return signals.map(
    (signal) => `  [${signal.severity}] ${signal.code}: ${signal.message} (${signal.pointer})`,
  );
}

function formatSessions(sessions: RunInsightSession[]): string[] {
  if (sessions.length === 0) {
    return ["  No matching sessions."];
  }
  return sessions.map((session) => {
    const finality = session.finality.finalAssistantTextPresent
      ? `final=${session.finality.finalAssistantTextChars} chars`
      : "final=not-present";
    const usage = session.usage
      ? ` cost=$${session.usage.totalCost.toFixed(4)} tokens=${session.usage.totalTokens} tools=${session.usage.toolCalls}`
      : "";
    return `  ${session.key} agent=${session.agentId ?? "unknown"} status=${session.status ?? "unknown"} ${finality} age=${session.age}${usage}`;
  });
}

function formatTasks(tasks: RunInsightTask[]): string[] {
  if (tasks.length === 0) {
    return ["  No matching tasks."];
  }
  return tasks.map((task) => {
    const tool = task.activeWork.activeTool ? ` tool=${task.activeWork.activeTool}` : "";
    const child = task.childRunCount > 0 ? ` children=${task.childRunCount}` : "";
    return `  ${task.taskId} agent=${task.agentId ?? "unknown"} status=${task.status} delivery=${task.deliveryStatus} elapsed=${task.elapsed}${tool}${child}`;
  });
}

function formatChildRuns(childRuns: RunInsightChildRun[]): string[] {
  if (childRuns.length === 0) {
    return ["  No child runs in scoped readback."];
  }
  return childRuns.map((child) => {
    const chars = child.contentChars !== null ? ` chars=${child.contentChars}` : "";
    const truncated = child.contentTruncated === true ? " truncated=true" : "";
    return `  ${child.runId} session=${child.childSessionKey} agent=${child.agentId ?? "unknown"} status=${child.status ?? "unknown"} elapsed=${child.elapsed}${chars}${truncated}`;
  });
}

function formatSkillReads(skillReads: RunInsightSkillRead[]): string[] {
  if (skillReads.length === 0) {
    return ["  No skill-read evidence in scoped readback."];
  }
  return skillReads.map((skillRead) => {
    const skill = skillRead.skillName ? ` skill=${JSON.stringify(skillRead.skillName)}` : "";
    const visible =
      skillRead.visibleSkillNames.length > 0
        ? ` visible=${skillRead.visibleSkillNames.map((name) => JSON.stringify(name)).join(",")}`
        : "";
    const used =
      skillRead.usedSkillNames.length > 0
        ? ` used=${skillRead.usedSkillNames.map((name) => JSON.stringify(name)).join(",")}`
        : "";
    const lines =
      skillRead.linesRead !== null || skillRead.totalLines !== null
        ? ` lines=${skillRead.linesRead ?? "unknown"}/${skillRead.totalLines ?? "unknown"}`
        : "";
    const bytes = skillRead.bytesRead !== null ? ` bytes=${skillRead.bytesRead}` : "";
    return `  ${skillRead.sessionKey} agent=${skillRead.agentId ?? "unknown"} evidence=${skillRead.readEvidence} status=${skillRead.readStatus}${skill}${visible}${used}${lines}${bytes}`;
  });
}

function formatDeployEvents(deployEvents: RunInsightDeployEvent[]): string[] {
  if (deployEvents.length === 0) {
    return [
      "  Background deploy receipts hidden; rerun with --include-background to include them.",
    ];
  }
  return deployEvents.map(
    (event) =>
      `  ${event.eventType} status=${event.status ?? "unknown"} duration=${event.duration} commit=${event.sourceCommit ?? "unknown"} (${event.pointer})`,
  );
}

function formatCosts(costs: RunInsightCostSummary): string[] {
  const lines = [
    `  Session duration: ${formatDurationMs(costs.sessionDurationMs)}`,
    `  Session tokens: ${costs.sessionTokens ?? "unknown"}`,
    `  Session cost: ${costs.sessionCostUsd === null ? "unknown" : `$${costs.sessionCostUsd.toFixed(4)}`}`,
    `  Tool calls: ${costs.toolCalls ?? "unknown"}`,
    `  Deploy receipts: ${costs.deployReceiptCount} (${formatDurationMs(costs.deployKnownDurationMs)})`,
  ];
  if (costs.slowestDeployReceipt) {
    lines.push(
      `  Slowest deploy receipt: ${costs.slowestDeployReceipt.eventType} ${formatDurationMs(costs.slowestDeployReceipt.durationMs)} (${costs.slowestDeployReceipt.pointer})`,
    );
  }
  return lines;
}

function formatHumanReport(report: RunInsightsReport): string[] {
  return [
    theme.heading("Run Insights"),
    `Authority: ${report.authority}`,
    `Scope: agent=${report.filters.agent ?? "any"} session=${report.filters.session ?? "any"} task=${report.filters.task ?? "any"} background=${String(report.filters.includeBackground)}`,
    `Finality: status=${report.finality.status ?? "unknown"} final=${report.finality.finalAssistantTextPresent ? `${report.finality.finalAssistantTextChars} chars` : "not-present"} pointer=${report.finality.finalAssistantTextPointer ?? "none"}`,
    `Active work: phase=${report.activeWork.phase ?? "unknown"} tool=${report.activeWork.activeTool ?? "unknown"} source=${report.activeWork.source}`,
    "",
    theme.heading("Signals"),
    ...formatSignals(report.signals),
    "",
    theme.heading("Costs"),
    ...formatCosts(report.costs),
    "",
    theme.heading("Sessions"),
    ...formatSessions(report.sessions),
    "",
    theme.heading("Tasks"),
    ...formatTasks(report.tasks),
    "",
    theme.heading("Child Runs"),
    ...formatChildRuns(report.childRuns),
    "",
    theme.heading("Skill Reads"),
    ...formatSkillReads(report.skillReads),
    "",
    theme.heading("Deploy Receipts"),
    ...formatDeployEvents(report.deployEvents),
    "",
    theme.heading("Pointers"),
    `  ${report.pointers.statusJson}`,
    `  ${report.pointers.sessions}`,
    `  ${report.pointers.tasks}`,
    `  ${report.pointers.deployEvents}`,
  ];
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
