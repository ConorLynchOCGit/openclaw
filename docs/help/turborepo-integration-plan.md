---
title: "Turborepo Integration Plan"
summary: "Planned Turbo-first evolution for OpenClaw build, check, and test workflow"
read_when:
  - Evaluating whether Turbo should replace current repo orchestration
  - Planning the next build-performance tranche
  - Deciding what stays custom versus Turbo-owned
---

# Turborepo Integration Plan

This document records the current Turbo migration posture in OpenClaw.

It started as a planning artifact. Parts of that plan are now implemented, so
this doc tracks both the landed posture and the still-deferred work.

Current canonical workflow remains:

- `pnpm check:fast`
- `pnpm check:types`
- `pnpm check`
- `pnpm build`
- `pnpm build:runtime:fast`
- `pnpm runtime:proof:fast`
- `pnpm test`
- `pnpm gate:feature`
- `pnpm gate:integration`
- `pnpm gate:production`

## Landed Status

As of 2026-04-11, the repo has a safe first Turbo layer in place.

Implemented:

- root `turbo.json`
- non-cacheable root Turbo wrappers for `check:fast:raw` and
  `check:types:raw`
- cacheable Turbo ownership for `build:plugin-sdk:dts:raw`
- package-local Turbo ownership for UI `build` and `test` via `ui/turbo.json`
- package-local Turbo ownership for:
  - `@openclaw/diffs` `build` and `test`
  - `@openclaw/memory-host-sdk` `test`
  - `@openclaw/plugin-package-contract` `test`
- canonical `pnpm check:fast`, `pnpm check:types`, and `pnpm build` routing
  selected phases through Turbo-backed wrappers
- durable gate metrics that record Turbo cache status for Turbo-backed phases
- durable gate metrics now also record whether a Turbo-backed gate phase ran in
  local-only mode or with remote-cache credentials configured
- unchanged-tree reuse for `check`, `build`, `build:runtime:fast`, and later
  landing tiers when the same tree fingerprint and required outputs still match
- `runtime:proof:fast` reuse of a green unchanged-tree `build:runtime:fast`
  result when the reusable artifact is still valid
- artifact-visible adaptive safe-mode top-level parallel decisions, including
  truthful promotion to `3` on this host
- shared-batch test artifacts now include file-level decomposition metadata plus
  import/setup-versus-test-body dominance where the executor can infer it
- local light Signal and WhatsApp outbound adapters for the worst generic
  outbound hot-path tests so those tests do not load the full bundled plugin
  runtime unnecessarily

Still intentionally custom:

- `pnpm test` planning and constrained-host scheduling
- `pnpm runtime:proof:fast`
- landing-gate policy in `pnpm gate:*`

Remote cache posture:

- repo defaults stay local-only
- Turbo-backed tasks now expose an explicit remote-configured versus local-only
  posture in gate metrics
- remote cache may be used as an explicit opt-in via standard Turbo
  environment variables such as `TURBO_TEAM`, `TURBO_TOKEN`, and `TURBO_API`
- no repo-default remote cache enablement yet, because the landing-critical
  path is still dominated by custom non-cacheable gates and only a narrow set
  of package tasks have trustworthy cache boundaries today

Workflow-throughput posture:

- validate slices with targeted tests and script-level checks first
- do not rerun the full landing workflow after every intermediate slice
- on one unchanged landing tree, pay `pnpm test` at most once
- durable artifacts must show what ran versus what was reused

## Architecture Posture

Turbo should be adopted as a task-graph and caching layer for build/check work,
not as a total replacement for the current repo workflow.

### What Turbo should own soon

- package-local build tasks
- package-local check/test tasks where inputs and outputs are honest
- changed-scope execution
- task graph ordering for extracted package tasks
- cache orchestration for package-local outputs
- later, remote cache reuse for stable tasks

### What Turbo should not own yet

- constrained-host full-suite `pnpm test` scheduling
- RSS-aware safe-mode planning
- runtime proof and gateway restart semantics
- landing-gate policy
- production proof sequencing

### What must remain custom even after Turbo

- `scripts/test-parallel.mjs`
- `scripts/test-planner/executor.mjs`
- `scripts/runtime-proof-fast.mjs`
- the gate-tier model
- durable timing artifacts and operator summaries

### What current custom work should eventually shrink

- portions of root-owned build chaining once package-local tasks exist
- root-only changed-scope orchestration for build/check
- some stamp/fingerprint plumbing after Turbo task outputs are trustworthy

## Honest Expected Gains

### Strong likely gains

- faster changed-scope build/check runs
- better package-aware task reuse
- cleaner CI task graphing
- optional remote-cache reuse across local and CI machines
- simpler long-term ownership once more work moves out of the root package
- materially shorter unchanged-tree landing loops because stronger earlier gate
  results can be reused instead of rerunning the same full suite

### Limited gains

- the cold full-suite `pnpm test` miss path on this constrained host
- runtime proof startup and readiness time
- any root task that still remains a giant sequential script

### What Turbo will not magically fix

- the current `~33 minute` full constrained-host safe-mode unit run
- oversized long-tail test batches
- readiness waits in `runtime:proof:fast`
- expensive phases that are still modeled as a single root step
- import-heavy test helpers that still load real bundled plugin runtime when a
  local contract stub would be sufficient for that test

## Recommended Migration Sequence

The sequence below is designed to avoid false confidence from a shallow
`turbo.json` that only wraps existing root tasks.

### Slice 1. Turbo skeleton and root-task posture

Status: implemented

Add:

- `turbo.json`
- explicit repo posture for cacheable versus non-cacheable tasks
- a small initial set of root task wrappers only where they are safe

Rules:

- do not model recursive root tasks incorrectly
- keep root tasks thin
- treat runtime proof as `cache: false`

Validation:

- task graph sanity
- no recursive root-task loops
- no behavior changes to existing canonical commands yet

### Slice 2. Map current gates into Turbo-owned or Turbo-wrapped tasks

Status: partially implemented

Start with the least controversial tasks:

- UI build
- UI test
- package-local typed helper tasks if added
- cacheable generated artifact tasks

Keep current outer wrappers where needed:

- `run-gate.mjs`
- `run-landing-gate.mjs`

Current landed scope:

- UI build and UI test are package-local Turbo tasks
- `build:plugin-sdk:dts` now runs through a Turbo-backed wrapper inside the
  canonical build gates
- `check:fast` and `check:types` use Turbo-backed root wrappers with caching
  intentionally disabled

Validation:

- task graph correctness
- output replay correctness
- durable timing artifact preservation

### Slice 3. Extract real package-local build/check ownership

Status: started

This is the key enabling step.

Without this, Turbo mostly wraps root scripts and gives limited benefit.

Likely extractions:

- more package-local `build` scripts
- more package-local `test` scripts
- package-local `check` or `typecheck` scripts where honest
- package-scoped generated outputs

Current landed extraction:

- `ui` is now a real package-local Turbo task owner for `build` and `test`
- `@openclaw/diffs` is now a real package-local Turbo task owner for `build`
  and `test`
- `@openclaw/memory-host-sdk` now owns a package-scoped `test` task
- `@openclaw/plugin-package-contract` now owns a package-scoped `test` task

Current deferral:

- broader non-UI extraction remains conservative until the next candidate tasks
  would be real package ownership instead of decorative wrappers back to the
  root scripts

Validation:

- package ownership remains truthful
- root orchestration shrinks instead of adding duplicate paths

### Slice 4. Cache/input/output correctness hardening

Status: partially implemented

Before trusting Turbo deeply:

- define task outputs honestly
- define relevant root/global inputs
- verify cache correctness on clean and dirty trees
- confirm no false cache hits when outputs are missing

Validation:

- repeated-run cache-hit proof
- deliberate invalidation proof
- logs and artifacts stay truthful

Current landed hardening:

- Turbo workdirs are ignored so `.turbo` artifacts do not invalidate the next
  run
- root Turbo config now has conservative `globalDependencies`
- `run-gate.mjs` records Turbo cache hits and misses in durable metrics

### Slice 5. Remote-cache posture decision

Status: decided, not broadly enabled

Decide:

- local-only cache first
- managed remote cache
- self-hosted remote cache

Remote cache should wait until local task correctness is already proven.

Current decision:

- keep Turbo local-only by default
- support explicit opt-in remote cache use through standard Turbo environment
  variables, but do not rely on it for the canonical landing workflow
- record remote-configured versus local-only posture in gate metrics for
  Turbo-backed gate phases
- do not enable remote cache in repo defaults yet
- revisit broader enablement only after more package-local tasks exist and
  cache boundaries are exercised on a broader set of work
- current unchanged-tree local reuse already removes a large amount of repeated
  landing work without needing remote cache

Validation:

- remote replay proof
- cache-integrity settings
- operator guidance for safe usage

### Slice 6. Integrate Turbo with the current gate-tier model

Status: implemented at the gate-wrapper layer

Keep gate policy explicit:

- feature gate
- integration gate
- production gate

Those gates may increasingly call Turbo-owned work underneath, but the repo
policy should still remain readable and stable.

Validation:

- `pnpm gate:*` behavior remains unambiguous
- operators still know which bar to use

### Slice 7. Preserve and adapt timing artifacts

Status: implemented

Do not lose observability when Turbo arrives.

Keep or adapt:

- build timings
- test timings
- runtime proof timings
- landing-gate timings

Turbo's own profiling should supplement, not replace, repo-local timing
artifacts.

Validation:

- before/after timing comparability
- latest/history artifact continuity

### Slice 8. Keep fast runtime proof outside or alongside Turbo

Status: implemented posture

`build:runtime:fast` may become Turbo-assisted later, but
`runtime:proof:fast` should remain a proof helper path with cache disabled.

Current landed posture:

- `build:runtime:fast` reuses the Turbo-backed `build:plugin-sdk:dts` phase
- `runtime:proof:fast` remains authoritative and custom
- Turbo does not own gateway restart, `/readyz`, or proof timing semantics

Validation:

- `/readyz` proof still authoritative
- timing artifact output preserved
- no accidental production-path weakening

### Slice 9. Finish the remaining `pnpm test` throughput tranche

Status: partially implemented

This remains necessary even if Turbo lands first.

Order:

1. add historical RSS-aware co-scheduling
2. split the worst 5-10 long batches
3. isolate the heaviest import/memory suites into dedicated lanes
4. trial adaptive top-level safe parallelism from `2` to adaptive `2-3`
5. if still too slow, add worker recycling for specific lane classes

Current landed scope:

- durable local memory-hotspot history now supplements checked-in hotspot data
- constrained-host plans now peel the worst timed unit files into dedicated
  lanes
- constrained-host timed-heavy buckets are split more aggressively
- safe constrained local hosts can now promote from top-level `2` to `3`
  concurrent runs at `idle` or `normal` load, and the decision is recorded in
  artifacts
- top-level scheduler now respects an estimated hotspot budget instead of only
  a flat concurrency count
- unchanged-tree landing tiers now reuse stronger earlier gate results instead
  of rerunning the same full suite on the same tree
- the worst generic outbound import hotspots were reduced by replacing the
  Signal and WhatsApp bundled-plugin helpers used in those hot tests with local
  contract-faithful adapters
- shared-batch artifacts now record file-level decomposition and phase
  dominance so later shared-tail work can target real file drivers instead of
  anecdotal batch names
- the current tranche still needs final full-suite revalidation before claiming
  the new shared-tail wall times

Still deferred inside the throughput tranche:

- any additional worker-recycling changes that prove necessary after observing
  the new scheduler on more full-suite runs

Rationale:

- Turbo can help cache and scope test execution
- Turbo does not solve the constrained-host miss-path full-suite scheduler
- the current full `pnpm test` pain is still fundamentally a planner problem

## Validation Strategy For The Migration

Per slice:

- inspect task graph
- verify behavior parity against current commands
- prove cache correctness on repeat runs
- confirm timing artifacts remain durable
- avoid introducing duplicate operator paths

For test-related slices:

- keep using the current `pnpm test` wrapper as the canonical execution path
- compare wall time and stability before and after changes
- treat infra failures and test failures separately

## Main Risks

- wrapping too many root tasks in Turbo and getting little real benefit
- caching tasks with incomplete inputs/outputs
- introducing package-task churn without reducing root orchestration
- losing the current timing artifacts during migration
- creating operator confusion between `pnpm`, Turbo, and proof commands
- assuming remote cache solves constrained-host cold misses

## Recommendation

Proceed if the goal is to improve build/check graphing, changed-scope execution,
and future CI/local cache reuse.

Do not proceed under the assumption that Turbo alone will solve the full-suite
`pnpm test` wall time on this host.

That still requires the remaining custom test throughput tranche.
