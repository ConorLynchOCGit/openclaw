# Execution Platform Status

## 2026-05-25 Product/Spec System Spec Refresh And Proof Readiness

The Product/Spec Planning production workflow spec now describes the actual
system being built, not only the proof harness. Product/Spec Planning is a
first-class planning/proposal workflow on the generic orchestration runtime.
Its canonical outcomes are `PlanningIntentRecord`, optional `ResearchBrief`,
`PlanningCapsule`, optional `HumanPlanningDecision`, `ActionGraphProposal`,
`CompileRuntimePlanResult`, and `ProductSpecPlanningCloseout`.

The canonical node shape is planning-first:

1. `planning_orchestrator`
2. optional `web_research`
3. `planning_capsule`
4. optional `human_task`
5. `action_graph_compile`
6. `reviewer`
7. `closeout`

Product/Spec Planning remains proposal-only: it can compile child work
proposals and feasibility evidence, but cannot execute child runtime jobs or
mutate child lifecycle state without a later explicit authority boundary.

The proof prompt has been updated to require:

- `openclaw-convergence.control-plane-07-readback-telemetry-proof` closed
  from readback/runtime evidence before the full proof;
- live gateway check/test/build/start health evidence before proof
  submission;
- prompt hash recording from the canonical prompt artifact;
- WorkIntent-first coding-team behavior for Product/Spec-as-target prompts;
- no `context_synthesis group -> implementation node` shortcut.

The immediate queue remains:

1. `openclaw-convergence.control-plane-07-readback-telemetry-proof`
2. `openclaw-convergence.active-queue-34`

## 2026-05-24 WorkIntent Control-Plane Recovery Queue Reset

The current Product/Spec proof path is now gated by the WorkIntent
control-plane contract:

- `docs/projects/execution-platform/specs/work-intent-control-plane-contract.md`
- `docs/projects/execution-platform/specs/control-plane-coding-team-recovery.md`

The latest failure class is systemic: model-authored semantic groups,
context handoffs, scheduler graph nodes, resource materialization, workers,
validation, and evidence still do not share one canonical contract for work
kind, capability, resources, progress, evidence, and next transition. The
forbidden production path is now explicit:

```text
context_synthesis group -> implementation node
```

Context synthesis remains available only as explicit workflow-defined
coordination or diagnostic replay infrastructure. It is not default glue for
the coding-team Product/Spec proof.

Re-ranked pre-proof Work Queue path:

1. `openclaw-convergence.control-plane-01-spec-reconciliation`
   - Spec Reconciliation And Control-Plane Reset. **Closed.**
2. `openclaw-convergence.control-plane-02-workintent-contract-compiler`
   - WorkIntent Contract And Runtime Compiler. **Closed.**
3. `openclaw-convergence.control-plane-03-context-synthesis-retirement-replay-alignment`
   - Coding Path Context Synthesis Retirement And Replay Alignment. **Closed.**
4. `openclaw-convergence.control-plane-04-node-scoped-context-readiness`
   - Node-Scoped Context Broker And Readiness Enforcement. **Closed.**
5. `openclaw-convergence.control-plane-05-resource-materialization-worker-gate`
   - Resource Materialization And NodeExecutionPacket Worker Gate. **Closed.**
6. `openclaw-convergence.control-plane-06-worker-small-verb-edit-smoke`
   - Worker Small-Verb Edit Smoke Proof. **Closed.**
7. `openclaw-convergence.control-plane-07-readback-telemetry-proof`
   - Owner Readback And Telemetry Proof. **Next.**
8. `openclaw-convergence.active-queue-34`
   - Product/Spec Planning Workflow Plugin Production Proof.

The full tool facade expansion remains preserved as a post-proof queue item,
not dropped.

Implementation evidence for the closed WorkIntent compiler item:

- `extensions/execution-platform/src/workflows/work-intent.ts` defines the
  runtime-compiled, non-runnable `work_intent` node contract and rejects
  missing explicit execution intent, runtime-authored envelope fields, unknown
  capabilities, and execution-intent/capability conflicts.
- `extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts`
  compiles staged scheduler work units into WorkIntent nodes by default rather
  than executable implementation nodes. The previous staged-scheduler
  executable-node bypass flag was removed.
- `extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts`
  treats WorkIntent as non-runnable control-plane state, exposes WorkIntent
  scheduler tools, and validates WorkIntent metadata without requiring the
  executable worker envelope.
- `extensions/execution-platform/src/workflows/cost-aware-capability-policy.ts`
  and `post-synthesis-graph-policy.ts` read target capability metadata from
  WorkIntent manifests without Product/Spec string classifiers.
- Focused validation passed:
  `pnpm test:file extensions/execution-platform/src/workflows/work-intent.test.ts extensions/execution-platform/src/workflows/orchestrator-graph-decision.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts`
  passed 140 tests.
- Scoped type validation passed:
  `pnpm tsgo:fast -- ...work-intent/orchestrator/scheduler/capability-policy/post-synthesis/worker-loop files`.

Implementation evidence for the closed worker small-verb edit smoke item:

- after-resource replay selected the Product/Spec-derived
  source-spec-intake implementation node from
  `product-spec-replay-f69b40c5defa3687`;
- the worker received a hydrated `NodeExecutionPacket`, coding resource
  packet, implementation context packet, implementation task packet, and
  canonical readiness state;
- Qwen handled controller/context selection and Kimi handled the forced
  patch-author slot with `reasoningMode: none`;
- bounded snapshot windows now support distant large-file ranges through
  explicit `targetRegions`/`lineRanges`, with runtime-owned hashes, bounds,
  line ranges, and truncation state;
- the worker applied a scoped source edit, ran structural validation, recorded
  commitment-linked evidence, and rolled back the changed file under
  `rollback_after_review_artifact` for review;
- focused worker-loop tests and scoped type validation passed, including a
  regression for a 1,000-line file with two distant patch windows.

Implementation evidence for the closed context-synthesis retirement item:

- `runtimeCompiledPostSynthesisGraphDecision` no longer builds executable
  implementation, validation, review, readback, or closeout nodes from an
  accepted context-synthesis artifact.
- Accepted context-synthesis groups are coordination evidence only. The
  scheduler can compile them into non-runnable `work_intent` nodes only when
  each group provides model-authored `executionIntent`, selected/recommended
  capability, objective, expected output, success criteria, and downstream
  consumer fields.
- Missing or conflicting group fields produce `mark_needs_review` with
  `runtime_post_synthesis_workintent_compile_blocked` and bounded per-group
  diagnostics; runtime does not infer semantic intent from group prose.
- Boundary replay now treats `after-context-synthesis` as legacy diagnostic
  only and requires accepted node-scoped context for `after-graph-selection`.
- Focused validation passed:
  `pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/codex-bridge/product-spec-boundary-replay-topology.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts`
  passed 107 tests.
- Additional regression validation passed:
  `pnpm test:file extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts extensions/execution-platform/src/workflows/orchestrator-graph-decision.test.ts`
  passed 46 tests.
- Scoped type validation passed:
  `pnpm tsgo:fast -- extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts extensions/execution-platform/src/codex-bridge/product-spec-boundary-replay-topology.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts scripts/execution-platform-run-product-spec-boundary-replay.mjs`.

Implementation evidence for the closed node-scoped context broker/readiness
item:

- WorkIntent nodes that require `context_handoff` now block at
  `node_scoped_context_supply` when context is missing, in progress, or only
  signal-level evidence.
- `accepted_with_limitations` context cannot unlock implementation unless
  the node carries a consumer-specific limitation waiver ref.
- Context broker requests are compiled from canonical readiness state and
  dispatched as prerequisite context scout nodes with request refs,
  target-node ids, reason codes, semantic questions, candidate resource refs,
  and `context_supplies` edges.
- `ContextScoutExecutionPacket` carries the broker request summary and prompt
  instruction so context scouts answer the downstream consumer's specific
  question.
- Scheduler snapshots/readback expose root runtime job id, resource
  requirement kinds, target refs, context questions, context snapshot refs,
  context status, limitation status, and waiver refs.
- Focused validation passed:
  `pnpm test:file extensions/execution-platform/src/workflows/context-broker.test.ts extensions/execution-platform/src/workflows/context-scout-execution-packet.test.ts extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
  passed 114 tests.
- Regression validation passed:
  `pnpm test:file extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/codex-bridge/product-spec-boundary-replay-topology.test.ts`
  passed 14 tests.
- Work Queue readback validation passed:
  `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  passed 168 tests.
- Scoped type validation passed over context-broker, context-scout packet,
  scheduler, scheduler contracts, context-scout executor, and dynamic graph
  runner files.

Implementation evidence for the closed resource materialization / worker gate
item:

- `extensions/execution-platform/src/workflows/node-resource-materialization.ts`
  now defines a first-class `read_only_resource_packet` contract alongside
  coding resource packets.
- canonical readiness blocks missing resource bodies, resource kind mismatch,
  read-only packets carrying changed-file evidence, implementation nodes
  without `source_edit`, and coding workers without target snapshots/new-file
  intents plus validation refs or validation discovery.
- worker invocation now requires a hydrated domain resource packet body for
  both coding and read-only resource kinds. Manifest refs remain graph/readback
  state; they are not sufficient at the worker boundary.
- scheduler resource gating no longer honors `nodeExecutionPacketRequired:
false` for file-edit node kinds. That metadata can only opt out non-file-edit
  lanes.
- owner-facing node packet readback includes execution intent, evidence mode,
  node id/kind, capability, executor, and worker ref.
- Focused validation passed:
  `pnpm test:file extensions/execution-platform/src/workflows/node-resource-materialization.test.ts`
  passed 16 tests.
- Scheduler validation passed:
  `pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
  passed 93 tests.
- Regression validation passed:
  `pnpm test:file extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/codex-bridge/product-spec-boundary-replay-topology.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  passed 182 tests.
- Provider-free frontier proof passed:
  `node scripts/execution-platform-run-scheduler-frontier-no-progress-evaluation-throttle-proof.mjs`.
- Scoped type validation passed via `pnpm tsgo:fast` over the touched
  materialization, scheduler, test, readback, and proof script surfaces.

## 2026-05-24 Control-Plane Coding Team Recovery

This section is superseded by the WorkIntent queue reset above. The governing
recovery specs are now `control-plane-coding-team-recovery.md` and
`work-intent-control-plane-contract.md`.

The latest top-of-pipe proof reached Mission Ledger, packet authoring, staged
scheduler entry, context scouts, and then failed before implementation at
context-synthesis group expansion. The hard blocker was deterministic:
Qwen group-expansion payloads exceeded structured-adapter input bounds and
requested a timeout above the selected profile. No source edits landed.

Direction:

- stop treating global context synthesis as the default pre-implementation
  proof gate;
- create task DAG nodes first from obligations/packets;
- supply context to those nodes on demand;
- run implementation only from hydrated `NodeExecutionPacket`s;
- prove one real Product/Spec-derived worker edit before another full
  Product/Spec proof;
- keep the full toolification catalog documented as post-proof architecture.

Implementation update:

- added the governing control-plane recovery spec;
- updated project index, current slice, roadmap, decisions, and spec index;
- added a pre-proof coding tool facade normalization path for small public
  tool verbs such as `repo.search`, `repo.open_file`, `edit.search_replace`,
  `edit.apply_patch`, `checks.run`, and `context.request_more`, which
  normalize into existing runtime-owned worker tools instead of exposing raw
  internal graph/runtime schemas.

## 2026-05-24 Progress, Readback, And Runtime Event Modularization

Status: implemented with focused validation passing; closeout script added
for DB Work Queue lifecycle.

Completed item:

- `openclaw-convergence.pre-proof-02-progress-readback-runtime-event-modularization`
  - Progress, Readback, And Runtime Event Modularization.

Implementation evidence:

- `extensions/execution-platform/src/work-queue/execution-read-model.ts`
  now delegates active graph progress and runtime artifact payload manifest
  projection to production projection modules instead of owning the old
  monolithic projection bodies inline.
- `extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts`
  owns active graph progress assembly over scheduler events, compact
  latest-run-state, graph/frontier summaries, branch results, readiness refs,
  worker progress, model call progress, and boundary replay refs.
- `extensions/execution-platform/src/work-queue/projections/boundary-replay-readback.ts`
  owns boundary replay readback projection from compact checkpoint/plan refs
  and latest-run-state replay state.
- `extensions/execution-platform/src/work-queue/projections/worker-internal-progress.ts`
  owns worker-internal model/tool/phase/latency/output-hash/readiness
  projection without raw prompt, provider, tool, command, DB, or hidden
  reasoning bodies.
- `extensions/execution-platform/src/work-queue/projections/model-usage-walltime.ts`
  owns model-call phase, walltime, usage, task policy, and provider
  diagnostics projection with bounded diagnostic body scrubbing.
- `extensions/execution-platform/src/work-queue/projections/runtime-artifact-manifest.ts`
  owns payload manifest projection by refs, counts, artifact types, and
  hydration tool id only.
- `extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts`
  proves projection modules are testable outside full Work Queue read-model
  construction, preserve active node/branch/blocker/readiness/model/tool
  readback, and do not expose body-shaped raw provider content.

Validation:

- `pnpm test:file extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts`
  passed 176 tests.
- `pnpm tsgo:fast -- extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts extensions/execution-platform/src/work-queue/projections/boundary-replay-readback.ts extensions/execution-platform/src/work-queue/projections/model-usage-walltime.ts extensions/execution-platform/src/work-queue/projections/worker-internal-progress.ts extensions/execution-platform/src/work-queue/projections/runtime-artifact-manifest.ts extensions/execution-platform/src/work-queue/projections/projection-utils.ts extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts`
  passed via the repo fallback checker.

Next item:

- `openclaw-convergence.toolification-13-compatibility-retirement-bypass-audit`
  - Compatibility Retirement And Middleware Bypass Audit.

## 2026-05-24 Generic Replay And Readiness Lifecycle

Status: implemented with focused validation passing; closeout script added
for DB Work Queue lifecycle.

Completed item:

- `openclaw-convergence.post-proof-03-generic-replay-readiness-lifecycle`
  - Generic Replay And Readiness Lifecycle.

Implementation evidence:

- `extensions/execution-platform/src/workflows/boundary-replay-registry.ts`
  now owns the workflow-agnostic boundary registry: boundary ids, required
  upstream checkpoints, versioned normalizers, resume command defaults,
  allowed next transitions, terminal blocker classes, readback projection
  fields, and diagnostic-only policy.
- `extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts`
  now compiles replay plans and production continuations from the registry
  instead of private dependency maps. Plans carry registry version,
  diagnostic-only status, allowed transitions, blocker classes, readback
  fields, and exact missing checkpoint kinds.
- `after_context_synthesis` is hard-coded by registry as diagnostic-only.
  Replay plans for that boundary require explicit diagnostic allowance and
  cannot become normal production continuation by default.
- Work Queue active graph readback now surfaces registry-backed replay fields:
  registry version, diagnostic-only status, allowed next transitions,
  terminal blocker classes, readback projection fields, latest accepted
  checkpoint kind, and missing checkpoint kinds.
- The Product/Spec replay CLI now resolves supported boundaries through the
  canonical registry and records registry-aware checkpoints instead of
  carrying a separate legacy boundary policy.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts`
  passed 203 tests.

Next item:

- `openclaw-convergence.pre-proof-02-progress-readback-runtime-event-modularization`
  - Progress, Readback, And Runtime Event Modularization.

## 2026-05-24 Dynamic Runner Plugin Thinning

Status: implemented with focused validation passing; closeout script added
for DB Work Queue lifecycle.

Completed item:

- `openclaw-convergence.post-proof-02-dynamic-runner-plugin-thinning`
  - Dynamic Runner Plugin Thinning.

Implementation evidence:

- `extensions/execution-platform/src/workflows/generic-orchestration-runtime-execution.ts`
  now owns generic workflow plugin resolution artifacts, generic runtime
  readiness artifacts, generic runtime spine readiness/lifecycle artifacts,
  and generic orchestration runtime result persistence.
- `extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`
  delegates generic runtime execution artifact lifecycle to
  `runAndPersistGenericSchedulerGraph(...)` instead of instantiating and
  persisting generic runtime/spine objects inline.
- `extensions/execution-platform/src/codex-bridge/coding-team-runtime-adapter.ts`
  owns coding-team scheduler executor registration. The dynamic runner now
  calls that adapter rather than locally spelling the role/kind executor map.
- `extensions/execution-platform/src/workflows/generic-orchestration-runtime-execution.test.ts`
  proves generic start/result artifact persistence outside the coding runner.
- `extensions/execution-platform/src/codex-bridge/coding-team-runtime-adapter.test.ts`
  proves coding-specific executor registration stays in the coding adapter
  surface.
- `extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts`
  now guards that the dynamic runner delegates generic runtime artifact
  lifecycle to the generic execution service.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/generic-orchestration-runtime-execution.test.ts extensions/execution-platform/src/codex-bridge/coding-team-runtime-adapter.test.ts extensions/execution-platform/src/workflows/generic-runtime-spine.test.ts extensions/execution-platform/src/workflows/generic-orchestration-runtime.test.ts extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.test.ts extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts`
  passed 53 tests.

Next item:

- `openclaw-convergence.post-proof-03-generic-replay-readiness-lifecycle`
  - Generic Replay And Readiness Lifecycle.

## 2026-05-24 Generic Runtime Spine Extraction

Status: implemented with focused validation passing; closeout script added
for DB Work Queue lifecycle.

Completed item:

- `openclaw-convergence.post-proof-01-generic-runtime-spine-extraction`
  - Generic Runtime Spine Extraction.

Implementation evidence:

- `extensions/execution-platform/src/workflows/generic-runtime-spine.ts`
  now owns the generic production lifecycle boundary for workflow readiness
  composition, scheduler-option gates, scheduler-result lifecycle status, and
  graph-evidence false-success prevention.
- `extensions/execution-platform/src/workflows/generic-orchestration-runtime.ts`
  delegates readiness, scheduler-option, and scheduler-result lifecycle
  decisions to the spine instead of keeping those decisions inline.
- `extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`
  persists first-class generic runtime spine readiness and lifecycle artifacts
  while keeping coding executors/adapters in the coding plugin surface.
- `extensions/execution-platform/src/workflows/generic-runtime-spine.test.ts`
  proves production coding readiness, a non-coding docs/skills readiness
  lane, scheduler-option gate rejection, and false-success downgrade through
  the same generic spine.
- `extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts`
  now guards the generic spine against coding adapter, Product/Spec, proof,
  and replay imports.
- `scripts/execution-platform-record-generic-runtime-spine-closeout.mjs`
  records bounded closeout evidence and a full source-inventory boundary
  audit. Remaining broad hard blocks are explicitly deferred to the dynamic
  runner thinning and compatibility-retirement items.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/generic-runtime-spine.test.ts extensions/execution-platform/src/workflows/generic-orchestration-runtime.test.ts extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.test.ts extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts`
  passed 31 tests.
- `pnpm tsgo:fast ...` over the generic spine/runtime/runner touched slice
  passed.

Next item:

- `openclaw-convergence.post-proof-02-dynamic-runner-plugin-thinning`
  - Dynamic Runner Plugin Thinning.

## 2026-05-24 Boundary Guardrails Implementation

Status: implemented and focused validation passing; closeout script added for
DB Work Queue lifecycle.

Completed item:

- `openclaw-convergence.pre-proof-01-execution-platform-characterization-guardrails`
  - Characterization And Import Boundary Guardrails.

Implementation evidence:

- `extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.ts`
  defines the typed boundary classifier, module ownership map, import
  extraction/resolution helpers, and guardrail audit result.
- `extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.test.ts`
  proves classification, production/proof import blocking, diagnostic
  proof-script imports of runtime services, context-synthesis replay-glue
  detection, and current production module characterization.
- `extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts`
  now runs the typed audit against current production files and guards against
  Product/Spec-specific examples in generic graph repair prompts.
- `extensions/execution-platform/src/workflows/generic-workflow-runner-retirement-contract.ts`
  now owns the generic-runner retirement constants so Work Queue readback does
  not import the deleted generic queued workflow runner module.
- `scripts/execution-platform-record-boundary-guardrails-closeout.mjs`
  records bounded audit and closeout evidence with raw-storage flags false.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/codex-bridge/product-spec-boundary-replay-topology.test.ts extensions/execution-platform/src/codex-bridge/runtime-api-export-hygiene.test.ts extensions/execution-platform/src/workers/middleware-bypass-audit.test.ts`
  passed 21 tests.

Next item:

- `openclaw-convergence.post-proof-01-generic-runtime-spine-extraction`
  - Generic Runtime Spine Extraction.

## 2026-05-23 Pre-Product/Spec Modularization Queue Update

The next Product/Spec proof is no longer the immediate queue head. The
latest replay/topology cleanup showed that stale proof/runtime glue can
reintroduce older architecture even after production policy moves on. The
refactor work that was previously deferred until after Product/Spec is now a
pre-proof cleanup tranche.

Governing spec:

- `docs/projects/execution-platform/specs/pre-product-spec-execution-platform-modularization.md`

Promoted queue items before Product/Spec:

1. `openclaw-convergence.pre-proof-01-execution-platform-characterization-guardrails`
   - Characterization And Import Boundary Guardrails.
2. `openclaw-convergence.post-proof-01-generic-runtime-spine-extraction`
   - Generic Runtime Spine Extraction. **Promoted to pre-proof despite the
     historical id.**
3. `openclaw-convergence.post-proof-02-dynamic-runner-plugin-thinning`
   - Dynamic Runner Plugin Thinning. **Promoted to pre-proof despite the
     historical id.**
4. `openclaw-convergence.post-proof-03-generic-replay-readiness-lifecycle`
   - Generic Replay And Readiness Lifecycle. **Promoted to pre-proof despite
     the historical id.**
5. `openclaw-convergence.pre-proof-02-progress-readback-runtime-event-modularization`
   - Progress, Readback, And Runtime Event Modularization.
6. `openclaw-convergence.toolification-13-compatibility-retirement-bypass-audit`
   - Compatibility Retirement And Middleware Bypass Audit. **Closed from DB
     closeout with accepted adoption-gate evidence.**
7. `openclaw-convergence.model-contract-compiler-consolidation`
   - Model Contract Compiler Consolidation. **Closed from DB closeout after
     focused compiler/orchestrator/no-semantic-cheats validation.**
8. `openclaw-convergence.active-queue-34`
   - Product/Spec Planning Workflow Plugin Production Proof.

Refactor-like items not promoted:

- `openclaw-convergence.post-proof-04-cross-workflow-orchestration-proof-lanes`
  remains post-proof because it is a cross-workflow proof expansion rather
  than cleanup needed before the Product/Spec slice.
- runtime artifact retention/pruning, scheduler phase budgets, Work Queue
  frontier delta streams, workflow breadth, memory/proactivity
  toolification, role/model benchmarks, and future team adapters remain
  after Product/Spec unless a later proof failure directly implicates them.

## 2026-05-23 Demand-Driven Frontier Orchestration Update

Latest after-resource worker-smoke update:

- split-child readiness now works for materialized implementation children;
- bounded repo read windows and partial denied refs now work in the
  non-Codex worker loop;
- repeated pre-edit context expansion is now blocked before unlimited
  context-only churn;
- the remaining blocker is not "Kimi failed to edit." The selected node is
  source-grounding/read-only evidence, but the proof harness dispatched it as
  edit-required implementation and expected changed-file refs.

New P0 spec:

- `docs/projects/execution-platform/specs/execution-intent-evidence-mode-and-worker-dispatch.md`

This is a generic scheduler/runtime contract issue. Models must author
execution intent; runtime must compile evidence mode and route only
edit-required nodes to file-edit workers.

The latest Product/Spec replay reached context scout handoffs, implementation
context materialization, and split implementation task packet creation, then
failed before source edits because `agent_team.scheduler_progress` metadata
attempted to store a 114KB body against the 64KB manifest contract. The
failure is generic: large workflow graph expansion and progress emission can
still grow faster than useful worker execution.

New governing spec:

- `docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md`

Pre-proof queue direction after Work Queue reconciliation:

1. GraphPatch Payload Store And Progress Compaction. **Complete.**
2. Demand-Driven Context Broker And Lazy Readiness. **Complete.**
3. Expansion Controller And Dynamic Fanout Admission. **Complete.**
4. Superstep Frontier Runtime And Branch Results. **Complete.**
5. Readback Projection And Replay Boundary Expansion. **Complete.**
6. Semantic Microtask Refinement And Worker Packet Quality. **Complete.**
7. Product/Spec Replay From The Failed Boundary. **Complete.**
8. Execution Intent, Evidence Mode, And Worker Dispatch. **Complete.**
9. Full Product/Spec Planning Workflow Plugin Production Proof. **Next.**
10. Runtime Artifact Retention And Pruning Policy. **Immediate post-proof.**
11. Scheduler Phase Budget Governor. **Immediate post-proof.**
12. Work Queue Frontier Delta Stream And Branch Controls. **Immediate
    post-proof.**

Work Queue lifecycle cleanup:

- `openclaw-convergence.mission-ledger-stability-diagnostics` is closed from
  existing implementation/docs evidence. It no longer sits in the active
  Product/Spec proof path.
- `openclaw-convergence.staged-mission-ledger-obligation-candidate-compiler`
  is superseded as diagnostic-only infrastructure. It is not a production
  Mission Ledger path and is not a Product/Spec blocker.
- The three remaining policy/readback items are active after Product/Spec,
  not before it.

This supersedes the old idea that all context fanout must complete before any
implementation branch can move. Implementation-bearing nodes may inspect
their execution packet, request missing context/resources, and produce an
edit plan, but file edits and success claims remain blocked until canonical
`NodeReadinessState` is executable for that branch.

GraphPatch implementation evidence:

- `execution_platform.runtime_graph_patch` is registered as a payload-backed
  runtime artifact contract.
- production `DynamicAgentTeamGraphRunner.attachProgress` writes a graph
  patch payload before `agent_team.scheduler_progress`.
- scheduler progress now carries graph patch refs/counts/hashes/samples
  instead of large frontier/graph bodies.
- latest-run-state and Work Queue readback project graph patch state.
- closeout:
  `.artifacts/execution-platform/graphpatch-payload-progress-compaction/closeout.json`
- validation:
  `pnpm test:file extensions/execution-platform/src/workflows/runtime-graph-patch.test.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  passed 182 tests.

Demand-Driven Context Broker implementation evidence:

- `ContextBrokerRequest` is a strict payload-backed runtime artifact at
  `execution_platform.context_broker.request`.
- production implementation resource materialization now emits a
  branch-local context broker request when canonical `NodeReadinessState`
  returns `repairAction: request_context_repair`.
- scheduler runtime tools include
  `context_broker.submit_request`,
  `context_broker.resolve_inherited_context`,
  `context_broker.dispatch_context_scout`, and
  `context_broker.mark_consumer_ready`.
- scheduler progress/latest-run-state/Work Queue readback expose broker
  request refs, statuses, dedupe keys, consumer nodes, next transition, and
  bounded reason codes.
- closeout:
  `.artifacts/execution-platform/demand-driven-context-broker-lazy-readiness/closeout.json`
- validation:
  `pnpm test:file extensions/execution-platform/src/workflows/context-broker.test.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  passed 178 tests.

Expansion Controller implementation evidence:

- `extensions/execution-platform/src/workflows/runtime-work-graph-expansion-controller.ts`
  defines the canonical admission policy and decision object.
- production scheduler graph writes now pass through
  `scheduler.evaluate_expansion_admission` before persistence.
- non-prerequisite graph growth defers when executable frontier work is ready;
  runtime-owned prerequisite context/repair edges remain admissible.
- large graph writes page by node/edge budgets rather than pushing oversized
  graph mutations into one progress/persistence event.
- absolute budget breaches terminalize as `needs_review` with bounded
  admission diagnostics instead of growing the graph.
- latest-run-state and Work Queue readback project admission status, counts,
  admitted/deferred ids, ready frontier ids, policy ref, and next transition.
- closeout:
  `.artifacts/execution-platform/expansion-controller-dynamic-fanout-admission/closeout.json`
- validation:
  `pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-expansion-controller.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  passed 269 tests.

Superstep Frontier Runtime implementation evidence:

- `extensions/execution-platform/src/workflows/runtime-work-graph-superstep.ts`
  defines canonical branch-result status and readback fields.
- production `RuntimeWorkGraphScheduler.tryRunParallelRunnableFrontier(...)`
  records branch-local results, isolates branch exceptions, preserves sibling
  success/evidence, and halts systemic repeated sibling failures.
- scheduler runtime tools include open, branch-result, and join operations for
  supersteps.
- Work Queue readback and latest-run-state project branch status,
  blocker/error path, readiness ref, next transition, evidence refs, and
  reason codes.
- closeout:
  `.artifacts/execution-platform/superstep-frontier-runtime-branch-results/closeout.json`
- validation:
  `pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  passed 268 tests.

Readback Projection And Replay Boundary Expansion implementation evidence:

- `BoundaryReplayService` now uses explicit structural checkpoint
  dependencies rather than enum order when compiling replay plans.
- granular canonical checkpoint kinds now include context request/handoff,
  context synthesis, expansion admission, graph patch write, resource
  materialization, worker invocation/edit, validation, and closeout boundaries.
- production implementation resource materialization records canonical
  resource-materialization and worker-invocation checkpoints with bounded
  refs and replay continuation modes.
- latest-run-state includes compact boundary replay state; Work Queue readback
  projects boundary replay from latest-run-state plus explicit checkpoint/plan
  events.
- Product/Spec boundary replay now records canonical boundary checkpoint
  artifacts for resource-materialization proof points instead of graph
  checkpoints alone.
- closeout:
  `.artifacts/execution-platform/readback-projection-replay-boundary-expansion/closeout.json`
- validation:
  `pnpm test:file extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  passed 178 tests.

Semantic Microtask Refinement And Worker Packet Quality implementation evidence:

- governing spec:
  `docs/projects/execution-platform/specs/semantic-microtask-refinement-and-worker-packet-quality.md`
- reason: after-resource boundary smoke proved replay can hydrate and invoke a
  worker, but the selected packet was still a broad work-intent/file chunk.
  Runtime must not convert repo-scope refs or directory discovery scope into
  arbitrary executable edits.
- production direction: context scout recommended edit points and future
  semantic microtask refinement artifacts provide model-authored
  file/symbol-change intent; runtime compiles refs, snapshots, validation,
  readiness, and worker packets.
- implementation evidence:
  `ImplementationTaskPacket` now carries file-change intents,
  `ImplementationContextSnapshotCompiler` blocks broad directory/file chunks
  without semantic intent, and boundary replay preserves context handoff
  recommended edit points plus limitations.
- boundary replay evidence:
  `.artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json`
  now marks the old Product/Spec after-resource packets as `needs_review`
  before worker invocation with exact missing file-change intent reason codes,
  instead of accepting stale ready metadata.
- closeout:
  `.artifacts/execution-platform/semantic-microtask-worker-packet-quality/closeout.json`
- focused validation:
  `pnpm test:file extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.test.ts extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/mission-work-packets.test.ts extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts`
  passed 58 tests.
- scheduler/runner validation:
  `pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts extensions/execution-platform/src/workflows/context-broker.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
  passed 108 tests.

Latest Product/Spec resource-boundary replay evidence:

- runtime job: `product-spec-replay-mpika9c1`
- graph:
  `team-run-native-exec-7507e654ba4db90c-checkpoint-replay-mpika9c0-runtime-work-graph`
- boundary: `before-resource-materialization`
- result: `succeeded`
- ready `NodeExecutionPacket` count: 2
- selected targets:
  - `extensions/execution-platform/src/intent-front-door/intent-front-door-readiness-audit.ts`
  - `extensions/execution-platform/src/runtime-tool-call/runtime-tool-kernel.ts`
  - `extensions/execution-platform/src/work-queue/execution-read-model.ts`
- proof artifact:
  `.artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json`

This proof used context-handoff payload artifacts and model-authored concrete
edit points to compile file-resolved implementation packets. It did not rerun
router, Mission Ledger, packet authoring, graph selection, or context scout.
The next step is the full Product/Spec Planning proof from the top.

## 2026-05-22 Pre-Product/Spec Proof Stabilization Plan

Status: first four stabilization items implemented and lane-proven; Mission
Ledger Stability Diagnostics is implemented; the Staged Mission Ledger
Obligation Candidate Compiler has been rolled back out of production and is
now diagnostic/proof-only. Production coding-team Mission Ledger creation is
back on the prior working single-pass path.

The latest Product/Spec proof series no longer points to one isolated
Product/Spec feature gap. It shows generic runtime failure classes that can
block any large workflow before source edits:

- body-bearing artifacts can still reach artifact metadata through adjacent
  production paths even after the payload store was introduced;
- scheduler iterations can keep expanding or reusing context/prerequisite
  graph shape instead of executing an existing ready frontier;
- reused-only node/edge decisions can look like progress;
- context-only phases can over-call expensive global Mission Ledger
  evaluation;
- graph/runtime-result payload surfaces still need a focused large-graph lane
  proof so body-heavy scheduler state never returns to metadata.

New specs:

- `docs/projects/execution-platform/specs/runtime-artifact-contract-registry-and-payload-boundary.md`
- `docs/projects/execution-platform/specs/scheduler-frontier-no-progress-and-evaluation-throttle.md`
- `docs/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state.md`
- `docs/projects/execution-platform/specs/large-graph-storage-and-scheduler-lane.md`
- `docs/projects/execution-platform/specs/pre-product-spec-proof-stabilization-plan.md`
- `docs/projects/execution-platform/specs/staged-mission-ledger-obligation-candidate-compiler.md`

New pre-proof DB Work Queue order:

1. `openclaw-convergence.runtime-artifact-contract-registry-payload-boundary`
   - Runtime Artifact Contract Registry And Payload Boundary. **Complete.**
2. `openclaw-convergence.scheduler-frontier-no-progress-evaluation-throttle`
   - Scheduler Frontier, No-Progress, And Evaluation Throttle. **Complete.**
3. `openclaw-convergence.operator-frontier-readback-latest-run-state`
   - Operator Frontier Readback And Latest Run State. **Complete.**
4. `openclaw-convergence.product-spec-large-graph-storage-scheduler-lane`
   - Large Graph Storage And Scheduler Lane. **Complete.**
5. `openclaw-convergence.mission-ledger-stability-diagnostics`
   - Mission Ledger Stability Diagnostics. **Implemented; harmless
     commitment-count variance is diagnostic-only, while packet coverage,
     runtime boundaries, mission gate changes, and GPT rescue dependence
     remain proof concerns.**
6. `openclaw-convergence.staged-mission-ledger-obligation-candidate-compiler`
   - Staged Mission Ledger Obligation Candidate Compiler. **Diagnostic-only.
     It is hard-disabled from production unless explicitly enabled by
     `OPENCLAW_ENABLE_STAGED_MISSION_LEDGER_DIAGNOSTIC=true` and a per-job
     diagnostic payload flag.**
7. `openclaw-convergence.active-queue-34`
   - Product/Spec Planning Workflow Plugin Production Proof.

Product/Spec should resume only after items 1-4 have lane proof. Items 1-4
are now implemented and lane-proven. Item 5 is implemented and is currently
blocking the next Product/Spec proof because the live repeated checkpoint lane
found material Mission Ledger/packet drift plus packet rescue dependence.
Item 6 remains useful as diagnostic infrastructure, but it is not the
production Mission Ledger path. The staged attempt added latency and failed
earlier than the original working flow on a model-authored constraint-volume
schema boundary. Production is restored to the single-pass Mission Ledger call
with bounded normalization and diagnostics. Proof-mode GPT rescue dependence
remains a proof concern, not clean success. The broad `openrouter_no_content`
symptom is still supplemented with bounded diagnostics:
model/provider/profile, request-shape, timeout, native finish reason, choice
count, content length, parsed length, retry, concurrency slot, input bundle
ref/hash, classified reason class, and retry eligibility.

Runtime Artifact Contract Registry implementation evidence:

- `extensions/execution-platform/src/runtime-artifact-contracts.ts` owns
  registered storage contracts and bounded manifest/body policies.
- `RuntimeJobRepository.attachRuntimeArtifactByContract(...)` is the canonical
  attach path for registered body-bearing artifacts and emits
  `job.artifact_contract_attached` events with contract id, payload ref, byte
  count, and raw-storage flags.
- direct `attachArtifact(...)` and direct `attachJsonPayloadArtifact(...)`
  reject registered body-bearing artifact writes that bypass the contract.
- production runner, context scout executor, boundary replay, and diagnostic
  scripts now write registered packet/context/resource/runtime-result bodies
  through contract-backed payload storage.
- validation:
  `pnpm test:file extensions/execution-platform/src/runtime-job-repository.test.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/codex-bridge/commitment-packet-review-boundary-replay.test.ts extensions/execution-platform/src/codex-bridge/context-scout-boundary-replay.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  passed 188 tests.
- type validation:
  `pnpm tsgo:fast ...` over the touched contract/repository/runner/replay/
  readback/script slice passed via the full-repo fallback checker.

Scheduler Frontier implementation evidence:

- `RuntimeWorkGraphScheduler` now builds canonical frontier state before
  expansion and, when production coding-team construction opts in, executes a
  ready frontier before invoking the orchestrator for more graph shape.
- Reused-only graph persistence writes `RuntimeWorkGraphNoProgressSignature`
  evidence and repeated identical signatures halt cleanly as `needs_review`
  instead of spinning.
- Mission Ledger evaluation is throttled for context-only node output unless
  closure claims or an explicit mission-evaluation request are present.
- Work Queue owner progress readback projects scheduler frontier,
  no-progress, and Mission Ledger throttle state.
- validation:
  `pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
  passed 83 tests.
- validation:
  `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  passed 159 tests.
- type validation:
  `pnpm tsgo:fast extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  passed through the repo fallback checker.
- provider-free runtime proof:
  `.artifacts/execution-platform/scheduler-frontier-no-progress-evaluation-throttle/proof.json`.

Operator Frontier Readback implementation evidence:

- `LatestRunState.activeFrontier` now includes selected/running/completed/
  blocked/failed/needs-review/waiting node ids, open commitment ids,
  branch-level blockers, no-progress root cause, Mission Ledger throttle state,
  and next transition.
- `DynamicAgentTeamGraphRunner` writes
  `execution_platform.latest_run_state` and
  `execution.latest_run_state_updated` after scheduler progress boundaries.
- Work Queue owner progress readback projects the latest-run-state frontier
  and agreement-checks graph id, selected nodes, blocked nodes, and
  transition against scheduler frontier events.
- validation:
  `pnpm test:file extensions/execution-platform/src/observability/latest-run-state.test.ts`
  passed.
- validation:
  `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  passed 159 tests.
- type validation:
  `pnpm tsgo:fast extensions/execution-platform/src/observability/latest-run-state.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  passed through the repo fallback checker.
- provider-free runtime proof:
  `.artifacts/execution-platform/operator-frontier-readback-latest-run-state/proof.json`.

Large Graph Storage implementation evidence:

- `execution_platform.implementation_resource_materialization_result` and
  `execution_platform.node_readiness_state` are now payload-required runtime
  artifact contracts.
- `agent_team.scheduler_progress` is now a registered bounded manifest
  contract, matching the live scheduler progress artifact type consumed by
  Work Queue readback.
- `DynamicAgentTeamGraphRunner` writes implementation resource
  materialization results and node readiness states through
  `attachRuntimeArtifactByContract(...)`.
- `RuntimeWorkGraphRepository` accepts bounded context snapshot ref arrays
  without treating them as embedded bodies, while still rejecting packet/body
  metadata.
- `RuntimeWorkGraphScheduler` bounds upstream context snapshot refs in node
  metadata to a sample plus count/truncation flags before execution.
- validation:
  `pnpm test:file extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/runtime-job-repository.test.ts extensions/execution-platform/src/workflows/runtime-work-graph.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
  passed.
- provider-free runtime proof:
  `.artifacts/execution-platform/large-graph-storage-scheduler-lane/proof.json`.

Mission Ledger Stability Diagnostics implementation evidence:

- `extensions/execution-platform/src/workflows/mission-ledger-stability-diagnostics.ts`
  compares two checkpointed Product/Spec Mission Ledger and Commitment Work
  Packet runs using structural gates and bounded provider diagnostics.
- Diagnostic artifacts are payload-required runtime contracts:
  `execution_platform.mission_ledger_stability_diagnostic_run`,
  `execution_platform.mission_ledger_stability_diagnostic_pair`, and
  `execution_platform.mission_ledger_stability_verdict`.
- `scripts/execution-platform-run-mission-ledger-stability-diagnostics.mjs`
  runs the repeated checkpointed lane and writes bounded proof artifacts.
- `scripts/execution-platform-record-mission-ledger-stability-diagnostics-closeout.mjs`
  records the Work Queue closeout or needs-review state from the verdict.
- validation passed:
  `pnpm test:file extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/workflows/mission-ledger-stability-diagnostics.test.ts`.
- type validation passed:
  `pnpm tsgo:fast extensions/execution-platform/src/runtime-artifact-contracts.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/workflows/mission-ledger-stability-diagnostics.ts extensions/execution-platform/src/workflows/mission-ledger-stability-diagnostics.test.ts extensions/execution-platform/src/workflows/index.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`.
- live diagnostic proof:
  `.artifacts/execution-platform/mission-ledger-stability-diagnostics/proof.json`.
- verdict:
  `needs_review_structural_drift`; `safeToRunProductSpecProof: false`;
  Run A produced 10 blocking commitments / 10 packets, Run B produced 13
  blocking commitments / 13 packets, Qwen no-content/retry count was 3, GPT
  rescue count was 6, and structural drift score was about 0.8846.
- Work Queue closeout recorded
  `openclaw-convergence.mission-ledger-stability-diagnostics` as
  `needs_review`, not closed.

Staged Mission Ledger Obligation Candidate Compiler status:

- Governing spec:
  `docs/projects/execution-platform/specs/staged-mission-ledger-obligation-candidate-compiler.md`.
- The staged compiler remains implemented for diagnostic and proof research.
- It is not a live production success path for coding-team Mission Ledger
  creation.
- Production execution uses `mission_ledger.production_single_pass`.
- Diagnostic runs may opt into staged behavior only with the explicit
  environment allow-list and payload flag named above.
- Failed fast-model packet calls remain reason-classified and replayable from
  bounded input bundle refs; repeated same-input no-content blocks a clean
  proof unless explicitly accepted as a provider incident.

## 2026-05-22 Split-Required Resource Materialization Transition

Status: implemented and replay-proven as a pre-Product/Spec proof gate.

Latest proof evidence:

- runtime job: `native-exec-55dc1cc6a3e94232`
- Work Queue item: `product-spec-checkpointed-64c74c8c5ece-g6svuj`
- graph id:
  `team-run-native-exec-55dc1cc6a3e94232-runtime-work-graph`
- prompt hash:
  `64c74c8c5ecee1ac51099bccb895f3fe4f225778614692015ec2b4450d364922`
- proof wall time after submit: about 20.2 minutes.
- graph reached 47 nodes, 49 edges, and 21 role invocations.
- Commitment Work Packets: 10/10 completed, 0 packet failures, 0 no-content
  responses, 0 retries, 0 GPT rescue/fallbacks.
- Qwen usage captured: 318,900 tokens, estimated `$0.1119`.
- GPT-5.5 usage remains estimated only because Codex app-server did not
  return actual usage.

Failure evidence:

- `implementation_context_materialization_blocked`
- `implementation_context_resource_packet_bounds_exceeded`
- `implementation_context_resolved_target_file_refs_exceeds_packet_bound:120:100`
- `post_context_task_split_required_for_file_resolved_microtasks`
- `worker_adapter_threw:unclassified`
- `scheduler_terminal_with_10_open_blocking_commitments`

Original root cause:

- the runtime correctly blocked worker invocation when a high-level
  implementation parent exceeded packet/resource bounds;
- the scheduler did not apply a graph transition from split-required parent
  to executable child nodes;
- the parent remained the active runnable unit and terminalized as a generic
  adapter failure instead of scheduler/readiness evidence.

Implementation result:

- production runner hooks now treat `split_required` as a graph transition,
  not a worker adapter result;
- split parent nodes are aggregate/non-runnable rollups with
  `commitmentClosureEligible: false`;
- accepted split task packets become executable child graph nodes and child
  Work Queue items;
- scheduler execution continues to the child frontier after materialization;
- supervisor classification no longer reports resource materialization
  boundaries as `worker_adapter_threw:unclassified`;
- replay supports `before-split-required-materialization` and
  `after-split-required-materialization`.

Validation and proof:

- `pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts -t "continues to materialized split children"`
  passed.
- `pnpm test:file extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.test.ts -t split-required`
  passed.
- `pnpm test:file extensions/execution-platform/src/workers/runtime-worker-supervisor.test.ts -t "resource materialization"`
  passed.
- `pnpm tsgo:fast` passed.
- `before-split-required-materialization` replay against
  `native-exec-55dc1cc6a3e94232` succeeded with 20 ready child
  `NodeExecutionPacket` refs from the split-required parent and preserved one
  precise sibling context-repair blocker.

Governing spec:

- `docs/projects/execution-platform/specs/split-required-resource-materialization-transition.md`

Next DB Work Queue item:

- Product/Spec Planning production proof remains the near-term proof target.
  If the sibling context blocker recurs, repair the context handoff layer;
  split-required resource materialization is no longer the blocker.

## 2026-05-21 Resource Materialization Boundary Replay And Canonical Node Readiness

Status: implemented and lane-proven as the current pre-Product/Spec
resource-readiness boundary. The payload store is the canonical body-storage
substrate, replay can now restart before or after resource materialization,
and implementation workers are gated by a canonical `NodeReadinessState`.

Failure evidence:

- runtime job: `native-exec-78e1b33861780884`
- graph id:
  `team-run-native-exec-78e1b33861780884-runtime-work-graph`
- failed implementation nodes:
  - `g-faee9af635-implementation-wu-002-plugin-runtime-wiring`
  - `g-faee9af635-implementation-wu-003-planning-artifacts-compile-readiness`
  - `g-faee9af635-implementation-wu-004-readback-projection`
- post-payload-store replay returned `needs_review` with:
  `accepted_context_synthesis_or_node_scoped_context_required_before_after_graph_selection_replay`.
  That reason code is historical evidence; current replay now requires
  node-scoped context for `after-graph-selection` and keeps
  `after-context-synthesis` diagnostic-only.

Root cause:

- replay is restarting from `after-graph-selection`, which is too early and
  too broad for the failure. The failed boundary is implementation-resource
  materialization after graph/context evidence exists.
- scheduler, replay, Work Queue readback, and proof gates need one canonical
  `NodeReadinessState` instead of separate interpretations of graph,
  context, resource, and executable readiness.
- graph node metadata must remain manifest-only; payload bodies belong in the
  Runtime Artifact Payload Store.

New governing spec:

- `docs/projects/execution-platform/specs/resource-materialization-boundary-replay-and-canonical-node-readiness.md`

DB Work Queue item:

- `openclaw-convergence.resource-materialization-boundary-replay-canonical-readiness`
  - Resource Materialization Boundary Replay And Canonical Node Readiness.

Implementation evidence:

- canonical readiness schema and evaluators:
  `extensions/execution-platform/src/workflows/node-resource-materialization.ts`
- manifest-only graph metadata enforcement:
  `extensions/execution-platform/src/workflows/runtime-work-graph.ts`
  and
  `extensions/execution-platform/src/workflows/runtime-work-graph-repository.ts`
- production runner readiness payload write:
  `extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`
- checkpoint replay boundaries and latest-run-state:
  `scripts/execution-platform-run-product-spec-boundary-replay.mjs`

Validation and proof:

- `pnpm test:file extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/runtime-work-graph.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
  passed: 3 files, 89 tests.
- `pnpm tsgo:fast extensions/execution-platform/src/workflows/node-resource-materialization.ts extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/runtime-work-graph.ts extensions/execution-platform/src/workflows/runtime-work-graph-repository.ts extensions/execution-platform/src/workflows/runtime-work-graph.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`
  passed; script policy fell back to full-repo verification.
- `before-resource-materialization` replay against
  `native-exec-78e1b33861780884` now exits successfully without rerunning
  upstream phases, preserves the exact non-worker blocker
  `context_supply_handoff_artifact_missing` for `bc-015`, and identifies the
  existing ready materialized frontier.
- `after-resource-materialization` replay against the same runtime job exits
  successfully with 4 inspected implementation nodes, 4 executable nodes, and
  0 blocked nodes.

Remaining Product/Spec proof gate:

- rerun or resume the Product/Spec proof from the nearest executable frontier
  and continue into implementation. The `bc-015` context handoff blocker
  remains upstream evidence for the next proof run, not a resource
  materialization storage/readiness failure.
- before the full proof is counted, close or explicitly supersede
  `openclaw-convergence.parallel-frontier-resource-boundary-hardening` through
  the new
  `docs/projects/execution-platform/specs/pre-product-spec-frontier-worker-proof-gate.md`
  lane: branch isolation, context-limitation negative test, owner readback
  trace gate, and one executable frontier worker smoke.

Post-proof architecture follow-up:

- `docs/projects/execution-platform/specs/post-proof-generic-runtime-extraction.md`
  records the next extraction block after Product/Spec: generic runtime spine
  extraction, dynamic runner plugin thinning, generic replay/readiness
  lifecycle, and cross-workflow orchestration proof lanes.

## 2026-05-21 Runtime Artifact Payload Store And Bounded Manifests

Status: implemented as the canonical runtime payload/body storage boundary
for large Execution Platform JSON artifacts. The Product/Spec proof still
needs a resource-storage boundary replay before another full top-of-pipe
proof is counted.

Failure evidence:

- runtime job: `native-exec-78e1b33861780884`
- prompt hash:
  `64c74c8c5ecee1ac51099bccb895f3fe4f225778614692015ec2b4450d364922`
- prompt length: `17694`
- final proof status: `needs_review`
- runtime job state: `failed`
- terminal reason codes:
  - `worker_adapter_threw`
  - `worker_adapter_threw:artifact_metadata_limit`
- graph reached 9 nodes, 11 edges, and 3 role invocations.
- context scout and context-repair scout handoffs were accepted.
- implementation workers never received executable packet input.

Root cause:

- production runner paths still attach full implementation resource packet
  bodies as runtime artifact metadata:
  `execution_platform.implementation_context_packet`,
  `execution_platform.implementation_resource_materialization_result`, and
  `execution_platform.implementation_task_packet`.
- runtime artifact metadata correctly enforces a bounded byte limit.
- the architecture bug is using metadata as the payload container.

New governing spec:

- `docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md`

DB Work Queue item:

- `openclaw-convergence.runtime-artifact-payload-store-bounded-manifests`
  - Runtime Artifact Payload Store And Bounded Manifests.

Implementation evidence:

- migration:
  `extensions/execution-platform/migrations/0008_runtime_job_artifact_payloads.sql`
- repository payload APIs:
  `extensions/execution-platform/src/runtime-job-repository.ts`
- production runner payload manifests:
  `extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`
- scheduler payload tools:
  `extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts`
- Work Queue payload manifest readback:
  `extensions/execution-platform/src/work-queue/execution-read-model.ts`
- Product/Spec boundary replay payload helper:
  `scripts/execution-platform-run-product-spec-boundary-replay.mjs`

Validation:

- `pnpm test:file extensions/execution-platform/src/runtime-job-repository.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  passed: 3 files, 176 tests.
- `pnpm tsgo:fast extensions/execution-platform/src/runtime-job-repository.ts extensions/execution-platform/src/runtime-job-repository.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`
  passed; script policy fell back to full-repo verification.

Satisfied success gates:

- full implementation/resource/node packet bodies are persisted in a
  canonical payload/body store.
- runtime artifact metadata stores bounded manifests only.
- scheduler, replay, readback, and worker invocation hydrate packets by ref.
- production runner split-node metadata stores refs/summaries instead of full
  packet bodies.

Remaining proof gate:

- replay the failed Product/Spec resource-storage boundary without rerunning
  upstream Mission Ledger, packet authoring, scheduler decomposition, or
  context scout.

## 2026-05-21 Parallel Frontier Resource Boundary Hardening

Status: documented as the next pre-Product/Spec proof blocker and inserted
ahead of the Product/Spec production proof in the Work Queue.

The latest checkpointed Product/Spec proof advanced beyond the older
context-scout packet blocker. It proved UX-compatible submission, prompt
hash/length preservation, source-prompt context indexing, Mission Ledger,
Commitment Work Packets, scheduler graph acceptance, Work Queue child sync,
and parallel frontier selection. It still failed before implementation.

Failure evidence:

- runtime job: `native-exec-68321aa82d7d6146`
- Work Queue item: `product-spec-checkpointed-64c74c8c5ece-fc8awb`
- prompt hash:
  `64c74c8c5ecee1ac51099bccb895f3fe4f225778614692015ec2b4450d364922`
- prompt length: `17694`
- final proof status: `needs_review`
- proof process wall time: `926s`
- submit accepted in `150.483s`
- front-door router latency: `67.513s`
- Qwen usage: `165685` tokens, estimated `$0.06117807`
- GPT-5.5 actual usage was unavailable from provider telemetry and remains
  estimate-only for this run.

Root causes:

- implementation resource packet compiler/schema bounds diverged; an
  oversized `resolvedTargetFileRefs` packet escaped as a thrown schema error
  instead of a scheduler-owned `split_required` or `context_repair_required`
  readiness result.
- context handoffs with runtime-fallback limitations could be treated as
  implementation-usable without a consumer-specific nonblocking waiver.
- context repair/acquisition nodes could be created without consumer edges,
  making them diagnostic work rather than readiness progress.
- parallel frontier execution could collapse the adapter result from one
  branch exception while sibling branches continued emitting.
- Work Queue/latest-run-state readback did not expose the exact schema path,
  bound, branch id, node id, limitation class, consumer edge state, and next
  legal transition.

New governing spec:

- `docs/projects/execution-platform/specs/parallel-frontier-resource-boundary-hardening.md`

Next DB Work Queue item:

- `openclaw-convergence.parallel-frontier-resource-boundary-hardening`
  - Parallel Frontier Resource Boundary Hardening.

DB Work Queue update:

- script:
  `scripts/execution-platform-record-parallel-frontier-resource-boundary-queue.mjs`
- artifact:
  `.artifacts/execution-platform/parallel-frontier-resource-boundary-work-queue-update.json`
- artifact hash:
  `sha256:a074be5374bd529ffe15b2d0619fc23b03d77fa7025c8da7425565d2f8ef0b11`
- queue order:
  `openclaw-convergence.parallel-frontier-resource-boundary-hardening`
  at rank 89, then `openclaw-convergence.active-queue-34` at rank 90.
  The prior
  `openclaw-convergence.context-scout-execution-packet-request-context-repair`
  item was closed from checkpointed proof evidence because the latest run
  advanced beyond its original oversized-prompt/provider-timeout/repair-envelope
  failure class.

Required success gates:

- resource compilers safe-return structured readiness evidence and do not
  throw opaque schema errors into worker adapters.
- runtime-only context fallback cannot cleanly unlock implementation.
- consumer-specific nonblocking limitation waivers are required for
  `accepted_with_limitations` handoffs to execute downstream workers.
- context repair nodes have consumer edges or diagnostic-only lifecycle.
- parallel frontier supersteps isolate branch failures and preserve sibling
  evidence.
- owner readback surfaces the exact branch/node/schema/context edge blocker
  and replay boundary.

## 2026-05-21 Context Scout Execution Packet And Request-Context Repair

Status: implemented and closed from checkpointed proof evidence. Focused
tests and typecheck passed, and the later Product/Spec checkpointed run
advanced beyond the original context-scout oversized-prompt,
provider-timeout, and request-context-envelope failure class. Remaining
Product/Spec proof blockers are tracked by
`openclaw-convergence.parallel-frontier-resource-boundary-hardening`.

The latest full Product/Spec Planning proof proved the route, source-prompt
context indexing, Mission Ledger, Commitment Work Packets, scheduler graph,
and Work Queue child sync, then failed before any role invocation because
context scout provider calls were blocked by structured-adapter preflight.

Failure evidence:

- runtime job: `native-exec-06e162ea7066ac2e`
- prompt hash:
  `da653d2e62b859d27dd1ae409bcdec4ca638dac97c2b2338429651e7641731ea`
- route: `agent_team.coding`
- job type: `executor.agent_team`
- Mission Ledger: valid, `clear_to_execute`
- blocking commitments: 13
- Commitment Work Packets: 13/13 produced
- scheduler graph: 10 nodes, 14 edges
- role invocation count: 0
- first open gate: `context_supply`
- final result: `needs_review`

Root causes:

- context scout role calls were still assembled as oversized monolithic
  prompts. The failed calls were about 42 KB against a 32 KB
  `local_semantic_extraction` policy bound.
- the node lifecycle timeout was passed through as a provider-call timeout:
  900 seconds requested against a 90 second policy hard timeout.
- request-context repair diagnostics still pushed the model toward old
  model-authored `newNodes`/runtime-envelope fields even though staged
  scheduler policy requires runtime-owned graph compilation.

New governing spec:

- `docs/projects/execution-platform/specs/context-scout-execution-packet-and-request-context-repair.md`

Completed DB Work Queue item:

- `openclaw-convergence.context-scout-execution-packet-request-context-repair`
  - Context Scout Execution Packet And Request-Context Repair Compiler.

DB Work Queue update:

- script: `scripts/execution-platform-record-context-scout-repair-queue.mjs`
- artifact:
  `.artifacts/execution-platform/context-scout-repair-work-queue-update.json`
- artifact hash:
  `sha256:598a63d5125eec668c964500523a118a3e4656b1a193ffebe30cf9157b9da6c4`
- queue order:
  later superseded by
  `openclaw-convergence.parallel-frontier-resource-boundary-hardening` after
  checkpointed proof evidence advanced past this failure class.

Implemented changes:

- production context-scout calls now use bounded runtime-compiled
  `ContextScoutExecutionPacket`s instead of monolithic role prompts.
- context-scout provider timeout is derived from model-task policy rather
  than node lifecycle timeout.
- request-context repair now takes semantic `requestContextIntent` and
  runtime-compiles prerequisite context-scout nodes and `context_supplies`
  edges.
- scheduler runtime tools and Work Queue readback now surface context-scout
  packet/tool/preflight state.

Validation:

- focused packet/compiler/tool tests passed.
- `pnpm tsgo:fast` passed.
- focused context-scout boundary replay tests hung in the existing replay
  harness and were terminated; this is recorded as a replay caveat, not a
  Product/Spec proof pass.

## 2026-05-21 Runtime Node Readiness And Transition Engine

Status: implemented, focused proof passed, and closed in the DB Work Queue.

The prior full Product/Spec Planning proof did not produce implementation
edits. It proved route, source-prompt context, Mission Ledger, Commitment Work
Packets, scheduler graph persistence, and Work Queue child sync, but failed
before role invocation.

Failure evidence:

- runtime job: `native-exec-eb9bbce0b5e01416`
- graph: `team-run-native-exec-eb9bbce0b5e01416-runtime-work-graph`
- graph node count: 8
- graph edge count: 7
- role invocation count: 0
- first open gate: `context_supply`
- accepted context target count: 0
- missing context target count: 5
- approved first node:
  `g-8f66b09a8c-implementation-wu_workflow_definition_and_registration`
- terminal reason codes:
  `worker_adapter_threw`, `worker_adapter_threw:unclassified`

Diagnosis: graph acceptance still bypassed node lifecycle readiness. The
scheduler approved an implementation node before context/resource
preconditions were satisfied. That is a generic runtime transition failure,
not a Product/Spec-specific planning issue and not a Kimi/Qwen worker-quality
issue.

New governing spec:

- `docs/projects/execution-platform/specs/runtime-node-readiness-transition-engine.md`

Implementation completed:

- scheduler runtime tools now include
  `scheduler.evaluate_frontier_readiness`,
  `scheduler.open_executable_frontier`,
  `scheduler.record_node_transition`,
  `scheduler.create_prerequisite_node`,
  `scheduler.link_prerequisite_to_target`,
  `scheduler.block_node_for_precondition`,
  `scheduler.promote_work_intent_to_executable`, and transition-repair tools.
- runtime node capabilities now declare lifecycle/precondition metadata,
  including context, resource packet, snapshot, validation, authority,
  evidence, budget, and parallelism requirements.
- scheduler execution paths now pass through transition readiness before
  worker invocation for `runAfterAdd`, direct `run_node`, closeout-node, and
  parallel frontier execution.
- direct production `approve_and_run_first_node` semantics are retired from
  the live scheduler path; executable frontier/open/promotion tools are the
  production route.
- missing node-scoped context creates runtime-owned prerequisite context scout
  nodes and context-supply edges instead of invoking implementation workers.

Focused proof:

- script:
  `scripts/execution-platform-run-runtime-node-readiness-transition-proof.mjs`
- artifact:
  `.artifacts/execution-platform/runtime-node-readiness-transition/proof.json`
- validated behavior: a run-after-add implementation work-intent node creates
  context prerequisites, does not invoke the implementation executor, emits
  transition readiness, and does not use `scheduler.approve_and_run_first_node`.

Next DB Work Queue item:

- `openclaw-convergence.active-queue-34` - Product/Spec Planning Workflow
  Plugin Production Proof.

DB Work Queue update:

- script: `scripts/execution-platform-record-resource-materialization-queue.mjs`
- artifact:
  `.artifacts/execution-platform/resource-materialization-work-queue-update.json`
- artifact hash:
  `sha256:9ef593692e6e9ebbede6e400b25a8e792207a919ede80b043824596106faf1e3`
- active queue head:
  `openclaw-convergence.active-queue-34` at rank 88 after closing
  `openclaw-convergence.runtime-node-readiness-transition-engine`.
- stale generated diagnostic rows archived in this reconciliation: 9.

## 2026-05-20 Model Task Classification And Resource Materialization

Status: Model Task Classification And Utility Router v2, Generic Node
Resource Materialization Layer, and Implementation Context Snapshot Compiler
implemented. The next pre-proof blocker is Structured Tool/Schema Adapter
Hardening.

Implemented runtime wiring:

- canonical task classes and policy registry are live in
  `extensions/execution-platform/src/model-tasks/model-task-classification.ts`.
- `model.call` runtime tool invocations now require task classification
  metadata; runtime rejects unclassified model calls and provider calls for
  `resource_materialization`.
- Dynamic coding-team Codex JSON calls, Mission Ledger, packet rescue/review,
  scheduler global reasoning, context synthesis, context synthesis repair,
  role model calls, synthesis expansion, and non-Codex tool selection now
  carry task-class call-site metadata.
- runtime execution spans and Work Queue owner readback surface model task
  class, policy ref, reasoning mode, parser mode, and bounded telemetry refs.
- implementation nodes now pass through
  `ImplementationContextPacket -> ImplementationTaskPacket ->
CodingResourcePacket -> NodeExecutionPacket` before worker invocation.
- runtime tools `context.resolve_target_refs`,
  `repo.snapshot_target_files`,
  `context.compile_implementation_context_packet`,
  `implementation.compile_task_packet`, and
  `implementation.evaluate_readiness` are registered as first-class
  resource-materialization operations.

Validation:

- `pnpm test:file extensions/execution-platform/src/model-tasks/model-task-classification.test.ts extensions/execution-platform/src/observability/runtime-execution-span.test.ts`
- `pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts`
- `pnpm exec tsx scripts/execution-platform-run-model-task-classification-proof.mjs`
- focused `tsgo --ignoreConfig` lane over the new classifier/readback modules.

Proof artifact:

- `.artifacts/execution-platform/model-task-classification-proof.json`
- `.artifacts/execution-platform/implementation-context-snapshot-compiler/proof.json`

Validation note:

- `pnpm tsgo:fast` currently fails before checking code with `TS5112`
  because the wrapper forwards changed file paths while a repo
  `tsconfig.json` is present.
- Full root `tsc --noEmit --project tsconfig.json` currently loads 12,237
  files and can exceed Node's default heap. This is a validation-script
  boundary to repair separately, not evidence that this classifier pass failed.

The next Product/Spec proof is blocked by a generic runtime boundary, not a
Product/Spec-specific implementation detail. The failed proof had useful
context handoff evidence but no worker-ready implementation resources, so the
runtime correctly blocked before Kimi/Qwen/Codex implementation. The fix is a
first-class resource materialization layer with canonical readiness state.

New source-of-truth spec:
`docs/projects/execution-platform/specs/model-task-classification-and-resource-materialization.md`.

Additional resource-materialization wiring completed:

- `NodeExecutionPacket` and `CodingResourcePacket` schemas, compiler,
  readiness evaluator, and readback summary live in
  `extensions/execution-platform/src/workflows/node-resource-materialization.ts`.
- scheduler runtime tools now include `node.compile_execution_packet`,
  `node.evaluate_readiness`, `node.record_readiness_blocker`,
  `node.promote_ready_packet`, and `node.plan_resource_repair`.
- production coding workflow policy requires node execution packets before
  worker execution.
- DynamicAgentTeamGraphRunner compiles and attaches node/resource packets
  before implementation nodes call Kimi/Qwen/Codex workers.
- Runtime Work Graph Scheduler blocks implementation/repair/test-authoring
  worker execution when a ready packet is missing.
- Work Queue owner readback now surfaces resource materialization state,
  node packet ref, resource packet ref, readiness codes, blockers, and next
  action.
- `scripts/run-tsgo-fast.mjs` now generates a targeted tsconfig instead of
  forwarding changed file paths beside `--project`, preventing TS5112.
- `scripts/run-tsgo.mjs` now sets a bounded Node heap budget for tsgo so full
  validation is not limited by Node's default heap.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/agent-team-coding-plugin.test.ts`
- `pnpm test:file extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/workflows/generic-orchestration-runtime.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `pnpm test:file extensions/execution-platform/src/workflows/product-spec-planning-plugin.test.ts extensions/execution-platform/src/workflows/architecture-red-team-plugin.test.ts extensions/execution-platform/src/workflows/workflow-plugin.test.ts`
- `node --test scripts/lib/tsgo-fast-target-config.test.mjs`
- `pnpm exec tsx scripts/execution-platform-run-node-resource-materialization-proof.mjs`
- `node scripts/run-tsgo-fast.mjs --noEmit`

Proof artifact:

- `.artifacts/execution-platform/node-resource-materialization/proof.json`

Pre-proof queue block:

1. Model Task Classification And Utility Router v2. **Complete.**
2. Generic Node Resource Materialization Layer. **Complete 2026-05-20.**
3. Implementation Context Snapshot Compiler. **Complete 2026-05-20.**
4. Structured Tool/Schema Adapter Hardening. **Complete 2026-05-20.**
5. Scheduler Readiness State Unification. **Complete 2026-05-20.**
6. Product/Spec Replay Proof. **Complete 2026-05-21.**
7. Full Product/Spec Planning Workflow Plugin Production Proof. **Next.**

Queue reconciliation rule: generated Product/Spec proof children and direct
runtime attempts are runtime diagnostics, not roadmap work. They should be
archived or superseded through Work Queue lifecycle metadata and removed from
the active roadmap lane before the next proof.

DB Work Queue update:

- script:

Structured Tool/Schema Adapter Hardening is now implemented for fast-model
structured calls:

- `model.call` and OpenRouter role calls build explicit provider profiles and
  preflight input/output/timeout policy before provider invocation.
- no-content responses retry the same bounded semantic task without mutating
  response format, reasoning mode, or prompt scope.
- schema failures terminalize as field-specific repair diagnostics with
  missing paths and preserved fields instead of whole-object regeneration.
- Work Queue readback surfaces structured adapter profile, diagnostics, and
  outcome alongside model task telemetry.
- proof artifact:
  `.artifacts/execution-platform/structured-tool-schema-adapter/proof.json`.

Scheduler Readiness State Unification is now implemented:

- `NodeReadinessState` is the canonical readiness object for node execution
  gating, including phase, context/freshness/snapshot/validation/authority/
  evidence sub-statuses, repair action, next transitions, blockers, and raw
  storage flags.
- scheduler worker invocation consumes canonical readiness and records it in
  node metadata and progress events.
- missing `NodeExecutionPacket` now still produces a bounded
  `NodeReadinessState`, so readback and repair can explain exactly which
  runtime-owned boundary is missing.
- Work Queue readback exposes readiness state, status, phase, repair action,
  sub-statuses, blockers, and transitions.
- proof artifact:
  `.artifacts/execution-platform/scheduler-readiness-state-unification/proof.json`.
  `scripts/execution-platform-record-resource-materialization-queue.mjs`
- artifact:
  `.artifacts/execution-platform/resource-materialization-work-queue-update.json`
- artifact hash:
  `sha256:5d2a587f09d35882ea24c89c8ef46cde8d75aa026e55edad449938070c432970`
- active Product/Spec proof-generated/direct child rows archived as
  diagnostic runtime artifacts: 140
- superseded overlap rows:
  `openclaw-convergence.scheduler-first-node-scoped-context-supply`,
  `openclaw-convergence.post-context-implementation-task-compiler`,
  `openclaw-convergence.toolification-16-capability-policy-compiler-hardening`,
  and `openclaw-convergence.non-codex-tool-using-worker`.
- retained but reprioritized post-proof:
  `openclaw-convergence.model-contract-compiler-consolidation` and
  `openclaw-convergence.product-spec-proof-latency-parallelism`.

## 2026-05-20 Post-Context Implementation Task Compiler

Status: documented as the next Product/Spec proof blocker.

The latest Product/Spec graph was valid as a high-level coding work-intent
graph but invalid as an executable implementation graph. The first
implementation node selected the Kimi file-edit lane while carrying broad
directory-level target refs and no readable target file snapshots, so the
implementation-readiness gate correctly blocked before worker invocation.

Clarification:

- `planning_orchestrator`, `web_research`, `planning_capsule`,
  `human_planning_decision`, `action_graph_proposal`, and
  `compile_runtime_plan` are Product/Spec workflow primitives to build. They
  are not expected to execute as nodes inside the `agent_team.coding` graph
  that is implementing Product/Spec Planning.
- The coding-team graph must instead create implementation tasks that
  explicitly build/register/test/read back those primitives.

Next implementation target:

- add a production post-context compiler that converts work-intent groups plus
  accepted node-scoped context handoffs into file-resolved
  `ImplementationTaskPacket`s.
- create executable implementation/test/docs/readback nodes only from accepted
  task packets.
- replay Product/Spec from the node-scoped context boundary and verify that
  Kimi/non-Codex receives concrete file snapshots, validation refs, allowed
  edit scope, and evidence expectations.

Spec:
`docs/projects/execution-platform/specs/post-context-implementation-task-compiler.md`.

## 2026-05-20 Scheduler-First Node-Scoped Context Supply

Status: documented and entering implementation.

Decision summary:

- complex implementation workflows should create a draft work-intent graph
  from accepted Commitment Work Packets before repo context scout fanout.
- context scout should normally run per draft work node, not per high-level
  Mission Ledger commitment.
- global context synthesis is optional and should run only for cross-node
  coordination needs.
- implementation readiness remains the gate that prevents worker execution
  without resolved target refs, snapshots or explicit new-file intent,
  validation refs/discovery plan, commitment mapping, and context handoff.

Spec:
`docs/projects/execution-platform/specs/scheduler-first-node-scoped-context-supply.md`.

## 2026-05-20 Packet And Implementation Readiness Boundary Repair

Status: implemented, focused validation passed, and a narrow real-model lane
passed. This pass did not rerun the full Product/Spec proof.

Completed runtime wiring:

- CommitmentWorkPacket authoring now uses the intended two-step Qwen protocol:
  semantic packet content first, then targeted normalization for missing
  semantic fields only. Runtime compiles the canonical packet envelope,
  refs, raw-storage flags, and scheduler validation shape.
- packet author telemetry now records phase, rescue usage, provider
  diagnostics, input/output sizes, latency, retry evidence, and a clean-proof
  expectation that normal Product/Spec packet proof should not require GPT-5.5
  rescue unless explicitly accepted as a provider incident.
- implementation readiness now blocks worker invocation when implementation
  nodes lack readable target snapshots, validation refs, commitment mapping,
  or an accepted context handoff summary. Missing/nonexistent target refs are
  classified as upstream context failure, not Kimi/non-Codex worker failure.
- scheduler repair for failed implementation readiness is runtime-compiled:
  the runtime creates focused `context_scout` repair nodes and repair edges
  from failed implementation evidence instead of asking the model to author
  executable repair graph envelopes.
- the non-Codex worker packet validator now preserves missing validation refs
  and missing commitment mappings as readiness/context signals, while the
  production runner remains responsible for blocking implementation before
  worker invocation. This prevents duplicate worker-internal gates from
  bypassing the worker loop's own context/validation derivation.
- structural validation failure detection in the non-Codex worker rollback
  path now checks substring signals correctly, so schema/contract edits that
  fail parser/TypeScript-style validation can be rolled back and escalated.

Real-model lane:

- `pnpm exec tsx scripts/execution-platform-run-commitment-packet-real-model-lane.mjs`
- model: `qwen/qwen3-coder-next`
- result: succeeded
- artifact:
  `.artifacts/execution-platform/commitment-packet-real-model-lane-mpe1w7xq.json`
- semantic-content call: 17.7s, 4.6 KB prompt, scheduler-valid semantic
  packet content.
- targeted-normalization call: 1.7s, no missing semantic fields after merge.
- runtime-compiled packet passed `validateCommitmentWorkPacketsForScheduler`.

Validation:

- `pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/mission-work-packets.test.ts`
- `pnpm test:file extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.test.ts extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.test.ts extensions/execution-platform/src/workflows/mission-work-packets.test.ts`
- `pnpm tsgo:full`

Next step: run the saved Product/Spec proof replay from the packet/context or
implementation-readiness boundary, not a full restart, and inspect whether the
new packets, readiness gate, and runtime-compiled context repair unblock real
implementation nodes.

## 2026-05-20 Product/Spec Proof Repair Pass

Status: implemented and focused validation passed. This pass repaired the
Product/Spec proof failure class exposed at the context-synthesis boundary
without rerunning the full prompt.

Completed runtime wiring:

- compact latest-run-state artifacts are written by the checkpointed proof
  harness at checkpoint and terminal boundaries so operator continuity survives
  context compaction.
- adaptive CommitmentWorkPacket review now calls GPT-5.5 only for blocking
  packet/handoff defects; advisory thinness is surfaced as nonblocking
  progress/readback evidence.
- context synthesis now compiles a bounded
  `execution_platform.context_synthesis_input_manifest` from model-authored
  packet/scout briefs and runtime refs, refuses silent truncation, accepts
  general group-guidance aliases, and performs one focused field repair for
  missing group guidance.
- runtime worker `needs_review` now terminalizes through a dedicated
  repository path with `retryScheduled:false`, and Work Queue owner progress
  exposes a `terminalAdapterOutcome` section.
- checkpoint gate semantics distinguish nonblocking qualitative review
  availability from hard proof failure.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/context-synthesis.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/workers/runtime-worker-supervisor.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
- `node --check scripts/execution-platform-run-product-spec-checkpointed-test.mjs`
- `node --check scripts/execution-platform-run-product-spec-boundary-replay.mjs`
- `pnpm tsgo:fast`

Next step: replay Product/Spec from the context-synthesis boundary and only
rerun the full proof after the boundary replay proves synthesis continuation.

Replay update:

- The first boundary replay exposed a separate handoff bug: context synthesis
  produced more implementation groups than the post-synthesis graph compiler
  received because the compiler was reading the owner-facing bounded metadata
  summary. That summary is allowed to truncate for artifact storage/readback,
  but it is not an executable scheduler contract.
- The runtime now emits a separate
  `context_synthesis_graph_compile_handoff` contract. It preserves every
  implementation group needed by the graph compiler or fails closed as
  `needs_review`; owner-facing metadata truncation can no longer shrink the
  executable graph.
- Focused replay from `after-parallel-context` passed the repaired boundary:
  GPT-5.5 context synthesis completed with 7 implementation groups,
  graph-compile handoff carried all 7 groups, and the scheduler persisted 7
  implementation nodes plus validation, review, readback, and closeout nodes.
  The replay intentionally stopped at `max_iterations` before worker
  execution.
- Scheduler terminal status now maps `max_iterations` to graph
  `needs_review`, not `failed`, so replay/checkpoint stops do not masquerade
  as hard execution failures.

## 2026-05-19 Fallback And Compatibility Retirement

Status: implemented, focused validation passed, live narrow model lane passed,
and closed from accepted DB Work Queue closeout evidence.

Completed DB Work Queue item:
`openclaw-convergence.coding-leap-06-fallback-compat-retirement`.

Completed runtime wiring:

- production chat/native run-once now uses `ProductionWorkflowExecutionFactory`
  for workflow execution dispatch instead of constructing the retired generic
  queued workflow runner.
- non-agent-team workflow jobs fail closed with diagnostic runtime evidence
  requiring the canonical workflow runtime engine; they cannot claim generic
  queued-runner production success.
- agent-team production execution remains scheduler-backed through the
  gateway worker supervisor path and the canonical
  `CodingTeamRuntimeJobRunner` public API; `AgentTeamQueuedRunner` has been
  deleted rather than retained as a compatibility alias.
- the generic `WorkflowQueuedRunner` migration shim, its tests, and its
  retirement proof script have also been deleted; non-agent-team workflows
  must use canonical workflow definitions/plugins and the runtime graph engine.
- public runtime exports no longer expose retired proof-era adapters and
  pilots: queued runners, starter workflow live pilots, single-job quality
  proof gates, legacy context-scout pilot helpers, or low-level Kimi
  patch-JSON adapter classes.
- obsolete proof scripts/tests and their support modules were removed:
  coding-team live pilot, owner-work-batch, native/final-pathway submit proof,
  old autonomy passes, sequential live agent-team runner, legacy semantic
  intent router, old request compiler, context-scout pilot, and low-level
  Kimi patch-JSON/microtask adapter lane. The cleanup was extended to remove
  the generic workflow runner retirement proof, starter workflow live pilots,
  research-to-coding handoff pilot, normal UX dogfood proof, single-job
  coding-team quality proof, and old Kimi source-edit proof target.
- `NativeExecutionRpcService` now requires the typed Front Door provider for
  free-form execution submit; the legacy model-assisted/heuristic router is
  not a production fallback.
- the old `live-agent-team-runner.ts` module is now only the bounded
  OpenRouter role-model client/types used by the scheduler-backed runtime; it
  no longer contains the retired sequential team runner.
- stale generated Product/Spec and middleware proof/helper rows were retired
  through the DB Work Queue generated-item lifecycle reconciliation path.
- workflow definition/evidence-profile type drift was fixed; `pnpm tsgo:fast`
  now passes for this slice.
- the code-intelligence model-usability proof script no longer requires a
  `tsx` wrapper; `node` uses bounded `tsImport` for TS-source runtime modules.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/workflows/production-workflow-execution-factory.test.ts extensions/execution-platform/src/codex-bridge/runtime-api-export-hygiene.test.ts extensions/execution-platform/src/codex-bridge/productionization-host-supervisor.test.ts`
- `pnpm test:file extensions/execution-platform/src/intent-front-door/router-tool-protocol.test.ts extensions/execution-platform/src/intent-front-door/router-runtime-tools.test.ts extensions/execution-platform/src/workflows/mission-contract-ledger.test.ts extensions/execution-platform/src/workflows/mission-work-packets.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/workflows/pre-proof-mission-packet-graph-lane.test.ts extensions/execution-platform/src/workflows/context-scout-tool-loop.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/validation-qa-runtime-tools.test.ts extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.test.ts extensions/execution-platform/src/codex-bridge/closeout-finalization-runtime-tools.test.ts extensions/execution-platform/src/workflows/production-workflow-execution-factory.test.ts extensions/execution-platform/src/codex-bridge/runtime-api-export-hygiene.test.ts`
- `pnpm tsgo:fast`
- `node scripts/execution-platform-run-code-intelligence-model-usability-proof.mjs`
- compatibility retirement source audit across `extensions/execution-platform/src`
  and `scripts`: passed with zero hard blocks.

Narrow model lane proof result:

- model: `qwen/qwen3-coder-next`
- result: pass
- proof: model selected `code.get_definition`, `code.get_references`, and
  `code.find_related_tests`; runtime invoked those code-intelligence tools
  through the Runtime Tool Kernel and produced a usable interpretation.
- artifact:
  `.artifacts/execution-platform/code-intelligence-model-usability-mpczd8yr.json`
- hash:
  `30bb85efe5894c699b14423f3c8739b7cef7cc1ce30086b20b31a95d72b7885d`

Next pre-Product/Spec item:
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

Status: implemented, focused validation passed, bounded model lane passed, and
closed from accepted DB Work Queue closeout evidence.

Completed DB Work Queue item:
`openclaw-convergence.coding-leap-05-non-codex-compound-tools`.

Completed runtime wiring:

- `RuntimeToolFamily` and scheduler runtime tools now include
  `coding.compound`.
- `agent_team.coding` declares the compound tool family as a production
  runtime dependency.
- the non-Codex tool worker loop executes six `coding.*` compound tools
  through Runtime Tool Kernel, `EditTransactionEngine`, validation runner,
  repair classification, evidence claims, and transaction close.
- compound tool success counts as changed-file, validation, evidence, and
  transaction progress; compound failure stops as `needs_review` with bounded
  repair classification refs.
- `ModelAgnosticWorkerPhaseEvent`, dynamic scheduler progress, and Work Queue
  active graph readback expose compound tool id, sub-event count, and
  sub-event phases.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/workflows/agent-team-coding-plugin.test.ts extensions/execution-platform/src/workflows/runtime-node-capability-registry.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `node --import tsx scripts/execution-platform-run-non-codex-compound-tool-model-lane-proof.mjs`

Narrow model lane proof result:

- model: `qwen/qwen3-coder-next`
- result: pass
- proof: model selected `coding.inspect_edit_validate`; runtime applied a
  scoped edit, ran validation, emitted evidence, closed the edit transaction,
  recorded runtime tool traces, and emitted compound phase progress.
- artifact:
  `.artifacts/execution-platform/non-codex-compound-tool-model-lane-mpcy484e.json`
- hash:
  `sha256:01df2d0d4059454819d208de3fc9533396cd5ecd1ce92c4648303fcc66a1c1e7`

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
`openclaw-convergence.model-contract-compiler-consolidation` - Model Contract
Compiler Consolidation And Schema Boundary Unification.

## 2026-05-19 Worker-Internal Streaming And Operator Readback

Status: implemented, focused validation passed, bounded model lane passed, and
closed from accepted DB Work Queue closeout evidence.

Completed DB Work Queue item:
`openclaw-convergence.coding-leap-04-worker-streaming-readback`.

Completed runtime wiring:

- `ModelAgnosticWorkerPhaseEvent` now carries bounded worker-internal
  operator-readback fields: input packet refs, context refs, context synthesis
  refs, code-intelligence refs, selected tool status, validation command ref
  and summary, edit transaction refs/status/repair count, output hash and
  content length, provider latency, timeout, finish reason, and token count.
- the non-Codex tool-using worker loop emits those fields at controller model
  turns, tool completion, validation, repair, stale-context refresh,
  evidence handoff, provider no-content, and timeout boundaries.
- the dynamic coding graph runner preserves worker-internal phase events into
  scheduler progress metadata, RuntimeExecutionSpan response summaries, model
  call span diagnostics, tool refs, validation refs, context refs, and
  evidence refs without storing raw prompts, raw responses, provider logs,
  tool logs, command logs, DB rows, or secrets.
- Work Queue active graph readback now exposes `workerInternal` beside
  scheduler/tool/model/span progress so an owner can see the active worker
  phase, role/model/provider, selected tool, target refs, packet/context/code
  intelligence refs, validation command, edit transaction state, provider
  diagnostics, evidence refs, blocker, next decision, and ELI5 state.
- closed-item readback keeps the latest worker-internal progress visible from
  linked runtime job evidence, rather than losing worker details after
  closeout.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.test.ts extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts').then(()=>console.log('non-codex-worker-loop-import-ok'))"`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts').then(()=>console.log('dynamic-runner-import-ok'))"`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/work-queue/execution-read-model.ts').then(()=>console.log('execution-read-model-import-ok'))"`
- `node --import tsx scripts/execution-platform-run-worker-streaming-readback-model-lane-proof.mjs`

Narrow model lane proof result:

- model: `qwen/qwen3-coder-next`
- result: pass in 1411 ms
- proof: the model recovered active worker, `moonshotai/kimi-k2.6` model ref,
  OpenRouter provider, selected `worker.edit.apply_patch` tool, evidence refs,
  validation refs, no blocker, and `review_worker_evidence` next decision from
  bounded owner-facing readback fields
- artifact:
  `.artifacts/execution-platform/worker-streaming-readback-model-lane-mpcwyonc.json`
- hash:
  `8a27bf1c05616ee69f92ff60e07f1ba1d54253b1a46255b183422ebc940d6178`

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

Status: implemented, focused validation passed, bounded model lane passed, and
closed from accepted DB Work Queue closeout evidence.

Closed DB Work Queue item:
`openclaw-convergence.coding-leap-03-context-synthesis-scheduler-handoff`.

Completed runtime wiring:

- context synthesis artifacts now carry scheduler-ready implementation groups,
  file ownership refs, cheaper-worker suitability, Codex escalation rationale,
  expected output, evidence-claim expectations, validation needs, review
  needs, stop-if-missing blockers, risk refs, integration requirements, scout
  state summaries, semantic code-intelligence refs, validation lanes, review
  lanes, worker-fit summary, and graph-compile readiness.
- synthesis validation rejects ready artifacts that lack worker-ready group
  detail, validation/review lanes, worker-fit rationale, evidence
  expectations, dependency or explicit parallelism, or fresh required context.
- runtime-owned context snapshot refs are preserved even if the model omits
  them; the model owns synthesis judgment while runtime owns refs and
  freshness.
- the dynamic graph runner passes accepted scout summaries, context snapshot
  refs, semantic code-intelligence refs, and the full expected synthesis shape
  into the context synthesis model call.
- scheduler progress and Work Queue readback now expose active context
  synthesis state, synthesis ref/status, group/dependency/parallel/blocker
  counts, worker-fit summary, graph-compile input summary, implementation
  group ids, target refs, validation lanes, review lanes, and semantic
  code-intelligence refs.
- post-synthesis graph compilation receives group-level ownership,
  validation, review, evidence, risk, integration, and worker-fit metadata
  instead of only a synthesis artifact ref.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/workflows/context-synthesis.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/codex-bridge/parallel-context-scout-boundary-replay.test.ts`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/workflows/context-synthesis.ts').then(()=>console.log('context-synthesis-import-ok'))"`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts').then(()=>console.log('dynamic-agent-team-graph-runner-import-ok'))"`
- `node --import tsx scripts/execution-platform-run-context-synthesis-model-lane-proof.mjs`

Model lane proof result:

- model: `qwen/qwen3-coder-next`
- result: one-attempt pass; no repair turn required
- validation: production `normalizeContextSynthesisArtifact` and
  `validateContextSynthesisArtifact` accepted the model-authored synthesis
- artifact:
  `.artifacts/execution-platform/context-synthesis-model-lane-mpcw7p7r.json`
- hash:
  `a4a1a9ac165fbf26db9499be5ac075fa5ba37643a0f588b56d05f24d1d1f41a8`

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

Status: implemented, focused validation passed, semantic model-usability lane
passed, and closed from accepted DB Work Queue closeout evidence.

Closed DB Work Queue item:
`openclaw-convergence.coding-leap-02b-code-intelligence-lsp-semantic-backend`.

Completed runtime wiring:

- added a canonical Code Intelligence backend registry with
  `typescript_language_service` as the production TS/JS semantic backend and
  `structural_parser` as explicit degraded mode.
- the existing `code.*` Runtime Tool Kernel tools now keep their canonical
  IDs while returning semantic backend metadata: backend id, backend health
  ref, workspace snapshot ref, semantic confidence, fallback state,
  diagnostic version ref, project config refs, backend latency, result counts,
  and limitations.
- `code.backend_status` is a read-only runtime-visible status tool serviced by
  `CodeIntelligenceService`, not by model-authored routing or backend-specific
  schema invention.
- TypeScript semantic mode implements definition, references, hover,
  diagnostics, document/workspace symbols, implementation candidates, rename
  planning, code-action candidates, related tests, import graph, impact
  radius, and file-structure summaries through the TypeScript language service.
- Work Queue active graph readback now surfaces semantic backend health,
  fallback status, diagnostic/project refs, backend latency, and result-count
  metadata for active code-intelligence work.
- context scout and parallel context replay preserve semantic backend refs and
  limitations; structural-only code intelligence is accepted only with
  limitations, not as clean semantic success.
- the bounded model-usability proof now requires semantic backend output from
  `typescript_language_service` with no structural fallback.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/code-intelligence/code-intelligence-service.test.ts extensions/execution-platform/src/code-intelligence/code-intelligence-runtime-tools.test.ts extensions/execution-platform/src/workflows/context-scout-tool-loop.test.ts extensions/execution-platform/src/workflows/mission-work-packets.test.ts extensions/execution-platform/src/codex-bridge/parallel-context-scout-boundary-replay.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/code-intelligence/code-intelligence-backends.ts').then(()=>console.log('semantic-backend-import-ok'))"`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/code-intelligence/code-intelligence-service.ts').then(()=>console.log('code-intelligence-service-import-ok'))"`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts').then(()=>console.log('context-scout-node-executor-import-ok'))"`
- `node --import tsx scripts/execution-platform-run-code-intelligence-model-usability-proof.mjs`

Model-usability proof result:

- model: `qwen/qwen3-coder-next`
- selected tools: `code.get_definition`, `code.get_references`,
  `code.find_related_tests`
- semantic gate: `typescript_semantic`, backend
  `typescript_language_service`, fallback `false`
- artifact:
  `.artifacts/execution-platform/code-intelligence-model-usability-mpcv9txe.json`
- hash:
  `025bd658a39250c8eda9a1f346dd2c1a913c95da3eae397529e9b2960fc60317`

Known validation limitation: `pnpm tsgo:fast` remains blocked by pre-existing
workflow-definition/evidence-profile type debt unrelated to this slice. The
new code-intelligence files have no remaining `tsgo:fast` errors.

Next pre-Product/Spec item:
`openclaw-convergence.coding-leap-03-context-synthesis-scheduler-handoff` -
Context Synthesis Barrier And Scheduler Handoff.

## 2026-05-19 Context Scout Over Code Intelligence

Status: implemented, focused validation passed, and ready to close from
accepted Work Queue closeout evidence.

Completed DB Work Queue item:
`openclaw-convergence.coding-leap-02-context-scout-code-intelligence`.

Completed runtime wiring:

- production context scout node execution now invokes Code Intelligence through
  Runtime Tool Kernel before model-authored handoff generation.
- context scout runs bounded `code.search_symbols`,
  `code.get_document_symbols`, `code.get_diagnostics`,
  `code.find_related_tests`, and `code.find_impact_radius` calls alongside the
  existing repo/context tool loop.
- `ContextHandoffPacket` carries code-intelligence result refs, symbol refs,
  diagnostic refs, related-test refs, impact refs, semantic modes, and
  semantic limitations for downstream synthesis, implementation, validation,
  and review.
- `ContextScoutToolLoopRun` and its owner-facing summary preserve
  code-intelligence runtime tool invocation refs, result refs, symbol refs,
  diagnostic refs, related-test refs, impact refs, semantic modes, and
  limitations.
- repo-analysis findings now include first-class code-intelligence,
  diagnostic-surface, and impact-radius findings.
- parallel context-scout boundary replay preserves the same code-intelligence
  refs per commitment result so later replay boundaries can resume after scout
  without losing code context.
- structural-mode code intelligence is explicitly surfaced as a limitation.
  LSP semantic parity remains a separate queued item.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/workflows/context-scout-tool-loop.test.ts extensions/execution-platform/src/workflows/mission-work-packets.test.ts extensions/execution-platform/src/codex-bridge/parallel-context-scout-boundary-replay.test.ts extensions/execution-platform/src/code-intelligence/code-intelligence-service.test.ts extensions/execution-platform/src/code-intelligence/code-intelligence-runtime-tools.test.ts`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts').then(()=>console.log('context-scout-node-executor-import-ok'))"`

Known validation limitation: `pnpm tsgo:fast` remains blocked by pre-existing
workflow-definition/evidence-profile type debt unrelated to this slice.

Next pre-Product/Spec item:
`openclaw-convergence.coding-leap-02b-code-intelligence-lsp-semantic-backend`

- Code Intelligence Semantic Backend And LSP Parity.

## 2026-05-19 Code Intelligence Substrate

Status: implemented, model-usability proof passed, and ready to close from
accepted Work Queue closeout evidence.

Completed DB Work Queue item:
`openclaw-convergence.coding-leap-01-code-intelligence-substrate`.

Completed runtime wiring:

- added `extensions/execution-platform/src/code-intelligence/` with
  `CodeIntelligenceService`, bounded TS/JS structural symbol/import/reference
  analysis, related-test discovery, impact-radius summaries, diagnostics, code
  actions, and rename planning.
- added Runtime Tool Kernel-backed read-only `code.*` tools:
  `code.search_symbols`, `code.get_definition`, `code.get_references`,
  `code.get_hover`, `code.get_diagnostics`, `code.get_document_symbols`,
  `code.get_workspace_symbols`, `code.get_call_hierarchy`,
  `code.get_implementation`, `code.plan_rename`, `code.get_code_actions`,
  `code.find_related_tests`, `code.resolve_import_graph`,
  `code.find_impact_radius`, and `code.summarize_file_structure`.
- added `code_intelligence.query` to the canonical runtime tool family union,
  scheduler runtime tool registration, coding workflow definition, and coding
  workflow plugin.
- Work Queue active graph readback now exposes `codeIntelligence` state,
  active tool id, runtime tool invocation refs, result refs, semantic mode,
  symbol refs, diagnostic refs, related-test refs, impact refs, stale blockers,
  summary, reason codes, and raw-storage false flags.
- structural mode is explicit. Missing LSP/TypeScript semantic service is not
  represented as semantic success.
- added a bounded live model-usability proof harness:
  `scripts/execution-platform-run-code-intelligence-model-usability-proof.mjs`.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/code-intelligence/code-intelligence-service.test.ts extensions/execution-platform/src/code-intelligence/code-intelligence-runtime-tools.test.ts`
- `node --import tsx scripts/execution-platform-run-code-intelligence-model-usability-proof.mjs`

Model-usability proof result:

- model: `qwen/qwen3-coder-next`
- selected tools: `code.get_definition`, `code.get_references`,
  `code.find_related_tests`
- runtime tool results: 3
- model judged bounded outputs usable
- artifact:
  `.artifacts/execution-platform/code-intelligence-model-usability-mpctudkn.json`
- hash:
  `3ffc680535b33b9fe68ea7125b4b1648ef789679b941136df4c345e1eb4459c9`

Known validation limitation: `pnpm tsgo:fast` still fails on pre-existing
workflow-definition/evidence-profile type debt unrelated to this slice.

Follow-up gap now explicitly queued:
`openclaw-convergence.coding-leap-02b-code-intelligence-lsp-semantic-backend`

- Code Intelligence Semantic Backend And LSP Parity. It is ranked after
  Context Scout Over Code Intelligence and before Context Synthesis Barrier And
  Scheduler Handoff, because scout is the first real consumer of the structural
  substrate and synthesis/scheduler should not be built on weak code context.

## 2026-05-19 Coding Executor Team Capability Leap Specs And Queue

The Codex/Claude Code/OpenCode comparison has been expanded from research
notes into an implementation spec:

- [Coding Executor Team Capability Leap](/projects/execution-platform/specs/coding-executor-team-capability-leap)

The canonical DB Work Queue has been reranked so Product/Spec Planning remains
the near-term proof target but is preceded by seven coding-harness capability
blockers:

1. Code Intelligence Substrate.
2. Context Scout Over Code Intelligence.
3. Code Intelligence Semantic Backend And LSP Parity.
4. Context Synthesis Barrier And Scheduler Handoff.
5. Worker-Internal Streaming And Operator Readback.
6. Non-Codex Compound Coding Tools.
7. Fallback And Compatibility Retirement.
8. Product/Spec Planning Workflow Plugin Production Proof.

Bounded update artifact:
`artifact://execution-platform/coding-executor-capability-leap-work-queue-update.json`
with hash
`e4485d07201ba51f42bbf1713a13202f7f302c9fd8d5d5257bba34cd2a85239c`.

## 2026-05-19 Repair Classification Before Retry

Status: implemented, worker-internal retry hardening added, and ready to
close from accepted Work Queue closeout evidence.

Completed DB Work Queue item:
`openclaw-convergence.native-leap-12-repair-classification-before-retry`.

Completed runtime wiring:

- added canonical bounded `RuntimeRepairClassification` v1 for failed spans,
  scheduler decisions, runtime tool refs, graph nodes, failed boundaries,
  commitment ids, field paths, failure classes, repair strategies, selected
  repair boundaries, preserved refs, resume refs, next actions, and
  raw-storage false flags.
- scheduler-backed node failures, needs-review outcomes, invalid evidence
  claims, and context freshness blocks now record repair classification
  through the scheduler runtime tool path before repair, retry, escalation, or
  upstream replay can proceed.
- needs-review node retries now require a prior target-node repair
  classification ref. Classifications with `terminal_needs_review` or
  `no_retry` strategy block same-node retry.
- the non-Codex tool worker loop now records the same canonical
  `RuntimeRepairClassification` before worker-internal retries and
  escalations. Validation failure repair, diagnostic-only repair turns, stale
  patch refresh, provider no-content, and provider timeout are no longer local
  unclassified control flow.
- `evaluateRuntimeRepairRetryGate(...)` is the shared runtime gate for retry
  decisions. It rejects missing classifications, terminal/no-retry
  classifications, and strategy mismatches before a retry boundary can run.
- Work Queue active graph readback exposes latest repair classification state:
  classification ref, failure class, failed boundary, repair strategy,
  selected repair boundary, failed tool/span refs, affected commitments,
  failed field paths, reason codes, semantic review requirement, and expected
  next action.
- Work Queue Kimi/non-Codex implementation readback now exposes
  worker-internal repair classification refs and summaries beside worker
  phases, edit transactions, validation refs, and provider-slot policy.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/workflows/repair-classification.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
- `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `pnpm test:file extensions/execution-platform/src/workflows/repair-classification.test.ts extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`

Known validation limitation: `pnpm tsgo:fast` remains blocked by pre-existing
workflow-definition/evidence-profile type debt unrelated to this slice.

## 2026-05-19 Span-Level Observability And Readback

Status: implemented and ready to close from accepted Work Queue closeout
evidence.

Completed DB Work Queue item:
`openclaw-convergence.native-leap-11-span-observability-readback`.

Completed runtime wiring:

- added canonical bounded `RuntimeExecutionSpan` v1 for model calls, runtime
  tools, worker phases, scheduler decisions, graph nodes, validation
  commands, edit transactions, repair attempts, boundary replay checkpoints,
  context scout/synthesis, closeout finalization, supervisor leases, Work
  Queue projection, and human-task style phases.
- scheduler-backed coding-team progress now emits `runtime_execution.span`
  events and span refs for every progress update while preserving existing
  `agent_team.scheduler_progress` artifacts/readback.
- Runtime Tool-Call Kernel lifecycle traces now include execution span
  metadata for planned, running, succeeded, needs-review, failed, timeout,
  canceled, and missing-executor paths without duplicating lifecycle truth.
- RuntimeWorkerSupervisor now emits bounded supervisor heartbeat, adapter
  start, adapter completion, and adapter failure spans.
- Work Queue active graph readback exposes `spanProgress`: active span, recent
  spans, stale spans, blocked spans, model/tool/worker refs, objective,
  input/output/evidence refs, blocker, next action, ELI5, and raw-storage
  false flags.
- closeout finalization evidence packets require runtime execution span refs;
  clean finalization cannot be accepted from Mission Ledger/tool/readback
  evidence alone when span evidence is missing.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/observability/runtime-execution-span.test.ts extensions/execution-platform/src/runtime-tool-call/runtime-tool-call.test.ts extensions/execution-platform/src/workers/runtime-worker-supervisor.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/codex-bridge/closeout-finalization-runtime-tools.test.ts`

Known validation limitation: `pnpm tsgo:fast` remains blocked by pre-existing
workflow-definition/evidence-profile type debt. The broad dynamic agent-team
graph production test still fails in the known downstream `worker.invoke`
path after context scout; this is outside the span/readback implementation
and is the kind of failure the new span readback is meant to make visible.

## 2026-05-19 First-Class Validation And Test Worker

Status: implemented and ready to close from accepted Work Queue closeout
evidence.

Completed DB Work Queue item:
`openclaw-convergence.native-leap-10-first-class-validation-test-worker`.

Completed runtime wiring:

- `ValidationTaskPacket` v2 is the production validation handoff. It carries
  workflow id, Mission Ledger refs, Commitment Work Packet refs, context
  snapshot refs, approved runtime command definitions, validation objective,
  target/changed file refs, expected evidence classes, failure mapping
  expectations, repair handoff expectations, downstream consumer, budget refs,
  stop/escalation conditions, and raw-storage false flags.
- validation/QA runtime tools now include `validation.select_commands`.
  `validation.run_command` fails closed without both an approved command ref
  and the runtime-owned command definition.
- unsupported shell-shaped validation strings are not converted into approved
  command refs. Runtime accepts only bounded approved refs or known safe
  `pnpm test:file` / `pnpm tsgo:*` command shapes from runtime-approved
  validation sources.
- production scheduler validation nodes emit progress before planning,
  command selection, each command run, command result, failure classification,
  failure-to-commitment mapping, repair handoff, evidence packet creation, and
  validation boundary checkpoint recording.
- failed validation records classification, commitment mapping, repair plan,
  repair node refs, repair handoff refs, and graph edges so repair can proceed
  in the same job instead of blind retry or terminal failure.
- Work Queue active graph readback now surfaces validation command refs,
  command summaries, current command ref/status, result refs, failure refs,
  repair plans, repair nodes, repair handoffs, evidence packet refs, blocking
  commitment ids, latest validation summary, and raw command log false flags.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/workflows/validation-qa-runtime-tools.test.ts`
- `pnpm test:file extensions/execution-platform/src/workflows/validation-qa-runtime-tools.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`

Known validation limitation: the broad dynamic agent-team graph production
test still fails in the pre-existing downstream `worker.invoke` path after
context scout. That failure is outside the first-class validation worker path
and remains adjacent to the next worker/observability slices.

## 2026-05-19 Production Boundary Replay

Status: implemented and ready to close from accepted Work Queue closeout
evidence.

Completed DB Work Queue item:
`openclaw-convergence.native-leap-09-production-boundary-replay`.

Completed runtime wiring:

- BoundaryReplayService checkpoints now include boundary input/output hashes,
  repo revision, worktree fingerprint, authority policy ref, and an identity
  binding hash while preserving raw-storage false flags.
- replay planning now evaluates the latest checkpoint per required boundary,
  so a stale or blocked later checkpoint cannot be hidden by older accepted
  artifacts.
- accepted replay plans include latest accepted checkpoint ref, exact
  continuation mode, skipped upstream boundaries, resume artifact refs, and
  invalid reason diagnostics.
- production replay continuation is represented as a bounded contract through
  `GenericOrchestrationRuntime.runSchedulerGraph` and
  `RuntimeWorkGraphScheduler.run`, not a harness-only executor fork.
- Work Queue active graph readback now surfaces exact continuation action,
  continuation mode, latest accepted checkpoint ref, skipped upstream
  boundaries, resume refs, and invalid replay reason codes.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/intent-front-door/ux-replay-payload-parity.test.ts`

Known validation limitation: full-repo TypeScript validation remains blocked
by pre-existing workflow-definition/evidence-profile debt unrelated to this
slice.

## 2026-05-19 Safe Parallelism And Supersteps

Status: implemented and ready to close from accepted Work Queue closeout
evidence.

Completed DB Work Queue item:
`openclaw-convergence.native-leap-07-safe-parallelism-supersteps`.

Completed runtime wiring:

- Runtime Work Graph frontiers still compute dependency-ready supersteps
  before asking the orchestrator for another model decision.
- hard conflict domains remain runtime-owned for file write scope, validation
  scope, runtime job refs, Work Queue refs, human decision refs, explicit
  no-parallel refs, and graph dependencies.
- provider/model capacity is now a counted concurrency budget instead of a
  mutex. Nodes can carry `providerConcurrencyKey`,
  `providerConcurrencyClass`, `selectedProviderCapabilityProfileId`,
  `modelRef`, or `modelOrWorkerRef` plus `providerConcurrencyLimit`, and the
  runtime selects up to the allowed budget while preserving skipped siblings
  for later supersteps.
- Work Queue active graph readback now exposes
  `parallelFrontier.providerConcurrencyBudgets` with budget key, limit,
  runnable node ids, selected node ids, and skipped node ids.
- accepted siblings remain checkpointed; failed or needs-review sibling
  branches return to the orchestrator for repair/escalation without rerunning
  successful siblings.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`

Known validation limitation: full-repo TypeScript validation remains blocked
by pre-existing workflow-definition/evidence-profile debt unrelated to this
slice.

## 2026-05-19 Repo-Analysis Context Scout

Status: implemented and ready to close from accepted Work Queue closeout
evidence.

Completed DB Work Queue item:
`openclaw-convergence.native-leap-06-repo-analysis-context-scout`.

Completed runtime wiring:

- registered canonical context scout repo-analysis runtime tools:
  `repo.search`, `repo.list_files`, `file.read`, `file.inspect_symbols`,
  `test.find_related`, `context.handoff`, `context.limitations`,
  `context.evidence_claim`, and `context.request_more_context`.
- production context scout execution now emits bounded repo-search/file/symbol
  /test/handoff/limitation/evidence tool traces, not only legacy
  `context_scout.*` pseudo-steps.
- `ContextHandoffPacket` now includes commitment packet refs, source-prompt
  excerpt refs, symbol refs, test refs, synthesis handoff summary, and context
  evidence refs for downstream synthesis and implementation.
- `ContextScoutToolLoopRun` now records model-authored repo-analysis findings,
  synthesis readiness, synthesis blockers, verified/rejected refs, runtime
  tool refs, and sufficiency review state.
- parallel context scout boundary replay now writes a replayable graph shape:
  per-packet `context_scout` nodes, a `context_synthesis_global_barrier` node,
  and `context_supplies` edges with synthesis readiness/blocker metadata.
- Work Queue active graph readback surfaces context scout synthesis readiness,
  blockers, repo-analysis finding count, symbol refs, test refs, and synthesis
  handoff summary.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/workflows/context-scout-tool-loop.test.ts extensions/execution-platform/src/codex-bridge/context-scout-boundary-replay.test.ts extensions/execution-platform/src/codex-bridge/parallel-context-scout-boundary-replay.test.ts`
- `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`

Known validation limitation: `pnpm tsgo:fast` still falls back to full-repo
verification and is blocked by pre-existing workflow-definition/evidence-profile
TypeScript debt unrelated to this slice.

## 2026-05-19 Context Freshness And Snapshot Discipline

Status: implemented and ready to close from accepted Work Queue closeout
evidence.

Completed DB Work Queue item:
`openclaw-convergence.native-leap-05-context-freshness-snapshot-discipline`.

Completed runtime wiring:

- added `ContextSnapshotRef` as the bounded runtime contract for source
  prompt indexes/excerpts, Mission Ledger/packet context, context scout
  handoffs, context synthesis, file snapshots, validation results, boundary
  replay checkpoints, and future memory context packs.
- source-prompt indexes and excerpt fulfillment now emit snapshot refs with
  prompt hash, runtime identity, source refs, freshness status, and
  raw-storage false flags.
- Commitment Work Packets, context handoff packets, implementation task
  packets, context synthesis artifacts, and boundary replay checkpoints now
  carry required/provided/stale/missing/rejected context snapshot refs plus
  freshness status/action summaries.
- production workflow plugins require fresh context snapshots for worker
  execution. The Runtime Work Graph scheduler blocks worker/provider calls
  before execution when required snapshots are missing, stale, rejected, or
  unknown.
- dynamic coding-team progress and Work Queue active graph readback now
  surface context freshness state, refresh action, snapshot refs,
  stale/missing/rejected refs, and owner-readable blocker summaries.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/workflows/context-snapshot.test.ts extensions/execution-platform/src/workflows/source-prompt-context.test.ts extensions/execution-platform/src/workflows/mission-work-packets.test.ts extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts extensions/execution-platform/src/workflows/context-synthesis.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.test.ts extensions/execution-platform/src/workflows/agent-team-coding-plugin.test.ts extensions/execution-platform/src/workflows/product-spec-planning-plugin.test.ts extensions/execution-platform/src/workflows/architecture-red-team-plugin.test.ts extensions/execution-platform/src/workflows/workflow-plugin.test.ts`

Known full-repo validation limitation: `pnpm tsgo:full` remains blocked by
pre-existing workflow-definition/evidence-profile TypeScript debt unrelated
to this slice.

## 2026-05-19 Worker Controller Author Applicator Split

Status: implemented and ready to close from accepted Work Queue closeout
evidence.

Completed DB Work Queue item:
`openclaw-convergence.native-leap-03-worker-controller-author-applicator-split`.

Production non-Codex file-edit workers now expose explicit controller,
author, runtime-applicator, validation/repair, evidence, and escalation phase
records. The production file-edit adapter enables strict phase authority, so
controller/context slots cannot directly apply source edits. Patch-author
turns author bounded edit plans/content, runtime applicator phases apply
through `EditTransactionEngine`, validation/repair slots classify and repair
failures, and evidence slots claim commitment-linked evidence from
runtime-owned changed-file and validation refs.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.test.ts extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts`
- `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/workflows/runtime-node-capability-registry.test.ts`
- `pnpm test:extensions:package-boundary:compile --extension=execution-platform`

Known full-repo validation limitation: `pnpm tsgo:full` remains blocked by
pre-existing workflow-definition/evidence-profile TypeScript debt unrelated
to this slice.

## 2026-05-19 Edit Transaction Engine

Status: implemented and ready to close from accepted Work Queue closeout
evidence.

Completed DB Work Queue item:
`openclaw-convergence.native-leap-02-edit-transaction-engine`.

Completed runtime wiring:

- added `EditTransactionEngine` as the runtime-owned file mutation boundary
  for non-Codex implementation workers.
- worker edit planning, patch application, validation, evidence, and rollback
  now attach bounded edit transaction refs/metadata.
- clean non-Codex worker completion now requires a closed edit transaction
  plus changed-file or accepted no-op evidence, validation refs, and
  commitment-linked evidence claims.
- scheduler/runtime tool definitions expose the canonical
  `edit_transaction.*` tool surface.
- file-edit adapter diagnostics and Work Queue readback expose transaction
  phase, status, files, validation refs, repair count, evidence refs, and
  reason codes.

Validation:

- `pnpm test:file extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/workflows/runtime-node-capability-registry.test.ts`
- `pnpm test:extensions:package-boundary:compile --extension=execution-platform`

## 2026-05-18 Non-Codex Tool Worker Runtime Pre-Proof Blocker

Product/Spec boundary replay reached real implementation nodes and invoked the
Kimi/non-Codex lane, but the production lane still depended on a giant
model-authored JSON patch proposal. The worker returned non-JSON output and
the adapter failed at the parser boundary before runtime-owned file inspect,
edit, validation, repair, and evidence emission could run.

Decision: Product/Spec proof is paused until
`openclaw-convergence.non-codex-tool-worker-runtime` replaces the production
non-Codex implementation lane with a model-agnostic runtime tool worker and
retires the patch-JSON proposal path from live success. The source-of-truth
spec is
[Non-Codex Tool Worker Runtime](/projects/execution-platform/specs/non-codex-tool-worker-runtime).

Expected next proof state:

- non-Codex workers run inspect/read/plan/apply/validate/repair/evidence tools.
- provider profiles are qualification-gated before scheduler selection.
- Work Queue readback shows worker tool progress and evidence claims.
- broad Codex escalation records why cheaper/specialized workers were
  unsuitable.
- the Product/Spec boundary replay resumes from the accepted graph frontier and
  runs implementation through the new tool worker runtime.

## 2026-05-18 Product/Spec Planning Spec Realignment

Product/Spec Planning specs have been realigned with the generic
orchestration/runtime architecture built after the original Product/Spec
technical specs were written.

Updated docs:

- `product-spec-planning-production-workflow.md`
- `product-spec-planning-runtime-contract-facade.md`
- `specs/product-spec-checkpointed-proof-framework.md`
- `specs/intent-routing-and-workflow-contracts.md`
- `specs/index.md`
- `DECISIONS.md`

Major changes:

- Product/Spec Planning is documented as a workflow plugin on
  GenericOrchestrationRuntime, not a bespoke planning runner.
- deleted generic workflow runner/facade compatibility is documented as
  historical only, never a production success path.
- the proof framework now includes executor/subject routing, source-prompt
  parity, Commitment Work Packet review, context synthesis, staged scheduler
  tool protocol, generic node evidence claims, completion review, and boundary
  replay.
- ActionGraphProposal remains proposal-only until a later compile/authority
  boundary.

## 2026-05-18 Boundary Replay Checkpoint Completion

Status: implemented and ready to close from accepted Work Queue closeout
evidence.

Completed DB Work Queue item:
`openclaw-convergence.native-harness-05-boundary-replay-checkpoints`.

Completed runtime wiring:

- Boundary replay checkpoints are now first-class bounded runtime artifacts
  with job, graph, workflow, prompt hash, payload hash, accepted/rejected/stale
  refs, current node/commitment state, replay start policy, safety/freshness
  status, continuation mode, and raw-storage/authority/lifecycle false flags.
- `BoundaryReplayService` records checkpoint artifacts and graph checkpoints
  idempotently, compiles replay plans, and requires required upstream
  checkpoints before a replay boundary can be accepted for continuation.
- Dynamic coding-team execution records checkpoints at router payload, Mission
  Ledger, CommitmentWorkPacket authoring/review, context scout, context
  synthesis, graph compile, worker execution, validation repair, review/QA,
  closeout finalization, and Work Queue readback boundaries.
- Work Queue active graph readback now exposes boundary replay state:
  checkpoint refs, graph checkpoint refs, replay plan refs, latest boundary,
  replay policy/safety/freshness/continuation mode, accepted/stale/rejected
  checkpoint refs, owner summary, and bounded reason codes.
- Production coding workflow `maxParallelNodeExecutions` is now passed through
  to the Runtime Work Graph scheduler, enabling runtime-selected frontiers in
  live coding-team jobs.
- The scheduler can now terminalize success from runtime-owned graph completion
  once executable nodes are terminal, Mission Ledger has no blocking
  commitments, and closeout node evidence exists, instead of asking the
  orchestrator for a redundant final decision.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts`
- `pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts`
- `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `pnpm tsgo:fast`

Next near-term proof target:
`openclaw-convergence.active-queue-34` - Product/Spec Planning Production
Upgrade via OpenClaw.

## 2026-05-18 Post-Synthesis Graph Optimizer And Parallel Supersteps Completed

Status: implemented and ready to close from accepted Work Queue closeout
evidence.

Completed DB Work Queue item:
`openclaw-convergence.native-harness-02-post-synthesis-parallel-supersteps`.

Completed runtime wiring:

- Runtime Work Graph scheduler now evaluates dependency-ready frontiers after
  graph updates and can run legal frontiers without another model-selection
  roundtrip.
- Parallel supersteps respect `maxParallelNodeExecutions` and runtime conflict
  domains for writes, validation scopes, runtime jobs, Work Queue refs, human
  decisions, provider concurrency classes, explicit no-parallel refs, and graph
  dependencies.
- Completed sibling branches remain accepted while failed/needs-review branches
  return to the orchestrator for repair or escalation.
- Production coding-team closeout is deferred while executable graph nodes
  remain planned or need review.
- Post-synthesis graph quality now rejects broad Codex dependency chokepoints.
- Work Queue owner readback exposes the active parallel frontier: superstep,
  ready/selected/running/completed/blocked/needs-review nodes, skipped conflict
  reasons, dependency layer count, join readiness, context synthesis refs, and
  implementation group count.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
- `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `pnpm tsgo:fast`

Next active pre-Product/Spec item:
`openclaw-convergence.native-harness-03-non-codex-worker-convergence`.

## 2026-05-18 Validation Executor And Repair Loop Convergence Completion

Status: implemented and ready to close from accepted Work Queue closeout
evidence.

Completed DB Work Queue item:
`openclaw-convergence.native-harness-04-validation-executor-repair`.

Completed runtime wiring:

- validation nodes build a canonical `ValidationTaskPacket` and validate it
  before command execution.
- missing validation objective, commitment ids, or approved command refs stops
  as `needs_review`; it cannot become accepted validation evidence.
- validation plan/run/result/classify/map/repair/coverage/accept steps are
  represented as validation/QA runtime tool invocations with bounded refs.
- approved command refs are runtime-derived from scheduler-approved command
  summaries.
- failed validation creates bounded repair handoff artifacts, same-job repair
  graph nodes, and `validation_failed`/`repair_requested` graph edges.
- validation/QA evidence packets and Work Queue readback expose validation task
  packet refs, repair plan refs, repair node refs, repair handoff refs,
  blocking commitment ids, and latest owner-readable validation state.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/validation-qa-runtime-tools.test.ts`
- `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `pnpm tsgo:fast`

Known validation note:

- `pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts`
  still fails on the broader pre-existing production-path closeout/result
  assertion. The failure is not a TypeScript or validation/QA tool regression,
  but the next boundary replay item should continue through that production
  path.

Next active pre-Product/Spec item:
`openclaw-convergence.native-harness-05-boundary-replay-checkpoints`.

## 2026-05-18 Supervision And Model-Call Progress Convergence Completed

Status: implemented and ready to close from accepted Work Queue closeout
evidence.

Completed DB Work Queue item:
`openclaw-convergence.native-harness-01-supervision-model-call-progress`.

Completed runtime wiring:

- Dynamic coding-team model calls have a bounded model-call progress span
  contract with phase, model/provider refs, input hash, response hash, response
  shape summary, elapsed time, timeout, heartbeat count, and raw-storage false
  flags.
- Codex app-server scheduler, Mission Ledger, packet-review, Mission Ledger
  evaluation, context-synthesis, and role model calls emit those spans through
  runtime scheduler progress.
- Product/Spec boundary replay emits model-call progress and closes the Codex
  app-server client after replay model calls.
- RuntimeWorkerSupervisor records adapter start, completion, and failure
  events around adapter execution.
- Work Queue owner readback now includes active model-call span progress under
  `activeGraphProgress.modelCallProgress`.

Validation:

- `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/workers/runtime-worker-supervisor.test.ts`
- `pnpm tsgo:fast`

Next active pre-Product/Spec item:
`openclaw-convergence.native-harness-02-post-synthesis-parallel-supersteps`.

## 2026-05-18 Native Agentic Coding Harness Convergence Recorded

The latest Product/Spec replay accepted context synthesis and a post-synthesis
graph, but still selected one broad foundation implementation node. The
artifacts also showed the replay result was written while local supervision
continued to look live, exposing a supervision/readback gap rather than only a
model-latency problem.

The native convergence spec is now recorded at
`specs/native-agentic-coding-harness-convergence.md`.

New pre-Product/Spec DB Work Queue items:

1. `openclaw-convergence.native-harness-01-supervision-model-call-progress`
2. `openclaw-convergence.native-harness-02-post-synthesis-parallel-supersteps`
3. `openclaw-convergence.native-harness-03-non-codex-worker-convergence`
4. `openclaw-convergence.native-harness-04-validation-executor-repair`
5. `openclaw-convergence.native-harness-05-boundary-replay-checkpoints`

Post-Product/Spec follow-ups:

1. `openclaw-convergence.native-harness-06-context-pack-supply-chain`
2. `openclaw-convergence.native-harness-07-work-queue-event-push-control`
3. `openclaw-convergence.native-harness-08-skill-role-harness-integration`

These items explicitly reuse native OpenClaw surfaces: Runtime Work Graph,
Generic Orchestration Runtime, Runtime Tool-Call Kernel,
RuntimeWorkerSupervisor, Work Queue events/readback/control, Context Engine,
provider stream wrappers, source-prompt tools, validation/QA tools, and
closeout finalization.

## 2026-05-18 Non-Codex Worker Harness Convergence Completion

Completed active DB Work Queue item:
`openclaw-convergence.native-harness-03-non-codex-worker-convergence`.

Runtime/code evidence:

- `ImplementationTaskPacket v3` is now the canonical scheduler-to-worker
  implementation handoff for Kimi/non-Codex lanes.
- production coding runner builds the packet from scheduler node metadata,
  context handoff refs, source-prompt excerpt refs, context-synthesis refs,
  prior node output refs, approved target/allowed scope, validation refs,
  evidence claim kinds, stop/escalation rules, and budget policy refs.
- non-Codex worker loop validates packet readiness before provider calls.
  Missing target scope/objective/criteria blocks immediately; missing context
  emits an explicit context acquisition path rather than a weak edit attempt.
- Kimi provider profile records reasoning/output/context budgets, task
  families, patch size/file limits, JSON reliability mode, validation
  capability, known failure modes, and escalation rules.
- Work Queue scheduler progress surfaces non-Codex worker context requests,
  edit step ids, worker tool refs, changed-file refs, validation refs, and
  commitment evidence claim refs.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/mission-work-packets.test.ts`
- `pnpm test:file extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts`
- `pnpm test:file extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.test.ts`
- `pnpm tsgo:fast`

No Product/Spec proof was executed in this pass. No live Kimi/OpenRouter
provider proof was rerun; prior live Kimi evidence remains recorded, while
this pass hardened the production scheduler/worker boundary and focused fake
provider tests through production interfaces.

## 2026-05-17 Long-Task Budget And Progress Smoke Completed

Status: implemented and closed from accepted runtime closeout evidence.

The final pre-Product/Spec Planning gate now proves Product/Spec-class
long-running scheduler work has realistic runtime budgets and owner-visible
progress while in flight:

- DB Work Queue item:
  `openclaw-convergence.pre-product-spec-05-long-task-budget-progress-smoke`
- runtime job: `long-task-budget-progress-smoke-1779062209361-job`
- graph: `long-task-budget-progress-smoke-1779062209361-graph`
- Work Queue transition: `closed`
- budget policy:
  `runtime-task-budget://agent_team.product_spec_planning/planning_orchestrator/long_running`
- runtime tool timeout: `3600000` ms.
- active readback phase: `worker_model_call_waiting`.
- active heartbeat state: `worker_waiting`.

Completed runtime wiring and proof:

- added canonical runtime task budget policy for tiny, standard, complex, and
  long-running work.
- derived Product/Spec Planning `planning_orchestrator` work as
  `long_running`.
- passed explicit budget metadata into scheduler runtime tool calls and
  `worker.invoke`.
- surfaced budget, progress, stale-progress, lease, heartbeat, elapsed,
  remaining, and heartbeat-state fields in Work Queue active graph readback.
- limited heavy Work Queue run/step hydration to recent records so active
  readback is not stale or latency-heavy after repeated proof attempts.
- proved a controlled timeout abort through the Runtime Tool-Call Kernel with
  bounded `runtime_tool_timeout` evidence.
- cleaned up stale pending/running smoke jobs from failed local proof
  iterations; the accepted runtime job remains the final proof.

Artifacts:

- `.artifacts/execution-platform/long-task-budget-progress-smoke-preflight.json`
- `.artifacts/execution-platform/long-task-budget-progress-smoke-budget-policy.json`
- `.artifacts/execution-platform/long-task-budget-progress-smoke-active-readback.json`
- `.artifacts/execution-platform/long-task-budget-progress-smoke-timeout-abort-proof.json`
- `.artifacts/execution-platform/long-task-budget-progress-smoke-progress-events.json`
- `.artifacts/execution-platform/long-task-budget-progress-smoke-final-readback.json`
- `.artifacts/execution-platform/long-task-budget-progress-smoke-quality-review.json`
- `.artifacts/execution-platform/long-task-budget-progress-smoke-summary.json`
- `.artifacts/execution-platform/long-task-budget-progress-smoke-artifact-index.json`

Follow-up queued after Product/Spec Planning:
`openclaw-convergence.product-spec-proof-latency-parallelism` - Product/Spec
Proof Latency Reduction And Parallel Runtime Follow-Up.

The latency follow-up is documented in
`specs/product-spec-proof-latency-and-parallelism.md`. It covers parallel
CommitmentWorkPacket author/review, context-scout fan-out with one synthesis
join, scheduler runnable-set/superstep execution, provider/file/validation
locks, non-Codex scoped worker parallelism, retry-only-failed-branch behavior,
a GPT-5.5 model-policy audit across Mission Ledger, packet authoring/review,
context synthesis, scheduler graph selection, and repair, boundary replay
checkpoints, and Work Queue parallel group readback. It is post-proof unless
latency itself becomes the Product/Spec blocker.

Next active queue item:
`openclaw-convergence.active-queue-34` - Product/Spec Planning Production
Upgrade via OpenClaw.

## 2026-05-17 Architecture Red-Team And Research Gate Completed

The reusable Architecture Red-Team And Research Gate is documented in
[Architecture Red-Team And Research Gate](/projects/execution-platform/specs/architecture-red-team-and-research-gate).

It is now implemented as first-class workflow
`agent_team.architecture_red_team`, with canonical contracts, workflow
definition/plugin registration, runtime capability coverage, Runtime
Tool-Call Kernel trace evidence, Work Queue readback, and accepted DB closeout
evidence.

DB Work Queue item:
`openclaw-convergence.architecture-red-team-research-gate` closed from
accepted closeout evidence.

Runtime job:
`architecture-red-team-gate-5828c3087ef0`.

Artifacts:

- `.artifacts/execution-platform/architecture-red-team-runtime-gate-proof.json`
- `.artifacts/execution-platform/architecture-red-team-runtime-gate-readback.json`
- `.artifacts/execution-platform/architecture-red-team-runtime-gate-quality-review.json`
- `.artifacts/execution-platform/architecture-red-team-runtime-gate-summary.json`

## 2026-05-17 Context Scout Tool Loop And Sufficiency Gate Completed

Status: implemented and closed from accepted runtime closeout evidence.

The scheduler-backed coding-team path now treats context scout as a
first-class context-supply tool loop instead of an inline role response:

- runtime tool family: `context_scout.tool_loop`
- DB Work Queue item:
  `openclaw-convergence.pre-product-spec-01-context-scout-tool-loop`
- runtime job: `context-scout-tool-loop-1779050661524`
- Work Queue transition: `closed`

Completed runtime wiring:

- context scout tool operations cover plan, repo search, bounded file-ref
  read evidence, test inspection, prompt excerpt request/receive, ref
  verification, sufficiency review, handoff emission, and repair request.
- context scout output now produces
  `execution_platform.context_scout_tool_loop` evidence with verified file
  refs, runtime tool invocation refs, sufficiency review, handoff refs, and
  raw-storage flags.
- implementation nodes that require context now require an accepted context
  scout tool loop, not just any handoff-shaped metadata.
- Work Queue readback exposes context scout loop refs, runtime tool refs,
  rejected refs, sufficiency summary, verified file refs, handoff refs, and
  open blockers.
- legacy `agent_team.context_scout` pilot artifacts are marked
  `legacy_diagnostic_only` and cannot count as production success evidence.

Artifacts:

- `.artifacts/execution-platform/context-scout-tool-loop-validation-proof.json`
- `.artifacts/execution-platform/context-scout-tool-loop-artifact-index.json`
- `.artifacts/execution-platform/context-scout-tool-loop-summary.json`

Next active queue item:
`openclaw-convergence.pre-product-spec-02-model-facing-staged-scheduler-tools`.

## 2026-05-17 Pre-Product/Spec Assumption Audit

The pre-proof assumption audit is documented in
[Pre-Product/Spec Assumption Audit](/projects/execution-platform/specs/pre-product-spec-assumption-audit).

Decision: do not rerun the full Product/Spec Planning proof until these P0
pre-proof items are complete:

1. Context Scout Tool Loop And Context Sufficiency Gate.
2. Model-Facing Staged Scheduler Tool Protocol.
3. Pre-Proof Mission Packet And Graph Lane.
4. UX/Replay Payload Parity Gate.
5. Long-Task Budget And Progress Smoke.

The audit found that full prompt propagation to Mission Ledger and
CommitmentWorkPacket authoring is mostly correct, but context scout remains
the riskiest handoff boundary and scheduler toolification still needs to move
from trace-backed large decisions to genuinely model-facing staged operations.

## 2026-05-17 Closeout Finalization Toolchain

`openclaw-convergence.toolification-19-closeout-finalization-tools` is
implemented as the closeout finalization pre-Product/Spec toolification item.

Production changes:

- added Runtime Tool-Call Kernel family `closeout.finalize`.
- registered closeout finalization tools in the live gateway runtime for
  evidence packet collection, Mission Ledger completion review, workflow
  evidence profile review, validation/QA review, tool trace coverage review,
  Work Queue readback review, maximality review, finalization handoff
  compilation, accept finalization, and reject finalization.
- wired production coding-team clean success through accepted closeout
  finalization evidence.
- blocked clean production success for degraded/system closeout, bare
  `create_closeout`, process completion, missing workflow profile evidence,
  missing validation/QA evidence, missing runtime tool refs, missing Work Queue
  readback, open blocking commitments, raw storage, or authority/lifecycle
  mutation flags.
- surfaced closeout finalization state, packet refs, handoff refs, tool refs,
  accept/reject refs, missing reason codes, maximality summary, limitations,
  ELI5, and next action in Work Queue active graph readback.
- marked `closeout-finalization-toolchain` production-primary in the runtime
  toolification truth registry.

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

## 2026-05-17 Validation And QA Toolification

`openclaw-convergence.toolification-18-validation-qa-toolification` is
implemented as the validation/QA pre-Product/Spec toolification item.

Production changes:

- added Runtime Tool-Call Kernel families `validation.plan`,
  `validation.run`, `validation.result`, `validation.review`, and
  `qa.review`.
- registered validation/QA tools in the live gateway runtime for validation
  planning, approved command refs, result summaries, failure classification,
  failure-to-commitment mapping, repair plans, coverage review, accepted
  validation evidence, work-product review, and evidence-sufficiency review.
- wired production coding-team validation nodes through the validation/QA tool
  chain; missing tool kernel now returns `needs_review` instead of running a
  non-toolified compatibility path.
- attached bounded validation/QA evidence packets to runtime jobs.
- surfaced validation/QA state, plan refs, command refs, result refs,
  failure/repair refs, coverage/review refs, evidence packet refs, tool
  invocation refs, and blocking commitment ids in Work Queue active graph
  readback.
- marked `validation-qa-toolification` production-primary in the runtime
  toolification truth registry.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/validation-qa-runtime-tools.test.ts`
- `pnpm test:file extensions/execution-platform/src/runtime-tool-call/runtime-tool-adoption-boundary.test.ts`
- `pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts`
- `pnpm tsgo:full`

Artifacts:

- `.artifacts/execution-platform/validation-qa-toolification-runtime-tool-proof.json`
- `.artifacts/execution-platform/validation-qa-toolification-work-queue-readback-proof.json`
- `.artifacts/execution-platform/validation-qa-toolification-adoption-gate-proof.json`
- `.artifacts/execution-platform/validation-qa-toolification-summary.json`

## 2026-05-17 Router Front Door Tool Protocol

`openclaw-convergence.toolification-14-router-front-door-tool-protocol` is
implemented as the next pre-Product/Spec toolification item.

Production changes:

- added Runtime Tool-Call Kernel family `router.front_door`.
- registered staged router tools in the live gateway runtime:
  `router.classify_owner_turn_intent`, `router.extract_constraints`,
  `router.select_executor_workflow`, `router.identify_subject_refs`,
  `router.compile_execution_request`, and
  `router.validate_route_contract`.
- wired `NativeExecutionRpcService` to the runtime tool kernel so accepted
  execution submissions record staged front-door tool traces before compiling
  runtime jobs.
- compiled runtime job payloads now carry `routerToolProtocolRef`,
  `routerToolInvocationRefs`, and `missionLedgerHandoffRef`.
- the live router prompt now states that the model owns semantic routing while
  runtime owns schema, refs, bounds, authority, persistence, lifecycle, and
  Mission Ledger handoff.
- legacy semantic intent fallback is test-only; production cannot reactivate
  it with `OPENCLAW_LEGACY_SEMANTIC_INTENT_ROUTING_FALLBACK`.

Validation:

- `pnpm test:file extensions/execution-platform/src/intent-front-door/router-runtime-tools.test.ts extensions/execution-platform/src/intent-front-door/router-tool-protocol.test.ts extensions/execution-platform/src/intent-front-door/request-compiler.test.ts extensions/execution-platform/src/intent-routing/intent-routing.test.ts src/gateway/server-methods/chat.execution-routing.test.ts`

Artifact:

- `.artifacts/execution-platform/router-front-door-tool-protocol-proof.json`

## 2026-05-17 Proactive Model-Heavy Hardening Plan

The generic orchestration runtime block is complete, but the same
model/runtime boundary must now be applied to the remaining model-heavy
surfaces. The standing rule is:

- models decide semantic meaning, usefulness, sufficiency, and quality.
- runtime owns schema, refs, bounds, persistence, authority, lifecycle, and
  tool execution.

The Work Queue is reprioritized so the next pre-Product/Spec proof path is:

1. Router And Front Door Tool Protocol.
2. Validation And QA Toolification.
3. Closeout Finalization Toolchain.
4. Product/Spec Planning Workflow Plugin Production Proof.

Model Memory capture/retrieval/context/proactivity toolification remains a
high-priority post-proof item unless memory becomes the immediate proof target.
The source-of-truth details are in
`specs/maximum-toolification-architecture.md` and the Model Memory
`runtime-toolification-integration` spec.

## 2026-05-17 Generic Node Executor And Evidence Claim Contract

`openclaw-convergence.generic-node-executor-evidence-contract` is implemented
as the canonical production node result/evidence layer for scheduler-backed
workflows.

Production changes:

- `GenericWorkflowNodeExecutionResult` now carries runtime job, workflow,
  graph, node, role, capability, executor, worker, model/tool, validation,
  changed-file, human-decision, closeout, limitation, owner-summary, and ELI5
  refs.
- canonical evidence claims now include runtime-derived claim ids, producing
  node/capability/executor, validation refs, changed-file refs, artifact refs,
  sufficiency refs, storage flags, and authority/lifecycle flags.
- generic node result validation rejects raw storage, authority/control
  grants, Work Queue/runtime lifecycle mutation, unknown commitments, missing
  evidence refs, missing output refs, and success without required evidence
  claims.
- `RuntimeWorkGraphScheduler` validates every node result through this generic
  contract before Mission Ledger evaluation and emits generic node result refs
  plus structured evidence claims into progress/readback.
- Work Queue active graph progress now surfaces structured evidence claims
  instead of only flat evidence ref arrays.
- workflow evidence profile helpers can derive evidence-class refs from
  canonical node results.

Validation:

- focused/generic runtime coverage: 13 files, 218 tests passed.
- `pnpm tsgo:full`
- `node scripts/run-oxlint.mjs extensions/execution-platform extensions/model-memory src/gateway src/auto-reply src/agents src/infra scripts ui/src/ui`
- touched-file format check
- `git diff --check`
- docs trailing whitespace check

This pass did not rerun the Product/Spec live proof. The next active item has
been reprioritized to
`openclaw-convergence.toolification-14-router-front-door-tool-protocol`.

## 2026-05-17 Generic Staged Scheduler Protocol

`openclaw-convergence.generic-staged-scheduler-protocol` is implemented and
wired into the generic orchestration runtime, production workflow plugins, the
production dynamic coding-team path, scheduler runtime tools, and Work Queue
readback.

Production changes:

- production workflow plugins now declare staged scheduler policy:
  staged-protocol required, staged graph acceptance required,
  model-authored work packets required for complex missions,
  runtime-derived node envelopes required, runtime-derived expected evidence
  required, model-authored structure review required, first-node approval
  required, and direct implementation first move limited to simple missions.
- `GenericOrchestrationRuntime` refuses production scheduler execution unless
  runtime options opt into the generic staged scheduler protocol.
- `RuntimeWorkGraphScheduler` rejects production node creation when it is not
  compiled through staged scheduler protocol metadata, lacks runtime-derived
  executor/capability/schema fields, lacks capability-derived expected
  evidence, or lacks graph edges/explicit parallelism justification.
- scheduler tool traces now cover mission readiness, commitment packet
  readiness, capability shortlisting, node-result review, repair/escalation
  classification, closeout readiness, and completion readiness.
- Work Queue readback surfaces staged scheduler policy fields on workflow
  plugin resolution metadata.
- the dynamic coding-team production path now passes the staged protocol
  requirement into `GenericOrchestrationRuntime.runSchedulerGraph(...)`.

Validation:

- focused runtime/plugin/readback tests: 7 files, 177 tests passed.
- `pnpm tsgo:full`
- `node scripts/run-oxlint.mjs extensions/execution-platform extensions/model-memory src/gateway src/auto-reply src/agents src/infra scripts ui/src/ui`
- `git diff --check`
- docs trailing whitespace check

`pnpm format:check` still fails on 40 unrelated files in the dirty repo, so
that check is recorded as unrelated and not fixed by this pass.

Next item:
`openclaw-convergence.generic-node-executor-evidence-contract`.

## 2026-05-17 Generic Orchestration Runtime Engine

`openclaw-convergence.generic-orchestration-runtime-engine` is implemented and
wired into the live scheduler-backed `agent_team.coding` path.

Production changes:

- added `GenericOrchestrationRuntime` as the workflow-agnostic runtime boundary
  around scheduler-backed graph execution.
- readiness still resolves through WorkflowDefinition, WorkflowPlugin, executor
  coverage, and Runtime Tool-Call Kernel availability.
- scheduler execution now runs through `GenericOrchestrationRuntime.runSchedulerGraph(...)`
  and returns a bounded generic runtime result artifact.
- scheduler success without graph execution evidence is downgraded to
  `needs_review`.
- Work Queue readback now exposes generic runtime status, graph id, node ids,
  decision refs, and reason codes.

This pass did not introduce another proof-only execution lane. The existing
coding-team production scheduler path now invokes the generic runtime wrapper.
The lower-level Runtime Workflow Graph Engine remains a readiness evaluator
inside the generic runtime.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/generic-orchestration-runtime.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts`
- `pnpm tsgo:full`

Next item: `openclaw-convergence.generic-staged-scheduler-protocol`.

## 2026-05-17 Product/Spec Pre-Proof Observability Hardening

The latest direct Product/Spec Planning replay showed that runtime evidence
was present but owner readback was too thin: child Work Queue sync events hid
the active node objective/model, Mission Ledger commitments were not detailed
enough in the readback surface, commitment work packets were not visible to
the operator, and the direct replay harness stayed silent until terminal
summary.

Completed hardening:

- Work Queue owner progress now keeps the latest active node objective,
  rationale, model, target refs, and cost-aware fields visible even when a
  newer `work_queue_child_sync` progress event arrives.
- Mission Ledger readback now exposes each blocking commitment's
  `whyItMatters` and expected evidence description.
- scheduler work-packet progress now carries bounded `CommitmentWorkPacket`
  summaries into active graph readback.
- role invocation completion progress now includes node objective, model ref,
  target refs, acceptance criteria, produced evidence refs, and ELI5 progress.
- the direct Product/Spec replay harness now uses a longer submit timeout and
  emits periodic bounded progress snapshots while the worker path runs.
- advanced router defaults are pinned to `openai-codex/gpt-5.5` in gateway
  code and live env files.

Validation:

- `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
- `pnpm tsgo:full`
- touched-file `pnpm format:check`

The next Product/Spec proof should use this improved readback/harness before
judging scheduler quality. A successful proof still requires real source
edits, validation, commitment evidence closure, and model-authored closeout.

## 2026-05-17 Product/Spec Planning Production Plugin Promotion

`agent_team.product_spec_planning` is now production-ready in the canonical
workflow definition registry and has a registered workflow plugin. The plugin
is scheduler-backed, requires the Runtime Tool-Call Kernel, requires Mission
Ledger evidence claims, rejects degraded/system closeout as success, and maps
the Product/Spec Planning capability set onto executable scheduler executor
keys.

Production wiring added in source:

- workflow definition status is `production_ready` with
  `productionEnabled: true` and `schedulerBacked: true`.
- default workflow plugin registry resolves
  `workflow-plugin.agent_team.product_spec_planning.v1`.
- executor coverage includes `planning_orchestrator`, `web_research`,
  `planning_capsule_draft`, `planning_capsule_revision`,
  `human_planning_decision`, `action_graph_proposal`,
  `compile_runtime_plan`, and `planning_closeout`.
- Runtime Workflow Graph Engine readiness accepts Product/Spec Planning only
  when scheduler executor keys and the runtime-tool kernel are present.
- the generic workflow queued runner still rejects Product/Spec Planning with
  `product_spec_planning_requires_scheduler_backed_runner` and cannot emit
  Product/Spec worker contract artifacts.

Boundaries unchanged: Product/Spec Planning can propose ActionGraphProposal and
compile-readiness artifacts, but it does not execute proposed child actions or
create child runtime jobs without a later compile/authority boundary.

Owner readback hardening in this pass adds explicit bounded evidence buckets
inside `product_spec_planning_owner_evidence_summary` for workflow
registration, executable node mapping, orchestrator-first graph proof, action
graph compile-readiness validation, and Mission Ledger commitment evidence
claim refs. These are readback/projection refs only and do not create runtime
jobs or mutate Work Queue lifecycle.

Validation:

- `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  passed with 100 tests.

## 2026-05-16 Staged Scheduler Tool Protocol Completed

`openclaw-convergence.staged-scheduler-tool-protocol` is complete as a
pre-Product/Spec Planning blocker.

Production scheduler changes:

- `agent_team.coding` orchestrator instructions now ask for staged scheduler
  intent fields instead of executable graph internals for complex missions.
- the runtime compiler accepts `workBreakdownUnits`,
  `capabilitySelectionsForWorkUnits`, `nodeContractDrafts`, and
  `edgeOrParallelismDraft`, then derives executable node kinds, executor keys,
  worker refs, qualification refs, and expected evidence from the capability
  manifest, Mission Ledger, and workflow evidence profile.
- staged runtime tools now record the actual planning protocol:
  `scheduler.draft_commitment_work_breakdown`,
  `scheduler.select_capabilities_for_work_units`,
  `scheduler.compile_runtime_graph`, `scheduler.review_compiled_graph`,
  `scheduler.accept_staged_graph`, and
  `scheduler.approve_and_run_first_node`.
- production scheduler traces no longer use the old
  `scheduler.decompose_mission` acceptance path for accepted complex
  decompositions.
- Product/Spec lane proof accepted a staged graph with a planning
  orchestrator node, a web research node, a handoff edge, capability-derived
  cost/evidence metadata, and no legacy production decomposition tools.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/orchestrator-graph-decision.test.ts`
- `pnpm tsgo:fast`

Artifacts:

- `.artifacts/execution-platform/staged-scheduler-tool-protocol-product-spec-lane-proof.json`
- `.artifacts/execution-platform/staged-scheduler-tool-protocol-summary.json`

The next owner-visible active queue item is now Product/Spec Planning
Production Upgrade via OpenClaw.

## 2026-05-16 Product/Spec Duplicate Submission Rows Cleaned

Stale Product/Spec Planning proof-attempt Work Queue rows were removed from
the active owner queue. These were duplicate execution submissions from prior
failed attempts, not roadmap work items.

Cleanup result:

- archived six stale Product/Spec submission/projection rows.
- canceled five stale runtime jobs:
  - `native-exec-74d6233e1d0b19df`
  - `native-exec-49357bd3d34c0c29`
  - `native-exec-a071442a7965c435`
  - `native-exec-c7747a8df2560b96`
  - `native-exec-99172ef8f445f4d8`
- reranked active DB Work Queue so the current active head is:
  1. Staged Scheduler Tool Protocol And Maximum Toolification Compiler.
  2. Product/Spec Planning Production Upgrade.

Artifact:

- `.artifacts/execution-platform/work-queue-product-spec-stale-submission-cleanup.json`

## 2026-05-16 Maximum Toolification Architecture Recorded

The latest Product/Spec Planning proof attempts exposed a deeper scheduler
contract problem: Mission Ledger succeeds, then the orchestrator is asked to
produce an executable decomposition graph in one JSON decision while also
satisfying cost-aware selection, commitment coverage, graph structure,
edge/parallelism, runtime-owned schema boundaries, and no-broad-implementation
policy. Runtime tool traces around that single decision do not fix the working
interface.

Recorded architecture:

- new source-of-truth spec:
  `specs/maximum-toolification-architecture.md`
- Runtime Work Graph and runtime toolification specs now require a staged
  scheduler tool protocol before Product/Spec Planning is rerun.
- the new pre-proof Work Queue item is
  `openclaw-convergence.staged-scheduler-tool-protocol` - Staged Scheduler
  Tool Protocol And Maximum Toolification Compiler.
- Product/Spec Planning remains the proof objective, but it follows the staged
  scheduler compiler item.

Maximum toolification now means typed runtime operations as the model's
working interface, not merely tracing rejected JSON.

## 2026-05-16 Owner-Turn Heartbeat And Prompt Transport Hardening Completed

The latest Product/Spec Planning UX resubmission exposed two production
submission blockers that were not Product/Spec-specific:

- background heartbeat/proactivity could start on the main session while a
  long owner prompt was in the chat/front-door handoff gap.
- local UX submission wrappers could fail before sending when long prompt text
  was embedded into shell or JavaScript source.

Production outcome:

- `chat.send` now marks an accepted owner turn active before execution/front-door
  handoff and clears it on completion, error, or abort.
- heartbeat preflight checks the owner-turn activity registry in addition to
  main/session lane queue depth, including isolated `:heartbeat` sibling
  sessions. Background heartbeat now skips with `owner-turn-in-flight` instead
  of interrupting or superseding active owner work.
- owner-turn activity has TTL cleanup so a crashed run cannot suppress
  heartbeat forever.
- prompt submission has a byte-safe first-class path:
  `scripts/openclaw-submit-prompt-via-ux.mjs --prompt-file <path>` or
  `--stdin`. Prompt content is treated as UTF-8 data, not shell/JS source, and
  artifacts store only hash/length/refs.
- the scheduler orchestrator prompt no longer asks the model to invent
  runtime-owned cost/evidence fields such as executor keys, node kinds, and
  low-level expected-evidence enums. The model supplies capability selection,
  rationale, commitment mapping, objective, and success criteria; the runtime
  compiler derives canonical runtime fields.

Artifacts:

- `.artifacts/execution-platform/owner-turn-heartbeat-and-prompt-transport-hardening-proof.json`

This pass does not count as a Product/Spec Planning proof. It fixes generic
submission, heartbeat, and model-contract fragility before the next long-form
UX proof.

Follow-up diagnosis:

- the prompt-file sender is equivalent at the UX transport layer because it
  fills the same operator chat textarea and clicks the same send/queue button;
  a short post-rebuild dispatch/hash smoke should verify the rebuilt gateway
  accepts that path before the full long prompt.
- current model-contract residue is concentrated in readback/type structures,
  proof scripts, Product/Spec compile-ready refs, Non-Codex worker tool-call
  selection, and Model Memory/proactivity strict JSON calls. The live scheduler
  prompt no longer asks the model to invent runtime-owned fields.
- `specs/runtime-parallelism-and-contract-boundaries.md` now records the next
  architecture block: parallel child graph execution, session/background work
  concurrency lanes, Work Queue parallel visibility/control, contract compiler
  consolidation, and Model Memory/proactivity toolification.
- these items are queued after Product/Spec Planning so the next proof is not
  delayed by parallelism work.

## 2026-05-16 Capability/Subject Routing Split Completed

The Product/Spec Planning prompt failure exposed a generic routing flaw: the
router was using one `workflowId` field for both the executor workflow and the
target subject workflow. That meant "implement Product/Spec Planning" could
select `agent_team.product_spec_planning` as the executor even though the
requested work required code-edit/test/docs/review capabilities that belong to
`agent_team.coding`.

Production outcome:

- router output now separates:
  - `executorWorkflowId`: who does the work.
  - `subjectWorkflowIds` and `targetSubjectRefs`: what the work is about.
  - `requestedCapabilities`: implementation/test/docs/review/closeout/etc.
  - `constraints`: deploy/outbound/model-promotion/raw-storage boundaries.
- workflow summaries expose executable capability metadata so validation can
  check whether the selected executor can actually perform the requested
  capability classes.
- `workflowId` remains only a compatibility alias for `executorWorkflowId` and
  conflicts are rejected.
- native submit has a bounded model repair path for executor/capability
  mismatches: it preserves the subject workflow and reselects an executor with
  the required capabilities.
- Work Queue readback now carries executor workflow, subject workflows, target
  refs, requested capabilities, and constraints so owner-facing diagnostics can
  explain the split.
- safety constraints remain compile/mission-ledger constraints; they are not
  regex route blockers.

Focused proof:

- `.artifacts/execution-platform/capability-subject-routing-split-preflight.json`
- `.artifacts/execution-platform/capability-subject-production-path-proof-summary.json`

The production-path proof exercised `NativeExecutionRpcService.submit` with a
first bad router result selecting Product/Spec Planning as executor, then a
repair that selected `agent_team.coding` as executor while preserving
`agent_team.product_spec_planning` as the subject. The request was accepted and
queued with runtime job `native-exec-aa733cd641935f1d`.

Product/Spec Planning remains the next owner-visible active queue item; this
pass only closes the generic routing/compiler/readback blocker that prevented
that item from being submitted correctly.

## 2026-05-16 Work Queue Generated Item Lifecycle Completed

The pre-Product/Spec Planning item
`openclaw-convergence.work-queue-generated-item-lifecycle`: **Work Queue
Generated Item Lifecycle And Proof Child Cleanup** is complete.

Why it exists:

- middleware live-completion proofs created fixture Work Queue items that were
  not closed or archived after the proof evidence was accepted.
- Generic Workflow Runner retirement proofs intentionally created failing
  diagnostic child workflow items, but those children were created as ordinary
  `execution_workflow` items.
- terminal runtime reconciliation correctly keeps failed real work in
  `needs_review`, but it currently cannot distinguish proof diagnostics from
  owner-planned work.

Production outcome:

- generated Work Queue rows now carry origin, parent refs, runtime refs, terminal
  policy, retention policy, and raw-storage flags.
- proof diagnostics and middleware fixtures are debug-only and excluded from
  default owner active queue after parent proof closeout.
- failed real owner/runtime child work remains actionable `needs_review`.
- the current leaked proof/helper rows were retired through repository/server
  transitions with bounded cleanup evidence.

Artifacts:

- `.artifacts/execution-platform/work-queue-generated-item-lifecycle-preflight.json`
- `.artifacts/execution-platform/work-queue-generated-item-cleanup-before.json`
- `.artifacts/execution-platform/work-queue-generated-item-cleanup-proof.json`
- `.artifacts/execution-platform/work-queue-generated-item-active-queue-readback-proof.json`
- `.artifacts/execution-platform/work-queue-generated-item-debug-readback-proof.json`
- `.artifacts/execution-platform/work-queue-generated-item-lifecycle-summary.json`
- `.artifacts/execution-platform/work-queue-generated-item-lifecycle-artifact-index.json`

Live DB readback after cleanup shows 9 `middleware_fixture` debug-only rows
and 20 `proof_diagnostic` debug-only rows archived. The owner-visible active
queue now starts with Product/Spec Planning Production Upgrade.

## 2026-05-16 Canonical Workflow Runtime Engine Completed

Canonical Workflow Runtime Engine And Workflow Definition Registry is now a
production gate for workflow execution/readback.

- new modules:
  - `extensions/execution-platform/src/workflows/workflow-definition.ts`
  - `extensions/execution-platform/src/workflows/workflow-definition-registry.ts`
  - `extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.ts`
  - `extensions/execution-platform/src/workflows/workflow-completion-review.ts`
- production `agent_team.coding` now resolves a registered workflow
  definition before scheduler execution.
- production workflow readiness requires scheduler-backed engine mode,
  Runtime Tool Kernel availability, executor coverage, workflow evidence
  profile, model-authored closeout, and accepted completion review.
- the deleted generic workflow queued runner no longer participates in
  workflow definition resolution; canonical workflow definitions/plugins and
  the runtime graph engine own production workflow dispatch.
- Work Queue readback now surfaces workflow definition, runtime workflow
  engine readiness, completion review, and completion-review gate state.
- the runtime toolification registry marks
  `canonical-workflow-runtime-engine-definition-registry` as
  `production_primary`.
- DB Work Queue item
  `openclaw-convergence.workflow-runtime-01-definition-registry` closed from
  accepted runtime closeout evidence.

Artifacts:

- `.artifacts/execution-platform/canonical-workflow-runtime-engine-preflight.json`
- `.artifacts/execution-platform/canonical-workflow-runtime-definition-contract-proof.json`
- `.artifacts/execution-platform/canonical-workflow-runtime-graph-engine-proof.json`
- `.artifacts/execution-platform/canonical-workflow-runtime-completion-review-proof.json`
- `.artifacts/execution-platform/canonical-workflow-runtime-readback-proof.json`
- `.artifacts/execution-platform/canonical-workflow-runtime-adoption-gate-proof.json`
- `.artifacts/execution-platform/canonical-workflow-runtime-engine-summary.json`

The next active DB Work Queue item is Coding Team Plugin Extraction From
Dynamic Runner.

## 2026-05-16 Workflow Evidence Profiles Completed

Workflow evidence profiles are now canonical production success gates and
owner-facing readback objects.

- new module: `extensions/execution-platform/src/workflows/workflow-evidence-profile.ts`
- artifact type: `execution.workflow_evidence_profile_evaluation`
- production `agent_team.coding` clean success now requires accepted profile
  evidence in addition to Mission Ledger closure, source edits, validation,
  review, and model-authored closeout.
- generic workflow queued dispatch can no longer complete from closeout alone;
  it must produce an accepted workflow evidence profile or fail/needs-review.
- Work Queue readback surfaces profile id, status, accepted/missing evidence
  classes, reason codes, artifact refs, and deep-completion review
  requirements.
- the runtime toolification registry marks
  `workflow-evidence-profiles-readback` as `production_primary`.
- DB Work Queue item
  `openclaw-convergence.toolification-11-workflow-evidence-profiles-readback`
  closed from accepted adoption-gate evidence.

Artifacts:

- `.artifacts/execution-platform/workflow-evidence-profiles-readback-preflight.json`
- `.artifacts/execution-platform/workflow-evidence-profiles-readback-proof.json`
- `.artifacts/execution-platform/workflow-evidence-profiles-readback-adoption-gate-proof.json`
- `.artifacts/execution-platform/workflow-evidence-profiles-readback-summary.json`

The next active DB Work Queue item is Canonical Workflow Runtime Engine And
Workflow Definition Registry.

## 2026-05-16 Canonical Workflow Runtime Architecture Documented

The first-principles workflow architecture is now explicit:

- one canonical durable workflow graph engine should run production workflow
  execution.
- workflow-specific behavior should be registered as workflow definitions and
  plugins.
- `RuntimeWorkerSupervisor` remains the job claim/lease/timeout/cancel layer,
  not a workflow brain.
- `DynamicAgentTeamGraphRunner` should be decomposed into the
  `agent_team.coding` workflow plugin.
- the old generic workflow queued runner should not exist as a migration shim
  or test-only compatibility surface; production and replay evidence must
  exercise the canonical workflow runtime.
- graph nodes continue to be executed by individual agents, workers, tools,
  and human task adapters.
- proof scripts should become black-box production observers rather than
  private execution paths.

The new source-of-truth spec is
`specs/canonical-workflow-runtime-architecture.md`. The Work Queue has been
reprioritized so Product/Spec Planning runs through OpenClaw only after the
canonical workflow definition/engine path is in place and generic workflow
completion fallback can no longer fake success.

## 2026-05-15 Dedicated Execution Platform DB Boundary Activated

Live Execution Platform runtime and Work Queue storage now resolves from
`config.env.vars.EXECUTION_PLATFORM_DATABASE_URL` to the dedicated
`execution_platform` database.

- boundary kind: `dedicated_execution_platform_db`
- readiness: `ready`
- Work Queue live linkage: enabled
- Model Memory DB reused: false
- shared-runtime approval flag: not required

The existing DB-backed Work Queue planning state was copied into the dedicated
database as bounded planning metadata, version summaries, dependency refs, and
artifact refs only. Runtime jobs remain lifecycle truth; Work Queue remains
projection/readback/control. The gateway was restarted after the config
change, and local plus Tailscale health/readiness passed without changing
port, auth, pairing, device identity, or ACP endpoint.

## 2026-05-15 Runtime Toolification Queue Recorded

The next Product/Spec Planning live UX proof is not the immediate next step.
The pre-proof queue now requires six production-grade platform passes:

1. Runtime Tool-Call Kernel And Trace Store. **Complete.**
2. Cost-Aware Capability Policy. **Complete.**
3. Scheduler Toolification And Split Planning/Execution. **Complete.**
4. Worker Tool Loops. **Complete, with worker-loop v2 proof.**
5. Mission Ledger Evidence Claims And Finalization Handoff. **Complete.**
6. Work Queue Tool/Event Readback. **Complete.**
7. Runtime Toolification Truth Registry And Adoption Gate. **Complete.**
8. Model Call Toolification And Model Task Middleware Collapse. **Complete.**
9. Script And DB Operation Toolification. **Complete.**
10. Closeout Toolification And Legacy Retirement Soak. **Complete.**

These passes turn delegation into a first-class scheduling decision with
utility policy: expected quality gain, token/cost budget,
context-distribution value, role specialization, parallelism opportunity,
redundancy penalty, and evidence needed to close commitments.

Product/Spec Planning remains the next major live UX proof, but it should run
only after the remaining pre-proof runtime unification items that can affect
proof truth pass. Closeout toolification and workflow evidence profiles are
now complete; the current next DB Work Queue item is Canonical Workflow
Runtime Engine And Workflow Definition Registry.

## 2026-05-15 Runtime Tool-Call Kernel Completed

The runtime now has a production Runtime Tool-Call Kernel and durable trace
store in the dedicated `execution_platform` database.

- migration: `0006_runtime_tool_call_trace_store.sql`
- tables: runtime tool definitions, invocations, events, and artifact refs
- modules: `RuntimeToolRegistry`, `RuntimeToolTraceRepository`,
  `RuntimeToolKernel`
- first production integration: Runtime Work Graph node execution can be
  traced as `worker.invoke`
- live proof: bounded diagnostic tool invocation succeeded on the dedicated DB
- hardening proof: timeout/abort, explicit cancel, cursor pagination, scoped
  retention pruning, and adoption boundary map passed against the dedicated DB

This does not complete cost-aware scheduling, full scheduler toolification,
Kimi worker loops, Mission Ledger finalization, or rich Work Queue tool/event
readback.

## 2026-05-15 Cost-Aware Capability Policy Completed

Runtime Work Graph scheduling now enforces cost-aware capability decisions
for production coding-team jobs. The capability manifest carries workflow
support, role class, ideal task size, context capacity, expected strength,
cost class, evidence fit, budget policy, and escalation/repair metadata.

The scheduler validates model-authored utility decisions before adding or
running nodes. Each accepted node must name the selected capability, executor,
target commitments, utility rationale, cost rationale, duplicate-work
rationale, expected evidence, downstream consumer, and stop/escalation
condition. Premium Codex use must justify why cheaper same-role options are
insufficient. Deterministic code validates shape, refs, bounds, storage flags,
executor mapping, and commitment ids; it does not judge semantic quality.

Live dedicated-DB proof passed:

- broad premium first-move attempt was rejected.
- repaired graph used context scout, the Kimi implementation lane, and
  validation nodes.
- Mission Ledger commitments closed from bounded evidence refs.
- Work Queue active progress readback now includes capability/cost rationale.
- DB Work Queue item `openclaw-convergence.active-queue-50` closed from
  accepted runtime closeout evidence.

Artifacts:

- `.artifacts/execution-platform/cost-aware-capability-policy-live-proof.json`
- `.artifacts/execution-platform/cost-aware-capability-policy-summary.json`
- `.artifacts/execution-platform/cost-aware-capability-policy-final-artifact-index.json`

## 2026-05-16 Scheduler Toolification And Split Planning Completed

Runtime Work Graph Scheduler decisions are now traced through the Runtime
Tool-Call Kernel, not only worker-node execution. The production gateway
runtime constructs a scheduler tool registry and kernel, registers scheduler
tools plus `worker.invoke`, and passes the kernel into the live
`agent_team.coding` graph runner.

The scheduler now records bounded tool traces for:

- `scheduler.decompose_mission`
- `scheduler.create_graph_node`
- `scheduler.create_graph_edge`
- `scheduler.accept_decomposition_graph`
- `scheduler.reject_decomposition_graph`
- `scheduler.select_next_node`
- `scheduler.request_human_decision`
- `scheduler.mark_needs_review`
- `scheduler.create_closeout_request`
- `worker.invoke`

Work Queue active graph readback now includes scheduler tool trace state:
current scheduler phase, latest tool id, and invocation refs. The proof run
used the dedicated Execution Platform DB, created a runtime job and graph,
accepted a decomposition graph, executed context/implementation/validation
nodes through traced worker invocations, requested closeout, and closed DB
Work Queue item `openclaw-convergence.active-queue-22` from accepted runtime
closeout evidence.

Artifacts:

- `.artifacts/execution-platform/scheduler-toolification-split-planning-preflight.json`
- `.artifacts/execution-platform/scheduler-toolification-split-planning-trace-proof.json`
- `.artifacts/execution-platform/scheduler-toolification-split-planning-summary.json`

## 2026-05-16 Runtime Toolification Truth Registry Completed

Execution Platform now has a canonical runtime toolification truth registry
and adoption gate. The registry records each major runtime surface by owner
area, target status, current status, canonical tool families, production
entry refs, compatibility refs, required gate evidence, blockers, and next
queue item. The gate rejects overclaims when evidence is missing instead of
letting docs or Work Queue metadata imply production readiness.

Implemented production behavior:

- `buildRuntimeToolificationTruthRegistry()` records the current truth for
  kernel, scheduler, worker loop, Mission Ledger, Work Queue readback, model
  call middleware, script/DB middleware, closeout generation,
  Product/Spec Planning, and Model Memory/proactivity toolification.
- `evaluateRuntimeToolificationAdoptionGate(...)` accepts only bounded
  evidence refs, runtime-tool invocation refs, Work Queue readback refs,
  live UX proof refs when required, closeout refs when required, and
  compatibility retirement refs when required.
- Work Queue DB-backed convergence readback surfaces the bounded registry
  summary from the canonical registry for the registry item, so stale
  metadata cannot override current registry truth.
- The legacy `RUNTIME_TOOL_ADOPTION_BOUNDARY_MAP` is now a compatibility
  export derived from `buildRuntimeToolificationTruthRegistry()`, not a
  second hand-maintained truth source.
- Toolification Work Queue closeout now requires accepted adoption-gate
  evidence. Generic closeout attempts on `.toolification-` items without
  accepted gate refs become `needs_review`.
- The approved proof command is
  `pnpm proof:execution-platform:toolification-truth-registry`; direct
  `node` execution now fails with an actionable runner message instead of a
  TypeScript loader stack trace.
- The dedicated-DB proof created a Runtime Tool Kernel diagnostic trace,
  wrote bounded artifacts, verified Work Queue readback includes the registry
  summary, rejected a deliberate Product/Spec Planning live-UX overclaim, and
  closed
  `openclaw-convergence.toolification-07-truth-registry-adoption-gate` from
  accepted runtime closeout evidence.

Artifacts:

- `.artifacts/execution-platform/runtime-toolification-truth-registry-preflight.json`
- `.artifacts/execution-platform/runtime-toolification-truth-registry-hardening-preflight.json`
- `.artifacts/execution-platform/runtime-toolification-truth-registry-adoption-gate-proof.json`
- `.artifacts/execution-platform/runtime-toolification-truth-registry-hardening-proof.json`
- `.artifacts/execution-platform/runtime-toolification-truth-registry-work-queue-readback-proof.json`
- `.artifacts/execution-platform/runtime-toolification-truth-registry-summary.json`

## 2026-05-16 Model Call Toolification Completed

Model-task middleware live provider calls now run through the Runtime
Tool-Call Kernel as `model.call` invocations. The model-task layer remains the
contract, validation, routing-evidence, and readback facade; it no longer
calls the JSON model executor directly in the live completion path.

Production behavior now covered:

- `model.call` runtime tool definition and executor registration for
  structured JSON model calls.
- volatile executor-only prompt input so provider prompts are available to
  the executor but are not persisted in runtime tool traces.
- bounded model-call trace metadata: model ref, provider ref, response hash,
  usage, structured-output hash, latency, and raw-storage flags.
- model-task runtime-job artifacts link back to `runtime-tool://...`
  invocation refs.
- Work Queue middleware readback surfaces `runtimeToolInvocationRefs` for
  model tasks.
- live model-task completion fails closed if the Runtime Tool-Call Kernel is
  missing.
- `providerCallMade: true` is accepted only when the model-task runtime job
  has `model_task.runtime_tool_trace` evidence with a `runtime-tool://...`
  invocation ref.
- proof-only fixture paths remain provider-free and cannot masquerade as
  production live model execution.
- the compatibility `model-tasks/fallback.ts` file remains
  classification-only and does not execute fallback model calls.
- the runtime toolification truth registry marks
  `model-call-toolification` as `production_primary`.

Dedicated-DB proof passed:

- runtime job:
  `model-call-toolification-1778938316760-runtime-job`
- runtime tool invocation:
  `runtime-tool://runtime-tool-5c3db9c8-0121-4ccc-9edc-27ac0a4c1534`
- Work Queue item:
  `openclaw-convergence.toolification-08-model-call-toolification` closed
  from accepted adoption-gate evidence
- real model call made through the Codex app-server JSON executor

Artifacts:

- `.artifacts/execution-platform/model-call-toolification-preflight.json`
- `.artifacts/execution-platform/model-call-toolification-runtime-tool-proof.json`
- `.artifacts/execution-platform/model-call-toolification-work-queue-readback-proof.json`
- `.artifacts/execution-platform/model-call-toolification-adoption-gate-proof.json`
- `.artifacts/execution-platform/model-call-toolification-summary.json`
- `.artifacts/execution-platform/model-call-toolification-hardening-summary.json`

## 2026-05-16 Script And DB Operation Toolification Completed

Script-job and DB-operation middleware live completion now runs through the
Runtime Tool-Call Kernel instead of treating middleware repositories as
untraced direct executors.

Production behavior now covered:

- `script.execute` runtime tool definition and executor contract for approved
  script handlers.
- `db_operation.execute` runtime tool definition and executor contract for
  approved DB-operation handlers.
- live script completion requires an injected `RuntimeToolKernel`, invokes
  `script.execute`, attaches a `script_job.runtime_tool_trace` artifact, and
  refuses clean completion when trace evidence is required but missing.
- live DB operation completion requires an injected `RuntimeToolKernel`,
  invokes `db_operation.execute`, attaches a
  `db_operation.runtime_tool_trace` artifact, and refuses clean completion
  when trace evidence is required but missing.
- runtime tool traces persist bounded refs, hashes, handler/operation refs,
  validation refs, byte counts, status, and raw-storage flags.
- Work Queue middleware readback surfaces script and DB operation runtime tool
  invocation refs.
- RuntimeWorkerSupervisor script/DB middleware adapters now invoke the runtime
  tools too; they no longer complete supervisor-claimed jobs directly.
- Direct model-task middleware supervisor completion cannot masquerade as
  provider evidence without a `model.call` runtime tool trace.
- Old in-process script worker and script/DB fixture pilot helpers are
  guarded as explicit proof-only paths, so accidental production use fails
  fast instead of producing live evidence.
- Model Memory runtime middleware bridge callsites that create Execution
  Platform model-task or DB-operation evidence now invoke `model.call` and
  `db_operation.execute` instead of directly completing provider/DB jobs.
- arbitrary shell commands and raw SQL payloads remain outside the runtime
  tool contract; production execution uses approved handler/operation ids.
- the runtime toolification truth registry marks
  `script-db-operation-toolification` as `production_primary`.

Dedicated-DB proof passed:

- script runtime job:
  `script-db-toolification-1778942020421-script-1e10a64d81`
- DB operation runtime job:
  `script-db-toolification-1778942020421-db-1e10a64d81`
- runtime tool invocations:
  see `.artifacts/execution-platform/script-db-toolification-work-queue-readback-proof.json`
- Work Queue item:
  `openclaw-convergence.toolification-09-script-db-toolification` closed
  from accepted adoption-gate evidence

Artifacts:

- `.artifacts/execution-platform/script-db-toolification-preflight.json`
- `.artifacts/execution-platform/script-db-toolification-script-runtime-tool-proof.json`
- `.artifacts/execution-platform/script-db-toolification-db-operation-runtime-tool-proof.json`
- `.artifacts/execution-platform/script-db-toolification-work-queue-readback-proof.json`
- `.artifacts/execution-platform/script-db-toolification-adoption-gate-proof.json`
- `.artifacts/execution-platform/script-db-toolification-summary.json`

## 2026-05-16 Worker Tool Loops And Non-Codex File-Edit Worker Completed

The generic file-edit worker adapter now treats non-Codex implementation work
as a first-class traced worker loop instead of a one-shot patch oracle.

Production behavior now covered:

- worker-loop runtime tool ids for file context inspection, edit planning,
  patch proposal, patch application, validation, failure classification,
  repair, escalation, and evidence handoff
- Kimi implementation lane receives bounded file snapshots and rich
  orchestrator-style microtask packets rather than vague "go edit code"
  instructions
- failed Kimi attempts are atomic; patch/apply failures, no-op edits, and
  validation failures restore the pre-attempt file snapshot before retry or
  escalation
- structured diagnostics capture response shape, schema/normalization state,
  rejection stage, model refs, latency, token budget, and bounded reason
  codes without raw prompt/response/provider-log storage
- Work Queue readback now links closed items back to their closeout runtime
  job and can surface worker tool traces, changed-file refs, and validation
  refs from scheduler progress

Live dedicated-DB proof passed:

- model/provider: `moonshotai/kimi-k2.6` through OpenRouter
- runtime job:
  `non-codex-file-edit-worker-1778895735946-job`
- graph:
  `non-codex-file-edit-worker-1778895735946-graph`
- source edits:
  `extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts`
  and
  `extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts`
- validation:
  `pnpm test:file extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts`
- DB Work Queue closeout:
  `openclaw-convergence.active-queue-21` closed from accepted runtime
  closeout evidence

Artifacts:

- `.artifacts/execution-platform/non-codex-file-edit-worker-loop-preflight.json`
- `.artifacts/execution-platform/non-codex-file-edit-worker-live-proof-summary.json`
- `.artifacts/execution-platform/non-codex-file-edit-worker-live-proof-quality-review.json`
- `.artifacts/execution-platform/non-codex-file-edit-worker-live-proof-readback.json`

Mission Ledger Evidence Claims And Finalization Handoff and Work Queue
Tool/Event Readback are now complete. Product/Spec Planning is the next major
live UX proof.

## 2026-05-16 Model-Agnostic Non-Codex Worker Loop Completed

The non-Codex implementation lane has been promoted from a Kimi-specific
patch path to a model-agnostic tool-using worker contract.

Production behavior now covered:

- canonical worker phases: plan, explore, edit, validate, repair/escalate,
  and evidence handoff
- bounded phase emissions for worker loop start, planning, tool selection,
  tool execution, edit planning, and terminal completion/needs-review
- reusable specialization manifest for Kimi implementation, non-Codex
  context scout, non-Codex test writer, non-Codex docs editor, validation
  failure explainer, and a contract-only frontend editor placeholder
- Kimi remains the first production implementation specialization on the
  generic loop, using Runtime Tool-Call Kernel repo/search/read/test tools,
  edit/validation/evidence tools, source edits, validation repair, and
  commitment-linked evidence claims
- Work Queue readback now surfaces worker tool ids as well as invocation
  refs, changed-file refs, validation refs, and ELI5 progress
- the live proof harness now generates a fresh per-run edit target and has a
  top-level timeout so reruns cannot silently hang or falsely fail on an
  already-applied field

Live OpenRouter/Kimi proof passed:

- model/provider: `moonshotai/kimi-k2.6` through OpenRouter
- runtime job:
  `non-codex-tool-using-worker-1778902828075-job`
- graph:
  `non-codex-tool-using-worker-1778902828075-graph`
- fresh proof field: `toolUsingWorkerTraceRefs46003efd`
- worker phase events: 15
- source edits:
  `extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts`
  and
  `extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts`
- validation refs:
  `validation://non-codex-tool-using-worker/e95a54c58bd130b4` and
  `validation://non-codex-tool-using-worker/576a624d164aec4c`
- DB Work Queue closeout:
  `openclaw-convergence.non-codex-tool-using-worker` closed from accepted
  runtime closeout evidence

Artifacts:

- `.artifacts/execution-platform/non-codex-tool-using-worker-live-proof-summary.json`
- `.artifacts/execution-platform/non-codex-tool-using-worker-live-proof-quality-review.json`
- `.artifacts/execution-platform/non-codex-tool-using-worker-live-proof-readback.json`

## 2026-05-19 Provider Capability Profiles Completed

Provider Capability Profiles are now first-class runtime-derived selection
objects for the scheduler and Work Queue readback.

Production behavior now covered:

- `ProviderCapabilityProfileRegistry` derives profile truth from
  `RuntimeNodeCapability` rather than creating a second editable manifest.
- each profile carries workflow/phase support, role class, worker ref,
  model-policy refs, qualification refs, production-selectability, tool refs,
  authority boundaries, task-size limits, context capacity, cost/latency class,
  evidence kinds, budget policy, failure modes, escalation targets, and
  raw-storage false flags.
- cost-aware capability validation rejects diagnostic/contract-only profiles
  and still requires qualification evidence for production non-Codex workers.
- scheduler-generated readback includes selected profile id, worker ref,
  role class, cost/latency, context capacity, qualification state, considered
  profile ids, and Codex escalation rationale.
- Work Queue owner progress readback surfaces the same provider-profile
  details instead of showing only a capability id.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/runtime-node-capability-registry.test.ts`
- `pnpm test:file extensions/execution-platform/src/workflows/cost-aware-capability-policy.test.ts`
- `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `pnpm test:extensions:package-boundary:compile --extension=execution-platform`

## 2026-05-16 Model-Agnostic Worker Multi-Model Qualification Completed

The model-agnostic worker substrate now has an explicit qualification matrix.
This prevents the scheduler from treating every model on the generic adapter
as production-ready just because the adapter contract exists.

Production behavior now covered:

- candidate profiles for Kimi, DeepSeek v4 Flash, DeepSeek v4 Pro, and Codex
  escalation include provider refs, task families, cost/latency class,
  context capacity, edit limits, tool profile refs, escalation targets, and
  raw-storage flags
- Runtime Node Capability Manifest entries now expose
  `modelQualificationProfileIds` and
  `productionSelectionRequiresQualification`
- Cost-Aware Capability Utility Decisions now require
  `selectedModelQualificationProfileId` and `qualificationEvidenceRefs` when
  selecting a production non-Codex/model-agnostic worker
- the live qualification proof uses prior accepted Kimi source-edit evidence
  for implementation and fresh bounded OpenRouter calls plus a separate
  model-authored reviewer pass for support-lane qualification
- DB Work Queue item
  `openclaw-convergence.model-agnostic-worker-qualification` closed from
  accepted runtime closeout evidence

Live qualification result:

- `moonshotai/kimi-k2.6`: production-qualified for `small_source_edit`
- `deepseek/deepseek-v4-flash`: production-qualified for
  `repo_context_scout` and `validation_failure_explanation`
- `deepseek/deepseek-v4-pro`: candidate for `test_writing_edit`; not
  production-qualified because it produced a test plan, not source-edit
  evidence
- `docs_spec_edit`, `test_writing_edit`, and `frontend_scoped_edit` still
  require dedicated live file-edit proofs before production selection

Artifacts:

- `.artifacts/execution-platform/model-agnostic-worker-qualification-preflight.json`
- `.artifacts/execution-platform/model-agnostic-worker-qualification-run-index.json`
- `.artifacts/execution-platform/model-agnostic-worker-qualification-matrix.json`
- `.artifacts/execution-platform/model-agnostic-worker-qualification-summary.json`

## 2026-05-16 Non-Codex Large-Task Decomposition Completed

The scheduler now prevents large coding missions from collapsing back to a
single broad Codex implementation node when cheaper qualified non-Codex lanes
should do useful work first.

Production behavior now covered:

- complex coding missions cannot start with a broad `implementation_complex`
  Codex node
- first accepted complex decomposition must include commitment-mapped child
  nodes and either handoff/dependency edges or an explicit parallel
  justification
- non-Codex/model-agnostic production nodes must include a task family,
  selected model qualification profile, qualification evidence refs, exact
  objective, expected output, acceptance criteria, downstream consumer, and
  stop/escalation condition
- orchestrator decision normalization preserves task-family and qualification
  fields instead of dropping them into thin metadata
- scheduler executor lookup now honors capability executor keys, so
  specialized nodes such as `non_codex_context_scout` and
  `non_codex_validation_failure_explainer` can run through their intended
  executor lanes instead of generic role fallbacks
- reviewer capability coverage is explicit, so complex coding closeout can
  require review without relying on undeclared role behavior

Dedicated-DB runtime proof passed:

- runtime job:
  `non-codex-decomposition-1778905961225-job`
- graph:
  `non-codex-decomposition-1778905961225-graph`
- rejected invalid broad Codex-first decision:
  `non_codex_decomposition_codex_broad_first_for_complex_mission`
- accepted graph: 4 nodes, 3 handoff edges
- executed nodes: context scout, Kimi implementation lane, validation
  explainer, reviewer
- DB Work Queue child materialization: 4 closed child items
- DB Work Queue closeout:
  `openclaw-convergence.non-codex-large-task-decomposition` closed from
  accepted runtime closeout evidence

Artifacts:

- `.artifacts/execution-platform/non-codex-decomposition-qualification-preflight.json`
- `.artifacts/execution-platform/non-codex-decomposition-qualification-run-index.json`
- `.artifacts/execution-platform/non-codex-decomposition-qualification-summary.json`

## 2026-05-16 Non-Codex Worker Loop V2 Completed

The Kimi/non-Codex implementation lane now has a stronger production worker
loop instead of only a scoped one-shot edit path.

Additional production behavior now covered:

- model-authored bounded context expansion requests before editing
- runtime tool traces for context request/provide/deny events
- multi-step edit plans with step ids, target refs, validation expectations,
  rollback boundaries, and commitment ids
- validation-driven repair after context expansion within the same worker run
- commitment-linked evidence claims handed back to the scheduler/Work Queue
- larger bounded Kimi attempt budget so context expansion and one repair turn
  can both complete without starving the loop

Live dedicated-DB proof passed:

- model/provider: `moonshotai/kimi-k2.6` through OpenRouter
- runtime job:
  `non-codex-worker-loop-v2-1778898154883-job`
- graph:
  `non-codex-worker-loop-v2-1778898154883-graph`
- source edits:
  `extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts`
  and
  `extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts`
- validation refs:
  `validation://non-codex-worker-loop-v2/e95a54c58bd130b4` and
  `validation://non-codex-worker-loop-v2/576a624d164aec4c`
- DB Work Queue closeout:
  `openclaw-convergence.non-codex-worker-loop-v2` closed from accepted
  runtime closeout evidence

Artifacts:

- `.artifacts/execution-platform/non-codex-worker-loop-v2-preflight.json`
- `.artifacts/execution-platform/non-codex-worker-loop-v2-live-proof-summary.json`
- `.artifacts/execution-platform/non-codex-worker-loop-v2-live-proof-quality-review.json`
- `.artifacts/execution-platform/non-codex-worker-loop-v2-live-proof-readback.json`

## 2026-05-16 Mission Ledger Claims And Tool/Event Readback Completed

Mission Ledger closure now depends on explicit commitment evidence claims
instead of generic artifact inference. Scheduler node results can return
bounded `evidenceClaims`; production `agent_team.coding` requires those
claims for Mission Ledger evaluation. The deterministic layer validates
claim refs, storage flags, and commitment ids; the model-authored Mission
Ledger evaluator judges sufficiency using only claimed evidence refs.

Finalization handoff is stricter:

- missing evidence claims keep commitments open and return to the
  orchestrator instead of allowing generic closeout churn.
- Mission Ledger evaluator JSON gets one bounded repair attempt before the
  job moves to `needs_review`.
- accepted evidence refs come from claims, not unclaimed output artifacts.
- degraded/system closeout remains diagnostic-only and cannot produce clean
  production success.

Work Queue owner readback now surfaces active graph/tool progress:

- active node, role, model, objective, phase, selected tool, validation state,
  evidence refs, evidence-claim refs, open commitments, blocker summary, and
  next decision.
- UI detail renders a Runtime graph progress section from DB-backed readback.

Dedicated-DB proof passed:

- runtime job:
  `mission-ledger-tool-readback-1778907616712-job`
- graph:
  `mission-ledger-tool-readback-1778907616712-graph`
- graph shape: 5 nodes with context, implementation, validation, readback,
  and review coverage
- child Work Queue items materialized: 5
- Mission Ledger status: satisfied with zero open blocking commitments
- DB Work Queue items closed:
  `openclaw-convergence.toolification-05-mission-ledger-evidence-finalization`
  and `openclaw-convergence.toolification-06-work-queue-tool-event-readback`

Artifacts:

- `.artifacts/execution-platform/mission-ledger-tool-event-readback-preflight.json`
- `.artifacts/execution-platform/mission-ledger-tool-event-readback-summary.json`
- `.artifacts/execution-platform/mission-ledger-tool-event-readback-work-queue-readback.json`

## 2026-05-16 Closeout Toolification And Legacy Retirement Completed

Closeout generation now has a first-class Runtime Tool-Call Kernel family:
`closeout.generate`.

Production behavior now covered:

- `closeout.generate` wraps the model-first `ModelCloseoutCapsuleReporter`.
- volatile closeout input is available to the executor without persisting raw
  prompts, raw provider responses, transcripts, logs, DB rows, or secrets.
- runtime traces persist bounded closeout refs, hashes, model refs, task
  success, role/opportunity counts, timing, reason codes, and raw-storage
  flags.
- degraded/system closeout remains diagnostic-only and returns
  `needs_review`; it cannot satisfy adoption-gate success.
- the production gateway runtime registers `closeout.generate` alongside the
  scheduler tools.
- the dynamic coding-team graph closeout executor invokes `closeout.generate`
  when a Runtime Tool Kernel is present; missing closeout tool wiring is not a
  clean success path.
- the generic workflow queued runner invokes `closeout.generate` when a
  Runtime Tool Kernel is present and fails closed when neither kernel nor
  model-authored reporter is configured.
- the runtime toolification truth registry marks
  `closeout-generate-toolification` as `production_primary`.

Dedicated-DB proof passed:

- runtime job:
  `closeout-toolification-1778944155434-runtime-job`
- runtime tool invocation:
  `runtime-tool://runtime-tool-6976d47c-798b-4159-81f4-16e3ed9c8f7f`
- Closeout Capsule:
  `runtime-job://closeout-toolification-1778944155434-runtime-job/closeout-capsule/closeout-capsule-601221edf8d0fb724efa2b51`
- DB Work Queue item:
  `openclaw-convergence.toolification-10-closeout-generate-toolification`
  closed from accepted adoption-gate evidence
- summary artifact:
  `.artifacts/execution-platform/closeout-toolification-summary.json`

## 2026-05-15 Product/Spec Planning Production Upgrade

`agent_team.product_spec_planning` is treated as a scheduler-backed workflow in source. The generic workflow queued runner rejects it with `product_spec_planning_requires_scheduler_backed_runner`; Product/Spec Planning must run through Runtime Work Graph scheduler policy.

Live behavior now covered by source and focused tests:

- first executable Product/Spec Planning node must be `planning_orchestrator`
- bounded ResearchBriefs require source refs, citation refs for claims, assumptions, freshness/staleness notes, and raw-storage flags
- Work Queue owner readback projects Planning Capsule, research influence, stale external assumptions, human decision options and pending/accepted/rejected/not-required state, ActionGraphProposal, compile readiness, validation, bounded Mission Ledger evidence state, limitations, and ELI5 fields
- proposed children remain proposal-only until a later compile/authority boundary
- Work Queue lifecycle remains readback/control projection, not runtime lifecycle truth

## 2026-05-17 Scheduler/Worker Packet Hardening

Pre-proof scheduler hardening added the missing packet boundary between
Mission Ledger commitments, context scout handoff, and implementation workers.

Completed source/test changes:

- `CommitmentWorkPacket`, `ContextHandoffPacket`, and
  `ImplementationTaskPacket v3` contracts.
- scheduler passes commitment work packets to the orchestrator and traces the
  packet compile step.
- Kimi/non-Codex implementation receives an implementation task packet with
  exact objective, target refs, context refs, validation refs, acceptance
  criteria, and commitment ids.
- historical Kimi patch-JSON diagnostics exposed packet/target/criteria
  presence plus diff/search-replace/context-request shape; that retired lane
  has since been replaced by the model-agnostic non-Codex tool worker loop.
- graph edge persistence rejects unknown node refs before DB write and records
  symbolic future milestones as metadata instead of invalid foreign keys.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/mission-work-packets.test.ts`
- retired validation:
  `pnpm test:file extensions/execution-platform/src/codex-bridge/kimi-file-implementation-adapter.test.ts`
  applied to the deleted patch-JSON lane and is no longer a current production
  gate.
- `pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
- `pnpm tsgo:full`

This pass intentionally did not replay the failed Product/Spec Planning
Mission Ledger. The next proof should replay/run only after these packet
contracts are present in the production worker path.

## 2026-05-17 Context Supply Chain And Context Scout Tool Loop

The child-worker context boundary is now stronger than packet summaries alone.
Production coding-team scheduler runs build a bounded source-prompt context
index, allow context scout to request specific prompt-section excerpts as
volatile input, and record only hashes, refs, bounded summaries, and
raw-storage flags.

Completed runtime wiring:

- `source_prompt.index`, `source_prompt.request_excerpt`,
  `source_prompt.provide_excerpt`, and `source_prompt.deny_excerpt` are
  registered Runtime Tool-Call Kernel surfaces.
- `CommitmentWorkPacket` now carries commitment meaning, context request
  hints, required evidence-claim descriptions, stop-if-missing rules, and
  quality-review refs.
- context scout receives the source-prompt section index plus Grade A
  commitment packets, can ask for bounded excerpts, and gets one follow-up
  turn with those excerpts as volatile input.
- accepted context scout output is compiled into a `ContextHandoffPacket`
  before implementation.
- implementation nodes that require upstream context handoff stop as
  `needs_review` instead of guessing from weak context.
- Work Queue owner readback now surfaces source prompt hash/length/resolution,
  section refs, excerpt decisions, verified context file refs, context handoff
  refs, and context blockers.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/source-prompt-context.test.ts extensions/execution-platform/src/workflows/mission-work-packets.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts`
- `pnpm tsgo:full`
- `node scripts/run-oxlint.mjs` on touched runtime/context/readback files
- `git diff --check`

## 2026-05-17 Generic Orchestration Substrate

Coding-team orchestration lessons are now captured as reusable workflow
contracts instead of coding-only runner assumptions.

Completed runtime wiring:

- `WorkflowDefinition` carries a canonical `WorkflowOrchestrationPolicy`:
  required phases, role classes, context needs, source-prompt policy,
  capability utility policy, human decision policy, runtime tool families,
  readback policy, and raw-storage flags.
- canonical definitions now include coding, Product/Spec Planning, web
  research, docs/skills, QA/test, architecture, design, and marketing
  workflow surfaces. Non-migrated workflows remain
  `registered_needs_executor_migration`, not production success paths.
- workflow plugins expose orchestration policy refs, required phases, role
  classes, and context needs in plugin resolution/readback.
- scheduler node results are checked against a generic node-result contract:
  bounded evidence claims, known commitment ids, raw-storage flags, and no
  Work Queue lifecycle mutation.
- Work Queue readback now exposes orchestration policy refs, required phases,
  required role classes, and context-need counts for workflow definition and
  plugin evidence.
- `single_agent.web_research` now has a dedicated evidence profile instead of
  falling through to generic workflow fallback.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/workflow-orchestration-policy.test.ts extensions/execution-platform/src/workflows/workflow-node-execution.test.ts extensions/execution-platform/src/workflows/workflow-definition.test.ts extensions/execution-platform/src/workflows/workflow-definition-registry.test.ts extensions/execution-platform/src/workflows/workflow-plugin.test.ts extensions/execution-platform/src/workflows/workflow-evidence-profile.test.ts extensions/execution-platform/src/workflows/agent-team-coding-plugin.test.ts extensions/execution-platform/src/workflows/product-spec-planning-plugin.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `pnpm tsgo:full`

## 2026-05-17 Generic Orchestration Runtime Spec

The generic orchestration substrate is now promoted into a concrete runtime
architecture spec:

- `docs/projects/execution-platform/specs/generic-orchestration-runtime.md`

The spec defines the production target for a workflow-agnostic runtime engine
anchored in Runtime Work Graph and Runtime Tool-Call Kernel. It separates the
runtime engine from workflow plugins, node executors, Work Queue projection,
Mission Ledger commitment truth, evidence claims, and model-authored
completion review.

New DB Work Queue sequence:

1. `openclaw-convergence.generic-orchestration-runtime-engine`
2. `openclaw-convergence.generic-staged-scheduler-protocol`
3. `openclaw-convergence.generic-node-executor-evidence-contract`
4. `openclaw-convergence.active-queue-34`
5. `openclaw-convergence.workflow-runtime-04-workflow-plugin-breadth`
6. `openclaw-convergence.future-team-workflow-readiness`

Items 1-3 should run before the next Product/Spec Planning proof. Product/Spec
Planning remains the first live proof of the generic runtime spine.

## 2026-05-22 Product/Spec Proof Pre-Implementation Fixes

Latest Product/Spec checkpointed proof evidence:

- runtime job: `native-exec-e2a754d03ba122a2`
- result: `needs_review`
- failure class: `worker_adapter_threw:artifact_metadata_limit`
- no implementation edits landed.
- scheduler accepted a 50-node / 52-edge graph and reached resource
  materialization before failing.

Production fixes before the next proof:

- graph metadata resource summaries use schema-safe metric keys such as
  `targetFileSnapshotCount` and `targetFileSnapshotMax`; body-like keys remain
  rejected in graph metadata.
- parallel frontier has a systemic failure guard that halts repeated sibling
  branch exceptions and surfaces one root cause instead of churning through
  equivalent branches.
- scheduler conflict domains now distinguish implementation/write refs from
  validation-command refs, so shared validation commands do not serialize
  unrelated implementation tasks as file writes.
- context scout defaults are locked to the qualified local-context model
  policy (`qwen/qwen3-coder-next`) unless a future provider profile proves
  another model suitable for that role.

Next proof expectations:

- resource materialization should not fail on graph metadata count summaries.
- parallel frontier readback should show branch id, node id, blocker, schema
  path, readiness ref, selected nodes, and typed conflict domains.
- adapter failure must terminalize branch truth clearly instead of looking like
  an indefinitely pending live job.

Follow-up proof rerun:

- runtime job: `native-exec-5a786db6b86b6c6d`
- wall time: 306s
- submit duration: 96.2s; front-door GPT-5.5 latency: 45.3s.
- Mission Ledger succeeded.
- commitment packet authoring stopped at 13/14 completed packets; no graph or
  implementation work ran.
- root cause was a task-policy mismatch: targeted packet normalization used
  the semantic author's 8,000 token request against the
  `schema_normalization` policy, causing a structured-adapter preflight block.
- fix: targeted packet normalization now has its own 2,400 token / 30s
  budget and runtime worker lifecycle treats packet fanout failure as a
  terminal `needs_review` boundary, not an unclassified retry.

Second proof rerun:

- runtime job: `native-exec-560e1b96c47fae7a`
- wall time: 1,346s; result: `needs_review`.
- Mission Ledger passed, 12/12 commitment packets completed, and 13
  context-scout role invocations executed.
- graph reached 82 nodes / 86 edges and produced implementation context,
  resource materialization, and implementation task packet artifacts.
- no implementation edits landed.
- terminal blocker:
  `execution.generic_orchestration_runtime_result` metadata exceeded 65,536
  bytes because it embedded the full scheduler result.
- fix: generic orchestration runtime result metadata is now a bounded manifest
  with capped refs/counts and scheduler summary only; full scheduler state
  remains in graph/progress artifacts.

## 2026-05-23 Execution Intent / Evidence Mode Dispatch

Pre-proof dispatch hardening is implemented for the after-resource boundary.

- Added canonical execution intent and evidence mode contracts.
- Staged scheduler protocol now asks the model for `executionIntent`; runtime
  derives evidence mode and rejects intent/capability conflicts.
- Post-context implementation task packets, coding resource packets,
  `NodeExecutionPacket`, and `NodeReadinessState` now carry execution intent
  and evidence mode.
- File-edit worker readiness requires `source_edit` plus
  `changed_file_evidence`.
- Product/Spec after-resource replay now reports stale persisted readiness
  when recomputed readiness blocks a node.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/mission-work-packets.test.ts extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/orchestrator-graph-decision.test.ts extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.test.ts extensions/execution-platform/src/workflows/context-broker.test.ts`
- `pnpm tsgo:fast ...execution-intent/resource-materialization/scheduler changed files`
- after-resource replay:
  `native-exec-e968a6a61f5d5293` /
  `product-spec-replay-b56cc1b6440c2443` returned `needs_review` with zero
  executable edit-required nodes and explicit blockers for missing execution
  intent / changed-file evidence.

Work Queue:

- `openclaw-convergence.execution-intent-evidence-mode-worker-dispatch` is
  active immediately before `openclaw-convergence.active-queue-34`.
