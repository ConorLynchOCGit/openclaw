---
summary: "Governing spec for deleting required pre-worker implementation materialization and replacing it with a runner-owned, worker-executed search/read/window context loop."
title: "Worker-Owned Context Search/Read Lifecycle"
---

# Worker-Owned Context Search/Read Lifecycle

Date: 2026-05-31

Status: P0 corrective spec for the Product/Spec coding proof. This spec
extends the node-local demand and lifecycle-runner specs, and supersedes any
production requirement that implementation/test/docs-edit nodes must pass a
pre-worker materialization phase before the worker can start.

## Decision

Delete required pre-worker implementation materialization for coding execution
nodes.

The worker starts with a partial but structurally valid execution packet:

- objective;
- target commitments and obligation refs;
- restrictions and authority bounds;
- capability/profile;
- allowed resource kinds;
- validation and evidence expectations;
- current `NodeLifecycleProjection`;
- legal worker/context tools for the current gate.

The worker then discovers needed context through small verbs. The model owns
semantic search terms, file/window choices, expansion/contraction decisions,
target/resource selection, edit planning, validation repair judgment, and
evidence sufficiency claims. Runtime owns refs, bounds, file reads, search
execution, payload storage, authority checks, lifecycle transitions, patch
application, validation execution, evidence structure, and readback.

The retained architecture is:

```text
WorkIntent accepted
  -> NodeLifecycleTransitionRunner projects worker_action_ready / worker_context_required
  -> worker starts from partial packet
  -> worker.context.search / open / open_window / expand_window / contract_window
  -> NodeResourceLedger receives exact hydrated windows and findings
  -> model-authored domain resource selection
  -> forced edit/action planning and authoring
  -> validation
  -> evidence
  -> Mission Ledger closure
```

The deleted architecture is:

```text
WorkIntent accepted
  -> pre-worker implementation context snapshot compiler
  -> fixed first-window/readiness packet
  -> worker starts only after materialization claims worker-ready
```

Pre-worker materialization is not retained as optional cache or hints for
implementation/test/docs-edit worker readiness. Exact model-authored windows
will usually not exist before the worker starts. Keeping an optional
materialization layer creates another stale readiness source and another place
for runtime to pretend it knows semantic sufficiency. Remove it from the
positive production path.

## Reconciliation With NodeLifecycleTransitionRunner

"Worker-owned context" means the worker model owns semantic context choices
inside the current node's lifecycle. It does not mean the worker adapter owns
lifecycle.

`NodeLifecycleTransitionRunner` remains the only production owner of:

- current node lifecycle state;
- current gate;
- next legal transitions;
- global-scheduler eligibility;
- worker-start permission;
- worker tool visibility;
- context demand/session/ledger gate projection;
- target/resource/action/validation/evidence gate projection;
- no-progress/root-cause collapse;
- readback gate.

The worker adapter may execute the model/tool loop only after the runner
projects a legal worker/context transition. The adapter must consume
`NodeLifecycleProjection.nextLegalTransitions`; it must not maintain a
parallel lifecycle state machine.

## Search/Read Small Verbs

The context loop must look like Codex-style search and read, but with explicit
runtime-owned guardrails and payload-backed artifacts.

Required worker-facing verbs:

- `worker.context.propose_searches`
  - model proposes one or more search terms/patterns and scope handles;
  - runtime validates authority, count, query length, and storage policy only.
- `worker.context.search`
  - runtime searches approved refs for model-authored query text;
  - output is a bounded match manifest with refs, line numbers, previews,
    hashes, and payload refs when needed.
- `worker.context.open_ref`
  - model opens a specific legal file/directory/symbol/prompt/resource ref;
  - runtime returns a bounded listing or preview manifest.
- `worker.context.open_around_match`
  - model selects a search-match handle;
  - runtime opens a mechanically bounded nearby window and records line
    range, content hash, total line count, truncation, and payload ref.
- `worker.context.open_window`
  - model specifies exact path/ref and line range;
  - runtime enforces hard max lines/bytes and authority.
- `worker.context.expand_window`
  - model expands an already opened window before, after, or both;
  - input must include the prior window ref, direction/line counts or exact
    revised line range, reason, and expected use.
- `worker.context.contract_window`
  - model narrows an already opened window to exact line bounds after reading;
  - input must include prior window ref, exact new line range, reason, and
    expected use.
- `worker.context.accept_window`
  - model marks a hydrated window as useful for the current objective and
    states intended use.
- `worker.context.report_pattern`
  - model reports existing pattern/API/constraint tied to accepted window refs.
- `worker.context.report_edit_point`
  - model reports likely edit point tied to accepted window refs.
- `worker.context.finish_context_turn`
  - model states the current context turn is sufficient for edit planning,
    target/resource selection, validation, or typed blocker.
- `worker.context.mark_unanswerable`
  - model declares a precise context blocker after bounded search/read
    attempts.

Runtime may create a default mechanical window around a selected search match,
because that is not semantic judgment. Runtime must not decide that the
mechanical window is semantically sufficient. After reading the bounded
window, the model must be able to expand, contract, accept, reject, or search
again through small verbs. A window is not useful context until accepted or
reported by the model into the node ledger.

## Search-Term Generation

Search terms must be model-authored from the node's objective, commitments,
restrictions, known refs, prior failed tool results, validation/evidence
expectations, and ledger state.

Runtime may provide:

- legal ref universe;
- authority scope;
- file/path/symbol handles;
- prior match handles;
- current objective and commitments;
- current unknown / expected use;
- byte and turn budgets.

Runtime must not:

- rank candidate files semantically;
- infer target files from filenames;
- choose search terms from prompt keywords using deterministic heuristics;
- truncate semantic candidate sets as a substitute for model scope choice;
- claim worker readiness from a fixed preview or first 120 lines.

## Ledger And Payload Rules

Every search/read/window result must write compact metadata plus artifact-
backed bodies:

- graph/node metadata stores refs, hashes, counts, byte counts, status, short
  previews, and lifecycle gate only;
- hydrated window content bodies live behind payload refs;
- worker prompt payloads carry bounded manifests and selected hydrated
  windows only;
- no raw prompts, raw responses, transcripts, provider logs, command logs,
  tool logs, DB rows, hidden reasoning, secrets, or unbounded file bodies.

The official overflow solution remains manifest in metadata plus payload
artifact. Do not raise caps, hide bodies in metadata, or silently drop context.

## Deleted Positive Paths

The implementation pass governed by this spec must delete or convert these
surfaces so they cannot claim readiness:

- required `compileImplementationContextSnapshotPacket` use before worker
  invocation;
- required `ImplementationContextPacket -> ImplementationTaskPacket ->
  NodeExecutionPacket` materialization before worker execution;
- `before_resource_materialization` / `after_resource_materialization` as
  positive replay success gates for implementation worker readiness;
- fixed first-window or first-120-lines worker readiness;
- `resource_fulfillment_handoff_artifact_missing` as a live worker-readiness
  repair path;
- scheduler-side context-sufficiency repair for implementation nodes;
- graph-level context scout fanout;
- context synthesis;
- fallback/compatibility flags that resurrect these paths.

The old compilers may survive only if rewritten into pure schema/manifest
helpers called by runner-owned handlers and incapable of deciding readiness.
If they still decide worker readiness or mutate lifecycle state, delete them
from production paths.

## Code-Verified Current Gaps

The current codebase already contains useful pieces:

- `resource-specialist-narrowing-loop.ts` can open refs, search within refs,
  choose files from directory listings, choose windows from matches, open
  windows, report findings, and submit exact handles.
- `non-codex-tool-using-worker-loop.ts` has `worker.context.request_more`
  and can dispatch the specialist narrowing loop.
- `NodeLifecycleTransitionRunner` projects lifecycle gates and blocks global
  scheduler while local transitions are pending.
- `domain-resource-small-verb-tool-surface.ts` defines shared resource and
  coding small-verb tool families.
- payload-backed artifact specs already define bounded manifest policy.

The remaining gaps are production blockers:

1. The replay harness still calls `materializeReplayImplementationResources`
   before worker execution.
2. `DynamicAgentTeamGraphRunner` still compiles implementation context
   materialization inside production implementation execution.
3. `implementation-context-snapshot-compiler.ts` and
   `post-resource-implementation-task-compiler.ts` still encode pre-worker
   readiness assumptions.
4. The worker specialist loop has search/read/open-window mechanics but lacks
   explicit model-owned expand/contract window verbs.
5. The worker context request path can finish a specialist loop without
   durable event artifacts and can still return
   `worker_context_request_unfulfilled_missing_exact_hydrated_windows` after
   a loop that searched/read but failed to hydrate exact accepted windows.
6. The worker adapter still treats context request fulfillment as a tool
   result rather than a first-class ledger-backed lifecycle transition owned
   by the runner.
7. Boundary replay registry/checkpoints still treat materialization
   boundaries as positive replay gates.
8. Readback/status docs and tests still mention resource/materialization
   readiness as proof success in several places.

## Required Acceptance Gates

This work is not complete unless all gates pass:

1. No positive production path invokes required pre-worker materialization for
   implementation/test/docs-edit nodes.
2. A worker can start from a partial packet with objective, commitments,
   restrictions, authority, resource kinds, validation expectations, evidence
   expectations, and runner projection.
3. Worker context search/read tools are visible only when the runner projects
   a legal context transition.
4. Model-authored search terms produce match handles; model selects matches;
   runtime opens bounded windows; model can expand or contract windows; model
   accepts exact windows into the ledger.
5. Runtime never judges semantic context sufficiency or target relevance.
6. Ledger entries and hydrated windows are payload-backed; metadata remains
   bounded.
7. No replay/proof success can be claimed from `before_resource_materialization`
   or `after_resource_materialization`.
8. Source inventory fails on surviving positive production imports/usages of
   retired materialization/context-supply paths.
9. A real middle-lane replay proves:

```text
WorkIntent
  -> runner projection
  -> partial worker start
  -> model-authored context search
  -> open around match
  -> model expand/contract
  -> accepted exact windows in ledger
  -> resource/target selection
  -> edit plan
  -> forced patch/action authoring
  -> validation
  -> evidence
```

10. Net lifecycle/control code should go down or remain tightly scoped. A
    large net increase in scheduler/runner/worker/replay lifecycle surfaces
    is evidence that the pass layered new abstractions instead of deleting
    old ownership.

## Domain-General Shape

The same architecture applies outside coding:

- coding resources are files, windows, symbols, tests, diffs, validation
  results;
- planning resources are prompt sections, owner constraints, research briefs,
  planning capsules, action graph candidates, human decision refs;
- research resources are sources, citations, datasets, claim refs, freshness
  evidence;
- ops resources are logs, metrics, runbooks, incidents, deploy refs.

The generic loop is:

```text
worker starts with objective and authority
  -> model searches/opens domain resources
  -> runtime hydrates bounded resources
  -> model expands/contracts/accepts useful resource windows
  -> ledger records accepted evidence
  -> model selects resources/actions
  -> runtime executes/validates
  -> evidence closes commitments
```

The runner owns lifecycle in every domain. The model owns semantic search,
resource choice, and sufficiency judgment inside small verbs.
