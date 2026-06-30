// Task readback progress is a projection of native session evidence and task execution receipts,
// not raw task-row lifecycle state.
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import {
  getSessionDisplaySubagentRunByChildSessionKey,
  getSubagentSessionRuntimeMs,
  getSubagentSessionStartedAt,
  isSubagentRunLive,
  resolveSubagentSessionStatus,
} from "../agents/subagent-registry-read.js";
import type { ReadbackProgressProjection } from "../shared/readback-progress.js";
import type { TaskRecord } from "./task-registry.types.js";

const TASK_PROGRESS_NOTE_MAX_CHARS = 240;

function truncateTaskProgressNote(value: string | undefined): string | undefined {
  const text = normalizeOptionalString(value);
  if (!text) {
    return undefined;
  }
  if (text.length <= TASK_PROGRESS_NOTE_MAX_CHARS) {
    return text;
  }
  return `${text.slice(0, TASK_PROGRESS_NOTE_MAX_CHARS - 1)}…`;
}

function normalizeTimestampMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

function formatTaskProgressObservedAt(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    const ts = normalizeTimestampMs(candidate);
    if (ts === undefined) {
      continue;
    }
    try {
      return new Date(ts).toISOString();
    } catch {
      // Invalid timestamp values should not make task readback unavailable.
    }
  }
  return undefined;
}

function resolveElapsedMs(now: number, ...candidates: unknown[]): number | undefined {
  for (const candidate of candidates) {
    const ts = normalizeTimestampMs(candidate);
    if (ts === undefined) {
      continue;
    }
    return Math.max(0, now - ts);
  }
  return undefined;
}

function resolveTaskRunEventProgressProjection(
  task: TaskRecord,
): ReadbackProgressProjection | undefined {
  const latestEvent = task.executionReceipt?.latestEvent;
  const note = truncateTaskProgressNote(latestEvent?.summary);
  if (!latestEvent || !note) {
    return undefined;
  }
  const now = Date.now();
  return {
    source: "task-run-event",
    ref: `task-event:${task.taskId}:${latestEvent.at}:${latestEvent.kind}`,
    currentPhase: latestEvent.kind === "progress" ? task.status : latestEvent.kind,
    activeLabel:
      normalizeOptionalString(task.label) ??
      normalizeOptionalString(task.agentId) ??
      normalizeOptionalString(task.taskKind) ??
      normalizeOptionalString(task.runtime),
    observedAt: formatTaskProgressObservedAt(latestEvent.at, task.lastEventAt),
    elapsedMs: resolveElapsedMs(now, task.startedAt, task.createdAt),
    sourceEventType: `task.${latestEvent.kind}`,
    note,
    pointer: {
      kind: "task",
      ref: task.taskId,
      label: "task run receipt",
    },
    derivedBy: "resolveTaskReadbackProgressProjection",
    bounded: true,
  };
}

function resolveFallbackTaskProgressProjection(
  task: TaskRecord,
): ReadbackProgressProjection | undefined {
  const childSessionKey = normalizeOptionalString(task.childSessionKey);
  const now = Date.now();
  if (childSessionKey) {
    const subagentRun = getSessionDisplaySubagentRunByChildSessionKey(childSessionKey);
    if (subagentRun && isSubagentRunLive(subagentRun)) {
      const startedAt = getSubagentSessionStartedAt(subagentRun) ?? subagentRun.createdAt;
      return {
        source: "subagent-registry",
        ref: `subagent-run:${subagentRun.runId}`,
        currentPhase: resolveSubagentSessionStatus(subagentRun),
        activeLabel:
          normalizeOptionalString(subagentRun.label) ??
          normalizeOptionalString(subagentRun.taskName) ??
          normalizeOptionalString(task.agentId) ??
          normalizeOptionalString(task.runtime),
        observedAt: formatTaskProgressObservedAt(
          task.lastEventAt,
          subagentRun.startedAt,
          subagentRun.createdAt,
        ),
        elapsedMs:
          getSubagentSessionRuntimeMs(subagentRun, now) ?? resolveElapsedMs(now, startedAt),
        note:
          truncateTaskProgressNote(task.progressSummary) ??
          "Child run is active; session trajectory progress is not indexed yet.",
        pointer: {
          kind: "session",
          ref: childSessionKey,
          label: "child session",
        },
        derivedBy: "resolveTaskReadbackProgressProjection",
        bounded: true,
      };
    }
  }

  return resolveTaskRunEventProgressProjection(task);
}

export function resolveTaskReadbackProgressProjection(
  task: TaskRecord,
): ReadbackProgressProjection | undefined {
  if (task.status !== "running" && task.status !== "queued") {
    return undefined;
  }
  return resolveFallbackTaskProgressProjection(task);
}
