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

## Bounded scope for first implementation

Support recurring checklist-like procedures only, for example:

- deploy checklist
- release checklist
- triage checklist
- investigation checklist

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

Candidate resolution mode for this family:

- `prompt_now` or `expire_or_reject`

That means:

- when the system sees a likely reusable procedure, it should ask while the
  context is fresh whether the user wants it remembered as a recurring checklist
- if the user confirms, the existing candidate -> draft -> validated procedure
  path may continue
- if the user does not confirm or later evidence never strengthens the signal,
  the candidate should expire instead of sitting in background review

## Provenance / metadata requirements

Preserve:

- source candidate id
- review lineage
- validation run id
- procedure key/title normalization metadata

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
- prove one "should I remember this checklist?" prompt-now case
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
