# Current Slice

## Active slice

Semantic project memory UX v1

## Objective

Land the next bounded user-facing semantic memory slice so explicit named
project facts feel materially useful and repairable without broadening into a
generic fuzzy project-memory writer.

This slice is about:

- bounded semantic detection for supported named-project facts
- candidate-with-confirmation instead of dead manual-review backlog
- approved-only retrieval for remembered project facts
- conversational correction and supersede for this family
- ambiguity-ignore behavior for weak project-fact turns
- isolated proof plus narrow production proof
- updating the canonical memory docs to reflect what is now live

## Required work

1. Implement bounded semantic project-fact detection for the supported
   subject family.
2. Implement the locked ambiguity posture for this family:
   - conservative writes
   - candidate-with-confirmation
   - sparse clarify
   - ignore weak ambiguous signals
3. Implement later confirmation and bounded non-promotion behavior.
4. Improve approved project-fact retrieval and field-aware overlap handling.
5. Implement conversational correction or supersede for this family only.
6. Run isolated proof and narrow production proof.
7. Update:

- `docs/memory-system/STATUS.md`
- `docs/memory-system/memory-roadmap.md`
- `docs/memory-system/feature-inventory.md`
- `docs/memory-system/OPERATIONAL_RUNBOOK.md`
- `docs/memory-system/CURRENT_SLICE.md`
- `docs/memory-system/PRODUCTION_PROJECT_MEMORY_UX_REPORT.md`

## Out of scope

- repository URL memory
- deployment URL memory
- speculative project inference
- workflow-improvement memory
- recurring procedure memory as a user-facing semantic feature
- unmet-need planning
- phrase induction as live behavior
- self-improving capture enablement
- UI memory inspection surfaces
- production pairing/auth changes
- procurement, vetting, approval, or install automation

## Acceptance criteria

- supported natural named-project phrasing works materially better than the
  old exact-pattern posture
- later confirming evidence can promote a bounded project-fact candidate
  without manual review
- weak ambiguous signals do not become dead candidate trash
- later project questions retrieve the right approved remembered fact
- users can repair supported project facts conversationally
- isolated proof and narrow production proof both exist
- canonical docs reflect the live boundary accurately

## Notes

This slice is now landed for its intended scope.

The next UX-focused memory slice has not been chosen yet.
