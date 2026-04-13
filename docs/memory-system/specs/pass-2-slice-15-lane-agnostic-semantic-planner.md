# Pass 2 Slice 15 — Lane-Agnostic Semantic Planner

## Problem Statement

Pass 1 established source-window interpretation, but document ingestion,
ordinary-turn capture, and managed submission were still looping over windows
with their own local planner orchestration and ranking rules.

That preserved lane-local planning personalities even though the model contract
was shared.

## Goals

- make one planner loop serve all live capture sources
- keep lane code limited to source normalization and post-capture orchestration
- ensure planner output carries stable object-native identity

## Non-Goals

- changing the core model prompt in this slice
- changing long-term Pass 3 context and cache behavior

## Architecture Boundary

- shared planning lives in `extensions/memory-middleware/src/memory-semantic-planner.ts`
- shared multi-window collection lives in
  `extensions/memory-middleware/src/memory-semantic-capture-service.ts`
- lane entrypoints consume the shared collector instead of open-coding planner
  loops

## Proposed Data Contracts

- `PlannedMemorySemanticCapture` now includes `identity`
- `collectPlannedMemorySemanticCaptures(...)` returns:
  - per-window decisions
  - flattened captures
  - window indexes for lane-local provenance

## Runtime Ownership

- planner owns interpretation + governance + materialization for one window
- capture service owns multi-window orchestration and ranking helper reuse
- lanes own only source assembly and downstream submission/review behavior

## Migration Strategy

- keep `planNormalizedMemorySourceWindow(...)`
- route document ingestion, managed submission, and ordinary-turn semantic
  collection through the shared capture service

## Validation Strategy

- `pnpm check:types`
- `pnpm test -- extensions/memory-middleware/src/document-memory-ingestion-service.test.ts`
- `pnpm test -- extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts`
- `pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts`

## Risks / Open Questions

- ordinary-turn still has large compatibility/degraded-mode code outside the
  normal semantic path
- later Pass 3 service convergence may extract more orchestration out of lane
  files

## Rewrite Targets

- `extensions/memory-middleware/src/document-memory-ingestion-service.ts`
- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/tools/candidate-submit-managed-resolution.ts`

## Deletion Targets

- ad hoc per-lane planner loops over source windows
