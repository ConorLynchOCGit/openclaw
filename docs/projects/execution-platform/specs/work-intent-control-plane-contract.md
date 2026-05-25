---
summary: "Canonical WorkIntent contract for separating model-authored work meaning from runtime-owned executable graph state."
title: "WorkIntent Control-Plane Contract"
---

# WorkIntent Control-Plane Contract

Date: 2026-05-24

Status: implemented P0 pre-Product/Spec recovery contract.

## Problem

The Product/Spec proof failures are not isolated worker failures. They show a
control-plane boundary gap: commitment packets, context handoffs, scheduler
groups, materialized resources, worker execution, validation, and evidence do
not yet share one canonical contract for what work is intended, which
capability should execute it, what resources are required, and what output
counts as progress.

The most concrete failure class is forbidden in the production coding path:

```text
context_synthesis group -> implementation node
```

Context synthesis may be useful as explicit coordination, but it must not be
default glue that converts read-only/source-grounding groups into file-edit
implementation nodes.

## Canonical Flow

The coding-team control plane must use this sequence:

```text
Mission Ledger
  -> Commitment Work Packets
  -> WorkIntent DAG
  -> capability validation
  -> resource requirements
  -> NodeExecutionPacket
  -> worker small-verb loop
  -> validation
  -> evidence claims
  -> review/readback/closeout
```

No node that requires runtime-owned resources may skip directly from a
model-authored group into executable worker dispatch.

## WorkIntent

`WorkIntent` is the canonical non-runnable intermediate node contract.

The model owns:

- objective and title;
- mapped commitment ids;
- semantic `executionIntent`;
- capability intent and rationale;
- expected human-readable output;
- success criteria;
- context questions;
- likely target areas or refs when known;
- validation needs;
- dependency and parallelism rationale;
- stop-if-missing rules.

Runtime owns:

- ids and graph envelopes;
- node kind, executor key, worker ref, and capability manifest validation;
- evidence mode and evidence shape;
- resource requirements;
- authority, locks, budgets, storage, lifecycle, and Work Queue refs;
- `NodeReadinessState`;
- replay checkpoints and next legal transitions.

`WorkIntent` is never a guarantee that a worker may execute. It can only move
to an executable node after resource materialization proves readiness.

## Execution Intent

Every WorkIntent must carry explicit model-authored `executionIntent`.

Initial values:

- `source_grounding`
- `context_supply`
- `resource_materialization`
- `source_edit`
- `validation`
- `review`
- `docs`
- `readback`
- `closeout`
- `human_decision`

Runtime may normalize explicit registered aliases, but it must not infer
semantic intent from prose, filenames, keywords, or Product/Spec-specific
strings.

## Capability Validation

Runtime validates `executionIntent` against the capability manifest.

Examples:

- `source_edit` may compile toward file-edit workers only after resource
  materialization proves target snapshots or explicit new-file intents,
  validation refs or validation discovery, allowed edit scope, and evidence
  expectations.
- `source_grounding` compiles to read-only/context/review execution and
  `read_only_evidence`, not changed-file proof.
- `docs` may compile to docs-edit or read-only docs evidence only when the
  workflow/capability manifest makes that distinction explicit.
- invalid intent/capability pairs produce field-specific repair diagnostics,
  not runtime semantic reinterpretation.

## Resource Requirements

Runtime derives resource requirements from the WorkIntent, capability, workflow
evidence profile, and node readiness policy.

For `source_edit`, required resources include:

- target commitment ids;
- accepted context handoff refs;
- concrete target file refs;
- target file snapshots or explicit new-file intents;
- allowed and forbidden path scopes;
- validation refs or validation discovery plan;
- evidence-claim expectations.

For read-only work, required resources are bounded refs, snapshots or excerpts
when needed, source/context handoff refs, and read-only evidence expectations.

## Replay And Proof Rules

Replay must restart from canonical boundaries:

- after commitment packets;
- after WorkIntent compile;
- before/after node-scoped context;
- before/after resource materialization;
- before worker invocation;
- after validation;
- before closeout.

Replay must use the same scheduler-first topology as production. Diagnostic
boundaries may inspect legacy context synthesis checkpoints, but they cannot
be counted as production proof success.

## Context Synthesis Retirement

Accepted context synthesis is not an executable graph compiler.

Allowed:

- explicit workflow/model-authored coordination nodes when cross-node
  conflicts, dependencies, shared API/schema decisions, validation conflicts,
  or integration ordering require a join;
- diagnostic replay inspection of old `after-context-synthesis` checkpoints
  behind explicit diagnostic flags;
- conversion of explicit synthesis groups into non-runnable `WorkIntent`
  nodes when each group carries model-authored `executionIntent`,
  selected/recommended capability, objective, expected output, success
  criteria, and downstream consumer fields.

Forbidden:

- default replay injection of `context_synthesis`;
- using accepted synthesis alone as after-graph-selection readiness;
- compiling `context_synthesis.implementationGroups` directly into
  implementation, validation, review, readback, or closeout executable nodes;
- runtime deriving semantic intent from synthesis prose to rescue a missing
  execution intent.

## Acceptance Criteria

- WorkIntent is documented, indexed, queued, and implemented as a non-runnable
  control-plane contract.
- Staged scheduler work units compile into `work_intent` nodes by default,
  with explicit model-authored execution intent required. There is no
  production compiler flag that lets staged work units skip WorkIntent and
  become executable graph nodes directly.
- Runtime validates selected capability, derives evidence/resource
  requirements, rejects runtime-owned model fields, and emits field-specific
  diagnostics without inferring semantic intent from prose, filenames, or
  Product/Spec-specific strings.
- Scheduler readiness treats WorkIntent as non-runnable control-plane state,
  not an executable worker node.
- Cost-aware and post-synthesis policies read WorkIntent manifest fields
  without string classifiers.
- The coding-team production path cannot default from context synthesis output
  to implementation nodes. Context synthesis may only produce coordination
  evidence or explicit non-runnable WorkIntent nodes.

Dependent acceptance criteria closed by the resource-materialization worker
gate:

- File-edit workers only receive hydrated source-edit `NodeExecutionPacket`s.
- Read-only/source-grounding work cannot require changed-file evidence.

Remaining dependent acceptance criteria are owned by later pre-proof items:

- Work Queue readback can show WorkIntent id, execution intent, evidence mode,
  readiness state, blocker, model/tool phase, and next legal transition.
