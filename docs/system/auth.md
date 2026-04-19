---
summary: "Canonical auth-source overview for OpenClaw and Codex-adjacent runtime surfaces."
title: "Auth"
---

# Auth

OpenClaw now treats auth discovery as a topology problem, not a memory test.

Use the auth registry and checker instead of grepping random files:

1. [Auth Sources Registry](/system/registries/auth-sources)
2. `node scripts/check-auth-sources.mjs`

## Why this exists

Codex and OpenClaw repeatedly lost time rediscovering where live credentials
were actually sourced from.

The problem was not only missing secrets. It was missing source-of-truth
discovery:

- env-backed providers live in the state env file and config secret refs
- OAuth-backed providers can live in runtime auth stores
- some external systems are repo-adjacent but not repo-owned
- different runtime surfaces use different precedence paths

The registry is the durable map. The checker is the redacted proof surface.

Important limit:

- the registry and checker are discovery/proof surfaces, not automatic runtime
  credential hydration
- runtime code still has to load auth from the correct canonical env/auth-store
  paths
- if a runner rewrites its config path or process environment incorrectly, the
  registry alone will not save that run

## Scope

The current registry covers at minimum:

- OpenAI Codex
- OpenRouter
- Brave
- Firecrawl
- Supabase
- GitHub
- n8n
- Telegram

## Model-memory note

Live model-memory is currently wired to the Supabase-hosted database surface.

Its default live model path still uses `openrouter/openai/gpt-5.4-nano`.

That is deliberate for now: the local OpenClaw catalog exposes
`openai-codex/gpt-5.4`, `openai-codex/gpt-5.4-pro`, and
`openai-codex/gpt-5.4-mini`, but not `openai-codex/gpt-5.4-nano`.

If Codex-native nano is added later, update the registry and then move the
model-memory default.

## Current runtime lesson

The April 18 benchmark runner auth miss was not a registry failure. It was a
runtime-loading failure.

Root cause:

- the benchmark runner wrote a sanitized temp config
- `OPENCLAW_CONFIG_PATH` then resolved relative dotenv loading against that temp
  directory instead of the live runtime state directory
- OpenRouter env auth was therefore never hydrated into the runner process

Fix:

- the runner now explicitly loads the state env file from the canonical config
  directory before parsing the sanitized config

Implication:

- keep the auth registry as the durable discovery map
- also treat canonical auth loading as a runtime contract that each detached or
  sanitized runner must honor explicitly
