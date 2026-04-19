---
summary: "Active implementation slice for the Turborepo workspace project."
title: "Turborepo Current Slice"
---

# Turborepo Current Slice

## Active slice

`slice_4_root_gate_decomposition_live_and_next_owners`

## In this slice

- keep the bounded package graph real:
  - UI `build` / `test` / `check`
  - diffs `build` / `test`
- keep root `check`, `test`, and `build` on the explicit Turbo-managed stage
  graph now in place
- avoid double-running newly package-owned lanes inside the root full-suite test
  path
- record exactly what is still root-owned by design

## Exit criteria

- the root wrappers clearly split Turbo-owned package work from root-global work
- the repo has a durable audit separating real Turbo value from still-root-owned
  work
- the root gates themselves no longer depend on opaque monolithic shell bodies

## Immediate next slice

`slice_5_workspace_task_inventory_and_broader_package_ownership`

Deliverables:

- enumerate broader workspace packages
- record current `build`, `test`, and `check` ownership beyond UI and diffs
- classify additional package-task readiness
- identify the next honest candidates for Turbo ownership
