# Memory Middleware Staging Rehearsal Report

## Purpose

This document records the first controlled non-production rehearsal for the
memory-middleware production adoption plan.

It is a rehearsal report only.

It does not authorize production rollout.

## Rehearsal date

- `2026-04-02`

## Environment used

The actual available staging-like environment in this repo/runtime context was:

- disposable local Docker container
- image: `pgvector/pgvector:pg16`
- database: `memory_middleware_test`
- runtime host: local repo workspace
- Node runtime: `v22.22.0`

This was a staging-like rehearsal lane, not a shared managed staging
environment.

This remains an acceptable disposable rehearsal lane because it is ephemeral.
It is not a second runtime database posture.

## Exact config posture used

- plugin posture:
  - regular bundled plugin behavior only
  - no exclusive memory-slot claim
- database config:
  - `database.driver = postgres`
  - `database.schema = memory_middleware`
  - `database.url = postgresql://postgres@127.0.0.1:<ephemeral-port>/memory_middleware_test`
- middleware mode:
  - `candidateIngress.mode = candidate-only`
- scheduler posture:
  - no background-job runner loop enabled
  - no proactive automation enabled
- third-party skill posture:
  - no Skill Vetter invocation
  - no skill installation

## Rehearsal scope

The rehearsal intentionally covered only:

1. migration `20260401_000001_memory_middleware_schema_v1.sql`
2. migration `20260401_000002_memory_middleware_security_retrieval.sql`
3. passive runtime creation and connectivity
4. one read-only retrieval sanity check
5. one safe bounded write-path sanity check
6. one rollback-disablement analogue
7. ephemeral environment teardown

## Results

### Passed

- schema-v1 migration applied successfully
- security-and-retrieval migration applied successfully
- required extensions were available:
  - `pgcrypto`
  - `pg_trgm`
  - `vector`
- curated views were present after migration 2:
  - `internal_approved_memory_v`
  - `internal_reviewable_candidates_v`
- passive runtime startup caused no writes to:
  - `memory_events`
  - `memory_objects`
  - `memory_sources`
  - `memory_reviews`
  - `background_jobs`
  - `agent_state`
  - `tool_results`
  - `compaction_events`
- passive runtime connectivity check succeeded:
  - `approved_only` memory-object list returned `accepted = true`, `status = ok`, and `records = []`
- safe bounded write-path sanity check succeeded:
  - one candidate-learning submission wrote:
    - `memory_events +1`
    - `memory_objects +1`
    - `memory_sources +1`
  - no writes were observed in:
    - `memory_reviews`
    - `background_jobs`
    - `agent_state`
    - `tool_results`
    - `compaction_events`
- read-only retrieval sanity check succeeded:
  - `include_candidates` memory-object list returned the newly written
    candidate row from `reviewable_candidates_view`
- rollback-disablement analogue succeeded:
  - the same candidate-ingress path returned `status = disabled` when
    `candidateIngress.mode = disabled`
  - no table counts changed during that disabled attempt
- ephemeral environment teardown succeeded:
  - the Docker rehearsal container was removed cleanly

### Failed

- no rehearsal checks failed

## Exact observed outcomes

### Migration checks

- migration 1:
  - `schemaExists = true`
  - `pgcryptoInstalled = true`
- migration 2:
  - `pgTrgmInstalled = true`
  - `vectorInstalled = true`
  - `approvedViewExists = true`
  - `reviewableCandidatesViewExists = true`

### Safe write-path counts

Before candidate submission:

- `memory_events = 0`
- `memory_objects = 0`
- `memory_sources = 0`
- `memory_reviews = 0`
- `background_jobs = 0`
- `agent_state = 0`
- `tool_results = 0`
- `compaction_events = 0`

After candidate submission:

- `memory_events = 1`
- `memory_objects = 1`
- `memory_sources = 1`
- `memory_reviews = 0`
- `background_jobs = 0`
- `agent_state = 0`
- `tool_results = 0`
- `compaction_events = 0`

### Retrieval result shape

The read-only retrieval check returned one candidate record with:

- `readSurface = reviewable_candidates_view`
- `reviewState = candidate`
- the expected seeded project, agent, and session ids
- preserved rehearsal metadata

## What remains disabled

The rehearsal did not enable:

- production rollout
- any shared managed staging environment
- broad scheduler enablement
- background-job automation loops
- proactive automation loops
- procurement workflows
- approval automation beyond already-bounded manual surfaces
- install workflows
- Skill Vetter invocation
- self-improving-agent activation
- runtime memory-slot takeover

## Rollback posture verified in rehearsal conditions

The rehearsal could not validate shared-environment DB restore procedures, but
it did validate the safer first rollback posture for early adoption:

- operational disablement of the write path through mode change
- confirmation that disabled mode prevented new writes
- teardown of the disposable rehearsal environment

That means the rollback posture is partially rehearsed, but shared-environment
backup-and-restore steps still need a later managed staging or preproduction
exercise.

## Recommended adoption-plan corrections

The production adoption plan should explicitly state:

1. the current repo-owned staging-like lane is the disposable local Docker
   `pgvector/pg16` environment used by integration validation
2. this lane is sufficient for migration and bounded runtime rehearsal, but it
   is not a substitute for a later shared managed staging rehearsal
3. rollback has been rehearsed only at the operational-disablement and
   disposable-environment teardown level so far

## Conclusion

The documented production adoption plan is directionally correct.

After this rehearsal:

- migration sequencing looks correct
- passive runtime connectivity looks correct
- the first bounded write and retrieval sanity checks look correct
- the middleware still behaves as a regular non-exclusive plugin

The main remaining gap before any true production-adoption execution slice is a
managed shared staging or preproduction environment with real backup and
restore ownership.
