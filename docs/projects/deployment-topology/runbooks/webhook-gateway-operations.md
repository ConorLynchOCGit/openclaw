---
summary: "Canonical runbook for the webhook-gateway service and host probe lane."
title: "Webhook Gateway Operations"
---

# Webhook Gateway Operations

## Purpose

Describe the bounded operator checks and committed probe assets for the
webhook-gateway lane.

## Current shape

- webhook ingress is a separate host service
- live probes are committed under `ops/host/`
- the active daily probe lane is:
  - `ops/host/n8n_sync_check.sh`
  - `ops/host/db_probe.sh`

## Primary checks

```bash
docker compose ps
docker compose logs --tail=100 n8n
docker compose logs --tail=100 caddy
curl -i -X POST http://127.0.0.1:38080/webhook/intake
curl -i http://127.0.0.1:38080/not-webhook
```

## Routing rule

- only `/webhook/*` is proxied to the workflow service
- non-webhook paths should return `404`
- unauthorized `POST /webhook/intake` is a valid non-destructive ingress
  sentinel

## Probe rule

- keep the live probe scripts repo-owned
- keep host cron pointed at the committed copies under `ops/host/`
- treat unmanaged host-only probe scripts as drift
