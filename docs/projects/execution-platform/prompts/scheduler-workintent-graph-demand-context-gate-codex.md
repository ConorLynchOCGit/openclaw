---
summary: "Codex implementation prompt for Executable Spine 01: WorkIntent Acceptance And Capability Manifest Gate."
title: "Executable Spine 01 WorkIntent Acceptance And Capability Manifest Gate Codex Prompt"
---

# Executable Spine 01: WorkIntent Acceptance And Capability Manifest Gate

You are Codex working in the OpenClaw Execution Platform repository. Implement
`openclaw-convergence.scheduler-workintent-graph-demand-context-gate` as the
first gate of the Control-Plane Executable Spine Recovery tranche.

This is not a narrow context-scout patch. Build the production-grade,
first-class, live-wired, maximally hardened and toolified WorkIntent acceptance
and capability manifest gate that prevents the entire class of failures where
graph nodes, context nodes, replay fixtures, or scheduler prose become
executable semantics. No fallback or compatibility garbage.

## Read First

Read these before editing:

- `docs/projects/execution-platform/specs/control-plane-executable-spine-recovery.md`
- `docs/projects/execution-platform/specs/scheduler-workintent-graph-demand-context-gate.md`
- `docs/projects/execution-platform/specs/work-intent-control-plane-contract.md`
- `docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md`
- `docs/projects/execution-platform/specs/maximum-toolification-architecture.md`
- `docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md`
- `docs/projects/execution-platform/DECISIONS.md`
- `docs/projects/execution-platform/STATUS.md`
- `docs/projects/execution-platform/CURRENT_SLICE.md`

Also follow the deterministic/model boundary guardrails:

- runtime may validate schema, refs, hashes, registered enum/capability
  membership, dependency structure, authority, lifecycle, storage flags, and
  readback projection;
- runtime must not infer semantic work intent, capability fit quality, context
  sufficiency, target relevance, edit quality, Product/Spec meaning, or
  commitment closure from substrings, filenames, artifact names, node titles,
  Product/Spec prose, or error messages.

## Objective

Make the accepted post-packet path begin with a strict, non-runnable
`WorkIntentGraph` acceptance boundary.

The valid spine is:

```text
Commitment Work Packets
  -> WorkIntentGraph acceptance
  -> capability manifest validation
  -> ResourceRequirementPacket / resource requirements
  -> NodeExecutionContract
  -> NodeExecutionPacket
  -> worker/tool execution
```

This item owns only the first gate:

```text
Commitment Work Packets -> WorkIntentGraph -> capability validation
```

Downstream context resharding, NodeExecutionPacket hydration, worker one-edit
canary, readiness/readback collapse, and replay proof are later queue items.
Do not implement them accidentally as ad hoc shortcuts. Do leave precise
contracts and transitions that those later items can consume.

## Required Implementation

### 1. Canonical WorkIntentGraph Acceptance

Add or harden a production runtime boundary that accepts a `WorkIntentGraph`
only when every WorkIntent carries model-authored:

- stable intent id or runtime-derivable id anchor;
- semantic intent;
- capability id;
- target commitment ids;
- expected evidence mode;
- resource requirement class;
- objective;
- expected output;
- consumer refs;
- dependency refs or explicit independent-root declaration;
- semantic rationale.

Runtime must compile or validate stable ids, refs, hashes, manifest refs,
lifecycle, storage flags, bounded summaries, and graph envelopes. Runtime must
not author missing semantic intent or infer it from prose.

### 2. Capability Manifest Binding

Promote capability manifest validation into the acceptance gate.

Each WorkIntent capability check must validate structurally:

- capability id exists and version/profile is registered;
- selected semantic intent is allowed by the capability manifest;
- capability declares runnable/non-runnable status;
- required context/resource classes are known;
- required evidence modes are compatible;
- allowed tool families and executor roles are declared;
- authority requirements are known;
- validation phase requirements are declared where needed;
- legal next transitions and blocker classes are present.

Runtime must return field-specific repair diagnostics for invalid or missing
fields. It must not pick a "better" capability by deterministic heuristic.

### 3. Small-Verb Toolification

Do not solve this through another large JSON graph blob. Implement or harden
small-verb scheduler/capability operations as production runtime tools or
runtime-tool protocol entries where this codebase expects them.

Required tool surface:

- `scheduler.work_intent.propose`
- `scheduler.work_intent.accept_roots`
- `scheduler.work_intent.link_dependencies`
- `scheduler.work_intent.set_capability`
- `scheduler.work_intent.set_evidence_mode`
- `scheduler.work_intent.mark_non_runnable`
- `scheduler.work_intent.request_revision`
- `capability.lookup`
- `capability.validate_intent`
- `capability.require_resources`
- `capability.require_validation`
- `capability.require_evidence`
- `capability.list_legal_transitions`

If some tools already exist under nearby names, consolidate them into the
canonical tool ids or add explicit aliases only where the model-facing contract
requires them. Avoid broad update-DAG/update-graph tools for semantic
acceptance.

### 4. Graph Edge And Root Invariants

Acceptance must reject:

- multi-node zero-edge graphs unless every node has an explicit
  independent-root declaration and a runtime-valid capability;
- context nodes before accepted consumer WorkIntents/contracts exist;
- context scouts without consumer edges or `ResourceRequirementPacket` refs,
  except diagnostic-only or explicit workflow-defined coordination nodes;
- executable implementation/resource nodes emitted directly from packets,
  context handoffs, or synthesis groups without accepted WorkIntent/capability
  state;
- direct `context_synthesis group -> implementation node` or equivalent
  replay/proof shortcut.

Parallelism is allowed only through structural independent-root declarations
and dependency metadata, not through absence of edges.

### 5. Non-Runnable Lifecycle

WorkIntent nodes must be accepted as control-plane state, not runnable worker
nodes. Add or harden lifecycle/readiness status so:

- accepted WorkIntent != executable node;
- source-grounding/read-only intent cannot require changed-file evidence;
- source-edit intent still cannot run until later context/resource readiness;
- invalid intent/capability pairs block with exact fields and legal repair
  transition;
- readback can distinguish `work_intent_graph_invalid`,
  `capability_manifest_invalid`, `work_intent_accepted_non_runnable`, and
  downstream `resource_requirement_missing`.

### 6. Readback And First Open Gate

Make `firstOpenGate` derive from canonical WorkIntent/capability acceptance
state when this boundary is active.

If this boundary fails, readback must report a precise structural gate before
`resource_fulfillment`, including:

- work item/runtime job id;
- graph id where available;
- WorkIntent id/node id;
- missing field or schema path;
- capability id/version if present;
- blocker class;
- next legal transition/tool id.

Do not let stale checkpoint labels or broad context gates mask this boundary.

### 7. Production/Replay Alignment

Boundary replay and production scheduler paths must share the same acceptance
logic. Replay may be diagnostic-only only when explicitly labeled so. It must
not resurrect default context synthesis, legacy context-first fixtures, or old
graph glue.

Update any replay harnesses needed for this item so the completed-packet replay
uses the WorkIntent acceptance gate before context/resource execution.

### 8. Tests

Add focused regression tests for:

- accepted packets followed by WorkIntent/context scout graph with zero edges
  fails at WorkIntent/graph acceptance;
- multi-node zero-edge graph passes only when every node has valid
  independent-root declaration and registered capability;
- missing semantic intent fails structurally without runtime inference;
- invalid intent/capability pair fails with field-specific diagnostics;
- context scout before accepted consumer WorkIntent/contract fails;
- broad packet-level context cannot satisfy WorkIntent acceptance;
- direct context-synthesis-to-implementation compile fails;
- valid independent read-only WorkIntent roots are accepted as non-runnable
  control-plane state;
- valid dependent WorkIntent graph accepts and exposes next legal transition
  to context/resource requirement compilation;
- generic non-Product/Spec fixture proves the policy is domain-general;
- no-semantic-cheats guard covers this boundary.

Prefer focused tests over full proof reruns. Do not weaken existing production
policy to satisfy stale legacy fixtures; update or retire stale fixtures when
they assert old context-first behavior.

## Files And Areas To Inspect

Find current names before editing; do not assume exact paths are exhaustive.
Likely relevant areas:

- `extensions/execution-platform/src/workflows/work-intent.ts`
- `extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts`
- `extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts`
- `extensions/execution-platform/src/workflows/runtime-work-graph-scheduler-contracts.ts`
- `extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts`
- `extensions/execution-platform/src/workflows/resource-requirement-packet.ts`
- `extensions/execution-platform/src/workflows/workflow-node-execution-contracts.ts`
- `extensions/execution-platform/src/work-queue/projections/*`
- `extensions/execution-platform/src/observability/*`
- `scripts/execution-platform-run-product-spec-boundary-replay.mjs`
- `scripts/execution-platform-run-product-spec-checkpointed-test.mjs`

## Required Documentation Updates

Update docs only where implementation reality changes:

- `docs/projects/execution-platform/specs/control-plane-executable-spine-recovery.md`
- `docs/projects/execution-platform/specs/scheduler-workintent-graph-demand-context-gate.md`
- `docs/projects/execution-platform/STATUS.md`
- `docs/projects/execution-platform/CURRENT_SLICE.md`
- `docs/projects/execution-platform/DECISIONS.md`

Do not mark the DB Work Queue item closed unless runtime evidence and
validation actually pass. If you add a closeout script, it must use runtime DB
truth and bounded artifacts only.

## Validation

Run the smallest meaningful suite first, then broaden based on touched files.
At minimum run focused tests covering:

```bash
pnpm -s test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts
pnpm -s test:file extensions/execution-platform/src/workflows/orchestrator-graph-decision.test.ts
pnpm -s test:file extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts
pnpm -s test:file extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts
```

Also run:

```bash
pnpm -s tsgo:fast
git diff --check
```

If full root typecheck is known to hit heap/tooling limits, do not paper over
that as success. Report the exact limitation and use the established scoped
validation lane.

## Completion Review

When implementation and validation are done, ask the deep completion questions
below, perform code review, fix any issue found, and iterate until all answers
are clean.

Deep completion questions:

1. Can any production or production-equivalent replay path still create
   context/resource/implementation nodes before accepted WorkIntentGraph and
   capability validation?
2. Can runtime still infer semantic intent or capability from strings,
   filenames, Product/Spec prose, artifact refs, or node titles?
3. Can a multi-node zero-edge graph pass without valid independent-root
   declarations for every node?
4. Can a `context_scout` exist as runnable/production work without an accepted
   consumer WorkIntent/contract and legal downstream requirement path?
5. Can accepted WorkIntent state be mistaken for worker-executable readiness?
6. Are field-specific repair diagnostics precise enough for the next scheduler
   model turn/tool call?
7. Does owner readback show the true gate and next legal transition from
   canonical state, not stale checkpoint labels?
8. Are stale legacy fixtures updated or retired instead of weakening
   production policy?
9. Does a generic non-Product/Spec fixture pass, proving this is general
   orchestration infrastructure?
10. Are all raw-storage flags preserved and no raw prompt/provider/tool/DB
    bodies stored?

Only call the work item complete if the implementation is live-wired,
production-path, covered by focused tests, and the code review finds no
remaining blocker.

