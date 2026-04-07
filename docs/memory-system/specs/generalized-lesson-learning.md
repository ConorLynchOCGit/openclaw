# Generalized Lesson Learning

## Purpose / user problem

The memory program needs to stop scaling one lesson key at a time.

Users should be able to teach OpenClaw new durable lessons in casual language,
have those lessons normalized into reusable reviewed candidates, and later
retrieve approved lessons as guidance without adding new hand-written lesson
keys or routers for each one.

## Why this belongs in the memory system

This is the first architectural move from:

- a bounded flashcard cabinet

toward:

- a supervised learning system that can create, organize, approve, retrieve,
  and later broaden new flashcards on its own

without allowing silent execution.

## Non-goals

- autonomous remediation
- unrestricted candidate retrieval
- generic semantic retrieval over every lesson family
- procurement, install, vetting, or approval automation
- unrestricted freeform memory writes

## Current live posture

The generalized supervised-learning path is now live across two bounded
guidance families.

Live now:

- broader repo-local workflow guidance can be captured without a pre-registered
  lesson key
- casual phrasing can normalize into a reusable lesson shape
- broader lessons now enter `hold_for_more_evidence`
- duplicate restatements cluster onto one candidate
- two compatible evidence events can auto-promote an approved generic lesson
- stale held clusters can auto-reject
- stronger newer conflicting clusters can supersede older approved generic
  lessons on the same scoped subject
- approved generic workflow lessons now have reviewed phrase induction
- approved generic workflow lessons retrieve later through approved-only hybrid
- named-project operating rules can now use the same generic pipeline through
  the first bounded `generalized_project_rule` family
- approved generic project rules also retrieve later through approved-only
  hybrid
- named-project unmet needs can now use the same generic pipeline through the
  first bounded `generalized_unmet_need` family
- approved unmet-need artifacts also retrieve later through approved-only
  hybrid as recommendation-only results

Not live yet:

- self-improving capture into the same path
- advisory planning from approved learned guidance

## First landed slice

The first generalized slice adds a broader reviewed repo-local
workflow-guidance path for lessons such as:

- `for <scope>, use X instead of Y`
- `for <scope>, trust X; Y is only Z`
- `for <scope>, avoid Y`

This is broader than the old lesson-key path, but still:

- guidance-only
- bounded auto-review
- hybrid-first on retrieval

## Candidate shape

The generic workflow candidate shape records:

- `lessonFamily = generalized_workflow_lesson`
- `template = workflow_generalized_guidance`
- `guidancePattern`
  - `use_instead_of`
  - `trust_for_scope`
  - `avoid_only`
- normalized subject or scope
- recommended action when present
- avoided action when present
- optional rationale when present
- project-scoped lifecycle metadata

## Detection posture

Accept when:

- the statement has explicit repo-local scope such as `here`, `this repo`,
  `this host`, or `this environment`
- the statement expresses durable workflow guidance rather than a one-off
  complaint
- normalization can derive a stable subject plus at least one meaningful
  action or trust signal

Ignore when:

- the text is vague operational venting
- the subject is missing or too broad to normalize
- the content drifts into blocked procurement, install, vetting, or approval
  domains
- the content appears to contain likely secret material

## Review posture

Generic lessons are no longer indefinite `review_required` backlog entries.

In the landed auto-review posture they:

- broader lessons are allowed to enter the system
- first compatible evidence holds the normalized cluster
- later compatible evidence can auto-promote through the existing review and
  promotion substrate
- duplicate subject or action matches collapse onto the same pending candidate
  instead of creating backlog spray
- stale held clusters reject instead of lingering

The next scaling step is no longer auto-review, phrase induction, retrieval,
the first project-rule family, or the first unmet-need family. Those are now
live. The next step is reduced-profile self-improving capture integration on
the same pipeline.

## Retrieval / application posture

Approved generalized lessons stay on the normal approved-only hybrid retrieval
path.

They do not need per-lesson routing code.

Application stays guidance-only:

- the lesson may surface as remembered advice
- it must not directly trigger action-taking

Detailed retrieval/application posture is defined in:

- `/memory-system/specs/generalized-lesson-retrieval-and-application`

## Relationship to bounded lesson keys

The older bounded lesson-key slices are still valid and remain live.

They now serve as:

- proven low-risk special cases
- semantic-routing seeds for the narrowest high-value lessons
- high-precision fast paths for already-known subjects

They are no longer the primary long-term scaling strategy.

## The post-pivot pipeline

The intended scaling path is now:

1. generalized lesson candidate formation
2. generalized lesson auto-review and promotion
3. phrase induction for approved generic lessons
4. generalized lesson retrieval/application expansion
5. broader project-rule learning on the same pipeline
6. unmet-need planning on the same pipeline
7. reduced-profile self-improving capture as another candidate source
8. later advisory planning from approved learned lessons

This is one layered system, not several unrelated feature families.

## Proof requirements

The first generalized slice had to prove:

1. a new lesson can be captured without a hard-coded lesson key
2. casual phrasing normalizes into a reusable candidate shape
3. broader lesson capture stays review-first
4. duplicate restatements do not create backlog spray
5. vague workflow chatter can be explicitly proven as ignored
6. approved retrieval works through the generic hybrid path without
   hand-written routing

The next generalized slices should each prove one additional layer of the
pipeline rather than reverting to keyed expansion.

## Next follow-up sequence

The next implementation slices after the currently landed generalized slices
should be:

1. reduced-profile self-improving capture integration
2. later learned-guidance advisory planning

## Risks / failure modes

- teams keep treating keyed lessons as the real path and generic learning as an
  optional side branch
- generalized learning stops at auto-review and never improves future matching
- retrieval broadens too early and reintroduces noisy memory behavior
- self-improving capture is enabled before the native pipeline can absorb it

## Open questions

- should phrase induction propose only trigger phrases first, or also bounded
  subject aliases for approved generic lessons?
