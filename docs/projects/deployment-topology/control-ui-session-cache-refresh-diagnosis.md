---
summary: "Exact diagnosis for stale session rows and Control UI refresh authority."
title: "Control UI Session Cache Refresh Diagnosis"
---

# Control UI Session Cache Refresh Diagnosis

## Question

Why did the browser still show four `codex-*` rows after refresh?

## Exact diagnosis

There were two distinct seams:

1. live selector truth was still wrong for four legacy validation sessions
2. the Control UI needed stronger cache/authority hardening so a served gateway
   page cannot quietly keep a stale foreign gateway target or stale bundle

The first seam is the direct reason the operator still saw those rows.

## What the browser was actually showing

The rows were not invented client-side. They mapped to real live session-list
entries whose keys were validation-oriented rather than `codex-*`, but whose
display/origin labels still rendered as `codex-*`.

Affected entries:

- `agent:main:validation-background-replay`
- `agent:main:validation-ingest-progress-direct`
- `agent:main:validation-ingest-progress`
- `agent:main:validation-progress-replay`

## Why the selector still included them

The entries carried stale legacy metadata:

- `visibilityClass: "operator"`
- `retentionClass: "standard"`
- `systemSent: true`
- proof-oriented labels under `displayName` or `origin.label`

The existing proof-session logic mostly recognized:

- `codex-*`
- `proof-*`

but these legacy rows also used:

- validation-prefixed request keys
- proof-oriented labels without corrected normalized metadata

That left a mismatch:

- structurally these rows were proof/validation sessions
- persisted metadata still marked them as ordinary operator sessions

## UI-side hardening that was also needed

Even after fixing classification, the Control UI still needed stronger
cache/authority rules:

- served Control UI assets should use `Cache-Control: no-store`
- a gateway-served page should not silently reuse a persisted foreign gateway URL
- stale removed session options must be evicted on rerender instead of surviving
  from a prior selector state

Those UI hardening changes are now implemented, but they were not sufficient on
their own to make the four rows disappear while the live selector path still
classified them as operator-visible.

## Fix path

### Runtime/session fix

- normalize validation-prefixed main-session proof rows into `visibilityClass:
"proof"`
- override legacy `operator` / `standard` metadata when the row is system-sent
  and proof-hinted
- apply the corrected visibility before retention-class derivation

### Control UI fix

- serve the Control UI shell, bootstrap config, and static assets with
  `Cache-Control: no-store`
- force gateway-served pages to use the served gateway authority instead of a
  stale foreign gateway target
- evict removed selector options on rerender

## Resulting authority boundary

- selector truth comes from live session classification
- UI refresh/caching must converge to that live truth quickly
- browser cache hardening is a guardrail, not a substitute for correct session
  visibility metadata
