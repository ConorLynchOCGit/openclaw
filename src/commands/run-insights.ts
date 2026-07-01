// Operator-facing run performance readback derived from native status summaries.
import { theme } from "../../packages/terminal-core/src/theme.js";
import { getRuntimeConfig } from "../config/config.js";
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

export type RunInsightsOptions = {
  json?: boolean;
  agent?: string;
  session?: string;
  task?: string;
  active?: string | number;
  limit?: string | number;
};

type SignalSeverity = "info" | "warn" | "error";

export type RunInsightSignal = {
  severity: SignalSeverity;
  code: string;
  message: string;
  evidence?: Record<string, unknown>;
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
  pointer: string;
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
  };
  signals: RunInsightSignal[];
  sessions: RunInsightSession[];
  tasks: RunInsightTask[];
  pointers: {
    statusJson: string;
    sessions: string;
    tasksSummary: string;
    tasksAudit: string;
  };
};

function parsePositiveInteger(
  value: string | number | undefined,
  name: string,
  runtime: RuntimeEnv,
): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  const text = String(value).trim();
  if (!/^[1-9]\d*$/.test(text)) {
    runtime.error(`${name} must be a positive integer.`);
    runtime.exit(1);
    return null;
  }
  return Number(text);
}

function parseStringFilter(
  value: string | undefined,
  name: string,
  runtime: RuntimeEnv,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  const text = value.trim();
  if (!text) {
    runtime.error(`${name} must not be empty.`);
    runtime.exit(1);
    return null;
  }
  return text;
}

function clampLimit(limit: number | undefined): number {
  return Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
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

function toInsightTask(task: TaskRecord, now: number): RunInsightTask {
  const referenceAt = taskReferenceAt(task);
  const elapsedMs = taskElapsedMs(task, now);
  const latestEvent = task.executionReceipt?.latestEvent;
  return {
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
          summary: latestEvent.summary ?? null,
        }
      : null,
    pointer: `openclaw tasks show ${task.taskId}`,
  };
}

function buildSignals(
  summary: StatusSummary,
  sessions: RunInsightSession[],
  tasks: RunInsightTask[],
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

  if (signals.length === 0) {
    signals.push({
      severity: "info",
      code: "no_immediate_run_pressure",
      message: "No immediate run-pressure signals appeared in bounded status readback.",
    });
  }

  return signals;
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

  return {
    schema: "openclaw.run_insights.v1",
    generatedAt: new Date().toISOString(),
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
    },
    signals: buildSignals(summary, sessions, tasks),
    sessions,
    tasks,
    pointers: {
      statusJson: "openclaw status --json",
      sessions: "openclaw sessions --json",
      tasksSummary: "openclaw tasks list --summary",
      tasksAudit: "openclaw tasks audit --json",
    },
  };
}

function formatSignals(signals: RunInsightSignal[]): string[] {
  return signals.map((signal) => {
    const prefix =
      signal.severity === "error" ? "ERROR" : signal.severity === "warn" ? "WARN" : "INFO";
    return `  ${prefix} ${signal.code}: ${signal.message}`;
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
    const delivery =
      task.deliveryStatus === "delivered" || task.deliveryStatus === "not_applicable"
        ? ""
        : ` delivery=${task.deliveryStatus}`;
    return `  ${task.taskId} runtime=${task.runtime} status=${task.status}${delivery} age=${task.age} elapsed=${task.elapsed}${label}${child}${latest}`;
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
    theme.heading("Recent Sessions"),
    ...formatSessions(report.sessions),
    "",
    theme.heading("Recent Tasks"),
    ...formatTasks(report.tasks),
    "",
    theme.heading("Pointers"),
    `  ${report.pointers.statusJson}`,
    `  ${report.pointers.sessions}`,
    `  ${report.pointers.tasksSummary}`,
    `  ${report.pointers.tasksAudit}`,
  ];
  return lines;
}

export async function runInsightsCommand(
  options: RunInsightsOptions,
  runtime: RuntimeEnv,
): Promise<void> {
  const parsedLimit = parsePositiveInteger(options.limit, "--limit", runtime);
  if (parsedLimit === null) {
    return;
  }
  const parsedActive = parsePositiveInteger(options.active, "--active", runtime);
  if (parsedActive === null) {
    return;
  }
  const parsedSession = parseStringFilter(options.session, "--session", runtime);
  if (parsedSession === null) {
    return;
  }
  const parsedTask = parseStringFilter(options.task, "--task", runtime);
  if (parsedTask === null) {
    return;
  }

  const summary = await getStatusSummary({
    includeSensitive: true,
    includeChannelSummary: false,
  });
  const parsedLimitValue = clampLimit(parsedLimit);
  const initialReport = buildRunInsightsReport(summary, {
    agent: options.agent,
    session: parsedSession,
    task: parsedTask,
    activeMinutes: parsedActive,
    limit: parsedLimitValue,
  });
  const sessionsWithUsage = await attachCachedSessionUsage(initialReport.sessions);
  const sessionUsage = new Map(
    sessionsWithUsage.map((session) => [session.key, session.usage] as const),
  );
  const report = buildRunInsightsReport(summary, {
    agent: options.agent,
    session: parsedSession,
    task: parsedTask,
    activeMinutes: parsedActive,
    limit: parsedLimitValue,
    sessionUsage,
  });

  if (options.json) {
    writeRuntimeJson(runtime, report);
    return;
  }

  for (const line of formatHumanReport(report)) {
    runtime.log(line);
  }
}
