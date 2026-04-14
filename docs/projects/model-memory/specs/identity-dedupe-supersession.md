---
summary: "Deterministic identity, dedupe, and supersession policy."
title: "Identity, Dedupe, And Supersession"
---

# Identity, Dedupe, And Supersession

## Objective

Keep live writes deterministic and conservative.

## Hard rule

V1 does not allow fuzzy semantic merge in the live write path.

That means:

- no embedding-based merge
- no similarity-threshold merge
- no model adjudicator for live merge
- no “close enough” merge logic

## Identity construction

Identity keys are built from normalized structured payload, not rendered statements.

Normalization may include:

- trim
- casefold
- whitespace collapse
- Unicode normalization
- stable URL canonicalization where applicable

## Kind-specific identity

### Preference

Key from:

- canonical class
- kind
- normalized scope
- normalized subject
- normalized instruction
- operation

### Fact

Key from:

- canonical class
- kind
- normalized scope
- normalized subject
- normalized value

### Rule

Key from:

- canonical class
- kind
- normalized scope
- normalized subject
- normalized recommended action
- normalized avoid action
- normalized needed capability

### Procedure

Key from:

- canonical class
- kind
- normalized scope
- normalized title
- normalized ordered steps

### Reference

Key from:

- canonical class
- kind
- normalized scope
- normalized task
- normalized primary resource
- normalized companion resources

## Dedupe policy

- exact normalized identity match -> dedupe
- no exact match -> no automatic dedupe

## Supersession policy

V1 allows deterministic same-slot supersession only for clearly single-valued memories.

Examples:

- a fact for one subject in one scope
- a stable preference for one subject in one scope

Rules:

- same slot, same value -> dedupe
- same slot, different value -> supersede old with new
- different slot -> keep separate

## Deferred work

Near-duplicate consolidation is explicitly deferred to an offline workflow after v1.
