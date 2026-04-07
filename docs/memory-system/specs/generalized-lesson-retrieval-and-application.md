# Generalized Lesson Retrieval And Application

## Purpose / user problem

Once generalized lessons can become approved, the system needs one explicit
retrieval and application posture for them.

Without that, future slices will either:

- keep adding per-lesson routers again
- or broaden retrieval in uncontrolled ways

## Why this belongs in the memory system

This is the retrieval-side half of the generalized-learning pivot.

Generalized lesson learning is not complete when the system can only store a
new lesson. It is complete when an approved lesson can later influence behavior
as guidance without requiring a new hand-written retrieval branch for every
lesson.

## Current live posture

Live today:

- approved generalized workflow lessons retrieve through the existing
  approved-only hybrid path
- the prompt layer can already use those approved lessons as guidance
- no new family-specific semantic router was added

Not live today:

- a fully documented generic retrieval and application contract for approved
  generalized lessons
- cross-family generic lesson retrieval
- semantic fallback for generic lessons
- proactive or autonomous follow-through

## Non-goals

- making semantic search the default for all approved lessons
- candidate retrieval in normal user-facing behavior
- autonomous remediation
- silent plan mutation
- replacing stronger exact typed matches with generic conceptual matches

## Architecture fit

This spec sits between:

- approved generalized lesson memory objects
- `memory_object_search_hybrid`
- the prompt/application layer

It depends on:

- approved-only retrieval posture
- project scoping
- normalized lesson metadata

It must stay consistent with:

- `/memory-system/specs/behavior-application`
- `/memory-system/specs/semantic-retrieval-routing`
- `/memory-system/specs/generalized-lesson-learning`

## Domain model

### Approved generalized lesson

The first approved generic lesson object must remain readable as a bounded
guidance artifact, not a freeform note dump.

The object should expose enough structured or structured-like fields for later
retrieval:

- `lessonFamily`
- `template`
- `guidancePattern`
- normalized `subject`
- normalized `recommendedAction` when present
- normalized `avoidAction` when present
- normalized `rationale` when present
- project scope and review lineage

### Retrieval intent classes

The first retrieval/application contract should support later repo-operating
asks such as:

- "for this scope, what should I use"
- "for this scope, what should I avoid"
- "which source should I trust here"
- "what did we learn about this workflow area"

## Retrieval posture

### Default rule

Approved generic lessons are retrieved through `memory_object_search_hybrid`
first.

The default retrieval shape remains:

- `scope = approved_only`
- `kind = project`
- project-scoped filtering first

### Why hybrid-first remains correct

Approved generic lessons now carry enough normalized textual structure that
hybrid can use:

- `fts_search_document`
- `trigram_similarity`
- exact or near-exact token overlap on subject and action

That is enough for the first product loop.

The system should not add a semantic router for every new generalized lesson.

### Ranking rules

Within the eligible approved set:

1. explicit project-scoped exact field or lesson matches win
2. exact or near-exact subject overlaps win next
3. action overlaps and rationale overlaps support ranking
4. updated-at may break ties

Generic lessons must not outrank:

- exact named project facts
- exact stored procedures on clear procedural asks
- bounded old keyed workflow lessons when the user is clearly asking for that
  specific lesson

## Application posture

### Guidance-only rule

Approved generic lessons may shape replies only as remembered guidance.

They may:

- recommend a preferred action
- warn against an avoided action
- explain a trust preference for the current scope

They must not:

- trigger action-taking
- silently edit a plan
- silently run a tool
- silently apply a procedure

### Prompt shaping rule

The prompt layer should treat approved generic lessons as one more approved
guidance source inside the active per-turn behavior profile.

That means:

- include the lesson when it is relevant to the current repo-operating ask
- omit it when relevance is weak
- avoid dumping a large pile of generic lessons into every turn

### Relevance rules

Apply an approved generic lesson only when:

- the turn is repo-operating or environment-operating in shape
- the lesson subject materially overlaps the current ask
- the lesson project scope matches or is otherwise allowed
- no stronger exact typed memory already resolves the question

Omit when:

- the overlap is weak
- the lesson is adjacent but not clearly relevant
- two lessons conflict and the answer can safely omit them

Clarify only when:

- conflicting approved lessons would materially change the advice, and
- a short clarification is cheaper than guessing

## Repair and supersede behavior

Application must preserve enough provenance that later repair can target the
active lesson.

That means the system should retain:

- source memory id
- why it was applied
- why competing items lost

This does not require a full user-facing browser in v1, but it does require
debuggable attribution.

## Conflict handling

If two approved generic lessons conflict:

- prefer the more specific project-scoped lesson
- prefer the newer superseding lesson when explicit supersede lineage exists
- otherwise omit or clarify instead of guessing

## Semantic-retrieval boundary

Generic lessons remain hybrid-first in v1.

Do not add generic semantic fallback until all of the following are true:

- auto-review is stable
- approved generic lessons retrieve well enough through hybrid to measure real
  misses
- phrase induction already improved deterministic or hybrid coverage for the
  family
- a bounded family-specific miss pattern shows hybrid is no longer enough

Generic semantic retrieval is justified later only when it proves a real recall
gap, not because generic lessons feel conceptually "semantic."

## Proof requirements

The first implementation slice following this spec must prove:

1. an approved generic lesson is retrieved without per-lesson routing
2. the lesson changes later guidance in a relevant turn
3. an irrelevant adjacent lesson does not over-apply
4. conflicting or weak matches are omitted rather than silently guessed
5. no semantic fallback was required for the initial proof

## Rollout posture

- keep the first rollout inside generalized workflow lessons
- prove hybrid-first retrieval quality before considering semantic broadening
- do not broaden to project-rule generic lessons in the same retrieval slice

## Risks / failure modes

- prompt bloat from too many approved generic lessons
- weak subject overlap causing irrelevant guidance application
- later teams reintroduce hand-written routers instead of using the generic
  path
- semantic broadening happens before hybrid quality is honestly measured

## Open questions

- should the prompt layer summarize generic approved lessons into a compact
  per-turn format, or pass through a more literal representation first?
