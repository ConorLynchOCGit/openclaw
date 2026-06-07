---
summary: "SchedulerStageRunner architecture for converting RequirementMap inventory into compact runtime graphs with aggregate validation, review, and closeout tail nodes."
title: "Scheduler Graph Patch Runner"
---

# Scheduler Graph Patch Runner

Date: 2026-06-04

Status: governing scheduler architecture after RequirementMap intake.

## Decision

Fresh scheduling no longer creates `WorkIntent` graph-control nodes. The
scheduler converts an accepted `RequirementMap` directly into a minimal
`SchedulerGraphPatch` and persists runtime graph nodes/edges from that patch.
`NodeLifecycleTransitionRunner` then projects and executes node-local
lifecycle from persisted runtime nodes.

Canonical path:

```text
RouterStageRunner
  -> IntakeStageRunner
      -> SourcePromptArtifact
      -> RequirementMap
  -> SchedulerStageRunner
      -> SchedulerGraphPatch
  -> RuntimeGraphRepository
      -> RuntimeGraphNode / RuntimeGraphEdge
  -> NodeLifecycleTransitionRunner
```

Retired fresh-scheduling path:

```text
RequirementMap
  -> SchedulerRequirementInventory
  -> staged graph draft
  -> OrchestratorGraphDecision
  -> WorkIntent graph node
  -> WorkIntent promotion
  -> executable node
  -> NodeLifecycleProjection
```

`WorkIntent` may survive only as historical/migration vocabulary or as a pure
compatibility compiler artifact behind non-production migration adapters. It
must not be a live graph-control node, readiness gate, lifecycle owner, or
fresh scheduler output.

## Problem

The Product/Spec proof reached accepted RequirementMap output, then exposed
that scheduler input quality and scheduler product shape are different
problems.

The accepted RequirementMap had complete prompt coverage and useful
requirements, but it was a raw inventory:

- some requirements were proof/process instructions;
- roles were useful hints but not execution truth;
- many checklist items were too granular to become standalone workers;
- validation, review, and closeout obligations are real graph work and cannot
  be satisfied by worker self-claims or passive coverage entries.

The old scheduler path still carried too many intermediate control products:
inventory projections, staged graph drafts, `OrchestratorGraphDecision`,
`WorkIntent` graph nodes, promotion semantics, submit tools, and late
reason-code repair. Each layer added state that could disagree with the next.

The fix is not to harden RequirementMap until it looks like an executable
graph. The fix is to make the scheduler own one narrow job: convert requirement
inventory into graph shape.

## Ownership

`SchedulerStageRunner` owns:

- grouping requirements into coherent graph work;
- deciding which requirements become implementation/source nodes, aggregate
  mission validation nodes, aggregate mission review nodes, aggregate mission
  closeout nodes, constraints, deferred items, or blockers;
- choosing semantic capability bindings only when runtime cannot bind
  unambiguously;
- authoring non-obvious dependency edges;
- graph amendment from typed graph-level requests;
- typed scheduler no-progress over scheduler-owned phase state;
- producing accepted `SchedulerGraphPatch` or a typed scheduler blocker.

`SchedulerStageRunner` does not own:

- worker context sufficiency;
- prompt/repo/resource search inside a node;
- edit/action planning;
- validation repair inside a node;
- evidence gap repair inside a node;
- lifecycle transitions;
- worker-start permission;
- global mission closeout.

`NodeLifecycleTransitionRunner` owns all node-local lifecycle after graph nodes
exist:

- current gate;
- legal tool surface;
- worker-start permission;
- prompt/repo/resource context search/read;
- action/edit;
- validation;
- repair;
- escalation;
- evidence;
- node-local readback/root cause.

## Canonical Products

The execution funnel has exactly three canonical semantic products:

```text
RequirementMap       = what must be done/proven
RuntimeGraph         = who does it and in what order
NodeLifecycleState   = how one node progresses
```

There is no separate worker-packet universe on the fresh path. Old
`CodingResourcePacket`, `ImplementationTaskPacket`, `NodeExecutionPacket`, and
materialization products may survive only as historical or non-canonical helper
artifacts outside the fresh `RequirementMap -> RuntimeGraph ->
NodeLifecycleState` path.

## Canonical Graph Shape

Fresh scheduler output must make the tail work explicit:

```text
implementation/source nodes
  -> mission_validation
  -> mission_review
  -> mission_closeout
```

Validation, review, and closeout are graph nodes by default. They are not
passive scheduler coverage gates. The default is aggregate tail nodes:

- one mission validation node covering validation requirements and the output
  of all relevant implementation/source nodes;
- one mission review node covering every RequirementMap requirement and all
  implementation/validation evidence;
- one mission closeout node covering final bounded evidence closure.

The scheduler may shard validation or review only when it has a specific
reason, such as independent validation suites, disjoint subsystems, or
capability constraints. Sharding is an explicit scheduler decision; passive
gate coverage is not.

Runtime owns:

- ids;
- refs;
- hashes;
- manifests;
- graph patch transactions;
- persistence;
- deriving source refs from covered RequirementMap ids;
- deriving obvious role-order edges;
- structural validation;
- legal capability candidate narrowing.

The model owns only the semantic judgments that runtime cannot make:

- grouping judgment;
- concise node objective;
- work kind when not mechanically obvious;
- capability choice when multiple legal candidates remain;
- non-obvious semantic dependencies;
- blocked/deferred reason when a requirement cannot be scheduled.

## Canonical Product

The scheduler product is intentionally small:

```ts
type SchedulerGraphPatch = {
  artifactKind: "scheduler_graph_patch";
  schemaVersion: "execution-platform.scheduler-graph-patch.v1";
  patchId: string;
  patchRef: string;
  patchHash: string;
  sourceRequirementMapRef: string;
  sourceRequirementMapHash: string;
  patchMode: "initial_graph" | "graph_amendment";
  nodeSeeds: RuntimeNodeSeed[];
  edges: RuntimeGraphEdgeSeed[];
  requirementCoverage: RequirementCoverageDisposition[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};
```

Accepted graph patches must not carry diagnostic arrays, rejected drafts, raw
model output, lifecycle state, worker packets, or evidence bodies. Diagnostics
belong to `SchedulerStageResult` artifacts when the scheduler blocks or needs
review.

## Minimal Node Seed

```ts
type RuntimeNodeSeed = {
  nodeSeedId: string; // runtime-owned stable id
  objective: string; // model-authored
  coveredRequirementIds: string[];
  workKind:
    | "produce_artifact"
    | "change_state"
    | "validate"
    | "review"
    | "closeout"
    | "human_decision";
  capabilityId: string;
  promptSourceRefOverrides?: string[];
};
```

Node seeds must not include:

- lifecycle state;
- next legal transitions;
- worker packet fields;
- evidence contracts;
- acceptance prose;
- duplicated source refs inherited from RequirementMap;
- duplicated constraint ids;
- model-authored persistent node ids;
- node kind, executor key, worker ref, storage flags, or authority flags.

`promptSourceRefOverrides` is optional and only exists when the scheduler used
its own bounded prompt tools and found additional prompt refs that are not
already inherited from covered RequirementMap ids.

## Requirement Coverage

Every RequirementMap requirement must be represented in coverage:

```ts
type RequirementCoverageDisposition = {
  requirementId: string;
  disposition: "covered_by_node" | "carried_as_constraint" | "deferred" | "blocked";
  nodeSeedIds: string[];
  diagnosticRef?: string;
};
```

There is no separate `blockedRequirements` array. A blocked requirement is a
coverage disposition with a diagnostic ref. This avoids side arrays that can
drift from the coverage table.

Constraints stay in coverage. They are not duplicated into every node seed.
`NodeLifecycleTransitionRunner` and workers hydrate relevant constraints from
covered and carried RequirementMap ids when building node-local contracts.

Validation, review, and closeout requirements are covered by compiler-derived
mission tail node seeds unless explicitly deferred or blocked by a typed
policy/human blocker. The scheduler model must not author tail work units, and
there are no valid passive scheduler coverage dispositions named
`validation_gate`, `review_gate`, or `closeout_gate`.

## Edges

```ts
type RuntimeGraphEdgeSeed = {
  fromNodeSeedId: string;
  toNodeSeedId: string;
  edgeKind: "depends_on" | "validates" | "reviews" | "closeout_source" | "handoff";
};
```

Runtime derives obvious ordering:

- source grounding before dependent implementation;
- implementation/source work before mission validation;
- implementation/source work and validation before mission review;
- review before mission closeout.

The model authors only non-obvious semantic dependencies: prerequisite design
work, shared schema/API ordering, cross-branch coordination, or domain-specific
handoff that runtime cannot derive from role/order rules.

## Scheduler Phases

There are exactly three model phases plus runtime compile.

### 1. Coverage And Node Grouping

Goal: group RequirementMap items into coherent graph work and coverage.

Implementation/source/test-authoring requirements become core scheduler work
units. Validation, review, and closeout requirements do not become
model-authored work units. `SchedulerGraphPatch` compiler derives aggregate
mission-tail nodes from closure policy after at least one core executable node
exists. The model authors implementation grouping and only non-obvious
scheduler structure.

Visible tools:

- `scheduler.open_work_unit_from_requirement`
- `scheduler.open_work_units_from_requirements`
- `scheduler.group_requirements_into_work_unit`
- `scheduler.mark_requirement_covered_by_work_unit`
- `scheduler.add_work_unit`
- `scheduler.patch_work_unit`
- `scheduler.split_requirement_work`
- `scheduler.merge_work_units`
- `scheduler.retire_work_unit`
- `scheduler.replace_work_unit_commitment_ids`

Optional bounded prompt tools, visible only when grouping is ambiguous:

- none in the current production scheduler phase. Prompt searching belongs to
  RequirementMap intake or node-local worker context turns.

The model must not create one node per RequirementMap item by default. The
model must group checklist fragments and proof/process instructions into
coherent work or non-node coverage dispositions.

### 2. Capability Binding

Goal: bind each node seed to a legal capability.

Runtime first narrows legal candidates from:

- `workKind`;
- workflow/domain id;
- capability manifest;
- authority/policy scope;
- node action kind.

If one legal candidate remains, runtime binds it without a model turn. If more
than one legal candidate remains, the model chooses among only those candidates.

Visible tools:

- `scheduler.bind_capability`
- `scheduler.mark_non_executable_gate`

### 3. Dependency Ordering

Goal: add only non-obvious semantic edges after runtime derives obvious role
ordering.

Visible tools:

- `scheduler.add_edge`
- `scheduler.mark_parallel`
- `scheduler.confirm_runtime_derived_order`

Validation/review/closeout ordering is compiler-owned mission-tail ordering.
The model may only author non-obvious dependencies among core work units.

### 4. Runtime Compile

No model tools.

Runtime compiles `SchedulerGraphPatch`, validates the patch, persists graph
nodes and edges transactionally, and records accepted patch refs.

There are no model-authored `scheduler.submit_*` tools. Submit ceremonies are
retired because runtime can determine phase completeness from typed state.

## Closure Policy And Mission Tail Nodes

Closure semantics are a scheduler/graph concern, not a node-local lifecycle
concern. `NodeLifecycleTransitionRunner` executes persisted validation, review,
and closeout nodes after they become graph frontier work; it does not decide
whether mission tail nodes exist.

Workflow/plugin scheduler options carry the tiny closure policy:

```ts
type SchedulerClosurePolicy = {
  tailKinds: Array<"validation" | "review" | "closeout">;
  tailCapabilityIds: {
    validation: "validation_run";
    review: "reviewer";
    closeout: "coding_closeout";
  };
  proofValidationPhase: "final_proof_validation";
  standardValidationPhase: "integration_validation";
};
```

The compiler receives an explicit `closureRunMode`:

```ts
type SchedulerClosureRunMode = "proof" | "standard";
```

`closureRunMode: "proof"` derives validation tail metadata
`validationPhase: "final_proof_validation"`. `closureRunMode: "standard"`
derives `validationPhase: "integration_validation"`.

The model never authors:

- tail node ids;
- tail capabilities;
- tail dependencies;
- tail validation phase;
- tail metadata;
- tail coverage disposition.

Compiler-derived mission tail metadata is minimal:

```ts
type MissionTailMetadata = {
  missionTailKind: "validation" | "review" | "closeout";
  sourceRequirementMapRef: string;
  sourceRequirementMapHash: string;
  closureRunMode: "proof" | "standard";
  nodeLifecycleRunnerOwnsExecution: true;
  validationPhase?: "final_proof_validation" | "integration_validation";
};
```

Only the validation tail carries `validationPhase`. Review and closeout tails
must not carry fake validation phases. Tail metadata must not carry
`requiredUpstreamNodeKinds`, model-authored coverage blobs, lifecycle state, or
worker packet fields.

Tail edges are compiler-derived:

```text
core implementation/test-authoring/docs nodes
  -> mission_validation
  -> mission_review
  -> mission_closeout
```

The scheduler model may still author core-to-core dependency edges when there
is a real semantic prerequisite. It may not patch mission-tail ordering.

## Shared Graph Admission

`validateSchedulerGraphAdmission(...)` is the single graph-admission validator
for scheduler acceptance and graph persistence. A graph patch is accepted only
after admission passes; persistence reruns the same validator as the final
assertion before mutating the runtime graph.

Admission checks:

- validation tail has a validation phase derived from closure run mode;
- worker-local validation phases never appear on graph-level validation tails;
- edge endpoints exist in proposed or existing runtime graph state;
- exactly one mission tail per tail kind exists;
- tail nodes do not point back to core workers;
- at least one core executable node exists before tail nodes;
- mission tail nodes are not initial frontier nodes;
- core executable nodes are roots or depend only on pre-execution/source
  grounding nodes.

Admission diagnostics are typed scheduler graph diagnostics. They are not
model-repair prompts unless the blocked field is model-owned. Runtime-owned
tail creation, capability binding, validation phase, and closure ordering are
not repairable by scheduler model tools.

## 24-Item Build Contract

1. Scheduler model authors core work only. Core work means implementation,
   docs/source-change work, and test-authoring work that must run before
   mission validation.
2. Test-authoring remains core work. It is not a validation tail substitute.
   Test-authoring nodes feed mission validation exactly like implementation
   nodes.
3. Closure policy lives in existing workflow/plugin scheduler options. It is a
   tiny data policy: `tailKinds`, `tailCapabilityIds`,
   `proofValidationPhase`, and `standardValidationPhase`.
4. `SchedulerGraphPatch` compiler derives mission tail nodes. The scheduler
   model cannot author or repair those nodes.
5. Mutable aggregate tail draft state is retired. The scheduler draft must not
   hydrate `wu-mission-validation`, `wu-mission-review`, or
   `wu-mission-closeout` work units.
6. Tail derivation has one helper path near the graph-patch compiler and
   admission code. There must not be separate scheduler, replay, and readback
   tail builders.
7. Runtime binds tail capabilities from closure policy:
   `validation_run`, `reviewer`, and `coding_closeout`.
8. Compiler input carries explicit `closureRunMode`. Proof mode derives
   `final_proof_validation`; standard mode derives `integration_validation`.
9. Tail metadata is minimal: `missionTailKind`, RequirementMap refs/hash,
   `closureRunMode`, `nodeLifecycleRunnerOwnsExecution`, and validation
   phase only for the validation tail.
10. Validation phase is derived only from tail kind plus closure run mode. No
    model output, prompt text, or replay script reason code may choose it.
11. Metadata is written by typed builders:
    `buildSchedulerGraphNodeMetadata(...)` for core nodes and
    `buildMissionTailNodeMetadata(...)` for tails.
12. Node seeds stay compact and trace-oriented. Runtime node specs are the
    execution product; seeds are not worker packets.
13. Compiler owns runtime-ready graph construction, including node specs,
    edge specs, tail specs, and coverage.
14. `validateSchedulerGraphAdmission(...)` is the shared admission validator
    for compiler acceptance and persistence assertion.
15. Admission checks validation tail phase, worker-local phase rejection,
    edge endpoints, duplicate tails, tail-to-core back edges, core initial
    frontier, tail not initial frontier, and core dependency shape.
16. Source grounding is not overbuilt in this pass. It remains a possible
    pre-execution dependency only when a real source-grounding node exists.
17. Accepted graph means admitted graph. There is no accepted graph patch that
    waits for persistence to discover admission failure.
18. Persistence is the final assertion. It reruns shared admission and then
    mutates graph state transactionally.
19. Scheduler repair surface is reduced. Model repair is not available for
    tail creation, tail dependencies, tail capabilities, validation phase, or
    closure ordering.
20. Closure semantics stay out of `NodeLifecycleTransitionRunner`.
    NodeLifecycleRunner executes tail nodes after scheduling but does not
    decide mission tail topology.
21. Replay executor clarity: this pass proves graph persistence and reaching
    implementation. Full validation/review/closeout executor support is a
    later executor pass.
22. Replay exit semantics fail by default on `failed`, `needs_review`, or
    `max_iterations`. Diagnostic zero exit is explicit with
    `--diagnostic-exit-zero`.
23. Regression tests must prove core-only output yields tail nodes,
    test-authoring is core, closure policy derives tails, proof/standard
    phases differ correctly, review/closeout do not carry fake validation
    phase, tail edges are correct, accepted graph passes admission,
    persistence uses the same admission validator, invalid validation phase
    cannot be accepted, tail nodes are not first frontier, and replay
    semantics are nonzero on needs-review.
24. Replay proof from accepted RequirementMap through scheduling must persist
    core plus tail nodes, keep tail nodes out of the initial frontier, and
    continue into the first implementation/context phase when worker execution
    is enabled.

## Native Tool Transport

All scheduler model phases use provider-native tools through the shared model
tool transport. The scheduler must not call provider-specific clients, direct
`runJson`, direct `runTools`, direct `callTools`, direct Codex app-server tool
executors, or JSON-shaped `schedulerToolCalls` as model transport.

Allowed test fixtures may pass tool-shaped objects directly into pure compiler
helpers, but production model transport must be native.

## Graph Amendment

Scheduler can run again after initial graph creation only through typed
graph-level amendment requests:

```ts
type GraphAmendmentRequest = {
  requestId: string;
  requestedBy: "node_lifecycle_runner" | "closeout" | "operator";
  requestedChangeKind: string;
  affectedRequirementIds: string[];
  sourceEvidenceRefs: string[];
  currentGraphRef: string;
  reason: string;
};
```

Allowed amendment causes:

- node runner discovers genuinely missing mission-level work;
- closeout finds uncovered requirements;
- validation/review requires cross-branch mission-level work;
- operator changes scope.

Forbidden amendment causes:

- worker needs more context;
- edit plan failed;
- validation repair inside the same node;
- evidence gap inside the same node;
- provider/tool retry.

Those remain node-local lifecycle transitions.

Graph amendment is patch-scoped. It cannot replan the whole mission unless the
operator changed scope.

## Prompt Context

Scheduler gets:

- RequirementMap requirement text, role, and source refs;
- source prompt body ref;
- compact workflow/capability manifest;
- current graph/evidence summary for amendment mode.

Scheduler may search/open bounded prompt windows only when grouping or
dependency ordering is ambiguous. Prompt search is not a required scheduler
phase and must not become another full-prompt summarization layer.

## Deletions And Retirements

Retire from production fresh scheduling:

- `WorkIntent` graph-control nodes;
- `WorkIntent` promotion semantics;
- `WorkIntent.nextLegalTransitions`;
- `OrchestratorGraphDecision` as canonical scheduler output;
- full staged scheduler JSON draft acceptance;
- JSON-shaped `schedulerToolCalls`;
- model-authored `scheduler.submit_*` tools;
- scheduler-owned node-local repair;
- scheduler-owned lifecycle transitions;
- tests requiring one RequirementMap item to become one WorkIntent;
- tests requiring the scheduler model to author validation/review/closeout tail
  work units;
- reason-code-bag classification as scheduler truth.

Allowed references:

- historical docs;
- negative residue tests;
- migration notes;
- pure compatibility adapters explicitly excluded from production.

## Inventory Gates

Production scheduler source inventory must fail on fresh-scheduling paths that
contain:

- `OrchestratorGraphDecision` as scheduler product;
- `stagedScheduler`;
- `schedulerToolCalls`;
- `submit_staged_graph`;
- `submit_work_unit_coverage`;
- `submit_capability_selection`;
- `submit_node_contracts`;
- `submit_dependency_ordering`;
- `nextLegalTransitions` in scheduler-produced node contracts;
- WorkIntent graph promotion;
- scheduler-side context/resource/validation/evidence repair.

Inventory should allow those strings only in historical docs, negative tests,
or explicitly disabled migration adapters.

## Acceptance Gates

The scheduler refactor is complete only if:

1. Accepted RequirementMap feeds `SchedulerStageRunner`.
2. `SchedulerStageRunner` emits `SchedulerGraphPatch`.
3. `SchedulerGraphPatch` contains only node seeds, edges, and requirement
   coverage plus bounded refs/hashes.
4. No WorkIntent graph-control node is created in production scheduling.
5. No WorkIntent promotion is required before node lifecycle projection.
6. WorkIntent does not expose or own next legal transitions.
7. Scheduler tools use provider-native universal transport.
8. No JSON-shaped scheduler tool-call path survives in production.
9. No model-authored scheduler submit phase survives.
10. RequirementMap roles are treated as hints.
11. Scheduler groups requirements into coherent node seeds.
12. Source refs are inherited from RequirementMap unless scheduler explicitly
    opens prompt context.
13. Validation/review/closeout default to compiler-derived mission tail nodes.
14. Runtime derives validation/review/closeout capabilities, metadata, phases,
    and ordering.
15. Model authors only non-obvious semantic edges.
16. Capability binding is runtime-shortcut when unambiguous.
17. Graph amendment is typed, scoped, and narrow.
18. `NodeLifecycleTransitionRunner` can project every persisted node.
19. Replay from accepted RequirementMap reaches persisted graph nodes or a
    typed scheduler blocker.
20. Inventory gates fail retired scheduler/WorkIntent lifecycle paths.
21. Tests prove old paths cannot resurrect.
22. Core-only scheduler output compiles into core nodes plus tail nodes.
23. Proof and standard closure modes derive the correct validation phase.
24. Replay proof exit semantics fail on `needs_review`, `failed`, or
    `max_iterations` unless explicitly run as diagnostic exit-zero.

## Strategic Result

Old:

```text
RequirementMap
  -> SchedulerRequirementInventory
  -> staged graph draft
  -> OrchestratorGraphDecision
  -> WorkIntent node
  -> WorkIntent promotion
  -> executable node
  -> NodeLifecycleProjection
```

New:

```text
RequirementMap
  -> SchedulerGraphPatch
  -> RuntimeGraphNode
  -> NodeLifecycleProjection
```

The scheduler builds graph shape. Runtime persists graph patches.
`NodeLifecycleTransitionRunner` executes nodes. There is no duplicated
lifecycle ownership, no promotion maze, no giant scheduler schema, and no
fragile submit ceremony.
