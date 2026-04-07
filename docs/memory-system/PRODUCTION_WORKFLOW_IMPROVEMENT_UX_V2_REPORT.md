# Production Workflow Improvement UX V2 Report

## Slice

Second broader workflow-improvement UX slice.

## Scope

Live only for the next bounded workflow-improvement lessons:

- `docs_only_check_fast`
- `memory_proof_runner_required`
- `readyz_for_readiness`

Still out of scope:

- broader workflow planning memory
- autonomous workflow remediation
- generic semantic search across workflow memory
- broader API workaround or procurement/install families

## What landed

- explicit docs-only gate guidance now normalizes into a bounded
  workflow-improvement candidate
- explicit memory proof runner guidance now normalizes into a bounded
  workflow-improvement candidate
- explicit readiness guidance for `/readyz` vs `/healthz` now normalizes into
  a bounded workflow-improvement candidate
- later confirming evidence can auto-promote these lessons with:
  - `promotionProfile = workflow_improvement_confirmation_v1`
  - `confirmationState = confirmed`
- approved-only hybrid retrieval can now surface the right workflow lesson
  for later repo-operating asks
- vague workflow complaints still stay ignored instead of creating durable
  memory trash

## Files touched

- `extensions/memory-middleware/src/workflow-improvement-semantic.ts`
- `extensions/memory-middleware/src/db/queries.ts`
- `extensions/memory-core/src/prompt-section.ts`
- tests in:
  - `extensions/memory-middleware/src/workflow-improvement-semantic.test.ts`
  - `extensions/memory-middleware/src/tools/candidate-submit.test.ts`
  - `extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts`
  - `extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts`
  - `extensions/memory-core/index.test.ts`

## Isolated proof

Runtime:

- config: `/root/.openclaw-slice7-proof/openclaw.json`
- readiness endpoint: `http://127.0.0.1:37789/readyz`

Proof context:

- `projectId = d3e3108e-9320-4489-8a28-5692e3846259`
- `agentId = a1770ca5-4422-4e96-b80b-24761a5674ee`
- `sessionId = 4f3d9839-2012-44ad-b1f1-b08f91322955`

Proof turns / inputs:

1. explicit lesson:
   `For docs-only work here, use pnpm check:fast instead of full pnpm check or pnpm build.`
2. later retrieval query after confirmation:
   `docs only change what gate should I run check fast or full check`
3. ambiguity probe:
   `Health checks have been noisy lately.`
4. additional isolated proof for the proof-runner lesson:
   `Use pnpm memory:proof for bounded memory proof here instead of bespoke host-side setup.`
5. later retrieval query for the proof-runner lesson:
   `use pnpm memory proof for bounded memory proof instead of bespoke host setup`

Observed ids:

- `candidateId = ee982ad3-bd3d-4013-bb07-1ffe5b28bf27`
- `candidateEventId = 4beb1002-8ee6-491e-aa57-f8eeb91c7338`
- `approvedObjectId = 70af8477-6714-4f7f-9e9b-f8d6a70b16f7`
- `reviewId = 0b3262a0-1e33-4c5b-be10-0fba5860e0ce`
- additional proof-runner isolated proof:
  - `candidateId = 7d0a79bd-f472-4f6e-ad16-3f8e84107148`
  - `candidateEventId = 71740751-7393-45c3-b2b8-d2ea39f6ee58`
  - `approvedObjectId = 3afe5485-1496-4794-ba77-38bca0ee23fe`
  - `reviewId = 1c94a1bf-9022-43c8-a56b-67bbb395f42e`
- proof-only cleanup review:
  - `cleanupReviewId = 3fffa7c2-527d-493f-8aff-b55b59efa9a3`

Observed proof details:

- first explicit turn created one candidate with:
  - `lessonKey = docs_only_check_fast`
  - `toolKey = validation_tier`
  - `captureClass = workflow_tool_gotcha`
  - `lifecycleState = pending_confirmation`
- later confirming evidence auto-promoted one approved row with:
  - `promotionProfile = workflow_improvement_confirmation_v1`
  - `confirmationState = confirmed`
- approved-only hybrid retrieval ranked the approved docs-only lesson first
  with:
  - `auto_capture_lesson_match`
  - `fts_search_document`
  - `trigram_similarity`
- the proof-runner lesson also completed the same pending-confirmation and
  approved retrieval loop in isolated proof:
  - `lessonKey = memory_proof_runner_required`
  - `toolKey = memory_proof_runner`
  - retrieval returned the approved object first with:
    - `fts_search_document`
    - `trigram_similarity`
- the ambiguity probe stayed ignored:
  - proof runner exited with
    `did not create pending or approved lifecycle evidence`
- one early duplicate proof turn created an unrelated response-style pending
  candidate in the isolated sandbox; it was immediately rejected with
  `cleanupReviewId = 3fffa7c2-527d-493f-8aff-b55b59efa9a3` and did not affect
  the approved workflow-improvement object

## Production proof

Runtime:

- config: `/root/.openclaw/openclaw.json`
- readiness endpoint: `http://127.0.0.1:28789/readyz`

Proof context:

- `projectId = 2fbcec81-165d-4207-ac0d-3653800bdda1`
- `agentId = 73e7e59a-6eaa-42bf-b442-43ebfc4b128c`
- `sessionId = 1dab970c-7507-460b-9352-5443d60d91eb`

Proof turns / inputs:

1. explicit lesson:
   `Trust /readyz for rollout readiness here; /healthz is only liveness.`
2. confirming evidence after the confirmation guard window:
   `Use /readyz for proof or rollout readiness on this repo; /healthz is only a shallow liveness signal.`
3. duplicate confirmation:
   `For readiness checks here, use /readyz as the rollout gate and treat /healthz as liveness only.`
4. retrieval query:
   `which health endpoint should I trust for rollout readiness readyz or healthz`

Observed ids:

- `candidateId = 06401172-641a-49ff-a3f6-ebe8d8e82b6e`
- `candidateEventId = 239353d7-cbd0-4085-8ea7-61dee3ec6d3a`
- `approvedObjectId = 7091f421-9f5e-46b4-a561-80b3ac9548a0`
- `reviewId = 70e9d2b9-8fd6-4939-badf-6c77d3a2fa54`

Observed proof details:

- first explicit turn created one candidate with:
  - `lessonKey = readyz_for_readiness`
  - `toolKey = gateway_readiness`
  - `captureClass = workflow_tool_gotcha`
  - `lifecycleState = pending_confirmation`
- later confirming evidence auto-promoted one approved row with:
  - `promotionProfile = workflow_improvement_confirmation_v1`
  - `confirmationState = confirmed`
- duplicate confirmation created no additional workflow-improvement durable
  writes and reused the already approved object
- approved-only hybrid retrieval ranked the approved readiness lesson first
  with:
  - `auto_capture_lesson_match`
  - `trigram_similarity`

## Health

Before and after the proof run:

- `http://127.0.0.1:37789/healthz` returned `{"ok":true,"status":"live"}`
- `http://127.0.0.1:37789/readyz` returned `{"ready":true,"failing":[],"uptimeMs":...}`
- `http://127.0.0.1:28789/healthz` returned `{"ok":true,"status":"live"}`
- `http://127.0.0.1:28789/readyz` returned `{"ready":true}`

## Remaining limits

- broader workflow planning or recommendation memory is still not live
- semantic retrieval remains bounded to the previously approved workflow
  lesson keys only
- these workflow lessons remain guidance-only and do not trigger actions
- unsupported vague workflow complaints still remain intentionally ignored
