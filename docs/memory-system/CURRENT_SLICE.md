# Current Slice

## Active slice

Pre-feature delivery enablement tranche v1

Second bounded slice: repo-owned memory proof runner v1

## Objective

Pause user-facing memory expansion long enough to replace bespoke memory proof
setup with one bounded repo-owned proof entrypoint before the next feature
slice.

This slice is about:

- keeping the pre-feature delivery enablement tranche explicit in the memory
  roadmap and spec pack
- landing one repo-owned memory proof runner that:
  - loads proof or production config and env explicitly
  - uses the shared runtime bootstrap helper
  - runs bounded capture, review, promotion, procedure-validation, and hybrid
    retrieval proof steps
  - emits structured JSON with ids, matched fields, and health snapshots
- proving the new runner with:
  - one isolated mutating rehearsal
  - one narrow production retrieval-style rehearsal
- documenting the new proof path in the memory operator runbook

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
3. Land the second slice now:
   - repo-owned memory proof runner v1
4. Reuse the shared bootstrap helper instead of duplicating secret/provider
   bootstrap logic.
5. Update the canonical memory docs to reflect the landed proof runner and the
   remaining enablement order.

## Out of scope

- Docker health/readiness alignment
- clean-tree landing assertion implementation
- any new user-facing memory family
- production pairing/auth changes
- broad release-framework work
- generic semantic search or broader automation

## Acceptance criteria

- the memory roadmap and spec pack still reflect the delivery enablement
  tranche accurately
- one repo-owned memory proof runner exists under the memory stack
- the proof runner reuses the shared runtime bootstrap helper
- the proof runner supports bounded isolated and production-style proof plans
- the proof runner emits structured JSON with ids, matched fields, and health
  snapshots
- the operator runbook now documents the proof-runner path accurately

## Notes

This slice is still enabling later memory work rather than expanding a new
remembered-behavior family.

The currently recommended remaining order after this slice is:

1. enforced clean-tree landing assertion
2. Docker health/readiness alignment
