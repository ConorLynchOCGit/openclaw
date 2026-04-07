# Generalized Lesson Learning

## Purpose / user problem

The memory program needs to stop scaling one lesson key at a time.

Users should be able to teach OpenClaw new repo-local workflow lessons in
casual language, have those lessons normalized into a reusable reviewed
candidate shape, and later retrieve the approved lesson as guidance without
hand-written per-lesson routing.

## Why this belongs in the memory system

This is the first step from a safe flashcard cabinet toward a supervised
learning system that can make and organize new flashcards on its own.

It turns broader repeated operational guidance into:

- reviewable candidate memory
- approved durable guidance
- later retrieval or prompt application

without allowing silent execution.

## Non-goals

- autonomous remediation
- unrestricted candidate retrieval
- generic semantic retrieval over every lesson family
- procurement, install, vetting, or approval automation
- unrestricted freeform memory writes

## First landed slice

The first generalized slice stays inside the workflow-improvement family.

It adds a broader reviewed repo-local workflow-guidance path for lessons such
as:

- `for <scope>, use X instead of Y`
- `for <scope>, trust X; Y is only Z`
- `for <scope>, avoid Y`

This is broader than the old lesson-key path, but still guidance-only and
review-first.

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

Generic lessons are `review_required`, not `pending_confirmation`.

That is the main noise-control lever for the broader path:

- broader lessons are allowed to enter the system
- they do not auto-promote from repeated phrasing alone in v1
- duplicate subject or action matches collapse onto the same pending candidate
  instead of creating backlog spray

## Dedupe / clustering / supersede

The first generalized slice clusters by:

- normalized subject key
- normalized recommended action
- normalized avoided action
- normalized rationale when present

This keeps:

- repeated restatements of the same lesson on one candidate
- nearby paraphrases reviewable as one lesson

Repair and supersede remain explicit review-driven actions in v1 rather than
automatic semantic mutation.

## Retrieval / application behavior

Approved generalized lessons stay on the normal approved-only hybrid retrieval
path.

They do not need per-lesson routing code.

The approved object content plus normalized metadata provide enough signal for:

- `fts_search_document`
- `trigram_similarity`

to rank later repo-operating asks usefully.

Application stays guidance-only:

- the lesson may surface as remembered advice
- it must not directly trigger action-taking

## Proof requirements

The first generalized slice must prove:

1. a new lesson can be captured without a hard-coded lesson key
2. casual phrasing is normalized into a reusable candidate shape
3. broader lesson capture stays review-first
4. duplicate restatements do not create backlog spray
5. vague workflow chatter can be explicitly proven as ignored
6. approved retrieval works through the generic hybrid path without
   hand-written routing

## Relationship to bounded lesson keys

The older bounded lesson-key slices are still valid and remain live.

They now serve as:

- proven low-risk special cases
- semantic-routing seeds for the narrowest high-value lessons
- scaffolding that made this broader reviewed path safe enough to ship

They are no longer the primary long-term scaling strategy.

## Next likely follow-up

The strongest follow-up after this slice is reviewed phrase induction for
approved generic lessons, so repeated successful captures can improve future
matching without adding more hard-coded keys.
