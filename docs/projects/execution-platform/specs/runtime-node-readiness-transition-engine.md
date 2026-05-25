# Runtime Node Readiness And Transition Engine

Date: 2026-05-21

Status: implemented and focused-proof passed. This spec remains the
source-of-truth contract for generic node transition readiness before the
Product/Spec proof and future workflow plugins.

2026-05-21 follow-on: transition readiness now correctly blocks workers
until context/resource preconditions are satisfied, but the latest proof
showed the context-supply node itself needs resource materialization. See
`context-scout-execution-packet-and-request-context-repair.md` for the next
P0 context-scout packet and request-context repair compiler.

Implementation refs:

- `extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts`
- `extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts`
- `extensions/execution-platform/src/workflows/runtime-node-capability-registry.ts`
- `extensions/execution-platform/src/workflows/node-resource-materialization.ts`
- `scripts/execution-platform-run-runtime-node-readiness-transition-proof.mjs`
- `.artifacts/execution-platform/runtime-node-readiness-transition/proof.json`

## Problem

The latest Product/Spec Planning production proof reached the front door,
Mission Ledger, Commitment Work Packets, scheduler graph creation, graph-node
Work Queue child materialization, and scheduler tool tracing. It failed before
implementation because the scheduler accepted a graph and approved an
`implementation` node while the first open proof gate remained
`context_supply`.

Observed runtime evidence:

- runtime job: `native-exec-eb9bbce0b5e01416`
- graph: `team-run-native-exec-eb9bbce0b5e01416-runtime-work-graph`
- graph status: `running`
- node count: 8
- edge count: 7
- role invocation count: 0
- first open gate: `context_supply`
- context accepted target count: 0
- context missing target count: 5
- dedicated context node count: 0
- broad context node count: 0
- approved first node:
  `g-8f66b09a8c-implementation-wu_workflow_definition_and_registration`
- terminal reason codes:
  `worker_adapter_threw`, `worker_adapter_threw:unclassified`

The system treated graph acceptance as execution readiness. That is the
architectural bug. The accepted graph was a work-intent graph; it was not yet
an executable worker graph.

This is not a Product/Spec-specific edge case. Any workflow can create a
semantically reasonable plan whose nodes still lack the resources needed for
execution. A general-purpose orchestrator must separate:

- accepted planning graph.
- dependency frontier.
- context readiness.
- resource materialization readiness.
- worker executability.
- validation readiness.
- closeout readiness.

## First Principles

1. Runtime jobs own lifecycle.
2. Runtime Work Graph owns orchestration state.
3. Workflow definitions own workflow policy.
4. Capabilities declare execution preconditions.
5. Models author intent, rationale, sufficiency judgment, and repair intent.
6. Runtime owns schema, refs, ids, storage, authority, resource packets,
   lifecycle transitions, tool execution, and worker invocation.
7. Graph acceptance does not imply node executability.
8. Context freshness does not imply resource readiness.
9. Resource readiness does not imply validation or closeout readiness.
10. Worker adapters must not see a node until the node has passed the
    required transition gates for that node's capability and workflow.
11. A missing precondition is scheduler evidence, not an unclassified worker
    failure.
12. Work Queue readback must show the active transition, blocker, and next
    allowed transition without raw prompts, raw responses, raw provider logs,
    raw tool logs, raw command logs, raw DB rows, secrets, or hidden
    reasoning.

## Core Concept

Introduce a production `RuntimeNodeReadinessTransitionEngine`.

The transition engine sits between scheduler graph acceptance and node
execution. It evaluates the current graph frontier, checks each node against
workflow/capability/resource preconditions, materializes missing prerequisite
nodes or packets when runtime can do so, asks the model only for semantic
repair intent when judgment is needed, and promotes only ready nodes into the
executable frontier.

The engine is generic. Product/Spec Planning is the immediate proof case, but
the contract must support coding, research, docs, QA, architecture, planning,
design, marketing, memory, proactivity, validation, human task, and closeout
workflows.

## Lifecycle State Machine

Every graph node must have one canonical readiness state.

Canonical node lifecycle:

1. `work_intent`
   - The node represents intended work. It may have commitment mappings,
     objective, capability intent, likely refs, context questions, and
     downstream consumer.
   - It is not executable.
2. `context_required`
   - The node needs context before resources can be materialized.
   - The transition engine must create or select context-supply work.
3. `context_in_progress`
   - Context scout, research, memory retrieval, prompt excerpt, or human
     clarification is running.
4. `context_ready`
   - Context evidence is accepted for this node, including any limitations.
   - Limitations must be classified as blocking or nonblocking per node.
5. `resources_required`
   - The node needs a domain resource packet before execution.
6. `resource_materialization_in_progress`
   - Runtime tools are resolving refs, snapshots, hashes, source material,
     validation refs, authority, and storage policy.
7. `resources_ready`
   - A `NodeExecutionPacket` and domain resource packet are ready for this
     node.
8. `executable`
   - Dependencies and resource preconditions are satisfied. The node can enter
     the executable frontier.
9. `running`
   - A worker, tool, model, script, DB operation, or human task adapter is
     executing the node.
10. `completed`
    - Node produced accepted bounded evidence.
11. `needs_repair`
    - Node or precondition produced recoverable structured evidence that can
      be repaired by scheduler/runtime/model.
12. `needs_review`
    - Runtime cannot safely advance without operator/model review.
13. `failed`
    - Failure is unrecoverable under declared authority/budget/policy.
14. `canceled`
    - Execution was explicitly canceled or aborted.

`NodeReadinessState` remains the canonical state object. This spec extends
its use from a pre-worker blocker to the scheduler's general transition
source of truth.

## Graph Object Classes

The graph may contain multiple node classes. The runtime must not blur them.

### Work-Intent Node

A work-intent node is a planned unit of work. It may be created by the
orchestrator's decomposition, by a workflow plugin, or by runtime repair.

It may contain:

- objective.
- commitment ids.
- source packet refs.
- context questions.
- likely target refs.
- expected human-readable output.
- acceptance criteria.
- downstream consumer.
- capability intent.
- cost/quality rationale.
- dependency rationale.

It cannot:

- invoke an implementation worker.
- execute validation.
- claim commitment closure.
- count as closeout evidence.

### Prerequisite Node

A prerequisite node exists to make another node executable.

Examples:

- context scout for coding.
- web research for planning.
- memory retrieval/context pack assembly.
- human decision.
- source prompt excerpt request.
- resource materialization.
- validation plan compilation.

Prerequisite nodes must carry `targetWorkNodeId` or equivalent downstream
consumer refs.

### Executable Node

An executable node is created or promoted only after required context and
resource preconditions are met.

It must have:

- valid capability id.
- valid executor key.
- valid worker/tool/human adapter ref.
- workflow-approved node kind.
- ready `NodeExecutionPacket` when the workflow/capability requires one.
- domain resource packet ref.
- dependency readiness.
- authority and storage policy.
- budget policy.
- evidence claim expectations.

### Barrier Node

A barrier node joins or coordinates sibling outputs. It is not a substitute
for per-node readiness.

Examples:

- context synthesis.
- integration planning.
- validation aggregation.
- completion review.

Barrier nodes run only when their inbound dependencies are satisfied. A
barrier that should happen before implementation must have edges that enforce
that order.

## Capability Execution Preconditions

Capabilities must declare their execution preconditions in the capability
manifest. The model can see the human-readable intent. Runtime enforces the
canonical fields.

Required capability precondition fields:

- `capabilityId`
- `graphNodeKind`
- `executorKey`
- `workerRef`
- `roleClass`
- `validLifecyclePhases`
- `requiresContext`
- `requiredContextKinds`
- `requiredResourcePacketKind`
- `requiredNodeExecutionPacket`
- `requiredSnapshotKinds`
- `requiredValidationKinds`
- `requiredAuthorityScopes`
- `requiredEvidenceClaimKinds`
- `canRunAsWorkIntent`
- `canRunAsExecutable`
- `defaultRepairTransition`
- `defaultBlockedTransition`
- `budgetPolicyRef`
- `parallelismPolicyRef`

Examples:

- `implementation_microtask`
  - can run as work intent: false
  - can run as executable: true
  - requires context: true
  - required resource packet: `coding_resource_packet`
  - required snapshots: target file snapshots or new-file parent snapshots
  - default repair transition: `request_node_scoped_context`
- `context_scout`
  - can run as work intent: false
  - can run as executable: true
  - required resource packet: `context_supply_request_packet`
  - default repair transition: `ask_context_question_or_needs_review`
- `planning_orchestrator`
  - required resource packet: `planning_input_packet`
  - default repair transition: `compile_planning_input_packet`
- `web_research`
  - required resource packet: `research_request_packet`
  - default repair transition: `compile_research_scope`
- `human_task`
  - required resource packet: `human_decision_packet`
  - default repair transition: `compile_human_decision_prompt`
- `closeout`
  - required resource packet: `closeout_evidence_packet`
  - default repair transition: `collect_missing_evidence_or_needs_review`

This makes the scheduler general: it does not need Product/Spec-specific
branching. It asks whether the selected node's capability preconditions are
met.

## Transition Tools

Add explicit scheduler/runtime tools for transition handling. These are
runtime operations with bounded traces; they are not free-form graph JSON.

Required tools:

- `scheduler.evaluate_frontier_readiness`
  - Evaluates dependency-ready graph nodes and classifies each as executable,
    blocked, prerequisite-needed, or review-needed.
- `scheduler.open_executable_frontier`
  - Opens a frontier of nodes whose dependencies and readiness preconditions
    are satisfied.
- `scheduler.record_node_transition`
  - Records lifecycle transition evidence for a node.
- `scheduler.create_prerequisite_node`
  - Runtime-compiles context, research, human, resource, validation, or
    closeout prerequisite nodes.
- `scheduler.link_prerequisite_to_target`
  - Creates typed edges from prerequisites to target nodes.
- `scheduler.block_node_for_precondition`
  - Records missing preconditions without invoking a worker.
- `scheduler.promote_work_intent_to_executable`
  - Promotes or replaces a work-intent node with executable task nodes after
    resource packet readiness.
- `scheduler.request_transition_repair_intent`
  - Asks the model only for semantic repair intent when runtime cannot
    derive the next prerequisite deterministically.
- `scheduler.accept_transition_repair`
  - Accepts model-authored repair intent and lets runtime compile canonical
    graph/tool changes.
- `scheduler.reject_transition_repair`
  - Rejects invalid repair intent with field-specific diagnostics.

`scheduler.approve_and_run_first_node` should be retired from production
semantics or converted into a thin compatibility alias for
`scheduler.open_executable_frontier` that fails closed if the target node is
not already executable.

## Canonical Scheduler Flow

Production scheduler flow after graph creation:

1. Model/runtime produces an accepted work graph.
2. Runtime records graph acceptance.
3. Runtime invokes `scheduler.evaluate_frontier_readiness`.
4. For each candidate node:
   - validate dependency readiness.
   - validate lifecycle state.
   - validate capability preconditions.
   - validate required context state.
   - validate required resource packet state.
   - validate authority/storage/budget.
5. Runtime opens executable frontier only for ready nodes.
6. Runtime creates prerequisite nodes for nodes that are not ready but have a
   deterministic repair transition.
7. Runtime asks the model for semantic transition repair intent only when the
   correct prerequisite cannot be derived from workflow/capability policy.
8. Runtime runs executable frontier nodes with parallelism/conflict-domain
   policy.
9. Node results update Mission Ledger evidence and readiness states.
10. Runtime loops until success, human wait, needs_review, failure, or budget
    exhaustion.

No worker invocation may happen directly from graph acceptance.

## Context Supply Transition

For complex coding work, an implementation-bearing work-intent node that lacks
accepted node-scoped context transitions to `context_required`.

Runtime creates:

- a `context_scout` prerequisite node.
- a typed `context_supplies` edge from scout to target node.
- a context-supply request packet containing the target work node contract,
  packet refs, context questions, likely repo areas, source prompt refs,
  downstream consumer, stop-if-missing rules, and expected handoff.

The target node remains non-executable until context is accepted and resource
materialization succeeds.

For other workflows, the same pattern applies with different context kinds:

- planning uses planning input/research context.
- research uses bounded research scope and source policy.
- design uses design brief, asset refs, brand constraints, and target surface.
- marketing uses audience, claims, source facts, and channel constraints.
- memory uses memory retrieval intent and context-pack refs.
- QA uses validation target and command/result refs.

## Resource Materialization Transition

After context is ready, runtime enters `resources_required` or
`resource_materialization_in_progress`.

Runtime compiles a `NodeExecutionPacket` plus a domain resource packet.

Domain packet examples:

- `coding_resource_packet`
  - target file refs.
  - target file snapshots.
  - snapshot hashes.
  - edit scope.
  - validation refs.
  - expected patch shape.
- `research_request_packet`
  - research questions.
  - source policy.
  - date/staleness policy.
  - allowed search/fetch tools.
- `planning_input_packet`
  - objective.
  - constraints.
  - research refs.
  - capsule criteria.
  - decision needs.
- `human_decision_packet`
  - bounded prompt summary.
  - options/tradeoffs.
  - response schema.
  - resume refs.
- `validation_packet`
  - command refs.
  - target commitments.
  - failure classification policy.
- `closeout_evidence_packet`
  - Mission Ledger status.
  - evidence claim refs.
  - validation refs.
  - tool trace refs.
  - readback refs.

If resource materialization fails, the node does not execute. The scheduler
records a readiness blocker and creates a repair transition.

## Model Boundary

The model may author:

- why a node exists.
- what work it should accomplish.
- which commitments it advances.
- what context is semantically needed.
- whether a context packet is substantively sufficient.
- whether a work-intent node should split.
- whether a capability fit is good enough.
- repair intent for missing context or ambiguous structure.
- final sufficiency/closeout judgment.

Runtime must own:

- node ids.
- edge ids.
- executable node envelopes.
- executor keys.
- worker refs.
- snapshot refs and hashes.
- validation command refs.
- resource packet ids.
- evidence claim ids.
- storage flags.
- authority flags.
- lifecycle transitions.
- Work Queue child refs.
- runtime tool invocations.

This preserves the model-vs-runtime boundary that the platform has been
moving toward: model decides semantic meaning and sufficiency; runtime owns
execution substrate.

## Failure Semantics

The transition engine must classify blockers before workers run.

Missing or invalid preconditions produce structured runtime evidence:

- `node_context_required`
- `node_context_supply_missing`
- `node_context_supply_in_progress`
- `node_context_supply_rejected`
- `node_resource_packet_required`
- `node_execution_packet_missing`
- `node_execution_packet_not_ready`
- `node_dependency_not_satisfied`
- `node_capability_phase_invalid`
- `node_authority_scope_missing`
- `node_validation_refs_missing`
- `node_evidence_expectations_missing`

These are not worker failures.

Worker failures should be reserved for cases where:

- the node was executable.
- the worker was invoked.
- the worker/tool/model/script failed while executing its assigned task.

`worker_adapter_threw:unclassified` must not be reachable from missing
context/resource preconditions.

## Repair Semantics

Repair is transition-specific.

If context is missing:

- create node-scoped context scout.
- ask for bounded context repair intent only if runtime cannot derive the
  context request.

If resources are missing:

- compile resource packet.
- resolve refs.
- snapshot files/sources/assets.
- ask for semantic repair only when target meaning is ambiguous.

If dependencies are missing:

- wait for prerequisite nodes.
- repair edges if the graph is malformed.

If capability phase is invalid:

- select a valid prerequisite capability.
- block incompatible executable capability until prerequisites are satisfied.

If closeout is requested too early:

- collect missing evidence.
- run validation/review.
- terminalize needs_review if blocking commitments remain.

Repair attempts must cite:

- failed transition id.
- target node id.
- failed precondition path.
- valid next transitions.
- preserved fields.
- bounded diagnostic refs.

The model should not be asked to regenerate the whole graph to fix a local
transition failure.

## Work Queue Readback

Owner-facing Work Queue readback must expose:

- graph id.
- current lifecycle phase.
- active node id.
- node class: work intent, prerequisite, executable, barrier, closeout.
- capability id.
- executor key.
- worker/model ref.
- selected transition tool id.
- context state.
- resource state.
- dependency state.
- validation state.
- authority/storage state.
- blocker summary.
- next allowed transitions.
- prerequisite nodes created.
- executable frontier.
- parallel frontier.
- evidence refs.
- ELI5 progress.

Readback should make it obvious whether the system is:

- planning.
- gathering context.
- materializing resources.
- waiting for dependencies.
- executing a worker.
- validating.
- repairing.
- reviewing.
- closing out.

## Boundary Replay

Boundary replay must support transition-engine checkpoints:

- accepted work graph.
- frontier readiness evaluation.
- prerequisite node creation.
- node-scoped context accepted.
- resource packet compiled.
- executable frontier opened.
- worker invocation.
- validation/repair.
- closeout.

The failed Product/Spec case must be replayable from accepted graph state:

- input: accepted graph with implementation node first and `context_supply`
  still waiting.
- expected: runtime refuses implementation execution.
- expected: runtime creates context/resource prerequisites or records a
  precise transition blocker.
- forbidden: worker invocation.
- forbidden: `worker_adapter_threw:unclassified`.

## Product/Spec Proof Gate

Before rerunning the full Product/Spec proof, run a focused lane using the
latest failure shape.

Pass criteria:

- graph acceptance does not run implementation directly.
- `scheduler.approve_and_run_first_node` no longer bypasses readiness.
- `scheduler.evaluate_frontier_readiness` records the implementation node as
  non-executable because `context_supply` is missing.
- runtime creates node-scoped context-supply prerequisites for every
  implementation/test node requiring context.
- Work Queue readback shows the active transition and missing preconditions.
- no Kimi/Qwen/Codex implementation worker is invoked before
  `NodeExecutionPacket` readiness.
- failure, if any, is `needs_review` with exact transition diagnostics, not
  unclassified adapter failure.

Only after this lane passes should the full Product/Spec proof resume.

## Acceptance Tests

Required tests:

- accepted graph with first implementation node and missing context cannot
  run worker.
- accepted graph with context-supply edge pending waits or runs the
  prerequisite node first.
- accepted graph with no context-supply edge creates node-scoped context
  prerequisite nodes for implementation-bearing work-intent nodes.
- `approve_and_run_first_node` is disabled as a runtime tool and cannot
  authorize production execution.
- executable frontier opens only nodes with dependency readiness and
  capability preconditions satisfied.
- missing `NodeExecutionPacket` records `node.record_readiness_blocker`, not
  `worker_adapter_threw`.
- work-intent nodes cannot be selected by parallel frontier execution.
- barrier nodes cannot be scheduled before inbound dependencies satisfy their
  declared join policy.
- implementation resource packet readiness promotes nodes to executable.
- context/resource repair asks for field-specific transition repair, not full
  graph regeneration.
- Work Queue readback surfaces lifecycle phase, blocker, next transition,
  prerequisite nodes, and executable frontier.
- Product/Spec replay of `native-exec-eb9bbce0b5e01416` failure class passes
  the transition gate without worker invocation.

## Work Queue Item

Queue item:

`openclaw-convergence.runtime-node-readiness-transition-engine`

Title:

`Runtime Node Readiness And Transition Engine`

Priority:

P0, before `openclaw-convergence.active-queue-34`.

Scope:

- implement transition engine in `RuntimeWorkGraphScheduler`.
- retire or hard-disable production semantics of direct
  `approve_and_run_first_node`.
- add capability execution precondition profiles.
- enforce lifecycle state before `executeNode`.
- compile context/resource prerequisites before workers.
- convert missing-precondition adapter failures into scheduler readiness
  evidence.
- update Work Queue readback.
- add boundary replay from accepted graph.
- run focused tests and replay lane.

This item is distinct from prior resource-materialization work. Resource
materialization built the packet/readiness substrate. The transition engine
ensures the scheduler cannot bypass that substrate.
