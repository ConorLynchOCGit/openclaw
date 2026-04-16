---
summary: "Practical PNPM and build-cache optimization plan for the live OpenClaw VPS."
title: "VPS PNPM And Build Optimization Plan"
---

# VPS PNPM And Build Optimization Plan

## Baseline

- package manager: `pnpm@10.32.1`
- active pnpm store path: `/root/.local/share/pnpm/store/v10`
- explicit `pnpm config get store-dir`: `undefined` (default store path in use)
- explicit `pnpm config get shared-workspace-lockfile`: `undefined`
- current store size after the executed prune: about `2.4G`
- current repo `node_modules` size: about `3.9G`
- current repo `.turbo` directory size: not present in the canonical checkout
- current `/root/.cache` size after the executed prune: about `771M`
- current `/tmp` size after the executed cleanup: about `166M`

Important finding:

- there is no active Turborepo task graph in this repo
- there is no `turbo.json` or `turbo.jsonc` in the canonical checkout
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
4. The VPS had a large PNPM store and broad cache residue. A one-time prune
   materially reduced that footprint without changing runtime behavior.
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

Current status:

- this is already implemented in the canonical `Dockerfile`

### 2. Shrink accidental build context and dirty-tree noise

- ignore `.turbo/`
- ignore `checkpoints/`
- ignore `docker-compose.yml.bak*`
- mirror the local-artifact exclusions into `.dockerignore`

Expected impact:

- cleaner git status on the VPS
- smaller Docker build context
- less operator confusion around local checkpoint debris

Current status:

- the canonical repo already ignores these local artifacts in both `.gitignore`
  and `.dockerignore`

### 3. Prune the PNPM store on the host after large dependency churn

- run `pnpm store prune`
- keep this as explicit host hygiene, not as an every-landing default

Measured impact on this VPS:

- PNPM store: `10G -> 2.4G`
- `/root/.cache`: `1.2G -> 757M`

Current status:

- this was executed in the current continuation

### 4. Keep temp and build-cache hygiene explicit

- remove stale `/tmp/openclaw-test-home-*` and related wrapper temp artifacts
- prune Docker build cache when a build-heavy branch leaves large reclaimable
  residue
- keep active images, active containers, and rollback archives intact

Measured impact on this VPS:

- root filesystem used: `47G -> 37G`
- `/tmp`: `4.3G -> 166M`
- Docker build cache: `8.436G -> 0B`
- unused Docker images removed: `1`

### 5. Keep the validated default full-suite concurrency posture explicit

- the current validated landing posture for the full suite is:
  `OPENCLAW_TEST_PROJECTS_PARALLEL=8 pnpm test`
- do not raise project parallelism beyond this without fresh evidence
- keep the concurrency choice documented as a host/resource decision, not as a
  repo-wide ideology

Current status:

- validated on the live VPS in the current continuation

## Defer for later

### 1. Any Turborepo graph tuning

There is no live Turborepo graph to tune in this repo. Do not invent one just
to satisfy the label.

### 2. Repeat PNPM store pruning on every landing

Do not make `pnpm store prune` part of every landing loop. It is useful after
large dependency churn or when disk pressure rises, but it is not a per-push
gate.

### 3. Any synthetic cache complexity beyond current PNPM and Docker hygiene

Do not add bespoke cache daemons, ad hoc shared stores, or fake Turbo wrappers
without a real measured bottleneck that current PNPM and Docker hygiene cannot
address first.

## Risk notes

- BuildKit cache mounts require Docker BuildKit support. If unavailable, the
  build still works and only loses the cache win.
- Ignoring local checkpoint and backup artifacts must not hide tracked source.
  The chosen patterns target local-only clutter.

## Success criteria

- Docker rebuilds invalidate less often on unrelated edits
- git status is less polluted by local cache and checkpoint artifacts
- the VPS build/test loop is cleaner without adding fragile complexity
