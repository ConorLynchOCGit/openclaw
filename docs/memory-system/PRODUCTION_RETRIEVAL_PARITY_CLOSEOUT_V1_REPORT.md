# Production Retrieval Parity Closeout V1 Report

## Slice

- `cross-family retrieval/application parity closeout`

## Contract landed

- direct named-project fact asks now prefer fact-like approved project results
- direct named-project operating-rule asks now prefer approved project rules
- direct named-project unmet-need asks now prefer approved unmet-need
  artifacts
- once a top family-aligned result wins in the mixed approved-only
  `kind=project` pool, adjacent project memories from other families can be
  suppressed instead of being blended into the reply
- prompt guidance now tells the model to use the top family-aligned project
  result and to avoid blending adjacent project memories unless they directly
  corroborate the same answer
- hybrid remains the default working-context path
- candidate retrieval, semantic-default broadening, self-improving capture,
  and learned-guidance advisory planning remain out of scope

## Implementation

- added bounded project-intent inference in
  `extensions/memory-middleware/src/db/queries.ts` for:
  - `project_fact`
  - `project_rule`
  - `unmet_need`
- added project-family classification and shaping so direct named-project
  searches can keep the top winning family and suppress adjacent project
  memories from other families in the same pool
- added intent-aware approved-only hybrid boosts:
  - `project_fact_intent_match`
  - `project_rule_intent_match`
  - `unmet_need_intent_match`
- updated `extensions/memory-core/src/prompt-section.ts` so direct named-
  project asks use the top fact-like, project-rule, or unmet-need result
  instead of blending unrelated project memories

## Isolated proof

### Environment

- gateway: `http://127.0.0.1:37789`
- config: `/root/.openclaw-slice7-proof/openclaw.json`
- env: `/root/.openclaw-slice7-proof/runtime.env`
- agent id: `a1770ca5-4422-4e96-b80b-24761a5674ee`
- session id: `22222222-2222-4222-8222-222222222222`
- project id: `33333333-3333-4333-8333-333333333333`

### Inputs

- project-rule hold:
  - `For project Atlas Retrieval Intent Split, use generated audit IDs for rollout audits instead of client timestamps.`
- project-rule confirm:
  - `For project Atlas Retrieval Intent Split, prefer generated audit IDs for rollout audits instead of client timestamps.`
- unmet-need hold:
  - `For project Atlas Retrieval Intent Split, we need a release evidence template for rollout audits.`
- unmet-need confirm:
  - `For project Atlas Retrieval Intent Split, we're missing a release evidence template for rollout audits.`
- retrieval query:
  - `for project atlas retrieval intent split rollout audits what do we still need`
- ambiguity probe from the earlier tranche setup on the same code path:
  - `Project Atlas Retrieval Closeout rollout audits have felt messy lately.`

### Evidence

- isolated project-rule approval:
  - candidate id: `dc568412-d73b-4bd9-ae27-ad74ac4d9106`
  - event id: `65f00025-84a1-475d-b3fe-5ad9065144f6`
  - key: `867ec9e1f31bf50bc1d03800efe0b3d5b27ba59d128c8319c48b3988e2e1490c`
  - subject key: `f0e5a554fec4653f9a022d998350f9060c831ce8a24716beb8b8a20700cc28cb`
  - approved object id: `b810215b-52c8-4715-bf80-07c4df1c9928`
- isolated unmet-need approval:
  - candidate id: `a7b1b8ac-72ac-418c-8845-a5cbd063e7ca`
  - event id: `d7f49427-46af-4cb2-969e-ede975e6bc38`
  - key: `7d5a50da841f9049ca5ac8ae1d9e3e4e09ce253502aea35586e91a7186928612`
  - subject key: `d91b7022ffa657446070320f41065fdca5dd8fabcd88bf20e56d6a52301ccc24`
  - approved object id: `06520ced-3bc2-4f4f-9502-8ba18674c175`
- isolated retrieval result:
  - returned record count: `1`
  - returned approved object id: `06520ced-3bc2-4f4f-9502-8ba18674c175`
  - matched fields:
    - `unmet_need_intent_match`
    - `unmet_need_scope_match`
    - `unmet_need_subject_match`
    - `trigram_similarity`
  - adjacent approved project rule `b810215b-52c8-4715-bf80-07c4df1c9928`
    was not returned
- ambiguity probe:
  - ignored: `true`
  - no candidate write

### Health

- isolated `/healthz` and `/readyz` still returned `fetch failed` before and
  after the proof

## Production proof

### Environment

- gateway: `http://127.0.0.1:28789`
- config: `/root/.openclaw/openclaw.json`
- env: `/root/.openclaw/.env`
- agent id: `9d8f2956-a081-4135-be61-8fe7f2fe8070`
- session id: `cd670787-8e50-427d-9b14-cb1176408238`
- project id: `437d43ff-1c9d-4757-8d44-cd8e0aeb241b`

### Inputs

- project-rule hold:
  - `For project Cedar Retrieval Intent Split, trust the harbor signoff proof report for rollout audits; raw container health is only liveness noise.`
- project-rule confirm:
  - `For project Cedar Retrieval Intent Split, trust the harbor signoff proof report for rollout audits; raw container health is only liveness noise.`
- project-fact hold:
  - `For project Cedar Retrieval Intent Split, the harbor signoff proof report is cedar-harbor-signoff-report.`
- project-fact confirm:
  - `For project Cedar Retrieval Intent Split, the harbor signoff proof report is cedar-harbor-signoff-report.`
- retrieval query:
  - `for project cedar retrieval intent split where is the harbor signoff proof report`

### Evidence

- production project-rule approval:
  - candidate id: `74603377-ef9e-4e01-ad09-4d6cef721400`
  - event id: `a6ba74a6-d048-4d3f-ae69-5fef037b23b8`
  - key: `baabebda5f06cb8337f02765b11de1d4dacff3481ad8ed7ca53bcabc1ae63830`
  - subject key: `943469dc5827001712c3b99fdefdf5f366c101d5ff60ea77e89088cff86b9941`
  - approved object id: `adfa12be-2117-419f-bbac-8de27e5bdb2c`
- production project-fact approval:
  - candidate id: `784a376c-b089-439a-a66d-2d100661639e`
  - event id: `e67dd99a-bbb2-4d6b-a607-6a6c58f91754`
  - key: `60e1c27b22e2a733fbdcbdb0ef3e97cd6e59ce79b0ce8c98fdedfb79dbf85483`
  - subject key: `37da8c85cd291f7c79c4cafb5995d5ff63ad3af1b551801cf577d20edfb2e64a`
  - approved object id: `fabc102d-6dbc-47f3-bfc3-e93ee958c9f3`
- production retrieval result:
  - top approved object id: `fabc102d-6dbc-47f3-bfc3-e93ee958c9f3`
  - matched fields:
    - `project_fact_intent_match`
    - `project_fact_scope_match`
    - `project_fact_subject_match`
    - `fts_search_document`
    - `trigram_similarity`
  - adjacent approved project rule `adfa12be-2117-419f-bbac-8de27e5bdb2c`
    was not returned
  - one older unrelated approved project fact from the same broader project id
    remained in the tail of results; this closeout suppresses adjacent
    cross-family project memories, not every older same-family fact

### Health

- production `/healthz` returned `200 {"ok":true,"status":"live"}`
- production `/readyz` returned `200 {"ready":true}` before and after the
  proof

## Validation

- targeted prompt-section proof test
- targeted hybrid retrieval integration tests for:
  - direct named-project unmet-need selection over adjacent project rules
  - direct named-project fact selection over adjacent project rules
- full landing gates:
  - `pnpm check`
  - `pnpm build`
  - `git diff --check`

## Remaining limits

- this slice does not broaden semantic retrieval for generic lessons
- this slice does not expose candidate retrieval in normal user-visible
  behavior
- this slice does not create a full explicit active profile across families
- this slice does not enable reduced-profile self-improving capture
- this slice does not enable learned-guidance advisory planning
