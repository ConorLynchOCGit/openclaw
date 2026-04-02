# Current Slice

## Active slice

Shared-environment rehearsal for the current memory-middleware posture

## Objective

Reconcile the current approved posture with the actual shared non-production
environment available now, and rehearse that exact posture only if a real
shared target exists.

The current proven live baseline is:

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

1. Create or update a concrete operator runbook for the current enabled
   posture with the actual shared non-production environment available now.
2. Rehearse the exact currently approved posture only if that shared target
   exists, including:
   - passive runtime plus read-only retrieval
   - bounded governance writes
   - the current background-job modes and allowlists
   - runner ownership enforcement
3. If no shared target exists, record that failure accurately in a report and
   do not invent a rollout.
4. Update:

- `docs/memory-system/STATUS.md`
- `docs/memory-system/DECISIONS.md`
- `docs/memory-system/OPEN_QUESTIONS.md`
- `docs/memory-system/CURRENT_SLICE.md`
- `docs/memory-system/PRODUCTION_ADOPTION_PLAN.md`
- `docs/memory-system/PRODUCTION_READINESS_REVIEW.md`
- `docs/memory-system/AUTOMATION_READINESS_REVIEW.md`
- `docs/memory-system/OPERATIONAL_RUNBOOK.md`
- `docs/memory-system/SHARED_ENV_REHEARSAL_REPORT.md`
- `docs/memory-system/PLUGIN_CONTRACT.md` if needed
- `docs/memory-system/SECURITY_AND_RETRIEVAL.md` if needed
- `docs/memory-system/SKILL_PROCUREMENT.md` if needed
- `extensions/memory-middleware/db/README.md` if needed

## Out of scope

- claiming the exclusive `memory` plugin slot
- taking over `memory-core` or `memory-lancedb`
- touching production when the target is not an explicitly approved
  real non-production environment
- enabling any new automation class
- enabling self-improving capture
- enabling actual installation
- automatic Skill Vetter invocation
- runtime memory-slot takeover

## Acceptance criteria

- the docs clearly identify whether a real shared non-production target was
  available
- if unavailable, the report clearly states that the shared rehearsal did not
  execute and why
- if available, the report documents the exact shared-environment posture and
  pass or fail results without expanding automation
- status, decisions, open questions, current slice, and adoption or review
  docs are updated to match that recommendation

## Notes

This slice should stay truthful to the actual environment. If no shared
non-production target is available, the correct outcome is a documented
reconciliation failure, not a fabricated rehearsal.
