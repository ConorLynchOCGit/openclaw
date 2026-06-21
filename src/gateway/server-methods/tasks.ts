// Task gateway methods expose detached task list/get/cancel operations with
// bounded public summaries over the runtime task registry.
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  type TaskSummary,
  type TasksListParams,
  validateTasksCancelParams,
  validateTasksGetParams,
  validateTasksListParams,
} from "../../../packages/gateway-protocol/src/index.js";
import {
  getLatestSubagentRunByChildSessionKey,
  listDescendantRunsForRequester,
} from "../../agents/subagent-registry-read.js";
import type { SubagentRunRecord } from "../../agents/subagent-registry.types.js";
import { parseAgentSessionKey } from "../../routing/session-key.js";
import { cancelDetachedTaskRunById } from "../../tasks/detached-task-runtime.js";
import { getTaskById, listTaskRecords } from "../../tasks/runtime-internal.js";
import type { TaskRecord, TaskStatus } from "../../tasks/task-registry.types.js";
import {
  TASK_STATUS_DETAIL_MAX_CHARS,
  formatTaskStatusTitle,
  sanitizeTaskStatusText,
} from "../../tasks/task-status.js";
import type { GatewayRequestHandlers } from "./types.js";

const DEFAULT_TASKS_LIST_LIMIT = 100;
const MAX_TASKS_LIST_LIMIT = 500;
const CHILD_RESULT_PREVIEW_MAX_CHARS = 4_000;
const CHILD_RUN_PROJECTION_LIMIT = 20;

type TaskLedgerStatus = TaskSummary["status"];

// Gateway task APIs preserve the older ledger status vocabulary while the
// runtime registry tracks finer-grained task states such as `lost`.
const TASK_STATUS_TO_LEDGER_STATUS: Record<TaskStatus, TaskLedgerStatus> = {
  queued: "queued",
  running: "running",
  succeeded: "completed",
  failed: "failed",
  timed_out: "timed_out",
  cancelled: "cancelled",
  lost: "failed",
};

const LEDGER_STATUS_TO_TASK_STATUSES: Record<TaskLedgerStatus, TaskStatus[]> = {
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
  opts?: { errorContext?: boolean },
): string | undefined {
  const sanitized = sanitizeTaskStatusText(value, {
    errorContext: opts?.errorContext,
    maxChars: TASK_STATUS_DETAIL_MAX_CHARS,
  });
  return sanitized || undefined;
}

function mapTaskSummary(task: TaskRecord): TaskSummary {
  const progressSummary = sanitizeOptionalTaskText(task.progressSummary);
  const terminalSummary = sanitizeOptionalTaskText(task.terminalSummary, { errorContext: true });
  const error = sanitizeOptionalTaskText(task.error, { errorContext: true });
  const childResult = buildChildResultProjection(task);
  const childRuns = buildChildRunsProjection(task);
  return {
    id: task.taskId,
    taskId: task.taskId,
    kind: task.taskKind ?? task.runtime,
    runtime: task.runtime,
    status: TASK_STATUS_TO_LEDGER_STATUS[task.status],
    title: formatTaskStatusTitle(task),
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
    ...(progressSummary ? { progressSummary } : {}),
    ...(terminalSummary ? { terminalSummary } : {}),
    ...(task.executionReceipt ? { executionReceipt: task.executionReceipt } : {}),
    ...(childResult ? { childResult } : {}),
    ...(childRuns ? { childRuns } : {}),
    ...(error ? { error } : {}),
  };
}

function truncateChildResultText(value: string): { text: string; truncated: boolean } {
  const trimmed = value.trim();
  if (trimmed.length <= CHILD_RESULT_PREVIEW_MAX_CHARS) {
    return { text: trimmed, truncated: false };
  }
  return {
    text: `${trimmed.slice(0, CHILD_RESULT_PREVIEW_MAX_CHARS - 1).trimEnd()}…`,
    truncated: true,
  };
}

function buildChildResultProjection(task: TaskRecord): TaskSummary["childResult"] | undefined {
  const childSessionKey = normalizeOptionalString(task.childSessionKey);
  if (!childSessionKey) {
    return undefined;
  }
  const run = getLatestSubagentRunByChildSessionKey(childSessionKey);
  return buildChildRunProjection({
    task,
    childSessionKey,
    run,
  });
}

function buildChildRunProjection(params: {
  task: TaskRecord;
  childSessionKey: string;
  run?: SubagentRunRecord | null;
}): NonNullable<TaskSummary["childResult"]> {
  const { task, childSessionKey, run } = params;
  const runId = normalizeOptionalString(run?.runId) ?? normalizeOptionalString(task.runId);
  const resultText =
    normalizeOptionalString(run?.completion?.resultText) ??
    normalizeOptionalString(run?.completion?.fallbackResultText);
  const resultPreview = resultText ? truncateChildResultText(resultText) : undefined;
  const agentId =
    normalizeOptionalString(task.agentId) ??
    normalizeOptionalString(parseAgentSessionKey(childSessionKey)?.agentId);
  return {
    childSessionKey,
    ...(runId ? { runId } : {}),
    ...(run?.outcome?.status ? { status: run.outcome.status } : {}),
    ...(resultPreview ? { resultTextPreview: resultPreview.text } : {}),
    ...(resultPreview?.truncated ? { resultTextTruncated: true } : {}),
    ...(typeof run?.completion?.capturedAt === "number"
      ? { capturedAt: run.completion.capturedAt }
      : {}),
    artifactsListParams: {
      sessionKey: childSessionKey,
      ...(runId ? { runId } : {}),
      ...(agentId ? { agentId } : {}),
    },
  };
}

function taskRunCreatedWithinTaskWindow(task: TaskRecord, run: SubagentRunRecord): boolean {
  const taskStartedAt = task.startedAt ?? task.createdAt;
  if (run.createdAt < taskStartedAt) {
    return false;
  }
  if (typeof task.endedAt === "number" && run.createdAt > task.endedAt) {
    return false;
  }
  return true;
}

function isRunPendingCompletion(run: SubagentRunRecord): boolean {
  if (run.expectsCompletionMessage !== true) {
    return false;
  }
  const deliveryStatus = run.delivery?.status;
  return deliveryStatus !== "delivered" && deliveryStatus !== "not_required";
}

function buildChildRunsProjection(task: TaskRecord): TaskSummary["childRuns"] | undefined {
  const requesterSessionKey = normalizeOptionalString(
    task.childSessionKey ?? task.requesterSessionKey,
  );
  if (!requesterSessionKey) {
    return undefined;
  }
  const childRuns = listDescendantRunsForRequester(requesterSessionKey)
    .filter((run) => run.requesterSessionKey === requesterSessionKey)
    .filter((run) => taskRunCreatedWithinTaskWindow(task, run))
    .sort((a, b) => a.createdAt - b.createdAt);
  if (childRuns.length === 0) {
    return undefined;
  }

  let running = 0;
  let completed = 0;
  let failed = 0;
  let pendingCompletion = 0;
  for (const run of childRuns) {
    if (typeof run.endedAt !== "number") {
      running += 1;
    } else if (run.outcome?.status === "ok") {
      completed += 1;
    } else {
      failed += 1;
    }
    if (isRunPendingCompletion(run)) {
      pendingCompletion += 1;
    }
  }

  const children = childRuns.slice(0, CHILD_RUN_PROJECTION_LIMIT).map((run) =>
    buildChildRunProjection({
      task,
      childSessionKey: run.childSessionKey,
      run,
    }),
  );
  return {
    total: childRuns.length,
    running,
    completed,
    failed,
    pendingCompletion,
    children,
    ...(childRuns.length > children.length ? { childrenTruncated: true } : {}),
  };
}

function normalizeTaskStatusFilter(status: TasksListParams["status"]): Set<TaskStatus> | null {
  if (!status) {
    return null;
  }
  const statuses = Array.isArray(status) ? status : [status];
  return new Set(statuses.flatMap((value) => LEDGER_STATUS_TO_TASK_STATUSES[value] ?? []));
}

// Session filtering needs all ownership keys because detached child runs may be
// queried from the requester, child session, or owner/control-plane view.
function taskMatchesSession(task: TaskRecord, sessionKey: string | undefined): boolean {
  const normalized = normalizeOptionalString(sessionKey);
  if (!normalized) {
    return true;
  }
  return [task.requesterSessionKey, task.childSessionKey, task.ownerKey].some(
    (candidate) => normalizeOptionalString(candidate) === normalized,
  );
}

// Some records predate a direct `agentId`, so task listings still recover the
// owning agent from session-style keys instead of hiding those tasks.
function taskMatchesAgent(task: TaskRecord, agentId: string | undefined): boolean {
  const normalized = normalizeOptionalString(agentId);
  if (!normalized) {
    return true;
  }
  if (normalizeOptionalString(task.agentId) === normalized) {
    return true;
  }
  return [task.requesterSessionKey, task.childSessionKey, task.ownerKey].some(
    (candidate) => parseAgentSessionKey(candidate)?.agentId === normalized,
  );
}

// Cursor strings are offsets, not opaque tokens; reject malformed values so a
// client cannot silently restart pagination at the first page.
function parseCursor(cursor: string | undefined): number | null {
  if (!cursor) {
    return 0;
  }
  if (!/^\d+$/.test(cursor.trim())) {
    return null;
  }
  const parsed = Number(cursor);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

// Control UI task methods expose the stable gateway protocol shape; helpers
// above keep runtime registry details out of the wire result.
export const tasksHandlers: GatewayRequestHandlers = {
  "tasks.list": ({ params, respond }) => {
    if (!validateTasksListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid tasks.list params: ${formatValidationErrors(validateTasksListParams.errors)}`,
        ),
      );
      return;
    }
    const cursor = parseCursor(params.cursor);
    if (cursor === null) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid tasks.list cursor"),
      );
      return;
    }
    const statusFilter = normalizeTaskStatusFilter(params.status);
    const limit = Math.min(params.limit ?? DEFAULT_TASKS_LIST_LIMIT, MAX_TASKS_LIST_LIMIT);
    const filtered = listTaskRecords().filter((task) => {
      if (statusFilter && !statusFilter.has(task.status)) {
        return false;
      }
      return taskMatchesAgent(task, params.agentId) && taskMatchesSession(task, params.sessionKey);
    });
    const page = filtered.slice(cursor, cursor + limit);
    const nextOffset = cursor + page.length;
    respond(true, {
      tasks: page.map((task) => mapTaskSummary(task)),
      ...(nextOffset < filtered.length ? { nextCursor: String(nextOffset) } : {}),
    });
  },
  "tasks.get": ({ params, respond }) => {
    if (!validateTasksGetParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid tasks.get params: ${formatValidationErrors(validateTasksGetParams.errors)}`,
        ),
      );
      return;
    }
    const taskId = params.taskId;
    const task = getTaskById(taskId);
    if (!task) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `task not found: ${taskId}`),
      );
      return;
    }
    respond(true, { task: mapTaskSummary(task) });
  },
  "tasks.cancel": async ({ params, respond, context }) => {
    if (!validateTasksCancelParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid tasks.cancel params: ${formatValidationErrors(validateTasksCancelParams.errors)}`,
        ),
      );
      return;
    }
    const taskId = params.taskId;
    const reason = normalizeOptionalString(params.reason);
    const result = await cancelDetachedTaskRunById({
      cfg: context.getRuntimeConfig(),
      taskId,
      ...(reason ? { reason } : {}),
    });
    respond(true, {
      found: result.found,
      cancelled: result.cancelled,
      ...(result.reason ? { reason: result.reason } : {}),
      ...(result.task ? { task: mapTaskSummary(result.task) } : {}),
    });
  },
};

export const testApi = {
  mapTaskSummary,
};
export { testApi as __test };
