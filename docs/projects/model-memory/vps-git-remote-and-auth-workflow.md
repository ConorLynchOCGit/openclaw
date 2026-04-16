---
summary: "Durable maintainer workflow for private OpenClaw pushes, upstream rebases, and GitHub CLI auth on the VPS."
title: "VPS Git Remote And Auth Workflow"
---

# VPS Git Remote And Auth Workflow

## Goal

Keep the VPS on one unambiguous git workflow:

- fetch and rebase from upstream OpenClaw core
- push only to the private deployment repo
- keep upstream pushes disabled
- keep CLI auth on SSH-compatible GitHub CLI settings

## Canonical remote posture

The live repo should use:

- `origin` = private deployment repo
- `upstream` = OpenClaw core fetch source

Expected remote shape:

```bash
origin   git@github.com:ConorLynchOCGit/openclaw.git (fetch)
origin   git@github.com:ConorLynchOCGit/openclaw.git (push)
upstream https://github.com/openclaw/openclaw.git (fetch)
upstream DISABLED (push)
```

Required git config:

```bash
git branch --set-upstream-to=origin/main main
git config remote.pushDefault origin
```

## Why this posture exists

- OpenClaw core is the upstream sync source, not the deployment push target.
- The deployment repo is the only repo that should receive VPS landing pushes.
- Disabling upstream pushes prevents accidental attempts to push into
  `openclaw/openclaw`.

## Canonical maintainer flow

1. Sync from upstream core:

```bash
git fetch upstream
```

2. Rebase the private `main` on top of upstream:

```bash
git rebase upstream/main
```

3. Run the required local validation.

4. Push only to the private repo:

```bash
git push origin main
```

5. Deploy only from the private repo / canonical container / canonical image.

## Remote safety commands

If the remotes ever drift, restore them with:

```bash
git remote rename origin upstream
git remote rename conor origin
git remote set-url --push upstream DISABLED
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
