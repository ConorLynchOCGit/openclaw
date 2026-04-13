# Pass 2 Slice 20 — Model-Native Preference And Correction Capture

## Problem Statement

Preferences and corrections are the highest-frequency live capture path.
Pass 2 needs them to share the same semantic seam as the rest of the system,
not a separate reply-pattern personality.

## Goals

- keep ordinary-turn default runtime on model-native capture only
- let shared window collection power preference and correction capture
- keep reply-shape heuristics out of normal semantic ownership

## Non-Goals

- deleting every degraded-mode helper in this slice
- removing explicit degraded mode itself

## Architecture Boundary

- ordinary-turn semantic path uses the shared capture collector
- degraded-mode legacy fallback remains explicit and opt-in

## Proposed Data Contracts

- planned capture identity is used for plan keys in the semantic ordinary-turn
  path
- projection match data remains for compatibility-only downstream consumers

## Runtime Ownership

- model-native seam owns default preference and correction interpretation
- deterministic detectors are not part of the default path

## Migration Strategy

- replace ordinary-turn planner loop with shared collector
- keep the no-capture path as a real miss, not a reason to infer semantics

## Validation Strategy

- `pnpm test -- extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts`

## Risks / Open Questions

- the file still contains degraded-mode compatibility code that should shrink
  further during later cleanup

## Rewrite Targets

- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`

## Deletion Targets

- lane-local semantic key ownership in ordinary-turn default runtime
