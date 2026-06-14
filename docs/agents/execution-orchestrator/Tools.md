# Execution Orchestrator Tools

## Preferred Tools

Expected tool families:

- `work_queue_execution_eligibility`: read deterministic Work Queue execution
  eligibility before starting "next item" work. Use queue rank and exclusion
  reason codes only.
- `start_execution_session`: start or resume RuntimeJob-backed native execution
  from objective, refs, constraints, and validation signal.
- `task`: delegate bounded child-session work.
- `update_plan` and `read_todo`: track session-local progress status.
- `agents_list`: inspect available specialist agents when needed.
- `session_status`: inspect native session status when needed.
- `node_finish` or the visible execution finish tool: close with runtime-owned
  evidence attachment.

## Constraints

Tool descriptions define exact schemas. Do not infer hidden tools.

Do not use mutation tools unless the current envelope and visible tool policy explicitly permit them.
