---
summary: "Fast validation loops for model-memory implementation slices."
title: "Model Memory Validation Loop"
---

# Model Memory Validation Loop

## Objective

Define the default fast lanes before implementation starts so the project does not invent its test strategy mid-build.

## Default rule

Use the smallest honest validation for the touched slice.

For the completed implementation sprints through slice 15:

- do not run full `pnpm test`
- do not run full `pnpm build`
- rely on `pnpm check:types` plus the targeted slice lanes below

## Baseline lane

For any typed runtime change:

- `pnpm check:types`

## Slice lanes

### Slice 1

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/semantic-schema.test.ts extensions/model-memory/src/semantic-validator.test.ts extensions/model-memory/src/prompt-contracts.test.ts extensions/model-memory/src/storage-database-contract.test.ts`

### Slice 2

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/source-adapters/document-source-adapter.test.ts extensions/model-memory/src/document-ingestion.test.ts`

### Slice 3

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/source-adapters/ordinary-turn-source-adapter.test.ts extensions/model-memory/src/ordinary-turn-capture.test.ts`

### Slice 4

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/semantic-identity.test.ts extensions/model-memory/src/write-policy.test.ts extensions/model-memory/src/memory-object-store.test.ts`

### Slice 5

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/runtime/active-memory-slots.test.ts extensions/model-memory/src/runtime/active-memory-sets.test.ts extensions/model-memory/src/runtime/session-context-state.test.ts extensions/model-memory/src/runtime/context-artifacts.test.ts`

### Slice 6

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/runtime/projections/targets.test.ts extensions/model-memory/src/runtime/projections/render-memory-md.test.ts extensions/model-memory/src/runtime/projections/render-user-md.test.ts extensions/model-memory/src/runtime/projections/render-agents-md.test.ts`

### Slice 7

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/runtime/context/bootstrap.test.ts extensions/model-memory/src/runtime/context/assemble.test.ts extensions/model-memory/src/runtime/context/trim-policy.test.ts extensions/model-memory/src/usage-cache-ledger.test.ts`

### Slice 8

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/proof/proof-runner.test.ts extensions/model-memory/src/proof/object-comparison.test.ts extensions/model-memory/src/benchmark/benchmark-runner.test.ts`

### Slice 9

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/retrieval-request-interpreter.test.ts extensions/model-memory/src/retrieval.test.ts extensions/model-memory/src/runtime/context/retrieval-packs.test.ts`

### Slice 10

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/shadow-mode.test.ts extensions/model-memory/src/runtime-comparison.test.ts extensions/model-memory/src/runtime-comparison-report.test.ts`

### Slice 11

- `pnpm check:types`
- targeted repository and migration tests under `extensions/model-memory`

### Slice 12

- `pnpm check:types`
- targeted tests for:
  - real semantic extraction executor boundaries
  - real retrieval-request executor boundaries
  - prompt-contract version recording

### Slice 13

- `pnpm check:types`
- targeted tests for:
  - database-backed document ingestion services
  - database-backed ordinary-turn capture services
  - deterministic invalidation and rebuild orchestration

### Slice 14

- `pnpm check:types`
- targeted tests for:
  - harness-facing projection integration
  - context-engine integration
  - retrieval-pack injection boundaries
  - usage/cache ledger integration

### Slice 15

- `pnpm check:types`
- targeted tests for:
  - live shadow adapters
  - operational inspection surfaces
  - calibration and drift reporting
  - readiness-gate evaluation

## Post-slice-15 baseline

For the pre-cutover readiness phase:

- continue using `pnpm check:types` plus targeted `pnpm test -- <paths...>`
- keep repo-heavy gates out of the iteration loop until an explicit landing or
  cutover bar requires them
- start audited large-document execution from
  [Document Ingestion Inventory](/projects/model-memory/document-ingestion-inventory)
  rather than by inventing ad hoc document picks midstream

## Proof lanes

As soon as the relevant slice exists, run the matching audited corpus subset from [Proof Corpus Plan](/projects/model-memory/proof-corpus-plan).

Before a reusable proof harness exists, those proof lanes run inside the ordinary targeted test files for the slice by using file-local audited fixtures.

The reusable proof harness is a later implementation slice, not a prerequisite for early audited proof.

For real-source proof after the reusable harness exists:

- do not require exact rerun candidate overlap as the admission bar
- do not require exact rerun object-set equality as the admission bar
- require structural validity, provenance quality, bounded semantic
  convergence, bounded active growth, and honest source suitability instead
- treat low candidate overlap or object drift as diagnostic evidence only; the
  actual admission question is whether repeated runs recur on the same core
  durable claims often enough without polluting the active runtime set

Minimum proof lanes:

- document corpus subset
- ordinary-turn corpus subset
- duplicate and supersession cases
- no-durable-memory omission cases

## Broad gate policy

Do not rely on broad repo gates for slice-to-slice feedback.

Use them later at the appropriate landing bar once the implementation slices are complete.
