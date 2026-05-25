---
summary: "Demand-driven context, graph-patch payloads, frontier supersteps, and compact readback for large workflow orchestration."
title: "Demand-Driven Frontier Orchestration And Context Broker"
---

# Demand-Driven Frontier Orchestration And Context Broker

Date: 2026-05-23

Status: accepted pre-proof architecture update after the latest Product/Spec
Planning replay advanced through context scout and resource materialization,
then failed before implementation because scheduler progress metadata exceeded
the runtime artifact manifest limit.

This spec extends the generic orchestration runtime. It is not a
Product/Spec-only patch.

## Failure Evidence

Latest replay:

- runtime job: `product-spec-replay-mpido4ii`
- source job cloned from accepted packets: `native-exec-18072005944f479c`
- wall time: about 12m59s
- result: `needs_review`
- terminal reason:
  `worker_adapter_threw:artifact_metadata_limit`
- exact error:
  `runtime artifact metadata exceeds contract maxManifestBytes:114072:65536; artifactType=agent_team.scheduler_progress`
- progress artifacts before implementation: 1621
- graph at failure: 85 nodes, 88 edges
- implementation context packets materialized: 2
- implementation task packets created: 41
- source edits landed: none

The replay also proved the context-scout sharding improvement worked: context
scouts executed and produced handoffs. The next failure was not context scout
quality. It was oversized scheduler/progress payload and unbounded graph
expansion before useful worker execution.

## First-Principles Diagnosis

The runtime is still too speculative.

It currently tends to:

1. expand many graph nodes before proving which branch can run;
2. front-load context discovery and synthesis;
3. duplicate graph/resource/progress details into artifact metadata;
4. emit many progress artifacts instead of compact boundary state;
5. treat context as a phase that must finish before implementation can start.

A general workflow orchestrator should instead execute a ready frontier while
acquiring context and resources lazily, branch by branch.

## Canonical Direction

Large workflow execution should become:

1. mission and packet creation;
2. coarse work-intent graph;
3. executable frontier evaluation;
4. node-local readiness check;
5. demand-driven context/resource requests;
6. parallel worker execution for ready branches;
7. branch-local repair when blocked;
8. compact progress/readback projection;
9. evidence/closeout only from accepted claims.

The runtime should not wait for every context node in the whole graph before
starting every implementation branch. A node may start as a planning,
materialization, or context-request actor, but it may not perform file edits
or other side effects until its `NodeReadinessState` is executable.

## Non-Negotiable Rules

- Do not raise metadata byte limits as the fix.
- Do not truncate semantic context arbitrarily to fit metadata.
- Do not store graph patches, task packets, file snapshots, context packets,
  raw prompts, raw responses, provider logs, tool logs, command logs, DB rows,
  secrets, or transcripts in artifact metadata.
- Do not let implementation workers edit with missing target refs, missing
  snapshots, missing validation refs, or blocking context limitations.
- Do not create Product/Spec-specific graph shortcuts.
- Do not make runtime decide semantic sufficiency. Runtime validates schema,
  refs, bounds, storage, authority, lifecycle, and readiness.
- Do not block unrelated sibling branches because one branch is waiting for
  context.

## Recommendation 1: GraphPatch Payload Store

Graph mutations must be stored as payload-backed graph patches, not copied
into scheduler progress metadata.

Add a canonical `RuntimeGraphPatch` body:

- `patchId`
- `runtimeJobId`
- `workflowId`
- `graphId`
- `schedulerIteration`
- `superstepId`
- `patchKind`
- `nodeAdds`
- `edgeAdds`
- `nodeUpdates`
- `readinessUpdates`
- `workQueueChildRefs`
- `evidenceRefs`
- `reasonCodes`
- raw-storage flags all false

Scheduler progress metadata stores only:

- `graphPatchRef`
- `patchKind`
- node/edge/update counts
- affected node id samples
- affected branch id samples
- content hash
- byte count
- bounded summary

Success gate:

- a 100-node/150-edge graph patch remains under metadata limits;
- replay of the latest failed graph writes scheduler progress without
  metadata overflow;
- Work Queue readback hydrates patch summaries from refs without scanning raw
  body payloads.

## Recommendation 2: Expansion Controller

Implementation status: complete for production scheduler admission. Graph
expansion now passes through `RuntimeWorkGraphExpansionAdmissionDecision`
before persistence. Runtime records
`scheduler.evaluate_expansion_admission`, defers non-prerequisite expansion
behind ready frontier work, pages admissible large graph writes, rejects
absolute budget breaches, and surfaces compact admission state in
latest-run-state and Work Queue readback.

Graph expansion needs a runtime controller with explicit budgets.

The controller admits graph growth by:

- max new nodes per scheduler iteration;
- max new edges per scheduler iteration;
- max scheduler progress artifacts per superstep;
- max pending context requests;
- max active implementation/resource branches;
- max repeated no-progress signatures;
- max aggregate graph-patch bytes;
- max model calls per phase;
- max wall-clock per phase.

Expansion decisions produce `ExpansionAdmissionDecision`:

- `accepted`
- `accepted_paged`
- `deferred_due_to_ready_frontier`
- `rejected_budget_exceeded`
- `halt_no_progress`
- `needs_review`

When there is an executable frontier, expansion normally defers unless the
new prerequisite is required by that frontier.

Success gate:

- ready implementation branches run before unrelated speculative context
  expansion. **Implemented through ready-frontier deferral.**
- repeated expansion that creates no executable branch halts with a root cause.
  **Preserved through the no-progress signature guard; true reused-only
  writes still flow to that guard instead of being hidden by admission.**
- large split-task batches are paged rather than emitted as one giant graph
  mutation. **Implemented for node/edge admission budgets.**
- runtime-owned prerequisite context/repair graph writes are not deferred
  behind unrelated ready work. **Implemented through structural edge/kind
  admission, not prompt-text heuristics.**

## Recommendation 3: Context Inheritance And Lazy Resource Materialization

Implementation status: complete for the branch-local context broker request
substrate. Runtime now writes payload-backed
`execution_platform.context_broker.request` artifacts from blocked
`NodeReadinessState` values, registers broker runtime tools, and projects
broker state into latest-run-state and Work Queue readback. Expansion
admission and superstep branch execution remain separate queued items.

2026-05-24 implementation update: WorkIntent context-handoff requirements now
use this broker substrate in the production scheduler. Missing or signal-only
context dispatches consumer-scoped scout prerequisites; accepted-with-
limitations context cannot unlock implementation without a consumer waiver;
and scheduler/readback snapshots expose the broker request refs, context
status, limitation status, waiver refs, context questions, target refs, and
snapshot refs needed to diagnose the next transition.

Split implementation tasks inherit accepted parent context by ref. They do
not automatically spawn fresh context scouts.

Each split child receives:

- parent context handoff refs;
- parent implementation context packet ref;
- target refs and snapshots relevant to the child;
- inherited validation refs;
- inherited limitations;
- consumer waiver state, if any;
- missing-context questions specific to the child.

Runtime creates a new context request only when the child readiness check
shows a precise gap:

- target ref unresolved;
- snapshot missing/stale;
- validation ref missing;
- API/symbol dependency unknown;
- limitation blocking this consumer;
- file ownership conflict;
- human decision required.

Success gate:

- split children can become executable from inherited parent context when
  sufficient;
- missing context produces branch-local requests, not another global scout
  fanout;
- accepted-with-limitations context unlocks only consumers with explicit
  nonblocking waivers.

## Recommendation 4: Superstep Frontier Runtime

Implementation status: complete for canonical branch-result execution
readback. The scheduler already had bounded parallel frontier execution;
this pass promoted branch outcomes into a first-class
`SuperstepBranchResult` contract, added explicit superstep runtime tools, and
surfaced branch status/blockers/next transitions in latest-run-state and Work
Queue readback.

The scheduler should run graph execution in supersteps.

Each superstep:

1. computes branch readiness;
2. opens ready executable nodes;
3. runs independent ready nodes in parallel subject to locks/budgets;
4. records branch-local results;
5. updates Mission Ledger only when claim-bearing evidence appears;
6. routes blocked branches to context/resource/repair/human-decision work;
7. compacts progress into latest-run-state.

Branch result statuses:

- `succeeded`
- `blocked_context`
- `blocked_resource`
- `blocked_dependency`
- `blocked_authority`
- `blocked_human_decision`
- `failed_recoverable`
- `failed_unrecoverable`
- `needs_review`

Sibling branch evidence must survive when one branch fails.

Success gate:

- one branch failure cannot terminalize the whole worker adapter as
  unclassified. **Implemented through isolated branch exception handling and
  systemic sibling failure detection.**
- independent implementation branches execute concurrently when locks allow.
  **Implemented through bounded parallel frontier selection with lock and
  provider concurrency gates.**
- Work Queue readback shows branch id, node id, status, blocker, next
  transition, and evidence refs. **Implemented with canonical superstep
  branch results.**

## Recommendation 5: Progress Compaction Policy

Scheduler progress is a status manifest, not a payload container.

`agent_team.scheduler_progress` metadata must be fixed-size by contract. It
may include:

- runtime job id;
- graph id;
- scheduler phase;
- current superstep id;
- active node samples;
- blocked node samples;
- latest graph patch ref;
- latest readiness state refs;
- latest model/tool span refs;
- latest token/wall-clock counters;
- next transition;
- ELI5 summary.

It must not include:

- full node arrays;
- full edge arrays;
- full task packets;
- full context packets;
- file snapshots;
- validation result bodies;
- raw model/provider/tool/command output.

Success gate:

- progress metadata stays below a conservative byte cap across large graph
  replay;
- latest-run-state remains the compact owner-facing state pointer;
- old body-in-progress paths fail tests.

## Recommendation 6: Readback Projection Rewrite

Work Queue readback should project from compact state and payload manifests.

Implementation status: **Complete 2026-05-23.** Latest-run-state now carries
compact boundary replay state and Work Queue readback projects replay status
from latest-run-state plus explicit checkpoint/plan events. Hot-path readback
uses manifest refs, graph-patch summaries, superstep branch summaries, and
boundary refs rather than hydrating large graph/resource bodies.

Readback inputs:

- latest-run-state artifact;
- current graph snapshot manifest;
- recent graph patch manifests;
- current frontier summary;
- readiness state refs;
- branch result refs;
- model/tool span refs;
- Work Queue child refs.

Readback output:

- active phase;
- selected/running/blocked branches;
- active model/tool/node;
- graph patch counts;
- current blocker;
- next legal transition;
- token/wall-clock/cost counters where available;
- payload refs for drilldown.

Readback must not scan thousands of artifacts on the hot path.

Success gate:

- large Product/Spec replay readback returns from compact projections;
- stale gates such as `firstOpenGate` cannot contradict current replay phase;
- operator can see whether work is expanding, waiting, editing, validating,
  or blocked.

## Recommendation 7: Replay Boundary Expansion

Replay must restart at the actual failed boundary.

Implementation status: **Complete 2026-05-23.** Boundary replay now has
explicit structural dependency requirements, granular boundary kinds for
context, expansion, graph patch, resource materialization, worker, validation,
and closeout phases, production resource-materialization checkpoints, and
canonical Product/Spec replay harness checkpoint artifacts.

Required boundaries:

- after Mission Ledger;
- after Commitment Work Packets;
- after work-intent graph;
- before and after context request;
- before and after context handoff;
- before and after optional synthesis;
- before and after expansion admission;
- before and after graph patch write;
- before and after resource materialization;
- before worker invocation;
- after worker edit proposal/application;
- before and after validation;
- before closeout.

Each boundary writes:

- compact latest-run-state;
- replay input ref;
- replay output ref;
- graph patch ref where relevant;
- readiness refs;
- token/wall-clock counters;
- next legal restart boundary.

Success gate:

- the latest failed metadata-boundary graph can replay from graph patch or
  resource-materialization boundary without rerunning Mission Ledger,
  packet authoring, or context scouts.

## Recommendation 8: Dynamic Fanout Admission Gate

Fanout must be justified before it happens.

Before adding many nodes, runtime evaluates:

- current ready frontier count;
- whether the fanout is prerequisite-critical;
- expected executable nodes created;
- graph growth ratio;
- estimated metadata/payload cost;
- provider/model concurrency budget;
- file lock contention;
- branch independence;
- whether the work can be demand-driven later.

Outputs:

- `fanout_allowed`
- `fanout_allowed_paged`
- `fanout_deferred_ready_frontier_exists`
- `fanout_replaced_by_demand_driven_context`
- `fanout_rejected_no_consumer`
- `fanout_requires_human_review`

Success gate:

- context scouts are not spawned for all commitments/work nodes when no
  consumer is waiting for them;
- split-required transitions page large child sets;
- fanout with no consumer edge is diagnostic-only and cannot unlock
  implementation.

## Recommendation 9: Demand-Driven Context Broker

Add a runtime-owned context broker between nodes and context providers.

Nodes do not directly spawn arbitrary context scouts. They submit typed
`ContextRequest`s:

- `requestId`
- `runtimeJobId`
- `workflowId`
- `graphId`
- `requestingNodeId`
- `consumerNodeId`
- `targetCommitmentIds`
- `question`
- `neededByPhase`
- `requiredResourceKind`
- `candidateRefs`
- `knownContextRefs`
- `blockingIfMissing`
- `budgetClass`
- `deadlineMs`
- `dedupeKey`

The broker:

1. checks inherited context;
2. checks cached context refs;
3. checks repo/code intelligence/resource indexes;
4. dedupes equivalent requests;
5. compiles a bounded context-scout execution packet only when needed;
6. dispatches context scouts in parallel under provider budgets;
7. stores handoff packets by ref;
8. updates `NodeReadinessState`;
9. wakes blocked consumers.

Implementation workers may:

- inspect their execution packet;
- request more context;
- produce an edit plan;
- classify missing context.

Implementation workers may not:

- edit files;
- run side-effecting tools;
- claim success;

until readiness is executable.

Success gate:

- implementation nodes can begin local planning/materialization while waiting
  for context;
- context requests are branch-local and deduped;
- unrelated ready branches keep running;
- missing context surfaces as a precise broker/readiness state, not a worker
  failure.

## Demand-Driven Execution Interpretation

The Product/Spec failures showed that "run all context first, synthesize
everything, then implement" is not the general-purpose architecture. It
creates latency, broad context packets, and global blockers. The stronger
interpretation of these nine recommendations is demand-driven frontier
execution:

- the scheduler first creates work-intent nodes from accepted Mission Ledger
  commitments and worker-grade Commitment Work Packets;
- each implementation-bearing branch materializes only the resources needed
  by that branch;
- a branch may request context through the broker when readiness proves a
  precise gap;
- context scouts run for concrete consumers, not for every commitment by
  default;
- context handoffs carry model-authored file/symbol edit intent and
  limitations;
- implementation workers receive hydrated `NodeExecutionPacket` plus
  domain-resource packets, not a broad repo-area prompt;
- ready sibling branches continue while blocked siblings request context or
  resource repair.

This keeps the runtime nimble across coding, planning, design, marketing,
research, QA, and docs. Runtime owns schema, refs, storage, lifecycle, locks,
and replay. Domain plugins own resource kinds and readiness policy. Models own
semantic decomposition, context usefulness, file/symbol change intent,
workflow-specific sufficiency, and escalation judgment.

The first coding-specific consequence is documented in
[Semantic Microtask Refinement And Worker Packet Quality](/projects/execution-platform/specs/semantic-microtask-refinement-and-worker-packet-quality):
runtime must not turn broad work-intent nodes or repo-scope refs into
arbitrary file chunks. Before a file-edit worker runs, the branch must have
model-authored semantic microtasks or context-scout recommended edit points
that explain why each file/symbol is in scope.

The second coding-specific consequence is documented in
[Execution Intent, Evidence Mode, And Worker Dispatch](/projects/execution-platform/specs/execution-intent-evidence-mode-and-worker-dispatch):
runtime must not route every implementation-looking branch to a file-edit
worker. A source-grounding branch may be executable as read-only evidence and
may close a read-first commitment, but it cannot satisfy changed-file
evidence and must not be selected as the worker smoke for source edits.

## Implementation-Triggered Context Model

The preferred architecture is not a giant context fanout before execution.
It is also not blind implementation without context. It is a readiness-driven
middle path:

1. The scheduler creates work-intent implementation branches from accepted
   packets and workflow definitions.
2. Runtime compiles the branch's initial `NodeReadinessState`.
3. If the branch has enough inherited context, target refs, snapshots,
   validation refs, and semantic file-change intent, it opens into the ready
   frontier.
4. If any prerequisite is missing, the branch emits a typed context/resource
   request through the broker.
5. Context scouts run for concrete consumers, not for every commitment by
   default.
6. The broker attaches accepted handoff refs and wakes only the blocked
   consumers that the handoff can satisfy.
7. Ready siblings continue to execute while blocked siblings wait or repair.

For coding, this means a worker may begin with a hydrated
`NodeExecutionPacket` and can request missing target context before patching,
but it cannot edit until the readiness object is executable. For planning,
design, marketing, research, QA, memory, and docs, the same rule applies with
domain-specific resource kinds supplied by the workflow plugin.

This model avoids two brittle extremes:

- global upfront context discovery that delays all useful work and produces
  oversized synthesis artifacts;
- deterministic runtime expansion from vague repo/workflow scope into fake
  executable tasks.

The context broker and readiness compiler must keep these boundaries:

- models author semantic need, usefulness, limitation, and file/workflow
  intent;
- runtime owns refs, payload storage, hashes, bounds, locks, lifecycle,
  checkpointing, replay, and executable-state transitions;
- workflow plugins define resource kinds and readiness requirements;
- Work Queue readback reports branch-local blockers and next transitions
  without hydrating large payload bodies.

## Product/Spec Boundary Replay Evidence

The Product/Spec replay from the failed resource boundary has now passed the
resource-materialization gate after the split/materialization transition and
replay target-ref parity fixes.

Evidence:

- runtime job: `product-spec-replay-mpika9c1`
- graph:
  `team-run-native-exec-7507e654ba4db90c-checkpoint-replay-mpika9c0-runtime-work-graph`
- boundary: `before-resource-materialization`
- proof artifact:
  `.artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json`
- result: `succeeded`
- materialized branches: 2
- ready `NodeExecutionPacket` count: 2
- source edits landed: none; the proof stopped before worker execution by
  design.

The replay proved that accepted context handoffs can be reconstructed from
payload-backed artifacts, symbolic context refs can be resolved, broad
directory/repo seeds can be narrowed to model-authored concrete edit points,
and implementation nodes can compile into ready execution packets without
rerunning router, Mission Ledger, packet authoring, graph selection, or
context scout.

## Detailed Implementation Matrix

The nine recommendations are one runtime direction, not nine independent
feature islands. Each slice must be implemented as production runtime
behavior with a typed contract, a runtime tool surface where useful, a hard
gate, and a replay/proof lane:

1. GraphPatch Payload Store
   - Runtime surface: graph-patch write/read-manifest helpers and Work Queue
     graph-patch projection.
   - Contract: graph mutations are payload-backed bodies; progress metadata
     stores refs, hashes, counts, samples, and bounded summaries only.
   - Hard gate: scheduler progress fails tests if node arrays, edge arrays,
     task packets, context packets, snapshots, or validation bodies are stored
     in metadata.
   - Proof: replay latest Product/Spec graph plus a synthetic large graph
     without metadata overflow.
2. Expansion Controller
   - Runtime surface: `scheduler.evaluate_expansion_admission`.
   - Contract: graph growth is admitted, paged, deferred, or rejected from
     structural budgets and current ready-frontier state.
   - Hard gate: unrelated speculative expansion cannot outrank an executable
     ready frontier.
   - Proof: repeated no-progress graph decisions halt with one root cause and
     large fanout pages.
3. Context Inheritance And Lazy Resource Materialization
   - Runtime surface: context broker request/resolve tools and resource
     materialization tools.
   - Contract: split children inherit accepted refs and request missing
     resources only when `NodeReadinessState` proves a gap.
   - Hard gate: accepted-with-limitations context unlocks only consumers with
     explicit waiver refs.
   - Proof: one split child executes from inherited context while another
     emits a branch-local context request.
4. Superstep Frontier Runtime
   - Runtime surface: frontier evaluation, branch execution, and branch result
     record helpers.
   - Contract: independent ready branches run in bounded parallel, failures
     are branch-local, and sibling evidence survives.
   - Hard gate: one branch adapter exception cannot terminalize unrelated
     siblings as the same failure.
   - Proof: at least two ready branches run concurrently under locks, with
     branch result refs projected into readback.
5. Progress Compaction Policy
   - Runtime surface: latest-run-state writes at every boundary and compact
     scheduler progress.
   - Contract: progress is current state, not a second artifact body store.
   - Hard gate: progress metadata has a conservative byte cap and body-shaped
     regressions fail tests.
   - Proof: owner readback shows phase, node, model/tool, blocker, and next
     action without artifact archaeology.
6. Readback Projection Rewrite
   - Runtime surface: Work Queue projection from latest-run-state, branch
     summaries, graph-patch manifests, readiness refs, and model/tool spans.
   - Contract: owner readback is a projection over compact runtime truth.
   - Hard gate: stale `firstOpenGate` or old artifact scans cannot contradict
     current boundary state.
   - Proof: readback shows whether the run is expanding, waiting, editing,
     validating, repairing, or blocked.
7. Replay Boundary Expansion
   - Runtime surface: boundary checkpoint write/read/resolve helpers for graph
     patch, context request, context handoff, resource materialization, worker
     invocation, validation, and closeout.
   - Contract: every expensive boundary writes enough refs to restart from
     that boundary without rerunning earlier phases.
   - Hard gate: replay cannot silently restart from the top when a checkpoint
     is missing; it must report the missing boundary refs.
   - Proof: after-resource and before-worker replays run from the latest
     Product/Spec failed graph.
8. Dynamic Fanout Admission Gate
   - Runtime surface: fanout admission inside expansion control and graph
     compile.
   - Contract: fanout needs consumers, budget, and an explicit prerequisite
     relationship to ready or soon-ready work.
   - Hard gate: consumerless fanout is diagnostic-only and cannot unlock
     implementation.
   - Proof: large context or split-task fanout is paged, replaced by
     demand-driven context, or deferred behind ready work.
9. Demand-Driven Context Broker
   - Runtime surface: context request, inherited-context resolution,
     context-scout dispatch, handoff attachment, and consumer wakeup helpers.
   - Contract: nodes ask for concrete missing context; the broker dedupes,
     hydrates, and dispatches only when needed.
   - Hard gate: workers may inspect packets and ask for context, but cannot
     perform side effects until readiness is executable.
   - Proof: context requests are branch-local, deduped, and wake only the
     consumers they can satisfy.

The executor-boundary extension is:

- Execution Intent, Evidence Mode, And Worker Dispatch
  - Runtime surface: staged scheduler graph compile, resource
    materialization, replay selection, and worker dispatch all consume
    `executionIntent` and runtime-derived `evidenceMode`.
  - Contract: the model states the intended work class; runtime maps
    capability/evidence/executor compatibility structurally.
  - Hard gate: read-only/source-grounding work cannot be dispatched to
    changed-file workers.
  - Proof: the Product/Spec after-resource replay no longer chooses the
    read-only source-grounding child as the edit worker smoke.

## Work Queue Slices Through The Next Proof

### P0. GraphPatch Payload Store And Progress Compaction

Implements Recommendations 1 and 5. This is first because it directly fixes
the latest replay failure.

### P0. Demand-Driven Context Broker And Lazy Readiness

Implements Recommendations 3 and 9. This replaces mandatory broad context
fanout with node-local context/resource requests while preserving hard edit
readiness.

### P0. Expansion Controller And Dynamic Fanout Admission

Implements Recommendations 2 and 8. This prevents runaway graph growth and
pages or defers fanout when a ready frontier exists.

### P0. Superstep Frontier Runtime And Branch Results

Implements Recommendation 4. This makes parallel frontier execution the
normal large-workflow path and isolates sibling failures.

### P0. Readback Projection And Replay Boundary Expansion

Implements Recommendations 6 and 7. This makes proof/debug loops restartable
at the failed boundary and owner-visible without artifact archaeology.

Status: **Complete.**

### P0. Semantic Microtask Refinement And Worker Packet Quality

Extends Recommendations 3, 4, 7, and 9 at the worker boundary. It proves that
demand-driven execution does not mean "let a worker edit from vague context."
Repo scope remains discovery/authority scope; executable worker packets need
file snapshots, validation refs, commitment mappings, context refs, and
model-authored file-change intent. Boundary replay worker smoke rolls edits
back by default until Codex review accepts them.

### P0. Product/Spec Replay Then Full Proof

First replay the latest failed graph from the nearest graph-patch/resource
boundary. **Complete 2026-05-23.** Then rerun Product/Spec from the top only
after replay proves:

- graph/progress metadata stays bounded;
- context is demand-driven or inherited;
- expansion is budgeted;
- ready branches execute;
- implementation workers receive hydrated execution packets;
- implementation workers receive semantic microtask/file-change intent;
- execution intent/evidence mode dispatch prevents read-only grounding nodes
  from being sent to file-edit workers;
- source edits and validation can occur.

### P0. Execution Intent, Evidence Mode, And Worker Dispatch

Extends Recommendations 3, 4, 6, 7, and 9 at the executor boundary. It
introduces explicit model-authored execution intent and runtime-compiled
evidence mode so source-grounding/read-only evidence, context supply,
resource materialization, source edits, validation, review, readback, human
decision, and closeout use the correct executor class. The after-resource
worker smoke must select an edit-required node only when
`changed_file_evidence` is structurally required; otherwise it reports
`no_ready_edit_required_node` or proves the read-only node through a read-only
executor.

## Cross-Domain Applicability

For coding, resources are files, symbols, snapshots, tests, validation
commands, edit scopes, and code-intelligence refs.

For planning, resources are research briefs, planning capsule refs, human
decision refs, action graph proposal refs, compile boundaries, and validation
criteria.

For design, resources are design system refs, screenshots, component trees,
assets, brand constraints, viewport targets, and approval refs.

For marketing, resources are audience briefs, channel constraints, source
materials, campaign refs, compliance constraints, and review gates.

For research/docs/QA/architecture, resources are source refs, acceptance
criteria, test targets, citation refs, contract refs, and review policies.

The context broker and frontier runtime must stay workflow-agnostic. Domain
plugins define resource kinds and readiness requirements; runtime owns refs,
schema, storage, lifecycle, and branch execution.
