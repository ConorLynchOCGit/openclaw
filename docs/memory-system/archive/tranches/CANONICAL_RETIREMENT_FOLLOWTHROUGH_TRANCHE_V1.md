# Canonical Retirement Follow-Through Tranche V1

This local-only tranche continued the canonical retirement program on the
current dirty tree without commit, push, or deploy.

## What changed

1. `candidate-submit.ts` moved more workflow correction and auto-review
   orchestration onto a shared canonical workflow policy layer
2. `memory-ingestion-resolver.ts` replaced another workflow detector ladder
   with profile-registered routing
3. `memory-family-policy.ts` lost more runtime authority as middleware
   consumers switched to narrower runtime-policy views
4. `write-action-stages.ts` gained cached canonical write classification and
   fuller multi-lane stage matching
5. hybrid retrieval/query seams now prefer canonical compatibility and
   `captureClass` over lesson-era `lessonFamily` / `lessonKey` fallbacks
6. three named workflow lessons now flow through generalized workflow
   semantics instead of the explicit compat catalog:
   - `docs_only_check_fast`
   - `memory_proof_runner_required`
   - `readyz_for_readiness`

## Why this matters

- more workflow correction and supersession behavior now lives behind shared
  canonical helpers instead of family-owned orchestration
- detector selection is flatter and more profile-driven
- family policy is closer to compatibility/derived-view ownership only
- the write-stage substrate now reuses a cached canonical candidate
  classification instead of re-deriving state at every stage boundary
- retrieval/ranking and proof surfaces now line up better with canonical
  `captureClass` semantics
- the compat catalog is smaller and more honest: generic workflow guidance is
  no longer preserved as hard-coded named lessons just because it landed that
  way historically

## What still remains

- `candidate-submit.ts` still has some family-shaped correction and
  supersession wrappers
- `memory-ingestion-resolver.ts` still has multiple detector entrypoints
  instead of one fully profile-driven registry
- `memory-family-policy.ts` still exists as a compatibility bridge and still
  exports broad family definitions
- `write-action-stages.ts` is closer to a canonical multi-candidate write
  substrate, but submit-path orchestration is still candidate-input-shaped
- `workflow-improvement-compat-catalog.ts` still contains explicit
  environment/provider-specific lessons that need a later delete-vs-generalize
  decision
- hybrid read scaffolding still has some mixed-era compatibility expressions
  for older read paths
