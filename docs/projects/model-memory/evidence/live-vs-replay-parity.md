# Model Memory Live vs Replay Parity

- Generated at: 2026-04-15T18:15:49.711Z
- Duplicate review: /root/services/openclaw-roles/live/docs/projects/model-memory/evidence/duplicate-escape-review.json
- Duplicate review generated at: 2026-04-15T18:14:54.292Z
- Duplicate audit: /root/services/openclaw-roles/live/docs/projects/model-memory/evidence/duplicate-escape-audit.json
- Duplicate audit generated at: 2026-04-15T18:14:48.296Z
- Core claim delta measurement: /root/services/openclaw-roles/live/docs/projects/model-memory/evidence/core-claim-delta-measurement.json
- Core claim delta measurement generated at: 2026-04-15T16:47:32.078Z
- Trace paths: /root/services/openclaw-roles/live/docs/projects/model-memory/evidence/agents-md-collision-hinge-trace.json, /root/services/openclaw-roles/live/docs/projects/model-memory/evidence/docs-help-testing-md-collision-hinge-trace.json, /root/services/openclaw-roles/live/docs/projects/model-memory/evidence/docs-gateway-configuration-md-collision-hinge-trace.json
- Sample size: 6
- Summary: {"closeCount":0,"divergedCount":6,"parityByQuality":{"unresolved_trace_match":6},"divergenceBySeam":{"trace_match":6}}

## rerun-ecb2ca60-a6a5-56c9-aa25-2ee522c7bf73

- Case identity: AGENTS.md::repository guidelines>security & configuration tips::rule_b75e13a5e00d0d2c27efb52b
- Source: AGENTS.md
- Kind: rule
- Role: clear_duplicate_should_attach
- Live match found: false
- Live pass: n/a
- Live trace candidate: n/a
- Live gate classification: n/a
- Live decision: n/a
- Replay classification: deterministic_attach
- Replay current path blocker: blocking_packaging_fields
- Replay delta class: packaging_only_drift
- Retained count delta: -5
- Overlapping retained candidate count: 0
- Parity quality: unresolved_trace_match
- Localized seam: trace_match
- Note: No reliable trace-row match was found for this reviewed case.
- Replay retained: GHSA PATCH payload separation | Make separate calls. | Do not set GHSA severity and cvss_vector_string in the same PATCH.
- Replay retained: When publishing security advisories (GHSA), read SECURITY.md first, then patch and publish via the GHSA API using separate PATCH calls if severity and cvss_vector_string both need changes. | Read SECURITY.md before reviewing security advisories. If severity and cvss_vector_string both need changes, use separate PATCH calls. | Do not attempt to set severity and cvss_vector_string in the same PATCH call.
- Replay retained: GHSA PATCH payload constraints | Make separate PATCH calls for these fields. | Do not set `severity` and `cvss_vector_string` in the same PATCH request when patching GHSA via the API.
- Replay retained: GHSA PATCH footgun | Do separate calls rather than setting `severity` and `cvss_vector_string` in the same PATCH. | Understanding GHSA PATCH API field constraints.
- Replay retained: GHSA advisory handling workflow | Before reviewing security advisories, read `SECURITY.md`, fetch via `gh api /repos/openclaw/openclaw/security-advisories/<GHSA>`, then PATCH the advisory including `"state":"published"` (no `/publish` endpoint). | Do not attempt to set `severity` and `cvss_vector_string` in the same GHSA PATCH call; do separate calls. | Use the documented GHSA API workflow and publish via PATCH including `"state":"published"`.

## rerun-6c4e531b-5a0f-55cf-ba89-0c5e6726d3f4

- Case identity: docs/help/testing.md::testing::fact_fa606b42f1cd1f4a4b82b1f5
- Source: docs/help/testing.md
- Kind: fact
- Role: clear_duplicate_should_attach
- Live match found: false
- Live pass: n/a
- Live trace candidate: n/a
- Live gate classification: n/a
- Live decision: n/a
- Replay classification: batched_adjudication
- Replay current path blocker: blocking_core_claim_fields
- Replay delta class: additive_operational_delta
- Retained count delta: -4
- Overlapping retained candidate count: 0
- Parity quality: unresolved_trace_match
- Localized seam: trace_match
- Note: No reliable trace-row match was found for this reviewed case.
- Replay retained: OpenClaw test suites: OpenClaw has three Vitest suites (unit/integration, e2e, live) and a small set of Docker runners.
- Replay retained: OpenClaw testing suites: OpenClaw has three Vitest suites (unit/integration, e2e, live) and a small set of Docker runners.
- Replay retained: OpenClaw test guide: OpenClaw uses three Vitest suites (unit/integration, e2e, live) plus a small set of Docker runners; this doc is a “how we test” guide describing what each suite covers, which commands to run, how live tests discover credentials/select models, and how to add regressions for model/provider issues.
- Replay retained: Vitest suites: OpenClaw has three Vitest suites: unit/integration (default), e2e (gateway smoke), and live (real providers + real models).

## rerun-9fe78fe9-3b3f-55eb-9e90-5ada852549ed

- Case identity: docs/help/testing.md::testing::fact_fa1bee72803437f568d6bb04
- Source: docs/help/testing.md
- Kind: fact
- Role: clear_duplicate_should_attach
- Live match found: false
- Live pass: n/a
- Live trace candidate: n/a
- Live gate classification: n/a
- Live decision: n/a
- Replay classification: deterministic_attach
- Replay current path blocker: n/a
- Replay delta class: n/a
- Retained count delta: -4
- Overlapping retained candidate count: 0
- Parity quality: unresolved_trace_match
- Localized seam: trace_match
- Note: No reliable trace-row match was found for this reviewed case.
- Replay retained: Live tests layer split: Live tests are split into two layers: Layer 1 direct model completion (no gateway) in `src/agents/models.profiles.live.test.ts`, and Layer 2 gateway + dev agent smoke (what “@openclaw” actually does) in `src/gateway/gateway-models.profiles.live.test.ts`.
- Replay retained: Live model smoke layer split: Live model smoke is split into Layer 1 (direct model completion without gateway) and Layer 2 (gateway + dev agent smoke).
- Replay retained: Live direct model completion (no gateway) suite enablement: The live direct model completion (no gateway) test is `src/agents/models.profiles.live.test.ts`, and it runs when `OPENCLAW_LIVE_MODELS` is set (otherwise it skips); enable via `pnpm test:live` or `OPENCLAW_LIVE_TEST=1`, and set `OPENCLAW_LIVE_MODELS=modern` (or `all`, alias for modern) to actually run it.
- Replay retained: LIVE gateway smoke test environment variable: For live gateway smoke, set OPENCLAW_LIVE_GATEWAY_MODELS and run `pnpm test:live src/gateway/gateway-models.profiles.live.test.ts`.

## rerun-0f1a11dd-fb49-50d8-8b2f-0fe56681912f

- Case identity: docs/help/testing.md::testing::rule_024a76e951c684845ebbb3f7
- Source: docs/help/testing.md
- Kind: rule
- Role: clear_distinct_should_stay_distinct
- Live match found: false
- Live pass: n/a
- Live trace candidate: n/a
- Live gate classification: n/a
- Live decision: n/a
- Replay classification: batched_adjudication
- Replay current path blocker: already_legit_distinct
- Replay delta class: additive_operational_delta
- Retained count delta: -5
- Overlapping retained candidate count: 0
- Parity quality: unresolved_trace_match
- Localized seam: trace_match
- Note: No reliable trace-row match was found for this reviewed case.
- Replay retained: Live gateway smoke should run `pnpm test:live src/gateway/gateway-models.profiles.live.test.ts` using `OPENCLAW_LIVE_GATEWAY_MODELS` including tool-calling and image-capable models. | Run `pnpm test:live src/gateway/gateway-models.profiles.live.test.ts` with `OPENCLAW_LIVE_GATEWAY_MODELS` set to include tool-calling and image-capable models.
- Replay retained: Run gateway live smoke with tools+image | Set `OPENCLAW_LIVE_GATEWAY_MODELS` and run `pnpm test:live src/gateway/gateway-models.profiles.live.test.ts`. | A correctly formatted `OPENCLAW_LIVE_GATEWAY_MODELS` value including the desired models.
- Replay retained: Live model smoke layer 1 (direct model completion) | To run live model smoke layer 1 (direct model completion, no gateway), set `OPENCLAW_LIVE_MODELS=modern` (or `all`) and run `pnpm test:live` (or `OPENCLAW_LIVE_TEST=1` if invoking Vitest directly).
- Replay retained: Live model smoke layer separation | Isolate failures using the two layers | Layer 1 direct model completion and Layer 2 full gateway+agent pipeline to validate different failure modes
- Replay retained: Live gateway + dev agent smoke layer 2 | To run live gateway+dev agent smoke layer 2, run `pnpm test:live` and optionally narrow with `OPENCLAW_LIVE_GATEWAY_MODELS` and `OPENCLAW_LIVE_GATEWAY_PROVIDERS`.

## rerun-59e58a61-441a-5723-be56-89bfbffa3a30

- Case identity: docs/gateway/configuration.md::configuration>config rpc (programmatic updates)::rule_421bfdc7b5cbcb29e0c0b27d
- Source: docs/gateway/configuration.md
- Kind: rule
- Role: clear_distinct_should_stay_distinct
- Live match found: false
- Live pass: n/a
- Live trace candidate: n/a
- Live gate classification: n/a
- Live decision: n/a
- Replay classification: batched_adjudication
- Replay current path blocker: already_legit_distinct
- Replay delta class: additive_operational_delta
- Retained count delta: -5
- Overlapping retained candidate count: 0
- Parity quality: unresolved_trace_match
- Localized seam: trace_match
- Note: No reliable trace-row match was found for this reviewed case.
- Replay retained: env var substitution in config values | Use ${VAR_NAME} in config string values for substitution where VAR_NAME matches [A-Z_][A-Z0-9_]*, and ensure referenced vars are present and non-empty to avoid load-time errors. | Do not use undefined or empty env vars in ${VAR_NAME} substitutions (they throw an error at load time). | Support literal output escaping via $${VAR} when a config should contain the pattern without substitution.
- Replay retained: config string environment variable substitution rules | Use environment variables with uppercase names matching `[A-Z_][A-Z0-9_]*`; ensure referenced variables are present and non-empty at load time. | Do not reference missing or empty environment variables in config string substitutions because this throws an error at load time. | Escape literal output using `$${VAR}` when you need `$`-prefixed text instead of substitution.
- Replay retained: Env var substitution rules in config strings | Use ${VAR_NAME} with uppercase names matching [A-Z_][A-Z0-9_]*; missing/empty vars throw an error at load time; escape with $${VAR} for literal output. | Do not use lowercase or invalid variable names for substitution.
- Replay retained: Environment variable substitution in config values | Use ${VAR_NAME} in config strings where VAR_NAME matches [A-Z_][A-Z0-9_]*; escape literal output with $${VAR}. | Do not reference undefined or empty environment variables because they throw an error at load time. | Provide environment variables with uppercase names matching [A-Z\_][A-Z0-9_]\* (or escape with $${VAR} for literal output).
- Replay retained: Environment variable substitution in config values | Substitute only uppercase variable names matching `[A-Z_][A-Z0-9_]*`; if a referenced variable is missing/empty, raise an error at load time; escape `$${VAR}` to emit literal output. | Implement env var substitution rules with the specified name pattern, load-time errors for missing/empty vars, and `$${VAR}` escaping for literal output.

## rerun-098ba11a-a3ff-5396-b0a8-f85288f251ef

- Case identity: AGENTS.md::repository guidelines::rule_ee209a084f7d8090ff8568e5
- Source: AGENTS.md
- Kind: rule
- Role: true_ambiguity
- Live match found: false
- Live pass: n/a
- Live trace candidate: n/a
- Live gate classification: n/a
- Live decision: n/a
- Replay classification: batched_adjudication
- Replay current path blocker: blocking_core_claim_fields
- Replay delta class: additive_operational_delta
- Retained count delta: -5
- Overlapping retained candidate count: 0
- Parity quality: unresolved_trace_match
- Localized seam: trace_match
- Note: No reliable trace-row match was found for this reviewed case.
- Replay retained: When creating GitHub comments, avoid gh issue/pr comment -b "..." if the body contains backticks or shell chars; use a single-quoted heredoc instead. | Always use single-quoted heredoc (-F - <<'EOF') to prevent escaping/command issues. | Never use `gh issue/pr comment -b "..."` when body contains backticks or shell chars.
- Replay retained: gh issue/pr comment -b usage with shell/backticks | Use a single-quoted heredoc (`-F - <<'EOF'`) to avoid escaping corruption. | Never use `gh issue/pr comment -b "..."` when the body contains backticks or shell chars.
- Replay retained: GitHub comment command -b usage with backticks/shell chars | Use single-quoted heredocs (`-F - <<'EOF'`) so no command substitution/escaping corruption occurs. | Never use `gh issue/pr comment -b "..."` when the body contains backticks or shell chars.
- Replay retained: GitHub comment footgun: never use `gh issue/pr comment -b "..."` when body contains backticks or shell chars; always use single-quoted heredoc (`-F - <<'EOF'`). | When using `gh issue/pr comment`, prefer single-quoted heredoc (`-F - <<'EOF'`) to avoid escaping/command-substitution corruption, especially if the body contains backticks or shell characters. | Ability to invoke `gh` with single-quoted heredocs for safe comment body formatting.
- Replay retained: Never use `gh issue/pr comment -b "..."` when the body contains backticks or shell chars; always use single-quoted heredoc (`-F - <<'EOF'`) so no command substitution/escaping corruption occurs. | Use single-quoted heredoc (`-F - <<'EOF'`) for GitHub comment bodies containing backticks/shell chars. | Do not use `gh issue/pr comment -b "..."` with bodies containing backticks or shell chars.
