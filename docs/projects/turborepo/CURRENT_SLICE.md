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
- extract tiny high-frequency proof seams out of ad hoc focused Vitest runs
  when they do not need the full Vitest fixture stack

## Exit criteria

- the root wrappers clearly split Turbo-owned package work from root-global work
- the repo has a durable audit separating real Turbo value from still-root-owned
  work
- the root gates themselves no longer depend on opaque monolithic shell bodies
- the repo has at least one concrete lightweight narrow-seam lane that reduces
  repeated focused Vitest startup churn without weakening proof authority
- the repo has at least one additional lightweight lane for deterministic
  model-memory bootstrap projection selection without using a full Vitest boot
- the repo has a deterministic lightweight lane for resolved bootstrap context
  assembly, including appended generated `memory-md` artifact ordering

## Immediate next slice

`slice_5_workspace_task_inventory_and_broader_package_ownership`

Deliverables:

- enumerate broader workspace packages
- record current `build`, `test`, and `check` ownership beyond UI and diffs
- classify additional package-task readiness
- identify the next honest candidates for Turbo ownership

## Future pass - Turbo-first full package ownership

`slice_6_turbo_first_root_gate_cutover`

This future pass is the point where local landing gates stop treating the
custom root scheduler as the primary path and start treating Turbo as the first
orchestrator for the full owned graph.

Preconditions:

- the workspace task inventory is complete
- the next honest package owners are extracted beyond UI and diffs
- package-local `build` / `test` / `check` surfaces exist for enough of the
  current root-heavy graph to make Turbo selectivity real
- duplicate execution between package-owned lanes and root wrappers is removed
- local timing data exists for:
  - `pnpm test`
  - `pnpm build`
  - repeated incremental loops after small scoped edits

Cutover target:

- local `pnpm test` becomes Turbo-first for package-owned work
- local `pnpm build` stays Turbo-first and expands to the broader owned graph
- root wrappers remain only for still-genuinely-root-owned stages
- the custom local Vitest scheduler remains available only for the remaining
  root-owned shard matrix until that ownership is also extracted or proven to be
  better left outside Turbo

Success criteria:

- repeated local loops are faster than the current mixed gate
- Turbo cache hits matter on real developer iteration, not just on paper
- root wrappers get smaller because ownership moved, not because checks were
  weakened
- docs and implementation agree on what `pnpm test` and `pnpm build` actually
  do locally
