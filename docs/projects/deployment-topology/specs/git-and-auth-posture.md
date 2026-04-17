---
summary: "Canonical git remote and GitHub CLI posture for the deployment host."
title: "Git And Auth Posture"
---

# Git And Auth Posture

- use upstream only for fetch/rebase
- use the private deployment repo as the default push target
- keep upstream push disabled
- keep GitHub CLI on SSH-backed auth
