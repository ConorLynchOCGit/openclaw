---
title: "Turborepo Integration Plan"
summary: "Planned Turbo-first evolution for OpenClaw build, check, and test workflow"
read_when:
  - Evaluating whether Turbo should replace current repo orchestration
  - Planning the next build-performance tranche
  - Deciding what stays custom versus Turbo-owned
---

# Turborepo Integration Plan

This document records the current plan for possible Turborepo adoption in
OpenClaw.

It is a planning artifact, not an implementation claim.

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

### Limited gains

- the cold full-suite `pnpm test` miss path on this constrained host
- runtime proof startup and readiness time
- any root task that still remains a giant sequential script

### What Turbo will not magically fix

- the current `~33 minute` full constrained-host safe-mode unit run
- oversized long-tail test batches
- readiness waits in `runtime:proof:fast`
- expensive phases that are still modeled as a single root step

## Recommended Migration Sequence

The sequence below is designed to avoid false confidence from a shallow
`turbo.json` that only wraps existing root tasks.

### Slice 1. Turbo skeleton and root-task posture

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

Start with the least controversial tasks:

- UI build
- UI test
- package-local typed helper tasks if added
- cacheable generated artifact tasks

Keep current outer wrappers where needed:

- `run-gate.mjs`
- `run-landing-gate.mjs`

Validation:

- task graph correctness
- output replay correctness
- durable timing artifact preservation

### Slice 3. Extract real package-local build/check ownership

This is the key enabling step.

Without this, Turbo mostly wraps root scripts and gives limited benefit.

Likely extractions:

- more package-local `build` scripts
- more package-local `test` scripts
- package-local `check` or `typecheck` scripts where honest
- package-scoped generated outputs

Validation:

- package ownership remains truthful
- root orchestration shrinks instead of adding duplicate paths

### Slice 4. Cache/input/output correctness hardening

Before trusting Turbo deeply:

- define task outputs honestly
- define relevant root/global inputs
- verify cache correctness on clean and dirty trees
- confirm no false cache hits when outputs are missing

Validation:

- repeated-run cache-hit proof
- deliberate invalidation proof
- logs and artifacts stay truthful

### Slice 5. Remote-cache posture decision

Decide:

- local-only cache first
- managed remote cache
- self-hosted remote cache

Remote cache should wait until local task correctness is already proven.

Validation:

- remote replay proof
- cache-integrity settings
- operator guidance for safe usage

### Slice 6. Integrate Turbo with the current gate-tier model

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

`build:runtime:fast` may become Turbo-assisted later, but
`runtime:proof:fast` should remain a proof helper path with cache disabled.

Validation:

- `/readyz` proof still authoritative
- timing artifact output preserved
- no accidental production-path weakening

### Slice 9. Finish the remaining `pnpm test` throughput tranche

This remains necessary even if Turbo lands first.

Order:

1. add historical RSS-aware co-scheduling
2. split the worst 5-10 long batches
3. isolate the heaviest import/memory suites into dedicated lanes
4. trial adaptive top-level safe parallelism from `2` to adaptive `2-3`
5. if still too slow, add worker recycling for specific lane classes

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
