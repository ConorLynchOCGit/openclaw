# Production Generalized Learning Batch Report V1

## Scope

This report covers the four-slice generalized-learning batch that followed the
post-pivot architecture alignment pass:

1. reviewed phrase induction for approved generic lessons v1
2. generalized lesson retrieval/application expansion v1
3. broader project-rule learning v1
4. unmet-need planning v1

Per-slice standalone production report docs were intentionally skipped for
slices 1-3. This combined report records the production proof evidence,
commits, and resulting architecture posture across the full batch.

## Evidence note

The connection dropped after slice 4 implementation but before the final
combined write-up. Because of that:

- slice 3 and slice 4 exact proof-runner reports were still present on disk and
  are copied here directly
- slice 1 and slice 2 exact production object, event, and review ids were
  reconstructed from the live `memory_middleware` ledger and the landed proof
  session metadata
- slice 1 and slice 2 targeted validation commands are replayed on the final
  tree rather than quoted from a transient shell session

No evidence below is invented. When an exact transient artifact was no longer
available, this report says so explicitly and cites the durable ledger rows or
post-batch replay instead.

## Starting posture

At batch start:

- generalized workflow lesson capture was already live without per-lesson key
  registration
- generalized workflow auto-review and promotion was already live with bounded
  `approve` / `hold_for_more_evidence` / `reject` / `supersede_existing`
  outcomes
- approved generic lessons already retrieved through approved-only hybrid
- semantic routing remained narrow and family-gated
- self-improving capture remained disabled and candidate-only

The batch goal was to extend that one generic learning pipeline rather than add
parallel systems.

## Slice 1 — reviewed phrase induction for approved generic lessons v1

### Contract

- only already-approved generalized workflow lessons could seed phrase
  proposals
- phrase proposals remained their own reviewed artifact family:
  `workflow_phrase_pattern`
- phrase patterns could auto-promote after later compatible evidence
- approved phrase patterns fed deterministic matching back into workflow
  capture
- phrase-pattern artifacts stayed hidden from approved-only hybrid retrieval

### Production proof inputs

Production proof metadata recovered from the ledger used the session key:

- `agent:chief:phrase-induction-production`

Exact captured content:

- approved generic lesson seed:
  - `Workflow improvement: for cedar beacon proof notes v1, use bulletized proof IDs instead of paraphrased rollout summaries.`
- first held phrase pattern:
  - `Workflow phrase pattern: "Use bulletized proof IDs for cedar beacon proof notes v1 here instead of paraphrased rollout summaries." maps to approved workflow guidance for cedar beacon proof notes v1.`
- later approving phrase pattern:
  - `Workflow phrase pattern: "Prefer bulletized proof IDs for cedar beacon proof notes v1 instead of paraphrased rollout summaries." maps to approved workflow guidance for cedar beacon proof notes v1.`

### Production ids and artifacts

- generalized lesson cluster seed:
  - event `f2367e7e-c865-4867-8194-834a18e44a6e`
  - candidate `4fd80b65-74d6-428e-b3bc-1c1a4daedfd2`
  - review `8411ea48-43d3-43f4-8692-a3ca63beb8dd`
  - approved lesson `1d4ae4cb-06d1-4663-bad2-19de783b4a4f`
  - cluster key `fb8844472174539ae7929c81787c2ba9c8abc0fd9d072f2f029a7de4b22c363f`
  - subject key `13c23508914f75dcfbc47d5c9781fe5dc149c967e6d5297495c84dd83d4f0123`
- first held phrase-pattern candidate:
  - event `9925227e-73d0-48fa-a79e-698c57b28455`
  - candidate `fedeec22-034b-45e4-b780-b2fa5ae08a4d`
  - observed phrase `Use bulletized proof IDs for cedar beacon proof notes v1 here instead of paraphrased rollout summaries.`
  - normalized phrase `use bulletized proof ids for cedar beacon proof notes v1 here instead of paraphrased rollout summaries.`
  - pattern key `2dca9414da6c5d66bedf72bf0cf872f8bc484ca1c99199e26ebf25df4221267e`
  - lifecycle state `hold_for_more_evidence`
- approving phrase-pattern candidate and approved artifact:
  - event `c2f4444c-4c17-4d1e-bd5c-1751973aa4fe`
  - candidate `0c3a4e73-5c70-4ce1-a7fc-b2a5faab94f3`
  - review `813ef987-f716-47e6-a016-c7af24950293`
  - approved phrase artifact `67aef230-c4d7-4afb-9c33-9cd6593dc088`
  - observed phrase `Prefer bulletized proof IDs for cedar beacon proof notes v1 instead of paraphrased rollout summaries.`
  - normalized phrase `prefer bulletized proof ids for cedar beacon proof notes v1 instead of paraphrased rollout summaries.`
  - pattern key `ccc11f4f9e10444a46b16adb39aa38a01577d4ab2c568b939ae2c559dbc98c4f`
  - auto-promotion profile `workflow_phrase_induction_v1`

### Retrieval / visibility replay

Post-batch read-only replay on the final tree used:

- query `cedar beacon proof notes v1 bulletized proof ids`
- project `437d43ff-1c9d-4757-8d44-cd8e0aeb241b`

Observed result:

- approved workflow lesson `1d4ae4cb-06d1-4663-bad2-19de783b4a4f` returned
- matched fields:
  - `generalized_recommended_action_match`
  - `fts_search_document`
  - `trigram_similarity`
- approved phrase artifact `67aef230-c4d7-4afb-9c33-9cd6593dc088` did not
  surface in the approved-only hybrid result set

### Validation

Original transient shell commands for slice 1 were not recoverable after the
disconnect. The batch end-state replay covered the phrase-induction surfaces
again:

- targeted tests replayed on the final tree
- final landing gates replayed on the final tree

### Commit

- `98fd050466` `Memory: land generic phrase induction v1`

## Slice 2 — generalized lesson retrieval/application expansion v1

### Contract

- approved generalized workflow lessons stayed hybrid-first
- retrieval ranking now boosted normalized subject, recommended action, avoid
  action, and guidance-pattern overlap for approved generic lessons
- prompt application stayed guidance-only
- exact typed matches still won when stronger
- generic semantic broadening remained out of scope

### Production proof inputs

Production proof metadata recovered from the ledger used the session key:

- `agent:chief:generic-retrieval-production-v8`

Exact captured lesson content:

- `Workflow improvement: for cedar orbit proof notes v8, use bulletized proof IDs instead of paraphrased rollout summaries.`
- `Workflow improvement: for cedar harbor audits v7, trust the harbor signoff proof report; raw container health is only liveness noise.`

Post-batch read-only hybrid replay used the slice 2 retrieval-style query:

- `for cedar orbit proof notes v8 should i use bulletized proof ids or paraphrased rollout summaries`

### Production ids and artifacts

- release-proof-notes generic lesson:
  - event `3195a67f-e337-414a-98fa-d26c5dfa09fb`
  - candidate `3ca675c9-1257-483f-b073-a6e7a859d62c`
  - review `7baebea5-c4f7-43fd-bd7f-c75fcc5646eb`
  - approved lesson `cbc45e56-cd13-4307-aa88-cb3e7ffb4b60`
  - subject `cedar orbit proof notes v8`
  - cluster key `1311688b8588ad2f0d8390a37d0431e75290ae20edb5efd1759329a39e2b68a9`
  - subject key `5a3c4bc8719dea7bd7e51ebb81b0df2fe9e61cdebe21704a5518887afc7906bb`
- trust-for-scope distractor lesson in the same proof session:
  - event `a4a5a385-d1e2-46be-885a-abafc6e4ea72`
  - candidate `d1155d59-4566-4890-a54e-197c76b07008`
  - review `20faa252-7318-403a-bf04-9086d8a87aa8`
  - approved lesson `d9ce5843-ba02-4778-ab19-9a7b1a7dd7c5`
  - subject `cedar harbor audits v7`
  - cluster key `61992a5d414f31cf325e9e689bcf3d3820a546bc26106298d52a690ac268eef8`
  - subject key `06c3072148cd8d64b40e16ea79c6cd6454bf50aa953ebf64994484a092b9d565`

### Retrieval replay result

Post-batch read-only replay on the final tree returned:

- first record `cbc45e56-cd13-4307-aa88-cb3e7ffb4b60`
- matched fields:
  - `generalized_subject_match`
  - `generalized_recommended_action_match`
  - `generalized_avoid_action_match`
  - `generalized_guidance_pattern_match`
  - `fts_search_document`
  - `trigram_similarity`
- the less-relevant approved lessons stayed below the target record

### Validation

Original transient shell commands for slice 2 were not recoverable after the
disconnect. The batch end-state replay covered the retrieval/application
surfaces again:

- targeted tests replayed on the final tree
- final landing gates replayed on the final tree

### Commit

- `827904e13d` `Memory: land generalized lesson retrieval v1`

## Slice 3 — project-rule learning v1

### Contract

- new bounded family:
  - `lessonFamily = generalized_project_rule`
  - `template = project_rule_guidance`
- project-scoped durable operating guidance only
- machine review reused the generalized workflow cluster path
- approved project rules retrieved through approved-only hybrid with explicit
  project-rule ranking boosts
- named project facts remained separate and unchanged

### Isolated proof

Phase 1 capture:

- text `For project Atlas Quasar, use generated audit IDs for audit events v2 instead of client timestamps.`
- candidate `3c3f05c9-420f-4fd9-ad5a-3d430a20b907`
- event `b595114c-ac2b-476d-afbb-cd9a6712283a`
- cluster key `ed369aac2e1c03544105db3cd2c4d25f3ee059d60cbd3cfa988d919b1db6e4e1`
- subject key `c7324a8516f7616bf2a1b3370d7b5282f10fcf6feef87f138c39392e3796ac3a`
- project `7521afa7-d7c3-4d06-821d-c6c7b6e81289`
- lifecycle state `hold_for_more_evidence`

Phase 1 ambiguity no-write:

- text `Project Atlas audit events have been messy lately.`
- result `ignored = true`

Phase 2 approve and retrieval:

- query `for project atlas quasar audit events v2 should i use generated audit ids or client timestamps`
- approved object `11392dc7-3ef2-4033-bed8-91ee76bcfbd5`
- matched fields:
  - `project_rule_scope_match`
  - `project_rule_subject_match`
  - `project_rule_recommended_action_match`
  - `project_rule_avoid_action_match`
  - `project_rule_guidance_pattern_match`
  - `fts_search_document`
  - `trigram_similarity`
- workflow auto-review:
  - outcome `approve`
  - evidence count `2`
  - contradiction count `0`

### Production proof

Phase 1 capture:

- text `For project Cedar Orbit, use generated audit IDs for release evidence v2 instead of client timestamps.`
- candidate `283ec0d5-4c13-4ea3-aad2-2b6823b77039`
- event `b64234a3-0a06-4054-85cd-2185ea104346`
- cluster key `1c357b55370c3b04a05e67ce0f0a9e61b93706b2f5dc65f615670e40e9db854a`
- subject key `4227f9cb12de1145ea6ae5f6e77d7f5f3de16541be4b770854d7e5a63172fd26`
- project `437d43ff-1c9d-4757-8d44-cd8e0aeb241b`

Phase 2 approve and retrieval:

- query `for project cedar orbit release evidence v2 should i use generated audit ids or client timestamps`
- review `eeef7268-1791-4e7f-b21d-6f8749d980e4`
- approved object `cae9994c-6e56-4de4-98ad-3d030d7dca7b`
- matched fields:
  - `project_rule_scope_match`
  - `project_rule_subject_match`
  - `project_rule_recommended_action_match`
  - `project_rule_avoid_action_match`
  - `project_rule_guidance_pattern_match`
  - `fts_search_document`
  - `trigram_similarity`
- workflow auto-review:
  - outcome `approve`
  - evidence count `2`
  - contradiction count `0`

### Validation

- `pnpm test -- extensions/memory-middleware/src/proof-runner.test.ts extensions/memory-core/index.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts -t "project rule|project-rule|Durable Memory|parseMemoryProofPlan"`
- `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "project-rule cluster|project rule"`
- `pnpm check`
- `pnpm build`
- `git diff --check`

### Commit

- `e898fd4d0b` `Memory: land project-rule learning v1`

## Slice 4 — unmet-need planning v1

### Contract

- new bounded family:
  - `lessonFamily = generalized_unmet_need`
  - `template = unmet_need_recommendation`
- recommendation-only named-project missing workflow support
- blocked procurement, install, vetting, approval, buy, purchase, and vendor
  language
- same held-cluster auto-review path as the other generalized families
- approved-only hybrid retrieval with unmet-need scope, subject, and
  needed-capability overlap

### Isolated proof

Hold:

- text `For project Atlas Quasar, we need a release evidence template for rollout audits v2.`
- candidate `fb7dbc8d-34ea-4b7a-b28b-c2bfb191799a`
- event `45f783d8-85c5-4426-857b-32867c0850e9`
- key `0484d48a6a4eccdca7e425d73138f60244d3d9ce623a0cd24278e4c4fad21ad1`
- subject key `1de8a84e849b0cd71ca07383e75d3a3eb33ff449aeb6f8f8e9324d7ca0dc6560`
- lifecycle state `hold_for_more_evidence`

Approve and retrieval:

- text `For project Atlas Quasar, we're missing a release evidence template for rollout audits v2.`
- same candidate `fb7dbc8d-34ea-4b7a-b28b-c2bfb191799a`
- approved object `7e598db7-e78c-4aea-b557-52d5a633db36`
- query `for project atlas quasar rollout audits v2 are we still missing a release evidence template`
- matched fields on the approved record:
  - `unmet_need_scope_match`
  - `unmet_need_subject_match`
  - `unmet_need_capability_match`
  - `trigram_similarity`
- workflow auto-review outcome `approve`

Ambiguity no-write:

- text `Project Atlas rollout audits still feel rough.`
- result `ignored = true`

### Production proof

Hold:

- text `For project Cedar Orbit, we need a release evidence template for rollout audits v2.`
- candidate `33e3f82f-afe4-4b4b-b990-ed428ed29f9f`
- event `629c0787-51b5-4000-a795-004f0ebb3ae1`
- key `366f6c68be8bc3eaebaf7afcf039c78c9ba9066ee1612847b81077949ae42b99`
- subject key `8c2c5d7b69942aa44af06538ce16734fea30087d273e5ae40187def4975d4636`
- lifecycle state `hold_for_more_evidence`

Approve and retrieval:

- text `For project Cedar Orbit, we're missing a release evidence template for rollout audits v2.`
- same candidate `33e3f82f-afe4-4b4b-b990-ed428ed29f9f`
- review `0c8da845-c946-4939-aec2-18e01db12231`
- approved object `89cf6ee3-e169-4af8-abd0-2455689c4bb1`
- query `for project cedar orbit rollout audits v2 are we still missing a release evidence template`
- project `437d43ff-1c9d-4757-8d44-cd8e0aeb241b`
- approved record returned first
- matched fields:
  - `unmet_need_scope_match`
  - `unmet_need_subject_match`
  - `unmet_need_capability_match`
  - `trigram_similarity`
- workflow auto-review outcome `approve`

### Health note

Slice 4 proof-runner health snapshots were captured, but both the isolated and
production `/healthz` and `/readyz` fetches returned `fetch failed` in this
environment. That is recorded as-is rather than masked.

### Validation

- `pnpm test -- extensions/memory-middleware/src/unmet-need-semantic.test.ts extensions/memory-middleware/src/proof-runner.test.ts extensions/memory-core/index.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts -t "unmet need|Durable Memory|parseMemoryProofPlan"`
- `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "unmet-need|unmet need"`
- `pnpm check`
- `pnpm build`
- `git diff --check`

### Commit

The slice 4 landing commit is the commit that adds this report.

## Post-batch architecture posture

After all four slices:

- approved generic workflow lessons can now seed reviewed phrase patterns
- approved phrase patterns can improve later deterministic capture without
  becoming their own retrieval-visible memory family
- approved generic workflow lessons retrieve more reliably under hybrid-first
  ranking
- the same generic pipeline now covers:
  - broader workflow guidance
  - named-project operating rules
  - named-project unmet-need recommendations
- all three generalized families still remain bounded, auditable, and
  non-autonomous

## Still not live

- generic semantic fallback for all generic lessons
- reduced-profile self-improving capture integration
- learned-guidance advisory planning
- procurement, install, vetting, or approval automation for unmet needs
- autonomous remediation or silent plan mutation from learned lessons
