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

The retained architecture for the fresh RequirementMap path is:

```text
RequirementMap accepted
  -> SchedulerStageRunner persists RuntimeGraph nodes/edges
  -> NodeLifecycleTransitionRunner projects worker_action_ready / worker_context_required
  -> node starts from compact graph/RequirementMap contract
  -> worker.context.search / open / open_window / expand_window / contract_window
  -> NodeContextLedger receives exact hydrated windows and findings
  -> forced edit/action planning and authoring
  -> worker-local validation
  -> evidence
  -> mission validation node
  -> mission review node
  -> mission closeout node
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

The compact node start contract must contain refs and ids only:

- node id;
- node kind;
- capability id;
- covered RequirementMap ids/text refs;
- source prompt body ref;
- source prompt refs;
- authority refs;
- upstream evidence refs;
- dependency node ids;
- tool surface ref.

It must not carry materialized context bodies, target selections,
`CodingResourcePacket`, `ImplementationTaskPacket`, or `NodeExecutionPacket`
payloads.

The worker adapter may execute the model/tool loop only after the runner
projects a legal worker/context transition. The adapter must consume
`NodeLifecycleProjection.nextLegalTransitions`; it must not maintain a
parallel lifecycle state machine.

## Runner-Owned Native Context Contract

The worker context loop is a `NodeLifecycleTransitionRunner` session, not an
adapter-owned helper loop and not scheduler repair. The runner owns lifecycle
state, visible phases, legal domains, visible tool ids, edit eligibility,
validation/evidence repair transitions, no-progress collapse, typed blockers,
and escalation. The worker adapter only executes the current runner-projected
native tool turn and then executes the selected runtime tool mechanically.

The canonical session is:

```text
context_loop
  -> edit_plan
  -> forced patch_author
  -> validation
  -> validation repair context/edit loop if needed
  -> evidence
  -> evidence repair context loop if needed
```

No production context turn may ask a model to return JSON-shaped
`toolCalls`. The only accepted model transport for context selection is the
shared provider-native model tool transport. The transport is intentionally
thin: it receives the runner-supplied tool manifest, sends provider-native
tools, normalizes accepted/rejected native calls, and returns bounded
diagnostics. It must not decide phases, tools, domains, lifecycle state,
semantic quality, repair, or next transitions.

The minimal worker context verb family is:

- `worker.context.search`
  - required input: `domain`, `terms`, `basisRefs`, `expectedUse`;
  - optional bounded input: `methodology`, `pivotPlan`,
    `stopWhenAnswered`, `termFamilies`;
  - `domain` is one of `prompt`, `repo`, `symbols`, `tests`, or `callers`;
  - runtime mechanically searches only the runner-approved domain and
    authority refs.
- `worker.context.open`
  - required input: `ref`, `expectedUse`;
  - optional input: `start`, `end`, `startLine`, `endLine`, `before`,
    `after`;
  - runtime infers the resource domain from the ref shape and hydrates a
    bounded manifest.
- `worker.context.refine_window`
  - required input: `windowRef`, `operation`, `expectedUse`;
  - `operation` is `expand` or `contract`;
  - optional input: exact range or bounded expansion fields;
  - runtime validates authority and produces a new bounded window ref.
- `worker.context.block`
  - required input: `blockerKind`, `summary`, `requirementIds`;
  - input must also include either `missingRefs` or `missingCapabilities`.
- `worker.escalate`
  - terminal or continuation escalation selected by the runner when the
    current worker lane cannot complete safely.

The retired positive context tools are not required and must not be visible
in production context phases:

- `worker.context.propose_searches`;
- `worker.context.propose_discovery_strategy`;
- required `worker.context.inspect_scope_manifest`;
- separate `worker.prompt.*` tools;
- lexical-anchor or `DiscoveryBrief` prompt paths;
- JSON-shaped context `toolCalls`.

Older repo-oriented aliases such as `open_around_match`, `expand_window`, and
`contract_window` are retired as model-facing worker context tools. Equivalent
mechanics are expressed through `worker.context.open` and
`worker.context.refine_window`; the domain is carried as tool input and runner
phase policy, not by multiplying tool names.

Runtime may create a default mechanical window around a selected search match,
because that is not semantic judgment. Runtime must not decide that the
mechanical window is semantically sufficient. After reading the bounded
window, the model must be able to refine, accept, block, escalate, or search
again through runner-visible small verbs. A window is not useful context until
accepted by the model into the node ledger.

### Runner-Owned Domains

The runner decides which domains are visible in each context phase:

- initial context: `prompt`, `repo`;
- after a prompt window is opened: `prompt`, `repo`;
- after a repo window is opened: `prompt`, `repo`, `symbols`, `tests`,
  `callers`;
- validation repair: `prompt`, `repo`, `symbols`, `tests`, `callers`;
- evidence repair: `prompt`, `repo`, `tests`;
- forced patch authoring: no context tools and no context domains.

The worker model may use requirement ids/text and source-prompt refs as basis
for a direct repo search before opening prompt context, but every search must
cite `basisRefs`. Basis is provenance, not a quality gate. Runner validation
checks that cited refs exist and that the requested domain is legal; it does
not score whether the model's terms are semantically good.

Valid basis refs include:

- RequirementMap requirement ids;
- `source-prompt://...` body/range refs;
- prompt search result refs and prompt window refs;
- repo search result refs and repo/file window refs;
- accepted window refs;
- validation failure refs;
- evidence gap refs.

The old hard transition `keyword basis accepted -> repo search allowed` is
deleted. Search, open, refine, accept, validation repair, and evidence repair
are one iterative worker lifecycle.

### Worker Start Contract

The active `WorkerStartContract` carries only the minimum signal needed by
the worker and the runner:

- requirement ids/text/role/source refs;
- `sourcePromptBodyRef`;
- repo authority refs and edit authority refs;
- objective;
- expected output;
- acceptance criteria;
- prior evidence refs;
- legal worker tool families and current runner transitions.

It must not require `taskSummary`, `lexicalAnchorRefs`, `DiscoveryBrief`, or a
separate `KeywordBasis`/discovery seed product. Raw source refs such as
source-prompt excerpt refs, source context refs, and context packet refs may
exist only as bounded source-of-truth handles that the runner can hydrate;
they are not semantic readiness claims and do not unlock edit planning by
themselves. Requirement source refs are the source-prompt spans. The full
source prompt remains available through bounded prompt search/open tools, not
through pre-generated discovery seeds.

### Source Prompt Hydration

Prompt refs have their own authority and resolver. Prompt refs are never repo
file refs. The resolver must support:

- `source-prompt://<hash>/body`;
- `source-prompt://<hash>/body/<start>-<end>`;
- prompt search result refs;
- prompt window refs produced by `worker.context.open` and
  `worker.context.refine_window`.

Metadata stores bounded manifests: refs, hashes, byte ranges, preview counts,
and lifecycle diagnostics. Prompt/window bodies are rehydratable payloads or
volatile test inputs, not raw prompt blobs in graph metadata.

### NodeContextLedger

`NodeContextLedger` is the memory object for the worker context loop. There
is no separate `KeywordBasis` artifact. The ledger records compact events:

- `context_search_executed`;
- `context_basis_recorded`;
- `context_window_opened`;
- `context_window_refined`;
- `context_window_accepted`;
- `context_blocker_recorded`.

Each event stores bounded fields only: event id/ref, domain, basis refs,
terms, result refs, window refs, requirement ids, expected use, status,
summary, hashes/counts, and raw-storage flags set to false.

### No-Progress Collapse

No-progress is owned by the runner and keyed on typed state, not reason-code
bags. A context loop collapses only when the same node repeats the same
lifecycle gate, visible tool set, visible domains, selected tool/domain,
terms, basis refs, and blocker/result class. Normal Codex-style iteration is
not no-progress merely because the worker performs several searches or opens
several windows.

### Completion Gate

The replay gate for this architecture is intentionally downstream of this
implementation pass:

```text
RequirementMap requirement + source refs
  -> WorkerStartContract with sourcePromptBodyRef
  -> native worker.context.search(prompt or repo)
  -> automatic basis ledger event
  -> worker.context.open(prompt/repo result)
  -> worker.context.refine_window
  -> worker.edit.plan citing contextWindowRefs
  -> patch/validation/evidence eligibility from context-use receipts
```

This replay gate must be run after implementation, but it is not part of the
current documentation/implementation closeout.

## Search-Term Generation

Search terms must be model-authored from the node's objective, commitments,
restrictions, known refs, prior failed tool results, validation/evidence
expectations, covered RequirementMap requirement text/source refs, source
prompt body ref, dependency evidence refs, and ledger state.

The first context phase is not "search broad authority refs". It is:

1. runtime supplies the node objective, RequirementMap refs/text, source prompt
   refs, authority refs, dependency evidence refs, and legal tool surface;
2. model searches prompt/repo/symbol/test/caller domains directly with
   `worker.context.search`, using the `domain` argument selected by the model
   inside the runner-allowed phase domains;
3. model opens, refines, and accepts exact windows;
4. validation repair or evidence-gap repair may repeat the same search/read
   loop after new failures reveal new terms.

Runtime may provide:

- legal ref universe;
- authority scope;
- file/path/symbol handles;
- prior match handles;
- current objective and commitments;
- RequirementMap source refs and text;
- source prompt body ref and source prompt search/open tools;
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

## Code-Facing Completion Standard

The current implementation must align to this code shape:

1. `NodeLifecycleTransitionRunner` projects worker context domains and legal
   worker tools.
2. `non-codex-tool-using-worker-loop.ts` executes worker context phases
   through the shared provider-native model tool transport.
3. Context phases accept only the canonical worker context verbs:
   `worker.context.search`, `worker.context.open`,
   `worker.context.refine_window`,
   `worker.context.block`, and `worker.escalate`. The retired
   `worker.context.record_basis` verb must not be model-facing; runtime records
   basis/provenance from search/open/refine metadata and from later edit,
   validation, and evidence context-use receipts.
4. Prompt refs and repo refs are hydrated by separate resolvers. Prompt
   windows never become repo authority; repo windows never become prompt
   source truth.
5. Edit planning is blocked until the node ledger contains at least one
   accepted actionable repo/symbol/test/caller window for source-edit work.
   Accepted prompt windows can seed terms and methodology but cannot unlock a
   source edit alone.
6. Forced patch-authoring exposes only patch-author or typed blocker tools.
   If the patch boundary lacks context, the runner re-enters the native
   context open/refine/accept loop after the blocker; it does not route to a
   specialist demand/focus path.
7. Replay, readback, repair classification, smoke fixtures, and live parity
   proof scripts must not positively mention or require the retired
   `worker.context.request_more` / resource-demand specialist path.
8. Source inventory fails active production or proof files that expose the
   retired worker context dialect or retired worker-start semantic payloads.

The only deferred gate for this work item is the live replay/proof run. The
implementation closeout may compile, typecheck, and run focused deterministic
tests, but must not claim the final replay proof until the dedicated replay
gate is executed.

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
Requirement-backed scheduled node
  -> runner projection
  -> partial worker start
  -> model-authored context search
  -> open bounded prompt/repo window
  -> model refine_window
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
