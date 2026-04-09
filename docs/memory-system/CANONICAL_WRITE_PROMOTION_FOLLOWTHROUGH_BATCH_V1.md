# Canonical Write/Promotion Follow-Through Batch V1

## Purpose

This batch continued the retirement program after the canonical
write/promotion unification tranche.

The goal was to remove the last broad runtime dependence on:

- family-aware detector fallback in the ingestion resolver
- family inference in write-stage routing
- lesson-family-driven correction planning in candidate submit
- duplicated old-record workflow-guidance metadata ladders
- broad family-definition lookups when narrow compatibility metadata would do

## What landed

1. `memory-ingestion-resolver.ts` now resolves workflow memory family from
   capture-class-backed canonical capture metadata only.
2. `write-action-stages.ts` no longer infers routing family from legacy
   category or `autoCapture.captureClass` when canonical stamping is absent.
3. `candidate-submit.ts` now:
   - stamps canonical response-style corrections on the correction path
   - reads promotion metadata through canonical-first helpers instead of raw
     `autoCapture` objects
   - uses capture-class metadata instead of lesson-family metadata for
     workflow normalization
   - resolves workflow cluster correction family from canonical submission
     metadata instead of `lessonFamily`
4. `memory-family-policy.ts` now serves capture metadata through narrow
   precomputed compatibility maps instead of re-reading broad family
   definitions for those calls.
5. `memory-canonical-compat.ts` now exposes one canonical-shaped
   workflow-guidance compatibility reader for mixed-era approved memories.
6. `semantic-retrieval-routing.ts` and
   `learned-guidance-advisory-planning.ts` now consume that shared
   compatibility reader instead of each carrying its own `autoCapture`
   metadata ladder.

## What changed architecturally

- canonical stamping is now a harder requirement at write-stage routing time
- mixed-era workflow-guidance compatibility is now one bounded adapter seam
  instead of duplicated retrieval/planner fallback logic
- family-policy participation in runtime control flow is smaller and more
  obviously compatibility-shaped

## What still remains

- `candidate-submit.ts` still owns family-specific correction and supersession
  helpers behind a more canonical front door
- `memory-ingestion-resolver.ts` still contains some family-aware semantic
  detector internals even though the top-level family choice is now driven by
  capture metadata
- the shared workflow-guidance compatibility reader still bridges legacy
  approved records that predate canonical stamping
- `write-action-stages.ts` now requires canonical stamping and assumes
  normalization happened earlier in the write path

## Honest next step

The next slice should extract one canonical correction/supersession engine
from the remaining family-owned helpers in `candidate-submit.ts`, then delete
the last mixed-era workflow-guidance compatibility bridge once legacy record
coverage is low enough.
