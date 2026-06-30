// Shared public task readback projection for gateway APIs and CLI JSON.
import { type TaskSummary } from "../../packages/gateway-protocol/src/index.js";
import { resolveTaskReadbackProgressProjection } from "../tasks/task-readback-progress.js";
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

type TaskLedgerStatus = TaskSummary["status"];
type TaskSummaryProjectionOptions = {
  progressMaxChars?: number;
  subagentProgressMaxChars?: number;
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
  const activeProgress = resolveTaskReadbackProgressProjection(task);
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
  const sample = selectTaskSummarySample(tasks, limit).map((task) =>
    mapTaskSummary(task, {
      progressMaxChars: TASK_LIST_SUMMARY_TEXT_MAX_CHARS,
      subagentProgressMaxChars: TASK_LIST_SUMMARY_TEXT_MAX_CHARS,
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
      "bounded readback projection derived from task registry records and task summaries; use tasks list --json for the full list",
  };
}
