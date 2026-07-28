import { isTerminalTaskStatus } from "./task-executor-policy.js";
import { getTaskById, listTaskRecordsUnsorted } from "./task-registry-query.js";
import { finalizeTaskRunByRunId, markTaskTerminalById } from "./task-registry-record-api.js";
import type { TaskRecord } from "./task-registry.types.js";

function isAbortTerminalStatus(status: TaskRecord["status"]): boolean {
  return status === "cancelled" || status === "timed_out";
}

function areTasksTerminal(taskIds: Iterable<string>): boolean {
  for (const taskId of taskIds) {
    const task = getTaskById(taskId);
    if (!task || !isTerminalTaskStatus(task.status)) {
      return false;
    }
  }
  return true;
}

/**
 * Persist a foreground run's logical terminal state before its physical abort.
 * The terminal parent blocks new child admission; restart recovery closes any
 * descendant left between persistence steps after a host crash.
 */
export function finalizeTaskLineageBeforeRunAbort(params: {
  runId: string;
  status: "cancelled" | "timed_out";
  endedAt: number;
  error: string;
}): boolean {
  const roots = listTaskRecordsUnsorted().filter((task) => task.runId === params.runId);
  if (roots.length === 0) {
    return true;
  }

  if (roots.some((task) => !isTerminalTaskStatus(task.status))) {
    finalizeTaskRunByRunId({
      runId: params.runId,
      status: params.status,
      endedAt: params.endedAt,
      lastEventAt: params.endedAt,
      error: params.error,
    });
  }

  const rootIds = roots
    .map((task) => getTaskById(task.taskId))
    .filter((task): task is TaskRecord => Boolean(task))
    .filter((task) => isAbortTerminalStatus(task.status))
    .map((task) => task.taskId);
  if (rootIds.length === 0) {
    return areTasksTerminal(roots.map((task) => task.taskId));
  }

  const queue = [...rootIds];
  const seen = new Set<string>();
  const lineageTaskIds = new Set(rootIds);
  const descendantError =
    params.status === "timed_out" ? "Parent task timed out." : "Parent task was cancelled.";
  while (queue.length > 0) {
    const parentTaskId = queue.shift();
    if (!parentTaskId || seen.has(parentTaskId)) {
      continue;
    }
    seen.add(parentTaskId);

    const children = listTaskRecordsUnsorted().filter((task) => task.parentTaskId === parentTaskId);
    for (const child of children) {
      lineageTaskIds.add(child.taskId);
      const current = getTaskById(child.taskId);
      if (!current) {
        return false;
      }
      if (!isTerminalTaskStatus(current.status)) {
        const updated = markTaskTerminalById({
          taskId: current.taskId,
          status: "cancelled",
          endedAt: params.endedAt,
          lastEventAt: params.endedAt,
          error: descendantError,
        });
        if (!updated || updated.status !== "cancelled") {
          return false;
        }
      }
      queue.push(child.taskId);
    }
  }

  return areTasksTerminal(lineageTaskIds);
}
