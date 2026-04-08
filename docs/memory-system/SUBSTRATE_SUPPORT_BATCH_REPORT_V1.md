# Substrate Support Batch Report V1

## Starting state

- branch: `codex/land-main-session-and-browser-fixes`
- head: `8b848ed585`
- tree: clean
- roadmap posture at start:
  - stronger substrate push still pending
  - support slices should land first where they reduce risk honestly
  - next main slice should still remain full ingestion control-plane flattening

## Contracts chosen

### Slice 1 — memory testability hardening

- exact tranche:
  - retrieval intent helpers
  - current durable-memory guidance-plan seam
  - semantic fallback eligibility helpers
- direct seams:
  - `extensions/memory-middleware/src/retrieval-intent.ts`
  - `extensions/memory-middleware/src/semantic-retrieval-routing.ts`
  - `extensions/memory-core/src/behavior-profile.ts`
- out of scope:
  - full application-selection layer
  - full retrieval/routing control plane

### Slice 2 — retrieval SQL scaffolding reduction

- exact tranche:
  - approved-vs-reviewable-candidate hybrid memory-object search scaffolding
- direct seams:
  - `extensions/memory-middleware/src/db/queries.ts`
  - `extensions/memory-middleware/src/db/hybrid-memory-surface-scaffolding.ts`
- out of scope:
  - validated-procedure retrieval unification
  - retrieval/routing control-plane rewrite

### Slice 3 — stringly control-flow cleanup

- exact tranche:
  - immediate bounded correction gate inside the correction engine
- direct seams:
  - `extensions/memory-middleware/src/memory-correction-engine.ts`
  - explicit-correction callers in auto-capture and candidate-submit
- out of scope:
  - proof-runner adapterization
  - broad correction-policy redesign

## Runtime seams changed

### Slice 1

- added `extensions/memory-middleware/src/retrieval-intent.ts`
- extracted current durable-memory guidance planning in
  `extensions/memory-core/src/behavior-profile.ts`
- extracted semantic fallback eligibility in
  `extensions/memory-middleware/src/semantic-retrieval-routing.ts`

### Slice 2

- added `extensions/memory-middleware/src/db/hybrid-memory-surface-scaffolding.ts`
- replaced separate approved/candidate hybrid memory-object SQL builders in
  `extensions/memory-middleware/src/db/queries.ts` with one shared surface
  builder

### Slice 3

- added typed correction-promotion policy in
  `extensions/memory-middleware/src/memory-correction-engine.ts`
- updated explicit-correction callers in
  `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- updated explicit-correction callers in
  `extensions/memory-middleware/src/tools/candidate-submit.ts`

## Cleanup and hardening achieved

### Slice 1

- retrieval intent no longer requires integration tests just to validate basic
  classification
- current behavior-profile guidance grouping is now explicit rather than hidden
  in rendering loops
- semantic fallback eligibility can now be proven without running the semantic
  search path

### Slice 2

- approved and reviewable-candidate hybrid memory-object search no longer keep
  separate metadata-expression scaffolding and query-shape builders
- candidate-only and approved-only differences are now isolated to the real
  differences:
  - candidate review-state filtering
  - approved artifact visibility
  - read-surface projection
  - review-state projection

### Slice 3

- the correction engine no longer treats a raw profile string as the immediate
  bounded-correction gate
- explicit-correction callers now translate config profile into a typed policy
  before invoking correction planning

## Behavior preserved

- procedures remain `suggestion_first` and clear-ask-only
- project facts remain direct-answer and stricter
- response style remains bounded reply shaping
- unmet needs remain recommendation-only
- semantic routing remains family-gated
- candidate retrieval still stays hidden unless scope is explicit
- approved artifact visibility remains unchanged

## Tests and validation run after each slice

### Slice 1

- `pnpm test -- extensions/memory-middleware/src/retrieval-intent.test.ts extensions/memory-middleware/src/semantic-retrieval-routing.test.ts extensions/memory-core/src/behavior-profile.test.ts`
- `pnpm check:types`

### Slice 2

- `pnpm test -- extensions/memory-middleware/src/retrieval-feature-framework.test.ts extensions/memory-middleware/src/db/hybrid-memory-surface-scaffolding.test.ts extensions/memory-middleware/src/db/queries.test.ts extensions/memory-middleware/src/tools/memory-object-search-hybrid.test.ts`
- `pnpm check:types`

### Slice 3

- `pnpm test -- extensions/memory-middleware/src/memory-correction-engine.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts`
- `pnpm check:types`

## Remaining main substrate work after this batch

Still remaining:

1. full ingestion control-plane flattening
2. real application-selection / behavior-planning layer
3. retrieval + semantic-routing control-plane flattening
4. recurring-procedure staged substrate redesign
5. correction-policy cleanup
6. proof-runner adapterization
7. registry authority cleanup
8. memory-family contract / boundary cleanup

This support batch reduced risk and duplication around those slices. It did not
replace them.

## Next implementation slice recommended

- full ingestion control-plane flattening

Reason:

- it is still the largest duplicated family-control seam
- the support batch lowered proof burden around later work but did not remove
  the ingestion split
- application-selection and retrieval/routing still depend on ingestion
  cleanup to flatten honestly
