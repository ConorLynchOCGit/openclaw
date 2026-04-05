# Response-Style Profile

## Purpose / user problem

Users frequently need the assistant to remember how it should respond:

- concise or not
- plain English or not
- bullets or not
- tables or not
- numbered steps or not

This is the highest-frequency user-facing memory family and should feel
reliably remembered.

## Why this belongs in the memory system

Response-style memory is one of the clearest “I can feel it remembered me”
loops.

## Non-goals

- storing every transient formatting request
- inferring stable style from one-off situational formatting
- broad personality modeling

## Architecture fit

This feature uses:

- semantic event detection
- deterministic parser as a shortcut
- bounded correction capture
- approved `feedback` memory
- behavior application
- phrase induction

## Domain model / concepts

Bound initial subjects to:

- `responses_concise`
- `responses_bullet_points`
- `responses_plain_english`
- `responses_no_tables_unless_asked`
- `responses_numbered_steps_for_instructions`

## Bounded scope for first implementation

v1 should improve only these subjects and no broader style space.

## Exact input / output behavior

The system should accept many natural phrasings for these subjects and map them
to bounded canonical values.

Examples:

- request
- correction
- explicit stop/repair

## Candidate vs approved behavior

- low-risk response-style memory may continue to auto-promote where that is
  already justified
- broader or ambiguous cases should use the candidate-confirmation lifecycle
  rather than an indefinite review queue

Candidate resolution mode for this family:

- `auto_confirm` for bounded low-risk response-style subjects
- `prompt_now` only when a short clarification would materially avoid the wrong
  durable preference
- `expire_or_reject` for unresolved ambiguous style signals

## Provenance / metadata requirements

Record:

- subject key
- capture family
- whether the event was a correction or new requirement
- evidence text
- applied scope

## Retrieval / application behavior

Approved response-style memory should:

- influence later replies consistently
- use stable precedence
- not be crowded out by adjacent style memories

## Ambiguity / abstain / clarify rules

- distinguish enduring preference from one-off formatting request
- clarify when the user intent could be situational

## User repair / supersede / forgetting implications

Users must be able to:

- correct an existing style preference
- stop applying a style preference
- replace an outdated style preference

## Observability / metrics / audit requirements

Track:

- style subject capture volume
- correction volume
- overlap conflicts
- repair volume
- later-turn application success

## Evaluation / proof requirements

- messy-language coverage for each supported subject
- overlap retrieval tests
- later-session application proofs
- repair proofs

## Rollout posture

- off-production first
- bounded production acceptance by subject family

## Risks / failure modes

- one-off formatting gets overlearned as a durable preference
- multiple style memories fight each other
- style memory is retrieved but not consistently applied

## Open questions

- should style memory include stronger scope controls later, such as
  project-only or channel-only preferences?
