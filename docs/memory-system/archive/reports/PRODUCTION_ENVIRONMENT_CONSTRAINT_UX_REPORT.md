# Production Environment-Constraint UX Report

## Purpose

This report records the sixth user-experience-focused memory slice.

The goal of this slice was to make repeated host and runtime constraints
rememberable and reusable as bounded guidance without broadening into
autonomous execution, noisy freeform note capture, or dead candidate
backlog.

This slice was intentionally limited to repeated environment constraints for:

- Python command unavailable on this host or environment
- gateway `POST /tools/invoke` forbidden in this environment

The production proof in this report exercised:

- the gateway `POST /tools/invoke` constraint

## Rollout date

- `2026-04-06`

## Exact runtime targets

Production runtime:

- Compose project: `openclaw-upgrade-2026324`
- container: `openclaw`
- image before redeploy:
  - `openclaw:local@sha256:9e782088b8310698698a95b4f86e552a24178824416a73291f80d57a35735687`
- image after redeploy:
  - `openclaw:local@sha256:ba3b13504a27084d98dca16a812aa397cac385680aaaff17a6560f6a45bbaf3e`
- rollback tag:
  - `openclaw:pre-environment-constraint-20260406T005126Z`
- gateway health endpoint:
  - `http://127.0.0.1:28789/healthz`

Isolated proof runtime:

- container: `openclaw-slice7-proof`
- image:
  - `openclaw:slice7-proof-local@sha256:9e782088b8310698698a95b4f86e552a24178824416a73291f80d57a35735687`
- gateway health endpoint:
  - `http://127.0.0.1:37789/healthz`

Proof execution note:

- gateway bearer-auth `POST /tools/invoke` remains forbidden in this posture
- isolated proof and production proof both used direct bounded runtime
  invocation through local `node --import tsx` against the live plugin config
  and backing databases

## Acceptance target used

This slice was accepted only if it proved all of the following for the first
bounded environment-constraint family:

- repeated environment constraints can be captured in bounded structured form
- the detector stays limited to the supported environment-constraint subject
  set
- first-seen supported constraints do not become durable approved memory by
  default
- medium-confidence constraints enter pending confirmation instead of dead
  manual backlog
- later confirming evidence can auto-promote the constraint without manual
  review
- later repo-operating asks can retrieve the approved constraint as guidance
  only
- the approved constraint does not trigger actions, automation, or silent
  plan mutation
- weak ambiguous nearby phrasing is ignored on the transcript assist seam
- duplicate suppression and seam attribution remain explainable
- no broader automation or downstream governance surfaces are triggered

What remained intentionally out of scope after this slice:

- repeated API failure workaround memory
- broader workflow-improvement memory
- workflow repair or forgetting
- autonomous remediation or direct operational execution
- phrase induction as live behavior
- broader project-memory expansion
- unmet-need or recommendation planning
- self-improving capture enablement
- UI memory inspection

## Live posture before this slice

Before this slice:

- bounded workflow-improvement plumbing already existed
- repeated repo-operating tool gotchas were already live
- repeated environment constraints were not yet live
- approved retrieval could not rank a remembered environment constraint as a
  first-class workflow hint
- prompt guidance did not yet explicitly tell the model to surface known
  host or runtime constraints

The accepted canonical seam remained:

- `model_tool_primary`

The bounded assist seam remained:

- `transcript_subscriber_fallback`

## Exact bounded surfaces used

Semantic workflow detection:

- `extensions/memory-middleware/src/workflow-improvement-semantic.ts`

Workflow-improvement lifecycle:

- `extensions/memory-middleware/src/workflow-improvement-lifecycle.ts`

Tool-seam capture and normalization:

- `extensions/memory-middleware/src/tools/candidate-submit.ts`

Transcript assist path:

- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`

Guidance retrieval and prompt shaping:

- `extensions/memory-middleware/src/db/queries.ts`
- `extensions/memory-core/src/prompt-section.ts`

## Isolated proof validation

Proof run id:

- `environment-constraint-proof-2026-04-06T00:47:00.907Z`

Proof context:

- `projectId = 26170b22-6af9-49f6-be26-09309157b2ff`
- `agentId = 3f07ba84-35ad-4aea-aff1-bd0e8fb4550b`
- `sessionId = ff924366-b9cd-46fd-92c3-862b320a9364`
- `sessionKey = agent:main:environment-constraint-proof-67f282f0`

Observed bounded row deltas:

- initial medium-confidence capture:
  - `memory_events +1`
  - `memory_objects +1`
  - `memory_reviews +0`
  - `memory_sources +1`
  - `procedures +0`
  - `procedure_runs +0`
  - `skill_candidates +0`
  - `background_jobs +0`
- later confirming evidence:
  - `memory_events +0`
  - `memory_objects +1`
  - `memory_reviews +1`
  - `memory_links +1`
  - `memory_sources +2`
  - `procedures +0`
  - `procedure_runs +0`
  - `skill_candidates +0`
  - `background_jobs +0`

### Candidate-confirmation proof

Initial medium-confidence turn:

- `python isn't available on this host, so use node instead.`

Observed pending candidate:

- `eventId = 7bd3b902-c034-46fc-8fbf-ee10e25925bd`
- `candidateId = 94b61d02-eb2c-4088-ac27-07a65874c4f8`

Observed pending metadata:

- `lessonKey = python_command_unavailable`
- `captureClass = workflow_environment_constraint`
- `state = pending_confirmation`
- `confidence = medium`
- `guidanceMode = guidance_only`

Later confirming turn:

- `Use node --input-type=module or tsx here because python command is not available.`

Observed approved row:

- `approvedObjectId = 6eab02be-eb38-47fd-b322-017293daca64`
- `reviewId = 0e4c24be-fda1-4536-9647-a8115d97fe81`

Observed promotion metadata proved:

- `promotionProfile = workflow_improvement_confirmation_v1`
- `confirmationState = confirmed`
- `captureSeam = model_tool_primary`

### Duplicate-suppression proof

Repeated confirming turn:

- `Use node --input-type=module or tsx here because python command is not available.`

Observed deltas:

- `memory_events +0`
- `memory_objects +0`
- `memory_reviews +0`
- `procedures +0`
- `skill_candidates +0`
- `background_jobs +0`

### Ambiguity and no-trash proof

Transcript-seam ambiguous turn:

- `python has been annoying lately`

Observed deltas:

- `memory_events +0`
- `memory_objects +0`
- `memory_reviews +0`
- `procedures +0`
- `skill_candidates +0`
- `background_jobs +0`

Cleanup note:

- an earlier tool-seam ambiguous proof turn fell into the already-live manual
  generic `improvement` ingress rather than the bounded environment-constraint
  family
- that proof-only candidate was rejected immediately:
  - `candidateId = 8e2da335-3fcc-4996-b56d-d2294ce25336`
  - `cleanupReviewId = 1bb59a6d-231c-487b-a999-fae077280c17`

### Guidance retrieval proof

Query:

- `python command not available use node tsx here`

Observed top record:

- `6eab02be-eb38-47fd-b322-017293daca64`
- `readSurface = approved_memory_view`
- top matched fields included:
  - `auto_capture_lesson_match`
  - `trigram_similarity`

Observed prompt guidance proof:

- prompt guidance explicitly told the model to use approved workflow memory as
  bounded repo-operating guidance for known host or runtime constraints
- prompt guidance explicitly kept this family guidance-only and non-executing

## Production proof validation

Production proof run id:

- `environment-constraint-prod-proof-2026-04-06T00:59:05.632Z`

Production proof context:

- `projectId = fe109afb-fce1-44d6-b5df-78060f900968`
- `agentId = e5d69dc9-8821-4f1f-8ae0-68b7546660eb`
- `sessionId = 865f237a-0a64-41fc-ae92-8a5f97e8d595`
- `sessionKey = agent:main:environment-constraint-prod-proof-576bde6a`

Observed bounded row deltas:

- initial medium-confidence capture:
  - `memory_events +1`
  - `memory_objects +1`
  - `memory_reviews +0`
  - `memory_sources +1`
  - `procedures +0`
  - `procedure_runs +0`
  - `skill_candidates +0`
  - `background_jobs +0`
- later confirming evidence:
  - `memory_events +0`
  - `memory_objects +1`
  - `memory_reviews +1`
  - `memory_links +1`
  - `memory_sources +2`
  - `procedures +0`
  - `procedure_runs +0`
  - `skill_candidates +0`
  - `background_jobs +0`

### Candidate-confirmation proof

Initial medium-confidence turn:

- `Don't try POST /tools/invoke here; it's forbidden on this gateway.`

Observed pending candidate:

- `eventId = a483d7c8-3d74-4ad8-8b2c-7d0bdbcc1139`
- `candidateId = 6e38707c-f018-446d-979c-7838c9ffe4c8`

Observed pending metadata:

- `lessonKey = gateway_tools_invoke_forbidden`
- `captureClass = workflow_environment_constraint`
- `state = pending_confirmation`
- `confidence = medium`
- `guidanceMode = guidance_only`

Later confirming turn:

- `Gateway POST /tools/invoke is forbidden here; use direct runtime invocation instead.`

Observed approved row:

- `approvedObjectId = 040d161c-7cf9-4ec0-8138-574d9677e9ee`
- `reviewId = bedb5d45-4b5f-4674-b405-98de96e06885`

Observed promotion metadata proved:

- `promotionProfile = workflow_improvement_confirmation_v1`
- `confirmationState = confirmed`

### Duplicate-suppression proof

Repeated confirming turn produced:

- `memory_events +0`
- `memory_objects +0`
- `memory_reviews +0`
- `procedures +0`
- `skill_candidates +0`
- `background_jobs +0`

### Ambiguity and no-trash proof

Transcript-seam ambiguous turn:

- `gateway has been annoying lately`

Observed deltas:

- `memory_events +0`
- `memory_objects +0`
- `memory_reviews +0`
- `procedures +0`
- `skill_candidates +0`
- `background_jobs +0`

### Guidance retrieval proof

Query:

- `gateway /tools/invoke forbidden use direct runtime invocation here`

Observed top record:

- `040d161c-7cf9-4ec0-8138-574d9677e9ee`
- top matched fields included:
  - `auto_capture_lesson_match`
  - `trigram_similarity`

Observed content:

- `Environment constraint: gateway POST /tools/invoke is forbidden in this environment; use direct runtime invocation instead.`

Observed boundary proof:

- no candidate, approved, or retrieval surface triggered autonomous action
- the proof remained guidance-only
- `skill_candidates +0`
- `background_jobs +0`

Cleanup note:

- one earlier failed production proof project used a confirmation turn that
  drifted outside the bounded environment-constraint detector and therefore
  created proof-only generic `improvement` candidates
- those proof-only candidates were rejected immediately:
  - `cleanupReviewIds = [72c97f5e-119b-4027-b80b-99c480533afa, 77e323e1-e3fd-42f7-b944-656112a221a7, 5f8c81fe-6b0c-4c51-879f-8f9010879799, 818ddb8d-81df-480d-bd21-684fb32a640e]`
- the final accepted proof for this slice is the later `projectId = fe109afb-fce1-44d6-b5df-78060f900968` run above
- one proof-only generic ambiguous candidate in that final project was also
  rejected after the transcript-seam ambiguity proof established the accepted
  no-write posture:
  - `candidateId = cf2bf764-8d4b-4898-ab23-bc2bc0b3a738`
  - `cleanupReviewId = a383f9aa-9e07-497a-8f09-f6fdf6e4afa0`

## Health and rollback checks

Before redeploy:

- `curl http://127.0.0.1:28789/healthz`
  - `{"ok":true,"status":"live"}`

After redeploy and proof:

- `curl http://127.0.0.1:28789/healthz`
  - `{"ok":true,"status":"live"}`
- `curl http://127.0.0.1:37789/healthz`
  - `{"ok":true,"status":"live"}`

Rollback handle:

- `openclaw:pre-environment-constraint-20260406T005126Z`

## Exact user-visible change now live

What became materially more useful:

- repeated host or runtime constraints can now be remembered in bounded form
- medium-confidence environment constraints can wait for confirming evidence
  instead of becoming dead review backlog
- later relevant repo-operating asks can surface the approved environment
  constraint as a bounded hint
- the application posture remains bounded:
  - guidance only
  - no action-taking
  - no silent plan mutation

## Remaining limitations

- only the supported bounded environment-constraint family is live
- repeated API workarounds and broader workflow lessons are still not live
- workflow repair or forgetting is not live for this family
- direct manual `memory_candidate_submit` remains a broader explicit
  `improvement` ingress, so ambiguity-ignore proof for this slice is anchored
  to the transcript assist seam rather than generic manual note submission
- autonomous remediation and direct operational execution are still not live
