# Production Workflow-Improvement UX Report

## Purpose

This report records the fifth user-experience-focused memory slice.

The goal of this slice was to make repeated repo-operating tool gotchas
rememberable and reusable as bounded guidance without broadening into
autonomous remediation, noisy freeform note capture, or dead candidate
backlog.

This slice was intentionally limited to repeated tool-gotcha lessons for:

- using `pnpm test -- <path-or-filter>` instead of raw Vitest
- using `scripts/committer "<msg>" <file...>` instead of manual
  `git add` + `git commit`
- avoiding `git stash` in this multi-agent repo

The production proof in this report exercised:

- the `scripts/committer` lesson

## Rollout date

- `2026-04-05`

## Exact runtime targets

Production runtime:

- Compose project: `openclaw-upgrade-2026324`
- container: `openclaw`
- image before redeploy:
  - `openclaw:local@sha256:2cd0c6f2080aa77312cf1c5f185fa254b48ccebb42a901aae15d192f9fe56e6a`
- image after redeploy:
  - `openclaw:local@sha256:9e782088b8310698698a95b4f86e552a24178824416a73291f80d57a35735687`
- rollback tag:
  - `openclaw:pre-workflow-improvement-20260405T235548Z`
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
  invocation through local `node --input-type=module --import tsx` against the
  live plugin config and backing databases

## Acceptance target used

This slice was accepted only if it proved all of the following for the first
bounded tool-gotcha family:

- repeated operational lessons can be captured in bounded structured form
- the detector stays limited to the supported tool-gotcha subject set
- first-seen supported lessons do not become durable approved memory by
  default
- medium-confidence lessons enter pending confirmation instead of dead manual
  backlog
- later confirming evidence can auto-promote the lesson without manual review
- weak ambiguous complaints are ignored instead of creating memory trash
- later repo-operating asks can retrieve the approved lesson as guidance only
- the approved lesson does not trigger actions, automation, or silent plan
  mutation
- duplicate suppression and seam attribution remain explainable
- no broader automation or downstream governance surfaces are triggered

What remained intentionally out of scope after this slice:

- recurring API failure workaround memory
- repeated environment-constraint memory
- broader workflow-improvement memory
- user-visible repair or forgetting for workflow lessons
- autonomous remediation or direct operational execution
- phrase induction as live behavior
- broader project-memory expansion
- unmet-need or recommendation planning
- self-improving capture enablement
- UI memory inspection

## Live posture before this slice

Before this slice:

- bounded improvement-note plumbing already existed
- there was no productized semantic workflow-improvement event family
- repeated repo-operating lessons could not enter a bounded
  candidate-confirmation lifecycle
- approved retrieval could not rank a remembered tool-gotcha as a
  first-class workflow hint
- prompt guidance did not yet tell the model to surface these lessons as
  bounded guidance

The accepted canonical seam remained:

- `model_tool_primary`

The bounded assist seam remained:

- `transcript_subscriber_fallback`

## Exact bounded surfaces used

Semantic tool-gotcha detection:

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

Proof context:

- `projectId = 9438ec9a-cae0-4c6f-9f65-88f897565c0c`
- `agentId = aab5b463-71f5-4227-ad15-5ae8f40ef8df`
- `sessionId = 0eac2686-d44f-4848-b979-be3b85c1df00`
- `sessionKey = agent:main:workflow-improvement-proof-769e27fd`

Observed bounded row deltas:

- `memory_events +1`
- `memory_objects +2`
- `memory_reviews +1`
- `procedures +0`
- `skill_candidates +0`
- `background_jobs +0`

### Candidate-confirmation proof

Initial medium-confidence turn:

- `Raw vitest bypasses the repo wrapper; use pnpm test instead.`

Observed pending candidate:

- event id:
  - `da57556b-0a6a-4704-974e-8c56f7e352e4`
- candidate object id:
  - `de21f2e2-f497-4652-ba58-ab0f8bcc00d0`

Observed pending metadata:

- `lessonKey = vitest_wrapper_required`
- `candidateKind = improvement`
- `state = pending_confirmation`
- `captureSeam = model_tool_primary`
- `guidanceMode = guidance_only`

Later confirming turn:

- `Use pnpm test -- <path-or-filter> instead of raw vitest in this repo.`

Observed approved row:

- approved memory object id:
  - `dc43fc85-a1ae-448e-8413-4e7ec3dd3152`
- review id:
  - `abff7547-2cf5-4eed-bbc8-5f89fb6b312c`

Observed promotion metadata proved:

- `promotionProfile = workflow_improvement_confirmation_v1`
- `confirmationState = confirmed`
- `captureSeam = model_tool_primary`

### Duplicate-suppression proof

Repeated confirming turn:

- `Use pnpm test -- <path-or-filter> instead of raw vitest in this repo.`

Observed deltas:

- `memory_events +0`
- `memory_objects +0`
- `memory_reviews +0`
- `procedures +0`
- `skill_candidates +0`
- `background_jobs +0`

### Ambiguity and no-trash proof

Ambiguous turn:

- `Vitest has been annoying lately.`

Observed deltas:

- `memory_events +0`
- `memory_objects +0`
- `memory_reviews +0`
- `procedures +0`
- `skill_candidates +0`
- `background_jobs +0`

### Guidance retrieval proof

Query:

- `how should I run this vitest file safely in this repo`

Observed top record:

- `dc43fc85-a1ae-448e-8413-4e7ec3dd3152`
- `readSurface = approved_memory_view`
- top matched fields included:
  - `auto_capture_lesson_match`
  - `trigram_similarity`

Observed prompt guidance proof:

- prompt guidance explicitly told the model to use approved workflow memory as
  bounded repo-operating guidance for running tests, making scoped commits, or
  handling git-state safety
- prompt guidance explicitly kept this family guidance-only and non-executing

## Production proof validation

Production proof context:

- `projectId = db5fdd6d-927e-4a1d-a3a8-edd0d4690c25`
- `agentId = 1aef21d4-d631-44bf-8c12-cee4a0154f2b`
- `sessionId = e414c4a1-f98d-48ff-bb84-15eec93b6b79`
- `sessionKey = agent:main:workflow-improvement-prod-proof-4667e358`

Observed bounded row deltas:

- `memory_events +1`
- `memory_objects +2`
- `memory_reviews +1`
- `procedures +0`
- `skill_candidates +0`
- `background_jobs +0`

### Candidate-confirmation proof

Initial medium-confidence turn:

- `scripts/committer keeps commit staging scoped here.`

Observed pending candidate:

- event id:
  - `8258307f-e848-40bf-bfd6-6247c21f01c1`
- candidate object id:
  - `f34c5114-559a-4608-9ae5-4ab713d0b38b`

Later confirming turn:

- `Use scripts/committer "<msg>" <file...> instead of manual git add and git commit.`

Observed approved row:

- approved memory object id:
  - `50ef7dea-9216-4bfc-9ad4-745b6d52436d`
- review id:
  - `dd1927ad-4696-41a1-97ba-aba3ce53a6ff`

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

Ambiguous turn:

- `Committing has been annoying lately.`

Observed deltas:

- `memory_events +0`
- `memory_objects +0`
- `memory_reviews +0`
- `procedures +0`
- `skill_candidates +0`
- `background_jobs +0`

### Guidance retrieval proof

Query:

- `how should I make a scoped commit here`

Observed top record:

- `50ef7dea-9216-4bfc-9ad4-745b6d52436d`
- top matched fields included:
  - `auto_capture_lesson_match`
  - `trigram_similarity`

Observed content:

- `Workflow improvement: use scripts/committer "<msg>" <file...> instead of manual git add / git commit so staging stays scoped.`

Observed boundary proof:

- no candidate, approved, or retrieval surface triggered autonomous action
- the proof remained guidance-only
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

- `openclaw:pre-workflow-improvement-20260405T235548Z`

## Exact user-visible change now live

What became materially more useful:

- repeated repo-operating lessons about tests, scoped commits, and git-state
  safety can now be remembered in bounded form
- medium-confidence lessons can wait for confirming evidence instead of
  becoming dead review backlog
- later relevant repo-operating asks can surface the approved lesson as a
  bounded hint or gotcha
- the application posture remains bounded:
  - guidance only
  - no action-taking
  - no silent plan mutation

## Remaining limitations

- only the supported repeated tool-gotcha family is live
- workflow repair or forgetting is not live for this family yet
- repeated API workarounds, broader workflow lessons, and environment
  constraints are still not live
- autonomous remediation and direct operational execution are still not live
