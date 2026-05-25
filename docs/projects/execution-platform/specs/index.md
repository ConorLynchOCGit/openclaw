---
summary: "Specification index for the Execution Platform project."
title: "Execution Platform Specs"
---

# Execution Platform Spec Index

## Runtime And Workflow Architecture

1. [Control-Plane Coding Team Recovery](/projects/execution-platform/specs/control-plane-coding-team-recovery)
2. [WorkIntent Control-Plane Contract](/projects/execution-platform/specs/work-intent-control-plane-contract)
3. [Canonical Workflow Runtime Architecture](/projects/execution-platform/specs/canonical-workflow-runtime-architecture)
4. [Generic Orchestration Runtime](/projects/execution-platform/specs/generic-orchestration-runtime)
5. [Runtime Work Graph](/projects/execution-platform/specs/runtime-work-graph)
6. [Maximum Toolification Architecture](/projects/execution-platform/specs/maximum-toolification-architecture)
7. [Runtime Toolification And Utility Scheduling](/projects/execution-platform/specs/runtime-toolification-and-utility-scheduling)
8. [Runtime Parallelism And Contract Boundaries](/projects/execution-platform/specs/runtime-parallelism-and-contract-boundaries)
9. [Scheduler-First Node-Scoped Context Supply](/projects/execution-platform/specs/scheduler-first-node-scoped-context-supply)
10. [Post-Context Implementation Task Compiler](/projects/execution-platform/specs/post-context-implementation-task-compiler)
11. [Model Task Classification And Resource Materialization](/projects/execution-platform/specs/model-task-classification-and-resource-materialization)
12. [Runtime Node Readiness And Transition Engine](/projects/execution-platform/specs/runtime-node-readiness-transition-engine)
13. [Context Scout Execution Packet And Request-Context Repair](/projects/execution-platform/specs/context-scout-execution-packet-and-request-context-repair)
14. [Parallel Frontier Resource Boundary Hardening](/projects/execution-platform/specs/parallel-frontier-resource-boundary-hardening)
15. [Runtime Artifact Payload Store And Bounded Manifests](/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests)
16. [Resource Materialization Boundary Replay And Canonical Node Readiness](/projects/execution-platform/specs/resource-materialization-boundary-replay-and-canonical-node-readiness)
17. [Split-Required Resource Materialization Transition](/projects/execution-platform/specs/split-required-resource-materialization-transition)
18. [Runtime Artifact Contract Registry And Payload Boundary](/projects/execution-platform/specs/runtime-artifact-contract-registry-and-payload-boundary)
19. [Scheduler Frontier, No-Progress, And Evaluation Throttle](/projects/execution-platform/specs/scheduler-frontier-no-progress-and-evaluation-throttle)
20. [Operator Frontier Readback And Latest Run State](/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state)
21. [Large Graph Storage And Scheduler Lane](/projects/execution-platform/specs/large-graph-storage-and-scheduler-lane)
22. [Pre-Product/Spec Proof Stabilization Plan](/projects/execution-platform/specs/pre-product-spec-proof-stabilization-plan)
23. [Staged Mission Ledger Obligation Candidate Compiler](/projects/execution-platform/specs/staged-mission-ledger-obligation-candidate-compiler)
24. [Demand-Driven Frontier Orchestration And Context Broker](/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker)
25. [Semantic Microtask Refinement And Worker Packet Quality](/projects/execution-platform/specs/semantic-microtask-refinement-and-worker-packet-quality)
26. [Execution Intent, Evidence Mode, And Worker Dispatch](/projects/execution-platform/specs/execution-intent-evidence-mode-and-worker-dispatch)
27. [Pre-Product/Spec Frontier Worker Proof Gate](/projects/execution-platform/specs/pre-product-spec-frontier-worker-proof-gate)
28. [Pre-Product/Spec Execution Platform Modularization](/projects/execution-platform/specs/pre-product-spec-execution-platform-modularization)
29. [Post-Proof Generic Runtime Extraction](/projects/execution-platform/specs/post-proof-generic-runtime-extraction)
30. [Native Agentic Coding Harness Convergence](/projects/execution-platform/specs/native-agentic-coding-harness-convergence)
31. [Non-Codex Tool Worker Runtime](/projects/execution-platform/specs/non-codex-tool-worker-runtime)
32. [Native Agentic Coding Massive Leap Specs](/projects/execution-platform/specs/native-agentic-coding-massive-leap)
33. [Coding Executor Team Massive Leap Research](/projects/execution-platform/specs/coding-executor-team-massive-leap-research)
34. [Coding Executor Team Capability Leap](/projects/execution-platform/specs/coding-executor-team-capability-leap)
35. [Pre-Product/Spec Assumption Audit](/projects/execution-platform/specs/pre-product-spec-assumption-audit)
36. [Architecture Red-Team And Research Gate](/projects/execution-platform/specs/architecture-red-team-and-research-gate)

## Routing, Readiness, And Execution Truth

1. [Intent Routing And Workflow Contracts](/projects/execution-platform/specs/intent-routing-and-workflow-contracts)
2. [Work Queue Execution Truth](/projects/execution-platform/specs/work-queue-execution-truth)
3. [Work Queue Runtime Projection Truth](/projects/execution-platform/specs/work-queue-runtime-projection-truth)
4. [Work Queue Generated Item Lifecycle](/projects/execution-platform/specs/work-queue-generated-item-lifecycle)

## Planning And Product Surfaces

1. [Product/Spec Planning Production Workflow](/projects/execution-platform/product-spec-planning-production-workflow)
2. [Product/Spec Checkpointed Proof Framework](/projects/execution-platform/specs/product-spec-checkpointed-proof-framework)
3. [Planning Lifecycle And Proactivity](/projects/execution-platform/specs/planning-lifecycle-and-proactivity)

The Product/Spec production workflow contract itself is documented in
[Product/Spec Planning Production Workflow](/projects/execution-platform/product-spec-planning-production-workflow).
That workflow now plugs into the generic orchestration runtime as a production
workflow plugin rather than defining a bespoke runner. It is also the current
system contract for the Product/Spec Planning product surface: Planning Intent
Record, ResearchBrief, Planning Capsule, Human Planning Decision,
ActionGraphProposal, Compile Runtime Plan Result, and Product/Spec Planning
Closeout. The proof framework verifies that system contract through the live
runtime; it is not the system spec by itself.

## Current Pre-Proof Priority

2026-05-25 update: the current governing recovery spec is
[Control-Plane Coding Team Recovery](/projects/execution-platform/specs/control-plane-coding-team-recovery).
The required intermediate contract is
[WorkIntent Control-Plane Contract](/projects/execution-platform/specs/work-intent-control-plane-contract).
The next proof gate is a real Product/Spec-derived worker execution slice:
Commitment Work Packets -> WorkIntent DAG -> capability validation ->
resource requirements -> `NodeExecutionPacket` -> worker small-verb loop ->
bounded edit -> validation -> commitment evidence -> owner readback.
Default `context_synthesis group -> implementation node` is retired from the
coding-team proof path. The full ChatGPT Pro-style toolification catalog is
preserved in the recovery spec as post-proof architecture rather than being
lost or squeezed into the first proof slice.

Current pre-proof Work Queue order:

1. Spec Reconciliation And Control-Plane Reset.
2. WorkIntent Contract And Runtime Compiler.
3. Coding Path Context Synthesis Retirement And Replay Alignment. Complete:
   production and replay no longer treat context synthesis as default glue into
   executable implementation nodes.
4. Node-Scoped Context Broker And Readiness Enforcement. Complete:
   WorkIntent context-handoff requirements now compile into broker-backed,
   consumer-scoped context scout prerequisites, and accepted-with-limitations
   context cannot unlock implementation without a consumer waiver.
5. Resource Materialization And NodeExecutionPacket Worker Gate. Complete:
   source-edit workers require hydrated execution/resource/context packets
   and canonical readiness before provider invocation.
6. Worker Small-Verb Edit Smoke Proof. Complete: a Product/Spec-derived
   source-edit node executed through the small-verb loop, applied a scoped
   edit, ran structural validation, recorded commitment evidence, and rolled
   back for review. Large-file patch-author context now uses explicit bounded
   snapshot windows.
7. Owner Readback And Telemetry Proof. Next. Canonical execution prompt:
   [Owner Readback And Telemetry Proof](/projects/execution-platform/prompts/owner-readback-telemetry-proof-codex).
8. Product/Spec Planning Workflow Plugin Production Proof.

The staged scheduler/toolification work is now backed by a generic workflow
orchestration contract in
[Canonical Workflow Runtime Architecture](/projects/execution-platform/specs/canonical-workflow-runtime-architecture)
and [Generic Orchestration Runtime](/projects/execution-platform/specs/generic-orchestration-runtime).
Those generic orchestration items are complete. The current pre-proof audit is
[Pre-Product/Spec Assumption Audit](/projects/execution-platform/specs/pre-product-spec-assumption-audit),
and its reusable form is
[Architecture Red-Team And Research Gate](/projects/execution-platform/specs/architecture-red-team-and-research-gate).
The red-team gate and original five P0 blockers are complete. The current
Product/Spec replay diagnostics added a narrower native-harness convergence
block before the Product/Spec proof can finish:

1. Supervision And Model-Call Progress Convergence.
2. Post-Synthesis Graph Optimizer And Parallel Supersteps.
3. Non-Codex Worker Harness Convergence.
4. Validation Executor And Repair Loop Convergence.
5. Boundary Replay Checkpoint Completion.
6. Non-Codex Tool Worker Runtime And Patch-JSON Retirement.
7. Packet And Implementation Readiness Boundary Repair. Complete: two-step
   Qwen packet lane, implementation readiness gate, runtime context repair,
   and structural rollback detection.

The detailed source-of-truth architecture is
[Maximum Toolification Architecture](/projects/execution-platform/specs/maximum-toolification-architecture).
The native coding-harness convergence update is
[Native Agentic Coding Harness Convergence](/projects/execution-platform/specs/native-agentic-coding-harness-convergence).
The twelve-item hardening plan from the latest Product/Spec proof diagnostics is
[Native Agentic Coding Massive Leap Specs](/projects/execution-platform/specs/native-agentic-coding-massive-leap).
The non-Codex worker correction is
[Non-Codex Tool Worker Runtime](/projects/execution-platform/specs/non-codex-tool-worker-runtime).
The context-supply correction is
[Scheduler-First Node-Scoped Context Supply](/projects/execution-platform/specs/scheduler-first-node-scoped-context-supply):
complex work should compile draft work nodes from Commitment Work Packets,
then run node-scoped context scouts, with synthesis only when cross-node
coordination requires it.
The next boundary after node-scoped context is
[Post-Context Implementation Task Compiler](/projects/execution-platform/specs/post-context-implementation-task-compiler):
high-level implementation groups must be refined into file-resolved
ImplementationTaskPackets before any implementation worker can execute.
The governing pre-proof block is now
[Model Task Classification And Resource Materialization](/projects/execution-platform/specs/model-task-classification-and-resource-materialization):
it promotes model-task classification, generic node resource packets,
implementation context snapshot compilation, structured adapter hardening,
canonical readiness state, replay proof, and full Product/Spec proof into a
single ordered queue. The scheduler-first and post-context compiler specs are
sub-specs of that block rather than separate roadmap lanes.
The latest Product/Spec proof exposed a second generic context-supply hole:
context scout still receives a monolithic role prompt that can violate
structured-adapter byte/timeout policy, and request-context repair still
pushes the model toward old runtime-owned graph envelope fields. The new
current P0 blocker is
[Context Scout Execution Packet And Request-Context Repair](/projects/execution-platform/specs/context-scout-execution-packet-and-request-context-repair).
It requires bounded context-scout execution packets, policy-derived provider
timeouts, semantic request-context repair intent, runtime-compiled context
prerequisite nodes, and a boundary replay before the full Product/Spec proof.
The latest checkpointed proof advanced past that older context-supply
blocker, then exposed a runtime/scheduler boundary failure in resource packet
bounds, context limitation enforcement, context repair consumer edges, and
parallel frontier branch isolation. The new current P0 blocker is
[Parallel Frontier Resource Boundary Hardening](/projects/execution-platform/specs/parallel-frontier-resource-boundary-hardening).
It must run before the next full Product/Spec proof because implementation
readiness cannot be trusted until sibling branch failures, context
limitations, resource packets, and frontier state are branch-local.

The latest replay after resource and context-scout hardening exposed the next
general runtime gap: graph expansion and scheduler progress can still grow
faster than useful execution. The governing pre-proof update is
[Demand-Driven Frontier Orchestration And Context Broker](/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker).
It replaces mandatory broad context fanout with node-local context/resource
requests, graph-patch payload refs, expansion admission, superstep frontier
execution, compact readback, and replay boundaries at the actual failed
runtime layer.
resource compiler errors, runtime-only context fallbacks, zero-consumer
context repair nodes, and branch-level frontier exceptions are generic
scheduler failure modes.
The newest Product/Spec replay reached the implementation-resource storage
boundary and failed with `worker_adapter_threw:artifact_metadata_limit`. The
current P0 sub-block is
[Runtime Artifact Payload Store And Bounded Manifests](/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests):
full resource packet bodies must move to a canonical payload/body store while
runtime artifact metadata stays a bounded manifest.
That storage substrate is implemented. The next P0 blocker is
[Resource Materialization Boundary Replay And Canonical Node Readiness](/projects/execution-platform/specs/resource-materialization-boundary-replay-and-canonical-node-readiness):
implemented as the exact implementation-resource replay boundary, with
`before_resource_materialization` and `after_resource_materialization`
checkpoints, canonical `NodeReadinessState`, manifest-only graph metadata,
and lane proof against the failed Product/Spec graph.
Resource materialization replay is complete, but the DB queue still has
Parallel Frontier Resource Boundary ahead of Product/Spec. The closure gate is
[Pre-Product/Spec Frontier Worker Proof Gate](/projects/execution-platform/specs/pre-product-spec-frontier-worker-proof-gate):
it must prove branch isolation, context-limitation blocking, owner readback,
and one executable payload-backed worker smoke before Product/Spec is counted
as the next proof.
That gate is now satisfied, and the newest full proof exposed the next
generic transition gap:
[Split-Required Resource Materialization Transition](/projects/execution-platform/specs/split-required-resource-materialization-transition).
Runtime can block an oversized parent implementation node before worker
invocation, but it must promote accepted split task packets into executable
child nodes, mark the parent as aggregate/non-runnable, and classify the
boundary as resource materialization evidence instead of
`worker_adapter_threw:unclassified`.
The latest post-split proof diagnosis exposed a broader pre-proof
stabilization block:
[Runtime Artifact Contract Registry And Payload Boundary](/projects/execution-platform/specs/runtime-artifact-contract-registry-and-payload-boundary),
[Scheduler Frontier, No-Progress, And Evaluation Throttle](/projects/execution-platform/specs/scheduler-frontier-no-progress-and-evaluation-throttle),
[Operator Frontier Readback And Latest Run State](/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state),
and [Pre-Product/Spec Proof Stabilization Plan](/projects/execution-platform/specs/pre-product-spec-proof-stabilization-plan).
These are generic runtime hardening items, not Product/Spec-specific feature
work. They must run before the next full Product/Spec proof because the
remaining failure modes can block source edits across any large workflow:
body-bearing artifacts can still leak into metadata, ready frontiers can be
starved by repeated context/prerequisite expansion, reused-only graph
decisions can look like progress, Mission Ledger evaluation can be over-called
for context-only evidence, and owner readback can lose the active branch
state.
The artifact contract registry and scheduler frontier/no-progress/evaluation
throttle items are implemented and lane-proven. The next live pre-proof
blocker is
[Operator Frontier Readback And Latest Run State](/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state).
The latest architecture cleanup pass promotes refactor work that was
previously listed after Product/Spec. The governing spec is
[Pre-Product/Spec Execution Platform Modularization](/projects/execution-platform/specs/pre-product-spec-execution-platform-modularization):
characterization and import-boundary guardrails, generic runtime spine
extraction, dynamic runner plugin thinning, generic replay/readiness
lifecycle extraction, progress/readback modularization, compatibility bypass
audit, and model contract compiler consolidation now precede the Product/Spec
proof because stale proof/runtime topology has already caused regressions.
The current pre-proof diagnostic is
[Mission Ledger Stability Diagnostics](/projects/execution-platform/specs/pre-product-spec-proof-stabilization-plan#mission-ledger-stability-diagnostics):
run the Product/Spec prompt twice to the commitment-packet boundary, compare
structural Mission Ledger and packet stability, expose Qwen no-content/retry
variance, and block only on mission gate changes, missing packet coverage,
missing packet handoff fields, runtime boundary failure, or GPT rescue
dependence. Harmless commitment-count variance is diagnostic-only.
That diagnostic is implemented. The staged diagnostic spec is
[Staged Mission Ledger Obligation Candidate Compiler](/projects/execution-platform/specs/staged-mission-ledger-obligation-candidate-compiler):
source-anchored obligation candidates, model-authored candidate review,
runtime-compiled canonical commitments, packet briefs from canonical
commitments only, and exact provider diagnostics. It is diagnostic/proof-only;
production Mission Ledger creation uses the restored single-pass path.
The prior generic scheduler hole was that graph
acceptance could still approve a worker node before the transition engine
proved context/resource readiness. That P0 blocker is complete:
[Runtime Node Readiness And Transition Engine](/projects/execution-platform/specs/runtime-node-readiness-transition-engine).
It makes node lifecycle transitions, capability execution preconditions,
frontier readiness, prerequisite materialization, and worker executability a
generic runtime contract. The next full proof remains Product/Spec Planning
Workflow Plugin Production Proof, after the split-required resource
materialization transition replay passes.
After Product/Spec, the generic cleanup target is
[Post-Proof Generic Runtime Extraction](/projects/execution-platform/specs/post-proof-generic-runtime-extraction):
move generic lifecycle, replay, readiness, frontier, repair, evidence, and
readback behavior out of coding-specific modules so future workflows do not
reimplement the same orchestration lessons.
The next external-baseline capability leap is
[Coding Executor Team Capability Leap](/projects/execution-platform/specs/coding-executor-team-capability-leap).
It anchors the pre-Product/Spec queue around code intelligence, context scout
over code intelligence, context synthesis handoff, worker-internal streaming,
compound non-Codex coding tools, and fallback/compatibility retirement before
the Product/Spec Planning production proof.
