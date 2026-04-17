---
summary: "Phase 2 schema review and migration plan for making kind primary and canonicalClass secondary or derived."
title: "Kind Primary Schema Migration"
---

# Kind Primary Schema Migration

## Objective

Specify how Phase 2 should move the system from a dual-authority `kind` plus
`canonicalClass` posture to a `kind`-primary posture without destabilizing the
live runtime.

## Why this exists

Observed runtime behavior indicates:

- `kind` is more stable than `canonicalClass`
- `kind` appears more accurate during extraction
- `kind` appears more useful during dedupe and support attachment

That makes it the better candidate for the primary semantic axis.

## Migration goal

Reach a state where:

- `kind` is the primary semantic discriminator
- `canonicalClass` is secondary or derived
- ingestion, adjudication, graph build, and capsule build all align to that
  posture

## First-pass migration posture

Phase 2 should not remove `canonicalClass` immediately.

Instead it should:

- demote `canonicalClass`
- preserve it for compatibility and operator views
- move semantic authority to `kind`

## Surfaces that need migration review

- semantic extraction prompt contract
- collision adjudication prompt contract
- retrieval-request interpretation
- graph build rules
- capsule build rules
- runtime read models where class and kind are currently both treated as core
  axes

## Data-model options

### Option A: keep both fields, demote class logically

- keep `kind`
- keep `canonicalClass`
- document that `kind` is primary
- compute or validate `canonicalClass` downstream

### Option B: make `canonicalClass` fully derived later

- retain storage for compatibility during transition
- eventually stop asking the model to choose it as a primary semantic label

Phase 2 should begin with Option A.

## Prompt-contract consequence

The extraction prompt contract should be reviewed so that:

- `kind` is the primary classification output
- `canonicalClass` is either derived or explicitly secondary

That audit should be treated as a required Phase 2 migration seam, not an
optional cleanup.

## Database consequence

The database does not need an immediate destructive migration.

Phase 2 should instead:

- preserve current columns
- update semantic authority rules
- add migration notes for any later column or index changes

## Rollout

1. document `kind`-primary authority
2. review prompt contracts
3. update graph and capsule derivation logic
4. evaluate whether runtime read models need index or grouping changes
5. only later consider heavier DB-level simplification
