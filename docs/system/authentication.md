---
summary: "Canonical authentication path register and proof entrypoint for OpenClaw runtime services."
title: "Authentication"
---

# Authentication

Treat auth discovery as topology, not tribal memory.

Canonical register:

1. [Auth Paths Registry](/system/registries/auth-paths)
2. `node scripts/check-auth-sources.mjs`

This register records where credentials are expected to live, who owns each
auth surface, and how to prove that the path exists without exposing the
secret value.

## Covered services

- OpenAI Codex
- OpenRouter
- Supabase
- Brave
- Firecrawl
- GitHub
- n8n
- Telegram

## Rules

- do not store secret values in docs
- record path ownership and precedence when more than one path exists
- prefer the runtime auth store or canonical state path over ad hoc shell env
- use the checker for redacted proof instead of grepping random files

## Compatibility

The older first-pass auth docs under [Auth](/system/auth) and
`docs/system/registries/auth-sources.yaml` remain compatibility surfaces, but
`authentication.md` and `auth-paths.yaml` are now the canonical names.
