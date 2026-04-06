# Behavior Application

## Purpose / user problem

Users only feel memory value when remembered information consistently changes
later behavior. Capture alone is not enough.

## Why this belongs in the memory system

The memory system needs an explicit layer that turns approved memory into an
active behavior profile for the current turn.

## Non-goals

- replacing retrieval
- storing new durable memory
- broad autonomous action planning

## Architecture fit

This layer consumes:

- approved memory retrieval results
- explicit candidate retrieval only when a surface intentionally asks for it
- validated procedures when explicitly relevant
- a shared typed canonical subject registry owned inside `memory-middleware`

It should fit between retrieval and prompt/application surfaces such as
`extensions/memory-core/src/prompt-section.ts`.

It must not bypass:

- approved-only behavior rules
- retrieval scopes
- project scoping

The default working-context retrieval posture remains typed hybrid retrieval.

Family-aware semantic retrieval should be introduced only where it materially
improves conceptual recall without displacing stronger exact or typed matches.

That routing policy is specified in:

- `/memory-system/specs/semantic-retrieval-routing`

## Domain model / concepts

Introduce an `ActiveBehaviorProfile` concept with bounded categories:

- response style
- project facts
- applicable procedures
- operator/workflow hints where allowed

Each profile item should include:

- source memory id
- source kind
- scope
- precedence weight
- justification for inclusion

## Bounded scope for first implementation

First implementation should support:

- response-style precedence
- project-scope precedence over global adjacent memory
- bounded procedure suggestion/use under an explicit posture

## Exact input / output behavior

### Inputs

- current turn text
- retrieval results
- current project/session scope when available

### Outputs

- a compact active profile for the turn
- or no profile if nothing relevant is approved

The `ActiveBehaviorProfile` is ephemeral per turn.

It is not a new durable memory object type.

## Candidate vs approved behavior

- candidate memory must not shape behavior by default
- approved memory is the main input
- validated procedures may shape behavior only when explicitly allowed by the
  retrieval surface
- validated procedures must not silently become a background action layer

## Provenance / metadata requirements

Behavior application should preserve:

- which memory ids were applied
- which retrieved items were rejected as irrelevant
- why a higher-precedence memory won

Any persisted visibility should be limited to debug/observability metadata
rather than storing the active profile itself as canonical state.

## Retrieval / application behavior

This is the primary spec for later-turn memory use.

Retrieval posture for this layer:

- hybrid retrieval remains the normal default
- semantic retrieval is additive and family-scoped
- exact typed matches should usually outrank pure semantic similarity
- response-style and explicit named project facts remain hybrid-first
- nearby recurring-procedure asks are now the first live semantic fallback
  family
- approved environment-constraint guidance is now the second live semantic
  fallback family
- approved workflow-improvement tool gotchas for
  `vitest_wrapper_required` and `scripts_committer_required` are now the
  third live semantic fallback family
- `git_stash_unsafe` still remains hybrid-first
- conceptual workflow families remain the next semantic candidates

It should define precedence such as:

1. current project-scoped fact over global adjacent fact
2. explicit response-style memory over softer inferred style hints
3. specific procedure match over generic related procedure

The locked v1 procedure posture is:

- suggestion-first when a validated procedure looks relevant but the user has
  not clearly asked to use it
- direct-use only when the user is clearly asking for that named or strongly
  equivalent stored procedure
- omission over guessing when procedure relevance is uncertain
- no silent background application of stored procedures

This means behavior application may:

- surface the existence of a relevant stored procedure
- offer to use it
- return it directly on a clear ask

It must not:

- silently force a remembered checklist into a loosely related request
- treat validated procedures as always-on reply policy

## Ambiguity / abstain / clarify rules

- if precedence is unclear but behavior can safely omit memory, omit it
- if two memories genuinely conflict and the reply would materially change,
  prefer asking a clarifying question in later phases rather than silently
  guessing
- if a procedure appears relevant but the ask is not clearly procedural,
  prefer suggestion-first or omission rather than direct-use

## User repair / supersede / forgetting implications

Repair flows should target the applied profile, not just hidden DB rows.

Users need to be able to correct what the system is currently “using.”

The locked v1 repair posture is conversational-first:

- users repair memory by ordinary conversational turns
- behavior application must preserve enough targeting context that repairs like
  "no, not that one" or "forget that preference" can resolve safely
- this does not require a full inspection UI in v1

## Observability / metrics / audit requirements

Track:

- applied profile size
- which memories were applied
- conflict rate
- omission rate due to ambiguity
- memory application miss rate discovered during review

## Evaluation / proof requirements

- prove that later replies actually change due to approved memory
- prove precedence behavior in overlapping-memory cases
- prove irrelevant adjacent memories are not over-applied
- prove suggestion-first procedure handling separately from clear-ask direct-use

## Rollout posture

- off-production first
- production after response-style and project-fact precedence are validated

## Risks / failure modes

- too many memories applied at once
- prompt bloat
- hidden precedence rules users cannot predict
- inconsistent behavior across similar turns
- stored procedures become unexpectedly overactive and feel intrusive

## Open questions

- how much debug/inspection detail should be exposed by default without making
  memory behavior harder to understand?
