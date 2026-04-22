---
summary: "Quarantine policy for legacy fuzzy semantic-family and collision logic around MMV2 live memory."
title: "Semantic Forest Quarantine"
---

# Semantic Forest Quarantine

## Status

Status: accepted guardrail and regression baseline after the
`SOAKQUAR-2026-04-21` clean MMV2 retrieval-runtime soak.

The clean soak must not pass by rebuilding the old semantic forest under a new
name. Write-path correction and supersession are structural. Read-time
retrieval may rank evidence, but ranking never mutates canonical truth.

Accepted baseline evidence:

- artifact root:
  `.artifacts/model-memory/soak-ui-validation/2026-04-21-semantic-quarantine-soak/`
- correction supersession edge:
  `fa9a259f-330b-5f06-bf11-79f62a0ffe47`
- accepted recall request:
  `c9d9c67c-410a-5729-a02e-e5cf0a761b8e`
- rollback tag:
  `openclaw:rollback-memory-soak-20260421T175907Z`

## Classifications

| Surface                                                          | Classification                                                           | Default live posture                                                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extensions/model-memory/src/semantic-identity.ts`               | `legacy_fallback` plus `read_only_retrieval` for text normalization only | not a MMV2 write-path authority                                                                                                                            |
| `extensions/model-memory/src/semantic-collision-adjudication.ts` | `legacy_fallback`                                                        | not called by default MMV2 live capture/reconciliation                                                                                                     |
| `extensions/model-memory/src/db/database-memory-object-store.ts` | `explicit_fallback_only`                                                 | not constructed by default MMV2 live paths; fallback requires `MODEL_MEMORY_LEGACY_CAPTURED_OBJECT_WRITE_FALLBACK_ENABLED=true` or an explicit caller flag |
| `extensions/model-memory/src/mmv2/semantic-identity.ts`          | `bounded_structured_identity`                                            | allowed for canonical fields, scope, source refs, status, and explicit user text                                                                           |
| `extensions/model-memory/src/mmv2/reconciliation.ts`             | `bounded_structured_identity`                                            | exact duplicate and exact field/scope identity only; correction supersession requires structural target resolution                                         |
| `extensions/model-memory/src/mmv2/atomic-extraction.ts`          | `bounded_structured_identity`                                            | explicit command shapes only; no topic-specific parser                                                                                                     |
| `extensions/model-memory/src/mmv2/admission.ts`                  | `bounded_structured_identity`                                            | deterministic admit only for explicit evidence classes                                                                                                     |
| `extensions/model-memory/src/retrieval-request-interpreter.ts`   | `read_only_retrieval`                                                    | live context fallback emits baseline retrieval telemetry without soak-specific forced classes/kinds                                                        |
| `extensions/model-memory/src/runtime/retrieval/`                 | `read_only_retrieval`                                                    | ranking may use fielded, lexical, recency, source-lineage, and projection-digest evidence; it cannot mutate truth                                          |
| `extensions/model-memory/src/runtime-read-models.ts`             | `read_only_retrieval`                                                    | MMV2-derived runtime records only; default retrieval identity projection is deterministic field-based and does not import legacy semantic-family code      |
| `extensions/model-memory/src/mmv2/storage-compatibility.ts`      | `legacy_fallback`                                                        | temporary shape bridge only, not canonical truth                                                                                                           |

## Current Enforcement

The post-soak hardening pass adds a static regression test at
`extensions/model-memory/src/runtime/retrieval/semantic-forest-quarantine.test.ts`
covering the default retrieval/read-model path:

- `extensions/model-memory/src/retrieval-request-interpreter.ts`
- `extensions/model-memory/src/runtime-read-models.ts`
- `extensions/model-memory/src/runtime/retrieval/candidate-recall.ts`
- `extensions/model-memory/src/runtime/retrieval/pack-assembler.ts`
- `extensions/model-memory/src/runtime/context/retrieval-packs.ts`

Those files must not import legacy `semantic-identity.ts`, semantic collision
adjudication, or `database-memory-object-store.ts`. Legacy compatibility can
remain elsewhere only as documented fallback or read-only adapter code.

The 2026-04-22 hardening pass extends that guard to default write hot paths:

- `extensions/model-memory/src/live-document-ingestion-service.ts`
- `extensions/model-memory/src/live-ordinary-turn-capture-service.ts`
- `extensions/model-memory/src/live-daily-continuity-recovery-service.ts`
- `extensions/model-memory/src/admin/document-ingestion-runner-service.ts`
- `extensions/model-memory/src/admin/replay-service.ts`
- `src/agents/model-memory.database.ts`

Those files must not import legacy semantic identity, semantic collision
adjudication, or `DatabaseMemoryObjectStore` through normal static imports.
`DatabaseMemoryObjectStore` remains available for legacy storage-engine
rollback and explicit captured-object write fallback only.

Explicit fallback flag:

```text
MODEL_MEMORY_LEGACY_CAPTURED_OBJECT_WRITE_FALLBACK_ENABLED=true
```

Default behavior is fail-closed for legacy captured-object fallback. MMV2
native recording remains the normal live write path.

The 2026-04-22 follow-on ordinary-turn proof fix preserves structural
candidate identity across single-batch extraction, canonicalization, admission,
and reconciliation. It does not add topic-specific parsing, fuzzy
supersession, semantic-family matching, or semantic-forest fallback. Batch
prefixes remain allowed only as collision protection for true multi-batch
extraction.

## Forbidden Write-Path Inference

Forbidden by default:

- fuzzy topic matching for correction or supersession
- legacy family recall collision scoring for MMV2 native live capture
- same-source-family boosts as write authority
- topic-specific parsers such as `validation reports`
- legacy-shaped compatibility records as canonical authority

Allowed by default:

- exact duplicate detection from canonical semantic keys
- exact structured identity from canonical subject, predicate, object, scope,
  status, and source refs
- explicit correction target resolution by `memory_id`
- unresolved-target correction records when no structural target resolves
- read-time ranking over active MMV2 runtime records and MMV2-derived
  projection digests

## Correction Rule

Correction supersession is structural:

```text
explicit correction command
  -> parse target refs
  -> resolve active target memory ids
  -> supersede only resolved structural targets
```

If a correction lacks a resolvable structural target, MMV2 may write an
inspectable correction memory with `conflict_type=ambiguous`, but it must not
invent a supersession target from topical similarity.

## Retrieval Rule

Retrieval relevance is read-time only. The Retrieval Runtime may boost:

- exact fielded matches
- lexical query matches
- source-lineage matches such as bounded soak markers in source evidence
- recency
- projection digests backed by active MMV2 `source_memory_ids`

These boosts must emit selected ids and reason codes. They must not alter
durable memory status, lineage, or admission.

## Soak Implication

A clean soak can pass with known recall-quality holes if it remains observable:

- fresh-session recall must select relevant fresh MMV2 ids or an MMV2-derived
  projection backed by those ids
- misses must be visible through retrieval telemetry and pack evidence
- passing by same-session transcript, root workspace files, or legacy semantic
  family collision is not acceptable
