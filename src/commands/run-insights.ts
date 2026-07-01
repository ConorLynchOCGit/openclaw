// Operator-facing run performance readback derived from native status summaries.
import { theme } from "../../packages/terminal-core/src/theme.js";
import type { RuntimeEnv } from "../runtime.js";
import { writeRuntimeJson } from "../runtime.js";
import { getStatusSummary } from "./status.summary.js";
import type { SessionStatus, StatusSummary } from "./status.types.js";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const HIGH_CONTEXT_WARN_PERCENT = 80;
const HIGH_CONTEXT_ERROR_PERCENT = 90;

export type RunInsightsOptions = {
  json?: boolean;
  agent?: string;
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
  pointer: string;
};

export type RunInsightsReport = {
  schema: "openclaw.run_insights.v1";
  generatedAt: string;
  authority: string;
  filters: {
    agent: string | null;
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
      byStatus: StatusSummary["tasks"]["byStatus"];
      byRuntime: StatusSummary["tasks"]["byRuntime"];
    };
  };
  signals: RunInsightSignal[];
  sessions: RunInsightSession[];
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
    pointer: `openclaw sessions show ${row.key}${agentPart}`,
  };
}

function buildSignals(summary: StatusSummary, sessions: RunInsightSession[]): RunInsightSignal[] {
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
    activeMinutes?: number;
    limit: number;
  },
): RunInsightsReport {
  const recent = selectRecentSessions(summary, options.agent);
  const filtered = recent.filter((row) => sessionMatchesActiveFilter(row, options.activeMinutes));
  const sessions = filtered.slice(0, options.limit).map(toInsightSession);

  return {
    schema: "openclaw.run_insights.v1",
    generatedAt: new Date().toISOString(),
    authority:
      "Derived readback over native status/session/task summaries; advisory only, not lifecycle truth.",
    filters: {
      agent: options.agent ?? null,
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
        byStatus: summary.tasks.byStatus,
        byRuntime: summary.tasks.byRuntime,
      },
    },
    signals: buildSignals(summary, sessions),
    sessions,
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
    return `  ${session.key}${agent}${runtime} age=${session.age} usage=${usage}${aborted}`;
  });
}

function formatHumanReport(report: RunInsightsReport): string[] {
  const lines = [
    theme.heading("Run Insights"),
    `Authority: ${report.authority}`,
    `Sessions: ${report.summary.sessionsDisplayed} shown of ${report.summary.recentSessionsConsidered} matching recent session(s); ${report.summary.sessionCount} total stored.`,
    `Tasks: ${report.summary.tasks.active} active, ${report.summary.tasks.failures} failure(s), ${report.summary.tasks.terminal} terminal of ${report.summary.tasks.total} total.`,
    "",
    theme.heading("Signals"),
    ...formatSignals(report.signals),
    "",
    theme.heading("Recent Sessions"),
    ...formatSessions(report.sessions),
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

  const summary = await getStatusSummary({
    includeSensitive: true,
    includeChannelSummary: false,
  });
  const report = buildRunInsightsReport(summary, {
    agent: options.agent,
    activeMinutes: parsedActive,
    limit: clampLimit(parsedLimit),
  });

  if (options.json) {
    writeRuntimeJson(runtime, report);
    return;
  }

  for (const line of formatHumanReport(report)) {
    runtime.log(line);
  }
}
