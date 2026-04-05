# Production Validated-Procedure Governance Report

## Purpose

This report records the first quick-win governance productionization tranche
for:

- validated-procedure retrieval
- candidate procedure promotion
- procedure validation

The goal of this tranche was to take this family from "built and validated
off-production" to "explicitly production-proven, manual-only, and
operationally clear" without broadening into later governance families.

## Rollout date

- `2026-04-05`

## Exact runtime targets

Production runtime:

- Compose project: `openclaw-upgrade-2026324`
- container: `openclaw`
- image: `openclaw:local`
- gateway health endpoint: `http://127.0.0.1:28789/healthz`

Isolated proof runtime:

- container: `openclaw-slice7-proof`
- image: `openclaw:slice7-proof-local`
- gateway health endpoint: `http://127.0.0.1:37789/healthz`

## Acceptance target used

This tranche was accepted only if the family proved as:

- production-proven internal workflow
- still manual-only
- lineage-preserving
- no downstream skill, procurement, vetting, approval, or install behavior
- no user-facing semantic expansion

What counts as online for this family:

- operators can submit a bounded procedure candidate
- operators can accept the candidate review
- operators can confirm advisory promotion eligibility
- operators can promote the candidate into a draft procedure
- operators can validate the draft procedure
- operators can retrieve the validated procedure only through explicit
  validated-procedure scope

What remains intentionally disabled after this tranche:

- `memory_procedure_validate_plan`
- skill-candidate creation and planning as part of this workflow
- procurement planning or procurement-record creation as part of this workflow
- any vetting, approval, or install behavior
- automatic Skill Vetter invocation
- procurement/install automation
- actual installation

## Live posture before this tranche

Production and proof runtimes both already had:

- `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
- `memoryObjectQuery.mode = read-only`

That meant the procedure family was already configured, but not yet explicitly
documented as a normal production-proven operator workflow.

The operator path remained:

- gateway health checks
- direct in-container middleware runtime and tool invocation

Bearer-auth HTTP `/tools/invoke` remained out of scope.

## Exact tools used

- `memory_candidate_submit`
- `memory_candidate_review`
- `memory_candidate_promote_plan`
- `memory_candidate_promote_procedure`
- `memory_procedure_validate`
- `memory_object_get`
- `memory_object_list`

## Isolated proof validation

Proof run id:

- `governance-quickwin-2026-04-05T15:00:03.335Z`

Observed ids:

- candidate event id:
  - `18679165-270d-4869-9571-d55ea70c574b`
- candidate object id:
  - `9cad8b0c-5bc9-47c9-9830-aea81aaf5413`
- review id:
  - `7b115af7-3692-4f09-a1ac-2c123861a6b4`
- promoted procedure id:
  - `f72d363f-74f6-4488-94e0-9a0645afadae`
- procedure run id:
  - `7fd3ba45-e39e-475c-875d-8c55545f54d7`

Observed bounded row deltas:

- `memory_events +1`
- `memory_objects +1`
- `memory_reviews +1`
- `memory_links +1`
- `memory_sources +1`
- `procedures +1`
- `procedure_runs +1`
- `skill_candidates +0`
- `background_jobs +0`
- `agent_state +0`
- `tool_results +0`
- `compaction_events +0`

Observed retrieval behavior:

- `memory_object_get(objectId = procedureId)` returned:
  - `status = not_found`
- `memory_object_get(objectId = procedureId, scope = include_validated_procedures)`
  returned:
  - `status = ok`
  - `readSurface = validated_procedure_read_model`
- `memory_object_list(scope = include_validated_procedures, kind = procedure)`
  returned the validated procedure row

Observed lineage:

- procedure row preserved:
  - `promotedFromCandidateId`
  - `promotedFromReviewId`
  - `sourceEventId`
  - `lastValidationRunId`
  - `validationRationale`
- procedure run preserved:
  - `sourceCandidateId`
  - `promotedFromReviewId`
  - `sourceEventId`

## Narrow production proof

Pre-proof health:

- `GET /healthz -> {"ok":true,"status":"live"}`
- container health: `healthy`

Production proof run id:

- `governance-quickwin-2026-04-05T15:00:19.781Z`

Observed ids:

- candidate event id:
  - `f7515d2e-1251-4d15-838c-d34c829ec3ac`
- candidate object id:
  - `f1a8763b-92f4-4b72-9fd2-cdcdf0b8858d`
- review id:
  - `fa7ef0ee-1891-4b6e-a467-0caa55aaf2f7`
- promoted procedure id:
  - `b7c160d6-6414-44f2-a382-952c8762b77f`
- procedure run id:
  - `28f57aee-b0b1-4ecc-8861-041b8ce7b933`

Observed bounded row deltas:

- `memory_events +1`
- `memory_objects +1`
- `memory_reviews +1`
- `memory_links +1`
- `memory_sources +1`
- `procedures +1`
- `procedure_runs +1`
- `skill_candidates +0`
- `background_jobs +0`
- `agent_state +0`
- `tool_results +0`
- `compaction_events +0`

Observed promotion and validation evidence:

- `memory_candidate_promote_plan` returned:
  - `possibleTargets = [propose_procedure_draft, remain_candidate_only]`
- `memory_candidate_promote_procedure` returned:
  - `status = promoted`
  - `procedureStatus = draft`
- `memory_procedure_validate` returned:
  - `status = validated`
  - `procedureStatus = validated`
  - `sourceCandidateId = f1a8763b-92f4-4b72-9fd2-cdcdf0b8858d`

Observed retrieval evidence:

- `memory_object_get(objectId = b7c160d6-6414-44f2-a382-952c8762b77f)` returned:
  - `status = not_found`
- `memory_object_get(objectId = b7c160d6-6414-44f2-a382-952c8762b77f, scope = include_validated_procedures)`
  returned:
  - `status = ok`
  - `readSurface = validated_procedure_read_model`
- `memory_object_list(scope = include_validated_procedures, kind = procedure)`
  returned the new validated procedure row plus the existing validated shared
  rehearsal rows

Observed downstream guard:

- total `skill_candidates` remained `4 -> 4`
- `skill_candidates where source_procedure_id = b7c160d6-6414-44f2-a382-952c8762b77f`
  remained `0`
- no background-job, agent-state, tool-result, or compaction growth occurred

Post-proof health:

- `GET /healthz -> {"ok":true,"status":"live"}`
- container health: `healthy`

## Operational result

This family is now explicitly production-proven as:

- live internal manual tool surface
- lineage-preserving
- retrieval-hidden by default
- visible only through explicit validated-procedure scope

It is not:

- user-facing semantic procedure memory
- autonomous procedure execution
- skill-candidate, procurement, vetting, approval, or install automation

## Rollback and disablement

Preferred rollback posture remains operational rather than schema rollback.

If this family must be disabled specifically:

1. stop manual use of:
   - `memory_candidate_promote_procedure`
   - `memory_procedure_validate`
2. narrow `candidateIngress.mode` to `submit-review-promote-memory`
3. restart only the gateway container

That disables:

- candidate procedure promotion
- procedure validation
- later skill/procurement/vetting/approval/install governance surfaces that
  depend on validated procedures

If the issue is broader than this family:

1. disable the plugin
2. preserve the database for inspection
3. restore from backup only if a database-level rollback is required
