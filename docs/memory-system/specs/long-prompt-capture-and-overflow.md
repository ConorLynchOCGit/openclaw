# Long Prompt Capture And Overflow

## Purpose

Define how ordinary-turn auto-capture should handle prompts that contain many
explicit memory-worthy facts, preferences, and instructions without turning
normal chat into an unbounded write path.

## Accepted model

The current capture model now has 4 stages:

1. segment a long prompt into a larger bounded candidate-bearing pool
2. build a bounded cross-family candidate plan for that pool
3. rank candidates globally before immediate acceptance
4. persist overflow as deferred evidence when immediate budgets are exhausted

This replaces the weaker first-hit posture where only the earliest matching
segments meaningfully mattered.

## Postures

There are now 2 ordinary-turn capture postures:

- `default`
  - for ordinary conversation and shorter prompts
  - keeps tighter total and per-family immediate caps
- `bulk`
  - for prompts that clearly behave like multi-memory packets
  - allows a larger bounded candidate pool
  - allows a larger bounded immediate set
  - still uses deferred overflow for the remainder

Bulk posture is not a hidden unbounded mode. It is just a stronger bounded
capture posture.

## Immediate acceptance

Immediate acceptance remains bounded by:

- a posture-aware total cap
- per-family caps

This prevents one high-volume family from dominating a long prompt and crowding
out other valid candidates.

## Deferred overflow

When valid candidates exceed the immediate budget:

- the top bounded candidates go through the normal immediate path
- the remaining valid candidates persist as deferred overflow evidence

Deferred overflow metadata should preserve at least:

- stable key
- family
- lifecycle state
- first-seen / observed timestamps
- rank within the candidate pool
- candidate-pool size

The deferred path is intentionally bounded and review-safe.

## Starvation prevention

Naive top-N would starve lower-ranked valid candidates when a user repeats the
same strong top candidates in later prompts.

The accepted current behavior is:

- repeated prompts skip already-approved or already-active top candidates
- deferred overflow candidates remain addressable by stable key
- later repeated evidence can promote deferred overflow candidates instead of
  resubmitting the same strongest candidates forever

This is not yet a broad autonomous promotion engine. It is a confirmation-based
overflow follow-through model.

## Dedupe and collision posture

Higher capture volume is only acceptable with stronger dedupe behavior.

Current expectations:

- exact duplicates should still dedupe
- repeated already-approved candidates should not resubmit
- repeated deferred candidates should merge into the same stable-key path
- same-subject low-value restatements should not fork noisy new rows

## Schema posture

The current long-prompt capture expansion tranche did not require a schema
change.

Current accepted framing:

- existing metadata plus current candidate rows were sufficient for deferred
  overflow tracking
- any future schema change still requires a demonstrated blocker that cannot be
  solved cleanly with current metadata-first behavior
