# Current Slice

## Active slice

Project memory UX v2

## Objective

Land the next bounded project-memory expansion slice so users can teach and
retrieve project repository and deployment URLs with the same bounded
candidate-confirmation posture already used for the first named-project fact
fields.

This slice is about:

- preserving the already-landed response-style, project-memory,
  recurring-procedure, workflow-improvement, API workaround, and
  semantic-retrieval-routing families
- extending bounded named-project memory to the next explicit URL fields only
- keeping hybrid retrieval as the normal working-context path
- preserving explicit named-project scope, explainability, and duplicate
  suppression
- keeping project memory non-speculative and non-autonomous
- fixing project scoping so project-fact lifecycle inspection and duplicate
  checks stay project-local instead of leaking across projects
- proving the bounded URL field tranche in isolated proof and narrow
  production proof
- updating the canonical memory docs to reflect what is now live

## Required work

1. Land one bounded project-memory expansion tranche:
   - `repository_url`
   - `deployment_url`
2. Keep the locked posture concrete:
   - only explicit named-project facts and explicit corrections are supported
   - candidate confirmation remains the approval path
   - retrieval remains hybrid-first and field-aware
   - no speculative project inference
   - no action-taking or silent workflow changes
3. Preserve project locality:
   - ordinary-turn project-fact capture must pass `projectId`
   - project-fact lifecycle inspection must stay project-scoped
   - project-fact duplicate checks must stay project-scoped
4. Preserve the already-landed behavior of the other memory families.
5. Run isolated proof and narrow production proof.
6. Update:
   - `docs/memory-system/STATUS.md`
   - `docs/memory-system/memory-roadmap.md`
   - `docs/memory-system/feature-inventory.md`
   - `docs/memory-system/CURRENT_SLICE.md`
   - `docs/memory-system/specs/project-memory-expansion.md`
   - `docs/memory-system/PRODUCTION_PROJECT_MEMORY_UX_V2_REPORT.md`

## Out of scope

- broader project-memory narrative/state inference
- semantic retrieval for project facts
- semantic retrieval for `git_stash_unsafe`
- generic embedding-first or semantic-first working-context retrieval
- autonomous remediation or direct operational execution
- unmet-need planning
- phrase induction as live behavior
- self-improving capture enablement
- UI memory inspection surfaces
- production pairing/auth changes
- procurement, vetting, approval, or install automation

## Acceptance criteria

- supported explicit repository/deployment URL statements can enter pending
  confirmation
- later confirming evidence can auto-promote the bounded project fact without
  manual review
- approved-only retrieval can surface the right approved URL field for a later
  direct project question
- unsupported generic labels like plain `repo` or `deploy` stay ignored
- duplicate confirming evidence does not create additional durable writes
- the same project-fact key can exist independently in different projects
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
- bounded named-project memory now also includes:
  - `repository_url`
  - `deployment_url`
- transcript-subscriber project-fact capture now keeps lifecycle inspection,
  submission, and duplicate suppression project-scoped for supported fields
- unsupported generic deterministic labels like plain `repo` stay out of the
  bounded project-fact family
- `git_stash_unsafe` still remains hybrid-first
- the next likely bounded slice is either semantic routing for
  `git_stash_unsafe` if the ask shapes stay low-noise, or a broader bounded
  workflow-improvement/project-memory follow-on only if it stays equally
  explainable
