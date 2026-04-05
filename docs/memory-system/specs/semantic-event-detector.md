# Semantic Event Detector

## Purpose / user problem

Users do not speak in neat deterministic trigger phrases. The current
phrase-first front end misses real intent when phrasing is messy, indirect, or
slightly malformed.

This spec defines a semantic first-pass detector that recognizes bounded memory
events without letting fuzzy interpretation directly become fuzzy storage.

## Why this belongs in the memory system

The memory system needs a front end that can notice durable learnings in normal
conversation while still preserving the existing bounded candidate/review/
promotion architecture.

## Non-goals

- generic “remember everything” behavior
- freeform semantic writes directly into durable memory
- broad sentiment analysis
- replacing deterministic parsing entirely
- bypassing candidate ingress or review

## Architecture fit

This feature fits as a new bounded interpretation layer ahead of the current
canonicalization and candidate-ingress seams.

It should use:

- ordinary-turn transcript context
- a shared typed canonical subject registry owned inside `memory-middleware`
- existing candidate ingress
- existing candidate kinds:
  - `learning`
  - `correction`
  - `procedure`
  - `improvement`

It must not bypass:

- `memory-middleware` plugin boundaries
- candidate ingress
- provenance metadata
- review/promotion controls

## Domain model / concepts

The detector emits a closed event union, for example:

- `user_correction`
- `durable_response_requirement`
- `recurring_procedure_signal`
- `workflow_improvement_signal`

Each detected event should include:

- `eventFamily`
- `targetDomain`
- `subjectKey` when available
- `normalizedValue` when available
- `confidence`
- `evidenceText`
- `contextWindowId` or equivalent provenance pointer

## Bounded scope for first implementation

First implementation should cover only:

1. user correction
2. durable response-style preference / requirement
3. recurring procedure
4. tool gotcha / workflow improvement

No other event families should be added in v1.

## Exact input / output behavior

### Inputs

- raw user turn text
- bounded recent transcript context
- optional tool/error context when present

### Outputs

One of:

- accepted canonical event candidate
- candidate-only downgraded event
- clarify-needed outcome
- ignore / abstain outcome

The detector itself must not write approved memory.

## Candidate vs approved behavior

- detector output should initially produce candidate artifacts only
- approval behavior remains owned by existing review/promotion flows
- low-risk auto-promotion can only happen after canonicalization maps into an
  already-approved low-risk class

## Provenance / metadata requirements

Every accepted or downgraded event should carry:

- detection source
- evidence snippet
- confidence
- transcript/session identifiers when available
- whether the event came from:
  - raw turn only
  - transcript context
  - transcript plus tool/error context

Detector outputs are not a new first-class durable artifact in v1.

They should be recorded only through:

- candidate metadata when a candidate is created
- logs/observability when no candidate is created

## Retrieval / application behavior

The detector does not itself retrieve or apply memory.

Its downstream impact is:

- improved candidate quality
- better coverage of natural phrasing
- cleaner inputs for later behavior application and retrieval ranking

## Ambiguity / abstain / clarify rules

This spec depends on `/memory-system/specs/ambiguity-and-clarification`.

Rules:

- if the detector cannot confidently map to a bounded supported subject, it
  must abstain
- if user intent is likely durable but underspecified, it should prefer
  `clarify`
- if intent is bounded but not safe for direct class mapping, it should prefer
  candidate-only downgrade

## User repair / supersede / forgetting implications

The detector must not make repair harder.

It must preserve enough provenance that later correction, supersede, or forget
flows can identify:

- what was detected
- why
- from which turn

## Observability / metrics / audit requirements

Track at minimum:

- detector invocation count
- accepted vs candidate-only vs clarify vs ignored outcomes
- event family distribution
- false-positive review feedback
- conflict rate between detector output and deterministic parser output

## Evaluation / proof requirements

Before live adoption:

- off-production proof for each supported event family
- messy-language eval corpus coverage
- false-positive review on tricky counterexamples
- proof that accepted detector outputs still map into bounded candidate shapes

## Rollout posture

- off-production first
- production acceptance only after:
  - ambiguity rules exist
  - messy-language eval exists
  - observability exists
  - rollback is trivial

## Risks / failure modes

- detector overreaches and creates noisy candidates
- detector duplicates deterministic parser work without adding value
- detector silently becomes the real canonicalizer
- detector silently becomes a second storage plane
- detector encourages premature broad automation

## Open questions

- how much tool/error context should be included in v1 without increasing
  brittleness?
