// Shared public task readback projection for gateway APIs and CLI JSON.
import { type TaskSummary } from "../../packages/gateway-protocol/src/index.js";
import {
  getSubagentSessionRuntimeMs,
  getSubagentSessionStartedAt,
  listDescendantRunsForRequester,
  resolveSubagentSessionStatus,
} from "../agents/subagent-registry-read.js";
import type { SubagentRunRecord } from "../agents/subagent-registry.types.js";
import {
  createTaskReadbackProgressProjectionContext,
  resolveTaskReadbackProgressProjection,
  type TaskReadbackProgressProjectionContext,
} from "../tasks/task-readback-progress.js";
import { summarizeTaskRecords } from "../tasks/task-registry.summary.js";
import type { TaskRecord, TaskStatus } from "../tasks/task-registry.types.js";
import {
  TASK_STATUS_DETAIL_MAX_CHARS,
  formatTaskStatusTitle,
  sanitizeTaskStatusText,
} from "../tasks/task-status.js";

// Subagent completions use progressSummary as a requester-facing Context Pack
// pointer/readback surface. Keep ordinary task status compact, but allow child
// task readback to carry more than a 2,000-word scout packet.
const SUBAGENT_PROGRESS_READBACK_MAX_CHARS = 32_000;
const TASK_LIST_SUMMARY_LIMIT = 20;
const TASK_LIST_SUMMARY_TEXT_MAX_CHARS = 1_000;
const TASK_CHILD_RUN_OUTPUT_MAX_CHARS = 800;
const TASK_CHILD_RUN_LIMIT = 12;

type TaskLedgerStatus = TaskSummary["status"];
type TaskChildRunSummary = NonNullable<TaskSummary["childRuns"]>[number];
type TaskSummaryProjectionOptions = {
  progressMaxChars?: number;
  subagentProgressMaxChars?: number;
  readbackContext?: TaskReadbackProgressProjectionContext;
};

// Public task readback preserves the older ledger status vocabulary while the
// runtime registry tracks finer-grained task states such as `lost`.
export const TASK_STATUS_TO_LEDGER_STATUS: Record<TaskStatus, TaskLedgerStatus> = {
  queued: "queued",
  running: "running",
  succeeded: "completed",
  failed: "failed",
  timed_out: "timed_out",
  cancelled: "cancelled",
  lost: "failed",
};

export const LEDGER_STATUS_TO_TASK_STATUSES: Record<TaskLedgerStatus, TaskStatus[]> = {
  queued: ["queued"],
  running: ["running"],
  completed: ["succeeded"],
  failed: ["failed", "lost"],
  timed_out: ["timed_out"],
  cancelled: ["cancelled"],
};

function taskUpdatedAt(task: TaskRecord): number {
  return task.lastEventAt ?? task.endedAt ?? task.startedAt ?? task.createdAt;
}

// Status text can originate from providers, shells, and subprocesses. Keep the
// public task shape bounded before it reaches control-plane clients.
function sanitizeOptionalTaskText(
  value: unknown,
  opts?: { errorContext?: boolean; maxChars?: number },
): string | undefined {
  const sanitized = sanitizeTaskStatusText(value, {
    errorContext: opts?.errorContext,
    maxChars: opts?.maxChars ?? TASK_STATUS_DETAIL_MAX_CHARS,
  });
  return sanitized || undefined;
}

function inferAgentRoleFromSessionKey(sessionKey: string | undefined): string | undefined {
  const match = sessionKey?.match(/^agent:([^:]+):/);
  return match?.[1];
}

function candidateTaskChildRunRoots(task: TaskRecord): string[] {
  const roots = [task.childSessionKey, task.requesterSessionKey, task.ownerKey]
    .map((value) => sanitizeOptionalTaskText(value))
    .filter((value): value is string => Boolean(value));
  return [...new Set(roots)];
}

function childRunFallsWithinTaskWindow(task: TaskRecord, run: SubagentRunRecord): boolean {
  const lowerBound = task.startedAt ?? task.createdAt;
  const upperBound = task.endedAt;
  if (typeof lowerBound === "number" && run.createdAt < lowerBound) {
    return false;
  }
  if (typeof upperBound === "number" && run.createdAt > upperBound) {
    return false;
  }
  return true;
}

function mapTaskChildRun(run: SubagentRunRecord, now = Date.now()): TaskChildRunSummary {
  const startedAt = getSubagentSessionStartedAt(run);
  const durationMs = getSubagentSessionRuntimeMs(run, now);
  const agentId = inferAgentRoleFromSessionKey(run.childSessionKey);
  const status = resolveSubagentSessionStatus(run);
  const spawnReason = sanitizeOptionalTaskText(run.task, {
    maxChars: TASK_LIST_SUMMARY_TEXT_MAX_CHARS,
  });
  const terminalSummary = sanitizeOptionalTaskText(
    run.completion?.resultText ??
      run.completion?.fallbackResultText ??
      run.delivery?.payload?.frozenResultText ??
      run.delivery?.payload?.fallbackFrozenResultText,
    { maxChars: TASK_CHILD_RUN_OUTPUT_MAX_CHARS },
  );
  const errorSummary = sanitizeOptionalTaskText(
    run.outcome?.error ?? run.execution?.outcome?.error ?? run.delivery?.lastError,
    { errorContext: true, maxChars: TASK_CHILD_RUN_OUTPUT_MAX_CHARS },
  );
  return {
    runId: run.runId,
    childSessionKey: run.childSessionKey,
    requesterSessionKey: run.requesterSessionKey,
    ...(agentId ? { agentId } : {}),
    ...(run.taskName ? { taskName: run.taskName } : {}),
    ...(run.label ? { label: run.label } : {}),
    ...(status ? { status } : {}),
    ...(run.delivery?.status ? { deliveryStatus: run.delivery.status } : {}),
    createdAt: run.createdAt,
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(run.endedAt !== undefined ? { endedAt: run.endedAt } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(spawnReason ? { spawnReason } : {}),
    ...(terminalSummary ? { terminalSummary } : {}),
    ...(errorSummary ? { errorSummary } : {}),
  };
}

export function buildTaskChildRunReadback(
  task: TaskRecord,
  now = Date.now(),
): { childRunCount: number; childRuns: TaskChildRunSummary[] } | undefined {
  const byRunId = new Map<string, SubagentRunRecord>();
  for (const root of candidateTaskChildRunRoots(task)) {
    for (const run of listDescendantRunsForRequester(root)) {
      if (!childRunFallsWithinTaskWindow(task, run)) {
        continue;
      }
      const existing = byRunId.get(run.runId);
      if (!existing || run.createdAt > existing.createdAt) {
        byRunId.set(run.runId, run);
      }
    }
  }
  if (byRunId.size === 0) {
    return undefined;
  }
  const sorted = [...byRunId.values()].sort((a, b) => a.createdAt - b.createdAt);
  return {
    childRunCount: sorted.length,
    childRuns: sorted.slice(0, TASK_CHILD_RUN_LIMIT).map((run) => mapTaskChildRun(run, now)),
  };
}

function inferTaskChildRole(
  task: TaskRecord,
  activeProgress: ReturnType<typeof resolveTaskReadbackProgressProjection>,
): string | undefined {
  return (
    activeProgress?.childRole ??
    inferAgentRoleFromSessionKey(task.childSessionKey) ??
    (task.taskKind === "codex-native" ? sanitizeOptionalTaskText(task.label) : undefined)
  );
}

function inferTaskChildPhase(
  task: TaskRecord,
  activeProgress: ReturnType<typeof resolveTaskReadbackProgressProjection>,
  childRole: string | undefined,
): string | undefined {
  return (
    activeProgress?.childPhase ??
    activeProgress?.currentPhase ??
    (childRole ? task.status : undefined)
  );
}

function inferTaskSpawnReason(
  task: TaskRecord,
  activeProgress: ReturnType<typeof resolveTaskReadbackProgressProjection>,
  childRole: string | undefined,
): string | undefined {
  return (
    activeProgress?.spawnReason ??
    (childRole
      ? sanitizeOptionalTaskText(task.task, { maxChars: TASK_LIST_SUMMARY_TEXT_MAX_CHARS })
      : undefined)
  );
}

export function mapTaskSummary(
  task: TaskRecord,
  opts: TaskSummaryProjectionOptions = {},
): TaskSummary {
  const progressSummary = sanitizeOptionalTaskText(task.progressSummary, {
    maxChars:
      task.runtime === "subagent"
        ? (opts.subagentProgressMaxChars ?? SUBAGENT_PROGRESS_READBACK_MAX_CHARS)
        : (opts.progressMaxChars ?? TASK_STATUS_DETAIL_MAX_CHARS),
  });
  const terminalSummary = sanitizeOptionalTaskText(task.terminalSummary, { errorContext: true });
  const error = sanitizeOptionalTaskText(task.error, { errorContext: true });
  const activeProgress = resolveTaskReadbackProgressProjection(task, opts.readbackContext);
  const childRole = inferTaskChildRole(task, activeProgress);
  const childPhase = inferTaskChildPhase(task, activeProgress, childRole);
  const spawnReason = inferTaskSpawnReason(task, activeProgress, childRole);
  const childRunReadback = buildTaskChildRunReadback(task);
  return {
    id: task.taskId,
    taskId: task.taskId,
    kind: task.taskKind ?? task.runtime,
    runtime: task.runtime,
    status: TASK_STATUS_TO_LEDGER_STATUS[task.status],
    title: formatTaskStatusTitle(task),
    deliveryStatus: task.deliveryStatus,
    ...(task.agentId ? { agentId: task.agentId } : {}),
    sessionKey: task.requesterSessionKey,
    ...(task.childSessionKey ? { childSessionKey: task.childSessionKey } : {}),
    ...(childRole ? { childRole } : {}),
    ...(childPhase ? { childPhase } : {}),
    ...(spawnReason ? { spawnReason } : {}),
    ownerKey: task.ownerKey,
    ...(task.runId ? { runId: task.runId } : {}),
    ...(task.parentFlowId ? { flowId: task.parentFlowId } : {}),
    ...(task.parentTaskId ? { parentTaskId: task.parentTaskId } : {}),
    ...(task.sourceId ? { sourceId: task.sourceId } : {}),
    createdAt: task.createdAt,
    updatedAt: taskUpdatedAt(task),
    ...(task.startedAt !== undefined ? { startedAt: task.startedAt } : {}),
    ...(task.endedAt !== undefined ? { endedAt: task.endedAt } : {}),
    ...(activeProgress ? { activeProgress } : {}),
    ...(childRunReadback ? { childRunCount: childRunReadback.childRunCount } : {}),
    ...(childRunReadback ? { childRuns: childRunReadback.childRuns } : {}),
    ...(progressSummary ? { progressSummary } : {}),
    ...(terminalSummary ? { terminalSummary } : {}),
    ...(error ? { error } : {}),
  };
}

function isActiveTask(task: TaskRecord): boolean {
  return task.status === "queued" || task.status === "running";
}

function isIssueTask(task: TaskRecord): boolean {
  return task.status === "failed" || task.status === "timed_out" || task.status === "lost";
}

function selectTaskSummarySample(tasks: readonly TaskRecord[], limit: number): TaskRecord[] {
  const seen = new Set<string>();
  const sample: TaskRecord[] = [];
  const append = (candidates: TaskRecord[]) => {
    for (const task of candidates) {
      if (sample.length >= limit) {
        return;
      }
      if (seen.has(task.taskId)) {
        continue;
      }
      seen.add(task.taskId);
      sample.push(task);
    }
  };
  const newestFirst = (a: TaskRecord, b: TaskRecord) => taskUpdatedAt(b) - taskUpdatedAt(a);
  append(tasks.filter(isActiveTask).sort(newestFirst));
  append(tasks.filter(isIssueTask).sort(newestFirst));
  append([...tasks].sort(newestFirst));
  return sample;
}

function summarizeActiveProgressSources(tasks: readonly TaskSummary[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const task of tasks) {
    const source = task.activeProgress?.source;
    if (!source) {
      continue;
    }
    counts[source] = (counts[source] ?? 0) + 1;
  }
  return counts;
}

export function buildTasksListSummaryPayload(
  tasks: readonly TaskRecord[],
  opts: {
    runtime?: string | null;
    status?: string | null;
    limit?: number;
  } = {},
) {
  const limit =
    typeof opts.limit === "number" && Number.isFinite(opts.limit) && opts.limit > 0
      ? Math.min(Math.floor(opts.limit), TASK_LIST_SUMMARY_LIMIT)
      : TASK_LIST_SUMMARY_LIMIT;
  const readbackContext = createTaskReadbackProgressProjectionContext();
  const sample = selectTaskSummarySample(tasks, limit).map((task) =>
    mapTaskSummary(task, {
      progressMaxChars: TASK_LIST_SUMMARY_TEXT_MAX_CHARS,
      subagentProgressMaxChars: TASK_LIST_SUMMARY_TEXT_MAX_CHARS,
      readbackContext,
    }),
  );
  return {
    schema: "openclaw.tasks.list.summary.v1" as const,
    count: tasks.length,
    runtime: opts.runtime ?? null,
    status: opts.status ?? null,
    summary: summarizeTaskRecords(tasks),
    displayed: sample.length,
    displayLimit: limit,
    truncated: tasks.length > sample.length,
    selection: {
      order: "active_then_issues_then_recent" as const,
      activeFirst: true,
      issueFirst: true,
    },
    activeProgress: {
      displayedWithProgress: sample.filter((task) => task.activeProgress).length,
      displayedBySource: summarizeActiveProgressSources(sample),
    },
    tasks: sample,
    authority:
      "bounded readback projection derived from task registry records, task receipts, and session trajectory evidence; use tasks list --json for the full list",
  };
}

export function mapTaskSummaries(tasks: readonly TaskRecord[]): TaskSummary[] {
  const readbackContext = createTaskReadbackProgressProjectionContext();
  return tasks.map((task) => mapTaskSummary(task, { readbackContext }));
}
