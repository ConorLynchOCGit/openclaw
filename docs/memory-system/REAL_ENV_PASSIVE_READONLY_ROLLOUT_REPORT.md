# Memory Middleware Real Environment Passive Readonly Rollout Report

## Purpose

This document records the first real non-disposable environment rollout for
`memory-middleware`.

Historical note:

- this report records a retired local rollout lane
- `memory-middleware-readonly-rollout-pg` is no longer part of the normal
  runtime posture
- the intended runtime database target is now the shared Supabase-backed
  Postgres schema `memory_middleware`
- local Docker Postgres remains acceptable only as disposable test or bounded
  rehearsal infrastructure

The rollout scope was intentionally limited to:

- schema presence
- passive runtime connectivity
- read-only retrieval

It did not enable:

- middleware write paths
- schedulers
- proactive execution
- procurement or install workflows
- Skill Vetter invocation
- memory-slot takeover

## Rollout date

- `2026-04-02`

## Exact environment used

The first real non-disposable target available from this repo and runtime
context was:

- target kind: persistent local Docker Postgres
- container name: `memory-middleware-readonly-rollout-pg`
- volume name: `memory-middleware-readonly-rollout-data`
- image: `pgvector/pgvector:pg16`
- host port: `35432`
- database: `memory_middleware_rollout`
- Node runtime used for validation: `v22.22.0`

This is a real non-production environment because:

- it is persistent
- it is not `--rm`
- it uses a named Docker volume
- it is separate from the disposable staging rehearsal lane

This is not a shared managed staging or preproduction environment.

## Exact config posture

- database:
  - `database.driver = postgres`
  - `database.schema = memory_middleware`
- retrieval:
  - `memoryObjectQuery.mode = read-only`
- write posture:
  - `candidateIngress.mode = disabled`
- automation posture:
  - scheduler disabled
  - proactive execution disabled
- plugin posture:
  - regular bundled plugin
  - no exclusive memory-slot claim

## What was enabled

- database connectivity
- schema presence through the two existing migrations
- runtime loading
- read-only retrieval tools:
  - `memory_object_list`
  - `memory_object_get`
  - `memory_object_search_basic`
  - `memory_object_search_hybrid`

## What remained disabled

- candidate ingress and all middleware write paths
- background-job scheduling
- proactive execution
- procurement workflows
- install workflows
- Skill Vetter invocation
- self-improving-agent activation
- runtime memory-slot takeover

## Migration results

Applied successfully in the rollout target:

1. `extensions/memory-middleware/db/migrations/20260401_000001_memory_middleware_schema_v1.sql`
2. `extensions/memory-middleware/db/migrations/20260401_000002_memory_middleware_security_retrieval.sql`

Observed verification:

- `pgcrypto = installed`
- `pg_trgm = installed`
- `vector = installed`
- `internal_approved_memory_v = present`
- `internal_reviewable_candidates_v = present`

## Validation fixture posture

To validate read-only retrieval without enabling middleware write paths, the
rollout target was seeded directly with bounded internal fixture rows for:

- one approved memory object
- one candidate memory object
- one validated procedure

These fixtures exist only in the non-production rollout target and were not
created through enabled middleware write paths.

## Observed results

### Passive runtime startup

Passed.

Observed before and after startup:

- `memory_events = 2`
- `memory_objects = 2`
- `memory_sources = 0`
- `memory_reviews = 0`
- `background_jobs = 0`
- `agent_state = 0`
- `tool_results = 0`
- `compaction_events = 0`
- `procedures = 1`

No automatic writes were observed.

### Approved-memory retrieval

Passed.

- `memory_object_list` with `scope = approved_only` returned the approved
  fixture from `approved_memory_view`
- `memory_object_get` returned the same approved fixture from
  `approved_memory_view`

### Bounded search

Passed.

- `memory_object_search_basic` returned the approved fixture for an
  approved-only query
- `memory_object_search_hybrid` returned the validated procedure first when
  `scope = include_validated_procedures`

### Explicit scope control

Passed.

- candidate object:
  - hidden by default
  - visible only with `scope = include_candidates`
- validated procedure:
  - hidden by default
  - visible only with `scope = include_validated_procedures`

### Disabled surfaces

Passed.

- candidate ingress returned `status = disabled`
- background-job enqueue returned `status = disabled`
- proactive execution returned `status = disabled`
- retrieval with `memoryObjectQuery.mode = disabled` returned `status = disabled`
- no counts changed during those disabled checks

## Rollback or disablement verification

Rollback or disablement was verified in two bounded ways:

1. config-level disablement
   - disabling `memoryObjectQuery.mode` produced disabled retrieval responses
   - write, scheduler, and proactive surfaces remained disabled
2. environment-level disablement
   - the persistent rollout container was stopped successfully
   - the container was started again successfully
   - approved-memory retrieval worked again after restart

This validates the first rollback posture for this target:

- stop the container or disable retrieval config
- keep writes disabled
- restart only after recovery checks pass

## Failures

- no rollout validation checks failed

## Conclusion

The first real-environment passive runtime plus read-only retrieval rollout
succeeded in the safest bounded posture currently available.

The main remaining gaps before any broader real-environment rollout are:

- a shared managed staging or preproduction target
- backup and restore ownership in that target
- a later decision about whether to enable any bounded write paths there
