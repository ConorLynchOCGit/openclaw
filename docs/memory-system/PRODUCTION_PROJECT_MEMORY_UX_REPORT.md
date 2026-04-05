# Production Project-Memory Semantic UX Report

## Purpose

This report records the second user-experience-focused semantic memory slice.

The goal of this slice was to make a small bounded project profile feel
materially useful to a normal user without broadening into speculative or
freeform project memory.

This slice was intentionally limited to explicit named-project facts for:

- default branch
- staging branch
- primary package manager
- primary environment name

The production proof in this report exercised:

- default branch
- primary package manager

## Rollout date

- `2026-04-05`

## Exact runtime targets

Production runtime:

- Compose project: `openclaw-upgrade-2026324`
- container: `openclaw`
- image after redeploy:
  - `openclaw:local@sha256:e195151f79d32d7e12e436d89621dbb9cdf213294c39eb76fa2e8609f9c4cb6a`
- rollback tag:
  - `openclaw:pre-project-memory-20260405T175020Z`
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
  invocation through local `pnpm exec tsx` against the same live plugin
  config and backing databases

## Acceptance target used

This slice was accepted only if it proved all of the following for explicit
named-project facts in the supported first field set:

- natural named-project facts can be captured without relying on one exact
  phrase
- semantic detection stays bounded to the supported project-fact fields
- project-fact writes stay structured and explicit
- medium-confidence project facts can enter pending confirmation instead of
  dead manual-review backlog
- later confirming evidence can auto-promote those pending candidates without
  manual review
- supported project-fact corrections can supersede stale approved facts
- later project questions retrieve the right approved fact in fresh sessions
- weak ambiguous turns do not create candidate trash
- duplicate suppression and seam attribution remain explainable

What remained intentionally out of scope after this slice:

- repository URL memory
- deployment URL memory
- speculative or inferred project state
- cross-project global precedence rules beyond explicit project scoping
- workflow-improvement memory
- recurring procedure memory as a user-facing feature
- unmet-need planning
- phrase induction as live behavior
- self-improving capture enablement
- UI memory inspection

## Live posture before this slice

Before this slice:

- bounded named project-fact capture existed only in narrower deterministic
  or partially wired form
- retrieval could answer project questions once approved facts existed, but
  field-aware ranking for overlapping project facts was not yet tightened
- response-style semantic UX was live, but users still could not rely on a
  bounded remembered project profile in natural language

The accepted canonical seam remained:

- `model_tool_primary`

The bounded assist seam remained:

- `transcript_subscriber_fallback`

## Exact bounded surfaces used

Semantic project-fact detection:

- `extensions/memory-middleware/src/project-fact-semantic.ts`

Project-fact candidate lifecycle:

- `extensions/memory-middleware/src/project-fact-lifecycle.ts`

Tool-seam capture and correction:

- `extensions/memory-middleware/src/tools/candidate-submit.ts`

Transcript assist path:

- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`

Retrieval:

- `extensions/memory-middleware/src/db/queries.ts`
- `extensions/memory-middleware/src/tools/memory-object-search-hybrid.ts`

## Isolated proof validation

Proof run id:

- `project-memory-proof-2026-04-05T18:03:26.038Z`

Proof context:

- `projectId = 317b796f-2105-4d4b-92e6-d7b9ed9b0ef8`
- `agentId = 3b38e467-c9af-431a-a093-2d94c111d847`
- `sessionId = e1752ddc-c4dd-4311-8bb9-a009d4e92cb9`
- `sessionKey = agent:main:atlas-forge-proof-abc62c80`

Observed bounded row deltas:

- `memory_events +3`
- `memory_objects +6`
- `memory_reviews +4`

### Candidate-confirmation proof

Initial package-manager turn:

- `For project atlas forge proof, we use pnpm.`

Observed pending candidate:

- event id:
  - `a9fff00b-8def-4c7c-aa8f-b11be58b965e`
- candidate object id:
  - `ae2c9f53-fc97-49d3-8e08-3fdd60c251a1`

Observed pending metadata:

- `fieldKey = primary_package_manager`
- `confidence = medium`
- `state = pending_confirmation`
- `captureSeam = model_tool_primary`
- `source = project_fact_semantic_v1`

Later confirming turn:

- `For project atlas forge proof, the package manager is pnpm.`

Observed approved row:

- approved memory object id:
  - `fa26138c-a2a9-4dd2-8fcf-e485ae16f819`
- review id:
  - `f4bb3305-06b0-4e6a-9cd8-bde80ee8c207`

Observed promotion metadata proved:

- `promotionProfile = project_fact_confirmation_v1`
- `confirmationState = confirmed`
- `captureSeam = model_tool_primary`

### Retrieval and field-ranking proof

Default-branch turns:

- `For project atlas forge proof, the default branch is atlas-main.`
- repeated confirmation of the same bounded fact

Observed rows:

- candidate object id:
  - `ba606ec3-9bff-47b0-b919-feb0d64041d1`
- approved memory object id before correction:
  - `a2004700-ee54-4fb4-9f82-ba90885b6cd8`
- review id:
  - `47918001-fab1-4a4c-b6a4-a5f3304f93c6`

Hybrid retrieval proof before correction:

- query:
  - `what is the default branch for project atlas forge proof`
- top record:
  - `a2004700-ee54-4fb4-9f82-ba90885b6cd8`
- top matched fields included:
  - `auto_capture_field_match`

### Conversational correction proof

Correction turn:

- `Actually, for project atlas forge proof, the default branch is atlas-green.`

Observed corrected approved row:

- event id:
  - `c2c23a9b-0934-4615-98c1-6628ea00c9df`
- approved corrected memory object id:
  - `35c8a335-ea54-4f6f-98c5-d00ededd10c9`
- correction review id:
  - `d9cf1838-e474-4121-9421-66561ee21faa`

Observed supersede evidence:

- prior approved row:
  - `a2004700-ee54-4fb4-9f82-ba90885b6cd8`
- supersede review id:
  - `bdc7c5b5-4d58-4efc-8146-e622ee82dd0f`

Hybrid retrieval proof after correction:

- same query:
  - `what is the default branch for project atlas forge proof`
- new top record:
  - `35c8a335-ea54-4f6f-98c5-d00ededd10c9`
- top matched fields included:
  - `auto_capture_field_match`

### Ambiguity and duplicate-suppression proof

Ambiguous turn:

- `For project atlas forge proof, we should switch the package manager someday.`

Observed result:

- `memory_events +0`
- `memory_objects +0`
- `memory_reviews +0`

Duplicate follow-up turn:

- `For project atlas forge proof, the package manager is pnpm.`

Observed result:

- `memory_events +0`
- `memory_objects +0`
- `memory_reviews +0`

## Narrow production proof

Pre-proof health:

- `GET /healthz -> {"ok":true,"status":"live"}`
- container health: `healthy`

Production proof run id:

- `project-memory-prod-2026-04-05T18:05:38.694Z`

Production proof context:

- `projectId = 00c98f31-5783-4ac9-9ea0-186e939987a4`
- `agentId = fc635192-6bfd-461d-b013-b04bbea29f9a`
- `sessionId = d3c37b42-5f3e-4590-addf-75ef62ddc4a6`
- `sessionKey = agent:main:atlas-prod-proof-27efcec0`

Observed bounded row deltas:

- `memory_events +1`
- `memory_objects +2`
- `memory_reviews +1`

Initial package-manager turn:

- `For project atlas prod proof, we use pnpm.`

Observed pending candidate:

- event id:
  - `9f3be059-999c-4344-9543-feeca0fbf22f`
- candidate object id:
  - `d277ee41-dc0d-4c82-ac3c-09ba3953f9c5`

Later confirming turn:

- `For project atlas prod proof, the package manager is pnpm.`

Observed approved row:

- approved memory object id:
  - `4c493fe1-df27-4e60-8de7-a26885b88b5b`
- review id:
  - `f2bed2c1-aa85-4496-8e86-d2e2bad1845e`

Observed promotion metadata:

- `promotionProfile = project_fact_confirmation_v1`
- `confirmationState = confirmed`

Observed retrieval proof:

- query:
  - `what package manager does project atlas prod proof use`
- top record:
  - `4c493fe1-df27-4e60-8de7-a26885b88b5b`
- top matched fields included:
  - `auto_capture_field_match`

Observed ambiguity / no-trash proof:

- turn:
  - `For project atlas prod proof, we should switch the package manager someday.`
- additional growth:
  - `memory_events +0`
  - `memory_objects +0`
  - `memory_reviews +0`

Post-proof health:

- `GET /healthz -> {"ok":true,"status":"live"}`
- container health: `healthy`

## Operational result

This slice is now production-proven for its intended scope as:

- bounded explicit named-project semantic capture
- candidate confirmation without manual review for supported project facts
- bounded project-fact correction supersede
- field-aware fresh-session retrieval for approved project facts
- weak ambiguous ignore for explicit named-project turns that do not resolve to
  a supported field

It is not:

- a generic project-memory writer
- speculative project inference
- URL memory
- workflow-improvement memory
- recurring procedure memory
- any broader automation surface

## Rollback and disablement

The production rollback tag for this slice is:

- `openclaw:pre-project-memory-20260405T175020Z`

If this slice causes trouble, roll back by redeploying the rollback-tagged
image and then verify:

- `GET /healthz -> {"ok":true,"status":"live"}`
- no unexpected new project-memory writes continue after rollback
