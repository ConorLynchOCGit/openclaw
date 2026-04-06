# Production Project Memory UX V2 Report

## Slice

Second bounded project-memory UX slice.

## Scope

Live only for the next explicit named-project fact fields:

- `repository_url`
- `deployment_url`

Still out of scope:

- broader narrative project memory
- speculative project-state inference
- semantic retrieval for project facts
- generic URL memory outside bounded named-project facts

## What landed

- explicit named-project repository and deployment URLs now normalize into
  bounded project-memory candidates
- later confirming evidence can auto-promote the approved project fact with:
  - `promotionProfile = project_fact_confirmation_v1`
  - `confirmationState = confirmed`
- direct approved-only hybrid retrieval can now surface the right URL field
  for later project questions
- deterministic project-fact parsing now rejects unsupported generic labels
  like plain `repo`
- transcript-subscriber project-fact capture now propagates `projectId`
  through lifecycle inspection and candidate submission
- project-fact lifecycle inspection and managed duplicate checks now stay
  project-scoped instead of leaking identical fact keys across projects

## Files touched

- `extensions/memory-middleware/src/project-fact-semantic.ts`
- `extensions/memory-middleware/src/project-fact-lifecycle.ts`
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
- health endpoint: `http://127.0.0.1:37789/healthz`

Proof context:

- `projectId = d3e3108e-9320-4489-8a28-5692e3846259`
- `agentId = a1770ca5-4422-4e96-b80b-24761a5674ee`
- `sessionId = 4f3d9839-2012-44ad-b1f1-b08f91322955`

Proof turns / inputs:

1. ambiguity probe:
   `For project atlas forge, the repo is probably somewhere on GitHub.`
2. explicit fact:
   `For project atlas forge, the repository URL is https://github.com/openclaw/openclaw.`
3. confirming evidence:
   `In project atlas forge, the repository URL is https://github.com/openclaw/openclaw.`
4. duplicate confirmation:
   `In project atlas forge, the repository URL is https://github.com/openclaw/openclaw.`
5. retrieval query:
   `what is the repository url for project atlas forge`

Observed ids:

- `candidateId = d2ad6357-1a80-4dff-8973-cb6a2d8156d9`
- `candidateEventId = 43e6e8cf-d42e-4079-beee-051b489e5819`
- `approvedObjectId = 950486c8-f45a-4d48-ba00-066af621f47d`
- `reviewId = 9b7b77bd-7c98-4965-bbf8-061817882e3e`

Observed proof details:

- ambiguity probe stayed ignored:
  - project-local counts remained `0/0/0` for objects, events, and reviews
- first explicit turn created one candidate with:
  - `fieldKey = repository_url`
  - `captureClass = explicit_project_fact`
  - `lifecycleState = pending_confirmation`
- later confirming evidence auto-promoted one approved row with:
  - `promotionProfile = project_fact_confirmation_v1`
  - `confirmationState = confirmed`
- duplicate confirmation created no additional durable writes:
  - objects stayed `2`
  - events stayed `1`
  - reviews stayed `1`
- retrieval ranked the approved repository URL first with:
  - `auto_capture_field_match`
  - `fts_search_document`
  - `trigram_similarity`

## Production proof

Runtime:

- config: `/root/.openclaw/openclaw.json`
- health endpoint: `http://127.0.0.1:28789/healthz`

Proof context:

- `projectId = 2fbcec81-165d-4207-ac0d-3653800bdda1`
- `agentId = 73e7e59a-6eaa-42bf-b442-43ebfc4b128c`
- `sessionId = 1dab970c-7507-460b-9352-5443d60d91eb`

Proof turns / inputs:

1. ambiguity probe:
   `For project cedar harbor, the deploy is probably somewhere on the web.`
2. explicit fact:
   `For project cedar harbor, the deployment URL is https://cedar.example.com/app.`
3. confirming evidence:
   `In project cedar harbor, the deployment URL is https://cedar.example.com/app.`
4. duplicate confirmation:
   `In project cedar harbor, the deployment URL is https://cedar.example.com/app.`
5. retrieval query:
   `what is the deployment url for project cedar harbor`

Observed ids:

- `candidateId = e4702cf6-204b-41ff-a945-f7643f2f879d`
- `candidateEventId = 0f8ab178-af82-4d81-97d3-7199f9fac13c`
- `approvedObjectId = 4f38fca5-4924-4a53-ab17-e9d07ad30224`
- `reviewId = 38b0c4a9-782b-415a-ad32-458b52520832`

Observed proof details:

- ambiguity probe stayed ignored:
  - project-local counts remained `0/0/0` for objects, events, and reviews
- first explicit turn created one candidate with:
  - `fieldKey = deployment_url`
  - `captureClass = explicit_project_fact`
  - `lifecycleState = pending_confirmation`
- later confirming evidence auto-promoted one approved row with:
  - `promotionProfile = project_fact_confirmation_v1`
  - `confirmationState = confirmed`
- duplicate confirmation created no additional durable writes:
  - objects stayed `2`
  - events stayed `1`
  - reviews stayed `1`
- retrieval ranked the approved deployment URL first with:
  - `auto_capture_field_match`
  - `fts_search_document`
  - `trigram_similarity`

## Cross-project scoping regression proof

This slice also proved a project-scoping fix that matters for future bounded
project-memory work.

Checked-in integration coverage now proves:

- the same approved `repository_url` key can exist independently in different
  projects without being rejected as a duplicate

That regression test lives in:

- `extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts`

## Health

Before and after the proof run:

- `http://127.0.0.1:28789/healthz` returned `{"ok":true,"status":"live"}`
- `http://127.0.0.1:37789/healthz` returned `{"ok":true,"status":"live"}`

## Remaining limits

- broader project-memory fields are still not live
- semantic retrieval for project facts is still not live
- project memory remains limited to explicit named-project facts and explicit
  corrections
- unsupported generic labels like plain `repo` and plain `deploy` remain
  intentionally outside the bounded family
