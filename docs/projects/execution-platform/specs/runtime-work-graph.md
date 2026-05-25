# Runtime Work Graph Spec

## Canonical Engine Direction

Runtime Work Graph is the durable graph substrate for every production
workflow. The scheduler should become or be wrapped by a workflow-agnostic
`RuntimeWorkflowGraphEngine`.

The engine coordinates graph execution, but individual graph nodes are still
executed by agents, worker adapters, runtime tools, or human task adapters.
The engine decides when to call them, records their bounded evidence, updates
Mission Ledger state, and gates closeout readiness.

Workflow-specific policy belongs in a `WorkflowDefinition` plugin:

- node kinds.
- executor keys.
- role coverage profile.
- capability subset.
- model/worker policy.
- evidence claim profile.
- human task policy.
- closeout policy.
- Work Queue projection policy.

`DynamicAgentTeamGraphRunner` should be decomposed into the
`agent_team.coding` workflow plugin. The deleted generic workflow queued
runner must not return as a production, migration, or proof completion path
for workflows that lack graph execution.

See `canonical-workflow-runtime-architecture.md`.

## Executor Workflow Versus Target Subject

Runtime graph creation consumes the Intent Front Door's split routing contract.
The graph's workflow definition is selected from `executorWorkflowId`; target
workflow surfaces named in `subjectWorkflowIds` or `targetSubjectRefs` are
ordinary bounded subject refs unless a later compiler/authority boundary turns
them into child work.

Implications:

- a coding-team graph may implement, test, document, or review another
  workflow surface without executing that target workflow.
- Product/Spec Planning can remain the subject of a coding implementation
  prompt until the Product/Spec workflow is actually invoked for planning.
- graph node capability checks use `requestedCapabilities`, not keyword
  matching against prompt text.
- constraints travel with the Mission Ledger and compile boundaries rather
  than blocking route selection through regex or semantic forests.

This prevents the scheduler from trying to execute an incomplete target
workflow when the owner asked to build or wire that workflow.

## Runtime Toolification Pre-Proof Gate

Runtime Work Graph execution must move from free-form decision JSON toward
explicit model-requested runtime tool operations before the next Product/Spec
Planning UX proof is considered meaningful.

The latest Product/Spec Planning proof attempts showed that the previous
"single decomposition decision" still asked the orchestrator to satisfy too
many constraints at once. Trace emission around that decision is not enough.
The production scheduler must split graph creation into staged runtime tools:

1. Mission Ledger.
2. Work breakdown.
3. Capability selection.
4. Node contract definition.
5. Edge or parallelism definition.
6. Runtime graph compilation.
7. Model-authored structure review.
8. Runtime validation/acceptance.
9. First-node execution.

The model supplies work units, rationale, capability choices, human-readable
expected outputs, success criteria, and downstream consumers. Runtime compiles
node ids, node kinds, executor keys, worker refs, expected-evidence enums,
storage flags, authority flags, and Work Queue child refs from canonical
sources.

Implementation remains blocked until the staged graph passes structural
validation and review. A complex mission cannot begin with a broad
implementation node or with fallback-injected static graph nodes.

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

See `maximum-toolification-architecture.md` and
`runtime-toolification-and-utility-scheduling.md` for the full pre-proof
sequence.

## Runtime Tool Trace Integration

Runtime Work Graph scheduling is now traceable through the Runtime Tool-Call
Kernel. In production gateway execution, the live `agent_team.coding` graph
runner receives a scheduler tool kernel from the gateway runtime. The
scheduler traces graph-control decisions and node execution as bounded
runtime-tool invocations.

## Runtime Task Budget Policy

Runtime Work Graph scheduler nodes receive explicit runtime task budgets
derived from workflow id, node role, selected capability, and node complexity.
The scheduler must not let Product/Spec-class or other long-running nodes
inherit a short default tool timeout.

Budget policy classes:

- `tiny`
- `standard`
- `complex`
- `long_running`

The policy feeds:

- scheduler runtime tool timeout.
- model-call timeout.
- worker-loop turn timeout.
- validation-command timeout.
- progress emission interval.
- stale-progress window.
- lease timeout.
- lease heartbeat interval.
- owner-facing active readback.

For `agent_team.product_spec_planning`, the planning-orchestrator class of
work is `long_running` and carries a one-hour runtime tool/model-call timeout.
Work Queue active graph progress must surface the budget policy ref, class,
timeout windows, progress/stale windows, lease/heartbeat windows, elapsed
time, remaining budget, and heartbeat state while the node is in flight.

Timeouts are Runtime Tool-Call Kernel evidence. A timeout/abort is recorded as
bounded failed tool evidence with reason codes such as
`runtime_tool_timeout`; it does not count as process success.

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

## Work Queue Child Materialization

Every production graph node that should be owner-visible must materialize as a
generated Work Queue child with explicit origin and terminal policy. The graph
state remains orchestration truth; the child item is readback/control state.

Required child metadata:

- origin kind, normally `runtime_graph_child`
- parent Work Queue item id
- graph id and node id
- runtime job id when available
- capability id, executor key, role/model refs when available
- evidence refs and commitment ids
- terminal policy
- raw-storage flags

Proof diagnostics and middleware fixtures are generated items too, but they
must be debug-only and excluded from default active queue readback after their
parent proof closes. See `work-queue-generated-item-lifecycle.md`.

## Product/Spec Planning Scheduler Policy

Runtime Work Graph scheduler is the execution surface for `agent_team.product_spec_planning`.

Product/Spec Planning graph policy:

- `agent_team.product_spec_planning` must resolve a production workflow
  definition and `workflow-plugin.agent_team.product_spec_planning.v1` before
  production graph execution.
- scheduler readiness requires executor-key coverage for planner, research,
  capsule, human decision, action proposal, compiler, and closeout nodes.
- the first executable Product/Spec Planning node is `planning_orchestrator`
- initial decomposition may add multiple purposeful nodes and handoff/dependency edges, but `runAfterAdd` must target the planning orchestrator until it has started
- non-planning child nodes such as `web_research`, `planning_capsule`, `human_task`, `action_graph_compile`, `compiler`, and `closeout` must wait for planning-orchestrator evidence
- the scheduler records bounded progress and evidence refs; raw prompts, raw responses, provider logs, and Work Queue lifecycle mutation remain disallowed
- scheduler progress must emit bounded `RuntimeExecutionSpan` refs for
  scheduler decisions, model calls, graph nodes, worker/tool phases,
  validation commands, boundary replay checkpoints, and closeout finalization
  so operator readback can identify the active span, blocker, and next action
  without raw runtime logs.
- action graph proposals and compile-readiness outputs are planning artifacts
  only; they do not execute child actions or create child runtime jobs without
  a later compile/authority boundary.
- Work Queue readback should preserve explicit refs proving workflow
  registration, executable capability/node mappings, planning-orchestrator
  first execution, and action graph compile-readiness validation so those
  production commitments can be reviewed without raw runtime logs.

## Scheduler-First Context Supply

Runtime Work Graph distinguishes between work-intent nodes and executable
worker nodes for complex coding-team missions.

The scheduler may create high-level implementation groups from accepted
Commitment Work Packets, but those groups are not executable implementation
nodes until context supply has produced accepted implementation task packets.
Post-context compilation owns the transition:

1. draft work-intent node.
2. node-scoped context scout.
3. `ImplementationTaskPacket` compilation.
4. executable implementation/test/docs/readback node creation.
5. validation, review, closeout.

Runtime must block provider invocation when an implementation-bearing node has
only directory-level target refs, missing file snapshots, missing explicit
new-file intent, missing validation refs, or missing evidence expectations.
The block is upstream context/task-compilation evidence, not a worker failure.

See `scheduler-first-node-scoped-context-supply.md` and
`post-context-implementation-task-compiler.md`.

For complex implementation workflows, Runtime Work Graph now treats
Commitment Work Packets as the input to draft work graph creation, not as the
input to mandatory context-scout fanout. The scheduler first compiles
work-intent nodes from accepted packets. Runtime then creates context-scout
requests for those draft nodes and runs them in parallel.

This prevents high-level commitments from being mistaken for executable work
units. Context scout receives the concrete draft node objective, mapped packet
refs, context questions, expected output, downstream consumer, and readiness
requirements. Implementation stays blocked until the node-scoped scout
produces resolved target refs, snapshots or explicit new-file intent,
validation refs or discovery plan, and a bounded handoff summary.

Global context synthesis is optional. It is triggered only when scout outputs
need cross-node coordination, such as overlapping file ownership, conflicting
recommendations, shared API/schema dependencies, integration ordering, or
validation-plan conflicts. Runtime may perform deterministic ref merge/dedupe
before asking the model for semantic synthesis.

## Runtime Node Readiness And Transition Engine

Runtime Work Graph must now treat graph acceptance, dependency readiness,
context readiness, resource readiness, and worker executability as separate
runtime states.

The latest Product/Spec proof showed that the scheduler can still accept a
work graph and immediately approve an `implementation` node while the
`context_supply` gate is waiting. That is invalid for every workflow, not only
Product/Spec Planning. Graph acceptance proves that the planned work shape is
valid; it does not prove that any worker can execute a node.

Production graph execution therefore requires a generic transition engine:

1. accept graph.
2. evaluate dependency-ready frontier.
3. evaluate each node's lifecycle/readiness state.
4. validate capability execution preconditions.
5. create prerequisite context/research/human/resource/validation nodes when
   required.
6. compile `NodeExecutionPacket` and domain resource packets.
7. open an executable frontier only for nodes whose preconditions are ready.
8. run executable nodes through registered executors.
9. update Mission Ledger evidence and node readiness.

`scheduler.approve_and_run_first_node` must not be a production bypass around
this transition engine. It may survive only as a compatibility alias for
`scheduler.open_executable_frontier`, and must fail closed when the requested
node is not executable.

The transition engine is defined in
`runtime-node-readiness-transition-engine.md`. It extends the existing
resource-materialization contract by making it impossible for scheduler graph
acceptance or context freshness to skip the `NodeExecutionPacket` and
capability-precondition gates.

The old mandatory path
`commitment packets -> context scout per commitment -> global synthesis -> scheduler graph`
is retired from production defaults. It may remain only as an explicitly
labeled diagnostic or workflow-definition-specific exception.

See `scheduler-first-node-scoped-context-supply.md`.

## Demand-Driven Frontier Context

The current target is no longer "finish all context before execution." That
shape creates large upfront fanout, all-or-nothing context phases, and
artifact/progress bloat before a worker can produce useful evidence.

Runtime Work Graph should run a ready frontier while acquiring missing
context/resources lazily per branch:

1. accept a coarse work-intent graph.
2. evaluate `NodeReadinessState` for each candidate frontier node.
3. open nodes whose dependencies, resources, authority, and context are ready.
4. let non-ready implementation nodes request context/resources through a
   runtime-owned context broker.
5. continue executing unrelated ready siblings in parallel.
6. block edits and other side effects until the requesting node becomes
   executable.

Implementation-bearing nodes may inspect their task packet, request missing
context, produce an edit plan, and classify readiness gaps. They may not make
file edits or claim success until target refs, file snapshots or explicit
new-file intent, validation refs, authority bounds, and context limitations
are resolved for that exact node.

Large graph mutations are persisted as payload-backed graph patches. Scheduler
progress metadata carries graph-patch refs, counts, hashes, bounded samples,
and latest-run-state pointers only. Full node arrays, edge arrays, task
packets, context packets, file snapshots, validation bodies, and worker
outputs must stay in payload artifacts.

See `demand-driven-frontier-orchestration-and-context-broker.md`.

## Commitment Work Packets And Child Handoff Contracts

Mission Ledger commitments are now compiled into bounded
`CommitmentWorkPacket` objects before scheduler child delegation. These
packets are runtime-owned work inputs derived from ledger structure, not
model-invented executor schema. Each packet carries commitment id, owner
intent summary, acceptance criteria, remaining work, explicit non-goals,
runtime evidence descriptions, and raw-storage flags.

Child worker handoffs use typed packets:

- `CommitmentWorkPacket`: scheduler/orchestrator input for deciding useful
  child nodes.
- `ContextHandoffPacket`: context-scout output for downstream implementation,
  including relevant file refs, recommended edit points, risks, validation
  suggestions, and limitations.
- `ImplementationTaskPacket v3`: post-context implementation-worker input
  for Kimi, Qwen, Codex escalation, docs, test, or other file-edit workers.
  It is compiled from work-intent node plus accepted node-scoped context and
  includes exact edit objective, concrete target files or explicit new-file
  intent, file snapshots, allowed scope, context packet refs, validation refs,
  expected patch shape, evidence expectations, acceptance criteria, and
  commitment ids.

Runtime code validates packet shape, refs, bounds, and storage flags. The
model still judges which work matters, whether context is useful, and whether
evidence satisfies commitments.

Graph edges must reference known nodes. Symbolic future milestones can be
recorded as edge metadata with null DB node foreign keys; unknown accidental
node ids are rejected before DB write and before a successful
`scheduler.create_graph_edge` trace is recorded. This prevents false-positive
tool traces when graph structure has not actually persisted.

## Parallel Frontier And Resource Boundary Invariants

Scheduler supersteps may execute multiple independent frontier nodes, but the
frontier is not a single all-or-nothing worker call. Each branch must produce
a branch-level result with node id, capability id, target commitments,
readiness state, evidence refs, and failure classification. One branch
failure must not hide sibling evidence or collapse the adapter into an
unclassified worker failure.

Resource materialization is part of scheduler readiness, not worker
execution. Domain packet compilers must safe-return structured outcomes such
as `accepted`, `split_required`, `context_repair_required`, or
`needs_review`. Packet schema/bounds errors must carry exact paths and bound
values into Work Queue readback; they must not throw into provider/model
adapters.

Context repair and acquisition nodes created after a blocker must have
consumer edges or diagnostic-only lifecycle. A zero-consumer context node
cannot unlock implementation readiness.

Context handoffs marked `accepted_with_limitations` are executable only when
the limitation is explicitly nonblocking for the exact downstream consumer.
Runtime-supplied verified refs are limitation evidence, not clean success.

The detailed pre-proof blocker is
`parallel-frontier-resource-boundary-hardening.md`.

## Split-Required Resource Materialization

Runtime Work Graph must treat `split_required` as a graph transition, not a
blocked worker result.

When resource materialization proves that a work-intent or implementation
parent node is too broad for one bounded `NodeExecutionPacket`, the scheduler
must:

1. store split task packets as payload-backed artifacts;
2. mark the parent node as aggregate/non-runnable;
3. compile child executable nodes from the split packets;
4. create dependency/handoff edges from parent/context to children and from
   children to rollup/validation/review consumers;
5. materialize generated Work Queue children for the new graph nodes;
6. evaluate `NodeReadinessState` for each child;
7. open only ready children into the executable frontier.

The parent cannot be retried as the same runnable implementation node after a
successful split-required result. Repeated
`resources_required -> materialization_blocked` loops on the same parent with
no child creation are classified as
`split_required_transition_not_applied`.

This transition is generic. Coding implementation is the immediate
Product/Spec proof case, but the same graph behavior applies to any future
workflow where a planned node expands into multiple executable resource
packets.

See `split-required-resource-materialization-transition.md`.

## Pre-Proof Progress Readback Requirements

Long Product/Spec proof runs must emit and project enough bounded progress for
the operator to diagnose the active layer without raw transcripts.

Runtime Work Graph progress requirements:

- active-node progress is node-first. Later bookkeeping events such as Work
  Queue child sync must not hide the current node objective, why the node was
  selected, model/worker ref, target refs, expected output, or cost-aware
  rationale.
- Mission Ledger commitments must be visible with commitment id, status,
  commitment text, why it matters, expected evidence description, accepted
  evidence refs, validation refs, and remaining work.
- `CommitmentWorkPacket` summaries are projected as bounded refs: packet ref,
  commitment id, expected evidence kinds, acceptance criteria count, and
  likely repo areas.
- role invocation completion progress carries model ref, provider path,
  target refs, acceptance criteria, produced evidence refs, and ELI5 progress.
- validation node progress carries validation task packet refs, approved
  command refs, command summaries, current command ref/status, validation
  result refs, failure classification refs, failure-to-commitment refs, repair
  plan refs, repair node refs, repair handoff refs, accepted evidence packet
  refs, blocking commitment ids, and raw command log false flags.
- repair classification progress carries latest classification ref, failure
  class, failed boundary, selected repair boundary, repair strategy, failed
  span/tool refs, affected commitment ids, failed field paths, reason codes,
  semantic-review requirement, and expected next action. A needs-review node
  cannot be retried in production unless this classification exists and
  permits repair.
- direct replay harnesses used for pre-UX diagnosis must stream periodic
  bounded progress snapshots while the worker is running, including runtime
  job state, graph status, node/edge counts, active nodes, latest scheduler
  phase, Mission Ledger gate, and open blocking commitments.

These are readback and diagnostic requirements only. They do not create
runtime success, mutate Work Queue lifecycle, or replace model-authored
closeout and Mission Ledger commitment evidence closure.

## Generic Node Result Contract

Runtime graph node execution is now checked through a workflow-agnostic result
contract before node success can be accepted.

Required properties:

- workflow id, graph id, node id, node kind, role class, and capability id
  where available.
- bounded output artifact refs, context handoff refs, validation refs,
  changed-file refs, human-decision refs, limitations, and reason codes.
- evidence claims mapped to Mission Ledger commitment ids.
- raw prompt, raw response, raw provider log, raw tool log, and Work Queue
  lifecycle mutation flags set to false.

Deterministic validation rejects malformed refs, unknown commitment ids, raw
storage flags, and lifecycle mutation. It does not decide whether the evidence
is semantically good enough; that remains the Mission Ledger evaluator and
model-authored review boundary.

The same contract is intended for coding, research, docs/skills, QA,
architecture, Product/Spec Planning, design, marketing, and human-task nodes.
