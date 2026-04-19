---
summary: "Current status for the Turborepo workspace project."
title: "Turborepo Status"
---

# Turborepo Status

## Overall

State: `bounded_package_graph_with_root_wrapper_decomposition`

The repo no longer has only the minimum Turbo bootstrap.

- `turbo` installed at the root
- `turbo.json` present
- standard `build`, `test`, and `check` Turbo tasks now defined
- current package-owned Turbo graph now covers:
  - `openclaw-control-ui`
  - `@openclaw/diffs`
  - Control UI `check`
- root wrapper gates now split explicit package-owned work from root-global
  work:
  - `pnpm check`
  - `pnpm test`
  - `pnpm build`

This is still not a repo-wide Turbo landing graph. It is a bounded but real
implementation step, and the canonical root gates are now decomposed rather
than left as opaque monoliths.

## Current status

What exists now:

- root dependency on `turbo`
- root scripts:
  - `pnpm turbo:build`
  - `pnpm turbo:check`
  - `pnpm turbo:test`
  - `pnpm turbo:diffs:build`
  - `pnpm turbo:ui:build`
  - `pnpm turbo:ui:test`
  - root wrapper entrypoints:
    - `pnpm build`
    - `pnpm check`
    - `pnpm test`
- package-owned Turbo task entrypoints:
  - UI `build`
  - UI `check`
  - UI `test`
  - diffs viewer `build`
  - diffs viewer `test`
- root-owned Turbo task entrypoints:
  - explicit `check:root:*` stages
  - explicit `test:root:*` shards
  - explicit `build:root:*` stages
- Turbo test caching enabled for package-owned test tasks
- durable project docs under `docs/projects/turborepo/`
- retained build-performance planning now folded into
  `docs/projects/turborepo/specs/legacy-build-performance-surface.md`

What does not exist yet:

- a repo-wide package task inventory
- broad package ownership beyond UI and diffs
- a broad workspace Turbo graph beyond the currently honest package set
- package ownership for many still-root-owned generators, checks, and build
  assembly stages

## Active blocker

The main remaining blocker is structural, not installation-level:

- Turbo can only orchestrate what the repo exposes as real package-owned tasks
- the repo still centralizes too much verification and build ownership at the
  root
- the next work is ownership extraction, not more root-gate decomposition

## Next move

Execute the project specs in order:

1. keep the current root-gate graph stable and measured
2. execute [Workspace Task Inventory](/projects/turborepo/specs/workspace-task-inventory)
3. continue [Root Gate Decomposition](/projects/turborepo/specs/root-gate-decomposition) only for
   newly extracted owners, not for the already-decomposed root gates
4. expand [Turbo Workspace Graph](/projects/turborepo/specs/turbo-workspace-graph) only where
   package ownership becomes real
