# Registry-Driven Proof Inspection

## Purpose / problem

The proof runner is currently too family-switched. That was acceptable while
proving the first few families, but it becomes another parallel system if every
future family requires new proof-runner branches.

This spec defines a registry-driven proof and lifecycle inspection layer.

## Why this is needed now

Flattening is not only about runtime behavior. Proofing also needs to scale:

- new families should register how they are inspected
- proof output should show which registry policy was used
- lifecycle, phrase, and application evidence should be inspectable without
  family-specific switch growth

## Current parallel systems this replaces or reduces

- family switches in `extensions/memory-middleware/src/proof-runner.ts`
- family-specific lifecycle inspection branching
- family-specific phrase inspection branching

## Architecture fit

The proof inspection layer reads:

- family-definition registry entries
- lifecycle engine outputs
- phrase-pattern engine outputs
- retrieval/application evidence

It does not:

- define family behavior itself
- replace runtime evaluation

## Domain model

### Proof policy

```ts
type ProofPolicy = {
  familyId: string;
  lifecycleMode: "memory_object_lifecycle" | "procedure_lifecycle";
  inspectPhrasePatterns: boolean;
  requiredEvidence: string[];
  matchedFieldMapping: Record<string, string>;
};
```

### Shared proof output

```ts
type FamilyProofEvidence = {
  familyId: string;
  policyId: string;
  lifecycleState?: string;
  approvedIds: string[];
  candidateIds: string[];
  reviewIds: string[];
  matchedFields: string[];
  phrasePatternIds?: string[];
};
```

## Current-state pain points anchored to the repo

- proof runner already needs explicit family knowledge to inspect the six
  landed families
- lifecycle evidence and matched-field expectations are not driven from one
  shared policy layer

## Proposed contracts and interfaces

### Proof inspector registry

Each family registers:

- lifecycle inspection mode
- required ids/evidence fields
- optional phrase inspection support
- matched-field label mapping

### Shared proof-runner flow

1. resolve the family definition
2. read the family proof policy
3. run the generic inspector for that policy mode
4. emit structured evidence with family id and policy id

## What remains family policy instead of becoming generic

- which lifecycle mode the family uses
- whether phrase evidence exists
- which matched-field names are meaningful for the family

## Rollout posture

Move proof policy into the registry before deleting existing family switches.
Keep proof output backward-compatible while the transition is in progress.

Current live rollout:

- `extensions/memory-middleware/src/memory-family-registry.ts` now exposes
  explicit proof family definitions for the six main families plus workflow /
  response-style phrase artifacts
- `extensions/memory-middleware/src/proof-runner.ts` now resolves proof family
  inspection through those registry definitions instead of splitting core
  families and phrase artifacts into separate control paths
- lifecycle artifact extraction and hybrid-search proof validation now live in
  shared helpers
- recurring procedures still keep their validated-target distinction

## Proof / evaluation requirements

Prove:

1. at least two families use the same proof inspection mode
2. proof output still captures exact ids and matched fields
3. registry policy ids appear in proof evidence

## Risks / failure modes

- proof output becomes too abstract and loses useful family-specific evidence
- proof runner starts depending on registry fields that runtime does not use
- phrase and lifecycle inspection diverge again under wrapper code

## Out of scope

- changing proof standards
- changing production rollout policy

## Follow-up implementation slices

1. surface proof policy ids in proof evidence if later proof consumers need it
2. tighten any remaining proof evidence mapping around later recurring-
   procedure bridge work
