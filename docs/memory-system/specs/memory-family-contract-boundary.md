# Memory Family Contract Boundary

## Purpose

Define the correct contract for memory-family policy across:

- `memory-core`
- `memory-middleware`
- plugin-sdk

## Why this exists

The current family-policy boundary works for bundled code, but it is smellier
than it should be because a public SDK path currently exposes middleware-owned
implementation directly.

That is not the right long-term substrate contract.

## Boundary goals

- core should consume a stable family-policy contract
- middleware should own middleware-specific adapters and runtime behavior
- plugin-sdk should expose a stable public seam, not a direct re-export of a
  bundled plugin implementation file

## Target contract

The repo should define one core-owned or shared contract module for:

- family ids
- family policy types
- registry read API
- adapter registration types where those are cross-package seams

Middleware can still own:

- parser implementations
- DB/query implementations
- lifecycle/correction/retrieval adapters

## Compatibility rules

- bundled plugin code may remain the first consumer of this contract
- the public seam should not require extension consumers to know middleware
  source layout
- boundary cleanup must remain backward-compatible enough for the bundled
  workspace and the public SDK surface

## What should not happen

- do not solve the problem by deep-importing middleware internals from more
  places
- do not expose unstable middleware implementation details as if they were the
  lasting SDK

## Proof requirements

Prove:

1. memory-core no longer depends on a boundary that is effectively a middleware
   implementation re-export
2. family policy can evolve without expanding unstable cross-package coupling

## Landed in flattening batch v6

This slice is now live.

What landed:

- `src/plugin-sdk/memory-family-policy.ts` now owns the shared family policy
  contract directly
- `memory-core` consumes that contract without crossing through a middleware
  implementation file
- `memory-middleware` now reuses the same shared contract through a local
  barrel instead of acting as the hidden source of truth

What this did not do:

- expose parser/query adapter bodies as the public contract
- claim that every later family-policy field trim is finished forever
- make learned/self-improving rollout proof unnecessary
