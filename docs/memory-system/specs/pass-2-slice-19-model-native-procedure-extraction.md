# Pass 2 Slice 19 — Model-Native Procedure Extraction

## Problem Statement

Procedures were already model-emitted, but runtime packaging still needed to
prove that reusable procedure structure survives lane differences without
falling back to list heuristics as semantic authority.

## Goals

- keep procedures as structured model outputs over source windows
- keep procedure packaging downstream of semantic interpretation
- ensure cross-lane replay can prove equivalent procedure meaning

## Non-Goals

- changing the procedure object schema in this slice
- changing validated-procedure storage policy

## Architecture Boundary

- procedure meaning lives in `MemorySemanticProcedureObject`
- packaging lives in materialization and candidate submission
- replay proof lives in benchmark and cross-lane replay harnesses

## Proposed Data Contracts

- procedure object:
  - `title`
  - `steps`
  - optional `procedureKey`

## Runtime Ownership

- model owns procedure structure
- materialization derives candidate packaging

## Migration Strategy

- keep procedure object schema
- validate parity by replaying equivalent procedure meaning across lanes

## Validation Strategy

- `pnpm test -- extensions/memory-middleware/src/memory-live-benchmark.test.ts`
- `pnpm test -- extensions/memory-middleware/src/memory-semantic-cross-lane-replay.test.ts`

## Risks / Open Questions

- further procedure promotion and validation convergence remains Pass 3 work

## Rewrite Targets

- replay harness and planner identity surfaces that touch procedures

## Deletion Targets

- lane-specific procedure identity assumptions
