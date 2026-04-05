# Memory Middleware Production Rollout Report

## Purpose

This document records the result of attempting the first production rollout of
`memory-middleware` using the exact posture already proven in the shared
non-production rehearsal.

## Rollout date

- rollout and validation: `2026-04-03`

## Result

The first production rollout succeeded.

## Production runtime used

The rollout ran on the confirmed live Docker Compose runtime on this VPS:

- project `openclaw-upgrade-2026324`
- service `openclaw-gateway`
- container `openclaw-upgrade-2026324-openclaw-gateway-1`
- config surfaces:
  - `~/.openclaw/openclaw.json`
  - `~/.openclaw/.env`

## Approved posture now live in production

The production rollout reused the exact shared-rehearsed posture:

- `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
- `memoryObjectQuery.mode = read-only`
- `backgroundJobs.inspectionMode = enabled`
- `backgroundJobs.advisorySchedulingMode = enabled`
- `backgroundJobs.advisoryJobClasses = [proactive_plan, consolidation_plan]`
- `backgroundJobs.executeSchedulingMode = enabled`
- `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check, consolidation_execute]`
- `backgroundJobs.runnerOwnerId = production-runner-1`

Still disabled:

- `memory_procedure_validate_plan`
- direct proactive execution outside scheduler-owned jobs
- direct consolidation execution outside scheduler-owned jobs
- consolidation-driven `contradiction_review`
- consolidation-driven `drift_check_review`
- any additional advisory job classes
- any additional execute-class job classes
- procurement or install automation
- automatic Skill Vetter invocation
- self-improving capture
- actual installation
- memory-slot takeover

## Exact config changes applied

- in `~/.openclaw/openclaw.json`
  - changed
    `plugins.entries["memory-middleware"].config.backgroundJobs.runnerOwnerId`
    from `shared-nonprod-runner-1` to `production-runner-1`
- in `~/.openclaw/.env`
  - normalized `MEMORY_MIDDLEWARE_DATABASE_URL` so it includes
    `uselibpqcompat=true&sslmode=require`

No other feature-boundary fields were changed.

## Restart action taken

- restarted only `openclaw-gateway` in Compose project
  `openclaw-upgrade-2026324`
- post-restart health check:
  - `GET /healthz -> {"ok":true,"status":"live"}`

## Validation results

### Passive startup and runtime health

Passed.

- runtime restarted cleanly
- gateway health returned `ok`
- passive startup remained bounded

### Retrieval sanity

Passed.

- `memory_object_list` succeeded through direct in-container middleware
  runtime invocation
- approved-memory rows were returned from the live production posture

### Bounded enabled flow sanity

Passed.

- `memory_candidate_submit` succeeded in the live production posture
- observed write deltas from the intentional validation run were bounded to:
  - `memory_events +1`
  - `memory_objects +1`
  - `background_jobs +2`
- `memory_reviews`
- `memory_links`
- `procedures`
- `procedure_runs`
- `skill_candidates`
- `agent_state`
- `tool_results`
- `compaction_events`
  remained unchanged during that validation sequence

### Scheduler and runner ownership

Passed.

- `memory_background_job_enqueue(jobClass = proactive_plan)` queued
  successfully
- wrong-runner `memory_background_job_run_next(runnerId = wrong-runner)` was
  blocked
- correct-runner
  `memory_background_job_run_next(runnerId = production-runner-1)` executed
  successfully for `proactive_plan`
- the advisory result remained bounded and planner-only

### Approved execute-class verification

Passed.

- `memory_background_job_enqueue(jobClass = proactive_execute_run_drift_check)`
  queued successfully
- `memory_background_job_run_next(runnerId = production-runner-1)` executed
  successfully
- execution remained bounded and returned a conservative `no_op` drift-check
  result when no advisory action was pending

### Disablement and rollback verification

Passed.

- temporarily set:
  - `backgroundJobs.executeSchedulingMode = disabled`
  - `backgroundJobs.advisoryJobClasses = [proactive_plan]`
- restarted only the production runtime
- confirmed blocked enqueue for:
  - `proactive_execute_run_drift_check`
  - `consolidation_plan`
- restored the approved production posture
- restarted again and rechecked health successfully

## Operator-path note

Production validation used:

- gateway health checks
- direct in-container `memory-middleware` runtime and tool invocation

because bearer-auth HTTP `/tools/invoke` is currently blocked for tool
execution on this gateway.

## Final result

The approved production boundary is now live on the confirmed production
runtime, and the rollout passed with no feature-boundary expansion.
