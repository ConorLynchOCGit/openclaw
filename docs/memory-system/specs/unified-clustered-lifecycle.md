# Unified Clustered Lifecycle

## Purpose / problem

Several landed families now use similar lifecycle states:

- `hold_for_more_evidence`
- clustered duplicate handling
- stale rejection
- approval after bounded evidence
- supersede lineage

But the implementation still treats multiple families as if they need separate
lifecycle systems. That is accidental duplication.

## Why this is needed now

Future family expansion should not require a new lifecycle module every time a
family needs:

- a cluster key
- a subject key
- a hold threshold
- bounded stale handling

The lifecycle should be generic, with family policies deciding what the cluster
means.

## Current parallel systems this replaces or reduces

- `response-style-lifecycle.ts`
- `project-fact-lifecycle.ts`
- `recurring-procedure-lifecycle.ts`
- generic workflow lesson lifecycle assumptions embedded elsewhere
- proof inspection code that knows lifecycle details family by family

## Architecture fit

This lifecycle is for clusterable candidate families that ultimately produce:

- approved memory objects
- or validated procedures

It sits between ingestion resolution and promotion/retrieval.

It depends on:

- `/memory-system/specs/family-definition-registry`
- `/memory-system/specs/unified-correction-and-supersede`

## Domain model

### Shared lifecycle states

```ts
type ClusterLifecycleState = "hold_for_more_evidence" | "approved" | "rejected" | "superseded";
```

### Shared cluster identity

```ts
type ClusterIdentity = {
  familyId: string;
  scopeKey: string;
  subjectKey: string;
  clusterKey: string;
};
```

### Shared evaluation input

```ts
type EvaluateClusterInput = {
  familyId: string;
  canonicalPayload: Record<string, unknown>;
  evidenceEventId: string;
  createdAt: string;
};
```

### Policy hooks

Each family definition supplies:

- cluster key fields
- subject key fields
- approval threshold
- stale window
- compatibility rules
- contradiction rules

## Current-state pain points anchored to the repo

- response style, project facts, recurring procedures, workflow lessons,
  project rules, and unmet needs all now use some form of clustered evidence,
  but lifecycle policy is still spread across multiple modules
- the same concepts are reimplemented with slightly different helper names and
  state transitions
- proof inspection must know which lifecycle module to ask

## Proposed contracts and interfaces

### Lifecycle engine contract

```ts
type ClusterLifecyclePolicy = {
  familyId: string;
  clusterKeyFields: string[];
  subjectKeyFields: string[];
  approvalThreshold: number;
  staleWindowDays: number;
  compatible: (existing: Record<string, unknown>, incoming: Record<string, unknown>) => boolean;
  contradictory: (approved: Record<string, unknown>, incoming: Record<string, unknown>) => boolean;
};
```

```ts
type ClusterLifecycleDecision =
  | { outcome: "reuse_hold"; clusterId: string }
  | { outcome: "create_hold"; clusterId: string }
  | { outcome: "approve"; targetId: string }
  | { outcome: "reject"; reasonCode: string }
  | { outcome: "supersede"; priorTargetId: string; nextTargetId: string };
```

### Shared invariants

- no indefinite manual queue for these families
- held clusters must expire or resolve
- duplicate events do not count as fresh confirming evidence
- lineage remains explicit when supersede occurs

## What remains family policy instead of becoming generic

- approval thresholds may differ
- procedures can still end in validated procedure artifacts rather than memory
  objects
- unmet needs may use capability-granular subject keys to avoid accidental
  supersede

## Rollout posture

The first implementation slice should:

1. introduce the generic lifecycle engine
2. move one memory-object family and one procedure family onto it
3. keep old module names as wrappers until all families move

## Proof / evaluation requirements

Prove:

1. two families with different cluster keys still share the same engine
2. stale rejection remains bounded
3. supersede lineage remains explicit
4. active production posture does not regress

## Risks / failure modes

- a lowest-common-denominator lifecycle erases valid family differences
- subject/cluster identity becomes too coarse and merges unrelated memories
- procedure validation gets flattened into ordinary memory approval

## Out of scope

- new family rollout
- semantic routing changes
- advisory planning

## Follow-up implementation slices

1. generic cluster engine introduction
2. migrate memory-object families
3. migrate recurring procedures with explicit validated-procedure target
4. delete family-specific lifecycle duplication
