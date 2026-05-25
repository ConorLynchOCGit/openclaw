---
summary: "Pre-Product/Spec modularization and proof/runtime boundary cleanup for the Execution Platform."
title: "Pre-Product/Spec Execution Platform Modularization"
---

# Pre-Product/Spec Execution Platform Modularization

Date: 2026-05-23

Status: accepted pre-proof refactor tranche. This supersedes the earlier
assumption that all generic runtime extraction can wait until after the
Product/Spec Planning proof.

## Why This Runs Before Product/Spec

The Product/Spec proof has repeatedly exposed real runtime problems, but the
current code shape is now itself a risk multiplier. The execution path is
spread across large production coordinators, proof harnesses, replay scripts,
runtime tools, Work Queue readback, and coding-specific adapters. That makes
it too easy for old topology, proof-only glue, semantic shortcuts, or stale
compatibility branches to re-enter a proof after a later pass already removed
them.

The most recent example was context synthesis. Production policy had moved to
scheduler-first node-scoped context supply, but replay code still injected a
default `context_synthesis` node as glue. The result looked like a functional
regression even though the production scheduler prompt and policy had moved
on. That class of issue is architectural: runtime and proof paths still share
too many responsibilities informally instead of through narrow module
boundaries.

## Current Size And Ownership Risk

Representative files as of this pass:

- `extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`
  is about 13,900 lines.
- `extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts`
  is about 11,300 lines.
- `extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
  is about 8,700 lines.
- `extensions/execution-platform/src/work-queue/execution-read-model.ts`
  is about 6,800 lines.
- `extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts`
  is about 5,500 lines.
- `scripts/execution-platform-run-product-spec-boundary-replay.mjs`
  is about 4,900 lines.

Large files are not automatically wrong, but here they correlate with
boundary drift:

- scheduler policy, graph persistence, execution, repair, progress, and
  closeout are too close together;
- coding-specific runner code still owns generic lifecycle behavior;
- replay/proof scripts contain runtime topology decisions;
- readback projection depends on event shape rather than a small typed
  runtime state surface;
- compatibility and diagnostic paths can be hard to distinguish from
  production paths.

## Refactor Principles

- Preserve current production behavior unless a path is explicitly legacy,
  diagnostic-only, or unsafe.
- Add characterization tests before extraction.
- Move code by ownership boundary, not by incidental helper shape.
- Runtime owns schema, refs, bounds, persistence, lifecycle, authority,
  replay, and tool execution.
- Models own semantic meaning, usefulness, sufficiency, and rationale.
- Workflow plugins own domain-specific capability and evidence policy.
- Proof harnesses must consume runtime services; they must not own production
  graph topology.
- No deterministic substring classifiers, Product/Spec-specific generic
  scheduler branches, or proof-only success paths.
- No compatibility branch may produce production workflow success without
  Mission Ledger evidence, runtime tool traces, profile evaluation, accepted
  evidence claims, validation/readback, and model-authored closeout.

## Pass 1: Characterization And Import Boundary Guardrails

Work item:
`openclaw-convergence.pre-proof-01-execution-platform-characterization-guardrails`

Implementation status on 2026-05-24: implemented and ready for closeout from
focused validation. The guardrail module is
`extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.ts`.

Purpose: make refactor safe before moving modules.

Scope:

- Add source/import-boundary tests that classify files as production runtime,
  workflow plugin, coding adapter, replay harness, diagnostic script, or test
  fixture.
- Add guard tests that production imports do not reach proof/replay topology
  constructors, diagnostic-only Mission Ledger compiler paths, or legacy
  context-synthesis glue.
- Add source guards for prohibited semantic drift: no generic scheduler,
  router, packet compiler, context scout, or worker adapter should contain
  Product/Spec-specific substring decisions or workflow-specific file scoring.
- Add characterization tests around current Product/Spec replay topology:
  scheduler-first context supply, optional explicit synthesis only, payload
  manifests, graph patch refs, NodeReadinessState, execution intent/evidence
  mode, branch-local blockers, and Work Queue child sync.
- Produce a module ownership map that future refactor passes must preserve.

Success gates:

- focused tests prove no production path imports proof harness topology;
- focused tests prove replay cannot inject `context_synthesis` unless a
  workflow definition or accepted model-authored structure review explicitly
  requires it;
- focused tests fail on deterministic Product/Spec substring classifiers in
  generic runtime modules;
- Work Queue/readback remains unchanged except for bounded refactor metadata.

Implemented details:

- `ExecutionPlatformBoundaryCategory` classifies production runtime, workflow
  plugin, coding adapter, worker adapter, Work Queue readback, Runtime Tool
  Kernel, model task contract, replay harness, proof script, diagnostic
  script, test fixture, and deprecated legacy surfaces.
- `evaluateExecutionPlatformBoundaryGuardrails(...)` blocks production imports
  of replay/proof/diagnostic/test/legacy modules and flags replay harnesses
  that reintroduce default `context_synthesis` topology glue.
- `executionPlatformModuleOwnershipMap()` records the ownership map that the
  following extraction passes must preserve.
- Work Queue readback no longer imports
  `codex-bridge/workflow-queued-runner.ts` for the generic-runner retirement
  artifact constant; that constant now lives in
  `workflows/generic-workflow-runner-retirement-contract.ts`.
- Existing no-semantic-cheat and Product/Spec topology source guards now run
  alongside the typed boundary audit.

## Pass 2: Generic Runtime Spine Extraction

Work item:
`openclaw-convergence.post-proof-01-generic-runtime-spine-extraction`

This existing item is promoted to pre-proof.

Implementation status on 2026-05-24: implemented for the production
lifecycle boundary. The new module
`extensions/execution-platform/src/workflows/generic-runtime-spine.ts` owns
workflow readiness composition, scheduler-option gate evaluation,
scheduler-result lifecycle status, and false-success prevention when a
scheduler claims success without graph evidence. `GenericOrchestrationRuntime`
delegates those decisions to the spine, and
`DynamicAgentTeamGraphRunner` persists generic runtime spine readiness and
lifecycle artifacts before/after scheduler execution. Remaining runner bulk
is intentionally left for Dynamic Runner Plugin Thinning.

Purpose: move generic lifecycle decisions out of coding-specific runner bulk
and into a workflow-agnostic runtime spine.

Scope:

- Extract replay boundary registry and boundary-state hydration.
- Extract resource materialization boundary execution.
- Extract `NodeReadinessState` transition evaluation and readiness repair
  actions.
- Extract branch result contract and superstep result aggregation.
- Extract repair/escalation routing.
- Extract generic Work Queue runtime event emission for graph/node/frontier
  state.
- Keep coding plugin ownership limited to coding executors, code
  intelligence, file-edit adapters, validation conventions, and coding
  evidence mapping.

Success gates:

- `agent_team.coding` uses the generic runtime APIs for lifecycle decisions.
- At least one non-coding workflow definition can resolve the same generic
  runtime boundary APIs in a negative/readiness lane.
- No production success path bypasses generic readiness, evidence, profile,
  validation, or closeout gates.
- The dynamic runner delegates lifecycle state rather than reimplementing it.

## Pass 3: Dynamic Runner Plugin Thinning

Work item:
`openclaw-convergence.post-proof-02-dynamic-runner-plugin-thinning`

This existing item is promoted to pre-proof.

Implementation status on 2026-05-24: implemented for the first production
runner-thinning slice. Generic workflow runtime execution persistence now
lives in
`extensions/execution-platform/src/workflows/generic-orchestration-runtime-execution.ts`.
That service persists workflow plugin resolution, generic runtime readiness,
generic runtime spine readiness/lifecycle, runtime workflow engine
readiness, and generic orchestration runtime result artifacts. The dynamic
runner calls `runAndPersistGenericSchedulerGraph(...)` instead of
instantiating/persisting generic runtime artifacts inline. Coding-specific
scheduler executor registration now lives in
`extensions/execution-platform/src/codex-bridge/coding-team-runtime-adapter.ts`.
Remaining dynamic-runner bulk is coding-specific context/worker/resource/
validation/closeout callback logic and is split between Generic Replay And
Readiness Lifecycle, Progress/Readback modularization, and Compatibility
Retirement.

Purpose: make `DynamicAgentTeamGraphRunner` a coding plugin adapter rather
than the workflow brain.

Scope:

- Move Mission Ledger invocation, packet author orchestration, scheduler
  handoff, boundary state writes, progress emission, and closeout routing
  behind generic runtime/service interfaces where those behaviors are not
  coding-specific.
- Keep coding-specific pieces in a small plugin surface: capability
  registration, code intelligence/context tools, file-edit worker adapters,
  validation command policy, source-change evidence mapping, and review
  formatting.
- Remove or quarantine proof/replay branches from production runner
  construction.
- Replace local progress payload construction with generic graph patch and
  latest-run-state writers.

Success gates:

- runner code no longer owns generic scheduler/replay/resource/readiness
  policy;
- public production construction uses one canonical generic runtime
  entrypoint;
- proof/replay code cannot be imported by production runner paths;
- code size and dependency direction improve measurably without changing
  Product/Spec behavior.

## Pass 4: Generic Replay And Readiness Lifecycle

Work item:
`openclaw-convergence.post-proof-03-generic-replay-readiness-lifecycle`

This existing item is promoted to pre-proof.

Implementation status on 2026-05-24: implemented for the generic replay
registry and readiness lifecycle slice. `boundary-replay-registry.ts` now owns
workflow-agnostic checkpoint definitions, required upstream boundaries,
versioned normalizers, resume command defaults, allowed next transitions,
terminal blocker classes, readback projection fields, and diagnostic-only
policy. `BoundaryReplayService` compiles plans and production continuations
from that registry, emits registry metadata, and rejects diagnostic-only
`after_context_synthesis` as a production replay boundary unless explicit
diagnostic allowance is provided. Work Queue readback now surfaces the
registry-backed replay schema. Product/Spec replay remains a CLI harness, but
its supported-boundary and checkpoint policy now resolve through the runtime
registry.

Purpose: turn checkpoint replay from Product/Spec scripts into a generic
runtime diagnostic service.

Scope:

- Add a workflow-agnostic boundary registry:
  - boundary id;
  - workflow id;
  - required artifact refs;
  - versioned normalizers;
  - resume command;
  - allowed next transitions;
  - terminal blocker classes;
  - readback projection fields.
- Move Product/Spec boundary replay graph construction into runtime library
  code with explicit topology policy.
- Keep legacy `after-context-synthesis` replay diagnostic-only.
- Add negative tests for missing checkpoint artifacts and stale readiness
  state.

Success gates:

- replay can resume from router, Mission Ledger, packet, context, graph,
  resource materialization, worker, validation, readback, and closeout
  boundaries without rerunning upstream phases;
- replay normalizers fail closed with exact missing refs;
- Work Queue readback can show any active replay boundary using the same
  schema;
- proof scripts become thin CLIs over runtime services.

## Pass 5: Progress, Readback, And Runtime Event Modularization

Work item:
`openclaw-convergence.pre-proof-02-progress-readback-runtime-event-modularization`

Implementation status on 2026-05-24: implemented for the owner-facing
readback projection boundary. `execution-read-model.ts` delegates active
graph progress and runtime artifact payload manifest readback to
`work-queue/projections/*` modules. The projection layer now has explicit
modules for active graph progress, boundary replay, worker-internal progress,
model usage/walltime, runtime artifact manifests, and bounded projection
helpers. Module-level tests prove the projection layer can be exercised
without constructing the full Work Queue read model and that raw
prompt/provider/tool/command/DB/hidden-reasoning bodies are not emitted from
the new readback projections.

Purpose: reduce `execution-read-model.ts` and progress-event drift before the
next long proof.

Scope:

- Extract scheduler graph/readiness projection.
- Extract worker-internal progress projection.
- Extract runtime artifact payload manifest projection.
- Extract Work Queue child materialization projection.
- Extract token/walltime/model-usage projection.
- Extract replay/boundary projection.
- Make all projections consume compact latest-run-state, graph patch refs,
  runtime artifact contract manifests, and branch result refs rather than
  full payload bodies.

Success gates:

- owner-facing readback continues to show active node, branch id, phase,
  blocker, schema path, readiness ref, model/tool, evidence refs, token/
  walltime availability, and next transition;
- no projection stores or emits raw prompts, raw provider responses, raw
  command logs, raw DB rows, secrets, or hidden reasoning;
- projection modules can be tested independently of full Work Queue
  read-model construction.

## Pass 6: Compatibility Retirement And Bypass Audit

Work item:
`openclaw-convergence.toolification-13-compatibility-retirement-bypass-audit`

This existing refactor item is promoted to pre-proof.

Purpose: remove or hard-disable remaining bypass surfaces before another
Product/Spec proof.

Scope:

- Audit generic queued runner surfaces, legacy semantic fallback paths,
  static role-sequence runners, proof-era adapter exports, legacy patch-JSON
  worker paths, old context-synthesis replay glue, and compatibility readback
  maps.
- Mark any retained diagnostic/proof-only path with explicit test-only or
  diagnostic-only imports and flags.
- Add runtime assertions that no production workflow success can be produced
  through compatibility closeout, degraded closeout, generic queued fallback,
  proof harness replay logic, or legacy semantic fallback.
- Remove public runtime exports for retired proof-era adapters.

Success gates:

- production path import graph contains no proof harness topology;
- Product/Spec Planning rejects generic queued fallback;
- closeout success remains impossible without accepted profile, evidence,
  validation/readback, and model-authored closeout;
- compatibility maps are registry-derived or diagnostic-only.

## Pass 7: Model Contract Compiler Consolidation

Work item:
`openclaw-convergence.model-contract-compiler-consolidation`

This existing refactor item is promoted to pre-proof because schema-boundary
drift is one of the repeated proof failure classes.

Implementation status on 2026-05-24: implemented for the production compiler
boundary. `model-decision-contracts/model-decision-compiler.ts` now owns the
canonical contract boundary registry, runtime-owned field vocabulary,
recursive raw-storage rejection, field-specific repair packet shape, and
structural-only compile diagnostics. The staged scheduler/orchestrator path
uses the compiler-owned runtime-owned field collector instead of a local field
list. Focused tests cover boundary inventory, nested runtime-owned field
rejection, recursive raw-storage flags, field-specific repair alternatives,
evidence-kind non-inference, no Product/Spec substring behavior, and the
compiler-backed staged scheduler reason-code path.

Purpose: consolidate repeated model-output parsing, repair, normalization,
and runtime-owned schema compilation boundaries.

Scope:

- Inventory router, Mission Ledger, packet author, context scout, scheduler,
  capability selection, resource materialization, validation, worker, review,
  and closeout model contracts.
- Extract common compiler primitives for:
  - model-authored semantic intent;
  - runtime-owned ids/refs/envelopes;
  - allowed enum repair;
  - bounded field-specific repair;
  - provider diagnostics;
  - raw-storage flag validation;
  - manifest/payload ref validation.
- Remove duplicate parser/repair helpers where local copies have drifted.
- Ensure fast models receive small typed semantic contracts and never need to
  invent runtime-owned schema fields.

Success gates:

- generic runtime contracts share one compiler/repair vocabulary;
- no model contract asks a model to invent executor keys, node kinds,
  runtime ids, artifact refs, Work Queue lifecycle state, storage flags, or
  graph envelopes;
- focused tests cover accepted aliases, invalid enum repair, no-content
  diagnostics, field-specific repair, and runtime-owned ref compilation.

## Pass 8: Product/Spec Proof

Work item:
`openclaw-convergence.active-queue-34`

Run only after the promoted refactor tranche passes focused validation and
the queue no longer contains active generated proof children ahead of the
canonical proof item.

Proof must show:

- route and Mission Ledger truth;
- worker-ready CommitmentWorkPackets;
- scheduler-first graph creation from packets;
- node-scoped context supply or explicit model-authored coordination;
- payload-backed resource packets and readiness;
- execution intent/evidence mode gating;
- at least one real implementation/source-edit path where appropriate;
- validation;
- review/readback;
- model-authored closeout;
- Work Queue proof state that can close or correctly keep open the canonical
  Product/Spec item.

## Items Not Promoted By This Pass

The following remain after Product/Spec unless a later failure makes them
immediate blockers:

- Runtime Artifact Retention And Pruning Policy.
- Scheduler Phase Budget Governor.
- Work Queue Frontier Delta Stream And Branch Controls.
- Cross-Workflow Orchestration Proof Lanes.
- workflow plugin breadth.
- memory/context/proactivity toolification.
- role/model benchmark registry.
- future design/marketing workflow adapters.

They matter, but they are feature expansion or post-proof operations work,
not cleanup needed to prevent stale production/proof boundary drift in the
next Product/Spec proof.
