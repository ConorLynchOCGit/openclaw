# Production Recurring-Procedure Semantic UX Report

## Purpose

This report records the third user-experience-focused semantic memory slice.

The goal of this slice was to make reusable named checklists feel materially
useful to a normal user without broadening into a generic fuzzy procedure
writer or broader procedure automation.

This slice was intentionally limited to bounded recurring checklist subjects:

- deploy checklist
- release checklist
- triage checklist
- investigation checklist

## Rollout date

- `2026-04-05`

## Exact runtime targets

Production runtime:

- Compose project: `openclaw-upgrade-2026324`
- container: `openclaw`
- image before redeploy:
  - `openclaw:local@sha256:e195151f79d32d7e12e436d89621dbb9cdf213294c39eb76fa2e8609f9c4cb6a`
- image after redeploy:
  - `openclaw:local@sha256:2278f3df8e3f02447291ea366e175af6057d98bc9e73614553d0ac2ac064863a`
- rollback tag:
  - `openclaw:pre-recurring-procedure-20260405T190711Z`
- gateway health endpoint:
  - `http://127.0.0.1:28789/healthz`

Isolated proof runtime:

- container: `openclaw-slice7-proof`
- image:
  - `openclaw:slice7-proof-local@sha256:e195151f79d32d7e12e436d89621dbb9cdf213294c39eb76fa2e8609f9c4cb6a`
- gateway health endpoint:
  - `http://127.0.0.1:37789/healthz`

Proof execution note:

- gateway bearer-auth `POST /tools/invoke` remains forbidden in this posture
- isolated proof and production proof both used direct bounded runtime
  invocation through local `node --import tsx` against the same live plugin
  config and backing databases

## Acceptance target used

This slice was accepted only if it proved all of the following for supported
recurring checklist subjects:

- natural recurring-checklist phrasing works beyond the old exact-pattern
  posture
- semantic detection stays bounded to the approved checklist subject set
- high-confidence reusable checklist turns can land through the existing
  procedure path without manual review
- medium-confidence recurring-procedure turns create pending-confirmation
  candidates instead of dead manual-review backlog
- later confirming evidence can auto-promote those pending candidates without
  manual review
- supported recurring-procedure corrections can supersede stale validated
  procedures for the same subject
- clear checklist asks can retrieve the right validated stored procedure
- weak ambiguous nearby one-off turns are ignored rather than creating memory
  trash
- duplicate suppression and seam attribution remain explainable
- no downstream skill, procurement, vetting, approval, or install activity is
  triggered

What remained intentionally out of scope after this slice:

- broad procedure families beyond the supported named checklists
- vague one-off instructions
- silent background application of stored procedures
- workflow-improvement memory
- broader project-memory expansion
- unmet-need / recommendation planning
- phrase induction as live behavior
- self-improving capture enablement
- UI memory inspection

## Live posture before this slice

Before this slice:

- the bounded governance procedure substrate already existed and was
  production-proven as an internal workflow
- validated-procedure retrieval already existed when explicitly requested
- users still could not naturally teach a reusable named checklist and get it
  back later through the semantic front end
- the accepted canonical seam remained:
  - `model_tool_primary`
- `transcript_subscriber_fallback` remained a bounded assist seam, not the
  canonical seam

The missing product behavior was:

- bounded recurring-procedure semantic detection
- medium-confidence recurring-procedure confirmation without manual review
- bounded recurring-procedure correction or supersede
- procedure-key-aware retrieval ranking for clear checklist asks

## Exact bounded surfaces used

Semantic recurring-procedure detection:

- `extensions/memory-middleware/src/recurring-procedure-semantic.ts`

Recurring-procedure candidate lifecycle:

- `extensions/memory-middleware/src/recurring-procedure-lifecycle.ts`

Tool-seam capture and correction:

- `extensions/memory-middleware/src/tools/candidate-submit.ts`

Transcript assist path:

- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`

Retrieval and behavior guidance:

- `extensions/memory-middleware/src/db/queries.ts`
- `extensions/memory-core/src/prompt-section.ts`
- validated-procedure retrieval via:
  - `memory_object_search_hybrid`
  - `memory_object_get`

## Isolated proof validation

Proof context:

- `projectId = af076922-9862-47b4-8d3f-32ce1a9d527e`
- `agentId = 775d9727-30e1-48a9-b9ff-2408ea033beb`
- `sessionId = ef3cf7d9-b63e-4442-9068-d99abdc1d903`
- `sessionKey = agent:main:isolated-recurring-procedure-e634af8f`

Observed bounded row deltas:

- `memory_events +3`
- `memory_objects +3`
- `memory_reviews +3`
- `procedures +3`
- `procedure_runs +3`
- `skill_candidates +0`
- `background_jobs +0`

### Direct recurring-checklist proof

Direct turn:

- `My deploy checklist:`
- `1. Open the canary lane.`
- `2. Verify health.`
- `3. Watch error budgets.`

Observed ids:

- event id:
  - `1816904b-cb41-4646-94d0-c3d65ffad7ae`
- candidate id:
  - `57deff37-f857-4e00-a564-da4868bcfdac`
- accepted review id:
  - `7bfadcf7-4ea5-4d6b-b2ea-36ee33a81e76`
- validated procedure id:
  - `6f14bd65-cadb-4d60-a90e-0af02a9bb2b9`
- procedure run id:
  - `dda85498-9717-46aa-9ca1-7f226acebe1b`

Observed outcome:

- the reusable checklist landed as:
  - `status = accepted`
  - `kind = procedure`
  - `reviewState = approved`
- retrieval succeeded only in validated-procedure scope
- hybrid retrieval ranked the matching stored procedure first
- top matched fields included:
  - `procedure_key_match`
  - `trigram_similarity`

### Duplicate-suppression proof

Repeated transcript turn:

- `My deploy checklist:`
- `1. Open the canary lane.`
- `2. Verify health.`
- `3. Watch error budgets.`

Observed result:

- `memory_events +0`
- `memory_objects +0`
- `memory_reviews +0`
- `procedures +0`
- `procedure_runs +0`
- `skill_candidates +0`
- `background_jobs +0`

### Candidate-confirmation proof

Initial medium-confidence turn:

- `For releases, we use this checklist:`
- `1. Freeze the branch.`
- `2. Run the smoke tests.`

Observed pending candidate:

- event id:
  - `9bd1538c-6b17-4136-b420-fb81d90d0c1f`
- candidate id:
  - `060145cc-7f6e-464d-a198-3669d11a1723`

Observed pending metadata:

- `procedureKey = release_checklist`
- `confidence = medium`
- `state = pending_confirmation`
- `captureSeam = model_tool_primary`
- `source = recurring_procedure_semantic_v1`

Later confirming turn:

- `Our release checklist:`
- `1. Freeze the branch.`
- `2. Run the smoke tests.`

Observed approved rows:

- review id:
  - `97c238c0-3dbd-49d6-be77-5705ed80593d`
- validated procedure id:
  - `b2c44a62-b554-4236-9af9-cf24f8c740c8`
- procedure run id:
  - `779bc282-f5e4-42f1-bbee-b3502584ef8a`

Observed promotion metadata proved:

- `promotionProfile = recurring_procedure_confirmation_v1`
- `confirmationState = confirmed`
- `captureSeam = transcript_subscriber_fallback`

### Conversational correction proof

Correction turn:

- `Actually, my deploy checklist:`
- `1. Open the canary lane.`
- `2. Verify health.`
- `3. Roll forward.`

Observed corrected rows:

- event id:
  - `8a4b6cc3-caf3-4cdb-bfdc-382a3421eed4`
- candidate id:
  - `1e280c9d-3844-46d1-8c67-c65667e70f7d`
- accepted review id:
  - `c2b71fb2-aa88-41b7-b207-3e749ca7a4f6`
- corrected validated procedure id:
  - `6d163b62-2d14-46ef-b0c4-f86220f2cc8b`
- corrected procedure run id:
  - `3d3ff9ef-2081-40cc-bd20-2fc5cd8e1d80`

Observed supersede evidence:

- original validated deploy procedure:
  - `6f14bd65-cadb-4d60-a90e-0af02a9bb2b9`
- original procedure status became:
  - `superseded`
- corrected procedure metadata recorded:
  - `promotionProfile = recurring_procedure_correction_v1`

### Ambiguity / no-trash proof

Ambiguous turn:

- `We should probably have a triage checklist someday.`

Observed result:

- `memory_events +0`
- `memory_objects +0`
- `memory_reviews +0`
- `procedures +0`
- `procedure_runs +0`
- `skill_candidates +0`
- `background_jobs +0`

## Production proof validation

Production proof context:

- `projectId = c5120fe9-b48c-411e-9fe9-c10757a0ac9a`
- `agentId = 4635a71e-fe43-4175-ab33-27c4e2a65809`
- `sessionId = 7a211d26-f80f-4a17-b078-abf3b0bd00d5`
- `sessionKey = agent:main:prod-recurring-d872b0c2`

Baseline counts:

- `memory_events = 72`
- `memory_objects = 81`
- `memory_reviews = 34`
- `procedures = 7`
- `procedure_runs = 6`
- `skill_candidates = 5`
- `background_jobs = 7`

Final counts:

- `memory_events = 73`
- `memory_objects = 82`
- `memory_reviews = 35`
- `procedures = 8`
- `procedure_runs = 7`
- `skill_candidates = 5`
- `background_jobs = 7`

Observed production proof path:

- initial medium-confidence turn:
  - `For releases, we use this checklist:`
  - `1. Freeze the branch.`
  - `2. Run the smoke tests.`
- confirming turn:
  - `Our release checklist:`
  - `1. Freeze the branch.`
  - `2. Run the smoke tests.`

Observed ids:

- candidate event id:
  - `ca9cb5a6-85a7-44ac-b989-c76ee7ac48bb`
- candidate id:
  - `80d1acb9-394d-4c8f-aab5-e4e29b06373b`
- accepted review id:
  - `ec1d7a9e-791d-4dae-b3b8-8698f7e0140d`
- validated procedure id:
  - `ed5dd44a-6ea9-4055-88d0-2e6d7bc05017`
- procedure run id:
  - `f6968b5c-d814-4968-80ad-4f6cb44b955d`

Observed production deltas:

- after initial medium-confidence turn:
  - `memory_events +1`
  - `memory_objects +1`
  - `memory_reviews +0`
  - `procedures +0`
  - `procedure_runs +0`
  - `skill_candidates +0`
  - `background_jobs +0`
- after confirming turn:
  - `memory_events +0`
  - `memory_objects +0`
  - `memory_reviews +1`
  - `procedures +1`
  - `procedure_runs +1`
  - `skill_candidates +0`
  - `background_jobs +0`

Observed production metadata proved:

- pending candidate metadata carried:
  - `procedureKey = release_checklist`
  - `state = pending_confirmation`
  - `confidence = medium`
- approved procedure metadata carried:
  - `promotionProfile = recurring_procedure_confirmation_v1`
  - `confirmationState = confirmed`
  - `captureSeam = transcript_subscriber_fallback`

Observed production retrieval proof:

- scoped get:
  - `status = ok`
  - `readSurface = validated_procedure_read_model`
- unscoped get:
  - `status = not_found`
- hybrid search returned the validated release checklist first
- top matched fields included:
  - `procedure_key_match`

Observed production boundary proof:

- `skill_candidates +0`
- `background_jobs +0`
- no downstream governance growth occurred

Health checks:

- pre-proof health:
  - `{"ok":true,"status":"live"}`
- post-proof health:
  - `{"ok":true,"status":"live"}`
- post-redeploy health:
  - `{"ok":true,"status":"live"}`

## Final live status after this slice

What is now live for the supported recurring-procedure family:

- bounded semantic detection for reusable named checklists
- high-confidence direct landing through the existing validated-procedure path
- medium-confidence pending confirmation with later auto-promotion
- conversational recurring-procedure correction or supersede
- validated-procedure retrieval for clear checklist asks
- weak ambiguous ignore instead of memory trash

What is still not live:

- broad procedure extraction outside the supported checklist family
- silent background application of stored procedures
- workflow-improvement memory
- phrase induction
- self-improving capture
- UI inspection surfaces
