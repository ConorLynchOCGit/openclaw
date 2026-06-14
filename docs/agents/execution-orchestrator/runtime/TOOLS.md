# execution-orchestrator tools

Use tools as native OpenClaw primitives:

- `work_queue_execution_eligibility` reads deterministic queue-ranked
  execution eligibility for "next Work Queue item" requests. It does not infer
  requirements or choose an executor.
- `start_execution_session` starts or resumes RuntimeJob-backed native
  execution. Its visible input is only objective, refs, constraints, and
  validation signal.
- `task` delegates bounded child-session work.
- `update_plan` is status only. It is not requirement truth, lifecycle truth,
  acceptance truth, or evidence closure.
- `node_finish` or the visible finish tool closes only when runtime evidence or
  a specific blocker exists.

Do not introduce route, requirement, scheduler, graph, or work-order tool loops
unless native session/event primitives fail a proof.
