# Proof Runner Adapterization

## Purpose

Replace registry-plus-switch proofing with adapter-driven proof inspection so
adding families or artifacts does not keep expanding `proof-runner.ts`.

## Current landed state

Flattening batch v5 landed the core adapter model:

- lifecycle inspection now dispatches through registered lifecycle adapters
- artifact extraction now dispatches through registered artifact adapters
- proof definitions for the six main memory families now derive from the family
  registry instead of a second duplicated proof-definition map

This is a real proof substrate change.

It is not yet the final registry-authority story:

- phrase proof families still remain distinct proof artifacts rather than
  ordinary family definitions
- registry authority cleanup is now landed

## Why this exists

Current proofing is flatter than before, but it still depends on:

- proof-family definitions
- inspection-mode switches
- artifact-mode switches

That is not yet the scalable proof substrate the roadmap needs.

## Target architecture

Use registered proof adapters.

Each adapter should define:

- lifecycle inspection entry point
- artifact extraction entry point
- required expectation fields
- matched-field vocabulary mapping
- phrase / artifact support

## Policy source of truth

The registry should point to proof policy and adapter identity.

The proof runner should:

1. resolve the family policy
2. resolve the adapter
3. validate required expectation fields
4. execute inspection and artifact extraction generically
5. emit backward-compatible proof output

## Backward-compatibility

Proof output should remain stable enough that:

- existing proof workflows keep working
- audit detail is not lost

The migration target is implementation shape, not breaking proof consumers.

## What remains family-specific

- which artifact type is meaningful
- which fields are required for proof
- whether phrase evidence exists
- procedure validated-artifact distinctions

## Proof requirements

Prove:

1. adding a new proofable family or artifact type no longer requires a new
   large proof-runner switch arm
2. correction, phrase, and retrieval evidence can still be audited clearly
