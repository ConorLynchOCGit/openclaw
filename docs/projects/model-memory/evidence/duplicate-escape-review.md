# Model Memory Duplicate Qualitative Review

- Generated at: 2026-04-15T20:32:54.488Z
- Duplicate audit: /root/services/openclaw-roles/live/docs/projects/model-memory/evidence/duplicate-escape-audit.json
- Duplicate audit generated at: 2026-04-15T19:32:58.936Z
- DB mode: full_corpus_proof_db
- Database: model_memory
- Sample size: 16
- Summary: {"clear_duplicate_should_attach":6,"clear_distinct_should_stay_distinct":6,"true_ambiguity":4}
- Basket composition: {"bySourceFamily":{"AGENTS.md":5,"docs/help/testing.md":6,"docs/gateway/configuration.md":5},"byKind":{"rule":9,"fact":7},"byReplayPath":{"deterministic_attach":5,"batched_adjudication":10,"distinct_write":1},"byMissClass":{"deterministic_attach_miss":4,"batch_attach_miss":5,"historical_supersede_miss":1,"legit_distinct":6},"byDeltaClass":{"packaging_only_drift":6,"additive_operational_delta":10},"byPackagingDriftType":{"field_packing_drift":1,"subject_drift":5,"extra_constraint":10}}

## rerun-ecb2ca60-a6a5-56c9-aa25-2ee522c7bf73

- Case identity: AGENTS.md::repository guidelines>security & configuration tips::rule_b75e13a5e00d0d2c27efb52b
- Source: AGENTS.md
- Kind: rule
- Payload: GHSA PATCH field constraint | If updating GHSA, make separate PATCH calls instead of setting both `severity` and `cvss_vector_string` together. | Do not set `severity` and `cvss_vector_string` in the same PATCH.
- Historical decision: write
- Replay path: deterministic_attach
- Miss class: deterministic_attach_miss
- Delta class: packaging_only_drift
- Same-claim confidence: high
- Packaging drift: field_packing_drift
- Stratification: {"sourceFamily":"AGENTS.md","kind":"rule","replayPath":"deterministic_attach","missClass":"deterministic_attach_miss","deltaClass":"packaging_only_drift","packagingDriftType":"field_packing_drift"}
- Reviewer label: clear_duplicate_should_attach
- Rationale: The durable rule body matches but the action-bearing content is packed differently across fields; this is the right shape for support rather than a sibling write.
- Retained candidate: GHSA PATCH payload separation | Make separate calls. | Do not set GHSA severity and cvss_vector_string in the same PATCH.
- Retained candidate: When publishing security advisories (GHSA), read SECURITY.md first, then patch and publish via the GHSA API using separate PATCH calls if severity and cvss_vector_string both need changes. | Read SECURITY.md before reviewing security advisories. If severity and cvss_vector_string both need changes, use separate PATCH calls. | Do not attempt to set severity and cvss_vector_string in the same PATCH call.
- Retained candidate: GHSA PATCH payload constraints | Make separate PATCH calls for these fields. | Do not set `severity` and `cvss_vector_string` in the same PATCH request when patching GHSA via the API.

## rerun-6c4e531b-5a0f-55cf-ba89-0c5e6726d3f4

- Case identity: docs/help/testing.md::testing::fact_fa606b42f1cd1f4a4b82b1f5
- Source: docs/help/testing.md
- Kind: fact
- Payload: Vitest test suites in OpenClaw: OpenClaw has three Vitest suites (unit/integration, e2e, live) and a small set of Docker runners.
- Historical decision: write
- Replay path: batched_adjudication
- Miss class: batch_attach_miss
- Delta class: packaging_only_drift
- Same-claim confidence: high
- Packaging drift: subject_drift
- Stratification: {"sourceFamily":"docs/help/testing.md","kind":"fact","replayPath":"batched_adjudication","missClass":"batch_attach_miss","deltaClass":"packaging_only_drift","packagingDriftType":"subject_drift"}
- Reviewer label: clear_duplicate_should_attach
- Rationale: The candidate reached the batch lane but the same-claim evidence still was not converted into support.
- Retained candidate: OpenClaw test suites: OpenClaw has three Vitest suites (unit/integration, e2e, live) and a small set of Docker runners.
- Retained candidate: OpenClaw testing suites: OpenClaw has three Vitest suites (unit/integration, e2e, live) and a small set of Docker runners.
- Retained candidate: OpenClaw test guide: OpenClaw uses three Vitest suites (unit/integration, e2e, live) plus a small set of Docker runners; this doc is a “how we test” guide describing what each suite covers, which commands to run, how live tests discover credentials/select models, and how to add regressions for model/provider issues.

## rerun-9fe78fe9-3b3f-55eb-9e90-5ada852549ed

- Case identity: docs/help/testing.md::testing::fact_fa1bee72803437f568d6bb04
- Source: docs/help/testing.md
- Kind: fact
- Payload: Live test layers: Live tests are split into Layer 1 direct model completion (src/agents/models.profiles.live.test.ts) and Layer 2 gateway + dev agent smoke (src/gateway/gateway-models.profiles.live.test.ts).
- Historical decision: write
- Replay path: deterministic_attach
- Miss class: deterministic_attach_miss
- Delta class: packaging_only_drift
- Same-claim confidence: high
- Packaging drift: subject_drift
- Stratification: {"sourceFamily":"docs/help/testing.md","kind":"fact","replayPath":"deterministic_attach","missClass":"deterministic_attach_miss","deltaClass":"packaging_only_drift","packagingDriftType":"subject_drift"}
- Reviewer label: clear_duplicate_should_attach
- Rationale: The case is close enough to warrant manual review, but it still needs a narrower local rule before automatic attach would be safe.
- Retained candidate: Live tests layer split: Live tests are split into two layers: Layer 1 direct model completion (no gateway) in `src/agents/models.profiles.live.test.ts`, and Layer 2 gateway + dev agent smoke (what “@openclaw” actually does) in `src/gateway/gateway-models.profiles.live.test.ts`.
- Retained candidate: Live model smoke layer split: Live model smoke is split into Layer 1 (direct model completion without gateway) and Layer 2 (gateway + dev agent smoke).
- Retained candidate: Live direct model completion (no gateway) suite enablement: The live direct model completion (no gateway) test is `src/agents/models.profiles.live.test.ts`, and it runs when `OPENCLAW_LIVE_MODELS` is set (otherwise it skips); enable via `pnpm test:live` or `OPENCLAW_LIVE_TEST=1`, and set `OPENCLAW_LIVE_MODELS=modern` (or `all`, alias for modern) to actually run it.

## rerun-9c0f2b0a-a1b9-5b0f-a064-1c6b9c30cf7f

- Case identity: docs/gateway/configuration.md::configuration::fact_42ae3daa81a4285e5fdfa833
- Source: docs/gateway/configuration.md
- Kind: fact
- Payload: Config hot reload watch path and effect: In config hot reload, the Gateway watches `~/.openclaw/openclaw.json` and applies changes automatically for most settings (no manual restart needed).
- Historical decision: write
- Replay path: deterministic_attach
- Miss class: deterministic_attach_miss
- Delta class: packaging_only_drift
- Same-claim confidence: high
- Packaging drift: subject_drift
- Stratification: {"sourceFamily":"docs/gateway/configuration.md","kind":"fact","replayPath":"deterministic_attach","missClass":"deterministic_attach_miss","deltaClass":"packaging_only_drift","packagingDriftType":"subject_drift"}
- Reviewer label: clear_duplicate_should_attach
- Rationale: The case is close enough to warrant manual review, but it still needs a narrower local rule before automatic attach would be safe.
- Retained candidate: Config hot reload behavior: The Gateway watches ~/.openclaw/openclaw.json and applies changes automatically (no manual restart needed for most settings).
- Retained candidate: Config hot reload behavior and reload modes: The Gateway watches ~/.openclaw/openclaw.json and applies changes automatically for most settings. Reload modes include hybrid (default), hot, restart, and off.
- Retained candidate: Live tests config path: ~/.openclaw/openclaw.json (or OPENCLAW_CONFIG_PATH)

## rerun-00e1f898-bc88-5045-ac49-360f2343668a

- Case identity: docs/gateway/configuration.md::configuration>config rpc (programmatic updates)::fact_0bb586ac183adcb49004ce11
- Source: docs/gateway/configuration.md
- Kind: fact
- Payload: Environment variable sources and precedence: OpenClaw reads env vars from the parent process plus .env from the current working directory (if present) and ~/.openclaw/.env as a global fallback, and neither file overrides existing env vars.
- Historical decision: supersede
- Replay path: deterministic_attach
- Miss class: historical_supersede_miss
- Delta class: packaging_only_drift
- Same-claim confidence: high
- Packaging drift: subject_drift
- Stratification: {"sourceFamily":"docs/gateway/configuration.md","kind":"fact","replayPath":"deterministic_attach","missClass":"historical_supersede_miss","deltaClass":"packaging_only_drift","packagingDriftType":"subject_drift"}
- Reviewer label: clear_duplicate_should_attach
- Rationale: The newer object repeated an existing claim without replacing its slot-defining content; support would be more accurate than supersede.
- Retained candidate: OpenClaw environment variable loading: OpenClaw reads env vars from the parent process plus `.env` in the current working directory (if present) and `~/.openclaw/.env` as a global fallback; neither file overrides existing env vars.
- Retained candidate: OpenClaw environment variable loading sources: OpenClaw reads environment variables from the parent process plus a .env file from the current working directory (if present), with ~/.openclaw/.env as a global fallback.

## rerun-a032fe54-6900-5d28-8ca5-b44024de67f1

- Case identity: AGENTS.md::repository guidelines>security & configuration tips::rule_1594ec8dbdc7d0e532ba35cb
- Source: AGENTS.md
- Kind: rule
- Payload: Handling real personal/media/config values in commits | Use obviously fake placeholders in docs, tests, and examples. | Never commit or publish real phone numbers, videos, or live configuration values.
- Historical decision: write
- Replay path: deterministic_attach
- Miss class: deterministic_attach_miss
- Delta class: packaging_only_drift
- Same-claim confidence: high
- Packaging drift: subject_drift
- Stratification: {"sourceFamily":"AGENTS.md","kind":"rule","replayPath":"deterministic_attach","missClass":"deterministic_attach_miss","deltaClass":"packaging_only_drift","packagingDriftType":"subject_drift"}
- Reviewer label: clear_duplicate_should_attach
- Rationale: The case is close enough to warrant manual review, but it still needs a narrower local rule before automatic attach would be safe.
- Retained candidate: Avoid committing or publishing real sensitive values | Use obviously fake placeholders in docs, tests, and examples. | Never commit or publish real phone numbers, videos, or live configuration values.
- Retained candidate: Credentials handling for live tests | Do not commit credentials.

## rerun-0f1a11dd-fb49-50d8-8b2f-0fe56681912f

- Case identity: docs/help/testing.md::testing::rule_024a76e951c684845ebbb3f7
- Source: docs/help/testing.md
- Kind: rule
- Payload: Layer 1 vs Layer 2 live test enablement | Layer 1 live model completion (no gateway) uses `src/agents/models.profiles.live.test.ts` and is enabled only when `OPENCLAW_LIVE_MODELS` is set; otherwise it skips. | Layer 2 live gateway smoke uses `src/gateway/gateway-models.profiles.live.test.ts` and validates the full gateway+agent pipeline including tool/image probes.
- Historical decision: write
- Replay path: batched_adjudication
- Miss class: legit_distinct
- Delta class: additive_operational_delta
- Same-claim confidence: low
- Packaging drift: extra_constraint
- Stratification: {"sourceFamily":"docs/help/testing.md","kind":"rule","replayPath":"batched_adjudication","missClass":"legit_distinct","deltaClass":"additive_operational_delta","packagingDriftType":"extra_constraint"}
- Reviewer label: clear_distinct_should_stay_distinct
- Rationale: Nearest prior candidates do not clear the same-claim bar strongly enough; keeping the object distinct remains defensible.
- Retained candidate: Live gateway smoke should run `pnpm test:live src/gateway/gateway-models.profiles.live.test.ts` using `OPENCLAW_LIVE_GATEWAY_MODELS` including tool-calling and image-capable models. | Run `pnpm test:live src/gateway/gateway-models.profiles.live.test.ts` with `OPENCLAW_LIVE_GATEWAY_MODELS` set to include tool-calling and image-capable models.
- Retained candidate: Run gateway live smoke with tools+image | Set `OPENCLAW_LIVE_GATEWAY_MODELS` and run `pnpm test:live src/gateway/gateway-models.profiles.live.test.ts`. | A correctly formatted `OPENCLAW_LIVE_GATEWAY_MODELS` value including the desired models.
- Retained candidate: Live model smoke layer 1 (direct model completion) | To run live model smoke layer 1 (direct model completion, no gateway), set `OPENCLAW_LIVE_MODELS=modern` (or `all`) and run `pnpm test:live` (or `OPENCLAW_LIVE_TEST=1` if invoking Vitest directly).

## rerun-59e58a61-441a-5723-be56-89bfbffa3a30

- Case identity: docs/gateway/configuration.md::configuration>config rpc (programmatic updates)::rule_421bfdc7b5cbcb29e0c0b27d
- Source: docs/gateway/configuration.md
- Kind: rule
- Payload: Environment variable substitution in OpenClaw configs | Use ${VAR_NAME} substitution where VAR_NAME matches [A-Z_][A-Z0-9_]*; ensure the referenced env var is present and non-empty (missing/empty vars throw an error at load time). Escape for literal output with $${VAR} (e.g., $${BASE}).
- Historical decision: write
- Replay path: batched_adjudication
- Miss class: legit_distinct
- Delta class: additive_operational_delta
- Same-claim confidence: low
- Packaging drift: extra_constraint
- Stratification: {"sourceFamily":"docs/gateway/configuration.md","kind":"rule","replayPath":"batched_adjudication","missClass":"legit_distinct","deltaClass":"additive_operational_delta","packagingDriftType":"extra_constraint"}
- Reviewer label: clear_distinct_should_stay_distinct
- Rationale: Nearest prior candidates do not clear the same-claim bar strongly enough; keeping the object distinct remains defensible.
- Retained candidate: env var substitution in config values | Use ${VAR_NAME} in config string values for substitution where VAR_NAME matches [A-Z_][A-Z0-9_]*, and ensure referenced vars are present and non-empty to avoid load-time errors. | Do not use undefined or empty env vars in ${VAR_NAME} substitutions (they throw an error at load time). | Support literal output escaping via $${VAR} when a config should contain the pattern without substitution.
- Retained candidate: config string environment variable substitution rules | Use environment variables with uppercase names matching `[A-Z_][A-Z0-9_]*`; ensure referenced variables are present and non-empty at load time. | Do not reference missing or empty environment variables in config string substitutions because this throws an error at load time. | Escape literal output using `$${VAR}` when you need `$`-prefixed text instead of substitution.
- Retained candidate: Env var substitution rules in config strings | Use ${VAR_NAME} with uppercase names matching [A-Z_][A-Z0-9_]*; missing/empty vars throw an error at load time; escape with $${VAR} for literal output. | Do not use lowercase or invalid variable names for substitution.

## rerun-8f7d28d3-dc6a-5294-8ca4-0c28e6cec824

- Case identity: docs/help/testing.md::testing::fact_695c816f149438d96707ab70
- Source: docs/help/testing.md
- Kind: fact
- Payload: Vitest suites: OpenClaw has three Vitest suites: unit/integration (default), e2e (gateway smoke), and live (real providers + real models).
- Historical decision: write
- Replay path: batched_adjudication
- Miss class: legit_distinct
- Delta class: additive_operational_delta
- Same-claim confidence: low
- Packaging drift: extra_constraint
- Stratification: {"sourceFamily":"docs/help/testing.md","kind":"fact","replayPath":"batched_adjudication","missClass":"legit_distinct","deltaClass":"additive_operational_delta","packagingDriftType":"extra_constraint"}
- Reviewer label: clear_distinct_should_stay_distinct
- Rationale: Nearest prior candidates do not clear the same-claim bar strongly enough; keeping the object distinct remains defensible.
- Retained candidate: OpenClaw test suites: OpenClaw has three Vitest suites (unit/integration, e2e, live) and a small set of Docker runners.
- Retained candidate: OpenClaw testing suites: OpenClaw has three Vitest suites (unit/integration, e2e, live) and a small set of Docker runners.
- Retained candidate: OpenClaw test guide: OpenClaw uses three Vitest suites (unit/integration, e2e, live) plus a small set of Docker runners; this doc is a “how we test” guide describing what each suite covers, which commands to run, how live tests discover credentials/select models, and how to add regressions for model/provider issues.

## rerun-96f254b5-221c-5a4c-a674-6621216b3d19

- Case identity: AGENTS.md::repository guidelines>security & configuration tips::rule_78a76963474a86681a8aae85
- Source: AGENTS.md
- Kind: rule
- Payload: GHSA advisory patch/publish workflow | Read SECURITY.md first and follow the documented API workflow; patch using gh api PATCH and then verify that state is published (published_at set) by re-fetching the advisory. | Do not publish via a `/publish` endpoint; include published state via PATCH input as documented. | Ability to use the GHSA API workflow (including handling the PATCH severity/cvss_vector_string constraint via separate calls) and to verify the published state after PATCH.
- Historical decision: write
- Replay path: batched_adjudication
- Miss class: legit_distinct
- Delta class: additive_operational_delta
- Same-claim confidence: low
- Packaging drift: extra_constraint
- Stratification: {"sourceFamily":"AGENTS.md","kind":"rule","replayPath":"batched_adjudication","missClass":"legit_distinct","deltaClass":"additive_operational_delta","packagingDriftType":"extra_constraint"}
- Reviewer label: clear_distinct_should_stay_distinct
- Rationale: Nearest prior candidates do not clear the same-claim bar strongly enough; keeping the object distinct remains defensible.
- Retained candidate: GHSA advisory handling workflow | Before reviewing security advisories, read `SECURITY.md`, fetch via `gh api /repos/openclaw/openclaw/security-advisories/<GHSA>`, then PATCH the advisory including `"state":"published"` (no `/publish` endpoint). | Do not attempt to set `severity` and `cvss_vector_string` in the same GHSA PATCH call; do separate calls. | Use the documented GHSA API workflow and publish via PATCH including `"state":"published"`.
- Retained candidate: When publishing security advisories (GHSA), read SECURITY.md first, then patch and publish via the GHSA API using separate PATCH calls if severity and cvss_vector_string both need changes. | Read SECURITY.md before reviewing security advisories. If severity and cvss_vector_string both need changes, use separate PATCH calls. | Do not attempt to set severity and cvss_vector_string in the same PATCH call.
- Retained candidate: GHSA PATCH payload separation | Make separate calls. | Do not set GHSA severity and cvss_vector_string in the same PATCH.

## rerun-e8995751-48cd-54e6-a550-16df7b37adfa

- Case identity: docs/gateway/configuration.md::configuration::fact_523838d0bffa253090a2d7bf
- Source: docs/gateway/configuration.md
- Kind: fact
- Payload: Fields requiring restart during hot reload: During hot reload, changes to `gateway.*` (port, bind, auth, tailscale, TLS, HTTP) require a restart, and changes to `discovery`, `canvasHost`, and `plugins` require a restart; most other config fields do not.
- Historical decision: write
- Replay path: batched_adjudication
- Miss class: legit_distinct
- Delta class: additive_operational_delta
- Same-claim confidence: low
- Packaging drift: extra_constraint
- Stratification: {"sourceFamily":"docs/gateway/configuration.md","kind":"fact","replayPath":"batched_adjudication","missClass":"legit_distinct","deltaClass":"additive_operational_delta","packagingDriftType":"extra_constraint"}
- Reviewer label: clear_distinct_should_stay_distinct
- Rationale: Nearest prior candidates do not clear the same-claim bar strongly enough; keeping the object distinct remains defensible.
- Retained candidate: Hybrid hot reload mode behavior: In `hybrid` hot reload mode (default), hot-applies safe changes instantly and automatically restarts for critical ones; restart-required changes include `gateway.*` (port, bind, auth, tailscale, TLS, HTTP) and `discovery`, `canvasHost`, `plugins`.
- Retained candidate: Config hot reload restart-required categories in `hybrid` mode: In `hybrid` mode, most fields hot-apply without downtime; `gateway.*` requires a restart and `discovery`, `canvasHost`, and `plugins` require a restart, while channels (`channels.*`, `web`), agent/models (`agent`, `agents`, `models`, `routing`), automation (`hooks`, `cron`, `agent.heartbeat`), sessions/messages (`session`, `messages`), tools/media (`tools`, `browser`, `skills`, `audio`, `talk`), and UI/misc (`ui`, `logging`, `identity`, `bindings`) do not.

## rerun-001641dd-ed15-5e44-be90-e0b7e63aee56

- Case identity: AGENTS.md::repository guidelines>security & configuration tips::rule_e1f98e7d43623faabb5fde82
- Source: AGENTS.md
- Kind: rule
- Payload: Plugin release fast path (no core openclaw publish) | Release only already-on-npm plugins from the Current npm plugin list, and never run publish from the repo root unless explicitly requested.
- Historical decision: write
- Replay path: distinct_write
- Miss class: legit_distinct
- Delta class: additive_operational_delta
- Same-claim confidence: low
- Packaging drift: extra_constraint
- Stratification: {"sourceFamily":"AGENTS.md","kind":"rule","replayPath":"distinct_write","missClass":"legit_distinct","deltaClass":"additive_operational_delta","packagingDriftType":"extra_constraint"}
- Reviewer label: clear_distinct_should_stay_distinct
- Rationale: Nearest prior candidates do not clear the same-claim bar strongly enough; keeping the object distinct remains defensible.

## rerun-098ba11a-a3ff-5396-b0a8-f85288f251ef

- Case identity: AGENTS.md::repository guidelines::rule_ee209a084f7d8090ff8568e5
- Source: AGENTS.md
- Kind: rule
- Payload: GitHub PR/issue comment command usage | When using `gh issue/pr comment`, prefer single-quoted heredoc (`-F - <<'EOF'`). | Never use `gh issue/pr comment -b "..."` when body contains backticks or shell chars.
- Historical decision: write
- Replay path: batched_adjudication
- Miss class: batch_attach_miss
- Delta class: additive_operational_delta
- Same-claim confidence: medium
- Packaging drift: extra_constraint
- Stratification: {"sourceFamily":"AGENTS.md","kind":"rule","replayPath":"batched_adjudication","missClass":"batch_attach_miss","deltaClass":"additive_operational_delta","packagingDriftType":"extra_constraint"}
- Reviewer label: true_ambiguity
- Rationale: The candidate reached the batch lane but the same-claim evidence still was not converted into support.
- Retained candidate: When creating GitHub comments, avoid gh issue/pr comment -b "..." if the body contains backticks or shell chars; use a single-quoted heredoc instead. | Always use single-quoted heredoc (-F - <<'EOF') to prevent escaping/command issues. | Never use `gh issue/pr comment -b "..."` when body contains backticks or shell chars.
- Retained candidate: gh issue/pr comment -b usage with shell/backticks | Use a single-quoted heredoc (`-F - <<'EOF'`) to avoid escaping corruption. | Never use `gh issue/pr comment -b "..."` when the body contains backticks or shell chars.
- Retained candidate: GitHub comment command -b usage with backticks/shell chars | Use single-quoted heredocs (`-F - <<'EOF'`) so no command substitution/escaping corruption occurs. | Never use `gh issue/pr comment -b "..."` when the body contains backticks or shell chars.

## rerun-126478b9-53cc-5346-b7da-478d100163e8

- Case identity: docs/help/testing.md::testing>live: model matrix (what we cover)>modern smoke set (tool calling + image)::fact_13e8587d50856efe2ed82bc9
- Source: docs/help/testing.md
- Kind: fact
- Payload: Credential lookup locations: Provider credential lookup uses the profile store at ~/.openclaw/credentials/ (preferred) and config at ~/.openclaw/openclaw.json or OPENCLAW_CONFIG_PATH.
- Historical decision: write
- Replay path: batched_adjudication
- Miss class: batch_attach_miss
- Delta class: additive_operational_delta
- Same-claim confidence: medium
- Packaging drift: extra_constraint
- Stratification: {"sourceFamily":"docs/help/testing.md","kind":"fact","replayPath":"batched_adjudication","missClass":"batch_attach_miss","deltaClass":"additive_operational_delta","packagingDriftType":"extra_constraint"}
- Reviewer label: true_ambiguity
- Rationale: The candidate reached the batch lane but the same-claim evidence still was not converted into support.
- Retained candidate: Live test credential profile store and config path: Profile store: ~/.openclaw/credentials/. Config: ~/.openclaw/openclaw.json (or OPENCLAW_CONFIG_PATH).
- Retained candidate: Live test credential/config storage paths: Profile store for live tests is `~/.openclaw/credentials/` and config is `~/.openclaw/openclaw.json` (or `OPENCLAW_CONFIG_PATH`).
- Retained candidate: Credentials discovery and local paths for live tests: Live tests discover credentials the same way the CLI does; profile keys are stored in ~/.openclaw/credentials/ and config in ~/.openclaw/openclaw.json (or OPENCLAW_CONFIG_PATH).

## rerun-23c7d058-fd08-54f4-8926-ed7df81b8e59

- Case identity: docs/gateway/configuration.md::configuration>config rpc (programmatic updates)::rule_678114da2008911e318b7bc9
- Source: docs/gateway/configuration.md
- Kind: rule
- Payload: Env var substitution in config values | Reference env vars in config string values with `${VAR_NAME}` where VAR*NAME matches `[A-Z*][A-Z0-9_]\*`; escape a literal dollar with `$${VAR}`.
- Historical decision: write
- Replay path: batched_adjudication
- Miss class: batch_attach_miss
- Delta class: additive_operational_delta
- Same-claim confidence: medium
- Packaging drift: extra_constraint
- Stratification: {"sourceFamily":"docs/gateway/configuration.md","kind":"rule","replayPath":"batched_adjudication","missClass":"batch_attach_miss","deltaClass":"additive_operational_delta","packagingDriftType":"extra_constraint"}
- Reviewer label: true_ambiguity
- Rationale: The candidate reached the batch lane but the same-claim evidence still was not converted into support.
- Retained candidate: Env var substitution in config string values | In config string values, substitute `${VAR_NAME}` where `VAR_NAME` matches `[A-Z_][A-Z0-9_]*`; treat missing/empty vars as an error at load time; and use `$${VAR}` to escape for literal output (including inside `$include` files).
- Retained candidate: env var substitution in config values | Use ${VAR_NAME} in config string values for substitution where VAR_NAME matches [A-Z_][A-Z0-9_]*, and ensure referenced vars are present and non-empty to avoid load-time errors. | Do not use undefined or empty env vars in ${VAR_NAME} substitutions (they throw an error at load time). | Support literal output escaping via $${VAR} when a config should contain the pattern without substitution.
- Retained candidate: Env var substitution rules for config string values | Substitute ${VAR_NAME} references in config string values using the rule set: only uppercase names matching [A-Z_][A-Z0-9_]*, throw an error at load time for missing/empty vars, escape with $${VAR} for literal output, allow substitutions inside $include files, and support inline substitution (e.g., "${BASE}/v1"). | Support ${VAR_NAME} substitution with uppercase-name validation, erroring on missing/empty vars, $${VAR} escaping, behavior inside $include, and inline substitution.

## rerun-32723415-ae40-5d46-8443-d3d55ac80593

- Case identity: docs/help/testing.md::testing>live: model matrix (what we cover)>modern smoke set (tool calling + image)::rule_da9ffa474ea2d570d026d2be
- Source: docs/help/testing.md
- Kind: rule
- Payload: Include at least one tool-calling-capable baseline model per provider family in OPENCLAW_LIVE_GATEWAY_MODELS. | Include at least one tool-calling-capable baseline model per provider family in OPENCLAW_LIVE_GATEWAY_MODELS.
- Historical decision: write
- Replay path: batched_adjudication
- Miss class: batch_attach_miss
- Delta class: additive_operational_delta
- Same-claim confidence: medium
- Packaging drift: extra_constraint
- Stratification: {"sourceFamily":"docs/help/testing.md","kind":"rule","replayPath":"batched_adjudication","missClass":"batch_attach_miss","deltaClass":"additive_operational_delta","packagingDriftType":"extra_constraint"}
- Reviewer label: true_ambiguity
- Rationale: The candidate reached the batch lane but the same-claim evidence still was not converted into support.
- Retained candidate: Live gateway smoke matrix tool-calling coverage | Include at least one tool-calling model per provider family.
- Retained candidate: Live gateway model matrix coverage | Use the model matrix to include at least one tools-capable model per provider family and include at least one image-capable model to exercise the image probe. | Select at least one tools-capable model per provider family and at least one image-capable model for OPENCLAW_LIVE_GATEWAY_MODELS.
- Retained candidate: Live model matrix should include at least one tool-calling capable model per provider family (OpenAI, Anthropic, Google, Z.AI, MiniMax), with optional additional providers (xAI/Mistral/Cerebras/LM Studio). | Include at least one tool-calling capable model per provider family for the live model matrix, and optionally add others like xAI, Mistral, Cerebras, or LM Studio. | Tool-calling capable models enabled for the selected provider families.
