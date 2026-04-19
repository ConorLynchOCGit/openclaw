---
summary: "Deployment-topology view of canonical auth path resolution, precedence, and proof."
title: "Auth Resolution Register"
---

# Auth Resolution Register

## Purpose

Record where live runtime auth is expected to come from so Codex, OpenClaw, and
operators stop rediscovering the same paths during live debugging.

## Canonical durable surfaces

- [Authentication](/system/authentication)
- [Auth Paths Registry](/system/registries/auth-paths)
- `node scripts/check-auth-sources.mjs`

## Resolution policy

For each provider, the register must state:

- canonical auth path or paths
- owner
- precedence order
- whether the surface is runtime-managed, human-managed, or external
- one redacted proof command

## Important runtime lesson

The register is a discovery surface, not automatic hydration.

If a detached runner rewrites its config root or fails to load the canonical
state env/auth store, auth can still be missing at runtime even though the
register is correct. That exact failure mode already happened during the
benchmark harness pass.
