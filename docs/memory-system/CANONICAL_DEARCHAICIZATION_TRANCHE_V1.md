# Canonical De-Archaicization Tranche V1

This local-only tranche continued the retirement program after the earlier
canonical write/promotion follow-through work.

## What changed

1. `candidate-submit.ts` now derives more workflow auto-review behavior from
   canonical capture-category metadata instead of branching repeatedly on
   family-era lesson labels.
2. approved workflow-guidance planning now infers self-improving provenance
   from canonical record provenance, not only legacy facet markers.
3. legacy integration/eval proofs that still inserted raw workflow-guidance
   `autoCapture` rows now seed canonical approved workflow-guidance records
   instead.
4. `memory-family-policy.ts` no longer exposes `workflowLessonFamilies` on
   `MemoryFamilyDefinition`; workflow-lesson-family mapping is now an explicit
   compatibility map instead of part of the family-definition surface.
5. the provider- and incident-specific supported workflow lesson list now
   lives in `workflow-improvement-compat-catalog.ts` as bounded compatibility
   data instead of being co-located with the live semantic detector logic.
6. retrieval proof surfaces now use `auto_capture_capture_class_match`
   consistently instead of the older lesson-named matched field.

## Why this matters

- canonical approved records are now the proof substrate for workflow-guidance
  planning instead of a shrinking legacy fallback shape
- self-improving guidance classification now survives promotion through
  canonical provenance instead of depending on ad hoc facet residue
- workflow lesson compatibility data is more honestly isolated from retrieval
  and routing control logic
- `memory-family-policy.ts` is smaller and more obviously a compatibility /
  derived-view seam

## What still remains

- `candidate-submit.ts` still owns some family-shaped correction and
  supersession wrappers
- `memory-ingestion-resolver.ts` still keeps separate detector families
- `write-action-stages.ts` is more capable but is still not the final
  canonical multi-candidate write substrate
- `workflow-improvement-compat-catalog.ts` still contains explicit provider /
  incident-specific supported lessons, now isolated as compatibility data
