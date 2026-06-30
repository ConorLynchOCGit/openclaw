// Task readback progress is a projection of native session evidence, not task state.
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import {
  getSessionDisplaySubagentRunByChildSessionKey,
  getSubagentSessionRuntimeMs,
  getSubagentSessionStartedAt,
  isSubagentRunLive,
  resolveSubagentSessionStatus,
} from "../agents/subagent-registry-read.js";
import type { TaskRecord } from "../tasks/task-registry.types.js";
import { loadGatewaySessionRow } from "./session-utils.js";
import type { ActiveProgressCapsule } from "./session-utils.types.js";

const TASK_PROGRESS_NOTE_MAX_CHARS = 240;

function taskSessionCandidates(task: TaskRecord): string[] {
  const candidates = [task.childSessionKey, task.requesterSessionKey, task.ownerKey]
    .map((value) => normalizeOptionalString(value))
    .filter((value): value is string => Boolean(value));
  return [...new Set(candidates)];
}

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

function resolveFallbackTaskProgressCapsule(task: TaskRecord): ActiveProgressCapsule | undefined {
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
        derivedBy: "resolveTaskActiveProgressCapsule",
        bounded: true,
      };
    }
  }

  return {
    source: "task-registry",
    ref: `task:${task.taskId}`,
    currentPhase: task.status,
    activeLabel:
      normalizeOptionalString(task.label) ??
      normalizeOptionalString(task.agentId) ??
      normalizeOptionalString(task.taskKind) ??
      normalizeOptionalString(task.runtime),
    observedAt: formatTaskProgressObservedAt(task.lastEventAt, task.startedAt, task.createdAt),
    elapsedMs: resolveElapsedMs(now, task.startedAt, task.createdAt),
    note:
      truncateTaskProgressNote(task.progressSummary) ??
      "Task is active; richer session progress is not indexed yet.",
    pointer: {
      kind: "task",
      ref: task.taskId,
      label: "task row",
    },
    derivedBy: "resolveTaskActiveProgressCapsule",
    bounded: true,
  };
}

export function resolveTaskActiveProgressCapsule(
  task: TaskRecord,
): ActiveProgressCapsule | undefined {
  if (task.status !== "running" && task.status !== "queued") {
    return undefined;
  }
  for (const sessionKey of taskSessionCandidates(task)) {
    try {
      const row = loadGatewaySessionRow(sessionKey, {
        includeDerivedTitles: false,
        includeLastMessage: false,
      });
      const activeProgress = row?.readbackProvenance?.activeProgress ?? row?.activeProgress;
      if (activeProgress?.bounded) {
        return activeProgress;
      }
    } catch {
      // Missing or unreadable session evidence should leave task readback generic.
    }
  }
  return resolveFallbackTaskProgressCapsule(task);
}
