# Production Skill / Procurement Governance Report

## Purpose

This document records the second and final quick-win governance
productionization tranche for the already-built manual/internal workflow that
stops at:

- `memory_skill_candidate_plan`
- `memory_skill_candidate_create`
- `memory_skill_candidate_procurement_plan`
- `memory_skill_candidate_procurement_record_create`

This tranche intentionally did not broaden into:

- `memory_skill_candidate_skill_vetter_handoff`
- `memory_skill_candidate_vetting_result_record`
- `memory_skill_candidate_approval_plan`
- `memory_skill_candidate_approve`
- `memory_skill_candidate_install_handoff`
- `memory_skill_candidate_install_record_create`

## Rollout date

- `2026-04-05`

## Exact posture proved

- production container:
  - `openclaw`
- isolated proof container:
  - `openclaw-slice7-proof`
- production `candidateIngress.mode`:
  - `submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
- proof `candidateIngress.mode`:
  - `submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
- retrieval posture:
  - `memoryObjectQuery.mode = read-only`

Important posture note:

- the current runtime config already exposes later manual governance surfaces
  in the same long ingress mode
- this report proves only the skill/procurement family as an accepted manual
  internal workflow
- vetting, approval, and install surfaces remain outside the accepted
  production-proven boundary until they are separately proven and documented

## Acceptance target used

The accepted target for this tranche was:

- one bounded eligible validated procedure can reach skill-candidate planning
- one bounded eligible validated procedure can reach skill-candidate creation
- one bounded eligible skill candidate can reach procurement planning
- one bounded eligible skill candidate can reach one internal
  procurement-record write
- lineage from source event, candidate, review, validated procedure, and
  validation run remains intact
- no vetting, approval, or install event growth occurs
- no background-job, tool-result, or compaction growth occurs
- skill-candidate and procurement records stay off the normal
  `approved_only` retrieval surface

## Isolated proof-environment validation

The proof harness used:

- prerequisite path:
  - `runtime.candidateIngress.submitProcedureSuggestion`
  - `runtime.candidateReview.review`
  - `runtime.candidatePromotionPlan.plan`
  - `runtime.candidatePromotion.promoteToProcedureDraft`
  - `runtime.procedureValidation.validate`
- quick-win family path:
  - `memory_skill_candidate_plan`
  - `memory_skill_candidate_create`
  - `memory_skill_candidate_procurement_plan`
  - `memory_skill_candidate_procurement_record_create`
- retrieval/inspection:
  - `memory_object_get`
  - `memory_object_list`

Proof-environment ids:

- `runId = skill-procurement-quickwin-2026-04-05T15:18:08.585Z`
- `eventId = c4c28c8f-0b2d-4924-9104-926868949d89`
- `candidateId = 5d8e9889-98c4-4b59-9869-7fa5e53fdc1c`
- `reviewId = 5647ccc8-0515-4530-a438-80908324c41e`
- `procedureId = 7f15c27e-b909-4cf4-b6ba-6673bb32bb06`
- `procedureRunId = 9105920a-d4fa-4ccd-8528-b33e2db0ea72`
- `skillCandidateId = a26a097f-26ba-4dda-bfca-ae49a863eb6f`
- `procurementRecordId = 8d160d89-0e2c-4bb9-8587-c8222632170d`

Observed proof-environment deltas:

- `memory_events +2`
- `memory_objects +1`
- `memory_reviews +1`
- `memory_links +1`
- `memory_sources +1`
- `procedures +1`
- `procedure_runs +1`
- `skill_candidates +1`
- `background_jobs +0`
- `agent_state +0`
- `tool_results +0`
- `compaction_events +0`

Observed proof-environment lifecycle-event deltas:

- `skill_candidate.procurement_record +1`
- `skill_candidate.vetting_result +0`
- `skill_candidate.approval +0`
- `skill_candidate.install_record +0`

Observed proof-environment retrieval evidence:

- validated procedure read required
  `scope = include_validated_procedures`
- `memory_object_get(objectId = skillCandidateId)` returned `status = not_found`
- `memory_object_get(objectId = procurementRecordId)` returned
  `status = not_found`
- `memory_object_list(scope = approved_only, projectId = generated proof project id)`
  returned no leaked rows

## Narrow production proof

Pre-proof health:

- `curl http://127.0.0.1:28789/healthz`
  - `{"ok":true,"status":"live"}`

The production proof used the same bounded path as the isolated proof
environment:

- prerequisite path:
  - `runtime.candidateIngress.submitProcedureSuggestion`
  - `runtime.candidateReview.review`
  - `runtime.candidatePromotionPlan.plan`
  - `runtime.candidatePromotion.promoteToProcedureDraft`
  - `runtime.procedureValidation.validate`
- quick-win family path:
  - `memory_skill_candidate_plan`
  - `memory_skill_candidate_create`
  - `memory_skill_candidate_procurement_plan`
  - `memory_skill_candidate_procurement_record_create`
- retrieval/inspection:
  - `memory_object_get`
  - `memory_object_list`

Production ids:

- `runId = skill-procurement-quickwin-2026-04-05T15:18:19.270Z`
- `eventId = c3f085b5-387d-4fc9-b3ae-9e4b2e8ec580`
- `candidateId = daba868a-9e0a-4099-ab83-952b3d4513f4`
- `reviewId = 62b5bbba-47fe-4158-b298-498f68a2ac36`
- `procedureId = fefa54a7-3169-4595-bef2-44fb8342a73a`
- `procedureRunId = f90116f5-503c-4497-95dc-33bf89659e17`
- `skillCandidateId = 63a32b7f-5665-44d2-970f-7f3dca6267f6`
- `procurementRecordId = 8f62046d-18f0-43be-af5a-c28122e19474`

Observed production deltas:

- `memory_events +2`
- `memory_objects +1`
- `memory_reviews +1`
- `memory_links +1`
- `memory_sources +1`
- `procedures +1`
- `procedure_runs +1`
- `skill_candidates +1`
- `background_jobs +0`
- `agent_state +0`
- `tool_results +0`
- `compaction_events +0`

Observed production lifecycle-event deltas:

- `skill_candidate.procurement_record +1`
- `skill_candidate.vetting_result +0`
- `skill_candidate.approval +0`
- `skill_candidate.install_record +0`

Observed production evidence:

- `runtime.candidatePromotionPlan.plan` returned:
  - `possibleTargets = [propose_procedure_draft, remain_candidate_only]`
- `memory_skill_candidate_plan` returned:
  - `possibleTargets = [propose_skill_candidate, remain_validated_procedure_only]`
- `memory_skill_candidate_procurement_plan` returned:
  - `possibleTargets = [propose_procurement_handoff, remain_internal_skill_candidate_only]`
- `memory_skill_candidate_create` created one bounded `skill_candidates` row
  preserving:
  - `createdFromProcedureId`
  - `sourceCandidateId`
  - `promotedFromReviewId`
  - `sourceEventId`
  - `validationRunId`
- `memory_skill_candidate_procurement_record_create` created one internal
  `memory_events` row with:
  - `event_name = skill_candidate.procurement_record`
  - `event_kind = review`
  - preserved `skillCandidateId`, `sourceProcedureId`, `sourceCandidateId`,
    and recorder metadata
- `memory_object_get(objectId = skillCandidateId)` returned `status = not_found`
- `memory_object_get(objectId = procurementRecordId)` returned
  `status = not_found`
- `memory_object_list(scope = approved_only, projectId = generated production proof project id)`
  returned no leaked rows

Post-proof health:

- `curl http://127.0.0.1:28789/healthz`
  - `{"ok":true,"status":"live"}`
- container health:
  - `openclaw Up (healthy)`

## Accepted production status

This family is now accepted as:

- production-proven internal governance workflow
- manual-only
- lineage-preserving
- non-retrieval-broadening

## What remains outside this accepted family

The following surfaces remain outside the accepted production-proven
quick-win boundary even though the longer config posture exists:

- `memory_skill_candidate_skill_vetter_handoff`
- `memory_skill_candidate_vetting_result_record`
- `memory_skill_candidate_approval_plan`
- `memory_skill_candidate_approve`
- `memory_skill_candidate_install_handoff`
- `memory_skill_candidate_install_record_create`

## Rollback / disablement note

If this family causes trouble while validated-procedure governance should stay
available:

- narrow `candidateIngress.mode` to:
  - `submit-review-promote-memory-procedure-validate`

If the issue is broader and should disable validated-procedure governance too:

- narrow `candidateIngress.mode` to:
  - `submit-review-promote-memory`

No schema rollback or pairing/auth changes were required for this tranche.
