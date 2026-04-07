# Phrase Induction

## Purpose / user problem

The system should learn new natural phrasing for already-approved lessons
without requiring manual regex or lesson-key expansion for every variation.

## Why this belongs in the memory system

Phrase induction is the second flywheel after generalized lesson approval.

It turns successful reviewed learning into better future matching for the same
approved lesson family without inventing new lesson classes or bypassing
review.

## Non-goals

- automatic open-ended regex generation
- creating brand-new memory classes
- changing runtime behavior without review
- using phrase induction as a hidden second semantic detector

## Architecture fit

Phrase induction sits after:

- semantic detection
- bounded canonicalization
- generalized lesson auto-review

It should feed:

- a reviewed DB-backed approved pattern store
- later deterministic matcher loading
- better future matching for the same approved lesson clusters

It must not bypass:

- canonical subject keys or normalized generic lesson shapes
- review
- provenance

## Domain model / concepts

Introduce a reviewed artifact such as `phrase_pattern_candidate` with:

- target family
- target subject or normalized lesson cluster
- canonical template
- proposed phrase text
- evidence turn
- confidence
- evidence count
- review state

For approved generalized lessons, the candidate should also retain:

- `guidancePattern`
- normalized `recommendedAction` when present
- normalized `avoidAction` when present

## Bounded scope for the current implementation

The live phrase-induction rollout now allows induction for:

- already-approved generalized workflow lessons
- already-approved response-style memories where the phrase artifact can stay
  whole-phrase, bounded, reviewed, and deterministic

It does not yet allow induction for:

- already-approved named project-fact fields
- unapproved generic lessons
- brand-new lesson families
- unmet-need planning artifacts
- self-improving-origin proposals that have not already become approved lessons

## Exact input / output behavior

### Inputs

- a successful approved lesson retrieval or approved lesson promotion
- canonical subject or normalized lesson-cluster mapping
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
- source canonical subject or normalized generic lesson cluster
- induction source:
  - semantic detector
  - approved generic lesson retrieval
  - operator/manual
- evidence count
- why the proposal was considered novel

## Interaction with old hard-coded lesson keys

Old bounded lesson keys remain valid targets for phrase induction.

That means phrase induction now serves two layers:

- old keyed lessons as high-precision special cases
- newer approved generic lessons as the main scaling path

Phrase induction should not require new lesson keys for every approved generic
lesson. It should attach new phrases to the approved normalized lesson cluster.

## Live boundary

Phrase induction is now live for these approved families:

- generalized workflow lessons
- response-style memory

Live now:

- approved generalized workflow lessons can seed reviewed
  `workflow_phrase_pattern` candidates
- approved response-style memories can seed reviewed
  `response_style_phrase_pattern` candidates
- the first confirming phrase observation creates a held phrase-pattern
  candidate
- later compatible phrase evidence can auto-promote that phrase pattern
- approved phrase patterns feed deterministic matching back into the same
  target family
- approved phrase-pattern artifacts remain hidden from normal approved-only
  hybrid retrieval

Still not live:

- phrase induction for named project facts
- phrase induction for recurring procedures
- phrase induction for project rules
- phrase induction for unmet needs
- generic semantic fallback from phrase patterns

## Retrieval / application behavior

Phrase induction does not directly affect retrieval policy.

Its effect is to increase future deterministic or hybrid-first capture
reliability for already-approved lessons.

Runtime loading should merge:

- code-owned built-in patterns
- reviewed DB-backed approved phrase patterns

Phrase induction must not:

- silently broaden semantic retrieval
- bypass approved-only retrieval
- create a new direct behavior layer

## Candidate resolution mode

The default posture for phrase-pattern candidates is:

- `auto_confirm` or `expire_or_reject`

That means:

- repeated successful detections plus low-collision checks may approve a
  pattern automatically into the DB-backed reviewed store
- weak, redundant, or collision-prone proposals should be rejected or expired
- phrase-pattern candidates must not sit in a manual review queue by default

## Ambiguity / abstain / clarify rules

- if canonical subject or lesson-cluster mapping is weak, do not propose a
  phrase pattern
- if the phrase is too ambiguous outside its exact source context, reject it
- induction must prefer undergeneration to unsafe overgeneration

## User repair / supersede / forgetting implications

Phrase patterns should be removable or disableable independently of the memory
objects they helped capture.

Removing an induced pattern must not delete the approved lesson itself.

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
- prove approved generic workflow lessons can seed new phrase patterns without
  a new lesson key

## Rollout posture

- off-production first
- production only after approved pattern loading is reversible and observable
- start with families where the approved-memory target is already stable and
  the phrase artifact can stay bounded and deterministic

## Risks / failure modes

- overbroad patterns catch unrelated turns
- phrase induction becomes a hidden semantic detector
- too many low-quality proposals create review fatigue
- the system keeps inducing patterns for old keyed lessons but never improves
  the new generic path

## Open questions

- how much typo tolerance should the first automated promotion gate allow
  before match risk outweighs coverage gain?
