---
summary: "Execution Platform project workspace."
title: "Execution Platform"
---

# Execution Platform

The Execution Platform owns OpenClaw runtime routing, workflow execution,
runtime jobs, Work Queue projection/readback/control, Runtime Tool Kernel,
workflow definitions, model/worker/tool traces, and closeout/finalization
gates.

## Current Focus

2026-05-24 control-plane recovery update: the current governing spec is
[Control-Plane Coding Team Recovery](/projects/execution-platform/specs/control-plane-coding-team-recovery).
The missing contract is now explicitly documented in
[WorkIntent Control-Plane Contract](/projects/execution-platform/specs/work-intent-control-plane-contract).
The next accepted proof is no longer "run the whole Product/Spec funnel and
hope it reaches implementation." The proof path must first demonstrate the
control-plane coding loop on a Product/Spec-derived node:
Mission Ledger/packets -> WorkIntent DAG -> capability validation ->
resource requirements ->
`NodeExecutionPacket` -> worker tool facade -> bounded source edit ->
validation -> commitment evidence -> owner readback. Global context synthesis
is optional coordination only, not default glue. The full toolification
catalog is documented for the post-proof track; the pre-proof slice implements
the coding-critical facade and worker execution proof.

Default `context_synthesis group -> implementation node` is explicitly
retired from the coding-team production proof path.

2026-05-24 implementation update: that retirement is now enforced in the
production scheduler and replay topology. Accepted context synthesis can only
act as coordination evidence and, when explicitly present, can compile into
non-runnable `work_intent` nodes with model-authored execution intent and
capability selection. It cannot directly create executable implementation,
validation, review, readback, or closeout nodes. `after-context-synthesis`
replay is diagnostic-only; `after-graph-selection` replay requires
node-scoped context evidence.

2026-05-24 node-scoped context update: WorkIntent nodes with context-handoff
requirements now block at a broker-backed `node_scoped_context_supply`
transition until consumer-specific context exists. `accepted_with_limitations`
context is no longer implementation-ready without a consumer waiver, context
scout prerequisites carry a broker request ref and semantic question for the
downstream node, and Work Queue readback exposes the relevant context status,
limitation status, waiver refs, snapshot refs, target refs, and next
transition.

2026-05-23 modularization update: before the next Product/Spec proof, the
Execution Platform now runs a refactor tranche documented in
[Pre-Product/Spec Execution Platform Modularization](/projects/execution-platform/specs/pre-product-spec-execution-platform-modularization).
This promotes characterization/import-boundary guardrails, generic runtime
spine extraction, dynamic runner plugin thinning, generic replay/readiness
lifecycle extraction, progress/readback modularization, compatibility bypass
audit, and model contract compiler consolidation ahead of the proof. The
reason is architectural: stale proof/runtime topology has already reintroduced
old behavior after production policy moved on.

2026-05-23 execution-intent update: the latest after-resource worker smoke
advanced past split-child readiness and bounded repo reads, then revealed a
dispatch contract gap. The selected node was source grounding/read-only
evidence, but the replay harness treated it as an edit-required implementation
node and expected changed-file refs. The new P0 pre-proof item is
[Execution Intent, Evidence Mode, And Worker Dispatch](/projects/execution-platform/specs/execution-intent-evidence-mode-and-worker-dispatch):
models author execution intent, runtime compiles evidence mode and executor
compatibility, and file-edit workers run only for nodes that structurally
require changed-file evidence.

2026-05-23 update: the latest Product/Spec replay proved context-scout
sharding and resource materialization can advance, but failed before
implementation because scheduler progress metadata attempted to carry a
114KB body against a 64KB manifest contract. The next pre-proof architecture
is [Demand-Driven Frontier Orchestration And Context Broker](/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker):
graph patches become payload refs, scheduler progress becomes compact
latest-run-state, graph expansion is admitted/paged by a runtime controller,
and implementation nodes request context/resources as needed while unrelated
ready branches keep executing. Edits remain blocked until node readiness is
executable.

2026-05-23 worker-boundary update: demand-driven execution now has an
additional pre-proof gate,
[Semantic Microtask Refinement And Worker Packet Quality](/projects/execution-platform/specs/semantic-microtask-refinement-and-worker-packet-quality).
The after-resource worker smoke proved payload-backed worker invocation can
start, but also proved broad work-intent nodes are not worker-ready. Repo
scope is discovery/authority scope; executable implementation packets require
target snapshots, validation refs, context refs, and model-authored
file/symbol change intent. Replay worker smokes roll edits back by default
until Codex review accepts them.

The current pre-proof storage and readiness boundary is implemented:
[Runtime Artifact Payload Store And Bounded Manifests](/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests).
The latest Product/Spec proof reached scheduler graph execution, accepted
context scout/repair handoffs, and the implementation-resource frontier, then
failed before any file-edit worker ran because full implementation resource
packet bodies were still being attached as artifact metadata. That generic
payload/manifest storage boundary now has production code and focused
validation. The resource-readiness replay layer is also implemented:
[Resource Materialization Boundary Replay And Canonical Node Readiness](/projects/execution-platform/specs/resource-materialization-boundary-replay-and-canonical-node-readiness):
`before_resource_materialization` and `after_resource_materialization`
checkpoints now hydrate payload-backed packets, use one canonical
`NodeReadinessState`, enforce manifest-only graph metadata, and write
latest-run-state boundary readback. The next proof target is Product/Spec
Planning from the nearest executable frontier, then from the top, after the
still-active Parallel Frontier Resource Boundary item is closed or explicitly
superseded with evidence.

2026-05-17 update: the context supply chain now indexes the full source
prompt into bounded refs, lets context scout request bounded excerpts, and
requires context handoff packets before context-dependent implementation.

2026-05-18 update: the Product/Spec replay accepted context synthesis and a
post-synthesis graph, but selected one broad foundation implementation node.
The active pre-proof block now converges Runtime Work Graph, Runtime Tool-Call
Kernel, RuntimeWorkerSupervisor, Work Queue events/readback/control, Context
Engine, provider stream wrappers, validation/QA tools, and closeout
finalization into one native agentic coding harness.

2026-05-18 later update: the next pre-proof blocker is
[Non-Codex Tool Worker Runtime](/projects/execution-platform/specs/non-codex-tool-worker-runtime).
The Kimi/non-Codex implementation lane must retire giant JSON patch proposals
from production success and use a runtime-owned tool loop before Product/Spec
proof resumes.

2026-05-21 update: runtime node readiness is implemented. The next blocker is
context scout resource materialization: bounded `ContextScoutExecutionPacket`,
policy-derived provider timeout, semantic request-context repair intent, and
runtime-compiled context prerequisite nodes.

2026-05-21 later update: context scout and context repair advanced into the
implementation-resource boundary. The next blocker is canonical artifact
payload storage: full `ImplementationContextPacket`, `ImplementationTaskPacket`,
`CodingResourcePacket`, and `NodeExecutionPacket` bodies must be stored as
payloads with bounded manifests, not artifact metadata.

2026-05-21 resource replay update: artifact payload storage is implemented.
The next pass is not another full top-of-pipe Product/Spec run. It must
replay the failed implementation-resource boundary with canonical
`NodeReadinessState` and payload-backed resource packets first.

2026-05-21 frontier-worker proof gate update: resource materialization replay
is implemented, but the active queue still has Parallel Frontier Resource
Boundary ahead of Product/Spec. The closure gate is
[Pre-Product/Spec Frontier Worker Proof Gate](/projects/execution-platform/specs/pre-product-spec-frontier-worker-proof-gate):
prove branch isolation, context-limitation blocking, owner readback, and one
payload-backed executable worker smoke before running Product/Spec as the
next proof. The post-proof extraction path is
[Post-Proof Generic Runtime Extraction](/projects/execution-platform/specs/post-proof-generic-runtime-extraction).

2026-05-22 split-transition update: the frontier worker gate closed and the
next full Product/Spec proof advanced further. The current blocker is now
[Split-Required Resource Materialization Transition](/projects/execution-platform/specs/split-required-resource-materialization-transition):
when a broad parent implementation node expands beyond packet bounds, runtime
must mark the parent aggregate/non-runnable, promote split task packets into
executable child nodes, materialize child Work Queue items, and run children
from canonical readiness instead of retrying the parent or surfacing
`worker_adapter_threw:unclassified`.

2026-05-22 stabilization update: the split-required transition is no longer
the only risk. Before the next Product/Spec proof, the platform needs the
generic stabilization block in
[Pre-Product/Spec Proof Stabilization Plan](/projects/execution-platform/specs/pre-product-spec-proof-stabilization-plan):
typed runtime artifact contracts, scheduler frontier/no-progress/evaluation
policy, and active frontier latest-run-state/readback. These are required so
large workflow runs cannot fail before edits because a new body-bearing
artifact used metadata, a ready frontier was starved by repeated prerequisite
expansion, or owner readback lost the actual active branch state.

2026-05-22 scheduler-frontier update: the scheduler frontier/no-progress/
evaluation-throttle item is implemented. Production coding-team scheduler
construction now runs a ready executable frontier before expansion, repeated
reused-only graph decisions halt as no-progress, context-only Mission Ledger
evaluation is throttled, and Work Queue active graph readback projects the
new frontier/no-progress/throttle fields. The next pre-proof item is
[Operator Frontier Readback And Latest Run State](/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state).

2026-05-22 operator-readback update: active frontier latest-run-state is
implemented. Production scheduler progress writes
`execution_platform.latest_run_state`, and Work Queue owner readback projects
branch-level selected/running/blocked node ids, blocker schema path,
no-progress root cause, Mission Ledger throttle state, and agreement checks.
The next pre-proof item is Large Graph Storage And Scheduler Lane.

2026-05-22 large-graph update: Large Graph Storage And Scheduler Lane is
implemented and lane-proven. Resource materialization results and node
readiness states are payload-required artifact contracts, live
`agent_team.scheduler_progress` is contract-covered, graph metadata stores
bounded context snapshot samples plus counts instead of full context arrays,
and the synthetic 90-node/100-edge proof executed the ready implementation
frontier branch while all large bodies stayed out of metadata. The next
pre-proof item is Mission Ledger Stability Diagnostics, now backed by a
canonical comparison module plus repeated-checkpoint runner and closeout
scripts.

2026-05-22 Mission Ledger Stability Diagnostics update: the diagnostic lane is
implemented and produced a live needs-review verdict. The repeated
checkpointed Product/Spec preflight found commitment-count variance plus 3
Qwen no-content retries and 6 GPT rescue uses. Commitment-count variance is
now diagnostic-only unless packet coverage or required evidence is missing.
Proof:
`.artifacts/execution-platform/mission-ledger-stability-diagnostics/proof.json`.
The Product/Spec proof should focus on packet rescue dependence and downstream
implementation readiness, not on harmless ledger count variance by itself.

2026-05-22 Mission Ledger compiler update: the staged compiler is now
[Staged Mission Ledger Obligation Candidate Compiler](/projects/execution-platform/specs/staged-mission-ledger-obligation-candidate-compiler).
It is retained as diagnostic/proof infrastructure only. Production coding-team
Mission Ledger creation is restored to the prior working single-pass path,
with staged mode available only behind both the explicit diagnostic
environment allow-list and a per-job diagnostic payload flag.

## Core Docs

- [Status](/projects/execution-platform/STATUS)
- [Current Slice](/projects/execution-platform/CURRENT_SLICE)
- [Roadmap](/projects/execution-platform/roadmap)
- [Decisions](/projects/execution-platform/DECISIONS)
- [Spec Index](/projects/execution-platform/specs)
