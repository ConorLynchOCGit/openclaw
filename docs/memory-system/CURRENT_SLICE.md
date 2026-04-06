# Current Slice

## Active slice

Semantic retrieval routing v4

## Objective

Land the next bounded semantic retrieval routing slice so approved API
workaround guidance can help with later-turn provider-troubleshooting asks
without turning the system into generic semantic search everywhere.

This slice is about:

- preserving the already-landed response-style, project-memory,
  recurring-procedure, workflow-improvement, and semantic-retrieval-routing
  families
- preserving the already-landed bounded API workaround capture posture
- keeping `memory_object_search_hybrid` as the normal default retrieval path
- improving approved provider-troubleshooting guidance for the first supported
  API workaround asks through bounded semantic fallback
- preserving guidance-only posture and duplicate suppression
- preserving semantic retrieval routing v1-v3 exactly as already landed
- isolated proof plus narrow production proof
- tightening the user-facing OpenAI embeddings auth wording so it matches the
  current implementation truth
- updating the canonical memory docs to reflect what is now live

## Required work

1. Land one bounded semantic retrieval routing family:
   - approved API workaround guidance only
2. Keep the locked posture concrete:
   - hybrid retrieval remains the default
   - exact typed workflow/API workaround matches remain hybrid-first
   - semantic routing for API workaround guidance is additive fallback only
   - no candidate semantic retrieval
   - no action-taking or silent workflow remediation
3. Support only the first bounded API workaround subjects:
   - `openai_embeddings_api_key_required`
   - `anthropic_context1m_eligible_credential_required`
4. Preserve the already-landed behavior of the other memory families.
5. Run isolated proof and narrow production proof.
6. Update:
   - `docs/memory-system/STATUS.md`
   - `docs/memory-system/memory-roadmap.md`
   - `docs/memory-system/feature-inventory.md`
   - `docs/memory-system/OPERATIONAL_RUNBOOK.md`
   - `docs/memory-system/CURRENT_SLICE.md`
   - `docs/memory-system/specs/workflow-improvement-memory.md`
   - `docs/memory-system/specs/semantic-retrieval-routing.md`
   - `docs/memory-system/specs/behavior-application.md`
   - `docs/memory-system/PRODUCTION_SEMANTIC_RETRIEVAL_ROUTING_V4_REPORT.md`
   - `docs/help/faq.md`
   - `docs/reference/memory-config.md`

## Out of scope

- broader API workaround memory
- semantic retrieval for `git_stash_unsafe`
- generic embedding-first or semantic-first working-context retrieval
- autonomous remediation or direct operational execution
- silent background application of stored procedures
- unmet-need planning
- phrase induction as live behavior
- self-improving capture enablement
- UI memory inspection surfaces
- production pairing/auth changes
- procurement, vetting, approval, or install automation

## Acceptance criteria

- a first supported API workaround statement can enter pending confirmation
- later confirming evidence can auto-promote the bounded lesson without manual
  review
- approved-only retrieval can surface the right approved workaround for a later
  provider-troubleshooting ask
- a conceptual nearby API workaround ask can gain semantic fallback without
  displacing stronger exact matches
- duplicate confirming evidence does not create additional durable writes
- no action-taking or automation is introduced
- isolated proof and narrow production proof both exist
- canonical docs reflect the live boundary accurately

## Notes

This slice is now landed for its intended scope:

- nearby recurring-procedure asks remain the first live semantic fallback
  family
- approved environment-constraint guidance is now the second live semantic
  fallback family
- approved workflow tool gotchas for `vitest_wrapper_required` and
  `scripts_committer_required` are now the third live semantic fallback
  family
- approved API workaround memory is now live for:
  - `openai_embeddings_api_key_required`
  - `anthropic_context1m_eligible_credential_required`
- approved API workaround guidance is now the fourth live semantic fallback
  family for the supported lesson keys
- `git_stash_unsafe` still remains hybrid-first
- the next likely UX-focused slice is either semantic routing for
  `git_stash_unsafe` if the ask shapes stay low-noise, or a bounded
  project-memory expansion slice
