# Production Project Memory UX V3 Report

## Slice

Third bounded project-memory UX slice.

## Scope

Live only for the next explicit named-project fact fields:

- `documentation_url`
- `runbook_url`

Still out of scope:

- broader narrative project memory
- speculative project-state inference
- semantic retrieval for project facts
- generic URL memory outside bounded named-project facts

## What landed

- explicit named-project documentation and runbook URLs now normalize into
  bounded project-memory candidates
- later confirming evidence can auto-promote the approved project fact with:
  - `promotionProfile = project_fact_confirmation_v1`
  - `confirmationState = confirmed`
- direct approved-only hybrid retrieval can now surface the right support URL
  field for later project questions
- unsupported generic deterministic labels like plain `docs` still stay
  ignored instead of creating memory trash

## Files touched

- `extensions/memory-middleware/src/project-fact-semantic.ts`
- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`
- `extensions/memory-middleware/src/db/queries.ts`
- tests in:
  - `extensions/memory-middleware/src/project-fact-semantic.test.ts`
  - `extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts`
  - `extensions/memory-middleware/src/tools/candidate-submit.test.ts`
  - `extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts`

## Isolated proof

Runtime:

- config: `/root/.openclaw-slice7-proof/openclaw.json`
- readiness endpoint: `http://127.0.0.1:37789/readyz`

Proof context:

- `projectId = d3e3108e-9320-4489-8a28-5692e3846259`
- `agentId = a1770ca5-4422-4e96-b80b-24761a5674ee`
- `sessionId = 4f3d9839-2012-44ad-b1f1-b08f91322955`

Proof turns / inputs:

1. explicit fact:
   `For project atlas forge docs proof v3, the documentation URL is https://docs.openclaw.ai/atlas-forge-proof-v3.`
2. confirming evidence after the confirmation guard window:
   `In project atlas forge docs proof v3, the documentation URL is https://docs.openclaw.ai/atlas-forge-proof-v3.`
3. duplicate confirmation:
   `In project atlas forge docs proof v3, the documentation URL is https://docs.openclaw.ai/atlas-forge-proof-v3.`
4. retrieval query:
   `what is the documentation url for project atlas forge docs proof v3`
5. ambiguity probe:
   `For project atlas forge docs ambiguity v3, the docs are somewhere online.`

Observed ids:

- `candidateId = b55d36d9-e83a-45fc-a0ac-fceca9538177`
- `candidateEventId = f809dab3-cb58-4753-aaa5-fc316694e212`
- `approvedObjectId = f3205aa2-4e1d-4ded-9b51-28c2de1bb734`
- `reviewId = 658d88de-5256-4b70-834a-623ed658341f`

Observed proof details:

- first explicit turn created one candidate with:
  - `fieldKey = documentation_url`
  - `captureClass = explicit_project_fact`
  - `lifecycleState = pending_confirmation`
- later confirming evidence auto-promoted one approved row with:
  - `promotionProfile = project_fact_confirmation_v1`
  - `confirmationState = confirmed`
- duplicate confirmation created no additional durable writes and reused the
  already approved object
- retrieval ranked the approved documentation URL first with:
  - `auto_capture_field_match`
  - `fts_search_document`
  - `trigram_similarity`
- the ambiguity probe stayed ignored:
  - count before = `0`
  - count after = `0`

## Production proof

Runtime:

- config: `/root/.openclaw/openclaw.json`
- readiness endpoint: `http://127.0.0.1:28789/readyz`

Proof context:

- `projectId = 2fbcec81-165d-4207-ac0d-3653800bdda1`
- `agentId = 73e7e59a-6eaa-42bf-b442-43ebfc4b128c`
- `sessionId = 1dab970c-7507-460b-9352-5443d60d91eb`

Proof turns / inputs:

1. explicit fact:
   `For project cedar harbor runbook proof v3, the runbook URL is https://ops.openclaw.ai/runbooks/cedar-harbor-proof-v3.`
2. confirming evidence after the confirmation guard window:
   `In project cedar harbor runbook proof v3, the runbook URL is https://ops.openclaw.ai/runbooks/cedar-harbor-proof-v3.`
3. duplicate confirmation:
   `In project cedar harbor runbook proof v3, the runbook URL is https://ops.openclaw.ai/runbooks/cedar-harbor-proof-v3.`
4. retrieval query:
   `what is the runbook url for project cedar harbor runbook proof v3`

Observed ids:

- `candidateId = 34f7cddc-5c2e-4aac-950e-701ad172cd9e`
- `candidateEventId = 6c49f66f-c42a-4301-b985-82e110978278`
- `approvedObjectId = 7dee1db4-0d72-457b-8867-83cb568989f8`
- `reviewId = a961a211-7f39-40c1-843e-03204426abd0`

Observed proof details:

- first explicit turn created one candidate with:
  - `fieldKey = runbook_url`
  - `captureClass = explicit_project_fact`
  - `lifecycleState = pending_confirmation`
- later confirming evidence auto-promoted one approved row with:
  - `promotionProfile = project_fact_confirmation_v1`
  - `confirmationState = confirmed`
- duplicate confirmation created no additional durable writes and reused the
  already approved object
- retrieval ranked the approved runbook URL first with:
  - `auto_capture_field_match`
  - `fts_search_document`
  - `trigram_similarity`

## Health

Before and after the proof run:

- `http://127.0.0.1:37789/healthz` returned `{"ok":true,"status":"live"}`
- `http://127.0.0.1:37789/readyz` returned `{"ready":true,"failing":[],"uptimeMs":...}`
- `http://127.0.0.1:28789/healthz` returned `{"ok":true,"status":"live"}`
- `http://127.0.0.1:28789/readyz` returned `{"ready":true}`

## Remaining limits

- broader project-memory fields are still not live
- semantic retrieval for project facts is still not live
- project memory remains limited to explicit named-project facts and explicit
  corrections
- unsupported generic labels like plain `repo`, `deploy`, and `docs` remain
  intentionally outside the bounded family
