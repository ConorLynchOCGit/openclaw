# Test Runner OOM Diagnosis - 2026-04-10

## Summary

The repo-wide `pnpm test` failure mode on this host was primarily a test-runner planning problem, not a single obvious JavaScript heap leak in the touched memory slices.

Before hardening, constrained local full-repo runs packed too many shared unit files into concurrent lanes, and the hotspot manifest did not account for `src/acp/control-plane/manager.test.ts`. That let an extreme RSS-growth file stay in the default shared path and crash the run with infrastructure failures before the suite could expose real functional failures.

After hardening:

- constrained local full-repo runs automatically enter a safe landing mode
- top-level parallelism is disabled
- shared unit batches run with `maxWorkers=1`
- the default old-space budget is raised to `4096`
- unit/shared batching now obeys file-count and hotspot-delta budgets
- the hotspot manifest now includes `src/acp/control-plane/manager.test.ts`

On this host, the safe-mode plan now starts as:

```text
runtime=local-linux mode=local intent=normal memoryBand=constrained loadBand=idle failurePolicy=fail-fast vitestMaxWorkers=2 topLevelParallel=off safeMode=constrained-full-repo
unit-fast-batch-1 filters=24 maxWorkers=1 surface=unit isolate=no pool=forks
```

The unit-fast batch count dropped from `101` to `49`.

## Evidence

### Before hardening

Heap-trace evidence from `/tmp/openclaw-unit-trace.log`:

```text
[test-parallel][mem] unit-fast-batch-1 file=src/acp/control-plane/manager.test.ts rss=3.93GiB delta=+3.90GiB peak=4.24GiB procs=4 duration=123.4s
[test-parallel] summary failurePolicy=fail-fast failedUnits=2 failedTestFiles=1 infraFailures=2
```

This showed:

- a stale hotspot manifest missed a real shared-lane hotspot
- multiple processes were active during the failure
- the run failed with infrastructure failures before it could surface a trustworthy functional result

### After hardening

The hardened `pnpm test` run advanced through `unit-fast-batch-37` without worker termination or OOM signatures and then failed in `unit-fast-batch-38` on a real test failure in `src/plugins/providers.test.ts`.

That matters because the failure mode changed from:

- runner dies with infra failures

to:

- runner stays alive and exposes an actual failing test

The standalone reproduction also failed:

```text
pnpm test -- src/plugins/providers.test.ts
```

So the current remaining red is not a shared-batch OOM regression from the safe-mode planner. It is a separate functional failure already present on this tree.

## Best-Supported Diagnosis

The original landing-gate problem was a combination of:

1. stale hotspot data
2. overly aggressive constrained-host batch shapes
3. too much concurrent shared-unit pressure for a low-memory local host
4. insufficient automatic downgrade behavior for local full-repo landing runs

The evidence does **not** support a claim that the memory slices introduced a new JS heap leak.

## Changes Made

### Planning and execution hardening

- `scripts/test-planner/runtime-profile.mjs`
  - added constrained-host resource budgets for shared unit/channel/extension batching
- `scripts/test-planner/planner.mjs`
  - added resource-budget splitting by duration, file count, and hotspot delta
  - added automatic constrained full-repo safe mode for local landing runs
  - disabled top-level parallelism in that mode
  - forced shared unit batches to `maxWorkers=1`
  - increased the safe-mode shared unit file cap enough to avoid pathological over-sharding
- `scripts/test-planner/executor.mjs`
  - surfaces safe-mode status in runner output
  - defaults constrained full-repo safe mode to `maxOldSpaceSizeMb=4096`

### Test data / validation

- `test/fixtures/test-memory-hotspots.unit.json`
  - added the measured hotspot entry for `src/acp/control-plane/manager.test.ts`
- `test/scripts/test-planner.test.ts`
- `test/scripts/test-parallel.test.ts`
  - updated expectations for the new safe-mode plan and planner reporting

## Before / After Behavior

### Before

- constrained local full-repo runs could fail almost immediately with infra-level OOM / worker termination
- the operator had to rediscover ad hoc heap and profile workarounds
- the landing path could waste 30+ minutes before exposing that the result was not trustworthy

### After

- constrained local full-repo runs automatically downgrade into a safer landing profile
- the planner produces `49` shared unit batches instead of `101`
- long import-heavy lanes still complete instead of killing the run
- the runner now surfaces real failing tests instead of masking them with infra crashes

## Remaining Caveats

1. The hardened landing path is slower than the old optimistic plan. That is an intentional tradeoff for determinism on this host.
2. `src/plugins/providers.test.ts` currently fails even when run alone, so `pnpm test` is not fully green yet.
3. Because that provider test reproduces standalone, it should be treated as a separate functional failure, not as evidence that the new safe mode is still unstable.

## Operator Guidance

- For normal local iteration, keep using the wrapper normally: `pnpm test -- <target>`
- For repo-wide landing on constrained local hosts, let the wrapper auto-select safe mode with plain `pnpm test`
- If you need to compare against the pre-hardening behavior, temporarily disable the downgrade with:

```text
OPENCLAW_TEST_DISABLE_AUTO_SAFE_MODE=1 node scripts/test-parallel.mjs --plan
```

- If a future repo-wide landing run fails, first check whether it is:
  - an infrastructure failure (`infraFailures > 0`, worker termination, OOM signature), or
  - a real failing test that reproduces standalone

That distinction is now the key guardrail this hardening pass restored.
