# Execution Platform Decisions

## 2026-05-24 WorkIntent is the required control-plane boundary before executable coding nodes

Decision: complex coding-team work must pass through a canonical
model-authored `WorkIntent` before runtime can materialize resources or
dispatch workers. `WorkIntent` carries semantic execution intent and
capability rationale; runtime owns ids, executor keys, evidence modes,
resource requirements, readiness, storage, lifecycle, and replay boundaries.

Implications:

- `context_synthesis group -> implementation node` is prohibited as a default
  coding-team production path.
- Context synthesis may remain explicit workflow coordination or diagnostic
  replay, but it cannot be default glue for Product/Spec proof success.
- File-edit workers may run only from hydrated `source_edit`
  `NodeExecutionPacket`s.
- Read-only/source-grounding work produces read-only evidence or blocks with
  an intent/capability conflict; it cannot be judged as missing changed-file
  evidence.
- The pre-proof Work Queue is re-ranked around WorkIntent compiler,
  synthesis retirement, node-scoped context/readiness, resource
  materialization, worker smoke, and owner readback gates.

Specs:

- [Control-Plane Coding Team Recovery](/projects/execution-platform/specs/control-plane-coding-team-recovery)
- [WorkIntent Control-Plane Contract](/projects/execution-platform/specs/work-intent-control-plane-contract)

2026-05-24 implementation decision: accepted context-synthesis artifacts are
coordination evidence only on the production coding path. The runtime may
compile explicit synthesis groups into non-runnable `WorkIntent` nodes when
the model authored execution intent and capability selection, but it may not
compile them directly into executable implementation/support graphs. Replay
must follow the same scheduler-first topology: `after-graph-selection` cannot
be satisfied by accepted synthesis alone, and `after-context-synthesis`
remains a legacy diagnostic boundary.

2026-05-24 implementation decision: node-scoped context supply is now a
broker-backed readiness transition. A WorkIntent that declares a
`context_handoff` requirement cannot advance to resource materialization until
the consumer node has accepted context or a precise context prerequisite is in
flight. `accepted_with_limitations` context is structurally blocking unless a
consumer-specific waiver ref is present. Runtime compiles broker request refs,
context scout prerequisites, `context_supplies` edges, and readback fields;
the model still judges semantic usefulness and whether a limitation is
waivable.

## 2026-05-24 Control Plane Is The Coding-Team Recovery Boundary

Decision: the next Product/Spec proof path is control-plane-first rather than
global-synthesis-first.

The latest proof failed before implementation because context synthesis group
expansion attempted structured-adapter calls with payloads over profile
bounds. The failure is not a provider no-content problem and not evidence that
Product/Spec itself is impossible. It shows that the platform still has a
large model-facing boundary where the accepted architecture requires bounded
task DAG nodes, node-scoped resource packets, and worker tool loops.

Consequences:

- keep the working Mission Ledger path;
- create draft task DAG nodes before broad context fanout;
- attach context to consumer nodes through node-scoped context supply;
- allow `context_synthesis` only as explicit coordination, never default
  replay glue;
- make `NodeExecutionPacket` the implementation-node contract;
- expose small model-facing coding tool verbs and normalize them into
  runtime-owned worker tools;
- prove one Product/Spec-derived real edit before another full top-of-pipe
  Product/Spec run;
- preserve the full `task.*`, `repo.*`, `context.*`, `edit.*`, `checks.*`,
  `worktree.*`, `artifact.*`, `review.*`, `message.*`, `approval.*`,
  `memory.*`, and `telemetry.*` catalog as post-proof architecture.

Guardrail: runtime may validate structure, refs, bounds, authority, and
lifecycle, but it must not decide semantic usefulness, Product/Spec file
relevance, context sufficiency, implementation quality, or commitment closure.
Those remain model-authored or human-authored judgments with runtime-validated
evidence refs.

Governing spec:
[Control-Plane Coding Team Recovery](/projects/execution-platform/specs/control-plane-coding-team-recovery).

## 2026-05-23 Refactor Extraction Is A Pre-Proof Gate

Decision: promote the core generic-runtime refactor tranche ahead of the next
Product/Spec Planning proof.

The platform has reached a point where proof failures are no longer only
feature gaps. They also come from stale proof/runtime topology, large
coordinator files with mixed responsibilities, replay harnesses that own graph
shape, and compatibility paths that are hard to distinguish from production.
The context-synthesis regression is the concrete trigger: production policy
had moved to scheduler-first node-scoped context, but replay code still
injected a default `context_synthesis` node as proof glue.

Consequences:

- add characterization and import-boundary guardrails before broad
  extraction;
- move generic runtime spine extraction before Product/Spec;
- thin `DynamicAgentTeamGraphRunner` before Product/Spec so it becomes coding
  plugin wiring rather than the workflow brain;
- move generic replay/readiness lifecycle extraction before Product/Spec so
  proof scripts consume runtime services instead of owning topology;
- modularize progress/readback projections before Product/Spec so operator
  readback is not coupled to monolithic event projection;
- promote compatibility bypass audit and model contract compiler
  consolidation before Product/Spec because those are recurring proof-failure
  classes;
- keep retention/pruning, phase budgets, frontier delta streams, workflow
  breadth, memory toolification, role/model benchmarks, and future team
  adapters after Product/Spec unless a later proof failure makes one a direct
  blocker.

Governing spec:
[Pre-Product/Spec Execution Platform Modularization](/projects/execution-platform/specs/pre-product-spec-execution-platform-modularization).

2026-05-24 implementation decision: the first tranche is a typed
characterization guardrail, not an informal checklist. Production runtime,
workflow plugin, coding adapter, worker adapter, Work Queue readback, Runtime
Tool Kernel, model task contract, replay harness, proof script, diagnostic
script, test fixture, and deprecated legacy files now have explicit boundary
classifications. Production imports of replay/proof/diagnostic/test/legacy
surfaces are hard blocks in the guardrail audit. Diagnostic/proof surfaces may
import production runtime services, but production may not import their
topology. Generic runner retirement constants live in a neutral workflow
contract module so readback does not import the deprecated queued runner.

2026-05-24 implementation decision: the second tranche creates a concrete
generic runtime spine rather than another policy facade. Workflow readiness,
scheduler-option readiness, scheduler-result lifecycle status, and
false-success graph-evidence rejection now live in
`generic-runtime-spine.ts`. `GenericOrchestrationRuntime` delegates to that
spine, and the production coding runner emits spine readiness/lifecycle
artifacts. Coding remains a plugin/executor surface; generic lifecycle
decisions do not import coding adapters, Product/Spec proof code, replay
harnesses, or legacy runners.

2026-05-24 implementation decision: the third tranche thins
`DynamicAgentTeamGraphRunner` by moving generic workflow runtime execution
artifact lifecycle into `generic-orchestration-runtime-execution.ts` and
coding-team executor registration into `coding-team-runtime-adapter.ts`.
The dynamic runner still owns coding-specific model clients, context,
implementation, validation, resource-materialization hooks, and closeout
assembly, but it no longer constructs generic workflow runtime readiness,
spine readiness/lifecycle, workflow engine readiness, or generic runtime
result artifacts inline. Generic runtime execution remains workflow-agnostic
and must not import coding adapters, Product/Spec proof code, replay
harnesses, or legacy queued runners. The next modularization tranche owns
generic replay and readiness lifecycle extraction.

2026-05-24 implementation decision: the fourth tranche makes boundary replay
registry-backed production runtime state. `boundary-replay-registry.ts` is the
source of truth for checkpoint kinds, required upstream checkpoints,
versioned normalizers, resume command defaults, allowed next transitions,
terminal blocker classes, readback fields, and diagnostic-only boundaries.
`BoundaryReplayService` compiles replay plans and production continuations
from that registry, and Work Queue readback surfaces the same registry-backed
fields. Legacy `after_context_synthesis` remains diagnostic-only; it cannot
become a default replay glue path or production continuation without explicit
diagnostic allowance. Product/Spec replay scripts may remain diagnostic CLIs,
but boundary support and checkpoint policy must resolve through the runtime
registry rather than script-local topology rules.

2026-05-24 implementation decision: the fifth tranche extracts owner-facing
readback projection from the monolithic Work Queue read-model assembler.
`execution-read-model.ts` remains the public read-model assembly boundary,
but active graph progress, boundary replay readback, worker-internal progress,
model-call usage/walltime, runtime artifact payload manifest summaries, and
bounded projection helpers now live under `work-queue/projections/`.
Projection modules consume compact runtime events, latest-run-state, payload
manifests, branch/readiness refs, and tool/model span refs; they do not own
workflow semantics or hydrate raw prompt, provider, tool, command, DB, secret,
or hidden-reasoning bodies. Provider diagnostics exposed in readback are
bounded and body-scrubbed before projection.

## 2026-05-23 Execution Intent And Evidence Mode Are Dispatch Boundaries

Decision: every runnable graph node and domain resource packet must expose a
model-authored execution intent and runtime-compiled evidence mode before it
can be dispatched to an executor.

The after-resource Product/Spec worker smoke selected a source-grounding
child task and sent it to a file-edit worker. That was structurally wrong:
the task asked to read specs/status/source refs and explicitly required no
code changes before completion. The worker had no legitimate changed-file
evidence to emit.

Consequences:

- source-grounding/read-only nodes route to read-only/context/review evidence
  executors, not file-edit workers;
- file-edit workers require `executionIntent: source_edit` or a workflow
  plugin equivalent plus `changed_file_evidence`;
- runtime validates only structural compatibility between intent, capability,
  evidence mode, resource packet, and executor;
- runtime must not infer intent from words like "verify" or "confirm";
- proof harnesses must select edit-required nodes for changed-file worker
  smoke or report `no_ready_edit_required_node`;
- Work Queue readback must show execution intent and evidence mode so owners
  can tell whether the system is grounding, editing, validating, reviewing,
  reading back, or closing out.

Governing spec:
[Execution Intent, Evidence Mode, And Worker Dispatch](/projects/execution-platform/specs/execution-intent-evidence-mode-and-worker-dispatch).

## 2026-05-23 Demand-Driven Frontier Context Decision

Decision: replace giant upfront context fanout as the default large-workflow
execution model with demand-driven frontier execution.

Rationale:

- the latest Product/Spec replay proved context scout can advance, but graph
  expansion and scheduler progress still failed before implementation because
  metadata carried too much state;
- waiting for all context work before any implementation branch moves creates
  latency, all-or-nothing failure, and speculative graph growth;
- a general workflow runtime should execute ready branches while blocked
  branches request context/resources through a runtime broker.

Rules:

- graph patches are payload-backed artifacts; scheduler progress metadata
  stores refs, counts, hashes, and bounded samples only;
- implementation-bearing nodes may inspect packets, request context/resources,
  and draft edit plans, but may not edit files or claim success until
  `NodeReadinessState` is executable;
- context requests are branch-local, deduped, budgeted, and routed through
  the demand-driven context broker;
- expansion/fanout is admitted by runtime budgets and deferred when a ready
  frontier exists;
- Work Queue readback uses compact latest-run-state and payload manifests,
  not artifact archaeology;
- this is a workflow-agnostic runtime rule, not a Product/Spec-specific
  shortcut.

Spec:
`docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md`.

## 2026-05-22 Production Mission Ledger Restored To Single-Pass Path

Decision: production coding-team Mission Ledger creation uses the prior
working single-pass Mission Contract Ledger path. The staged Mission Ledger
compiler is hard-disabled from production and retained only for explicit
diagnostic/proof runs.

The staged compiler was intended to reduce output variance by decomposing
Mission Ledger creation into objective/constraint extraction, obligation
candidate extraction, candidate compilation, candidate review, canonical
commitment compilation, and acceptance. In practice it moved the schema choke
earlier: the latest repeated Product/Spec packet-boundary proof failed at the
first staged objective/constraint call because the model produced more
constraints than the staged schema allowed. That added latency and fragility
without proving better downstream outcomes.

Consequences:

- production `DynamicAgentTeamGraphRunner` calls
  `mission_ledger.production_single_pass` by default;
- staged Mission Ledger can run only when
  `OPENCLAW_ENABLE_STAGED_MISSION_LEDGER_DIAGNOSTIC=true` and the explicit
  per-job payload diagnostic flag are both set;
- large model-authored safety/non-goal arrays are bounded before Mission
  Ledger schema validation, so constraint volume does not become a runtime
  failure;
- commitment-count variance in repeated-run diagnostics is reportable but not
  a deterministic semantic blocker by itself;
- packet coverage gaps, missing packet fields, changed mission gates, runtime
  boundary failures, and GPT rescue dependence remain blocking proof
  concerns;
- Codex JSON model calls still honor per-call reasoning effort rather than
  forcing GPT-5.5 `xhigh`;
- staged compiler artifacts and provider diagnostics remain available for
  research and proof analysis, but are not live production success paths.

Supersedes production wiring from:
[Staged Mission Ledger Obligation Candidate Compiler](/projects/execution-platform/specs/staged-mission-ledger-obligation-candidate-compiler).

## 2026-05-22 Mission Ledger Is A Staged Runtime-Compiled Protocol

Decision: superseded for production by the 2026-05-22 rollback above. The
staged protocol remains diagnostic/proof-only.

The latest Product/Spec proof attempt reached Mission Ledger and then failed
because the model used `candidateLocalRefs` in a review operation while the
runtime expected compiled `candidateRefs`. The deeper issue was that the same
model call was asked to extract objective/constraints, extract obligation
candidates, author review operations, and respect runtime-owned ids/refs all
at once. That recreates schema choke and latency pressure.

Consequences:

- the model first extracts objective, constraints, non-goals, and mission gate;
- the model then extracts source-anchored obligation candidates using
  `localCandidateRef` only;
- runtime compiles candidates into canonical runtime `candidateRef` values;
- the model reviews only those runtime candidate refs and cannot use
  `candidateLocalRefs` in review;
- runtime compiles canonical commitments, Mission Contract Ledger projection,
  and acceptance status;
- failures produce bounded staged Mission Ledger repair diagnostics and
  `needs_review`, not legacy `blockingCommitments` fallback;
- Codex JSON model calls honor call-site reasoning effort, so the staged
  protocol can use medium budgets instead of unconditionally forcing GPT-5.5
  `xhigh`.

Governing spec:
[Staged Mission Ledger Obligation Candidate Compiler](/projects/execution-platform/specs/staged-mission-ledger-obligation-candidate-compiler).

## 2026-05-22 Scheduler Frontier Is A Runtime Boundary

Decision: the Runtime Work Graph scheduler must evaluate and run an
executable ready frontier before asking the orchestrator for more graph
expansion in production coding-team jobs.

The Product/Spec proof series showed that a dynamic scheduler can still act
like an expansion loop if ready nodes wait while the runtime repeatedly
creates, repairs, or reuses context/prerequisite shape. Reused-only graph
decisions are useful diagnostics, but they are not forward progress and must
not reset loop guards. Context-only evidence is readiness evidence, not a
default reason to call the global Mission Ledger evaluator.

Consequences:

- production `agent_team.coding` scheduler construction opts into
  `preferExecutableFrontierBeforeOrchestrator`;
- scheduler progress emits canonical `RuntimeWorkGraphSchedulerFrontierState`;
- graph persistence outcomes distinguish created nodes/edges from reused
  nodes/edges;
- repeated reused-only decisions write
  `RuntimeWorkGraphNoProgressSignature` evidence and halt as `needs_review`
  with a root-cause diagnostic;
- Mission Ledger evaluation is throttled for context-only node events unless
  they contain closure claims or explicit evaluation request;
- Work Queue active graph readback must expose scheduler frontier,
  no-progress, and throttle state for operators.

Governing spec:
[Scheduler Frontier, No-Progress, And Evaluation Throttle](/projects/execution-platform/specs/scheduler-frontier-no-progress-and-evaluation-throttle).

## 2026-05-22 Split-Required Is A Graph Transition

Decision: `split_required` from resource materialization is a first-class
Runtime Work Graph transition, not a worker adapter failure and not a retry
of the same parent implementation node.

The Product/Spec proof for runtime job `native-exec-55dc1cc6a3e94232`
advanced through packet authoring and context scout, then blocked because a
high-level implementation parent exceeded resource packet bounds and produced
`post_context_task_split_required_for_file_resolved_microtasks`. Runtime was
correct to block the worker; scheduler was wrong to leave the parent as the
runnable unit and surface `worker_adapter_threw:unclassified`.

Consequences:

- parent implementation/work-intent nodes that return `split_required` become
  aggregate/non-runnable rollup nodes;
- accepted split task packets are persisted as payload-backed artifacts;
- runtime compiles executable child nodes, ids, capability refs, executor
  refs, Work Queue children, dependency edges, and readiness refs;
- child nodes, not the parent, enter the executable frontier;
- repeated materialization of the same parent with the same split-required
  evidence and no child creation is classified as
  `split_required_transition_not_applied`;
- supervisor/readback classification must use resource-materialization
  reason codes, not `worker_adapter_threw:unclassified`;
- replay must restart from the split/materialization boundary and prove child
  promotion before the full Product/Spec proof is rerun.

Implementation note: graph `nodeStatus: skipped` cannot satisfy blocking
handoff dependencies in the current scheduler, so implemented parents use
`nodeStatus: succeeded` plus `splitRequiredParentLifecycle:
aggregate_non_runnable` and `commitmentClosureEligible: false`. Commitment
closure still requires child evidence claims; parent success only means the
split transition itself was applied.

Governing spec:
[Split-Required Resource Materialization Transition](/projects/execution-platform/specs/split-required-resource-materialization-transition).

## 2026-05-21 Frontier Worker Proof Closes Parallel Frontier Before Product/Spec

Decision: the remaining Parallel Frontier Resource Boundary item must be
closed or explicitly superseded with a focused frontier-worker proof before
the full Product/Spec Planning proof is counted as the next active queue
item.

Resource materialization replay proved that payload-backed implementation
nodes can be hydrated to executable readiness. It did not by itself prove
parallel branch isolation, context-limitation blocking, owner-visible
readback, or an actual worker smoke at the first executable frontier.

Consequences:

- the proof must use bounded runtime evidence from the latest failed graph or
  a semantically equivalent checkpoint;
- branch failures are node/branch evidence and must not collapse the whole
  adapter result while sibling evidence is preserved;
- `accepted_with_limitations` context cannot unlock implementation without a
  consumer-specific waiver;
- context repair nodes either supply a real consumer through graph edges or
  are diagnostic-only;
- one ready implementation node must receive a hydrated
  `NodeExecutionPacket`, file/domain resources, edit scope, validation refs,
  and commitment mappings;
- Work Queue readback must show branch id, node id, blocker, schema/policy
  path, readiness ref, active model/tool/phase, and next legal transition;
- failures in this gate must repair generic runtime/scheduler/worker
  contracts rather than Product/Spec-specific fixtures or prompt wording.

Governing spec:
[Pre-Product/Spec Frontier Worker Proof Gate](/projects/execution-platform/specs/pre-product-spec-frontier-worker-proof-gate).

## 2026-05-21 Generic Runtime Extraction Is Post-Proof

Decision: the runtime/coding plugin ownership cleanup is important, but it is
sorted immediately after Product/Spec unless the frontier-worker proof exposes
another runtime/coding divergence blocker.

The architecture target is one generic runtime that owns lifecycle, replay,
readiness, resource materialization, parallel frontier supersteps, repair,
evidence handoff, validation/repair routing, closeout readiness, and Work
Queue runtime readback. Coding becomes a workflow plugin that owns coding
executors, code intelligence, file-edit adapters, validation conventions, and
changed-file evidence formatting.

Consequences:

- Product/Spec should prove the current production path first;
- after Product/Spec, extract generic runtime spine behavior before broad
  future workflow expansion;
- future design, marketing, research, docs, QA, memory, and planning
  workflows should consume the same generic lifecycle contracts rather than
  reimplement coding-team lessons;
- `DynamicAgentTeamGraphRunner` should shrink to coding plugin wiring and
  adapter orchestration, not remain the workflow brain.

Governing spec:
[Post-Proof Generic Runtime Extraction](/projects/execution-platform/specs/post-proof-generic-runtime-extraction).

## 2026-05-21 Resource Materialization Is A Durable Replay Boundary

Decision: resource materialization is a first-class replay boundary between
accepted graph/context evidence and worker invocation. The production runtime
must support `before_resource_materialization` and
`after_resource_materialization` checkpoints, and worker execution must be
guarded by canonical `NodeReadinessState`.

The Product/Spec proof for runtime job `native-exec-78e1b33861780884`
advanced to implementation-resource materialization after accepted context
handoffs, then failed before source edits. The payload store work solved the
body-storage layer, but replay still tried to restart from broad
`after-graph-selection`, which is not the failed boundary.

Consequences:

- replay must restart exactly at the boundary that failed; it must not rerun
  Mission Ledger, packet authoring, graph selection, or context scout when
  those upstream artifacts already exist.
- `NodeReadinessState` is the canonical readiness truth consumed by scheduler
  frontier selection, boundary replay, Work Queue readback, proof gates, and
  worker invocation guards.
- graph node metadata is manifest-only. Full target refs, snapshots,
  resource packets, context packets, split-task arrays, raw prompts, raw
  responses, raw provider/tool/command/DB logs, secrets, and hidden reasoning
  are forbidden in graph metadata.
- old checkpoint artifacts may be normalized into current readiness state
  only when ids, refs, payloads, hashes, and raw-storage flags can be proven
  safe. Otherwise replay emits exact missing refs and blockers.
- latest-run-state must be written at every boundary and terminal event so
  operators can see current node, phase, blocker, payload refs, token/wall
  time, and next legal transition without scanning artifacts.
- a missing resource packet, missing snapshot, stale ref, metadata violation,
  or invalid checkpoint shape is readiness evidence, not a worker failure.

Governing spec:
[Resource Materialization Boundary Replay And Canonical Node Readiness](/projects/execution-platform/specs/resource-materialization-boundary-replay-and-canonical-node-readiness).

## 2026-05-21 Runtime Artifact Metadata Is Not Payload Storage

Decision: runtime artifact metadata is a bounded manifest/index surface only.
Full resource packet bodies must be stored in the canonical Runtime Artifact
Payload Store and referenced from bounded manifests.

The Product/Spec proof for runtime job `native-exec-78e1b33861780884`
reached the implementation-resource frontier after accepted context scout and
context-repair handoffs, then failed with
`worker_adapter_threw:artifact_metadata_limit`. The failure happened before
Kimi/Qwen/Codex implementation because production code still attached full
`ImplementationContextPacket`, resource materialization result, and
`ImplementationTaskPacket` bodies as artifact metadata.

Consequences:

- do not raise metadata limits, truncate packets, or compress payloads into
  metadata.
- the canonical production backing is
  `execution_platform.runtime_job_artifact_payloads`, with bounded manifests
  in `execution_platform.runtime_job_artifacts`.
- payload refs are hydratable through repository APIs and first-class runtime
  tools such as `artifact.payload.get_json` and
  `artifact.payload.hydrate_manifest`.
- runtime artifact metadata stores bounded manifests only: refs, hashes, byte
  counts, summaries, readiness, node ids, commitment ids, and raw-storage
  flags.
- full resource packets, context bundles, file snapshot bundles, validation
  bodies, and similar large structured artifacts are stored in a payload/body
  store and hydrated by ref.
- graph node metadata stores refs and compact readback summaries only.
- scheduler, replay harness, Work Queue readback, and worker invocation must
  be able to hydrate payload refs.
- payload storage failures are resource/storage readiness failures, not
  context scout failures, provider failures, or implementation worker
  failures.
- replay should restart from the resource-storage boundary when upstream
  graph/context evidence already exists.

Governing spec:
[Runtime Artifact Payload Store And Bounded Manifests](/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests).

## 2026-05-21 Context Scout Needs A Resource Packet

Decision: production context scout must consume a runtime-compiled
`ContextScoutExecutionPacket`; it must not be invoked from a monolithic role
prompt assembled from the full objective, broad ledger state, source prompt
index, volatile excerpts, repo index, and role instructions.

The Product/Spec proof for runtime job `native-exec-06e162ea7066ac2e`
validated the front door, Mission Ledger, Commitment Work Packets, and graph
selection, then failed before role invocation because context scout provider
calls were blocked by structured-adapter preflight. The calls were about
42 KB against a 32 KB `local_semantic_extraction` policy bound and requested
900 seconds against a 90 second provider-call hard timeout.

Consequences:

- context scout becomes a resource-materialized node like implementation
  nodes. It receives a bounded execution packet with target node ids,
  target commitment ids, packet refs, source prompt section refs, repo
  context refs, context questions, downstream consumer, byte budget, and
  policy-derived provider timeout.
- node lifecycle budget and provider-call budget are distinct. Runtime may
  spend a longer node budget across packet compilation, tool requests, retry,
  and handoff, but each provider call must obey the model-task policy and
  provider profile.
- request-context repair is semantic-only from the model. The model supplies
  failed/blocked nodes, missing context questions, context objective,
  downstream consumer, and stop-if-missing rules; runtime compiles node ids,
  capability ids, executor keys, worker refs, storage flags, expected
  evidence, edges, and lifecycle.
- repair diagnostics for request-context paths must mention
  `requestContextIntent.*` fields and forbidden runtime-owned fields. They
  must not ask for `newNodes[0].nodeId` when staged/runtime compilation is
  required.
- raising max input bytes or allowing 15-minute provider calls is rejected as
  a false fix. The correct fix is a smaller task-specific packet plus bounded
  context request tools.

Governing spec:
[Context Scout Execution Packet And Request-Context Repair](/projects/execution-platform/specs/context-scout-execution-packet-and-request-context-repair).

## 2026-05-21 Graph Acceptance Is Not Execution Readiness

Decision: production scheduler graph acceptance cannot directly invoke a
worker node. Accepted graph nodes must pass through a generic runtime
readiness/transition engine before they can execute.

The Product/Spec proof for runtime job `native-exec-eb9bbce0b5e01416`
accepted an 8-node graph, then approved an `implementation` node while the
`context_supply` gate still had zero accepted target nodes. The worker adapter
then failed with `worker_adapter_threw:unclassified` before any role
invocation. That failure proves a generic orchestration boundary bug: the
scheduler treated a work-intent graph as an executable worker graph.

Consequences:

- `scheduler.approve_and_run_first_node` must not remain a production bypass.
  It must be retired or converted into a fail-closed alias for opening an
  already executable frontier.
- graph acceptance, dependency readiness, context readiness, resource
  readiness, validation readiness, closeout readiness, and worker
  executability are separate lifecycle states.
- capability manifests must declare execution preconditions, including valid
  lifecycle phases, required context/resource packets, required snapshots,
  validation requirements, evidence expectations, and default repair
  transitions.
- missing preconditions create scheduler/readiness evidence and prerequisite
  nodes; they are not worker failures.
- Work Queue readback must show transition phase, blocker, next allowed
  transition, prerequisite nodes, and executable frontier.
- Product/Spec proof cannot rerun as a valid full proof until the
  `Runtime Node Readiness And Transition Engine` lane proves the latest
  failure class without invoking a worker.

Governing spec:
[Runtime Node Readiness And Transition Engine](/projects/execution-platform/specs/runtime-node-readiness-transition-engine).

## 2026-05-21 Product/Spec Replay Materializes Existing Graph Frontier

Decision: Product/Spec boundary replay at `after-graph-selection` must not ask
the orchestrator to plan another graph or rerun context scout. That boundary
means an executable graph frontier already exists, so replay materializes the
existing implementation-bearing nodes into `ImplementationContextPacket`,
file-resolved `ImplementationTaskPacket`s, `CodingResourcePacket`s,
`NodeExecutionPacket`s, target file snapshots/hashes, and canonical
`NodeReadinessState` refs before any worker invocation.

Full packet bodies are runtime artifacts, not graph node metadata. Graph node
metadata stores packet refs and compact readback summaries only. This preserves
the bounded-ref runtime contract, avoids metadata-cap failures, and prevents a
stale embedded packet body from becoming a second source of truth.

## 2026-05-20 Implementation Context Is A Runtime Boundary

Decision: coding implementation workers do not receive high-level scheduler
nodes directly. The runtime must first compile an `ImplementationContextPacket`
that resolves target refs, snapshots readable files, validates explicit
new-file intents against parent directory snapshots, records directory refs as
discovery seeds, and produces one or more `ImplementationTaskPacket`s.

Consequences:

- directory refs can guide discovery/splitting but cannot become executable
  patch targets.
- missing target refs, unreadable refs, blocking context limitations, missing
  validation plans, missing commitment mappings, and missing evidence
  expectations block worker invocation at the materialization boundary.
- Work Queue readback must show implementation-context packet refs, task
  packet refs, target snapshots, missing refs, directory blockers, readiness
  status, and repair action.
- scheduler repair should request semantic context/materialization repair
  intent; runtime owns packet ids, refs, hashes, schemas, storage flags, and
  executable readiness.

Governing spec:
[Model Task Classification And Resource Materialization](/projects/execution-platform/specs/model-task-classification-and-resource-materialization).

## 2026-05-20 Node Readiness Means Resource Readiness

Decision: scheduler-backed production execution cannot treat context freshness
or accepted context handoff as executable readiness. A node becomes executable
only after runtime materializes a canonical `NodeExecutionPacket` and the
domain resource packet required by that node.

Consequences:

- every model/provider/tool executor invocation must be preceded by a
  workflow-specific resource packet.
- coding implementation nodes require file refs, file snapshots, snapshot
  hashes, allowed edit scope, validation refs or validation discovery, and
  evidence-claim expectations.
- future non-coding nodes require equivalent domain packets such as research
  source refs, planning capsule refs, design asset refs, marketing source-fact
  refs, memory context pack refs, or QA command/result refs.
- context freshness, snapshot readiness, validation readiness, evidence
  readiness, and closeout readiness must be represented by one canonical
  `NodeReadinessState`; contradictory readiness reports are invalid.
- resource materialization is runtime-owned. Models may judge whether the
  materialized resources are semantically sufficient, but they do not invent
  snapshot hashes, executor refs, authority, storage flags, lifecycle state,
  or evidence enums.
- Product/Spec proof must replay the failed implementation-boundary class
  before another full top-of-pipe proof.

Governing spec:
[Model Task Classification And Resource Materialization](/projects/execution-platform/specs/model-task-classification-and-resource-materialization).

## 2026-05-20 High-Level Work Groups Are Not Executable Implementation Nodes

Decision: complex coding-team missions have a two-layer graph contract. The
scheduler may first compile high-level work-intent groups from accepted
Commitment Work Packets, but those groups cannot invoke implementation
workers until node-scoped context has been compiled into accepted
`ImplementationTaskPacket`s.

Consequences:

- Product/Spec Planning implementation proofs should not expect
  Product/Spec runtime nodes such as `planning_orchestrator` or
  `planning_capsule` to execute inside the `agent_team.coding` graph. The
  coding graph should instead create file-resolved coding tasks that build
  those primitives.
- directory-level target refs are valid context-discovery seeds but are not
  executable file-edit context.
- Kimi/Qwen/non-Codex implementation workers receive concrete file snapshots,
  allowed edit scope, expected patch shape, validation refs, and evidence
  expectations, or they are not invoked.
- broad work groups are split after context supply when they cross multiple
  files, directories, runtime surfaces, validation modes, or workflow
  primitives.
- implementation-readiness blocks caused by missing file snapshots or target
  refs are upstream task-compilation failures, not worker failures.
- Work Queue readback must distinguish draft work groups, context scout
  handoffs, implementation task packets, executable worker nodes, and
  validation/review/closeout nodes.

Governing spec:
[Post-Context Implementation Task Compiler](/projects/execution-platform/specs/post-context-implementation-task-compiler).

## 2026-05-20 Context Supply Follows Scheduler Work Units

Decision: complex implementation workflows should compile a draft work-intent
graph from accepted Commitment Work Packets before running repo context
scouts. Context scout runs per draft work node, not per high-level Mission
Ledger commitment, unless a workflow definition explicitly requires broad
discovery before work-unit decomposition.

Consequences:

- commitments remain outcome/evidence obligations; they are not assumed to be
  executable work units.
- scheduler work-intent nodes define the context questions, downstream
  consumer, expected output, and readiness requirements that context scout
  must satisfy.
- context scouts may run in parallel across independent draft work nodes.
- implementation nodes cannot invoke worker/model adapters until their
  node-scoped context handoff passes implementation readiness.
- `accepted_with_limitations` context can advance planning and synthesis but
  cannot unlock affected implementation nodes unless the limitation is
  explicitly nonblocking for that node.
- global context synthesis is optional and triggered only for cross-node
  coordination needs such as target overlap, conflicting scouts, shared
  dependencies, integration order, or validation-plan conflicts.
- the old mandatory
  `commitment packets -> per-commitment context scout -> global synthesis -> scheduler graph`
  path is retired from production defaults and may survive only as an
  explicitly labeled diagnostic or workflow-definition-specific exception.

## 2026-05-19 Fallback Retirement Includes Canonical-Path Refactor

Decision: the `Fallback And Compatibility Retirement` queue item is not only
cleanup. It must include a bounded production-path refactor that removes
reachable retired runners, proof pilots, degraded closeout paths, and stale
type-contract drift before Product/Spec Planning can be a valid proof.

Implementation update: production workflow dispatch now goes through
`ProductionWorkflowExecutionFactory`; non-agent-team workflow jobs use the
canonical workflow runtime or fail closed; the old generic queued workflow
runner, its tests, and its retirement proof have been deleted. The public
runtime barrel exports `CodingTeamRuntimeJobRunner` and the old
`AgentTeamQueuedRunner` compatibility alias has been deleted; retired proof
scripts/tests and their support modules were removed rather than hidden behind
test-only imports; the legacy semantic intent router is no longer a
free-form-submit fallback; generated debug/proof Work Queue rows are archived
through lifecycle reconciliation; and `pnpm tsgo:fast` is a passing gate again.

Consequences:

- production workflow execution should enter through one canonical factory or
  fail-closed diagnostic path.
- queued runners, static single-job role sequences, patch-JSON adapters, and
  legacy proof pilots must not be public production options.
- degraded/system closeout remains diagnostic-only and cannot satisfy
  workflow success, Work Queue closeout, or evidence profile acceptance.
- compatibility readback maps must be derived from canonical registries.
- proof and replay harnesses remain useful, but lifecycle closeout must happen
  only through accepted runtime closeout/control APIs.
- `pnpm tsgo:fast` must stop carrying the workflow-definition/
  evidence-profile exception; full TypeScript validation is part of this
  retirement pass.

## 2026-05-19 Compound Coding Tools Are Runtime Operations, Not Parser Shortcuts

Decision: non-Codex workers may use model-selected compound coding tools for
common scoped implementation tasks, but compound tools are first-class Runtime
Tool Kernel operations and must preserve the same runtime-truth boundary as
atomic tools.

Consequences:

- models choose the compound tool and semantic edit intent.
- runtime owns refs, allowed file scope, edit transaction ids, patch
  application, validation execution, evidence refs, repair classification,
  storage flags, and lifecycle.
- compound success requires changed-file refs, validation refs, evidence
  claims, and a closed edit transaction.
- compound failures are `needs_review` with repair classification refs, not
  hidden retries or fake implementation evidence.
- Work Queue readback must surface compound tool id and internal sub-event
  phases so owners can see the worker's current operation without raw
  transcripts or logs.

## 2026-05-19 Coding Executor Capability Leap Requires Code Intelligence Before Product/Spec Proof

Decision: before the next Product/Spec Planning production proof, the coding
executor team must close the largest remaining coding-harness gaps identified
by the Codex, Claude Code, and OpenCode comparison. The governing spec is
[Coding Executor Team Capability Leap](/projects/execution-platform/specs/coding-executor-team-capability-leap).

Consequences:

- LSP/Tree-sitter-backed code intelligence becomes a shared runtime service
  for context scout, scheduler, workers, validation, review, and closeout.
- Context scout must run as a real tool loop over code intelligence and prompt
  excerpts; runtime-supplied refs alone are not clean context success.
- Context synthesis is a required barrier before complex implementation graph
  selection, and the scheduler must receive synthesis substance, not only an
  artifact ref.
- Worker-internal model/tool phases must emit operator-visible spans.
- Non-Codex workers need traceable compound coding tools so cheaper models can
  execute scoped tasks without brittle low-level choreography.
- Remaining fallback/proof/compatibility execution paths must be removed from
  production success before the Product/Spec proof can count.
- Product/Spec Planning remains the near-term proof, but it follows these
  coding-harness capability-leap blockers in the DB Work Queue.

## 2026-05-19 Worker-Internal Progress Is Owner-Facing Runtime Evidence

Decision: non-Codex worker loops must emit bounded worker-internal progress
that survives into scheduler progress, RuntimeExecutionSpan summaries, and
Work Queue active graph readback. Node-level progress alone is not sufficient
for long model/tool/edit/validation loops.

Consequences:

- controller model turns, selected tool calls, validation, repair, stale
  context refresh, evidence handoff, provider no-content, and timeout
  boundaries expose packet/context/code-intelligence refs, active tool/status,
  validation command, edit transaction state, output hash/content length,
  provider latency/timeout/finish/token diagnostics, blocker, and next
  decision.
- Work Queue readback has a `workerInternal` block so operators can inspect
  what a non-Codex worker is doing without raw transcript or raw log storage.
- bounded model-lane proof is required for this class of readback: a model
  must be able to reconstruct active worker state and next decision from the
  same readback shape the owner sees.
- raw prompts, raw responses, raw provider logs, raw tool logs, raw command
  logs, raw DB rows, secrets, and hidden reasoning remain prohibited.

## 2026-05-19 TypeScript Semantic Backend Is The First LSP-Parity Path

Decision: Code Intelligence semantic parity for the current OpenClaw repo is
served first by a TypeScript language-service backend behind the canonical
`code.*` Runtime Tool Kernel surface. A separate external JSON-RPC LSP fleet
remains a later multi-language extension, not a prerequisite for TS/JS
production semantic coverage.

Consequences:

- models keep using the same `code.*` tool IDs; runtime selects and records the
  semantic backend.
- backend/schema details are runtime-owned: backend id, health refs, workspace
  snapshot refs, diagnostic version refs, project config refs, fallback state,
  latency, result counts, and limitations.
- structural parsing remains available only as explicit degraded mode and
  cannot masquerade as semantic success.
- context scout, synthesis, implementation, validation, review, closeout, and
  Work Queue readback can all inspect whether semantic output was used,
  limited, stale, or unavailable.

## 2026-05-19 Repair Classification Gates Retry

Decision: production scheduler-backed workflows may not retry, repair,
escalate, or resume from a failed/needs-review node until runtime has recorded
a bounded repair classification tied to the failed node, runtime spans,
runtime tool refs, scheduler decision, affected commitments, and selected
repair boundary.

Consequences:

- blind same-kind retry is structurally invalid for needs-review nodes.
- worker-internal retry loops are covered by the same invariant. A worker may
  not silently retry validation repair, stale patch repair, provider
  no-content, timeout, or adapter-contract choke as private control flow
  without a bounded repair classification and retry-gate decision.
- runtime-owned classification validates schema, refs, storage flags, and
  lifecycle safety; semantic sufficiency remains a model/orchestrator judgment
  on the next decision.
- context, packet, graph, validation, provider, worker, evidence, and closeout
  failures route to the boundary that can actually repair the blocker instead
  of defaulting to implementation or closeout churn.
- Work Queue readback must show the latest repair class, failed boundary,
  selected repair boundary, repair strategy, affected commitment ids, failed
  field paths, and expected next action.
- worker result/readback contracts must carry repair classification refs and
  summaries so the operator can see why a retry happened before the scheduler
  receives the final node result.

## 2026-05-19 Runtime Execution Spans Are Production Evidence

Decision: scheduler-backed production workflows must emit bounded
`RuntimeExecutionSpan` evidence across model calls, runtime tools, worker
phases, scheduler decisions, graph nodes, validation commands, edit
transactions, repair, replay, and closeout.

Consequences:

- Work Queue readback must show active/recent/stale/blocked span state with
  model/tool/worker refs, objective, input/output/evidence refs, blocker,
  next action, and ELI5.
- Runtime Tool-Call Kernel and RuntimeWorkerSupervisor contribute span
  metadata/events without becoming separate lifecycle truth sources.
- Closeout finalization evidence packets require runtime execution span refs;
  missing span coverage is needs-review evidence, not clean success.
- Span metadata remains bounded and carries raw-storage false flags. Raw
  prompts, raw responses, raw provider logs, raw tool logs, raw command logs,
  raw DB rows, and secrets are never span payloads.

## 2026-05-19 Worker Execution Requires Fresh Runtime Context Snapshots

Decision: production scheduler-backed workflows must treat worker-facing
context as runtime evidence, not incidental prompt text. Worker nodes that
depend on context must carry bounded `ContextSnapshotRef` inputs and cannot
invoke model/provider adapters when required context snapshots are missing,
stale, rejected, or unknown.

Consequences:

- source prompt indexes/excerpts, Commitment Work Packets, context scout
  handoffs, context synthesis artifacts, file snapshots, validation results,
  boundary replay checkpoints, and future memory context packs all share the
  same bounded snapshot contract.
- runtime code validates snapshot shape, refs, freshness, prompt hash, payload
  hash, repo/worktree identity, and staleness policy. Models judge semantic
  sufficiency but do not own snapshot schema or lifecycle.
- implementation, validation, repair, review, docs/planning, and closeout
  style nodes block before provider invocation when their context snapshots
  are not fresh enough.
- Work Queue readback must distinguish context insufficiency from model
  failure and show refresh action, snapshot refs, stale/missing/rejected refs,
  current phase, and owner-readable blocker summaries.

## 2026-05-19 Non-Codex Workers Use Split Controller Author Applicator Phases

Decision: production non-Codex file-edit workers must run through explicit
controller, author, runtime-applicator, validation/repair, evidence, and
escalation phases. The production file-edit adapter enables strict phase
authority so controller/context slots cannot apply source edits directly.

Consequences:

- controller/context model turns may select next work, request bounded context,
  or escalate, but cannot mutate files.
- patch-author turns write bounded edit plans/content only; runtime applicator
  phases apply through `EditTransactionEngine`.
- validation repair and evidence authoring are separate phases with their own
  model slots and refs.
- worker phase refs/records are runtime evidence and must appear in scheduler
  progress, adapter diagnostics, and Work Queue readback.
- low-level diagnostic tests may exercise raw tool mechanics, but production
  adapter execution uses strict phase authority.

## 2026-05-19 Non-Codex Edits Require Edit Transactions

Decision: production non-Codex file-edit workers must mutate repository files
through `EditTransactionEngine`. Runtime owns transaction ids, scope,
snapshots, apply, conflict diagnostics, validation linkage, rollback/discard,
evidence refs, raw-storage flags, and close state. Models author semantic edit
intent, patch content, repair rationale, and evidence summaries only.

Consequences:

- changed-file refs without a closed edit transaction cannot produce clean
  production success.
- natural-language "I edited" claims and giant patch-proposal JSON remain
  insufficient as production evidence.
- validation failures may repair inside the same transaction; structural
  failures can be rolled back from transaction snapshots.
- Work Queue readback and scheduler progress must surface transaction refs,
  phase/status, files touched, validation refs, repair count, evidence refs,
  and blockers.
- future non-Codex test/docs/frontend workers should reuse the same
  transaction boundary instead of creating parallel file mutation paths.

## 2026-05-19 Non-Codex Worker Model Slots

Decision: Non-Codex implementation workers use explicit per-turn model slots,
not one model/profile for the whole tool loop. Qwen3-Coder-Next is the cheap
controller/context/validation-repair/evidence/escalation lane. Kimi K2.6 is
the scoped patch lane with `reasoningMode: none`.

Consequences:

- Kimi patch/worker turns must not use `reasoningMode: omit` in production
  worker paths.
- Patch generation remains Kimi until another model passes the patch
  generation gate; Qwen may control and repair the loop before router or
  context-scout defaults are promoted.
- The capability manifest must expose the split policy so the scheduler can
  reason about cost and model fit without defaulting every worker turn to the
  strongest model.
- Per-stage latency and valid-output benchmarks are required before promoting
  Qwen to router or context-scout defaults.

## 2026-05-18 Non-Codex Implementation Requires Runtime Tools

Decision: Kimi and future non-Codex implementation workers must use a
model-agnostic runtime tool worker for production file-edit work. A giant
model-authored JSON patch proposal is test/compat only and cannot satisfy
production implementation evidence, Mission Ledger commitments, Work Queue
closeout, or clean workflow success.

Consequences:

- models choose semantic next actions, edit intent, repair strategy,
  sufficiency, and escalation rationale.
- runtime owns file reads/writes, patch application, validation execution,
  refs, schemas, evidence classes, persistence, budgets, locks, lifecycle,
  authority, and raw-storage policy.
- provider/model profiles require qualification evidence before scheduler
  selection for production implementation capabilities.
- Work Queue readback must expose worker tool progress, context requests, edit
  plans, patch results, validation state, repairs, evidence claims, and
  escalation reasons.
- broad Codex escalation remains available, but must record why cheaper or
  specialized qualified workers were unsuitable for the scoped task.

## 2026-05-19 Provider Capability Profiles Are Runtime Selection Truth

Decision: Provider Capability Profiles are the canonical production runtime
truth for scheduler worker/model selection. They are derived from the Runtime
Node Capability Manifest and are not a second model-authored schema.

Consequences:

- the model selects semantic capability/profile fit and rationale.
- runtime derives executable node kind, executor key, worker ref, required
  metadata schema, evidence kinds, budget, allowed tools, qualification gates,
  and raw-storage policy.
- production selection rejects missing, workflow-invalid, diagnostic-only,
  contract-only, or unqualified profiles.
- broad Codex/GPT-5.5 implementation remains available as premium escalation,
  but profile-backed cost/quality justification is required when cheaper
  qualified workers exist.
- Work Queue readback must expose selected profile id, worker ref, role class,
  cost/latency class, context capacity, qualification refs, considered profile
  ids, and why cheaper profiles were rejected.

## 2026-05-18 Product/Spec Planning Is Native To Generic Orchestration

Decision: Product/Spec Planning technical specs must describe
`agent_team.product_spec_planning` as a production workflow plugin on the
generic orchestration runtime, not as a bespoke scheduler path, queued-runner
contract facade, or Product/Spec-specific compatibility lane.

Consequences:

- Product/Spec execution requires WorkflowDefinition/plugin readiness,
  GenericOrchestrationRuntime, Runtime Work Graph scheduler, Runtime
  Tool-Call Kernel traces, Mission Ledger, Commitment Work Packets, Context
  Supply Chain, staged scheduler protocol, generic node execution/evidence
  claims, workflow evidence profile, model-authored closeout, completion
  review, and Work Queue readback.
- Product/Spec can be an executor workflow for planning/spec/capsule/proposal
  work or a target subject for coding-team implementation work. Routing owns
  this executor/subject split; the scheduler must not rediscover it through
  Product/Spec-specific keyword rules.
- deleted generic queued-runner and facade compatibility docs are historical
  only for Product/Spec; production Product/Spec execution must be
  scheduler-backed and cannot rely on a generic queued fallback.
- ActionGraphProposal remains proposal authority only. Child runtime jobs or
  human tasks require a later explicit compile/authority boundary.
- Product/Spec proof evaluation follows the checkpointed generic runtime
  ladder, including source-prompt parity, packet quality, context supply,
  context synthesis, staged graph compile, node execution, validation/repair,
  closeout, and boundary replay.

## 2026-05-17 Long Tasks Need Explicit Runtime Budgets And Live Progress

Decision: Product/Spec-class and other long-running workflow nodes must not
inherit tiny/default runtime-tool windows. Runtime task budgets are
workflow/capability/node policy objects that feed scheduler runtime tools,
worker invocation, timeout/abort behavior, lease/heartbeat windows, and Work
Queue active readback.

Consequences:

- budget classes are explicit: `tiny`, `standard`, `complex`, and
  `long_running`.
- Product/Spec Planning `planning_orchestrator` work derives a
  `long_running` budget with a one-hour runtime tool/model-call window.
- scheduler progress events and Work Queue readback expose budget policy ref,
  budget class, timeout windows, progress interval, stale-progress window,
  lease timeout, heartbeat interval, elapsed time, remaining time, and
  heartbeat state.
- timeout/abort is Runtime Tool-Call Kernel evidence. It is recorded as
  bounded failed tool evidence and cannot be mistaken for clean process
  success.
- readback must be bounded and recent-run focused so proof retries do not make
  the operator stare at stale or latency-heavy state.

## 2026-05-17 Context Scout Requires Accepted Tool-Loop Evidence

Decision: production implementation nodes that require upstream context may
not run from generic context summaries or legacy context-scout pilot
artifacts. They require an accepted `ContextScoutToolLoopRun` with verified
file refs, runtime tool invocation refs, a sufficiency review, and a context
handoff packet ref.

Consequences:

- context scout is a first-class Runtime Tool-Call Kernel surface through
  `context_scout.tool_loop`.
- model-authored context scout output judges usefulness and sufficiency;
  runtime validates refs, storage flags, bounds, handoff presence, and whether
  sufficiency was accepted.
- Work Queue readback must show context scout loop refs, tool refs,
  sufficiency summary, verified/rejected refs, handoff refs, and blockers.
- legacy `agent_team.context_scout` artifacts remain diagnostic-only and do
  not count as production success evidence.

## 2026-05-19 Context Scout Repo-Analysis Tools And Synthesis Barrier

Decision: context scout must be a repository-analysis worker with canonical
tool traces and synthesis-ready handoff evidence. A scout cannot count as
production-ready context merely because runtime discovered file refs.

Consequences:

- production context scout paths emit first-class repo-analysis runtime tools:
  `repo.search`, `repo.list_files`, `file.read`, `file.inspect_symbols`,
  `test.find_related`, `context.handoff`, `context.limitations`,
  `context.evidence_claim`, and `context.request_more_context`.
- model-authored scout output remains responsible for semantic usefulness:
  existing patterns, risks, edit points, validation suggestions, and bounded
  handoff summaries. Runtime owns refs, bounds, storage flags, tool traces,
  and synthesis readiness metadata.
- `ContextHandoffPacket` is the handoff contract for both implementation and
  synthesis. It carries commitment packet refs, prompt excerpt refs, symbol
  refs, test refs, synthesis summaries, and context evidence refs.
- parallel context scout replay must materialize the graph shape it is
  proving: per-packet scout nodes, a context synthesis barrier, and
  `context_supplies` edges. A set of scout nodes with no synthesis join is
  incomplete graph evidence.
- Work Queue readback must show scout synthesis readiness and blockers, not
  only lifecycle status.

## 2026-05-19 Context Synthesis Is A Scheduler Handoff Contract

Decision: accepted context synthesis is a production scheduler handoff
contract, not a short artifact ref or summary. It is the required barrier
between per-commitment context scout fanout and downstream implementation
graph compilation for complex coding-team work.

Consequences:

- context synthesis must carry implementation groups, file ownership,
  cheaper-worker suitability, Codex escalation rationale, expected outputs,
  evidence-claim expectations, validation needs, review needs, risks,
  integration requirements, dependency or explicit parallelism, and
  worker-fit summary before implementation selection.
- runtime owns source context refs, snapshot freshness, storage flags,
  bounds, and graph compilation; the model owns semantic grouping,
  readiness, worker fit, risks, and human-readable handoff judgment.
- if the model omits runtime-owned context snapshot refs, normalization
  preserves the runtime-provided fresh refs instead of losing provenance.
- Work Queue readback must expose active context synthesis status and
  graph-compile readiness, not just a generic active node.
- a bounded model lane is required before closing this unit so the contract is
  proven model-usable, not only fixture-usable.

## 2026-05-17 Architecture Red-Team Gate Before Major Proofs

Decision: OpenClaw should use a reusable Architecture Red-Team And Research
Gate before expensive proof runs, new workflow families, major
model/runtime/tool contract changes, and repeated failure loops.

Implementation status: completed as first-class workflow
`agent_team.architecture_red_team` on 2026-05-17. The DB Work Queue item
`openclaw-convergence.architecture-red-team-research-gate` closed from
accepted runtime closeout evidence.

Consequences:

- long-form live UX/runtime proofs require a Level 2 formal red-team gate.
- new workflow/team families or repeated systemic failures require a Level 3
  architecture reset review.
- P0 risks block major proofs unless explicitly accepted by the owner.
- research informs architecture; it does not count as proof.
- the gate must not execute the target proof unless separately authorized.

## 2026-05-17 Validation And QA Are Runtime Tool Operations

Decision: production validation and QA must produce bounded Runtime Tool-Call
Kernel traces and evidence packets before they can count toward clean workflow
success.

Consequences:

- models may author validation plans, classify failures, judge coverage, judge
  evidence sufficiency, and propose repairs.
- runtime owns approved command refs, command execution boundaries, result
  refs, tool invocation refs, evidence packet shape, raw-storage flags, and
  Work Queue readback.
- accepted validation evidence requires validation refs plus runtime tool
  invocation refs.
- failed validation becomes scheduler repair input with bounded failure and
  repair refs.
- missing validation/QA runtime tools in production is `needs_review`, not a
  fallback success path.

## 2026-05-17 Proactive model-heavy hardening uses staged tools and runtime compilers

Decision: router/front door, validation/QA, closeout/finalization, Work Queue
human tasks, Model Memory, retrieval, context packs, proactivity, and future
workflow families must follow the same boundary now enforced in generic
orchestration: models author semantic intent, rationale, usefulness, and
sufficiency judgments; runtime compiles canonical schema, ids, refs, storage
flags, authority boundaries, lifecycle state, DB writes, and tool traces.

Consequences:

- the router stays thin and stops acting as a semantic safety/compiler layer.
- safety-boundary language such as "do not deploy" moves to Mission
  Ledger/compile boundaries unless the primary requested outcome is
  prohibited.
- validation failures become scheduler repair evidence when recoverable,
  rather than terminal process failure.
- closeout finalization requires evidence packets, Mission Ledger status,
  workflow evidence profile state, runtime tool traces, Work Queue readback,
  model-authored Closeout Capsule, and model-authored maximality review.
- Model Memory capture/retrieval/context/proactivity must use staged tools
  and runtime-owned write/context/Work Queue refs before being called
  production-primary.
- deterministic code may validate shape, refs, bounds, idempotency, cooldowns,
  storage, authority, and lifecycle separation, but must not judge memory
  worthiness, retrieval usefulness, opportunity quality, or work sufficiency.
- the Work Queue has been reprioritized so router, validation/QA, and closeout
  hardening run before the next Product/Spec Planning live proof.

## 2026-05-17 Node execution success requires canonical evidence claims

Decision: production scheduler nodes cannot claim success from worker process
completion, generic artifact refs, role reports, or degraded placeholders.
Every production node result must compile into the canonical generic node
execution result contract and, when the workflow/mission requires evidence,
must carry commitment-mapped evidence claims.

Consequences:

- runtime owns node execution ids, evidence claim ids, executor refs, worker
  refs, storage flags, authority flags, lifecycle flags, and evidence refs.
- workers/models may author bounded claim summaries, limitations, and
  qualitative self-reports, but they do not grant authority or lifecycle
  success.
- Mission Ledger closure receives explicit evidence claims; generic artifacts
  do not imply commitment closure.
- workflow evidence profiles can be evaluated from canonical node evidence.
- Work Queue readback must show structured evidence claims in owner-readable
  form.
- any production path that succeeds without canonical node evidence is a
  regression.

## 2026-05-17 Production workflow graph creation must use the generic staged scheduler protocol

Decision: production workflow plugins cannot create executable graph nodes
from model-authored node envelopes. Complex production graph creation must use
the generic staged scheduler protocol, where the model authors work units,
capability selections, node contracts, and edge/parallelism rationale while
runtime derives node ids, node kinds, executor keys, worker refs,
qualification refs, expected evidence, storage flags, and lifecycle metadata.

Consequences:

- production plugins must declare staged protocol readiness and simple-only
  direct implementation first-move policy.
- generic runtime scheduler execution must explicitly opt into staged protocol
  requirements.
- scheduler validation rejects production node creation that bypasses runtime
  compilation or asks models to provide runtime-owned expected-evidence enums.
- graph structure requires edges or explicit parallel-independent rationale.
- Work Queue readback must expose the staged scheduler policy so owners can
  see whether a workflow is running through the canonical path.
- legacy/proof fixtures must be updated to staged intent instead of weakening
  production gates.

## 2026-05-17 Generic orchestration runtime is the production execution spine

Decision: scheduler-backed production workflows must execute through
`GenericOrchestrationRuntime`, not through workflow-specific runner brains or
proof-only harnesses.

Consequences:

- the generic runtime validates WorkflowDefinition and WorkflowPlugin
  readiness before scheduler execution.
- Runtime Tool-Call Kernel availability is required for production workflows.
- scheduler success without graph evidence is `needs_review`, not success.
- Work Queue readback must surface generic runtime status and graph evidence.
- `RuntimeWorkflowGraphEngine` remains a readiness resolver inside the generic
  runtime; it is not a second execution brain.
- workflow-specific code should move toward plugins, node executors, evidence
  profiles, and readback projections under this runtime boundary.

## 2026-05-16 Maximum toolification is a staged working interface, not trace-only JSON

Decision: complex workflow orchestration must stop asking a model to produce
one executable graph JSON object. Runtime Tool Kernel traces are necessary but
not sufficient; the model must work through narrow typed scheduler tools and
the runtime must compile canonical graph envelopes.

Consequences:

- Mission Ledger remains Phase A because it is well-shaped.
- complex graph creation is split into work breakdown, capability selection,
  node contract definition, edge/parallelism definition, runtime graph
  compilation, structure review, validation/acceptance, and first-node
  execution.
- the model owns intent, rationale, work units, capability choices,
  human-readable expected outputs, success criteria, downstream consumers, and
  semantic quality review.
- runtime owns node ids, node kinds, executor keys, worker refs, expected
  evidence enums, trace ids, storage flags, authority flags, lifecycle state,
  and Work Queue child materialization.
- the next Product/Spec Planning proof is blocked until
  `agent_team.coding` uses this staged scheduler protocol in production.
- the source-of-truth spec is
  `specs/maximum-toolification-architecture.md`.

## 2026-05-16 Maximum toolification applies to every model/workflow contract

Decision: the staged-tool principle applies beyond the scheduler. Router,
Mission Ledger, capability policy, worker/file-edit adapters, validation/QA,
closeout, Work Queue/human tasks, Model Memory/proactivity, research,
docs/skills, QA/test, architecture/spec, and gateway/background work must all
avoid asking models to hand-author runtime-owned schema fields.

Consequences:

- each surface gets typed runtime tools or staged compiler phases where the
  model authors intent/rationale/judgment and runtime compiles canonical ids,
  refs, evidence enums, storage flags, lifecycle, authority, and traces.
- strict JSON can remain an interchange format for a narrow tool call, but it
  is not by itself a sufficient working interface for compound work.
- Work Queue items have been added for each maximum-toolification surface so
  these improvements do not disappear after Product/Spec Planning.
- Product/Spec Planning remains the near-term proof objective, but the staged
  scheduler protocol is the immediate pre-proof blocker.

## 2026-05-16 Background heartbeat must yield to active owner turns

Decision: heartbeat/proactivity is background work and must not start when the
target base session has accepted owner work in flight, even if command queues
are temporarily empty.

Consequences:

- `chat.send` marks an owner turn active as soon as it accepts the turn.
- heartbeat preflight checks owner-turn activity for the resolved base session
  and skips with `owner-turn-in-flight`.
- isolated `:heartbeat` sibling sessions still yield to the base owner turn.
- abort, completion, and error clear the activity record.
- TTL cleanup prevents stale activity from suppressing background work forever.

## 2026-05-16 Long prompt UX submission is byte transport, not source code

Decision: live UX proof submissions should use file/stdin prompt transport
instead of embedding prompt text in shell commands, JavaScript template
strings, or heredocs that can reinterpret prompt examples.

Consequences:

- long prompts with code fences, template-string backticks, `${...}` examples,
  shell snippets, and quotes are treated as UTF-8 data.
- `scripts/openclaw-submit-prompt-via-ux.mjs --prompt-file <path>` or
  `--stdin` is the preferred operator submission path for long proofs.
- bounded artifacts record prompt hash, length, source kind, run refs, and
  completion evidence only.
- raw prompts, raw responses, and raw transcripts are not stored in proof
  artifacts.

## 2026-05-16 Models choose work; runtime owns runtime schema

Decision: scheduler/model contracts must not ask models to invent
runtime-owned fields when the runtime already has the source of truth.

Consequences:

- models provide objective, role rationale, selected capability, commitment
  mapping, expected human-readable output, success criteria, cost/utility
  rationale, and stop/escalation condition.
- deterministic runtime code compiles canonical node envelopes, executor refs,
  runtime ids, expected evidence, storage flags, and authority boundaries.
- fields such as graph node kind, executor key, worker ref, expected-evidence
  enums, and decision ids are derived from the capability manifest, Mission
  Ledger, workflow evidence profile, and runtime graph state.
- repair requests should be field-specific and preserve accepted fields.

## 2026-05-16 Parallelism is a runtime lane/graph policy, not a routing workaround

Decision: the next Product/Spec Planning proof should not wait for parallelism,
but OpenClaw needs a first-class parallelism architecture immediately after
that proof.

Consequences:

- prompt-file UX submission is equivalent at the browser/chat transport layer:
  the file bytes are filled into the same operator textarea and submitted with
  the same send/queue button as manual UX input. Before the next long proof,
  run a short rebuild-time smoke that verifies dispatch/run evidence and prompt
  hash match.
- the current owner-turn heartbeat guard is intentionally conservative:
  heartbeat/proactivity skips while accepted owner work is active on the base
  session or isolated heartbeat sibling. This protects the next proof, but it
  is not the final concurrency model.
- the final model is lane/conflict-domain scheduling: owner turns,
  heartbeat/proactivity, workflow jobs, human resumes, memory writes, and
  validation jobs can run concurrently only when their write surfaces and
  leases do not conflict.
- inside one runtime effort, graph execution should support fan-out/fan-in
  parallel child nodes, join semantics, retry-only-failed-branch behavior,
  per-provider/model concurrency limits, file-scope locks, and Work Queue
  visibility.
- every production model/tool contract needs an explicit compiler boundary:
  model-owned fields are task intent and rationale; runtime-owned fields are
  ids, executor refs, evidence enums, storage flags, authority, lifecycle, and
  trace refs.

The source-of-truth follow-up spec is
`specs/runtime-parallelism-and-contract-boundaries.md`.

## 2026-05-16 Routing separates executor workflow from target subject

Decision: intent routing must not use one `workflowId` to mean both "who does
the work" and "what the work is about."

Consequences:

- router output includes `executorWorkflowId`, `subjectWorkflowIds`,
  `targetSubjectRefs`, `requestedCapabilities`, and `constraints`.
- `workflowId` is a compatibility alias for `executorWorkflowId`; conflicting
  values are invalid.
- workflow contracts expose executable capability summaries. The validator
  checks that the executor workflow can perform the requested capability
  classes without making semantic quality judgments.
- a prompt like "implement Product/Spec Planning" should select an executor
  workflow with code-edit/test/docs/review authority and preserve Product/Spec
  Planning as the target subject.
- safety constraints such as "do not deploy" or "do not store raw logs" are
  carried as constraints for Mission Ledger/compile boundaries. They are not
  route blockers unless the primary requested outcome is itself prohibited.
- native submit may repair an executor/capability mismatch once by asking the
  model to reselect the executor while preserving subject and constraints.
- Work Queue readback must show executor, subject, requested capabilities, and
  constraints so owner diagnostics are human-readable.

This is the generic replacement for the previous fragile edge case where
Product/Spec Planning was selected as the executor for work that was actually
about implementing Product/Spec Planning.

## 2026-05-16 Generated Work Queue children need explicit lifecycle policy

Decision: generated proof diagnostics, middleware fixtures, and runtime graph
children must carry explicit origin and terminal-policy metadata. They cannot
be treated as ordinary owner-planned Work Queue items by default.

Consequences:

- proof scripts must create diagnostic children through a generated-item API,
  not raw `createWorkItem(...)`.
- generated children must declare origin, parent item, runtime job refs where
  available, terminal policy, retention policy, and raw-storage flags.
- failed proof diagnostics and middleware fixtures archive into debug evidence
  instead of remaining in the owner active queue as `needs_review`.
- failed real owner-planned child work remains owner-visible `needs_review`.
- accepted parent closeout reconciles generated children according to terminal
  policy.
- default active queue/readback excludes debug-only generated proof rows, while
  admin/debug readback can still inspect them.
- Product/Spec Planning should not be rerun as the next proof until this
  lifecycle cleanup lands, because otherwise proof-generated children can keep
  drifting the active queue.

Implementation update: this cleanup has landed. `WorkQueueRepository` now has
a generated-item creation path, runtime graph children carry generated
lifecycle metadata, middleware fixture/proof diagnostic creators use
debug-only generated lifecycle metadata, default active/readback queries hide
debug-only generated items, and terminal projection reconciliation archives
debug-only proof/helper items instead of leaving them as owner work. Live DB
cleanup archived 9 middleware fixture rows and 20 Generic Workflow Runner
proof diagnostic rows.

## 2026-05-16 Workflow evidence profiles gate production success

Decision: every production workflow must pass a workflow-specific evidence
profile before it can claim clean success. A model-authored closeout is
required but no longer sufficient by itself.

Consequences:

- `execution.workflow_evidence_profile_evaluation` is the canonical bounded
  artifact for workflow success/readback gating.
- deterministic code validates only shape, refs, required evidence classes,
  raw-storage flags, and whether model-authored closeout exists.
- model-authored review/closeout remains responsible for qualitative
  judgment.
- `agent_team.coding` success now requires runtime graph evidence, scheduler
  tool traces, worker tool traces, source-change refs, validation refs,
  review refs, Work Queue readback refs, and model-authored closeout.
- generic queued workflow dispatch cannot succeed from closeout alone.
- Work Queue readback must show profile id, status, accepted/missing evidence
  classes, reason codes, artifact refs, and deep-completion review
  requirements.

## 2026-05-16 Workflow execution converges on one canonical graph engine

Decision: OpenClaw workflow execution should have one durable runtime spine.
Workflow-specific behavior must be registered as workflow definitions/plugins
on that spine, not implemented as separate production runner brains.

Consequences:

- `RuntimeWorkerSupervisor` remains infrastructure only: claim jobs, renew
  leases, enforce timeout/cancel, invoke the selected adapter/engine, and
  terminalize from evidence. It must not own workflow semantics.
- `RuntimeWorkGraphScheduler` becomes or is wrapped by a canonical
  `RuntimeWorkflowGraphEngine` used by every production workflow.
- `DynamicAgentTeamGraphRunner` should be decomposed into the
  `agent_team.coding` workflow plugin: coding capability manifest, role
  coverage profile, node executors, validation profile, and closeout policy.
- the old generic workflow queued runner cannot remain a production,
  migration, or test-only execution path.
- `agent_team.product_spec_planning`, web research, docs/skills, QA/test, and
  architecture/spec review should register workflow definitions rather than
  relying on bespoke dispatcher code.
- Graph nodes are still executed by individual agents/workers/tools/human
  adapters. The scheduler coordinates and records evidence; it does not
  replace the agents.
- Proof scripts must be black-box production observers. They may submit
  through gateway/runtime APIs and inspect runtime evidence, but they must not
  execute private runner internals or fixture-only paths.
- Product/Spec Planning should run through OpenClaw only after the canonical
  workflow registry/engine path is in place and the generic production runner
  path cannot fake workflow success.

Implementation update: the first production step is complete. The workflow
definition registry, `RuntimeWorkflowGraphEngine`, and model-authored
completion-review gate now exist as runtime objects. Production
`agent_team.coding` resolves its definition and checks engine readiness before
scheduler execution. Generic queued workflow dispatch records definition
resolution and refuses scheduler-backed or migration-needed workflows instead
of claiming completion. Completion review is part of the closeout/finalization
flow, not a repeated prompt footer: deterministic runtime requires the review
object, evidence refs, and gate; the model-authored closeout/review judges
whether work was maximally complete.

## 2026-05-15 Capability selection is cost-aware utility scheduling

Decision: Runtime Work Graph scheduling must treat worker/model selection as a
model-authored utility decision, not a "pick the strongest model" default.

Consequences:

- capability manifest v2 is the scheduling substrate for coding-team and
  future workflow graph nodes.
- every production add/run/retry/repair decision can be required to include
  selected capability, executor, target commitments, utility rationale, cost
  rationale, duplicate-work rationale, expected evidence, downstream consumer,
  and stop/escalation condition.
- premium Codex/GPT 5.5 lanes require a bounded explanation when cheaper
  same-role capabilities exist.
- deterministic code validates shape, refs, executor mapping, storage flags,
  authority, budgets, and commitment ids; it does not judge semantic quality.
- Work Queue readback must show the capability/cost rationale so the owner can
  see why a node was selected.
- broad Codex monopoly is no longer an acceptable default for complex
  multi-commitment work.

## 2026-05-15 Runtime tool calls are first-class runtime evidence

Decision: runtime tool calls are durable, typed Execution Platform operations
with bounded traces in the dedicated runtime DB.

Consequences:

- tool definitions, invocations, events, and artifact refs are persisted under
  `execution_platform`.
- Runtime Work Graph node execution can be traced as `worker.invoke`.
- future scheduler, worker, Mission Ledger, memory, closeout, and Work Queue
  readback passes must consume this kernel instead of creating parallel
  progress/evidence stores.
- raw prompts, responses, transcripts, provider logs, tool logs, command logs,
  raw DB rows, secrets, and unbounded logs remain prohibited.

Follow-up hardening decision: the kernel owns timeout/abort enforcement,
explicit cancellation, terminal idempotency, cursor pagination, and scoped trace
retention. Downstream schedulers and worker loops should call these kernel
primitives instead of implementing parallel timeout, cancel, pagination, or
trace-pruning behavior.

## 2026-05-15 Dedicated Execution Platform runtime database

Decision: live Execution Platform runtime and Work Queue state should use a
dedicated `execution_platform` database resolved from
`config.env.vars.EXECUTION_PLATFORM_DATABASE_URL`.

Consequences:

- Model Memory database reuse is no longer the live Execution Platform
  boundary.
- the old shared-runtime approval flag is not needed for this configuration.
- Work Queue planning/readback rows were copied into the dedicated database as
  bounded metadata and refs only.
- runtime jobs remain lifecycle truth and Work Queue remains
  projection/readback/control.
- gateway restart for this boundary must preserve port, auth, pairing, device
  identity, and ACP endpoint.

## 2026-05-15 Toolified Runtime Scheduling Before Product/Spec Proof

Decision: the next Product/Spec Planning live UX proof is blocked until the
runtime graph layer is toolified enough to make delegation, evidence, utility,
and progress first-class runtime operations.

Consequences:

- graph planning and graph execution are separate phases.
- complex work cannot run implementation before accepted decomposition.
- model-selected capabilities compile into canonical executable nodes.
- node selection must account for cost, quality, context distribution,
  specialization, parallelism, redundancy, and commitment evidence needs.
- Codex/GPT 5.5 cannot monopolize multi-commitment work unless the
  orchestrator records why cheaper/specialized nodes are unsuitable.
- Kimi is one implementation lane on the Non-Codex File-Edit Worker Loop, not
  a broad patch oracle or a separate proof-only worker path.
- Production non-Codex child work must be selected through qualified
  task-family metadata and evidence refs. Complex coding missions may not
  silently fall back to broad Codex implementation as their first move.
- Capability executor keys are execution-routing truth for scheduler nodes;
  generic node-kind/role fallbacks may not hide that a specialized executor is
  unavailable.
- node outputs must claim Mission Ledger commitments; generic artifacts do not
  imply closure.
- Work Queue readback must surface tool/app-server progress and active graph
  state.
- finalization must terminalize quickly as `needs_review` when worker evidence
  cannot be mapped to commitments.

## 2026-05-15 Product/Spec Planning Is Scheduler-First

Decision: `agent_team.product_spec_planning` is first-class but scheduler-backed only.

Consequences:

- generic workflow execution must reject Product/Spec Planning instead of producing fake contract artifacts
- Runtime Work Graph scheduler must require `planning_orchestrator` before Product/Spec Planning child nodes execute
- Product/Spec Planning can propose ActionGraphProposal and compile-readiness artifacts, but cannot create or execute child runtime jobs itself
- human planning input is bounded decision evidence and does not grant authority or mutate lifecycle; readback must show pending, accepted, rejected, and not-required states rather than a generic present/missing flag
- Work Queue readback displays planning artifacts, bounded decision options, bounded Mission Ledger evidence state, and graph state while runtime jobs remain lifecycle truth
- final success needs model-authored closeout plus accepted runtime evidence, not degraded/system-only closeout

## 2026-05-17 Product/Spec Planning Production Plugin

Decision: Product/Spec Planning production readiness requires a canonical
workflow plugin, not just a workflow contract and scheduler guardrails.

Consequences:

- `agent_team.product_spec_planning` is `production_ready` and
  `productionEnabled` in the workflow definition registry.
- `workflow-plugin.agent_team.product_spec_planning.v1` is registered in the
  default workflow plugin registry.
- production readiness fails if planner, research, capsule, human-task,
  action-graph, compiler, or closeout executor keys are missing.
- generic queued workflow dispatch still rejects Product/Spec Planning; only
  the Runtime Workflow Graph Engine plus scheduler path can satisfy production
  readiness.
- child action proposals remain proposal-only until a later compile/authority
  boundary creates runtime jobs or human tasks.
- Work Queue owner readback must expose bounded evidence buckets for workflow
  registration, executable node mapping, orchestrator-first proof,
  compile-readiness validation, and Mission Ledger evidence claim refs instead
  of forcing owners to infer those claims from mixed diagnostic reason codes.

## 2026-05-16 Mission Ledger Closure Is Claim-First

Decision: Mission Ledger commitments close from explicit node-authored
evidence claims, not from generic artifact refs or process completion.

Consequences:

- production scheduler nodes that advance Mission Ledger commitments must
  return `evidenceClaims` naming the commitment id, evidence ref, evidence
  kind, bounded summary, limitations, and raw-storage flags.
- deterministic code validates claim shape, known commitment ids, existing
  refs, storage flags, and impossible claim kinds; it does not judge semantic
  sufficiency.
- the model-authored Mission Ledger evaluator receives claimed evidence refs
  as the only acceptable closure candidates.
- malformed evaluator output gets one bounded repair pass; persistent failure
  moves the job to `needs_review` with diagnostic evidence.
- Work Queue owner readback must expose evidence-claim refs and active
  graph/tool progress so the owner can see what evidence is expected,
  produced, accepted, and still open.

## 2026-05-17 Commitment Packets Are The Child-Worker Boundary

Decision: scheduler child delegation must be packet-backed. A Mission Ledger
commitment compiles into `CommitmentWorkPacket`; context scout output is
passed as `ContextHandoffPacket`; non-Codex file-edit workers receive
`ImplementationTaskPacket v3`.

Consequences:

- child agents receive exact objectives, commitment ids, target refs,
  validation refs, and acceptance criteria instead of only a shortened task
  summary.
- Kimi and other non-Codex file-edit workers are judged from packet-aware
  diagnostics: target refs present, acceptance criteria present, packet ref,
  JSON/diff/search-replace shape, context requests, schema state, and
  validation outcome.
- runtime derives/validates schema and storage boundaries; models judge
  usefulness and sufficiency.
- scheduler graph edge tool traces cannot precede successful DB edge
  persistence. Symbolic future milestones are stored as metadata; unknown
  accidental node refs are rejected before DB write.

## 2026-05-17 Product/Spec Proof Readback Must Be Node-First

Decision: owner-facing Product/Spec proof diagnostics must preserve the latest
active node and Mission Ledger detail even when later bookkeeping events are
recorded.

Consequences:

- `work_queue_child_sync` events must not erase the active node objective,
  rationale, model, target refs, and cost-aware decision from Work Queue
  readback.
- Mission Ledger commitments shown to the owner include why each commitment
  matters and the expected evidence description.
- commitment work packets are bounded owner-visible progress refs; they prove
  the scheduler compiled Mission Ledger commitments into child-worker packets
  without storing raw prompt or response text.
- direct replay harnesses must stream bounded progress snapshots while the
  runtime worker is active. A silent terminal-only harness is not acceptable
  for diagnosing long Product/Spec runs.
- GPT 5.5 via Codex is the default advanced front-door model for long
  Product/Spec prompts; cheaper triage may allow/escalate but should not be
  the final advanced adjudicator.

## 2026-05-17 Context Supply Must Be Sufficient Before Worker Delegation

Decision: every delegated worker must receive enough input to succeed. Mission
Ledger commitments may stay high-level, but worker handoff packets and context
handoffs must be model-authored, bounded, and specific before implementation
workers run.

Consequences:

- `CommitmentWorkPacket` includes commitment meaning, context request hints,
  required evidence-claim descriptions, stop-if-missing rules, and quality
  review refs.
- source prompts are exposed to child workers through a bounded section index,
  not raw prompt storage.
- context scout may request bounded source-prompt excerpts by section ref; the
  runtime provides or denies those excerpts through traced `source_prompt.*`
  tool calls.
- prompt excerpts are volatile model input only. Persistent evidence stores
  prompt hash, excerpt hash, refs, bounded summaries, and raw-storage flags.
- implementation workers that require upstream context handoff stop as
  `needs_review` when no `ContextHandoffPacket` exists.
- deterministic code validates refs, bounds, storage flags, and handoff
  presence; model-authored review still judges context usefulness.

## 2026-05-17 Orchestration Is A Generic Workflow Contract

Decision: coding-team orchestration improvements must live in canonical
workflow contracts, not only in `agent_team.coding` runner code.

Consequences:

- every workflow definition has a `WorkflowOrchestrationPolicy` covering
  required phases, required/optional role classes, context needs,
  source-prompt access, cost-aware capability policy, human decision policy,
  runtime tool families, finalization policy, and readback policy.
- model-authored workflow behavior remains responsible for judgment:
  commitments, work-packet quality, context usefulness, capability rationale,
  evidence sufficiency, and closeout maximality.
- deterministic runtime owns schema, refs, bounds, raw-storage flags,
  capability/node envelopes, executor coverage, and lifecycle authority.
- future design, marketing, research, QA, docs, architecture, and planning
  teams must use the same Mission Ledger -> CommitmentWorkPacket -> Context
  Handoff -> Staged Scheduler -> Node Executor -> Evidence Claim ->
  Model Closeout chain.
- workflows that are registered but not executor-migrated stay
  `registered_needs_executor_migration`; registry presence alone cannot create
  production success.
- scheduler node results are validated against a generic node-result contract
  so coding-only evidence assumptions do not leak into new workflow families.

## 2026-05-17 Generic Runtime Before Product/Spec Proof

Decision: build the generic orchestration runtime engine before the next
Product/Spec Planning proof.

Rationale:

- the previous pass created policy/contract substrate, not a complete generic
  runtime engine.
- Product/Spec Planning is the first serious non-coding workflow proof and
  should validate the generic runtime, not a Product/Spec-specific workaround.
- building every future workflow first would over-abstract without proof, but
  running Product/Spec before the engine exists risks repeating the same
  orchestration failures.

Consequences:

- the immediate queue becomes:
  1. Generic Orchestration Runtime Engine.
  2. Generic Staged Scheduler Protocol.
  3. Generic Node Executor And Evidence Claim Contract.
  4. Product/Spec Planning Workflow Plugin Production Proof.
  5. Starter Workflow Plugin Migration.
  6. Future Team Workflow Readiness.
- items 1-3 are pre-Product/Spec blockers.
- Product/Spec Planning remains the first live proof of the generic runtime
  spine.
- design, marketing, research, docs, QA, and architecture should inherit the
  runtime after Product/Spec proves the path.

## 2026-05-17 Closeout Finalization Gates Production Success

Decision: production workflow success requires accepted closeout finalization
evidence, not only scheduler completion or a Closeout Capsule.

Consequences:

- `closeout.finalize` is a Runtime Tool-Call Kernel family.
- production dynamic workflows must produce a bounded finalization evidence
  packet and accepted finalization tool ref before clean success.
- degraded/system closeout remains diagnostic-only.
- bare `create_closeout`, process completion, missing validation/profile/
  readback/tool refs, open blocking commitments, raw storage, and authority or
  lifecycle mutation cannot satisfy clean success.
- Work Queue readback must show finalization packet refs, handoff refs,
  accept/reject refs, missing reason codes, maximality, limitations, ELI5, and
  next action.

## 2026-05-20 Structured Adapter Owns Fast-Model Schema Boundaries

Decision: fast structured model calls run through a canonical Structured
Tool/Schema Adapter profile instead of ad hoc prompt/response mutation.

Rationale:

- Qwen/Kimi-class lanes are useful only when the runtime gives them small,
  typed contracts and keeps schema construction out of broad model judgment.
- no-content and schema failures must be diagnostic events with bounded retry
  policy, not hidden fallbacks that mutate response format, reasoning mode, or
  task scope.
- deterministic runtime owns provider profile gates, input/output bounds,
  timeout bounds, raw-storage flags, hashes, diagnostics, and field-specific
  repair envelopes.
- models still own semantic content, field values, and sufficiency judgment.

Consequences:

- `model.call` and OpenRouter role calls build `StructuredAdapterProviderProfile`
  records before provider invocation.
- preflight blocks invalid provider calls before spending tokens; it never
  truncates input.
- no-content retry repeats the same bounded task and escalates with explicit
  evidence when policy is exhausted.
- schema repair must cite missing field paths and preserve already accepted
  fields.
- Work Queue readback must show adapter profile, diagnostics, outcome, model
  task telemetry, and raw-storage flags.

## 2026-05-20 NodeReadinessState Is The Only Node Execution Readiness Source

Decision: production scheduler execution must use `NodeReadinessState` as the
canonical readiness object before worker invocation.

Rationale:

- prior proof failures showed contradictory state: context could be reported
  fresh while implementation target snapshots, validation refs, or execution
  packets were missing.
- readiness is a runtime substrate concern; models may judge usefulness, but
  runtime must decide whether executable resources, refs, authority, evidence
  expectations, and lifecycle transitions are present.
- missing resource packets need the same inspectable readiness shape as
  blocked resource packets, otherwise Work Queue readback and repair loops
  drift into opaque needs-review.

Consequences:

- context freshness never implies implementation readiness.
- accepted context never implies target snapshots.
- target snapshots never imply validation readiness.
- validation readiness never implies evidence closure.
- scheduler gates, runtime repair, replay harnesses, node metadata, and Work
  Queue readback must consume the same readiness state.
- `ready_with_limitations` is executable only when limitations are explicitly
  nonblocking.

## 2026-05-21 Executable Frontier Replaces Direct First-Node Approval

Decision: accepted runtime graph nodes must pass node transition readiness
before worker invocation. Direct production `approve_and_run_first_node`
semantics are retired in favor of executable-frontier evaluation, promotion,
and open tools.

Rationale:

- the Product/Spec proof showed that an accepted graph can still contain
  work-intent nodes with no accepted context supply and no resource packet.
- graph acceptance is not execution readiness; it is only the point where the
  runtime has a candidate work graph.
- missing context/resource preconditions are scheduler evidence and
  prerequisite work, not worker-adapter failures.

Consequences:

- `runAfterAdd`, direct `run_node`, closeout-node, and parallel-frontier paths
  all evaluate transition readiness before execution.
- missing context creates runtime-owned prerequisite nodes/edges through
  `scheduler.create_prerequisite_node` and
  `scheduler.link_prerequisite_to_target`.
- only nodes that pass dependency/context/resource checks are promoted with
  `scheduler.promote_work_intent_to_executable` and opened with
  `scheduler.open_executable_frontier`.
- `scheduler.approve_and_run_first_node` remains present only as a disabled
  historical tool id for old trace interpretation. It is not enabled as a
  production runtime operation and the scheduler path no longer uses it to
  authorize execution.

## 2026-05-21 Resource Boundary Failures Are Scheduler Evidence

Decision: resource materialization, context limitation, context repair edge,
and parallel frontier branch failures are scheduler-owned evidence, not
worker-adapter crashes.

Rationale:

- the latest Product/Spec checkpointed proof showed that an implementation
  context packet could exceed schema bounds and throw before any worker had a
  meaningful chance to execute.
- context handoffs marked `accepted_with_limitations` can be useful, but they
  are not clean implementation readiness unless the limitation is explicitly
  nonblocking for the exact consumer node.
- context repair nodes without consumer edges do not advance blocked
  implementation readiness.
- parallel supersteps must preserve per-branch outcomes; a single node-level
  schema/resource/context failure should not collapse the entire adapter
  result or erase sibling evidence.

Consequences:

- production resource compilers must safe-return structured readiness results
  such as `accepted`, `split_required`, `context_repair_required`, or
  `needs_review`; they must not throw opaque schema errors into worker
  execution.
- packet bounds must come from shared named constants used by compiler,
  schema, tests, and readback.
- runtime-only verified refs are limitation evidence, not clean context
  success.
- consumer-specific nonblocking waivers are required before
  `accepted_with_limitations` context unlocks an implementation/test/review
  worker.
- context repair and acquisition nodes need `context_supplies` consumer edges
  or diagnostic-only lifecycle.
- parallel frontier execution records one result per branch and uses
  branch-level repair classifications.
- Work Queue readback must surface schema path, exact bound, branch id,
  node id, limitation class, consumer edge state, and next legal transition.

## 2026-05-22 Runtime Artifact Contracts Own Storage Policy

Decision: production runtime artifact storage policy is owned by a typed
`RuntimeArtifactContractRegistry`, not by local attach calls or key-pattern
guards.

Rationale:

- large artifact bodies repeatedly found adjacent paths back to artifact
  metadata after the payload store was introduced;
- metadata limits are correct and should not be raised to hide storage-shape
  errors;
- graph-specific key guards are useful but too narrow to be the system-wide
  artifact boundary;
- the model/runtime boundary requires runtime-owned persistence, refs,
  bounded manifests, raw-storage flags, hydration, and lifecycle.

Consequences:

- body-bearing artifact types must be registered with `payload_required` or
  `payload_parts_required` policy;
- production code attaches registered artifacts through a contract-aware API
  that writes payload bodies and bounded metadata manifests;
- direct metadata bodies for registered artifact types are rejected before
  provider or proof time;
- replay and Work Queue readback hydrate through artifact contracts and
  payload refs;
- old metadata-body checkpoints may be read only through explicit legacy
  hydration diagnostics and may not become clean production success paths.

## 2026-05-22 Scheduler Runs Ready Frontiers Before More Graph Expansion

Decision: after graph/resource readiness exists, the scheduler must run legal
ready frontier work before creating or reusing more context/prerequisite graph
shape, unless a precise readiness blocker prevents execution.

Rationale:

- the latest Product/Spec proof produced many graph/progress artifacts and
  implementation task packets, but source edits never started;
- repeated context/prerequisite decisions can starve an executable frontier;
- reusing an existing node or edge is diagnostic information, not execution
  progress;
- Mission Ledger global evaluation is expensive and should be triggered by
  commitment-closing evidence, not every context-only event.

Consequences:

- executable frontier evaluation precedes context-supply expansion when ready
  nodes exist;
- reused-only node/edge decisions do not reset progress guards;
- repeated no-progress signatures halt as `needs_review` with a root-cause
  summary;
- context-only phases update readiness/context state and batch Mission Ledger
  evaluation unless explicit closure claims are present;
- Work Queue readback and latest-run-state must show active frontier,
  blocked frontier, no-progress reason, and next legal transition.

## 2026-05-22 Latest Run State Must Carry Active Frontier Truth

Decision: compact latest-run-state and Work Queue active graph readback must
surface branch-level frontier truth during long graph executions.

Rationale:

- artifact-rich proofs are not operator-readable when the current phase and
  blocker require scanning hundreds of artifacts;
- context compaction and operator reconnects must recover current node,
  branch, model/tool, blocker, readiness ref, token usage, and next action
  from a small durable state object;
- terminal or adapter outcomes must not be obscured by stale running/retry
  projections.

Consequences:

- latest-run-state gains `activeFrontier` with selected, running, completed,
  blocked, and needs-review node ids plus per-branch state;
- every major boundary writes compact state;
- Work Queue readback projects the same active frontier state;
- token/wall-clock data is present when available and explicitly labeled
  estimated/unavailable when not;
- readback cannot report generic running state when a precise schema,
  readiness, storage, or no-progress blocker is known.

## 2026-05-22 Large Graph Runtime State Is Payload-Backed And Manifest-Only

Decision: large graph scheduler/resource state must be stored as payload-backed
runtime artifacts plus bounded graph/readback manifests. Graph node metadata may
hold refs, counts, status, summaries, and a bounded reference sample, but it
may not hold full context snapshots, packets, resource materialization bodies,
or runtime results.

Rationale:

- the Product/Spec proof reached a large graph and failed when body-heavy
  runtime state exceeded artifact metadata limits;
- raising metadata limits would hide the broken boundary and make Work Queue
  readback slower and less trustworthy;
- `context_snapshot_ref` objects are legitimate bounded refs, but large arrays
  of them can still turn metadata into an accidental payload store;
- the live scheduler progress artifact is `agent_team.scheduler_progress`, so
  contract coverage must match the production artifact type rather than only a
  future canonical alias.

Consequences:

- implementation resource materialization results and node readiness states
  are registered as payload-required runtime artifact contracts;
- `agent_team.scheduler_progress` is a registered manifest-only contract;
- production runner writes resource materialization and readiness bodies
  through `attachRuntimeArtifactByContract(...)`;
- scheduler node metadata stores bounded upstream context snapshot samples plus
  counts/truncation flags;
- large graph proof must pass before Mission Ledger diagnostics and the next
  Product/Spec proof.

## 2026-05-22 Mission Ledger Stability Is Structural, Not Semantic-Forest Scored

Decision: pre-proof Mission Ledger and Commitment Work Packet stability
diagnostics compare repeated Product/Spec checkpoint runs with structural gates
and bounded provider diagnostics. Prose fingerprint drift is reported, but it
does not deterministically block the next proof by itself.

Rationale:

- repeated model runs can phrase equivalent commitments and packet objectives
  differently;
- treating fingerprint differences as semantic failure would recreate the same
  brittle deterministic value-judgment problem we have been removing from the
  router and scheduler;
- the actual pre-proof safety concerns are structural: changed mission gate,
  changed blocking commitment count, missing packet coverage, missing packet
  handoff fields, runtime boundary failure, or GPT rescue dependence;
- Qwen no-content retries without GPT rescue are provider variance, not hidden
  success and not automatic proof failure.

Consequences:

- Mission Ledger Stability Diagnostics writes run, pair, and verdict artifacts
  under payload-required runtime artifact contracts;
- the diagnostic runner stops Product/Spec at the commitment-packet boundary
  twice and compares the actual checkpoint artifacts;
- `stable_with_provider_variance` may proceed to Product/Spec proof, but the
  variance remains visible in proof/readback artifacts;
- `needs_review_structural_drift` or `failed_runtime_boundary` blocks the next
  proof until the precise boundary is repaired.

## 2026-05-22 Mission Ledger Identity Is Runtime-Compiled From Model-Authored Source-Anchored Obligations

Decision: the Mission Ledger must become a staged obligation candidate
compiler before the next Product/Spec proof. The model extracts and reviews
obligations with source prompt anchors; runtime assigns stable ids and
compiles canonical commitments from structural anchors and model-authored
review operations.

Rationale:

- the live stability diagnostic showed identical Product/Spec input producing
  10 blocking commitments in one run and 13 in another;
- a scheduler/implementation proof is not interpretable if the commitment
  universe changes materially before graph creation;
- letting runtime decide semantic merges/splits would recreate brittle
  deterministic value judgment and semantic forest behavior;
- letting the model freely author final commitment ids and packet sets makes
  replay, evidence claims, and downstream graph scheduling unstable.

Consequences:

- runtime creates source prompt structural anchors and bounded excerpt refs;
- model extracts obligation candidates and attaches semantic meaning,
  blocking proposals, evidence expectations, and rationale to those anchors;
- runtime compiles a candidate set and stable candidate refs without merging,
  splitting, discarding, or classifying candidate meaning;
- model authors candidate review operations: accept, merge, split, discard as
  non-goal, add missing candidate with source anchor, or mark for owner review;
- runtime compiles canonical Mission Ledger commitments and ids from source
  anchors plus accepted model review operations;
- Commitment Work Packet authoring consumes canonical commitments only and
  cannot invent a different packet universe;
- GPT-5.5 packet rescue is proof-affecting escalation, not silent fallback
  success;
- a repeated-run packet boundary proof must pass before Product/Spec resumes.

Governing spec:
[Staged Mission Ledger Obligation Candidate Compiler](/projects/execution-platform/specs/staged-mission-ledger-obligation-candidate-compiler).

Implementation update:

- `staged-mission-ledger-obligation-compiler.ts` now owns the canonical
  staged compiler schemas and runtime-only compilation functions;
- `DynamicAgentTeamGraphRunner` requests staged candidate/review output and
  compiles canonical Mission Ledger commitments through the runtime compiler
  when staged output is present;
- staged candidate/review/canonical commitment payloads, packet semantic
  briefs, field completions, fast-model no-content diagnostics, and
  failed-packet replay results are covered by runtime artifact contracts;
- packet and context-synthesis fast-model diagnostics now classify exact
  no-content reason classes instead of collapsing everything into
  `openrouter_no_content`;
- the next decision gate is empirical: rerun the repeated Product/Spec packet
  boundary proof and require stable canonical commitment ids/counts plus
  classified no-content/replay evidence before Product/Spec implementation
  resumes.

## 2026-05-23 Execution Intent Is Model-Authored; Evidence Mode Is Runtime-Owned

Decision: executable graph nodes must carry model-authored execution intent,
and runtime must derive evidence mode from selected capability plus intent
before worker dispatch.

Rationale:

- the Product/Spec after-resource replay selected a source-grounding/read-only
  group for an edit-required Kimi worker because the node was structurally an
  `implementation_microtask`;
- inferring read-only vs edit-required behavior from node ids, titles, or
  objective prose would reintroduce semantic forest behavior;
- making the model author intent while runtime owns evidence, refs, executor,
  storage, and readiness keeps the model/runtime boundary clean.

Consequences:

- staged scheduler decisions must include `executionIntent`;
- runtime rejects intent/capability conflicts structurally;
- implementation worker dispatch requires `source_edit` plus
  `changed_file_evidence`;
- source-grounding/read-only work can produce read-only evidence but cannot be
  counted as changed-file evidence;
- replay/readback must prefer recomputed readiness over stale persisted
  readiness when validating an old checkpoint.
