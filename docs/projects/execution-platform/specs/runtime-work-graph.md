# Runtime Work Graph Spec

## Runtime Toolification Pre-Proof Gate

Runtime Work Graph execution must move from free-form decision JSON toward
explicit model-requested runtime tool operations before the next Product/Spec
Planning UX proof is considered meaningful.

The scheduler must split planning from execution:

- first run a decomposition/checkpoint phase.
- accept a graph with nodes, edges or explicit parallelism, role assignments,
  expected evidence, and commitment mappings.
- block implementation until that graph passes structural validation.

The orchestrator chooses capabilities through the cost-aware manifest, not by
defaulting to the strongest model. It must justify why a node is the cheapest
sufficiently capable next step for the commitment it advances, including
quality gain, cost, context-distribution value, role specialization,
parallelism, redundancy, and needed evidence.

Every node result must claim evidence against Mission Ledger commitment ids.
Generic artifacts do not close commitments by implication. Deterministic code
validates refs and storage flags; model-authored review judges sufficiency.

Kimi is treated as one implementation lane on the Non-Codex File-Edit Worker
Loop. It receives exact file refs, context handoff, edit objective,
patch/output contract, validation refs, and bounded repair turns. Broad
implementation falls to Codex/GPT 5.5 only after the orchestrator records why
cheaper or specialized nodes are unsuitable.

See `runtime-toolification-and-utility-scheduling.md` for the full pre-proof
sequence.

## Runtime Tool Trace Integration

Runtime Work Graph scheduling is now traceable through the Runtime Tool-Call
Kernel. In production gateway execution, the live `agent_team.coding` graph
runner receives a scheduler tool kernel from the gateway runtime. The
scheduler traces graph-control decisions and node execution as bounded
runtime-tool invocations.

Graph-control tool ids:

- `scheduler.decompose_mission`
- `scheduler.create_graph_node`
- `scheduler.create_graph_edge`
- `scheduler.accept_decomposition_graph`
- `scheduler.reject_decomposition_graph`
- `scheduler.select_next_node`
- `scheduler.request_human_decision`
- `scheduler.mark_needs_review`
- `scheduler.create_closeout_request`

Node execution is traced as `worker.invoke`, linked to runtime job id when
available, graph id, node id, assigned role, model/worker ref, node objective,
target refs, and bounded output/evidence refs.

The graph remains the execution orchestration structure. Tool traces are
runtime evidence and progress diagnostics. They do not replace graph state,
Mission Ledger commitments, or runtime job lifecycle truth. Work Queue active
graph readback surfaces scheduler phase, latest tool id, and runtime-tool
invocation refs so owner UI can show what the scheduler is doing.

## Product/Spec Planning Scheduler Policy

Runtime Work Graph scheduler is the execution surface for `agent_team.product_spec_planning`.

Product/Spec Planning graph policy:

- the first executable Product/Spec Planning node is `planning_orchestrator`
- initial decomposition may add multiple purposeful nodes and handoff/dependency edges, but `runAfterAdd` must target the planning orchestrator until it has started
- non-planning child nodes such as `web_research`, `planning_capsule`, `human_task`, `action_graph_compile`, `compiler`, and `closeout` must wait for planning-orchestrator evidence
- the scheduler records bounded progress and evidence refs; raw prompts, raw responses, provider logs, and Work Queue lifecycle mutation remain disallowed
