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

The detailed posture for approved generic lessons is specified in:

- `/memory-system/specs/generalized-lesson-retrieval-and-application`

## Domain model / concepts

Introduce an `ActiveBehaviorProfile` concept with bounded categories:

- response style
- project facts
- applicable procedures
- operator/workflow hints where allowed
- approved generic guidance where allowed

Each profile item should include:

- source memory id
- source kind
- scope
- precedence weight
- justification for inclusion

## Current live posture

Live today:

- approved response-style memories shape replies in their bounded family
- approved project facts can answer direct project questions
- validated recurring procedures can shape suggestion-first or direct-use
  behavior in their bounded family
- approved workflow-guidance memories can surface as repo-operating guidance
- approved generalized workflow lessons can also surface through the same
  guidance path
- approved generalized project rules can surface through the same
  guidance-only path for direct named-project operating asks
- approved generalized unmet-need artifacts can surface through the same
  approved-only path as recommendation-only missing-capability reminders for
  direct named-project asks
- direct named-project project-fact, project-rule, and unmet-need asks now
  use one shared family-aligned project-selection posture instead of freely
  blending adjacent approved project memories from other families

Not live today:

- a full explicit active-profile layer across all families
- learned-guidance advisory planning

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
- generalized lessons must be approved before they shape normal behavior

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
- nearby recurring-procedure asks are the first live semantic fallback family
- approved environment-constraint guidance is the second live semantic fallback
  family
- approved workflow-improvement tool gotchas for
  `vitest_wrapper_required`, `scripts_committer_required`, and
  `git_stash_unsafe` are the third live semantic fallback family
- approved API workaround guidance for
  `openai_embeddings_api_key_required` and
  `anthropic_context1m_eligible_credential_required` are the fourth live
  semantic fallback family
- approved generalized workflow lessons remain hybrid-first
- approved generalized project rules remain hybrid-first
- approved generalized unmet-need artifacts remain hybrid-first
- broader approved generic lessons should remain hybrid-first until
  `/memory-system/specs/generalized-lesson-retrieval-and-application`
  explicitly proves a broader need

It should define precedence such as:

1. current project-scoped fact over global adjacent fact
2. explicit response-style memory over softer inferred style hints
3. specific procedure match over generic related procedure
4. exact named workflow lesson over adjacent generic workflow guidance for the
   same question
5. explicit superseding approved lesson over older conflicting approved lesson
6. for direct named-project asks, the top family-aligned project result over
   adjacent project memories from other families unless they directly
   corroborate the same answer

The locked v1 procedure posture is:

- suggestion-first when a validated procedure looks relevant but the user has
  not clearly asked to use it
- direct-use only when the user is clearly asking for that named or strongly
  equivalent stored procedure
- omission over guessing when procedure relevance is uncertain
- no silent background application of stored procedures

For approved generalized workflow guidance, the locked v1 posture is:

- guidance-only
- project-scoped
- omit on weak overlap
- do not trigger action-taking

For approved generalized unmet-need artifacts, the locked v1 posture is:

- recommendation-only
- project-scoped
- surface as "still missing" or "still needed" guidance only when the current
  ask is explicitly about missing capability or next support
- do not trigger procurement, install, approval, or autonomous remediation

For direct named-project cross-family selection, the locked v1 posture is:

- fact-like asks such as "where is", "what is the", "which branch", "url",
  "dashboard", "report", and "runbook" should prefer the top fact-like
  approved project result
- operating-rule asks such as "what should I use", "what should I trust",
  "what should I avoid", or "instead of" should prefer the top approved
  project-rule result
- unmet-need asks such as "what do we still need", "what are we missing", or
  "are we still missing" should prefer the top approved unmet-need result
- adjacent project memories from other families should be omitted unless they
  directly corroborate the same answer

## Ambiguity / abstain / clarify rules

- if precedence is unclear but behavior can safely omit memory, omit it
- if two memories genuinely conflict and the reply would materially change,
  prefer asking a clarifying question in later phases rather than silently
  guessing
- if a procedure appears relevant but the ask is not clearly procedural,
  prefer suggestion-first or omission rather than direct-use
- if a generalized workflow lesson is only weakly adjacent, omit it rather than
  surfacing speculative advice

## User repair / supersede / forgetting implications

Repair flows should target the applied profile, not just hidden DB rows.

Users need to be able to correct what the system is currently using.

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
- prove approved generalized lessons stay guidance-only

## Rollout posture

- off-production first
- production after response-style and project-fact precedence are validated
- later generic application broadening should follow the dedicated generalized
  retrieval/application spec rather than ad hoc prompt edits

## Risks / failure modes

- too many memories applied at once
- prompt bloat
- hidden precedence rules users cannot predict
- inconsistent behavior across similar turns
- stored procedures become unexpectedly overactive and feel intrusive
- generic approved lessons become a second hidden policy layer

## Open questions

- how much debug or inspection detail should be exposed by default without
  making memory behavior harder to understand?
