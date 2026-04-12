# Structural Normalization Cleanup

## Problem statement

The shared normalization substrate was still carrying semantic policy:

- block typing was inferring candidate family before model interpretation
- turn normalization was implicitly recovering semantic scope from nearby text
- document and transcript inputs were arriving at the semantic seam with
  different hidden meaning already attached

That made normalization richer than it should be and made later model-native
claims less honest than they looked.

## Goals

- make normalization structural-only
- keep headings, list shape, block boundaries, scope carriage, and provenance
- remove semantic class decisions from normalization-time helpers
- make both document and transcript lanes produce the same normalized block
  vocabulary before semantic interpretation

## Non-goals

- replacing the semantic interpreter in this slice
- redesigning DB submission or prompt assembly
- removing all structural shaping such as titled-list grouping

## Architecture boundary

Normalization may decide:

- source kind and source identity
- heading paths
- structural list shape
- block boundaries
- parent-context carriage
- explicit scope fields passed in by the caller
- provenance anchors and regions

Normalization may not decide:

- durable-memory class
- whether a block is a response preference, project fact, procedure, or
  routing memory
- whether parent text implies project meaning unless the caller already
  supplied that scope explicitly

## Proposed data contracts

- `NormalizedMemorySource`
- `MemorySourceEnvelope`
- `NormalizedMemoryBlock`
- `MemoryScopeEnvelope`
- `MemoryProvenanceRegion`
- `MemoryProvenanceAnchor`

## Runtime ownership

- `extensions/memory-middleware/src/memory-source-normalization.ts` owns
  structural shaping only
- planner and interpreter layers own semantic decisions
- callers that know explicit project or workflow scope must pass it in through
  the envelope instead of relying on normalization-time guesses

## Migration strategy

1. remove semantic block typing from normalization
2. preserve only structural titled-list and paragraph grouping
3. update callers and tests to pass explicit scope where they truly have it
4. move any remaining semantic comparison logic into non-runtime baseline or
   benchmark helpers

## Validation strategy

- targeted normalization tests for document and transcript inputs
- targeted type checks on the shared contracts
- regression coverage proving transcript parent context is carried but not
  semantically interpreted at normalization time

## Risks and open questions

- some earlier tests encoded semantic inference in normalization and must be
  rewritten rather than preserved
- structural titled-list grouping must stay generic enough to avoid becoming a
  hidden semantic detector again

## Rewrite targets

- `extensions/memory-middleware/src/memory-source-normalization.ts`
- direct callers that assumed semantic block types were emitted from
  normalization

## Deletion targets

- normalization-time semantic block typing from normal runtime
- semantic-ish scope guessing embedded in transcript shaping
