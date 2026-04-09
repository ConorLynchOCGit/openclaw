# Memory Middleware Real Environment Candidate Review Rollout Report

## Purpose

This document records the next real non-disposable environment rollout that
enabled one additional middleware write path:

Historical note:

- this report records a retired local rollout lane
- `memory-middleware-readonly-rollout-pg` is no longer part of the normal
  runtime posture
- the intended runtime database target is now the shared Supabase-backed
  Postgres schema `memory_middleware`
- local Docker Postgres remains acceptable only as disposable test or bounded
  rehearsal infrastructure

- `memory_candidate_review`

The rollout scope was intentionally limited to:

- existing schema presence
- passive runtime connectivity
- read-only retrieval
- bounded candidate ingress through `memory_candidate_submit`
- bounded candidate review through `memory_candidate_review`

It did not enable:

- candidate promotion
- procedure validation
- skill-candidate governance
- schedulers
- proactive execution
- procurement or install workflows
- Skill Vetter invocation
- self-improving-agent activation
- memory-slot takeover

## Rollout date

- `2026-04-02`

## Exact environment used

The real non-production target used for this rollout was:

- target kind: persistent local Docker Postgres
- container name: `memory-middleware-readonly-rollout-pg`
- volume name: `memory-middleware-readonly-rollout-data`
- image: `pgvector/pgvector:pg16`
- host port: `35432`
- database: `memory_middleware_rollout`
- Node runtime used for validation: `v22.22.0`

This remains a real non-production environment because:

- it is persistent
- it uses a named Docker volume
- it is separate from the disposable staging rehearsal lane
- it is not production or a shared primary environment

## Exact config posture

- database:
  - `database.driver = postgres`
  - `database.schema = memory_middleware`
- retrieval:
  - `memoryObjectQuery.mode = read-only`
- write posture:
  - `candidateIngress.mode = submit-review-only`
- automation posture:
  - scheduler disabled
  - proactive execution disabled
- plugin posture:
  - regular bundled plugin
  - no exclusive memory-slot claim

## What was enabled

- database connectivity
- existing schema and retrieval substrate
- runtime loading
- read-only retrieval tools
- bounded candidate submission
- bounded candidate review

## What remained disabled

- candidate promotion
- procedure validation
- skill-candidate governance
- procurement workflows
- install workflows
- background-job scheduling
- proactive execution
- Skill Vetter invocation
- self-improving-agent activation
- runtime memory-slot takeover

## Migration and substrate status

The rollout reused the already-present real-environment schema and confirmed:

- `pgcrypto = installed`
- `pg_trgm = installed`
- `vector = installed`
- `internal_approved_memory_v = present`
- `internal_reviewable_candidates_v = present`

No new schema changes or new migrations were required for this slice.

## Validation fixture posture

For a clean bounded validation, the target database was truncated and then
seeded directly with:

- one project
- one agent
- one session
- one approved memory fixture

This setup allowed retrieval checks before and after the bounded submit plus
review flow without enabling any broader middleware write surface.

## Observed results

### Passive runtime startup

Passed.

Observed before and after runtime creation:

- `memory_events = 1`
- `memory_objects = 1`
- `memory_reviews = 0`
- `procedures = 0`
- `procedure_runs = 0`
- `skill_candidates = 0`
- `memory_links = 0`
- `memory_sources = 0`
- `background_jobs = 0`
- `agent_state = 0`
- `tool_results = 0`
- `compaction_events = 0`

No automatic writes were observed.

### Read-only retrieval before writes

Passed.

- `memory_object_list` with `scope = approved_only` returned the approved
  fixture from `approved_memory_view`

### Bounded candidate submit

Passed.

`memory_candidate_submit` accepted one `learning` submission and wrote:

- `memory_events +1`
- `memory_objects +1`
- `memory_sources +1`

### Bounded candidate review

Passed.

`memory_candidate_review` recorded one accepted review and wrote:

- `memory_reviews +1`

Observed review artifact:

- `action = approve`
- `resulting_state = approved`
- `reviewer_agent_id = seeded reviewer agent`

The review result itself reported:

- `status = recorded`
- `memoryObjectStateChanged = false`
- `reviewState = candidate`

The candidate object remained visible only through explicit
`scope = include_candidates`.

### Retrieval after bounded submit plus review

Passed.

- approved-memory retrieval remained healthy and unchanged
- the newly written candidate object remained visible only with explicit
  candidate scope

### Disabled surfaces

Passed.

The following remained disabled in `submit-review-only` mode:

- candidate promotion planning
- background-job enqueue
- proactive execution
- reduced-profile self-improving candidate capture

Each returned `status = disabled`, and no additional rows were written beyond
the bounded submit plus review flow.

### Aggregate row changes

Observed counts after the bounded checks:

- `memory_events = 2`
- `memory_objects = 2`
- `memory_reviews = 1`
- `procedures = 0`
- `procedure_runs = 0`
- `skill_candidates = 0`
- `memory_links = 0`
- `memory_sources = 1`
- `background_jobs = 0`
- `agent_state = 0`
- `tool_results = 0`
- `compaction_events = 0`

No broader writes or follow-on side effects were observed.

## Rollback or disablement verification

Rollback or disablement was verified in a bounded way by switching back to:

- `candidateIngress.mode = disabled`
- `memoryObjectQuery.mode = read-only`

Observed result:

- `memory_candidate_submit` returned `status = disabled`
- `memory_candidate_review` returned `status = disabled`
- table counts remained unchanged after the disablement checks

This validates the next rollback posture for this target:

1. disable candidate ingress first
2. keep retrieval read-only if inspection is still needed
3. leave schedulers and proactive execution disabled

## Failures

- no rollout validation checks failed

## Conclusion

The second real-environment bounded write rollout succeeded for
`memory_candidate_review` in addition to `memory_candidate_submit`.

The current real-environment posture now supports:

- passive runtime connectivity
- read-only retrieval
- bounded candidate submission
- bounded candidate review

The main remaining gaps before any broader real-environment write rollout are:

- a decision on whether promotion should remain disabled or become the next
  bounded write
- a managed shared staging or preproduction target
- backup and restore ownership in that target
