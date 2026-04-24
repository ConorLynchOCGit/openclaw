---
summary: "Durable maintainer workflow for private OpenClaw pushes, upstream rebases, and GitHub CLI auth on the VPS."
title: "VPS Git Remote And Auth Workflow"
---

# VPS Git Remote And Auth Workflow

## Goal

Keep the VPS on one unambiguous git workflow:

- fetch upstream-derived core through the clean integration repo
- push only to the canonical downstream repo
- keep legacy fork pushes disabled
- keep CLI auth on SSH-compatible GitHub CLI settings

## Canonical remote posture

The live repo should use:

- `origin` = canonical downstream repo
- `integration` = clean upstream integration repo
- `fork-legacy` = disabled rollback/reference surface

Expected remote shape:

```bash
fork-legacy DISABLED (fetch)
fork-legacy DISABLED (push)
integration git@github.com:ConorLynchOCGit/openclaw-integration.git (fetch)
integration DISABLED (push)
origin      git@github.com:ConorLynchOCGit/openclaw-platform.git (fetch)
origin      git@github.com:ConorLynchOCGit/openclaw-platform.git (push)
```

Required git config:

```bash
git branch --set-upstream-to=origin/main main
git config remote.pushDefault origin
```

## Why this posture exists

- upstream-derived OpenClaw core should arrive through the clean integration
  surface, not through a downstream repo that is still trapped in the fork
  network
- the downstream repo is the only repo that should receive VPS landing pushes
- keeping the legacy fork disabled prevents accidental pushes back into the old
  mixed-identity repository

## Canonical maintainer flow

1. Sync from the clean integration surface:

```bash
git fetch integration
```

2. Rebase the private `main` on top of the clean integration branch:

```bash
git rebase integration/main
```

3. Run the required local validation.

4. Push only to the canonical downstream repo:

```bash
git push origin main
```

5. Deploy only from the downstream repo / canonical container / canonical
   image.

## Remote safety commands

If the remotes ever drift, restore them with:

```bash
git remote rename origin fork-legacy
git remote set-url fork-legacy DISABLED
git remote set-url --push fork-legacy DISABLED
git remote remove upstream
git remote add origin git@github.com:ConorLynchOCGit/openclaw-platform.git
git remote add integration git@github.com:ConorLynchOCGit/openclaw-integration.git
git remote set-url --push integration DISABLED
git branch --set-upstream-to=origin/main main
git config remote.pushDefault origin
```

Afterward, verify:

```bash
git remote -v
git branch -vv
```

## GitHub CLI posture

Keep git transport on SSH for CLI-backed git operations:

```bash
gh auth login --hostname github.com --git-protocol ssh
```

Verification:

```bash
gh --version
gh auth status
```

If the VPS has no approved GitHub credential available yet, the remaining
operator step is exactly:

```bash
gh auth login --hostname github.com --git-protocol ssh
```

This does not change the git remote push URLs. It only prepares GitHub CLI
operations such as repo inspection and release/PR tooling.
