---
summary: "Canonical git remote and GitHub CLI posture for the deployment host."
title: "Git And Auth Posture"
---

# Git And Auth Posture

- use the clean integration repo only for fetch/rebase against upstream-derived
  core
- use the downstream product repo as the default push target
- keep the legacy fork push-disabled
- keep downstream docs workflows same-repo; do not reintroduce a cross-repo
  docs publish credential unless a future owned docs host actually requires it
- keep the legacy fork visibly marked as legacy-only while it remains retained
- keep GitHub CLI on SSH-backed auth
