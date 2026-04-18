# Build Performance Index

Purpose

Dedicated project space for build, test, and runtime-proof workflow design.

Use this project for:

- Turborepo adoption analysis
- `pnpm` workflow and task-graph design
- constrained-host full-suite test throughput planning
- build/runtime proof bottleneck tracking
- migration slice planning for future workflow work

## Current Objective

Determine whether Turborepo should replace, absorb, or sit alongside the
current OpenClaw build/test/runtime workflow.

Current recommendation:

- Turbo should absorb more of build/check orchestration over time.
- Turbo should not replace the constrained-host test scheduler.
- Turbo should not replace runtime proof helpers.
- no broader workflow/perf tranche should proceed until the current full-suite
  `pnpm test` regression is narrowed and corrected

Implementation status:

- safe Turbo skeleton landed in the engineering repo
- canonical gates now route selected build/check phases through Turbo-backed
  wrappers
- UI `build` and `test` are now package-local Turbo tasks
- `@openclaw/diffs` now owns package-local Turbo `build` and `test`
- `@openclaw/memory-host-sdk` now owns a package-local Turbo `test`
- `@openclaw/plugin-package-contract` now owns a package-local Turbo `test`
- remote cache remains repo-default local-only, with explicit opt-in posture
  only for the currently extracted Turbo tasks
- constrained-host test throughput work is now partially implemented alongside
  the Turbo migration
- shared-batch timing artifacts now include file-level decomposition metadata
  and import/setup-versus-test-body dominance where detectable

## Key Engineering Surfaces

- root `package.json`
- `pnpm-workspace.yaml`
- `scripts/run-gate.mjs`
- `scripts/run-landing-gate.mjs`
- `scripts/test-parallel.mjs`
- `scripts/test-planner/executor.mjs`
- `scripts/tsdown-build.mjs`
- `scripts/runtime-postbuild.mjs`
- `scripts/runtime-proof-fast.mjs`
- `.local/gate-metrics/*`
- `.local/test-runner-history/*`

## Current Diagnosis Summary

Measured current bottlenecks:

- full constrained-host `pnpm test` miss path: about `32.85 min`
- full `pnpm build`: about `104-111 s`
- `pnpm runtime:proof:fast`: about `61.6 s`

Dominant current slow areas:

- oversized full-suite safe-mode test batches
- `build:plugin-sdk:dts`
- `runtime-postbuild`, especially bundled plugin runtime deps
- runtime readiness wait during proof

## Implemented And Remaining Sequence

Implemented or in progress:

1. Turborepo skeleton and safe root-task posture
2. map current build/check work into Turbo-owned or Turbo-wrapped tasks
3. extract initial package-local task ownership in `ui`
4. harden outputs/inputs/cache correctness
5. decide remote-cache posture
6. integrate Turbo with current gate tiers
7. preserve timing artifacts during migration
8. keep fast runtime proof custom or Turbo-adjacent
9. partially land the remaining `pnpm test` throughput tranche

Still explicitly remaining:

1. extract more package-local task ownership beyond `ui`
2. decide whether any remote-cache rollout should ever become repo-default
3. observe the new constrained-host scheduler on more full-suite runs before
   deciding whether worker-recycling changes are still necessary
4. use the new shared-batch decomposition artifacts to triage the next
   dominant import-heavy shared outliers before the next full throughput pass

## Regression Note: 2026-04-11

The current in-progress engineering-repo tree regressed the only metric that
matters for this effort:

- best recent full-suite `pnpm test`: about `26m 27.5s`
- intermediate later full-suite: about `32m 10.1s`
- current slow full-suite on the dirty tree: about `41m 41.7s`

Current narrowed diagnosis:

- the regression is mainly a full-suite plan-shape regression, not a gate
  ceremony problem
- shared unit count grew from `59` to `68` to `208`
- the full-suite is still overwhelmingly import/setup dominated
- the current dirty tree also made `unit-heavy-*` materially slower
- adaptive `2 -> 3` concurrency did engage and likely masked part of the
  regression instead of causing it

Immediate next action before any more broad workflow work:

1. do a narrow fix tranche against the current dirty-tree shared-plan
   explosion
2. specifically validate whether the newer unknown-heavy safe-mode split logic
   and coarse batch-observation-driven packing are responsible for the wall
   time regression
3. re-measure full-suite `pnpm test` before doing any more Turbo expansion,
   remote-cache work, or new throughput ideas

## Regression Recovery Update: 2026-04-11

The narrow regression-fix tranche materially recovered the full-suite runtime.

Post-fix result:

- full-suite `pnpm test`: `1,775,483 ms` (`29m 35.5s`)

Comparison:

- best recent run: `1,587,529 ms` (`26m 27.5s`)
- intermediate slower run: `1,930,132 ms` (`32m 10.1s`)
- regressed slow run: `2,501,669 ms` (`41m 41.7s`)

What changed:

- constrained full-suite plan shape dropped back to `99` selected units with
  `63` shared batches
- the newer unknown-heavy safe-mode split stage is no longer exploding the
  shared plan
- `batch-coarse` timing observations no longer drive constrained full-suite
  shared packing as if they were real per-file evidence

What this means:

- the planner regression was the main reason the suite ballooned to `41m+`
- that regression is now mostly recovered
- the remaining gap to the `26m 27.5s` best run is now a smaller set of real
  import-heavy outliers, not a broad plan-shape failure

Narrowed next action:

1. target the remaining import-heavy outliers directly:
   `unit-fast-batch-35`, `unit-fast-batch-30`, `unit-fast-batch-48`,
   `unit-heartbeat-runner.returns-default-unset-dedicated`,
   `unit-outbound-dedicated`, and `unit-heavy-6`
2. defer any more broad workflow or Turbo expansion until those outliers are
   addressed or proven unavoidable

## Outlier Tranche Update: 2026-04-11

The next narrow outlier tranche improved the only metric that matters again.

Current best full-suite result on this host:

- `pnpm test`: `1,495,223 ms` (`24m 55.2s`)

What that means:

- the suite is now faster than the earlier `26m 27.5s` checkpoint
- the old planner-explosion regression is no longer the active bottleneck
- the remaining slow work is a smaller set of real shared import-heavy batches
  plus one still-expensive test-body-dominated isolated lane

Current dominant remaining outliers:

- `unit-fast-batch-43`
- `unit-fast-batch-48`
- `unit-fast-batch-18`
- `unit-fast-batch-30`
- `unit-fast-batch-23`
- `unit-fast-batch-38`
- `unit-package-contract-guardrails-isolated`

Workflow policy follow-through landed in the same pass:

- true full-suite `pnpm test` artifacts now remain reusable for landing even
  though the planner shards them internally with explicit entry filters
- targeted post-proof test runs now write `latest/test-targeted.json` instead
  of clobbering the canonical reusable `latest/test.json`
- `pnpm build` was revalidated afterward and did not spawn a duplicate
  `pnpm test`

Narrowed next action before any more broad workflow work:

1. keep future throughput work focused on the new remaining real outliers
2. treat `unit-package-contract-guardrails-isolated` as a separate
   test-body-dominated problem from the shared import-heavy batches
3. avoid reopening broad planner or Turbo work unless the single-command
   full-suite metric regresses again

### Next targeted tranche

Primary next targets:

- shared import-heavy batches:
  - `unit-fast-batch-43`
  - `unit-fast-batch-48`
  - `unit-fast-batch-18`
  - `unit-fast-batch-30`
  - `unit-fast-batch-23`
  - `unit-fast-batch-38`
- isolated test-body outlier:
  - `unit-package-contract-guardrails-isolated`

Guardrails for that tranche:

- judge success on the single-command full-suite `pnpm test` time first
- keep the reusable full-suite artifact semantics intact:
  - `latest/test.json` for reusable full-suite proof
  - `latest/test-targeted.json` for targeted follow-up runs
- do not reopen broad planner architecture, remote-cache rollout, or further
  Turbo expansion unless the single-command metric stalls or regresses again

## Explicitly Deferred

- CI changes
- host cron changes
- replacement of `scripts/test-parallel.mjs`
- replacement of `scripts/runtime-proof-fast.mjs`

## Primary Repo Artifacts

- `audits/turborepo_integration_diagnosis_2026-04-10.md`
- `docs/help/turborepo-integration-plan.md`
