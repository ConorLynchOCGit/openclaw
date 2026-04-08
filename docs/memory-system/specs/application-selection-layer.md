# Application Selection Layer

## Purpose

Define and now record the landing of the real prompt-facing
application-selection / behavior-planning layer that sits between durable-memory
policy and prompt rendering.

This supersedes the old interpretation of behavior-profile as merely
“complete enough” prompt guidance.

## Landed status

This slice is now live for the current prompt-facing boundary.

The repo now has a structured durable-memory application-selection artifact
that includes:

- query intent
- selected items
- suppressed items
- rendering hints

Prompt rendering now consumes that artifact instead of carrying family posture
inline.

## Current landed model

```ts
type DurableMemoryApplicationSelection = {
  queryIntent: DurableMemoryApplicationQueryIntent;
  selectedItems: DurableMemorySelectedApplicationItem[];
  suppressedItems: DurableMemorySuppressedApplicationItem[];
  renderingHints: DurableMemoryGuidancePlan;
};
```

For the current landed boundary:

- `queryIntent` is tool-surface guidance intent for the durable-memory prompt
  layer
- `selectedItems` are the family guidance items allowed to render
- `suppressedItems` are the family guidance items intentionally omitted
- `renderingHints` drive downstream prompt rendering

## Family application modes still preserved

These modes remain valid:

- `shape_reply`
- `direct_answer`
- `guidance_only`
- `recommendation_only`
- `suggestion_first`

## What this slice changed structurally

- prompt rendering is now downstream of a structured selection result
- selected versus suppressed family guidance is explicit
- rendering hints now exist structurally rather than being re-derived inside
  the renderer
- family application posture is no longer mostly implicit in prompt prose

## What remains family-specific

- application mode
- direct-use restrictions for procedures
- stricter project-fact posture
- bounded response-style role
- recommendation-only unmet-need posture

## What this slice did not replace

This is not yet the final end-state described in the broader architecture docs.

Still ahead:

- retrieval-fed per-memory-item application selection
- stronger handoff after recurring-procedure staged redesign
- later proof / registry / boundary cleanup

## Proof status

This slice now proves:

1. at least three families with different application modes use one selection
   substrate
2. selection and suppression are represented structurally
3. prompt output still respects family posture after rendering becomes
   downstream-only
