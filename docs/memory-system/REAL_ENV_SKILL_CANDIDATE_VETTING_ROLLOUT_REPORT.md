# Memory Middleware Real Environment Skill Candidate Vetting Rollout Report

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

- `memory_skill_candidate_skill_vetter_handoff`
- `memory_skill_candidate_vetting_result_record`

The rollout scope remained intentionally limited to:

- existing schema presence
- passive runtime connectivity
- read-only retrieval
- bounded candidate submission and review
- bounded candidate promotion planning plus memory promotion
- bounded procedure-draft promotion
- bounded procedure validation
- bounded skill-candidate planning and creation
- bounded procurement planning and procurement-record creation
- bounded manual Skill Vetter handoff preparation
- bounded manual vetting-result recording

It did not enable:

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

## Exact config posture

- database:
  - `database.driver = postgres`
  - `database.schema = memory_middleware`
- retrieval:
  - `memoryObjectQuery.mode = read-only`
- write posture:
  - `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting`
- automation posture:
  - scheduler disabled
  - proactive execution disabled
- downstream workflow posture:
  - approval and install disabled
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
- bounded procurement planning
- bounded internal procurement-record creation
- bounded manual Skill Vetter handoff preparation
- bounded manual vetting-result recording

## What remained disabled

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
an isolated project, agent, session, approved memory fixture, and validated
procedure fixture without truncating the shared non-production database.

This setup allowed retrieval checks, the full bounded candidate and
procedure-to-skill path, procurement planning plus procurement-record
creation, manual Skill Vetter handoff preparation, one vetting-result write,
and blocked later-workflow checks without broadening the enabled middleware
posture.

## Observed results

### Passive runtime startup

Passed.

The first sampled counts immediately after runtime creation and before any tool
calls were:

- `memory_events = 15`
- `memory_objects = 22`
- `memory_reviews = 9`
- `procedures = 8`
- `procedure_runs = 3`
- `skill_candidates = 2`
- `memory_links = 9`
- `memory_sources = 19`
- `background_jobs = 0`
- `agent_state = 0`
- `tool_results = 0`
- `compaction_events = 0`

Only explicit bounded tool calls changed those counts afterward.

### Read-only retrieval before writes

Passed.

- `memory_object_list` with `scope = approved_only` returned the approved
  fixture from `approved_memory_view`

### Bounded candidate, procedure, skill-candidate, and procurement flow

Passed.

The rollout exercised:

- one `learning` candidate submission
- one `procedure` candidate submission
- two accepted candidate reviews
- one bounded memory promotion
- one bounded procedure-draft promotion
- one bounded procedure validation
- one bounded skill-candidate planning result
- one bounded skill-candidate creation
- one bounded procurement planning result
- one bounded procurement-record creation

These preserved the already-enabled posture and produced the expected bounded
candidate, procedure, validation, skill-candidate, and procurement lineage.

### Bounded manual Skill Vetter handoff

Passed.

`memory_skill_candidate_skill_vetter_handoff` returned an advisory eligible
result with:

- `possibleTargets = [propose_skill_vetter_handoff, remain_internal_only]`
- `latestValidationRunOutcome = passed`
- the persisted procurement record id
- preserved `sourceProcedureId` and `sourceCandidateId`
- the full bounded manual handoff package
- explicit manual steps and install guardrails
- no writes

### Bounded manual vetting-result recording

Passed.

`memory_skill_candidate_vetting_result_record` created one bounded internal
manual vetting-result record and wrote:

- `memory_events +1`

Observed created vetting-result artifact:

- `event_name = skill_candidate.vetting_result`
- `event_kind = review`
- `metadata` preserved:
  - `skillCandidateId`
  - `procurementRecordId`
  - `sourceProcedureId`
  - `sourceCandidateId`
  - `reviewerAgentId`
  - `vettingDecision`
  - `vettingSummary`
  - bounded `vettingResultMetadata`

### Retrieval after bounded flow

Passed.

- approved-memory retrieval remained healthy
- the newly promoted memory object remained visible through
  `approved_memory_view`
- the created skill candidate preserved bounded lineage
- the procurement and vetting records did not broaden retrieval exposure or
  mutate approved memory state beyond the already-enabled bounded flow

### Disabled surfaces

Passed.

The following remained disabled in
`submit-review-promote-memory-procedure-validate-skill-procurement-vetting`
mode:

- `memory_skill_candidate_approval_plan`
- `memory_skill_candidate_install_handoff`
- `memory_background_job_enqueue`
- `memory_proactive_execute`
- `memory_self_improving_capture_candidate`

Each returned `status = disabled`, and no additional rows were written beyond
the bounded submit, review, promotion, validation, skill-candidate,
procurement, and vetting flow.

### Aggregate row changes

Observed counts after the bounded checks:

- `memory_events = 19`
- `memory_objects = 25`
- `memory_reviews = 11`
- `procedures = 9`
- `procedure_runs = 4`
- `skill_candidates = 3`
- `memory_links = 11`
- `memory_sources = 23`
- `background_jobs = 0`
- `agent_state = 0`
- `tool_results = 0`
- `compaction_events = 0`

Relative to the first sampled post-startup baseline for this rollout, the
bounded flow added only:

- `memory_events +4`
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

The extra `memory_events +4` reflects:

- the two explicit fixture seed events used for isolated retrieval checks
- one internal procurement-record event
- one internal vetting-result event

No approval, install, scheduler, proactive, or self-improving rows were
written.

## Rollback or disablement verification

Bounded disablement verification passed.

The same target was rechecked with:

- `candidateIngress.mode = disabled`
- `memoryObjectQuery.mode = read-only`

Under that posture:

- `memory_candidate_submit` returned `status = disabled`
- `memory_candidate_review` returned `status = disabled`
- `memory_candidate_promote_plan` returned `status = disabled`
- `memory_candidate_promote_memory` returned `status = disabled`
- `memory_candidate_promote_procedure` returned `status = disabled`
- `memory_procedure_validate` returned `status = disabled`
- `memory_skill_candidate_plan` returned `status = disabled`
- `memory_skill_candidate_create` returned `status = disabled`
- `memory_skill_candidate_procurement_plan` returned `status = disabled`
- `memory_skill_candidate_procurement_record_create` returned `status = disabled`
- `memory_skill_candidate_skill_vetter_handoff` returned `status = disabled`
- `memory_skill_candidate_vetting_result_record` returned `status = disabled`

The sampled table counts were identical before and after that disablement
check, so no additional writes occurred.

## Conclusion

This rollout successfully extended the real non-disposable non-production
target from bounded procurement state to bounded manual Skill Vetter handoff
preparation and one internal vetting-result write.

The slice stayed narrow:

- retrieval remained healthy
- submit, review, memory promotion, procedure promotion, procedure
  validation, skill-candidate planning or creation, and procurement flows
  remained healthy
- approval, install, scheduler, proactive, and self-improving surfaces
  remained disabled
- no schema changes, no production changes, and no memory-slot takeover were
  introduced
