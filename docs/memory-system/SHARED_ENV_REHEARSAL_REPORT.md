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

## Rollout date

- `2026-04-02`

## Reconciliation result

No actual shared non-production environment was available from the current
repo and host context.

The only verifiable non-production runtime target available now is still the
existing persistent local Docker rollout lane:

- container `memory-middleware-readonly-rollout-pg`
- image `pgvector/pgvector:pg16`
- host port `35432`
- database `memory_middleware_rollout`

That target is real and persistent, but it is not a shared environment.

## Evidence collected

The reconciliation pass found:

- no shared Postgres or Supabase environment variables in the host
  environment
- no shared non-production database URL in `~/.openclaw/.env`
- no second non-local Docker Postgres target besides the existing persistent
  rollout lane
- no repo-wired staging or preproduction runtime config beyond the already
  documented local Docker targets

The current local Docker networks also showed only local bridge networks and
no distinct shared middleware runtime target.

## Expected approved posture

If a shared non-production target had been available, the rehearsal would have
used the current approved posture unchanged:

- `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
- `memoryObjectQuery.mode = read-only`
- `backgroundJobs.inspectionMode = enabled`
- `backgroundJobs.advisorySchedulingMode = enabled`
- `backgroundJobs.advisoryJobClasses = [proactive_plan, consolidation_plan]`
- `backgroundJobs.executeSchedulingMode = enabled`
- `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check, consolidation_execute]`
- `backgroundJobs.runnerOwnerId = rollout-runner-1`

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
  operational runbook against the actual host or repo context
- confirmation that the current approved boundary is still the correct
  intended posture for any later shared-environment rehearsal
- confirmation that no new automation class needs to be enabled before such a
  rehearsal

### Failed

- shared-environment rehearsal execution itself could not proceed because no
  shared non-production target was available now

## Differences from the persistent local non-production lane

There were no runtime-behavior differences to measure because no shared target
was available.

The practical difference remains:

- the persistent local Docker lane is operator-controlled and single-host
- a future shared non-production rehearsal will need explicit runner
  ownership, disablement ownership, and backup or restore ownership beyond the
  local host

## Runbook or plan changes needed

The current docs need one explicit clarification:

- the next step is not another automation enablement
- the next step is naming or provisioning a real shared non-production target
  and replaying the exact same approved posture there without expanding the
  boundary

## Conclusion

The shared-environment rehearsal did not execute because a shared
non-production target was not available from the current repo or host
context.

The current approved boundary therefore remains proven only in:

- the disposable local validation lane
- the persistent local non-production rollout lane

The next required operational step is:

- provision or identify a real shared non-production environment
- keep the current allowlists unchanged
- rerun the existing runbook and readiness checks there
