# Pass 2 Slice 27 — Full Heuristic Semantic Retirement

## Problem Statement

The repo still contains detector-era modules, but Pass 2 only succeeds if the
normal runtime no longer depends on them for semantic meaning.

## Goals

- keep heuristic semantic code out of default runtime ownership
- keep degraded mode explicit and off by default
- make model-native misses stay misses in normal runtime

## Non-Goals

- deleting every historical detector module in one sprint
- changing degraded-mode behavior for operators who explicitly enable it

## Architecture Boundary

- default ordinary-turn runtime:
  - normalization
  - source windowing
  - model-native interpretation
  - governance / review / ignore
- degraded mode:
  - explicit env-gated fallback only

## Proposed Data Contracts

- no-capture is an acceptable semantic result in normal runtime
- object-native plan keys are used in the semantic path

## Runtime Ownership

- model-native seam owns normal runtime semantics
- deterministic helpers survive only as explicit degraded/compatibility code

## Migration Strategy

- preserve the explicit degraded-mode fence
- remove hidden dependence on deterministic semantic plan keys from the normal
  semantic path

## Validation Strategy

- `pnpm test -- extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts`

## Risks / Open Questions

- full source-file deletion of detector-era helpers remains future cleanup once
  degraded-mode policy is finalized

## Rewrite Targets

- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`

## Deletion Targets

- normal-runtime reliance on heuristic semantic keys or fallback logic
