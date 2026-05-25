# Execution Platform Roadmap

## Dedicated DB Boundary

The live Execution Platform substrate now uses the dedicated
`execution_platform` database. Current Work Queue planning/readback state has
been copied there as bounded DB state, so active queue readback is no longer
on the Model Memory fallback boundary. Runtime jobs remain lifecycle truth.

## Runtime Toolification Queue

### Product/Spec System Spec And Proof Readiness

2026-05-25 update: the Product/Spec Planning production workflow spec is now
the actual system contract as well as the proof target. The system must
produce planning/proposal artifacts through canonical runtime nodes:
`PlanningIntentRecord`, optional `ResearchBrief`, `PlanningCapsule`, optional
`HumanPlanningDecision`, `ActionGraphProposal`, `CompileRuntimePlanResult`,
and `ProductSpecPlanningCloseout`. The proof prompt is
`docs/projects/execution-platform/prompts/product-spec-planning-workflow-plugin-production-proof-openclaw.md`.

Before the full Product/Spec proof, complete the owner readback/telemetry gate
and prove the live gateway builds, starts, and answers health/readiness from
the current tree. The proof run must record the canonical prompt hash and must
not use context synthesis as default glue into implementation nodes.

### Control-Plane Coding Team Recovery

Governing spec:
`specs/control-plane-coding-team-recovery.md`.
Companion contract:
`specs/work-intent-control-plane-contract.md`.

The next Product/Spec proof is gated by a concrete coding-loop proof, not a
global context-synthesis pass. The platform must prove a Product/Spec-derived
WorkIntent can pass capability validation, materialize a `NodeExecutionPacket`,
run through the worker small-verb loop, make a bounded source edit, run
validation, emit commitment evidence, and show owner readback. The default
`context_synthesis group -> implementation node` path is retired for
coding-team Product/Spec proof success.

Pre-proof order:

1. `openclaw-convergence.control-plane-01-spec-reconciliation` - Execution
   Platform Spec Reconciliation And Control-Plane Reset. **Closed.**
2. `openclaw-convergence.control-plane-02-workintent-contract-compiler` -
   WorkIntent Contract And Runtime Compiler. **Closed.**
3. `openclaw-convergence.control-plane-03-context-synthesis-retirement-replay-alignment` -
   Coding Path Context Synthesis Retirement And Replay Alignment. **Closed.**
4. `openclaw-convergence.control-plane-04-node-scoped-context-readiness` -
   Node-Scoped Context Broker And Readiness Enforcement. **Closed.**
5. `openclaw-convergence.control-plane-05-resource-materialization-worker-gate` -
   Resource Materialization And NodeExecutionPacket Worker Gate. **Closed.**
6. `openclaw-convergence.control-plane-06-worker-small-verb-edit-smoke` -
   Worker Small-Verb Edit Smoke Proof. **Closed.**
7. `openclaw-convergence.control-plane-07-readback-telemetry-proof` -
   Owner Readback And Telemetry Proof. **Next.**
8. `openclaw-convergence.active-queue-34` - Product/Spec Planning Workflow
   Plugin Production Proof.

Immediate post-proof order:

1. `openclaw-convergence.post-proof-full-tool-facade-expansion` - Full Tool
   Facade Expansion.
2. `openclaw-convergence.runtime-artifact-retention-pruning-policy`.
3. `openclaw-convergence.scheduler-phase-budget-governor`.
4. `openclaw-convergence.work-queue-frontier-delta-stream`.
5. `openclaw-convergence.active-queue-31` - Memory, Retrieval, Context, And
   Proactivity Toolification.
6. Cross-workflow orchestration proof lanes.

### Demand-Driven Frontier Closure Gate

Historical note: this tranche is complete or superseded by the WorkIntent
control-plane recovery queue above. The section remains for traceability.

Update: the next queue head is now a pre-proof modularization tranche before
the Product/Spec proof. The most recent proof/replay cleanup showed stale
proof/runtime topology can reintroduce old architecture; this needs cleanup
before another expensive Product/Spec pass.

Governing spec:
`specs/pre-product-spec-execution-platform-modularization.md`.

Pre-proof refactor order:

1. Characterization And Import Boundary Guardrails. **Closed.**
2. Generic Runtime Spine Extraction. **Closed.**
3. Dynamic Runner Plugin Thinning. **Closed.**
4. Generic Replay And Readiness Lifecycle. **Closed.**
5. Progress, Readback, And Runtime Event Modularization. **Next.**
6. Compatibility Retirement And Middleware Bypass Audit.
7. Model Contract Compiler Consolidation.
8. Product/Spec Planning Workflow Plugin Production Proof.

The historical `post-proof-*` item ids for generic runtime spine, dynamic
runner thinning, and generic replay/readiness lifecycle are retained for DB
continuity, but their priority is now pre-proof.

The next Product/Spec Planning proof is now gated by
`specs/demand-driven-frontier-orchestration-and-context-broker.md`. The
latest replay reached context scout and resource materialization, then failed
because scheduler progress metadata exceeded the manifest contract before
implementation could edit files. The fix is not another broad context fanout.
The runtime must store graph patches as payload refs, compact progress,
admit/page graph expansion, let implementation nodes request context/resources
as needed, and continue ready sibling branches in parallel.

Pre-proof order after Work Queue reconciliation:

1. GraphPatch Payload Store And Progress Compaction. **Complete.**
2. Demand-Driven Context Broker And Lazy Readiness. **Complete.**
3. Expansion Controller And Dynamic Fanout Admission. **Complete.**
4. Superstep Frontier Runtime And Branch Results. **Complete.**
5. Readback Projection And Replay Boundary Expansion. **Complete.**
6. Semantic Microtask Refinement And Worker Packet Quality. **Complete.**
7. Product/Spec replay from the failed graph/resource boundary. **Complete.**
8. Execution Intent, Evidence Mode, And Worker Dispatch. **Complete.**
9. Product/Spec Planning Workflow Plugin Production Proof. **Next active
   queue item.**
10. Runtime Artifact Retention And Pruning Policy. **Immediate post-proof.**
11. Scheduler Phase Budget Governor. **Immediate post-proof.**
12. Work Queue Frontier Delta Stream And Branch Controls. **Immediate
    post-proof.**

Mission Ledger lifecycle reconciliation:

- `openclaw-convergence.mission-ledger-stability-diagnostics` is **closed**.
  Its remaining purpose is diagnostic evidence, not active production work.
- `openclaw-convergence.staged-mission-ledger-obligation-candidate-compiler`
  is **superseded / diagnostic-only**. Production coding-team Mission Ledger
  creation uses the prior single-pass path; staged Mission Ledger can only run
  behind explicit diagnostic flags.
- `openclaw-convergence.runtime-artifact-retention-pruning-policy`,
  `openclaw-convergence.scheduler-phase-budget-governor`, and
  `openclaw-convergence.work-queue-frontier-delta-stream` remain active but
  are ranked after Product/Spec as immediate post-proof hardening.

The semantic microtask item is a worker-boundary correction discovered by the
after-resource smoke: demand-driven execution should not mechanically turn
repo-scope refs into arbitrary file chunks. It requires model-authored
file/symbol change intent before non-Codex workers can edit, while preserving
runtime ownership of refs, snapshots, schema, storage, lifecycle, and replay.

The execution-intent item is the next worker-dispatch correction discovered by
the same replay class: read-only source-grounding work can be executable and
useful, but it must not be sent to file-edit workers or counted as
changed-file proof. Runtime validates intent/capability/evidence-mode
compatibility from explicit model-authored intent, not from deterministic
prose heuristics.

### Coding Executor Capability Leap

The next Product/Spec Planning production proof is now gated by the
resource-materialization and model-task classification block documented in
`specs/model-task-classification-and-resource-materialization.md`. This block
absorbs the older scheduler-first context and post-context compiler blockers
into one ordered pre-proof queue.

Pre-proof order:

1. `openclaw-convergence.model-task-classification-utility-router-v2` -
   Model Task Classification And Utility Router v2. **Complete.**
2. `openclaw-convergence.generic-node-resource-materialization-layer` -
   Generic Node Resource Materialization Layer. **Complete.**
3. `openclaw-convergence.implementation-context-snapshot-compiler` -
   Implementation Context Snapshot Compiler. **Complete.**
4. `openclaw-convergence.structured-tool-schema-adapter-hardening` -
   Structured Tool/Schema Adapter Hardening. **Complete.**
5. `openclaw-convergence.scheduler-readiness-state-unification` -
   Scheduler Readiness State Unification. **Complete.**
6. `openclaw-convergence.product-spec-replay-proof-resource-materialization` -
   Product/Spec Replay Proof. **Complete 2026-05-21.**
7. `openclaw-convergence.runtime-node-readiness-transition-engine` -
   Runtime Node Readiness And Transition Engine. **Complete.**
8. `openclaw-convergence.context-scout-execution-packet-request-context-repair` -
   Context Scout Execution Packet And Request-Context Repair Compiler.
   **Closed from checkpointed proof evidence; the latest run advanced beyond
   its original preflight/repair-envelope failure.**
9. `openclaw-convergence.parallel-frontier-resource-boundary-hardening` -
   Parallel Frontier Resource Boundary Hardening. **Partially validated; the
   latest run advanced into implementation-resource storage.**
10. `openclaw-convergence.runtime-artifact-payload-store-bounded-manifests` -
    Runtime Artifact Payload Store And Bounded Manifests. **Implemented;
    resource-storage substrate is complete.**
11. `openclaw-convergence.resource-materialization-boundary-replay-canonical-readiness` -
    Resource Materialization Boundary Replay And Canonical Node Readiness.
    **Complete; before/after resource-materialization replay boundaries are
    lane-proven against the failed Product/Spec graph.**
12. `openclaw-convergence.split-required-resource-materialization-transition` -
    Split-Required Resource Materialization Transition. **Complete. The
    failed Product/Spec graph now replays from `before-resource-materialization`
    and produces two ready implementation `NodeExecutionPacket` refs from
    concrete context edit points without rerunning upstream phases.**
13. `openclaw-convergence.active-queue-34` - Product/Spec Planning Workflow
    Plugin Production Proof. **Next proof target.**

Immediate Product/Spec proof gate:

1. `openclaw-convergence.runtime-artifact-contract-registry-payload-boundary` -
   Runtime Artifact Contract Registry And Payload Boundary. **Complete.**
2. `openclaw-convergence.scheduler-frontier-no-progress-evaluation-throttle` -
   Scheduler Frontier, No-Progress, And Evaluation Throttle. **Complete.**
3. `openclaw-convergence.operator-frontier-readback-latest-run-state` -
   Operator Frontier Readback And Latest Run State. **Complete.**
4. `openclaw-convergence.product-spec-large-graph-storage-scheduler-lane` -
   Large Graph Storage And Scheduler Lane. **Complete.**
5. `openclaw-convergence.mission-ledger-stability-diagnostics` - Mission
   Ledger Stability Diagnostics. **Closed.**
6. `openclaw-convergence.staged-mission-ledger-obligation-candidate-compiler` -
   Staged Mission Ledger Obligation Candidate Compiler. **Superseded /
   diagnostic-only.**
7. `openclaw-convergence.active-queue-34` - Product/Spec Planning Workflow
   Plugin Production Proof. **Next active proof target.**

Completed pre-proof foundation:

1. `openclaw-convergence.coding-leap-01-code-intelligence-substrate` - Code Intelligence Substrate. **Complete.**
2. `openclaw-convergence.coding-leap-02-context-scout-code-intelligence` - Context Scout Over Code Intelligence. **Complete.**
3. `openclaw-convergence.coding-leap-02b-code-intelligence-lsp-semantic-backend` - Code Intelligence Semantic Backend And LSP Parity. **Complete.**
4. `openclaw-convergence.coding-leap-03-context-synthesis-scheduler-handoff` - Context Synthesis Barrier And Scheduler Handoff. **Complete.**
5. `openclaw-convergence.coding-leap-04-worker-streaming-readback` - Worker-Internal Streaming And Operator Readback. **Complete.**
6. `openclaw-convergence.coding-leap-05-non-codex-compound-tools` - Non-Codex Compound Coding Tools. **Complete.**
7. `openclaw-convergence.coding-leap-06-fallback-compat-retirement` - Fallback And Compatibility Retirement plus bounded canonical-path refactor. **Complete.**
8. Packet And Implementation Readiness Boundary Repair. **Complete 2026-05-20.**
   This repaired the two-step Qwen CommitmentWorkPacket path, implementation
   readiness gate, runtime-owned context repair nodes, and non-Codex structural
   rollback detection. A narrow real-model Qwen packet lane passed before the
   next replay.
9. Scheduler-First Node-Scoped Context Supply. **Absorbed into current block.**
   This retires mandatory commitment-scoped context fanout and global
   synthesis before graph creation. The scheduler now creates draft work nodes
   from accepted packets first, then context scouts run per node, with
   readiness promotion and optional synthesis only for cross-node coordination.
10. Post-Context Implementation Task Compiler. **Absorbed into current block.**
    This prevents broad work-intent groups or directory-level target refs from
    invoking implementation workers. Accepted node-scoped context must compile
    into file-resolved ImplementationTaskPackets before executable
    implementation/test/docs/readback nodes are created.

Post-proof generic runtime extraction follow-ups:

1. `openclaw-convergence.post-proof-01-generic-runtime-spine-extraction` -
   Generic Runtime Spine Extraction.
2. `openclaw-convergence.post-proof-02-dynamic-runner-plugin-thinning` -
   Dynamic Runner Plugin Thinning.
3. `openclaw-convergence.post-proof-03-generic-replay-readiness-lifecycle` -
   Generic Replay And Readiness Lifecycle.
4. `openclaw-convergence.post-proof-04-cross-workflow-orchestration-proof-lanes` -
   Cross-Workflow Orchestration Proof Lanes.
5. `openclaw-convergence.coding-leap-07-parallel-worktree-supersteps` - Parallel Worktree Supersteps.
6. `openclaw-convergence.coding-leap-08-runtime-lifecycle-hooks` - Runtime Lifecycle Hooks.
7. `openclaw-convergence.coding-leap-09-agent-role-configuration` - Agent Role Configuration Surface.
8. `openclaw-convergence.coding-leap-10-tool-search-capability-catalog` - Tool Search And Capability Catalog.
9. `openclaw-convergence.coding-leap-11-role-model-benchmark-registry` - Role/Model Benchmark Registry.
10. `openclaw-convergence.coding-leap-12-memory-execution-context-packs` - Memory-To-Execution Context Packs.

The active queue is reprioritized around a pre-proof toolification and
workflow-runtime convergence block. Product/Spec Planning remains the next
major live UX proof, but it is blocked until the runtime path can prove real
utility-aware delegation, commitment evidence closure, and one canonical
workflow engine path.

Pre-proof items now recorded in the DB Work Queue:

1. `openclaw-convergence.toolification-01-runtime-tool-call-kernel` - Runtime Tool-Call Kernel And Trace Store. **Complete.**
2. `openclaw-convergence.active-queue-50` - Cost-Aware Capability Policy. **Complete.**
3. `openclaw-convergence.active-queue-22` - Scheduler Toolification And Split Planning/Execution. **Complete.**
4. `openclaw-convergence.active-queue-21` - Worker Tool Loops And Non-Codex File-Edit Worker / Kimi Implementation Lane Hardening. **Complete.**
   4a. `openclaw-convergence.non-codex-worker-loop-v2` - Non-Codex Worker Loop v2 context expansion, multi-step edit, repair, and evidence-claim proof. **Complete.**
   4b. `openclaw-convergence.non-codex-tool-using-worker` - Model-Agnostic Non-Codex Tool-Using Worker Loop. **Complete.**
   4c. `openclaw-convergence.non-codex-large-task-decomposition` - Non-Codex Large-Task Decomposition And File-Edit Qualification. **Complete.**
5. `openclaw-convergence.toolification-05-mission-ledger-evidence-finalization` - Mission Ledger Evidence Claims And Finalization Handoff. **Complete.**
6. `openclaw-convergence.toolification-06-work-queue-tool-event-readback` - Work Queue Tool/Event Readback. **Complete.**
7. `openclaw-convergence.toolification-07-truth-registry-adoption-gate` - Runtime Toolification Truth Registry And Adoption Gate. **Complete.**
8. `openclaw-convergence.toolification-08-model-call-toolification` - Model Call Toolification And Model Task Middleware Collapse. **Complete.**
9. `openclaw-convergence.toolification-09-script-db-toolification` - Script And DB Operation Toolification. **Complete.**
10. `openclaw-convergence.toolification-10-closeout-generate-toolification` - Closeout Toolification And Legacy Retirement Soak. **Complete.**
11. `openclaw-convergence.toolification-11-workflow-evidence-profiles-readback` - Workflow Evidence Profiles And Tool Trace Readback Hardening. **Complete.**
12. `openclaw-convergence.workflow-runtime-01-definition-registry` - Canonical Workflow Runtime Engine And Workflow Definition Registry. **Complete.**
13. `openclaw-convergence.workflow-runtime-02-coding-plugin-extraction` - Coding Team Plugin Extraction From Dynamic Runner. **Complete.**
14. `openclaw-convergence.workflow-runtime-03-generic-runner-retirement` - Generic Workflow Runner Production Retirement. **Complete.**
15. `openclaw-convergence.work-queue-generated-item-lifecycle` - Work Queue Generated Item Lifecycle And Proof Child Cleanup. **Complete.**
16. `openclaw-convergence.capability-subject-routing-split` - Capability/Subject Routing Split. **Complete.**
    16a. `openclaw-convergence.owner-turn-heartbeat-prompt-transport-hardening` - Owner-Turn Heartbeat And Prompt Transport Hardening. **Complete.**

New pre-proof blocker from the latest Product/Spec Planning attempts:

17. `openclaw-convergence.staged-scheduler-tool-protocol` - Staged Scheduler Tool Protocol And Maximum Toolification Compiler. **Complete.**

New generic orchestration runtime block:

18. `openclaw-convergence.generic-orchestration-runtime-engine` - Generic Orchestration Runtime Engine. **Complete.**
19. `openclaw-convergence.generic-staged-scheduler-protocol` - Generic Staged Scheduler Protocol. **Complete.**
20. `openclaw-convergence.generic-node-executor-evidence-contract` - Generic Node Executor And Evidence Claim Contract. **Complete.**
21. `openclaw-convergence.toolification-14-router-front-door-tool-protocol` - Router And Front Door Tool Protocol. **Complete.**
22. `openclaw-convergence.toolification-18-validation-qa-toolification` - Validation And QA Toolification. **Complete.**
23. `openclaw-convergence.toolification-19-closeout-finalization-tools` - Closeout Finalization Toolchain. **Complete.**
24. `openclaw-convergence.architecture-red-team-research-gate` - Architecture Red-Team And Research Gate. **Complete.**
25. `openclaw-convergence.pre-product-spec-01-context-scout-tool-loop` - Context Scout Tool Loop And Context Sufficiency Gate. **Complete.**
26. `openclaw-convergence.pre-product-spec-02-model-facing-staged-scheduler-tools` - Model-Facing Staged Scheduler Tool Protocol. **Complete.**
27. `openclaw-convergence.pre-product-spec-03-mission-packet-graph-lane` - Pre-Proof Mission Packet And Graph Lane. **Complete.**
28. `openclaw-convergence.pre-product-spec-04-ux-replay-payload-parity` - UX/Replay Payload Parity Gate. **Complete.**
29. `openclaw-convergence.pre-product-spec-05-long-task-budget-progress-smoke` - Long-Task Budget And Progress Smoke. **Complete.**
30. `openclaw-convergence.native-harness-01-supervision-model-call-progress` - Supervision And Model-Call Progress Convergence. **Complete.**
31. `openclaw-convergence.native-harness-02-post-synthesis-parallel-supersteps` - Post-Synthesis Graph Optimizer And Parallel Supersteps. **Complete.**
32. `openclaw-convergence.native-harness-03-non-codex-worker-convergence` - Non-Codex Worker Harness Convergence. **Complete.**
33. `openclaw-convergence.native-harness-04-validation-executor-repair` - Validation Executor And Repair Loop Convergence. **Complete.**
34. `openclaw-convergence.native-harness-05-boundary-replay-checkpoints` - Boundary Replay Checkpoint Completion. **Complete.**
35. `openclaw-convergence.non-codex-tool-worker-runtime` - Non-Codex Tool Worker Runtime And Patch-JSON Retirement. **Complete.**
36. `openclaw-convergence.scheduler-first-node-scoped-context-supply` - Scheduler-First Node-Scoped Context Supply. **Absorbed by resource-materialization block.**
37. `openclaw-convergence.post-context-implementation-task-compiler` - Post-Context Implementation Task Compiler. **Absorbed by resource-materialization block.**
38. `openclaw-convergence.model-task-classification-utility-router-v2` - Model Task Classification And Utility Router v2. **Complete.**
39. `openclaw-convergence.generic-node-resource-materialization-layer` - Generic Node Resource Materialization Layer. **Complete.**
40. `openclaw-convergence.implementation-context-snapshot-compiler` - Implementation Context Snapshot Compiler. **Complete.**
41. `openclaw-convergence.structured-tool-schema-adapter-hardening` - Structured Tool/Schema Adapter Hardening. **Complete.**
42. `openclaw-convergence.scheduler-readiness-state-unification` - Scheduler Readiness State Unification. **Complete.**
43. `openclaw-convergence.product-spec-replay-proof-resource-materialization` - Product/Spec Replay Proof. **Complete 2026-05-21.**
44. `openclaw-convergence.runtime-node-readiness-transition-engine` - Runtime Node Readiness And Transition Engine. **Complete.**
45. `openclaw-convergence.context-scout-execution-packet-request-context-repair` - Context Scout Execution Packet And Request-Context Repair Compiler. **Closed from checkpointed proof evidence.**
46. `openclaw-convergence.parallel-frontier-resource-boundary-hardening` - Parallel Frontier Resource Boundary Hardening. **Partially validated; latest run exposed storage sub-boundary.**
47. `openclaw-convergence.runtime-artifact-payload-store-bounded-manifests` - Runtime Artifact Payload Store And Bounded Manifests. **Implemented; payload storage substrate complete.**
48. `openclaw-convergence.resource-materialization-boundary-replay-canonical-readiness` - Resource Materialization Boundary Replay And Canonical Node Readiness. **Complete.**
49. `openclaw-convergence.split-required-resource-materialization-transition` - Split-Required Resource Materialization Transition. **Next pre-proof blocker.**
50. `openclaw-convergence.runtime-artifact-contract-registry-payload-boundary` - Runtime Artifact Contract Registry And Payload Boundary. **New pre-proof blocker.**
51. `openclaw-convergence.scheduler-frontier-no-progress-evaluation-throttle` - Scheduler Frontier, No-Progress, And Evaluation Throttle. **Complete.**
52. `openclaw-convergence.operator-frontier-readback-latest-run-state` - Operator Frontier Readback And Latest Run State. **Next pre-proof blocker.**
53. `openclaw-convergence.product-spec-large-graph-storage-scheduler-lane` - Large Graph Storage And Scheduler Lane. **New pre-proof blocker.**
54. `openclaw-convergence.mission-ledger-stability-diagnostics` - Mission Ledger Stability Diagnostics. **Implemented; commitment-count drift is diagnostic-only unless packet coverage/evidence is missing.**
55. `openclaw-convergence.staged-mission-ledger-obligation-candidate-compiler` - Staged Mission Ledger Obligation Candidate Compiler. **Diagnostic-only after rollback; not a Product/Spec production gate.**
56. `openclaw-convergence.active-queue-34` - Product/Spec Planning Workflow Plugin Production Proof. **After stabilization lanes.**
57. `openclaw-convergence.native-harness-06-context-pack-supply-chain` - Native Harness Context Pack Supply Chain.
58. `openclaw-convergence.native-harness-07-work-queue-event-push-control` - Work Queue Event Push And Control UX.
59. `openclaw-convergence.native-harness-08-skill-role-harness-integration` - Skill And Role Harness Integration.
60. `openclaw-convergence.product-spec-proof-latency-parallelism` - Product/Spec Proof Latency Reduction And Parallel Runtime Follow-Up. **Keep as post-proof cleanup if any scope remains.**
61. `openclaw-convergence.workflow-runtime-04-workflow-plugin-breadth` - Starter Workflow Plugin Migration.
62. `openclaw-convergence.future-team-workflow-readiness` - Future Team Workflow Readiness.

Post-proof platform items now documented for concurrency and contract cleanup:

51. `openclaw-convergence.toolification-13-compatibility-retirement-bypass-audit` - Compatibility Retirement And Middleware Bypass Audit.
52. `openclaw-convergence.toolification-15-mission-ledger-staged-tools` - Mission Ledger Staged Tools And Evidence Compiler. **Superseded by `openclaw-convergence.staged-mission-ledger-obligation-candidate-compiler`, which is the sharper P0 pre-proof implementation item.**
53. `openclaw-convergence.toolification-16-capability-policy-compiler-hardening` - Capability Policy Compiler Hardening. **Superseded by model-task classification for pre-proof policy; retain only if residual post-proof scope remains.**
54. `openclaw-convergence.toolification-17-worker-file-edit-adapter-expansion` - Worker And File-Edit Adapter Tool Loop Expansion.
55. `openclaw-convergence.toolification-20-work-queue-human-task-tools` - Work Queue And Human Task Toolification.
56. `openclaw-convergence.active-queue-31` - Memory, Retrieval, Context, And Proactivity Toolification.
57. `openclaw-convergence.parallel-runtime-01-graph-execution-joins` - Runtime Parallel Graph Execution And Join Semantics.
58. `openclaw-convergence.parallel-runtime-02-session-background-lanes` - Session And Background Work Concurrency Lanes.
59. `openclaw-convergence.parallel-runtime-03-work-queue-visibility-control` - Work Queue Parallel Runtime Visibility And Control.
60. `openclaw-convergence.model-contract-compiler-consolidation` - Model Contract Compiler Consolidation. **Implemented from the active DB queue before Product/Spec after compatibility-retirement closeout exposed it as the next active item.**

The generic orchestration runtime block now precedes Product/Spec Planning.
Product/Spec should be the first live proof of the generic spine, not another
targeted Product/Spec-specific runner path.

Boundary Replay Checkpoint Completion completed on 2026-05-18. Product/Spec
proof diagnostics now have checkpoint/replay boundaries across router, Mission
Ledger, packets, context, graph compile, worker execution, validation repair,
review/readback, closeout, and Work Queue readback, with upstream-boundary
acceptance gates and owner-visible replay readback.

Product/Spec proof is now paused behind a resource-materialization boundary
replay. The runtime artifact payload/body storage block has been implemented
with canonical payload refs plus bounded manifests. The next pass must add
`before_resource_materialization` and `after_resource_materialization`
checkpoints, make `NodeReadinessState` the single readiness truth, enforce
manifest-only graph metadata, normalize old checkpoint artifacts when safe,
and then replay the failed implementation-resource boundary before running
the full Product/Spec proof from the top.

Product/Spec replay diagnostics now show that the next proof is blocked by
generic runtime scheduler/resource boundaries, not by Product/Spec-specific
logic. The
source-of-truth specs are
`specs/parallel-frontier-resource-boundary-hardening.md`,
`specs/runtime-artifact-payload-store-and-bounded-manifests.md`,
`specs/resource-materialization-boundary-replay-and-canonical-node-readiness.md`,
`specs/context-scout-execution-packet-and-request-context-repair.md`,
`specs/runtime-node-readiness-transition-engine.md`,
`specs/model-task-classification-and-resource-materialization.md`,
`specs/scheduler-first-node-scoped-context-supply.md`, and
`specs/post-context-implementation-task-compiler.md`. The pre-proof work must
reuse OpenClaw's native Runtime Work Graph, Runtime Tool-Call Kernel,
RuntimeWorkerSupervisor, Work Queue event/readback/control, Context Engine,
provider stream wrappers, validation/QA tools, and closeout finalization
instead of adding another parallel proof runner.

## Maximum Toolification Architecture

Documented on 2026-05-16.

The source-of-truth spec is
`specs/maximum-toolification-architecture.md`.

The core correction is that toolification must be the model's working
interface, not only a trace layer around large JSON decisions. Complex
workflow graph creation is now specified as:

1. Mission Ledger.
2. Work breakdown.
3. Capability selection.
4. Node contract definition.
5. Edge or parallelism definition.
6. Runtime graph compilation.
7. Model-authored structure review.
8. Runtime validation/acceptance.
9. First-node execution.

This applies first to `agent_team.coding` because it is the executor for the
Product/Spec Planning implementation proof. The same maximum-toolification
analysis now covers router/front-door, Mission Ledger, scheduler, capability
policy, worker adapters, validation/repair, closeout, Work Queue/human tasks,
Model Memory/proactivity, planning, research, docs/skills, QA/test,
architecture/spec, and gateway/background work. The post-research priority
change is that router/front-door, validation/QA, and closeout finalization now
run before the Product/Spec proof because those layers can still create false
blocks, false terminal failures, or false success even if the scheduler is
healthy.

## Owner-Turn Heartbeat And Prompt Transport

Completed on 2026-05-16.

Background heartbeat/proactivity now yields to accepted owner chat work even
when that work is between UI ack and runtime job visibility. `chat.send`
registers owner-turn activity, heartbeat checks that activity for the base
session and isolated heartbeat sibling, and abort/completion/error clear it
with TTL cleanup for crash recovery.

Long live UX prompts should now be submitted through
`scripts/openclaw-submit-prompt-via-ux.mjs --prompt-file <path>` or `--stdin`.
The prompt is transported as UTF-8 data and artifacts record only bounded hash,
length, and run evidence.

Post-proof items:

See the concurrency/contract block above. Model Memory toolification remains
part of that block and should reuse the same runtime tool-call kernel,
compiler-boundary, trace, and Work Queue readback patterns instead of creating
parallel middleware infrastructure.

## Runtime Parallelism And Contract Boundaries

Documented on 2026-05-16.

The source-of-truth spec is
`specs/runtime-parallelism-and-contract-boundaries.md`.

Key decisions:

- `--prompt-file` UX submission uses the same browser textarea/send path as
  manual operator input; the only difference is the prompt byte source.
- the next Product/Spec proof should include a short post-rebuild
  prompt-file transport smoke before submitting the long prompt.
- heartbeat/proactivity currently yields to active owner turns; later work
  should replace this with lane/conflict-domain concurrency so isolated
  background work can run without stealing the foreground session.
- parallel child node execution should use fan-out/fan-in graph supersteps,
  bounded joins, retry-only-failed-branch behavior, locks, leases, and
  Work Queue/event-stream visibility.
- the Product/Spec proof latency follow-up is now tracked separately in
  `specs/product-spec-proof-latency-and-parallelism.md`; it should run after
  the Product/Spec proof unless latency itself becomes the proof blocker, and
  must review GPT-5.5 use across Mission Ledger, packet authoring/review,
  context synthesis, scheduler graph selection, and repair.
- remaining model/tool contract residue should be consolidated under the
  compiler boundary: models choose work and rationale; runtime derives ids,
  executor refs, evidence enums, storage flags, authority, lifecycle, and
  trace refs.

## Capability/Subject Routing Split

Completed on 2026-05-16.

The Intent Front Door now distinguishes the workflow that executes the work
from workflows or objects that are merely the subject of the requested work.
This keeps implementation prompts from being routed into incomplete target
workflows just because the prompt names that workflow.

Contract:

- `executorWorkflowId`: selected workflow that must own the executable
  capabilities.
- `subjectWorkflowIds`: workflows the work is about.
- `targetSubjectRefs`: bounded refs for workflow/file/doc/runtime targets.
- `requestedCapabilities`: capability classes the executor must support.
- `constraints`: safety and policy boundaries for Mission Ledger/compile
  gates.

The compatibility `workflowId` field maps to `executorWorkflowId` only. Native
submit can run one bounded repair when the executor lacks requested
capabilities. Work Queue readback now exposes the full split so owner-facing
diagnostics do not collapse target subject into execution owner.

## Work Queue Generated Item Lifecycle

Before Product/Spec Planning runs again, the Work Queue now distinguishes real
owner-planned work from generated proof diagnostics and middleware fixtures.
The new source-of-truth spec is
`specs/work-queue-generated-item-lifecycle.md`.

Completed outcome:

- generated proof/helper items carry `originKind`, `terminalPolicy`,
  `parentWorkItemId`, runtime refs, retention policy, and raw-storage flags.
- proof scripts cannot create owner-visible active children through raw
  `createWorkItem(...)`.
- parent closeout finalizes generated children according to terminal policy.
- failed proof diagnostics are archived/debug-only, while failed real owner
  work remains `needs_review`.
- default active queue readback excludes diagnostic children; admin/debug
  readback can still inspect them.
- the leaked 9 middleware proof items and 20 Generic Workflow Runner
  retirement children were cleaned through repository/server transitions with
  bounded artifacts proving the owner active queue is clean.

## Canonical Workflow Runtime Architecture

The first-principles architecture is now documented in
`specs/canonical-workflow-runtime-architecture.md`.

Target shape:

- `RuntimeWorkerSupervisor` claims jobs, renews leases, enforces
  timeout/cancel, invokes adapters/engine, and terminalizes from evidence.
- `RuntimeWorkGraphScheduler` becomes or is wrapped by a canonical
  workflow-agnostic runtime graph engine.
- workflows register `WorkflowDefinition` plugins with input contract,
  Mission Ledger profile, role coverage, capabilities, node executors, tool
  permissions, model/worker policy, evidence profile, human task policy,
  closeout policy, Work Queue projection policy, and live proof
  requirements.
- `agent_team.coding` is extracted from `DynamicAgentTeamGraphRunner` into a
  workflow plugin.
- the old generic workflow queued runner stays deleted; tests and proofs must
  exercise the canonical workflow runtime rather than a shim.
- proof scripts submit through production APIs and observe evidence; they do
  not execute private runner internals.

The build path through Product/Spec Planning is:

1. harden workflow evidence profiles and tool trace readback. **Complete.**
2. add canonical workflow definition registry/engine. **Complete.**
3. extract coding-team plugin from the dynamic runner.
4. retire generic workflow runner production completion.
5. run Product/Spec Planning through OpenClaw as a real workflow plugin proof.

Canonical Workflow Runtime Engine And Workflow Definition Registry completed
on 2026-05-16. The workflow definition registry now records production and
migration-state workflows, `RuntimeWorkflowGraphEngine` gates production
readiness against definition/executor/kernel coverage, `agent_team.coding`
resolves the canonical definition before scheduler execution, generic queued
workflow dispatch refuses scheduler-backed/migration-needed workflows, and
Work Queue readback surfaces definition, engine, completion-review, and gate
state. DB Work Queue item
`openclaw-convergence.workflow-runtime-01-definition-registry` closed from
accepted runtime closeout evidence.

## Product/Spec Planning Production Upgrade

Delivered in the current slice:

- scheduler-backed Product/Spec Planning registration and generic-runner
  rejection.
- production workflow definition and plugin registration for
  `agent_team.product_spec_planning`.
- Product/Spec native execution through the generic orchestration runtime
  contract rather than a bespoke planning runner.
- executable planning node capability manifest for orchestrator, research,
  capsule, human decision, proposal, compiler, and closeout roles.
- Runtime Workflow Graph Engine readiness for Product/Spec Planning when
  plugin, runtime-tool kernel, and executor coverage are present.
- staged scheduler protocol requirements: model-authored work units and
  planning rationale, runtime-derived node envelopes/evidence, structure
  review, graph acceptance, and first-node approval.
- Context Supply Chain requirements for full-prompt volatile access, bounded
  excerpt refs, Commitment Work Packets, context handoffs, optional
  ResearchBrief refs, and context synthesis when multiple packets feed one
  planning graph.
- generic node execution and evidence claim requirements before Mission
  Ledger closure.
- bounded Product/Spec Planning contracts for ResearchBrief, Planning
  Capsule, human decisions, and ActionGraphProposal compile readiness.
- Work Queue readback for active graph progress, boundary replay checkpoints,
  planning capsule refs, research refs/influence, stale assumptions, human
  decision state, action graph proposals, child summaries, compile readiness,
  validation, bounded Mission Ledger evidence state, limitations, and ELI5
  progress.
- bounded owner evidence summary buckets for workflow registration,
  executable node mapping, orchestrator-first proof, action graph
  compile-readiness validation, and commitment evidence claim refs.
- proposal-only boundary: child jobs remain unexecuted until a later
  compile/authority pass.

## Cost-Aware Capability Policy

Completed on 2026-05-15.

- capability manifest v2 now records role class, workflow support, ideal task
  size, context capacity, expected strength, cost class, evidence fit, budget
  policy, failure modes, and escalation/repair guidance
- Runtime Work Graph Scheduler can require cost-aware utility evidence for
  add/run/retry/repair decisions
- production coding-team runner has cost-aware policy enforcement enabled
- orchestrator prompt contract requires utility/cost evidence and premium
  Codex justification
- Work Queue active graph progress readback surfaces selected capability,
  cost class, utility rationale, cost rationale, cheaper-option rationale,
  and considered capabilities
- live dedicated-DB proof closed
  `openclaw-convergence.active-queue-50` from accepted runtime closeout
  evidence

## Scheduler Toolification And Split Planning/Execution

Completed on 2026-05-16.

- scheduler decisions are traced through the Runtime Tool-Call Kernel using
  explicit scheduler tool ids for decomposition, node/edge creation,
  decomposition acceptance/rejection, next-node selection, human decision,
  needs-review, closeout request, and `worker.invoke`
- the production gateway runtime registers scheduler tools and passes the
  kernel into live `agent_team.coding` graph execution
- Work Queue active graph progress readback includes scheduler phase, latest
  scheduler tool id, and runtime-tool invocation refs
- live dedicated-DB proof executed context, implementation, and validation
  nodes through traced runtime operations and closed
  `openclaw-convergence.active-queue-22` through accepted closeout evidence

## Worker Tool Loops And Non-Codex File-Edit Worker

Completed on 2026-05-16.

- the generic file-edit worker adapter records Runtime Tool-Call Kernel traces
  for inspect, plan, patch proposal, patch apply, validation, repair/failure
  classification, escalation, and bounded evidence handoff
- Kimi is a production implementation lane on that generic adapter, not a
  proof-only micro-agent or one-shot patch oracle
- Kimi receives bounded file snapshots plus an orchestrator-style task packet
  with exact objective, target refs, context handoff, expected output,
  acceptance criteria, validation refs, and repair feedback
- failed Kimi attempts are atomic: patch/apply or validation failure restores
  the pre-attempt file snapshots before a retry or escalation
- Work Queue runtime readback links closed items back to the closeout runtime
  job and surfaces worker tool traces, changed-file refs, and validation refs
- live OpenRouter/Kimi proof edited
  `extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts`
  and its focused test, ran validation, recorded worker tool invocations, and
  closed `openclaw-convergence.active-queue-21` from accepted evidence
- worker-loop v2 proof then extended the lane with bounded context expansion
  requests, context provide/deny tool traces, multi-step edit plans,
  validation repair after context expansion, and commitment-linked evidence
  claims. Live OpenRouter/Kimi proof closed
  `openclaw-convergence.non-codex-worker-loop-v2` from accepted runtime
  closeout evidence.
- model-agnostic expansion then promoted the non-Codex worker lane to a
  reusable specialization contract with phase emissions. Kimi is the first
  production implementation specialization; non-Codex context scout, test
  writer, docs editor, and validation failure explainer are declared on the
  same substrate. Live OpenRouter/Kimi proof emitted 15 worker phase events,
  used repo search/read/test-inspection tools, repaired validation in the same
  loop, and closed `openclaw-convergence.non-codex-tool-using-worker` from
  accepted runtime closeout evidence.
- large-task decomposition hardening then made qualified non-Codex use a
  scheduler obligation instead of prompt theater. Complex coding missions now
  reject broad Codex-first plans, preserve task-family and model
  qualification refs through the decision compiler, route specialized
  capability executor keys to their intended executors, and require
  commitment-mapped non-Codex child tasks with handoff edges. The dedicated-DB
  proof executed context, Kimi implementation, validation explanation, and
  review nodes, materialized four Work Queue children, and closed
  `openclaw-convergence.non-codex-large-task-decomposition` from accepted
  runtime closeout evidence.

Mission Ledger Evidence Claims And Finalization Handoff and Work Queue
Tool/Event Readback completed on 2026-05-16.

- scheduler nodes now return explicit commitment-linked evidence claims.
- production `agent_team.coding` requires those claims before Mission Ledger
  evaluation can close work.
- the Mission Ledger evaluator accepts claimed evidence only and has one
  bounded repair attempt for malformed evaluator output.
- Work Queue owner readback and UI detail show active graph/tool progress,
  evidence claim refs, open commitments, current node, role/model, tool id,
  validation state, and next decision.
- live dedicated-DB proof closed both queue items from accepted runtime
  closeout evidence using runtime job
  `mission-ledger-tool-readback-1778907616712-job`.

Model Call Toolification And Model Task Middleware Collapse completed on
2026-05-16.

- `model.call` is the canonical runtime tool family for live model-task
  provider calls.
- model-task middleware is now the facade for contract validation, routing
  evidence, runtime-job completion, and Work Queue readback.
- live model-task completion requires the Runtime Tool-Call Kernel.
- provider prompts are volatile executor-only input, not persisted trace
  metadata.
- `providerCallMade: true` requires `model_task.runtime_tool_trace` evidence
  with a `runtime-tool://...` invocation ref.
- runtime tool traces persist bounded refs, hashes, model/provider refs,
  usage, status, and raw-storage flags.
- Work Queue middleware readback surfaces model-call invocation refs for
  model tasks.
- dedicated-DB proof made a real Codex app-server JSON model call and closed
  `openclaw-convergence.toolification-08-model-call-toolification` from
  accepted adoption-gate evidence.

Workflow Evidence Profiles And Tool Trace Readback Hardening completed on
2026-05-16.

- canonical profile module:
  `extensions/execution-platform/src/workflows/workflow-evidence-profile.ts`
- profile artifact:
  `execution.workflow_evidence_profile_evaluation`
- production `agent_team.coding` success now requires profile acceptance.
- generic queued workflow completion cannot succeed from model-authored
  closeout alone.
- Work Queue readback surfaces profile status, accepted/missing evidence
  classes, reason codes, profile artifact refs, and deep-completion review
  requirements.
- dedicated-DB proof closed
  `openclaw-convergence.toolification-11-workflow-evidence-profiles-readback`
  from accepted adoption-gate evidence.

Next queue item: Canonical Workflow Runtime Engine And Workflow Definition
Registry.

## 2026-05-23 Product/Spec Pre-Proof Dispatch Gate

New immediate pre-proof item:

1. `openclaw-convergence.execution-intent-evidence-mode-worker-dispatch`
2. `openclaw-convergence.active-queue-34`

The dispatch item exists because Product/Spec after-resource replay proved the
runtime could materialize packets but still had an executor-class ambiguity:
a read-only/source-grounding task was represented as an implementation node
and selected by the worker-smoke harness. The fix is not a prompt heuristic.
Execution intent is model-authored, evidence mode is runtime-derived, and
file-edit dispatch is structurally gated on `source_edit` plus
`changed_file_evidence`.

## Generic Orchestration Substrate

Completed on 2026-05-17.

This roadmap item generalizes coding-team orchestration into a reusable
workflow substrate:

- workflow definitions include orchestration policies.
- workflow plugins surface orchestration refs, phases, role classes, and
  context needs.
- scheduler node results use a generic evidence-claim contract.
- Work Queue readback shows workflow orchestration metadata.
- future design and marketing teams are registered as migration-state
  workflows, not production success paths.

Remaining roadmap implications:

- Product/Spec Planning still needs its full OpenClaw implementation/proof.
- web research, docs/skills, QA/test, architecture, design, and marketing need
  executable workflow plugins before they can become production-ready.

## Context Supply Chain And Context Scout Tool Loop

Completed on 2026-05-17 as a pre-proof hardening slice before the next
Product/Spec Planning run.

- `source_prompt.index`, `source_prompt.request_excerpt`,
  `source_prompt.provide_excerpt`, and `source_prompt.deny_excerpt` are
  registered runtime tools.
- source prompts are exposed through bounded section refs and summaries, not
  raw prompt storage.
- context scout may request bounded prompt excerpts and receives them as
  volatile input for one follow-up turn.
- CommitmentWorkPackets now include commitment meaning, context request hints,
  required evidence-claim descriptions, stop-if-missing rules, and review refs.
- context scout output compiles into ContextHandoffPackets with verified file
  refs and implementation handoff summaries.
- implementation nodes that require upstream context stop before editing if
  no context handoff packet exists.
- Work Queue readback surfaces source-prompt status, excerpt decisions,
  verified context files, context handoff refs, and blockers.

Next proof gate: inspect Mission Ledger, CommitmentWorkPacket,
source-prompt-context, and ContextHandoffPacket quality before allowing
Product/Spec Planning implementation nodes to run.

## Script And DB Operation Toolification

Completed on 2026-05-16.

- `script.execute` is the canonical Runtime Tool-Call Kernel family for live
  script-job execution through approved handlers.
- `db_operation.execute` is the canonical Runtime Tool-Call Kernel family for
  live DB-operation execution through approved operation handlers.
- script-job and DB-operation repositories remain the bounded
  contract/lifecycle/readback facades, but live completion paths require
  runtime tool trace artifacts when trace evidence is marked required.
- RuntimeWorkerSupervisor script/DB middleware adapters are runtime-tool
  backed, direct model-task supervisor provider claims are rejected without
  `model.call` trace evidence, and old fixture helpers require explicit
  proof-only guards.
- Model Memory runtime middleware bridge callsites now use runtime tool traces
  for their Execution Platform model-task and DB-operation evidence jobs.
- Work Queue middleware readback surfaces runtime tool invocation refs for
  script and DB operation jobs.
- arbitrary shell commands and raw SQL payloads are not accepted by the
  runtime tool contracts.
- dedicated-DB proof ran real script and DB operation live completion, closed
  `openclaw-convergence.toolification-09-script-db-toolification` from
  accepted adoption-gate evidence, and recorded bounded artifact refs in
  `.artifacts/execution-platform/script-db-toolification-summary.json`.

## Closeout Toolification And Legacy Retirement

Completed on 2026-05-16.

- `closeout.generate` is the canonical Runtime Tool-Call Kernel family for
  production model-authored Closeout Capsule generation.
- the closeout runtime tool wraps the model-first Closeout Capsule reporter
  and stores bounded trace metadata: closeout refs, hashes, model refs,
  task-success state, role/opportunity counts, timing, reason codes, and
  raw-storage flags.
- production gateway runtime registers `closeout.generate` with the scheduler
  tool registry.
- dynamic coding-team graph closeout invocation uses `closeout.generate` when
  a Runtime Tool Kernel is present.
- degraded/system closeout is diagnostic-only and cannot satisfy
  adoption-gate success.
- dedicated-DB proof made a real Codex app-server model call, generated a
  model-authored Closeout Capsule, and closed
  `openclaw-convergence.toolification-10-closeout-generate-toolification`
  from accepted adoption-gate evidence.
- proof summary:
  `.artifacts/execution-platform/closeout-toolification-summary.json`

Next queue item: Canonical Workflow Runtime Engine And Workflow Definition
Registry.
