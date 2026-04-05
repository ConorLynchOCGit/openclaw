# Current Slice

## Active slice

Semantic response-style UX v1

## Objective

Land the first bounded user-facing semantic memory slice so response-style
preferences feel materially more natural and repairable without broadening
into a generic fuzzy memory writer.

This slice is about:

- bounded semantic detection for supported response-style subjects
- candidate-with-confirmation instead of dead manual-review backlog
- approved-only behavior application for remembered response-style memory
- conversational correction, supersede, and targetable forget for this family
- checked-in messy-language eval coverage for this family
- isolated proof plus narrow production proof
- updating the canonical memory docs to reflect what is now live

## Required work

1. Implement bounded semantic response-style detection for the supported
   subject family.
2. Implement the locked ambiguity posture for this family:
   - conservative writes
   - candidate-with-confirmation
   - sparse clarify
   - ignore weak ambiguous signals
3. Implement later confirmation and bounded non-promotion behavior.
4. Improve approved response-style behavior application and overlap handling.
5. Implement conversational repair for this family only.
6. Add checked-in messy-language eval coverage for the supported subjects.
7. Run isolated proof and narrow production proof.
8. Update:

- `docs/memory-system/STATUS.md`
- `docs/memory-system/memory-roadmap.md`
- `docs/memory-system/feature-inventory.md`
- `docs/memory-system/OPERATIONAL_RUNBOOK.md`
- `docs/memory-system/CURRENT_SLICE.md`
- `docs/memory-system/PRODUCTION_RESPONSE_STYLE_UX_REPORT.md`

## Out of scope

- broader semantic learning-event families
- phrase induction as live behavior
- recurring procedure memory as a user-facing semantic feature
- workflow-improvement memory
- broader project-memory expansion
- unmet-need planning
- self-improving capture enablement
- UI memory inspection surfaces
- production pairing/auth changes
- procurement, vetting, approval, or install automation

## Acceptance criteria

- supported natural response-style phrasing works materially better than the
  old phrase-first posture
- later confirming evidence can promote a bounded response-style candidate
  without manual review
- weak ambiguous signals do not become dead candidate trash
- later replies apply approved remembered response-style behavior more
  consistently
- users can repair supported response-style memory conversationally
- isolated proof and narrow production proof both exist
- canonical docs reflect the live boundary accurately

## Notes

This slice is now landed for its intended scope.

The next UX-focused memory slice has not been chosen yet.
