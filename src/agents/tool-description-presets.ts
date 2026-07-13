// Compact built-in summaries shown in tool inventories and model-facing tool
// descriptions when a longer contextual description is assembled elsewhere.
export const EXEC_TOOL_DISPLAY_SUMMARY = "Run shell now.";
export const PROCESS_TOOL_DISPLAY_SUMMARY = "Inspect/control exec sessions.";
export const CRON_TOOL_DISPLAY_SUMMARY = "Schedule reminders, cron, wake events.";
export const SESSIONS_LIST_TOOL_DISPLAY_SUMMARY = "List visible sessions; filters/previews.";
export const SESSIONS_HISTORY_TOOL_DISPLAY_SUMMARY = "Read sanitized session history.";
export const SESSIONS_SEND_TOOL_DISPLAY_SUMMARY = "Message session or configured agent.";
export const TASK_TOOL_DISPLAY_SUMMARY = "Run foreground subagent task.";
export const SESSIONS_SPAWN_TOOL_DISPLAY_SUMMARY = "Spawn subagent or ACP session.";
export const SESSIONS_SPAWN_SUBAGENT_TOOL_DISPLAY_SUMMARY = "Spawn subagent session.";
export const SESSION_STATUS_TOOL_DISPLAY_SUMMARY = "Show session status/model/usage.";
export const UPDATE_PLAN_TOOL_DISPLAY_SUMMARY = "Track short work plan.";

/** Describes the sessions_list tool for model-facing instructions. */
export function describeSessionsListTool(): string {
  return [
    "List visible sessions; filter by kind, label, agentId, search, activity.",
    "Use before sessions_history or sessions_send target selection.",
  ].join(" ");
}

/** Describes the sessions_history tool for model-facing instructions. */
export function describeSessionsHistoryTool(): string {
  return [
    "Fetch sanitized history for visible session.",
    "For openclaw-transcript://...#message:<id> exact refs, pass the full ref as ref/transcriptRef/messageRef; do not strip it to sessionKey.",
    "A spawned child may read its persisted direct parent's full transcript by the parent session key or the exact openclaw-transcript://...#session ref supplied in Subagent Context; unrelated sessions remain subject to normal visibility policy.",
    "Use for bounded recovery/readback after a terminal child event, timeout/cancel partial output, compaction/resume, operator audit, or result-ref verification.",
    "Do not poll active children with sessions_history; native completion delivery is the normal handoff.",
  ].join(" ");
}

/** Describes the sessions_send tool for model-facing instructions. */
export function describeSessionsSendTool(): string {
  return [
    "Send message to visible session by sessionKey/label, or configured agent by agentId; sessionKey wins when redundant label metadata is present.",
    "When continuing an existing owner episode with the current operator turn, send that operator message unchanged; do not wrap it in restated task instructions.",
    "Thread-scoped chats rejected; target parent channel session.",
    "Creates missing configured-agent main session; waits for reply when available.",
  ].join(" ");
}

/** Describes the task tool for model-facing instructions. */
export function describeTaskTool(): string {
  return [
    "Run one target OpenClaw subagent as a foreground child task and return its final result here.",
    "Use when you own final synthesis and need source-scout, review, or bounded specialist decision material.",
    "For independent lanes, call task multiple times in the same assistant turn so they can run in parallel.",
    "Do not call sessions_yield after task; task returns a small child result or exact native child-result receipt/pointers as the tool result.",
  ].join(" ");
}

/** Describes the sessions_spawn tool for model-facing instructions. */
export function describeSessionsSpawnTool(options?: {
  acpAvailable?: boolean;
  threadAvailable?: boolean;
}): string {
  const runtimeDescription =
    options?.acpAvailable === false
      ? 'Spawn clean child session; default `runtime="subagent"`.'
      : 'Spawn clean child session; default `runtime="subagent"`; set `runtime="acp"` explicitly for ACP.';
  const baseDescription = [
    runtimeDescription,
    options?.threadAvailable
      ? '`mode="run"` one-shot; `mode="session"` persistent/thread-bound, only when requester channel supports thread bindings.'
      : '`mode="run"` one-shot background work.',
    "Subagents inherit parent workspace.",
    "Native subagents get task in first visible `[Subagent Task]` message.",
    'Native only: `context="fork"` only when child needs current transcript; else omit or `isolated`.',
    "Set `agentId` when policy requires an explicit target or when the child role matters; use `agents_list` first if unsure.",
    "For planning/research child work, ask for useful evidence/context, caveats, and source/result refs.",
    "Use for fresh child-session work.",
  ];
  if (options?.acpAvailable === false) {
    return baseDescription.join(" ");
  }
  return [
    ...baseDescription.slice(0, 3),
    '`runtime="acp"` for ACP harness ids: codex, claude, gemini, opencode, or agent ACP runtime config.',
    ...baseDescription.slice(3),
  ].join(" ");
}

/** Describes the session_status tool for model-facing instructions. */
export function describeSessionStatusTool(): string {
  return [
    "Show /status-like card for current/visible session: model, usage, time, cost, tasks.",
    'Use `sessionKey="current"` for current session; UI labels like `openclaw-tui` are not keys.',
    "`model` sets session override; `model=default` resets.",
    "Use for active model/session config questions.",
  ].join(" ");
}

/** Describes the update_plan tool for model-facing instructions. */
export function describeUpdatePlanTool(): string {
  return [
    "Update current run plan.",
    "Use for non-trivial multi-step work; keep plan current while executing.",
    "Short steps; max one `in_progress`; skip for simple one-step work.",
  ].join(" ");
}
