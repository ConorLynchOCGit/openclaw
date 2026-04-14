---
summary: "Current slice for model-memory."
title: "Model Memory Current Slice"
---

# Current Slice

## Slice

`pre-cutover-representative-pass1-comparison-and-candidate-stability`

## Goal

Hold the line on the standalone clean-room package after slices 1 through 15
and isolate the remaining large-document instability before paying for another
broader Tier 1 rerun.

## Included in this slice

- no new implementation slice is currently open
- maintain the completed standalone package boundaries:
  - canonical semantic truth remains in memory objects
  - derived runtime layers remain derived
  - harness integration remains downstream
  - shadow mode remains observational
- verify the live `model_memory` logical database state and keep docs aligned
  with the real provisioning state
- execute the large-document ingestion readiness phase using
  [Document Ingestion Inventory](/projects/model-memory/document-ingestion-inventory)
- keep the last full Tier 1 execution outcome recorded in
  [Large Document Tier 1 Evidence](/projects/model-memory/evidence/large-document-tier1)
- run bounded representative comparisons before any broader rerun:
  - seeded nano/nano control
  - seeded mini/nano pass-1-only comparison
  - current comparison artifact:
    [Representative Pass-1 Model Comparison](/projects/model-memory/evidence/representative-pass1-model-comparison-seed7)
- keep the evidence lane on an explicit small extraction model rather than
  `openrouter/auto`
- do not admit real-source proof cases until the live path shows candidate-set
  stability, rerun stability, and honest duplicate collapse on the admitted
  cases
- prepare explicit cutover and retirement planning only after the standalone
  package is judged operationally ready from evidence rather than completion
  vibes

## Excluded from this slice

- no unplanned ontology expansion
- no compatibility bridge
- no shadow-as-backfill behavior
- no cutover execution
- no legacy deletion
- no VPS purge
- no benchmark fallback to exact-string document matching

## Exit bar

- the standalone package remains green on fast lanes
- large-document ingestion has an explicit audited inventory and execution order
- the last full explicit-small-model Tier 1 rerun remains documented
- the representative pass-1 model comparison is complete and documented
- readiness is still blocked by candidate-layer instability until rerunning the
  same representative docs under the same seed stops materially changing the
  candidate sets that feed pass 2
- readiness is still blocked by large-source semantic stability until rerunning
  the same Tier 1 cases stops creating new writes and at least one real-source
  case can be honestly admitted into proof
- operational readiness is judged from shadow, inspection, calibration, and
  large-source evidence rather than vibes
- any future cutover plan is written explicitly instead of emerging implicitly
  from implementation drift
