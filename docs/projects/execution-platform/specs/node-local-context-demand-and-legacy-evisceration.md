---
summary: "P0 pre-Product/Spec spec for replacing pre-implementation context ceremonies with node-local node resource demand sessions, per-node ledgers, progressive execution packets, specialist scout subturns, hard context-synthesis retirement, and exhaustive legacy cleanup."
title: "Node-Local Context Demand And Legacy Evisceration"
---

# Node-Local Context Demand And Legacy Evisceration

Date: 2026-05-26

Status: P0 governing update for the next Product/Spec proof tranche. This spec
extends and supersedes the remaining pre-proof context-frontier ordering in
the blocker-closure plan. Context scouting must be iterative, node-local, and
execution-adjacent, not a global pre-implementation ceremony.

2026-05-27 closure update: the latest code dive proved that this transition is
not complete while `runtime-work-graph-scheduler.ts` can still create durable
`context_scout` graph nodes through `deterministicNodeScopedResourceFulfillmentDecision`
and while the checkpoint harness still projects `resource_fulfillment` from graph
context-node coverage. The governing closure spec is now
[Architecture Transition Closure And Context Objective Focus](/projects/execution-platform/specs/architecture-transition-closure-and-resource-objective-focus).
This spec remains the node-local target, but the next implementation tranche
must delete the old executable topology, narrow context requirements before
payload construction, execute scope revision in production, and make
WorkIntent context resolution read `NodeResourceDemandSession` plus
`NodeResourceLedger` state instead of graph `context_supplies` edges.

2026-05-27 mandatory focus update: node-local demand is not enough if the
runtime opens demand sessions from broad `targetRefs`, packet
`likelyRepoAreas`, or approved repo scope. The governing companion spec is
[Mandatory Context Focus And Target Selection Boundary](/projects/execution-platform/specs/mandatory-context-focus-and-target-selection-boundary).
Every node resource demand, context requirement packet, and scout specialist
subturn must start from an accepted model-authored `ResourceObjectiveFocus`.
Every source-edit snapshot must later require accepted model-authored target
selection. Runtime may compile the legal resource universe and validate
membership, authority, counts, budgets, payload storage, and next
transitions; it must not choose relevant refs or target files.

2026-05-28 production wiring update: the scheduler no longer advertises
`context.demand.open` beside missing focus. Missing focus produces
`context.focus.request_for_work_intent`; accepted focus produces
`context.demand.open`. This keeps demand sessions execution-adjacent and
node-local while preventing the old broad resource-fulfillment path from smuggling
itself back in as a readiness repair.

2026-05-28 exact-fulfillment update: an open `NodeResourceDemandSession` is no
longer a terminal scheduler blocker. The next production transition is
`context.demand.fulfill_exact_handles`. Runtime may fulfill only exact,
model-selected legal handles: bounded file-window refs, bounded symbol refs,
validation refs, or memory-pack refs that already fit the demand budget and
authority. Broad file refs, directory refs, repo areas, target refs, oversized
units, mixed fulfillment kinds, and vague handles must dispatch the
consumer-bound specialist narrowing subturn. Runtime must not pick line ranges
or semantic sub-scopes from broad handles.

2026-05-28 specialist-narrowing live transition update: `context_narrowing_required`
is not a global scheduler repair point. Once `context.scout.narrow_scope`
creates a consumer-bound request, the runtime must invoke a dedicated
small-verb narrowing selector that may return only
`context.scout.submit_exact_handles` or
`context.scout.mark_narrowing_blocked`. Accepted exact handles are then
validated structurally against authority and window budgets, fulfilled into
the same `NodeResourceDemandSession`, and appended to the node-local
`NodeResourceLedger`. Selector failures, missing selectors, invalid exact refs,
and model-declared blockers must surface as typed narrowing blockers; they
must not fall back to GPT scheduler graph repair or durable scout fanout.

2026-05-28 focus gateway repair update: the `context.focus` small-verb gateway
accepts exact legal `ref` strings from the model-facing handle menu as aliases
for their generated handles. This is a structural membership repair only:
runtime maps `ref -> handle` when the ref is already in the legal universe and
still rejects invented refs, approximate labels, partial filenames, and
anything outside the menu.

2026-05-28 lifecycle runner update: node-local demand is not complete until a
mandatory `NodeLifecycleTransitionRunner` owns the transition sequence. The
scheduler must not call the global orchestrator while local focus, demand,
specialist narrowing, target-selection, write-gate, validation, or evidence
transitions remain pending. The governing implementation spec is
[Node Lifecycle Transition Runner](/projects/execution-platform/specs/node-lifecycle-transition-runner).

2026-05-28 convergence correction: the lifecycle runner item closed in the DB,
but code review showed old lifecycle assumptions still survive in scheduler
readiness, WorkIntent context resolution, capability registry transition
inference, resource materialization, worker prompt menus, readback, and replay.
The governing corrective spec is
[Canonical Lifecycle Convergence And Residue Excision](/projects/execution-platform/specs/canonical-lifecycle-convergence-and-residue-excision).
Node-local node resource demand is accepted only when those surfaces consume the
runner projection/descriptors and no retired resource-fulfillment/scout/synthesis
path remains importable as a positive production path.

2026-05-31 worker-owned search/read correction: node-local demand now moves
inside the worker execution lifecycle for implementation/test/docs-edit nodes.
The governing spec is
[Worker-Owned Context Search/Read Lifecycle](/projects/execution-platform/specs/worker-owned-context-search-read-lifecycle).
Required pre-worker implementation materialization is retired entirely, not
kept as optional cache or hints. The worker starts from a partial
runner-authorized packet and drives search/read/window expansion through small
verbs; runtime validates and hydrates exact windows into the node ledger.
`before_resource_materialization`, `after_resource_materialization`, fixed
first-window readiness, and `resource_fulfillment` handoff repair cannot count
as positive proof success.

## Target Architecture

The Product/Spec proof path must now be:

```text
Mission Ledger
  -> Commitment Work Packets
  -> WorkIntentGraph
  -> NodeExecutionContract
  -> partial NodeExecutionPacket
  -> node-local NodeResourceDemandSession
  -> NodeResourceLedger append
  -> model-authored target selection
  -> hydrated write gate
  -> forced patch author
  -> validation
  -> evidence
  -> review/readback/closeout
```

The retired path is:

```text
Commitment Work Packets
  -> broad context scout fanout
  -> global or default context synthesis
  -> implementation groups
  -> worker execution
```

Graph nodes schedule semantic work. Context acquisition is resource demand
for a consumer node unless a workflow explicitly defines a coordination node.
Context shards, scout packets, handoffs, and merge packets are internal
fulfillment details for a `NodeResourceDemandSession`, not default graph topology.

## Non-Negotiable Boundaries

Runtime may:

- validate schemas, refs, ids, hashes, byte budgets, authority, locks,
  lifecycle, and next legal transitions;
- open and close node-local node resource demand sessions;
- execute repo/file/test/memory tools against model-authored requests;
- dispatch a specialist scout subturn only when a node-local demand cannot be
  fulfilled by direct tools;
- append ledger entries and persist full bodies as artifact-backed payloads;
- summarize ledger manifests structurally for readback and execution packets;
- enforce write gates before edit tools are available;
- delete retired production, replay, proof, fallback, and compatibility
  surfaces.

Runtime must not:

- rank, truncate, summarize, or discard semantic context to make input fit;
- infer file relevance, edit intent, sufficiency, or waiver rationale from
  filenames, substrings, Product/Spec wording, or artifact refs;
- widen executable authority from context prose;
- treat broad scout output, context synthesis, diagnostic replay, fallback
  code, or provider rescue as clean proof success;
- keep retired code importable "just in case".

Runtime also must not pre-join all possible context into a single model
payload. A context requirement may compile only from a model-authored
`ResourceObjectiveFocus` or equivalent accepted focus decision that states the
current unknown, expected use, selected legal refs/windows, and stop condition.
The previous pattern of copying up to dozens of target refs, candidate repo
refs, source refs, semantic questions, prompt summaries, repo summaries, and
commitment packet summaries into every scout payload is retired.

Models or humans must author:

- node resource demand reason and expected use;
- relevant file, symbol, pattern, risk, edit point, and validation findings;
- insufficiency, limitation, and waiver rationale;
- target selection and file-change intent;
- patch semantics and closeout judgment.

## Work Queue Items

### 0. Mandatory Context Focus And Target Selection Boundary

Work item id:

`openclaw-convergence.mandatory-context-focus-target-selection-boundary`

Purpose:

Make the focus/target narrowing boundary mandatory before the remaining
node-local context work. `NodeResourceDemandSession` must not open from broad
runtime-owned refs; it opens from accepted model-authored
`ResourceObjectiveFocus`. Source-edit snapshots must not compile from broad
target seeds; they compile from accepted model-authored target selection.

Acceptance criteria:

- no default context/scout candidate roots from approved repo scope,
  WorkIntent/graph `targetRefs`, or packet `likelyRepoAreas`;
- context requirement packets, demand sessions, and scout specialist subturns
  require accepted focus or a workflow-defined equivalent focus capability;
- source-edit materialization requires accepted target selection before
  snapshots;
- runtime validates structural constraints only.

### 1. Node-Local Context Demand Session Core

Work item id:

`openclaw-convergence.node-local-node-resource-demand-session-core`

Purpose:

Add `NodeResourceDemandSession` as the canonical context lifecycle for a consumer
node. Workers and scheduler transitions open exact demand sessions; runtime
validates structure, refs, authority, budgets, and next transitions.

2026-05-27 rescope:

- remove production calls that create default durable `context_scout` graph
  prerequisites;
- open a demand session instead of applying a graph-node fanout decision;
- make `context.demand.open` the next legal transition when context is
  needed before write readiness;
- preserve compatibility only in historical docs/tests, not production.

Required contracts:

- `NodeResourceDemandSession`
- `NodeResourceDemandRequest`
- `NodeResourceDemandFulfillment`
- `NodeResourceDemandBlocker`
- `NodeResourceDemandDecision`

Required small verbs:

- `context.demand.open`
- `context.demand.fulfill_exact_handles`
- `context.demand.request_file_window`
- `context.demand.request_symbol`
- `context.demand.request_related_tests`
- `context.demand.request_memory_pack`
- `context.scout.narrow_scope`
- `context.scout.submit_exact_handles`
- `context.scout.mark_narrowing_blocked`
- `context.demand.mark_blocked`
- `context.demand.close`

Acceptance criteria:

- No durable `context_scout` graph node is created as default readiness
  repair.
- Every node resource demand is bound to a consumer node, WorkIntent, capability,
  evidence mode, and authority scope.
- Direct repo/file/test/memory fulfillment is attempted only for exact
  model-selected handles. Broad or vague handles go to specialist narrowing;
  runtime never chooses the line window.
- Demand state names the current legal transition and exact blocker when it
  cannot proceed.

### 2. Node Context Ledger

Work item id:

`openclaw-convergence.node-resource-ledger`

Purpose:

Add an append-only `NodeResourceLedger` for each executable node. The ledger
stores compact manifests in execution packets and artifact-backed bodies for
substantive context.

2026-05-27 manifest/OOM rescope: ledger and demand metadata must have explicit
byte-count gates for graph metadata, Work Queue projections, latest-run-state,
and runtime artifact metadata. Full context bodies must live behind payload
refs. The proof environment must record largest metadata/object sizes and heap
use by phase so a Node heap OOM cannot be treated as unrelated noise.

Required contracts:

- `NodeResourceLedger`
- `NodeResourceLedgerEntry`
- `NodeResourceLedgerManifest`
- `NodeResourceLedgerPayloadRef`

Ledger entry kinds:

- `file_window_opened`
- `symbol_inspected`
- `related_test_found`
- `memory_pack_opened`
- `relevant_file_reported`
- `existing_pattern_reported`
- `risk_reported`
- `edit_point_recommended`
- `validation_recommended`
- `limitation_reported`
- `provider_diagnostic_recorded`

Acceptance criteria:

- `NodeExecutionPacket` carries only ledger manifest refs/counts/hashes, not
  giant context bodies.
- Ledger bodies are payload-backed artifacts with bounded manifests.
- Context evidence survives replay and compaction through refs.
- Runtime validates refs and entry shape only; it does not judge semantic
  quality.

### 3. Progressive Node Execution Packet

Work item id:

`openclaw-convergence.progressive-node-execution-packet`

Purpose:

Allow workers to begin read/context phases from a partial
`NodeExecutionPacket` while write/edit tools remain gated on target
selection, snapshots, authority, validation refs or structural defaults, and
evidence expectations.

Required packet states:

- `partial_context_allowed`
- `node_resource_demand_open`
- `resource_ledger_ready`
- `target_selection_required`
- `write_gate_blocked`
- `worker_edit_ready`
- `post_edit_validation_required`
- `evidence_required`

Acceptance criteria:

- Worker startup no longer requires full precomputed context when the next
  legal action is node resource demand.
- Source edit tools are unavailable until the write gate is hydrated.
- The worker sees one legal transition set at each phase.
- A partial packet cannot be mistaken for source-edit readiness.

### 4. Context Scout Specialist Subturn

Work item id:

`openclaw-convergence.context-scout-specialist-subturn`

Purpose:

Convert context scout execution from default graph node to optional
consumer-bound specialist subturn. Scout runs only when direct node resource demand
tools cannot satisfy the node-local request.

Allowed scout triggers:

- the demand spans many files or symbols and needs a specialist search pass;
- direct tool fulfillment returns insufficient candidate refs;
- model-authored demand asks for cross-file pattern mapping;
- workflow definition explicitly grants a scout specialist for the node.

Acceptance criteria:

- A scout subturn returns to the requesting `NodeResourceDemandSession`.
- Scout artifacts append to the node resource ledger.
- Scout execution cannot create standalone executable graph progress.
- Existing context shard/frontier machinery may be reused only internally as
  fulfillment plumbing for a demand session.
- The closure proof must include a non-trivial real-model discovery and target
  narrowing canary. Runtime provides a broad legal-ref universe and authority
  bounds, but does not seed the known target files. The model must author
  `ResourceObjectiveFocus`, open or drive a node-local `NodeResourceDemandSession`,
  collect scoped context into the `NodeResourceLedger`, and later select target
  refs from ledger evidence. Runtime validates membership, authority, count,
  budget, storage, and lifecycle only.

Implementation contract:

- Specialist scout dispatch is a small-verb transition from a concrete
  `NodeResourceDemandSession`, not graph repair. The canonical verbs are
  `context.scout.dispatch_specialist_subturn`,
  `context.scout.submit_specialist_handoff`,
  `context.scout.mark_specialist_blocked`,
  `context.scout.append_handoff_to_ledger`, and
  `context.scout.project_specialist_result`.
- Dispatch is illegal unless direct context fulfillment was attempted or an
  explicit workflow specialist grant is present. Runtime validates the
  presence of that structural precondition; it does not judge whether the
  direct context was semantically sufficient.
- The specialist model authors context findings only: relevant files,
  existing patterns, risks, edit points, validation suggestions, limitations,
  and bounded provider diagnostics. Runtime validates refs, authority, schema,
  storage policy, and lifecycle.
- Full specialist requests, handoffs, and results are payload-backed runtime
  artifacts. Metadata carries only bounded manifests: refs, hashes, counts,
  byte counts, state, and short previews. No raw prompt, raw response, full
  file snapshot, handoff body, or ledger entry body may be stored in graph,
  Work Queue, or runtime artifact metadata.
- A specialist handoff can only make the consumer ledger richer. It cannot
  unlock source-edit authority by itself; target selection, resource
  hydration, write gate readiness, validation expectations, and evidence
  requirements remain separate downstream gates.

Representative middle-lane proof requirement:

- Use a real execution-platform maintenance objective that is smaller than the
  full Product/Spec prompt but larger than a one-line unit smoke. The legal
  universe should include dozens of plausible files across workflows, worker
  runtime, Work Queue/readback, scripts, and governing specs.
- The proof harness may know an expected target set as an evaluation oracle,
  but that set must not be passed to the runtime as `targetRefs`, seeded
  snapshots, likely repo areas, or implementation hints.
- Passing evidence must show:
  - provider/model call diagnostics for focus, demand/scout, and target
    selection;
  - accepted model-authored focus refs and semantic questions;
  - node-local demand/session refs and bounded file-window or specialist
    handoff refs;
  - ledger manifest refs with payload-backed bodies;
  - model-authored target selection citing ledger/context evidence;
  - no graph-level scout fanout and no context synthesis path;
  - manifest-only metadata and provider-safe payload sizes.
- Failure evidence must distinguish `context_focus_blocked`,
  `node_resource_demand_blocked`, `context_specialist_subturn_blocked`,
  `resource_ledger_insufficient`, and `target_selection_blocked`. It must not
  fall back to stale `resource_fulfillment`, generic `needs_review`, or runtime-made
  target selection.

### 5. Context Synthesis Production Retirement

Work item id:

`openclaw-convergence.context-synthesis-runtime-deletion-closure`

Purpose:

Hard-delete default context synthesis production and replay paths. Future
coordination workflows must define a new explicit coordination capability
instead of reusing retired `context_synthesis` glue.

Required removals:

- default `context_synthesis` executor registration;
- `after-context-synthesis` replay boundary;
- context synthesis production proof lanes;
- context synthesis as replay readiness evidence;
- environment flags that resurrect synthesis;
- tests that expect context synthesis as default topology.

Acceptance criteria:

- No production executor map registers `kind:context_synthesis` or
  `role:context_synthesis`.
- No replay path accepts or creates `after-context-synthesis`.
- No broad context synthesis artifact can unlock implementation.
- Any future coordination node must be introduced as a new explicit
  workflow-defined capability with its own proof.

2026-05-27 implementation result:

- Deleted/default-disabled production and replay surfaces remain absent:
  `context-synthesis.ts`, `post-synthesis-graph-policy.ts`, the old
  context-scout boundary replays, and the old context-synthesis model-lane
  proof scripts are gone from the source tree.
- Runtime repair classification no longer routes artifact metadata overflow
  through a context-synthesis boundary; it selects `artifact_storage`.
- Commitment work packets no longer expose stale synthesis-quality gate fields
  or helpers that could unlock scheduling outside the WorkIntent/node-resource-demand
  spine.
- Context scout loop/readback metadata now projects
  `nodeResourceDemandReadiness`/`nodeResourceDemandBlockers` and consumer handoff
  summaries, not synthesis readiness.
- Product/Spec replay no longer records compatibility flags such as
  `contextSynthesisDefaultDisabled`, `defaultContextSynthesisRetired`, or
  `contextSynthesisAllowed`.
- Source inventory reports zero blocked survivors and a 5,027-line runtime
  and proof-surface reduction.
- Closure proof:
  `.artifacts/execution-platform/context-synthesis-runtime-deletion-closure-proof/proof.json`.
- Non-trivial real model proof:
  `.artifacts/execution-platform/context-scout-specialist-subturn-real-model-proof/proof.json`.

### 6. Worker Readiness, Forced Edit, Validation, And Evidence

Existing work item id:

`openclaw-convergence.blocker-closure-04-worker-readiness-edit-evidence`

Rescoped purpose:

After node-local node resource demand exists, prove the worker path:

```text
partial NodeExecutionPacket
  -> node resource demand
  -> context ledger
  -> target selection
  -> hydrated write gate
  -> forced patch author
  -> validation
  -> evidence
```

Acceptance criteria:

- The worker never receives ambiguous source-edit work.
- The worker can request exact node-local context before write readiness.
- Once an edit plan is accepted, broad tool selection stops and the forced
  patch-author path owns the edit boundary.
- Validation and evidence are produced from runtime refs.

### 7. Readback, Root-Cause Collapse, And Provider Diagnostics

Existing work item id:

`openclaw-convergence.readback-rootcause-provider-heap-closure`

Rescoped purpose:

Readback must project the new lifecycle, not stale `resource_fulfillment` or
`commitment_work_packets` labels. It must also expose proof-environment
memory and manifest pressure so metadata overflow and Node heap OOM symptoms
are diagnosable from canonical readback rather than artifact archaeology.

Required gate names:

- `node_resource_demand_open`
- `node_resource_demand_blocked`
- `resource_ledger_ready`
- `target_selection_blocked`
- `write_gate_blocked`
- `worker_edit_ready`
- `post_edit_validation`
- `evidence_closure`

Required bounded diagnostics:

- provider/model/profile identity;
- request byte count, max input/output settings, timeout and preflight state;
- provider-started flag, native finish reason, choice count, content lengths,
  usage or unavailable reason, retry number, concurrency slot, input bundle
  ref/hash, and response-shape keys;
- heap phase snapshot refs, largest metadata bytes/ref, largest artifact body
  bytes/ref, latest-run-state bytes, scheduler-progress bytes, Work Queue
  projection bytes, provider request bytes, and reason codes;
- raw prompt, raw response, raw provider log, raw tool log, raw command log,
  raw DB rows, hidden reasoning, and secrets must remain absent.

Acceptance criteria:

- `firstOpenGate` projects from canonical demand, ledger, readiness, write
  gate, validation, evidence, and root-cause state.
- Provider diagnostics include preflight vs provider distinction, request
  bytes, timeout state, finish reason, choice count, content lengths, usage
  or unavailable reason, retry number, concurrency slot, and input bundle ref.
- Proof-environment diagnostics include heap phase, metadata size, artifact
  body size, provider request size, and fail-fast manifest bounds.
- Repeated equivalent blockers collapse once without losing successful
  sibling evidence.

### 8. Legacy Proof/Test Purge

Work item id:

`openclaw-convergence.legacy-proof-test-purge`

Purpose:

Delete or rewrite tests and proofs that encode retired topology.

Required purge targets:

- context-synthesis proof lanes;
- after-context-synthesis replay tests;
- broad scout boundary replay tests;
- context-synthesis scheduler handoff tests;
- stale fixtures expecting graph-level scout fanout;
- proof harnesses that count broad context/synthesis as Product/Spec success.

Acceptance criteria:

- Obsolete tests/proofs are deleted, not skipped.
- Remaining tests encode node-local demand, ledger, progressive packet,
  specialist scout subturn, and hard synthesis retirement.
- The test suite cannot pass by keeping compatibility fixtures for retired
  paths.

### 9. Legacy Runtime Code Evisceration

Work item id:

`openclaw-convergence.legacy-runtime-code-evisceration`

Purpose:

Remove old runtime code entirely. The new system must work without fallback
lanes, compatibility shims, or diagnostic production bypasses.

Required purge targets:

- context synthesis executor registration;
- context synthesis artifact compiler when not used by an explicit new
  workflow capability;
- post-synthesis graph policy;
- default context scout prerequisite creation;
- after-context-synthesis replay boundary;
- compatibility flags that resurrect old topology;
- broad graph repair paths that create context scout fanout as readiness
  repair.

Acceptance criteria:

- Measurable net LOC reduction in execution-platform scheduler, runner,
  replay, and proof surfaces.
- No retired production path remains importable.
- Any allowed historical reference is isolated to docs or migration history
  and cannot run.

### 10. Architecture Residue Source Inventory Gate

Work item id:

`openclaw-convergence.architecture-residue-source-inventory-final-gate`

Purpose:

Add a source inventory gate that fails on production imports/usages of retired
concepts.

This final gate writes only a bounded manifest under
`artifact://execution-platform/architecture-residue-source-inventory-final-gate/manifest.json`;
the full survivor inventory stays in the payload artifact and must not be
embedded in Work Queue metadata, checkpoint metadata, or closeout metadata.

Inventory must flag:

- `context_synthesis`
- `after-context-synthesis`
- default `context_scout` graph prerequisite creation
- broad context supply/fanout
- compatibility/fallback flags for retired topology
- diagnostic-only boundaries wired to production success

Acceptance criteria:

- The inventory report lists every surviving legacy term and why it is
  allowed.
- Allowed references are minimal and explicit, ideally historical docs only.
- The gate fails if retired production paths become importable again.

### 11. Replay And Full Proof Gates

Existing work item id:

`openclaw-convergence.blocker-closure-06-replay-and-full-proof-gates`

Rescoped purpose:

Run middle-lane proof only after the architecture and cleanup passes above.

Proof must show:

- a real implementation node starts from a partial execution packet;
- it requests context locally;
- it receives scoped file windows or precise blockers;
- it selects targets;
- it edits;
- it validates;
- it emits evidence;
- readback reflects the active gate without stale labels.

No broad scout, context synthesis, after-context-synthesis replay, or
diagnostic-only path counts as proof success.

## Cleanup Standard

The cleanup passes are not retirement-by-label. They must be destructive to
legacy code.

Required cleanup evidence:

- deleted obsolete tests/proofs, not skipped tests;
- deleted production fallback code, not disabled branches;
- no default `context_synthesis` executor registration;
- no `after-context-synthesis` replay boundary;
- no graph-level context scout fanout as default readiness repair;
- no compatibility flags that can resurrect the old path;
- measurable LOC reduction in execution-platform scheduler, runner, replay,
  and proof surfaces;
- source inventory report listing every surviving legacy term and why it is
  allowed.

If the cleanup pass produces only a minor codebase reduction, it has not met
this spec. The old architecture has already caused repeated proof failures by
remaining partially alive.

## 2026-05-28 Product/Spec Proof Substrate Scrub

The cleanup standard also applies to proof artifacts and closeout scripts. A
stale replay that contains graph-visible context acquisition, legacy context
supply fanout, or old runtime/graph ids is a negative fixture. It must not be
counted as Product/Spec proof progress, even if a narrow worker component
proof passed against it.

Required behavior:

- boundary replay writes a run-scoped proof directory and manifest for every
  closure candidate;
- closeout reads the proof-run manifest, not shared latest files;
- the manifest must carry the admitted closure predicate and all proof artifact
  refs must belong to the same proof-run directory;
- source inventory fails if the closeout script hard-codes stale Product/Spec
  replay paths or known stale runtime/graph ids;
- shared latest proof files may remain as operator readback mirrors only;
- proof success requires node-local topology, run-scoped artifacts,
  model-authored focus/target selection, hydrated write readiness, validation,
  and evidence.

The gateway OOM observed during submit is a separate proof-environment
blocker. A kilobyte-scale prompt cannot directly explain a 4GB heap failure.
The front door must preserve bounded submit-phase heap diagnostics so the next
failure can be attributed to summary indexing, router request construction,
provider response handling, artifact persistence, runtime-job enqueue,
container state, or another measured phase.
