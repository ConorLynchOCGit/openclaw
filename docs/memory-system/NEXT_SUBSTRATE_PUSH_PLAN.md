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

1. rerun a narrow rollbackable production-canary Main-session proof with the
   learned-guidance rollout target actually enabled and the new Main-only
   tool-choice steering in place
2. explicitly observe docs-localization, file-reference, and native workflow
   weak spots during that rerun
3. decide whether Main now honestly uses:
   - `memory_learned_guidance_plan` for eligible workflow-preflight asks
   - `memory_object_search_hybrid` for strong direct workflow lookup asks
   - direct model answers only for prompts outside those strong memory-informed
     classes
4. only then decide whether learned-guidance advisory planning is honestly
   proven in Main production-canary UX, and whether either seam or any broader
   phrasing class should widen or stay narrow
5. cross-domain family expansion only after those rollout answers are clear

### Later bounded cleanup only if justified

- artifact / read-model convergence if later rollout or new-family pressure
  shows the procedure-versus-memory-object split is still too awkward
- narrower retrieval cleanup only if later work exposes honest remaining
  duplication

## What should land next

The next implementation slice should now be:

- rerun narrow rollbackable production-canary Main-session proof for
  workflow-preflight learned-guidance adoption plus direct lookup retrieval
  adoption after the Main tool-choice fix, while explicitly watching the
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
- the remaining risk is now post-fix Main production-runtime truth under a
  narrow canary, not missing shared architecture
- the latest failed rerun mixed a live rollout-state gap with direct memory-tool
  bypass, so the next rerun must validate both enablement and tool selection
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

- rollbackable production canary Main-session rerun with explicit learned-
  guidance enablement plus post-rerun judgment for advisory, retrieval, and
  the docs/file/native-workflow weak spots
