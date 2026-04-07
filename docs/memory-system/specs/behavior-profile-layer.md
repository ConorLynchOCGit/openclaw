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

## Why this spec is now explicitly partial

The current layer is not yet the final application-selection substrate.

It is still mostly:

- a prompt-support helper
- family guidance assembly
- registry-backed posture rendering

It is not yet:

- selected/suppressed memory planning
- retrieval-to-application handoff
- application reason-code attribution
- the runtime source of truth for what memory actually applied

## Current-state gap

The repo still lacks one structured runtime artifact that answers:

- what was selected
- what was suppressed
- why it was selected or suppressed
- how each selected family is allowed to apply

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

- structural selected/suppressed outputs
- explicit handoff from retrieval intent and ranked records
- suppression reason codes
- structural procedure direct-use gating

## Implementation rule

Do not treat the current behavior-profile helper as architectural completion.
Use it as the migration bridge toward the real application-selection layer.
