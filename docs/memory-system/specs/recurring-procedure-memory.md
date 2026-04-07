# Recurring Procedure Memory

## Purpose / user problem

Users should be able to teach the system a reusable checklist or procedure once
and benefit from it later.

## Why this belongs in the memory system

Recurring procedures are one of the clearest durable-value loops:

- less repetition
- obvious retrieval benefit
- bounded operational usefulness

## Non-goals

- capturing vague one-off instructions
- autonomous execution of stored procedures
- broad skill extraction in v1

## Architecture fit

This feature should reuse the existing procedure pipeline:

- candidate
- reviewed candidate
- procedure draft
- validated procedure

It must not invent a second procedure substrate.

It should remain aligned with the locked v1 behavior posture:

- suggestion-first
- direct-use only on clear asks for the named or strongly relevant procedure
- no silent background application

## Domain model / concepts

Support strongly structured recurring procedures with:

- title / procedure key
- ordered steps
- applicability hints
- provenance from source candidate and validation

## Bounded scope for the currently landed family

Support recurring checklist-like procedures only.

Supported precision fast path:

- deploy checklist
- release checklist
- triage checklist
- investigation checklist

Parity expansion now also landed:

- explicit named generic recurring checklists such as:
  - evidence relay checklist
  - evidence archive checklist
  - release evidence handoff checklist

The landed generic lane is still bounded:

- the checklist must be explicitly named
- the steps must be structured
- vague one-off instructions still stay out of scope

## Exact input / output behavior

Inputs:

- explicit reusable instruction patterns
- structured step lists

Outputs:

- procedure candidate
- reviewed promotion to procedure draft
- validated procedure when the bounded validation path is used

## Candidate vs approved behavior

- procedure memory should stay review-first
- validated procedure remains the threshold for reliable later application
- unvalidated procedure candidates must not shape normal user-facing behavior

Candidate resolution modes for the currently live family:

- supported named checklist fast path:
  - `candidate_with_confirmation` or `expire_or_reject`
- bounded generic named recurring checklist path:
  - `hold_for_more_evidence` then `approve` / `reject` / `supersede`

That means:

- medium-confidence supported recurring checklist signals may land as bounded
  pending-confirmation candidates
- later confirming evidence may auto-promote through the existing candidate ->
  draft -> validated procedure path without manual review
- explicit named generic recurring checklists may land as bounded held
  clusters on first evidence
- later compatible evidence may auto-promote the same generic subject through
  the existing candidate -> draft -> validated procedure path without manual
  review
- contradictory evidence should block or supersede promotion
- if later evidence never strengthens the signal, the candidate should expire
  instead of sitting in background review

## Provenance / metadata requirements

Preserve:

- source candidate id
- review lineage
- validation run id
- procedure key/title normalization metadata
- procedure family metadata for the generic named-checklist lane
- normalized subject metadata for project-scoped retrieval and later repair

## Retrieval / application behavior

Later use should support:

- suggesting the stored procedure
- returning the stored procedure
- using it directly when the request clearly asks for that procedure

The locked v1 application posture is:

- suggestion-first when the procedure seems relevant but the ask is not clearly
  a request to follow that stored procedure
- direct-use only when the user is clearly asking for:
  - that named procedure
  - that recurring checklist
  - or a strongly equivalent request
- no silent background application of stored procedures

Examples that should allow direct use:

- "Give me my deploy checklist."
- "Use my release checklist."
- "What are the investigation steps we use for this?"

Examples that should prefer suggestion-first:

- "How should we deploy this?"
- "What do you recommend for release steps?"
- "Can you help me investigate this?"

In those suggestion-first cases, the system may:

- mention that a stored procedure exists
- offer to use it
- or present it as an option

It should not silently assume the stored procedure is the right answer.

The first live behavior expansion for this family now also allows retrieval on
nearby asks such as:

- "How should we deploy this safely?"
- "What do you recommend for release steps?"
- "Can you help me investigate this?"

as long as retrieval stays bounded to the supported checklist family and the
response remains suggestion-first unless the ask is clearly a direct request
for the stored checklist.

The parity tranche adds one more bounded retrieval posture:

- direct named generic recurring checklist asks can now retrieve the right
  validated procedure through approved-only hybrid subject/title boosts inside
  the same project scope

That means the family now has:

- nearby ask retrieval for the older supported named checklist fast path
- direct named retrieval for bounded generic named recurring checklists

## Ambiguity / abstain / clarify rules

- if it is unclear whether the instruction is reusable or one-off, abstain or
  clarify
- if the steps are incomplete, do not silently construct missing steps
- if retrieval finds a validated procedure but user intent is not clearly a
  request to use it, prefer suggestion-first over silent application

## User repair / supersede / forgetting implications

Users should later be able to:

- replace a stored checklist
- retire an outdated one
- correct individual steps

The currently landed parity slice now supports explicit generic correction and
supersede for bounded named generic recurring checklists on the same subject.

## Observability / metrics / audit requirements

Track:

- recurring-procedure candidate volume
- promotion rate
- validation rate
- later retrieval/use rate

## Evaluation / proof requirements

- prove at least one reusable checklist end-to-end
- prove one later relevant retrieval/use case
- prove one suggestion-first case where the stored procedure is surfaced but
  not silently applied
- prove one clear-ask case where direct-use is correct
- prove one medium-confidence candidate-confirmation case without manual review
- prove one generic held-cluster recurring checklist that later auto-promotes
  without manual review
- prove one generic recurring-procedure correction that supersedes an older
  validated procedure on the same subject
- prove ambiguous one-offs do not overcapture

## Rollout posture

- off-production first
- production acceptance only after behavior-application rules are explicit

## Risks / failure modes

- storing one-off instructions as durable procedures
- retrieving a stored procedure when a user wanted a fresh answer
- silently over-applying a stored procedure to nearby but different requests
- procedure drift over time

## Locked v1 decision

Validated procedures should be allowed into normal behavior application only
under a suggestion-first posture:

- suggest when relevant
- directly use only on clear asks
- never silently apply in the background

## Open questions

- how strict the first "clear ask" matcher should be before direct-use becomes
  too timid to feel useful
