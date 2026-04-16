# Model Memory Collision Hinge Trace

- Source: docs/gateway/configuration.md
- DB mode: targeted_trace_scratch_db
- Database: model_memory_trace_scratch
- Pass 1 model: openrouter/openai/gpt-5.4-nano
- Pass 2 model: openrouter/openai/gpt-5.4-nano
- Request seed: 7
- Request timeout ms: 180000
- Max words per window: 1500
- Likely hinge: batch_adjudication_too_conservative
- Totals: distinct=20 attach_support=0 conflict_hold=0 zero_candidate_skips=3 admitted_to_batch=7

## baseline

- Object delta: 10
- Support delta: 10
- Captured claims: 10
- Collision model calls: 0
- Bounded candidate adjudication cases: 0
- Write decisions: {"write":10}

| Candidate | Window | Gate | Raw | Kept | Pruned | Decision | Codes | Object |
| --------- | ------ | ---- | --: | ---: | -----: | -------- | ----- | ------ |

## rerun_1

- Object delta: 8
- Support delta: 8
- Captured claims: 8
- Collision model calls: 1
- Bounded candidate adjudication cases: 7
- Write decisions: {"supersede":1,"write":7}

| Candidate   | Window                               | Gate              | Raw | Kept | Pruned | Decision | Codes                                                               | Object                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------- | ------------------------------------ | ----------------- | --: | ---: | -----: | -------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| candidate-1 | 73c2bb30-9528-5e26-9427-ee2d2dd9ccc7 | admitted_to_batch |   7 |    1 |      6 | write    | write_structural_accept, collision_distinct                         | Strict configuration schema validation \| Ensure configurations fully match the schema (no unknown keys, malformed types, or invalid values). \| Do not include unknown keys or invalid values, since the Gateway will refuse to start. \| Use JSON Schema metadata via the root-level `$schema` field (string) for editor support.                                                                                |
| candidate-2 | 73c2bb30-9528-5e26-9427-ee2d2dd9ccc7 | admitted_to_batch |   7 |    1 |      6 | write    | write_structural_accept, collision_distinct                         | Config hot reload watches the OpenClaw config file \| Set `gateway.reload.mode` to control reload behavior (default `hybrid`, or `hot`, `restart`, `off`). \| Do not assume manual restarts are needed for most settings when hot reload is enabled. \| Understand how `hybrid`, `hot`, `restart`, and `off` affect whether a restart is performed on changes.                                                     |
| candidate-3 | 73c2bb30-9528-5e26-9427-ee2d2dd9ccc7 | admitted_to_batch |   7 |    1 |      6 | write    | write_structural_accept, collision_distinct                         | Hybrid hot reload restart behavior by config category \| In `hybrid` mode, rely on automatic restarts for `gateway.*` changes and for infrastructure fields like `discovery`, `canvasHost`, and `plugins`. \| Do not expect no-restart behavior when changing `gateway.*` or infrastructure fields in `hybrid` mode. \| Separate changes into categories that are safe to hot-apply vs those that require restart. |
| candidate-4 | 73c2bb30-9528-5e26-9427-ee2d2dd9ccc7 | admitted_to_batch |   7 |    1 |      6 | write    | write_structural_accept, collision_distinct                         | Rate limiting for control-plane write RPCs \| Throttle control-plane write RPC calls (`config.apply`, `config.patch`, `update.run`) to avoid hitting the limit. \| Do not exceed 3 requests per 60 seconds per `deviceId+clientIp`, since the RPC will return `UNAVAILABLE`. \| Handle `UNAVAILABLE` responses that include `retryAfterMs` when rate-limited.                                                      |
| candidate-5 | 11bc30c5-5c8a-5fa8-b0c8-511dd73336ec | admitted_to_batch |   7 |    1 |      6 | write    | write_structural_accept, collision_distinct                         | Restart requests coalescing and cooldown \| When issuing restart requests while a restart is already pending/in-flight, expect them to be coalesced; ensure restart cycles are spaced by at least 30 seconds to avoid cooldown-related behavior. \| Be able to schedule or debounce restart requests to account for a 30-second cooldown between restart cycles.                                                   |
| candidate-6 | 11bc30c5-5c8a-5fa8-b0c8-511dd73336ec | admitted_to_batch |   7 |    1 |      6 | write    | write_structural_accept, collision_distinct                         | Environment variable loading order and precedence \| Set environment variables in the parent process first; if you provide `.env` in the current working directory or `~/.openclaw/.env`, they will be read in addition to parent-process env vars but will not override already-set env vars. \| Ensure desired env vars are not already defined in the parent process if you want `.env` files to supply them.   |
| candidate-7 | 11bc30c5-5c8a-5fa8-b0c8-511dd73336ec | admitted_to_batch |   7 |    1 |      6 | write    | write_structural_accept, collision_distinct, review_mode_overridden | Config string env substitution syntax, failure mode, and escaping \| Use `${VAR_NAME}` in config string values only with uppercase variable names matching `[A-Z_][A-Z0-9_]*`; do not rely on missing/empty vars since they throw an error at load time; use `$${VAR}` when you need literal output. \| Be able to provide required uppercase env vars at load time and apply `$${VAR}` escaping for literal text. |

## rerun_2

- Object delta: 3
- Support delta: 3
- Captured claims: 3
- Collision model calls: 0
- Bounded candidate adjudication cases: 3
- Write decisions: {"write":3}

| Candidate   | Window                               | Gate                | Raw | Kept | Pruned | Decision | Codes                                                               | Object                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------- | ------------------------------------ | ------------------- | --: | ---: | -----: | -------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| candidate-0 | 11bc30c5-5c8a-5fa8-b0c8-511dd73336ec | zero_candidate_skip |   0 |    0 |      0 | write    | write_structural_accept, collision_distinct                         | config.apply and config.patch restart coalescing \| Coalesce restart requests while one is already pending/in-flight, and enforce a 30-second cooldown between restart cycles. \| Detect an in-flight pending restart request and apply a 30-second cooldown to subsequent restart cycles.                                                                                                                                                                                                                                                      |
| candidate-1 | 11bc30c5-5c8a-5fa8-b0c8-511dd73336ec | zero_candidate_skip |   0 |    0 |      0 | write    | write_structural_accept, collision_distinct                         | OpenClaw environment variable loading order and override behavior: OpenClaw reads env vars from the parent process plus `.env` from the current working directory (if present) and `~/.openclaw/.env` as a global fallback; neither file overrides existing env vars.                                                                                                                                                                                                                                                                           |
| candidate-2 | 11bc30c5-5c8a-5fa8-b0c8-511dd73336ec | zero_candidate_skip |   1 |    0 |      1 | write    | write_structural_accept, collision_distinct, review_mode_overridden | Env var substitution in config string values \| Use `${VAR_NAME}` for uppercase env var names matching `[A-Z_][A-Z0-9_]*`; ensure required variables are present and non-empty to avoid load-time errors; escape `${VAR}` as `$${VAR}` for literal output. \| Do not use non-matching variable names or rely on missing/empty env vars, since they cause errors at load time. \| Validate `${VAR_NAME}` tokens against the allowed uppercase-name pattern and resolve them during config load; implement `$${VAR}` escaping for literal output. |
