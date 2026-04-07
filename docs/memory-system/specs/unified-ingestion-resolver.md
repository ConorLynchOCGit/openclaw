# Unified Ingestion Resolver

## Purpose / problem

The system currently has two main ingress paths for memory candidate formation:

- transcript-driven capture in `ordinary-turn-auto-capture.ts`
- tool-side candidate submission and normalization in `candidate-submit.ts`

Both paths do overlapping work:

- detect family
- normalize fields
- choose review mode
- interpret correction intent
- attach provenance

That duplication is now one of the main causes of accidental parallel systems.

## Why this is needed now

The six landed families already proved that one capture substrate can support
multiple family shapes. The next scaling risk is not family invention; it is
having to re-implement family resolution twice for each new family.

Before major family expansion, ingress must become one resolver with two source
adapters.

## Current parallel systems this replaces or reduces

- ordered family parsing in `ordinary-turn-auto-capture.ts`
- managed family-specific resolution in `candidate-submit.ts`
- duplicated review-mode selection
- duplicated provenance and correction metadata assignment

## Architecture fit

The unified ingestion resolver consumes:

- raw source text or tool payload
- source type
- registry-provided family definitions

It emits:

- resolved family
- normalized candidate payload
- ambiguity outcome
- lifecycle instructions
- correction intent metadata

It does not:

- approve candidates
- rank retrieval
- apply memory in prompts

## Domain model

### Inputs

```ts
type IngestionSource = "transcript" | "tool_submit";

type ResolveIngestionInput = {
  source: IngestionSource;
  text?: string;
  structuredPayload?: Record<string, unknown>;
  projectScopeHint?: string | null;
  sessionId?: string | null;
  explicitFamilyHint?: string | null;
};
```

### Outputs

```ts
type IngestionResolution =
  | { outcome: "ignore"; reasonCode: string }
  | { outcome: "clarify"; reasonCode: string; clarificationHint: string }
  | {
      outcome: "candidate";
      familyId: string;
      captureClass: string;
      canonicalPayload: Record<string, unknown>;
      ambiguityState: "clear" | "narrowly_ambiguous";
      reviewMode: "auto_confirm" | "hold_cluster" | "manual_review";
      correctionIntent: "none" | "explicit_correction";
      provenance: {
        source: IngestionSource;
        sourceEventId?: string;
        explicitToolSubmit: boolean;
      };
    };
```

## Current-state pain points anchored to the repo

- transcript capture currently resolves response style, project facts,
  recurring procedures, workflow lessons, project rules, and unmet needs in a
  fixed branch order
- tool-side submission still contains family-specific normalization branches
  instead of reusing transcript resolution rules
- phrase-pattern lookup can happen in one path but not the other unless both
  paths are updated manually

## Proposed contracts and interfaces

### Family adapter contract

Each family registers an adapter with:

- eligibility predicate
- parser/normalizer
- ambiguity policy mapping
- correction-intent detector
- review-mode hint

```ts
type FamilyIngestionAdapter = {
  familyId: string;
  supportsSource: (source: IngestionSource) => boolean;
  tryResolve: (
    input: ResolveIngestionInput,
    context: IngestionContext,
  ) => Promise<FamilyResolutionResult | null>;
};
```

### Resolver flow

1. gather eligible family adapters from the family-definition registry
2. evaluate deterministic typed/phrase fast paths first
3. evaluate bounded generic family adapters second
4. produce one winning family resolution or an ignore/clarify outcome
5. attach canonical provenance and downstream lifecycle hints

### Priority rules

- explicit typed matches win over generic family matches
- approved reviewed phrase patterns are deterministic inputs, not semantic
  fallback
- tool-submitted explicit family hints can narrow the adapter set, but cannot
  bypass family validation

## What remains family policy instead of becoming generic

- exact parsing rules and canonical field extraction remain family adapters
- some families may support transcript capture but not explicit tool submission
  hints
- procedure families may still require clearer checklist framing than guidance
  families

## Rollout posture

Land the unified resolver as a new shared layer. Initially keep the old family
functions behind adapter wrappers so behavior stays stable while call sites are
swapped over.

## Proof / evaluation requirements

Implementation must prove:

1. transcript and tool-submitted capture for at least two families use the same
   canonical payload builder
2. explicit typed fast paths still win
3. existing ignored/clarify outcomes are preserved for known false positives

## Risks / failure modes

- one resolver becomes a giant hidden branch system
- explicit tool submissions start bypassing family validation
- phrase patterns are mistaken for semantic fallback

## Out of scope

- semantic routing broadening
- retrieval ranking changes
- new family rollout

## Follow-up implementation slices

1. add resolver skeleton and adapter interface
2. migrate transcript capture
3. migrate candidate-submit normalization
4. delete duplicated family resolution code
