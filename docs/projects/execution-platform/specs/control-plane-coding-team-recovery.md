---
summary: "Control-plane-first recovery architecture for proving the coding team through real source edits without narrowing generic orchestration."
title: "Control-Plane Coding Team Recovery"
---

# Control-Plane Coding Team Recovery

Date: 2026-05-24

Status: active pre-proof architecture. This spec governs the next Product/Spec
Planning proof path and supersedes any proof plan that requires broad global
context synthesis before a worker-ready implementation node can execute.

## Objective

OpenClaw needs to prove a real coding-team control plane, not another
multi-agent chat transcript or schema-heavy planner response.

Canonical shape:

```text
long prompt
  -> Mission Ledger / obligation graph
  -> Commitment Work Packets
  -> WorkIntent DAG
  -> capability validation
  -> resource requirements
  -> NodeExecutionPacket
  -> isolated worker tool loop
  -> source edit
  -> validation
  -> evidence claims
  -> owner readback and closeout
```

The immediate proof gate is deliberately smaller than the full Product/Spec
Planning run: one Product/Spec-derived implementation node must receive a
hydrated `NodeExecutionPacket`, run through the worker tool facade, make a
bounded source edit or return a precise upstream blocker, run validation, and
emit commitment-linked evidence.

## Latest Failure Diagnosis

The repeated Product/Spec proof failures are a control-plane contract failure,
not a narrow worker failure. The current system has useful pieces, but each
layer still reinterprets the previous layer's output. The platform must share
one canonical contract for:

- what kind of work this is;
- what capability should execute it;
- what resources are required before execution;
- what output counts as progress;
- what evidence is required;
- what the next legal transition is.

The clearest forbidden path is:

```text
context_synthesis group -> implementation node
```

That path can turn read-only/source-grounding work into a source-edit worker
contract. Context synthesis remains valid only as explicit coordination or
diagnostic infrastructure. It is not default production glue for the
coding-team Product/Spec proof.

## Design Principles

1. The platform is a control plane. Workers execute bounded task packets; they
   do not own global planning, model selection, authority, merge policy, or
   canonical state.
2. Model-facing tools are small verbs. Models choose handles and author
   semantic judgments; they do not mutate raw DAG/runtime schemas.
3. Runtime owns schemas, ids, refs, bounds, storage, locks, permissions,
   worktrees, lifecycle, tool execution, and evidence-ref validation.
4. Model-authored judgment owns semantic decomposition, usefulness,
   sufficiency, implementation quality, and commitment-satisfaction claims.
5. Context is node-scoped and demand-driven by default. Global synthesis is an
   explicit coordination node only when workflow policy or model-authored
   structure review identifies cross-node dependency, conflict, shared API,
   integration ordering, validation collision, or evidence dependency.
6. No production success path may flow through proof replay glue, degraded
   closeout, compatibility runners, giant patch JSON, or deterministic
   semantic shortcuts.

## Pre-Proof Implementation Slice

### 1. Documentation And Queue Reconciliation

Before any new runtime proof, update:

- project index, status, current slice, roadmap, and decisions;
- spec index and stale Product/Spec proof docs;
- Work Queue ranks and item metadata.

The active pre-proof queue must distinguish:

- current control-plane recovery work;
- completed historical hardening;
- diagnostic-only replay/synthesis/mission-ledger artifacts;
- post-proof full toolification expansion.

### 2. Task-DAG-First Scheduler

The scheduler creates non-runnable `WorkIntent` nodes from accepted Mission
Ledger commitments and Commitment Work Packets before context fanout.

Required behavior:

- WorkIntent nodes carry commitment ids, objective, scope, acceptance
  criteria, downstream consumer, context questions, validation needs, and
  stop-if-missing rules;
- runtime compiles node ids, node kinds, executor keys, capability refs,
  evidence classes, graph envelopes, storage flags, and Work Queue refs;
- node-scoped context scout nodes attach to blocked draft work nodes through
  `context_supplies` edges;
- ready branches execute without waiting for unrelated context fanout;
- broad parent work nodes split into child work packets before worker
  invocation if they cannot fit one bounded `NodeExecutionPacket`;
- replay from packet/context boundaries must use the same scheduler-first
  topology as production.

Forbidden behavior:

- replay harnesses must not inject `context_synthesis` as default glue;
- production coding-team graph compilation must not compile context synthesis
  groups directly into implementation nodes;
- generic scheduler code must not contain Product/Spec-specific semantic
  branching;
- implementation cannot run from directory-level guesses, generic packet
  summaries, or accepted-with-limitations context without a valid consumer
  waiver.

2026-05-24 implementation result: default context-synthesis glue is retired
from production and replay. Accepted synthesis handoffs can only compile into
non-runnable `WorkIntent` nodes with explicit model-authored execution intent
and capability selection. The runtime blocks missing intent/capability fields
with bounded diagnostics instead of guessing. `after-context-synthesis`
replay is diagnostic-only, and `after-graph-selection` replay requires
node-scoped context supply.

### 2a. WorkIntent Contract

`WorkIntent` is the control-plane contract between semantic decomposition and
executable graph state.

The model owns semantic fields:

- title, objective, and rationale;
- `executionIntent`;
- commitment ids;
- capability intent;
- expected output and success criteria;
- context questions and likely target areas;
- validation needs and stop-if-missing rules;
- dependency and parallelism rationale.

Runtime owns executable state:

- canonical ids, graph envelopes, node kinds, executor keys, worker refs;
- evidence mode and evidence expectations;
- resource requirements;
- authority, storage, lifecycle, budgets, locks, and Work Queue refs;
- `NodeReadinessState`;
- replay checkpoint legality and next transitions.

The detailed contract is
[WorkIntent Control-Plane Contract](/projects/execution-platform/specs/work-intent-control-plane-contract).

### 3. Coding Tool Facade

The pre-proof model-facing tool facade is a small compatibility layer over the
runtime-owned worker tools. It lets models call simple public verbs while the
runtime normalizes them into existing traced tool executions.

Pre-proof facade:

- `context.request_more` -> runtime context request;
- `repo.search` and `repo.find_files` -> bounded repo search;
- `repo.open_file` / `file.read` -> bounded file snapshot;
- `edit.apply_patch` -> runtime patch application;
- `edit.search_replace` -> runtime patch application with `replace_text`;
- `checks.run` / `validation.run` -> approved validation command execution.

The facade does not grant new authority. It only normalizes stable public tool
names into existing runtime-owned worker actions and records the original
model-facing tool id in bounded metadata.

Post-proof, the facade expands to the full catalog in this spec. Until then,
tools not listed above remain documented architecture, not production success
requirements.

### 4. Canonical Worker Packet

`NodeExecutionPacket` is the executable-node contract. File-edit workers only
receive it when the execution intent is `source_edit` and the attached domain
resource packet is a hydrated `coding_resource_packet`. Read-only/source
grounding workers receive a hydrated `read_only_resource_packet` and cannot be
counted as changed-file implementation evidence.

No implementation worker can run unless the packet includes:

- source commitment ids;
- worker-facing objective;
- allowed and forbidden path scopes;
- target file snapshots or explicit new-file intent;
- context refs and handoff summary;
- validation command refs or validation discovery plan;
- evidence expectation refs/classes;
- stop conditions and escalation conditions;
- output contract for changed files, validation refs, limitations, and
  commitment evidence.

Runtime readiness uses this packet and `NodeReadinessState` as the single
source of truth. Scheduler, replay, Work Queue readback, and proof gates must
not derive separate readiness stories.

Worker invocation is stricter than graph metadata. Graph metadata may carry
manifest refs and short summaries, but a worker call requires the hydrated
`NodeExecutionPacket` plus the hydrated matching domain resource packet body.
File-edit node kinds cannot opt out of this requirement with
`nodeExecutionPacketRequired: false`.

### 5. Worker Execution Proof

Before a full Product/Spec proof, run a boundary proof from the nearest
Product/Spec checkpoint that can produce at least one edit-required
`source_edit` node.

Pass condition:

- one implementation node hydrates a `NodeExecutionPacket`;
- worker receives bounded file snapshots and edit scope;
- worker uses model-facing/public or internal runtime worker tools;
- worker applies a bounded edit or returns a precise upstream blocker;
- validation runs;
- evidence claims map to Mission Ledger commitments;
- changed files are reviewed before persistence when the proof harness is
  destructive;
- latest-run-state and Work Queue readback show node, branch, model, tool,
  blocker, validation state, walltime, token/cost availability, and next
  transition.

If this proof fails, the next fix targets the failed boundary only. It must
not introduce Product/Spec-only scheduler behavior or deterministic semantic
classification.

### 6. Owner Readback And Telemetry Proof

The proof is incomplete unless operator readback shows:

- WorkIntent id and title;
- execution intent and evidence mode;
- selected capability and executor;
- readiness state and readiness ref;
- active model/tool/phase;
- blocker and schema/policy path when blocked;
- walltime and token/cost availability;
- next legal transition.

This readback must come from compact runtime state, not from raw log scans.

## Full Toolification Catalog

The full catalog is documented now so it is not lost, but it is implemented
after the first successful coding proof unless a failure directly requires one
of these tools sooner.

### `task.*`

- `task.get_brief`
- `task.get_obligations`
- `task.add_finding`
- `task.add_blocker`
- `task.update_progress`
- `task.submit_result`

Purpose: worker understanding and bounded result handoff. Canonical task state
is still runtime-owned.

### `repo.*`

- `repo.search`
- `repo.find_files`
- `repo.open_file`
- `repo.open_symbol`
- `repo.get_file_tree`
- `repo.get_dependencies`
- `repo.get_recent_changes`
- `repo.get_related_tests`
- `repo.get_entrypoints`

Purpose: bounded repository discovery with stable refs and previews.

### `context.*`

- `context.get_project_rules`
- `context.get_task_context`
- `context.get_skill`
- `context.search_docs`
- `context.open_doc`
- `context.summarize_refs`
- `context.request_more`

Purpose: progressive disclosure. Workers receive only the context needed for
their task and can request more by handle.

### `edit.*`

- `edit.read_current`
- `edit.apply_patch`
- `edit.search_replace`
- `edit.create_file`
- `edit.delete_file`
- `edit.rename_file`
- `edit.format_file`
- `edit.preview_diff`

Purpose: runtime-owned source mutation, scope validation, conflict checking,
and edit transactions.

### `checks.*`

- `checks.list`
- `checks.run`
- `checks.run_targeted_tests`
- `checks.run_typecheck`
- `checks.run_lint`
- `checks.run_format`
- `checks.explain_failure`

Purpose: approved command palette and validation-result interpretation.

### `worktree.*`

- `worktree.status`
- `worktree.diff`
- `worktree.changed_files`
- `worktree.reset_own_changes`
- `worktree.create_checkpoint`
- `worktree.restore_checkpoint`
- `worktree.request_merge`

Purpose: isolated worker state. Merge/integration remains control-plane-owned.

### `artifact.*`

- `artifact.create`
- `artifact.append`
- `artifact.link_file`
- `artifact.link_check`
- `artifact.get`
- `artifact.list_for_task`

Purpose: durable worker findings and reports without giant JSON result
objects.

### `review.*`

- `review.get_diff`
- `review.get_obligation_coverage`
- `review.add_comment`
- `review.add_issue`
- `review.approve`
- `review.request_changes`

Purpose: review as repeated flat issue/report tools instead of one nested
review object.

### `message.*`

- `message.ask_lead`
- `message.reply_to_lead`
- `message.publish_note`
- `message.get_inbox`

Purpose: mailbox-style coordination. Worker-to-worker chat remains disabled
until tracing and conflict control are stronger.

### `approval.*`

- `approval.request`
- `risk.report`
- `risk.classify_change`
- `policy.check_action`

Purpose: explicit risk/authority gates for dependency install, network,
auth/billing/security/migrations, public API changes, expensive checks, and
destructive actions.

### `memory.*`

- `memory.search`
- `memory.propose_update`
- `memory.get_project_notes`
- `memory.get_known_gotchas`
- `memory.record_failure_pattern`

Purpose: learning loop. Workers can propose updates; trusted control paths
accept or reject.

### `telemetry.*`

- `telemetry.get_budget`
- `telemetry.get_task_costs`
- `telemetry.get_model_performance`
- `telemetry.report_waste`

Purpose: budget awareness for lead/control roles and operator readback.

## Internal-Only Operations

These remain internal control-plane operations and must not be exposed as raw
model-facing JSON APIs:

- scheduler assignment, retry, escalation, and cancellation;
- DAG/node/edge mutation;
- model/provider selection;
- budget and timeout policy;
- path locks and file ownership;
- sandbox/worktree lifecycle;
- git merge, branch, PR, conflict resolution, and destructive git operations;
- policy evaluation;
- trace persistence;
- Work Queue lifecycle mutation;
- evidence/ref compilation;
- closeout success/failure terminalization.

Models may request or justify actions. Runtime decides whether the action is
allowed and compiles the canonical state.

## No-Semantic-Cheat Guardrail

Runtime may validate:

- enum membership;
- refs exist;
- paths are in scope;
- files are readable;
- metadata stays bounded;
- graph is acyclic;
- capabilities are registered and phase-valid;
- validation refs exist;
- evidence refs map to known commitments;
- raw storage flags are false.

Runtime must not decide:

- whether a requirement is important;
- whether context is substantively sufficient;
- which Product/Spec concept implies which file;
- whether implementation quality is acceptable;
- whether a commitment is semantically satisfied;
- whether a model-authored packet is useful beyond structural completeness.

Those are model-authored or human-authored judgments with runtime-validated
evidence refs.

## Work Queue Structure

Pre-proof:

1. Execution Platform Spec Reconciliation And Control-Plane Reset.
2. Task-DAG-First Scheduler And Node-Scoped Context.
3. Coding Tool Facade Pre-Proof Slice.
4. NodeExecutionPacket Worker Readiness Gate.
5. Non-Codex Tool Worker Execution Proof.
6. Operator Readback And Telemetry Proof.
7. Product/Spec Planning Workflow Plugin Production Proof.

Immediate post-proof:

1. Full Tool Facade Expansion.
2. Runtime Artifact Retention And Pruning Policy.
3. Scheduler Phase Budget Governor.
4. Work Queue Frontier Delta Stream And Branch Controls.
5. Memory, Retrieval, Context, And Proactivity Toolification.
6. Cross-Workflow Orchestration Proof Lanes.

## Acceptance

The next full Product/Spec proof is not accepted until:

- the docs/Work Queue reflect this control-plane architecture;
- replay/proof paths cannot inject default synthesis;
- the worker facade accepts small public tool verbs for the pre-proof slice;
- at least one Product/Spec-derived implementation node has a ready
  `NodeExecutionPacket`;
- one worker execution boundary proves edit, validation, evidence, and
  readback, or returns a precise upstream blocker.
