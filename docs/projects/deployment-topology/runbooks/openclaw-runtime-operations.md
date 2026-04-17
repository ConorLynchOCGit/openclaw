---
summary: "Canonical runbook for the private OpenClaw runtime deployment."
title: "OpenClaw Runtime Operations"
---

# OpenClaw Runtime Operations

## Purpose

Describe the live OpenClaw runtime posture and the primary bounded operator
checks for it.

## Runtime shape

- one canonical live repo checkout
- one canonical runtime image
- one canonical runtime container
- persistent OpenClaw state on host-mounted storage
- private admin exposure through the host networking layer

## Core paths

- live repo checkout: `repo-root`
- persistent OpenClaw state: host-owned OpenClaw state directory
- committed ops assets: `ops/`

## Primary checks

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | rg openclaw
curl -sf http://127.0.0.1:28789/healthz
curl -sf http://127.0.0.1:28789/readyz
tailscale serve status
```

## Readiness rule

- `/healthz` is shallow liveness
- `/readyz` is the machine-usable readiness surface
- use `/readyz` for rollout proof and post-change validation

## Current rollout contract

The current live stack now uses the compose build path directly:

```bash
docker compose up -d --build --force-recreate openclaw-gateway
```

Use the published host port from the current compose environment when checking
`/readyz` and `/healthz`; do not assume the container port is the same as the
host-published port.

## Guardrails

- do not redeploy from an unrelated dirty tree
- do not treat pairing/auth experiments as normal production diagnostics
- keep runtime image rollback and runtime-state rollback distinct
