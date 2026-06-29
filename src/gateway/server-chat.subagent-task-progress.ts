// Mirrors native child session event progress onto foreground subagent task rows.
// The task row remains a readback projection; session transcripts/events remain truth.
import type { AgentEventPayload } from "../infra/agent-events.js";
import { isSubagentSessionKey } from "../sessions/session-key-utils.js";
import { recordTaskRunProgressByRunId } from "../tasks/detached-task-runtime.js";
import { resolveTaskForLookupToken } from "../tasks/runtime-internal.js";
import { sanitizeTaskStatusText } from "../tasks/task-status.js";

const SUBAGENT_TASK_PROGRESS_MIN_INTERVAL_MS = 5_000;
const SUBAGENT_TASK_PROGRESS_MAX_CHARS = 160;
const GENERIC_SUBAGENT_START_PROGRESS = "Child started.";

function text(value: unknown, maxChars = SUBAGENT_TASK_PROGRESS_MAX_CHARS): string | undefined {
  const sanitized = sanitizeTaskStatusText(value, { maxChars });
  return sanitized || undefined;
}

function phaseText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function summarizeSubagentTaskProgressEvent(evt: AgentEventPayload): string | undefined {
  if (evt.stream === "tool") {
    const phase = phaseText(evt.data?.phase);
    const name = text(evt.data?.name ?? evt.data?.toolName, 80);
    if (name) {
      return `Child ${phase === "end" ? "finished" : "running"} tool: ${name}.`;
    }
    return phase ? `Child tool ${phase}.` : "Child tool activity.";
  }

  if (evt.stream === "item") {
    const phase = phaseText(evt.data?.phase);
    const title = text(evt.data?.title ?? evt.data?.name, 100);
    const status = text(evt.data?.status, 40);
    if (title && status) {
      return `Child ${status}: ${title}.`;
    }
    if (title) {
      return `Child ${phase === "end" ? "finished" : "working on"}: ${title}.`;
    }
    return phase ? `Child item ${phase}.` : "Child item activity.";
  }

  if (evt.stream === "command_output") {
    const title = text(evt.data?.title ?? evt.data?.name, 100);
    return title ? `Child command output: ${title}.` : "Child command output.";
  }

  if (evt.stream === "patch") {
    const summary = text(evt.data?.summary, 100);
    return summary ? `Child patch: ${summary}.` : "Child patch activity.";
  }

  if (evt.stream === "assistant") {
    return "Child is producing assistant output.";
  }

  if (evt.stream === "thinking") {
    return "Child is reasoning.";
  }

  if (evt.stream === "lifecycle") {
    const phase = phaseText(evt.data?.phase);
    if (phase === "start") {
      return "Child run started.";
    }
    return undefined;
  }

  return undefined;
}

export function maybeRecordSubagentTaskProgress(params: {
  evt: AgentEventPayload;
  sessionKey?: string;
  now?: number;
}): boolean {
  const sessionKey = params.sessionKey?.trim();
  if (!sessionKey || !isSubagentSessionKey(sessionKey)) {
    return false;
  }
  const summary = summarizeSubagentTaskProgressEvent(params.evt);
  if (!summary) {
    return false;
  }
  const task = resolveTaskForLookupToken(params.evt.runId);
  if (!task || task.runtime !== "subagent" || task.status !== "running") {
    return false;
  }
  if (task.childSessionKey && task.childSessionKey !== sessionKey) {
    return false;
  }

  const now = params.now ?? Date.now();
  const lastEventAt = task.lastEventAt ?? task.startedAt ?? task.createdAt;
  const currentSummary = task.progressSummary?.trim();
  const staleGenericStart = !currentSummary || currentSummary === GENERIC_SUBAGENT_START_PROGRESS;
  if (!staleGenericStart && now - lastEventAt < SUBAGENT_TASK_PROGRESS_MIN_INTERVAL_MS) {
    return false;
  }

  recordTaskRunProgressByRunId({
    runId: params.evt.runId,
    runtime: "subagent",
    sessionKey,
    lastEventAt: now,
    progressSummary: summary,
    eventSummary: summary,
  });
  return true;
}
