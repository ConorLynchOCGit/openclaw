---
summary: "Canonical PNPM/cache/build-hygiene posture for the live deployment host."
title: "PNPM And Build Hygiene"
---

# PNPM And Build Hygiene

This repo does not pretend there is a full Turborepo task graph when there is
not one.

The real optimization lane for the deployment host is:

- PNPM store/cache hygiene
- build/test concurrency hygiene
- repo-local artifact cleanup
- Docker/build-cache hygiene where justified
- targeted Vitest cache reuse on the still-root-owned test paths
- bounded Turbo expansion only where task ownership is real

Durable references:

- keep one canonical deployment path
- keep verification reproducible
- avoid fragile caching machinery for cosmetic wins
- do decompose the root landing gates into explicit Turbo-managed stages when
  the owner is still the repo root
- do use Turbo for package-owned loops where it materially cuts repeated work

Current implementation truth:

- `scripts/run-vitest.mjs` now assigns stable module-cache paths for direct
  local runs when no explicit path is set
- `scripts/test-projects.mjs` now applies explicit cache-path shaping to all run
  specs, not only the full parallel suite
- `turbo.json` now owns real `build`, `test`, and bounded `check` tasks instead
  of the previous narrow custom wrapper names
- current package-owned Turbo graph is still intentionally small:
  - `openclaw-control-ui`
  - `@openclaw/diffs`
- root gates now use explicit Turbo-managed stages instead of opaque shell
  chains:
  - `pnpm build` runs:
    - Turbo-managed package builds
    - Turbo-managed root build stages
  - `pnpm test` runs:
    - Turbo-managed package tests
    - Turbo-managed root test shards
    - targeted file/path runs still route through the focused root test router
  - `pnpm check` runs:
    - Turbo-managed root check stages
    - Turbo-managed package checks

Reference audit:

- [PNPM Turbo Build Optimization Audit](/projects/deployment-topology/pnpm-turbo-build-optimization-audit)
