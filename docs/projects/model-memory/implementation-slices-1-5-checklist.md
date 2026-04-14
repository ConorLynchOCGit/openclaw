---
summary: "Execution checklist for model-memory implementation slices 1 through 5."
title: "Model Memory Slices 1 Through 5 Checklist"
---

# Model Memory Slices 1 Through 5 Checklist

## Objective

Turn the first five implementation slices into an execution-ready checklist so coding can start without improvising sequencing, proof, or validation policy.

## Sprint rule

For this sprint:

- use fast lanes only between slices
- use `pnpm check:types` plus targeted `pnpm test -- ...` lanes only
- do not run full `pnpm test`
- do not run full `pnpm build`

Broad gates are deferred until a later landing bar after these slices are complete.

## Global rules for slices 1 through 5

- implement slices in order
- do not open retrieval early
- do not open projection or context-engine work early
- do not add compatibility shims to “help” legacy behavior
- do not let derived runtime layers become semantic authority
- keep proof local to slice-owned tests until the later reusable proof harness exists

## Slice 1 - schema, validator, prompt contract, and storage contract

### Exact files

Create:

- `extensions/model-memory/package.json`
- `extensions/model-memory/src/index.ts`
- `extensions/model-memory/src/semantic-schema.ts`
- `extensions/model-memory/src/semantic-validator.ts`
- `extensions/model-memory/src/prompt-contracts.ts`
- `extensions/model-memory/src/storage-database-contract.ts`
- `extensions/model-memory/src/semantic-schema.test.ts`
- `extensions/model-memory/src/semantic-validator.test.ts`
- `extensions/model-memory/src/prompt-contracts.test.ts`
- `extensions/model-memory/src/storage-database-contract.test.ts`

### Execution order

1. scaffold the package and export boundary
2. encode canonical classes, kinds, payload envelopes, scope, provenance, confidence, durability, and review mode
3. encode contract metadata shape for model-owned steps
4. encode schema validation rules
5. encode the storage contract for the canonical tables only
6. write shape-only and contract-recording tests

### Table order

Canonical schema only:

1. `model_memory.sources`
2. `model_memory.source_windows`
3. `model_memory.memory_objects`
4. `model_memory.write_events`
5. `model_memory.supersession_links`

### Proof lanes

- shape-only schema fixtures
- contract metadata recording checks
- rejection of excluded legacy fields from runtime truth

### Validation lanes

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/semantic-schema.test.ts extensions/model-memory/src/semantic-validator.test.ts extensions/model-memory/src/prompt-contracts.test.ts extensions/model-memory/src/storage-database-contract.test.ts`

### Non-goals

- no model calls
- no source adapters
- no write-path logic
- no runtime-context tables
- no retrieval
- no projections

### Done when

- canonical object types compile
- validator rejects malformed objects and legacy-shaped excluded fields
- contract metadata requirements are explicit and tested
- canonical storage contract matches the accepted schema doc

## Slice 2 - document adapter and extraction path

### Exact files

Create:

- `extensions/model-memory/src/source-adapters/document-source-adapter.ts`
- `extensions/model-memory/src/semantic-interpreter.ts`
- `extensions/model-memory/src/semantic-extraction-prompt.ts`
- `extensions/model-memory/src/document-ingestion.ts`
- `extensions/model-memory/src/source-adapters/document-source-adapter.test.ts`
- `extensions/model-memory/src/document-ingestion.test.ts`

### Execution order

1. define the document source envelope
2. implement structural normalization and windowing for documents
3. define the semantic interpreter boundary without adding downstream write intelligence
4. encode the extraction prompt contract for documents
5. wire document ingestion from source envelope to validated semantic objects
6. add local audited proof fixtures for the document subset

### Tables touched

- `model_memory.sources`
- `model_memory.source_windows`

### Proof lanes

- document corpus subset from [Proof Corpus Plan](/projects/model-memory/proof-corpus-plan)
- file-local audited fixtures inside `document-ingestion.test.ts`
- omission case for no durable memory

### Validation lanes

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/source-adapters/document-source-adapter.test.ts extensions/model-memory/src/document-ingestion.test.ts`

### Non-goals

- no identity or dedupe
- no supersession
- no runtime read models
- no retrieval
- no projections
- no context engine

### Done when

- raw document input normalizes into source windows deterministically
- document extraction returns only schema-valid canonical objects or omission
- no semantic branching lives inside the adapter

## Slice 3 - ordinary-turn adapter and extraction path

### Exact files

Create:

- `extensions/model-memory/src/source-adapters/ordinary-turn-source-adapter.ts`
- `extensions/model-memory/src/ordinary-turn-capture.ts`
- `extensions/model-memory/src/source-adapters/ordinary-turn-source-adapter.test.ts`
- `extensions/model-memory/src/ordinary-turn-capture.test.ts`

### Execution order

1. define the ordinary-turn source envelope
2. normalize turn input and bounded recent context without semantic pre-routing
3. reuse the semantic interpreter boundary from slice 2
4. wire ordinary-turn capture from turn envelope to validated semantic objects
5. add local audited proof fixtures for the ordinary-turn subset

### Tables touched

- `model_memory.sources`
- `model_memory.source_windows`

### Proof lanes

- ordinary-turn corpus subset from [Proof Corpus Plan](/projects/model-memory/proof-corpus-plan)
- file-local audited fixtures inside `ordinary-turn-capture.test.ts`
- omission case for no durable memory

### Validation lanes

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/source-adapters/ordinary-turn-source-adapter.test.ts extensions/model-memory/src/ordinary-turn-capture.test.ts`

### Non-goals

- no write-path dedupe
- no supersession
- no retrieval
- no projections
- no context engine

### Done when

- ordinary-turn capture uses the same semantic contract as documents
- turn capture does not rely on regex or keyword semantic triggers
- proof covers preference, fact, rule, procedure, reference, and omission

## Slice 4 - deterministic write path

### Exact files

Create:

- `extensions/model-memory/src/semantic-identity.ts`
- `extensions/model-memory/src/write-policy.ts`
- `extensions/model-memory/src/memory-object-store.ts`
- `extensions/model-memory/src/semantic-identity.test.ts`
- `extensions/model-memory/src/write-policy.test.ts`
- `extensions/model-memory/src/memory-object-store.test.ts`

### Execution order

1. define normalized identity rules by canonical object kind
2. define same-slot supersession eligibility rules
3. implement write-policy override behavior for v1
4. implement durable object store behavior against the canonical storage contract
5. add duplicate and supersession proof fixtures

### Tables touched

- `model_memory.memory_objects`
- `model_memory.write_events`
- `model_memory.supersession_links`

### Proof lanes

- duplicate expectations from [Proof Corpus Plan](/projects/model-memory/proof-corpus-plan)
- supersession expectations from [Proof Corpus Plan](/projects/model-memory/proof-corpus-plan)
- write-policy override behavior
- file-local audited fixtures inside `memory-object-store.test.ts`

### Validation lanes

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/semantic-identity.test.ts extensions/model-memory/src/write-policy.test.ts extensions/model-memory/src/memory-object-store.test.ts`

### Non-goals

- no fuzzy merge
- no retrieval ranking
- no runtime-context tables
- no projections
- no context engine

### Done when

- exact normalized duplicates dedupe deterministically
- allowed same-slot replacements produce explicit supersession links
- v1 write execution auto-accept behavior is enforced without redefining semantics

## Slice 5 - runtime read models and artifacts

### Exact files

Create:

- `extensions/model-memory/src/runtime-read-models.ts`
- `extensions/model-memory/src/runtime/active-memory-slots.ts`
- `extensions/model-memory/src/runtime/active-memory-sets.ts`
- `extensions/model-memory/src/runtime/session-context-state.ts`
- `extensions/model-memory/src/runtime/context-artifacts.ts`
- `extensions/model-memory/src/runtime/active-memory-slots.test.ts`
- `extensions/model-memory/src/runtime/active-memory-sets.test.ts`
- `extensions/model-memory/src/runtime/session-context-state.test.ts`
- `extensions/model-memory/src/runtime/context-artifacts.test.ts`

### Execution order

1. implement `active_memory_slots`
2. implement `active_memory_sets`
3. implement `session_context_state`
4. implement `context_artifacts`
5. add deterministic materialization tests proving these layers are derived only

### Table order

1. `runtime_context.active_memory_slots`
2. `runtime_context.active_memory_sets`
3. `runtime_context.session_context_state`
4. `runtime_context.context_artifacts`

### Proof lanes

- deterministic materialization checks
- no semantic reinterpretation checks
- no second-ontology checks on derived layers

### Validation lanes

- `pnpm check:types`
- `pnpm test -- extensions/model-memory/src/runtime/active-memory-slots.test.ts extensions/model-memory/src/runtime/active-memory-sets.test.ts extensions/model-memory/src/runtime/session-context-state.test.ts extensions/model-memory/src/runtime/context-artifacts.test.ts`

### Non-goals

- no bootstrap file writes yet
- no retrieval
- no projection compiler
- no context engine

### Done when

- single-valued and multi-valued read models materialize deterministically from canonical objects
- session working state is explicitly non-semantic
- context artifacts are auditable derivatives, not semantic truth

## Between-slice loop

For each slice:

1. implement only the declared scope
2. run `pnpm check:types`
3. run the targeted slice test command
4. fix failures before moving forward
5. do not run full `pnpm test`
6. do not run full `pnpm build`

## Next checkpoint after slice 5

If slices 1 through 5 are green, the next implementation surface is:

- projection compiler
- then context engine without retrieval

Those remain intentionally outside this sprint checkpoint.
