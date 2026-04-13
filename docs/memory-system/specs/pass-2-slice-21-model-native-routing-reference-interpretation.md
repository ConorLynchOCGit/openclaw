# Pass 2 Slice 21 — Model-Native Routing / Reference Interpretation

## Problem Statement

Routing/reference capture only works if routing remains a durable memory object
and generic references stay out. Pass 2 must keep that distinction model-owned
instead of compatibility-owned.

## Goals

- preserve routing as an explicit reference-class semantic object
- package routing candidates from object-native identity
- keep generic references excluded

## Non-Goals

- introducing a broad reference catch-all lane
- changing the routing object schema in this slice

## Architecture Boundary

- routing meaning lives in `MemorySemanticRoutingObject`
- routing candidate packaging derives from object-native identity and reference
  canonical class

## Proposed Data Contracts

- routing object:
  - `task`
  - `primaryResource`
  - optional `companionResources`

## Runtime Ownership

- model decides durable routing versus ignore
- materialization packages accepted routing objects

## Migration Strategy

- keep routing object schema
- make canonical routing candidate identity come from the semantic object

## Validation Strategy

- `pnpm test -- extensions/memory-middleware/src/document-memory-ingestion-service.test.ts`
- `pnpm test -- extensions/memory-middleware/src/memory-live-benchmark.test.ts`

## Risks / Open Questions

- later retrieval and prompt-pack behavior remains Pass 3 work

## Rewrite Targets

- `extensions/memory-middleware/src/memory-semantic-materialization.ts`

## Deletion Targets

- routing candidate identity derived from workflow-compatibility keys
