# Project Memory Expansion

## Purpose

Project memory stores explicit, scoped project facts and bounded generic
reference-like project anchors.

## Current live posture

Live now:

- typed named-project fact memory for explicit supported fields
- bounded generic named-project reference facts
- project-scoped clustering and duplicate suppression
- explicit correction / supersede
- approved-only hybrid retrieval

## Intentional product-policy boundaries

Project facts remain:

- explicit
- project-scoped
- stricter than generic guidance

They do not become:

- speculative project summaries
- arbitrary new fact fields without bounded semantics
- a backdoor to entity-profile expansion before that family exists

## Updated flattening posture

Project facts already share some substrate, but they still need:

- full ingestion-control-plane migration
- real application-selection handoff for `direct_answer`
- retrieval/routing control-plane integration instead of partial direct-intent
  shaping
- correction-policy cleanup without legacy stringly gating

## What remains intentionally family-specific

- typed fact fast paths remain first-class
- application mode remains `direct_answer`
- stricter truth posture remains

## Read with

- `/memory-system/specs/full-ingestion-control-plane`
- `/memory-system/specs/application-selection-layer`
- `/memory-system/specs/retrieval-and-routing-control-plane`
- `/memory-system/specs/correction-policy-cleanup`
