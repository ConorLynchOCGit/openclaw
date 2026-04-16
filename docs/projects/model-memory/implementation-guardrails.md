---
summary: "Implementation guardrails for the clean-room model-memory build."
title: "Model Memory Implementation Guardrails"
---

# Model Memory Implementation Guardrails

## Objective

Prevent regression into the architectural mistakes of the legacy memory system while coding the clean-room implementation.

## Hard guardrails

- no semantic logic in source adapters
- no fixed-memory-string extraction helpers
- no compatibility-category backfill
- no family registries
- no field registries as semantic authority
- no repo-lore prompt examples
- no model-free semantic shortcuts in read models
- no model-free semantic shortcuts in projections
- no model-free semantic shortcuts in context assembly
- no fuzzy merge in the live write path
- no projection layer as semantic source of truth
- no repo-tracked docs as runtime-generated cache storage

## Prohibited patterns

- `lower.includes(...)` or equivalent as semantic authority
- parser-owned semantic capture
- phrase induction
- compatibility category routing
- freeform rationale text as hidden meaning
- shared fake-memory fixture catalogs
- exact-string proof keyed by content recognition

## Required boundaries

- semantic meaning comes from model-owned structured objects
- deterministic code handles structure, validation, identity, storage, and derived runtime materialization
- retrieval remains object-native
- projections remain deterministic and downstream
- usage/cache observability remains observational only

## Code review checklist

- does this file add semantic interpretation outside the model boundary?
- does this file introduce new vocabulary that looks like a hidden family registry?
- does this file make a derived layer authoritative?
- does this file make local case data look like reusable semantic scaffolding?
- does this file make runtime behavior depend on exact strings?

If the answer is yes, stop and redesign before landing the change.
