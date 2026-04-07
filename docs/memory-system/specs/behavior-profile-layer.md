# Behavior Profile Layer

## Purpose / problem

`extensions/memory-core/src/prompt-section.ts` currently carries too much
application policy. It is not only rendering prompt text; it is also deciding:

- which families to query
- what kind of result should win
- when adjacent results should be suppressed
- how guidance-only and suggestion-first behavior should be expressed

That makes prompt text a hidden application engine.

This spec defines an explicit behavior-profile layer that sits between
retrieval and prompt rendering.

## Why this is needed now

Before more families are added, the system needs one layer that says:

- what memories were selected
- why they were selected
- how they should be applied
- which ones were suppressed

Without that layer, each new family adds more prompt-only branching.

## Current parallel systems this replaces or reduces

- family-specific retrieval/application guidance in `prompt-section.ts`
- prompt-only suppression of adjacent project memories
- prompt text carrying application posture rules that belong in code

## Architecture fit

The behavior-profile layer consumes:

- approved retrieval results
- family definitions
- query intent

It produces:

- a structured application profile
- prompt-rendering inputs
- applied/suppressed memory attribution

It does not:

- perform retrieval itself
- mutate memory
- override family safety policy

## Domain model

### Shared application profile

```ts
type BehaviorProfile = {
  queryIntent: string;
  selectedItems: AppliedMemoryItem[];
  suppressedItems: SuppressedMemoryItem[];
  renderingHints: {
    includeProjectFacts: boolean;
    includeGuidance: boolean;
    includeProceduresAsSuggestions: boolean;
    includeResponseStyle: boolean;
  };
};

type AppliedMemoryItem = {
  familyId: string;
  memoryId: string;
  applicationMode:
    | "shape_reply"
    | "guidance_only"
    | "recommendation_only"
    | "suggestion_first"
    | "direct_answer";
  reasonCodes: string[];
};

type SuppressedMemoryItem = {
  familyId: string;
  memoryId: string;
  reasonCode:
    | "lower_rank_than_family_winner"
    | "adjacent_family_suppressed"
    | "weak_overlap"
    | "not_clear_checklist_ask";
};
```

## Current-state pain points anchored to the repo

- prompt rendering and selection policy are interleaved
- procedure posture is encoded in prompt instructions instead of a structured
  application mode
- direct named-project selection rules are partly in retrieval and partly in
  prompt text

## Proposed contracts and interfaces

### Profile builder

Create a profile builder that:

1. receives ranked retrieval results plus query intent
2. applies family application policy from the registry
3. chooses selected and suppressed items
4. emits a compact structured profile

### Prompt renderer

`prompt-section.ts` should render from the profile rather than re-deriving
family policy.

### Family application posture

The layer must preserve these modes:

- `shape_reply` for response style
- `direct_answer` for project facts
- `guidance_only` for workflow lessons and project rules
- `recommendation_only` for unmet needs
- `suggestion_first` for recurring procedures

## What remains family policy instead of becoming generic

- the application mode for each family
- direct-use restrictions for procedures
- stricter factual answer posture for project facts

## Rollout posture

First land the profile builder without changing user-visible behavior. Swap
`prompt-section.ts` to render from it, then delete duplicated policy logic.

Current live rollout:

- `src/plugin-sdk/memory-family-policy.ts` now exposes a public family-policy
  seam so `memory-core` can consume registry-derived application posture
  without reaching into `memory-middleware/src/**`
- `extensions/memory-core/src/behavior-profile.ts` now builds the shared
  durable-memory behavior profile
- `extensions/memory-core/src/prompt-section.ts` now renders the durable-memory
  section from that shared profile instead of carrying the family posture
  inline
- user-facing durable-memory guidance remained behaviorally stable in targeted
  prompt tests

## Proof / evaluation requirements

Prove:

1. prompt rendering still preserves guidance-only versus suggestion-first
   distinctions
2. selected and suppressed memory attribution is explicit
3. at least two families stop depending on prompt-only policy branches

## Risks / failure modes

- profile builder becomes another hidden policy layer without explicit evidence
- prompt rendering drifts from structured application modes
- family-specific safety posture gets flattened into one generic “memory
  applies” rule

## Out of scope

- UI memory browser
- semantic routing changes
- new family rollout

## Follow-up implementation slices

1. extend the behavior profile from prompt rendering into later runtime
   selection / suppression attribution when honest
2. keep retrieval/application policy aligned with the registry and retrieval
   framework
