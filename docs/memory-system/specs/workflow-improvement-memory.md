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

## Domain model / concepts

Initial bounded subfamilies:

- tool gotcha
- recurring workaround
- workflow simplification
- recurring environment constraint

## Bounded scope for first implementation

Bound the first live slices to repeated repo-operating tool gotchas and the
first repeated environment constraints only:

- use `pnpm test -- <path-or-filter>` instead of raw Vitest
- use `scripts/committer "<msg>" <file...>` instead of manual
  `git add` + `git commit`
- avoid `git stash` in this multi-agent repo
- Python command unavailable on this host or environment
- gateway `POST /tools/invoke` forbidden in this environment

Candidate confirmation is allowed for this narrow slice.

Automatic application is not allowed beyond reviewed retrieval hints.

## Exact input / output behavior

Inputs:

- repeated tool failures
- explicit user/operator correction about a workflow
- repeated workaround statements

Outputs:

- improvement-note candidate with bounded subtype
- approved workflow lesson only after bounded confirmation for this narrow
  slice

## Candidate vs approved behavior

- do not use a passive manual candidate queue for this family
- for the first bounded tool-gotcha slice:
  - first-seen supported lessons should enter `pending_confirmation`
  - later compatible evidence may auto-promote when the lesson remains
    low-risk and bounded
  - weak or stale lessons should still expire or be rejected rather than
    lingering
- approval standards should be stricter than for response-style memory

Normal resolution mode for this family:

- first bounded tool-gotcha slice:
  - `auto_confirm`
- broader workflow-improvement families:
  - `prompt_now` or `expire_or_reject`

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

## Ambiguity / abstain / clarify rules

- if the lesson is just a one-off failure with no durable implication, ignore
- if the improvement is too vague, candidate-only at most

Implementation clarification from the live environment-constraint slice:

- weak ambiguity / no-write proof for the bounded environment-constraint
  family is anchored to the transcript assist seam
- direct manual `memory_candidate_submit` still remains a broader explicit
  `improvement` ingress, so generic manual improvement notes are not the proof
  surface for ambiguity-ignore in this family

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

## Risks / failure modes

- noisy candidate buildup
- lessons become stale fast
- operational hints leak into unrelated user-facing behavior
- cross-project lesson bleed if lifecycle and duplicate checks are not project
  scoped

## Open questions

- should this family eventually have its own memory kind, or continue to live
  inside bounded improvement/candidate pathways?
