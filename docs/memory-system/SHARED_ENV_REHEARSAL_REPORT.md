# Memory Middleware Shared Environment Rehearsal Report

## Purpose

This report records the attempt to rehearse the currently approved
`memory-middleware` posture in a shared non-production environment.

The intended rehearsal scope was:

- passive runtime plus read-only retrieval
- the currently enabled bounded governance path
- the currently enabled background-job modes and allowlists
- runner ownership enforcement
- runbook-based disablement and rollback checks

## Rollout dates

- provisioning: `2026-04-02`
- rehearsal: `2026-04-03`

## Reconciliation result

An actual shared non-production environment is now available from the current
server and host context.

Provisioned shared target:

- shared OpenClaw runtime:
  - container `openclaw-upgrade-2026324-openclaw-gateway-1`
  - image `openclaw:local`
  - ports `28789` and `28790`
- shared Postgres target:
  - Supabase project `wvfcvuwsnhupalpxfttc`
  - database `postgres`
  - schema `memory_middleware`
  - required extensions confirmed:
    - `pgcrypto`
    - `pg_trgm`
    - `vector`

The earlier persistent local Docker rollout lane still exists, but it is no
longer part of the intended normal runtime posture.

Retirement note:

- `memory-middleware-readonly-rollout-pg` remains historical proof history
  only
- the intended runtime database target is the shared Supabase-backed Postgres
  schema `memory_middleware`
- local Docker Postgres remains acceptable only for disposable tests or
  bounded rehearsal

## Evidence collected

The provisioning and rehearsal passes found and confirmed:

- an already-installed Supabase project on the server:
  - ref `wvfcvuwsnhupalpxfttc`
- a usable shared DB target with:
  - `pgcrypto`
  - `pg_trgm`
  - `vector`
- a healthy rebuilt shared OpenClaw runtime container that now includes
  `memory-middleware`
- successful application of both middleware migrations to the shared target
- a clean passive restart with no startup writes
- successful repo-native runtime rehearsal against the shared target after one
  shared-target DB URL compatibility correction

## Expected approved posture

The provisioned shared target is configured for the current approved posture
unchanged:

- `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
- `memoryObjectQuery.mode = read-only`
- `backgroundJobs.inspectionMode = enabled`
- `backgroundJobs.advisorySchedulingMode = enabled`
- `backgroundJobs.advisoryJobClasses = [proactive_plan, consolidation_plan]`
- `backgroundJobs.executeSchedulingMode = enabled`
- `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check, consolidation_execute]`
- `backgroundJobs.runnerOwnerId = shared-nonprod-runner-1`

Still disabled:

- direct proactive execution outside the scheduler
- consolidation-driven `contradiction_review`
- consolidation-driven `drift_check_review`
- any additional advisory or execute-class job classes
- procurement or install automation
- automatic Skill Vetter invocation
- self-improving capture
- actual installation
- memory-slot takeover

## Pass/fail result

### Passed

- reconciliation of the current adoption plan, readiness reviews, and
  operational runbook against the actual server-hosted shared runtime
- confirmation that the existing Supabase project is suitable for the shared
  middleware database target
- successful placement of the shared DB secret material
- successful application of both middleware migrations
- successful restart of the shared runtime on the unchanged approved posture
- healthy startup of the rebuilt shared runtime
- passive startup remained write-free
- read-only retrieval stayed healthy
- bounded governance flows succeeded for:
  - candidate submit
  - candidate review
  - candidate promotion planning
  - bounded memory promotion
  - bounded procedure promotion
  - bounded procedure validation
  - bounded skill-candidate planning and creation
  - bounded procurement planning and record creation
  - bounded manual Skill Vetter handoff
  - bounded manual vetting-result recording
  - bounded approval planning and approval-state write
  - bounded manual install handoff
  - bounded install-record creation
- bounded background-job inspection succeeded
- advisory scheduling succeeded for:
  - `proactive_plan`
  - `consolidation_plan`
- execute-class scheduling succeeded for:
  - `proactive_execute_run_drift_check`
  - bounded safe `consolidation_execute`
- wrong-runner background-job claims were blocked for
  `shared-nonprod-runner-wrong`
- runbook disablement rollback worked:
  - `backgroundJobs.executeSchedulingMode = disabled` blocked
    `proactive_execute_run_drift_check`
  - narrowing `backgroundJobs.advisoryJobClasses` to `[proactive_plan]`
    blocked `consolidation_plan`
- final approved posture was restored and the shared runtime returned healthy

### Failed first, then corrected

- direct host and container rehearsal against the original Supabase pooler URL
  failed with:
  - `self-signed certificate in certificate chain`
- the shared target was corrected to use:
  - `uselibpqcompat=true&sslmode=require`

### Stayed intentionally disabled

- `memory_procedure_validate_plan`
- direct proactive execution outside scheduler-owned background jobs
- direct consolidation execution outside scheduler-owned background jobs
- consolidation-driven `contradiction_review`
- consolidation-driven `drift_check_review`
- any additional advisory job classes
- any additional execute-class job classes
- procurement or install automation
- automatic Skill Vetter invocation
- self-improving capture
- actual installation
- memory-slot takeover

## Differences from the persistent local non-production lane

The shared target differs from the persistent local Docker lane in these ways:

- the shared runtime is the existing server-hosted Docker gateway, not the
  local-only rollout compose stack
- the shared Postgres target reuses Supabase instead of the local
  `pgvector/pgvector:pg16` container
- the runner id is now `shared-nonprod-runner-1`
- the current middleware checkpoint still requires a literal DB URL string in
  runtime config even though the secret is also placed in `.env`
- the shared Supabase pooler URL required the current `pg` compatibility form:
  - `uselibpqcompat=true&sslmode=require`
- the shared rehearsal used the repo-native runtime against the shared DB plus
  gateway health checks because gateway bearer auth does not permit HTTP
  tool invocation on `/tools/invoke`
- synthetic project, session, and agent UUIDs had to be omitted in the shared
  target because those references must point at real shared-environment rows
  when present
- `memory_procedure_validate_plan` remains disabled in the approved posture
  even while `memory_procedure_validate` is enabled

## Runbook or plan changes needed

The current docs needed these clarifications and were updated:

- the shared target now exists and is no longer a planning-only gap
- the first shared target reuses the already-installed Supabase project
- the first shared runtime reuses the existing shared Dockerized OpenClaw
  gateway on the server
- the shared target currently needs
  `uselibpqcompat=true&sslmode=require` in the middleware DB URL
- the shared rehearsal path is repo-native runtime plus gateway health checks,
  not bearer-auth HTTP tool invocation
- `memory_procedure_validate_plan` remains intentionally disabled in the
  approved boundary

## Provisioning result

The shared target now uses:

1. the existing shared Dockerized OpenClaw gateway on the server
2. the existing shared Supabase project on the server
3. the current approved middleware posture unchanged
4. `shared-nonprod-runner-1` as the first shared runner owner

Still missing:

- explicit named disablement owner
- explicit named backup or restore owner

The concrete provisioning sequence for that step now lives in:

- `docs/memory-system/SHARED_NONPROD_PROVISIONING_PLAN.md`
- `docs/memory-system/SHARED_NONPROD_PROVISIONING_REPORT.md`

## Rehearsal findings

Observed shared-target count delta for the bounded rehearsal flow:

- `memory_events +7`
- `memory_links +4`
- `memory_objects +5`
- `memory_reviews +4`
- `memory_sources +7`
- `procedures +1`
- `procedure_runs +1`
- `skill_candidates +1`
- `background_jobs +4`
- `agent_state +0`
- `tool_results +0`
- `compaction_events +0`

Observed background-job results:

- `proactive_plan`: `queued -> executed -> succeeded`
- `proactive_execute_run_drift_check`: `queued -> executed -> succeeded`
- `consolidation_plan`: `queued -> executed -> succeeded`
- `consolidation_execute`: `queued -> executed -> succeeded`

Observed blocked results:

- wrong runner:
  - `status = disabled`
  - reason:
    `background job runner ownership is not authorized`
- direct proactive execution:
  - `status = disabled`
  - reason:
    `proactive execution mode is not enabled`
- direct consolidation execution:
  - `status = disabled`
  - reason:
    `consolidation execution mode is not enabled`

## Conclusion

The shared-environment rehearsal has now executed successfully after the
shared-target DB URL compatibility correction.

The current approved boundary is now:

- proven in the disposable local validation lane
- proven in the persistent local non-production rollout lane
- proven in the shared non-production target

The current automation and governance boundary held cleanly in the shared
environment. No new automation classes or write paths were enabled.

The next required operational step is:

- keep the current allowlists unchanged
- assign explicit disablement and backup or restore owners in the runbook
- continue soak or controlled shared-environment observation before any
  further automation expansion is considered
- obtain a production-capable operator session before attempting the first
  production rollout
