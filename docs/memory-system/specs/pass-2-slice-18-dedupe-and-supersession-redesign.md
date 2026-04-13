# Pass 2 Slice 18 — Dedupe and Supersession Redesign

## Problem Statement

Dedupe could only be trusted if the winning identity came from the semantic
object itself. Transitional paths were still willing to inherit dedupe keys
from compatibility match builders.

## Goals

- make dedupe use object-native identity
- keep benchmark duplicate reporting object-native
- keep downstream overlap resolution anchored on canonical object identity

## Non-Goals

- full database supersession redesign in this slice
- changing every historical duplicate key in storage

## Architecture Boundary

- object dedupe identity lives in
  `extensions/memory-middleware/src/memory-semantic-object-identity.ts`
- benchmark and runtime collectors consume that identity

## Proposed Data Contracts

- dedupe key is emitted on every planned capture
- benchmark summaries store object-native dedupe and cluster keys

## Runtime Ownership

- identity helper owns stable overlap keys
- consumers may compare or cluster those keys
- compatibility shapes do not own overlap authority

## Migration Strategy

- thread object-native identity through planner captures
- use that identity in ordinary-turn plan keys and benchmark dedupe summaries

## Validation Strategy

- `pnpm check:types`
- `pnpm test -- extensions/memory-middleware/src/memory-live-benchmark.test.ts`
- `pnpm test -- extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts`

## Risks / Open Questions

- later Pass 3 work may further align storage-layer supersession with this
  identity

## Rewrite Targets

- `extensions/memory-middleware/src/memory-live-benchmark.ts`
- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`

## Deletion Targets

- dedupe keys whose primary authority is a compatibility match projection
