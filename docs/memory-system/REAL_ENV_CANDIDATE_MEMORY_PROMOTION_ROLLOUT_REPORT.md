# Memory Middleware Real Environment Candidate Memory Promotion Rollout Report

## Purpose

This document records the next real non-disposable environment rollout that
enabled the next bounded workflow step:

Historical note:

- this report records a retired local rollout lane
- `memory-middleware-readonly-rollout-pg` is no longer part of the normal
  runtime posture
- the intended runtime database target is now the shared Supabase-backed
  Postgres schema `memory_middleware`
- local Docker Postgres remains acceptable only as disposable test or bounded
  rehearsal infrastructure

- `memory_candidate_promote_plan`
- `memory_candidate_promote_memory`

The rollout scope was intentionally limited to:

- existing schema presence
- passive runtime connectivity
- read-only retrieval
- bounded candidate ingress through `memory_candidate_submit`
- bounded candidate review through `memory_candidate_review`
- bounded candidate promotion planning
- bounded candidate-to-memory promotion

It did not enable:

- procedure promotion
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
  - `candidateIngress.mode = submit-review-promote-memory`
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
- bounded candidate promotion planning
- bounded candidate-to-memory promotion

## What remained disabled

- procedure promotion
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

This setup allowed retrieval checks before and after the bounded submit,
review, and memory-promotion flow without enabling any broader middleware
write surface.

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

### Bounded candidate promotion planning

Passed.

`memory_candidate_promote_plan` returned an advisory eligible result for the
accepted learning candidate with:

- `possibleTargets = [propose_memory_promotion, remain_candidate_only]`
- `latestReviewOutcome = accepted`
- no writes

### Bounded candidate-to-memory promotion

Passed.

`memory_candidate_promote_memory` promoted the accepted candidate into one
approved durable-memory row and wrote:

- `memory_objects +1`
- `memory_sources +2` for the promoted object provenance rows
- `memory_links +1`

Observed promoted artifact:

- promoted memory review state: `approved`
- promoted memory kind: `project`
- promoted source event id preserved from the original candidate submission
- promoted metadata preserved:
  - `promotedFromCandidateId`
  - `promotedFromReviewId`
  - bounded promotion metadata and rationale

### Retrieval after bounded submit, review, and promotion

Passed.

- approved-memory retrieval remained healthy
- the newly promoted memory object became visible through
  `approved_memory_view`
- the original candidate object remained intact in candidate state

### Disabled surfaces

Passed.

The following remained disabled in `submit-review-promote-memory` mode:

- candidate procedure promotion
- procedure validation
- background-job enqueue
- proactive execution
- reduced-profile self-improving candidate capture

Each returned `status = disabled`, and no additional rows were written beyond
the bounded submit, review, and memory-promotion flow.

### Aggregate row changes

Observed counts after the bounded checks:

- `memory_events = 2`
- `memory_objects = 3`
- `memory_reviews = 1`
- `procedures = 0`
- `procedure_runs = 0`
- `skill_candidates = 0`
- `memory_links = 1`
- `memory_sources = 3`
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
- `memory_candidate_promote_plan` returned `status = disabled`
- `memory_candidate_promote_memory` returned `status = disabled`
- table counts remained unchanged after the disablement checks

This validates the next rollback posture for this target:

1. disable candidate ingress first
2. keep retrieval read-only if inspection is still needed
3. leave schedulers and proactive execution disabled

## Failures

- no rollout validation checks failed

## Conclusion

The third real-environment bounded write rollout succeeded for candidate
promotion planning plus bounded memory promotion on top of candidate submit and
candidate review.

The current real-environment posture now supports:

- passive runtime connectivity
- read-only retrieval
- bounded candidate submission
- bounded candidate review
- bounded candidate promotion planning
- bounded candidate-to-memory promotion

The main remaining gaps before any broader real-environment write rollout are:

- a decision on whether procedure promotion should remain disabled or become
  the next bounded write
- a managed shared staging or preproduction target
- backup and restore ownership in that target
