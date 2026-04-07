# Unified Ingestion Resolver

## Purpose

Document the currently landed unified ingestion resolver and clarify its
current scope honestly.

## Current landed value

The current resolver now serves:

- workflow lessons
- project rules
- unmet needs

across:

- transcript capture
- tool-side candidate submission
- tool-side duplicate-key derivation

This is real flattening progress.

## Why this spec is now explicitly partial

The resolver is not yet the full ingestion control plane.

Response style, project facts, and recurring procedures still keep separate
resolution stacks across transcript capture and tool submission.

## Relationship to the next ingestion phase

The next target is specified in:

- `/memory-system/specs/full-ingestion-control-plane`

That work should extend the current resolver pattern into the full family set
and absorb correction normalization, provenance unification, and family adapter
registration.

## What remains valid from the current resolver

- workflow-family unification direction
- family mapping through registry-aware logic
- phrase-pattern support for eligible workflow families

## What remains incomplete

- six-family coverage
- one family adapter contract for transcript and tool submission
- one correction-intent normalization path
- one provenance output contract

## Implementation rule

Do not treat the workflow-family resolver as the final architecture. It is a
partially landed bridge toward the full ingestion control plane.
