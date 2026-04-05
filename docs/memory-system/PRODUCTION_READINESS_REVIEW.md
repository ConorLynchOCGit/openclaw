# Memory Middleware Production Readiness Review

## Purpose

This document records a repo-native production-readiness review of the current
`memory-middleware` posture after the bounded real-environment governance
rollouts.

It does not:

- enable scheduler execution
- enable proactive execution
- enable self-improving capture
- enable automatic Skill Vetter invocation
- enable actual installation
- claim the exclusive memory slot

Current production rollout blocker note:

- this review does not replace the need for actual production deployment
  access
- no completed production rollout should be claimed unless the production
  target is reachable and writable from the acting operator session

## Current reviewed baseline

The current real non-production target has already proven:

- passive runtime connectivity
- read-only retrieval
- bounded candidate submit and review
- bounded memory and procedure promotion
- bounded procedure validation
- bounded skill-candidate planning and creation
- bounded procurement planning and procurement-record creation
- bounded manual Skill Vetter handoff
- bounded manual vetting-result recording
- bounded approval planning and approval-state recording
- bounded manual install handoff
- bounded internal install-record creation

Current live posture:

- environment: persistent local Docker Postgres
- `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
- `memoryObjectQuery.mode = read-only`
- `backgroundJobs.inspectionMode = enabled`
- `backgroundJobs.advisorySchedulingMode = enabled`
- `backgroundJobs.advisoryJobClasses = [proactive_plan, consolidation_plan]`
- `backgroundJobs.executeSchedulingMode = enabled`
- `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check, consolidation_execute]`
- direct proactive execution outside the scheduler disabled
- scheduled `consolidation_execute` limited to:
  - `duplicate_merge_review`
  - `stale_superseded_review`
- contradiction and drift consolidation actions disabled
- self-improving capture disabled
- automatic Skill Vetter invocation disabled
- actual installation disabled

## What is already proven safe

The following classes have already been exercised successfully in a real
non-disposable non-production environment:

- passive startup with no automatic writes
- read-only retrieval over approved memory
- bounded internal governance writes with preserved provenance
- bounded approval-state mutation limited to internal event plus
  `skill_candidates` state
- bounded install-record mutation limited to internal event recording without
  runtime installation
- config-level disablement rollback for all enabled write surfaces

The following safety properties are already evidenced by rollout reports:

- startup does not create automatic job, proactive, or self-improving writes
- retrieval remains healthy before and after bounded governance writes
- enabled writes stay inside intended table families
- `background_jobs`, `agent_state`, `tool_results`, and `compaction_events`
  stayed unchanged through the governance rollouts
- manual governance surfaces preserve explicit human checkpoints before
  approval or install-related state moves forward

## What remains manual by design

The current design intentionally keeps these steps manual:

- procurement interpretation and handoff decisions
- Skill Vetter invocation
- vetting-result judgment
- approval choice and scope selection
- install handoff review
- actual installation
- any messaging or external follow-up
- any scheduler invocation loop
- any proactive execution loop

Those manual steps are not temporary omissions in the current posture. They
are active safety boundaries that keep the middleware from silently expanding
authority beyond the bounded internal record path already proven.

## Automation candidates for first enablement

The currently implemented automation-adjacent classes are:

1. `proactive_plan`
2. `proactive_execute_run_drift_check`
3. `consolidation_plan`
4. `consolidation_execute`

Relative risk ordering for first live enablement:

1. `proactive_plan`
2. `consolidation_plan`
3. `proactive_execute_run_drift_check`
4. `consolidation_execute`

Reasoning:

- `proactive_plan` is advisory-only and does not mutate memory state
- `consolidation_plan` is also advisory-only, but it can surface more complex
  findings that operators may over-trust without stronger review habits
- `proactive_execute_run_drift_check` is bounded, but it still writes drift
  review artifacts and therefore needs stronger observability and rollback
  discipline than planning-only classes
- `consolidation_execute` already writes durable review and lineage changes,
  so it should not be the first live automation class

## Previously missing safeguards before live automation

The code already has bounded seams. The previously missing items were mostly
operational:

- a documented scheduler-owner model for who may enqueue and run jobs in a
  shared environment
- a live runbook for pausing automation quickly without changing unrelated
  runtime posture
- per-job observability expectations for queued, claimed, succeeded, failed,
  and blocked states
- an explicit config gate strategy that separates:
  - governance writes
  - advisory scheduling
  - execute-class automation

Those safeguards are now wired repo-natively as:

- `backgroundJobs.inspectionMode`
- `backgroundJobs.advisorySchedulingMode`
- `backgroundJobs.executeSchedulingMode`
- `backgroundJobs.runnerOwnerId`
- bounded `memory_background_job_list` and `memory_background_job_get`
  inspection tools

Live automation still remains disabled by default.

## Observability and rollback controls still missing

Before any live automation enablement, the following controls should be
documented and treated as required:

- operator-visible metrics or queries for:
  - queued job count by `jobClass`
  - running job count by `jobClass`
  - failed job count by `jobClass`
  - oldest queued job age
  - last successful run time by `jobClass`
- a standard query or script for inspecting the most recent
  `background_jobs.execution_metadata`
- a single documented disablement step that operators can apply immediately
  without changing read-only retrieval posture
- a rule that the first live automation rollout must be single-runner only
- an explicit review checkpoint after the first few live jobs before any
  broader enablement

## Recommended config gates for first automation rollout

The next automation-capable rollout should not reuse `candidateIngress.mode`
alone as the only operational switch. The review recommends explicit runtime
gates for:

- advisory scheduler enablement
- execute-class scheduler enablement
- proactive execution enablement
- self-improving capture enablement

Minimum acceptable gate shape before the first live automation slice:

- one gate that can enable advisory scheduling only
- one separate gate that keeps execute-class jobs off
- one separate gate that keeps direct proactive execution off
- all existing manual governance gates unchanged

These code changes are now in place. The remaining work is rollout discipline
and environment-specific runbook ownership, not additional scheduler mechanics.

## What should explicitly remain disabled

For the next live step, the following should stay disabled:

- actual installation
- automatic Skill Vetter invocation
- self-improving capture
- proactive execute-class automation
- consolidation execution automation
- any procurement, approval, install, or messaging automation
- any memory-slot takeover behavior

## First live rollout outcome

The recommended next live enablement step from this review has now been
executed in the persistent local non-production target as:

- scheduler for `proactive_plan` only
- `backgroundJobs.executeSchedulingMode = disabled`
- `backgroundJobs.advisoryJobClasses = [proactive_plan]`
- single-runner ownership through `backgroundJobs.runnerOwnerId`

Observed result:

- startup remained passive
- retrieval remained healthy
- already-enabled governance writes remained healthy
- `proactive_plan` jobs could be enqueued and run only by the configured
  runner owner
- inspection surfaces reflected queued and succeeded job states
- execute-class and consolidation scheduling stayed blocked
- config disablement still stopped scheduling immediately

## Second live rollout outcome

The next bounded live step has now also been executed in the same target as:

- `backgroundJobs.executeSchedulingMode = enabled`
- `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check]`
- `backgroundJobs.advisoryJobClasses = [proactive_plan]`
- single-runner ownership through `backgroundJobs.runnerOwnerId`

Observed result:

- startup remained passive
- retrieval remained healthy
- already-enabled governance writes remained healthy
- `proactive_plan` scheduling still worked
- `proactive_execute_run_drift_check` could be enqueued and run only by the
  configured runner owner
- drift-check execution stayed conservative and repeat-safe
- consolidation scheduling and execution stayed blocked
- execute-class disablement still stopped the drift-check job immediately

## Third live rollout outcome

The next bounded live step has now also been executed in the same target as:

- `backgroundJobs.advisoryJobClasses = [proactive_plan, consolidation_plan]`
- `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check]`
- single-runner ownership through `backgroundJobs.runnerOwnerId`

Observed result:

- startup remained passive
- retrieval remained healthy
- already-enabled governance writes remained healthy
- `proactive_plan` scheduling still worked
- `consolidation_plan` could be enqueued and run only by the configured
  runner owner
- consolidation planning stayed advisory-only and produced no consolidation
  execution writes
- `consolidation_execute` stayed blocked
- advisory allowlist disablement still stopped consolidation-plan scheduling
  immediately

## Fourth live rollout outcome

The next bounded live step has now also been executed in the same target as:

- `backgroundJobs.advisoryJobClasses = [proactive_plan, consolidation_plan]`
- `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check, consolidation_execute]`
- single-runner ownership through `backgroundJobs.runnerOwnerId`

Observed result:

- startup remained passive
- retrieval remained healthy
- already-enabled governance writes remained healthy
- `proactive_plan` scheduling still worked
- `proactive_execute_run_drift_check` scheduling still worked
- `consolidation_plan` scheduling still worked
- `consolidation_execute` could be enqueued and run only by the configured
  runner owner
- scheduled `consolidation_execute` materialized only bounded low-risk
  `duplicate_merge_review` output in the live rollout
- the live `consolidation_execute` run changed only:
  - `memory_reviews +1`
  - `memory_links +1`
- `memory_events`, `procedure_runs`, `skill_candidates`, `agent_state`,
  `tool_results`, and `compaction_events` stayed unchanged during that run
- contradiction and drift consolidation actions stayed disabled
- execute-allowlist disablement still stopped `consolidation_execute`
  scheduling immediately

## Exit criteria before any future automation enablement

Before any scheduler or proactive-execution rollout, all of the following
should be true:

- a documented scheduler-owner and single-runner posture exists for the chosen
  environment
- a documented immediate disablement step exists for the chosen environment
- background-job inspection queries are documented for the chosen environment
- a first-live rollout target beyond the disposable lane is explicitly named
- advisory-only scheduling is split from execute-class scheduling by config
- approval, install, and self-improving automation remain explicitly blocked

## Conclusion

The middleware is production-ready for continued manual bounded governance in
its current non-exclusive posture.

It is now proven for the current live automation step in the persistent local
non-production target:

- advisory `proactive_plan` scheduling
- advisory `consolidation_plan` scheduling
- execute-class `proactive_execute_run_drift_check`
- execute-class low-risk `consolidation_execute` only for
  `duplicate_merge_review` and `stale_superseded_review`

with contradiction or drift consolidation actions and broader automation still
disabled.

It is not yet ready for broader automation or shared-environment scheduler
rollout until rollout ownership, runbook discipline, and environment-specific
controls are named beyond the local target.

The follow-up post-maintenance decision is now recorded in:

- `docs/memory-system/AUTOMATION_READINESS_REVIEW.md`
- `docs/memory-system/OPERATIONAL_RUNBOOK.md`
- `docs/memory-system/PRODUCTION_SURFACE_INVENTORY_AND_DIFF.md`
