# Production Response-Style Parity V1 Report

## Scope

This report covers the third existing-family parity tranche:

- bounded generic response-style guidance beyond the older supported
  response-style templates
- first-evidence `hold_for_more_evidence` reuse on the response-style
  lifecycle seam
- later confirmation promotion through the existing response-style candidate
  review + memory promotion substrate
- approved-only hybrid retrieval boosts for normalized generic
  response-style subject and value overlap
- explicit no-write proof for ambiguous non-durable nearby phrasing

Out of scope:

- self-improving capture
- learned-guidance advisory planning
- generic semantic fallback for response-style memory
- phrase induction for response-style memory
- broad personality modeling

## Implemented contract

- the older supported response-style templates remain the precision fast path
- a new bounded `response_style_generalized_guidance` lane now accepts
  explicit durable guidance for:
  - `response opening`
  - `response structure`
  - `response tone`
- first generic evidence enters `hold_for_more_evidence`
- later compatible evidence can promote the held generic response-style
  candidate into approved feedback memory
- approved-only hybrid retrieval now boosts normalized generic response-style
  subject and value overlap
- transcript-driven generic correction remains conservative in this tranche
  and still holds for later confirming evidence instead of immediately
  superseding on first mention

## Validation run

- `pnpm test -- extensions/memory-middleware/src/response-style-semantic.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "response-style|response style|generic response-style|generic response style"`
- `pnpm check`
- `pnpm build`
- `git diff --check`

## Isolated proof

Proof config:

- `configPath = /root/.openclaw-slice7-proof/openclaw.json`
- `envFilePath = /root/.openclaw-slice7-proof/.env`
- `gatewayBaseUrl = http://127.0.0.1:37789`

Health:

- before and after:
  - `/healthz` -> `fetch failed`
  - `/readyz` -> `fetch failed`

### Hold

Transcript:

```text
For future replies, lead with the recommendation upfront.
```

Captured evidence:

- candidate id: `d6e1f400-b66a-49a6-93a6-bac611247771`
- event id: `afdb90ad-fff5-4afc-941b-89e9d0f383ea`
- key: `c9007bee2ac1a4d8e110a05d8f5aa7555df6ca41064dead591d5965bbce82191`
- subject key: `363daa6948a760ca3bc9989447ffdcbd92f86716003bd37e69da42f5c98f2ddc`
- normalized subject: `response opening`
- normalized value: `start with the recommendation upfront`
- response-style family: `generalized_guidance`
- lifecycle state: `hold_for_more_evidence`

### No-write ambiguity

Transcript:

```text
This answer felt rushed today.
```

Result:

- `ignored = true`
- no candidate id
- no durable write

### Confirmation promotion

Confirming transcript:

```text
Please remember to lead with the recommendation upfront.
```

Promotion evidence:

- held candidate promoted from: `d6e1f400-b66a-49a6-93a6-bac611247771`
- approved object id: `e266162f-2ef1-4f93-a2a1-27be555e4e8d`
- review id: `77b793d6-892d-40b6-b92c-a67743f0d75f`
- promotion profile: `response_style_confirmation_v1`
- confirmation method: `repeat_subject_signal`

### Retrieval

Hybrid query:

```text
response opening lead with the recommendation upfront
```

Retrieval evidence:

- top record id: `e266162f-2ef1-4f93-a2a1-27be555e4e8d`
- matched fields:
  - `response_style_subject_match`
  - `trigram_similarity`

### Correction limitation observed

Correction transcript:

```text
Actually, start with the direct answer first.
```

Observed behavior:

- correction candidate id: `cfe488b6-b4d4-42be-8c36-e476cb35e4dd`
- correction event id: `ba6b9588-70ac-468e-94ed-a6299901a000`
- correction key: `cfadc061b1e14cf6bece2149a8093a08da938472eb84896bc67a29845413c23a`
- transcript-driven generic correction entered `hold_for_more_evidence`
  instead of immediately superseding on first mention
- the previously approved object remained the approved retrieval result

## Production proof

Gateway:

- `gatewayBaseUrl = http://127.0.0.1:28789`

Health:

- before hold:
  - `/healthz` -> `200 {"ok":true,"status":"live"}`
  - `/readyz` -> `200 {"ready":true}`
- after confirmation:
  - `/healthz` -> `200 {"ok":true,"status":"live"}`
  - `/readyz` -> `200 {"ready":true}`

Production attribution:

- `projectId = 437d43ff-1c9d-4757-8d44-cd8e0aeb241b`
- `agentId = 9d8f2956-a081-4135-be61-8fe7f2fe8070`
- `sessionId = cd670787-8e50-427d-9b14-cb1176408238`

### Hold

Transcript:

```text
For future replies, start with the direct answer first.
```

Captured evidence:

- candidate id: `494e94f3-69f4-435a-a1cd-779590c67a21`
- event id: `2bfdabb4-0041-49f3-bd7c-512a569e7cf2`
- key: `2de5d47ac8e3df3927bf215d6d865734e1abb0fd14fd42bf9d3c39ec8a18eea5`
- subject key: `363daa6948a760ca3bc9989447ffdcbd92f86716003bd37e69da42f5c98f2ddc`
- normalized subject: `response opening`
- normalized value: `start with the direct answer first`
- response-style family: `generalized_guidance`
- lifecycle state: `hold_for_more_evidence`

### Confirmation and retrieval

Confirming transcript:

```text
Please remember to start with the direct answer first.
```

Hybrid query:

```text
response opening start with the direct answer first
```

Production evidence:

- held candidate promoted from: `494e94f3-69f4-435a-a1cd-779590c67a21`
- approved object id: `f54bf0a4-9e47-41c4-b9be-3de5323ea1f6`
- review id: `2b9170ca-7b24-4b39-9ee3-c798482f5632`
- promotion profile: `response_style_confirmation_v1`
- confirmation method: `repeat_subject_signal`
- top retrieval record id: `f54bf0a4-9e47-41c4-b9be-3de5323ea1f6`
- matched fields:
  - `response_style_subject_match`
  - `response_style_value_match`
  - `trigram_similarity`

## What this proved

- response-style memory is no longer limited to the older fixed supported
  template list
- the first bounded generic response-style lane now reuses the same held
  lifecycle substrate already proven for generic project facts and generic
  recurring procedures
- later approved retrieval can use normalized generic response-style subject
  and value overlap inside the normal approved-only hybrid path
- the ambiguity guard still suppresses nearby weak non-durable phrasing
- the slice stayed bounded and did not broaden into generic semantic fallback,
  self-improving capture, or advisory planning

## Remaining limits

- the generic response-style lane is still intentionally limited to response
  opening, response structure, and response tone
- transcript-driven generic correction remains conservative and still waits
  for later confirming evidence instead of immediately superseding on first
  mention
- phrase induction is not live for response-style memory
- response-style memory is still not a broader personality or audience-model
  system
