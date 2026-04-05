# Governance Surface Productionization

## Purpose

Several governance surfaces are already built and exercised in persistent or
shared non-production environments, but they are not yet treated as normal
production-proven operator workflows.

This document turns that ambiguous state into an explicit productionization
plan.

## Scope

Covered families:

- validated-procedure retrieval
- candidate procedure promotion
- procedure validation
- skill-candidate planning and creation
- procurement planning and internal procurement-record creation
- manual Skill Vetter handoff preparation and manual vetting-result recording
- approval planning and approval-state recording
- manual install handoff and install-record creation

## Current status

### Already production-proven

The quick-win tranche is no longer ambiguous.

- validated-procedure retrieval / procedure promotion / procedure validation
  - production proof date:
    - `2026-04-05`
  - proof artifact:
    - `docs/memory-system/PRODUCTION_VALIDATED_PROCEDURE_GOVERNANCE_REPORT.md`
  - accepted status:
    - live internal manual workflow
  - still explicitly outside the accepted family:
    - `memory_procedure_validate_plan`
    - later governance follow-on behavior remains outside the accepted
      validated-procedure family
- skill-candidate planning / skill-candidate creation / procurement planning /
  internal procurement-record creation
  - production proof date:
    - `2026-04-05`
  - proof artifact:
    - `docs/memory-system/PRODUCTION_SKILL_PROCUREMENT_GOVERNANCE_REPORT.md`
  - accepted status:
    - live internal manual workflow
  - still outside the accepted family:
    - vetting
    - approval
    - install

### Already exists in code

These surfaces are wired through the runtime in
`extensions/memory-middleware/src/runtime.ts`.

### Already validated off-production

Evidence exists in rollout reports including:

- `docs/memory-system/REAL_ENV_CANDIDATE_PROCEDURE_PROMOTION_ROLLOUT_REPORT.md`
- `docs/memory-system/REAL_ENV_PROCEDURE_VALIDATION_ROLLOUT_REPORT.md`
- `docs/memory-system/REAL_ENV_SKILL_CANDIDATE_ROLLOUT_REPORT.md`
- `docs/memory-system/REAL_ENV_SKILL_CANDIDATE_PROCUREMENT_ROLLOUT_REPORT.md`
- `docs/memory-system/REAL_ENV_SKILL_CANDIDATE_VETTING_ROLLOUT_REPORT.md`
- `docs/memory-system/REAL_ENV_SKILL_CANDIDATE_APPROVAL_ROLLOUT_REPORT.md`
- `docs/memory-system/REAL_ENV_SKILL_CANDIDATE_INSTALL_ROLLOUT_REPORT.md`
- `docs/memory-system/SHARED_ENV_REHEARSAL_REPORT.md`

### Why this is still not enough

These surfaces are still ambiguous because:

- they are not normal day-to-day production-proven operator paths
- some are present in config posture but not explicitly exercised as accepted
  live workflows
- user-facing memory work has since moved focus away from these governance
  surfaces

## What “brought online” means

For these surfaces, “brought online” does not mean autonomous execution.

It means:

- explicit production proof exists
- operator runbook steps exist
- production status is declared for each family:
  - live manual tool surface
  - live but intentionally internal-only
  - still disabled

## Family-by-family plan

## Quick-win tranche vs wait tranche

The governance backlog should not be productionized as one uniform bundle.

The locked order is:

### Quick-win tranche: execute first

These are the built governance surfaces that can be brought online first
without crossing into approval/install semantics or external execution:

1. validated-procedure retrieval / procedure promotion / procedure validation
2. skill-candidate planning and creation
3. procurement planning and internal procurement-record creation

Why these are quick wins:

- the runtime substrate already exists
- off-production validation already exists
- they remain internal/manual and lineage-preserving
- they stop short of approval/install state
- they provide operational closure without broadening autonomous behavior

### Wait tranche: do later

These should wait until after the quick-win tranche and the next user-facing
memory phases:

4. manual Skill Vetter handoff preparation and manual vetting-result recording
5. approval planning and approval-state recording
6. manual install handoff and install-record creation

Why these should wait:

- they increase coupling to external review or downstream lifecycle authority
- they are closer to normal-use approval/install semantics
- they are easier to misunderstand as "nearly automatic" even when still
  manual-only
- rollout mistakes here are more expensive than the quick-win tranche

### Validated-procedure retrieval / procedure promotion / procedure validation

- target status:
  - production-proven internal workflow
- current status:
  - production-proven internal workflow
- tranche:
  - quick win
- still manual-only:
  - yes
- required proof:
  - completed on `2026-04-05`
  - narrow production operator proof and runbook confirmation now recorded in:
    - `docs/memory-system/PRODUCTION_VALIDATED_PROCEDURE_GOVERNANCE_REPORT.md`

### Skill-candidate planning and creation

- target status:
  - production-proven internal governance workflow
- current status:
  - production-proven internal governance workflow
- tranche:
  - quick win
- still manual-only:
  - yes
- required proof:
  - completed on `2026-04-05`
  - narrow production proof now recorded in:
    - `docs/memory-system/PRODUCTION_SKILL_PROCUREMENT_GOVERNANCE_REPORT.md`

### Procurement planning and procurement-record creation

- target status:
  - production-proven recommendation/governance workflow
- current status:
  - production-proven internal governance workflow
- tranche:
  - quick win
- still manual-only:
  - yes
- required proof:
  - completed on `2026-04-05`
  - narrow production proof now recorded in:
    - `docs/memory-system/PRODUCTION_SKILL_PROCUREMENT_GOVERNANCE_REPORT.md`

### Manual Skill Vetter handoff and vetting-result recording

- target status:
  - production-proven internal workflow
- tranche:
  - wait
- still manual-only:
  - yes
- required proof:
  - production proof with explicit no automatic Skill Vetter invocation

### Approval planning and approval-state recording

- target status:
  - production-proven internal workflow
- tranche:
  - wait
- still manual-only:
  - yes
- required proof:
  - production proof with no automatic approval cascade

### Manual install handoff and install-record creation

- target status:
  - production-proven internal record workflow
- tranche:
  - wait
- still manual-only:
  - yes
- required proof:
  - production proof with no actual installation

## Quick-win execution plan

The quick-win tranche should be productionized in this order:

1. completed:
   - validated-procedure retrieval / procedure promotion / procedure validation
2. completed:
   - skill-candidate planning and creation
3. completed:
   - procurement planning and procurement-record creation

For each family:

- confirm the current runtime/config posture
- prove the existing manual/internal behavior in the isolated proof environment
  if any config or docs changed
- run one narrow production proof
- add runbook steps and rollback notes
- declare the family either:
  - live manual tool surface
  - live but intentionally internal-only
  - still deferred if proof uncovers unexpected friction

Quick-win tranche status:

- complete on `2026-04-05`
- remaining governance work is now wait-tranche work only

Quick-win stop rule:

- stop the tranche immediately if any family requires:
  - approval-state mutation
  - install handoff/record mutation
  - external side effects beyond manual internal governance recording

That family moves to the wait tranche instead of being forced through.

## What should remain disabled even after productionization

- automatic Skill Vetter invocation
- automatic procurement
- automatic approval
- actual installation
- external follow-up actions
- broad autonomous scheduler expansion

## Runbook / ops changes needed

- production operator runbook entry for each family
- explicit inspection queries or helper commands
- explicit rollback/disablement notes for each family

## Production proof posture

- one family at a time
- isolated proof environment first if any code/behavior changes are needed
- narrow production acceptance afterward

Quick-win tranche rule:

- do not batch the whole quick-win set into one rollout
- but do complete the quick-win tranche before pivoting back to the next major
  user-facing semantic slice, unless one family blocks or expands in scope

## Risks / failure modes

- treating built-off-production as equivalent to production-ready
- batching too many governance families together
- enabling downstream automation accidentally

## Open questions

- after the quick-win tranche, which wait-tranche families should remain
  permanently internal-only even after later productionization?
