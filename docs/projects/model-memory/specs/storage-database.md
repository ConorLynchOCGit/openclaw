---
summary: "Storage and database spec for model-memory."
title: "Storage And Database"
---

# Storage And Database

## Boundary

The clean-room system uses:

- the same Supabase/Postgres server
- a new logical database

It does not share the legacy memory database.

## Live implementation note

The canonical live logical database name for this project is `model_memory` on
the shared Supabase/Postgres server.

The package-local migration path under `extensions/model-memory/migrations/`
owns schema application for this database.

## Primary stored truth

Store:

- structured semantic object
- support items separated from the durable memory object
- deterministic identity fields
- provenance
- source envelope
- write/review state
- contract name
- contract version
- model id

Do not store compatibility projection as primary truth.

## Minimal v1 entities

- sources
- source windows
- memory objects
- memory support items
- write events
- supersession links
- active memory slots
- active memory sets
- session context state
- context artifacts
- workspace projection targets
- workspace projection versions
- retrieval requests
- retrieval result sets
- retrieval result items
- context runs
- context run segments

Deferred until the proof and benchmark harness slice:

- benchmark/proof artifact persistence

## Database goals

- stable object ids
- strict uniqueness on normalized identity
- support many source supports for one durable memory object
- append-only write event history
- clear supersession lineage
- easy audit of contract name, contract version, and model id
- auditable distinction between independent reinforcement and non-independent
  rerun or derived support
- indexed retrieval by scope, canonical class, kind, and normalized text projection
- auditable retrieval result membership and rank output

## Isolation rules

- no reads from legacy memory tables
- no writes into legacy memory tables
- no compatibility-driven schema coupling in v1

## Schema separation

Recommended separation:

- canonical semantic storage in the primary `model_memory` schema
- derived runtime state in a separate `runtime_context` schema

This keeps semantic truth separate from operational read models, prompt artifacts, and observability tables.
