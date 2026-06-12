export const EXEC_TOOL_DISPLAY_SUMMARY = "Run shell commands that start now.";
export const PROCESS_TOOL_DISPLAY_SUMMARY = "Inspect and control running exec sessions.";
export const CRON_TOOL_DISPLAY_SUMMARY = "Schedule cron jobs, reminders, and wake events.";
export const SESSIONS_LIST_TOOL_DISPLAY_SUMMARY =
  "List visible sessions and optional recent messages.";
export const SESSIONS_HISTORY_TOOL_DISPLAY_SUMMARY =
  "Read sanitized message history for a visible session.";
export const SESSIONS_SEND_TOOL_DISPLAY_SUMMARY =
  "Send a message to another visible session; mandatory lane for delegated comparative web research.";
export const SESSIONS_SPAWN_TOOL_DISPLAY_SUMMARY = "Spawn sub-agent or ACP sessions.";
export const SESSION_STATUS_TOOL_DISPLAY_SUMMARY =
  "Show session status, usage, model state, and current or recent task state.";
export const UPDATE_PLAN_TOOL_DISPLAY_SUMMARY = "Track lightweight todo state.";
export const READ_TODO_TOOL_DISPLAY_SUMMARY = "Read the current structured work plan.";

export function describeSessionsListTool(): string {
  return [
    "List visible sessions with optional filters for kind, recent activity, and last messages.",
    "Use this to discover a target session before calling sessions_history or sessions_send.",
  ].join(" ");
}

export function describeSessionsHistoryTool(): string {
  return [
    "Fetch sanitized message history for a visible session.",
    "Supports limits and optional tool messages; use this to inspect another session before replying, debugging, or resuming work.",
  ].join(" ");
}

export function describeSessionsSendTool(): string {
  return [
    "Send a message into another visible session by sessionKey or label.",
    "Use this to delegate follow-up work to an existing session; waits for the target run and returns the updated assistant reply when available.",
    "For comparative or multi-source public-web research, use this to delegate the external collection step to canonical agent:web-researcher:main instead of browsing inline from Main.",
    "When that canonical lane exists, treat sessions_send as the required path for the external comparison step rather than an optional alternative to inline web_fetch or web_search.",
    "If the prompt is a sourced external comparison across sites, pages, or vendors, using inline web_search or web_fetch instead of sessions_send is the wrong route unless the delegated lane is unavailable.",
  ].join(" ");
}

export function describeSessionsSpawnTool(): string {
  return [
    'Spawn an isolated session with `runtime="subagent"` or `runtime="acp"`.',
    '`mode="run"` is one-shot and `mode="session"` is persistent or thread-bound.',
    "Subagents inherit the parent workspace directory automatically.",
    "Use this when the work should happen in a fresh child session instead of the current one.",
  ].join(" ");
}

export function describeSessionStatusTool(): string {
  return [
    "Show a /status-equivalent session status card for the current or another visible session, including usage, time, cost when available, and linked background task context.",
    "Optional `model` sets a per-session model override; `model=default` resets overrides.",
    "Use this for questions like what model is active, how a session is configured, or whether recent work is still running.",
    "For short follow-ups like `Status?`, `still running?`, or progress checks after recent work, prefer this over answering from memory.",
    "When the returned task line already gives a bounded lifecycle label such as Queued, Working, Completed, Failed, or Timed out, preserve that state explicitly in the answer instead of paraphrasing it away.",
  ].join(" ");
}

export function describeUpdatePlanTool(): string {
  return [
    "Update the current lightweight todo board for this run.",
    "Use this for non-trivial work with distinct conceptual steps; skip it when tracking adds no value.",
    "Keep items short and update statuses as work changes.",
    "Todo is status only, not a workflow gate.",
  ].join(" ");
}

export function describeReadTodoTool(): string {
  return [
    "Read the current session-owned structured todo state.",
    "Use this after resume, compaction, or uncertainty about which todo items are pending, in progress, or completed.",
    "This tool only reads the current session todo; it cannot select another session and it never creates todo state.",
  ].join(" ");
}
