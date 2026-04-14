---
summary: "Roadmap for the clean-room model-memory project."
title: "Model Memory Roadmap"
---

# Model Memory Roadmap

## Principles

- Build the new system in parallel.
- Keep runtime truth object-native.
- Keep canonical classes explicit: `user`, `feedback`, `project`, `reference`.
- Keep internal kinds minimal: `preference`, `fact`, `rule`, `procedure`, `reference`.
- Keep the live write path deterministic and conservative.
- Keep context, projection, and usage layers derived rather than ontological.
- Defer fuzzy consolidation and legacy cutover until after the standalone system is proven.

## Progress snapshot

- Phase 0 is complete.
- Phase 1 is complete.
- Phase 2 is complete.
- Phase 3 is complete.
- Phase 4 is complete.
- Phase 5 is complete.
- Phase 6 is complete.
- Phase 7 has not started.

## Phase 0: Specs and scaffolding

Goals:

- create canonical project docs area
- write the full spec pack
- lock decisions before implementation
- define database and runtime boundaries

Exit criteria:

- project index exists
- roadmap, status, decisions, and current slice exist
- spec index exists
- all v1 specs are written and cross-linked

## Phase 1: Core runtime

Goals:

- create `extensions/model-memory`
- define schema and runtime types
- implement source adapters
- implement model semantic interpreter
- implement validation
- implement deterministic identity and write policy
- implement storage for the new logical database

Exit criteria:

- document ingestion and ordinary-turn user capture work end-to-end in isolation
- writes are deterministic
- no legacy memory runtime dependency exists

## Phase 2: Runtime read models and projections

Goals:

- implement `active_memory_slots` and `active_memory_sets`
- implement `session_context_state`
- implement `context_artifacts`
- implement projection compiler for generated `MEMORY.md`, `USER.md`, and `AGENTS.md` sections
- audit and ingest existing human-authored `MEMORY.md` and `USER.md` content before replacement

Exit criteria:

- runtime read models are deterministic
- projection compiler is deterministic
- generated bootstrap surfaces are derived from canonical memory objects
- canonical generated artifacts live under `.openclaw/model-memory/`
- no repo-tracked docs are treated as volatile runtime cache

## Phase 3: Context engine and usage/cache ledger

Goals:

- implement context engine assembly
- make context assembly work without retrieval first
- delegate compaction to the OpenClaw runtime in phase 1
- implement usage and cache ledger
- record stable, semi-stable, and volatile prompt-shape hashes

Exit criteria:

- context assembly uses derived packs and projections
- context assembly is valid before retrieval exists
- cache and token behavior is inspectable by run and by segment
- subagent-visible rule strategy is defined in the projection layer

## Phase 4: Proof and benchmark

Goals:

- object-native proof harness
- adjudicated corpus
- replay of stored real model outputs where helpful
- calibration and drift monitoring

Exit criteria:

- no exact-string benchmark scoring
- no shared semantic fixture world
- object-native proof passes for v1 scope

## Phase 5: Retrieval and context injection

Goals:

- implement object-native retrieval
- implement deterministic candidate recall
- implement optional reranking and packing seam
- implement retrieval-enhanced context packaging for downstream consumers

Exit criteria:

- retrieval operates over stored semantic objects
- no keyword or exact-string retrieval authority exists
- retrieval benchmarks are object-native

## Phase 6: Shadow mode

Goals:

- optional shadow ingestion from live surfaces
- no user-visible behavior change
- telemetry and false-positive review
- operator inspection, calibration, and readiness reporting

Exit criteria:

- shadow outputs can be compared safely against expectations
- drift and false-positive rates are understood
- live shadow adapters remain observational only
- readiness gates exist for later cutover planning

## Completed implementation slices

### Slice 11: Live database schema and repositories

Completed:

- accepted canonical and runtime-context schema turned into executable SQL migrations
- in-memory storage replaced on the implemented live paths by database-backed repositories and stores
- deterministic write semantics preserved on the database path

### Slice 12: Real model execution boundaries

Completed:

- executor-backed semantic extraction boundary added
- executor-backed retrieval-request interpretation boundary added
- prompt contracts remain structural and placeholder-only

### Slice 13: Live ingestion services and rebuild orchestration

Completed:

- document and ordinary-turn services now persist canonical source data and writes
- deterministic rebuild orchestration now refreshes slots, sets, context artifacts, and projection versions
- controlled replay/admin service surface now exists

### Slice 14: Harness integration

Completed:

- harness-facing bridge now maps projection outputs into OpenClaw bootstrap-file surfaces
- context engine now accepts explicit retrieval-pack gating through the harness boundary
- usage normalization from the harness is now cross-wired into the model-memory ledger

### Slice 15: Operational hardening and shadow rollout

Completed:

- live shadow adapters now exist for document and ordinary-turn surfaces
- operator inspection and calibration reporting surfaces now exist
- readiness-gate evaluation now exists without any cutover behavior

## Phase 7: Cutover, retirement, and deletion

Goals:

- execute migration from the legacy memory stack to `model-memory`
- retire all legacy runtime surfaces
- delete legacy code and deployed runtime state

Exit criteria:

- `model-memory` is the only active memory authority
- legacy memory plugins, runtime, hooks, and docs are removed
- legacy memory state is purged from deployed hosts after export/snapshot where needed

## Deferred

- advisory planning
- fuzzy consolidation workflow
- package split between memory and context layers if later justified
