# Registry Authority Cleanup

## Purpose

Make the family-definition registry authoritative enough to be called the
control plane honestly.

## Why this exists

The registry is live and useful, but some policy still lives elsewhere.
That creates a dangerous middle state:

- enough registry to create confidence
- not enough registry to prevent drift

## Authority target

The registry should become authoritative for:

- family identity
- lifecycle policy
- correction policy
- retrieval policy
- application policy
- semantic-routing policy
- proof policy
- capture / workflow-family mapping

## Duplicate policy to remove

This cleanup should eliminate or generate:

- separate proof-definition tables
- separate workflow-family mapping helpers
- decorative semantic-routing fields that are not runtime-authoritative
- duplicated family policy lookups outside the registry where no adapter
  boundary justifies them

## What should remain outside the registry

The registry should not absorb:

- full parser implementations
- full SQL text
- prompt prose
- adapter code bodies

Those belong in adapters or renderers. The registry should own policy and
adapter selection, not every implementation detail.

## Criteria for calling the registry the control plane honestly

The registry can be called the control plane only when:

1. major family policy is not duplicated elsewhere as a second source of truth
2. runtime seams consume registry policy rather than re-deriving it
3. proofing and semantic-routing policy are actually driven from it
4. new families can plug into the same policy shape without hidden side tables

## Proof requirements

Prove:

1. workflow-family mapping no longer lives in multiple places
2. proof-family policy no longer requires a separate competing source of truth
3. semantic-routing policy is either truly authoritative or explicitly removed
   from the registry until it is
