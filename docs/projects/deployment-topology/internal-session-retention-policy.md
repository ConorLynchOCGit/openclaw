---
summary: "Retention and cleanup policy for internal, proof, and system sessions."
title: "Internal Session Retention Policy"
---

# Internal Session Retention Policy

## Goal

Internal and proof sessions should not pollute the operator selector or remain
forever in the store.

## Current retention windows

- `standard`: default maintenance window from config
- `proof_short`: min(default, 2 days)
- `internal_short`: min(default, 3 days)
- `system_short`: min(default, 7 days)

## Enforcement seam

- `src/config/sessions/visibility.ts`
- `src/config/sessions/store-maintenance.ts`

## Cleanup behavior

- stale entries are pruned by retention class
- transcript files for pruned sessions are archived safely when they live under
  the managed session root
- paths outside the managed session root are never deleted blindly

## Operator rule

- hiding a session from the selector is not enough
- proof/internal/system rows must also age out on shorter windows
