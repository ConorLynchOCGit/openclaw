---
summary: "Canonical consolidation spec for making NodeLifecycleTransitionRunner the only owner of node lifecycle transitions, deleting direct provider/parser bypasses, and reducing helper modules to contract/compiler libraries."
title: "Node Lifecycle Transition Ownership Consolidation"
---

# Node Lifecycle Transition Ownership Consolidation

Date: 2026-05-29

Status: P0 pre-proof corrective spec. This extends
[Node Lifecycle Transition Runner](/projects/execution-platform/specs/node-lifecycle-transition-runner)
and
[Canonical Lifecycle Convergence And Residue Excision](/projects/execution-platform/specs/canonical-lifecycle-convergence-and-residue-excision).
The Product/Spec proof cannot be counted until this consolidation is live.

## Executive Decision

`NodeLifecycleTransitionRunner` is the only production owner of node-local
lifecycle transitions.

No second runner should be introduced for domain resource selection,
resource focus, specialist narrowing, worker readiness, validation, evidence,
or readback. In particular, do not create a `DomainResourceSelectionRunner`.
Domain resource selection is one transition handler inside the node lifecycle
runner.

The scheduler creates and orders work. The runner advances node-local
lifecycle. Helper modules may define contracts, compile manifests, validate
structure, parse model tool calls, and hydrate artifacts. Helper modules must
not decide the current lifecycle gate, next legal transition, global-scheduler
eligibility, first-open gate, or closeout status.

## Why This Spec Exists

The recent replay failures exposed a repeated pattern:

```text
tool exists
  -> model turn or parser can be called from a side path
  -> side path bypasses NodeLifecycleTransitionRunner
  -> lifecycle projection, repair, readback, no-progress collapse, and tool
     visibility no longer agree
  -> the next proof fails one boundary earlier or later
```

The current issue is not that the platform lacks every small verb. Many of the
small verbs and parsers already exist. The issue is that multiple production,
proof, replay, and worker surfaces can still behave like independent lifecycle
owners.

The consolidation target is:

```text
WorkIntent
  -> ResourceObjectiveFocus
  -> NodeResourceDemandSession
  -> specialist narrowing / exact resource fulfillment
  -> NodeResourceLedger
  -> DomainResourceSelection
  -> DomainActionGate
  -> worker action
  -> post-action validation
  -> evidence closure
  -> readback/root-cause projection
```

Every arrow above is a `NodeLifecycleTransitionRunner` transition handler.

## Code-Search Findings

The following code shapes are the problem class this spec addresses.

### Direct Provider/Parser Bypasses

Several proof and replay scripts directly instantiate provider clients, call
models, and parse lifecycle tool responses locally. Examples include real
model proof scripts for resource objective focus, node-local demand,
context/specialist scout narrowing, context scope revision, target/domain
resource selection, and worker readiness/edit/evidence proofs.

Those scripts may be useful as temporary diagnostics, but they cannot count as
production proof closure because they bypass:

- `NodeLifecycleTransitionRunner`;
- `ModelTaskClientRouter`;
- lifecycle descriptor authorization;
- `NodeLifecycleProjection`;
- accepted/blocked/diagnostic artifact role separation;
- no-progress collapse;
- readback gate projection;
- scheduler global-decision prevention.

Required correction:

- Production and replay proof paths invoke lifecycle model turns only through
  runner handlers.
- Standalone proof scripts are either rewritten as runner-driven tests or
  retained only as negative/diagnostic fixtures that cannot close work queue
  items.
- Static inventory fails on direct lifecycle provider calls outside approved
  adapter layers.

### Duplicate Tool Dialects

The resource selection surface currently contains multiple dialects for the
same lifecycle operation. The active runner-facing tool family is:

```text
resource.selection.propose
resource.selection.accept
resource.selection.request_revision
resource.selection.mark_blocked
```

Required correction:

- One lifecycle transition has one canonical model-facing tool family.
- Historical aliases must not remain importable in production paths. They may
  appear only inside explicit negative fixtures or historical closeout text.
- No production or closure proof path may use an alternate dialect for the
  same transition.

### Helper Modules Acting Like State Machines

The codebase has legitimate helper modules for resource selection,
materialization, focus, demand sessions, worker loops, and readback. Some of
those helpers also derive phases, legal tools, readiness, or first-open gates.
That creates lifecycle authority in more than one place.

Required correction:

- Keep helper modules only when they are pure contract/compiler libraries.
- Delete or split helper code that owns lifecycle transitions.
- Runner handlers call helpers; helpers do not call the runner, scheduler, or
  provider directly.

### Worker Tool Surface Drift

The worker loop previously exposed a broad model-facing tool menu independent
of the node lifecycle gate. That makes it possible for a model to jump to
patch authoring before an accepted edit plan, or to evidence before
validation.

Required correction:

- Worker prompt/tool surface is generated exclusively from
  `NodeLifecycleProjection.nextLegalTransitions`.
- Forbidden tools are absent from prompts, not merely rejected after the model
  calls them.
- Worker loop mechanics can remain in the worker adapter, but worker
  lifecycle sequencing belongs to the runner.

### Readback And Replay Re-Inference

Readback and replay have historically re-inferred gates from checkpoint
labels, reason code sets, graph context edges, or stale node readiness fields.
That hides the true blocker and lets retired topology appear to make progress.

Required correction:

- Readback consumes `NodeLifecycleProjection`.
- Replay restarts from canonical runtime artifacts: WorkIntent,
  projection, resource focus, demand session, ledger, domain resource
  selection, NodeExecutionPacket, validation, evidence.
- Missing projection is reported as `missing_runtime_state`; it is not guessed.

## First-Principles Module Retention Rule

Keeping existing modules is correct only when the retained module has a
single, non-owning responsibility.

### Keep

Keep modules or functions that only:

- define schemas and typed contracts;
- compile bounded model-facing manifests from refs;
- parse and repair one tool response shape;
- validate structural membership, authority, hashes, budgets, and storage;
- hydrate payload-backed artifacts from refs;
- compile metadata patches requested by a runner handler;
- provide deterministic tool adapters called by a runner handler.

### Delete Or Split

Delete, split, or move code when it:

- decides the current lifecycle gate;
- decides next legal transitions;
- decides whether the global scheduler may run;
- calls a provider directly for lifecycle work;
- persists lifecycle state independently of the runner;
- maps broad graph context/scout/synthesis outputs into lifecycle readiness;
- exposes a worker tool menu independent of `NodeLifecycleProjection`;
- computes readback first-open gate without projection input;
- implements compatibility, fallback, or diagnostic-only positive paths for
  retired topology.

This is not a low-risk preservation rule. It is an ownership boundary. Helper
code survives only when it reduces complexity by removing duplicate state
machines.

## Runner-Owned Transition Set

### 1. Resource Focus

Gate:

```text
resource_focus_required
resource_focus_blocked
```

Runner handler responsibilities:

- build the compact legal resource handle menu;
- invoke the focus model turn through `ModelTaskClientRouter`;
- expose only `resource.focus.accept` or
  `resource.focus.mark_unanswerable`;
- validate selected handles structurally;
- write accepted/blocked/diagnostic refs into
  `NodeLifecycleProjection`.

Forbidden:

- scheduler freeform metadata standing in for focus;
- legal-resource-universe refs counting as accepted focus;
- blocked focus refs opening demand;
- direct proof-script provider calls as closure evidence.

### 2. Resource Demand Open

Gate:

```text
resource_demand_open_pending
resource_demand_open
resource_demand_blocked
```

Runner handler responsibilities:

- automatically open `NodeResourceDemandSession` from accepted focus;
- hydrate demand from focus/universe artifact refs, not regenerated metadata
  seeds;
- keep session manifests compact and payload bodies artifact-backed;
- decide whether exact-handle fulfillment is possible or specialist
  narrowing is required.

Forbidden:

- routing `resource_demand_open_pending` back to global scheduler;
- opening demand from broad packet scope, directory guesses, or graph
  transport refs;
- runtime choosing semantic sub-ranges from vague handles.

### 3. Specialist Narrowing

Gate:

```text
resource_narrowing_required
```

Runner handler responsibilities:

- dispatch the consumer-bound specialist subturn;
- expose only exact-handle submission or typed narrowing blocker tools;
- validate exact handles against legal universe, authority, count, byte
  budget, and session ref;
- append accepted exact windows/findings to `NodeResourceLedger`.

Forbidden:

- durable graph-level scout fanout;
- context synthesis;
- deterministic semantic line picking from broad file refs;
- global graph repair for broad handles.

### 4. Resource Ledger Ready

Gate:

```text
resource_ledger_ready
```

Runner handler responsibilities:

- evaluate whether node-local ledger entries satisfy structural requirements
  for the selected capability profile;
- distinguish limitations from blockers;
- expose the next legal transition:
  `domain_resource_selection_required`, additional narrowing, or root-cause
  blocker.

Forbidden:

- counting merge packet existence, broad handoffs, or context-supply edges as
  readiness without accepted ledger refs.

### 5. Domain Resource Selection

Gate:

```text
domain_resource_selection_required
domain_resource_selection_blocked
```

Runner handler responsibilities:

- build the domain resource selection request/manifest from current node
  state, accepted focus, ledger refs, capability profile, and authority;
- call `ModelTaskClientRouter`, not raw provider clients;
- parse and repair through `resource-selection.ts` contracts;
- record accepted/blocked/diagnostic artifact refs into
  `NodeLifecycleProjection`;
- advance to `domain_action_gate_blocked` or a precise blocked state.

Forbidden:

- direct prompt-only proof paths;
- runtime inventing meaningful target/resource refs;
- alternate `resource_selection.*` dialects in production closure paths.

### 6. Domain Action Gate

Gate:

```text
domain_action_gate_blocked
```

Runner handler responsibilities:

- validate that selected domain resources have required snapshots,
  permissions, validation defaults, and evidence expectations;
- hydrate `ProgressiveNodeExecutionPacket`;
- either promote to `worker_action_ready` or emit an upstream blocker.

Forbidden:

- packet materialization code independently deciding lifecycle readiness;
- widening executable authority from context prose.

### 7. Worker Action

Gate:

```text
worker_action_ready
```

Runner handler responsibilities:

- call the worker adapter with a legal tool surface derived from projection;
- before an accepted edit/action plan, hide patch/action execution tools;
- after accepted plan, invoke forced author/action subturn;
- return accepted action refs or typed upstream blocker refs.

Forbidden:

- worker adapter-local lifecycle state machine;
- broad worker tool menu;
- prompt-visible tools outside `nextLegalTransitions`.

### 8. Post-Action Validation

Gate:

```text
post_action_validation
```

Runner handler responsibilities:

- run targeted validation or structural default validation according to
  capability profile;
- persist bounded validation refs;
- route failures to typed repair/blocker states.

Forbidden:

- worker or proof script treating edits as complete without validation refs;
- validation evidence masquerading as implementation evidence before action.

### 9. Evidence Closure

Gate:

```text
evidence_closure
```

Runner handler responsibilities:

- compile evidence claims from selected resources, changed artifacts,
  validation refs, task ids, node ids, commitment ids, and workflow evidence
  mode;
- persist bounded manifest plus payload-backed evidence body;
- hand off semantic sufficiency judgment to review/closeout.

Forbidden:

- hand-formatted model evidence as canonical structure;
- closeout inferred from generic `needs_review` or stale checkpoint labels.

### 10. Root-Cause Collapse

Gate:

```text
node_lifecycle_root_cause_collapsed
```

Runner handler responsibilities:

- compute no-progress signature over node id, capability, gate, missing
  fields, reason codes, transition profile, and contract version;
- collapse repeated identical blockers once;
- preserve successful sibling branch evidence.

Forbidden:

- repeated graph repair attempts proving the same missing field;
- readback saying `running` or `node_completed` for repeated blockers.

### 11. Readback Projection

Gate source:

```text
NodeLifecycleProjection
```

Runner/readback responsibilities:

- owner readback reports the projection gate exactly;
- `firstOpenGate` comes from current projection or runner root cause;
- missing projection is surfaced as `missing_runtime_state`.

Forbidden:

- reason-code forests;
- checkpoint phase fallback when current projection exists;
- stale `context_supply`, `resource_fulfillment`, or
  `commitment_work_packets` gates hiding deeper runtime state.

## Descriptor Registry

The transition descriptor registry is the contract between capabilities,
runtime tools, runner handlers, worker tool visibility, and readback.

Each descriptor must define:

```ts
type NodeLifecycleTransitionDescriptor = {
  gate: string;
  transitionId: string;
  legalToolIds: string[];
  requiredArtifactRoles: string[];
  optionalArtifactRoles: string[];
  handlerRef: string;
  nextGateOnAccepted: string | null;
  nextGateOnBlocked: string;
  canCallGlobalSchedulerWhilePending: false;
  readbackGate: string;
  modelTaskKind?: string;
  providerProfileRef?: string;
  payloadPolicy: {
    metadataManifestOnly: true;
    rawPromptStored: false;
    rawResponseStored: false;
    rawProviderLogStored: false;
    hiddenReasoningStored: false;
  };
};
```

Every lifecycle runtime tool must map to exactly one descriptor unless it is
explicitly labeled as a non-lifecycle utility tool. Every descriptor tool id
must be registered in the runtime tool registry.

## Handler Interface

Runner handlers return transition results, not freeform scheduler decisions.

```ts
type NodeLifecycleTransitionHandlerResult = {
  status: "advanced" | "blocked" | "terminal_root_cause" | "no_action";
  currentGate: string;
  nextGate: string | null;
  acceptedArtifactRefs: string[];
  blockedArtifactRefs: string[];
  requestArtifactRefs: string[];
  diagnosticArtifactRefs: string[];
  providerDiagnosticRefs: string[];
  metadataPatch: Record<string, unknown>;
  reasonCodes: string[];
  rootCauseSignature?: {
    signatureRef: string;
    signatureHash: string;
  };
};
```

Handlers may call helper libraries, model task router, artifact store, and
runtime tools. They must not call the global scheduler as fallback.

## Model Call Boundary

Lifecycle model turns use this sequence:

```text
runner handler
  -> compact manifest builder
  -> ModelTaskClientRouter
  -> model-facing small verb
  -> contract parser/repair
  -> structural validation
  -> accepted/blocked/diagnostic artifact refs
  -> projection update
```

Direct provider clients are allowed only behind approved model-client/router
adapters. A script or helper that directly calls a provider for a lifecycle
transition is not production-faithful.

## Bounded Artifact Policy

Lifecycle artifacts follow the recurring overflow fix:

```text
metadata = compact manifest, refs, counts, hashes, status
artifact payload = full bounded body
```

Never solve lifecycle overflows by raising metadata caps or truncating
semantic content. If a lifecycle payload is large, persist a payload-backed
artifact and store only its ref/hash/counts in node metadata, graph metadata,
proof manifests, and Work Queue projection.

## Implementation Plan

### Pass 1: Inventory And Descriptor Registry

- inventory lifecycle provider calls, parsers, worker tool menus, readback
  gates, replay gates, and transition helper functions;
- define the descriptor registry for all gates in this spec;
- add descriptor/tool registry drift tests;
- add source inventory failures for direct lifecycle provider calls outside
  approved adapters.

### Pass 2: Runner Handler Consolidation

- move focus, demand-open, specialist narrowing, ledger readiness, domain
  resource selection, action gate, worker action, validation, evidence, and
  root-cause transitions behind runner handlers;
- keep helper modules only as contract/compiler libraries;
- remove scheduler-local lifecycle helpers that duplicate runner behavior.

### Pass 3: Worker And Proof Surface Excision

- generate worker prompts from projection legal transitions only;
- delete prompt-only direct proof paths for lifecycle closure;
- rewrite replay harnesses to restart from runner artifacts;
- make stale topology negative evidence only.

### Pass 4: Readback And Proof Gates

- readback consumes `NodeLifecycleProjection`;
- `firstOpenGate` comes from runner state or root-cause artifact;
- proof manifests store run-scoped refs and closure predicates only;
- stale shared/latest files cannot close work queue items.

### Pass 5: Real Middle-Lane Proof

Run a non-trivial real-model proof smaller than the full Product/Spec prompt:

```text
WorkIntent
  -> resource focus
  -> demand open
  -> specialist narrowing if broad
  -> ledger append
  -> domain resource selection
  -> action gate
  -> worker action
  -> validation
  -> evidence
```

The proof must use production runner handlers and model task router. It must
fail if any lifecycle step uses graph-level context scout fanout,
context synthesis, direct provider proof calls, broad worker menus, or
readback inference.

## Source Inventory Gate

The source inventory gate must fail production code and closure proof code
for:

- direct provider calls for lifecycle transitions outside approved adapters;
- `DomainResourceSelectionRunner` or equivalent second lifecycle runner;
- duplicate resource-selection tool dialects in production;
- lifecycle gate inference from `nodeStatus === "planned"` alone;
- lifecycle gate inference from substring/reason-code forests;
- graph-level context scout fanout as default readiness repair;
- default `context_synthesis` executor registration;
- `after-context-synthesis` replay as positive evidence;
- worker tool menus not derived from projection;
- readback first-open gate not sourced from projection/root-cause.

Allowed references:

- historical docs;
- negative tests proving retired topology fails;
- adapter internals behind `ModelTaskClientRouter`;
- contract-library tests that do not claim production proof closure.

## Work Queue Shape

This spec should be represented as one P0 consolidation item before the next
full Product/Spec proof:

```text
openclaw-convergence.node-lifecycle-transition-ownership-consolidation
```

It should absorb or supersede narrower items that only fix one lifecycle
boundary while leaving other bypasses intact. Existing items may remain only
if their acceptance gates are explicitly rewritten to prove runner ownership
and deletion of alternate paths.

## Closure Criteria

The item is not complete until all are true:

1. `NodeLifecycleTransitionRunner` owns all gates listed in this spec.
2. No production/replay closure path directly calls a provider for lifecycle
   transition model turns outside the model router path.
3. Helper modules contain no lifecycle ownership.
4. Worker prompts expose only projection-legal tools.
5. Readback first-open gate comes from runner projection/root cause.
6. Descriptor registry and runtime tool registry cannot drift.
7. Duplicate resource-selection dialects are removed from production paths.
8. Retired context scout/synthesis/fanout paths are negative evidence only.
9. Bounded manifests/artifact payloads prevent metadata overflow.
10. A real middle-lane proof reaches evidence or a precise runner root-cause
    artifact without global scheduler repair.

## Decisions Needed

1. Whether to delete standalone lifecycle real-model proof scripts outright,
   or keep them under a diagnostics-only directory that cannot close work
   queue items.
2. Whether to preserve legacy `resource_selection.*` tool names only in
   parser tests, or delete the aliases entirely once production callers are
   migrated.
3. Whether source inventory should fail on all direct provider calls under
   `scripts/` or only on scripts labeled as replay/proof/closure paths.
4. Whether helper modules may expose small orchestration convenience
   functions if they are only called by runner handlers, or whether those
   functions must live in runner handler files.
5. Whether the next work queue should merge the current active resource
   lifecycle item into this consolidation item, or close the current item only
   after this spec's gates pass.
