# Unified Source Envelope Contract

## Problem statement

The system had normalized blocks, but not one shared top-level source
vocabulary. Document ingestion, turn capture, and adjacent context surfaces
still described their inputs differently enough to force local interpretation
shortcuts.

## Goals

- define one shared source envelope contract
- cover document blocks, transcript turns, tool results, summaries, workspace
  excerpts, and retrieved memory objects
- make source identity and source-local metadata explicit before semantics

## Non-goals

- forcing every later pass to consume every source kind immediately
- redesigning the entire context engine in Pass 1

## Architecture boundary

The source envelope is the shared input vocabulary. Lane-specific runtime code
may still choose which source variants it produces in this pass, but it should
not invent a second top-level source shape.

## Proposed data contracts

- `NormalizedMemorySourceKind`
  - `document`
  - `transcript`
  - `tool_result`
  - `summary`
  - `workspace_excerpt`
  - `retrieved_memory`
- `NormalizedMemorySource`
- `MemorySourceEnvelope`

Important fields:

- `sourceId`
- `path`
- `sessionKey`
- `projectId`
- `agentId`
- `sourceClass`
- `toolName`
- `retrievalKey`
- `summaryKind`
- `workspacePath`

## Runtime ownership

- normalization owns creation of source envelopes
- planner and interpreter consume source envelopes but do not redefine them
- future retrieval and context-planner work should map their inputs into this
  envelope instead of inventing parallel wrappers

## Migration strategy

1. make normalization return one shared envelope type
2. make planner and benchmark surfaces consume that same type
3. export the shared envelope from the runtime API
4. use later passes to expand envelope usage into retrieval and context lanes

## Validation strategy

- targeted source-envelope tests
- type checks proving document and transcript normalization now target the same
  top-level model

## Risks and open questions

- some source-specific metadata may need additional optional fields later
- later retrieval and prompt-engine slices may need narrower derived views on
  top of the shared envelope rather than adding more ad hoc envelope variants

## Rewrite targets

- `extensions/memory-middleware/src/memory-source-normalization.ts`
- planner and benchmark inputs that previously assumed lane-local source
  wrappers

## Deletion targets

- bespoke source wrapper assumptions where the shared envelope can speak the
  same meaning already
