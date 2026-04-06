# Current Slice

## Active slice

Third bounded project-memory UX slice

Completed after one bounded slice

## Objective

Expand the bounded explicit named-project profile with one more low-risk URL
tranche now that the delivery enablement pause is complete.

This slice now landed:

- `documentation_url`
- `runbook_url`
- the same project-scoped candidate-confirmation lifecycle already used for
  the earlier URL fields
- the same approved-only hybrid retrieval posture for direct project
  questions
- deterministic ignore for unsupported generic labels like plain `docs`

## Required work

1. Extend the bounded project-fact field registry with the next explicit
   low-risk URL fields only.
2. Preserve the existing candidate-confirmation lifecycle, project-scoped
   duplicate handling, and approved-only hybrid retrieval posture.
3. Prove isolated and production capture-confirm-retrieve loops for the new
   fields with the repo-owned proof runner.
4. Keep broader project-state inference, generic semantic search, and broader
   workflow automation out of scope.

## Out of scope

- speculative project state
- broader workflow-improvement or unmet-need families
- project-fact semantic retrieval
- production pairing/auth changes

## Acceptance criteria

- the supported explicit named-project field set now also includes
  documentation and runbook URLs
- later confirming evidence can auto-promote those fields without manual
  review
- direct approved-only hybrid retrieval can rank the right support URL field
  first for later project questions
- weak generic docs phrasing still stays ignored instead of creating memory
  trash

## Notes

This slice stays inside the explicit named-project fact family rather than
opening broader project-state memory.

The next strongest bounded candidates to reconsider are:

- a broader workflow-improvement memory v2 slice, if it stays guidance-only
- unmet-need planning v1, if the recommendation-only artifact shape is ready
