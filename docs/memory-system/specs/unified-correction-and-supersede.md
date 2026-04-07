# Unified Correction And Supersede

## Purpose / problem

Correction and supersede behavior now exists across multiple families, but it
still lands through family-specific logic. That is enough for practical parity,
not enough for scalable architecture.

This spec defines one correction engine with family policy hooks.

## Why this is needed now

Every future family will need some answer to:

- how explicit correction is detected
- how a target is resolved
- when correction stays held versus supersedes immediately
- how lineage is recorded

If those rules continue to be implemented per family, the repo will keep adding
parallel systems.

## Current parallel systems this replaces or reduces

- response-style generic correction logic
- project-fact subject-scoped supersede logic
- recurring-procedure correction/supersede logic
- generalized lesson supersede handling

## Architecture fit

The correction engine sits after ingestion resolution and before lifecycle
resolution. It consumes:

- explicit correction intent from the ingestion resolver
- family definition policy
- currently approved or held targets

It emits:

- hold as correction evidence
- reject
- immediate supersede
- lineage metadata

## Domain model

### Shared correction contract

```ts
type CorrectionPolicy = {
  familyId: string;
  mode: "held_correction" | "immediate_supersede_when_targeted";
  explicitCorrectionRequired: boolean;
  targetFields: string[];
  subjectIdentityFields: string[];
};
```

```ts
type CorrectionResolution =
  | { outcome: "not_a_correction" }
  | { outcome: "held_correction"; candidateClusterId: string }
  | {
      outcome: "immediate_supersede";
      priorApprovedId: string;
      nextApprovedPayload: Record<string, unknown>;
      lineageReason: string;
    }
  | { outcome: "reject"; reasonCode: string };
```

## Current-state pain points anchored to the repo

- response style now supports direct generic correction supersede, but that
  behavior is still implemented as response-style-specific logic
- generalized families already support stronger supersede lineage than some
  older bounded families
- target resolution rules are duplicated and inconsistently expressed

## Proposed contracts and interfaces

### Correction resolver service

The service must:

1. confirm explicit correction language when required
2. resolve the target subject within family scope
3. consult family correction policy
4. either emit a held correction or immediate supersede resolution
5. record explicit lineage metadata

### Target-resolution rule

Target resolution must be based on normalized subject identity, not freeform
string similarity.

### Lineage rule

Supersede must always record:

- prior approved object id
- next approved object id
- review or automatic decision id
- reason code

## What remains family policy instead of becoming generic

- some families may remain conservative and require held correction first
- procedures may require clearer same-checklist identity than guidance
  families
- unmet needs may intentionally avoid aggressive supersede because capability
  granularity is the safer default

## Rollout posture

Move correction detection to the shared engine before deleting family-specific
paths. Immediate supersede should only be enabled where the current family spec
already allows it.

## Proof / evaluation requirements

Implementation must prove:

1. at least two families share the same correction engine
2. explicit non-correction restatements do not supersede
3. lineage remains queryable and auditable

## Risks / failure modes

- false correction detection mutates approved memory
- target resolution is too fuzzy
- held-correction and immediate-supersede rules collapse into one unsafe mode

## Out of scope

- user-facing memory browser
- silent mutation
- cross-family semantic correction fallback

## Follow-up implementation slices

1. correction engine skeleton and family policy wiring
2. migrate response style and project facts
3. migrate recurring procedures and generalized families
4. remove duplicated supersede logic
