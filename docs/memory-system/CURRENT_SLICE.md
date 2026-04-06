# Current Slice

## Active slice

Semantic retrieval routing v2

## Objective

Land the next bounded working-context semantic retrieval slice so later-turn
workflow guidance improves for the safest conceptual environment-constraint
asks without turning the system into a generic embedding-first memory
retriever.

This slice is about:

- preserving the already-landed response-style, project-memory,
  recurring-procedure, workflow-improvement, and project-memory families
- keeping `memory_object_search_hybrid` as the normal default retrieval path
- adding the next bounded semantic fallback only where the routing spec says it
  is safe
- improving approved environment-constraint guidance asks when hybrid lexical
  recall is too weak
- preserving exact typed wins for strong lesson-key environment matches
- preserving approved-only and guidance-only posture
- preserving candidate exclusion and explainable matched-field observability
- isolated proof plus narrow production proof
- updating the canonical memory docs to reflect what is now live

## Required work

1. Land one bounded semantic-retrieval routing subject family:
   - approved environment-constraint guidance only
2. Keep the locked v2 posture concrete:
   - hybrid retrieval remains the default
   - strong typed workflow-lesson matches remain hybrid-first
   - semantic routing is additive, family-scoped, and approved-only
   - no candidate semantic retrieval
   - no action-taking or silent workflow remediation
3. Add only the smallest bounded embedding-generation seam required for this
   slice:
   - approved environment-constraint source memory embeddings only
4. Preserve the already-landed behavior of the other memory families.
5. Run isolated proof and narrow production proof.
6. Update:
   - `docs/memory-system/STATUS.md`
   - `docs/memory-system/memory-roadmap.md`
   - `docs/memory-system/feature-inventory.md`
   - `docs/memory-system/OPERATIONAL_RUNBOOK.md`
   - `docs/memory-system/CURRENT_SLICE.md`
   - `docs/memory-system/specs/semantic-retrieval-routing.md`
   - `docs/memory-system/specs/behavior-application.md`
   - `docs/memory-system/PRODUCTION_SEMANTIC_RETRIEVAL_ROUTING_V2_REPORT.md`

## Out of scope

- workflow-improvement tool-gotcha semantic retrieval
- repeated API failure workaround memory
- generic embedding-first working-context retrieval
- autonomous remediation or direct operational execution
- silent background application of stored procedures
- unmet-need planning
- phrase induction as live behavior
- self-improving capture enablement
- UI memory inspection surfaces
- production pairing/auth changes
- procurement, vetting, approval, or install automation

## Acceptance criteria

- a conceptual environment-constraint ask that hybrid alone misses or ranks
  weakly can be improved by semantic fallback
- a strong exact environment-constraint ask still keeps the typed approved
  memory result on top
- only approved project memory remains eligible for this slice
- candidate semantic retrieval remains disabled
- matched-field observability makes the routing explainable
- no action-taking or automation is introduced
- isolated proof and narrow production proof both exist
- canonical docs reflect the live boundary accurately

## Notes

This slice is now landed for its intended scope:

- nearby recurring-procedure asks remain the first live semantic fallback
  family
- approved environment-constraint guidance is now the second live semantic
  fallback family
- workflow-improvement tool gotchas still remain hybrid-first
- the next UX-focused memory slice has not been chosen yet
