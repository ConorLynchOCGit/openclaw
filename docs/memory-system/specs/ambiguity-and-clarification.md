# Ambiguity And Clarification

## Purpose / user problem

Broader semantic detection increases recall but also increases the risk of
storing the wrong thing. The system needs a consistent ambiguity policy so
messy language does not produce blind durable writes.

## Why this belongs in the memory system

Without a formal ambiguity policy, every semantic-detection feature will make
its own ad hoc decisions about whether to accept, ignore, or guess.

## Non-goals

- open-ended conversational disambiguation for every vague turn
- turning normal conversation into a barrage of clarification questions
- replacing review

## Architecture fit

This spec governs the behavior of:

- semantic event detection
- canonicalization
- candidate creation
- later user repair flows

It does not introduce a new storage plane.

It depends on `/memory-system/specs/candidate-confirmation-lifecycle` for what
`candidate_only` means operationally after the decision is made.

## Domain model / concepts

Every candidate memory decision must end in one of four outcomes:

1. `accept`
2. `candidate_only`
3. `clarify`
4. `ignore`

## Bounded scope for first implementation

Apply this policy first to:

- user correction
- response-style requirement
- recurring procedure
- workflow improvement

## Exact input / output behavior

### Accept

Use when:

- the event family is supported
- the subject is recognized
- the value is bounded
- the evidence is strong enough for safe normalization

### Candidate-only

Use when:

- the signal is probably durable
- but the normalized class or value is not strong enough for immediate stronger
  action
- and the signal is good enough to watch for later confirming evidence

### Clarify

Use when:

- the user likely intends durable memory
- but the missing detail can be answered with a short clarifying question
- and asking now is materially better than waiting for later evidence

### Ignore

Use when:

- the signal is weak
- the intent appears one-off
- the turn is too ambiguous to normalize safely

## Candidate vs approved behavior

- ambiguity resolution never directly approves memory
- `clarify` produces no durable write
- `ignore` produces no durable write
- `candidate_only` enters the candidate-with-confirmation lifecycle instead of
  becoming a dead-end queue
- low-risk classes may promote later only if both lifecycle thresholds and
  class-specific policy allow it

## Provenance / metadata requirements

When the system chooses anything other than `ignore`, record:

- chosen ambiguity outcome
- why that outcome was chosen
- what detail was missing if `clarify`
- the confidence band

## Retrieval / application behavior

Ambiguous or clarify-needed events should not influence later reply behavior.

Only accepted or later-approved memory may shape behavior.

Unapproved candidates should not act as a soft behavior layer in v1.

## User repair / supersede / forgetting implications

Clarification and abstain behavior reduce the volume of bad memory that later
needs repair.

## Observability / metrics / audit requirements

Track:

- accept / candidate / clarify / ignore rates
- clarify-to-success rate
- false-positive rate after review
- most common ignored ambiguous patterns

## Evaluation / proof requirements

- include ambiguity-heavy examples in the messy-language eval corpus
- prove that false-positive traps usually abstain or clarify rather than write

## Rollout posture

- off-production first
- production only once clarify behavior is bounded and observable

## Locked v1 posture

The current pre-execution decision for v1 is:

- conservative durable writes
- candidate-with-confirmation for plausible middle-confidence signals
- sparse clarify
- ignore weak ambiguous signals

## Risks / failure modes

- too many clarify prompts degrade UX
- too few clarify prompts produce noisy memory
- different features implement incompatible ambiguity thresholds

## Open questions

- should `clarify` be allowed only once per subject per session to avoid
  repetitive friction?
