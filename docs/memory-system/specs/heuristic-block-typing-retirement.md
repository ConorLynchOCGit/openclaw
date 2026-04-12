# Heuristic Block Typing Retirement

## Problem statement

`typeNormalizedMemoryBlock(...)` had become a shadow semantic engine. Even when
the planner later called the model, normalization-time block typing was still
deciding which semantic path mattered and which blocks were ignored first.

## Goals

- remove heuristic block typing from normal runtime semantic planning
- keep only structural suppression where the substrate must avoid empty or
  meaningless blocks
- move semantic class ownership fully to the model interpretation seam

## Non-goals

- deleting every diagnostic or baseline heuristic helper in Pass 1
- finishing full runtime heuristic semantic retirement for all later passes

## Architecture boundary

Normal runtime:

- structural normalization
- shared planner
- model interpretation
- deterministic validation

Baseline or diagnostic surfaces may still compare against heuristic summaries,
but they must not drive the main runtime path.

## Proposed data contracts

- no semantic `MemoryBlockType` in the main planner path
- optional heuristic comparison summary fields only on baseline helpers

## Runtime ownership

- `memory-semantic-planner.ts` sends normalized blocks directly to the
  interpreter
- `memory-heuristic-block-typing.ts` is a baseline or diagnostic helper only
- comparison helpers may use the heuristic helper explicitly, but the runtime
  planner may not

## Migration strategy

1. remove planner dependence on normalization-time semantic block typing
2. move the old logic into an explicitly heuristic comparison helper
3. update tests to stop assuming semantic class is present before
   interpretation
4. use Pass 2 to retire more of the detector-era runtime once the model path is
   benchmarked strongly enough

## Validation strategy

- targeted planner tests proving the runtime no longer routes on semantic block
  type
- targeted comparison tests proving the heuristic helper is now baseline-only

## Risks and open questions

- comparison helpers can still be mistaken for primary proof if their naming or
  docs stay sloppy
- some runtime validators still map model outputs into legacy resolver shapes
  and must be revisited in Pass 2

## Rewrite targets

- `extensions/memory-middleware/src/memory-semantic-planner.ts`
- planner callers and tests that assumed semantic block typing

## Deletion targets

- `typeNormalizedMemoryBlock(...)` from normal runtime
- semantic pre-routing in the planner path
