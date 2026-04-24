---
summary: "Canonical git remote and GitHub CLI posture for the deployment host."
title: "Git And Auth Posture"
---

# Git And Auth Posture

- use the clean integration repo only for fetch/rebase against upstream-derived
  core
- use the downstream product repo as the default push target
- keep the legacy fork push-disabled
- keep docs-sync/publish credentials off the integration repo and off the
  legacy fork; they belong on the downstream product repo only
- keep the legacy fork visibly marked as legacy-only while it remains retained
- keep GitHub CLI on SSH-backed auth
