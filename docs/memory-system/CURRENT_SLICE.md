# Current Slice

## Active slice

Semantic retrieval routing v1

## Objective

Land the first real working-context semantic retrieval slice so later-turn
memory use improves for the safest nearby conceptual asks without turning the
system into a generic embedding-first memory retriever.

This slice is about:

- preserving the already-landed response-style, project-memory,
  recurring-procedure, and workflow-improvement families
- keeping `memory_object_search_hybrid` as the normal default retrieval path
- adding the first bounded semantic fallback only where the routing spec says
  it is safe
- improving nearby recurring-procedure asks when hybrid lexical recall is too
  weak
- preserving exact typed wins for clear checklist asks
- preserving validated-only and suggestion-first posture
- preserving candidate exclusion and explainable matched-field observability
- isolated proof plus narrow production proof
- updating the canonical memory docs to reflect what is now live

## Required work

1. Land one bounded semantic-retrieval routing subject family:
   - nearby recurring-procedure asks only
2. Keep the locked v1 posture concrete:
   - hybrid retrieval remains the default
   - clear checklist asks remain hybrid-first
   - semantic routing is additive, family-scoped, and validated-only
   - no candidate semantic retrieval
   - no action-taking or silent background procedure use
3. Add only the smallest bounded embedding-generation seam required for this
   slice:
   - validated procedure source memory embeddings only
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
- `docs/memory-system/PRODUCTION_SEMANTIC_RETRIEVAL_ROUTING_REPORT.md`

## Out of scope

- broader semantic routing across workflow-improvement or environment
  constraints
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

- a nearby conceptual recurring-procedure ask that hybrid alone misses can be
  improved by semantic fallback
- a clear checklist ask still keeps the exact typed validated procedure on top
- validated procedures remain hidden when the scope does not explicitly allow
  them
- candidate semantic retrieval remains disabled
- matched-field observability makes the routing explainable
- no action-taking or automation is introduced
- isolated proof and narrow production proof both exist
- canonical docs reflect the live boundary accurately

## Notes

This slice is now landed for its intended scope.

The next UX-focused memory slice has not been chosen yet.
