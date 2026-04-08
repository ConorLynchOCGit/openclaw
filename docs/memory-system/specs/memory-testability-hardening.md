# Memory Testability Hardening

## Purpose

Reduce the amount of architecture proof that currently requires full
integration tests by strengthening unit seams around the main control planes.

## Why this exists

The current substrate still forces too much end-to-end validation because key
policy is spread across:

- retrieval intent
- application selection
- semantic fallback
- SQL shaping
- prompt rendering

That will become more painful once self-improving capture increases candidate
pressure.

## Priority unit seams

### Retrieval intent

Add a unit seam that proves:

- direct fact intent
- direct project-rule intent
- unmet-need intent
- procedure intent
- generic fallback intent

### Application selection

Add a unit seam that proves:

- selected versus suppressed items
- family winner selection
- adjacent-family suppression
- `suggestion_first` versus `direct_answer` versus `shape_reply`

### Semantic fallback

Add a unit seam that proves:

- semantic eligibility
- hybrid-strong-enough suppression of semantic fallback
- family-gated fallback behavior

## Where integration tests remain necessary

- full retrieval SQL behavior
- lifecycle and supersede lineage persistence
- cross-surface proofing
- any slice that changes both runtime policy and storage behavior

## Goal

The goal is not “no integration tests.”

The goal is:

- fewer integration tests needed to understand policy changes
- smaller proof surfaces for control-plane refactors
- lower regression risk when later self-improving capture lands

## Landed in support batch v1

The first bounded tranche is now live:

- retrieval intent moved into a dedicated helper seam
- current durable-memory guidance grouping is explicit and unit-testable
- semantic fallback eligibility now has pure decision helpers

This reduced integration-only proof pressure, but it did not replace the future
application-selection or retrieval/routing control planes.

## Future test matrix expectation

Each major substrate slice should target:

- unit tests for the new control-plane decision logic
- focused integration tests for storage/runtime coupling
- fewer “everything only proves out end to end” cases than today
