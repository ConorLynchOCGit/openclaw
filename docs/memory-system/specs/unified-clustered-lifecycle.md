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

## Current implementation status

Batch v1 is now live in `extensions/memory-middleware/src/clustered-memory-lifecycle.ts`.

The shared memory-object inspection engine is currently adopted by:

- `extensions/memory-middleware/src/response-style-lifecycle.ts`
- `extensions/memory-middleware/src/project-fact-lifecycle.ts`
- `extensions/memory-middleware/src/workflow-improvement-lifecycle.ts`

Recurring procedures still keep a separate validated-procedure inspection path,
but now reuse shared lifecycle utility helpers for pending-state and expiry
logic.

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

The first lifecycle slice is now landed for memory-object inspection.

Current posture:

1. one shared inspection engine serves multiple memory-object families
2. old module names remain as wrappers so callers did not need to change
3. recurring procedures remain split at the validated target, with only honest
   utility sharing so far

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

1. expand the shared lifecycle engine into correction / supersede targeting
2. decide whether recurring procedures can share more than utilities without
   flattening the validated target
3. delete remaining family-specific lifecycle duplication
