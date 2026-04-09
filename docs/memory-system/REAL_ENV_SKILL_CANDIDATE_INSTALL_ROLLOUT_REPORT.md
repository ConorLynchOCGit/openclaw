# Memory Middleware Real Environment Skill Candidate Install Rollout Report

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

- `memory_skill_candidate_install_handoff`
- `memory_skill_candidate_install_record_create`

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
- bounded approval planning and approval-state recording
- bounded manual install handoff
- bounded installed-skill record creation

It did not enable:

- actual skill installation
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
  - `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
- automation posture:
  - scheduler disabled
  - proactive execution disabled
- downstream workflow posture:
  - actual installation disabled
  - automatic Skill Vetter invocation disabled
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
- bounded approval planning
- bounded approval-state recording
- bounded manual install handoff preparation
- bounded internal install-record creation

## What remained disabled

- actual skill installation
- background-job scheduling
- proactive execution
- automatic Skill Vetter invocation
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
an isolated project, agent, session, approved-memory fixture, and validated
procedure fixture without truncating the shared non-production database.

This setup allowed retrieval checks, the full bounded candidate-to-skill path,
procurement planning plus procurement-record creation, manual Skill Vetter
handoff preparation, one vetting-result write, bounded approval planning, one
approval-state write, bounded manual install handoff preparation, one
install-record write, and blocked later-workflow checks without broadening the
enabled middleware posture.

## Observed results

### Passive runtime startup

Passed.

The first sampled counts before fixture seeding for this rollout were:

- `memory_events = 25`
- `memory_objects = 29`
- `memory_reviews = 13`
- `procedures = 10`
- `procedure_runs = 5`
- `skill_candidates = 4`
- `memory_links = 13`
- `memory_sources = 27`
- `background_jobs = 0`
- `agent_state = 0`
- `tool_results = 0`
- `compaction_events = 0`

Only explicit bounded tool calls and the isolated fixture changed those counts
afterward.

### Read-only retrieval before writes

Passed.

- `memory_object_list` with `scope = approved_only` returned the approved
  fixture from `approved_memory_view`

### Bounded candidate, procedure, skill-candidate, procurement, vetting, and approval flow

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
- one bounded manual Skill Vetter handoff result
- one bounded manual vetting-result record
- one bounded approval planning result
- one bounded approval-state write

### Bounded manual install handoff

Passed.

`memory_skill_candidate_install_handoff` returned an eligible advisory result
with:

- `skillCandidateStatus = approved_limited`
- `approvedScope = limited`
- `possibleTargets = [propose_manual_install_handoff, remain_approved_internal_only]`
- persisted `approvalRecordId`, `procurementRecordId`, and
  `vettingResultRecordId`
- `latestValidationRunOutcome = passed`
- explicit manual install guardrails
- no writes

### Bounded installed-skill record creation

Passed.

`memory_skill_candidate_install_record_create` created one bounded internal
install record and wrote:

- `memory_events +1`

Observed created install artifact:

- `event_name = skill_candidate.install_record`
- `event_kind = review`
- `metadata` preserved:
  - `skillCandidateId = fad807a6-6c2b-445a-80f9-ffb8191c0ae0`
  - `installedScope = limited`
  - `approvalRecordId = d6692177-2f48-4cae-9ee0-efe1cfd4012f`
  - `procurementRecordId = 5cecf1e9-a920-456a-abc2-6fd923168221`
  - `vettingResultRecordId = 2afb6601-3d6c-480d-b75e-2740b71028d6`
  - `sourceProcedureId = 99f98f28-6618-4897-99af-06e3208cdd76`
  - `sourceCandidateId = 23ea0127-2f64-4571-98f8-287bfe8bb70c`
  - `installerAgentId`
  - `installNotes`
  - bounded `installMetadata`

Observed skill-candidate state after the write:

- `status = approved_limited`
- no installed runtime state was created
- bounded approval lineage remained preserved in metadata

### Retrieval after bounded flow

Passed.

- approved-memory retrieval remained healthy
- the newly promoted memory object remained visible through
  `approved_memory_view`
- the approved skill candidate preserved bounded lineage and approval metadata
- install-record creation did not broaden retrieval exposure or perform an
  actual installation

### Disabled surfaces

Passed.

The following remained disabled in
`submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
mode:

- actual installation
- `memory_background_job_enqueue`
- `memory_proactive_execute`
- `memory_self_improving_capture_candidate`

Each returned `status = disabled`, and no additional rows were written beyond
the bounded submit, review, promotion, validation, skill-candidate,
procurement, vetting, approval, and install-record flow.

### Aggregate row changes

Observed counts after the bounded checks:

- `memory_events = 33`
- `memory_objects = 34`
- `memory_reviews = 15`
- `procedures = 12`
- `procedure_runs = 6`
- `skill_candidates = 5`
- `memory_links = 15`
- `memory_sources = 31`
- `background_jobs = 0`
- `agent_state = 0`
- `tool_results = 0`
- `compaction_events = 0`

Relative to the first sampled pre-fixture baseline for this rollout, the
bounded flow added only:

- `memory_events +8`
- `memory_objects +5`
- `memory_reviews +2`
- `procedures +2`
- `procedure_runs +1`
- `skill_candidates +1`
- `memory_links +2`
- `memory_sources +4`

It did not add:

- `background_jobs`
- `agent_state`
- `tool_results`
- `compaction_events`

The extra `memory_events +8` reflects:

- one approved-memory fixture seed event
- one candidate-memory fixture seed event
- two candidate submission events
- one internal procurement-record event
- one internal vetting-result event
- one internal approval event
- one internal install-record event

The extra `memory_objects +5` reflects:

- one approved-memory fixture object
- one candidate-memory fixture object
- two candidate objects
- one promoted approved-memory object

No actual installation, scheduler, proactive, or self-improving rows were
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
- `memory_skill_candidate_approval_plan` returned `status = disabled`
- `memory_skill_candidate_approve` returned `status = disabled`
- `memory_skill_candidate_install_handoff` returned `status = disabled`
- `memory_skill_candidate_install_record_create` returned `status = disabled`

The sampled table counts were identical before and after that disablement
check, so no additional writes occurred.

## Conclusion

This rollout successfully extended the real non-disposable non-production
target from bounded approval state to bounded manual install-handoff
preparation plus one internal install-record write.

The slice stayed narrow:

- retrieval remained healthy
- submit, review, memory promotion, procedure promotion, procedure
  validation, skill-candidate planning or creation, procurement, manual
  vetting, and approval flows remained healthy
- actual installation, scheduler, proactive, and self-improving surfaces
  remained disabled
- no schema changes, no production changes, and no memory-slot takeover were
  introduced
