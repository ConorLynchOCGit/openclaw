# Behavior Profile Layer

## Purpose

Document the currently landed behavior-profile bridge and clarify what is still
missing before the repo can honestly say it has a real application-selection
layer.

## Current landed value

The current behavior-profile layer did improve the architecture:

- `prompt-section.ts` no longer carries all durable-memory family posture
  inline
- family posture is now less ad hoc and more registry-aligned
- prompt support is cleaner than before
- the behavior-profile bridge now feeds a structured prompt-facing
  application-selection artifact instead of only raw guidance assembly

## Why this spec is now explicitly partial

The current layer is not yet the final application-selection substrate.

It is still mostly:

- the bridge that feeds the prompt-facing application-selection layer
- family guidance assembly
- registry-backed posture rendering

It is not yet:

- the final retrieval-fed per-memory-item application substrate
- full retrieval-to-application handoff
- the last runtime source of truth for what memory actually applied

## Current-state gap

The repo no longer lacks a structured prompt-facing selection artifact.

The remaining gap is that the final runtime still does not yet answer those
same questions at the later retrieval-fed memory-item boundary.

## Relationship to the new target layer

This spec now describes the partially landed bridge.

The target runtime control plane is specified in:

- `/memory-system/specs/application-selection-layer`

That later layer should extend and partially supersede this one.

## What remains valid from the current layer

- family application modes remain valid
- durable-memory prompt guidance remains a downstream consumer
- prompt rendering should still stop carrying family posture inline

## What remains incomplete

- explicit handoff from retrieval intent and ranked records
- later per-memory-item selected/suppressed outputs
- structural procedure direct-use gating after the procedure redesign

## Implementation rule

Do not treat the current behavior-profile helper as architectural completion.
Use it as the migration bridge toward the real application-selection layer.
