# Unified Phrase-Pattern Engine

## Purpose / problem

Phrase induction already exists in two places:

- generalized workflow lessons
- response style

The product rule is correct: phrase induction should be reviewed, approved-only,
and limited to families where it safely improves deterministic matching.

The implementation rule is not yet correct: the repo should not keep one phrase
subsystem per eligible family.

## Why this is needed now

More families may eventually justify phrase-pattern support, but not all do. A
shared engine lets the repo:

- keep phrase induction policy narrow
- reuse the same proposal/review/promotion substrate
- avoid duplicating artifact management for each family

## Current parallel systems this replaces or reduces

- workflow-specific phrase induction logic
- response-style-specific phrase induction logic
- family-specific phrase proposal approval handling

## Architecture fit

The phrase-pattern engine is downstream of approved memory creation.

It does not:

- create new families
- approve new memory objects
- act as broad semantic fallback

It does:

- observe repeated accepted phrasing around already approved memories
- create reviewable phrase-pattern proposals
- promote approved phrase patterns into deterministic matching inputs

## Phrase-induction policy versus substrate

### Policy

Phrase induction is allowed only when:

- the family has stable canonical targets
- a reviewed phrase artifact improves deterministic matching
- the phrase does not create broad semantic reinterpretation

### Substrate

The engine manages:

- proposal creation
- novelty checks
- approval/rejection
- approved phrase-pattern retrieval for deterministic matching

## Domain model

### Shared phrase policy

```ts
type PhrasePatternPolicy = {
  familyId: string;
  mode: "unsupported" | "approved_pattern_reviewed";
  anchorFields: string[];
  proposalThreshold: number;
  maxPatternLength: number;
};
```

### Shared proposal artifact

```ts
type PhrasePatternProposal = {
  familyId: string;
  sourceApprovedId: string;
  normalizedPattern: string;
  anchorPayload: Record<string, unknown>;
  evidenceCount: number;
  status: "held" | "approved" | "rejected";
};
```

## Current-state pain points anchored to the repo

- phrase-pattern proposal logic is duplicated by family
- deterministic matching improvements are tied to specific family modules
- future phrase-eligible families would copy the same review/promotion logic

## Which current families are good fits now

Good fits now:

- workflow lessons
- response style

Why:

- both families already map to stable guidance targets
- repeated alternate phrasing can improve deterministic matching without
  changing the meaning of the durable memory

## Which current families are poor fits now

Poor fits now:

- project facts
- recurring procedures
- project rules
- unmet needs

Why:

- project facts are value-bearing and truth-sensitive; phrase artifacts can
  blur fact extraction versus fact value
- recurring procedures have checklist/procedure structure rather than stable
  phrase aliases
- project rules and unmet needs may eventually justify phrase support, but the
  current evidence model is less obviously safe than for workflow and response
  guidance

## Proposed contracts and interfaces

### Family phrase adapter

Each eligible family provides:

- anchor extraction from approved memory
- proposal derivation from repeated accepted phrasing
- collision rules
- deterministic remap builder

### Shared engine API

```ts
type PhrasePatternEngine = {
  maybeProposePattern(input: PhraseObservation): Promise<void>;
  reviewProposal(input: PhraseReviewInput): Promise<void>;
  getApprovedPatterns(familyId: string): Promise<ApprovedPattern[]>;
};
```

### Deterministic feed-through rule

Approved phrase patterns can only feed deterministic matching to the same
family and anchor target. They must not become cross-family semantic hints.

## What remains family policy instead of becoming generic

- family eligibility for phrase induction
- anchor fields
- proposal threshold
- collision rules

## Rollout posture

Keep phrase-induction policy bounded while moving the artifact handling into one
engine. Do not enable phrase induction for additional families in the same
slice unless a separate family-specific proof justifies it.

Current live rollout:

- `extensions/memory-middleware/src/phrase-pattern-engine.ts` now owns the
  shared reviewed phrase proposal, lifecycle inspection, approved lookup, and
  promotion flow
- `extensions/memory-middleware/src/workflow-phrase-induction.ts` now acts as a
  family adapter onto that shared engine
- `extensions/memory-middleware/src/response-style-phrase-induction.ts` now
  acts as a family adapter onto that shared engine
- project facts, recurring procedures, project rules, and unmet needs remain
  intentionally out of phrase induction for now

## Proof / evaluation requirements

The first shared engine slice must prove:

1. workflow and response-style phrase patterns use the same proposal/review
   substrate
2. approved patterns feed deterministic matching safely
3. non-eligible families remain untouched

## Risks / failure modes

- phrase patterns become hidden semantic fallback
- families with truth-sensitive values get unsafe aliasing
- approved patterns escape their family anchors

## Out of scope

- semantic retrieval expansion
- project-fact alias broadening
- automatic family eligibility for phrase induction

## Follow-up implementation slices

1. remove any remaining family-local phrase wrapper logic that no longer adds
   policy value
2. align proof inspection and later behavior-profile work with shared phrase
   artifacts
3. re-evaluate later families only after a separate safety case exists
