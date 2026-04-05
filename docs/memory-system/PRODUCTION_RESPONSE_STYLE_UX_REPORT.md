# Production Response-Style Semantic UX Report

## Purpose

This report records the first user-experience-focused memory slice after the
quick-win governance tranche.

The goal of this slice was to make remembered response-style behavior feel
materially better to a normal user without broadening into a generic fuzzy
memory writer.

This slice was intentionally limited to:

- user correction
- durable response-style preference / requirement

Supported response-style subjects in this slice:

- plain English / avoid jargon
- bullet points
- concise replies
- numbered steps when giving instructions
- no tables unless asked

## Rollout date

- `2026-04-05`

## Exact runtime targets

Production runtime:

- Compose project: `openclaw-upgrade-2026324`
- container: `openclaw`
- image before redeploy:
  - `openclaw:local@sha256:0473cadc9ab913482ef8c5cd5a9b6ba11707f030b106437d87d1d38ee42be376`
- image after redeploy:
  - `openclaw:local@sha256:1a25caf41f3fa206e69516c2e1afcf7d527bd6bae9e73eaeaef8e6bcd22cd49a`
- rollback tag:
  - `openclaw:pre-response-style-ux-20260405T163121Z`
- gateway health endpoint:
  - `http://127.0.0.1:28789/healthz`

Isolated proof runtime:

- container: `openclaw-slice7-proof`
- image: `openclaw:slice7-proof-local`
- gateway health endpoint:
  - `http://127.0.0.1:37789/healthz`

## Acceptance target used

This slice was accepted only if it proved all of the following for the
supported response-style subjects:

- natural response-style phrasing works beyond the old exact-phrase posture
- semantic detection stays bounded to the approved response-style subject set
- high-confidence low-risk turns can still become approved memory
- medium-confidence turns create pending-confirmation candidates instead of
  dead manual-review backlog
- later confirming evidence can auto-promote those pending candidates without
  manual review
- weak ambiguous turns are ignored rather than creating memory trash
- later replies can consume approved response-style memory more consistently
- users can conversationally repair or forget supported response-style memory
- duplicate suppression and seam attribution remain explainable

What remains intentionally out of scope after this slice:

- phrase induction as live production behavior
- broader semantic learning-event detection outside response-style subjects
- recurring procedure memory as a user-facing semantic feature
- workflow-improvement / tool-gotcha memory
- broader project-memory expansion
- unmet-need / recommendation planning
- self-improving capture enablement
- UI memory inspection / browser surfaces

## Live posture before this slice

Before this slice:

- deterministic bounded matching still carried too much of the response-style
  front end
- bounded response-style auto-promotion already existed for a narrow set of
  exact or near-exact forms
- overlap-aware retrieval ranking already existed for approved
  response-style memories
- correction supersede already existed in bounded form
- the current canonical seam remained:
  - `model_tool_primary`
- `transcript_subscriber_fallback` remained a bounded assist path, not the
  canonical seam

The missing product behavior was:

- natural messy response-style phrasing
- explicit candidate confirmation without manual review
- targetable conversational forget for supported response-style subjects
- a checked-in messy-language eval gate for this family

## Exact bounded surfaces used

Semantic ordinary-turn path:

- `createOrdinaryTurnAutoCaptureHandler`
- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`

Tool path:

- `memory_candidate_submit`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`

Behavior application and retrieval path:

- `extensions/memory-core/src/prompt-section.ts`
- approved-memory hybrid retrieval in
  `extensions/memory-middleware/src/db/queries.ts`

Lifecycle and repair helpers:

- `extensions/memory-middleware/src/response-style-semantic.ts`
- `extensions/memory-middleware/src/response-style-lifecycle.ts`

## Isolated proof validation

Proof run id:

- `response-style-ux-proof-2026-04-05T16:24:57.625Z`

The isolated proof used the bounded current-slice code against the isolated
proof DB and covered both the tool seam and transcript seam.

### Tool-seam proof

Turn:

- `No, use bullet points for me.`

Observed ids:

- event id:
  - `1274679e-9c1a-4129-a1c4-31954aec5d04`
- approved memory object id:
  - `eea1caaf-139f-4748-8b62-8266fc9542b3`

Observed rows for the same source event:

- candidate row:
  - `eeefe460-1eda-4f13-a183-0ada34ec01b4`
- approved row:
  - `eea1caaf-139f-4748-8b62-8266fc9542b3`

Observed outcome:

- the bounded correction landed as:
  - `status = accepted`
  - `kind = correction`
  - `reviewState = approved`
- duplicate capture did not produce a second unrelated durable write

### Transcript-seam proof

Turns used:

- `plz keep it short`
- `i meant plain english not jargon`
- `when giving instructions use numbered steps`
- `please no tables unless asked`
- `can you use bullets`
- `use bullets when listing`
- `we should add bullets to the changelog generator`
- `forget the table preference`

Observed bounded write counts:

- before:
  - `memory_events = 0`
  - `memory_objects = 0`
  - `memory_reviews = 0`
- after initial natural-turn capture:
  - `memory_events = 5`
  - `memory_objects = 9`
  - `memory_reviews = 4`
- after confirmation, ambiguity, and forget handling:
  - `memory_events = 5`
  - `memory_objects = 10`
  - `memory_reviews = 7`

Observed accepted approved rows:

- concise:
  - candidate `026372de-f954-4601-b1fc-a2feec6072c5`
  - approved `4daab62c-2709-4e27-a306-6a3212aaf508`
- plain English:
  - candidate `fb4b4936-43df-49ce-af5f-1e1e1b68326b`
  - approved `e000f1ba-2983-435b-89a7-91d4a1a1c66c`
- numbered steps:
  - candidate `90d70db1-3c68-47bf-b2f2-f50006a8314c`
  - approved `b7f7c0eb-64dd-4259-8beb-81f7b75cfa8d`

Observed candidate-confirmation proof:

- initial medium-confidence bullet turn:
  - `can you use bullets`
- later confirming turn:
  - `use bullets when listing`
- candidate row:
  - `ea21a5f5-3340-46b1-b1d4-517b1050b6b4`
- approved row:
  - `8cf705fe-ae41-4ba6-af2a-fcf4d596b9cf`
- source event id:
  - `f601e9c7-5e35-40ff-a662-60efc462bcbd`
- approved row metadata proved:
  - `promotionProfile = response_style_confirmation_v1`
  - `confirmationState = confirmed`

Observed lifecycle inspection:

- `matchingApprovedObjectId = 8cf705fe-ae41-4ba6-af2a-fcf4d596b9cf`
- pending candidate remained traceable as:
  - `ea21a5f5-3340-46b1-b1d4-517b1050b6b4`
- pending lifecycle metadata showed:
  - `confirmationState = pending_confirmation`
  - bounded `expiresAt`

Observed conversational forget proof:

- forget turn:
  - `forget the table preference`
- pending candidate row rejected:
  - `76468a78-dc1e-44dd-be36-dde0ffc85240`
- approved row superseded:
  - `e312883e-51d2-4709-9459-52ad2f797e6d`

Observed ambiguity / no-trash proof:

- ambiguous turn:
  - `we should add bullets to the changelog generator`
- semantic decision:
  - `action = ignore`
  - `reason = weak_or_ambiguous`
  - `evidence = [bullet_token]`
- no additional `memory_events`, `memory_objects`, or `memory_reviews` growth
  occurred for that turn

### Behavior-application proof

Observed approved templates:

- `8cf705fe-ae41-4ba6-af2a-fcf4d596b9cf`
  - `use bullet points when listing items`
- `b7f7c0eb-64dd-4259-8beb-81f7b75cfa8d`
  - `use numbered steps when giving instructions`
- `e000f1ba-2983-435b-89a7-91d4a1a1c66c`
  - `use plain English`
- `4daab62c-2709-4e27-a306-6a3212aaf508`
  - `keep responses concise`

Observed hybrid retrieval proof:

- query:
  - `numbered steps when giving instructions response format preference`
- top result id:
  - `b7f7c0eb-64dd-4259-8beb-81f7b75cfa8d`
- read surface:
  - `approved_memory_view`
- matched fields:
  - `auto_capture_template_match`
  - `trigram_similarity`
- score:
  - `156.50000095367432`

This proved the most relevant overlapping approved response-style memory could
still win cleanly in retrieval after the semantic capture changes.

## Narrow production proof

Production proof run id:

- `response-style-ux-prod-2026-04-05T16:38:19.403Z`

Pre-proof health:

- `GET /healthz -> {"ok":true,"status":"live"}`
- container health:
  - `healthy`

The production proof was intentionally narrow and cleanup-backed.

It used the current response-style slice code against the live production
config and DB after the bounded redeploy because the transcript subscriber
path is not exposed as a standalone operator tool surface.

Production proof turns:

- candidate turn:
  - `can you use bullets`
- ambiguous turn:
  - `we should add bullets to the changelog generator`

Seeded production context:

- project id:
  - `a3eddcc3-58cb-412f-a19b-ddc1cc20c65e`
- agent id:
  - `f275b481-e49b-4a83-8c2a-8896d2848036`
- session id:
  - `7a2ce36a-ed01-4b80-9364-bc4d27487c61`

Observed bounded production counts:

- before:
  - `memory_events = 70`
  - `memory_objects = 78`
  - `memory_reviews = 32`
- after candidate turn:
  - `memory_events = 71`
  - `memory_objects = 79`
  - `memory_reviews = 32`
- after ambiguous turn:
  - `memory_events = 71`
  - `memory_objects = 79`
  - `memory_reviews = 32`

Observed pending candidate row:

- row id:
  - `cfe86364-440a-44f5-8dab-97d7004cbb1f`
- source event id:
  - `208cd978-c7f7-4b1f-ac92-98cece6824f8`
- final review state after cleanup:
  - `rejected`
- lifecycle metadata before cleanup proved:
  - `state = pending_confirmation`
  - `family = response_style`
  - `confidence = medium`
  - `evidence = [bullet_token, directive_token]`
  - `evidenceCount = 1`
  - bounded `expiresAt = 2026-04-08T16:20:00.000Z`

Observed cleanup review:

- review id:
  - `11abf604-e12e-4d4a-b1bf-c20ea9980f3c`
- outcome:
  - `rejected`
- `memoryObjectStateChanged = true`

Observed ambiguity / no-trash evidence:

- the ambiguous production turn created no additional writes after the pending
  candidate turn

Observed approved-only retrieval after cleanup:

- `memory_object_list(scope = approved_only)` for the seeded production
  project returned:
  - `records = []`

Post-proof health:

- `GET /healthz -> {"ok":true,"status":"live"}`
- container health:
  - `healthy`

## Accepted production status

This slice is now accepted for its intended scope as:

- bounded semantic response-style capture for the supported subject family
- bounded candidate-with-confirmation lifecycle for medium-confidence
  response-style turns
- bounded conversational repair and targetable forget for supported
  response-style subjects
- improved approved-memory retrieval/application behavior for overlapping
  response-style memories
- checked-in messy-language eval coverage for the supported family

This does not mean:

- a generic semantic memory writer exists
- all semantic learning-event families are live
- phrase induction is live
- candidates broadly influence behavior before approval

## Rollback / disablement note

Preferred rollback posture remains narrow and behavioral rather than schema
rollback.

If this slice must be disabled specifically:

1. redeploy the previous production image:
   - `openclaw:pre-response-style-ux-20260405T163121Z`
2. or revert the response-style semantic ordinary-turn and tool handling code
   and redeploy

Operationally, a narrow disablement should remove:

- semantic response-style detection and candidate confirmation
- response-style conversational forget handling for this slice

while preserving:

- the already-proven governance family
- the existing bounded deterministic memory posture
- current production pairing/auth and protection posture
