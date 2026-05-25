# Post-Proof Generic Runtime Extraction

Date: 2026-05-21

Status: partially superseded by
[Pre-Product/Spec Execution Platform Modularization](/projects/execution-platform/specs/pre-product-spec-execution-platform-modularization).
The Product/Spec proof did expose monolith and runtime/proof divergence
failures, including replay-specific context synthesis glue re-entering a path
that production had already moved to scheduler-first node-scoped context.
Therefore the first three extraction items are promoted before Product/Spec:

- Generic Runtime Spine Extraction.
- Dynamic Runner Plugin Thinning.
- Generic Replay And Readiness Lifecycle.

Cross-Workflow Orchestration Proof Lanes remain post-Product/Spec unless a
future failure shows the generic runtime cannot be trusted without a
non-coding lane first.

## Problem

OpenClaw has moved many contracts into workflow definitions, plugins,
capability manifests, runtime tools, payload stores, readiness state, and
Work Queue readback. However, much of the production behavior still lives in
large coding-team-specific modules:

- `DynamicAgentTeamGraphRunner` remains a large production coordinator.
- `RuntimeWorkGraphScheduler` owns too many responsibilities in one file.
- replay/resource/readiness/repair/parallel frontier behavior is becoming
  generic by policy, but not fully generic by module ownership.

This creates future brittleness:

- design, marketing, research, QA, docs, memory, and planning workflows may
  rediscover coding-team lessons instead of using the same runtime spine;
- bug fixes may land in coding-specific paths and fail to generalize;
- test and replay harnesses may become proof-shaped instead of production
  runtime surfaces;
- Work Queue readback may depend on event conventions instead of typed
  runtime state;
- compatibility surfaces may survive because no module boundary makes them
  obviously illegal.

## Target Architecture

The generic runtime owns workflow execution. Coding becomes a plugin.

### Generic Runtime Owns

- durable phase transitions;
- replay boundaries;
- node readiness lifecycle;
- resource materialization;
- parallel frontier supersteps;
- repair routing;
- branch result contracts;
- worker invocation guards;
- evidence claim handoff;
- validation/repair loop routing;
- closeout readiness;
- Work Queue runtime events and readback state.

### Workflow Plugins Own

- workflow id and definition refs;
- capability subset;
- role coverage policy;
- executor registrations;
- evidence profile;
- domain resource compiler registration;
- workflow-specific readback projection refs;
- closeout/completion review policy refs.

### Coding Plugin Owns

- coding node executor implementations;
- code intelligence and context scout tools;
- file edit worker adapters;
- validation command conventions;
- changed-file/evidence mapping;
- code-review/readback formatting.

It must not own generic graph lifecycle, generic replay, generic resource
storage, generic readiness, generic parallel frontier, generic repair routing,
or generic Work Queue lifecycle.

## Work Queue Items

### 1. Generic Runtime Spine Extraction

Work item:
`openclaw-convergence.post-proof-01-generic-runtime-spine-extraction`

Implementation status on 2026-05-24: implemented as the first production
runtime-spine extraction. `generic-runtime-spine.ts` is the canonical spine
contract for readiness composition, scheduler-option gate evaluation,
scheduler-result lifecycle status, bounded readiness/lifecycle metadata, and
false-success rejection. `agent_team.coding` reaches that spine through
`GenericOrchestrationRuntime`, and a non-coding docs/skills readiness lane is
covered by focused tests. The large dynamic runner still contains coding
orchestration bulk; that is now the next item, Dynamic Runner Plugin
Thinning.

Move the following out of coding-specific runner/scheduler bulk and into
generic runtime modules:

- replay boundary registry;
- resource-materialization boundary execution;
- `NodeReadinessState` transition evaluation;
- branch result contract;
- superstep result aggregation;
- repair/escalation routing;
- Work Queue runtime event emission for generic state.

Success gates:

- `agent_team.coding` and at least one non-coding workflow can use the same
  generic runtime boundary APIs;
- coding runner delegates to generic runtime for lifecycle decisions;
- no production success path bypasses generic readiness/evidence/closeout
  gates;
- focused tests cover both coding and non-coding workflow definitions.

### 2. Dynamic Runner Plugin Thinning

Work item:
`openclaw-convergence.post-proof-02-dynamic-runner-plugin-thinning`

Implementation status on 2026-05-24: implemented for the production
generic-runtime execution lifecycle slice. `DynamicAgentTeamGraphRunner`
delegates generic runtime artifact lifecycle to
`generic-orchestration-runtime-execution.ts`, including plugin resolution,
runtime readiness, generic runtime spine readiness/lifecycle, workflow graph
engine readiness, and generic orchestration runtime result persistence.
Coding-specific scheduler executor registration moved to
`coding-team-runtime-adapter.ts`. The runner is not yet small, but the
remaining large surfaces are now explicitly coding callback/adapter surfaces
or queued generic replay/progress/compatibility work.

Reduce `DynamicAgentTeamGraphRunner` to coding plugin wiring and adapter
orchestration. It should construct inputs, register coding executors, call
the generic runtime, and report bounded results. It should not contain the
workflow brain.

Success gates:

- generic scheduler/replay/resource/readiness logic is not duplicated in the
  runner;
- runner-specific branches for proof/replay are removed or test-only;
- production construction uses one canonical generic runtime entrypoint;
- code size and dependency direction improve measurably.

### 3. Generic Replay And Readiness Lifecycle

Work item:
`openclaw-convergence.post-proof-03-generic-replay-readiness-lifecycle`

Implementation status on 2026-05-24: implemented for the promoted pre-proof
slice. The workflow-agnostic registry lives in
`boundary-replay-registry.ts`; `BoundaryReplayService` reads registry
definitions for dependency planning, diagnostic-only enforcement, transition
selection, terminal blocker classes, and readback fields. Versioned structural
normalizers fail closed with exact missing field paths. Work Queue readback
projects registry-backed replay state. The Product/Spec boundary replay CLI
still contains diagnostic harness logic, but supported boundaries and
checkpoint policy are now registry-backed and legacy
`after_context_synthesis` remains diagnostic-only.

Turn replay/checkpoint boundaries into a workflow-agnostic registry:

- boundary ids;
- required artifacts;
- normalization policy;
- resume command;
- allowed next transitions;
- terminal blocker classes;
- readback projection.

Success gates:

- boundary replay is not Product/Spec-specific;
- replay can resume from multiple checkpoint classes without rerunning
  upstream phases;
- replay normalizers are versioned and fail closed with exact missing refs;
- Work Queue readback can show any active boundary with the same schema.

### 4. Cross-Workflow Orchestration Proof Lanes

Work item:
`openclaw-convergence.post-proof-04-cross-workflow-orchestration-proof-lanes`

Prove the generic runtime outside coding:

- one planning/research workflow lane;
- one docs/skills or QA lane;
- one architecture/design/marketing placeholder lane if executor coverage
  exists, otherwise a readiness-negative lane.

Success gates:

- non-coding workflows use workflow definitions/plugins/capabilities instead
  of coding runner assumptions;
- resource packets are domain-specific but runtime lifecycle is shared;
- evidence claims and closeout use the same generic contract;
- no workflow can produce production success through generic queued-runner
  compatibility paths.

## Priority Order

The first three items are now sorted before
`openclaw-convergence.active-queue-34` by the pre-proof modularization spec.
Cross-Workflow Orchestration Proof Lanes remains directly after Product/Spec,
before lower-priority post-proof items such as Work Queue UX polish, role
configuration surfaces, tool search, benchmark registry, memory context
packs, and workflow plugin breadth.

They intentionally precede broad feature expansion because they reduce the
risk that future agent teams reimplement orchestration lessons in parallel.
