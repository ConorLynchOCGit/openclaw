# Next Substrate Push Plan

## Purpose

This doc records the honest next move now that:

- the first bounded self-improving and inline advisory batch is landed
- the bounded rollout-proof and reevaluation batch is also landed
- the bounded promotion and off-production rollout-enablement batch is also
  landed

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
- self-improving capture now has explicit allowed lesson-family rollout scope
- self-improving capture now also requires an explicit `off-production`
  rollout target before activation
- learned-guidance planning is approved-only
- learned-guidance planning is inline-only
- learned-guidance planning is advisory-only
- learned-guidance planning now has explicit allowed lesson-family scope and a
  bounded default suggestion budget
- learned-guidance planning now also requires an explicit `off-production`
  rollout target before activation

Current reevaluation judgment:

- self-improving capture should stay narrow
- learned-guidance planning should stay narrow
- neither seam should widen before bounded off-production evidence exists
- explicit docs-localization and file-reference packet shapes are now
  promotion-eligible under bounded follow-through
- vague shorthand packet shapes should stay narrow and candidate-heavy
- production/default posture still remains off for the narrow self-improving
  and learned-guidance seams

## Remaining recommended sequence

### Next major phase

1. bounded promotion follow-through for the strongest explicit docs-localization
   and file-reference packet shapes
2. bounded off-production usage and evidence review using the landed controls,
   observability, and cleaned Main-session boundary
3. decide whether either seam or any broader phrasing class should widen or
   stay narrow based on real evidence
4. cross-domain family expansion only after those rollout answers are clear

### Later bounded cleanup only if justified

- artifact / read-model convergence if later rollout or new-family pressure
  shows the procedure-versus-memory-object split is still too awkward
- narrower retrieval cleanup only if later work exposes honest remaining
  duplication

## What should land next

The next implementation slice should now be:

- bounded off-production evidence review for the promotion-eligible explicit
  docs-localization and file-reference packet shapes plus the narrow
  self-improving / learned-guidance seams

Why:

- the Main-session reminder leak is now fixed
- the docs/file overlap cases from the manual UX pass now promote cleanly under
  bounded follow-through
- the self-improving and learned-guidance seams now have an explicit
  default-off versus `off-production` enablement boundary
- the remaining risk is still rollout truth under real usage pressure, not
  missing shared architecture or missing rollout gating
- widening vague phrasing classes before evidence exists would recreate
  accidental parallel policy paths faster than it would add useful coverage

## What should not be parallelized prematurely

- broader self-improving family expansion
- learned-guidance background scheduling or proactive execution
- new family implementation
- broad artifact/read-model redesign before rollout pressure says it is needed

## Exit criteria before moving on

Before new families:

- bounded off-production usage shows the self-improving tranche adds useful
  coverage without noisy replay
- provenance and audit stay explicit
- approved retrieval remains the only authority for later application
- inline advisory planning stays suggestion-only, conflict-safe, and cheap
  enough in prompt cost
- the new surfaces do not create a second hidden policy system
- the strongest explicit docs/file packet shapes promote cleanly without
  dragging vague shorthand phrasings along with them

## Next implementation slice

- bounded off-production evidence review for the newly promotion-eligible
  explicit docs/file packet shapes and the still-default-off self-improving /
  learned-guidance seams
