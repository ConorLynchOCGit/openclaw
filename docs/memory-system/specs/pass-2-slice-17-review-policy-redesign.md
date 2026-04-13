# Pass 2 Slice 17 — Review-Policy Redesign

## Problem Statement

The validator had already stopped reconstructing semantics, but review posture
was still too shallow.

It effectively treated one narrow preference case as direct and everything else
as a generic follow-up state.

## Goals

- base review posture on canonical class, object kind, scope, and confidence
- keep review policy as governance, not semantics
- make high-confidence low-risk user preferences auto-direct only when that is
  actually justified

## Non-Goals

- introducing a large policy DSL in this slice
- changing promotion or approval flows outside touched runtime seams

## Architecture Boundary

- review posture lives in
  `extensions/memory-middleware/src/memory-semantic-validation.ts`
- semantic interpretation remains upstream in the model output

## Proposed Data Contracts

- validated object retains:
  - `confidence`
  - `reviewMode`
  - evidence including canonical class and object kind

## Runtime Ownership

- validator owns admissibility and governance posture
- validator does not decide object meaning

## Migration Strategy

- upgrade `resolveReviewMode(...)` to use object risk
- record canonical-class evidence for benchmark and audit surfaces

## Validation Strategy

- `pnpm check:types`
- `pnpm test -- extensions/memory-middleware/src/memory-live-benchmark.test.ts`
- `pnpm test -- extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts`

## Risks / Open Questions

- review posture is still intentionally simple compared with eventual Pass 3
  operational policy
- routing remains conservatively held

## Rewrite Targets

- `extensions/memory-middleware/src/memory-semantic-validation.ts`

## Deletion Targets

- one-size-fits-all review posture branching
