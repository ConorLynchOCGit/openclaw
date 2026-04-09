# Memory Middleware Real Environment Proactive Execute Drift Check Rollout Report

## Purpose

This document records the first live execute-class automation rollout in the
existing real non-disposable environment for `memory-middleware`.

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
- advisory scheduler support for `proactive_plan`
- execute-class scheduler support for `proactive_execute_run_drift_check`
- single-runner ownership for `memory_background_job_run_next`

It did not enable:

- `consolidation_plan`
- `consolidation_execute`
- direct proactive execution outside the bounded background-job seam
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
  - `backgroundJobs.executeSchedulingMode = enabled`
  - `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check]`
  - `backgroundJobs.runnerOwnerId = rollout-runner-1`
- downstream workflow posture:
  - `consolidation_plan` scheduling disabled
  - `consolidation_execute` scheduling disabled
  - direct proactive execution disabled
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
- `memory_background_job_enqueue` for:
  - `proactive_plan`
  - `proactive_execute_run_drift_check`
- `memory_background_job_list`
- `memory_background_job_get`
- `memory_background_job_run_next` for the same allowlisted classes only

## What remained disabled

- `consolidation_plan`
- `consolidation_execute`
- procurement, vetting, approval, or install automation
- self-improving-agent activation
- automatic Skill Vetter invocation
- memory-slot takeover

## Validation fixture posture

For bounded validation inside the persistent target, the rollout created one
isolated project, one isolated agent, one isolated session, and one explicit
approved-memory object marked with:

- `driftCheckDueAt = 2026-03-01T00:00:00.000Z`

It then:

- sampled read-only retrieval
- wrote one bounded `learning` candidate through the already-enabled
  governance path
- enqueued and ran one advisory `proactive_plan` job
- enqueued and ran one execute-class
  `proactive_execute_run_drift_check` job against the explicit approved
  target
- repeated the same execute-class job to verify bounded `already_executed`
  behavior
- inspected queued and completed job state through the bounded inspection
  tools
- verified single-runner ownership enforcement
- verified consolidation scheduling stayed blocked
- verified execute-class disablement by turning execute scheduling back off

## Observed results

### Passive runtime startup

Passed.

Observed before and after startup:

- `memory_events = 36`
- `memory_objects = 37`
- `memory_sources = 33`
- `background_jobs = 4`

No automatic writes were observed.

### Retrieval

Passed.

- `memory_object_list` returned `status = ok`
- approved-memory retrieval stayed healthy in the same target while execute
  scheduling was enabled

### Existing bounded governance flow

Passed.

One bounded `learning` candidate submission succeeded and changed only:

- `memory_events +1`
- `memory_objects +1`
- `memory_sources +1`

It did not change:

- `background_jobs`
- `procedures`
- `procedure_runs`
- `skill_candidates`

### Advisory proactive-plan scheduling

Passed.

`memory_background_job_enqueue(jobClass = proactive_plan)` succeeded, and
`memory_background_job_run_next` succeeded only for
`runnerId = rollout-runner-1`.

The advisory planner returned:

- `outcome = actions_available`
- one `follow_up_candidate_review` action
- one `run_drift_check` action

No memory rows changed during the advisory planner execution beyond the
bounded `background_jobs` state transition.

### Execute-class proactive drift-check scheduling

Passed.

`memory_background_job_enqueue(jobClass = proactive_execute_run_drift_check)`
created one queued job with:

- `jobKind = maintenance`
- `payloadFingerprint = f768d99e305e07e3`
- explicit `affectedIds = [d6e04fc9-116a-4b51-8cbe-697969026387]`
- explicit `reviewerAgentId = f695bf34-4d7b-4079-b4e3-fd9c66ce9c93`

`memory_background_job_list` returned the queued job with `status = queued`.

`memory_background_job_run_next` with `runnerId = wrong-runner` returned:

- `status = disabled`
- `reason = background job runner ownership is not authorized`

The same queued job executed successfully only for
`runnerId = rollout-runner-1`.

### Drift-check execution behavior

Passed.

`memory_background_job_run_next` for the queued execute-class job returned:

- `status = executed`
- `jobClass = proactive_execute_run_drift_check`
- `jobStatus = succeeded`
- `proactiveExecuteResult.status = executed`
- `actionType = run_drift_check`

The underlying bounded drift-check execution returned:

- `executionMode = approved_subset`
- `reviewedFindingCount = 1`
- `executedActionCount = 1`
- `alreadyExecutedCount = 0`
- one `drift_check_review` action for the explicit approved-memory object

Counts before and after execute changed only by:

- `memory_events +1`

They did not change:

- `memory_objects`
- `memory_reviews`
- `memory_sources`
- `memory_links`
- `procedures`
- `procedure_runs`
- `skill_candidates`
- `background_jobs` row count
- `agent_state`
- `tool_results`
- `compaction_events`

### Drift-check idempotence

Passed.

The same explicit execute-class job was enqueued again and executed again by
the same runner owner.

The second run returned:

- `proactiveExecuteResult.status = already_executed`
- bounded drift-check `alreadyExecutedCount = 1`
- `executedActionCount = 0`

Counts before and after the second run were unchanged.

### Inspection surfaces

Passed.

`memory_background_job_get` returned the succeeded execute-class job with:

- `status = succeeded`
- `attempts = 1`
- `runnerId = rollout-runner-1`
- `executeStatus = executed`
- persisted `affectedIds`

This confirmed that queued and completed execute-class state stayed visible
through the bounded inspection seam.

### Disabled consolidation scheduling

Passed.

Blocked as expected:

- `memory_background_job_enqueue(jobClass = consolidation_plan)` returned
  `status = disabled`
- `memory_background_job_enqueue(jobClass = consolidation_execute)` returned
  `status = disabled`

### Execute-class disablement rollback

Passed.

After switching `backgroundJobs.executeSchedulingMode` back off while leaving
inspection and advisory scheduling available:

- `memory_background_job_enqueue(jobClass = proactive_execute_run_drift_check)`
  returned `status = disabled`

This confirmed immediate execute-class disablement without changing retrieval
or the already-enabled governance posture.

## Failures

None observed in the bounded rollout checks.

## Recommended follow-up

Keep the current live allowlists unchanged for the next slice unless a
separate shared-environment rehearsal is explicitly authorized:

- `advisoryJobClasses = [proactive_plan]`
- `executeJobClasses = [proactive_execute_run_drift_check]`

Consolidation scheduling and broader automation should remain disabled until
the current single-runner execute-class posture has had a longer soak period
or a managed shared-environment rehearsal proves the same guardrails.
