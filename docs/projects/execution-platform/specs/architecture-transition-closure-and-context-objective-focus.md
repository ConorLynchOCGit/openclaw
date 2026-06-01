---
summary: "P0 architecture transition closure spec for deleting the old graph-level context path, making node resource demand node-local, narrowing context requirements before payload assembly, executing scope revision in production, and adding proof/readback/source-inventory gates."
title: "Architecture Transition Closure And Context Objective Focus"
---

# Architecture Transition Closure And Context Objective Focus

Date: 2026-05-27

Status: governing P0 pre-Product/Spec spec. This spec converts the latest
Product/Spec proof failure into a closure tranche. The goal is not to patch
context scout packet size. The goal is to finish the architecture transition
so production can no longer run halfway between the retired graph-level
context path and the node-local node resource demand path.

2026-05-27 extension: code review showed that `ResourceObjectiveFocus` cannot
remain an optional narrowing aid. It must be a mandatory boundary before
context requirement compilation, node resource demand opening, context scout
specialist subturn dispatch, and source-edit materialization. The detailed
wire/cut spec is
[Mandatory Context Focus And Target Selection Boundary](/projects/execution-platform/specs/mandatory-context-focus-and-target-selection-boundary).
Broad `targetRefs`, packet `likelyRepoAreas`, and approved repo scope are
legal-resource seeds only; they cannot become scout roots or executable
target snapshots until a model-authored focus and then a model-authored
target-selection packet have been accepted.

## Code-Verified Findings

The latest code dive verified that the new artifacts exist but the old
execution behavior still controls production at key boundaries.

### 1. Production still creates durable graph-level context scout fanout

`runtime-work-graph-scheduler.ts` still contains
`deterministicNodeScopedResourceFulfillmentDecision`, which builds durable
`context_scout` graph nodes and `context_supplies` edges as runtime-owned
readiness repair. It is invoked from the main scheduler loop, from staged
decision handling, and from transition prerequisite creation.

That function is the direct cause of the proof shape:

```text
accepted packets
  -> WorkIntent graph
  -> durable context_scout graph nodes
  -> oversized context scout execution packets
  -> frontier/shard machinery
  -> stalled consumer satisfaction
```

This is not node-local node resource demand. It is a renamed version of the old
pre-implementation context ceremony.

### 2. The proof harness still treats graph-level context as the proof gate

`scripts/execution-platform-run-product-spec-checkpointed-test.mjs` still
computes `resource_fulfillment` from accepted graph-level context scout/web research
nodes and contains `contextSynthesisReadinessSatisfied` compatibility logic.
It can report a stale first open gate even when the real blocker is deeper:
node resource demand, scope revision, work-intent context resolution, target
selection, write gate, validation, evidence, or root-cause terminal state.

The checkpoint harness must stop being a second architecture. It must project
from canonical runtime state.

### 3. Context requirements are broad before scout payload assembly

`compileResourceRequirementPacketFromBrokerRequest` currently preserves up to:

- 24 semantic questions;
- 80 candidate source refs;
- 100 candidate repo-area refs;
- 80 known target refs;
- 40 memory pack refs;
- 40 validation refs.

`compileContextScoutExecutionPacket` then adds commitment packet summaries,
source prompt section summaries, context broker request fields, bounded repo
context summaries, candidate file refs, validation refs, and the requirement
summaries into one model-facing packet.

The result is that requirement bodies can already be roughly 20-22 KB before
the source prompt and repo summaries are added, then scout packets exceed the
Qwen profile by a wide margin.

This is not just an erroneous cap. It means the system is asking the context
model to consider too much because the upstream objective boundary is too
weak. The model is not being asked for the next exact context need. It is
being handed a merged basket of possible context for the whole consumer.

### 4. Scope revision exists but does not resume production execution

The scope-revision contracts and model proof exist, but production still
records `scheduler.request_context_scope_revision` as a scheduler tool
boundary instead of executing:

```text
request
  -> model selects legal subset
  -> runtime validates selected refs
  -> revised node resource demand packet
  -> execute
  -> ledger/merge
  -> consumer context satisfaction
```

Recording the request is diagnostic motion, not runtime progress.

### 5. WorkIntent context resolution still reads graph context edges

`compileWorkIntentContextResolution` observes incoming `context_supplies`
edges and context-scout node metadata. It does not yet treat a
`NodeResourceDemandSession` plus `NodeResourceLedger` as the primary context
satisfaction source.

This means the new node-local artifacts cannot fully replace the old graph
fanout until context resolution is rewired.

### 6. Some runtime gates still use hard-coded topology classifications

The code still contains hard-coded node-kind lists and repo-path prefixes for
context supply decisions. Those are structural shortcuts that keep the runtime
coupled to one coding topology. They must be replaced by capability manifest
fields and model-authored WorkIntent/resource contracts. Runtime may validate
declared capability and authority; it must not infer semantic execution class
from node-kind strings or path prefixes.

### 7. Artifact volume is not context satisfaction

The run produced 166 shard handoffs, all accepted with limitations, but merge
packets stayed pending and one single-unit blocker stopped progress. The
system produced artifacts without reaching a consumer-bound readiness
transition. The next architecture must treat artifact creation and consumer
satisfaction as separate states.

### 8. Gateway heap OOM is a proof-environment blocker

The live gateway hit Node heap OOM and restarted during the proof. It was not
the immediate context-frontier blocker, but it proves that the runtime still
allows oversized in-memory state and/or metadata surfaces. The fix is
manifest-only metadata and payload-backed bodies, not larger heap limits.

## Fundamental Objective Gap

The model is compiling too many context refs because the platform gives it a
merged context task instead of an execution-adjacent question.

The current broad pattern is:

```text
consumer WorkIntent
  + all packet context questions
  + scheduler target refs
  + packet likely repo areas
  + prompt/source summaries
  + repo summaries
  -> one context scout payload
```

That makes the model behave like a preflight analyst. It tries to preserve
everything that might be relevant because no runtime boundary asks:

- what is the next unknown?
- what exact file/window/symbol/test is needed next?
- what will this context be used for?
- is this read-only grounding, target selection, edit planning, validation,
  or evidence closure?

Codex-style context acquisition works differently. The next execution step
drives context. The agent keeps a short plan, performs an initial search, reads
bounded windows, acts on the first concrete item, then repeats search/open/read
for the next item as needed. Context is iterative and adjacent to the next
action. It does not precompile a giant context bundle for every possible
future implementation need.

The architecture must copy that control shape:

```text
partial NodeExecutionPacket
  -> current objective slot
  -> exact node resource demand
  -> bounded file/window/tool result
  -> ledger append
  -> next legal transition
```

## Target Runtime Spine

Production must enforce this path:

```text
Mission Ledger
  -> Commitment Work Packets
  -> WorkIntentGraph
  -> NodeExecutionContract
  -> partial NodeExecutionPacket
  -> ResourceObjectiveFocus
  -> NodeResourceDemandSession
  -> NodeResourceLedger
  -> model-authored target selection
  -> hydrated write gate
  -> forced patch author
  -> post-edit validation
  -> typed evidence claim
  -> review/readback/closeout
```

Retired production path:

```text
Commitment Work Packets
  -> default graph-level context_scout fanout
  -> context frontier/shard graph repair
  -> default/global context_synthesis
  -> implementation groups
```

Context scout may still exist only as a consumer-bound specialist subturn
inside a `NodeResourceDemandSession`.

## Required Work

### 1. Production Topology Closure

Delete or rewrite every production path that creates durable context scout
nodes as default readiness repair.

Required removals:

- `deterministicNodeScopedResourceFulfillmentDecision` default graph-node creation;
- calls that apply that decision from the scheduler loop, staged decision
  path, or transition prerequisite path;
- graph-visible `context_scout` prerequisite creation for ordinary
  WorkIntent context;
- scheduler progress that claims `context_broker.dispatch_context_scout` as
  the default next transition;
- proof pass conditions based on broad context scout/web research nodes.

Replacement:

- open a `NodeResourceDemandSession` for the consumer;
- provide direct node-resource-demand tools first;
- dispatch a specialist scout subturn only from that session when allowed;
- append findings to the consumer `NodeResourceLedger`;
- advance readiness from the ledger, not graph fanout.

Success gate:

After accepted packets, production graphs may contain WorkIntent, contract,
resource, executable, validation, review, readback, and closeout nodes. They
must not contain default durable `context_scout` fanout.

### 2. Context Objective Focus Contract

Add a compact model-authored contract before context requirement assembly:

`ResourceObjectiveFocus`.

Purpose:

Tell the runtime what the next node resource demand is for. This contract is the
missing reason the platform currently over-collects refs.

Required fields:

- `focusRef`
- `consumerNodeId`
- `workIntentRef`
- `nodeExecutionContractRef`
- `currentObjectiveSlot`
- `resourceUseKind`: `source_grounding`, `target_selection`,
  `edit_planning`, `validation_planning`, `evidence_closure`,
  `review_support`, or domain-specific registered value
- `nextUnknown`
- `expectedUse`
- `legalRefUniverseRef`
- `candidateRefHandles`
- `maxInitialRefSelections`
- `maxSemanticQuestions`
- `stopWhenAnswered`
- `nextLegalTransitions`

Required small verbs:

- `context.focus.request`
- `context.focus.select_next_unknown`
- `context.focus.select_candidate_refs`
- `context.focus.mark_unanswerable`
- `context.focus.accept`

Runtime validates selected refs and budgets. The model authors the semantic
focus.

Success gate:

Context requirements can no longer copy all candidate refs/questions by
default. They must compile from accepted `ResourceObjectiveFocus` plus selected
legal handles.

### 3. Context Requirement Narrowing Before Payload Construction

Replace broad requirement assembly with a two-step narrowing boundary:

```text
legal ref universe
  -> model-authored ResourceObjectiveFocus
  -> compact NodeResourceDemandSession request
  -> payload construction
```

Hard constraints:

- no more than one primary `resourceUseKind` per demand;
- no more than a small selected set of candidate refs per first demand;
- one to three model-authored semantic questions per demand by default;
- source prompt sections and repo summaries are handles until explicitly
  selected;
- bounded file windows are opened by demand tools, not copied into every
  scout packet;
- runtime cannot truncate to fit. If over profile, scope revision runs.

Success gate:

The requirement compiler must fail if it attempts to include broad candidate
sets without an accepted focus/subset decision. Failure must name exact
counts, source fields, and the missing focus transition.

### 4. Scope Revision As A Production Transition

Implement scope revision as executable runtime lifecycle, not as telemetry.

Required sequence:

```text
context_unit_over_profile
  -> context.scope.request_revision
  -> context.scope.select_legal_subset
  -> context.scope.validate_selected_subset
  -> context.demand.recompile_from_scope_revision
  -> execute revised demand
  -> append ledger entries
  -> update consumer readiness
```

Terminal blockers:

- no legal subset exists;
- model returns invalid subset;
- revised packet still exceeds profile;
- provider fails with bounded diagnostics;
- selected refs violate authority.

Success gate:

The production run cannot stop at `scheduler.request_context_scope_revision`
unless the terminal state is a root-cause artifact with exact blocker fields.

### 5. WorkIntent Context Resolution From Demand/Ledger State

Rewire context resolution to read canonical node-local state first:

- `NodeResourceDemandSession`
- `NodeResourceLedger`
- accepted focus decision
- target-selection state
- limitation/waiver refs
- specialist subturn result refs when used

Incoming `context_supplies` graph edges become legacy/explicit coordination
input only. They cannot be the default satisfaction source.

Success gate:

A WorkIntent can become `resource_ledger_ready` without any context scout graph
node. A graph-level context node cannot satisfy WorkIntent context unless it
is an explicit workflow capability and its output was appended to the
consumer ledger.

### 6. Manifest-Only Metadata And OOM Gate

Bound every node-resource-demand and ledger projection:

- graph node metadata stores refs, hashes, counts, state, short previews;
- Work Queue projections store compact manifests only;
- runtime artifacts store full bodies in payload-backed storage;
- provider prompts, raw responses, raw tool logs, and hidden reasoning are
  never persisted;
- ledger entry manifests have maximum byte budgets;
- latest-run-state stores current node/gate/blocker/token/walltime summaries,
  not artifact bodies.

Add a proof-environment memory diagnostic:

- heap use by phase;
- largest metadata object by phase;
- largest artifact body and payload ref;
- payload/body count by artifact kind;
- top N node-resource-demand and ledger manifest sizes;
- provider request bytes by role/model.

Success gate:

Middle-lane replay and full proof must fail if graph metadata, Work Queue
metadata, latest-run-state, or runtime artifact metadata tries to carry full
context bodies.

### 7. Proof Harness And Readback Rewrite

The checkpoint harness must read canonical node-local state. It must not
compute `resource_fulfillment` from packet/context-node coverage.

Required gate names:

- `work_intent_compile`
- `context_focus_required`
- `node_resource_demand_open`
- `context_scope_revision_required`
- `context_scope_revision_blocked`
- `resource_ledger_ready`
- `target_selection_blocked`
- `write_gate_blocked`
- `worker_edit_ready`
- `post_edit_validation`
- `evidence_closure`
- `root_cause_terminal`

Success gate:

If production is blocked on scope revision, node resource demand, ledger readiness,
target selection, or write gate, readback must show that exact gate. It must
not show `resource_fulfillment`, `commitment_work_packets`, or stale
context-synthesis readiness.

### 8. No-Progress Collapse

Add a canonical no-progress signature:

```text
runtimeJobId
graphId
branchId
nodeId
workIntentRef
stage
capabilityId
contractVersion
missingFields
reasonCodes
providerProfile
payloadHash
```

If the same signature repeats across scheduler iterations or sibling branches,
terminalize once with a root-cause artifact. Preserve successful sibling
evidence.

Success gate:

The runtime cannot continue reporting `running`, `node_completed`, or generic
`needs_review` for repeated identical blockers.

### 9. Source Inventory Gate

Add a source inventory validation that fails on production usage of retired
concepts.

Forbidden in production unless explicitly allowlisted as historical docs/tests:

- `context_synthesis`
- `after-context-synthesis`
- default graph-level `context_scout` fanout;
- legacy `resource_fulfillment` proof gate;
- context-synthesis readiness;
- compatibility flags that resurrect retired paths.

Success gate:

The inventory report lists every surviving term, file, classification,
allowlist reason, and expiry. Production imports/usages fail unless the term
belongs to a new explicit workflow capability and not the retired default
path.

### 10. Real Model Middle-Lane Test

Before the full Product/Spec proof, run a middle-lane production replay from
completed packets.

Required proof:

```text
WorkIntent starts
  -> opens node-local node resource demand
  -> selects focused next unknown
  -> receives scoped file windows
  -> appends ledger entries
  -> selects targets
  -> hydrates write gate
  -> edits
  -> validates
  -> emits evidence
```

Any broad scout/synthesis path fails the test.

## Work Queue

2026-05-27 DB update:

- `openclaw-convergence.architecture-transition-closure-gates` is closed.
- `openclaw-convergence.resource-objective-focus-and-requirement-narrowing` is
  closed. Evidence:
  `.artifacts/execution-platform/resource-objective-focus-real-model-proof/proof.json`
  and `.artifacts/execution-platform/resource-objective-focus-closeout.json`.
- Current DB queue head is
  `openclaw-convergence.mandatory-context-focus-target-selection-boundary`.

The DB-backed queue must be ranked in this order before the next full proof:

1. `openclaw-convergence.architecture-transition-closure-gates`
   - production topology gate, source inventory gate, and proof harness
     failure if default graph-level context/scout/synthesis paths remain.
2. `openclaw-convergence.resource-objective-focus-and-requirement-narrowing`
   - add `ResourceObjectiveFocus`, selected legal ref handles, narrow
     semantic questions, and requirement compile blockers for broad payloads.
3. `openclaw-convergence.node-local-node-resource-demand-production-transition`
   - replace default context scout graph prerequisite creation with
     `NodeResourceDemandSession` lifecycle.
4. `openclaw-convergence.scope-revision-production-transition`
   - execute model-authored scope revision in production and resume or
     terminalize with root cause.
5. `openclaw-convergence.node-resource-ledger-overflow-closure`
   - append-only ledger with payload-backed bodies, compact manifests, and
     overflow/OOM diagnostics.
6. `openclaw-convergence.progressive-node-execution-packet-write-gate-closure`
   - partial packet read/context phase and hard write gate.
7. `openclaw-convergence.mandatory-context-focus-target-selection-boundary`
   - make `ResourceObjectiveFocus` mandatory before node resource demand/scout
     specialist work and target selection mandatory before source-edit
     snapshots; cut broad target-ref and approved-scope fallbacks.
8. `openclaw-convergence.context-scout-specialist-subturn-production-closure`
   - scout only as consumer-bound specialist subturn;
   - add a real-model middle-lane canary where runtime supplies a broad legal
     ref universe, the model narrows focus and node resource demand, ledger evidence
     accumulates node-locally, and target selection is model-authored from that
     evidence instead of seeded by runtime.
9. `openclaw-convergence.workintent-context-resolution-from-ledger`
   - resolve WorkIntent context from demand/ledger/focus state instead of
     graph `context_supplies` edges.
10. `openclaw-convergence.proof-harness-canonical-gate-rewrite`
   - remove packet-level `resource_fulfillment` and context-synthesis readiness
     projection from the checkpoint harness.
   - 2026-05-27 implementation update: checkpoint readback now uses
     `execution_platform.proof_harness_canonical_gate_projection`, which
     delegates to the canonical node-local readback gate and rejects retired
     context/synthesis topology as `graph_compile_invalid`. The projection
     distinguishes focus, scope revision, ledger, target-selection, write
     gate, validation, evidence, and terminal root-cause gates. Proof summary
     and latest-run-state writes now carry manifest byte guards. Target and
     resource-selection parsing scans bounded JSON tool-call candidates and
     accepts only schema-valid tool calls, which is syntactic recovery rather
     than semantic keyword classification.
11. `openclaw-convergence.readback-rootcause-provider-heap-closure`
    - readback, no-progress collapse, provider diagnostics, and heap/metadata
      proof-environment diagnostics.
    - 2026-05-27 implementation update: latest-run-state and Work Queue
      readback now project the node-local gate taxonomy, frontier root cause,
      bounded provider response shape, and compact `proofEnvironment` heap and
      manifest optics. Runtime artifact contracts now register provider
      response-shape diagnostics and heap phase snapshots as payload-backed
      diagnostic artifacts. Proof artifact:
      `.artifacts/execution-platform/readback-rootcause-provider-heap-closure-proof/proof.json`.
12. `openclaw-convergence.context-synthesis-runtime-deletion-closure`
    - hard-delete default synthesis production/replay remnants.
    - 2026-05-27 implementation update: closed with runtime deletion proof
      `.artifacts/execution-platform/context-synthesis-runtime-deletion-closure-proof/proof.json`
      and non-trivial real model context specialist proof
      `.artifacts/execution-platform/context-scout-specialist-subturn-real-model-proof/proof.json`.
      The pass removed live synthesis compatibility fields from packet,
      replay, context scout, and repair-boundary surfaces; source inventory
      reports zero blocked survivors and a 5,027-line net deletion from
      retired runtime/proof files.
13. `openclaw-convergence.legacy-proof-test-purge-closure`
    - delete/rewrite obsolete proof/test topology.
14. `openclaw-convergence.legacy-runtime-code-evisceration-closure`
    - delete retired runtime code and fallback paths.
15. `openclaw-convergence.architecture-residue-source-inventory-final-gate`
    - final residue gate with meaningful net LOC reduction report.
16. `openclaw-convergence.worker-readiness-edit-evidence-node-local-closure`
    - post-demand worker path through target selection, edit, validation, and
      evidence.
17. `openclaw-convergence.blocker-closure-06-replay-and-full-proof-gates`
    - middle-lane replay, then full Product/Spec proof.
18. `openclaw-convergence.active-queue-34`
    - Product/Spec Planning Workflow Plugin Production Proof.

## Non-Goals

- Do not raise Qwen/context profile caps to hide broad payloads.
- Do not add deterministic semantic ranking or keyword filters.
- Do not keep old paths behind env flags.
- Do not let graph node metadata carry context bodies.
- Do not call artifact volume consumer satisfaction.

## Completion Definition

This tranche is complete only when the old architecture cannot run in
production, the proof harness cannot report old gates, oversized context
units execute scope revision or terminalize precisely, and a real
middle-lane replay reaches edit/validation/evidence through node-local
node resource demand.
