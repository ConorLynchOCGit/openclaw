# Current Slice

## Active slice

Pre-feature delivery enablement tranche v1

Third bounded slice: enforced clean-tree landing assertion

## Objective

Pause user-facing memory expansion long enough to tighten landing hygiene with
one repo-global closeout assertion before the final readiness-alignment slice.

This slice is about:

- keeping the pre-feature delivery enablement tranche explicit in the memory
  roadmap and spec pack
- landing one repo-global clean-landing assertion that:
  - fails if `scripts/committer` leaves the requested landing surface dirty
  - fails if push helper paths leave the full landing tree dirty after push
  - fails if a push helper path ends with local `HEAD` out of sync with the
    pushed upstream ref
- proving the new assertion with targeted helper validation
- documenting the enforced closeout rule in the repo workflow docs

## Required work

1. Add the pre-feature delivery enablement tranche to:
   - `docs/memory-system/memory-roadmap.md`
   - `docs/memory-system/specs/implementation-sequencing.md`
   - one dedicated supporting spec
2. Keep the four intended enablement improvements ordered and explicit:
   - shared memory runtime bootstrap helper
   - repo-owned memory proof runner
   - enforced clean-tree landing assertion
   - Docker health/readiness alignment
3. Land the third slice now:
   - enforced clean-tree landing assertion
4. Keep the rule repo-global rather than memory-local.
5. Update the canonical memory docs to reflect the landed assertion and the
   final remaining enablement step.

## Out of scope

- Docker health/readiness alignment implementation
- any new user-facing memory family
- production pairing/auth changes
- broad release-framework work
- generic semantic search or broader automation

## Acceptance criteria

- the memory roadmap and spec pack still reflect the delivery enablement
  tranche accurately
- one enforced clean-landing assertion exists in the repo-global helper path
- commit-only helper usage now fails when the requested landing surface is
  still dirty after commit
- push helper usage now fails when the worktree is dirty after push or local
  `HEAD` no longer matches the pushed upstream ref
- the repo workflow docs now document the enforced closeout rule accurately

## Notes

This slice is still enabling later memory work rather than expanding a new
remembered-behavior family.

The currently recommended remaining order after this slice is:

1. Docker health/readiness alignment
