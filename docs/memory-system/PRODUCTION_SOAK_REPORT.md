# Memory Middleware Production Soak Report

## Purpose

This document records the first production soak review for the currently
approved `memory-middleware` posture after the initial bounded rollout.

It does not expand the boundary.

## Soak window

- observation date: `2026-04-03`
- runtime uptime at inspection:
  - container `openclaw-upgrade-2026324-openclaw-gateway-1`
    healthy and up for about `2 hours`
- current running process start:
  - `2026-04-03T01:17:46.49993896Z`

## Production runtime and posture observed

Observed live target:

- Docker Compose project `openclaw-upgrade-2026324`
- service `openclaw-gateway`
- container `openclaw-upgrade-2026324-openclaw-gateway-1`
- Postgres target:
  - Supabase project `wvfcvuwsnhupalpxfttc`
  - database `postgres`
  - schema `memory_middleware`

Observed live posture:

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

## Health and restart observations

What remained stable:

- `GET /healthz` returned `{"ok":true,"status":"live"}`
- Docker health stayed `healthy`
- no unplanned container restart was observed during the soak window
- the only restarts in the recent log window were the intentional validation
  restarts from the rollout slice

Observed restart behavior:

- the gateway still performs a full-process restart on middleware config
  changes
- after the last intentional restore restart, the runtime stayed healthy for
  the soak window

## Retrieval observations

Retrieval remained healthy.

Observed check:

- `memory_object_list(scope = approved_only)` succeeded through the current
  production operator path
- approved-memory records were returned from `approved_memory_view`

## Bounded write and DB-growth observations

Pre-soak table-family counts:

- `memory_events = 28`
- `memory_objects = 26`
- `memory_reviews = 16`
- `memory_links = 16`
- `procedures = 5`
- `procedure_runs = 4`
- `skill_candidates = 4`
- `background_jobs = 6`
- `agent_state = 0`
- `tool_results = 0`
- `compaction_events = 0`

Post-soak counts after one bounded advisory dedupe probe:

- `memory_events = 28`
- `memory_objects = 26`
- `memory_reviews = 16`
- `memory_links = 16`
- `procedures = 5`
- `procedure_runs = 4`
- `skill_candidates = 4`
- `background_jobs = 7`
- `agent_state = 0`
- `tool_results = 0`
- `compaction_events = 0`

Observed deltas:

- `background_jobs +1`
- all other tracked families unchanged

Interpretation:

- no unexpected durable writes were observed during the soak probe
- no drift appeared in `agent_state`, `tool_results`, or `compaction_events`
- the only new durable artifact was the one expected advisory maintenance job
  row created for the idempotence check

## Advisory and execute-class scheduler observations

Current recent maintenance job inventory remained bounded to:

- `proactive_plan`
- `proactive_execute_run_drift_check`
- `consolidation_plan`
- `consolidation_execute`

Observed recent production-runner jobs:

- `proactive_plan`
  - `jobId = 4bf177fa-0ff8-458a-b3e4-b1fdece6f66d`
  - `status = succeeded`
  - runner recorded as `production-runner-1`
- `proactive_execute_run_drift_check`
  - `jobId = 4eab771f-03da-449f-8cb0-0fba589e25be`
  - `status = succeeded`
  - runner recorded as `production-runner-1`
  - bounded outcome remained `executeStatus = no_op`

No additional maintenance class appeared.

## Runner ownership and idempotence observations

One bounded advisory `proactive_plan` soak probe was executed.

Observed results:

1. First enqueue:
   - `status = queued`
   - `jobId = c02fdbc3-7813-48cb-830f-47b4b1e408d1`
2. Second identical enqueue:
   - `status = already_queued`
   - returned the same `jobId`
3. Wrong-runner claim:
   - `memory_background_job_run_next(runnerId = wrong-runner)`
   - returned `status = disabled`
   - reason:
     - `background job runner ownership is not authorized`
4. Correct-runner claim:
   - `memory_background_job_run_next(runnerId = production-runner-1)`
   - returned `status = executed`
   - job finished `succeeded`
   - result remained advisory-only

This confirms:

- dedupe or idempotence still holds for the approved advisory class
- runner ownership enforcement still holds
- the approved runner still executes bounded planner-only work correctly

## Anomalies observed

No `memory-middleware` boundary break was observed.

Unrelated runtime noise did appear in logs:

- webchat reconnect churn
- untrusted proxy-header warnings
- missing workspace memory-file read warnings
- one embedded-model timeout and fallback event

These observations do not currently indicate `memory-middleware` instability
and did not produce unexpected middleware-side durable writes during this soak
window.

## Rollback and disablement outcome

Rollback or disablement was not needed during this soak window.

Rollback readiness remains intact because:

- the live runtime stayed healthy
- allowed maintenance behavior stayed bounded
- the rollback order is unchanged in the runbook
- the pre-rollout backup remains available

## Conclusion

The current production boundary remained stable during this soak review.

Recommendation:

- keep the production boundary unchanged
- continue soak and periodic bounded inspections
- do not enable any new automation classes yet

## Recommended next step

The next bounded step should be one of:

1. continue production soak with the same allowlists unchanged
2. tighten the operator path so production validation does not depend on
   direct in-container middleware invocation

## Closeout note — 2026-04-04

This first bounded production soak is now treated as passed for its intended
scope.

What that means:

- the soak proved the approved production boundary stayed stable
- retrieval, bounded governance writes, bounded scheduler classes, runner
  ownership, and bounded durable-growth behavior all remained within the
  intended live posture
- no rollback or boundary tightening was required during the soak window
- the soak itself should not be reinterpreted as proof that ordinary live
  agent turns already created candidate memory

Separate follow-on proof now exists for ordinary live interaction ->
candidate capture on the approved production boundary:

- fresh proof timestamp:
  - `2026-04-04T02:43:36.765Z`
- live fresh-session result:
  - the `chief` agent searched approved memory first, then submitted one
    bounded candidate learning successfully
- accepted row ids:
  - `eventId = c3c336fa-baac-4886-b8b1-a78a1e7abac4`
  - `memoryObjectId = 98833f6a-4305-48bf-8492-31f7b95f987d`
- observed DB delta from that live interaction:
  - `memory_events +1`
  - `memory_objects +1`
  - `memory_reviews +0`
  - `background_jobs +0`

That proof closes the binary pathway question and moves the active follow-on
from soak closeout to bounded live interaction capture soak and expansion.

## Follow-on bounded live interaction soak start — 2026-04-04

The next bounded live slice has now started without broadening the production
boundary.

Fresh production-soak evidence from real fresh sessions:

- `chief` fresh session:
  - user intent:
    - explicit stable preference with "please remember"
  - accepted candidate result:
    - `eventId = b8e63c36-b2eb-4c97-b988-8b67b83d99c1`
    - `memoryObjectId = 57f45b20-84ac-4ca4-890d-e01456c41dff`
  - write timestamp:
    - `2026-04-04T03:00:00.831Z`
- `main` fresh session:
  - user intent:
    - softer "for future reference" standing preference
  - accepted candidate result:
    - `eventId = c9f3424a-33a9-422b-9326-318341180b0a`
    - `memoryObjectId = d0e3bb7d-c0ef-4524-bf9d-3cfbed55a6de`
  - write timestamp:
    - `2026-04-04T03:00:03.241Z`

Observed delta for that initial soak window:

- `memory_events +2`
- `memory_objects +2`
- `memory_reviews +0`
- `background_jobs +0`

Interpretation:

- bounded live interaction -> candidate capture is now working on both
  `main` and `chief`
- the current slice can now shift from binary pathway proof to bounded live
  soak under real interaction volume
- review and promotion remain manual
- no broader automation was introduced to produce these rows
