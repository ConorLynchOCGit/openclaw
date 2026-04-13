# Pass 2 Slice 16 — Canonical Memory-Object Unification

## Problem Statement

The model already emitted object-native semantics, but candidate identity and
submission packaging were still leaning on compatibility match keys.

That made canonical objects look shared while the real identity rules still
lived in lane-specific compatibility shapes.

## Goals

- make object-native identity the canonical truth for dedupe and clustering
- keep the four canonical memory classes explicit:
  - user
  - feedback
  - project
  - reference
- keep compatibility match data as output packaging only

## Non-Goals

- deleting every compatibility metadata field in one slice
- changing the canonical four-class contract

## Architecture Boundary

- object identity lives in
  `extensions/memory-middleware/src/memory-semantic-object-identity.ts`
- planner captures surface that identity directly
- canonical candidates derive from semantic objects and identity, not from
  back-projected match keys

## Proposed Data Contracts

- canonical candidate identity:
  - `subjectKey`
  - `clusterKey`
  - `dedupeKey`
- planner capture:
  - validated object
  - materialized projection
  - object-native identity

## Runtime Ownership

- model object owns meaning
- object-identity helper owns dedupe/cluster/subject identity
- materialization owns packaging only

## Migration Strategy

- reuse existing object identity helper everywhere planner captures are
  consumed
- update candidate construction so canonical candidate identity comes from the
  object identity helper

## Validation Strategy

- `pnpm check:types`
- `pnpm test -- extensions/memory-middleware/src/memory-live-benchmark.test.ts`
- `pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts`

## Risks / Open Questions

- some downstream consumers still read compatibility metadata for display or
  legacy retrieval hints
- those consumers must not treat compatibility metadata as semantic authority

## Rewrite Targets

- `extensions/memory-middleware/src/memory-semantic-planner.ts`
- `extensions/memory-middleware/src/memory-semantic-materialization.ts`
- `extensions/memory-middleware/src/memory-live-benchmark.ts`

## Deletion Targets

- candidate identity derived primarily from legacy match keys
