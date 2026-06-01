---
summary: "Canonical pre-proof correction plan for collapsing lifecycle authority into one runner, deleting duplicate transition interpreters, and removing legacy proof/runtime paths that keep Product/Spec replay brittle."
title: "Canonical Lifecycle Convergence And Residue Excision"
---

# Canonical Lifecycle Convergence And Residue Excision

Date: 2026-05-28

Status: P0 corrective governing spec. This spec documents the code-verified
gap found after the previous node-local context and lifecycle-runner items
were closed in the DB: the new canonical path exists in pieces, but several
production components still infer lifecycle state independently. The next
implementation tranche must collapse those authorities into one lifecycle
owner and delete the residue rather than adding compatibility guards.

2026-05-29 consolidation update: the corrective target is now specified in
[Node Lifecycle Transition Ownership Consolidation](/projects/execution-platform/specs/node-lifecycle-transition-ownership-consolidation).
The code-search finding is that the platform already has many of the right
small verbs and contract helpers, but lifecycle model turns can still be
invoked by side paths that bypass `NodeLifecycleTransitionRunner`. The fix is
not another runner or one more fallback layer. Focus, resource demand,
specialist narrowing, domain resource selection, action gate, worker action,
validation, evidence, readback, and root-cause collapse must all be
runner-owned transitions, while helper modules become pure contract/compiler
libraries.

## Current Failure Pattern

The replay failures are not primarily model failures. They are control-plane
ownership failures.

The system now has these intended pieces:

```text
WorkIntent
  -> model-authored ResourceObjectiveFocus
  -> NodeResourceDemandSession
  -> specialist narrowing or exact-handle fulfillment
  -> NodeResourceLedger
  -> model-authored target selection
  -> NodeExecutionPacket
  -> worker edit/validation/evidence
```

But the code still lets multiple components decide what the current lifecycle
gate is, what transition is legal next, and whether the global scheduler may
run. Each local fix gets past one gate, then another component with an older
assumption reinterprets the same node differently.

The canonical fix is:

```text
NodeLifecycleTransitionRunner is the only lifecycle authority.
All other components are transition handlers, structural validators,
resource compilers, worker executors, or readback projectors.
```

Expanded ownership rule:

```text
direct provider/parser lifecycle proof path = diagnostic only
runner handler + model task router + typed artifact refs = production proof
```

Any production or closure proof path that calls a lifecycle model turn without
the runner is duplicate lifecycle authority, even if it uses the same parser
or small-verb schema.

## Code-Verified Wiring Map

### `runtime-work-graph-scheduler.ts`

Current problem:

- `evaluateRuntimeNodeTransitionReadiness()` still acts as an independent
  lifecycle interpreter.
- It can derive `contextStatus` from inline snapshots, accepted focus,
  context-like graph signal, or generic metadata.
- It still writes `nodeReadinessPhase` and
  `nodeReadinessNextAllowedTransitions` in many branches.
- It calls local lifecycle helpers and global scheduler decision in the same
  scheduler surface.

Required correction:

- Keep scheduler frontier selection, executor invocation, artifact recording,
  and graph persistence.
- Remove scheduler-authored lifecycle gates for WorkIntent/context/worker
  phases.
- `requestValidDecision()` must call the orchestrator only after runner
  projection says every node may call the global scheduler.
- Any pending local gate records a bounded runner-blocked artifact and
  continues/halts according to runner output, not graph-repair prompts.

### `node-lifecycle-transition-runner.ts`

Current problem:

- The runner exists, but it still consumes status/transition output from
  `WorkIntentContextResolution`.
- It also accepts metadata fallback gates such as `nodeReadinessPhase`,
  `nodeReadinessRepairAction`, `currentPhase`, and `schedulerPhase`.
- It projects gates, but it is not yet the sole owner of transition
  descriptors and handlers.

Required correction:

- Define a single transition descriptor registry:
  `gate -> legal tool ids -> required typed artifact refs -> handler ->
  next gate/readback mapping`.
- A transition must either mutate canonical node state, create/promote the
  next canonical packet, append accepted/blocked/diagnostic refs by lifecycle
  role, or terminalize with a root-cause artifact.
- A completed transition with the same state hash and same gate is failure,
  not progress.
- Metadata fallback gates are allowed only for negative/stale-state
  diagnostics, not lifecycle authority.

### `work-intent-context-resolution.ts`

Current problem:

- It still owns `nextLegalTransitionsForStatus()`.
- It still collects legacy graph context supply observations, context scout
  handoff refs, and merge packet refs as context readiness inputs.
- Its status can contradict the runner after demand/ledger/target-selection
  refs have been appended.

Required correction:

- Keep it as a context facts compiler only.
- It may report typed facts: accepted focus refs, open demand refs, ledger
  refs, blocked refs, target-selection refs, provider diagnostics, and
  limitation/waiver refs.
- It must not author next legal transitions.
- Legacy graph context observations are negative diagnostics unless an
  explicit workflow-defined coordination capability owns them.

### `runtime-node-capability-registry.ts`

Current problem:

- Capability construction infers `allowedLifecycleTransitions` and
  `requiredLifecycleTools` separately from the runner.
- This creates profile drift: a transition can be implemented but not
  capability-legal, or capability-legal but unhandled.

Required correction:

- Capabilities reference a lifecycle transition profile id.
- The profile is validated against the runner descriptor registry.
- Capability code may constrain which descriptor set applies to a domain or
  workflow; it must not independently invent transition lists.

### `scheduler-runtime-tools.ts`

Current problem:

- Tool registration is a separate registry from lifecycle transition
  descriptors.
- New transition tools have repeatedly existed in one place but not the
  other.

Required correction:

- Every lifecycle descriptor tool id must be registered in the runtime tool
  registry.
- Every lifecycle runtime tool must map back to exactly one descriptor or an
  explicit non-lifecycle tool family.
- Add a test that fails on descriptor/tool registry drift.

### `node-resource-materialization.ts`

Current problem:

- Progressive packet readiness derives states and worker tool ids in parallel
  with runner gates.
- It still contains broad context-phase worker tools and write-ready tool
  bundles that can expose the wrong surface if packet state and runner state
  drift.

Required correction:

- Keep packet schema, write-gate structural validation, manifest compaction,
  and packet patching.
- Remove lifecycle authority from packet projection. Packet readiness is an
  input to runner handlers, not an independent scheduler.
- `nextLegalWorkerToolIds` is emitted by the canonical worker gate handler
  only after write readiness is proven.

### `non-codex-tool-using-worker-loop.ts`

Current problem:

- The worker loop has improved legal-tool filtering, but still contains a
  legacy diagnostic model-facing tool surface when no packet is present.
- It also derives phase from model slot and tool-result history.
- That recreates a local state machine after the runner was supposed to own
  worker lifecycle.

Required correction:

- Worker invocation requires a hydrated `NodeExecutionPacket` or a typed
  runner projection explicitly permitting read/context-only worker tools.
- The prompt tool menu is generated from canonical legal tools only.
- Forbidden tools must be absent from the prompt, not merely rejected after
  the model calls them.
- Legacy no-packet diagnostic worker mode is deleted from production.

### Readback Projection

Current problem:

- Readback code still falls back to `nodeReadinessPhase`,
  `nodeReadinessNextAllowedTransitions`, checkpoint phase labels, and reason
  code sets when canonical projection is missing.
- This is how stale gates such as `resource_fulfillment`,
  `commitment_work_packets`, or generic `frontier_execution` can hide the
  actual local lifecycle blocker.

Required correction:

- Owner readback and Work Queue active graph progress consume
  `NodeLifecycleProjection` first.
- Missing projection is reported as `missing_runtime_state`, not inferred.
- `nodeReadiness*` fields may remain only as mirrors during migration if the
  source inventory explicitly permits them; they cannot unlock execution or
  choose the first open gate.

### Product/Spec Replay Harness

Current problem:

- The boundary replay script still contains old `after-resource-handoff`,
  context handoff, graph-level scout, and context supply reconstruction
  logic.
- Replay can therefore be a second state machine that does not match
  production.

Required correction:

- Replay boundaries restart from canonical runtime artifacts:
  WorkIntent, lifecycle projection, demand session, ledger, target selection,
  NodeExecutionPacket, validation, evidence.
- Retired topology is negative evidence only.
- Stale shared proof files are mirrors only; closeout truth is the run-scoped
  proof manifest.

## Canonical Lifecycle Contract

The runner descriptor table is the source of truth for:

- current gate;
- next legal transition tool ids;
- required typed refs;
- handler function;
- state mutation target;
- root-cause signature fields;
- readback gate mapping;
- capability profile compatibility;
- whether global scheduler is allowed.

The descriptor table must support coding and non-coding domains. Coding gates
use file/window/test/validation/evidence resource kinds. Other domains may
use document, contact, calendar, ticket, deployment, memory, or human-decision
resource kinds. The invariant is the same: models choose semantic intent and
resources; runtime validates structure and lifecycle.

## Deletion Standard

The implementation must delete residue rather than fencing it off.

Production must not retain:

- default durable graph-level context scout fanout;
- default context synthesis or after-synthesis replay;
- context handoff replay as a success path;
- legacy context supply proof gates;
- compatibility flags that resurrect retired topology;
- no-packet broad worker diagnostic mode;
- duplicate lifecycle transition maps outside the runner.

Historical docs may mention retired concepts. Positive tests and production
imports may not.

## Queue Tranche

The corrective tranche is inserted before Product/Spec replay:

1. `openclaw-convergence.lifecycle-authority-collapse-and-runner-wiring`
2. `openclaw-convergence.worker-readback-replay-surface-excision`
3. `openclaw-convergence.lifecycle-residue-inventory-and-no-model-walk`
4. `openclaw-convergence.blocker-closure-06-replay-and-full-proof-gates`
5. `openclaw-convergence.active-queue-34`

Closed historical items remain closed. This tranche records that their
closure did not collapse all lifecycle authority.

## Acceptance Gates

The tranche is not done until:

- no production component outside the runner authors lifecycle gates or next
  legal local transitions;
- every runner descriptor has a handler, runtime tool registration,
  capability profile mapping, readback mapping, and regression test;
- no global scheduler call occurs while a local lifecycle projection is
  pending;
- no worker prompt exposes tools outside the canonical gate;
- stale replay artifacts and retired topology fail as negative evidence;
- the source inventory gate reports zero production survivors for retired
  concepts;
- the no-model lifecycle walk reaches evidence or a precise root-cause
  artifact without invoking global graph repair;
- the middle-lane replay uses a fresh run-scoped proof manifest and advances
  through the canonical path.

## Non-Goals

- Do not introduce deterministic semantic scoring.
- Do not raise payload limits as the fix for overflows.
- Do not keep compatibility switches for old topology.
- Do not treat component canaries as full Product/Spec proof closure.
- Do not reopen already closed DB items; create corrective queue items with
  explicit evidence.
