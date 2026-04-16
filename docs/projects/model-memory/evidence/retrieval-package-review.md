# Model Memory Retrieval Package Review

- Generated at: 2026-04-15T11:20:42.673Z
- Current corpus: true
- Model: openrouter/openai/gpt-5.4-nano
- Timeout ms: 180000
- Seed: 7
- Probe ids: probe-live-tests, probe-gateway-protocol, probe-planning-guidance, probe-schema-reference
- Verdict counts: {"mostly_same_value_as_deterministic":4}
- Model adds material value beyond deterministic search: false
- Model steering eligible for cutover: true

## probe-live-tests

- Query: How do I run live tests in OpenClaw?
- Request purpose: operator_help
- Verdict: mostly_same_value_as_deterministic
- Rationale: same_ranked_ids, accepted_signal=5
- Model action: retrieve
- Lexical accepted counts: {"matchingKinds":4,"matchingClasses":1}
- Model accepted counts: {"matchingKinds":4,"matchingClasses":1}
- Lexical request: {"goal":"How do I run live tests in OpenClaw?","canonicalClasses":[],"scopeConstraints":{},"subjectHints":["live","tests","openclaw"],"contentHints":["live","tests","openclaw"],"desiredResultCount":5,"requestConfidence":"weak"}
- Model request: {"goal":"How do I run live tests in OpenClaw?","canonicalClasses":[],"scopeConstraints":{},"subjectHints":["live","tests","openclaw"],"contentHints":["live","tests","openclaw"],"desiredResultCount":5,"requestConfidence":"weak"}
- Provider trace: status=200 stage=success resolvedModel=openai/gpt-5.4-nano-20260317
- Lexical baseline results:
- 720e59c5-849b-5da1-a671-074350d79740 | project/fact | score=35 | payload=Live tests discover credentials the same way the CLI does.: If the CLI works, live tests should find the same keys; if a live test says “no creds”, debug the same way you would for `openclaw models list` / model selection. | reasons=subject_match,text_match
- e36a1ea2-ea96-5782-87c4-bc2a7f1f1fa8 | project/rule | score=35 | payload=Do not commit credentials; live tests discover credentials via CLI/credential discovery using profile store and config path/env var. | Do not commit credentials. | Ensure live tests can discover credentials via the CLI/credential discovery using `~/.openclaw/credentials/` and config at `~/.openclaw/openclaw.json` or `OPENCLAW_CONFIG_PATH`. | reasons=subject_match,text_match
- 1360e9b9-0ec3-5459-9c9c-54dac3696bf5 | project/rule | score=30 | payload=Live tests stability and cost expectations | Prefer running narrowed subsets instead of “everything”, because live tests are not CI-stable by design and use real networks/provider policies/quotas/outages and rate limits. | Avoid relying on live tests as CI-stable; avoid running the full live suite when you only need a focused check. | reasons=subject_match,text_match
- 2f29bdd0-8ac0-5c0b-88ad-8f2f7fb87766 | feedback/rule | score=30 | payload=Do not commit or publish real phone numbers, videos, or live configuration values; use obviously fake placeholders in docs/tests/examples. | Use obviously fake placeholders in docs, tests, and examples rather than real phone numbers, videos, or live configuration values. | reasons=subject_match,text_match
- 3b80ba32-b3df-58a6-b3a0-f1a620227b4d | project/rule | score=30 | payload=For live gateway smoke, run pnpm test:live on src/gateway/gateway-models.profiles.live.test.ts with OPENCLAW_LIVE_GATEWAY_MODELS specifying a targeted model matrix (tools + at least one image-capable model). | Run `pnpm test:live src/gateway/gateway-models.profiles.live.test.ts` with `OPENCLAW_LIVE_GATEWAY_MODELS` set to a targeted model matrix that includes tools coverage and at least one image-capable model. | reasons=subject_match,text_match
- Model-shaped results:
- 720e59c5-849b-5da1-a671-074350d79740 | project/fact | score=35 | payload=Live tests discover credentials the same way the CLI does.: If the CLI works, live tests should find the same keys; if a live test says “no creds”, debug the same way you would for `openclaw models list` / model selection. | reasons=subject_match,text_match
- e36a1ea2-ea96-5782-87c4-bc2a7f1f1fa8 | project/rule | score=35 | payload=Do not commit credentials; live tests discover credentials via CLI/credential discovery using profile store and config path/env var. | Do not commit credentials. | Ensure live tests can discover credentials via the CLI/credential discovery using `~/.openclaw/credentials/` and config at `~/.openclaw/openclaw.json` or `OPENCLAW_CONFIG_PATH`. | reasons=subject_match,text_match
- 1360e9b9-0ec3-5459-9c9c-54dac3696bf5 | project/rule | score=30 | payload=Live tests stability and cost expectations | Prefer running narrowed subsets instead of “everything”, because live tests are not CI-stable by design and use real networks/provider policies/quotas/outages and rate limits. | Avoid relying on live tests as CI-stable; avoid running the full live suite when you only need a focused check. | reasons=subject_match,text_match
- 2f29bdd0-8ac0-5c0b-88ad-8f2f7fb87766 | feedback/rule | score=30 | payload=Do not commit or publish real phone numbers, videos, or live configuration values; use obviously fake placeholders in docs/tests/examples. | Use obviously fake placeholders in docs, tests, and examples rather than real phone numbers, videos, or live configuration values. | reasons=subject_match,text_match
- 3b80ba32-b3df-58a6-b3a0-f1a620227b4d | project/rule | score=30 | payload=For live gateway smoke, run pnpm test:live on src/gateway/gateway-models.profiles.live.test.ts with OPENCLAW_LIVE_GATEWAY_MODELS specifying a targeted model matrix (tools + at least one image-capable model). | Run `pnpm test:live src/gateway/gateway-models.profiles.live.test.ts` with `OPENCLAW_LIVE_GATEWAY_MODELS` set to a targeted model matrix that includes tools coverage and at least one image-capable model. | reasons=subject_match,text_match

```text
Retrieval for operator_help: How do I run live tests in OpenClaw?
1. project/fact {"value":"If the CLI works, live tests should find the same keys; if a live test says “no creds”, debug the same way you would for `openclaw models list` / model selection.","subject":"Live tests discover credentials the same way the CLI does."} [primary]
2. project/rule {"subject":"Do not commit credentials; live tests discover credentials via CLI/credential discovery using profile store and config path/env var.","avoidAction":"Do not commit credentials.","neededCapability":"Ensure live tests can discover credentials via the CLI/credential discovery using `~/.openclaw/credentials/` and config at `~/.openclaw/openclaw.json` or `OPENCLAW_CONFIG_PATH`."} [primary]
3. project/rule {"subject":"Live tests stability and cost expectations","avoidAction":"Avoid relying on live tests as CI-stable; avoid running the full live suite when you only need a focused check.","recommendedAction":"Prefer running narrowed subsets instead of “everything”, because live tests are not CI-stable by design and use real networks/provider policies/quotas/outages and rate limits."} [primary]
4. feedback/rule {"subject":"Do not commit or publish real phone numbers, videos, or live configuration values; use obviously fake placeholders in docs/tests/examples.","recommendedAction":"Use obviously fake placeholders in docs, tests, and examples rather than real phone numbers, videos, or live configuration values."} [secondary]
5. project/rule {"subject":"For live gateway smoke, run pnpm test:live on src/gateway/gateway-models.profiles.live.test.ts with OPENCLAW_LIVE_GATEWAY_MODELS specifying a targeted model matrix (tools + at least one image-capable model).","recommendedAction":"Run `pnpm test:live src/gateway/gateway-models.profiles.live.test.ts` with `OPENCLAW_LIVE_GATEWAY_MODELS` set to a targeted model matrix that includes tools coverage and at least one image-capable model."} [secondary]
```

## probe-gateway-protocol

- Query: What should I consult for gateway protocol contracts?
- Request purpose: reference_lookup
- Verdict: mostly_same_value_as_deterministic
- Rationale: same_ranked_ids, accepted_signal=8
- Model action: retrieve
- Lexical accepted counts: {"matchingKinds":4,"matchingClasses":4}
- Model accepted counts: {"matchingKinds":4,"matchingClasses":4}
- Lexical request: {"goal":"What should I consult for gateway protocol contracts?","canonicalClasses":[],"scopeConstraints":{},"subjectHints":["gateway","protocol","contracts"],"contentHints":["gateway","protocol","contracts"],"desiredResultCount":5,"requestConfidence":"weak"}
- Model request: {"goal":"Consult gateway protocol contracts","canonicalClasses":[],"scopeConstraints":{},"subjectHints":["gateway","protocol","contracts"],"contentHints":["gateway","protocol","contracts"],"desiredResultCount":5,"requestConfidence":"weak"}
- Provider trace: status=200 stage=success resolvedModel=openai/gpt-5.4-nano-20260317
- Lexical baseline results:
- a4e506b7-fe65-54b2-9782-8e413f495aa5 | project/rule | score=20 | payload=Side-effecting Gateway WS methods | Use idempotency keys for side-effecting methods. | Idempotency key support as defined by the Gateway protocol schema. | reasons=subject_match,text_match
- 0387b626-495c-59b4-be5c-c7b0a4d10950 | project/rule | score=15 | payload=Gateway configuration strict validation | Refuse to start when the configuration does not fully match the schema, except allow $schema at the root as a string for JSON Schema metadata. | Do not start the Gateway when unknown keys, malformed types, or invalid values are present. | reasons=subject_match,text_match
- 04b21af3-0961-5549-a76f-9cb328e26a00 | project/rule | score=15 | payload=Gateway WebSocket handshake error code 1008 | Do not send anything other than a `connect` frame as the first WebSocket message; do not open the Gateway WS port using a normal browser (HTTP URL). | Use the correct WS URL (`ws://<host>:18789` or `wss://...`) and include the token/password in the `connect` frame when auth is enabled. | reasons=subject_match,text_match
- 078d7c86-2bc9-5991-97f9-ca7e9d855cc4 | project/fact | score=15 | payload=Bridge protocol: The Bridge protocol is a legacy TCP JSONL transport and current builds do not ship a TCP bridge listener. | reasons=subject_match,text_match
- 0bebe1b9-615f-522b-ac7e-4f55df479c29 | user/preference | score=15 | payload=Live gateway model matrix | For the live gateway model matrix, include at least one tool-calling capable model per provider family and optionally add more tool models for extra coverage. | Include tool-calling models per provider family in OPENCLAW_LIVE_GATEWAY_MODELS. | reasons=subject_match,text_match
- Model-shaped results:
- a4e506b7-fe65-54b2-9782-8e413f495aa5 | project/rule | score=20 | payload=Side-effecting Gateway WS methods | Use idempotency keys for side-effecting methods. | Idempotency key support as defined by the Gateway protocol schema. | reasons=subject_match,text_match
- 0387b626-495c-59b4-be5c-c7b0a4d10950 | project/rule | score=15 | payload=Gateway configuration strict validation | Refuse to start when the configuration does not fully match the schema, except allow $schema at the root as a string for JSON Schema metadata. | Do not start the Gateway when unknown keys, malformed types, or invalid values are present. | reasons=subject_match,text_match
- 04b21af3-0961-5549-a76f-9cb328e26a00 | project/rule | score=15 | payload=Gateway WebSocket handshake error code 1008 | Do not send anything other than a `connect` frame as the first WebSocket message; do not open the Gateway WS port using a normal browser (HTTP URL). | Use the correct WS URL (`ws://<host>:18789` or `wss://...`) and include the token/password in the `connect` frame when auth is enabled. | reasons=subject_match,text_match
- 078d7c86-2bc9-5991-97f9-ca7e9d855cc4 | project/fact | score=15 | payload=Bridge protocol: The Bridge protocol is a legacy TCP JSONL transport and current builds do not ship a TCP bridge listener. | reasons=subject_match,text_match
- 0bebe1b9-615f-522b-ac7e-4f55df479c29 | user/preference | score=15 | payload=Live gateway model matrix | For the live gateway model matrix, include at least one tool-calling capable model per provider family and optionally add more tool models for extra coverage. | Include tool-calling models per provider family in OPENCLAW_LIVE_GATEWAY_MODELS. | reasons=subject_match,text_match

```text
Retrieval for reference_lookup: What should I consult for gateway protocol contracts?
1. project/rule {"subject":"Side-effecting Gateway WS methods","neededCapability":"Idempotency key support as defined by the Gateway protocol schema.","recommendedAction":"Use idempotency keys for side-effecting methods."} [primary]
2. project/rule {"subject":"Gateway configuration strict validation","avoidAction":"Do not start the Gateway when unknown keys, malformed types, or invalid values are present.","recommendedAction":"Refuse to start when the configuration does not fully match the schema, except allow $schema at the root as a string for JSON Schema metadata."} [primary]
3. project/rule {"subject":"Gateway WebSocket handshake error code 1008","avoidAction":"Do not send anything other than a `connect` frame as the first WebSocket message; do not open the Gateway WS port using a normal browser (HTTP URL).","neededCapability":"Use the correct WS URL (`ws://<host>:18789` or `wss://...`) and include the token/password in the `connect` frame when auth is enabled."} [primary]
4. project/fact {"value":"The Bridge protocol is a legacy TCP JSONL transport and current builds do not ship a TCP bridge listener.","subject":"Bridge protocol"} [secondary]
5. user/preference {"subject":"Live gateway model matrix","operation":"Include tool-calling models per provider family in OPENCLAW_LIVE_GATEWAY_MODELS.","instruction":"For the live gateway model matrix, include at least one tool-calling capable model per provider family and optionally add more tool models for extra coverage."} [secondary]
```

## probe-planning-guidance

- Query: What should I read before planning or roadmap work?
- Request purpose: workflow_guidance
- Verdict: mostly_same_value_as_deterministic
- Rationale: same_ranked_ids, accepted_signal=7
- Model action: retrieve
- Lexical accepted counts: {"matchingKinds":5,"matchingClasses":2}
- Model accepted counts: {"matchingKinds":5,"matchingClasses":2}
- Lexical request: {"goal":"What should I read before planning or roadmap work?","canonicalClasses":[],"scopeConstraints":{},"subjectHints":["read","planning","roadmap","work"],"contentHints":["read","planning","roadmap","work"],"desiredResultCount":5,"requestConfidence":"weak"}
- Model request: {"goal":"Identify recommended materials to read before planning or roadmap work.","canonicalClasses":[],"scopeConstraints":{},"subjectHints":["read","planning","roadmap","work"],"contentHints":["read","planning","roadmap","work"],"desiredResultCount":5,"requestConfidence":"weak"}
- Provider trace: status=200 stage=success resolvedModel=openai/gpt-5.4-nano-20260317
- Lexical baseline results:
- 0a6eebe9-b7e5-51de-92da-d724ba4f52b8 | user/rule | score=30 | payload=README (GitHub): keep absolute docs URLs (`https://docs.openclaw.ai/...`) so links work on GitHub. | Use absolute `https://docs.openclaw.ai/...` URLs in the README to ensure GitHub link correctness. | reasons=subject_match,text_match
- 5fde5abf-c13b-53aa-91e9-6ee240d0439b | project/rule | score=30 | payload=When working with documentation, read the mintlify skill | Read the mintlify skill when working with documentation. | reasons=subject_match,text_match
- 89ef514f-7781-5b7d-b598-bac65d95c60e | project/rule | score=30 | payload=Release work requires reading specific release docs first | Always read `docs/reference/RELEASING.md` and `docs/platforms/mac/release.md` before any release work; do not ask routine questions once those docs answer them. | Do not ask routine questions once those docs answer them. | reasons=subject_match,text_match
- 14204618-d171-56a0-afe7-b5b2d8a0499e | user/rule | score=20 | payload=Release workflow prerequisites | Always read `docs/reference/RELEASING.md` and `docs/platforms/mac/release.md` before any release work; do not ask routine questions once those docs answer them. | reasons=subject_match,text_match
- 51438834-96e6-5966-8ba9-c2cb62ac8c52 | project/rule | score=20 | payload=Release work prerequisites | Before any release work, always read docs/reference/RELEASING.md and docs/platforms/mac/release.md and do not ask routine questions once those docs answer them. | reasons=subject_match,text_match
- Model-shaped results:
- 0a6eebe9-b7e5-51de-92da-d724ba4f52b8 | user/rule | score=30 | payload=README (GitHub): keep absolute docs URLs (`https://docs.openclaw.ai/...`) so links work on GitHub. | Use absolute `https://docs.openclaw.ai/...` URLs in the README to ensure GitHub link correctness. | reasons=subject_match,text_match
- 5fde5abf-c13b-53aa-91e9-6ee240d0439b | project/rule | score=30 | payload=When working with documentation, read the mintlify skill | Read the mintlify skill when working with documentation. | reasons=subject_match,text_match
- 89ef514f-7781-5b7d-b598-bac65d95c60e | project/rule | score=30 | payload=Release work requires reading specific release docs first | Always read `docs/reference/RELEASING.md` and `docs/platforms/mac/release.md` before any release work; do not ask routine questions once those docs answer them. | Do not ask routine questions once those docs answer them. | reasons=subject_match,text_match
- 14204618-d171-56a0-afe7-b5b2d8a0499e | user/rule | score=20 | payload=Release workflow prerequisites | Always read `docs/reference/RELEASING.md` and `docs/platforms/mac/release.md` before any release work; do not ask routine questions once those docs answer them. | reasons=subject_match,text_match
- 51438834-96e6-5966-8ba9-c2cb62ac8c52 | project/rule | score=20 | payload=Release work prerequisites | Before any release work, always read docs/reference/RELEASING.md and docs/platforms/mac/release.md and do not ask routine questions once those docs answer them. | reasons=subject_match,text_match

```text
Retrieval for workflow_guidance: What should I read before planning or roadmap work?
1. user/rule {"subject":"README (GitHub): keep absolute docs URLs (`https://docs.openclaw.ai/...`) so links work on GitHub.","recommendedAction":"Use absolute `https://docs.openclaw.ai/...` URLs in the README to ensure GitHub link correctness."} [primary]
2. project/rule {"subject":"When working with documentation, read the mintlify skill","recommendedAction":"Read the mintlify skill when working with documentation."} [primary]
3. project/rule {"subject":"Release work requires reading specific release docs first","avoidAction":"Do not ask routine questions once those docs answer them.","recommendedAction":"Always read `docs/reference/RELEASING.md` and `docs/platforms/mac/release.md` before any release work; do not ask routine questions once those docs answer them."} [primary]
4. user/rule {"subject":"Release workflow prerequisites","recommendedAction":"Always read `docs/reference/RELEASING.md` and `docs/platforms/mac/release.md` before any release work; do not ask routine questions once those docs answer them."} [secondary]
5. project/rule {"subject":"Release work prerequisites","recommendedAction":"Before any release work, always read docs/reference/RELEASING.md and docs/platforms/mac/release.md and do not ask routine questions once those docs answer them."} [secondary]
```

## probe-schema-reference

- Query: Where is the model-memory schema and storage design documented?
- Request purpose: architecture_lookup
- Verdict: mostly_same_value_as_deterministic
- Rationale: same_ranked_ids, accepted_signal=10
- Model action: retrieve
- Lexical accepted counts: {"matchingKinds":5,"matchingClasses":5}
- Model accepted counts: {"matchingKinds":5,"matchingClasses":5}
- Lexical request: {"goal":"Where is the model-memory schema and storage design documented?","canonicalClasses":[],"scopeConstraints":{},"subjectHints":["model","memory","schema","storage","design","documented"],"contentHints":["model","memory","schema","storage","design","documented"],"desiredResultCount":5,"requestConfidence":"weak"}
- Model request: {"goal":"Find the documentation that describes the model-memory schema and storage design, including where the schema is defined and how memory is persisted.","canonicalClasses":[],"scopeConstraints":{},"subjectHints":["model","memory","schema","storage","design","documented"],"contentHints":["model","memory","schema","storage","design","documented"],"desiredResultCount":5,"requestConfidence":"weak"}
- Provider trace: status=200 stage=success resolvedModel=openai/gpt-5.4-nano-20260317
- Lexical baseline results:
- 1d020857-379e-5e36-9dc7-ec8a0b8aad0d | project/fact | score=45 | payload=v1 model-memory schema: Implemented as an ordered SQL migration set under `extensions/model-memory/migrations/` and applied to the live logical database `model_memory`. | reasons=subject_match,text_match
- 304c74a3-a71b-57a7-b20c-7b722ccc47f2 | project/fact | score=30 | payload=@openclaw/model-memory: version 2026.3.3 is marked as private | reasons=subject_match,text_match
- 3210fc39-1042-57b0-9fd7-f11a1252d217 | project/fact | score=30 | payload=OpenClaw memory storage: OpenClaw memory is stored as Markdown files in the agent workspace: daily notes in memory/YYYY-MM-DD.md and curated long-term notes in MEMORY.md (main/private sessions only). | reasons=subject_match,text_match
- 3adbb08a-4a64-5d08-b828-9b5dc9a715c2 | project/rule | score=30 | payload=ModelMemoryReplayService replay operations rebuild runtime | When calling replayDocument and replayOrdinaryTurn, set rebuildRuntime to true so the respective live ingestion/capture services rebuild the runtime. | Do not call replayDocument or replayOrdinaryTurn with rebuildRuntime set to false. | reasons=subject_match,text_match
- 5d005e1c-fd80-51c8-8c18-c3fea0f4e846 | project/fact | score=30 | payload=model_memory.memory_objects lifecycle_state activation rules: lifecycle_state is set to 'active' when superseded_at is NULL; otherwise it is set to 'superseded'. | reasons=subject_match,text_match
- Model-shaped results:
- 1d020857-379e-5e36-9dc7-ec8a0b8aad0d | project/fact | score=45 | payload=v1 model-memory schema: Implemented as an ordered SQL migration set under `extensions/model-memory/migrations/` and applied to the live logical database `model_memory`. | reasons=subject_match,text_match
- 304c74a3-a71b-57a7-b20c-7b722ccc47f2 | project/fact | score=30 | payload=@openclaw/model-memory: version 2026.3.3 is marked as private | reasons=subject_match,text_match
- 3210fc39-1042-57b0-9fd7-f11a1252d217 | project/fact | score=30 | payload=OpenClaw memory storage: OpenClaw memory is stored as Markdown files in the agent workspace: daily notes in memory/YYYY-MM-DD.md and curated long-term notes in MEMORY.md (main/private sessions only). | reasons=subject_match,text_match
- 3adbb08a-4a64-5d08-b828-9b5dc9a715c2 | project/rule | score=30 | payload=ModelMemoryReplayService replay operations rebuild runtime | When calling replayDocument and replayOrdinaryTurn, set rebuildRuntime to true so the respective live ingestion/capture services rebuild the runtime. | Do not call replayDocument or replayOrdinaryTurn with rebuildRuntime set to false. | reasons=subject_match,text_match
- 5d005e1c-fd80-51c8-8c18-c3fea0f4e846 | project/fact | score=30 | payload=model_memory.memory_objects lifecycle_state activation rules: lifecycle_state is set to 'active' when superseded_at is NULL; otherwise it is set to 'superseded'. | reasons=subject_match,text_match

```text
Retrieval for architecture_lookup: Where is the model-memory schema and storage design documented?
1. project/fact {"value":"Implemented as an ordered SQL migration set under `extensions/model-memory/migrations/` and applied to the live logical database `model_memory`.","subject":"v1 model-memory schema"} [primary]
2. project/fact {"value":"version 2026.3.3 is marked as private","subject":"@openclaw/model-memory"} [primary]
3. project/fact {"value":"OpenClaw memory is stored as Markdown files in the agent workspace: daily notes in memory/YYYY-MM-DD.md and curated long-term notes in MEMORY.md (main/private sessions only).","subject":"OpenClaw memory storage"} [primary]
4. project/rule {"subject":"ModelMemoryReplayService replay operations rebuild runtime","avoidAction":"Do not call replayDocument or replayOrdinaryTurn with rebuildRuntime set to false.","recommendedAction":"When calling replayDocument and replayOrdinaryTurn, set rebuildRuntime to true so the respective live ingestion/capture services rebuild the runtime."} [secondary]
5. project/fact {"value":"lifecycle_state is set to 'active' when superseded_at is NULL; otherwise it is set to 'superseded'.","subject":"model_memory.memory_objects lifecycle_state activation rules"} [secondary]
```
