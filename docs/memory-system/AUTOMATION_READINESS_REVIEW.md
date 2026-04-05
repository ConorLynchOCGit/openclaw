# Memory Middleware Automation Readiness Review

## Purpose

This document records the repo-native operational review after the real
non-production rollout of:

- advisory scheduling for `proactive_plan`
- execute-class scheduling for `proactive_execute_run_drift_check`
- advisory scheduling for `consolidation_plan`
- execute-class scheduling for bounded safe `consolidation_execute`

It does not enable any new automation.

It exists to decide whether the current automation boundary should expand,
hold, or contract before any further live change.

Current production rollout blocker note:

- no additional automation should be enabled just to compensate for missing
  production deployment access
- the correct next step remains obtaining a real production operator surface
  and replaying the already-approved boundary unchanged

## Current reviewed live posture

The current persistent real non-production target has already proven:

- passive runtime startup with no automatic writes
- read-only retrieval
- bounded governance writes through candidate, procedure, skill-candidate,
  procurement, vetting, approval, and install-record state
- advisory background-job scheduling for:
  - `proactive_plan`
  - `consolidation_plan`
- execute-class background-job scheduling for:
  - `proactive_execute_run_drift_check`
  - bounded safe `consolidation_execute`

Current live automation posture:

- `backgroundJobs.inspectionMode = enabled`
- `backgroundJobs.advisorySchedulingMode = enabled`
- `backgroundJobs.advisoryJobClasses = [proactive_plan, consolidation_plan]`
- `backgroundJobs.executeSchedulingMode = enabled`
- `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check, consolidation_execute]`
- `backgroundJobs.runnerOwnerId = rollout-runner-1`

Current live safety boundaries:

- direct proactive execution outside the scheduler remains disabled
- scheduled `consolidation_execute` remains limited to:
  - `duplicate_merge_review`
  - `stale_superseded_review`
- contradiction and drift consolidation actions remain disabled
- procurement or install automation remains disabled
- automatic Skill Vetter invocation remains disabled
- self-improving capture remains disabled
- actual installation remains disabled
- memory-slot takeover remains disabled

## What is already safely enabled

The following categories are now evidenced in the real non-production target:

- passive startup without background-write side effects
- read-only retrieval over approved durable memory and explicit bounded scopes
- bounded internal governance writes with preserved provenance and rollback by
  config disablement
- advisory scheduling with:
  - runner ownership enforcement
  - inspection surfaces
  - explicit job-class allowlists
- bounded execute-class scheduling with:
  - repeat-safe drift-check execution
  - bounded safe consolidation execution
  - config-level disablement rollback

The current live reports show:

- `proactive_plan` stays advisory-only and writes only job-state metadata
- `consolidation_plan` stays advisory-only and writes only job-state metadata
- `proactive_execute_run_drift_check` stays conservative and repeat-safe
- scheduled `consolidation_execute` changed only:
  - `memory_reviews +1`
  - `memory_links +1`
    in the live rollout and did not broaden into contradiction, drift,
    procurement, install, or external side effects

## What should remain disabled

The following automation should remain disabled in the current posture:

- consolidation-driven `contradiction_review`
- consolidation-driven `drift_check_review`
- any additional execute-class background jobs
- direct proactive execution outside the scheduler
- procurement, vetting, approval, or install automation
- automatic Skill Vetter invocation
- self-improving capture
- actual installation
- memory-slot takeover

These are not merely deferred features. They are the current operational
boundary that keeps the live automation loop inside already-reviewed internal
maintenance behavior.

## Assessment of whether another live automation step is justified now

Current conclusion:

- no additional live automation step is justified now

Reasoning:

- the currently enabled maintenance loop is still limited to a single local
  runner owner in one persistent non-production target
- the existing reports prove correctness for bounded cases, but they do not
  yet prove longer-run soak behavior, shared-environment ownership, or
  repeated-operations discipline beyond the local lane
- the currently enabled automation classes already span both advisory and
  execute-class maintenance
- the remaining unenabled classes are materially broader in authority or less
  well-bounded than the current maintenance loop

This means the right next operational step is not another automation class.
The right next step is continued observation, operator discipline, and shared
runbook hardening around the current boundary.

That hardening is now recorded in:

- `docs/memory-system/OPERATIONAL_RUNBOOK.md`

## Additional safeguards still needed before enabling anything beyond the current maintenance loop

Before any broader automation enablement, the review recommends all of the
following:

- a defined soak window for the current allowlists in the persistent local
  non-production target
- a documented shared-environment runner owner and escalation path beyond
  `rollout-runner-1`
- operator-facing inspection queries or scripts for:
  - queued jobs by `jobClass`
  - succeeded jobs by `jobClass`
  - failed jobs by `jobClass`
  - oldest queued job age
  - most recent `execution_metadata` payload by `jobClass`
- an explicit runbook for removing a single advisory or execute job class from
  its allowlist without touching retrieval or governance posture
- a shared-environment rehearsal that keeps the current live allowlists
  unchanged before any broader rollout is considered

## Recommendation for the next live step

Evaluated options:

1. keep automation boundary as-is
2. enable one additional low-risk advisory class
3. enable one additional low-risk execute class
4. pause automation expansion pending more safeguards

Recommended option:

- keep automation boundary as-is

Why this option:

- the current boundary is already the first combined advisory plus execute
  maintenance loop
- no equally low-risk additional advisory class is implemented beyond the
  current allowlists
- any additional execute-class expansion would cross into broader
  contradiction or drift-remediation authority, which is not justified by the
  current evidence
- the current posture is strong enough for continued bounded observation, but
  not yet strong enough to justify another automation expansion

Operational interpretation:

- do not enable any new automation class in the next live slice
- continue single-runner bounded use of:
  - `proactive_plan`
  - `consolidation_plan`
  - `proactive_execute_run_drift_check`
  - safe bounded `consolidation_execute`
- treat the next likely slice as a soak or shared-environment rehearsal, not
  an automation-expansion slice

Current reconciliation note:

- no real shared non-production target is yet wired from the current repo or
  host context, so the next shared-environment step remains pending target
  availability

## Conclusion

The current real non-production automation posture is acceptable to keep
running within its existing boundary.

It is not yet ready for broader automation expansion.

The recommended next live step is:

- keep automation boundary as-is

Any later expansion should wait for more soak evidence, a named shared-runner
ownership model, and stronger inspection or rollback runbook discipline in a
shared environment.
