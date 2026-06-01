---
summary: "P0 spec requiring model-authored resource objective focus and model-authored domain resource selection before any node resource demand, specialist subturn, context requirement packet, or executable domain action packet can be compiled."
title: "Mandatory Resource Focus And Domain Resource Selection Boundary"
---

# Mandatory Resource Focus And Domain Resource Selection Boundary

Date: 2026-05-27

Status: canonical cross-domain boundary. This spec closes the gap where
runtime has enough authority information to produce legal resource handles,
but only a model or human can choose which handles are relevant to the current
node objective. Coding maps this boundary to repo context and file edits.
Product/Spec Planning maps it to prompt sections, owner constraints, planning
artifacts, action graph candidates, and human decisions.

2026-05-28 implementation update: production scheduler readiness now treats
`ResourceObjectiveFocus` as the mandatory precondition for resource demand.
`resource.demand.open` is not a legal next transition until a model-authored
focus is accepted. When a WorkIntent or executable node needs context, runtime
first records `resource.focus.request_for_work_intent`, compiles a bounded
legal-ref universe from existing model-authored seed refs and authority
bounds, and exposes only compact handle options to a dedicated
`resource.focus` selector subturn. The global scheduler/orchestrator is no
longer allowed to repair this boundary, emit `request_context`, or smuggle
freeform focus metadata into graph decisions. The selector may return only
`resource.focus.accept` or `resource.focus.mark_unanswerable`; runtime then
validates selected handles against the legal universe and stores bounded
manifests/refs. Runtime does not rank, score, or choose semantic relevance.

2026-05-28 lifecycle-runner update: this boundary must be enforced by
`NodeLifecycleTransitionRunner`, not by optional scheduler helper branches.
`resource_focus_required`, `resource_demand_open_pending`,
`resource_demand_open`, `resource_narrowing_required`, and
`domain_resource_selection_required` are node-local lifecycle gates. Global scheduler
repair is illegal while any of those gates has a legal small-verb transition.

## Problem

The current architecture still has a dangerous halfway state:

```text
WorkIntent or graph metadata resource refs
  + commitment packet likely repo areas
  + approved repo scope
  -> context/resource candidate universe
  -> broad node resource demand or context scout packet
  -> implementation materialization resource snapshots
```

That shape is invalid. Runtime can compile a legal resource universe, but it
cannot know which resources are semantically relevant to the next work step.
If runtime uses broad refs as executable target refs, the system gets garbage
in, garbage out: huge context payloads, broad scout work, repeated scope
revision, and implementation packets that either have too much authority or
no meaningful edit target.

The intended shape is:

```text
WorkIntent
  -> legal resource universe manifest
  -> model-authored ResourceObjectiveFocus
  -> node-local NodeResourceDemandSession
  -> direct context tools or specialist scout subturn
  -> NodeResourceLedger entries
  -> model-authored domain resource selection
  -> runtime-validated domain action packet
```

Context is not graph fanout. Context scout is not default glue. Context scout
is an optional specialist subturn inside a consumer-bound
`NodeResourceDemandSession` after a model-authored focus decision has narrowed the
current unknown and selected legal handles.

## Code-Verified Current Contract

These are the active invariants:

- `resource-objective-focus.ts` defines `ResourceObjectiveFocus` and legal
  resource universe manifests as the mandatory semantic-focus boundary.
- WorkIntent and staged scheduler model-facing contracts use `resourceRefs`.
  Retired staged-scheduler `targetRefs` is rejected and cannot unlock
  resource demand or action readiness.
- Runtime can compile legal handles from authority and prior model-authored
  artifacts, but it cannot choose semantic relevance, target files, planning
  inputs, or action points.
- Source-edit materialization remains a coding-domain specialization. It must
  be reached through the shared sequence: resource focus -> node-local demand
  -> resource ledger -> domain resource selection -> coding action gate.
- Product/Spec Planning uses the same sequence, but its domain action packet
  is planning-artifact/action-graph/human-decision readiness rather than file
  snapshots.

## Cross-Domain Contract

This is not a coding-only rule. The generic orchestrator must use the same
boundary across domains.

Terms:

- `LegalResourceUniverse`: runtime-compiled options the worker is allowed to
  inspect or act on. This is authority and availability, not relevance.
- `ResourceObjectiveFocus`: model-authored statement of the next unknown, the
  expected use, selected legal handles, stop condition, and budget class.
- `NodeResourceDemandSession`: consumer-bound lifecycle for acquiring context
  needed by one WorkIntent or NodeExecutionContract.
- `NodeResourceLedger`: append-only node-local context record with compact
  manifests and artifact-backed bodies.
- `DomainResourceSelection`: model-authored selection of the exact resources
  to act on after context evidence exists.

Examples:

- Coding: files, symbols, tests, package manifests, validation commands.
- Product/spec planning: planning artifacts, research briefs, product
  decisions, action-graph nodes, runtime-plan primitives.
- Web research: sources, pages, quoted passages, search tasks, verification
  requirements.
- Operations: runbooks, alerts, metrics windows, remediation scripts,
  approval requirements.

Runtime validates structure and authority in all domains. It does not rank
resources by semantic relevance.

## Mandatory Production Sequence

### 1. WorkIntent Accepts Semantic Objective, Not Executable Targets

`WorkIntent` may carry objective, capability, commitments, evidence mode,
authority constraints, and optional candidate seed refs. It must not make
`resourceRefs` executable.

Required change:

- treat WorkIntent `resourceRefs` as legal candidate seeds only;
- reject any source-edit materialization that treats WorkIntent or graph
  metadata refs as executable targets before domain resource selection;
- keep graph node metadata manifest-only: refs, hashes, counts, versions,
  current state, and short previews only.

### 2. Runtime Compiles A Legal Resource Universe

Runtime may compile a bounded legal universe from:

- authority scope;
- commitment packet refs;
- prior ledger refs;
- source prompt section handles;
- code/doc/test indexes;
- workflow-declared resource classes;
- current branch or worktree state.

The universe is only a menu of legal handles. Runtime must not score,
truncate, rank, or choose semantically relevant handles. If the universe is
too large, runtime returns a structural blocker that asks for a smaller
model-authored objective/focus, not a runtime-ranked subset.

### 3. Model Authors ResourceObjectiveFocus

Before any context requirement, node resource demand, context scout packet, or
specialist scout subturn can be compiled, the model must author and runtime
must accept a `ResourceObjectiveFocus`.

Required fields:

- consumer node id;
- WorkIntent or NodeExecutionContract ref;
- current objective slot;
- context use kind;
- next unknown;
- expected use;
- selected legal handles;
- semantic questions;
- stop condition;
- budget class;
- limitation or unanswerable rationale when blocked.

Runtime validates:

- selected handles belong to the legal universe;
- exact legal `ref` strings returned in the same menu may be structurally
  normalized to their corresponding handles, because this is membership
  repair, not relevance selection;
- handle count and question count are within policy;
- selected refs are within authority;
- packet/manifests stay within byte budgets;
- state transition is legal;
- no raw prompt, raw provider response, hidden reasoning, or full body is
  stored in graph metadata or Work Queue metadata.

Runtime must not validate semantic quality beyond structural completeness.

### 4. NodeResourceDemandSession Opens From Accepted Focus

`context.demand.open` or equivalent must take an accepted focus ref. A
node resource demand without accepted focus is invalid unless a workflow definition
has an explicit non-scout context capability that supplies an equivalent
model-authored focus decision.

Allowed fulfillment paths:

- `context.demand.fulfill_exact_handles` for selected handles that already
  name an exact materialization unit: bounded file-window refs with line
  ranges, bounded symbol refs, validation/test refs, or memory-pack refs that
  fit the profile and authority scope;
- `context.scout.narrow_scope` when selected handles are broad, vague,
  oversized, mixed-kind, or otherwise not exactly fulfillable. The specialist
  subturn must return `context.scout.submit_exact_handles` or
  `context.scout.mark_narrowing_blocked`.

The scheduler may not interpret `context_narrowing_required` as permission to
ask the global graph model for repair. It must run the consumer-bound
specialist narrowing selector for that demand session, accept only the two
specialist scout verbs above, and project any selector failure as
`context_narrowing_selector_missing`, `context_narrowing_selector_failed`,
`context_narrowing_selector_rejected`, or a model-authored
`context.scout.mark_narrowing_blocked` artifact. This preserves the boundary:
the model chooses exact context windows; runtime validates membership,
authority, schema, budgets, storage, and next transition only.

Disallowed fulfillment paths:

- accepting invented handles, invented refs, approximate filenames, or
  partial labels as focus selections;
- runtime-selected line windows from bare files, directories, repo areas,
  target refs, or prompt prose;
- default durable `context_scout` graph nodes;
- graph-level scout fanout;
- broad packet-level context supply;
- default context synthesis;
- fallback to approved repo scope as scout roots.

### 5. Specialist Scout Is A Subturn, Not A Graph Node

Context scout may run only as:

```text
NodeResourceDemandSession
  -> accepted ResourceObjectiveFocus
  -> context.demand.fulfill_exact_handles
  -> context.scout.narrow_scope when exact fulfillment is unavailable
  -> specialist handoff
  -> NodeResourceLedger append
  -> consumer readiness update
```

The specialist receives selected handles and the current unknown. It does not
receive every candidate ref, every target ref, or all packet questions. It
cannot create graph progress by itself. It enriches the consumer ledger.

### 6. Target Selection Happens After Ledger Evidence

After context is appended to the ledger, a model-authored target-selection
step chooses the exact resources to edit or otherwise act on. For coding,
this is `TargetSelectionPacket` plus file-change intents. For other domains,
it is the domain's equivalent target/resource selection packet.

Runtime validates:

- selected targets are in the candidate/ledger/legal universe;
- selected targets are authorized for the capability;
- file-change intents cover selected source-edit files;
- snapshots exist for existing-file edits;
- new-file intents include parent snapshots or explicit blockers;
- validation and evidence expectations are available.

Runtime must not invent executable `targetFileRefs` from candidate seeds,
directory refs, context prose, or broad graph metadata.

### 7. Domain Action Gate Requires Accepted Domain Resource Selection

For `source_edit`, planning artifact production, human decision, and equivalent
domain action capabilities:

- plain `resourceRefs` are candidate seeds only;
- directory refs are discovery seeds only;
- verified context file refs are evidence, not edit authority;
- source-edit snapshots require an accepted coding-domain resource selection
  packet or an explicit new-file intent accepted by that same boundary;
- planning actions require accepted planning-domain resource selection for the
  planning inputs, research briefs, owner constraints, and action graph
  candidates they will consume;
- nodes with missing domain resource selection must block at
  `domain_resource_selection_required` or `domain_action_gate_blocked`, not
  proceed to a broad worker packet.

## Required Permanent Cuts

The implementation work for this queue item must remove or rewrite these
surfaces. Do not add compatibility flags or secondary fallback paths.

1. Remove fallback in context scout candidate discovery that uses
   `allowedFileRefs` as roots when no model-selected focus refs exist.
2. Stop combining commitment packet `likelyRepoAreas` and graph transport
   refs into context scout roots outside an accepted focus.
3. Remove default durable `context_scout` graph-node execution as ordinary
   context supply. Retain only specialist subturn infrastructure behind
   `NodeResourceDemandSession`.
4. Block `compileImplementationContextSnapshotPacket` from snapshotting
   plain input graph transport refs for source-edit work unless accepted
   domain resource selection is present.
5. Keep WorkIntent `resourceRefs` non-executable until accepted domain
   resource selection.
6. Remove replay/proof success gates that count broad context scout, graph
   fanout, or context synthesis as Product/Spec proof progress.
7. Update source inventory gates so retired production paths fail validation
   rather than being hidden behind exclusion logic.

## Required Small Verbs

The existing focus/selection contracts should be wired as first-class
runtime tools. Add missing verbs only when needed; keep schemas flat.

Resource focus:

- `resource.focus.request`
- `resource.focus.accept`
- `resource.focus.mark_unanswerable`
- `resource.focus.request_revision`
- `resource.requirement.compile_from_focus`

Demand/session:

- `resource.demand.open_from_focus`
- `resource.demand.request_exact_handle`
- `resource.demand.request_specialist_narrowing`
- `resource.demand.close_with_ledger`

Specialist subturn:

- `resource.scout.dispatch_specialist_subturn`
- `resource.scout.submit_specialist_handoff`
- `resource.scout.mark_specialist_blocked`
- `resource.scout.append_handoff_to_ledger`

Domain resource selection:

- `resource.selection.request_from_ledger`
- `resource.selection.propose`
- `resource.selection.accept`
- `resource.selection.mark_blocked`

Readback:

- `readback.project_resource_focus_required`
- `readback.project_resource_demand_open`
- `readback.project_domain_resource_selection_required`
- `readback.project_domain_action_gate_blocked`

## Metadata And Artifact Discipline

All focus, demand, scout, ledger, and target-selection state must follow the
manifest/artifact split:

- graph metadata: short manifests only;
- Work Queue metadata: short manifests only;
- latest-run-state: current gate, node, blocker, counts, token/walltime
  summaries only;
- artifact payload: full bodies, snapshots, handoff text, provider excerpts;
- handle manifests: refs, hashes, counts, byte counts, version, state.

No raw prompts, raw responses, raw tool logs, raw command logs, raw DB rows,
provider logs, hidden reasoning, or full source windows may be stored in
metadata.

Overflow is a structural failure. Do not raise metadata caps to pass a proof.

## Proof Gates

### Production Topology Gate

After accepted packets, the graph may contain WorkIntent, contract,
resource, executable, validation, review, readback, and closeout nodes. It
must not create default durable `context_scout` fanout. Context scout may
only run as a consumer-bound specialist subturn inside a demand session.

### Focus Requirement Gate

Context requirement packet compilation must fail without accepted focus. The
failure must name the missing transition and counts of candidate handles,
questions, and byte budgets.

### Scout Subturn Gate

Specialist scout dispatch must fail without:

- consumer node id;
- demand session ref;
- accepted focus ref;
- selected legal handles;
- authority manifest;
- payload-backed output policy.

### Target Selection Gate

Source-edit snapshot compilation must fail unless target selection is
accepted. A directory or broad target seed can produce candidate handles but
cannot produce executable snapshots by itself.

### Source Inventory Gate

Production imports/usages of retired graph-level context fanout,
context-synthesis glue, after-context-synthesis replay, legacy context supply
gates, and fallback context broadening fail validation. Historical docs/tests
may be allowlisted only with explicit reasons.

### Real Model Middle-Lane Gate

Run a Product/Spec-class middle-lane model test, not a trivial one-line edit:

```text
WorkIntent starts
  -> model accepts ResourceObjectiveFocus
  -> node-local demand opens from focus
  -> direct/specialist context appends ledger entries
  -> model selects targets from ledger/legal handles
  -> write gate hydrates snapshots
  -> worker edits
  -> validation runs
  -> evidence emits
```

Any broad scout/synthesis/fanout path fails the test.

## Readback Gates

Readback must project these gates from canonical runtime state:

- `resource_focus_required`
- `resource_focus_blocked`
- `resource_demand_open`
- `context_specialist_subturn_running`
- `resource_ledger_ready`
- `domain_resource_selection_required`
- `domain_resource_selection_blocked`
- `domain_action_gate_blocked`
- `worker_action_ready`
- `post_action_validation`
- `evidence_closure`
- `root_cause_terminal`

It must not report stale `resource_fulfillment`, packet-level context coverage, or
context-synthesis readiness after packets.

## Completion Definition

This item is complete when:

- production cannot compile context requirements, scout packets, or source
  edit snapshots from broad runtime-owned refs;
- `ResourceObjectiveFocus` is mandatory before node resource demand or scout
  specialist work;
- target selection is mandatory before source-edit snapshots;
- retired graph-level scout fanout and context synthesis cannot be used as
  proof success;
- a real model middle-lane test proves the focus -> demand -> ledger ->
  target selection path on non-trivial Product/Spec-class work;
- metadata remains manifest-only and overflow-safe.
