# Memory Middleware Real Environment Candidate Procedure Promotion Rollout Report

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
- `memory_candidate_promote_procedure`

The rollout scope was intentionally limited to:

- existing schema presence
- passive runtime connectivity
- read-only retrieval
- bounded candidate ingress through `memory_candidate_submit`
- bounded candidate review through `memory_candidate_review`
- bounded candidate promotion planning
- bounded candidate-to-memory promotion
- bounded candidate-to-procedure-draft promotion

It did not enable:

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
- image: `pgvector/pgvector:pg16`
- host port: `35432`
- database: `memory_middleware_rollout`
- Node runtime used for validation: `v22.22.0`

This remains a real non-production environment because:

- it is persistent
- it is separate from the disposable staging rehearsal lane
- it is not production or a shared primary environment

## Exact config posture

- database:
  - `database.driver = postgres`
  - `database.schema = memory_middleware`
- retrieval:
  - `memoryObjectQuery.mode = read-only`
- write posture:
  - `candidateIngress.mode = submit-review-promote-memory-procedure`
- automation posture:
  - scheduler disabled
  - proactive execution disabled
- downstream workflow posture:
  - procedure validation disabled
  - skill-candidate governance disabled
  - procurement and install disabled
  - self-improving capture disabled
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
- bounded candidate-to-procedure-draft promotion

## What remained disabled

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

For bounded validation inside the existing persistent target, the rollout added
an isolated project, agent, session, approved memory fixture, and validated
procedure fixture without truncating the shared non-production database.

This setup allowed retrieval checks plus blocked later-workflow checks without
expanding the enabled middleware posture.

## Observed results

### Passive runtime startup

Passed.

The first sampled counts immediately after runtime creation and before any tool
calls were:

- `memory_events = 2`
- `memory_objects = 4`
- `memory_reviews = 1`
- `procedures = 1`
- `procedure_runs = 0`
- `skill_candidates = 0`
- `memory_links = 1`
- `memory_sources = 3`
- `background_jobs = 0`
- `agent_state = 0`
- `tool_results = 0`
- `compaction_events = 0`

Only explicit bounded tool calls changed those counts afterward.

### Read-only retrieval before writes

Passed.

- `memory_object_list` with `scope = approved_only` returned the approved
  fixture from `approved_memory_view`

### Bounded candidate submit

Passed.

Two submissions were exercised:

- one `learning` submission for bounded durable-memory promotion
- one `procedure` submission for bounded procedure-draft promotion

Together they wrote:

- `memory_events +2`
- `memory_objects +2`
- `memory_sources +2`

### Bounded candidate review

Passed.

Two accepted candidate reviews were recorded and wrote:

- `memory_reviews +2`

### Bounded candidate promotion planning

Passed.

`memory_candidate_promote_plan` returned bounded advisory results for both:

- the accepted learning candidate with
  `possibleTargets = [propose_memory_promotion, remain_candidate_only]`
- the accepted procedure candidate with
  `possibleTargets = [propose_procedure_draft, remain_candidate_only]`

No planning writes occurred.

### Bounded candidate-to-memory promotion

Passed.

`memory_candidate_promote_memory` promoted the accepted learning candidate into
one approved durable-memory row and wrote:

- `memory_objects +1`
- `memory_sources +2`
- `memory_links +1`

### Bounded candidate-to-procedure-draft promotion

Passed.

`memory_candidate_promote_procedure` promoted the accepted procedure candidate
into one bounded draft procedure and wrote:

- `procedures +1`
- `memory_links +1`

Observed promoted procedure artifact:

- procedure status: `draft`
- `source_memory_object_id` preserved from the reviewed procedure candidate
- promoted source event id preserved from the original candidate submission
- procedure metadata preserved:
  - `promotedFromCandidateId`
  - `promotedFromReviewId`
  - bounded promotion metadata and rationale
- no `skill_candidates` rows were created

### Retrieval after bounded submit, review, and promotion

Passed.

- approved-memory retrieval remained healthy
- the newly promoted memory object became visible through
  `approved_memory_view`
- the original candidate objects remained intact in candidate state
- the promoted procedure draft existed in `procedures` with preserved bounded
  lineage and did not broaden retrieval exposure beyond the existing explicit
  scopes

### Disabled surfaces

Passed.

The following remained disabled in
`submit-review-promote-memory-procedure` mode:

- procedure validation
- skill-candidate creation
- background-job enqueue
- proactive execution
- reduced-profile self-improving candidate capture

Each returned `status = disabled`, and no additional rows were written beyond
the bounded submit, review, and promotion flow.

### Aggregate row changes

Observed counts after the bounded checks:

- `memory_events = 4`
- `memory_objects = 7`
- `memory_reviews = 3`
- `procedures = 2`
- `procedure_runs = 0`
- `skill_candidates = 0`
- `memory_links = 3`
- `memory_sources = 7`
- `background_jobs = 0`
- `agent_state = 0`
- `tool_results = 0`
- `compaction_events = 0`

Relative to the first sampled post-startup baseline for this rollout, the
bounded flow added only:

- `memory_events +2`
- `memory_objects +3`
- `memory_reviews +2`
- `procedures +1`
- `memory_links +2`
- `memory_sources +4`

It did not add:

- `procedure_runs`
- `skill_candidates`
- `background_jobs`
- `agent_state`
- `tool_results`
- `compaction_events`

## Rollback or disablement verification

Passed.

The same target was rechecked with `candidateIngress.mode = disabled`.

In that posture:

- `memory_candidate_submit` returned `status = disabled`
- `memory_candidate_review` returned `status = disabled`
- `memory_candidate_promote_plan` returned `status = disabled`
- `memory_candidate_promote_memory` returned `status = disabled`
- `memory_candidate_promote_procedure` returned `status = disabled`

Counts remained unchanged during the disablement verification:

- `memory_events = 4`
- `memory_objects = 7`
- `memory_reviews = 3`
- `procedures = 2`
- `procedure_runs = 0`
- `skill_candidates = 0`
- `memory_links = 3`
- `memory_sources = 7`
- `background_jobs = 0`
- `agent_state = 0`
- `tool_results = 0`
- `compaction_events = 0`

## Outcome

This rollout succeeded.

The existing real non-disposable non-production target now safely supports:

- read-only retrieval
- bounded candidate submit
- bounded candidate review
- bounded candidate promotion planning
- bounded candidate-to-memory promotion
- bounded candidate-to-procedure-draft promotion

It still does not enable:

- procedure validation
- skill-candidate governance
- schedulers
- proactive execution
- procurement or install automation
- Skill Vetter invocation
- self-improving-agent activation
- runtime memory-slot takeover
