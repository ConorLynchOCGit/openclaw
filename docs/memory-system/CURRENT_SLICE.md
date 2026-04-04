# Current Slice

## Active slice

Bounded live interaction -> candidate capture soak and expansion for the
current approved `memory-middleware` posture

## Objective

Keep the approved production boundary intact, carry forward the passed bounded
production soak, and use the now-proven ordinary live interaction ->
candidate-capture path as the basis for the next bounded soak.

This slice is about:

- keeping ordinary live interactions able to create bounded candidate memory
- verifying that the produced rows stay correct and interpretable under real
  use
- compacting the memory build state so future re-entry does not require a
  full doc-pack reread
- deciding what larger bounded live chunk should move next only after this
  path proves stable enough under real interaction volume

Initial live-soak evidence already exists:

- fresh `chief` production session created one candidate submission event plus
  one matching candidate object from an explicit "please remember" stable
  preference
- fresh `main` production session created one candidate submission event plus
  one matching candidate object from a softer "for future reference" standing
  preference
- neither session created `memory_reviews` rows or `background_jobs` rows

The current approved live baseline is:

- read-only retrieval enabled
- bounded candidate, procedure, skill-candidate, procurement, vetting,
  approval, and install-record governance path enabled
- automation safeguards now wired
- live advisory scheduler support enabled for:
  - `proactive_plan`
  - `consolidation_plan`
- live execute-class scheduling enabled for:
  - `proactive_execute_run_drift_check`
  - `consolidation_execute` for bounded safe duplicate or stale actions only

## Required work

1. Keep the current approved production boundary unchanged while ordinary live
   interactions are allowed to create bounded candidate submissions.
2. Prove and monitor that real live turns create the expected candidate,
   event, and object rows.
3. Check whether volume and row quality remain in line with the intended lean
   rollout.
4. Keep review and promotion manual while the new capture path soaks.
5. Update:

- `docs/memory-system/STATUS.md`
- `docs/memory-system/DECISIONS.md`
- `docs/memory-system/OPEN_QUESTIONS.md`
- `docs/memory-system/CURRENT_SLICE.md`
- `docs/memory-system/PRODUCTION_ADOPTION_PLAN.md`
- `docs/memory-system/OPERATIONAL_RUNBOOK.md`
- `docs/memory-system/PRODUCTION_SOAK_REPORT.md`

## Out of scope

- claiming the exclusive `memory` plugin slot
- taking over `memory-core` or `memory-lancedb`
- enabling any new automation class
- enabling self-improving capture
- enabling actual installation
- automatic Skill Vetter invocation
- runtime memory-slot takeover

## Acceptance criteria

- the previous bounded production soak is explicitly treated as passed for its
  intended scope
- ordinary live turns are proven to create bounded candidate memory through
  the approved live path
- initial fresh-session soak evidence exists for both `main` and `chief`
- the new live interaction capture behavior is concrete enough to soak with
  real usage
- the next bounded expansion recommendation is explicit

## Notes

This slice does not broaden into full autonomous memory behavior.
