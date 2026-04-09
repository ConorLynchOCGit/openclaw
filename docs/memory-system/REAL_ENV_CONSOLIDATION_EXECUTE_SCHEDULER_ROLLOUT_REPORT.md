# Memory Middleware Real Environment Consolidation Execute Scheduler Rollout Report

## Purpose

This report records the first live execute-class scheduler rollout for
`consolidation_execute` in the existing real non-production environment.

Historical note:

- this report records a retired local rollout lane
- `memory-middleware-readonly-rollout-pg` is no longer part of the normal
  runtime posture
- the intended runtime database target is now the shared Supabase-backed
  Postgres schema `memory_middleware`
- local Docker Postgres remains acceptable only as disposable test or bounded
  rehearsal infrastructure

This slice enabled only the already-bounded low-risk consolidation actions:

- `duplicate_merge_review`
- `stale_superseded_review`

It did not enable:

- `contradiction_review`
- `drift_check_review` through consolidation
- procurement or install automation
- automatic Skill Vetter invocation
- self-improving capture
- memory-slot takeover

## Rollout date

- `2026-04-02`

## Exact environment used

The real environment used was the existing persistent local non-production
Docker target:

- container `memory-middleware-readonly-rollout-pg`
- volume `memory-middleware-readonly-rollout-data`
- image `pgvector/pgvector:pg16`
- host port `35432`
- database `memory_middleware_rollout`
- Node `v22.22.0`

## Exact config posture

The rollout used:

- `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
- `memoryObjectQuery.mode = read-only`
- `backgroundJobs.inspectionMode = enabled`
- `backgroundJobs.advisorySchedulingMode = enabled`
- `backgroundJobs.advisoryJobClasses = [proactive_plan, consolidation_plan]`
- `backgroundJobs.executeSchedulingMode = enabled`
- `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check, consolidation_execute]`
- `backgroundJobs.runnerOwnerId = rollout-runner-1`

## What was enabled

- retrieval remained enabled in read-only mode
- the previously enabled bounded governance path remained enabled
- advisory background-job scheduling remained enabled for:
  - `proactive_plan`
  - `consolidation_plan`
- execute-class background-job scheduling remained enabled for:
  - `proactive_execute_run_drift_check`
  - `consolidation_execute`

## What remained disabled

- `contradiction_review` execution through consolidation
- `drift_check_review` execution through consolidation
- any additional execute-class jobs beyond:
  - `proactive_execute_run_drift_check`
  - `consolidation_execute`
- procurement or install automation
- automatic Skill Vetter invocation
- self-improving capture
- actual installation
- memory-slot takeover

## Validation fixture posture

The live validation created a bounded duplicate-memory fixture with:

- `projectId = 3f1ac03a-5121-4465-b7d1-be1d570f86d0`
- `agentId = 46c35dd2-f2aa-4fe5-843f-816a9963708e`
- `sessionId = 2876e1dc-e0f2-467a-93ed-a9698c3704d2`
- duplicate approved-memory ids:
  - `7f508150-83bd-4ef3-98c5-0e2bdf6f8a5c`
  - `ebd22e12-3a0a-4fd8-bbad-d836645efd26`

The bounded execution request used an explicit approved subset so the live run
could materialize only the safe duplicate action.

## Observed results

### Passive startup remained clean

Counts before and after runtime creation were unchanged:

- `memory_events = 38`
- `memory_objects = 43`
- `memory_reviews = 15`
- `memory_sources = 35`
- `memory_links = 15`
- `procedures = 12`
- `procedure_runs = 6`
- `skill_candidates = 5`
- `background_jobs = 8`
- `agent_state = 0`
- `tool_results = 0`
- `compaction_events = 0`

### Retrieval remained healthy

- `memory_object_list` returned `status = ok`
- the bounded retrieval acceptance check returned `accepted = true`

### Previously enabled governance flow remained healthy

A sampled bounded `learning` candidate submit still succeeded:

- `eventId = f14a82c8-9f40-456c-b4b2-67ac02c74e04`
- `memoryObjectId = 5f2cb9d4-a956-4894-b6f2-4ae2ed2e3f4f`

### Advisory scheduler paths remained healthy

`proactive_plan` still queued and ran successfully:

- `jobId = 3aeab9bd-9ac5-46ed-a37e-3f5d07c27c36`
- `payloadFingerprint = 9f99e106e78c9649`

`consolidation_plan` still queued and ran successfully:

- `jobId = 6849538c-4fb3-4c44-97a3-3c6addb9bcf7`
- `payloadFingerprint = d1ab61a0bb3288d5`

### Consolidation execute scheduling succeeded

`consolidation_execute` enqueue succeeded:

- `jobId = 4ecb39f7-f124-4963-bda4-3468d2e97528`
- `payloadFingerprint = 15718ebd8bb630a5`

Runner ownership enforcement also succeeded:

- `memory_background_job_run_next` returned `status = disabled` for a wrong
  runner id
- `memory_background_job_run_next` returned `status = executed` for
  `rollout-runner-1`

The succeeded job metadata recorded:

- `jobClass = consolidation_execute`
- `jobStatus = succeeded`
- `executionMode = approved_subset`
- `reviewedFindingCount = 1`
- `executedActionCount = 1`

The executed bounded action was:

- `actionType = duplicate_merge_review`
- `survivorObjectId = 7f508150-83bd-4ef3-98c5-0e2bdf6f8a5c`
- `supersededObjectIds = [ebd22e12-3a0a-4fd8-bbad-d836645efd26]`
- `reviewIds = [6f1615d4-0e92-477f-8b8f-ce0e7e800f3f]`
- `linkIds = [8516caf9-3401-42f2-906a-2b8496231bf6]`

### Scheduled consolidation execution stayed bounded

Counts immediately before the live `consolidation_execute` run were:

- `memory_events = 39`
- `memory_objects = 46`
- `memory_reviews = 15`
- `memory_sources = 36`
- `memory_links = 15`
- `procedures = 12`
- `procedure_runs = 6`
- `skill_candidates = 5`
- `background_jobs = 11`
- `agent_state = 0`
- `tool_results = 0`
- `compaction_events = 0`

Counts immediately after the live `consolidation_execute` run were:

- `memory_events = 39`
- `memory_objects = 46`
- `memory_reviews = 16`
- `memory_sources = 36`
- `memory_links = 16`
- `procedures = 12`
- `procedure_runs = 6`
- `skill_candidates = 5`
- `background_jobs = 11`
- `agent_state = 0`
- `tool_results = 0`
- `compaction_events = 0`

Observed bounded write delta:

- `memory_reviews +1`
- `memory_links +1`

Observed unchanged table families:

- `memory_events`
- `memory_objects`
- `memory_sources`
- `procedures`
- `procedure_runs`
- `skill_candidates`
- `background_jobs`
- `agent_state`
- `tool_results`
- `compaction_events`

This confirms the scheduled live run materialized only the already-bounded
low-risk duplicate-review outcome and did not broaden into contradiction,
drift-remediation, procurement, install, or external side effects.

### Unsafe consolidation actions remained disabled

The live rollout posture still limited scheduled consolidation execution to
the already-bounded safe subset:

- `duplicate_merge_review`
- `stale_superseded_review`

`contradiction_review` and consolidation-driven `drift_check_review` were not
enabled in config and were not exercised by the live scheduler rollout.

### Inspection surfaces reflected the completed job

`memory_background_job_get` returned the succeeded job with bounded execution
metadata, including:

- `runnerId = rollout-runner-1`
- `executeStatus = executed`
- `executionMode = approved_subset`
- `actionTypes = [duplicate_merge_review]`

## Rollback and disablement verification

Rollback or disablement was verified by narrowing:

- `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check]`

After that change:

- `memory_background_job_enqueue(jobClass = consolidation_execute)` returned
  `status = disabled`
- the disabled reason confirmed that
  `background job execute-class consolidation_execute is not enabled`

## Fix discovered during rehearsal

The first rehearsal exposed a runtime-wiring bug:

- scheduler-owned `consolidation_execute` was still using the
  full-candidate-mode gate instead of the execute-scheduling gate

This slice corrected that by routing scheduled consolidation execution through
a scheduler-owned consolidation-execution port gated by
`backgroundJobs.executeSchedulingMode`.

## Recommendation

Keep the current live allowlists unchanged unless a later explicitly approved
slice authorizes a shared-environment rehearsal or a broader automation review.
