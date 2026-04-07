# Application Selection Layer

## Purpose

Define the real application-selection / behavior-planning layer that should sit
between retrieval and prompt rendering.

This supersedes the current interpretation of behavior-profile as “complete
enough.”

## Why this exists

The current behavior-profile layer is useful, but it is still mostly a
prompt-support helper.

The substrate still lacks one runtime control plane that answers:

- which retrieved memories were selected
- which were suppressed
- why they were selected or suppressed
- how each selected memory is allowed to apply

## Target model

```ts
type ApplicationSelection = {
  queryIntent: QueryIntent;
  selectedItems: SelectedMemoryItem[];
  suppressedItems: SuppressedMemoryItem[];
  renderingHints: RenderingHints;
};
```

Where:

- `queryIntent` comes from retrieval/routing control-plane normalization
- `selectedItems` are the memories allowed to shape the reply
- `suppressedItems` are the memories intentionally filtered out
- `renderingHints` are downstream prompt/rendering inputs, not the policy
  source of truth

## Selected item contract

Each selected item should include:

- family id
- storage surface
- memory id
- application mode
- reason codes
- whether direct use is allowed
- whether the item is corroborating or primary

## Suppressed item contract

Each suppressed item should include:

- family id
- memory id
- suppression reason code
- optional stronger winner reference

## Family application modes

These modes remain valid:

- `shape_reply`
- `direct_answer`
- `guidance_only`
- `recommendation_only`
- `suggestion_first`

## Structural meaning of each mode

### `shape_reply`

- shapes wording, formatting, and style
- does not become a factual answer by itself

### `direct_answer`

- can directly answer a scoped factual ask
- should win clearly over adjacent project guidance families when the query
  intent is factual

### `guidance_only`

- can provide reusable guidance
- should not silently become autonomous action

### `recommendation_only`

- can surface remembered gaps or missing capabilities
- should not become procurement, install, or approval action

### `suggestion_first`

- can surface a stored checklist or procedure as an option
- can become direct-use only on clear checklist/procedure asks

## Retrieval-to-application handoff

The retrieval/routing control plane should hand this layer:

- normalized query intent
- ranked records
- family policy
- any family-intent or semantic-routing evidence already computed

This layer should decide selected/suppressed outcomes.
Prompt rendering should not re-derive those decisions.

## Relationship to behavior-profile

The current behavior-profile layer should be reframed as:

- an early prompt-support bridge already landed

The target behavior/application architecture is:

1. retrieval/routing produces ranked candidates plus intent
2. application-selection layer decides selected/suppressed items
3. prompt rendering consumes that structured profile

## What remains family-specific

- application mode
- direct-use restrictions for procedures
- stricter project-fact posture
- bounded response-style role
- recommendation-only unmet-need posture

## Proof requirements

Prove:

1. at least three families with different application modes use the same
   selection substrate
2. direct named-project family suppression is represented structurally rather
   than only by SQL reshaping or prompt text
3. prompt output still respects family posture after rendering becomes
   downstream-only
