---
summary: "Concrete execution plan from spec to implementation for model-memory."
title: "Model Memory Build Plan"
---

# Model Memory Build Plan

## Objective

Translate the clean-room spec pack into implementation slices without improvising architecture in code.

## Preconditions

Before the first runtime code file:

- [Spec Closure Review](/projects/model-memory/SPEC_CLOSURE_REVIEW) is green
- [Database Schema V1](/projects/model-memory/specs/database-schema-v1) is accepted
- [Proof Corpus Plan](/projects/model-memory/proof-corpus-plan) is accepted
- [Implementation Guardrails](/projects/model-memory/implementation-guardrails) is accepted
- [Validation Loop](/projects/model-memory/validation-loop) is accepted
- [Bootstrap Input Audit](/projects/model-memory/bootstrap-input-audit) is recorded

## Execution rules

- implement slices in order
- use only targeted validation during the slice loop
- do not invent new ontology fields during execution
- do not implement retrieval early to compensate for missing context-engine behavior
- do not write projection output into repo-tracked docs as canonical generated storage
- before a reusable proof harness exists, run proof through slice-owned tests with file-local audited fixtures taken from [Proof Corpus Plan](/projects/model-memory/proof-corpus-plan)
- treat the later proof-and-benchmark slice as reusable harness and persistence work, not as permission to defer proof until the end

## Progress

Completed:

- slices 1 through 15 have been implemented and validated on fast lanes
- the package now exists at `extensions/model-memory/`
- the remaining work is cutover planning, rollout policy, legacy retirement, and deletion preparation

## Slice 1 - schema, prompt-contract boundary, and storage contract

### Files to create

```text
extensions/model-memory/package.json
extensions/model-memory/src/index.ts
extensions/model-memory/src/semantic-schema.ts
extensions/model-memory/src/semantic-validator.ts
extensions/model-memory/src/prompt-contracts.ts
extensions/model-memory/src/storage-database-contract.ts
extensions/model-memory/src/semantic-schema.test.ts
extensions/model-memory/src/semantic-validator.test.ts
extensions/model-memory/src/prompt-contracts.test.ts
extensions/model-memory/src/storage-database-contract.test.ts
```

### Tables to implement first

Canonical schema only:

- `model_memory.sources`
- `model_memory.source_windows`
- `model_memory.memory_objects`
- `model_memory.write_events`
- `model_memory.supersession_links`

### Validation lanes

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/semantic-schema.test.ts extensions/model-memory/src/semantic-validator.test.ts extensions/model-memory/src/prompt-contracts.test.ts extensions/model-memory/src/storage-database-contract.test.ts`

### Proof lanes

- shape-only schema fixtures
- contract metadata recording checks

### Non-goals

- no source adapters yet
- no model calls yet
- no runtime-context tables yet
- no projection compiler yet

## Slice 2 - document source adapter and extraction path

### Files to create

```text
extensions/model-memory/src/source-adapters/document-source-adapter.ts
extensions/model-memory/src/semantic-interpreter.ts
extensions/model-memory/src/semantic-extraction-prompt.ts
extensions/model-memory/src/document-ingestion.ts
extensions/model-memory/src/source-adapters/document-source-adapter.test.ts
extensions/model-memory/src/document-ingestion.test.ts
```

### Tables touched

- `model_memory.sources`
- `model_memory.source_windows`

### Validation lanes

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/source-adapters/document-source-adapter.test.ts extensions/model-memory/src/document-ingestion.test.ts`

### Proof lanes

- document proof subset from [Proof Corpus Plan](/projects/model-memory/proof-corpus-plan)
- use file-local audited fixtures inside `document-ingestion.test.ts` until the reusable proof harness exists

### Non-goals

- no identity/dedupe yet
- no read models
- no projections
- no retrieval

## Slice 3 - ordinary-turn source adapter and extraction path

### Files to create

```text
extensions/model-memory/src/source-adapters/ordinary-turn-source-adapter.ts
extensions/model-memory/src/ordinary-turn-capture.ts
extensions/model-memory/src/source-adapters/ordinary-turn-source-adapter.test.ts
extensions/model-memory/src/ordinary-turn-capture.test.ts
```

### Tables touched

- `model_memory.sources`
- `model_memory.source_windows`

### Validation lanes

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/source-adapters/ordinary-turn-source-adapter.test.ts extensions/model-memory/src/ordinary-turn-capture.test.ts`

### Proof lanes

- ordinary-turn proof subset from [Proof Corpus Plan](/projects/model-memory/proof-corpus-plan)
- use file-local audited fixtures inside `ordinary-turn-capture.test.ts` until the reusable proof harness exists

### Non-goals

- no write-path dedupe or supersession yet
- no projections
- no context engine

## Slice 4 - identity, dedupe, supersession, and write policy

### Files to create

```text
extensions/model-memory/src/semantic-identity.ts
extensions/model-memory/src/write-policy.ts
extensions/model-memory/src/memory-object-store.ts
extensions/model-memory/src/semantic-identity.test.ts
extensions/model-memory/src/write-policy.test.ts
extensions/model-memory/src/memory-object-store.test.ts
```

### Tables touched

- `model_memory.memory_objects`
- `model_memory.write_events`
- `model_memory.supersession_links`

### Validation lanes

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/semantic-identity.test.ts extensions/model-memory/src/write-policy.test.ts extensions/model-memory/src/memory-object-store.test.ts`

### Proof lanes

- duplicate expectations
- supersession expectations
- write-policy override behavior
- use file-local audited fixtures inside `memory-object-store.test.ts` until the reusable proof harness exists

### Non-goals

- no runtime-context tables yet
- no projections
- no context engine

## Slice 5 - runtime read models

### Files to create

```text
extensions/model-memory/src/runtime-read-models.ts
extensions/model-memory/src/runtime/active-memory-slots.ts
extensions/model-memory/src/runtime/active-memory-sets.ts
extensions/model-memory/src/runtime/session-context-state.ts
extensions/model-memory/src/runtime/context-artifacts.ts
extensions/model-memory/src/runtime/active-memory-slots.test.ts
extensions/model-memory/src/runtime/active-memory-sets.test.ts
extensions/model-memory/src/runtime/session-context-state.test.ts
extensions/model-memory/src/runtime/context-artifacts.test.ts
```

### Tables to implement

- `runtime_context.active_memory_slots`
- `runtime_context.active_memory_sets`
- `runtime_context.session_context_state`
- `runtime_context.context_artifacts`

### Validation lanes

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/runtime/active-memory-slots.test.ts extensions/model-memory/src/runtime/active-memory-sets.test.ts extensions/model-memory/src/runtime/session-context-state.test.ts extensions/model-memory/src/runtime/context-artifacts.test.ts`

### Proof lanes

- deterministic materialization checks
- no semantic reinterpretation checks

### Non-goals

- no bootstrap file writes yet
- no retrieval
- no context engine

## Slice 6 - projection compiler

### Files to create

```text
extensions/model-memory/src/projection-compiler.ts
extensions/model-memory/src/runtime/projections/targets.ts
extensions/model-memory/src/runtime/projections/render-memory-md.ts
extensions/model-memory/src/runtime/projections/render-user-md.ts
extensions/model-memory/src/runtime/projections/render-agents-md.ts
extensions/model-memory/src/runtime/projections/file-writer.ts
extensions/model-memory/src/runtime/projections/targets.test.ts
extensions/model-memory/src/runtime/projections/render-memory-md.test.ts
extensions/model-memory/src/runtime/projections/render-user-md.test.ts
extensions/model-memory/src/runtime/projections/render-agents-md.test.ts
```

### Tables to implement

- `runtime_context.workspace_projection_targets`
- `runtime_context.workspace_projection_versions`

### Validation lanes

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/runtime/projections/targets.test.ts extensions/model-memory/src/runtime/projections/render-memory-md.test.ts extensions/model-memory/src/runtime/projections/render-user-md.test.ts extensions/model-memory/src/runtime/projections/render-agents-md.test.ts`

### Proof lanes

- generated-zone ownership tests
- projection determinism tests
- bootstrap input preservation tests informed by [Bootstrap Input Audit](/projects/model-memory/bootstrap-input-audit)

### Non-goals

- no context engine assembly yet
- no retrieval
- no `TOOLS.md` generation

## Slice 7 - context engine without retrieval

### Files to create

```text
extensions/model-memory/src/context-engine.ts
extensions/model-memory/src/runtime/context/bootstrap.ts
extensions/model-memory/src/runtime/context/assemble.ts
extensions/model-memory/src/runtime/context/trim-policy.ts
extensions/model-memory/src/usage-cache-ledger.ts
extensions/model-memory/src/runtime/context/bootstrap.test.ts
extensions/model-memory/src/runtime/context/assemble.test.ts
extensions/model-memory/src/runtime/context/trim-policy.test.ts
extensions/model-memory/src/usage-cache-ledger.test.ts
```

### Tables to implement

- `runtime_context.context_runs`
- `runtime_context.context_run_segments`

### Validation lanes

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/runtime/context/bootstrap.test.ts extensions/model-memory/src/runtime/context/assemble.test.ts extensions/model-memory/src/runtime/context/trim-policy.test.ts extensions/model-memory/src/usage-cache-ledger.test.ts`

### Proof lanes

- stable/semi-stable/volatile segmentation checks
- no-retrieval assembly checks
- cache-hash stability checks

### Non-goals

- no retrieval-driven packing
- no custom compaction ownership
- no shadow mode

## Follow-on slices

### Slice 11 - live database schema and repositories

Goals:

- implement executable migrations for all accepted `model_memory` and `runtime_context` tables
- replace in-memory repositories/stores with database-backed implementations
- preserve the current deterministic semantics and proof contracts

Validation lanes:

- `pnpm check:types`
- targeted repository and migration tests under `extensions/model-memory`

Non-goals:

- no harness cut-in yet
- no cutover
- no legacy backfill

### Slice 12 - real model execution boundaries

Goals:

- implement real model-backed semantic extraction execution
- implement real model-backed retrieval-request interpretation
- keep all model-owned steps versioned and prompt contracts structural

Validation lanes:

- `pnpm check:types`
- targeted interpreter and contract tests under `extensions/model-memory`
- targeted live-disabled execution-path tests with mocked provider boundaries

Non-goals:

- no retrieval reranking requirement
- no cutover
- no prompt-side concrete memory examples

### Slice 13 - live ingestion services and rebuild orchestration

Goals:

- wire document and ordinary-turn capture through persistence plus real interpreters
- add deterministic rebuild/invalidation triggers for read models, projections, and context artifacts
- add internal service/admin entrypoints for controlled execution and replay

Validation lanes:

- `pnpm check:types`
- targeted service, rebuild, and replay tests under `extensions/model-memory`

Non-goals:

- no harness integration yet
- no cutover
- no legacy semantic fallback

### Slice 14 - harness integration

Goals:

- connect projections and context assembly to real OpenClaw runtime seams
- keep retrieval injection explicitly derived and opt-in
- cross-check the usage/cache ledger against real harness usage surfaces

Validation lanes:

- `pnpm check:types`
- targeted runtime integration tests under `extensions/model-memory`

Non-goals:

- no cutover
- no legacy truth bridge

### Slice 15 - operational hardening and shadow rollout

Goals:

- add live shadow adapters for real document and turn surfaces
- add operator inspection, calibration, and drift-review tooling
- define readiness gates for later cutover planning without executing cutover

Validation lanes:

- `pnpm check:types`
- targeted shadow/integration/calibration tests under `extensions/model-memory`

Non-goals:

- no cutover execution
- no legacy deletion
- no VPS purge

## Broad gate policy

During slice implementation:

- prefer targeted tests and `pnpm check:types`
- do not treat a single green targeted lane as proof for unrelated slices

Before landing implementation later:

- run the agreed broader repo gate appropriate for the touched surface
