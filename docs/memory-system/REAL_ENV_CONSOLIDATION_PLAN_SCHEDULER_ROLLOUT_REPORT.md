# Memory Middleware Real Environment Consolidation Plan Scheduler Rollout Report

## Purpose

This document records the next live advisory automation rollout in the
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
- advisory scheduler support for `consolidation_plan`
- execute-class scheduler support for `proactive_execute_run_drift_check`
- single-runner ownership for `memory_background_job_run_next`

It did not enable:

- `consolidation_execute`
- additional execute-class jobs
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
  - `backgroundJobs.advisoryJobClasses = [proactive_plan, consolidation_plan]`
  - `backgroundJobs.executeSchedulingMode = enabled`
  - `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check]`
  - `backgroundJobs.runnerOwnerId = rollout-runner-1`
- downstream workflow posture:
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
  - `consolidation_plan`
  - `proactive_execute_run_drift_check`
- `memory_background_job_list`
- `memory_background_job_get`
- `memory_background_job_run_next` for the same allowlisted classes only

## What remained disabled

- `consolidation_execute`
- additional execute-class jobs beyond
  `proactive_execute_run_drift_check`
- procurement, vetting, approval, or install automation
- self-improving-agent activation
- automatic Skill Vetter invocation
- memory-slot takeover

## Validation fixture posture

For bounded validation inside the persistent target, the rollout created one
isolated project, one isolated agent, one isolated session, and two explicit
approved-memory objects with identical content to force one duplicate-review
finding.

It then:

- sampled read-only retrieval
- wrote one bounded `learning` candidate through the already-enabled
  governance path
- enqueued and ran one advisory `proactive_plan` job
- enqueued and ran one advisory `consolidation_plan` job against the
  isolated project
- inspected queued and completed job state through the bounded inspection
  tools
- verified single-runner ownership enforcement
- verified `consolidation_execute` stayed blocked
- verified consolidation-plan disablement by narrowing the advisory allowlist
  back to `proactive_plan` only

## Observed results

### Passive runtime startup

Passed.

Observed before and after startup:

- `memory_events = 37`
- `memory_objects = 40`
- `memory_reviews = 15`
- `memory_sources = 34`
- `memory_links = 15`
- `procedures = 12`
- `procedure_runs = 6`
- `skill_candidates = 5`
- `background_jobs = 6`
- `agent_state = 0`
- `tool_results = 0`
- `compaction_events = 0`

No automatic writes were observed.

### Retrieval

Passed.

- `memory_object_list` returned `status = ok`
- approved-memory retrieval stayed healthy in the same target while
  consolidation scheduling was enabled

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
`memory_background_job_run_next` succeeded for
`runnerId = rollout-runner-1`.

The advisory planner returned:

- `outcome = actions_available`
- one `follow_up_candidate_review` action
- one `review_consolidation_findings` action

This confirmed that the already-enabled proactive scheduler path remained
healthy after adding `consolidation_plan` to the advisory allowlist.

### Advisory consolidation-plan scheduling

Passed.

`memory_background_job_enqueue(jobClass = consolidation_plan)` created one
queued job with:

- `jobKind = maintenance`
- `payloadFingerprint = 498740ed7d6a747d`
- `includeValidatedProcedures = false`
- `maxFindings = 5`

`memory_background_job_list` returned the queued job with `status = queued`.

`memory_background_job_run_next` with `runnerId = wrong-runner` returned:

- `status = disabled`
- `reason = background job runner ownership is not authorized`

The same queued job executed successfully only for
`runnerId = rollout-runner-1`.

### Consolidation planning behavior

Passed.

`memory_background_job_run_next` for the queued advisory consolidation job
returned:

- `status = executed`
- `jobClass = consolidation_plan`
- `jobStatus = succeeded`
- `consolidationPlanResult.status = ok`
- `outcome = review_needed`

The advisory consolidation plan returned one duplicate-review finding:

- `actionType = duplicate_merge_review`
- `affectedObjectIds = [39614147-849f-4df9-b804-e191debdfd3d, 5fddbd5e-d0df-4568-883a-39c63ab2ff05]`

Counts before and after advisory consolidation execution were unchanged:

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

This confirmed that scheduled `consolidation_plan` remained advisory-only and
produced no consolidation execution writes.

### Inspection surfaces

Passed.

`memory_background_job_get` returned the succeeded consolidation-plan job
with:

- `status = succeeded`
- `attempts = 1`
- `runnerId = rollout-runner-1`
- `plannerStatus = ok`
- `plannerOutcome = review_needed`
- `findingTypes = [duplicate_merge_review]`

This confirmed that queued and completed consolidation-plan state stayed
visible through the bounded inspection seam.

### Disabled consolidation execution

Passed.

Blocked as expected:

- `memory_background_job_enqueue(jobClass = consolidation_execute)` returned
  `status = disabled`
- `reason = background job execute-class consolidation_execute is not enabled`

### Advisory allowlist disablement rollback

Passed.

After narrowing `backgroundJobs.advisoryJobClasses` back to
`[proactive_plan]` while leaving inspection and execute-class drift
scheduling available:

- `memory_background_job_enqueue(jobClass = consolidation_plan)` returned
  `status = disabled`
- `reason = background job advisory class consolidation_plan is not enabled`

This confirmed immediate consolidation-plan disablement without changing
retrieval, the already-enabled governance posture, or the bounded
`proactive_execute_run_drift_check` allowlist.

## Failures

One bounded runtime-wiring issue was found during the first live rehearsal:
scheduled `consolidation_plan` initially reused the full-candidate planning
gate and returned `status = disabled` in the install-enabled posture.

That was corrected in this slice by routing scheduler-owned
`consolidation_plan` work through a scheduler-only consolidation-planning port
gated by `backgroundJobs.advisorySchedulingMode`, matching the already-used
scheduled proactive-planning pattern.

## Recommended follow-up

Keep the current live allowlists unchanged for the next slice unless a
separate shared-environment rehearsal is explicitly authorized:

- `advisoryJobClasses = [proactive_plan, consolidation_plan]`
- `executeJobClasses = [proactive_execute_run_drift_check]`

`consolidation_execute` should remain disabled until a later shared-
environment rehearsal proves that advisory consolidation findings are not
being over-trusted and that bounded rollback discipline remains sufficient.
