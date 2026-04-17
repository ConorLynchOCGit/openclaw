---
summary: "Secret-safe canonical representation of the live deployment config layer."
title: "Live Config Representation"
---

# Live Config Representation

## Purpose

Represent the live deployment config layer durably without committing raw
secrets or mutable host snapshots wholesale.

## Ownership model

Repo-owned surfaces:

- committed runtime code and docs
- `docker-compose.yml`
- committed ops assets under `ops/`
- durable topology and runbook docs under `docs/projects/deployment-topology/`

Host-owned mutable surfaces:

- OpenClaw secrets and auth tokens
- mutable environment files
- mutable runtime state and device/session stores

## Mount and layout contract

- the runtime image is built from the canonical repo
- persistent OpenClaw state lives outside the repo on host-mounted storage
- host cron invokes committed repo-owned scripts for active operational lanes
- secret material stays outside committed docs and example config

## Secret-safe example shape

```json
{
  "browser": {
    "headless": true,
    "noSandbox": true,
    "defaultProfile": "openclaw"
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "provider/model"
      }
    }
  },
  "plugins": {
    "entries": {
      "browser": {
        "enabled": true
      },
      "brave": {
        "enabled": true
      },
      "firecrawl": {
        "enabled": true
      }
    }
  }
}
```

## Canonical rule

- commit ownership and shape
- do not commit live secrets
- do not treat the mutable host config directory as a repo mirror
- use redacted snapshots and docs to explain the live layout, not to replace
  secret management
