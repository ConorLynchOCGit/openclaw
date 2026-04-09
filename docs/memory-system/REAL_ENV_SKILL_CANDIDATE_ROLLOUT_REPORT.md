# Memory Middleware Real Environment Skill Candidate Rollout Report

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
- `memory_procedure_validate`
- `memory_skill_candidate_plan`
- `memory_skill_candidate_create`

The rollout scope was intentionally limited to:

- existing schema presence
- passive runtime connectivity
- read-only retrieval
- bounded candidate ingress through `memory_candidate_submit`
- bounded candidate review through `memory_candidate_review`
- bounded candidate promotion planning
- bounded candidate-to-memory promotion
- bounded candidate-to-procedure-draft promotion
- bounded procedure validation
- bounded skill-candidate planning
- bounded skill-candidate creation

It did not enable:

- procurement planning or record writes
- Skill Vetter handoff
- approval planning or approval writes
- install handoff or install record writes
- schedulers
- proactive execution
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
  - `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill`
- automation posture:
  - scheduler disabled
  - proactive execution disabled
- downstream workflow posture:
  - procurement, vetting, approval, and install disabled
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
- bounded procedure validation
- bounded skill-candidate planning
- bounded skill-candidate creation

## What remained disabled

- procurement planning and record writes
- Skill Vetter handoff
- approval planning and approval writes
- install handoff and install record writes
- background-job scheduling
- proactive execution
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
an isolated project, agent, session, and approved memory fixture without
truncating the shared non-production database.

This setup allowed retrieval checks plus blocked later-workflow checks without
expanding the enabled middleware posture.

## Observed results

### Passive runtime startup

Passed.

The first sampled counts immediately after runtime creation and before any tool
calls were:

- `memory_events = 6`
- `memory_objects = 12`
- `memory_reviews = 5`
- `procedures = 4`
- `procedure_runs = 1`
- `skill_candidates = 0`
- `memory_links = 5`
- `memory_sources = 11`
- `background_jobs = 0`
- `agent_state = 0`
- `tool_results = 0`
- `compaction_events = 0`

Only explicit bounded tool calls changed those counts afterward.

### Read-only retrieval before writes

Passed.

- `memory_object_list` with `scope = approved_only` returned the approved
  fixture from `approved_memory_view`

### Bounded candidate submit, review, promotion, and validation

Passed.

The rollout exercised:

- one `learning` candidate submission
- one `procedure` candidate submission
- two accepted candidate reviews
- one bounded memory promotion
- one bounded procedure-draft promotion
- one bounded procedure validation

These preserved the already-enabled posture and produced the expected bounded
candidate, procedure, and validation lineage.

### Bounded skill-candidate planning

Passed.

`memory_skill_candidate_plan` returned an advisory eligible result for the
validated procedure with:

- `possibleTargets = [propose_skill_candidate, remain_validated_procedure_only]`
- `latestValidationRunOutcome = passed`
- `sourceCandidateId` preserved from the validated procedure lineage
- no writes

### Bounded skill-candidate creation

Passed.

`memory_skill_candidate_create` created one bounded skill-candidate row and
wrote:

- `skill_candidates +1`

Observed created skill-candidate artifact:

- status: `candidate`
- `source_procedure_id` preserved from the validated procedure
- `metadata` preserved:
  - `createdFromProcedureId`
  - `sourceCandidateId`
  - `promotedFromReviewId`
  - `sourceEventId`
  - `validationRunId`
  - `creatorAgentId`
  - `creationRationale`
  - bounded `skillCandidateMetadata`

### Retrieval after bounded flow

Passed.

- approved-memory retrieval remained healthy
- the newly promoted memory object became visible through
  `approved_memory_view`
- the original candidate objects remained intact in candidate state
- the validated procedure and the created skill candidate preserved bounded
  lineage without broadening retrieval exposure beyond the already enabled
  explicit scopes

### Disabled surfaces

Passed.

The following remained disabled in
`submit-review-promote-memory-procedure-validate-skill` mode:

- skill-candidate procurement planning
- skill-candidate Skill Vetter handoff
- skill-candidate approval planning
- skill-candidate install handoff
- background-job enqueue
- proactive execution
- reduced-profile self-improving candidate capture

Each returned `status = disabled`, and no additional rows were written beyond
the bounded submit, review, promotion, validation, and skill-candidate flow.

### Aggregate row changes

Observed counts after the bounded checks:

- `memory_events = 8`
- `memory_objects = 15`
- `memory_reviews = 7`
- `procedures = 5`
- `procedure_runs = 2`
- `skill_candidates = 1`
- `memory_links = 7`
- `memory_sources = 15`
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
- `procedure_runs +1`
- `skill_candidates +1`
- `memory_links +2`
- `memory_sources +4`

It did not add:

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
- `memory_procedure_validate` returned `status = disabled`
- `memory_skill_candidate_plan` returned `status = disabled`
- `memory_skill_candidate_create` returned `status = disabled`

Counts remained unchanged during the disablement verification:

- `memory_events = 8`
- `memory_objects = 15`
- `memory_reviews = 7`
- `procedures = 5`
- `procedure_runs = 2`
- `skill_candidates = 1`
- `memory_links = 7`
- `memory_sources = 15`
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
- bounded procedure validation
- bounded skill-candidate planning
- bounded skill-candidate creation

It still does not enable:

- procurement, vetting, approval, or install workflows
- schedulers
- proactive execution
- self-improving-agent activation
- runtime memory-slot takeover
