---
summary: "Stable decisions for the deployment-topology project."
title: "Deployment Topology Decisions"
---

# Deployment Topology Decisions

## 2026-04-16 - deployment topology deserves its own project workspace

- VPS/runtime consolidation, git/auth posture, and build hygiene have enough
  durable surface area to justify a dedicated project workspace
- this material should no longer remain nested under `model-memory`

## 2026-04-16 - one canonical repo/container/image remains the target posture

- runtime sprawl is treated as drift
- cleanup should remain measured and reversible
- runtime inventory policy stays aligned with `docs/system/deployment.md`

## 2026-04-16 - host cron is a first-class deployment surface

- the live VPS does not rely on OpenClaw-native cron alone
- host cron scripts that still drive live delivery, hygiene, backup, and audit
  flows must be inventoried as part of deployment topology
- disabled historical host cron entries should remain explicit instead of being
  silently forgotten

## 2026-04-16 - keep standalone channel identity archived unless live runtime use returns

- the old `projects/channel_identity/` surface does not come back as its own
  canonical project workspace in this slice
- the active account-specific subset already absorbed by `x-manager` context
  stays canonized there
- the broader framework remains archive evidence unless a future live runtime
  lane proves it needs a dedicated project again
