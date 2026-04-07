# Production Generalized Lesson Learning V1 Report

## Scope

This report covers the first roadmap-pivot slice from hand-authored workflow
lesson keys toward broader supervised lesson learning.

The landed behavior is still guidance-only.

What changed:

- OpenClaw can now capture broader repo-local workflow lessons without a
  pre-registered lesson key
- casual phrasing now normalizes into a reusable reviewed lesson shape
- broader workflow lessons are `review_required`, not auto-confirmed
- approved generalized workflow lessons can later retrieve through the normal
  approved-only hybrid path without new per-lesson routing
- vague workflow complaints can now be proven as ignored through the repo
  proof runner

## Proof commands

Isolated positive proof:

```bash
pnpm memory:proof \
  --plan /tmp/memory-proof-generic-isolated-v1.json \
  --config /root/.openclaw-slice7-proof/openclaw.json \
  --env-file /root/.openclaw-slice7-proof/.env \
  --gateway-base-url http://127.0.0.1:37789 \
  --out /tmp/memory-proof-generic-isolated-v1-report.json
```

Production positive proof:

```bash
pnpm memory:proof \
  --plan /tmp/memory-proof-generic-production-v1.json \
  --config /root/.openclaw/openclaw.json \
  --env-file /root/.openclaw/.env \
  --gateway-base-url http://127.0.0.1:28789 \
  --out /tmp/memory-proof-generic-production-v1-report.json
```

Isolated ambiguity proof:

```bash
pnpm memory:proof \
  --plan /tmp/memory-proof-generic-ambiguity-v1.json \
  --config /root/.openclaw-slice7-proof/openclaw.json \
  --env-file /root/.openclaw-slice7-proof/.env \
  --gateway-base-url http://127.0.0.1:37789 \
  --out /tmp/memory-proof-generic-ambiguity-v1-report.json
```

## Isolated positive proof

### Inputs

Capture text:

`For polaris release evidence notes here, use bulletized proof IDs instead of paraphrased rollout summaries.`

Duplicate restatement:

`For polaris release evidence notes here, use bulletized proof IDs instead of paraphrased rollout summaries.`

Later retrieval query:

`for polaris release evidence notes should I use bulletized proof ids or paraphrased rollout summaries`

### Normalized lesson shape

- `lessonFamily = generalized_workflow_lesson`
- `template = workflow_generalized_guidance`
- `guidancePattern = use_instead_of`
- `subject = polaris release evidence notes`
- `recommendedAction = bulletized proof IDs`
- `avoidAction = paraphrased rollout summaries`
- `candidateLifecycle.state = review_required`

### Evidence

- candidate id: `7e4555f3-9a61-4fea-9f7b-09e500f580fb`
- candidate event id: `57037fa8-9db1-4903-b13c-d03d9c336395`
- duplicate restatement reused the same candidate id and event id
- review id: `1aaa0deb-7781-4d67-900a-fb322b1c1456`
- promoted memory object id: `de3e8ff5-0793-47ad-af27-d5b7d5237d3c`
- retrieval returned the promoted approved object first
- matched fields:
  - `fts_search_document`
  - `trigram_similarity`

### Health

Before and after the run:

- `http://127.0.0.1:37789/healthz` returned `{"ok":true,"status":"live"}`
- `http://127.0.0.1:37789/readyz` returned `{"ready":true,"failing":[],"uptimeMs":...}`

## Production positive proof

### Inputs

Capture text:

`Trust the harbor signoff proof report for cedar drift audits here; raw container health is only liveness noise.`

Later retrieval query:

`for cedar drift audits should I trust the harbor signoff proof report or raw container health`

### Normalized lesson shape

- `lessonFamily = generalized_workflow_lesson`
- `template = workflow_generalized_guidance`
- `guidancePattern = trust_for_scope`
- `subject = cedar drift audits`
- `recommendedAction = the harbor signoff proof report`
- `avoidAction = raw container health`
- `rationale = liveness noise`
- `candidateLifecycle.state = review_required`

### Evidence

- candidate id: `91b8a321-cf6d-44a6-ade2-bb5cb66b12af`
- candidate event id: `d4a737a5-90dc-403b-b975-d144839645eb`
- review id: `72b6e30d-9e2f-4dde-919f-e046ff8646a7`
- promoted memory object id: `b71f1de8-89d0-4f35-8d74-53d94f86fd74`
- retrieval returned the promoted approved object first
- matched fields:
  - `fts_search_document`
  - `trigram_similarity`

The generic lesson retrieved through the normal approved-only hybrid path.
This proof did not require a new per-lesson semantic router.

### Health

Before and after the run:

- `http://127.0.0.1:28789/healthz` returned `{"ok":true,"status":"live"}`
- `http://127.0.0.1:28789/readyz` returned `{"ready":true}`

## Ambiguity / no-write proof

### Input

`Build and rollout stuff has felt noisy lately.`

### Evidence

The proof runner now supports explicit ignored capture checks with:

- `expectNoLifecycle: true`

The run returned:

- `steps[0].ignored = true`
- no candidate id
- no event id
- no durable write evidence

### Health

Before and after the run:

- `http://127.0.0.1:37789/healthz` returned `{"ok":true,"status":"live"}`
- `http://127.0.0.1:37789/readyz` returned `{"ready":true,"failing":[],"uptimeMs":...}`

## What this proves

This slice materially changed the learning posture in four ways:

1. New repo-local workflow lessons no longer require a pre-registered lesson
   key.
2. Casual phrasing can normalize into a reusable reviewed lesson shape.
3. Broader lessons can enter review without creating duplicate candidate
   spray.
4. Approved generic lessons can retrieve later without hand-written routing.

## Current limits

- the broader path is still workflow-guidance only
- generic lessons are still review-first rather than auto-confirmed
- retrieval remains hybrid-first and approved-only
- semantic routing is still limited to the older bounded approved families
- broader project-rule learning and unmet-need planning are still future work
