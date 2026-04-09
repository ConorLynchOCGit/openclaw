# Canonical Profile Registry And Write Lane Batch V1

This local-only tranche continued the canonical retirement program on the
current dirty tree.

It landed:

1. a narrower shared approved-memory correction-promotion helper in
   `memory-correction-engine.ts`
2. more correction/supersession execution moved out of
   `candidate-submit.ts` and onto that shared helper
3. project-fact semantic detection moved onto a profile-registered detector
   registry in `memory-ingestion-resolver.ts`
4. narrow runtime-policy views moved into `memory-family-policy.ts` itself,
   with middleware consuming those instead of rebuilding them from broad
   family definitions
5. canonical write lanes in `write-action-stages.ts`, with submit-path stage
   routing keyed off those lanes instead of repeating family/category mixes
6. removal of the last `lessonFamily` fallback from the hybrid read
   scaffolding, with query-side fallback reduced to capture-class-based
   classification
7. retirement of three repo/process-specific named workflow lessons into
   generalized workflow guidance:
   - `vitest_wrapper_required`
   - `scripts_committer_required`
   - `git_stash_unsafe`

What this changed:

- `candidate-submit.ts` is less family-owned in correction and supersession
  flow
- the resolver is more honestly profile-registered for the touched semantic
  detector paths
- `memory-family-policy.ts` now owns narrow runtime-policy views directly
  instead of forcing middleware seams to reconstruct them from full family
  definitions
- the write substrate can route through canonical lanes like
  `workflow_guidance` and `project_fact` instead of restating mixed
  family/category conditions at each call site
- mixed-era project read scaffolding no longer relies on lesson-family
  fallback
- repo/process workflow guidance now flows through generalized guidance
  semantics instead of remaining hard-coded named lessons

What still remains:

- some correction/supersession wrappers still remain in `candidate-submit.ts`
- detector registration is not yet one fully shared registry across every
  remaining family seam
- `memory-family-policy.ts` still exports broad family definitions as the
  compatibility bridge
- `write-action-stages.ts` still is not the full canonical multi-candidate
  write substrate end to end
- four explicit compatibility lessons remain in
  `workflow-improvement-compat-catalog.ts`:
  - `python_command_unavailable`
  - `gateway_tools_invoke_forbidden`
  - `openai_embeddings_api_key_required`
  - `anthropic_context1m_eligible_credential_required`
