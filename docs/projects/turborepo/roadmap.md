---
summary: "Roadmap for expanding Turbo from a narrow lane into a real OpenClaw workspace graph."
title: "Turborepo Roadmap"
---

# Turborepo Roadmap

## Phase 1 - bootstrap and inventory

- initialize the project workspace
- document the starting truth
- inventory workspace package task ownership

## Phase 2 - bounded package graph activation

- convert Turbo from a narrow wrapper into standard package `build` and `test`
  tasks
- keep the first graph limited to packages that already own real work
- prove cache reuse and repeated-loop value before broader expansion

## Phase 3 - decompose root monoliths

- expose explicit Turbo-managed root stages for still-root-owned work
- identify which root-owned tasks can move to package ownership
- separate truly root-global checks from package-local checks
- keep newly package-owned lanes from being double-run inside root wrappers

## Phase 4 - expand the Turbo graph

- grow `turbo.json` beyond the UI lane
- define real package task inputs and outputs
- adopt caching only where outputs are real and stable
- expand package ownership only after the root-stage graph is already explicit

## Phase 5 - validate landing-gate mapping

- prove how:
  - `pnpm check`
  - `pnpm test`
  - `pnpm build`
    map onto the expanded graph
- keep CI and local landing expectations explicit

## Phase 6 - operationalize on the VPS

- measure actual time and cache wins
- align PNPM hygiene with the new task graph
- keep host-side cache usage and cleanup explicit

## Phase 7 - Turbo-first local gate cutover

- switch local `pnpm test` to Turbo-first orchestration only after package
  ownership is broad enough to make the graph selective
- keep root wrappers only for work that is still honestly root-global
- remove double-running between package-owned lanes and root shard wrappers
- benchmark repeated local developer loops against the current custom
  `scripts/test-projects.mjs` path before declaring victory
- require docs and implementation to stay in lockstep for local gate behavior
