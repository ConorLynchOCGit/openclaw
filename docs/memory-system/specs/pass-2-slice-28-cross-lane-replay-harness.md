# Pass 2 Slice 28 — Cross-Lane Replay Harness

## Problem Statement

Pass 2 claims lane convergence. That claim is weak unless equivalent meaning
can be replayed through document and ordinary-turn normalization and produce
the same canonical object-native outcome.

## Goals

- add a cheap replay harness for lane parity
- compare object-native outcomes, not compatibility prose
- keep canonical classes explicit in parity reports

## Non-Goals

- replacing the gold-corpus benchmark
- replacing live proof

## Architecture Boundary

- cross-lane replay harness lives in
  `extensions/memory-middleware/src/memory-semantic-cross-lane-replay.ts`
- replay tests use stored fixture outputs, not heuristic proof claims

## Proposed Data Contracts

- replay outcome includes:
  - canonical class
  - internal kind
  - category
  - subject
  - statement
  - subject/cluster/dedupe identity
  - review mode

## Runtime Ownership

- replay harness owns parity comparison only
- planner, validator, and capture service remain the runtime seams under test

## Migration Strategy

- use shared capture collector and object identity
- compare lane outputs by object-native dedupe identity

## Validation Strategy

- `pnpm test -- extensions/memory-middleware/src/memory-semantic-cross-lane-replay.test.ts`
- `pnpm test -- extensions/memory-middleware/src/memory-live-benchmark.test.ts`

## Risks / Open Questions

- later Pass 3 replay should extend into retrieval and prompt-pack outputs

## Rewrite Targets

- replay harness and planner capture identity surfaces

## Deletion Targets

- parity claims that rely on fixture coincidence instead of object-native
  comparison
