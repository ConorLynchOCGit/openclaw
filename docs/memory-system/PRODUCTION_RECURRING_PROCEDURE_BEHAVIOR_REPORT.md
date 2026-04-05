# Production Recurring-Procedure Behavior Report

## Purpose

This report records the fourth user-experience-focused memory slice.

The goal of this slice was to make already-validated recurring checklists feel
more useful in normal nearby asks without broadening into silent background
application, generic procedure extraction, or broader automation.

This slice was intentionally limited to the already-live recurring checklist
subjects:

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
  - `openclaw:local@sha256:2278f3df8e3f02447291ea366e175af6057d98bc9e73614553d0ac2ac064863a`
- image after redeploy:
  - `openclaw:local@sha256:2cd0c6f2080aa77312cf1c5f185fa254b48ccebb42a901aae15d192f9fe56e6a`
- rollback tag:
  - `openclaw:pre-recurring-procedure-behavior-20260405T193900Z`
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
- isolated proof used one-off bounded runtime invocation against the proof DB
- production proof used direct bounded runtime invocation against the running
  container's built `dist` output and the live DB config

## Acceptance target used

This slice was accepted only if it proved all of the following for the
already-live recurring checklist family:

- clear checklist asks still retrieve the right validated stored procedure
- nearby deploy/release/triage/investigation asks can also retrieve the right
  validated procedure even without explicit `checklist` wording
- procedure-key inference remains bounded to the supported checklist family
- suggestion-first behavior for nearby asks is explicit in prompt guidance
- direct-use remains limited to clear checklist asks
- no new durable write noise is introduced for nearby retrieval-only asks
- no downstream skill, procurement, vetting, approval, or install activity is
  triggered
- production health remains unchanged before and after redeploy and proof

What remained intentionally out of scope after this slice:

- broader procedure families beyond the supported named checklists
- vague one-off instructions
- silent background application of stored procedures
- workflow-improvement memory
- broader project-memory expansion
- unmet-need or recommendation planning
- phrase induction as live behavior
- self-improving capture enablement
- UI memory inspection

## Live posture before this slice

Before this slice:

- bounded recurring-procedure capture, confirmation, correction, and
  validated-procedure retrieval were already live for supported named
  checklists
- retrieval guidance was still too dependent on explicit checklist wording
- the locked suggestion-first posture for nearby advice asks was not yet fully
  expressed in ranking plus prompt guidance

The missing product behavior was:

- procedure-key-aware retrieval for nearby deploy/release/triage or
  investigation asks
- explicit prompt guidance telling the model to surface stored checklists as
  relevant options on nearby asks instead of only on explicit checklist asks

## Exact bounded surfaces used

Retrieval and inference:

- `extensions/memory-middleware/src/db/queries.ts`

Behavior guidance:

- `extensions/memory-core/src/prompt-section.ts`

Regression coverage:

- `extensions/memory-core/index.test.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts`

## Isolated proof validation

Proof context:

- `projectId = af076922-9862-47b4-8d3f-32ce1a9d527e`
- `agentId = 775d9727-30e1-48a9-b9ff-2408ea033beb`
- `sessionId = ef3cf7d9-b63e-4442-9068-d99abdc1d903`

Validated procedure used:

- `validatedProcedureId = 6d163b62-2d14-46ef-b0c4-f86220f2cc8b`

Proof queries:

- clear ask:
  - `give me my deploy checklist`
- nearby ask:
  - `how should we deploy this safely`

Observed retrieval outcome:

- both queries returned the same validated deploy checklist first
- the clear ask matched fields included:
  - `procedure_key_match`
  - `trigram_similarity`
- the nearby ask matched fields included:
  - `procedure_key_match`

Observed prompt guidance proof:

- prompt guidance explicitly told the model to use validated-procedure
  retrieval for nearby deploy/release/triage/investigation asks even without
  `checklist` wording
- prompt guidance explicitly kept suggestion-first behavior for nearby advice
  asks and direct-use only for clear checklist asks

Observed durable-write effect:

- no new durable write classes were introduced by this slice
- this proof exercised retrieval and prompt shaping only

## Production proof validation

Production proof context:

- `projectId = c5120fe9-b48c-411e-9fe9-c10757a0ac9a`
- `agentId = 4635a71e-fe43-4175-ab33-27c4e2a65809`
- `sessionId = 7a211d26-f80f-4a17-b078-abf3b0bd00d5`

Validated procedure used:

- `validatedProcedureId = ed5dd44a-6ea9-4055-88d0-2e6d7bc05017`

Proof queries:

- clear ask:
  - `use my release checklist`
- nearby ask:
  - `what do you recommend for release steps`

Observed retrieval outcome:

- both queries returned the same validated release checklist first
- the clear ask matched fields included:
  - `procedure_key_match`
  - `trigram_similarity`
- the nearby ask matched fields included:
  - `procedure_key_match`

Observed prompt guidance proof:

- production prompt guidance included the nearby-ask retrieval line
- production prompt guidance included the suggestion-first line for nearby
  advice asks

Observed durable-write effect:

- this proof did not create new candidate, review, procedure, or skill rows
- `skill_candidates +0`
- `background_jobs +0`

## Health and rollback checks

Before redeploy:

- `curl http://127.0.0.1:28789/healthz`
  - `{"ok":true,"status":"live"}`

After redeploy and proof:

- `curl http://127.0.0.1:28789/healthz`
  - `{"ok":true,"status":"live"}`

Rollback handle:

- `openclaw:pre-recurring-procedure-behavior-20260405T193900Z`

## Exact user-visible change now live

What became materially more useful:

- clear checklist asks still work as before
- nearby asks like deployment, release, triage, or investigation advice can
  now retrieve the right stored checklist even without exact checklist wording
- the application posture remains bounded:
  - suggestion-first on nearby asks
  - direct-use only on clear checklist asks
  - no silent background application

## Remaining limitations

- only the supported named checklist family participates in this behavior
  expansion
- broader workflow-improvement memory is still not live
- vague one-off instructions still do not become durable procedures
- silent background application of stored procedures is still not live
