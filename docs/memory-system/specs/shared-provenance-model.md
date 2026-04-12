# Shared Provenance Model

## Problem statement

The runtime already carried source-region data, but provenance meaning was not
shared enough across normalization, interpretation, validation, planner
reports, and benchmark artifacts. That made operator-visible proof and
cross-surface validation more fragile than it needed to be.

## Goals

- define one provenance model for the Pass 1 surfaces
- make source, heading context, and region anchors first-class
- let planner and benchmark outputs speak the same provenance vocabulary as the
  normalized blocks

## Non-goals

- completing provenance unification for every future context and prompt surface
  in this pass
- redesigning storage schema around provenance in Pass 1

## Architecture boundary

Normalization owns provenance construction.
Interpretation may point back to provenance regions.
Validation, benchmarks, and operator-facing reports should read shared
provenance semantics rather than flattening them into unrelated local fields
only.

## Proposed data contracts

- `MemoryProvenanceAnchor`
  - `segment`
  - `line_range`
  - `char_range`
  - `message`
- `MemoryProvenanceRegion`
  - `source`
  - `headingPath`
  - `anchors`
  - optional line, char, segment, and message fields
- `MemorySemanticProvenanceReference`

## Runtime ownership

- normalization builds `MemoryProvenanceRegion`
- semantic interpretation can emit provenance references grounded in that
  shared model
- benchmark summaries keep the shared provenance object instead of only local
  flattened line metadata

## Migration strategy

1. expand normalization provenance to include shared source and anchors
2. add provenance references to interpretation contract v2
3. update benchmark summaries to carry shared provenance directly
4. use later passes to extend the same model into retrieval and prompt
   reporting

## Validation strategy

- targeted normalization provenance tests
- targeted benchmark/report tests confirming heading paths and source regions
  stay available through the shared provenance object

## Risks and open questions

- later prompt and context surfaces may need additional provenance views for
  operator readability
- provenance fidelity must not be reduced by aggressive block dedupe

## Rewrite targets

- `extensions/memory-middleware/src/memory-source-normalization.ts`
- `extensions/memory-middleware/src/memory-semantic-interpretation.ts`
- `extensions/memory-middleware/src/memory-live-benchmark.ts`

## Deletion targets

- local provenance vocabularies on the touched Pass 1 planner and benchmark
  surfaces where the shared model can speak directly
