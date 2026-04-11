# Turborepo Integration Diagnosis

Date: 2026-04-10

Implementation update: 2026-04-11

Slices 1 through 8 from the migration plan are now partially implemented in
the engineering repo:

- a real `turbo.json` exists
- cacheable root ownership now covers `build:plugin-sdk:dts`
- package-local Turbo ownership now covers UI `build` and `test`
- package-local Turbo ownership now also covers:
  - `@openclaw/diffs` `build` and `test`
  - `@openclaw/memory-host-sdk` `test`
  - `@openclaw/plugin-package-contract` `test`
- canonical `pnpm check:fast`, `pnpm check:types`, and `pnpm build` now route
  selected build/check phases through Turbo-backed wrappers
- durable gate metrics now record Turbo cache hit or miss status for those
  phases
- durable gate metrics now also record whether a Turbo-backed gate phase ran in
  local-only mode or with remote-cache credentials configured
- remote cache remains repo-default local-only for now, with explicit opt-in
  remote use supported only for the currently extracted Turbo tasks
- unchanged-tree gate reuse now exists for the heavy local landing path, so the
  same unchanged tree no longer needs to rerun equivalent full-suite work at
  each later tier
- adaptive safe-mode top-level parallelism now records an explicit decision and
  can truthfully promote to `3` on this host when runtime conditions are safe
- the worst generic outbound Signal and WhatsApp hot tests now use local
  contract-faithful adapters instead of loading the full bundled plugin runtime
- shared-batch test artifacts now include file-level decomposition metadata and
  import/setup-versus-test-body dominance where the executor can infer it

The core conclusion in this diagnosis still stands: Turbo is a complement to
the existing workflow, not a replacement for the constrained-host test
scheduler or the runtime-proof layer.

## Scope

This is a diagnosis artifact for possible deep Turborepo integration in the
engineering repo. It does not change build, test, runtime, or CI behavior.

## Executive Conclusion

Turborepo is a strong fit as a task-graph, cache, and changed-scope execution
layer for OpenClaw, but it is not a full replacement for the current custom
workflow.

The honest posture is:

- Turbo should absorb more of the repo's build and check orchestration over
  time.
- Turbo should sit alongside the constrained-host test scheduler and the
  runtime proof layer, not replace them.
- The remaining `pnpm test` throughput tranche still matters even in a Turbo
  world, because the slowest full-suite path on this host is dominated by a
  cache-miss full run of the custom safe-mode scheduler.

## Current Workflow Ownership Map

### Root-owned heavy workflow today

The expensive repo paths are still mostly root orchestrated:

- `scripts/run-gate.mjs`
- `scripts/run-landing-gate.mjs`
- `scripts/test-parallel.mjs`
- `scripts/test-planner/executor.mjs`
- `scripts/tsdown-build.mjs`
- `scripts/runtime-postbuild.mjs`
- `scripts/runtime-proof-fast.mjs`

The root `package.json` owns the top-level gates:

- `build`
- `build:runtime:fast`
- `check:fast`
- `check:types`
- `check`
- `gate:feature`
- `gate:integration`
- `gate:production`
- `test`

### Workspace/package shape today

OpenClaw is a real `pnpm` workspace:

- root package
- `ui/`
- `packages/*`
- `extensions/*`

But package-local task ownership is still thin relative to the whole repo:

- `ui/package.json` exposes `build`, `dev`, and `test`
- `extensions/diffs` now exposes package-local `build` and `test`
- `packages/memory-host-sdk` now exposes a package-local `test`
- `packages/plugin-package-contract` now exposes a package-local `test`
- most other `packages/*` and `extensions/*` packages do not yet expose their
  own `build` / `test` / `check` scripts
- this means the repo is not yet in a package-task shape where Turborepo can
  immediately take over the expensive paths just by adding `turbo.json`

## Measured Bottleneck Map

### Full constrained-host `pnpm test`

Evidence:

- `.local/gate-metrics/history/2026-04-10T18-16-47-433Z-test.json`

Measured result:

- total wall time: `1,970,774 ms` (`32.85 min`)
- `selectedUnitCount`: `84`
- `serialPrefixUnitCount`: `58`
- `topLevelParallelLimit`: `2`
- `fullRepoSafeMode`: `true`

Heaviest observed test batches in that run:

- `unit-fast-batch-3`: `152,816 ms`
- `unit-fast-batch-17`: `148,653 ms`
- `unit-fast-batch-30`: `146,897 ms`
- `unit-fast-batch-31`: `137,844 ms`
- `unit-fast-batch-27`: `133,719 ms`
- `unit-deliver-memory-isolated`: `101,197 ms`
- `unit-isolated-agent.skips-delivery-without-whatsapp-recipient-besteffortdeliver-true-memory-isolated`: `99,177 ms`

Current tranche update before final full-suite revalidation:

- unchanged-tree landing now reuses stronger earlier gate results instead of
  rerunning the same full suite on the same tree
- local observed history now estimates:
  - `unit-deliver-memory-isolated` at about `50.3 s`
- `unit-isolated-agent.skips-delivery-without-whatsapp-recipient-besteffortdeliver-true-memory-isolated`
  at about `56.3 s`
- shared-batch artifacts now expose likely file-level drivers and whether a
  batch was import/setup dominated, test-body dominated, or mixed
- final full-suite validation is still required before claiming the new shared
  tail wall times on this host

Interpretation:

- the current full-suite pain is real
- it is primarily a miss-path scheduling and batch-balance problem on a
  constrained host
- this is not something Turbo fixes by itself

### Full `pnpm build`

Evidence:

- `.local/gate-metrics/latest/build.json`
- `.local/gate-metrics/history/2026-04-10T19-49-29-547Z-build.json`

Recent measured results:

- `103,977 ms`
- `110,526 ms`

Dominant phases:

- `build:plugin-sdk:dts`: about `52 s` to `56 s`
- `build:runtime-postbuild`: about `30 s` to `33 s`
  - especially `bundled-plugin-runtime-deps`: about `29.8 s` to `32.4 s`

Interpretation:

- the build is not broad-package parallel work today
- it is a mostly sequential root pipeline with a few dominant heavy phases
- Turbo can help with task graphing, cache correctness, and changed-scope runs,
  but only after more of this flow is expressed as proper tasks

### `pnpm build:runtime:fast`

Evidence:

- `.local/gate-metrics/latest/build-runtime-fast.json`

Measured result:

- total wall time: `29,917 ms`

Dominant phases:

- `build:tsdown:fast`: `9,640 ms`
- `build:runtime-postbuild`: `14,865 ms`
  - `bundled-plugin-runtime-deps`: `13,697 ms`

Interpretation:

- the fast runtime lane already removes meaningful waste
- Turbo should complement this path, not replace its semantics

### `pnpm runtime:proof:fast`

Evidence:

- `.local/gate-metrics/latest/runtime-proof.json`

Measured result:

- total wall time: `61,636 ms`
- build step: `30,528 ms`
- readiness wait: `30,950 ms`
- proof check: `17 ms`

Interpretation:

- this is an operator/runtime proof flow, not just a package task
- roughly half of the current proof loop is runtime startup and readiness, not
  build execution

## Where Turbo Is A Natural Fit

### 1. Build and check task graphing

Turbo is strong when tasks are declared in `turbo.json`, have explicit
dependencies, and define correct outputs and inputs. That fits:

- package-local builds
- package-local test and lint tasks
- changed-scope local iteration
- cacheable generated artifacts
- CI/team cache reuse

### 2. Changed-scope execution

Turbo's filter model is a good fit for:

- changed-package builds
- changed-package checks
- UI-only or package-only reruns
- future CI partitioning by package/task graph

### 3. Remote cache for repeatable build/check work

Turbo remote caching would likely help:

- build outputs
- type-check style tasks that are truly cache-safe
- stable package-local test lanes where outputs and inputs are well defined

## Where Turbo Is Not Enough

### 1. Constrained-host full-suite test scheduling

OpenClaw's current test wrapper does more than launch Vitest:

- host-aware safe-mode planning
- historical timing persistence
- failure classification
- RSS-aware execution surfaces
- dedicated isolated lanes
- top-level overlap control on constrained hosts

Turbo does not replace those behaviors. At best, Turbo can wrap them.

### 2. Runtime proof and gateway restart semantics

`runtime:proof:fast` is not just "run a task":

- builds runtime output
- launches a proof gateway
- waits for `/readyz`
- verifies shallow liveness
- writes operator-facing timing artifacts

That flow should remain custom and operator-oriented.

### 3. Gate-tier policy

The policy distinction between:

- feature landing
- integration landing
- production landing

is an operator/repo decision layer. Turbo may execute some underlying tasks,
but it should not become the policy source of truth by itself.

## What Existing Custom Work Still Remains Necessary

Even after Turbo adoption, the following still matters:

- historical RSS-aware co-scheduling
- splitting the worst 5-10 long batches
- isolating the heaviest import/memory suites into dedicated lanes
- adaptive top-level safe parallelism from `2` to adaptive `2-3`
- worker recycling for specific lane classes if the previous changes are not
  enough
- runtime proof helpers
- gate-tier policy wrappers
- build-stamp and output correctness checks where a root phase still aggregates
  many inputs
- durable timing artifacts for build, test, and proof

## What Custom Work Could Eventually Be Retired

The following may shrink or retire later if Turbo adoption succeeds:

- parts of the current root build chaining in `scripts/run-gate.mjs`
- ad hoc root-level changed-scope orchestration for build/check
- some hand-managed cache/stamp plumbing once outputs are package-scoped and
  Turbo cache definitions are correct

The following should not be expected to disappear soon:

- `scripts/test-parallel.mjs`
- `scripts/test-planner/executor.mjs`
- `scripts/runtime-proof-fast.mjs`
- landing gate policy

## Fit Against Official Turbo Constraints

Relevant official Turborepo behaviors:

- Turbo runs tasks declared in `turbo.json`
- it builds a task graph from workspace structure and declared task
  dependencies
- packages without a given task become transit nodes, not active executors
- root tasks that call `turbo` cannot safely be depended on as ordinary root
  graph nodes
- remote caching is powerful, but only when tasks are cache-safe and inputs are
  defined correctly

Implication for OpenClaw:

- simply adding `turbo.json` on top of today's root-owned scripts would not
  solve the main pain
- the repo first needs more real package-local task ownership, and the current
  tranche has only started that outside `ui`
- Turbo is most valuable after or during that extraction

## Honest Architecture Conclusion

### Turbo should replace

- little immediately

### Turbo should absorb

- build/check task graphing
- cache orchestration for package-local tasks
- changed-scope local and CI execution
- remote-cache-backed reuse for stable package-local work

### Turbo should sit alongside

- constrained-host full-suite test scheduling
- runtime proof and gateway restart semantics
- landing gate policy and proof sequencing

## Practical Recommendation

Adopt a Turbo-first evolution for build/check orchestration, but keep the test
planner and runtime proof layers custom.

Do not roll back the recent custom workflow work. Most of it is still useful in
the Turbo future:

- durable timings
- build stamp relocation
- `build:runtime:fast`
- `runtime:proof:fast`
- gate tiers

Those were not wasted effort. They are the evidence and control surfaces needed
to integrate Turbo safely.

## Required Follow-Through If Approved

1. Add Turbo as a thin orchestration layer first, not as a big-bang
   replacement.
2. Extract real package-local tasks before expecting major Turbo wins.
3. Keep the full-suite `pnpm test` throughput tranche on the roadmap even after
   Turbo starts landing.
4. Treat remote caching as a later slice after task/output correctness is
   proven.

## Evidence Reviewed

Local repo/workspace:

- `pnpm-workspace.yaml`
- root `package.json`
- `ui/package.json`
- `packages/memory-host-sdk/package.json`
- `extensions/memory-middleware/package.json`
- `scripts/run-gate.mjs`
- `scripts/run-landing-gate.mjs`
- `scripts/test-parallel.mjs`
- `scripts/test-planner/executor.mjs`
- `scripts/tsdown-build.mjs`
- `scripts/runtime-postbuild.mjs`
- `scripts/stage-bundled-plugin-runtime-deps.mjs`
- `scripts/plugin-sdk-dts-build.mjs`
- `.local/gate-metrics/latest/*.json`
- `.local/gate-metrics/history/*.json`
- `.local/test-runner-history/*.json`

Official Turbo docs:

- https://turborepo.dev/docs/core-concepts/package-and-task-graph
- https://turborepo.dev/docs/messages/missing-root-task-in-turbo-json
- https://turborepo.dev/docs/reference/run
- https://turborepo.dev/docs/core-concepts/remote-caching
