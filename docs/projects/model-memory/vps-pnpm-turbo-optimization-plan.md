---
summary: "Practical PNPM and build-cache optimization plan for the live OpenClaw VPS."
title: "VPS PNPM And Build Optimization Plan"
---

# VPS PNPM And Build Optimization Plan

## Baseline

- package manager: `pnpm@10.23.0`
- active pnpm store path: `/root/.local/share/pnpm/store/v10`
- current store size: about `8.0G`
- current repo `node_modules` size: about `2.2G`
- current repo `.turbo` directory size: about `73M`
- current `/root/.cache` size: about `1.2G`

Important finding:

- there is no active Turborepo task graph in this repo
- there are no `turbo` dependencies or `turbo run` scripts in `package.json`
- optimization should focus on PNPM, Docker layer stability, and cache hygiene

## Current bottlenecks

1. Docker dependency layers invalidate too easily.
   The image build copied `scripts/` before `pnpm install`, so unrelated script
   edits could force a fresh dependency-install layer.
2. Docker builds did not use a PNPM store cache mount.
   That makes repeated image builds pay the install cost too often.
3. The repo did not ignore `.turbo/`, `checkpoints/`, or compose backup files.
   That creates noisy dirty trees and larger-than-needed Docker build contexts.
4. The VPS has a large PNPM store, but current disk pressure is not high enough
   to justify aggressive store pruning as a default policy.
5. Roughly `22.4%` of sampled default unit-lane wall time was still being spent
   on the retired legacy-memory stack under `src/memory/**`. That work now
   lives behind `pnpm test:legacy-memory` instead of the default `pnpm test` lane.

## Implement now

### 1. Stabilize Docker dependency caching

- stop copying `scripts/` into the dependency-install layer
- use a BuildKit cache mount for the PNPM store during `pnpm install`

Expected impact:

- repeated `docker build` runs reuse dependency layers more often
- dependency installation is less sensitive to unrelated script changes

### 2. Shrink accidental build context and dirty-tree noise

- ignore `.turbo/`
- ignore `checkpoints/`
- ignore `docker-compose.yml.bak*`
- mirror the local-artifact exclusions into `.dockerignore`

Expected impact:

- cleaner git status on the VPS
- smaller Docker build context
- less operator confusion around local checkpoint debris

## Defer for later

### 1. Aggressive PNPM store pruning

Current state does not justify always pruning the store immediately. The host is
not under disk pressure.

Defer to:

- the existing monthly cache hygiene policy
- manual prune when disk pressure actually rises

### 2. Any Turborepo graph tuning

There is no live Turborepo graph to tune in this repo. Do not invent one just
to satisfy the label.

## Risk notes

- BuildKit cache mounts require Docker BuildKit support. If unavailable, the
  build still works and only loses the cache win.
- Ignoring local checkpoint and backup artifacts must not hide tracked source.
  The chosen patterns target local-only clutter.

## Success criteria

- Docker rebuilds invalidate less often on unrelated edits
- git status is less polluted by local cache and checkpoint artifacts
- the VPS build/test loop is cleaner without adding fragile complexity
