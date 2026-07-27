// Projects native task records into the one bounded task DTO shared by CLI,
// Gateway RPC, events, and UI consumers.
import type { TaskSummary } from "../../packages/gateway-protocol/src/index.js";
import {
  buildTaskLifecycleReadback,
  createTaskLifecycleReadbackContext,
  type TaskLifecycleReadbackContext,
} from "./task-lifecycle-readback.js";
import type { TaskRecord, TaskStatus } from "./task-registry.types.js";
import {
  TASK_STATUS_DETAIL_MAX_CHARS,
  formatTaskStatusTitle,
  sanitizeTaskPromptText,
  sanitizeTaskStatusText,
} from "./task-status.js";

type TaskLedgerStatus = TaskSummary["status"];

const TASK_PROMPT_MAX_CHARS = 4_000;

const TASK_STATUS_TO_LEDGER_STATUS: Record<TaskStatus, TaskLedgerStatus> = {
  queued: "queued",
  running: "running",
  succeeded: "completed",
  failed: "failed",
  timed_out: "timed_out",
  cancelled: "cancelled",
  lost: "failed",
};

export type TaskSummaryProjectionOptions = {
  includePrompt?: boolean;
  lifecycleContext?: TaskLifecycleReadbackContext;
};

export function taskUpdatedAt(task: TaskRecord): number {
  return task.lastEventAt ?? task.endedAt ?? task.startedAt ?? task.createdAt;
}

function sanitizeOptionalTaskText(
  value: unknown,
  opts?: { errorContext?: boolean },
): string | undefined {
  const sanitized = sanitizeTaskStatusText(value, {
    errorContext: opts?.errorContext,
    maxChars: TASK_STATUS_DETAIL_MAX_CHARS,
  });
  return sanitized || undefined;
}

export function mapTaskSummary(
  task: TaskRecord,
  opts: TaskSummaryProjectionOptions = {},
): TaskSummary {
  const progressSummary = sanitizeOptionalTaskText(task.progressSummary);
  const terminalSummary = sanitizeOptionalTaskText(task.terminalSummary, { errorContext: true });
  const error = sanitizeOptionalTaskText(task.error, { errorContext: true });
  const lastToolName = sanitizeOptionalTaskText(task.lastToolName);
  const prompt = opts.includePrompt
    ? sanitizeTaskPromptText(task.task, TASK_PROMPT_MAX_CHARS) || undefined
    : undefined;
  const toolUseCount =
    typeof task.toolUseCount === "number" && Number.isInteger(task.toolUseCount)
      ? Math.max(0, task.toolUseCount)
      : undefined;
  return {
    id: task.taskId,
    taskId: task.taskId,
    kind: task.taskKind ?? task.runtime,
    runtime: task.runtime,
    status: TASK_STATUS_TO_LEDGER_STATUS[task.status],
    title: formatTaskStatusTitle(task),
    deliveryStatus: task.deliveryStatus,
    ...(task.terminalOutcome ? { terminalOutcome: task.terminalOutcome } : {}),
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
    ...(toolUseCount !== undefined ? { toolUseCount } : {}),
    ...(lastToolName ? { lastToolName } : {}),
    ...(progressSummary ? { progressSummary } : {}),
    ...(terminalSummary ? { terminalSummary } : {}),
    readback: buildTaskLifecycleReadback(
      task,
      opts.lifecycleContext ?? createTaskLifecycleReadbackContext(),
    ),
    ...(error ? { error } : {}),
    ...(prompt ? { prompt } : {}),
  };
}

export function mapTaskSummaries(
  tasks: readonly TaskRecord[],
  opts: Omit<TaskSummaryProjectionOptions, "lifecycleContext"> = {},
): TaskSummary[] {
  const lifecycleContext = createTaskLifecycleReadbackContext({ tasks });
  return tasks.map((task) => mapTaskSummary(task, { ...opts, lifecycleContext }));
}
