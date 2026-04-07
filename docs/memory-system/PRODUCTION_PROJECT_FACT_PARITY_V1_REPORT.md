# Production Project-Fact Parity V1 Report

## Slice

First existing-family parity tranche:

- project-fact generalization and lifecycle parity v1

## Goal

Bring the project-fact family closer to the newer generic families by adding a
bounded generic named-project reference-fact path on the same lifecycle and
retrieval substrate, instead of requiring one more typed field registration.

## Implemented contract

- scope remained explicit named-project facts only
- older typed project-fact fields stayed the precision fast path
- a new bounded generic `generalized_reference` project-fact path was added
  for explicit reference-like project anchors such as evidence dashboards
- the first compatible generic statement now enters
  `hold_for_more_evidence`
- later compatible evidence auto-promotes through the existing candidate
  review and promotion substrate using:
  - `project_fact_generalized_confirmation_v1`
  - `generalized_cluster_auto_review`
- explicit generic correction can supersede an older approved generic project
  fact on the same project-scoped subject using:
  - `project_fact_generalized_correction_v1`
- approved retrieval stays hybrid-first and approved-only
- speculative summaries and loose generic project narration remain out of
  scope

## Validation run

- `pnpm check:types`
- `pnpm test -- extensions/memory-middleware/src/project-fact-semantic.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts -t "project fact|project-fact"`
- `pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "generalized project-fact cluster|generalized project-fact corrections|project-fact cluster"`
- `pnpm test -- extensions/memory-middleware/src/project-fact-semantic.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts -t "project fact|project-fact"`
- `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "generalized project-fact cluster|generalized project-fact corrections|project-fact cluster|promotes a medium-confidence project fact candidate after later confirming evidence without manual review"`
- `pnpm check`
- `pnpm build`
- `git diff --check`

One non-serial rerun of the integration lane hit a transient host-level
`ECONNRESET` from the Postgres-backed test environment; the repo serial
profile rerun passed cleanly on the same tree.

## Isolated proof

Gateway:

- base URL `http://127.0.0.1:37789`
- `/healthz` before and after:
  - `{"ok":true,"status":"live"}`
- `/readyz` before and after:
  - `{"ready":true,...}`

### Hold

Input:

- `For project Atlas parity, the evidence dashboard is #atlas-parity-evidence.`

Exact ids and normalized fields:

- `candidateId = 3512e8fb-b300-41ee-b6f9-2f902490d3fc`
- `eventId = 71aec145-e8db-46e2-8939-8a0e7bffab9b`
- `clusterKey = 6011f1573427857fcd2c39473bfd6fa7fff5a1548548bbc8829ae7db680d30e5`
- `subjectKey = df37e4f7e3f54a84000a40c18f0b1b6e6c9d6ee54aed0c0fbf1192c632d302da`
- `factFamily = generalized_reference`
- `template = project_fact_generalized_named_scope`
- `projectScope = Atlas parity`
- `normalizedProjectScope = atlas parity`
- `subject = Atlas parity / evidence dashboard`
- `normalizedSubject = atlas parity :: evidence dashboard`
- `value = #atlas-parity-evidence`
- `normalizedValue = #atlas-parity-evidence`
- `candidateLifecycle.state = hold_for_more_evidence`

### Approve and retrieve

Confirming input:

- `For project Atlas parity, the evidence dashboard is #atlas-parity-evidence.`

Retrieval query:

- `for project atlas parity where is the evidence dashboard`

Exact ids and retrieval evidence:

- `approvedObjectId = 1beb252c-2619-47d9-94b8-83cf5eb3eefc`
- `confirmationMethod = generalized_cluster_auto_review`
- `autoPromotionProfile = project_fact_generalized_confirmation_v1`
- top result id:
  - `1beb252c-2619-47d9-94b8-83cf5eb3eefc`
- matched fields:
  - `project_fact_scope_match`
  - `project_fact_subject_match`
  - `fts_search_document`
  - `trigram_similarity`

### Correction and supersede

Correction input:

- `Actually, for project Atlas parity, the evidence dashboard is #atlas-parity-evidence-v2.`

Exact ids:

- `candidateId = 62b9eb2c-6647-4e8c-80d0-a852d354d68e`
- `eventId = 445ef104-b4b1-46ef-8252-ba08aefa231b`
- `correctedApprovedObjectId = 0d2c933c-0bd3-4eeb-8171-8e37040c03b9`
- `correctionKey = 00727641c00ccb6d1bf6fe15e57af740109d3769ff500df1c37d61461d2c2a39`

Follow-up DB inspection confirmed:

- original approved object `1beb252c-2619-47d9-94b8-83cf5eb3eefc`
  - `review_state = superseded`
  - `superseded_by = 0d2c933c-0bd3-4eeb-8171-8e37040c03b9`
- corrected approved object `0d2c933c-0bd3-4eeb-8171-8e37040c03b9`
  - `review_state = approved`

## Production proof

Gateway:

- base URL `http://127.0.0.1:28789`
- `/healthz` before and after:
  - `{"ok":true,"status":"live"}`
- `/readyz` before and after:
  - `{"ready":true}`

Production attribution:

- `agentId = 9d8f2956-a081-4135-be61-8fe7f2fe8070`
- `sessionId = cd670787-8e50-427d-9b14-cb1176408238`
- `projectId = 437d43ff-1c9d-4757-8d44-cd8e0aeb241b`

### Hold

Input:

- `For project Cedar parity, the evidence dashboard is #cedar-parity-evidence.`

Exact ids:

- `candidateId = 7dd9548b-42af-457b-972e-9af12f4bcbe5`
- `eventId = 0f9235d1-16f5-4225-ae31-67ca46353551`
- `clusterKey = 840d361b6c4916f9f14911ab01dd6316eb271a7fe4af11b82fd98d12b8da72b1`
- `subjectKey = 6de8537140c40ca09377faaafa313e594ee731db7145565c69dd6a3887ddeec5`

### Approve and retrieve

Confirming input:

- `For project Cedar parity, the evidence dashboard is #cedar-parity-evidence.`

Retrieval query:

- `for project cedar parity where is the evidence dashboard`

Exact ids and retrieval evidence:

- `approvedObjectId = 06bd9e30-9923-422f-9d4b-07673a59eedd`
- `candidateId = 7dd9548b-42af-457b-972e-9af12f4bcbe5`
- `confirmationMethod = generalized_cluster_auto_review`
- top result id:
  - `06bd9e30-9923-422f-9d4b-07673a59eedd`
- matched fields:
  - `project_fact_scope_match`
  - `project_fact_subject_match`
  - `fts_search_document`
  - `trigram_similarity`

## What this proved

- project facts no longer depend only on the fixed typed-field registry
- the project-fact family now reuses the same broader cluster and auto-review
  seam already proven for workflow lessons, project rules, and unmet needs
- later retrieval can surface the approved generic project fact through the
  normal approved-only hybrid path
- explicit correction can repair or supersede the approved generic fact
- the slice stayed bounded and did not broaden into speculative project
  summaries or generic semantic retrieval

## Remaining limits

- this tranche is still explicit named-project facts only
- supported generic facts remain limited to bounded reference-like anchors
- phrase induction is not live for project facts
- self-improving capture is still disabled
- advisory planning from learned memory is still not live
