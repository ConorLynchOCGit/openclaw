# Next Substrate Push Plan

## Purpose

This doc records the honest next move now that:

- the first bounded self-improving and inline advisory batch is landed
- the bounded rollout-proof and reevaluation batch is also landed
- the bounded promotion and off-production rollout-enablement batch is also
  landed
- the automated eval and production-canary controls batch is also landed

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
- self-improving capture now also requires an explicit `off-production` or
  `production-canary` rollout target before activation
- learned-guidance planning is approved-only
- learned-guidance planning is inline-only
- learned-guidance planning is advisory-only
- learned-guidance planning now has explicit allowed lesson-family scope and a
  bounded default suggestion budget
- learned-guidance planning now also requires an explicit `off-production` or
  `production-canary` rollout target before activation

Current reevaluation judgment:

- self-improving capture should stay narrow
- learned-guidance planning should stay narrow
- neither seam should widen before automated eval plus rollbackable canary
  evidence exists
- explicit docs-localization and file-reference packet shapes are now
  promotion-eligible under bounded follow-through
- vague shorthand packet shapes should stay narrow and candidate-heavy
- production/default posture still remains off for the narrow self-improving
  and learned-guidance seams

## Remaining recommended sequence

### Next major phase

1. narrow rollbackable production canary runtime test for the control-ready
   self-improving and learned-guidance seams
2. explicit observation of docs-localization, file-reference, and native
   workflow weak spots during that canary
3. decide whether either seam or any broader phrasing class should widen or
   stay narrow based on automated-eval plus canary evidence
4. cross-domain family expansion only after those rollout answers are clear

### Later bounded cleanup only if justified

- artifact / read-model convergence if later rollout or new-family pressure
  shows the procedure-versus-memory-object split is still too awkward
- narrower retrieval cleanup only if later work exposes honest remaining
  duplication

## What should land next

The next implementation slice should now be:

- narrow rollbackable production canary runtime testing for the control-ready
  self-improving / learned-guidance seams, while explicitly watching the
  current docs-localization, file-reference, and native workflow weak spots

Why:

- the Main-session reminder leak is now fixed
- the docs/file overlap cases from the manual UX pass now promote cleanly under
  bounded follow-through
- the self-improving and learned-guidance seams now have an explicit
  default-off versus `off-production` versus `production-canary` enablement
  boundary
- automated eval is now real and already shows the weak spots that the canary
  must watch
- the remaining risk is now production-runtime truth under a narrow canary,
  not missing shared architecture or missing rollout gating
- widening vague phrasing classes before evidence exists would recreate
  accidental parallel policy paths faster than it would add useful coverage

## What should not be parallelized prematurely

- broader self-improving family expansion
- learned-guidance background scheduling or proactive execution
- new family implementation
- broad artifact/read-model redesign before rollout pressure says it is needed

## Exit criteria before moving on

Before new families:

- rollbackable production canary evidence shows the self-improving tranche
  adds useful coverage without noisy replay
- provenance and audit stay explicit
- approved retrieval remains the only authority for later application
- inline advisory planning stays suggestion-only, conflict-safe, and cheap
  enough in prompt cost
- the new surfaces do not create a second hidden policy system
- the strongest explicit docs/file packet shapes promote cleanly without
  dragging vague shorthand phrasings along with them

## Next implementation slice

- rollbackable production canary runtime test for the control-ready seams,
  followed by post-canary judgment for the docs/file and native-workflow weak
  spots
