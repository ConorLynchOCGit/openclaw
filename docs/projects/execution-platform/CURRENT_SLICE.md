# Current Slice

## 2026-05-31 Current Slice: Worker-Owned Context Search/Read Lifecycle

The current corrective decision is stronger than the previous
pre-worker-materialization compromise. Required implementation materialization
before worker start is retired for implementation/test/docs-edit nodes. It is
not retained as optional cache or hints for readiness.

Governing spec:

- `specs/worker-owned-context-search-read-lifecycle.md`

Core decision:

```text
NodeLifecycleTransitionRunner owns lifecycle.
Worker model owns semantic search/read/window choices inside legal transitions.
Runtime executes search/read/hydration/validation and writes payload-backed refs.
```

Required production path:

```text
WorkIntent -> partial worker packet -> worker context search/read loop
  -> model expands/contracts/accepts exact windows
  -> node resource ledger -> resource/target selection
  -> edit/action plan -> validation -> evidence
```

Retired positive paths:

- required `ImplementationContextSnapshotCompiler` before worker invocation;
- `before_resource_materialization` / `after_resource_materialization` as
  proof success gates;
- fixed first-window or first-120-lines worker readiness;
- `resource_fulfillment_handoff_artifact_missing` as live repair;
- scheduler-side semantic context sufficiency repair;
- graph-level context scout fanout and context synthesis.

The immediate implementation pass must add model-owned worker context search,
open-around-match, expand-window, contract-window, accept-window, pattern, and
edit-point verbs; route them through the runner-owned worker lifecycle; append
hydrated windows and findings to the node ledger; and delete the required
pre-worker materialization path from production/replay proof success.

## 2026-05-29 Current Slice: Node Lifecycle Transition Ownership Consolidation

The active architectural correction is no longer a narrow
`domain_resource_selection_required` repair. Code search showed the broader
failure class: many lifecycle tools and parsers exist, but several production,
proof, replay, and worker surfaces can still bypass
`NodeLifecycleTransitionRunner` and behave like independent state machines.

Governing spec:

- `specs/node-lifecycle-transition-ownership-consolidation.md`

Core decision:

```text
NodeLifecycleTransitionRunner is the only owner of node-local lifecycle
transitions. Scheduler orders work. Runner advances lifecycle. Helper modules
compile contracts, manifests, parses, validation, and payload refs only.
```

This consolidation pulls these gates under runner-owned transition handlers:

- `resource_focus_required` / `resource_focus_blocked`
- `resource_demand_open_pending` / `resource_demand_open`
- `resource_narrowing_required`
- `resource_ledger_ready`
- `domain_resource_selection_required` /
  `domain_resource_selection_blocked`
- `domain_action_gate_blocked`
- `worker_action_ready`
- `post_action_validation`
- `evidence_closure`
- `node_lifecycle_root_cause_collapsed`
- readback first-open-gate projection

The implementation must delete alternate lifecycle owners rather than add
another abstraction. In particular, do not create a
`DomainResourceSelectionRunner`; domain resource selection is one handler in
the node lifecycle runner.

Required closure gates:

- no proof/replay closure path directly calls providers for lifecycle model
  turns outside approved model-router adapters;
- no duplicate resource-selection tool dialects remain in production closure
  paths;
- worker prompts expose only `NodeLifecycleProjection.nextLegalTransitions`;
- helper modules have no lifecycle ownership;
- readback consumes `NodeLifecycleProjection` and root-cause artifacts;
- retired graph-level context scout fanout and context synthesis are negative
  evidence only;
- lifecycle manifests stay metadata-bounded with payload-backed bodies;
- a real middle-lane proof reaches evidence or a precise runner root cause
  without global scheduler repair.

DB order recorded by
`.artifacts/execution-platform/node-lifecycle-transition-ownership-queue-update.json`:

1. `openclaw-convergence.node-lifecycle-transition-ownership-consolidation`
2. `openclaw-convergence.shared-domain-resource-lifecycle-contract-refactor`
3. `openclaw-convergence.product-spec-planning-domain-profile-respec`
4. `openclaw-convergence.domain-resource-small-verb-tool-surface`
5. `openclaw-convergence.capability-manifest-domain-lifecycle-upgrade`
6. `openclaw-convergence.proof-framework-executor-subject-split`
7. `openclaw-convergence.product-spec-framework-coding-system-implementation-proof`
8. `openclaw-convergence.source-inventory-domain-lifecycle-residue-gate`
9. `openclaw-convergence.active-queue-34`

## 2026-05-28 Current Slice: Shared Domain Resource Lifecycle Alignment

DB truth currently has `openclaw-convergence.active-queue-34` as the active
Product/Spec proof item, but the Product/Spec Planning system spec and proof
framework still carry stale context/coding-shaped architecture. The current
slice inserts a resource-lifecycle alignment tranche before the proof.

Governing spec:

- `specs/shared-domain-resource-lifecycle-and-product-spec-alignment.md`

2026-05-29 implementation status: the shared contract refactor is now the
active production shape, not just a planning note. Generic workflow phases and
execution intent use `resource_demand`; lifecycle projections use
resource/action gates; staged scheduler and WorkIntent model-facing contracts
use `resourceRefs`; retired staged-scheduler `targetRefs` is rejected at the
contract boundary. Coding-domain target/write/edit names remain only as domain
profile mappings, transport compatibility fields, negative proof predicates,
or historical references.

2026-05-29 source implementation update: `SharedDomainResourceLifecycleProfile`
now binds runtime capabilities to domain profiles. `RuntimeNodeCapability`
projects `domainProfileId`, resource selection profile refs, domain action
gate profile refs, domain action gate kinds, domain worker action tools, and
domain evidence kinds. `NodeLifecycleTransitionRunner` projects
`worker_action_ready` from the active capability's domain worker tools, so
Product/Spec Planning cannot inherit coding edit/patch tools.

2026-05-29 Product/Spec domain-profile re-spec proof status: the
resource-manifest Product/Spec executor profile now has a real model
middle-lane proof at
`.artifacts/execution-platform/product-spec-domain-profile-real-model-proof/manifest.json`.
The proof validates model-authored planning-domain resource focus,
node-local resource demand and ledger evidence, model-authored
`planning.intent.record`, planning artifact validators, evidence profile
acceptance, and runner-projected Product/Spec worker action tools. The proof
explicitly rejects coding snapshot readiness, `node.resource_materialization`,
`worker.edit.plan`, patch tools, raw provider payload storage, and child
execution auto-start for Product/Spec Planning.

2026-05-29 domain-resource small-verb tool-surface status: the queue item now
has source and model evidence. `domain-resource-small-verb-tool-surface.ts`
defines one canonical projection-gated surface for shared resource verbs,
`resource.selection.*`, `domain.action_gate.*`, coding worker verbs, and
Product/Spec planning verbs. Runtime registration uses the same canonical
families, and Product/Spec/coding menus reject the wrong domain's action
verbs. The real model proof at
`.artifacts/execution-platform/domain-resource-small-verb-real-model-proof/manifest.json`
passed with a model-authored `planning.action_graph.propose` call compiled
into a bounded planning artifact manifest.

Core architecture:

```text
one lifecycle spine
  -> WorkflowDefinition / CapabilityManifest
  -> WorkIntentGraph
  -> NodeExecutionContract
  -> ResourceObjectiveFocus
  -> NodeResourceDemandSession
  -> NodeResourceLedger
  -> DomainResourceSelection
  -> ProgressiveNodeExecutionPacket
  -> DomainActionGate
  -> worker small-verb loop
  -> validation/evidence/readback/closeout
```

Coding and Product/Spec Planning are domain profiles over the shared spine,
not separate runners. Coding maps the shared gates to file windows, target
files, write gates, patch authoring, and changed-file evidence. Product/Spec
Planning maps them to prompt sections, owner constraints, project facts,
research briefs, planning capsules, action graph proposals, compile
readiness, human decisions, and planning evidence.

Required DB order:

1. `openclaw-convergence.shared-domain-resource-lifecycle-contract-refactor`
2. `openclaw-convergence.product-spec-planning-domain-profile-respec`
3. `openclaw-convergence.domain-resource-small-verb-tool-surface`
4. `openclaw-convergence.capability-manifest-domain-lifecycle-upgrade`
5. `openclaw-convergence.proof-framework-executor-subject-split`
6. `openclaw-convergence.product-spec-framework-coding-system-implementation-proof`
7. `openclaw-convergence.source-inventory-domain-lifecycle-residue-gate`
8. `openclaw-convergence.active-queue-34`

The Product/Spec framework implementation proof is deliberately before the
final source inventory gate. It must execute through `agent_team.coding` with
`agent_team.product_spec_planning` as target subject and implement a
meaningful Product/Spec framework slice, not a toy edit. The source inventory
gate then verifies the coding-system proof did not reintroduce retired
context/coding-shaped generic paths.

## 2026-05-28 Current Slice: Canonical Lifecycle Convergence Correction

The active slice is now a corrective convergence pass. Runtime DB state says
the previous legacy cleanup, worker readiness, node lifecycle runner, proof
substrate scrub, and gateway OOM items are closed, but replay/code review
showed the transition was incomplete: multiple production components still
infer lifecycle gates and legal next transitions independently.

Governing spec:

- `specs/canonical-lifecycle-convergence-and-residue-excision.md`

Core acceptance gates:

- `NodeLifecycleTransitionRunner` is the only authority for current gate,
  legal local transitions, and global-scheduler permission;
- scheduler readiness, WorkIntent context resolution, capability profiles,
  resource materialization, worker tool menus, readback, and replay consume
  runner projections/descriptors instead of re-inferring gates;
- stale context handoff/scout/synthesis replay paths are negative evidence
  only;
- worker prompts never expose tools outside the canonical gate;
- source inventory reports zero production survivors for retired topology and
  duplicate lifecycle authority;
- the no-model lifecycle walk reaches evidence or an exact root-cause artifact
  without global graph repair.

Required DB order:

1. `openclaw-convergence.lifecycle-authority-collapse-and-runner-wiring`
2. `openclaw-convergence.worker-readback-replay-surface-excision`
3. `openclaw-convergence.lifecycle-residue-inventory-and-no-model-walk`
4. `openclaw-convergence.blocker-closure-06-replay-and-full-proof-gates`
5. `openclaw-convergence.active-queue-34`

Closed prior items are not reopened. This slice records that their closure
left residue and fixes that residue directly.

DB order recorded by
`.artifacts/execution-platform/canonical-lifecycle-convergence-queue-update.json`.

## 2026-05-28 Current Slice: Node Lifecycle Transition Runner

The active slice is to make node-local lifecycle transitions authoritative.
The latest code review showed that the current scheduler can still fall
through to global graph repair while work-intent context focus, context
demand, specialist narrowing, target selection, write-gate, validation, or
evidence transitions remain legal.

Governing spec:

- `specs/node-lifecycle-transition-runner.md`

Core acceptance gates:

- add `NodeLifecycleTransitionRunner` with capability/workflow-registered
  transition handlers;
- emit compact `NodeLifecycleProjection` artifacts;
- replace scheduler-local `tryAdvancePostResourceWorkIntentLifecycle` with
  runner dispatch;
- make `requestValidDecision()` assert that no pending lifecycle transition
  exists before it can invoke the orchestrator;
- stop using `nodeStatus === "planned"` as the lifecycle eligibility filter;
- update readback to consume `NodeLifecycleProjection`;
- extend capability manifests with transition profile fields;
- prove the regression set for `needs_review + node_resource_demand_open`,
  automatic demand open after accepted focus, broad-focus specialist
  narrowing, stale-blocker supersession, global-scheduler prevention, and
  exact readback gate projection.

DB order recorded by
`.artifacts/execution-platform/node-lifecycle-transition-runner-queue-update.json`:

1. `openclaw-convergence.node-lifecycle-transition-runner-spine`
2. `openclaw-convergence.product-spec-proof-substrate-scrub-run-scoped-closure`
3. `openclaw-convergence.gateway-submit-oom-diagnostics-memory-guard`
4. `openclaw-convergence.blocker-closure-06-replay-and-full-proof-gates`
5. `openclaw-convergence.active-queue-34`

## 2026-05-28 Current Slice: Product/Spec Proof Substrate Scrub

The active work is to make stale Product/Spec proof artifacts impossible to
mistake for closure evidence. The proof substrate now requires run-scoped
manifests under `.artifacts/execution-platform/proof-runs/<run-id>/`; closeout
must not read shared mutable latest files as truth. The manifest must carry an
admitted closure predicate, `proofClosureAllowed: true`, and artifact refs that
belong to the same proof-run directory. Stale retired topology, graph-level
context acquisition/fanout, stale runtime ids, stale graph ids, and
component-only worker proofs are negative fixtures.

The gateway submit OOM is treated as a proof-environment blocker, not a prompt
size conclusion. The router still receives the prompt. Submit diagnostics must
record bounded memory and payload-shape counters by phase so the next
container restart can be tied to the measured phase.

Next proof attempt must start from a fresh run-scoped replay manifest. A stale
after-resource replay that blocks with retired topology reason codes is a
successful negative-test result only.

Previous DB queue after this scrub, now superseded by the lifecycle-runner
rerank above:

1. `openclaw-convergence.product-spec-proof-substrate-scrub-run-scoped-closure`
2. `openclaw-convergence.gateway-submit-oom-diagnostics-memory-guard`
3. `openclaw-convergence.blocker-closure-06-replay-and-full-proof-gates`
4. `openclaw-convergence.active-queue-34`

## 2026-05-27 Current Slice: Architecture Transition Closure And Context Objective Focus

The current slice is now architecture transition closure before Product/Spec
proof. The latest code dive showed that new WorkIntent/context artifacts
exist, but production still runs old graph-level context behavior underneath:
durable `context_scout` fanout, checkpoint `resource_fulfillment` projection,
context-synthesis readiness compatibility, scope-revision request without
execution, and WorkIntent context resolution from graph `context_supplies`
edges.

Context scouting must be iterative, node-local, and execution-adjacent. Broad
pre-implementation context ceremonies, graph-visible context scout fanout,
and default context synthesis are not acceptable proof paths.

Governing specs:

- `specs/architecture-transition-closure-and-resource-objective-focus.md`
- `specs/mandatory-context-focus-and-target-selection-boundary.md`
- `specs/node-local-node-resource-demand-and-legacy-evisceration.md`
- `specs/code-verified-product-spec-blocker-closure-plan.md`

2026-05-27 update: `openclaw-convergence.architecture-transition-closure-gates`
and `openclaw-convergence.resource-objective-focus-and-requirement-narrowing`
are closed in the DB. The latter added `ResourceObjectiveFocus`, legal-ref
universe manifests, focus small verbs, requirement compile-from-focus gating,
broad-payload blockers, and a real Qwen middle-lane proof:
`.artifacts/execution-platform/resource-objective-focus-real-model-proof/proof.json`.

2026-05-27 focus hardening update: the next queue item makes focus
mandatory in production, not just available as a tool. Runtime cannot use
broad `targetRefs`, packet `likelyRepoAreas`, or approved repo scope as
context/scout roots or source-edit snapshots. Context demand and specialist
scout dispatch require accepted model-authored `ResourceObjectiveFocus`;
source-edit materialization requires accepted model-authored target
selection. Runtime validates legal handles, authority, counts, budgets,
payload storage, and lifecycle only.

2026-05-27 WorkIntent context resolution update:
`openclaw-convergence.workintent-context-resolution-from-ledger` rewires
`WorkIntentContextResolution` to consume node-local
`ResourceObjectiveFocus`, `NodeResourceDemandSession`, `NodeResourceLedger`,
target-selection, provider-diagnostic, limitation, and consumer-waiver refs
as canonical context readiness state. Legacy graph `context_supplies`
observations are now diagnostic-only unless explicitly workflow-defined, and
source-edit WorkIntents cannot become satisfied without model-authored target
selection. Validation includes the focused resolver suite, no-semantic-cheats,
scoped `tsgo:fast`, and the model-backed middle-lane proof:
`.artifacts/execution-platform/workintent-context-resolution-from-ledger-real-model-proof/proof.json`.

2026-05-28 exact node resource demand update:
`NodeResourceDemandSession` no longer stops at an open-session readback. The
scheduler now drives the next small verb: exact model-selected handles are
fulfilled and appended to `NodeResourceLedger`; broad/vague handles dispatch
`context.scout.narrow_scope` for specialist model narrowing. Runtime validates
handle membership, authority, kind, byte budget, metadata bounds, and
lifecycle only.

The focus gateway also now normalizes an exact legal ref from the model-facing
menu into its generated handle. This is structural tool-call repair only and
keeps invented refs, labels, and approximate filenames blocked.

Current DB queue head before the Product/Spec proof:

Closed in DB:

- `openclaw-convergence.mandatory-context-focus-target-selection-boundary`
- `openclaw-convergence.context-scout-specialist-subturn-production-closure`
- `openclaw-convergence.workintent-context-resolution-from-ledger`
- `openclaw-convergence.proof-harness-canonical-gate-rewrite`
- `openclaw-convergence.readback-rootcause-provider-heap-closure`
- `openclaw-convergence.context-synthesis-runtime-deletion-closure`

2026-05-27 readback/provider/heap update:
`openclaw-convergence.readback-rootcause-provider-heap-closure` projects the
node-local gate taxonomy, root-cause collapse, bounded provider response
shape, and proof-environment heap/manifest optics from canonical runtime
state. Proof artifact:
`.artifacts/execution-platform/readback-rootcause-provider-heap-closure-proof/proof.json`.

2026-05-27 context-synthesis runtime deletion update:
`openclaw-convergence.context-synthesis-runtime-deletion-closure` removed the
remaining live context-synthesis production/replay surfaces instead of adding
compatibility exclusion logic. Storage-overflow repair now routes to
`artifact_storage`, packet synthesis gate fields were deleted, context scout
handoff/readiness fields now use node-local demand/consumer terminology, and
Product/Spec replay no longer carries context-synthesis compatibility flags.
The source inventory gate reports zero blocked survivors and a 5,027-line
runtime/proof-surface reduction. Proof artifacts:
`.artifacts/execution-platform/context-synthesis-runtime-deletion-closure-proof/proof.json`
and
`.artifacts/execution-platform/context-scout-specialist-subturn-real-model-proof/proof.json`.

Next required DB order:

1. `openclaw-convergence.legacy-proof-test-purge-closure`
   - delete or rewrite obsolete proof/test topology.
2. `openclaw-convergence.legacy-runtime-code-evisceration-closure`
   - remove old runtime code, fallback paths, compatibility flags, and
     importable retired surfaces.
3. `openclaw-convergence.architecture-residue-source-inventory-final-gate`
   - add a source inventory gate for retired concepts and require meaningful
     net LOC reduction.
4. `openclaw-convergence.worker-readiness-edit-evidence-node-local-closure`
   - rescope to post-demand worker path: partial packet -> demand ledger ->
     target selection -> hydrated write gate -> forced patch author ->
     validation -> evidence.
5. `openclaw-convergence.blocker-closure-06-replay-and-full-proof-gates`
   - prove a real implementation node starts, requests context locally,
     receives scoped file windows, selects targets, edits, validates, and
     emits evidence.
6. `openclaw-convergence.active-queue-34`
   - full Product/Spec Planning Workflow Plugin Production Proof.

Cleanup standard: obsolete tests/proofs must be deleted or rewritten, not
skipped; production fallback code must be deleted, not disabled; there must be
no default `context_synthesis` executor registration, no
`after-context-synthesis` replay boundary, no graph-level context scout fanout
as default readiness repair, no compatibility flag that resurrects the old
path, and the cleanup must produce a meaningful net LOC reduction.

## 2026-05-26 Prior Slice: Code-Verified Product/Spec Blocker Closure

This prior slice was the full twelve-blocker Product/Spec closure tranche,
not another narrow context-scout patch. It has now been superseded by the
node-local node resource demand correction above because the remaining architecture
still placed context acquisition before execution instead of adjacent to the
consumer node.

Governing spec:

- `specs/code-verified-product-spec-blocker-closure-plan.md`

Current DB queue head before the Product/Spec proof:

1. `openclaw-convergence.blocker-closure-01-context-frontier-shard-tools`
   - execute shard packets, collect model-authored shard handoffs, review and
     merge handoffs, accept context for the consumer, and preserve limitation
     semantics.
   - Status: closed in DB from real Qwen provider proof
     `context-frontier-shard-real-model-mpn3wr32`; proof artifact
     `.artifacts/execution-platform/context-frontier-shard-real-model-proof/proof.json`.
2. `openclaw-convergence.blocker-closure-02-scope-revision-repair-payloads`
   - add model-authored scope revision for single-unit over-profile blockers
     and field-specific context scout repair payloads that do not re-bloat.
   - Status: closed in DB from real Qwen provider proof
     `context-scope-revision-real-model-mpn4xyh9`; proof artifact
     `.artifacts/execution-platform/context-scope-revision-real-model-proof/proof.json`.
3. `openclaw-convergence.blocker-closure-03-workintent-context-target-selection`
   - wire shard handoff refs into `WorkIntentContextResolution`, then require
     model-authored target selection and file-change intent before
     `NodeExecutionPacket` hydration.
4. `openclaw-convergence.blocker-closure-04-worker-readiness-edit-evidence`
   - enforce worker packet/snapshot/plan readiness and close the forced
     patch, validation, and evidence path on real Product/Spec-class work.
5. `openclaw-convergence.blocker-closure-05-readback-rootcause-provider-diagnostics`
   - fix canonical gate projection, root-cause collapse, and Qwen/Kimi
     provider diagnostics.
6. `openclaw-convergence.blocker-closure-06-replay-and-full-proof-gates`
   - run middle-lane model tests, replay from the nearest real boundary, then
     run the full Product/Spec proof.
   - closure evidence must come from
     `node scripts/execution-platform-run-product-spec-middle-lane-replay-proof.mjs`
     and its run-scoped manifest under
     `.artifacts/execution-platform/proof-runs/<run-id>/manifest.json`.
     Shared latest files and component-only proofs are supporting evidence,
     not closeout truth.
7. `openclaw-convergence.active-queue-34`
   - full Product/Spec Planning Workflow Plugin Production Proof.

The older context-frontier manifest and shard-execution queue rows are now
superseded by the closure tranche. Their specs remain linked as foundation
documents, but the DB-ranked path must close all twelve verified blockers so
we do not keep exposing one downstream contradiction at a time.

## 2026-05-26 Prior Slice: Context Frontier Shard Execution And Merge Lifecycle

The current Product/Spec replay advanced past clean packet reuse and
WorkIntent-style scheduler planning. The first context-frontier pass corrected
the graph explosion failure: replay `product-spec-replay-mpmz6z7v` kept the
graph bounded at `17` nodes / `21` edges and produced payload-backed frontier
requests, shard manifests, merge packets, and single-unit blockers. The
remaining blocker is the next legal lifecycle transition: executing shard
packets, collecting model-authored shard handoffs, merging them, accepting
consumer context state, and promoting the WorkIntent.

Governing spec:

- `specs/context-frontier-shard-execution-and-merge-lifecycle.md`
- `specs/context-frontier-lifecycle-and-shard-manifests.md`

Prior DB queue head before the Product/Spec proof:

1. `openclaw-convergence.context-frontier-shard-execution-merge-lifecycle`
   - execute payload-backed shard packets without creating graph nodes per
     shard;
   - collect model-authored `ContextShardHandoff` artifacts;
   - merge accepted shard handoffs into `ContextMergePacket`;
   - update canonical `WorkIntentContextSatisfactionState`;
   - replay the failed completed-packets boundary.
2. `openclaw-convergence.context-frontier-lifecycle-shard-manifests`
   - parent/foundation item for context frontier requests, shard manifests,
     single-unit blockers, and manifest-only graph refs.
3. `openclaw-convergence.active-queue-34`
   - full Product/Spec Planning Workflow Plugin Production Proof.

This is a general orchestrator correction: context resource fanout can be
large, but durable graph topology must stay semantic and bounded.

## 2026-05-26 Prior Slice: Control-Plane Executable Spine Recovery

This prior slice was the executable spine recovery before the next
Product/Spec proof. The scheduler demand-context item remains active, but it
is now the first gate in a broader six-item tranche rather than a standalone
fix.

Governing spec:

- `specs/control-plane-executable-spine-recovery.md`

Required pre-proof order:

1. `openclaw-convergence.scheduler-workintent-graph-demand-context-gate`
   - broadened to WorkIntent acceptance and capability manifest enforcement.
2. `openclaw-convergence.executable-spine-02-resource-requirement-reshard`
   - context requirement compiler plus exact-preflight structural reshard.
   - Current implementation state: focused context requirement/scout/tool/no-
     semantic-cheat/scheduler tests pass, `tsgo:fast` passes, and the dynamic
     runner now materializes provider-safe child `context_scout` nodes from
     structural shards. DB closeout is intentionally pending until the broader
     dynamic runner fixture failures are reconciled.
3. `openclaw-convergence.executable-spine-03-node-packet-hydration-gate`
   - NodeExecutionPacket/domain resource hydration before workers.
4. `openclaw-convergence.executable-spine-04-worker-one-edit-canary`
   - Product/Spec-derived worker small-verb edit, validation, evidence.
5. `openclaw-convergence.executable-spine-05-readiness-readback-collapse`
   - branch readiness, repeated-blocker collapse, owner readback truth.
6. `openclaw-convergence.executable-spine-06-replay-proof-gate`
   - production-faithful replay from completed packets and worker boundary.
7. `openclaw-convergence.active-queue-34`
   - full Product/Spec Planning Workflow Plugin Production Proof.

The architectural goal is domain-general: the same spine must support coding,
planning, research, QA, human task workflows, and future tool-heavy workflows.
Product/Spec coding execution is the first high-pressure proof.

DB reconciliation evidence:

- script:
  `scripts/execution-platform-record-executable-spine-recovery-queue.mjs`
- artifact:
  `.artifacts/execution-platform/executable-spine-recovery-queue-update.json`

## 2026-05-26 Prior Slice: Scheduler WorkIntentGraph Demand-Context Gate

The latest replay after the packet boundary fix reached scheduler planning
and stopped before valid context execution. Packet fanout completed cleanly,
packet review stayed skipped, and no GPT rescue was used. The next blocker is
now scheduler graph/readiness structure:

- the graph projected `work_intent` and `context_scout` nodes with no
  persisted dependency edges;
- readback reported `resource_fulfillment` as the first open gate even though the
  true gate was graph contract invalidity;
- context scouts appeared before a strict `WorkIntentGraph` and
  consumer-bound `ResourceRequirementPacket` boundary made them legal.

The prior governing spec was
`specs/scheduler-workintent-graph-demand-context-gate.md`.

The required path is:

```text
Commitment Work Packets
  -> WorkIntentGraph
  -> NodeExecutionContract
  -> ResourceRequirementPacket
  -> scoped context scout / resource materialization
```

The runtime must reject orphan context scouts, broad packet-level context
gates, and multi-node zero-edge graphs unless every node has a structurally
valid independent-root declaration. If graph structure is invalid, readback
must report `graph_compile_invalid` or a more precise structural gate, not
`resource_fulfillment`.

Current implementation evidence:

- DB queue item:
  `openclaw-convergence.scheduler-workintent-graph-demand-context-gate`.
- Canonical prompt:
  `prompts/scheduler-workintent-graph-demand-context-gate-codex.md`.
- Staged WorkIntent acceptance now binds selected capabilities to the runtime
  capability manifest before any context or executable node can be treated as
  legal work. Accepted WorkIntent metadata carries manifest-backed schema,
  adapter, evidence, authority, resource, and next-transition fields.
- The canonical small-verb root acceptance tool is
  `scheduler.work_intent.accept_roots`; production scheduler progress and the
  replay harness no longer depend on the retired
  `scheduler.accept_work_intent_roots` id.
- Focused validation passes for graph-decision invariants,
  `ResourceRequirementPacket`, Mission Work Packet intent validation,
  readback/no-semantic-cheat guards, and the node-scoped context scheduler
  lane.
- Full `runtime-work-graph-scheduler.test.ts` now passes under the
  WorkIntent-first policy; legacy context-first expectations were updated
  without relaxing production graph invariants.

## 2026-05-26 Prior Slice: Packet Source Selection And Execution Intent

The latest replay from completed Mission Ledger did not reach scheduler
planning. It failed in Commitment Work Packet fanout:

- 7/10 packets completed;
- `product-spec-plugin-production-native` and
  `product-spec-artifact-lifecycle` returned Qwen/OpenRouter no-content twice
  at the 150s timeout boundary;
- `checkpointed-proof-run` failed because the packet boundary still required
  `expectedImplementationOutput` for a proof-run commitment;
- the packet phase took 307.5s and successful lanes still carried roughly
  27-30KB input.

This prior slice was no longer "run the full Product/Spec proof". It was the
packet boundary correction documented in
`specs/commitment-packet-source-selection-and-execution-intent.md`.
The canonical Codex implementation prompt is
`prompts/commitment-packet-source-selection-execution-intent-codex.md`.

Pre-proof work now starts with:

1. model-authored `packet.source_refs.select` from the source prompt context
   index;
2. runtime-compiled `PacketSourceBundle` refs with no semantic truncation;
3. model-authored semantic intent through `packet.semantic.set_execution_intent`
   after source bundle selection; `packet.intent.set` remains diagnostic-only
   for callers that explicitly need preauthor intent;
4. intent-specific packet required fields;
5. targeted-normalization diagnostics equal to primary packet diagnostics;
6. Mission-Ledger replay proof through clean packet fanout;
7. scheduler-first demand-context verification only after packets pass.

The intended downstream architecture remains demand-driven:

```text
Mission Ledger
  -> Commitment Work Packets
  -> WorkIntent / worker-intent nodes
  -> node-scoped context requests as needed
  -> NodeExecutionPacket
  -> worker execution
```

Broad context scout fanout and context synthesis are not allowed as default
glue.

## 2026-05-25 Current Slice: Execution Contract Spine Before Product/Spec Proof

The latest Product/Spec replay/failure analysis showed that the full proof is
not the next honest queue head. The current P0 slice is now governed by
`specs/execution-contract-spine-resource-requirements-and-frontier-state.md`
and the decomposed proof-entry spec
`specs/product-spec-proof-hardening-worker-boundary-suite.md`.

This is a general orchestration-runtime correction, not a Product/Spec-only
patch. The runtime must stop treating graph nodes as semantic carriers.
Graph nodes schedule work. Payload-backed contracts define executable work.
Runtime validates contracts, refs, bounds, lifecycle, authority, and
transitions. Models author semantic work intent, capability fit, usefulness,
and sufficiency inside bounded contracts/tools.

The immediate pre-proof queue is:

1. `openclaw-convergence.contract-spine-01-node-execution-contract`
   - Canonical `NodeExecutionContract` and split-child inheritance
     hardening. **Closed from DB closeout evidence.**
2. `openclaw-convergence.contract-spine-02-resource-requirement-compiler`
   - `WorkIntent -> ResourceRequirementPacket -> ContextScoutExecutionPacket`.
     **Closed from DB closeout evidence.**
3. `openclaw-convergence.contract-spine-03-demand-driven-context-tools`
   - consumer-scoped context and no default synthesis glue.
     **Closed from DB closeout evidence.**
4. `openclaw-convergence.contract-spine-04-frontier-root-cause-collapse`
   - repeated blocker/no-progress collapse.
     **Closed from DB closeout evidence.**
5. `openclaw-convergence.contract-spine-05-branch-scoped-frontier-state`
   - branch-scoped readiness, sibling evidence survival, and readback.
     **Closed from DB closeout evidence.**
6. `openclaw-convergence.contract-spine-06-scheduler-observability-envelope`
   - live scheduler/model-call optics without hidden reasoning.
     **Closed from DB closeout evidence.**
7. `openclaw-convergence.contract-spine-07-validation-phase-semantics`
   - pre-proof/post-edit/review/closeout validation split.
     **Closed from DB closeout evidence.**
8. `openclaw-convergence.contract-spine-08-canonical-readback-gate`
   - `firstOpenGate` from readiness/frontier truth.
     **Closed from DB closeout evidence.**
9. `openclaw-convergence.contract-spine-09-model-policy-bindings`
   - task-class model policy and no deterministic semantic classifiers.
     **Closed from DB closeout evidence.**
10. `openclaw-convergence.contract-spine-10-replay-proof`
    - superseded by the decomposed proof-hardening tranche.
11. `openclaw-convergence.proof-hardening-01-replay-production-fidelity-epochs`
    - production-faithful replay, boundary epochs, stale-child retirement,
      and terminal replay process lifecycle.
      **Closed from DB closeout evidence.**
12. `openclaw-convergence.proof-hardening-02-target-selection-router-budget`
    - first-class resource/target-selection model-task router, provider
      telemetry, and payload budget gate; coding target selection is one
      specialization.
      **Closed from DB closeout evidence.**
13. `openclaw-convergence.proof-hardening-03-context-repair-requirements`
    - context repair `ResourceRequirementPacket`s, consumer edges, and
      diagnostic-only rules.
      **Closed from DB closeout evidence.**
14. `openclaw-convergence.proof-hardening-04-readiness-child-upsert`
    - recomputed readiness authority, stale readiness detection, and
      split-child upsert/supersede semantics.
      **Closed from DB closeout evidence.**
15. `openclaw-convergence.proof-hardening-05-reviewable-patch-artifacts`
    - generic action-review artifact spine, hydrateable rollback/review patch
      artifacts, and Work Queue links.
      **Closed from DB closeout evidence.**
16. `openclaw-convergence.proof-hardening-06-worker-smoke-matrix`
    - worker smokes across multiple Product/Spec-derived child classes.
      **Closed from DB closeout evidence.**
17. `openclaw-convergence.proof-hardening-07-adversarial-entry-suite`
    - negative proof-entry suite for stale children, missing contracts,
      context repair, target-selection budget, limitation waivers, rollback
      review, sibling failure isolation, and provider-route mismatch.
      **Closed from DB closeout evidence.**
18. `openclaw-convergence.active-queue-34`
    - full Product/Spec Planning Workflow Plugin Production Proof.
      **Current DB-ranked proof item.**

DB queue reconciliation evidence:

- script:
  `scripts/execution-platform-record-product-spec-proof-hardening-queue.mjs`
- artifact:
  `.artifacts/execution-platform/product-spec-proof-hardening-queue-update.json`
- current DB queue head after item 07 closeout:
  `openclaw-convergence.active-queue-34`
- latest closeout artifact:
  `.artifacts/execution-platform/proof-hardening-07-adversarial-entry-suite-closeout.json`
- Product/Spec proof rank: `141`, with all decomposed proof-hardening gates
  closed from DB evidence.

Semantic-guardrail update:

- the seven proof-hardening items must pass Authority Surface Retirement Gate,
  Generality Sentinel, and Capability Manifest Conformance checks where
  applicable;
- this replaces any qualitative "complexity budget" framing with structural
  authority ownership checks;
- runtime checks only refs, hashes, epochs, schema versions, payload presence,
  provider eligibility, input bounds, consumer edges, lifecycle, authority,
  validation phase, and manifest compatibility;
- models or humans own semantic usefulness, sufficiency, quality, and
  rationale judgment.

Item 10 status note, 2026-05-25:

- focused replay/materialization tests pass.
- the replay harness bug where context handoff payload bodies were not
  hydrated before resource materialization has been fixed.
- the current replay still blocks before worker invocation because
  implementation nodes have broad scheduler-selected directory `targetRefs`
  while context scouts provided concrete recommended edit points outside those
  scopes. This is a genuine target-selection/toolification deficiency, not a
  worker failure and not something runtime should patch with deterministic
  scope widening.
- target-selection contract work is now underway: `TargetSelectionPacket`
  exists as the coding-domain resource-selection packet, generic
  `ResourceSelectionPacket`/handle-manifest/field-repair contracts are
  payload-backed artifacts, replay/production no longer promote context scout
  recommendations or verified context refs into executable edit authority, and
  readiness can surface `select_concrete_target_files` as the next legal
  transition.
- item 02 completed the model-task router/payload-budget slice. Remaining
  proof-hardening work moves to context repair requirements before the full
  Product/Spec proof.

Proof-hardening item 03 closeout, 2026-05-25:

- `ContextRepairRequirementPacket` is now the payload-backed contract for
  context repair above the nested `ResourceRequirementPacket`.
- Runtime tools now expose small verbs for repair compile/link/diagnostic/block:
  `context_repair.compile_requirement`, `context_repair.link_consumer`,
  `context_repair.mark_diagnostic_only`, and
  `context_repair.block_without_requirement`.
- Scheduler-created context repair nodes carry manifest-only repair
  requirement refs, broker refs, declared consumer refs, and `context_supplies`
  edges. The scheduler blocks production repair execution before any
  executor/model call if broker/requirement/consumer-edge authority is missing.
- Context scout executors persist
  `execution_platform.context_repair_requirement` payload artifacts and prevent
  blocked repair requirements from feeding the scout packet compiler.

Proof-hardening item 04 closeout, 2026-05-25:

- `readiness-recompute-authority` now defines the structural comparison
  boundary for persisted readiness projections versus current contract,
  execution packet, domain resource packet, boundary epoch, lifecycle,
  validation phase, transition, and limitation-waiver refs.
- `NodeReadinessState` persists contract/packet/resource hashes, boundary
  epoch, computed-at timestamp, stale-if-mismatch, projection status, and
  projection mismatch reason codes so cached readiness is explicitly a
  projection, not execution authority.
- Scheduler frontier execution recomputes current readiness before worker
  dispatch, blocks stale split children on epoch/parent hash mismatch, marks
  drifted projections stale, and prevents manifest-only ready state from
  overruling a current blocked or limited packet.
- Runtime tools now expose small verbs for this boundary:
  `node.recompute_readiness`, `node.compare_readiness_projection`,
  `node.mark_readiness_stale`, `node.upsert_child_for_epoch`,
  `node.supersede_child_epoch`, `frontier.evaluate_epoch_eligibility`,
  `frontier.block_stale_child`, and `readback.project_readiness_drift`.
- Work Queue active graph readback, canonical readback gates, and
  latest-run-state project readiness drift status, missing fields, stale
  flags, and next legal transition from canonical readiness/frontier state.
- Regression coverage includes a neutral non-coding readiness fixture and
  no-semantic-cheats checks proving the runtime compares refs/hashes/epochs
  only; it does not judge semantic usefulness, file relevance, Product/Spec
  meaning, or edit quality.

Item 10 replay update, 2026-05-25 later:

- replay now has a bounded model-authored `TargetSelectionPacket` subturn for
  `select_concrete_target_files`. It asks a model to choose concrete
  implementation file refs from runtime-provided candidate refs, then runtime
  compiles and validates the target-selection packet before implementation
  context materialization. Runtime still does not promote context scout
  recommendations or verified refs into executable edit authority by itself.
- replay scheduler model calls now bind to
  `model-contract-boundary://scheduler_global_reasoning` instead of the
  generic `dynamic_coding_team.model_json` call site. Production scheduler
  calls have been aligned to the same binding.
- a replay prompt bug was fixed: replay staged scheduler guidance now requires
  `executionIntent` on work breakdown units and node contract drafts, matching
  the production scheduler prompt and the WorkIntent compiler.
- the latest scheduler-first replay from
  `native-exec-a128a2cf543a12e1` did not reach implementation. It exposed a
  missing context coverage blocker instead:
  `accepted_resource_fulfillment_incomplete:13_of_14` and skipped blocking
  commitment `provide-context-research-and-planning-artifacts`. The scheduler
  correctly selected a `context_scout` repair node rather than source-edit
  work.
- this means target selection is wired but not yet proof-exercised against a
  live implementation frontier in this run. The next architectural/tooling
  issue is that boundary replay can create the missing context-scout node but
  does not execute context scout work from that replay boundary, so it cannot
  naturally advance from the missing-context repair to implementation without
  a separate context-scout replay/execution boundary.
- remaining architecture findings, not quick bugs:
  scheduler payloads are still very large (`~351KB` in the latest replay)
  despite a `240KB` global-reasoning policy bound, and the model-policy
  preflight currently reports the binding but does not enforce input-byte
  budget at provider-call time. Fixing this needs a scheduler input bundle
  compiler and field-specific repair path, not arbitrary truncation.

The black-and-white extension check has been recorded in the spec: the
architecture was pushed through generic domain-resource contracts,
resource-requirement packets, root-cause collapse, branch-scoped frontier
state, scheduler observability, validation phase semantics, and model-policy
bindings. After the first successful worker-boundary smoke, the remaining
push is proof-entry hardening: prove replay fidelity, target selection,
context repair requirements, stale-child retirement, reviewable patch
artifacts, multi-child worker execution, and adversarial safe-failure before
the full top-to-bottom Product/Spec proof.

Implementation evidence for proof-hardening item 02:

- Resource selection is a generic small-verb boundary:
  `resource.selection.propose`, `resource.selection.accept`,
  `resource.selection.request_revision`, or `resource.selection.mark_blocked`.
- `ModelTaskClientRouter` now routes target selection through the
  `tool_selection`/`implementation_target_selection` model-policy binding and
  blocks before provider invocation on payload/profile mismatch.
- `ResourceSelectionFieldRepairRequest` captures exact invalid field paths,
  invalid candidate refs, missing selected refs, and missing intent coverage
  without regenerating the full graph or packet.
- direct selected target refs, context recommended edit points, verified refs,
  and file-change intents are candidates/evidence only until an accepted
  target-selection packet grants executable edit authority.

Implementation evidence for contract-spine item 1:

- `NodeExecutionContract` is now a first-class payload-backed runtime artifact
  and `NodeExecutionPacket` carries contract ref/version/hash.
- worker invocation requires hydrated contract body, node packet body, and
  domain resource body before provider/model dispatch.
- graph metadata accepts bounded contract manifests/refs and rejects embedded
  contract bodies.
- split-child inheritance uses `ContractOverridePacket` and preserves parent
  execution intent, evidence mode, capability, executor, worker, context,
  resource, validation, evidence, authority, and commitment requirements
  unless a model-authored contract revision exists.
- scheduler progress, boundary checkpoints, Work Queue projection, and bridge
  handoffs now preserve contract refs for owner readback.
- focused contract/readiness/worker/readback tests passed 86 tests; scoped
  type validation and `git diff --check` passed.
- residual dynamic graph runner fixture failure remains outside this contract
  boundary: staged graph acceptance still leaves mission commitments open
  before worker execution and belongs to later scheduler/context/replay proof
  work.

Implementation evidence for contract-spine item 2:

- `ResourceRequirementPacket` is implemented as a payload-backed context
  requirement contract with manifest/readback helpers and explicit consumer,
  WorkIntent, downstream capability, downstream execution intent, downstream
  evidence mode, semantic questions, context purpose, target refs, validation
  needs, byte/tool/model policy, limitation policy, and raw-storage flags.
- `ContextScoutExecutionPacket` now requires ready context requirements and
  blocks missing or mixed consumer/capability/purpose requirements before a
  scout model call.
- the production dynamic graph runner and standalone context scout executor
  persist requirement artifacts, invoke `context.get_requirement`, then compile
  bounded scout packets from requirement refs instead of broad role prompts.
- scheduler-generated context supply and repair nodes preserve WorkIntent,
  capability, execution intent, evidence mode, and broker refs through
  metadata manifests without substring semantic classifiers.
- Work Queue active graph projection, execution read model, and latest-run
  state now expose context requirement refs/statuses/reason codes alongside
  broker state.
- focused context requirement/scout/runtime-tool/no-semantic-cheat metadata
  tests passed 35 tests; scheduler tests passed 94 tests; scoped type
  validation passed.

Implementation evidence for contract-spine item 3:

- scheduler node summaries now carry explicit context-synthesis coordination
  manifests: `contextSynthesisCoordinationRequired`,
  `contextSynthesisCoordinationPolicyRef`,
  `contextSynthesisCoordinationReasons`, and diagnostic-only status.
- default context synthesis is rejected before graph persistence unless a
  workflow/model-authored coordination manifest declares an allowed
  coordination reason.
- context lifecycle, synthesis join edges, existing synthesis-node detection,
  and scheduler policy reasons only treat `context_synthesis` as executable
  coordination when that explicit manifest is present.
- node-scoped context supply and context repair nodes now emit demand-driven
  context policy metadata, consumer-node scope, and default-synthesis-retired
  reason codes.
- readiness/frontier context input detection no longer infers context from
  handoff/ref substrings; it uses explicit context metadata refs, structural
  `context_supplies` edges, and persisted context snapshots.
- Product/Spec boundary replay now emits demand-driven context policy
  metadata and no longer injects synthetic context-synthesis refs into
  implementation task packets.
- no-semantic-cheats coverage proves the removed context substring
  classifiers and synthetic replay synthesis refs do not return.
- focused runtime graph/context requirement/context scout/scheduler tool/no-
  semantic-cheat tests passed 36 tests; scheduler/no-semantic-cheat tests
  passed 108 tests; scoped type validation passed.

Implementation evidence for contract-spine item 4:

- scheduler frontier state now carries bounded per-branch blocked-node
  diagnostics with node kind, capability, execution intent, evidence mode,
  lifecycle state, missing structural fields, contract/resource refs,
  schema/policy paths, provider profile, next transitions, and branch
  similarity class.
- no-progress signatures now hash stable structural root-cause fields instead
  of branch ids or semantic reason-code substring matches.
- repeated frontier no-progress creates a
  `runtime_work_graph_frontier_root_cause` artifact with affected nodes,
  affected branches, successful sibling evidence refs, first/last occurrence
  refs, missing fields, reason codes, schema/policy paths, contract/resource
  refs, provider profiles, recommended repair boundary, and raw-storage flags.
- scheduler progress records `scheduler.record_frontier_root_cause` as a
  small runtime tool boundary and halts duplicate repeats with
  `scheduler_frontier_root_cause_collapsed`.
- latest-run-state and Work Queue active graph projection expose root-cause
  state, repeat count, repair boundary, affected branches/nodes, missing
  fields, evidence survival, schema/policy paths, and next legal transitions.
- no-semantic-cheats coverage proves root-cause construction does not
  reintroduce the old blocker/missing/conflict reason-code regex classifier.
- focused scheduler/readback/no-semantic-cheat tests passed 282 tests; scoped
  type validation passed.

Implementation evidence for contract-spine item 5:

- `RuntimeWorkGraphScheduler` now builds
  `RuntimeWorkGraphBranchScopedFrontierState` records for selected, blocked,
  running, succeeded, failed, needs-review, and waiting branches.
- branch-scoped frontier state carries branch id, parent branch id, node id,
  node kind, WorkIntent ref, contract ref, readiness ref, context requirement
  refs, domain/resource packet refs, status, blocker object, blocker
  signature, consumer refs, dependent consumers, sibling branch ids,
  successful/failed evidence refs, repair refs, diagnostic-only refs, next
  legal transitions, capability/executor/model/worker/tool phase, root-cause
  ref, and raw-storage flags.
- successful sibling evidence survives failed/blocked branch projection.
- repair nodes with no declared consumers are surfaced as diagnostic-only
  instead of production progress.
- scheduler progress records
  `scheduler.record_branch_scoped_frontier_state` as a bounded runtime tool
  invocation.
- latest-run-state, Work Queue active graph projection, and execution read
  model now project branch id, node id, blocker, schema/policy path,
  dependent consumers, evidence refs, readiness ref, contract ref, root-cause
  ref, and next legal transition from canonical branch state.
- focused scheduler/readback/latest-run-state/no-semantic-cheat tests passed;
  scoped type validation passed.

Implementation evidence for contract-spine item 6:

- `SchedulerModelCallEnvelope` is a bounded runtime contract for scheduler
  model-call preflight, heartbeat, completion, rejection, and repair optics.
- dynamic scheduler model progress emits envelope snapshots with decision
  slot, scheduler phase, model/provider/profile, task class, parser/reasoning
  mode, allowed tool family, output contract, input/output bytes, graph
  counts, frontier counts, heartbeat age, finish reason, and bounded provider
  response shape.
- scheduler rejection paths attach the envelope to
  `scheduler.reject_staged_graph`, including rejected decision id/kind,
  missing fields, schema/policy path, repair hints, and rejected tool summary.
- Work Queue active graph projection, execution read model, and latest-run
  state expose scheduler envelope readback without hidden reasoning or raw
  provider bodies.
- focused scheduler envelope/runtime-tool/no-semantic-cheat/latest-run-state
  and readback tests passed 29 tests; scoped type validation passed.

Implementation evidence for contract-spine item 7:

- canonical validation phases are implemented in `validation-phase.ts`:
  `pre_proof_validation`, `pre_execution_validation`,
  `post_edit_validation`, `review_validation`, `closeout_validation`, and
  `diagnostic_validation`.
- `CommitmentEvidenceClaim` and generic node execution results now carry
  `validationPhase`, validation refs, changed-file refs, phase compatibility,
  and phase reason codes.
- phase-incompatible claims stay visible for diagnostics but cannot derive
  accepted evidence classes or be passed to Mission Ledger closure.
- missing or invalid validation phase normalizes to diagnostic/non-closing
  evidence instead of being silently treated as proof.
- non-Codex worker validation output and implementation/closeout result
  producers now emit lifecycle-correct phases.
- resource materialization no longer stores validation command refs as
  validation phase requirements.
- Work Queue active graph and latest-run-state readback project validation
  phase compatibility for the current node and evidence claims.
- focused scheduler/workflow-node/resource/readback/latest-run-state/non-Codex
  worker/no-semantic-cheats tests passed, and scoped type validation passed.

## 2026-05-25 Current Slice: Product/Spec System Spec And Readback Gate

The actual Product/Spec Planning system spec, not only the proof harness, is
now refreshed in
`product-spec-planning-production-workflow.md`. Product/Spec Planning is a
planning/proposal workflow on the generic runtime spine. It must produce
`PlanningIntentRecord`, optional `ResearchBrief`, `PlanningCapsule`, optional
`HumanPlanningDecision`, `ActionGraphProposal`, `CompileRuntimePlanResult`,
and `ProductSpecPlanningCloseout` artifacts through canonical node execution,
evidence claims, readback, closeout, and completion review.

The native Product/Spec planning graph is planning-first:

1. `planning_orchestrator`
2. optional `web_research`
3. `planning_capsule`
4. optional `human_task`
5. `action_graph_compile`
6. `reviewer`
7. `closeout`

For coding-team prompts that target Product/Spec as the subject, the path
remains WorkIntent-first and the forbidden shortcut remains retired:

```text
context_synthesis group -> implementation node
```

The owner readback gate is now implemented and ready for DB closeout. Before
the full OpenClaw proof can run, the remaining gate is to rebuild, validate,
and start the live gateway from the current tree and prove it answers
health/readiness.

The canonical OpenClaw proof prompt is
`prompts/product-spec-planning-workflow-plugin-production-proof-openclaw.md`;
its hash must be recorded in the proof artifact before submission.

## 2026-05-24 Current Slice: WorkIntent Control-Plane Recovery

The next Product/Spec proof is blocked until the coding-team control plane
uses an explicit `WorkIntent` layer between commitment packets and executable
worker nodes. The governing specs are:

- `specs/control-plane-coding-team-recovery.md`
- `specs/work-intent-control-plane-contract.md`

The latest recurring failure class is now the primary target:
`context_synthesis group -> implementation node` must not be a production
coding-team path. Context synthesis remains explicit workflow coordination or
diagnostic replay only.

Immediate order:

1. Spec Reconciliation And Control-Plane Reset. **Closed.**
2. WorkIntent Contract And Runtime Compiler. **Closed.**
3. Coding Path Context Synthesis Retirement And Replay Alignment. **Closed.**
4. Node-Scoped Context Broker And Readiness Enforcement. **Closed.**
5. Resource Materialization And NodeExecutionPacket Worker Gate. **Closed.**
6. Worker Small-Verb Edit Smoke Proof. **Closed.**
7. Owner Readback And Telemetry Proof. **Closed from proof evidence.**
8. Product/Spec Planning Workflow Plugin Production Proof. **Superseded as
   immediate next by the Execution Contract Spine block above.**

Pass criteria before the full proof: one Product/Spec-derived `source_edit`
node must hydrate a `NodeExecutionPacket`, execute through the worker
small-verb loop, produce a bounded source edit or precise upstream blocker,
run validation, emit commitment-mapped evidence, and show owner readback from
compact runtime state.

Implementation evidence for item 3:

- production scheduler no longer compiles accepted context-synthesis groups
  into executable implementation/support graphs;
- accepted context-synthesis handoffs can only compile into non-runnable
  `work_intent` nodes when the group carries explicit model-authored
  `executionIntent`, capability selection, and worker-facing semantic fields;
- missing execution intent or capability fields block with field-specific
  WorkIntent diagnostics instead of runtime semantic guessing;
- boundary replay no longer lets accepted context synthesis satisfy
  after-graph-selection readiness; that boundary requires node-scoped context
  supply, while `after-context-synthesis` remains diagnostic-only;
- focused scheduler, replay-topology, no-semantic-cheats, boundary-replay, and
  orchestrator graph tests pass.

Implementation evidence for item 4:

- WorkIntent nodes with `resource_handoff` resource requirements now enter
  `context_required` or `context_in_progress` instead of being treated as
  runnable or materializable without consumer-scoped context;
- `NodeReadinessState` no longer treats `accepted_with_limitations` context
  as implementation-ready unless a consumer-specific waiver ref is present;
- runtime context broker requests are compiled from readiness state and
  attached to context scout prerequisites through bounded refs, summaries,
  target node ids, reason codes, and `context_supplies` edges;
- `ContextScoutExecutionPacket` carries the broker request summary so the
  scout answers the consumer node's specific semantic question rather than a
  broad global prompt;
- scheduler progress and Work Queue readback now expose broker request refs,
  context status, limitation status, waiver refs, resource requirement kinds,
  context questions, target refs, and readiness context snapshot refs;
- focused context-broker, context-scout packet, node-resource
  materialization, scheduler, replay-topology, no-semantic-cheats, and Work
  Queue read-model tests pass.

Implementation evidence for item 5:

- `ReadOnlyResourcePacket` is now a first-class domain resource packet for
  source-grounding/read-only work, so useful read-only evidence no longer has
  to masquerade as source-edit implementation.
- `NodeReadinessState` validates resource packet kind/body, execution intent,
  evidence mode, context limitations, source refs, snapshots/new-file
  intents, validation requirements, authority scope, and evidence
  expectations from one canonical readiness object.
- file-edit node kinds (`implementation`, `repair`, `test_authoring`,
  `docs_update`) always require a `NodeExecutionPacket`; graph metadata cannot
  opt them out with `nodeExecutionPacketRequired: false`.
- worker invocation requires hydrated domain resource packet bodies and blocks
  manifest-only or kind-mismatched packets before provider/model invocation.
- source-grounding/read-only packets execute without changed-file or
  validation expectations unless their explicit evidence mode requires
  validation; read-only packets carrying changed-file evidence block.
- owner readback summaries for node packets now expose node id/kind,
  capability, executor, worker, execution intent, and evidence mode.
- focused materialization, scheduler, no-semantic-cheats, replay-topology, Work
  Queue read-model, frontier proof script, and scoped type checks pass.

Implementation evidence for item 6:

- Product/Spec after-resource replay selected
  `g-bdd8590b57-g-bdd8590b-implementation-g0-source-spec-intake-10d0edafe5:task:1`
  from graph `product-spec-replay-f69b40c5defa3687` under runtime job
  `native-exec-272cf2d51fcba75b`;
- the worker received hydrated execution/resource/context/task packet refs and
  canonical readiness state before any provider call counted as execution;
- the small-verb path ran context selection, repo reads, edit planning, forced
  patch authoring, runtime patch application, structural validation, and
  evidence claim recording;
- large files are now handled with explicit bounded snapshot windows from
  `targetRegion`/`targetRegions`/`lineRanges`, not larger full-file payloads
  or runtime semantic guessing;
- the replay proof succeeded with one scoped source edit and rollback-after-
  review persistence, and focused worker-loop tests passed 37/37.

Implementation evidence for item 7:

- Work Queue owner progress now includes a bounded `ownerTelemetry` packet
  that surfaces WorkIntent identity, execution intent, evidence mode,
  capability/executor/worker/model, runtime job/graph/branch/node/tool/phase,
  readiness status/ref/schema-policy path, payload/artifact/context/change/
  validation/evidence refs, lifecycle state, and token/walltime availability.
- Scheduler node progress emits `executionIntent`, `evidenceMode`,
  `executorKey`, and `workerRef` from `NodeExecutionPacket` summaries for
  future runs.
- Proof uses accepted after-resource-materialization worker-smoke evidence
  from `native-exec-272cf2d51fcba75b` and
  `product-spec-replay-f69b40c5defa3687`.
  Evidence artifact:
  `.artifacts/execution-platform/owner-readback-telemetry-proof/proof.json`.

## 2026-05-24 Previous Slice: Control-Plane Coding Team Recovery

The next Product/Spec proof is gated by
`specs/control-plane-coding-team-recovery.md`. The latest top-of-pipe proof
passed routing, Mission Ledger, packet authoring, staged scheduler entry, and
context scouts, but failed before implementation at the context-synthesis
group-expansion boundary because the structured-adapter payload/profile
contract was violated. That failure confirms the system still has a broad
pre-implementation synthesis funnel where the accepted architecture needs a
control-plane coding loop.

Immediate order:

1. Execution Platform Spec Reconciliation And Control-Plane Reset. **In
   progress.**
2. Task-DAG-First Scheduler And Node-Scoped Context. **Partially implemented;
   prove production/replay cannot inject synthesis by default.**
3. Coding Tool Facade Pre-Proof Slice. **In progress.**
4. NodeExecutionPacket Worker Readiness Gate. **Implemented historically;
   re-prove against the current Product/Spec boundary.**
5. Non-Codex Tool Worker Execution Proof. **Next proof gate before full
   Product/Spec.**
6. Operator Readback And Telemetry Proof. **Must pass with the worker proof.**
7. Product/Spec Planning Workflow Plugin Production Proof. **After the worker
   execution proof.**

The full toolification catalog is not dropped. It is documented in the
control-plane recovery spec and moves to the post-proof expansion track after
the first successful coding proof unless a nearer failure directly requires a
specific tool.

## 2026-05-23 Current Slice: Demand-Driven Frontier Before Product/Spec Proof

The latest Product/Spec replay did not fail because context scout failed. It
failed after context/resource progress because scheduler progress metadata
exceeded the manifest contract. The current pre-proof slice is now governed
by `specs/demand-driven-frontier-orchestration-and-context-broker.md`.

Immediate order after Work Queue reconciliation:

1. GraphPatch Payload Store And Progress Compaction. **Complete.**
2. Demand-Driven Context Broker And Lazy Readiness. **Complete.**
3. Expansion Controller And Dynamic Fanout Admission. **Complete.**
4. Superstep Frontier Runtime And Branch Results. **Complete.**
5. Readback Projection And Replay Boundary Expansion. **Complete.**
6. Semantic Microtask Refinement And Worker Packet Quality. **Complete.**
7. Product/Spec replay from the failed graph/resource boundary. **Complete.**
8. Execution Intent, Evidence Mode, And Worker Dispatch. **Complete.**
9. Full Product/Spec proof from the top. **Next active queue item.**
10. Runtime Artifact Retention And Pruning Policy. **Immediate post-proof.**
11. Scheduler Phase Budget Governor. **Immediate post-proof.**
12. Work Queue Frontier Delta Stream And Branch Controls. **Immediate
    post-proof.**

Mission Ledger queue reconciliation:

- `openclaw-convergence.mission-ledger-stability-diagnostics` is **closed**.
  Production Mission Ledger creation remains on the prior working single-pass
  path; commitment-count variance is diagnostic-only unless packet coverage,
  runtime boundary evidence, mission gate changes, missing packet fields, or
  proof-mode GPT rescue dependence are present.
- `openclaw-convergence.staged-mission-ledger-obligation-candidate-compiler`
  is **retired and deleted**. It is not a Product/Spec production blocker,
  diagnostic fallback, or queue-seeded future path. Intake ownership now lives
  in `IntakeStageRunner` and the `ObligationGraph` small-verb boundary.

Design rule: the runtime should not wait for giant context fanout before any
branch can move. Ready branches execute. Non-ready implementation branches
request context/resources through the context broker. File edits remain
blocked until node readiness is executable.

Additional current rule: a broad work-intent node is not worker-ready just
because resource materialization can find files. Repo scope is
discovery/authority scope. Executable implementation packets require concrete
target snapshots plus model-authored semantic file-change intent from context
handoff or microtask refinement. Boundary replay worker smokes roll edits
back by default until Codex review accepts them.

Newest current rule: source-grounding/read-only evidence is valid work, but
it is not file-edit implementation. Graph nodes and resource packets must
carry model-authored `executionIntent` and runtime-compiled `evidenceMode`.
The worker smoke may select only an edit-required node for changed-file proof;
read-only nodes route to read-only evidence executors or block with a precise
intent/capability conflict.

Semantic microtask closeout:
`.artifacts/execution-platform/semantic-microtask-worker-packet-quality/closeout.json`.

GraphPatch closeout:
`.artifacts/execution-platform/graphpatch-payload-progress-compaction/closeout.json`.

Demand-Driven Context Broker closeout:
`.artifacts/execution-platform/demand-driven-context-broker-lazy-readiness/closeout.json`.

Expansion Controller closeout:
`.artifacts/execution-platform/expansion-controller-dynamic-fanout-admission/closeout.json`.

Superstep Frontier Runtime closeout:
`.artifacts/execution-platform/superstep-frontier-runtime-branch-results/closeout.json`.

Readback Projection And Replay Boundary Expansion closeout:
`.artifacts/execution-platform/readback-projection-replay-boundary-expansion/closeout.json`.

Progress, Readback, And Runtime Event Modularization closeout:
`.artifacts/execution-platform/progress-readback-runtime-event-modularization/closeout.json`.

Latest Product/Spec boundary replay:
`.artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json`.
It passed from `before-resource-materialization` on
`product-spec-replay-mpika9c1`, producing two ready implementation
`NodeExecutionPacket` refs from the failed graph without rerunning upstream
phases.

Expansion Controller implementation evidence:

- `RuntimeWorkGraphExpansionAdmissionDecision` is a strict runtime-owned
  admission object with accepted, paged, deferred, rejected, halt, and
  needs-review states.
- production `RuntimeWorkGraphScheduler.applyDecision(...)` evaluates
  expansion before graph persistence, records
  `scheduler.evaluate_expansion_admission`, defers non-prerequisite graph
  growth behind ready frontier work, pages oversized but admissible graph
  writes, and rejects absolute budget breaches before metadata/persistence
  pressure.
- prerequisite context/repair edges are structurally exempt from ready
  frontier deferral, so runtime-owned repair graph writes are not blocked by
  unrelated ready work.
- scheduler progress, latest-run-state, and Work Queue readback expose
  admission status, policy, original/admitted/deferred counts, ready frontier
  ids, next transition, and bounded reason codes.
- validation:
  `pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-expansion-controller.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  passed 269 tests.
- type validation:
  `pnpm tsgo:fast ...` over the expansion controller/scheduler/runtime-tool/
  latest-state/readback/dynamic-runner slice passed via the repo fallback
  checker.

Superstep Frontier Runtime implementation evidence:

- `runtime-work-graph-superstep.ts` defines canonical branch results with
  statuses `succeeded`, `blocked_context`, `blocked_resource`,
  `blocked_dependency`, `blocked_authority`, `blocked_human_decision`,
  `failed_recoverable`, `failed_unrecoverable`, and `needs_review`.
- production parallel frontier execution now records canonical branch
  results from structured node status/readiness/reason-code signals.
- scheduler runtime tools include `scheduler.open_superstep_frontier`,
  `scheduler.record_superstep_branch_result`, and
  `scheduler.join_superstep_frontier`.
- sibling branch success/evidence survives isolated branch failure; systemic
  repeated branch failures halt with one root cause.
- Work Queue readback and latest-run-state expose branch status, blocker,
  schema/error path, readiness ref, next transition, evidence refs, and
  reason codes.
- validation:
  `pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  passed 268 tests.
- type validation:
  `pnpm tsgo:fast ...` over the superstep/scheduler/tool/latest-state/
  readback slice passed via the repo fallback checker.

Readback Projection And Replay Boundary Expansion implementation evidence:

- boundary replay now uses explicit structural dependency requirements for
  granular checkpoints instead of brittle enum-slice ordering.
- canonical checkpoint kinds now cover context request/handoff, context
  synthesis, expansion admission, graph patch writes, resource
  materialization, worker invocation/edit, validation, and closeout.
- production implementation resource materialization records
  `before_resource_materialization`, `after_resource_materialization`, and
  `before_worker_invocation` checkpoints with bounded refs, readiness refs,
  and replay continuation modes.
- latest-run-state projects compact boundary replay state, and Work Queue
  readback can recover boundary state from latest-run-state even when
  explicit boundary events are absent.
- the Product/Spec replay harness attaches canonical
  `execution.boundary_replay_checkpoint` artifacts for resource-materialization
  replay checkpoints in addition to graph checkpoints.
- validation:
  `pnpm test:file extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  passed 178 tests.
- type validation:
  `pnpm tsgo:fast -- ...` over boundary replay/latest-state/readback/
  dynamic-runner/Product-Spec replay script passed via the repo fallback
  checker.

## 2026-05-22 Pre-Product/Spec Proof Stabilization Block

The next full Product/Spec proof should not run until the generic runtime
stabilization block is implemented and lane-proven.

New governing specs:

- `specs/runtime-artifact-contract-registry-and-payload-boundary.md`
- `specs/scheduler-frontier-no-progress-and-evaluation-throttle.md`
- `specs/operator-frontier-readback-and-latest-run-state.md`
- `specs/large-graph-storage-and-scheduler-lane.md`
- `specs/pre-product-spec-proof-stabilization-plan.md`

Reason:

- the payload store exists, but body-bearing packet/context/resource/runtime
  result artifacts can still be written through adjacent metadata paths;
- scheduler progress can still count reused-only nodes/edges as useful
  progress and can expand prerequisite/context graph shape before executing a
  ready frontier;
- Mission Ledger evaluation is too expensive to call after every context-only
  event;
- large graph/runtime-result payload surfaces still need a focused lane proof
  so graph/result manifests never duplicate body-heavy scheduler state.

Pre-proof order:

1. Runtime Artifact Contract Registry And Payload Boundary. **Complete.**
2. Scheduler Frontier, No-Progress, And Evaluation Throttle. **Complete.**
3. Operator Frontier Readback And Latest Run State. **Complete.**
4. Large Graph Storage And Scheduler Lane. **Complete.**
5. Mission Ledger Stability Diagnostics. **Implemented; live diagnostic
   preflight remains a diagnostic/proof concern only after production
   rollback.**
6. IntakeStageRunner ObligationGraph Scheduler Intake. **Canonical
   pre-scheduler owner; staged Mission Ledger diagnostic code is deleted.**
7. Product/Spec Planning Workflow Plugin Production Proof.

Scheduler Frontier implementation evidence:

- production `agent_team.coding` scheduler construction now sets
  `preferExecutableFrontierBeforeOrchestrator: true`;
- scheduler runtime tools include canonical frontier evaluation,
  no-progress signature recording, and Mission Ledger evaluation throttle
  events;
- repeated reused-only graph decisions halt as `needs_review` with
  `scheduler_repeated_no_progress_signature_halted`;
- context-only node outputs no longer call the global Mission Ledger
  evaluator unless they include closure claims or explicit evaluation
  request;
- Work Queue active graph readback surfaces scheduler frontier, no-progress,
  and evaluation throttle state;
- provider-free proof artifact:
  `.artifacts/execution-platform/scheduler-frontier-no-progress-evaluation-throttle/proof.json`.

Operator Frontier Readback implementation evidence:

- `LatestRunState.activeFrontier` is implemented with selected/running/
  completed/blocked/failed/needs-review/waiting node ids, branch states,
  no-progress root cause, Mission Ledger throttle state, and next transition;
- production scheduler progress writes
  `execution_platform.latest_run_state` and
  `execution.latest_run_state_updated`;
- Work Queue active graph readback projects latest-run-state and agreement
  checks graph id, selected nodes, blocked nodes, and transition against the
  scheduler frontier;
- provider-free proof artifact:
  `.artifacts/execution-platform/operator-frontier-readback-latest-run-state/proof.json`.

Large Graph Storage implementation evidence:

- `execution_platform.implementation_resource_materialization_result` and
  `execution_platform.node_readiness_state` are registered as
  payload-required runtime artifact contracts;
- live `agent_team.scheduler_progress` is registered as a bounded
  manifest-only artifact contract;
- production runner writes resource materialization and node readiness bodies
  through `attachRuntimeArtifactByContract(...)`;
- graph metadata accepts bounded `context_snapshot_ref` arrays but does not
  copy full upstream context snapshot arrays into node metadata;
- scheduler stores upstream context snapshot samples plus counts/truncation
  flags before execution;
- provider-free proof artifact:
  `.artifacts/execution-platform/large-graph-storage-scheduler-lane/proof.json`.

Mission Ledger Stability Diagnostics implementation evidence:

- canonical comparison module:
  `extensions/execution-platform/src/workflows/mission-ledger-stability-diagnostics.ts`;
- artifact contracts:
  `execution_platform.mission_ledger_stability_diagnostic_run`,
  `execution_platform.mission_ledger_stability_diagnostic_pair`, and
  `execution_platform.mission_ledger_stability_verdict`;
- live diagnostic runner:
  `scripts/execution-platform-run-mission-ledger-stability-diagnostics.mjs`;
- closeout script:
  `scripts/execution-platform-record-mission-ledger-stability-diagnostics-closeout.mjs`.

The diagnostic treats mission/packet prose fingerprint drift and harmless
commitment-count variance as reportable variance, not deterministic semantic
blockers. The blocking gates are structural: changed mission gate, missing
packet coverage, missing packet handoff fields, runtime boundary failure, or
GPT rescue dependence.

Latest live preflight result:

- proof:
  `.artifacts/execution-platform/mission-ledger-stability-diagnostics/proof.json`;
- verdict:
  `needs_review_structural_drift`;
- `safeToRunProductSpecProof: false`;
- Run A:
  `native-exec-7560164d0766b2f7`, 10 blocking commitments, 10 packets;
- Run B:
  `native-exec-1d608f6f1440f2e0`, 13 blocking commitments, 13 packets;
- provider/packet variance:
  3 Qwen no-content retries, 6 GPT rescue uses;
- closeout:
  `.artifacts/execution-platform/mission-ledger-stability-diagnostics/closeout.json`;
- Work Queue:
  `openclaw-convergence.mission-ledger-stability-diagnostics` is
  `needs_review`.

Do not run the next Product/Spec proof until the Mission Ledger/packet
stability boundary is repaired or this diagnostic is explicitly waived by the
owner.

Mission Ledger / ObligationGraph intake consolidation evidence:

- production `DynamicAgentTeamGraphRunner` delegates pre-scheduler intake to
  `IntakeStageRunner`;
- `IntakeStageRunner` owns Mission Ledger single-pass creation, accepted
  Mission Ledger checkpoint replay, ObligationGraph authoring, ObligationGraph
  small-verb repair, accepted graph artifact persistence, and the
  scheduler-ready intake gate;
- staged Mission Ledger candidate/review/canonical-commitment diagnostics are
  deleted, not hidden behind a flag;
- production Mission Ledger creation preserves the full owner prompt input,
  bounded prompt hash/readback evidence, safety constraint handling, and
  Mission Ledger artifact/checkpoint wiring;
- no-content/provider diagnostics remain as neutral provider diagnostics in
  `fast-model-no-content-diagnostic.ts`, outside staged Mission Ledger;
- validation:
  focused intake runner, ObligationGraph, fast-model diagnostic,
  artifact-contract, supervisor, and dynamic runner tests passed; scoped
  TypeScript passed through repo fallback checking.

Product/Spec should resume from the restored production Mission Ledger path.
The remaining proof attention belongs downstream: packet stability without
normal GPT rescue dependence, context handoff quality, implementation node
readiness, non-Codex worker execution, source edits, validation, and closeout.

## 2026-05-22 Product/Spec Proof Packet Boundary Follow-Up

Latest proof from the top:

- runtime job: `native-exec-5a786db6b86b6c6d`
- prompt hash:
  `64c74c8c5ecee1ac51099bccb895f3fe4f225778614692015ec2b4450d364922`
- wall time: 306s end-to-end
- submit duration: 96.2s
- front-door model: `openai-codex/gpt-5.5`
- front-door latency: 45.3s
- Mission Ledger succeeded with 14 blocking commitments and 1 nonblocking
  commitment.
- Commitment packet fanout reached 13/14 completed packets before stopping.
- No graph scheduling or implementation edits ran in this proof.

Failure diagnosis:

- `commitment-002` failed before a provider call during the targeted
  normalization subphase.
- Root cause: the targeted normalizer is classified as
  `schema_normalization`, whose policy allows a small field-patch output
  budget, but the packet author path requested the semantic author's 8,000
  token budget for the normalization call. The structured adapter correctly
  rejected the call as preflight-blocked; packet fanout then surfaced this as
  missing semantic fields.
- Job lifecycle also exposed the packet-boundary failure as an unclassified
  retry/pending adapter error instead of a terminal `needs_review` packet
  boundary.

Follow-up fixes:

- targeted packet normalization now uses
  `OPENCLAW_COMMITMENT_PACKET_TARGETED_NORMALIZATION_MAX_TOKENS` defaulting
  to 2,400 and
  `OPENCLAW_COMMITMENT_PACKET_TARGETED_NORMALIZATION_TIMEOUT_MS` defaulting
  to 30s, aligned with the schema-normalization task policy.
- packet-author profile/readback exposes the targeted normalization budget.
- runtime worker supervisor classifies
  `commitment_packet_author_fanout_failed` as
  `worker_adapter_threw:commitment_packet_authoring_boundary` and
  terminalizes it as `needs_review` without ambiguous retry.

Second rerun evidence:

- runtime job: `native-exec-560e1b96c47fae7a`
- result: `needs_review`
- wall time: 1,346s
- Mission Ledger passed; 12/12 commitment packets completed with 0 GPT
  rescue and 4 Qwen no-content retries.
- graph reached 82 nodes / 86 edges, 13 context-scout role invocations,
  13 context handoff packets, 2 implementation context packets, 2 resource
  materialization results, and 35 implementation task packets.
- no implementation edits landed.
- terminal blocker:
  `artifact metadata exceeds 65536 bytes; artifactType=execution.generic_orchestration_runtime_result`.

Second follow-up fix:

- generic orchestration runtime result artifacts now store bounded manifests:
  node/ref counts, capped node/ref arrays, readiness summary, and scheduler
  result summary only. The full scheduler state remains in graph/progress
  artifacts instead of being duplicated in result metadata.

Validation:

- `pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts extensions/execution-platform/src/workers/runtime-worker-supervisor.test.ts extensions/execution-platform/src/model-routing/model-fallback-policy.test.ts extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.test.ts extensions/execution-platform/src/workflows/runtime-work-graph.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
  passed: 6 files, 120 tests.
- `pnpm test:file extensions/execution-platform/src/workflows/generic-orchestration-runtime.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts extensions/execution-platform/src/workers/runtime-worker-supervisor.test.ts`
  passed: 3 files, 28 tests.
- `pnpm tsgo:fast ...` passed through the repo fallback policy.

## 2026-05-22 Split-Required Resource Materialization Transition

Completed pre-proof blocker:
`openclaw-convergence.split-required-resource-materialization-transition`.

The latest full Product/Spec proof from the top advanced through router,
source prompt indexing, Mission Ledger, Commitment Work Packets, scheduler
graph creation, Work Queue child sync, context scout execution, and resource
materialization gating. Commitment packet diagnostics showed 10/10 packets
completed with 0 no-content responses, 0 retries, and 0 GPT rescue/fallbacks.

The run failed before implementation edits because a high-level
implementation parent node expanded into too many file-resolved tasks:

- runtime job: `native-exec-55dc1cc6a3e94232`
- Work Queue item: `product-spec-checkpointed-64c74c8c5ece-g6svuj`
- graph:
  `team-run-native-exec-55dc1cc6a3e94232-runtime-work-graph`
- graph reached 47 nodes / 49 edges / 21 role invocations.
- terminal blockers:
  - `implementation_context_materialization_blocked`
  - `implementation_context_resource_packet_bounds_exceeded`
  - `implementation_context_resolved_target_file_refs_exceeds_packet_bound:120:100`
  - `post_resource_task_split_required_for_file_resolved_microtasks`
  - `worker_adapter_threw:unclassified`
  - `scheduler_terminal_with_10_open_blocking_commitments`

Resolved architecture gap:

- payload-backed readiness and worker smoke are implemented;
- resource materialization can now identify an oversized implementation
  parent before worker invocation;
- the scheduler now applies a first-class `split_required` transition that
  marks the parent aggregate/non-runnable and promotes accepted split task
  packets into executable child nodes.

Implementation evidence:

- production runner hooks materialize split children and return `continue`;
- parent nodes are marked `splitRequiredParentLifecycle:
aggregate_non_runnable` and `commitmentClosureEligible: false`;
- child graph nodes and child Work Queue rows are synced from split task
  packets;
- replay boundary `before-split-required-materialization` against
  `native-exec-55dc1cc6a3e94232` succeeded with 20 ready child
  `NodeExecutionPacket` refs from the split parent;
- a sibling context-repair blocker remains precise and separate from the
  split/materialization layer.

Next build path:

1. Continue the Product/Spec proof from the nearest executable frontier or
   rerun from the top.
2. If the remaining sibling context blocker is still active, repair context
   handoff generation/selection rather than reworking split materialization.
3. Run one executable child worker smoke before counting Product/Spec as
   fully proven.

Spec:
`specs/split-required-resource-materialization-transition.md`.

## 2026-05-21 Resource Materialization Boundary Replay And Canonical Node Readiness

Completed implementation:
`openclaw-convergence.resource-materialization-boundary-replay-canonical-readiness`.

The payload/body storage substrate is implemented, and the resource
materialization boundary has now been lane-proven against the failed
Product/Spec runtime job without rerunning upstream phases. Product/Spec
proof can resume from the nearest executable frontier or rerun from the top
with resource readiness no longer conflated with context/scheduler failure.

Failure evidence:

- runtime job: `native-exec-78e1b33861780884`
- graph:
  `team-run-native-exec-78e1b33861780884-runtime-work-graph`
- graph reached 9 nodes / 11 edges / 3 role invocations.
- context scout and context repair handoffs were accepted.
- implementation nodes failed before worker invocation:
  - `g-faee9af635-implementation-wu-002-plugin-runtime-wiring`
  - `g-faee9af635-implementation-wu-003-planning-artifacts-compile-readiness`
  - `g-faee9af635-implementation-wu-004-readback-projection`
- `after-graph-selection` replay returned `needs_review` because it required
  accepted context synthesis or node-scoped context at the wrong boundary.

Current build path:

1. Model Task Classification And Utility Router v2. **Complete.**
2. Generic Node Resource Materialization Layer. **Complete.**
3. Implementation Context Snapshot Compiler. **Complete.**
4. Structured Tool/Schema Adapter Hardening. **Complete.**
5. Scheduler Readiness State Unification. **Complete.**
6. Product/Spec Replay Proof from the failed resource-materialization class.
   **Complete.**
7. Runtime Node Readiness And Transition Engine. **Complete.**
8. Context Scout Execution Packet And Request-Context Repair Compiler.
   **Closed from checkpointed proof evidence.**
9. Parallel Frontier Resource Boundary Hardening. **Partially validated.**
10. Runtime Artifact Payload Store And Bounded Manifests. **Implemented.**
11. Resource Materialization Boundary Replay And Canonical Node Readiness.
    **Complete.**
12. Full Product/Spec Planning Workflow Plugin Production Proof. **After the
    still-active Parallel Frontier Resource Boundary item is closed or
    explicitly superseded.**

Spec:
`specs/resource-materialization-boundary-replay-and-canonical-node-readiness.md`.

Completion evidence:

- `before-resource-materialization` replay against
  `native-exec-78e1b33861780884` exits successfully and preserves the precise
  non-worker blocker `resource_fulfillment_handoff_artifact_missing` for `bc-015`.
- `after-resource-materialization` replay inspects 4 payload-backed
  implementation nodes, finds 4 executable nodes, and reports 0 blockers.
- focused validation passed:
  `pnpm test:file extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/runtime-work-graph.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
  with 3 files and 89 tests.
- scoped type validation passed via `pnpm tsgo:fast` with the repo fallback
  policy.

Next slice:

- Canonical DB queue currently still ranks Parallel Frontier Resource Boundary
  Hardening ahead of Product/Spec. The closure path is now specified by
  `specs/pre-product-spec-frontier-worker-proof-gate.md`: prove branch
  isolation, context-limitation blocking, owner readback, and one executable
  payload-backed worker smoke before counting the full Product/Spec proof as
  the next active queue item.
- After Product/Spec, the generic runtime extraction path is documented in
  `specs/post-proof-generic-runtime-extraction.md`. Those items should remain
  post-proof unless the frontier proof exposes another generic runtime/coding
  plugin ownership failure.

## 2026-05-21 Runtime Artifact Payload Store And Bounded Manifests

Current implementation:
`openclaw-convergence.runtime-artifact-payload-store-bounded-manifests`.

The latest Product/Spec checkpointed proof for runtime job
`native-exec-78e1b33861780884` advanced beyond the original context-scout
packet issue and into implementation-resource materialization. It proved that
the scheduler can accept a graph, run context scout, add context-repair
nodes, and reselect an implementation node. It then failed before any
implementation worker executed because the runtime still wrote full
implementation resource packet bodies to artifact metadata.

Failure evidence:

- terminal reason codes:
  `worker_adapter_threw`, `worker_adapter_threw:artifact_metadata_limit`.
- graph reached 9 nodes / 11 edges / 3 role invocations.
- context handoffs were accepted for the initial scout and two repair scouts.
- implementation nodes never reached Kimi/Qwen/Codex file-edit execution.
- first open gate remained `resource_fulfillment` because node-scoped context was
  still incomplete for one implementation node and resource packet storage
  failed for the retry.

Implementation status:

- runtime artifact payload table added:
  `execution_platform.runtime_job_artifact_payloads`.
- runtime job repository now supports JSON payload put/get, manifest attach,
  hydration, payload parts, and parts hydration.
- `DynamicAgentTeamGraphRunner` now stores implementation context packets,
  implementation resource materialization results, implementation task
  packets, coding resource packets, and node execution packets as payload
  bodies with bounded artifact manifests.
- split-node metadata stores refs and bounded summaries, not full packet
  bodies.
- Work Queue readback surfaces runtime artifact payload manifest summaries
  without hydrating large bodies.
- boundary replay helper uses payload artifacts for implementation/resource
  packet bodies.

Validation:

- `pnpm test:file extensions/execution-platform/src/runtime-job-repository.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  passed: 3 files, 176 tests.
- `pnpm tsgo:fast extensions/execution-platform/src/runtime-job-repository.ts extensions/execution-platform/src/runtime-job-repository.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`
  passed; script policy fell back to full-repo verification.

Current build path:

1. Model Task Classification And Utility Router v2. **Complete.**
2. Generic Node Resource Materialization Layer. **Complete.**
3. Implementation Context Snapshot Compiler. **Complete.**
4. Structured Tool/Schema Adapter Hardening. **Complete.**
5. Scheduler Readiness State Unification. **Complete.**
6. Product/Spec Replay Proof from the failed resource-materialization class.
   **Complete.**
7. Runtime Node Readiness And Transition Engine. **Complete.**
8. Context Scout Execution Packet And Request-Context Repair Compiler.
   **Closed from checkpointed proof evidence.**
9. Parallel Frontier Resource Boundary Hardening. **Partially validated; the
   latest run advanced into the implementation-resource storage sub-boundary.**
10. Runtime Artifact Payload Store And Bounded Manifests. **Implemented;
    resource-storage substrate complete.**
11. Resource Materialization Boundary Replay And Canonical Node Readiness.
    **Complete.**
12. Full Product/Spec Planning Workflow Plugin Production Proof. **After the
    still-active Parallel Frontier Resource Boundary item is closed or
    explicitly superseded.**

Spec:
`specs/runtime-artifact-payload-store-and-bounded-manifests.md`.

The next Product/Spec proof pass should resume from the nearest executable
frontier first, then rerun the full Product/Spec proof from the top and
continue into implementation after the still-active Parallel Frontier
Resource Boundary item is closed or explicitly superseded.

## 2026-05-21 Parallel Frontier Resource Boundary Hardening

Current blocker implementation:
`openclaw-convergence.parallel-frontier-resource-boundary-hardening`.

The next Product/Spec proof is blocked by the runtime/scheduler boundary
exposed by runtime job `native-exec-68321aa82d7d6146`. The workflow now gets
through UX-compatible submission, source-prompt context indexing, Mission
Ledger, Commitment Work Packets, scheduler graph acceptance, Work Queue child
sync, and parallel frontier selection. It then fails before implementation
because resource materialization, context limitation semantics, context repair
edges, and parallel branch isolation are not yet strong enough.

Failure evidence:

- resource packet compiler/schema bounds diverged and a `resolvedTargetFileRefs`
  `too_big` schema error escaped as an adapter exception.
- `accepted_with_limitations` context handoffs that relied on runtime-supplied
  fallback refs could still move toward implementation without a
  consumer-specific nonblocking waiver.
- repair/acquisition context nodes could be created without consumer edges.
- one parallel branch exception could collapse the adapter result while sibling
  branches kept emitting.
- owner readback did not surface the exact schema path, bound, branch, node,
  context limitation, consumer edge state, and next legal transition.

Current build path:

1. Model Task Classification And Utility Router v2. **Complete.**
2. Generic Node Resource Materialization Layer. **Complete.**
3. Implementation Context Snapshot Compiler. **Complete.**
4. Structured Tool/Schema Adapter Hardening. **Complete.**
5. Scheduler Readiness State Unification. **Complete.**
6. Product/Spec Replay Proof from the failed resource-materialization class.
   **Complete.**
7. Runtime Node Readiness And Transition Engine. **Complete.**
8. Context Scout Execution Packet And Request-Context Repair Compiler.
   **Closed from checkpointed proof evidence; the latest run advanced beyond
   its original preflight/repair-envelope failure.**
9. Parallel Frontier Resource Boundary Hardening. **Next.**
10. Full Product/Spec Planning Workflow Plugin Production Proof. **After
    boundary replay proves this fix.**

Spec:
`specs/parallel-frontier-resource-boundary-hardening.md`.

The next implementation pass should make resource compilers safe-return
readiness evidence instead of throwing, enforce context limitation waivers per
consumer, compile context repair nodes with real consumer edges or
diagnostic-only lifecycle, isolate parallel frontier branch failures, and
surface exact boundary diagnostics in Work Queue/latest-run-state readback.

## 2026-05-21 Context Scout Execution Packet And Request-Context Repair

Previous blocker implementation:
`openclaw-convergence.context-scout-execution-packet-request-context-repair`.

The next Product/Spec proof is blocked by the resource-fulfillment boundary exposed
by runtime job `native-exec-06e162ea7066ac2e`. The top of the workflow now
works through Mission Ledger, Commitment Work Packets, and graph selection,
but context scout did not start because structured-adapter preflight rejected
the call shape:

- oversized context-scout input: about 42 KB against a 32 KB policy bound.
- provider-call timeout mismatch: 900 seconds requested against a 90 second
  `local_semantic_extraction` hard timeout.
- request-context repair fell back into forbidden model-authored runtime
  envelope fields instead of a semantic repair intent compiled by runtime.

Current build path:

1. Model Task Classification And Utility Router v2. **Complete.**
2. Generic Node Resource Materialization Layer. **Complete.**
3. Implementation Context Snapshot Compiler. **Complete.**
4. Structured Tool/Schema Adapter Hardening. **Complete.**
5. Scheduler Readiness State Unification. **Complete.**
6. Product/Spec Replay Proof from the failed resource-materialization class.
   **Complete.**
7. Runtime Node Readiness And Transition Engine. **Complete.**
8. Context Scout Execution Packet And Request-Context Repair Compiler.
   **Implemented; focused tests/typecheck passed. Boundary replay still
   required before full proof.**
9. Full Product/Spec Planning Workflow Plugin Production Proof. **After
   resource-fulfillment boundary replay passes.**

Spec:
`specs/context-scout-execution-packet-and-request-context-repair.md`.

Implementation evidence:

- `extensions/execution-platform/src/workflows/context-scout-execution-packet.ts`
- `extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts`
- `extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`
- `extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts`
- `extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts`
- `extensions/execution-platform/src/work-queue/execution-read-model.ts`

Validation:

- focused tests for packet compiler, request-context compiler, scheduler tool
  registration, and context-scout budget handling passed.
- `pnpm tsgo:fast` passed.
- focused boundary replay tests hung in the existing replay harness and were
  terminated; they are not counted as a replay pass.

## 2026-05-21 Runtime Node Readiness And Transition Engine

Current blocker: superseded by the resource-fulfillment blocker above.

The prior Product/Spec proof failed at the transition between accepted graph
state and worker execution. The runtime accepted a work graph, but could still
approve an implementation node while `resource_fulfillment` had not accepted any
target nodes. The immediate failure was
`worker_adapter_threw:unclassified`, but the root cause is earlier: missing
context/resource preconditions should have produced scheduler readiness
evidence and prerequisite nodes before any worker adapter could run.

Current build path:

1. Model Task Classification And Utility Router v2. **Complete.**
2. Generic Node Resource Materialization Layer. **Complete.**
3. Implementation Context Snapshot Compiler. **Complete.**
4. Structured Tool/Schema Adapter Hardening. **Complete.**
5. Scheduler Readiness State Unification. **Complete.**
6. Product/Spec Replay Proof from the failed resource-materialization class.
   **Complete.**
7. Runtime Node Readiness And Transition Engine. **Complete 2026-05-21.**
8. Context Scout Execution Packet And Request-Context Repair Compiler.
   **Next; see current blocker above.**
9. Full Product/Spec Planning Workflow Plugin Production Proof. **After
   resource-fulfillment boundary replay passes.**

The transition-engine item now separates graph acceptance, dependency
readiness, context readiness, resource readiness, and executability. It
retires direct production `approve_and_run_first_node` semantics in favor of
frontier evaluation/open/promotion tools, creates prerequisite nodes for
missing preconditions, and emits transition blockers into owner readback.

Completion evidence:

- runtime tools and scheduler execution gates:
  `extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts`
  and
  `extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts`.
- capability precondition manifest:
  `extensions/execution-platform/src/workflows/runtime-node-capability-registry.ts`.
- canonical lifecycle type:
  `extensions/execution-platform/src/workflows/node-resource-materialization.ts`.
- focused proof:
  `.artifacts/execution-platform/runtime-node-readiness-transition/proof.json`.
- DB closeout script:
  `scripts/execution-platform-record-runtime-node-readiness-transition-closeout.mjs`.

Spec:
`specs/runtime-node-readiness-transition-engine.md`.

## 2026-05-20 Model Task Classification And Resource Materialization

The next pre-Product/Spec proof block is now documented in
`specs/model-task-classification-and-resource-materialization.md`.

The latest Product/Spec proof reached Mission Ledger, Commitment Work
Packets, scheduler graph creation, and context scout, then stopped before
implementation because context handoff evidence did not materialize into
worker-ready target file refs, snapshots, and snapshot hashes. The scheduler
also reported context freshness while the implementation compiler reported
missing executable resources. That contradiction is now treated as a generic
runtime readiness failure, not a Kimi/Qwen worker failure.

Current build path:

1. Model Task Classification And Utility Router v2. **Complete 2026-05-20.**
2. Generic Node Resource Materialization Layer. **Complete 2026-05-20.**
3. Implementation Context Snapshot Compiler. **Complete 2026-05-20.**
4. Structured Tool/Schema Adapter Hardening. **Complete 2026-05-20.**
5. Scheduler Readiness State Unification. **Complete 2026-05-20.**
6. Product/Spec Replay Proof from the failed `wu-002` class of boundary. **Complete 2026-05-21.**
7. Runtime Node Readiness And Transition Engine. **Complete 2026-05-21.**
8. Context Scout Execution Packet And Request-Context Repair Compiler.
   **Next.**
9. Full Product/Spec Planning Workflow Plugin Production Proof. **After
   resource-fulfillment boundary replay passes.**

The existing scheduler-first node-scoped context and post-resource
implementation task compiler specs remain active sub-specs, but the Work
Queue should execute them under this broader resource-materialization block.
Old generated Product/Spec proof child rows are runtime diagnostics and should
not remain as active roadmap work between the blockers and the proof.

Completion evidence for item 1:

- canonical task policy registry and classifier:
  `extensions/execution-platform/src/model-tasks/model-task-classification.ts`.
- model.call enforcement:
  `extensions/execution-platform/src/model-tasks/model-call-runtime-tool.ts`.
- runtime span/readback fields:
  `extensions/execution-platform/src/observability/runtime-execution-span.ts`
  and `extensions/execution-platform/src/work-queue/execution-read-model.ts`.
- focused tests and proof:
  `extensions/execution-platform/src/model-tasks/model-task-classification.test.ts`,
  `extensions/execution-platform/src/observability/runtime-execution-span.test.ts`,
  `extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts`,
  and `.artifacts/execution-platform/model-task-classification-proof.json`.

Completion evidence for item 2:

- generic resource packet compiler and readiness gate:
  `extensions/execution-platform/src/workflows/node-resource-materialization.ts`.
- scheduler runtime tools:
  `extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts`.
- production scheduler enforcement:
  `extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts`
  and `extensions/execution-platform/src/workflows/agent-team-coding-plugin.ts`.
- coding-team packet materialization before implementation worker execution:
  `extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`.
- owner-facing readback:
  `extensions/execution-platform/src/work-queue/execution-read-model.ts`.
- validation tooling repair:
  `scripts/run-tsgo-fast.mjs`, `scripts/run-tsgo.mjs`, and
  `scripts/lib/tsgo-fast-target-config.mjs`.
- focused tests and proof:
  `extensions/execution-platform/src/workflows/node-resource-materialization.test.ts`,
  `scripts/lib/tsgo-fast-target-config.test.mjs`, and
  `.artifacts/execution-platform/node-resource-materialization/proof.json`.

Completion evidence for item 3:

- implementation context snapshot compiler:
  `extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.ts`.
- first-class runtime tools:
  `context.resolve_target_refs`, `repo.snapshot_target_files`,
  `context.compile_implementation_context_packet`,
  `implementation.compile_task_packet`, and
  `implementation.evaluate_readiness` in
  `extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts`.
- production DynamicAgentTeamGraphRunner pre-worker materialization:
  `extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`.
- owner-facing implementation-context/resource readback:
  `extensions/execution-platform/src/work-queue/execution-read-model.ts`.
- focused tests and proof:
  `extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.test.ts`,
  `extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts`,
  and
  `.artifacts/execution-platform/implementation-context-snapshot-compiler/proof.json`.

Completion evidence for item 4:

- structured provider profiles, preflight gates, provider diagnostics, and
  outcome classifier:
  `extensions/execution-platform/src/model-tasks/structured-tool-schema-adapter.ts`.
- model.call and OpenRouter role-call enforcement:
  `extensions/execution-platform/src/model-tasks/model-call-runtime-tool.ts`
  and
  `extensions/execution-platform/src/codex-bridge/live-agent-team-runner.ts`.
- owner-facing adapter readback:
  `extensions/execution-platform/src/work-queue/execution-read-model.ts`.
- focused tests and proof:
  `extensions/execution-platform/src/model-tasks/structured-tool-schema-adapter.test.ts`,
  `extensions/execution-platform/src/model-tasks/model-task-classification.test.ts`,
  `extensions/execution-platform/src/codex-bridge/live-agent-team-runner.test.ts`,
  `extensions/execution-platform/src/work-queue/execution-read-model.test.ts`,
  and
  `.artifacts/execution-platform/structured-tool-schema-adapter/proof.json`.

Completion evidence for item 5:

- canonical `NodeReadinessState` contract and evaluator:
  `extensions/execution-platform/src/workflows/node-resource-materialization.ts`.
- production scheduler worker gate and repair/readback propagation:
  `extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts`
  and
  `extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`.
- owner-facing readiness readback:
  `extensions/execution-platform/src/work-queue/execution-read-model.ts`.
- focused tests and proof:
  `extensions/execution-platform/src/workflows/node-resource-materialization.test.ts`,
  `extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`,
  `extensions/execution-platform/src/work-queue/execution-read-model.test.ts`,
  and
  `.artifacts/execution-platform/scheduler-readiness-state-unification/proof.json`.

Completion evidence for item 6:

- Product/Spec boundary replay from the existing graph-selection checkpoint:
  `scripts/execution-platform-run-product-spec-boundary-replay.mjs`.
- `after-graph-selection` replay now materializes the existing implementation
  frontier directly instead of asking the orchestrator to plan again.
- implementation resource materialization produced file-resolved
  `ImplementationTaskPacket`, `CodingResourcePacket`, `NodeExecutionPacket`,
  target file snapshots/hashes, and canonical `NodeReadinessState` refs before
  any worker invocation.
- graph node metadata keeps bounded refs/readback summaries only; full packet
  bodies stay in runtime artifacts to avoid metadata-cap and stale-packet
  risks.
- proof artifact:
  `.artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json`.

## 2026-05-20 Post-Context Implementation Task Compiler

The latest Product/Spec proof showed that the scheduler can produce a
reasonable high-level coding-team graph, but it still promotes broad work
groups into implementation nodes too early.

Correction:

- the first scheduler graph is a work-intent graph.
- context scouts run against work-intent nodes.
- runtime compiles accepted scout handoffs into
  `ImplementationTaskPacket`s with concrete target files, snapshots,
  validation refs, allowed edit scope, expected patch shape, and evidence
  expectations.
- executable implementation/test/docs/readback nodes are created only from
  accepted implementation task packets.
- Product/Spec runtime node kinds such as `planning_orchestrator` and
  `planning_capsule` are target primitives to build, not nodes expected to
  execute inside the coding-team implementation graph.

Spec:
`specs/post-resource-implementation-task-compiler.md`.

Next action:
implement the production compiler and replay from the node-scoped context
boundary. Do not treat a high-level implementation group as Kimi-ready until
the compiler has produced accepted file-resolved task packets.

## 2026-05-20 Scheduler-First Node-Scoped Context Supply

The active Product/Spec proof architecture is shifting from mandatory
commitment-scoped context fanout to scheduler-first work graph creation.

Target flow:

1. Mission Ledger.
2. Commitment Work Packets.
3. draft work-intent graph from packets.
4. node-scoped context scouts in parallel.
5. implementation readiness per node.
6. optional synthesis only for cross-node coordination.
7. ready-node execution.

This is documented in
`specs/scheduler-first-node-scoped-resource-fulfillment.md` and now needs runtime
implementation plus focused replay proof from the accepted-packet boundary.

## 2026-05-20 Packet And Implementation Readiness Boundary Repair

The current Product/Spec blocker repair is complete through focused tests and
one real-model narrow lane. The full Product/Spec proof has not been rerun.

What changed:

- packet authoring now matches the intended two-step protocol: Qwen writes
  semantic packet content, Qwen optionally fills only missing semantic fields,
  and runtime compiles the canonical CommitmentWorkPacket.
- normal packet proof now records GPT-5.5 rescue count and should require
  zero rescue except for an explicitly accepted provider incident.
- implementation nodes now stop before worker invocation if target snapshots,
  validation refs, commitment ids, or accepted context handoff summaries are
  missing.
- scheduler context repair is runtime-owned: failed implementation readiness
  creates focused context-scout repair nodes/edges without model-authored
  executable graph envelopes.
- the non-Codex worker loop no longer treats missing validation refs or
  missing commitment mapping as a duplicate terminal packet-invalid gate; it
  can still derive validation or request context, while the production runner
  owns pre-worker readiness blocking.
- schema/contract rollback detection now actually matches structural failure
  substrings in validation output.

Real-model lane passed:

- `scripts/execution-platform-run-commitment-packet-real-model-lane.mjs`
- `qwen/qwen3-coder-next`
- artifact:
  `.artifacts/execution-platform/commitment-packet-real-model-lane-mpe1w7xq.json`
- semantic content: 17.7s.
- targeted normalization: 1.7s.
- final packet: no missing semantic fields and scheduler validation passed.

Validation passed:

- focused dynamic-runner/scheduler/packet tests.
- focused non-Codex worker/adapter/packet tests.
- `pnpm tsgo:full`.

Next action:
resume Product/Spec through the replay harness at the latest useful boundary
and inspect implementation readiness and worker execution. Do not restart from
the front door unless the next proof explicitly requires a full UX run.

## 2026-05-20 Product/Spec Proof Repair Pass

The active Product/Spec proof repair pass is complete through focused
validation. The next proof action is not a full prompt restart; it is a
boundary replay from context synthesis using the saved Product/Spec checkpoint.

What changed:

- latest-run-state checkpoint files now preserve operator-visible phase,
  blocker, next action, wall time, usage availability, and retry state through
  context compaction.
- packet model review is retired from the production packet path. Packet
  authoring must pass compiler/readiness gates directly; structural risk
  signals remain diagnostic, and production no longer burns GPT-5.5 review or
  re-enters packet repair after clean fanout.
- context synthesis now has a manifest boundary, alias normalization for group
  guidance, and focused field repair before terminal needs_review.
- adapter needs_review is terminal diagnostic state in runtime jobs/readback,
  not a hidden retry-scheduled pending loop.

Validation passed:

- focused tests for context synthesis, dynamic runner, Work Queue readback,
  worker supervisor, latest-run-state, and scheduler.
- script syntax checks for the checkpointed proof and boundary replay harness.
- `pnpm tsgo:fast`.

Next step:
continue Product/Spec from the repaired post-synthesis graph boundary; the
context synthesis continuation now works and must not be restarted from the
front door unless a full UX proof is explicitly requested.

Replay result:

- The replay identified and fixed a lossy handoff between context synthesis
  and post-synthesis graph compilation. The model output was accepted with
  multiple implementation groups, but the scheduler consumed the truncated
  owner-facing metadata summary and compiled too few implementation nodes.
- Context synthesis now returns a dedicated
  `context_synthesis_graph_compile_handoff` contract for scheduler
  compilation. It is separate from artifact/readback metadata and must carry
  all implementation groups or stop as `needs_review`.
- The repaired replay from `after-parallel-context` accepted synthesis with 7
  groups and compiled all 7 groups into implementation nodes, followed by
  validation, review, readback, and closeout nodes. The replay stopped at the
  configured checkpoint before implementation execution.
- `max_iterations` checkpoint stops now terminalize graphs as `needs_review`
  rather than `failed`, preserving the distinction between a bounded replay
  stop and a hard runtime failure.

## 2026-05-19 Fallback And Compatibility Retirement

The current active coding-executor capability-leap item is complete through:

`openclaw-convergence.coding-leap-06-fallback-compat-retirement` -
Fallback And Compatibility Retirement.

Production workflow execution now has one gateway-facing dispatch boundary:
`ProductionWorkflowExecutionFactory`. Production chat/native run-once paths no
longer instantiate the old generic queued workflow runner for non-agent-team
jobs. That runner shim, its retirement proof, and its test have been deleted;
canonical workflow definitions/plugins and the runtime graph engine now own
workflow execution. Agent-team jobs continue through the scheduler-backed
production adapter under the canonical public name `CodingTeamRuntimeJobRunner`.

Public runtime API exports were tightened. Retired/proof-era surfaces are not
exported from `codex-bridge/index.ts`: queued runners, legacy context scout
pilot helpers, live pilot proof entrypoints, single-job coding-team quality
proof gates, old Kimi source-edit proof targets, and low-level Kimi patch-JSON
adapter classes. The obsolete modules and proof scripts that depended on those
surfaces have been deleted, not merely moved behind compatibility shims.
`NativeExecutionRpcService`
requires the typed Front Door provider for free-form execution submit and no
longer keeps the legacy semantic router as a production fallback.

The generated Work Queue cleanup control path was rerun and passed. Stale
debug/proof child rows were backfilled as generated debug/proof diagnostics,
archived through `reconcileTerminalRuntimeProjections`, hidden from owner
active queue readback, and closed via accepted DB closeout evidence.

Validation:

- focused production factory/export/host route tests passed.
- router, Mission Ledger, work packet, scheduler, context scout, worker,
  validation, closeout, production factory, and export-hygiene model-boundary
  lane passed: 14 test files, 140 tests.
- `pnpm tsgo:fast` passed.
- live narrow model lane passed with `qwen/qwen3-coder-next` selecting
  code-intelligence runtime tools.

Next item:
`openclaw-convergence.active-queue-34` - Product/Spec Planning Workflow Plugin
Production Proof.

DB Work Queue closeout:

- closeout ref:
  `artifact://execution-platform/fallback-compat-retirement-closeout.json`
- closeout hash:
  `sha256:91c9312fcf43bd5f2f364bcb6f16f944a80758bcbbaaf86b67ed34e1ebdd4d30`
- queue status:
  `closed`

## 2026-05-19 Non-Codex Compound Coding Tools

The current active coding-executor capability-leap item is complete through:

`openclaw-convergence.coding-leap-05-non-codex-compound-tools` -
Non-Codex Compound Coding Tools.

The non-Codex worker loop now has first-class compound coding tools:
`coding.inspect_edit_validate`, `coding.add_test_and_validate`,
`coding.update_docs_and_cross_refs`, `coding.refactor_symbol_with_lsp`,
`coding.fix_type_errors`, and `coding.apply_small_patch_with_evidence`.
These tools run through Runtime Tool Kernel under the `coding.compound`
family and bounded repo-write authority. They are live in the
`agent_team.coding` runtime tool family set.

Compound tools do not bypass runtime truth. The model selects the compound
tool and semantic edit intent; runtime owns file refs, edit transaction,
validation execution, evidence refs, repair classification, and raw-storage
policy. Successful compound tools now satisfy worker changed-file,
validation, evidence, and closed-transaction gates. Missing edits, failed
patch application, failed validation, or missing LSP-style semantic backend
refs stop as `needs_review` with repair classification refs instead of
claiming implementation success.

Worker-internal progress and Work Queue active graph readback now surface
compound execution:

- selected compound tool id;
- compound sub-event count;
- compound sub-event phases;
- changed-file refs, validation refs, evidence refs, and edit transaction
  refs.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/workflows/agent-team-coding-plugin.test.ts extensions/execution-platform/src/workflows/runtime-node-capability-registry.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `pnpm exec tsx -e "Promise.all([import('./extensions/execution-platform/src/work-queue/execution-read-model.ts'), import('./extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts'), import('./extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.ts')]).then(()=>console.log('compound-imports-ok'))"`
- Historical only, retired 2026-05-28:
  `scripts/execution-platform-run-non-codex-compound-tool-model-lane-proof.mjs`
  was deleted because it invoked the worker loop without a canonical
  `NodeExecutionPacket` and carried a retired `context-synthesis://` fixture.
  The later node-lifecycle ownership consolidation also deleted the standalone
  worker-readiness real-model proof script because it bypassed
  `NodeLifecycleTransitionRunner`; current closure evidence must use the
  runner-owned lifecycle walk and production replay paths.

The required narrow model lane passed. `qwen/qwen3-coder-next` selected
`coding.inspect_edit_validate`, the runtime worker loop applied the scoped
edit, validation passed, evidence was claimed, the edit transaction closed,
and compound phase events were emitted. Bounded artifact:
`.artifacts/execution-platform/non-codex-compound-tool-model-lane-mpcy484e.json`
with hash
`sha256:01df2d0d4059454819d208de3fc9533396cd5ecd1ce92c4648303fcc66a1c1e7`.

Known validation limitation: `pnpm tsgo:fast` remains blocked by pre-existing
workflow-definition/evidence-profile type debt unrelated to this slice.

DB Work Queue closeout:

- closeout ref:
  `artifact://execution-platform/non-codex-compound-tools-closeout.json`
- closeout hash:
  `sha256:7b636ba5dc2df083dc8f6ca6ed9ce94abf6598442dcad3bc77632f6d42a4f464`
- queue status:
  `closed`

Next pre-Product/Spec item:
`openclaw-convergence.coding-leap-06-fallback-compat-retirement` -
Fallback And Compatibility Retirement.

Diagnosis update for that item:

- include a bounded refactor pass, not only deletion of old names;
- create one production workflow execution factory for gateway/chat/native
  run-once paths;
- collapse queued runners to migration/test shims or route production through
  the canonical scheduler-backed runtime only;
- remove retired/proof adapters from public runtime barrels or move them under
  explicit diagnostic/test-only exports;
- make degraded/system closeout diagnostic-only everywhere and prove it cannot
  satisfy success;
- isolate proof/replay harness lifecycle so debug scripts cannot masquerade as
  production execution or closeout;
- retire stale generated Product/Spec proof/helper rows through generated-item
  lifecycle policy and prevent them from remaining owner-visible active work;
- prove compatibility maps derive from canonical registries;
- fix workflow-definition/evidence-profile type drift so `pnpm tsgo:fast`
  becomes a required success gate for the next pass.

## 2026-05-19 Worker-Internal Streaming And Operator Readback

The current active coding-executor capability-leap item is complete through:

`openclaw-convergence.coding-leap-04-worker-streaming-readback` -
Worker-Internal Streaming And Operator Readback.

Worker-internal progress is now first-class owner readback, not only
node-level scheduler status. The non-Codex tool worker loop emits bounded
phase events for controller model turns, tool completions, validation,
repair, stale-context refresh, evidence handoff, provider no-content, and
timeout boundaries. Those events carry packet refs, context refs, synthesis
refs, code-intelligence refs, selected tool and status, validation command
refs/summaries, edit transaction state, output hash/content length, provider
latency, timeout, finish reason, token count, blocker, next decision, and ELI5
state.

The dynamic coding graph runner persists those events through scheduler
progress and RuntimeExecutionSpan/model-call summaries. Work Queue active
graph readback exposes a `workerInternal` section beside scheduler, model,
tool, and span progress so an operator can answer what the worker is doing,
why it was selected, which model/provider/tool is active, what context and
validation are in use, what evidence was produced, what is blocked, and what
decision comes next.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.test.ts extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts').then(()=>console.log('non-codex-worker-loop-import-ok'))"`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts').then(()=>console.log('dynamic-runner-import-ok'))"`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/work-queue/execution-read-model.ts').then(()=>console.log('execution-read-model-import-ok'))"`
- `node --import tsx scripts/execution-platform-run-worker-streaming-readback-model-lane-proof.mjs`

The required narrow model lane passed with `qwen/qwen3-coder-next`: the model
read the bounded owner-facing worker progress packet and recovered the active
worker action, `moonshotai/kimi-k2.6` model/provider, selected worker tool,
evidence refs, validation refs, no-blocker state, and next decision. Bounded
artifact:
`.artifacts/execution-platform/worker-streaming-readback-model-lane-mpcwyonc.json`
with hash
`8a27bf1c05616ee69f92ff60e07f1ba1d54253b1a46255b183422ebc940d6178`.

Known validation limitation: `pnpm tsgo:fast` remains blocked by pre-existing
workflow-definition/evidence-profile type debt unrelated to this slice.

DB Work Queue closeout:

- closeout ref:
  `artifact://execution-platform/worker-streaming-readback-closeout.json`
- closeout hash:
  `sha256:721c930e122c9a88334d015887152500be7e35ebf2e5c82a63a55ead41724018`
- queue status:
  `closed`

Next pre-Product/Spec item:
`openclaw-convergence.coding-leap-05-non-codex-compound-tools` -
Non-Codex Compound Coding Tools.

## 2026-05-19 Context Synthesis Barrier And Scheduler Handoff

The current active coding-executor capability-leap item is now complete
through:

`openclaw-convergence.coding-leap-03-context-synthesis-scheduler-handoff` -
Context Synthesis Barrier And Scheduler Handoff.

Context synthesis is now a production scheduler handoff barrier rather than a
summary/ref placeholder. The synthesis artifact carries worker-ready
implementation groups, file ownership refs, cheaper-worker suitability, Codex
escalation rationale, expected output, evidence-claim expectations, validation
needs, review needs, stop-if-missing blockers, risks, integration
requirements, scout state summaries, semantic code-intelligence refs,
validation lanes, review lanes, worker-fit summary, and graph-compile
readiness.

Runtime owns refs and freshness. If the model omits source context snapshot
refs, `normalizeContextSynthesisArtifact` preserves the runtime-provided fresh
snapshot refs instead of letting the handoff lose context provenance. Ready
synthesis is rejected if it lacks worker-ready group detail, evidence
expectations, validation/review lanes, worker-fit rationale, dependency or
explicit parallelism, or fresh required context.

The dynamic graph runner now feeds the context synthesis model accepted scout
node summaries, context snapshot refs, semantic code-intelligence refs,
CommitmentWorkPackets, mission summary, and the full expected handoff shape.
Scheduler progress and Work Queue active graph readback expose synthesis
status, synthesis ref, group/dependency/parallel/blocker counts, worker-fit
summary, graph-compile input summary, implementation group ids, target refs,
validation lanes, review lanes, and semantic code-intelligence refs.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/workflows/context-synthesis.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/codex-bridge/parallel-context-scout-boundary-replay.test.ts`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/workflows/context-synthesis.ts').then(()=>console.log('context-synthesis-import-ok'))"`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts').then(()=>console.log('dynamic-agent-team-graph-runner-import-ok'))"`
- `node --import tsx scripts/execution-platform-run-context-synthesis-model-lane-proof.mjs`

The bounded model lane passed with `qwen/qwen3-coder-next` in one attempt.
The model produced a scheduler-ready synthesis artifact that normalized and
validated through the production contract without repair. Bounded artifact:
`.artifacts/execution-platform/context-synthesis-model-lane-mpcw7p7r.json`
with hash
`a4a1a9ac165fbf26db9499be5ac075fa5ba37643a0f588b56d05f24d1d1f41a8`.

Known validation limitation: `pnpm tsgo:fast` remains blocked by pre-existing
workflow-definition/evidence-profile type debt unrelated to this slice.

DB Work Queue closeout:

- closeout ref:
  `artifact://execution-platform/context-synthesis-scheduler-handoff-closeout.json`
- closeout hash:
  `sha256:f25757a9ab0dcb6fd1d5c3c7c908ddc1206b7a6868c119b0d564a995f76c6000`
- queue status:
  `closed`

Next pre-Product/Spec item:
`openclaw-convergence.coding-leap-04-worker-streaming-readback` -
Worker-Internal Streaming And Operator Readback.

## 2026-05-19 Code Intelligence Semantic Backend And LSP Parity

The current active coding-executor capability-leap item is now complete
through:

`openclaw-convergence.coding-leap-02b-code-intelligence-lsp-semantic-backend`

- Code Intelligence Semantic Backend And LSP Parity.

Execution Platform now has a canonical Code Intelligence backend registry.
The production TS/JS path uses TypeScript language-service APIs through
`typescript_language_service`; structural parsing remains available only as
explicit degraded mode. The model-facing `code.*` tool IDs did not fork.
Runtime-owned result envelopes now expose backend id, backend health ref,
workspace snapshot ref, semantic confidence, fallback state, diagnostic
version ref, project config refs, backend latency, result counts, and
limitations. `code.backend_status` reports bounded backend readiness without
asking the model to invent runtime schema.

Context scout, parallel context replay, and Work Queue active graph readback
now preserve semantic backend refs and limitations. Structural-only
code-intelligence evidence is accepted with limitations instead of being
treated as clean semantic success.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/code-intelligence/code-intelligence-service.test.ts extensions/execution-platform/src/code-intelligence/code-intelligence-runtime-tools.test.ts extensions/execution-platform/src/workflows/context-scout-tool-loop.test.ts extensions/execution-platform/src/workflows/mission-work-packets.test.ts extensions/execution-platform/src/codex-bridge/parallel-context-scout-boundary-replay.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/code-intelligence/code-intelligence-backends.ts').then(()=>console.log('semantic-backend-import-ok'))"`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/code-intelligence/code-intelligence-service.ts').then(()=>console.log('code-intelligence-service-import-ok'))"`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts').then(()=>console.log('context-scout-node-executor-import-ok'))"`
- `node --import tsx scripts/execution-platform-run-code-intelligence-model-usability-proof.mjs`

The bounded model-usability lane passed with Qwen selecting semantic
definition, reference, and related-test tools. The proof required
`typescript_semantic` results from `typescript_language_service` with no
structural fallback. Bounded artifact:
`.artifacts/execution-platform/code-intelligence-model-usability-mpcv9txe.json`
with hash
`025bd658a39250c8eda9a1f346dd2c1a913c95da3eae397529e9b2960fc60317`.

Known validation limitation: `pnpm tsgo:fast` remains blocked by pre-existing
workflow-definition/evidence-profile type debt unrelated to this slice. The
semantic backend introduced no remaining type errors in that run.

DB Work Queue closeout:

- closeout ref:
  `artifact://execution-platform/code-intelligence-semantic-backend-closeout.json`
- closeout hash:
  `sha256:e695914d4ded2118358295547f414e519589c0b6d63039f7cc9369e52243c81e`
- queue status:
  `closed`

Next pre-Product/Spec item:
`openclaw-convergence.coding-leap-03-context-synthesis-scheduler-handoff` -
Context Synthesis Barrier And Scheduler Handoff.

## 2026-05-19 Context Scout Over Code Intelligence

The current active coding-executor capability-leap item is now complete
through:

`openclaw-convergence.coding-leap-02-context-scout-code-intelligence` -
Context Scout Over Code Intelligence.

Production context scout nodes now consume the Code Intelligence Substrate
directly through Runtime Tool Kernel. Before asking the context scout model to
author the handoff, the executor records bounded `code.search_symbols`,
`code.get_document_symbols`, `code.get_diagnostics`,
`code.find_related_tests`, and `code.find_impact_radius` tool calls. The
handoff packet and tool-loop artifact carry code-intelligence result refs,
runtime tool invocation refs, symbol refs, diagnostic refs, related-test refs,
impact refs, semantic mode, and structural-mode limitations.

The context scout repo-analysis contract now has first-class
code-intelligence, diagnostic-surface, and impact-radius finding kinds. Weak
runtime-only context remains blocked or limited; structural code intelligence
does not masquerade as LSP semantic parity.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/workflows/context-scout-tool-loop.test.ts extensions/execution-platform/src/workflows/mission-work-packets.test.ts extensions/execution-platform/src/codex-bridge/parallel-context-scout-boundary-replay.test.ts extensions/execution-platform/src/code-intelligence/code-intelligence-service.test.ts extensions/execution-platform/src/code-intelligence/code-intelligence-runtime-tools.test.ts`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts').then(()=>console.log('context-scout-node-executor-import-ok'))"`

Known validation limitation: `pnpm tsgo:fast` remains blocked by pre-existing
workflow-definition/evidence-profile type debt unrelated to this slice.

Next pre-Product/Spec item:
`openclaw-convergence.coding-leap-02b-code-intelligence-lsp-semantic-backend`

- Code Intelligence Semantic Backend And LSP Parity.

## 2026-05-19 Code Intelligence Substrate

The current active coding-executor capability-leap item is now complete
through:

`openclaw-convergence.coding-leap-01-code-intelligence-substrate` - Code
Intelligence Substrate.

Execution Platform now has a first-class `code-intelligence` module with a
shared `CodeIntelligenceService`, bounded TS/JS structural code analysis, and
Runtime Tool Kernel-backed tools for symbol search, definitions, references,
hover, diagnostics, document/workspace symbols, call hierarchy,
implementations, rename planning, code actions, related tests, import graph,
impact radius, and file-structure summaries.

The scheduler runtime tool registry now exposes the `code.*` tool family as
read-only runtime tools, and the coding workflow definition/plugin advertise
`code_intelligence.query` as a production tool family. Work Queue active graph
readback now has a `codeIntelligence` section for tool refs, semantic mode,
result refs, symbol/diagnostic/test/impact refs, stale blockers, summaries,
and raw-storage false flags.

Focused proof:

- `pnpm test:file extensions/execution-platform/src/code-intelligence/code-intelligence-service.test.ts extensions/execution-platform/src/code-intelligence/code-intelligence-runtime-tools.test.ts`
- `node --import tsx scripts/execution-platform-run-code-intelligence-model-usability-proof.mjs`

The live model usability proof passed with Qwen selecting
`code.get_definition`, `code.get_references`, and `code.find_related_tests`,
executing those selections through Runtime Tool Kernel, and judging the
bounded outputs usable. Bounded artifact:
`.artifacts/execution-platform/code-intelligence-model-usability-mpctudkn.json`
with hash
`3ffc680535b33b9fe68ea7125b4b1648ef789679b941136df4c345e1eb4459c9`.

Known validation limitation: `pnpm tsgo:fast` remains blocked by pre-existing
workflow-definition/evidence-profile type debt unrelated to the
code-intelligence substrate.

Next pre-Product/Spec item:
`openclaw-convergence.coding-leap-02-context-scout-code-intelligence` -
Context Scout Over Code Intelligence.

Planned semantic-code-intelligence gap closure:
`openclaw-convergence.coding-leap-02b-code-intelligence-lsp-semantic-backend`

- Code Intelligence Semantic Backend And LSP Parity. This is now queued after
  the context scout consumer pass and before context synthesis/scheduler handoff
  so structural-mode scout evidence can calibrate the semantic backend while the
  downstream graph does not become dependent on weak code context.

## 2026-05-19 Coding Executor Team Capability Leap Planning

The external-baseline coding executor review is now documented in:

- [Coding Executor Team Massive Leap Research](/projects/execution-platform/specs/coding-executor-team-massive-leap-research)
- [Coding Executor Team Capability Leap](/projects/execution-platform/specs/coding-executor-team-capability-leap)

Decision: Product/Spec Planning remains the near-term proof target, but the
next proof should not run until the following capability-leap blockers are
complete and DB Work Queue active ranks reflect that order:

1. Code Intelligence Substrate.
2. Context Scout Over Code Intelligence.
3. Code Intelligence Semantic Backend And LSP Parity.
4. Context Synthesis Barrier And Scheduler Handoff.
5. Worker-Internal Streaming And Operator Readback.
6. Non-Codex Compound Coding Tools.
7. Fallback And Compatibility Retirement.
8. Product/Spec Planning Production Upgrade Proof.

This is a shift from proof-specific repair to coding-harness parity work. The
goal is to close structural gaps against mature coding harnesses while
preserving OpenClaw's runtime truth, evidence, Work Queue, and closeout
architecture.

## 2026-05-19 Span-Level Observability And Readback

The current active pre-Product/Spec native-leap item is now complete through:

`openclaw-convergence.native-leap-11-span-observability-readback` -
Span-Level Observability And Readback.

Runtime execution now has a canonical bounded `RuntimeExecutionSpan` contract
for model calls, runtime tools, worker phases, scheduler decisions, graph
nodes, validation commands, edit transactions, repair attempts, boundary
replay checkpoints, context scout/synthesis, closeout finalization,
supervisor lease/adapter work, Work Queue projection, and human-task style
runtime phases. Scheduler-backed coding-team progress emits span refs beside
the existing scheduler progress artifacts, Runtime Tool Kernel traces carry
execution span metadata, and RuntimeWorkerSupervisor records supervisor and
adapter spans.

Work Queue active graph readback now exposes `spanProgress`: active span,
recent spans, stale spans, blocked spans, current model/tool/worker, current
objective, input/output/evidence refs, blocker, next action, and ELI5 state.
Closeout finalization evidence packets now require runtime execution span refs
before clean finalization can be accepted, so observability is production
evidence rather than only UI decoration.

`openclaw-convergence.native-leap-12-repair-classification-before-retry` -
Repair Classification Before Retry is now implemented.

Runtime repair now has a bounded `RuntimeRepairClassification` contract tied
to graph/node/runtime-job/span/tool/commitment refs. Scheduler node failures,
context freshness blocks, invalid evidence claims, and needs-review outcomes
record canonical repair classification through the scheduler runtime tool path
before retry, repair, escalation, or upstream replay can proceed. Needs-review
node retries are rejected unless the target node has an accepted repair
classification ref and the classification strategy allows retry. Work Queue
active graph readback now exposes latest repair class, failed boundary,
strategy, selected repair boundary, affected commitments, field paths, reason
codes, and next action.

Follow-up hardening completed in this slice extends the same invariant inside
the non-Codex tool worker loop. Worker-internal validation repair, stale patch
freshness refresh, diagnostic-only repair turns, provider no-content, and
provider timeout now record canonical repair classification before retry or
escalation. The shared retry gate rejects missing/terminal/mismatched
classifications, and Kimi/non-Codex Work Queue readback surfaces the
worker-internal classification refs and summaries beside phases and edit
transactions.

Next pre-Product/Spec item:
`openclaw-convergence.active-queue-34` - Product/Spec Planning Workflow Plugin
Production Proof.

## 2026-05-19 First-Class Validation And Test Worker

The current active pre-Product/Spec native-leap item is now complete through:

`openclaw-convergence.native-leap-10-first-class-validation-test-worker` -
First-Class Validation And Test Worker.

Validation is now represented as a first-class scheduler node and runtime
tool-worker surface rather than a hidden post-edit command afterthought.
`ValidationTaskPacket` v2 carries workflow id, Mission Ledger refs,
Commitment Work Packet refs, context snapshot refs, approved runtime command
definitions, target/changed file refs, evidence expectations, failure mapping
expectations, repair handoff expectations, and raw-storage false flags.

The validation/QA runtime tool surface now includes
`validation.select_commands` beside plan, command execution, result summary,
failure classification, failure-to-commitment mapping, repair plan, coverage
review, evidence acceptance, and QA sufficiency review. `validation.run_command`
requires both an approved command ref and the runtime-owned approved command
definition; arbitrary shell-shaped strings no longer become approved
validation commands.

Production scheduler validation nodes emit owner-facing progress before
planning, command selection, each command run, each command result, failure
classification, repair handoff, evidence packet creation, and boundary
checkpoint recording. Failed validation produces same-job repair node/edge
handoffs instead of terminalizing when repairable. Work Queue readback surfaces
validation command refs/summaries, current command status, result refs,
failure refs, repair plans, repair nodes, repair handoffs, accepted evidence
packet refs, blocking commitment ids, and ELI5 progress.

Next pre-Product/Spec native-leap item:
`openclaw-convergence.native-leap-11-span-observability-readback` -
Span-Level Observability And Readback.

## 2026-05-19 Production Boundary Replay

The current active pre-Product/Spec native-leap item is now complete through:

`openclaw-convergence.native-leap-09-production-boundary-replay` -
Production Boundary Replay.

Boundary replay checkpoints now carry boundary input/output hashes,
repo/worktree/authority identity fields, and an identity binding hash.
Replay planning uses the latest checkpoint per required boundary, rejects
stale or identity-mismatched latest checkpoints even when older accepted
evidence exists, and produces an explicit production continuation contract
through `GenericOrchestrationRuntime.runSchedulerGraph` and
`RuntimeWorkGraphScheduler.run`. Work Queue readback surfaces the exact
continuation action, continuation mode, latest accepted checkpoint ref,
skipped upstream boundaries, resume artifact refs, and invalid replay reason
codes.

Next pre-Product/Spec native-leap item:
`openclaw-convergence.native-leap-10-first-class-validation-test-worker` -
First-Class Validation And Test Worker.

## 2026-05-19 Safe Parallelism And Supersteps

The current active pre-Product/Spec native-leap item is now complete through:

`openclaw-convergence.native-leap-07-safe-parallelism-supersteps` - Safe
Parallelism And Supersteps.

Runtime Work Graph supersteps now treat provider/model capacity as a counted
runtime budget instead of a hard conflict mutex. File write scopes, validation
resources, runtime job refs, Work Queue refs, human decisions, explicit
no-parallel refs, and graph dependencies remain hard conflict locks. Provider
profiles/classes can now allow bounded parallel peer nodes through
`providerConcurrencyLimit`, while Work Queue readback surfaces provider budget
keys, limits, runnable nodes, selected nodes, and skipped nodes alongside the
parallel frontier, dependency layers, conflicts, joins, and completed/blocked
branches.

Next pre-Product/Spec native-leap item:
`openclaw-convergence.native-leap-09-production-boundary-replay` - Production
Boundary Replay.

## 2026-05-19 Repo-Analysis Context Scout

The current active pre-Product/Spec native-leap item is now complete through:

`openclaw-convergence.native-leap-06-repo-analysis-context-scout` -
Repo-Analysis Context Scout.

Context scout is now a repo-analysis tool-loop surface instead of a thin JSON
role response plus grounding parser. Production context scout paths emit
canonical runtime tool refs for repo search, bounded file listing/reading,
symbol inspection, related-test discovery, context handoff, limitations,
evidence claims, and context requests. Context handoff packets carry
commitment packet refs, source-prompt excerpt refs, symbol refs, test refs,
synthesis handoff summaries, and bounded context evidence refs. Tool-loop
artifacts carry model-authored repo findings plus synthesis readiness/blocker
state. Parallel context-scout boundary replay now materializes the isolated
fanout/barrier graph shape with one scout per packet, a synthesis barrier node,
and `context_supplies` edges before synthesis readiness is evaluated.

Next pre-Product/Spec native-leap item:
`openclaw-convergence.native-leap-07-safe-parallelism-supersteps` - Safe
Parallelism And Supersteps.

## 2026-05-19 Context Freshness And Snapshot Discipline

The current active pre-Product/Spec native-leap item is now complete through:

`openclaw-convergence.native-leap-05-context-freshness-snapshot-discipline` -
Context Freshness And Snapshot Discipline.

Runtime context is now carried as bounded `ContextSnapshotRef` metadata across
source prompt indexes/excerpts, Commitment Work Packets, context scout
handoffs, context synthesis artifacts, boundary replay checkpoints, scheduler
nodes, and Work Queue readback. Production workflow plugins require fresh
context snapshots before worker execution. The scheduler blocks implementation,
validation, repair, review, docs/planning, and closeout-style worker nodes
before provider invocation when required snapshots are missing, stale,
rejected, or unknown, and emits owner-readable context freshness progress
instead of misclassifying the failure as a model/worker failure.

Next pre-Product/Spec native-leap item:
`openclaw-convergence.native-leap-06-repo-analysis-context-scout` -
Repo-Analysis Context Scout.

## 2026-05-19 Provider Capability Profiles

The current active pre-Product/Spec native-leap item is now complete through:

`openclaw-convergence.native-leap-04-provider-capability-profiles` -
Provider Capability Profiles.

Provider Capability Profiles are now runtime-derived production truth from the
Runtime Node Capability Manifest. Cost-aware scheduler decisions select a
capability/profile id and provide semantic rationale; runtime derives node
kind, executor key, worker ref, tool authority, qualification requirements,
evidence kinds, budget/profile readback, and storage flags. Diagnostic or
contract-only profiles cannot be selected for production nodes, and
Work Queue readback surfaces profile id, worker ref, role class, cost/latency,
context capacity, qualification state, considered profile ids, and Codex
escalation rationale.

Next pre-Product/Spec native-leap item:
`openclaw-convergence.native-leap-05-context-freshness-snapshot-discipline` -
Context Freshness And Snapshot Discipline.

## 2026-05-19 Worker Controller Author Applicator Split

The current active pre-Product/Spec native-leap item is now complete through:

`openclaw-convergence.native-leap-03-worker-controller-author-applicator-split`

- Worker Controller / Author / Applicator Split.

Production non-Codex file-edit workers now carry controller, author,
applicator, validation/repair, evidence, and escalation phase refs. The
production file-edit adapter runs with strict phase authority: controller and
context slots cannot apply source edits directly, patch-author turns author
bounded edit intent/content, runtime applicator phases apply through
`EditTransactionEngine`, and Work Queue readback can surface phase refs beside
transaction refs.

Next pre-Product/Spec native-leap item:
`openclaw-convergence.native-leap-04-provider-capability-profiles` - Provider
Capability Profiles.

## 2026-05-19 Edit Transaction Engine

The current active pre-Product/Spec native-leap item is now complete through:

`openclaw-convergence.native-leap-02-edit-transaction-engine` - Edit
Transaction Engine.

The non-Codex worker loop no longer treats changed-file refs alone as
production success. Source edits now require an accepted runtime-owned edit
transaction that carries scope, snapshots, apply results, validation refs,
repair count, evidence refs, rollback refs, and raw-storage false flags.
File-edit adapter diagnostics, scheduler progress, and Work Queue readback
surface the transaction state.

Next pre-Product/Spec native-leap item:
`openclaw-convergence.native-leap-03-worker-controller-author-applicator-split`

- Worker Controller / Author / Applicator Split.

## 2026-05-18 Non-Codex Tool Worker Runtime Pre-Proof Blocker

The current active pre-Product/Spec blocker is now:

`openclaw-convergence.non-codex-tool-worker-runtime` - Non-Codex Tool Worker
Runtime And Patch-JSON Retirement.

The Product/Spec boundary replay reached real implementation nodes and invoked
the Kimi/non-Codex lane, but the lane still depended on a giant JSON patch
proposal. That is a parser choke point, not a Codex-parity worker loop.

The next implementation pass must make non-Codex workers use a production
runtime tool loop for inspect, context request, edit plan, patch application,
validation, failure classification, repair, evidence emission, and escalation.
The old patch-JSON proposal path must become test/compat only and cannot
produce production success.

Model-policy update: the non-Codex worker loop now uses explicit slots instead
of one Kimi model for every turn. Qwen3-Coder-Next is the cheap controller,
context-decision, validation-repair, evidence, and escalation lane. Kimi K2.6
is the patch lane with `reasoningMode: none`. Kimi patch/worker paths must not
use `reasoningMode: omit`; router/context-scout Qwen defaults still require
separate stage latency and valid-output gates before promotion.

Source-of-truth spec:
[Non-Codex Tool Worker Runtime](/projects/execution-platform/specs/non-codex-tool-worker-runtime).

## 2026-05-18 Native Agentic Coding Harness Convergence

The current active pre-Product/Spec block is now complete through:

1. `openclaw-convergence.native-harness-05-boundary-replay-checkpoints`

These items were added after Product/Spec replay diagnostics showed that the
runtime can accept context synthesis and a post-synthesis graph, but still
collapse into one broad foundation implementation node with weak process
supervision visibility. The source-of-truth spec is
[Native Agentic Coding Harness Convergence](/projects/execution-platform/specs/native-agentic-coding-harness-convergence).

Product/Spec Planning remains the near-term proof target, but it should not be
counted complete until the native harness can supervise model calls, compile
post-synthesis work into parallel dependency layers, run non-Codex workers as
native tool loops, execute validation as a real repair/evidence lane, and
resume from checkpointed replay boundaries without parallel proof-only code.

Completed in this slice:
`openclaw-convergence.native-harness-01-supervision-model-call-progress`.
Dynamic scheduler/model calls now emit bounded model-call progress spans,
RuntimeWorkerSupervisor records adapter start/completion/failure events, Work
Queue readback shows active model-call span state, and Product/Spec boundary
replay closes its Codex app-server client after replay model calls.

Completed in this slice:
`openclaw-convergence.native-harness-02-post-synthesis-parallel-supersteps`.
The scheduler now runs dependency-ready graph frontiers as bounded runtime
supersteps, applies conflict-domain locks, preserves completed sibling
branches during repair, rejects broad Codex post-synthesis chokepoints, defers
production coding closeout while executable graph nodes remain, and projects
parallel-frontier state into Work Queue readback.

Completed in this slice:
`openclaw-convergence.native-harness-03-non-codex-worker-convergence`.
The Kimi/non-Codex implementation lane now receives a canonical
`ImplementationTaskPacket v3` with worker rationale, expected output, bounded
target/denied scope, context handoff refs, source-prompt excerpt refs,
context-synthesis refs, prior node output refs, validation refs, evidence
claim kinds, stop/escalation rules, and budget policy refs. The production
coding runner passes this packet into the model-agnostic file-edit worker
adapter, the non-Codex tool loop validates worker readiness before provider
calls, missing context becomes an explicit context request path, and Work
Queue progress now surfaces non-Codex context requests, edit step ids, worker
tool refs, validation refs, changed-file refs, and evidence claim refs.

Completed in this slice:
`openclaw-convergence.native-harness-04-validation-executor-repair`.
Validation nodes now build canonical `ValidationTaskPacket` handoffs before
running commands, reject invalid validation packets before false success,
execute validation/QA through runtime tools, record bounded failure
classification and failure-to-commitment mapping refs, materialize same-job
repair graph nodes plus `validation_failed`/`repair_requested` edges, and
surface validation task/repair state in Work Queue readback.

Completed in this slice:
`openclaw-convergence.native-harness-05-boundary-replay-checkpoints`.
The dynamic coding runner now records bounded replay checkpoints at router,
Mission Ledger, packet author/review, context scout, context synthesis, graph
compile, worker execution, validation repair, review/readback, closeout, and
Work Queue readback boundaries. Checkpoints are idempotent, bind prompt/payload
hashes, graph/job/workflow identity, accepted/rejected/stale artifact refs,
continuation mode, safety/freshness policy, and raw-storage false flags. Replay
plans require the requested boundary plus required upstream checkpoints before
allowing continuation. Work Queue active graph readback surfaces boundary
checkpoint refs, graph checkpoint refs, replay plans, policy/freshness/safety
state, accepted/stale/rejected refs, and owner-readable summaries. The
production coding scheduler now also passes workflow `maxParallelNodeExecutions`
through to the Runtime Work Graph scheduler and can terminalize success from
runtime-owned graph completion when Mission Ledger commitments are satisfied
and model-authored closeout node evidence exists.

Next near-term proof target after the non-Codex tool worker blocker:
`openclaw-convergence.active-queue-34` - Product/Spec Planning Production
Upgrade via OpenClaw.

## 2026-05-17 Long-Task Budget And Progress Smoke Completion

Completed active DB Work Queue item:
`openclaw-convergence.pre-product-spec-05-long-task-budget-progress-smoke`.

Runtime evidence:

- workflow class: Product/Spec Planning-class scheduler smoke, no
  Product/Spec implementation executed.
- runtime job: `long-task-budget-progress-smoke-1779062209361-job`
- graph: `long-task-budget-progress-smoke-1779062209361-graph`
- Work Queue transition: `closed`
- budget policy:
  `runtime-task-budget://agent_team.product_spec_planning/planning_orchestrator/long_running`
- runtime tool timeout: `3600000` ms.
- active readback phase: `worker_model_call_waiting`.
- heartbeat state: `worker_waiting`.
- timeout proof invocation:
  `runtime-tool://runtime-tool-ef1f791f-0295-485e-8b3b-04ee9f1d584b`
- summary artifact:
  `.artifacts/execution-platform/long-task-budget-progress-smoke-summary.json`
- artifact index:
  `.artifacts/execution-platform/long-task-budget-progress-smoke-artifact-index.json`

The smoke proves that Product/Spec-class long-running work no longer collapses
to a 120-second tool window. Runtime task budget policy is derived from
workflow/capability/node context, passed into scheduler `worker.invoke`
runtime tool calls, and surfaced in Work Queue active graph readback with
timeout, progress, stale-progress, lease, heartbeat, elapsed, remaining, and
heartbeat-state fields.

The proof also exercised controlled timeout/abort behavior through the Runtime
Tool-Call Kernel. Timeout evidence is recorded as a bounded failed tool
invocation with `runtime_tool_timeout`; it does not become process success or
hide behind a generic worker failure.

No Product/Spec implementation ran in this pass. No real model calls were
made. No raw prompt/response/log/DB row storage was used. No deploy, outbound
send, model promotion, authority grant, gateway rebuild/reload, gateway env
change, or UI Work Queue lifecycle mutation occurred.

The next active DB Work Queue item is now:

`openclaw-convergence.active-queue-34`

- Product/Spec Planning Production Upgrade via OpenClaw.

## 2026-05-17 Context Scout Tool Loop Runtime Completion

Completed active DB Work Queue item:
`openclaw-convergence.pre-product-spec-01-context-scout-tool-loop`.

Runtime evidence:

- workflow: `agent_team.coding`
- runtime job: `context-scout-tool-loop-1779050661524`
- Work Queue transition: `closed`
- proof artifact:
  `.artifacts/execution-platform/context-scout-tool-loop-validation-proof.json`
- summary artifact:
  `.artifacts/execution-platform/context-scout-tool-loop-summary.json`

Product/Spec Planning remains the near-term proof target, but the full proof
should follow the remaining P0 pre-proof items from
[Pre-Product/Spec Assumption Audit](/projects/execution-platform/specs/pre-product-spec-assumption-audit).

Next active DB Work Queue item:
`openclaw-convergence.pre-product-spec-02-model-facing-staged-scheduler-tools`

- Model-Facing Staged Scheduler Tool Protocol.

## Closeout Finalization Toolchain

Completed active DB Work Queue item:
`openclaw-convergence.toolification-19-closeout-finalization-tools`.

Closeout finalization is now a first-class Runtime Tool-Call Kernel operation.
The live gateway registers closeout finalization tools for evidence packet
collection, Mission Ledger completion review, workflow evidence profile
review, validation/QA evidence review, tool trace coverage review, Work Queue
readback review, maximality review, finalization handoff compilation, accept
finalization, and reject finalization.

Completed changes:

- closeout finalization runtime tool family added: `closeout.finalize`.
- production dynamic coding-team success now requires an accepted closeout
  finalization evidence packet before `cleanSuccessAccepted` can be true.
- the evidence packet binds Mission Ledger refs, workflow profile refs,
  validation/QA refs, runtime tool refs, Work Queue readback refs,
  model-authored Closeout Capsule refs, completion-review refs, open
  commitment state, and raw-storage/authority/lifecycle flags.
- degraded/system closeout, bare `create_closeout`, and process completion
  are diagnostic-only and cannot satisfy clean production success.
- Work Queue active graph readback surfaces closeout finalization state,
  evidence packet refs, handoff refs, tool invocation refs, accept/reject
  refs, missing reason codes, maximality summary, limitations, ELI5, and
  recommended next action.
- runtime toolification truth registry marks
  `closeout-finalization-toolchain` as `production_primary`.

Validation:

- `pnpm test:file extensions/execution-platform/src/codex-bridge/closeout-finalization-runtime-tools.test.ts`
- `pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts`
- `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `pnpm test:file extensions/execution-platform/src/runtime-tool-call/runtime-tool-adoption-boundary.test.ts`
- `pnpm test:file extensions/execution-platform/src/workflows/validation-qa-runtime-tools.test.ts`
- `pnpm tsgo:full`

Next active DB Work Queue item:
`openclaw-convergence.active-queue-34` - Product/Spec Planning Production
Upgrade via OpenClaw.

## Generic Staged Scheduler Protocol

Completed active DB Work Queue item:
`openclaw-convergence.generic-staged-scheduler-protocol`.

The generic orchestration runtime now requires production workflow plugins and
live scheduler options to opt into the staged scheduler protocol before they
can create executable graph nodes. For production `agent_team.coding` and
`agent_team.product_spec_planning`, model output supplies staged intent
(`workBreakdownUnits`, `capabilitySelectionsForWorkUnits`,
`nodeContractDrafts`, and `edgeOrParallelismDraft`) while runtime compiles the
canonical node envelope, executor key, worker ref, qualification refs, and
expected evidence from the capability manifest and workflow policy.

Completed changes:

- production workflow plugin readiness now fails if staged scheduler protocol,
  staged graph acceptance, runtime-derived node envelopes, runtime-derived
  expected evidence, model-authored structure review, first-node approval, or
  simple-only direct implementation policy are missing.
- `GenericOrchestrationRuntime.runSchedulerGraph(...)` refuses production
  scheduler execution unless options explicitly require the generic staged
  protocol.
- `RuntimeWorkGraphScheduler` rejects production node creation that bypasses
  the staged compiler or asks models to author runtime-owned expected evidence.
- scheduler runtime tools now trace mission readiness, commitment packet
  readiness, capability shortlisting, node-result review, repair/escalation
  classification, closeout readiness, and completion readiness.
- Work Queue readback exposes staged scheduler policy fields on workflow
  plugin resolution metadata.
- the production dynamic coding-team path passes the staged protocol option
  into the generic runtime, and its production-path test fixture now uses
  staged intent instead of hand-authored executable node envelopes.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/generic-orchestration-runtime.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/agent-team-coding-plugin.test.ts extensions/execution-platform/src/workflows/product-spec-planning-plugin.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts extensions/execution-platform/src/runtime-tool-call/runtime-tool-call.test.ts`
- `pnpm tsgo:full`
- `node scripts/run-oxlint.mjs extensions/execution-platform extensions/model-memory src/gateway src/auto-reply src/agents src/infra scripts ui/src/ui`
- `git diff --check`
- docs trailing whitespace check

Known validation note:

- Full-repo `pnpm format:check` is blocked by 40 unrelated formatting issues
  outside this pass. This pass did not bulk-format unrelated files.

Next active DB Work Queue item:
`openclaw-convergence.generic-node-executor-evidence-contract` - Generic Node
Executor And Evidence Claim Contract.

## Generic Orchestration Runtime Engine

Completed active DB Work Queue item:
`openclaw-convergence.generic-orchestration-runtime-engine`.

The scheduler-backed coding-team path now passes through a canonical
workflow-agnostic runtime boundary before running `RuntimeWorkGraphScheduler`.
The new `GenericOrchestrationRuntime` validates workflow definition/plugin
readiness, requires the Runtime Tool-Call Kernel for production workflows,
runs scheduler execution through `runSchedulerGraph(...)`, rejects scheduler
success without graph evidence, and records bounded
`execution.generic_orchestration_runtime_result` artifacts.

Owner readback now surfaces generic orchestration runtime status, scheduler
status, graph id, executed/added node ids, scheduler decision refs, and reason
codes. The lower-level Runtime Workflow Graph Engine remains the readiness
resolver inside this runtime, not a competing workflow path.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/generic-orchestration-runtime.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts`
- `pnpm tsgo:full`

Next active DB Work Queue item:
`openclaw-convergence.generic-staged-scheduler-protocol` - Generic Staged
Scheduler Protocol.

## Product/Spec Pre-Proof Observability Hardening

Completed after the failed direct Product/Spec replay.

The Product/Spec proof is not yet rerun. Before rerun, the platform now fixes
the owner-visible gaps that made the prior run hard to diagnose:

- active graph progress preserves active-node objective/model/rationale even
  after Work Queue child sync events.
- Mission Ledger readback includes `whyItMatters` and expected evidence
  descriptions per commitment.
- commitment work-packet summaries are surfaced in active graph progress.
- role invocation progress carries bounded model, target, acceptance, and
  evidence refs.
- the direct replay harness streams periodic bounded progress and no longer
  waits until final summary.
- advanced router defaults use GPT 5.5 via Codex app-server policy.

Next step remains the Product/Spec Planning Production Upgrade proof through
the exact runtime path. Success still requires runtime graph execution,
source edits, validation, Mission Ledger commitment closure, and model-authored
closeout.

## Staged Scheduler Tool Protocol And Maximum Toolification Compiler

Completed pre-proof blocker:
`openclaw-convergence.staged-scheduler-tool-protocol`.

The production scheduler no longer asks the orchestrator to hand-author a full
executable graph envelope for complex work. The model supplies staged intent:
work units, capability selections, node contracts, and edge/parallelism
rationale. Runtime compiles canonical node kinds, executor keys, worker refs,
qualification refs, and expected evidence.

Completed changes:

- staged compiler support in `orchestrator-graph-decision.ts`.
- production scheduler tool traces for draft work breakdown, capability
  selection, node contracts, edge/parallelism, graph compilation, structure
  review, staged acceptance, and first-node approval.
- `agent_team.coding` orchestrator prompt updated away from runtime-owned
  schema fields and toward staged tool protocol fields.
- legacy production acceptance through `scheduler.decompose_mission` removed
  from the accepted complex decomposition path.
- Product/Spec lane proof accepted a planning-orchestrator-first graph with a
  web research handoff and no implementation execution.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/orchestrator-graph-decision.test.ts`
- `pnpm tsgo:fast`

Next owner-visible item:

`openclaw-convergence.active-queue-34` - Product/Spec Planning Production
Upgrade via OpenClaw.

## Owner-Turn Heartbeat And Prompt Transport Hardening

Completed pre-proof blocker:
`openclaw-convergence.owner-turn-heartbeat-prompt-transport-hardening`.

The latest Product/Spec Planning UX resubmission is not counted as a proof:
it was accepted into the main chat lane but did not create runtime work before
a heartbeat/proactivity turn took over the session.

The generic fix is now in place:

- accepted owner `chat.send` turns register owner-turn activity immediately.
- heartbeat/proactivity skips the base session and isolated heartbeat sibling
  while owner work is active, even if command queues are momentarily empty.
- owner-turn records expire by TTL if a process crashes.
- OpenClaw UX prompt submission now has a file/stdin based transport script
  that handles long prompts, code fences, template-string backticks, shell
  quotes, and `${...}` examples as data instead of executable wrapper source.
- scheduler orchestrator instructions now align with the compiler contract:
  models choose capability/objective/rationale/commitment mapping; runtime
  derives node kind, executor key, evidence enums, and other runtime-owned
  fields.

Product/Spec Planning is no longer the immediate next owner-visible active
queue item. The most recent proof attempts showed that the scheduler still
asks for too much executable graph schema in one model decision. The new
pre-proof blocker is:

`openclaw-convergence.staged-scheduler-tool-protocol` - Staged Scheduler Tool
Protocol And Maximum Toolification Compiler.

That item must replace single-shot decomposition JSON with staged scheduler
tools before Product/Spec Planning is rerun.

Follow-up diagnosis completed:

- `scripts/openclaw-submit-prompt-via-ux.mjs --prompt-file` is the same
  browser/textarea/send-button UX path as manual input; it only changes the
  prompt byte source from shell/paste to UTF-8 file data.
- the next proof should run a short dispatch/hash smoke after rebuild before
  submitting the full Product/Spec prompt.
- a new post-proof architecture spec,
  `specs/runtime-parallelism-and-contract-boundaries.md`, records how to move
  from conservative owner-turn suppression to lane/conflict-domain scheduling,
  parallel child graph execution, Work Queue visibility, and model-contract
  compiler consolidation.
- those parallelism/contract items are now Work Queue follow-ups after
  Product/Spec Planning; they should not delay the next proof.

## Capability/Subject Routing Split

Completed pre-proof blocker:
`openclaw-convergence.capability-subject-routing-split`.

The Intent Front Door now separates executor workflow from target subject
workflow. Long prompts that ask the system to implement, wire, test, or
document a workflow surface should route to the executor that has those
capabilities, normally `agent_team.coding`, while carrying the target workflow
as `subjectWorkflowIds` / `targetSubjectRefs`.

This is a general structural contract, not a Product/Spec-specific prompt
heuristic:

- model output chooses executor, subject, capabilities, and constraints.
- deterministic validation checks workflow id conflicts and executor
  capability support.
- native submit can run one bounded repair for executor/capability mismatch.
- Work Queue readback shows the split for diagnostics.

Focused tests and the native submit proof passed. Product/Spec Planning remains
the next owner-visible active queue item.

## Canonical Workflow Runtime Refactor Path

The current execution focus is the pre-Product/Spec Planning architecture
cleanup needed to prevent another proof-shaped run:

1. Workflow Evidence Profiles And Tool Trace Readback Hardening. **Complete.**
2. Canonical Workflow Runtime Engine And Workflow Definition Registry. **Complete.**
3. Coding Team Plugin Extraction From Dynamic Runner. **Complete.**
4. Generic Workflow Runner Production Retirement. **Complete.**
5. Work Queue Generated Item Lifecycle And Proof Child Cleanup. **Complete.**
6. Capability/Subject Routing Split. **Complete.**
7. Staged Scheduler Tool Protocol And Maximum Toolification Compiler.
8. Product/Spec Planning Production Upgrade via OpenClaw.

Staged Scheduler Tool Protocol is now the next owner-visible active queue
item. Product/Spec Planning follows it. The target architecture is one
canonical workflow graph engine with workflow definitions/plugins. Graph nodes
are still executed by the individual agents/workers/tools/human adapters; the
engine schedules, records evidence, enforces Mission Ledger/closeout gates,
reconciles generated children, and updates Work Queue readback.

## Work Queue Generated Item Lifecycle

Completed DB Work Queue item:
`openclaw-convergence.work-queue-generated-item-lifecycle`.

This item landed before the Product/Spec Planning proof. It introduced
first-class generated-item origin and terminal policy so proof diagnostics,
middleware fixtures, and transient graph helper rows do not remain in the
owner active queue as stale `needs_review` work.

Cleanup result:

- 9 middleware proof live-completion items archived as `middleware_fixture`
  / `debug_only`.
- 20 Generic Workflow Runner retirement proof children archived as
  `proof_diagnostic` / `debug_only`.

The cleanup was repository/server driven and preserved bounded debug evidence.
The owner active queue now starts at
`openclaw-convergence.active-queue-34` Product/Spec Planning Production
Upgrade.

## Dedicated Runtime DB Boundary

Update on 2026-05-15: the live Execution Platform runtime/Work Queue substrate
has been moved off Model Memory reuse and onto a dedicated
`execution_platform` database.

- source: `config.env.vars.EXECUTION_PLATFORM_DATABASE_URL`
- boundary: `dedicated_execution_platform_db`
- readiness: `ready`
- Work Queue live linkage may attach
- gateway restarted after config change; local/Tailscale health passed

This closes the prior Model Memory fallback identity blocker. The next
execution focus remains the Runtime Toolification pre-proof queue.

## Runtime Toolification Pre-Proof Queue

The current execution focus is no longer another immediate Product/Spec
Planning proof. The next queue block hardens the runtime path that proof
depends on:

- runtime tool-call kernel and traces. **Complete.**
- cost-aware capability policy. **Complete.**
- scheduler toolification with split planning/execution. **Complete.**
- worker tool loops for Kimi/Codex. **Complete, with worker-loop v2 proof.**
- non-Codex large-task decomposition and file-edit qualification. **Complete.**
- Mission Ledger evidence claims and finalization handoff. **Complete.**
- Work Queue tool/event readback. **Complete.**
- Runtime Toolification Truth Registry And Adoption Gate. **Complete.**
- Model Call Toolification And Model Task Middleware Collapse. **Complete.**
- Script And DB Operation Toolification. **Complete.**
- Closeout Toolification And Legacy Retirement Soak. **Complete.**

Workflow Evidence Profiles And Tool Trace Readback Hardening and Canonical
Workflow Runtime Engine And Workflow Definition Registry are now complete.
The current next DB Work Queue item is Coding Team Plugin Extraction From
Dynamic Runner. Closeout generation is now a Runtime Tool-Call Kernel path;
degraded/system closeout is diagnostic-only and cannot satisfy clean
production success, and workflow success must pass an accepted workflow
evidence profile evaluation plus the workflow definition/completion-review
gates.

Runtime Tool-Call Kernel And Trace Store completed on 2026-05-15. The next
Cost-Aware Capability Policy completed on 2026-05-15. A follow-up kernel
hardening proof also passed: executor timeout/abort, explicit cancel, terminal
idempotency, cursor pagination, scoped retention pruning, and adoption boundary
mapping are now production kernel capabilities.

Scheduler Toolification And Split Planning/Execution completed on
2026-05-16. Runtime scheduler decisions now emit Runtime Tool-Call Kernel
traces for decomposition, graph node/edge creation, decomposition acceptance,
next-node selection, human/needs-review/closeout requests, and `worker.invoke`
node execution. The live gateway runtime constructs and passes the scheduler
tool kernel into `agent_team.coding`, and Work Queue active graph readback
shows scheduler tool phase, latest tool id, and invocation refs.

The proof run closed DB Work Queue item `openclaw-convergence.active-queue-22`
from accepted runtime closeout evidence. The next active DB Work Queue item is
Worker Tool Loops And Non-Codex File-Edit Worker / Kimi Implementation Lane
Hardening.

Worker Tool Loops And Non-Codex File-Edit Worker / Kimi Implementation Lane
Hardening completed on 2026-05-16. The non-Codex file-edit worker loop now
records first-class Runtime Tool-Call Kernel traces for file context
inspection, edit planning, patch proposal, patch application, validation,
repair/failure classification, escalation when needed, and final bounded
evidence handoff. The Kimi lane receives bounded file snapshots and
orchestrator-style microtask packets, retries with bounded failure feedback,
and rolls failed attempts back before repair so partial edits cannot leak into
the main worktree. A live OpenRouter/Kimi proof made scoped source edits,
passed focused validation, and closed DB Work Queue item
`openclaw-convergence.active-queue-21` from accepted closeout evidence.

The next active DB Work Queue item is Mission Ledger Evidence Claims And
Finalization Handoff.

Non-Codex Worker Loop v2 completed on 2026-05-16. The Kimi lane now supports
model-authored bounded context expansion requests, multi-step edit plans,
validation-driven repair after context expansion, and commitment-linked
evidence claims. A live OpenRouter/Kimi proof requested bounded context,
exercised the non-Codex tool-using worker loop and its focused test, repaired after
a controlled validation failure in the same worker run, emitted runtime tool
traces for context/plan/patch/validation/repair/evidence, and closed DB Work
Queue item `openclaw-convergence.non-codex-worker-loop-v2` from accepted
runtime closeout evidence.

Model-Agnostic Non-Codex Worker Loop completed on 2026-05-16. The worker
substrate now has a generic specialization manifest and phase-event contract,
with Kimi as the first production implementation specialization. The live
OpenRouter/Kimi proof used repo search/read/test-inspection tools, emitted 15
bounded phase events, applied a fresh source edit, repaired after a controlled
validation failure, passed focused validation, and closed DB Work Queue item
`openclaw-convergence.non-codex-tool-using-worker` from accepted runtime
closeout evidence.

Model-Agnostic Worker Multi-Model Qualification completed on 2026-05-16. The
generic worker substrate now has a live qualification matrix instead of
implicit trust by model name. Kimi is production-qualified for
`small_source_edit`; DeepSeek v4 Flash is production-qualified for
`repo_context_scout` and `validation_failure_explanation`; DeepSeek v4 Pro is
only candidate for `test_writing_edit` until it produces real source-edit
evidence. Cost-aware scheduler decisions now require model qualification
profile/evidence refs for production model-agnostic worker selection. DB Work
Queue item `openclaw-convergence.model-agnostic-worker-qualification` closed
from accepted runtime closeout evidence.

Non-Codex Large-Task Decomposition And File-Edit Qualification completed on
2026-05-16. The scheduler now has a reusable non-Codex decomposition policy
that rejects broad Codex implementation as the first move for complex coding
missions, requires qualified task-family metadata/evidence for production
non-Codex selections, preserves qualification fields through the orchestrator
decision compiler, and uses capability executor keys so specialized nodes can
run through their actual executors instead of generic role fallbacks. The
dedicated-DB proof rejected an invalid broad Codex-first plan, repaired to a
four-node graph with context, Kimi implementation, validation explanation, and
review nodes, recorded three handoff edges, materialized four DB Work Queue
child items, and closed DB Work Queue item
`openclaw-convergence.non-codex-large-task-decomposition` from accepted
runtime closeout evidence.

Mission Ledger Evidence Claims And Finalization Handoff and Work Queue
Tool/Event Readback completed on 2026-05-16. Scheduler node results now carry
commitment-linked evidence claims, production `agent_team.coding` requires
those claims for Mission Ledger evaluation, and Work Queue owner readback
renders runtime graph/tool progress from DB-backed scheduler events. The
dedicated-DB proof closed
`openclaw-convergence.toolification-05-mission-ledger-evidence-finalization`
and `openclaw-convergence.toolification-06-work-queue-tool-event-readback`
from accepted runtime closeout evidence.

Runtime Toolification Truth Registry And Adoption Gate completed on
2026-05-16. The registry now records toolification truth by surface, including
production-primary, queued, compatibility-only, blocked, and live-UX-proven
states. The adoption gate accepts only bounded evidence refs, runtime-tool
invocation refs, Work Queue readback refs, live UX refs when required, and
closeout refs. It rejected a deliberate Product/Spec Planning live-UX
overclaim until a real live proof exists. The hardening pass made the legacy
adoption boundary map registry-derived, made registry Work Queue readback
derive from canonical registry truth for the registry item, guarded direct
proof-script execution with an actionable `tsx` command, and made
toolification Work Queue closeout require accepted adoption-gate evidence.
DB Work Queue item
`openclaw-convergence.toolification-07-truth-registry-adoption-gate` remains
closed from accepted runtime closeout evidence.

Model Call Toolification And Model Task Middleware Collapse completed on
2026-05-16. Live model-task provider calls now execute as `model.call`
Runtime Tool-Call Kernel invocations. The model-task repository is the
contract/validation/readback facade; provider prompts are volatile executor
input, and the trace store persists only bounded refs, hashes, model/provider
refs, usage, status, and raw-storage flags. Work Queue readback now surfaces
model-task runtime tool invocation refs. DB Work Queue item
`openclaw-convergence.toolification-08-model-call-toolification` closed from
accepted adoption-gate evidence after a real Codex app-server JSON model call.
The post-completion hardening pass made the kernel mandatory for live
model-task completion, rejected provider-call success claims without
`model_task.runtime_tool_trace` evidence, kept fixture pilots provider-free,
and fixed proof cleanup so the shared Codex app-server executor is closed.

Script And DB Operation Toolification completed on 2026-05-16. Live script
jobs and DB operations now execute through `script.execute` and
`db_operation.execute` Runtime Tool-Call Kernel invocations. The script-job
and DB-operation repositories remain the contract/lifecycle/readback facades,
but clean production completion now requires runtime tool trace artifacts when
the live completion path marks trace evidence required. Work Queue middleware
readback surfaces script and DB operation runtime tool invocation refs. DB
Work Queue item `openclaw-convergence.toolification-09-script-db-toolification`
closed from accepted adoption-gate evidence after live dedicated-DB script and
DB operation proofs.

The follow-up hardening pass removed the risky ambiguity around old fixture
and lower-level worker paths:

- RuntimeWorkerSupervisor script/DB middleware adapters now run through
  `script.execute` and `db_operation.execute`.
- direct model-task supervisor completion without `model.call` trace evidence
  becomes `needs_review`.
- the in-process `ScriptJobWorkerAdapter` and script/DB middleware pilot
  helpers require explicit `proofOnly: true`; missing that guard fails fast.
- Model Memory runtime middleware bridge provider/DB evidence jobs now use
  `model.call` and `db_operation.execute` runtime tool traces.

Workflow Evidence Profiles And Tool Trace Readback Hardening completed on
2026-05-16.
Additional model qualification items remain for docs/spec edit, test-writing
edit, and frontend scoped edit lanes before those roles can be selected as
production file-edit workers.

Closeout Toolification And Legacy Retirement Soak completed on 2026-05-16.
`closeout.generate` now wraps the model-first Closeout Capsule reporter,
records bounded Runtime Tool-Call Kernel traces, and rejects degraded/system
closeout as clean success. The production gateway registers
`closeout.generate`, and the dynamic coding-team graph closeout executor uses
the tool when a Runtime Tool Kernel is present. DB Work Queue item
`openclaw-convergence.toolification-10-closeout-generate-toolification` closed
from accepted adoption-gate evidence after a real Codex app-server model
closeout.

Workflow Evidence Profiles And Tool Trace Readback Hardening completed on
2026-05-16. Workflow-specific evidence profiles are now production gates and
Work Queue readback objects. `agent_team.coding` success requires accepted
profile evidence; generic queued workflow dispatch cannot complete from
model-authored closeout alone; degraded/system closeout remains
diagnostic-only. The dedicated-DB proof closed
`openclaw-convergence.toolification-11-workflow-evidence-profiles-readback`
from accepted adoption-gate evidence.

The next DB Work Queue item is Canonical Workflow Runtime Engine And Workflow
Definition Registry.

## Product/Spec Planning Production Runtime Surface

This slice upgrades Product/Spec Planning from protected registry/proof wiring to production scheduler/readback behavior.

2026-05-17 update: Product/Spec Planning is now production-ready in the
canonical workflow definition registry and registered in the workflow plugin
registry as `workflow-plugin.agent_team.product_spec_planning.v1`. Runtime
Workflow Graph Engine readiness requires the plugin, scheduler executor keys,
and runtime-tool kernel; the generic workflow queued runner remains a rejection
shim for this workflow.

Scope in this repo pass:

- scheduler policy: Product/Spec Planning executable graph work starts with `planning_orchestrator`
- workflow plugin policy: Product/Spec Planning executor keys map planner,
  research, capsule, human decision, proposal, compiler, and closeout nodes to
  executable scheduler nodes
- contract policy: ResearchBriefs carry bounded source/citation/assumption/freshness/staleness evidence without raw storage
- readback policy: Work Queue owner readback shows capsule, research, human decision options plus pending/accepted/rejected/not-required state, action proposal, compile readiness, validation, bounded Mission Ledger evidence state, active graph/progress, limitations, ELI5 state, and explicit evidence buckets for workflow registration, executable node mapping, orchestrator-first proof, compile-readiness validation, and commitment evidence claim refs

## Context Supply Chain And Context Scout Tool Loop

2026-05-17 update: the scheduler-backed coding-team path now has a bounded
source-prompt context chain before implementation.

- source prompts are indexed into bounded section refs and summaries.
- context scout may request exact bounded prompt excerpts by section ref.
- excerpt provision/denial is traced through Runtime Tool-Call Kernel
  `source_prompt.*` tools.
- excerpt text is volatile child-worker input only; artifacts store hashes,
  refs, bounded summaries, and raw-storage flags.
- context scout output becomes a `ResourceHandoffPacket` with verified file
  refs, recommended edit points, risks, validation suggestions, and
  implementation handoff summary.
- implementation nodes that require upstream context handoff stop as
  `needs_review` if the handoff packet is missing.
- Work Queue readback surfaces prompt hash/length/status, section refs,
  excerpt decisions, verified context file refs, context handoff refs, and
  context blockers.

The next Product/Spec Planning proof should stop before implementation if
Mission Ledger, CommitmentWorkPacket, source-prompt context, or
ResourceHandoffPacket evidence is not strong enough for delegated workers.

## Generic Orchestration Substrate

2026-05-17 update: coding-team orchestration is no longer the only place that
defines the durable orchestration contract.

- `WorkflowDefinition` now carries a canonical `WorkflowOrchestrationPolicy`
  with required phases, role classes, context needs, source-prompt policy,
  capability utility policy, human decision policy, finalization/readback
  refs, and raw-storage flags.
- coding and Product/Spec Planning workflow plugins expose those policy refs,
  phases, role classes, and context needs to plugin resolution and Work Queue
  readback.
- web research, docs/skills, QA/test, architecture, design, and marketing are
  registered against the same contract. They remain migration-state workflows
  until executable scheduler plugins exist.
- scheduler node execution validates generic node-result shape and evidence
  claims before accepting node success.

This slice generalizes the Mission Ledger -> commitment packets -> context
supply -> staged scheduler -> node executors -> evidence claims ->
closeout/readback model for future workflows. It does not complete the
Product/Spec Planning workflow implementation proof by itself.

## Generic Orchestration Runtime Spec

2026-05-17 update: the next execution phase is now explicitly split into the
generic runtime spine before Product/Spec Planning proof.

Source-of-truth spec:

- `docs/projects/execution-platform/specs/generic-orchestration-runtime.md`

Active sequence:

1. Generic Orchestration Runtime Engine.
2. Generic Staged Scheduler Protocol.
3. Generic Node Executor And Evidence Claim Contract.
4. Product/Spec Planning Workflow Plugin Production Proof.
5. Starter Workflow Plugin Migration.
6. Future Team Workflow Readiness.

The next prompt should execute item 1. Product/Spec Planning should not run
again until items 1-3 are live, wired, tested, and closed.

## 2026-05-22 Current Slice: Product/Spec Proof Fixes Before Rerun

The next active slice is the pre-implementation proof fix pass from runtime job
`native-exec-e2a754d03ba122a2`.

Scope:

- convert resource-materialization readback summaries to manifest-safe metric
  keys without increasing graph metadata limits.
- stop repeated sibling branch exceptions as one systemic frontier blocker.
- make validation command refs typed validation locks, not implementation
  write locks.
- lock context scout production defaults to qualified local-context model
  policy.
- preserve bounded provider diagnostics for packet/scout no-content attempts.
- keep job/branch lifecycle readback clear when an adapter failure has
  terminalized the useful branch state.

Exit criteria:

- focused tests prove the metadata false positive is gone and embedded bodies
  are still rejected.
- focused tests prove shared validation commands do not serialize disjoint
  implementation tasks.
- focused tests prove repeated parallel frontier exceptions halt with a single
  surfaced root cause.
- rerun Product/Spec proof from the top and report wall time, token usage where
  available, packet failures, scheduler failures, implementation failures, and
  whether source edits landed.

## 2026-05-23 Current Slice: Execution Intent / Evidence Mode Dispatch

The current pre-proof slice fixes the after-resource replay failure where a
read-only/source-grounding group was compiled as an `implementation_microtask`
and selected for the file-edit worker smoke.

Source-of-truth specs:

- `docs/projects/execution-platform/specs/execution-intent-evidence-mode-and-worker-dispatch.md`
- `docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md`

Implemented runtime contract:

- model-authored `executionIntent` describes work class;
- runtime derives `evidenceMode` from capability plus intent;
- staged scheduler compile rejects intent/capability conflicts without
  semantic prompt heuristics;
- post-resource implementation packets and `NodeReadinessState` block
  implementation unless intent is `source_edit` and evidence includes
  `changed_file_evidence`;
- after-resource replay selects only edit-required executable nodes for
  worker smoke.

Latest replay evidence:

- runtime job: `native-exec-e968a6a61f5d5293`
- graph: `product-spec-replay-b56cc1b6440c2443`
- boundary: `after-resource-materialization`
- result: `needs_review`
- key result: zero executable edit-required nodes were selected; the stale
  source-grounding child was blocked because execution intent was missing,
  changed-file evidence mode was missing, and recomputed readiness differed
  from the old persisted `ready` status.
- proof artifact:
  `.artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json`

The next Product/Spec proof should not run immediately. The current queue head
is now the pre-proof modularization tranche because stale proof/runtime
topology has already reintroduced older behavior after production policy moved
on.

## 2026-05-23 Current Slice: Pre-Product/Spec Modularization

Source-of-truth spec:

- `docs/projects/execution-platform/specs/pre-product-spec-execution-platform-modularization.md`

2026-05-24 update: items 1-4 are implemented and closed from focused
validation. Dynamic Runner Plugin Thinning moved generic runtime execution
artifact lifecycle into
`extensions/execution-platform/src/workflows/generic-orchestration-runtime-execution.ts`
and coding-specific executor registration into
`extensions/execution-platform/src/codex-bridge/coding-team-runtime-adapter.ts`.
Generic Replay And Readiness Lifecycle added the workflow-agnostic boundary
registry in
`extensions/execution-platform/src/workflows/boundary-replay-registry.ts`,
made replay plans/continuations registry-backed, kept
`after_context_synthesis` diagnostic-only, and expanded Work Queue readback
for replay boundary state. The next active item is Progress, Readback, And
Runtime Event Modularization.

Queue order into the proof:

1. Characterization And Import Boundary Guardrails. **Closed.**
2. Generic Runtime Spine Extraction. **Closed.**
3. Dynamic Runner Plugin Thinning. **Closed.**
4. Generic Replay And Readiness Lifecycle. **Closed.**
5. Progress, Readback, And Runtime Event Modularization. **Next.**
6. Compatibility Retirement And Middleware Bypass Audit. **Closed from DB
   closeout with accepted adoption-gate evidence.**
7. Model Contract Compiler Consolidation. **Closed from DB closeout after
   focused compiler/orchestrator/no-semantic-cheats validation.**
8. Product/Spec Planning Workflow Plugin Production Proof.

Product/Spec Planning should not run again until the promoted cleanup tranche
is closed or explicitly deferred from focused evidence.

## 2026-05-25 Current Slice: Contract-Hydrated Worker Boundary Evidence

The active slice is still the pre-proof execution contract spine, but the
latest replay produced the first successful non-Codex implementation-boundary
worker smoke.

Evidence:

- runtime job: `product-spec-replay-mpl69vto`
- graph:
  `team-run-native-exec-12fa6ecec70ecb9a-checkpoint-replay-mpl69vtn-runtime-work-graph`
- boundary: `after-resource-materialization`
- node:
  `g-1fe65d8620-work-intent-wu-plugin-definition-hardening-implementation-862f2c84e5e9:task:5`
- result: `succeeded`
- changed file ref:
  `extensions/execution-platform/src/model-tasks/model-call-runtime-tool.ts`
- validation ref: `validation://boundary-replay/passed/5b521bf9e672e497`
- workspace persistence: `rollback_after_review_artifact`

What this proves:

- `NodeExecutionContract`, `NodeExecutionPacket`, coding resource packet, and
  implementation task packet hydration can get a non-Codex worker past the
  readiness gate.
- The small-verb worker sequence can complete:
  read snapshot -> plan -> forced patch author -> apply patch -> structural
  validation -> evidence claim.

What remains before the next top-to-bottom proof:

- fix stale split-child refresh/upsert;
- fix replay process terminal-handle lifecycle;
- add or improve bounded review-diff artifact hydration for rolled-back worker
  edits;
- resolve context-repair `ResourceRequirementPacket` gaps;
- resolve target-selection model client/provider routing and payload budgeting;
- run at least one additional worker smoke on a different materialized child.
