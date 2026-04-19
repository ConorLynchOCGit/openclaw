---
summary: "Audit of current test/build slowness, PNPM churn, and the bounded Turbo expansion chosen in this sprint."
title: "PNPM Turbo Build Optimization Audit"
---

# PNPM Turbo Build Optimization Audit

## Current diagnosis

The slow path was not one thing. It was three separate classes of cost:

1. Vitest and Rolldown startup/transform cost on repeated targeted runs
2. weak reuse of module-cache paths outside the full-suite parallel path
3. Turbo existing mostly as a UI-only wrapper instead of a real package-task
   graph

## Evidence

### Vitest startup dominates many targeted runs

- Observed behavior:
  - even small targeted runs spent most of their time in transform/import
    startup
- Direct example from this pass:
  - `pnpm exec vitest run src/auto-reply/reply/dispatch-from-config.test.ts src/agents/pi-embedded-subscribe.handlers.tools.test.ts`
    reported `Duration 7.99s`
  - transform time alone was `4.91s`
- Cost type:
  - transform startup
  - repeated cold-ish execution overhead

### Scoped runs were not getting the same explicit cache-path shaping as the full suite

- Surface:
  - `scripts/test-projects.mjs`
  - `scripts/run-vitest.mjs`
- Previous behavior:
  - explicit `OPENCLAW_VITEST_FS_MODULE_CACHE_PATH` shaping was only applied to
    the parallel full-suite lane
  - direct `run-vitest` calls and ordinary scoped `test-projects` runs relied
    on weaker defaults
- Cost type:
  - repeated transform work
  - cache miss or cache-path instability

### Turbo coverage was real but too narrow

- Surface:
  - `turbo.json`
  - root scripts
  - workspace package scripts
- Previous behavior:
  - Turbo tasks existed only as `turbo:build` and `turbo:test`
  - those were effectively UI-only
  - `turbo:test` caching was explicitly disabled
  - `extensions/diffs` did not expose a standard package `build` task
- Cost type:
  - weak orchestration reuse
  - avoidable PNPM wrapper churn

### UI Turbo entrypoints added extra PNPM indirection

- Surface:
  - `ui/package.json`
- Previous behavior:
  - `turbo:build` and `turbo:test` shell out through `pnpm --filter ... exec`
    from inside the package
- Cost type:
  - avoidable process churn

## Fixes chosen now

### Stable cache paths for direct Vitest runs

- File:
  - `scripts/run-vitest.mjs`
- Change:
  - direct `run-vitest` invocations now derive a stable
    `OPENCLAW_VITEST_FS_MODULE_CACHE_PATH` outside CI and outside Windows unless
    an explicit path is already set
- Why:
  - repeated targeted runs now reuse the same module-cache location instead of
    depending on weaker defaults

### Stable cache paths for ordinary scoped `test-projects` runs

- File:
  - `scripts/test-projects.mjs`
- Change:
  - cache-path shaping now applies to all run specs, not just the full-suite
    parallel path
- Why:
  - root `pnpm test` and scoped file runs now benefit from explicit cache-path
    reuse too

### Honest Turbo expansion to real package tasks

- Files:
  - `turbo.json`
  - `package.json`
  - `ui/package.json`
  - `extensions/diffs/package.json`
- Change:
  - Turbo now operates on standard `build`, `test`, and bounded `check` tasks
  - root scripts now expose:
    - `pnpm turbo:build`
    - `pnpm turbo:check`
    - `pnpm turbo:test`
    - `pnpm turbo:diffs:build`
  - `extensions/diffs` now has a real `build` task
  - `extensions/diffs` now has a real `test` task
  - `ui` now has a real `check` task
  - `ui` no longer uses nested `pnpm --filter ... exec` wrappers for Turbo
- Why:
  - this makes Turbo materially useful for repeated UI and diffs-viewer
    workflows without pretending the root monoliths are decomposed already

### Turbo test caching enabled where outputs are stable

- File:
  - `turbo.json`
- Change:
  - `test` caching is now enabled for package-owned Turbo test tasks
- Why:
  - the existing disabled state left repeated UI-package test work with no
    Turbo reuse at all

### Honest root-wrapper decomposition

- Files:
  - `package.json`
  - `scripts/build-root-gate.mjs`
  - `scripts/check-root-gate.mjs`
  - `scripts/test-root-gate.mjs`
  - `scripts/test-projects.test-support.mjs`
- Change:
  - root `build` now runs Turbo-owned package builds before explicit
    Turbo-managed root build stages
  - root `check` now runs explicit Turbo-managed root check stages plus
    Turbo-owned package checks
  - root `test` now runs Turbo-owned package tests plus explicit Turbo-managed
    root test shards in the full gate
  - targeted `pnpm test -- ...` still routes through the focused root router
- Why:
  - this removes the old opaque root shell chains without pretending the
    shared Vitest graph and repo-global checks belong to packages that do not
    own them

## Deferred on purpose

- broader package ownership decomposition beyond the current honest package set
- Docker/image cleanup as a separate host-hygiene tranche
- aggressive cache retention changes without longer-run host measurements

## Current judgment

The highest-leverage safe path was:

1. fix Vitest cache reuse on the existing monolithic test paths
2. convert Turbo from a narrow wrapper into a small real package-task graph
3. decompose the root gates into explicit Turbo-managed root and package stages

That improves repeated local iteration now without faking a finished repo-wide
Turborepo conversion or fake package ownership.
