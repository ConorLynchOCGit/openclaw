# Post-Context Implementation Task Compiler

You are OpenClaw working in `/root/services/openclaw-roles/live`.

This is a production implementation task, not a proof-only patch. Implement
the Post-Context Implementation Task Compiler as a first-class live path in
the scheduler-backed `agent_team.coding` workflow. Do not add fallback,
compatibility, proof-shaped, or semantic-shortcut paths.

## Required Reading

Read and follow these specs before editing:

- `docs/projects/execution-platform/specs/post-context-implementation-task-compiler.md`
- `docs/projects/execution-platform/specs/scheduler-first-node-scoped-context-supply.md`
- `docs/projects/execution-platform/specs/runtime-work-graph.md`
- `docs/projects/execution-platform/specs/non-codex-tool-worker-runtime.md`
- `docs/projects/execution-platform/specs/native-agentic-coding-harness-convergence.md`
- `docs/projects/execution-platform/specs/maximum-toolification-architecture.md`
- `docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md`
- `docs/projects/execution-platform/DECISIONS.md`
- `docs/projects/execution-platform/CURRENT_SLICE.md`

## Mission

Fix the architectural gap where high-level implementation groups are promoted
directly into executable implementation nodes. Complex coding missions must
now use a two-layer graph:

1. high-level work-intent graph.
2. post-context executable task graph.

Implementation workers must not run from broad work groups, directory-level
target refs, or insufficient context. They may run only from accepted
`ImplementationTaskPacket`s containing concrete files/snapshots or explicit
new-file intents, allowed edit scope, validation refs, expected patch shape,
commitment mappings, and evidence expectations.

## Product/Spec Proof Clarification

The Product/Spec Planning production upgrade prompt runs under
`agent_team.coding`. Do not expect Product/Spec runtime nodes such as
`planning_orchestrator`, `web_research`, `planning_capsule_draft`,
`planning_capsule_revision`, `human_planning_decision`,
`action_graph_proposal`, or `compile_runtime_plan` to execute inside the
coding-team graph.

Those are target workflow primitives to build. The coding-team graph should
create implementation tasks that build/register/test/read back those
primitives.

## Implementation Requirements

### 1. Add the canonical ImplementationTaskPacket v3 contract

Create or extend the runtime-owned implementation task packet contract.

Required fields:

- packet id
- source work unit id
- source graph node id
- workflow id
- runtime job id
- graph id
- target commitment ids
- source CommitmentWorkPacket refs
- source context handoff refs
- objective
- expected patch shape
- expected output
- success criteria
- downstream consumer
- target file refs
- target file snapshots
- allowed edit scope
- new-file intents
- must-read refs
- likely-modify refs
- validation command refs
- validation discovery plan
- existing APIs/types
- known tests
- dependency notes
- risk/blast radius
- stop-if-missing rules
- evidence claim expectations
- capability fit
- cost/escalation policy
- raw-storage flags set false

Runtime owns packet schema, ids, refs, storage flags, authority, budgets,
lifecycles, and canonical graph node creation. Models may author semantic
judgment only where needed.

### 2. Build a production post-context compiler

Add first-class runtime code that compiles each implementation-bearing
work-intent node plus accepted node-scoped context scout handoffs into one or
more `ImplementationTaskPacket`s.

The compiler must consume:

- accepted Mission Ledger summary/ref.
- accepted Commitment Work Packets.
- work-intent graph node contract.
- node-scoped context scout handoff packet.
- verified context refs and snapshots.
- source prompt index/excerpt refs.
- capability manifest.
- workflow evidence profile.
- code intelligence refs when present.
- validation refs or validation discovery hints.
- current graph state and dependency edges.

The compiler must output one of:

- accepted implementation task packet.
- multiple accepted split task packets.
- context repair required.
- human decision required.
- Codex integration required.
- needs_review with exact blocker diagnostics.

### 3. Split broad groups after context

Implement split classification for broad Product/Spec-class work groups.

Split when a work group has:

- multiple unrelated directories.
- multiple target primitives.
- source/test/docs/readback mixed in one task.
- capability registry and executor implementation mixed with UX/readback.
- schema migration plus downstream consumers.
- directory-only target refs after context scout.
- unclear file ownership.
- multiple validation modes.

The split must produce task packets, not model-authored executable node
envelopes.

### 4. Block executable implementation nodes without task packets

Production scheduler execution must refuse to invoke Kimi, Qwen, Codex,
validation, docs, or implementation adapters when an implementation-bearing
node lacks an accepted implementation task packet.

Directory-only target refs must not unlock implementation. They may seed
context discovery only.

Missing target snapshots, missing target files, missing explicit new-file
intent, missing validation refs, or missing evidence expectations must be
classified as upstream task-compilation/context failure, not worker failure.

### 5. Create executable nodes only from accepted task packets

Runtime graph mutation rules:

- work-intent nodes may remain planned/non-runnable.
- context scout attaches to work-intent node.
- task compiler creates persisted task packet refs.
- executable implementation/test/docs/readback nodes are created from packet
  refs only.
- edges preserve provenance:
  - work-intent node -> context scout.
  - context scout -> implementation task packet.
  - implementation task packet -> executable node.
  - executable node -> validation/review/closeout.

Work Queue child materialization must distinguish draft work groups from
executable tasks.

### 6. Capability selection after file resolution

Capability selection for implementation must occur after task packet
compilation, not before file resolution.

Rules:

- `implementation_microtask` requires concrete file snapshots and bounded
  edit scope.
- non-Codex implementation lanes are preferred for scoped source, docs, test,
  schema, and readback tasks once packets are concrete.
- `implementation_complex` is escalation/integration only after cheaper
  scoped lanes are considered or packet complexity justifies it.
- validation/test/documentation/readback tasks should use matching
  capabilities when available.

The model chooses semantic fit and rationale. Runtime derives node kind,
executor key, worker ref, evidence classes, budget, retry policy, and Work
Queue child refs.

### 7. Align proof harness edge semantics with production

The Product/Spec replay/checkpoint harness must not fail a valid production
graph due to edge-kind naming drift.

Accept context handoffs when production scheduler semantics identify the edge
as node-scoped context supply, including `context_supplies` and explicitly
typed runtime handoff edges that carry context handoff refs.

Do not weaken the gate: implementation still requires accepted task packets
and file-resolved readiness.

### 8. Upgrade readback and telemetry

Work Queue and scheduler progress must show:

- work-intent groups.
- context scout status per group.
- compiled implementation task packets per group.
- readiness status per packet.
- executable nodes created from packets.
- selected worker/model/capability.
- blocked reason and missing fields.
- file refs/snapshots status.
- validation refs.
- evidence claim expectations.
- next scheduler decision.

No raw prompts, raw responses, transcripts, provider logs, tool logs, command
logs, raw DB rows, secrets, or hidden reasoning may be stored.

### 9. Add focused tests

Add production-path tests covering:

- clean compile from work-intent node + context scout into one task packet.
- broad Product/Spec group splitting into multiple task packets.
- directory-only refs blocked before worker invocation.
- explicit new-file intent accepted with parent directory/import context.
- missing validation refs routed to context repair or validation discovery.
- missing snapshots classified as upstream context/task-compilation failure.
- executable implementation node creation only from accepted packet.
- Kimi/non-Codex worker receives packet refs, snapshots, validation refs, and
  expected patch shape.
- Codex escalation only after packet complexity justifies it.
- Work Queue readback distinguishes work-intent group from executable task.
- proof harness accepts production-equivalent context handoff edge semantics.
- Product/Spec-class replay lane stops before worker invocation when task
  packets are missing, and proceeds when packets are accepted.

### 10. Run validation

Run focused tests for the changed modules and the Product/Spec replay harness.
Run the relevant TypeScript validation target used by this repo for execution
platform work. If a full repo check is too expensive for the current pass,
record the reason and run the strongest focused checks available.

## Proof Expectations

After implementation, run a bounded Product/Spec replay from the latest useful
context boundary if the harness has the required artifacts. The replay must
prove:

- work-intent groups are not executable implementation nodes.
- context scout handoffs compile into implementation task packets.
- executable implementation nodes are created only from accepted packets.
- the first implementation worker receives concrete file snapshots, validation
  refs, allowed edit scope, and evidence expectations.
- no source edit is attempted from a broad directory-only group.

Do not rerun the full front-door Product/Spec prompt unless the bounded replay
requires fresh artifacts.

## Deep Completion Question

When the work is done, do not simply answer from memory. Review the code paths
and tests, then ask:

“Did we maximally execute and implement the Post-Context Implementation Task
Compiler as a canonical production object? Is it first-class and live-wired in
the production scheduler-backed `agent_team.coding` path? Is it impossible for
high-level work groups or directory-only target refs to invoke implementation
workers? Do Kimi/non-Codex workers now receive accepted file-resolved task
packets with snapshots, validation refs, allowed edit scope, expected patch
shape, and evidence expectations? Are Work Queue readback, proof harness
gates, scheduler progress, and tests aligned with production semantics? Are
there any fallback, compatibility, proof-only, or degraded success paths left
that can bypass task-packet compilation?”

If the answer is not an unqualified yes:

- implement the missing hardening immediately.
- rerun focused validation.
- update docs/artifacts/readback expectations.
- repeat the question.

Do not stop at partial completion, “future work,” or `needs_review` unless the
remaining blocker is external owner-only configuration that cannot be
discovered from existing config/auth registries. If blocked, complete every
non-blocked code, test, doc, Work Queue, and artifact update and record the
exact blocker.
