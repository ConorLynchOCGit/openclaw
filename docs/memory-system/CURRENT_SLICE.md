# Current Slice

## Active slice

Bounded rollout proof for reduced-profile self-improving capture and inline
learned-guidance planning

## Objective

Use the newly landed functional batch to decide how far the repo should enable
these surfaces in off-production and later production settings without
creating:

- a second memory authority
- silent policy mutation
- broader capture spray across families

## What just landed in the functional batch

### Slice 1 — reduced-profile self-improving capture reevaluation

- the reevaluation ended positive on the hardened shared substrate
- proof-runner support now includes a dedicated `self_improving_capture` step
- the proof path now validates candidate-only posture explicitly instead of
  relying on docs-only assumptions

### Slice 2 — bounded reduced-profile self-improving capture first tranche

- the self-improving seam now has an explicit gate:
  - `selfImprovingCapture.mode = candidate-only`
- the first tranche is bounded to workflow-guidance improvement candidates only
- proposals route through the normal candidate pipeline
- provenance, duplicate clustering, blocked replay handling, and review posture
  stay inside the shared substrate
- approved retrieval behavior remains unchanged unless a candidate is later
  approved through the normal path

### Slice 3 — learned-guidance advisory planning

- the learned-guidance planner now has an explicit gate:
  - `learnedGuidanceAdvisoryPlanning.mode = inline-only`
- the first advisory slice is:
  - approved-only
  - workflow-guidance-only
  - inline-only
  - read-and-suggest only
- it reads through the normal approved retrieval path
- it suppresses conflicting guidance instead of collapsing it into one
  misleading recommendation

## What remains intentionally disabled

Still intentionally disabled:

- direct approval from self-improving outputs
- direct phrase-pattern approval from self-improving outputs
- direct procedure validation from self-improving outputs
- broader self-improving family spray
- background-job learned-guidance planning
- advisory planning that writes memory or executes actions

## What is now live but still bounded

- reduced-profile self-improving capture exists as a default-off,
  workflow-guidance-only, candidate-only seam
- learned-guidance advisory planning exists as a default-off, approved-only,
  inline-only workflow-guidance seam

These are live substrate capabilities, not production-wide enablement.

## What is not next

Still not next:

- new memory families by default
- broad self-improving family expansion
- advisory planning that bypasses approved retrieval
- autonomy or scheduler-driven execution from learned guidance

## What must remain intentionally different

- procedures remain `suggestion_first` and direct-use only on clear ask
- project facts remain explicit, scoped, and stricter than generic guidance
- response style remains bounded and not broad personality memory
- unmet needs remain recommendation-only
- semantic routing remains hybrid-first and family-gated
- phrase induction remains family-eligible, not universal

## The next main implementation sequence

The next main implementation sequence should now be:

1. bounded rollout proof and observability for the newly landed
   self-improving and inline-advisory seams
2. only then a decision on whether to widen self-improving input coverage or
   keep it narrow
3. cross-domain family expansion only after those rollout answers are clear

Reason:

- the substrate implementation work for these phases is now landed
- the remaining question is rollout truth, not missing architecture
- widening scope before rollout proof would risk rebuilding parallel policy
  paths by accident
