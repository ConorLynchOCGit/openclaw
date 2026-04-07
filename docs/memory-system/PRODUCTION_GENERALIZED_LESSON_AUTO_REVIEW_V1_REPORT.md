# Production Generalized Lesson Auto-Review V1 Report

## Scope

This report covers the first bounded machine-resolution loop for generalized
workflow lessons.

The landed behavior stays:

- guidance-only
- approved-only on later retrieval
- hybrid-first on retrieval
- limited to generalized repo-local workflow guidance

What changed:

- broader generalized workflow lessons no longer depend on manual review as
  the normal path
- the first compatible evidence event creates a held normalized cluster under
  `hold_for_more_evidence`
- later compatible evidence can auto-promote the same normalized cluster
- stale held clusters reject instead of lingering
- stronger newer conflicting clusters on the same scoped subject can
  supersede older approved generalized lessons with explicit lineage

## Validation commands

Targeted tests:

```bash
pnpm test -- extensions/memory-middleware/src/workflow-improvement-semantic.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts
pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "generalized workflow lesson|expired generalized workflow lesson hold|supersedes an older approved generalized workflow lesson"
```

Isolated hold proof:

```bash
pnpm memory:proof \
  --plan /tmp/memory-proof-generalized-auto-review-isolated-v1.json \
  --config /root/.openclaw-slice7-proof/openclaw.json \
  --env-file /root/.openclaw-slice7-proof/.env \
  --gateway-base-url http://127.0.0.1:37789 \
  --out /tmp/memory-proof-generalized-auto-review-isolated-v1-report.json
```

Isolated approve plus retrieval proof:

```bash
pnpm memory:proof \
  --plan /tmp/memory-proof-generalized-auto-review-isolated-approve-v1.json \
  --config /root/.openclaw-slice7-proof/openclaw.json \
  --env-file /root/.openclaw-slice7-proof/.env \
  --gateway-base-url http://127.0.0.1:37789 \
  --out /tmp/memory-proof-generalized-auto-review-isolated-approve-v1-report.json
```

Isolated ambiguity no-write proof:

```bash
pnpm memory:proof \
  --plan /tmp/memory-proof-generalized-auto-review-ambiguity-v1.json \
  --config /root/.openclaw-slice7-proof/openclaw.json \
  --env-file /root/.openclaw-slice7-proof/.env \
  --gateway-base-url http://127.0.0.1:37789 \
  --out /tmp/memory-proof-generalized-auto-review-ambiguity-v1-report.json
```

Isolated stale rejection proof:

```bash
pnpm memory:proof \
  --plan /tmp/memory-proof-generalized-auto-review-stale-hold-v1.json \
  --config /root/.openclaw-slice7-proof/openclaw.json \
  --env-file /root/.openclaw-slice7-proof/.env \
  --gateway-base-url http://127.0.0.1:37789 \
  --out /tmp/memory-proof-generalized-auto-review-stale-hold-v1-report.json

node --input-type=module <<'EOF'
import fs from 'node:fs';
import { Client } from 'pg';
const config = JSON.parse(fs.readFileSync('/root/.openclaw-slice7-proof/openclaw.json', 'utf8'));
const db = config.plugins.entries['memory-middleware'].config.database;
const client = new Client({ connectionString: db.url });
await client.connect();
await client.query(
  `update ${db.schema}.memory_objects
      set metadata = jsonb_set(
        metadata,
        '{candidateMetadata,candidateLifecycle,expiresAt}',
        to_jsonb($2::text),
        true
      )
    where id = $1`,
  ['14654c2d-d70f-43fd-a60b-14fdef3243a8', new Date(Date.now() - 60_000).toISOString()],
);
await client.end();
EOF

pnpm memory:proof \
  --plan /tmp/memory-proof-generalized-auto-review-stale-revisit-v1.json \
  --config /root/.openclaw-slice7-proof/openclaw.json \
  --env-file /root/.openclaw-slice7-proof/.env \
  --gateway-base-url http://127.0.0.1:37789 \
  --out /tmp/memory-proof-generalized-auto-review-stale-revisit-v1-report.json
```

Isolated supersede proof:

```bash
pnpm memory:proof \
  --plan /tmp/memory-proof-generalized-auto-review-supersede-first-hold-v1.json \
  --config /root/.openclaw-slice7-proof/openclaw.json \
  --env-file /root/.openclaw-slice7-proof/.env \
  --gateway-base-url http://127.0.0.1:37789 \
  --out /tmp/memory-proof-generalized-auto-review-supersede-first-hold-v1-report.json

sleep 6

pnpm memory:proof \
  --plan /tmp/memory-proof-generalized-auto-review-supersede-first-approve-v1.json \
  --config /root/.openclaw-slice7-proof/openclaw.json \
  --env-file /root/.openclaw-slice7-proof/.env \
  --gateway-base-url http://127.0.0.1:37789 \
  --out /tmp/memory-proof-generalized-auto-review-supersede-first-approve-v1-report.json

pnpm memory:proof \
  --plan /tmp/memory-proof-generalized-auto-review-supersede-second-hold-v1.json \
  --config /root/.openclaw-slice7-proof/openclaw.json \
  --env-file /root/.openclaw-slice7-proof/.env \
  --gateway-base-url http://127.0.0.1:37789 \
  --out /tmp/memory-proof-generalized-auto-review-supersede-second-hold-v1-report.json

sleep 6

pnpm memory:proof \
  --plan /tmp/memory-proof-generalized-auto-review-supersede-second-approve-v1.json \
  --config /root/.openclaw-slice7-proof/openclaw.json \
  --env-file /root/.openclaw-slice7-proof/.env \
  --gateway-base-url http://127.0.0.1:37789 \
  --out /tmp/memory-proof-generalized-auto-review-supersede-second-approve-v1-report.json
```

Production hold proof:

```bash
pnpm memory:proof \
  --plan /tmp/memory-proof-generalized-auto-review-production-hold-v1.json \
  --config /root/.openclaw/openclaw.json \
  --env-file /root/.openclaw/.env \
  --gateway-base-url http://127.0.0.1:28789 \
  --out /tmp/memory-proof-generalized-auto-review-production-hold-v1-report.json
```

Production approve plus retrieval proof:

```bash
sleep 6

pnpm memory:proof \
  --plan /tmp/memory-proof-generalized-auto-review-production-approve-v1.json \
  --config /root/.openclaw/openclaw.json \
  --env-file /root/.openclaw/.env \
  --gateway-base-url http://127.0.0.1:28789 \
  --out /tmp/memory-proof-generalized-auto-review-production-approve-v1-report.json
```

## Isolated hold and approve proof

### Inputs

Held capture:

`For atlas orbit proof notes v2 here, use bulletized proof IDs instead of paraphrased rollout summaries.`

Compatible later restatement:

`Use bulletized proof IDs for atlas orbit proof notes v2 here instead of paraphrased rollout summaries.`

Later retrieval query:

`for atlas orbit proof notes v2 should I use bulletized proof ids or paraphrased rollout summaries`

### Normalized cluster

- `lessonFamily = generalized_workflow_lesson`
- `template = workflow_generalized_guidance`
- `guidancePattern = use_instead_of`
- `subjectKey = 1868581ee91ce7a4af2d8637cfaed1e23623a9ffa1dc12e40dcec0e102626d21`
- `clusterKey = ed07a7a6d692eacc1fd8f31694fc92fc6f7e81544e4dcd8b7ae20a791f2d70a5`
- `recommendedAction = bulletized proof IDs`
- `avoidAction = paraphrased rollout summaries`

### Evidence

- held candidate id: `92a16c07-61b3-4da1-a454-ee9e55c48fab`
- held candidate event id: `f3a7fb2d-0aa3-43be-9dc0-51cb86737157`
- held lifecycle state: `hold_for_more_evidence`
- approval review id: `132f834c-9a54-48ba-a23a-1f17aad1d288`
- approved memory object id: `69d20303-8800-4b37-ab06-64dabacf0353`
- auto-review outcome: `approve`
- retrieval returned the approved object first
- matched fields:
  - `fts_search_document`
  - `trigram_similarity`

### Health

Before and after the isolated runs:

- `http://127.0.0.1:37789/healthz` returned `{"ok":true,"status":"live"}`
- `http://127.0.0.1:37789/readyz` returned `{"ready":true,"failing":[],"uptimeMs":...}`

## Isolated ambiguity no-write proof

### Input

`Build and rollout stuff has felt noisy lately.`

### Evidence

- proof step returned `ignored = true`
- no candidate id
- no review id
- no durable write

## Isolated stale rejection proof

### Input

Initial held capture:

`For atlas orbit stale notes v1 here, use review row IDs instead of paraphrased proof summaries.`

Later revisit after shell-assisted expiry:

`Use review row IDs for atlas orbit stale notes v1 here instead of paraphrased proof summaries.`

### Evidence

- original held candidate id: `14654c2d-d70f-43fd-a60b-14fdef3243a8`
- original event id: `b65372f1-d5df-4a9b-a7a1-47ea3ecb547c`
- stale rejection review id: `1d5d118d-46a5-4f52-9d40-df65bc7c2d70`
- original candidate review state after revisit: `rejected`
- fresh replacement held candidate id: `0a4a50a1-2242-4986-9c15-e77ff8edc123`
- fresh replacement event id: `c4ca95a4-b5b3-4238-8b35-5628acb5d373`

This branch used a shell-assisted expiry timestamp change because the proof
runner does not yet have a native time-travel step.

## Isolated supersede proof

### Inputs

Initial approved lesson:

`For atlas orbit supersede notes v1 here, use bulletized proof IDs instead of paraphrased rollout summaries.`

Later stronger conflicting lesson:

`For atlas orbit supersede notes v1 here, use concise rollout tables instead of bulletized proof IDs.`

### Evidence

Initial cluster:

- held candidate id: `6f6a4574-7ede-4909-b2fa-1855db2b073a`
- first approve review id: `04cb1a2a-1162-44ef-bc35-5e18b47e16ec`
- first approved object id: `a964918c-d1a6-48eb-8aa5-959f87395a66`

Conflicting newer cluster:

- held candidate id: `31fe57d7-af96-4e65-8bad-9a7ad94dfce6`
- second approve review id: `a0a15302-264f-4170-b3fa-4c430ee38046`
- supersede review id on the older approved object: `33cc5285-c01c-4209-a8de-666d3baebf94`
- second approved object id: `52213ff1-9660-4866-8ad3-512d702c2ee1`
- auto-review outcome on the new approved object: `supersede_existing`
- older approved object review state after the second approval: `superseded`
- older candidate rejection review id: `f9fcf091-1fc0-44e1-be91-f686cad73d04`
- supersede link id: `4d0d2fc0-2697-4700-9a0f-966da7c22a92`

## Narrow production proof

### Inputs

Held capture:

`Trust the harbor signoff proof report for cedar delta rollout audits here; raw container health is only liveness noise.`

Compatible later restatement:

`Use the harbor signoff proof report for cedar delta rollout audits here; raw container health is only liveness noise.`

Later retrieval query:

`for cedar delta rollout audits should I trust the harbor signoff proof report or raw container health`

### Normalized cluster

- `lessonFamily = generalized_workflow_lesson`
- `template = workflow_generalized_guidance`
- `guidancePattern = trust_for_scope`
- `subjectKey = 44982904192c3b924150a745ea5beb99bd753ec02875517b5c09cf09cbe0bc27`
- `clusterKey = a1ff8bbcdedc341b218ceeddeb0011868649cb14ef002df0d99b33b99bb9fa46`
- `recommendedAction = the harbor signoff proof report`
- `avoidAction = raw container health`
- `rationale = liveness noise`

### Evidence

- held candidate id: `39ba984c-5739-4949-8e8d-d823fcc56b69`
- held event id: `c771ad70-6086-4ba6-9cf1-bbf091381c2c`
- approval review id: `6781515d-0509-4da3-8d89-ee2400ef73b8`
- approved memory object id: `98ea7568-49bc-4b7c-ae60-b01e413e462f`
- auto-review outcome: `approve`
- retrieval returned the approved object first
- matched fields:
  - `fts_search_document`
  - `trigram_similarity`

The production proof stayed narrow:

- one bounded generic workflow lesson cluster
- no semantic routing broadening
- no candidate retrieval
- no autonomous action-taking

### Health

Before and after the production runs:

- `http://127.0.0.1:28789/healthz` returned `{"ok":true,"status":"live"}`
- `http://127.0.0.1:28789/readyz` returned `{"ready":true}`

## What is still not live

- phrase induction for approved generic lessons
- generic semantic fallback for generalized workflow lessons
- broader project-rule learning on the same generic pipeline
- unmet-need planning on the same generic pipeline
- self-improving capture feeding this pipeline
- advisory planning from approved learned guidance

## Conclusion

Generalized workflow lessons can now move through a bounded machine learning
loop in normal operation:

1. first evidence creates a held cluster
2. compatible later evidence can approve it
3. stale weak clusters reject
4. stronger newer conflicting clusters can supersede older approved lessons
5. later retrieval still stays on the existing approved-only hybrid path
