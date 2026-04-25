---
summary: "Post-cutover design for hierarchical or multi-pass retrieval on long multi-objective prompts."
title: "Post-Cutover Hierarchical Retrieval"
---

# Post-Cutover Hierarchical Retrieval

## Status

This is deferred post-cutover work.

It is not the current blocking read-side implementation.

The current blocking implementation is
[Memory Retrieval Runtime](/projects/model-memory/specs/memory-retrieval-runtime).
That runtime replaces the flat V0 retrieval path with retrieval planning,
status-aware candidate recall, memory packs, projection digests, context
injection, and direct telemetry.

This hierarchical spec remains the later multi-pass extension for long,
multi-objective prompts after the Memory Retrieval Runtime V1 is proven.

2026-04-22 MMV2 alignment:

- hierarchical retrieval decomposes retrieval intent only; it cannot mutate
  MMV2 truth, admission, reconciliation, correction, or projection state
- sub-query fan-out must preserve active-only filtering, structural correction
  posture, projection freshness checks, and no raw query persistence
- every sub-query emits selected ids, excluded ids, miss diagnostics, pack ids,
  and query hashes/redacted labels
- graph/capsule/projection lanes are read-time candidate sources only and must
  be attributable to active MMV2 source ids

2026-04-22 Phase 2 decision lock:

- use deterministic single-pass retrieval as the default and escalate only when
  the prompt is broad or multi-objective
- default broad-planning budget is at most `3` sub-queries, with up to `5` only
  for explicit proof or operator inspection surfaces
- model-assisted decomposition is allowed only to propose bounded sub-query
  plans; it cannot define truth, write memory, create corrections, or infer
  same-family identity
- duplicate candidates across sub-queries merge by object id, source memory id,
  source event id, source ref, projection/capsule digest id, and structural
  scope, not fuzzy semantic family
- hierarchical retrieval may use graph, capsule, projection, lexical, and
  recency signals only as read-time ranking inputs

Remaining implementation decisions:

- exact shadow-eval threshold for enabling hierarchical retrieval by default on
  broad prompts
- default token budgets per pack family once project-state capsules exist

The V1 retrieval runtime starts with:

- one current turn/task envelope
- one retrieval plan
- bounded candidate recall across selected corpora/indexes
- status/scope/conflict filtering
- one or more memory packs
- one telemetry-backed context injection

That V1 lane is acceptable for bounded task-context recall.

It is not yet intended to be the final answer for long, multi-objective, or
hierarchical planning prompts.

## Problem statement

Long work prompts often ask for multiple things at once, for example:

- explain the current state
- identify blockers
- propose next steps
- compare options
- respect standing project rules

When those all pass through a single retrieval request, the request model tends
to over-compress the prompt into one narrow goal or one over-constrained object
shape.

That produces three recurring failures:

- broad planning prompts collapse to too few or zero useful results
- one sub-goal dominates and crowds out the rest
- context assembly receives a flat result set instead of a structured memory pack

The next quality step after cutover is not more tuning of the current
single-request scorer.

It is bounded query decomposition or multi-pass retrieval for prompts that are
actually multi-objective.

## Objective

Add a post-cutover retrieval mode that can:

- recognize when a prompt contains multiple retrieval-worthy objectives
- decompose that prompt into a small bounded set of retrieval sub-queries
- run retrieval per sub-query without changing semantic truth
- merge results into one bounded, object-native context package

This extension must improve usefulness on long prompts without degrading:

- short direct queries
- operator inspection flows
- deterministic baseline retrieval
- active-only runtime filtering

## Non-goals

This spec does not allow:

- detector-era routing tables
- keyword registries as semantic authority
- local code that invents semantic meaning
- local code that decides duplicate truth from similarity alone
- unbounded fan-out retrieval
- a second semantic system inside the context engine

## Design principles

### Deterministic retrieval stays the baseline

Deterministic candidate recall remains the base retrieval engine.

Any model-assisted decomposition or interpretation must justify itself against
the deterministic baseline on the same prompt family.

### Decomposition is proposal-only

The model may propose sub-queries.

It may not define semantic truth, change stored objects, or invent canonical
facts.

### Bounded fan-out

Multi-pass retrieval must be explicitly bounded.

Default targets:

- `1` sub-query for ordinary direct prompts
- at most `3` sub-queries for multi-objective prompts by default
- at most `5` only for explicit operator or proof surfaces with a documented
  higher budget

### Active-only runtime truth remains intact

All sub-query retrieval passes must still read:

- active objects only by default
- the same object-native projections
- the same provenance-bearing payloads

### Authority-aware expansion

Hierarchical retrieval may expand into lower-authority soft-source lanes only
when the parent retrieval purpose supports research, references, project state,
or conflict inspection.

Sub-query planning and result merging must preserve:

- `authorityTier`
- `sourceProfileId`
- source refs
- exclusion reasons

Lower-authority candidates may improve coverage. They must not override
user-authoritative or curated-authoritative rules and directives.

### Context assembly remains budget-first

Hierarchical retrieval is only worthwhile if the merged result stays bounded.

This feature must not reintroduce late giant-pack assembly followed by crude
pruning.

## Prompt classes that justify decomposition

Post-cutover decomposition should target prompts that look like:

- broad planning requests with multiple explicit asks
- long operational prompts with separate status, blocker, and action questions
- requests that combine policy lookup with current-project reasoning
- prompts that mix repo guidance, project status, and implementation history

It should not trigger for:

- short direct fact lookups
- narrow operator inspection queries
- already-specific retrieval prompts

## Proposed pipeline

1. build one retrieval envelope from the runtime surface
2. decide whether the prompt needs single-pass or hierarchical retrieval
3. if hierarchical:
   - create a bounded sub-query plan
   - assign each sub-query a purpose and result budget
4. run retrieval-request interpretation per sub-query with the existing
   retrieval contract constraints
5. run deterministic candidate recall per sub-query
6. optionally rerank per sub-query
7. union, dedupe, and budget the combined result set
8. emit one final object-native retrieval package for context assembly

## Sub-query planning contract

If a planner is used, it must emit a bounded structural contract.

Required fields:

- `parentGoal`
- `decompositionMode`
- `subqueries[]`

Each sub-query must include:

- `subqueryId`
- `goal`
- `queryText`
- `purpose`
- `canonicalClasses?`
- `kinds?`
- `scopeConstraints?`
- `desiredResultCount`
- `priority`

Optional audit fields:

- `whyThisSubquery`
- `coversPromptSpan`

The planner must not emit:

- invented facts
- direct object ids as semantic truth
- arbitrary hidden keywords unrelated to the prompt

## Result merge contract

The merge layer must preserve why each result was retrieved.

Each merged result should carry:

- `objectId`
- `sourceSubqueryIds`
- `retrievalReasonCodes`
- `rankBand`
- `mergedPriority`
- `authorityTier`
- `sourceProfileId`

The merge layer may:

- dedupe identical object hits across sub-queries
- promote results hit by multiple sub-queries
- down-rank redundant siblings when the budget is tight

The merge layer must not:

- rewrite object meaning
- invent synthetic objects
- replace provenance with query-local labels
- silently promote lower-authority sources

## Interaction with context assembly

The context engine should treat hierarchical retrieval as a richer retrieval-pack
producer, not as a new source of truth.

The context engine must receive:

- a bounded retrieval pack
- segment-level inclusion reasons
- stable ordering inputs
- per-segment token estimates

The retrieval pack should support:

- cross-subquery deduplication
- capped per-subquery contribution
- deterministic merge ordering
- early budget enforcement before final assembly

## Retrieval quality policy

Hierarchical retrieval earns its keep only if it improves real prompts.

Proof must compare:

- deterministic single-pass retrieval
- model-interpreted single-pass retrieval
- hierarchical or multi-pass retrieval

At minimum, proof must answer:

- did the broader prompt stop collapsing to zero or near-zero useful results
- did the merged package cover more of the actual user objectives
- did the package stay bounded
- did short direct prompts avoid regression

## Suggested evaluation basket

After cutover, benchmark hierarchical retrieval on:

- broad planning guidance prompts
- multi-part implementation prompts
- long status-plus-next-steps prompts
- operator queries that combine inspection and action planning

Include at least one comparison where:

- deterministic single-pass is already good enough
- model single-pass degrades retrieval
- hierarchical retrieval improves coverage without blowing the budget

## Rollout posture

This should ship after cutover behind an explicit runtime gate.

Recommended rollout order:

1. proof-only runner
2. shadow comparison against single-pass retrieval
3. bounded operator opt-in
4. default runtime enablement only if the proof lane shows real additive value

## Why this is deferred until after cutover

Current cutover blockers are about:

- duplicate escape pressure on reruns
- retrieval quality neutrality versus degradation
- bounded context packaging
- runtime stability and observability

Those are higher leverage than adding a second retrieval mode now.

The clean-room system should first cut over with a retrieval path that is:

- object-native
- bounded
- diagnosable
- not actively harming results

Only after that should the project add hierarchical retrieval for large
multi-objective prompts.
