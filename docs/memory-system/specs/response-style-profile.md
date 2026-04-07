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
- deterministic parser as a shortcut for the older supported templates
- bounded correction capture
- approved `feedback` memory
- behavior application

Phrase induction is not live for response-style memory in this slice.

## Domain model / concepts

Supported fast-path subjects remain bounded to:

- `responses_concise`
- `responses_bullet_points`
- `responses_plain_english`
- `responses_no_tables_unless_asked`
- `responses_numbered_steps_for_instructions`

This parity tranche also adds one bounded generic lane for explicit durable:

- `response opening`
- `response structure`
- `response tone`

Examples inside that lane:

- start with the direct answer first
- use short section headers in longer replies
- no emoji in responses

## Bounded scope for parity v1

The generic lane remains intentionally narrow:

- it only accepts explicit durable wording
- it ignores situational one-off phrasing
- it does not broaden into broader personality or writing-style modeling
- it does not enable generic semantic fallback for response-style memory

## Exact input / output behavior

The system should accept many natural phrasings for these subjects and map them
to bounded canonical values.

Examples:

- request
- correction
- explicit stop/repair

## Candidate vs approved behavior

- supported low-risk response-style memory may continue to auto-promote where
  that is already justified
- bounded generic response-style guidance now uses the same
  candidate-confirmation substrate as the newer generic families:
  - first evidence enters `hold_for_more_evidence`
  - later compatible evidence can auto-promote
- broader or ambiguous cases should use the candidate-confirmation lifecycle
  rather than an indefinite review queue

Candidate resolution mode for this family:

- `auto_confirm` for bounded low-risk response-style subjects
- `hold_for_more_evidence` for bounded generic response-style guidance
- `prompt_now` only when a short clarification would materially avoid the wrong
  durable preference
- `expire_or_reject` for unresolved ambiguous style signals

## Provenance / metadata requirements

Record:

- subject key
- normalized subject
- normalized value
- capture family
- whether the event was a correction or new requirement
- evidence text
- applied scope

## Retrieval / application behavior

Approved response-style memory should:

- influence later replies consistently
- use stable precedence
- not be crowded out by adjacent style memories
- use normalized subject/value overlap to rank the most relevant approved
  generic response-style memory when several approved style memories coexist

## Ambiguity / abstain / clarify rules

- distinguish enduring preference from one-off formatting request
- clarify when the user intent could be situational

## User repair / supersede / forgetting implications

Users must be able to:

- correct an existing style preference
- stop applying a style preference
- replace an outdated style preference

Current parity nuance:

- supported template corrections can still supersede directly
- the new transcript-driven generic lane remains conservative on first
  correction mention and may hold for later confirming evidence instead of
  immediately superseding

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
