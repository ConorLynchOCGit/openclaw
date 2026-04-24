---
summary: "Canonical VPS git remote and GitHub CLI workflow."
title: "Git And Auth Workflow"
---

# Git And Auth Workflow

Canonical VPS git flow:

1. fetch from the clean integration repo when you need upstream-core changes
2. rebase or merge private `main` on top of `integration/main` as needed
3. validate locally
4. push only to the downstream product/deployment repo
5. deploy only from the canonical repo/container/image path

GitHub CLI posture:

- `gh` should be installed locally on the VPS
- CLI auth should use `gh auth login --hostname github.com --git-protocol ssh`
- `origin` should point at `ConorLynchOCGit/openclaw-platform`
- `integration` should point at `ConorLynchOCGit/openclaw-integration`
- legacy fork pushes should remain disabled
- docs-sync GitHub App or PAT secrets should exist only on
  `ConorLynchOCGit/openclaw-platform`
- `ConorLynchOCGit/openclaw` should stay visibly marked as the legacy
  rollback/reference fork until a later owner decision archives or removes it
