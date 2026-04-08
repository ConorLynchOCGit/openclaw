# Current Slice

## Active slice

Bounded off-production rollout enablement and evidence review for
reduced-profile self-improving capture and inline learned-guidance planning

## Objective

Use the newly landed rollout-control and observability surfaces to collect
real evidence before any widening decision.

The current accepted answer is:

- both seams now have real rollout controls and structured observability
- both seams should stay narrow for now
- neither seam has earned broader authority or broader family coverage yet
- the next missing truth is bounded off-production rollout evidence, not more
  shared-substrate design

This slice does not answer production enablement by default.

It answers whether bounded off-production usage shows enough usefulness,
low-enough noise, and low-enough prompt cost to justify later widening.

The rollout still must avoid creating:

- a second memory authority
- silent policy mutation
- broader capture spray across families

## What just landed

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
- both seams now expose explicit rollout scope and structured evaluation /
  observability fields in their runtime results

Live rollout controls now include:

- explicit allowed lesson-family scope for self-improving capture
- explicit allowed lesson-family scope for learned-guidance advisory planning
- explicit default suggestion-budget control for inline advisory planning

Live rollout signals now include:

- self-improving outcome codes for created, blocked, replay-blocked, disabled,
  and failed decisions
- self-improving review-burden and duplicate-outcome signals
- advisory outcome codes for surfaced, suppressed, disabled, and no-guidance
  decisions
- advisory record counts, filtered-by-scope counts, and estimated prompt cost

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

1. bounded off-production enablement using the now-live rollout controls and
   observability
2. collect real evidence on usefulness, replay noise, conflict suppression,
   and prompt cost
3. only then decide whether either seam should widen or stay narrow longer
4. cross-domain family expansion only after those rollout answers are clear

Reason:

- the substrate and rollout-control implementation work for these phases is now
  landed
- the remaining missing truth is real rollout evidence, not missing shared
  architecture or missing observability
- widening scope before evidence exists would risk rebuilding parallel policy
  paths by accident
