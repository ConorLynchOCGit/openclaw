import { onAgentEvent } from "../infra/agent-events.js";
import { isTerminalTaskStatus } from "./task-executor-policy.js";
import {
  appendTaskEvent,
  buildTaskLifecycleTerminalOutcome,
  mapAgentRunTerminalOutcomeToTaskStatus,
  resolveTaskLifecycleTerminalError,
} from "./task-registry-common.js";
import {
  maybeDeliverTaskStateChangeUpdate,
  maybeDeliverTaskTerminalUpdate,
} from "./task-registry-delivery.js";
import { updateTask } from "./task-registry-mutation.js";
import {
  claimTaskRegistryListenerStart,
  getTasksByRunScope,
  restoreTaskRegistryOnce,
  setTaskRegistryListenerStarter,
  setTaskRegistryListenerStop,
} from "./task-registry-state.js";
import type { JsonValue, TaskRecord } from "./task-registry.types.js";

const MAX_TASK_EVENT_METADATA_KEYS = 64;
const MAX_TASK_EVENT_METADATA_KEY_CHARS = 80;
const MAX_TASK_EVENT_METADATA_TEXT_CHARS = 2_048;

function normalizeTaskEventMetadata(value: unknown): Record<string, JsonValue> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const normalized: Record<string, JsonValue> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    if (Object.keys(normalized).length >= MAX_TASK_EVENT_METADATA_KEYS) {
      break;
    }
    const key = rawKey.trim();
    if (
      !key ||
      key.length > MAX_TASK_EVENT_METADATA_KEY_CHARS ||
      key === "__proto__" ||
      key === "constructor" ||
      key === "prototype"
    ) {
      continue;
    }
    if (rawValue === null || typeof rawValue === "boolean") {
      normalized[key] = rawValue;
    } else if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      normalized[key] = rawValue;
    } else if (typeof rawValue === "string" && rawValue.trim()) {
      normalized[key] = rawValue.trim().slice(0, MAX_TASK_EVENT_METADATA_TEXT_CHARS);
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function mergeTaskDetail(
  current: JsonValue | undefined,
  metadata: Record<string, JsonValue>,
): JsonValue {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as Record<string, JsonValue>)
      : {};
  return { ...base, ...metadata };
}

function readTaskDetailNumber(detail: JsonValue | undefined, key: string): number | undefined {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return undefined;
  }
  const value = detail[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readTaskDetailText(detail: JsonValue | undefined, key: string): string | undefined {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return undefined;
  }
  const value = detail[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function ensureListener() {
  if (!claimTaskRegistryListenerStart()) {
    return;
  }
  const stop = onAgentEvent((evt) => {
    restoreTaskRegistryOnce();
    const scopedTasks = getTasksByRunScope({
      runId: evt.runId,
      sessionKey: evt.sessionKey,
    });
    if (scopedTasks.length === 0) {
      return;
    }
    const now = evt.ts || Date.now();
    for (const current of scopedTasks) {
      const phase =
        evt.stream === "lifecycle" && typeof evt.data?.phase === "string"
          ? evt.data.phase
          : undefined;
      const taskEventMetadata =
        evt.stream === "lifecycle"
          ? normalizeTaskEventMetadata(evt.data?.taskEventMetadata)
          : undefined;
      const currentIsTerminal = isTerminalTaskStatus(current.status);
      if (currentIsTerminal && !taskEventMetadata) {
        continue;
      }
      const patch: Partial<TaskRecord> = {
        lastEventAt: now,
      };
      if (taskEventMetadata) {
        patch.detail = mergeTaskDetail(current.detail, taskEventMetadata);
      }
      // A later physical-attempt receipt may arrive after the logical task has
      // settled. Preserve the facts without reopening or rewriting logical truth.
      if (currentIsTerminal) {
        updateTask(current.taskId, patch);
        continue;
      }
      if (evt.stream === "lifecycle") {
        const eventStartedAt = evt.data?.startedAt;
        const physicalStartedAt =
          typeof eventStartedAt === "number" && Number.isFinite(eventStartedAt)
            ? eventStartedAt
            : current.startedAt;
        const endedAt = typeof evt.data?.endedAt === "number" ? evt.data.endedAt : undefined;
        if (
          physicalStartedAt !== undefined &&
          (current.startedAt === undefined || physicalStartedAt < current.startedAt)
        ) {
          patch.startedAt = physicalStartedAt;
        }
        if (phase === "start") {
          const currentAttemptNumber = Math.max(
            0,
            Math.floor(readTaskDetailNumber(current.detail, "providerAttemptNumber") ?? 0),
          );
          const nextAttemptNumber = currentAttemptNumber + 1;
          const startMetadata: Record<string, JsonValue> = {
            providerAttemptNumber: nextAttemptNumber,
            providerAttemptStatus: "running",
            physicalAttemptStartedAt: physicalStartedAt ?? now,
          };
          if (nextAttemptNumber > 1) {
            startMetadata.continuationReason =
              readTaskDetailText(current.detail, "providerCause") ?? "native_retry";
          }
          patch.detail = mergeTaskDetail(patch.detail ?? current.detail, startMetadata);
          patch.status = "running";
        } else if (phase === "end") {
          const terminal = buildTaskLifecycleTerminalOutcome({
            phase,
            data: evt.data,
            startedAt: physicalStartedAt,
            endedAt: endedAt ?? now,
          });
          patch.status = mapAgentRunTerminalOutcomeToTaskStatus(terminal);
          patch.endedAt = terminal.endedAt ?? now;
          const error = resolveTaskLifecycleTerminalError({
            runtime: current.runtime,
            status: patch.status,
            error: terminal.error,
          });
          if (error) {
            patch.error = error;
          }
        } else if (phase === "error") {
          const terminal = buildTaskLifecycleTerminalOutcome({
            phase,
            data: evt.data,
            startedAt: physicalStartedAt,
            endedAt: endedAt ?? now,
          });
          patch.status = mapAgentRunTerminalOutcomeToTaskStatus(terminal);
          patch.endedAt = terminal.endedAt ?? now;
          patch.error =
            resolveTaskLifecycleTerminalError({
              runtime: current.runtime,
              status: patch.status,
              error: terminal.error,
            }) ?? current.error;
        }
      } else if (evt.stream === "error") {
        patch.error = typeof evt.data?.error === "string" ? evt.data.error : current.error;
      } else if (evt.stream === "tool" && evt.data?.phase === "start") {
        // Tool starts are the activity signal surfaced in task summaries; ends
        // and outputs only refresh lastEventAt.
        const toolName = typeof evt.data.name === "string" ? evt.data.name.trim() : "";
        if (toolName) {
          patch.toolUseCount = (current.toolUseCount ?? 0) + 1;
          patch.lastToolName = toolName;
        }
      }
      const stateChangeEvent =
        patch.status && patch.status !== current.status
          ? appendTaskEvent({
              at: now,
              kind: patch.status,
              summary:
                patch.status === "failed"
                  ? (patch.error ?? current.error)
                  : patch.status === "succeeded"
                    ? current.terminalSummary
                    : undefined,
            })
          : undefined;
      const updated = updateTask(current.taskId, patch);
      if (updated) {
        void maybeDeliverTaskStateChangeUpdate(current.taskId, stateChangeEvent);
        void maybeDeliverTaskTerminalUpdate(current.taskId);
      }
    }
  });
  setTaskRegistryListenerStop(stop);
}

setTaskRegistryListenerStarter(ensureListener);
