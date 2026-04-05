# Current Slice

## Active slice

Recurring procedure memory UX v1

## Objective

Land the next bounded user-facing semantic memory slice so reusable named
checklists feel materially useful and repairable without broadening into a
generic fuzzy procedure writer.

This slice is about:

- bounded semantic detection for supported recurring checklist subjects
- candidate-with-confirmation instead of dead manual-review backlog
- validated-procedure retrieval for clear checklist asks
- conversational correction and supersede for this family
- ambiguity-ignore behavior for weak nearby one-off turns
- isolated proof plus narrow production proof
- updating the canonical memory docs to reflect what is now live

## Required work

1. Implement bounded semantic recurring-procedure detection for the supported
   subject family.
2. Implement the locked ambiguity posture for this family:
   - conservative writes
   - candidate-with-confirmation
   - sparse clarify
   - ignore weak ambiguous signals
3. Implement later confirmation and bounded non-promotion behavior.
4. Improve validated-procedure retrieval and clear-ask ranking for supported
   checklist subjects.
5. Implement conversational correction or supersede for this family only.
6. Run isolated proof and narrow production proof.
7. Update:

- `docs/memory-system/STATUS.md`
- `docs/memory-system/memory-roadmap.md`
- `docs/memory-system/feature-inventory.md`
- `docs/memory-system/OPERATIONAL_RUNBOOK.md`
- `docs/memory-system/CURRENT_SLICE.md`
- `docs/memory-system/PRODUCTION_RECURRING_PROCEDURE_UX_REPORT.md`

## Out of scope

- workflow-improvement memory
- broader procedure families beyond bounded named checklists
- silent background application of stored procedures
- skill extraction from recurring procedures
- unmet-need planning
- phrase induction as live behavior
- self-improving capture enablement
- UI memory inspection surfaces
- production pairing/auth changes
- procurement, vetting, approval, or install automation

## Acceptance criteria

- supported natural recurring-checklist phrasing works materially better than
  the old exact-pattern posture
- later confirming evidence can promote a bounded recurring-procedure
  candidate without manual review
- weak ambiguous signals do not become dead candidate trash
- later clear checklist asks retrieve the right validated stored procedure
- users can repair supported recurring procedures conversationally
- isolated proof and narrow production proof both exist
- canonical docs reflect the live boundary accurately

## Notes

This slice is now landed for its intended scope.

The next UX-focused memory slice has not been chosen yet.
