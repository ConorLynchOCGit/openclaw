# Current Slice

## Active slice

Pre-feature delivery enablement tranche v1

First bounded slice: shared memory runtime bootstrap helper

## Objective

Pause user-facing memory expansion long enough to remove the most repeated
memory-proof bootstrap friction before the next feature slice.

This slice is about:

- recording the new delivery enablement tranche explicitly in the memory
  roadmap and spec pack
- choosing the first bounded enablement slice in the right order
- landing one shared memory runtime bootstrap helper that:
  - resolves memory SecretRefs through the supported command/runtime path
  - ensures built-in memory embedding providers are registered
  - gives proof scripts, evals, and repair tools one reusable bootstrap entry
    point
- reusing that helper in the current proof-facing memory CLI path so the seam
  is already live before the proof-runner slice

## Required work

1. Add the pre-feature delivery enablement tranche to:
   - `docs/memory-system/memory-roadmap.md`
   - `docs/memory-system/specs/implementation-sequencing.md`
   - one dedicated supporting spec
2. Classify and order the four intended enablement improvements:
   - shared memory runtime bootstrap helper
   - repo-owned memory proof runner
   - enforced clean-tree landing assertion
   - Docker health/readiness alignment
3. Land the first slice now:
   - shared memory runtime bootstrap helper
4. Wire the helper into the immediate proof-facing path.
5. Update the canonical memory docs to reflect the new tranche and the landed
   first slice.

## Out of scope

- repo-owned proof runner implementation
- Docker health/readiness alignment
- clean-tree landing assertion implementation
- any new user-facing memory family
- production pairing/auth changes
- broad release-framework work
- generic semantic search or broader automation

## Acceptance criteria

- the memory roadmap and spec pack now explicitly include the delivery
  enablement tranche
- the tranche defines goals, non-goals, classifications, and bounded order
- one shared memory runtime bootstrap helper exists under the memory stack
- the helper resolves memory SecretRefs and ensures built-in memory embedding
  providers are registered
- the current memory CLI proof-facing path uses that helper
- docs reflect the new tranche and the landed first slice accurately

## Notes

This slice is intentionally enabling later memory work rather than expanding a
new remembered-behavior family.

The currently recommended remaining order after this slice is:

1. repo-owned memory proof runner
2. enforced clean-tree landing assertion
3. Docker health/readiness alignment
