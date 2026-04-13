# Pass 2 Slice 22 — Capture-Service Convergence

## Problem Statement

Document ingestion, ordinary-turn, and managed submission were each still
assembling planner collections independently. That duplicated the same semantic
service boundary under different names.

## Goals

- converge capture entrypoints on one shared semantic capture collector
- keep lane-specific code limited to source assembly and post-capture actions
- make managed submission consume the same collector as the live runtime lanes

## Non-Goals

- merging every tool/service module in one slice
- changing Pass 3 storage and context services

## Architecture Boundary

- shared collector:
  `extensions/memory-middleware/src/memory-semantic-capture-service.ts`
- document, ordinary-turn, and managed submission call the collector

## Proposed Data Contracts

- collector returns window-indexed decisions and captures
- ranking helper is shared across managed submission callers

## Runtime Ownership

- capture service owns semantic collection over windows
- lane code owns source normalization and downstream orchestration

## Migration Strategy

- replace local planner loops with collector calls
- keep existing lane entrypoints stable for callers

## Validation Strategy

- `pnpm check:types`
- `pnpm test -- extensions/memory-middleware/src/document-memory-ingestion-service.test.ts`
- `pnpm test -- extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts`
- `pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts`

## Risks / Open Questions

- later extraction may still split more ordinary-turn orchestration into
  smaller modules

## Rewrite Targets

- `extensions/memory-middleware/src/memory-semantic-capture-service.ts`
- `extensions/memory-middleware/src/document-memory-ingestion-service.ts`
- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/tools/candidate-submit-managed-resolution.ts`

## Deletion Targets

- duplicated planner collection loops across live capture surfaces
