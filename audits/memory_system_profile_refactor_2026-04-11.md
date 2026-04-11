# Memory System Profile Refactor 2026-04-11

## Summary

This pass executed three broad structural refactor loops against the active
memory runtime:

1. collapse repeated family tables into a single profile registry
2. centralize submission and workflow routing around profile/category helpers
3. centralize lifecycle/semantic metadata builders shared by tool-submit and
   ordinary-turn capture

The pass stopped after the third loop because the next obvious cuts are larger
orchestrator extractions from `candidate-submit.ts` and
`ordinary-turn-auto-capture.ts`; those remain high-value, but the expected
payoff per unit of churn is now meaningfully lower than the first three loops.

## Pass 1

### Goal

Replace repeated family-era tables with one canonical profile registry.

### Implemented

- added `src/plugin-sdk/memory-profile-registry.ts`
- moved profile-owned semantics into one table:
  - canonical kind
  - default tags/facets
  - scope model
  - lifecycle
  - correction
  - retrieval
  - semantic routing
  - proof posture
  - capture metadata
  - workflow auto-review posture where applicable
- rewired these surfaces to derive from the registry:
  - `src/plugin-sdk/memory-family-policy.ts`
  - `extensions/memory-middleware/src/capture-class-metadata.ts`
  - `extensions/memory-middleware/src/memory-runtime-policy-views.ts`
  - `extensions/memory-middleware/src/memory-compatibility-family.ts`
  - `extensions/memory-middleware/src/workflow-canonical-policy.ts`

### Measurement

- net diff after passes 1-2 across the core registry/policy files:
  - `321` insertions
  - `1,254` deletions
- `src/plugin-sdk/memory-family-policy.ts`
  - before: `998` LOC
  - after: `581` LOC
- `extensions/memory-middleware/src/memory-runtime-policy-views.ts`
  - before: `286` LOC-equivalent table-heavy body
  - after: `128` LOC
- `extensions/memory-middleware/src/memory-compatibility-family.ts`
  - before: `206` LOC table-heavy body
  - after: `132` LOC

### Validation

- `pnpm check:types`
- `pnpm test -- src/plugin-sdk/memory-family-policy.test.ts src/plugin-sdk/subpaths.test.ts extensions/memory-middleware/src/capture-class-metadata.test.ts extensions/memory-middleware/src/memory-runtime-policy-views.test.ts extensions/memory-middleware/src/workflow-canonical-policy.test.ts`

## Pass 2

### Goal

Remove inline submission-routing logic from `candidate-submit.ts` and reuse the
same workflow category/review semantics in ingestion.

### Implemented

- added `extensions/memory-middleware/src/memory-profile-routing.ts`
- moved profile/category routing out of `candidate-submit.ts`:
  - canonical metadata routing
  - legacy fallback routing
  - workflow capture-category narrowing
  - workflow review-mode narrowing
- rewired `memory-ingestion-resolver.ts` to use the same workflow routing
  helpers

### Measurement

- `extensions/memory-middleware/src/tools/candidate-submit.ts`
  - before: `3852` LOC
  - after pass 2: `3706` LOC
- inline submission-routing helper cluster removed from
  `candidate-submit.ts`
- workflow capture-category/review resolution now exists in one helper module
  instead of separate derivations

### Validation

- `pnpm check:types`
- `pnpm test -- extensions/memory-middleware/src/memory-profile-routing.test.ts extensions/memory-middleware/src/memory-ingestion-resolver.test.ts extensions/memory-middleware/src/workflow-canonical-policy.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts -t "normalizes project rules|normalizes unmet needs|uses an approved phrase pattern as deterministic response-style evidence|memory-profile-routing"`

## Pass 3

### Goal

Unify lifecycle/semantic metadata builders and immediate-confirmation timing
helpers across ordinary-turn capture and tool submission.

### Implemented

- added `extensions/memory-middleware/src/memory-lifecycle-metadata.ts`
- moved shared builders into one module:
  - semantic detection metadata builders
  - pending-confirmation metadata builders
  - immediate-confirmation timing guards
- rewired:
  - `extensions/memory-middleware/src/tools/candidate-submit.ts`
  - `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- normalized confirmation-window usage under one shared 72-hour constant in
  the remaining ordinary-turn overflow path

### Measurement

- two runtime-critical paths now share one lifecycle/semantic metadata module
  instead of parallel helper forests
- the pass reduced concept duplication more than it reduced raw file count;
  this was a medium-value cleanup compared with the higher-value registry and
  routing passes

### Validation

- `pnpm check:types`
- `pnpm test -- extensions/memory-middleware/src/memory-profile-routing.test.ts extensions/memory-middleware/src/workflow-canonical-policy.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts -t "memory-profile-routing|normalizes project rules into held-cluster managed improvement metadata|normalizes unmet needs into held-cluster managed improvement metadata|uses an approved phrase pattern as deterministic response-style evidence|captures a project rule as a held cluster and auto-promotes it after later compatible evidence|captures an unmet need as a held cluster and auto-promotes it after later compatible evidence|routes approved response-style phrase patterns back into deterministic transcript capture"`

## Diminishing-returns judgment

The pass stopped here because the next remaining structural opportunities are:

- extracting the managed normalization stage from `candidate-submit.ts`
- decomposing the detector forest in `ordinary-turn-auto-capture.ts`

Both remain worthwhile, but both are materially larger surgeries with broader
behavioral blast radius than the three passes above. At this point the
refactor has already:

- removed most repeated family tables from the touched runtime core
- moved routing semantics behind generic profile helpers
- pushed more lifecycle/semantic behavior into shared canonical builders

The next pass should begin with fresh measurement and target one orchestrator
surface at a time rather than trying to continue the same batch indefinitely.

## Next recommended tranche

1. extract the managed-input normalization stage from `candidate-submit.ts`
2. extract ordinary-turn detector contracts into a real registry plus runner
3. replace remaining inline family/category branching with profile/facet
   resolution where semantics are already canonical
