# Canonical Correction/Supersession Retirement Batch V1

## Purpose

This local-only batch continued the retirement program after the canonical
write/promotion follow-through tranche.

The goal was to remove the last mixed-era branching from:

- workflow correction/supersession execution in `candidate-submit.ts`
- workflow-guidance compatibility reads in retrieval/planning
- lesson-family-driven detector behavior in the ingestion resolver
- runtime dependence on workflow-lesson-family capture metadata lookups

## What landed

1. `memory-correction-engine.ts` now supports a shared supersede executor hook,
   so bounded workflow auto-review supersession can use the same correction
   promotion engine as project-fact correction.
2. `candidate-submit.ts` now routes workflow cluster auto-review supersession
   through that shared correction engine instead of carrying a separate
   review/promote/supersede sequence inline.
3. `memory-canonical-compat.ts` no longer carries a workflow-guidance
   mixed-era compatibility record builder.
4. `semantic-retrieval-routing.ts` and
   `learned-guidance-advisory-planning.ts` are now canonical-only for
   workflow-guidance record reads.
5. `memory-ingestion-resolver.ts` now chooses workflow semantic review mode
   from capture class instead of lesson family, and ordinary-turn response
   style now accepts semantic `requirement_correction` captures.
6. `ordinary-turn-auto-capture.ts` and
   `self-improving-candidate-capture.ts` no longer depend on
   workflow-lesson-family-to-family/capture lookups at runtime.
7. `memory-family-policy.ts` dropped one leftover workflow-lesson-family
   capture-metadata map and now resolves that compatibility lookup through the
   family definition only when explicitly requested.

## What changed architecturally

- workflow correction and supersession now have one canonical promotion engine
  with a pluggable supersede executor instead of separate family-owned
  promotion choreography
- approved workflow-guidance retrieval/planning now assumes canonical records
  are the substrate and no longer silently rehydrates old approved rows from
  `autoCapture`
- the remaining workflow lesson-family helpers are further demoted toward
  explicit compatibility instead of active runtime authority

## What still remains

- `candidate-submit.ts` still contains family-specific correction and
  supersession wrappers for some live mixed-era flows
- `memory-ingestion-resolver.ts` still contains some family-aware semantic
  detector internals below the now more canonical profile layer
- `memory-family-policy.ts` still owns compatibility and derived-view mapping
  for the transitional six-family runtime
- some tests and mixed-era adapters still preserve legacy metadata shapes as
  compatibility evidence even though the hot runtime paths are now more
  canonical-first

## Honest next step

The next local retirement slice should extract one canonical
correction/supersession helper for the remaining family-specific wrappers in
`candidate-submit.ts`, then keep collapsing the remaining detector internals in
`memory-ingestion-resolver.ts` onto pure canonical kind/facet profiles.
