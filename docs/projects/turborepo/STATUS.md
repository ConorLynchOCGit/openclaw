---
summary: "Current status for the Turborepo workspace project."
title: "Turborepo Status"
---

# Turborepo Status

## Overall

State: `project_initialized`

The repo now has the minimum Turbo bootstrap in place:

- `turbo` installed at the root
- `turbo.json` present
- narrow UI-scoped Turbo entrypoints available

That is not the final target. It is only the honest starting seam for a larger
workspace-graph project.

## Current status

What exists now:

- root dependency on `turbo`
- root scripts:
  - `pnpm turbo:ui:build`
  - `pnpm turbo:ui:test`
- UI package-owned Turbo task entrypoints
- durable project docs under `docs/projects/turborepo/`
- retained build-performance planning now folded into
  `docs/projects/turborepo/specs/legacy-build-performance-surface.md`

What does not exist yet:

- a repo-wide package task inventory
- decomposed package ownership for the current root monoliths
- a broad workspace Turbo graph
- a validated landing-gate remap for the full repo

## Active blocker

The blocker is structural, not installation-level:

- Turbo can only orchestrate what the repo exposes as real package-owned tasks
- the repo still centralizes too much verification and build ownership at the
  root

## Next move

Execute the project specs in order:

1. [Workspace Task Inventory](/projects/turborepo/specs/workspace-task-inventory)
2. [Root Gate Decomposition](/projects/turborepo/specs/root-gate-decomposition)
3. [Turbo Workspace Graph](/projects/turborepo/specs/turbo-workspace-graph)
4. [Landing Gate Mapping](/projects/turborepo/specs/landing-gate-mapping)
