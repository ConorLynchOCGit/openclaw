# Retrieval And Routing Control Plane

## Purpose

Define and now record the landing of one shared hybrid retrieval/routing control
plane for:

- query-intent normalization
- retrieval hint planning
- project-family shaping
- semantic fallback family selection

## Why this exists

The earlier retrieval feature framework flattened score composition, not the
whole retrieval control plane.

The repo used to split hybrid retrieval policy across:

- query heuristics
- SQL branches
- post-query reshaping
- semantic sidecar routing

## Landed status

This slice is now live for the current hybrid retrieval surface.

The repo now has one shared retrieval-control decision for:

1. normalized query intent hints
2. family eligibility for hybrid semantic fallback
3. project-family shaping / adjacency suppression
4. hybrid fallback routing selection

## Current landed model

The current control plane produces one decision artifact that includes:

- normalized query
- response-style hint
- project-fact hint
- workflow-improvement hint
- project-memory intent family
- generalized workflow guidance-pattern hint
- recurring-procedure hint
- eligible semantic fallback families

That decision now feeds both:

- `extensions/memory-middleware/src/db/queries.ts`
- `extensions/memory-middleware/src/tools/memory-object-search-hybrid.ts`

## What this slice changed structurally

- hybrid query-hint inference is no longer duplicated between query code and
  the tool wrapper
- project-family shaping now reads the shared control decision
- semantic fallback family routing now reads the shared control decision
- clearly scoped procedure asks no longer route every semantic fallback family

## What remains intentionally family-gated

- semantic routing remains family-gated
- procedures remain distinct in application posture
- phrase eligibility remains family-limited
- typed fast-paths remain more important for project facts and procedures where
  exact signals are the correct winner

## What this slice did not replace

Still ahead:

- recurring-procedure staged substrate redesign
- deeper retrieval SQL normalization after the procedure redesign
- proof / registry / boundary cleanup

## Proof status

This slice now proves:

1. normalized intent drives retrieval hint planning structurally
2. project-family shaping no longer lives only in ad hoc post-query branching
3. semantic fallback family selection is governed from one control plane while
   staying family-gated
