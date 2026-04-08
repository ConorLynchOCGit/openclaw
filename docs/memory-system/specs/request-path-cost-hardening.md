# Request-Path Cost Hardening

## Landed status

Landed in pre-capture hardening batch v1.

What landed:

- shared query-embedding reuse across semantic fallback lanes
- one shared approved-project semantic search and workflow backfill pass for
  the project semantic fallback families
- pooled/shared database access in the touched hot and semi-hot direct callers

What did not land:

- a repo-wide database access rewrite
- a retrieval-policy redesign
- a full off-request-path background backfill system

## Purpose

Define the first post-v6 hardening slice that should land before any
reduced-profile self-improving capture reevaluation.

This slice exists to lower normal-turn cost on the current substrate rather
than to add new memory capabilities.

## Why this slice is next

The post-v6 deep review concluded that the memory substrate is flatter than it
was before, but still too expensive on the request path for added capture
pressure.

The highest-risk remaining cost issues are:

- repeated database client setup/teardown in hot and semi-hot paths
- repeated query embedding across semantic fallback lanes
- request-path semantic embedding ensure/backfill work
- repeated retrieval/routing work where the action is the same but the lane is
  still duplicated

Those issues should be reduced before the repo reevaluates reduced-profile
self-improving capture.

## Runtime seams in scope

Primary likely touch points:

- `extensions/memory-middleware/src/db/queries.ts`
- `extensions/memory-middleware/src/retrieval-control-plane.ts`
- `extensions/memory-middleware/src/semantic-retrieval-routing.ts`
- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`
- `extensions/memory-middleware/src/recurring-procedure-lifecycle.ts`
- `extensions/memory-middleware/src/memory-correction-engine.ts`

Secondary likely touch points:

- memory-middleware DB/runtime barrels
- targeted retrieval/query tests
- hot-path proof or profiling helpers only if genuinely needed for validation

## Target architecture shape

The target shape is:

- pooled or otherwise shared database access for the hot request/write paths
- one query embedding per retrieval attempt where the semantic action is the
  same
- semantic fallback lanes that reuse shared request-time inputs instead of
  recomputing them
- semantic embedding ensure/backfill work pushed off the request path where
  honest
- bounded shared retrieval/routing helpers for repeated request-time work while
  keeping real family-policy differences in registry policy or bounded adapters

This slice is about cost-shape hardening, not about flattening policy
differences further.

## Preserved family-policy differences

This slice must preserve:

- procedures as `suggestion_first` and direct-use only on clear ask
- project facts as explicit, scoped, and stricter than generic guidance
- response style as bounded reply-shaping rather than broad personality memory
- unmet needs as recommendation-only
- semantic routing as hybrid-first and family-gated
- phrase induction as family-eligible, not universal

## Success criteria

This slice is successful only if:

1. repeated per-call DB client setup is reduced on the main hot and semi-hot
   paths
2. semantic fallback no longer recomputes obviously shared request-time work
   such as query embeddings
3. request-path semantic embedding ensure/backfill work is reduced or moved
   behind a more honest boundary
4. retrieval/routing cost reduction is real implementation work, not merely a
   wrapper around the old duplicated paths
5. current family behavior remains unchanged except for intentional cost and
   structure cleanup
6. targeted tests and honest validation prove the new request-path shape

## Non-goals

This slice is not:

- a new flattening rewrite
- a ranking-policy redesign
- a retrieval-family semantics rewrite
- reduced-profile self-improving capture
- learned-guidance advisory planning
- new family work

## Risks

Main risks:

- pooling/access cleanup accidentally changes transaction or failure behavior
- retrieval cost cleanup accidentally changes ranking semantics
- semantic fallback cleanup accidentally broadens or weakens family gating
- request-path cleanup stops too early and only hides duplication behind a new
  helper

## Validation expectations

At minimum this slice should prove:

- current retrieval behavior remains intact for approved-only default paths
- current explicit candidate and validated-procedure scopes remain intact
- semantic fallback family gating remains intact
- request-path helpers are exercised in targeted tests
- typed/runtime checks remain green

## What this slice unlocks next

This slice should make the next two hardening slices cheaper and safer by
reducing baseline hot-path cost before:

- query-aware/token-aware application shaping work
- write-path action-stage decomposition
- any later reduced-profile self-improving capture reevaluation
