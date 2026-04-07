# Retrieval Feature Framework

## Purpose

Document what the current retrieval feature framework already flattened and
what it did not flatten.

## Current landed value

The framework now provides:

- shared score composition for approved-memory hybrid retrieval across several
  families
- shared matched-field composition for those families
- shared reviewable-candidate retrieval feature composition
- shared validated-procedure subject-match feature composition

That is real and remains valuable.

## Why this spec is now explicitly partial

The framework flattened score composition.

It did not yet flatten the whole retrieval/routing control plane.

The wider retrieval system still contains:

- query-intent inference outside the framework
- family suppression outside the framework
- semantic fallback sidecars outside the framework
- more surface-planning duplication than the final architecture should keep

## Relationship to the next retrieval phase

The next target is specified in:

- `/memory-system/specs/retrieval-and-routing-control-plane`

That work should absorb:

- normalized query intent
- retrieval plan selection
- semantic fallback eligibility
- family suppression / adjacency policy

## What remains valid from the current framework

- shared feature vocabulary
- family retrieval weights
- matched-field alignment
- hybrid-first posture

## What remains incomplete

- one retrieval control plane
- one routing control plane
- one application-selection handoff
- reduction of semantic sidecar routing

## Implementation rule

Do not describe the retrieval feature framework as if it already flattened the
whole retrieval architecture. It is a partial bridge that should feed the next
control-plane rewrite.
