---
summary: "High-level architecture for the clean-room model-memory system."
title: "Architecture Overview"
---

# Architecture Overview

## Objective

Build a new memory system that is model-native from first principles.

The system must:

- unify document ingestion and ordinary-turn user capture under one semantic pipeline
- support secondary daily continuity recovery without making derived summaries the
  primary evidence authority
- keep semantic truth in model-owned structured objects
- minimize handwritten semantic logic
- accept bounded model drift in proof
- keep storage writes deterministic and conservative while allowing bounded
  model-owned duplicate adjudication

## Four pillars

The full clean-room architecture has four pillars inside OpenClaw:

1. harness
2. context engine
3. memory layer
4. usage and cache layer

`model-memory` owns the memory layer directly and specifies the derived runtime layers that sit beside it.

The hard boundary is:

- semantic truth lives only in canonical memory objects
- every other layer is derived, operational, or observational

## Layer stack

The end-to-end stack is:

1. canonical memory objects as source of truth
2. derived runtime read models
3. workspace/bootstrap projections and dynamic packs
4. context engine assembly
5. usage and cache observability
6. operator-facing ingestion runners and inspection surfaces

That can be visualized as:

```text
canonical memory objects
  -> active slots and sets
  -> workspace projections and dynamic packs
  -> context engine
  -> usage and cache ledger
```

## Memory-layer runtime pipeline

The runtime pipeline is identical for all supported source types after source
adaptation:

1. source adapter
2. source normalization
3. structural chunking and windowing
4. model semantic extraction
5. lightweight validation
6. exact identity and deterministic dedupe
7. bounded candidate recall for possible prior memories
8. model-owned collision adjudication
9. write policy and support attachment
10. storage

The only difference between documents, ordinary turns, and finalized daily
continuity recovery is the source envelope, chunking policy, and write-policy
constraints.

## Retrieval pipeline

The read path is separate from ingestion but uses the same stored semantic contract:

1. query/source adapter
2. retrieval request interpretation
3. deterministic candidate recall
4. optional model reranking and packing
5. object-native result return

See [Retrieval And Context Injection](/projects/model-memory/specs/retrieval-context-injection).

## Derived runtime layers

The memory layer feeds several derived layers:

- `active_memory_slots`
- `active_memory_sets`
- `session_context_state`
- `context_artifacts`
- workspace projections
- dynamic memory packs

These layers may shape prompt assembly and retrieval packaging, but they must not redefine semantic truth.

## OpenClaw integration model

The clean-room system is designed to plug into the OpenClaw harness.

In v1:

- the memory layer is implemented first
- workspace projections and context assembly are specified now and implemented later in phases
- compaction remains delegated to the OpenClaw runtime
- subagent visibility constraints are accounted for in projection policy

## Non-goals

The runtime must not contain:

- detector-era modules
- phrase-induction logic
- keyword routing
- family registries
- field registries as semantic authority
- compatibility categories as runtime truth
- exact-string replay dispatch in shared helpers
- benchmark recognizers that know fixed memory content

## Package layout

Planned package location:

- `extensions/model-memory`

Planned runtime module set:

- `source-adapters.ts`
- `semantic-schema.ts`
- `semantic-interpreter.ts`
- `semantic-validator.ts`
- `semantic-identity.ts`
- `semantic-retrieval.ts`
- `runtime-read-models.ts`
- `projection-compiler.ts`
- `context-engine.ts`
- `semantic-review.ts`
- `semantic-store.ts`
- `usage-cache-ledger.ts`
- `semantic-replay.ts`

Module names may later split by concern, but the architectural seams should remain this small.

## Architectural rules

- the model owns semantic interpretation
- the model may own bounded same-memory collision adjudication against a small
  retrieved candidate set
- deterministic code owns transport, structure, validation, identity, and storage
- deterministic code owns activation/read-model materialization
- deterministic code owns projection compilation
- deterministic code may own batch queueing, failure containment, resumability,
  and operator status for ingestion runs
- proof must be object-native
- storage must never depend on compatibility projection
- hybrid search may generate duplicate candidates, but it must not be merge
  authority by itself
- same-source reruns must not count as independent reinforcement
- derived runtime layers must never become a second ontology
