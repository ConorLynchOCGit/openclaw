# Next Substrate Push Plan

## Purpose

This doc records the honest next substrate move after:

- the bounded self-improving and inline advisory batches landed
- the Main routing / learned-guidance / retrieval proof work landed
- multi-memory per-turn capture landed on the current substrate
- the repo finished the current-functionality proof loop strongly enough to
  stop pretending the current rigid family-heavy shape is the long-term model

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

1. replace rigid family-owned memory surfaces with generic adaptable seams
2. migrate toward 4 canonical durable memory kinds:
   - `User`
   - `Feedback`
   - `Project`
   - `Reference`
3. preserve the current family-specific semantics as metadata, derived views,
   and compatibility adapters during migration
4. only after that canonicalization work is real should the repo resume any
   broader family or domain expansion

### Later bounded cleanup only if justified

- artifact / read-model convergence if later rollout or new-family pressure
  shows the procedure-versus-memory-object split is still too awkward
- narrower retrieval cleanup only if later work exposes honest remaining
  duplication

## What should land next

The next implementation slices should now be:

- learned-guidance and hybrid retrieval rebased onto canonical records instead
  of family-specific switches
- remaining family-native capture paths rebased to canonical candidate
  emission
- retrieval SQL/control-plane cleanup so canonical plans become the primary
  substrate rather than a compatibility layer

The canonical-core tranche is now already landed:

- canonical record/envelope contract
- facet/metadata model
- family-policy compatibility builders
- canonical ingestion candidate contract
- canonical retrieval/ranking contract

Why:

- current user-visible behavior is now proven well enough that the main risk is
  architectural rigidity
- the current six-family substrate still duplicates policy, routing, and
  metadata meaning in too many places
- multi-memory capture removed one practical limitation, but it did not remove
  the deeper family-heavy structure that makes the system expensive to scale
- future work should not add more family-specific seams on top of that

## What should not be parallelized prematurely

- broader self-improving family expansion
- learned-guidance background scheduling or proactive execution
- new family implementation before canonicalization
- broad artifact/read-model redesign before rollout pressure says it is needed

## Exit criteria before moving on

Before new families:

- canonical kinds exist as the durable storage model
- family-specific behavior is mostly adapters or derived views rather than the
  primary substrate
- ingestion, retrieval, and application no longer re-derive most policy from
  family-specific string switches
- provenance and audit stay explicit during migration
- the compatibility layer is strong enough to preserve current live behavior

## Next implementation slice

- canonical 4-kind replacement architecture work, starting with the generic
  ingestion and retrieval substrate that can adapt the current family-heavy
  system instead of extending it
