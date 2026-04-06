# Production API Workaround UX Report

## Slice

First bounded API workaround memory slice.

## Scope

Live only for:

- `openai_embeddings_api_key_required`
- `anthropic_context1m_eligible_credential_required`

Still out of scope:

- broader API workaround memory
- semantic retrieval for approved API workaround guidance
- candidate semantic retrieval
- autonomous remediation or action-taking

## What landed

- supported API workaround statements now normalize into bounded
  `workflow_api_workaround` candidates
- medium-confidence first-seen lessons enter `pending_confirmation`
- later confirming evidence can auto-promote the approved lesson with:
  - `promotionProfile = workflow_improvement_confirmation_v1`
  - `confirmationState = confirmed`
- later approved-only hybrid retrieval can surface the right API workaround as
  guidance for provider-troubleshooting asks
- duplicate confirming evidence is suppressed
- no new skill-candidate or background-job surfaces were enabled

## Files touched

- `extensions/memory-middleware/src/workflow-improvement-semantic.ts`
- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`
- `extensions/memory-middleware/src/db/queries.ts`
- `extensions/memory-core/src/prompt-section.ts`
- tests in:
  - `extensions/memory-middleware/src/workflow-improvement-semantic.test.ts`
  - `extensions/memory-middleware/src/tools/candidate-submit.test.ts`
  - `extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts`
  - `extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts`

## Isolated proof

Runtime:

- config: `/root/.openclaw-slice7-proof/openclaw.json`
- health endpoint: `http://127.0.0.1:37789/healthz`
- rollback tag used later for redeploy step:
  - `openclaw:pre-api-workaround-20260406T114704Z`

Proof context:

- `projectId = c3d49413-d6a7-4ba3-b926-b931303e8787`
- `agentId = 9012efbd-1e6c-4801-affc-79a24af69866`
- `sessionId = 93911188-eeae-4c90-91f0-0a97831764d0`

Proof turns / inputs:

1. `Semantic memory search with Codex OAuth keeps coming back to the OpenAI API key here.`
2. `Codex OAuth does not help for OpenAI embeddings here; semantic memory search still needs a real OPENAI_API_KEY.`
3. duplicate confirmation:
   `For semantic memory search here, Codex OAuth still is not enough; OpenAI embeddings require a real OPENAI_API_KEY.`
4. explicit ambiguous cleanup probe:
   `The embeddings setup has been annoying lately.`
5. retrieval query:
   `does semantic memory search need an openai api key with codex oauth`

Observed ids:

- `candidateId = 54d1bfb8-4bb6-412c-befa-bc9d337ea52a`
- `candidateEventId = 026784be-a940-40d0-825c-a21231eaacf5`
- `approvedObjectId = 2f926bbd-bf63-4739-bb8e-ded78126552d`
- `reviewId = 701a3c89-2c71-4fe4-ac56-ebe379ecaee0`
- ambiguous cleanup:
  - `candidateId = e103b4ee-faee-4007-aed1-844bffb549f6`
  - `cleanupReviewId = 84cbc64e-956c-4217-823c-b273292b74b3`

Observed proof details:

- first turn created a candidate with:
  - `lessonKey = openai_embeddings_api_key_required`
  - `captureClass = workflow_api_workaround`
  - `lifecycleState = pending_confirmation`
  - `lifecycleConfidence = medium`
- second turn auto-promoted the approved row with:
  - `promotionProfile = workflow_improvement_confirmation_v1`
  - `confirmationState = confirmed`
- duplicate confirmation returned:
  - `approved workflow-improvement memory already exists`
- project-local keyed object count stayed `2`
- retrieval ranked the approved workaround first with:
  - `auto_capture_lesson_match`
  - `trigram_similarity`
- counts delta:
  - `memory_reviews +2`
  - `skill_candidates +0`
  - `background_jobs +0`

Boundary note:

- the explicit ambiguous manual submit created a broader generic
  `improvement` candidate through the still-broader `memory_candidate_submit`
  path, not the bounded API workaround family
- that proof-only candidate was rejected immediately, so no dead backlog
  remained

Health:

- before: `{"ok":true,"status":"live"}`
- after: `{"ok":true,"status":"live"}`

## Production proof

Runtime:

- config: `/root/.openclaw/openclaw.json`
- health endpoint: `http://127.0.0.1:28789/healthz`
- rollback tag:
  - `openclaw:pre-api-workaround-20260406T114704Z`

Proof context:

- `projectId = a2b0e2f6-71fd-4bff-a153-522ff4d0d3a4`
- `agentId = 7670fe60-e1bb-4fd1-a50d-2b0fccac5180`
- `sessionId = b21351e3-3f5f-411a-a162-dcc8033da53e`

Proof turns / inputs:

1. `Anthropic context1m keeps hitting Extra usage is required for long context requests here.`
2. `Anthropic Extra usage is required for long context requests means this credential is not eligible for context1m; keep a fallback model or use an eligible billed API key.`
3. duplicate confirmation:
   `If Anthropic says Extra usage is required for long context requests here, context1m needs an eligible billed API key or a fallback model posture.`
4. explicit ambiguous cleanup probe:
   `Long context has been annoying lately.`
5. retrieval query:
   `anthropic extra usage is required for long context requests fallback model context1m`

Observed ids:

- `candidateId = 78c552c8-7cdd-46bb-ba0f-44112c54bd7c`
- `candidateEventId = 2e3bf0a2-150a-45cf-b2a9-f4c0fdb9bacc`
- `approvedObjectId = e4e1e2e1-cb77-4242-b53b-84ad18c8105b`
- `reviewId = 1c8333ce-ce36-4f2b-9d81-6eca35eae970`
- ambiguous cleanup:
  - `candidateId = 3f2556e1-00de-48f1-b580-4f780c26ca68`
  - `cleanupReviewId = a8d02bf9-3d15-4dec-b169-fa4743273494`

Observed proof details:

- first turn created a candidate with:
  - `lessonKey = anthropic_context1m_eligible_credential_required`
  - `captureClass = workflow_api_workaround`
  - `lifecycleState = pending_confirmation`
  - `lifecycleConfidence = medium`
- second turn auto-promoted the approved row with:
  - `promotionProfile = workflow_improvement_confirmation_v1`
  - `confirmationState = confirmed`
- duplicate confirmation returned:
  - `approved workflow-improvement memory already exists`
- project-local keyed object count stayed `2`
- retrieval ranked the approved workaround first with:
  - `auto_capture_lesson_match`
  - `fts_search_document`
  - `trigram_similarity`
- counts delta:
  - `memory_reviews +2`
  - `skill_candidates +0`
  - `background_jobs +0`

Boundary note:

- the explicit ambiguous manual submit again hit the broader generic
  `memory_candidate_submit` path rather than bounded API workaround capture
- that proof-only candidate was rejected immediately, so no dead backlog
  remained

Health:

- before: `{"ok":true,"status":"live"}`
- after: `{"ok":true,"status":"live"}`

## Cleanup-backed note

An earlier narrower production phrasing run did not hit the bounded Anthropic
detector and created three generic candidate rows in:

- `projectId = 434ab43c-7bab-4995-a918-7b40fd34c2df`

Those proof-only candidates were all rejected immediately, so they did not
become dead backlog:

- `dc1354ac-0b28-42e1-8bc1-f491e517de40`
  - `cleanupReviewId = 77790ae1-c007-44af-b47d-88e5af6822a5`
- `43a602f8-7571-4e9e-8ab4-319434ec10a9`
  - `cleanupReviewId = 1c3c4ff8-fb31-441f-9881-fa46d12e9d2c`
- `5f79c65a-1214-4ccc-80d3-6964a7fb5e82`
  - `cleanupReviewId = f1728939-625a-476d-bfa5-3fb288ac1255`

## Limitations still in force

- approved API workaround guidance remains hybrid-first only
- no semantic fallback or embeddings are live for this family yet
- broader API workaround subjects are not live
- direct manual `memory_candidate_submit` remains a broader explicit ingress
  than the bounded transcript-assist semantic slice, so proof ambiguity for
  this family still needs cleanup-backed handling on the manual tool path
