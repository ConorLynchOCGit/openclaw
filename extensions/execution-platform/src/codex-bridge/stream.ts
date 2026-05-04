import { boundDiagnosticJson } from "../observability/redaction.ts";
import type {
  CodexBridgeEventKind,
  CodexBridgeNormalizedStreamEvent,
  FakeAcpStreamEvent,
  FakeCodexCliStreamEvent,
  RawCodexBridgeStreamEvent,
} from "./types.ts";

const CODEX_CLI_EVENT_KIND_MAP: Record<string, CodexBridgeEventKind> = {
  session_started: "session_started",
  assistant_update: "assistant_update",
  tool_call_started: "tool_call_started",
  tool_call_output: "tool_call_output",
  file_change: "file_change",
  diff_summary: "diff_summary",
  validation_started: "validation_started",
  validation_completed: "validation_completed",
  rebuild_started: "rebuild_started",
  rebuild_completed: "rebuild_completed",
  rebuild_failed: "rebuild_failed",
  permission_decision: "permission_decision",
  approval_requested: "approval_requested",
  heartbeat: "heartbeat",
  error: "error",
  final_response: "final_response",
  session_completed: "session_completed",
  pause_requested: "pause_requested",
  paused: "paused",
  redirect_requested: "redirect_requested",
  redirect_applied: "redirect_applied",
  cancel_requested: "cancel_requested",
  canceled: "canceled",
};

const ACP_METHOD_KIND_MAP: Record<string, CodexBridgeEventKind> = {
  "session/started": "session_started",
  "assistant/update": "assistant_update",
  "tool/callStarted": "tool_call_started",
  "tool/callOutput": "tool_call_output",
  "file/changed": "file_change",
  "diff/summary": "diff_summary",
  "validation/started": "validation_started",
  "validation/completed": "validation_completed",
  "rebuild/started": "rebuild_started",
  "rebuild/completed": "rebuild_completed",
  "rebuild/failed": "rebuild_failed",
  "permission/decision": "permission_decision",
  "approval/requested": "approval_requested",
  "session/heartbeat": "heartbeat",
  "session/error": "error",
  "assistant/finalResponse": "final_response",
  "session/completed": "session_completed",
  "control/pauseRequested": "pause_requested",
  "control/paused": "paused",
  "control/redirectRequested": "redirect_requested",
  "control/redirectApplied": "redirect_applied",
  "control/cancelRequested": "cancel_requested",
  "control/canceled": "canceled",
};

function summarizeCodexCliEvent(
  event: FakeCodexCliStreamEvent,
  kind: CodexBridgeEventKind,
): string {
  return (
    event.summary ??
    event.message ??
    event.output ??
    event.error?.message ??
    `${event.source}:${kind}:${event.sequence}`
  );
}

function summarizeAcpEvent(event: FakeAcpStreamEvent, kind: CodexBridgeEventKind): string {
  return (
    event.params?.summary ??
    event.params?.message ??
    event.params?.output ??
    event.params?.error?.message ??
    `acp:${kind}:${event.sequence}`
  );
}

export function normalizeFakeCodexCliStreamEvent(
  event: FakeCodexCliStreamEvent,
): CodexBridgeNormalizedStreamEvent {
  const eventKind = CODEX_CLI_EVENT_KIND_MAP[event.type] ?? "error";
  return {
    eventKind,
    sourceProtocol: "codex_cli",
    sequence: event.sequence,
    occurredAt: event.timestamp,
    summary: summarizeCodexCliEvent(event, eventKind),
    data: boundDiagnosticJson({
      type: event.type,
      message: event.message,
      toolName: event.toolName,
      output: event.output,
      path: event.path,
      success: event.success,
      error: event.error,
      metadata: event.metadata,
    }),
    providerCallMade: false,
    liveExecutorCallMade: false,
  };
}

export function normalizeFakeAcpStreamEvent(
  event: FakeAcpStreamEvent,
): CodexBridgeNormalizedStreamEvent {
  const eventKind = ACP_METHOD_KIND_MAP[event.method] ?? "error";
  return {
    eventKind,
    sourceProtocol: "acp",
    sequence: event.sequence,
    occurredAt: event.timestamp,
    summary: summarizeAcpEvent(event, eventKind),
    data: boundDiagnosticJson({
      method: event.method,
      message: event.params?.message,
      toolName: event.params?.toolName,
      output: event.params?.output,
      path: event.params?.path,
      success: event.params?.success,
      error: event.params?.error,
      metadata: event.params?.metadata,
    }),
    providerCallMade: false,
    liveExecutorCallMade: false,
  };
}

export function normalizeCodexBridgeStreamEvent(
  event: RawCodexBridgeStreamEvent,
): CodexBridgeNormalizedStreamEvent {
  if ("source" in event) {
    return normalizeFakeCodexCliStreamEvent(event);
  }
  return normalizeFakeAcpStreamEvent(event);
}
