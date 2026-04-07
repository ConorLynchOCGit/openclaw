# Workflow Improvement Memory

## Purpose / user problem

The system should be able to remember recurring operational lessons such as:

- a tool gotcha
- a repeated workaround
- a workflow simplification

without turning those lessons into autonomous execution.

## Why this belongs in the memory system

Operational lessons are durable knowledge, but they should remain safely
reviewed and separable from user-facing preference memory.

## Non-goals

- direct operational execution from remembered improvements
- autonomous remediation
- broad policy mutation

## Architecture fit

This feature should reuse the existing `improvement` candidate kind and the
existing bounded governance posture.

It must stay separate from:

- response-style preference memory
- project-fact memory
- proactive execution

The workflow-improvement family now has two layers:

1. older bounded keyed lessons as precision fast paths
2. generalized workflow lessons as the new scaling path

The keyed layer remains useful, but the generic layer is now the main future
growth path.

## Domain model / concepts

Initial bounded subfamilies:

- tool gotcha
- recurring workaround
- workflow simplification
- recurring environment constraint

Current broader reviewed subfamily:

- generalized repo-local workflow guidance

## Bounded scope for first implementation

Bound the first live slices to repeated repo-operating tool gotchas, repeated
workflow simplifications, and the first repeated environment constraints
only:

- use `pnpm test -- <path-or-filter>` instead of raw Vitest
- use `scripts/committer "<msg>" <file...>` instead of manual
  `git add` + `git commit`
- avoid `git stash` in this multi-agent repo
- use `pnpm check:fast` for docs-only or process-only work instead of
  replaying broader gates
- use `pnpm memory:proof` for bounded memory proof instead of bespoke
  host-side setup
- trust `/readyz` for readiness while treating `/healthz` as liveness only
- Python command unavailable on this host or environment
- gateway `POST /tools/invoke` forbidden in this environment

Bound the next live slice to the first repeated API workaround family only:

- OpenAI embeddings require a configured `OPENAI_API_KEY` or another
  embeddings provider; `openai-codex` OAuth profiles do not satisfy
  OpenClaw's embeddings path directly
- Anthropic `Extra usage is required for long context requests` means the
  credential is not eligible for `context1m`; use an eligible billed API key
  or keep a fallback model configured

The first generalized pivot slice now also lands a broader reviewed path for
repo-local workflow guidance without per-lesson key registration.

That broader path accepts explicit guidance patterns such as:

- `for <scope>, use X instead of Y`
- `for <scope>, trust X; Y is only Z`
- `for <scope>, avoid Y`

Generic workflow guidance remains:

- guidance-only
- held-first with clustered auto-review
- project-scoped
- duplicate-suppressed
- approved-only on later retrieval

Automatic application is not allowed beyond reviewed retrieval hints.

The next scaling step for this family is no longer "add more lesson keys."
It was:

- generalized lesson auto-review and promotion
- phrase induction for approved generic lessons
- broader project-rule or unmet-need families reusing the same pipeline

The workflow-improvement family now keeps:

- the older bounded keyed lessons
- the broader generalized workflow-guidance family

Broader project rules now live as a sibling generic family rather than being
folded back into workflow-improvement itself.

## Exact input / output behavior

Inputs:

- repeated tool failures
- explicit user/operator correction about a workflow
- repeated workaround statements

Outputs:

- improvement-note candidate with bounded subtype
- approved workflow lesson only after bounded confirmation for this narrow
  slice
- generic reviewed workflow-guidance candidate for the broader repo-local
  pivot slice

## Candidate vs approved behavior

- do not use a passive manual candidate queue for this family
- for the first bounded tool-gotcha, workflow-simplification, and
  environment-constraint slices:
  - first-seen supported lessons should enter `pending_confirmation`
  - later compatible evidence may auto-promote when the lesson remains
    low-risk and bounded
  - weak or stale lessons should still expire or be rejected rather than
    lingering
- approval standards should be stricter than for response-style memory

Normal resolution mode for this family:

- first bounded tool-gotcha, workflow-simplification, and environment
  slices:
  - `auto_confirm`
- broader workflow-improvement families:
  - `prompt_now` or `expire_or_reject`
- broader generalized repo-local workflow guidance:
  - `hold_for_more_evidence` on first compatible evidence
  - bounded clustered auto-review over normalized lesson clusters with
    `approve` / `hold_for_more_evidence` / `reject` / `supersede_existing`
    outcomes

## Provenance / metadata requirements

Record:

- improvement subtype
- implicated tool/system
- evidence turn(s)
- whether the lesson came from explicit user instruction or operational
  experience

## Retrieval / application behavior

Reviewed workflow improvements may later surface as:

- operator hints
- retrieved lessons in relevant contexts
- bounded guidance for later repo-operating asks

They should not trigger actions directly.

If a broader workflow-improvement signal reaches prompt-now threshold, the
system should surface a concrete decision such as:

- "I've seen this workaround come up repeatedly. Should I remember it as a
  workflow hint?"

If no prompt-worthy context appears, the evidence should age out rather than
becoming dead candidate clutter.

Implementation clarification from the generalized lesson-learning pivot slice:

- broader repo-local workflow guidance is now live without per-lesson key
  registration
- generic captures normalize into:
  - explicit subject or scope
  - guidance pattern
  - recommended action when present
  - avoided action when present
  - optional rationale
- generic workflow captures now use `hold_for_more_evidence` instead of
  indefinite manual review
- later compatible evidence can auto-promote the same normalized lesson
  cluster without manual review as the normal path
- stale held clusters reject cleanly, and stronger newer conflicting clusters
  can supersede older approved generic lessons on the same subject
- approved generalized workflow lessons later retrieve through the normal
  approved-only hybrid path rather than new per-lesson routing
- weak vague workflow complaints should still stay ignored instead of creating
  pending review backlog
- approved-generic phrase induction is now live, and retrieval/application is
  now also live for the broader workflow-guidance family, so the next scaling
  work happens in sibling generic families rather than re-expanding the
  lesson-key registry

## Ambiguity / abstain / clarify rules

- if the lesson is just a one-off failure with no durable implication, ignore
- if the improvement is too vague, ignore or candidate-only at most depending
  on the family and risk

Implementation clarification from the live environment-constraint slice:

- weak ambiguity / no-write proof for the bounded environment-constraint
  family is anchored to the transcript assist seam
- direct manual `memory_candidate_submit` still remains a broader explicit
  `improvement` ingress, so generic manual improvement notes are not the proof
  surface for ambiguity-ignore in this family

Implementation clarification from the live API workaround slice:

- the supported API workaround subjects now also use the same bounded
  candidate-confirmation lifecycle as tool gotchas and environment constraints
- approved-only hybrid retrieval is now live for later provider-troubleshooting
  asks about those supported workaround subjects
- approved API workaround guidance now also has family-scoped semantic fallback
  under approved-only project retrieval when hybrid does not already have a
  stronger typed lesson match
- direct manual `memory_candidate_submit` still remains a broader explicit
  `improvement` ingress, so vague manual API complaint notes can still create
  generic candidates and should be rejected immediately if used in proof-only
  cleanup

## User repair / supersede / forgetting implications

Operational lessons should be repairable when the environment changes.

## Observability / metrics / audit requirements

Track:

- improvement subtype volume
- approval rate
- later retrieval/use rate
- stale lesson rate

## Evaluation / proof requirements

- prove at least one bounded repeated operational lesson can be retrieved
  later after confirmation
- prove no direct execution path is created
- prove weak/noisy lessons expire or are rejected without backlog buildup

## Rollout posture

- off-production first
- production only after response-style and procedure behavior are stable
- broader workflow learning should now grow through the generic lesson
  pipeline, not primarily through manual lesson-key expansion

## Risks / failure modes

- noisy candidate buildup
- lessons become stale fast
- operational hints leak into unrelated user-facing behavior
- cross-project lesson bleed if lifecycle and duplicate checks are not project
  scoped

## Open questions

- should this family eventually have its own memory kind, or continue to live
  inside bounded improvement/candidate pathways?
