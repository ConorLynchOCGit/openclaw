---
summary: "Audit of what stayed root-global versus what moved into real Turbo-managed package ownership for check, test, and build."
title: "Root Gate Decomposition Audit"
---

# Root Gate Decomposition Audit

## Current judgment

The canonical root gates are now decomposed.

The honest current model is:

- Turbo owns:
  - real package-local work where package ownership already exists
  - explicit root-owned stages where ownership is genuinely repo-global
- root wrappers coordinate those two layers explicitly
- remaining future work is broader workspace ownership extraction, not unfinished
  decomposition of `pnpm check`, `pnpm test`, or `pnpm build`

## Real package ownership today

Currently package-owned tasks exist for:

- `openclaw-control-ui`
  - `build`
  - `test`
  - `check`
- `@openclaw/diffs`
  - `build`
  - `test`

Those are the only package-local owners that were safe to move into the Turbo
graph in this slice.

## Root gate map

### `pnpm check`

Current split:

- Turbo-managed root-owned stages:
  - conflict-marker checks
  - topology checks
  - tool-display check
  - host-env policy check
  - import-cycle checks
  - `tsgo`
  - extension package-boundary artifact prep
  - repo-wide lint and auth lint rules
- Turbo-managed package work:
  - Control UI package `check`

Action taken:

- old monolithic root body moved into explicit `check:root:*` tasks
- root `check` now runs:
  1. `turbo:check:root`
  2. `turbo:check`

Why this is correct:

- the global checks are still genuinely repo-global
- those checks now still run through Turbo with explicit stage names
- Control UI local checks now run at the package owner instead of staying
  hidden behind root-only scripts

### `pnpm test`

Current split:

- Turbo-managed root-owned stages:
  - the large Vitest shard matrix exposed as explicit `test:root:*` tasks
- Turbo-managed package work:
  - Control UI package tests
  - diffs package tests

Action taken:

- root `test` now runs through `scripts/test-root-gate.mjs`
- full-suite root execution now:
  1. runs `turbo:test`
  2. runs `turbo:test:root`
- targeted `pnpm test -- ...` usage still falls through to the existing root
  Vitest router rather than forcing Turbo into cases it does not own

Why this is correct:

- the repo still has a genuinely root-owned Vitest graph
- that graph is now expressed as explicit Turbo-managed root tasks instead of
  one opaque monolithic root step
- the package-owned UI/diffs lanes execute through Turbo in the full root gate
- targeted root test routing remains stable

### `pnpm build`

Current split:

- Turbo-managed package work:
  - Control UI package build
  - diffs viewer build
- Turbo-managed root-owned stages:
  - root build assembly, stamping, and compatibility sidecars

Action taken:

- old root build body moved into explicit `build:root:*` tasks
- root `build` now runs through `scripts/build-root-gate.mjs`
- root build order is now:
  1. `turbo:build`
  2. `turbo:build:root`

Why this is correct:

- the diffs viewer asset should exist before the root postbuild copy stage
- UI and diffs are real package owners
- the remaining build pipeline is still a root-owned assembly path, but it is
  now decomposed into explicit Turbo-managed root stages

## What remained root-global on purpose

These steps were not forced into packages:

- doc topology and runtime inventory checks
- repo-wide auth and webhook lint rules
- `tsgo`
- plugin-sdk export checks
- root build assembly and runtime stamping
- the large shared Vitest shard matrix

Those remain root-owned because their ownership is genuinely global today.
They are no longer a decomposition gap.

## What changed materially in this slice

- root `check` is no longer only one root command body
- root `check` now executes explicit Turbo-managed root stages plus package
  checks
- root `test` now executes explicit Turbo-managed root shards plus package tests
- root `build` now executes explicit Turbo-managed root build stages plus
  package builds
- Turbo is no longer only an optional side loop for repeated local work

## Follow-on work

Still open:

- broader package task inventory and ownership extraction
- more package-local `check`/`test`/`build` tasks outside UI and diffs
- more precise root-global versus package-local classification for additional
  generators and checks

This slice closes the root-gate decomposition pass. It does not pretend the repo
is already fully package-owned.

## Next tranche sketch: broader package ownership extraction

The next tranche is not more root-wrapper work. It is ownership extraction.

The job is to identify repo areas that already behave like real packages or
bounded graph owners and give them explicit `check`, `test`, and `build`
surfaces instead of keeping them inside root-owned execution.

What that should include:

- a workspace-wide ownership inventory across:
  - `extensions/*`
  - `packages/*`
  - `ui`
  - any bounded tool/runtime surfaces that already have clear artifact or test
    boundaries
- classification of each candidate as:
  - package-ready now
  - needs minor script extraction
  - still genuinely root-owned
- extraction of explicit task owners where one directory already owns:
  - its build artifact
  - its tests
  - its lint/check contract
- task-graph definitions that preserve dependency ordering instead of
  reintroducing root shell chains

Likely first candidates after this slice:

- additional `extensions/*` packages with bounded test/build surfaces
- repo-owned support packages under `packages/*`
- any runtime/admin surfaces that already have isolated test configs or output
  boundaries

What should stay root-owned until proven otherwise:

- topology and registry checks
- import-mount and bootstrap-mapping checks
- repo-wide lint rules
- shared generators with repo-global side effects
- root assembly and stamping stages

Suggested execution order:

1. build the full workspace task inventory
2. identify the next three to five honest package owners
3. extract their `check` / `test` / `build` scripts locally
4. wire those owners into `turbo.json`
5. remove duplicate execution from root paths
6. rerun root gates and compare scope, time, and cache reuse

Success criteria for that tranche:

- more real work runs under package ownership
- root gates shrink because ownership moved, not because checks were weakened
- Turbo cache hits matter on repeated developer loops
- the remaining root-owned work is explicit and justified
