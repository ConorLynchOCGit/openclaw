---
summary: "Roadmap for expanding Turbo from a narrow lane into a real OpenClaw workspace graph."
title: "Turborepo Roadmap"
---

# Turborepo Roadmap

## Phase 1 - bootstrap and inventory

- initialize the project workspace
- document the starting truth
- inventory workspace package task ownership

## Phase 2 - decompose root monoliths

- identify which root-owned tasks can move to package ownership
- separate truly root-global checks from package-local checks
- define transitional wrappers where necessary

## Phase 3 - expand the Turbo graph

- grow `turbo.json` beyond the UI lane
- define real package task inputs and outputs
- adopt caching only where outputs are real and stable

## Phase 4 - validate landing-gate mapping

- prove how:
  - `pnpm check`
  - `pnpm test`
  - `pnpm build`
    map onto the expanded graph
- keep CI and local landing expectations explicit

## Phase 5 - operationalize on the VPS

- measure actual time and cache wins
- align PNPM hygiene with the new task graph
- keep host-side cache usage and cleanup explicit
