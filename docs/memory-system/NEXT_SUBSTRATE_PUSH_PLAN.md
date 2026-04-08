# Next Substrate Push Plan

## Purpose

This doc records the honest next move now that the first bounded
self-improving and inline advisory batch is landed.

## What is already landed

The following are already landed:

- flattening batches v1-v6
- pre-capture hardening batch v1
- reduced-profile self-improving and advisory batch v1

Most importantly, the repo now has live landings for:

- shared ingestion / review / proof substrate
- shared family-policy contract ownership
- request-path hardening
- prompt/token-efficiency hardening
- write-path action-stage hardening
- reduced-profile self-improving capture on the shared candidate substrate
- inline learned-guidance advisory planning on approved retrieval

## Current bounded live posture

The newly landed functional seams remain intentionally bounded:

- `selfImprovingCapture.mode = candidate-only`
- `learnedGuidanceAdvisoryPlanning.mode = inline-only`

Current tranche boundaries:

- self-improving capture is workflow-guidance-only
- self-improving capture is candidate-only
- learned-guidance planning is approved-only
- learned-guidance planning is inline-only
- learned-guidance planning is advisory-only

## Remaining recommended sequence

### Next major phase

1. bounded rollout proof and observability for the new self-improving and
   inline-advisory seams
2. decide whether self-improving input coverage should widen or stay narrow
3. cross-domain family expansion only after those rollout answers are clear

### Later bounded cleanup only if justified

- artifact / read-model convergence if later rollout or new-family pressure
  shows the procedure-versus-memory-object split is still too awkward
- narrower retrieval cleanup only if later work exposes honest remaining
  duplication

## What should land next

The next implementation slice should now be:

- bounded rollout proof for reduced-profile self-improving capture and inline
  learned-guidance planning

Why:

- the substrate implementation work for these phases is now landed
- the remaining risk is rollout truth, not missing shared architecture
- widening scope before rollout proof would be the fastest way to recreate
  accidental parallel policy paths

## What should not be parallelized prematurely

- broader self-improving family expansion
- learned-guidance background scheduling or proactive execution
- new family implementation
- broad artifact/read-model redesign before rollout pressure says it is needed

## Exit criteria before moving on

Before new families:

- bounded rollout proof shows the self-improving tranche adds useful coverage
  without noisy replay
- provenance and audit stay explicit
- approved retrieval remains the only authority for later application
- inline advisory planning stays suggestion-only and conflict-safe
- the new surfaces do not create a second hidden policy system

## Next implementation slice

- bounded rollout proof and observability for the newly landed functional
  seams
