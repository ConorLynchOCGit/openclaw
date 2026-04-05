# Phrase Induction

## Purpose / user problem

The system should learn new natural phrasing for already-approved subjects
without requiring manual regex expansion for every variation.

## Why this belongs in the memory system

Phrase induction turns successful semantic detections into reviewed expansion of
the deterministic matcher set, improving future reliability for the same
bounded memory targets.

## Non-goals

- automatic open-ended regex generation
- creating brand-new memory classes
- changing runtime behavior without review

## Architecture fit

Phrase induction sits after:

- semantic detection
- bounded canonicalization

It should feed:

- a reviewed DB-backed approved pattern store
- later deterministic matcher loading

It must not bypass:

- canonical subject keys
- review
- provenance

## Domain model / concepts

Introduce a reviewed artifact such as `phrase_pattern_candidate` with:

- target family
- target subject key
- canonical template
- proposed phrase text
- evidence turn
- confidence
- evidence count
- review state

## Bounded scope for first implementation

Only allow phrase induction for:

- already-approved response-style subjects
- already-approved named project-fact fields

Do not allow phrase induction for entirely new semantic targets in v1.

## Exact input / output behavior

### Inputs

- a successful semantic detection
- canonical subject/template mapping
- source phrase text

### Outputs

- a reviewable phrase-pattern candidate
- or no candidate if the phrase is too close to an existing known pattern

## Candidate vs approved behavior

- phrase-pattern proposals start candidate-only
- phrase-pattern proposals must never jump straight into runtime behavior from a
  single observation
- phrase-pattern proposals should resolve through automated policy review rather
  than indefinite human backlog
- only approved phrase patterns become part of the deterministic matcher set

## Provenance / metadata requirements

Record:

- source turn text
- source canonical subject
- induction source:
  - semantic detector
  - operator/manual
- evidence count
- why the proposal was considered novel

## Retrieval / application behavior

Phrase induction does not directly affect retrieval.

Its effect is to increase future deterministic capture reliability.

Runtime loading should merge:

- code-owned built-in patterns
- reviewed DB-backed approved phrase patterns

Candidate resolution mode for this family:

- `auto_confirm` or `expire_or_reject`

That means:

- repeated semantically successful detections plus low-collision checks may
  approve a pattern automatically into the DB-backed reviewed store
- weak, redundant, or collision-prone proposals should be rejected or expired
- phrase-pattern candidates must not sit in a manual review queue by default

## Ambiguity / abstain / clarify rules

- if canonical subject mapping is weak, do not propose a phrase pattern
- if the phrase is too ambiguous outside its exact source context, reject it
- induction must prefer undergeneration to unsafe overgeneration

## User repair / supersede / forgetting implications

Phrase patterns should be removable or disableable independently of the memory
objects they helped capture.

## Observability / metrics / audit requirements

Track:

- proposals created
- proposals approved
- proposals rejected
- duplicate proposal rate
- future deterministic match lift for approved patterns

## Evaluation / proof requirements

- prove that approved induced phrases later match deterministically
- prove low collision with unrelated meanings
- prove weak proposals are rejected or expired rather than accumulating

## Rollout posture

- off-production first
- production only after approved pattern loading is reversible and observable

## Risks / failure modes

- overbroad patterns catch unrelated turns
- phrase induction becomes a hidden semantic detector
- too many low-quality proposals create review fatigue

## Open questions

- how much typo tolerance should the first automated promotion gate allow before
  match risk outweighs coverage gain?
