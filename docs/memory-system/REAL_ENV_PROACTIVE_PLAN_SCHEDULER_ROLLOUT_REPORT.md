# Memory Middleware Real Environment Proactive Plan Scheduler Rollout Report

## Purpose

This document records the first live automation rollout in the existing real
non-disposable environment for `memory-middleware`.

Historical note:

- this report records a retired local rollout lane
- `memory-middleware-readonly-rollout-pg` is no longer part of the normal
  runtime posture
- the intended runtime database target is now the shared Supabase-backed
  Postgres schema `memory_middleware`
- local Docker Postgres remains acceptable only as disposable test or bounded
  rehearsal infrastructure

The rollout scope was intentionally limited to:

- background-job inspection
- advisory scheduler support for `proactive_plan` only
- single-runner ownership for `memory_background_job_run_next`

It did not enable:

- execute-class jobs
- direct proactive execution
- consolidation scheduling or execution
- self-improving-agent activation
- automatic Skill Vetter invocation
- actual installation
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

## Exact config posture

- database:
  - `database.driver = postgres`
  - `database.schema = memory_middleware`
- retrieval:
  - `memoryObjectQuery.mode = read-only`
- governance posture:
  - `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
- automation posture:
  - `backgroundJobs.inspectionMode = enabled`
  - `backgroundJobs.advisorySchedulingMode = enabled`
  - `backgroundJobs.advisoryJobClasses = [proactive_plan]`
  - `backgroundJobs.executeSchedulingMode = disabled`
  - `backgroundJobs.runnerOwnerId = rollout-runner-1`
- downstream workflow posture:
  - direct proactive execution disabled
  - execute-class jobs disabled
  - consolidation scheduling disabled
  - self-improving capture disabled
  - automatic Skill Vetter invocation disabled
  - actual installation disabled
- plugin posture:
  - regular bundled plugin
  - no exclusive memory-slot claim

## What was enabled

- passive runtime startup
- read-only retrieval
- already-enabled bounded governance path
- `memory_background_job_enqueue` for `proactive_plan`
- `memory_background_job_list`
- `memory_background_job_get`
- `memory_background_job_run_next` for `proactive_plan` only

## What remained disabled

- `proactive_execute_run_drift_check`
- `consolidation_plan`
- `consolidation_execute`
- direct proactive execution
- procurement, vetting, approval, or install automation
- self-improving-agent activation
- memory-slot takeover

## Validation fixture posture

For bounded validation inside the persistent target, the rollout created one
isolated project, one isolated agent, and one isolated session. It then:

- sampled read-only retrieval
- wrote one bounded `learning` candidate through the already-enabled
  governance path
- enqueued one `proactive_plan` job scoped to that isolated project
- inspected queued and completed job state through the bounded inspection
  tools
- verified single-runner ownership enforcement
- verified execute-class and consolidation scheduling stayed blocked
- verified disablement by turning background-job config back off

## Observed results

### Passive runtime startup

Passed.

Observed before and after startup:

- `memory_events = 33`
- `memory_objects = 34`
- `memory_sources = 31`
- `background_jobs = 0`
- `skill_candidates = 5`
- `procedures = 12`

No automatic writes were observed.

### Retrieval

Passed.

- `memory_object_list` returned `status = ok`
- approved-memory retrieval stayed healthy in the same target while advisory
  scheduling was enabled

### Existing bounded governance flow

Passed.

One bounded `learning` candidate submission succeeded and changed only:

- `memory_events +1`
- `memory_objects +1`
- `memory_sources +1`

It did not change:

- `background_jobs`
- `skill_candidates`
- `procedures`

### Proactive-plan enqueue

Passed.

`memory_background_job_enqueue` created one queued job with:

- `jobClass = proactive_plan`
- `jobKind = maintenance`
- `payloadFingerprint = a6636dc800fa598a`
- `projectId = 247a55a6-1cdf-4e68-8adb-4f4e5b81063e`

After enqueue:

- `background_jobs +1`

### Inspection surfaces

Passed.

`memory_background_job_list` returned the queued job with:

- `status = queued`
- `attempts = 0`
- middleware-owned metadata including `payloadFingerprint`

After the run, `memory_background_job_get` returned the same job with:

- `status = succeeded`
- `attempts = 1`
- `runnerId = rollout-runner-1`
- `plannerStatus = ok`
- `plannerOutcome = actions_available`
- advisory action type `follow_up_candidate_review`

### Runner ownership gating

Passed.

`memory_background_job_run_next` with `runnerId = wrong-runner` returned:

- `status = disabled`
- `reason = background job runner ownership is not authorized`

The job remained queued until the configured runner owner executed it.

### Proactive-plan run-next

Passed.

`memory_background_job_run_next` with `runnerId = rollout-runner-1` returned:

- `status = executed`
- `jobClass = proactive_plan`
- `jobStatus = succeeded`
- advisory-only `proactivePlanResult`

Observed advisory result:

- `outcome = actions_available`
- `actionType = follow_up_candidate_review`
- `affectedIds = [775147dc-0ba8-4661-be6f-bdcd326a667c]`

Counts before and after run-next were unchanged except for job state inside
`background_jobs`:

- `memory_events = 34`
- `memory_objects = 35`
- `memory_sources = 32`
- `background_jobs = 1`
- `skill_candidates = 5`
- `procedures = 12`

No external side effects were observed.

### Disabled execute-class and consolidation scheduling

Passed.

Blocked as expected:

- `memory_background_job_enqueue(jobClass = proactive_execute_run_drift_check)`
  returned `status = disabled`
- `memory_background_job_enqueue(jobClass = consolidation_plan)` returned
  `status = disabled`

### Disablement rollback

Passed.

After switching background-job config back off:

- `memory_background_job_enqueue(jobClass = proactive_plan)` returned
  `status = disabled`
- `memory_background_job_list` returned `status = disabled`

This confirmed immediate disablement without changing retrieval or the
already-enabled governance posture.

## Failures

- no live rollout validation checks failed

## Conclusion

The first live automation rollout succeeded in the safest bounded posture:

- advisory scheduler support for `proactive_plan` only
- single-runner ownership
- inspection enabled
- execute-class and consolidation scheduling disabled

Retrieval and the already-enabled bounded governance path remained healthy in
the same persistent real non-production target.
