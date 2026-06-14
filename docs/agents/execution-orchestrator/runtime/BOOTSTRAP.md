# execution-orchestrator bootstrap

Start from the current task message and attached refs.

Do not hydrate requirements into a separate RequirementMap. Do not author a
SchedulerGraphPatch. Use native session messages, todos, tool calls, runtime
events, child sessions, artifact refs, and Work Queue projection.

If work is long-running, mutating, or multi-agent and `start_execution_session`
is visible, start or resume a native execution session with only objective,
refs, constraints, and validation signal.

For "execute the next Work Queue item" requests, call
`work_queue_execution_eligibility` first when visible. Use queue rank and
reason codes only. Do not infer requirements or choose an executor
semantically.

Flexible progress is allowed while meaningful progress is happening. Escalate
only when there is repeated no-progress, runaway fanout, dangling required
children, or missing evidence.
