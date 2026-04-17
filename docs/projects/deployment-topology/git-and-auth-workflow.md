---
summary: "Canonical VPS git remote and GitHub CLI workflow."
title: "Git And Auth Workflow"
---

# Git And Auth Workflow

Canonical VPS git flow:

1. fetch from upstream `main`
2. rebase private `main` on top of upstream
3. validate locally
4. push only to the private deployment repo
5. deploy only from the canonical repo/container/image path

GitHub CLI posture:

- `gh` should be installed locally on the VPS
- CLI auth should use `gh auth login --hostname github.com --git-protocol ssh`
- upstream push should remain disabled
