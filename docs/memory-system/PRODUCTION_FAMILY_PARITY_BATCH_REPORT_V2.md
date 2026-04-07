# Production Family Parity Batch Report V2

## Purpose

This report covers the final three-slice existing-family parity batch that
landed before reduced-profile self-improving capture integration:

1. cross-family repair / supersede parity closeout
2. bounded phrase-induction expansion where materially justified
3. remaining generic-envelope parity closeout for the weakest existing family
   surface

This batch intentionally stopped short of:

- reduced-profile self-improving capture
- learned-guidance advisory planning
- cross-domain family expansion
- broader autonomous behavior

## Starting state

Before this batch:

- project-fact parity v1 was landed
- recurring-procedure parity v1 was landed
- response-style parity v1 was landed
- cross-family retrieval/application parity closeout was landed
- the six existing families were much closer than before, but repair,
  phrase-induction, and generic-envelope parity were still uneven
- response-style remained the weakest remaining family surface

## Exact three-slice sequence executed

1. response-style generic correction / supersede parity closeout
2. response-style phrase-induction parity
3. response-style generic-envelope parity closeout

These are all in the intended batch shape:

- slice 1 closes repair / supersede asymmetry
- slice 2 expands phrase induction where the reviewed artifact model is a good
  fit
- slice 3 closes the highest-leverage remaining generic-envelope gap

## Slice 1 — repair / supersede parity closeout

### Contract chosen

- direct scope:
  - response-style memory
- exact gap closed:
  - transcript-driven bounded generic response-style corrections were still
    too conservative and held instead of superseding when an approved generic
    response-style memory already existed on the same normalized subject
- exact behavior landed:
  - supported template corrections still supersede directly
  - bounded generic response-style corrections now also supersede directly
    when an approved generic response-style memory already exists on the same
    normalized subject
- out of scope:
  - phrase induction
  - broader generic-envelope expansion
  - self-improving capture

### Implementation chosen

- transcript-side bounded generic response-style correction auto-promotion now
  uses:
  - `response_style_generalized_correction_v1`
- correction-prefix stripping for bounded generic response-style guidance is
  now case-insensitive

### Exact proof inputs

Isolated proof:

- seed:
  - `For future replies, use short section headers in longer replies.`
- correction:
  - `Actually, use numbered section headers in longer replies.`

Production proof:

- seed:
  - `For future replies, use short section headers in longer replies.`
- correction:
  - `Actually, use numbered section headers in longer replies.`

Production cleanup:

- `Forget the header preference.`

### Exact ids / evidence

Isolated proof:

- agent `a1770ca5-4422-4e96-b80b-24761a5674ee`
- session `22222222-2222-4222-8222-222222222222`
- project `33333333-3333-4333-8333-333333333333`
- seed candidate `32ccc001-2eb6-4d12-870f-f284d0a35cb7`
- seed event `da441e59-75e9-46f2-9e01-534428c2924f`
- seed approved `8c28dad6-ed33-47ff-b0d1-2933b1b77cd2`
- correction candidate `bd7dfcfa-5faf-413a-89b2-7158d3079788`
- correction event `63427b6e-c168-4530-808b-2fcf3ea3cca8`
- correction approved `4f28a7d6-20f1-48d9-96b2-274abb815946`
- correction key `124fbc53383ab218856151bf9594c3fbb4190032bff55d4c35df74523afc91d0`
- subject key `06126db2618d50d281031a76394e1ae66e46f02ee8c258a8bf172bf66d354493`
- original approved became `superseded`
- supersedes link count `1`

Production proof:

- project `437d43ff-1c9d-4757-8d44-cd8e0aeb241b`
- agent `9d8f2956-a081-4135-be61-8fe7f2fe8070`
- session `cd670787-8e50-427d-9b14-cb1176408238`
- seed candidate `78bfe712-6b2f-47a2-b939-63aa7c50a352`
- seed event `d33801c3-7588-44f3-ac1b-54f804b05c7f`
- seed approved `a8165f12-744d-4688-bc2f-1da4f020e574`
- correction candidate `bcb243e9-b719-4dc0-9251-5f06f5cdf47a`
- correction event `a6fdc861-533f-496f-a6b9-b192694b70e5`
- correction approved `af30323e-e07b-4d73-bcaf-e7007fd37f18`
- correction key `124fbc53383ab218856151bf9594c3fbb4190032bff55d4c35df74523afc91d0`
- subject key `06126db2618d50d281031a76394e1ae66e46f02ee8c258a8bf172bf66d354493`
- original approved became `superseded`
- supersedes link count `1`

Production cleanup:

- superseded object:
  - `af30323e-e07b-4d73-bcaf-e7007fd37f18`

### Validation run

- `pnpm test -- extensions/memory-middleware/src/response-style-semantic.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts -t "response-style|response style|generic response-style|generic response style"`
- isolated proof:
  - `pnpm memory:proof --plan /tmp/memory-proof-response-style-repair-isolated-v1.json --config /root/.openclaw-slice7-proof/openclaw.json --env-file /root/.openclaw-slice7-proof/.env --gateway-base-url http://127.0.0.1:37789 --out /tmp/memory-proof-response-style-repair-isolated-v1-report.json`
- production proof:
  - `pnpm memory:proof --plan /tmp/memory-proof-response-style-repair-production-v1.json --config /root/.openclaw/openclaw.json --env-file /root/.openclaw/.env --gateway-base-url http://127.0.0.1:28789 --out /tmp/memory-proof-response-style-repair-production-v1-report.json`
- production cleanup:
  - `pnpm memory:proof --plan /tmp/memory-proof-response-style-repair-production-cleanup-v1.json --config /root/.openclaw/openclaw.json --env-file /root/.openclaw/.env --gateway-base-url http://127.0.0.1:28789 --out /tmp/memory-proof-response-style-repair-production-cleanup-v1-report.json`

### Health and limits

- isolated `/healthz` and `/readyz` fetches failed
- production `/healthz` and `/readyz` were `200` before and after
- this slice did not broaden generic response-style subject coverage

## Slice 2 — bounded phrase-induction expansion

### Contract chosen

- direct scope:
  - response-style memory
- exact gap closed:
  - phrase induction was still workflow-only even though response-style memory
    now had stable approved bounded generic targets that fit the same
    reviewed whole-phrase artifact model
- exact behavior landed:
  - approved response-style memories can now seed reviewed
    `response_style_phrase_pattern` artifacts
  - the first novel anchored paraphrase enters `hold_for_more_evidence`
  - later compatible evidence can auto-promote that phrase pattern
  - approved response-style phrase patterns feed deterministic response-style
    capture back into the same family
- out of scope:
  - project-fact phrase induction
  - recurring-procedure phrase induction
  - project-rule or unmet-need phrase induction
  - generic semantic fallback

### Implementation chosen

- added response-style phrase-induction substrate with hidden reviewed
  artifact family:
  - `response_style_phrase_pattern`
- transcript capture and tool submit paths can now:
  - look up approved response-style phrase patterns deterministically
  - induce new held phrase-pattern candidates from approved response-style
    memories
- proof runner now inspects `response_style_phrase_pattern`
- hidden approved phrase artifacts remain out of normal approved retrieval

### Phrase proposal shape

- target family
- target template
- target key
- target subject key
- subject
- normalized subject
- value
- normalized value
- pattern key
- observed phrase
- normalized phrase
- guidance mode `guidance_only`

### Exact proof inputs

Isolated proof seed:

- target memory seed:
  - concise response-style guidance
- phrase observation:
  - `Please keep responses concise and short.`

Production proof:

- phrase observation against an existing approved concise response-style memory:
  - `Please keep responses concise and short.`

### Exact ids / evidence

Isolated proof:

- target key `653d0202bd8b0f94b0d4c3f036b4bff12fa70ea9a4fe7a37849ad9a57de3a2e5`
- target subject key `bcfdf4c2821c8195f16097c464a50da3a73dbd62055bd72cfd7f3d878c605815`
- phrase-pattern key `82115064bf9732a5e81729f4b48eb92bafe315eb85461b976b7ac557e29291f4`
- normalized phrase `please keep responses concise and short`
- seed candidate `af494cf2-ba39-47cd-9daf-ce4434e3d7b4`
- seed event `88b978d5-fb15-431e-b9bf-4e6fd4276bf6`
- seed approved response-style memory `5fd962c6-2790-455d-a311-91f501ed5eef`
- phrase candidate `f03e8c93-6c70-4b4c-ae56-c79b49279646`
- phrase event `5622e4d8-d752-489b-92cc-303b44d3235b`
- approved phrase artifact `4bbfbcbc-4ef8-48eb-8d6f-f2a9070dda92`
- deterministic lookup resolved the approved phrase artifact back to the
  concise target key

Production proof:

- existing approved concise response-style memory:
  - `253cebe2-06d4-462e-8477-9424e1e38322`
- held phrase candidate `67835670-e7d5-41d6-8439-74d8fc92b094`
- phrase event `e462e0db-fc1b-45ef-afee-581374bc713e`
- reject review `abfcf6fb-0480-4709-8a86-3c37025e6e71`
- approved phrase-pattern count for that pattern key remained `0`

### Validation run

- `pnpm test -- extensions/memory-middleware/src/response-style-semantic.test.ts extensions/memory-middleware/src/response-style-phrase-induction.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts extensions/memory-middleware/src/proof-runner.test.ts -t "response-style|response style|phrase pattern|proof-runner|generic response-style|generic response style"`
- isolated proof seed:
  - `pnpm memory:proof --plan /tmp/memory-proof-response-style-phrase-isolated-seed.json --config /root/.openclaw-slice7-proof/openclaw.json --env-file /root/.openclaw-slice7-proof/.env --gateway-base-url http://127.0.0.1:37789 --out /tmp/memory-proof-response-style-phrase-isolated-seed-report.json`
- isolated proof approve:
  - `pnpm memory:proof --plan /tmp/memory-proof-response-style-phrase-isolated-approve.json --config /root/.openclaw-slice7-proof/openclaw.json --env-file /root/.openclaw-slice7-proof/.env --gateway-base-url http://127.0.0.1:37789 --out /tmp/memory-proof-response-style-phrase-isolated-approve-report.json`
- production proof:
  - `pnpm memory:proof --plan /tmp/memory-proof-response-style-phrase-production-hold-reject.json --config /root/.openclaw/openclaw.json --env-file /root/.openclaw/.env --gateway-base-url http://127.0.0.1:28789 --out /tmp/memory-proof-response-style-phrase-production-hold-reject-report.json`

### Health and limits

- isolated `/healthz` and `/readyz` fetches failed
- production `/healthz` and `/readyz` were `200` before and after
- project-fact phrase induction remains intentionally not live because the
  current reviewed whole-phrase artifact model is not a good fit for
  value-bearing fact aliases

## Slice 3 — remaining generic-envelope parity closeout

### Contract chosen

- direct scope:
  - response-style memory
- exact gap closed:
  - response style still had the weakest remaining bounded generic envelope
    after the first parity tranche and after slices 1 and 2
- exact behavior landed:
  - bounded generic response-style guidance now also supports:
    - `response detail level`
    - `response wrap up`
  - durable parsing now accepts `By default, ...`
  - hyphenated forms such as `high-level` and `wrap-up` normalize correctly
  - false positives around non-style project-detail and next-steps planning
    language are rejected
- out of scope:
  - broad personality modeling
  - generic semantic fallback
  - project-fact taxonomy expansion
  - autonomous action-taking

### Implementation chosen

- expanded bounded generic response-style subject detection with:
  - `response detail level`
  - `response wrap up`
- tightened normalization for:
  - `high-level`
  - `top-level`
  - `wrap-up`
- broadened durable-prefix parsing to accept:
  - `By default, ...`
- fixed an older false-positive scorer issue so `unless I ask` does not hit
  the no-tables fast path without an actual table term

### Exact proof inputs

Isolated proof:

- hold:
  - `By default, keep explanations high level unless I ask for more detail.`
- approve:
  - repeated compatible evidence for the same detail-level guidance

Production proof:

- hold:
  - `By default, keep explanations high level unless I ask for more detail.`

### Exact ids / evidence

Isolated proof:

- key `c48c616df45b79e9343944293babe064ef8e3aa8c02c6417b763d1982572aaee`
- subject key `796af96a23880084418f17602b33294cee2bedb1d9fc0c85fcd4ec8e972507aa`
- candidate `948ec47c-9d7d-44df-9cab-5fcef3648b3d`
- event `a1df07f4-5ba8-4814-a383-ec812d3e3a33`
- lifecycle state `hold_for_more_evidence`
- approved object `3932db05-f363-45eb-8a25-b7952ef74139`

Production proof:

- held candidate `a38b3506-50e8-422e-834e-05be6794da8e`
- event `7799fe27-6d85-43f3-8e69-89c8b7b354fc`
- reject review `ce85ceab-d905-4fef-badd-6f8e267048f9`
- active production subject count for `response detail level` remained `0`

### Validation run

- `pnpm test -- extensions/memory-middleware/src/response-style-semantic.test.ts -t "response-style|response style|detail level|wrap up|wrap-up|generic response-style|generic response style"`
- `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "generic response-style detail guidance|response-style detail guidance"`
- isolated hold proof:
  - `pnpm memory:proof --plan /tmp/memory-proof-response-style-detail-isolated-hold.json --config /root/.openclaw-slice7-proof/openclaw.json --env-file /root/.openclaw-slice7-proof/.env --gateway-base-url http://127.0.0.1:37789 --out /tmp/memory-proof-response-style-detail-isolated-hold-report.json`
- isolated approve proof:
  - `pnpm memory:proof --plan /tmp/memory-proof-response-style-detail-isolated-approve.json --config /root/.openclaw-slice7-proof/openclaw.json --env-file /root/.openclaw-slice7-proof/.env --gateway-base-url http://127.0.0.1:37789 --out /tmp/memory-proof-response-style-detail-isolated-approve-report.json`
- production proof:
  - `pnpm memory:proof --plan /tmp/memory-proof-response-style-detail-production-hold-reject.json --config /root/.openclaw/openclaw.json --env-file /root/.openclaw/.env --gateway-base-url http://127.0.0.1:28789 --out /tmp/memory-proof-response-style-detail-production-hold-reject-report.json`

### Health and limits

- isolated `/healthz` and `/readyz` fetches failed
- production `/healthz` and `/readyz` were `200` before and after
- response-style memory remains intentionally bounded and is still not broad
  personality memory

## Final validations run across the batch

- consolidated targeted unit sweep:
  - `pnpm test -- extensions/memory-middleware/src/response-style-semantic.test.ts extensions/memory-middleware/src/response-style-phrase-induction.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts extensions/memory-middleware/src/proof-runner.test.ts -t "response-style|response style|phrase pattern|proof-runner|generic response-style|generic response style|detail level|wrap up|wrap-up"`
- consolidated targeted integration sweep:
  - `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "response-style|response style|generic response-style|generic response style|detail guidance|phrase pattern"`
- follow-up targeted rerun after the final local type fixes:
  - `pnpm test -- extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts -t "response-style|response style|phrase pattern|generic response-style|generic response style"`
- repo gate:
  - `pnpm check`
- post-report doc-safe rerun:
  - `pnpm check:fast`
- build gate:
  - `pnpm build`
- whitespace gate:
  - `git diff --check`

Final gate outcome:

- targeted tests passed
- targeted integration tests passed in the serial profile
- `pnpm check` passed after two local type fixes in:
- `pnpm check:fast` passed again after the combined report was added
- `pnpm check` passed after two local type fixes in:
  - `extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts`
  - `extensions/memory-middleware/src/tools/candidate-submit.ts`
- `pnpm build` passed
- `git diff --check` passed

## Remaining limits after the batch

- reduced-profile self-improving capture is still disabled and candidate-only
- learned-guidance advisory planning is still not live
- cross-domain family expansion is still not started
- phrase induction still remains intentionally absent for project facts,
  recurring procedures, project rules, and unmet needs
- the six families are now much closer to practical parity, but they remain
  intentionally bounded rather than identical in every capability detail

## Next roadmap step

The next roadmap step after this batch is:

- reduced-profile self-improving capture integration
