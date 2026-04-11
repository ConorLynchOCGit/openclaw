# `pnpm test` Full-Suite Regression Diagnosis

Date: 2026-04-11

## Executive Summary

The full-suite `pnpm test` regression is real.

The best recent run on this host was:

- `1,587,529 ms` (`26m 27.5s`)

The later completed slow run was:

- `2,501,669 ms` (`41m 41.7s`)

Regression delta:

- `914,140 ms` (`15m 14.1s`)

This regression did not come from concurrency failing to engage. The slow run
did use adaptive safe-mode `topLevelParallel=3`.

The regression is primarily a plan-shape regression in the current dirty tree:

- the full-suite unit count grew from `94` to `244`
- shared batches grew from `59` to `208`
- the suite became dominated by many more import/setup-heavy shared batches
- `unit-heavy-*` also became materially slower

The earlier landed workflow work did remove duplicate landing ceremony. That
part is real. But the current in-progress planner changes made the one
full-suite run itself slower again, which is the only metric that matters for
this diagnosis.

## Narrow Fix Tranche Outcome

The narrow recovery tranche confirmed the diagnosis and recovered most of the
regression.

Planner changes applied:

- disabled the newer unknown-heavy safe-mode split stage for constrained
  full-suite shared packing
- treated `batch-coarse` timing observations as weak fallback instead of
  first-class evidence for constrained full-suite shared packing

Validation outcome:

- constrained full-suite plan shape dropped from `244` selected units / `208`
  shared batches to `99` selected units / `63` shared batches
- final full-suite `pnpm test` runtime after the fix tranche:
  `1,775,483 ms` (`29m 35.5s`)

Comparison to the key checkpoints:

- versus best recent run (`1,587,529 ms` / `26m 27.5s`):
  `+187,954 ms` (`+3m 08.0s`)
- versus intermediate later run (`1,930,132 ms` / `32m 10.1s`):
  `-154,649 ms` (`-2m 34.6s`)
- versus regressed slow run (`2,501,669 ms` / `41m 41.7s`):
  `-726,186 ms` (`-12m 06.2s`)

Conclusion:

- the planner regression was real and fixing it materially improved the only
  metric that matters
- this tranche did not fully recover the `26m 27.5s` best run
- the remaining gap is now mostly a smaller set of genuine import-heavy
  outliers instead of planner-created over-fragmentation

## Evidence Reviewed

Primary artifacts:

- `.local/gate-metrics/history/2026-04-10T18-16-47-433Z-test.json`
- `.local/gate-metrics/history/2026-04-11T02-41-18-227Z-test.json`
- `.local/gate-metrics/history/2026-04-11T04-39-58-116Z-test.json`
- `.local/gate-metrics/history/2026-04-11T14-13-46-146Z-test.json`
- `.local/test-runner-history/test-timings.unit.json`

Current planner/runtime surfaces inspected:

- `scripts/test-parallel.mjs`
- `scripts/test-planner/planner.mjs`
- `scripts/test-planner/executor.mjs`
- `scripts/test-planner/timing-history.mjs`
- `scripts/test-runner-manifest.mjs`

Current worktree delta inspected against `HEAD`:

- `git diff HEAD -- scripts/test-planner/planner.mjs`
- `git diff HEAD -- scripts/test-planner/executor.mjs`
- `git diff HEAD -- scripts/test-planner/timing-history.mjs`
- `git diff HEAD -- scripts/test-runner-manifest.mjs`

Current planner output inspected:

- `node scripts/test-parallel.mjs --plan`

## Timing Comparison

### Historical checkpoints

| Run                     | Artifact                             |        Elapsed | Unit Count |               Shared Count | Top-Level Parallel |
| ----------------------- | ------------------------------------ | -------------: | ---------: | -------------------------: | -----------------: |
| Earlier baseline        | `2026-04-10T18-16-47-433Z-test.json` | `1,970,774 ms` |       `84` | not classified in artifact |                `2` |
| Best recent run         | `2026-04-11T02-41-18-227Z-test.json` | `1,587,529 ms` |       `94` |                       `59` |                `2` |
| Intermediate slower run | `2026-04-11T04-39-58-116Z-test.json` | `1,930,132 ms` |      `104` |                       `68` |                `3` |
| Current slow run        | `2026-04-11T14-13-46-146Z-test.json` | `2,501,669 ms` |      `244` |                      `208` |                `3` |

Key progression:

- `94 -> 104 -> 244` selected units
- `59 -> 68 -> 208` shared batches
- the big regression step is the current dirty-tree jump from `104` units to
  `244`

## Critical-Path Analysis

The artifacts do not store an exact lane-by-lane Gantt chart, so the
critical-path reconstruction below is approximate. It uses the unit execution
order in the artifact and the recorded `topLevelParallelLimit` to rebuild a
greedy lane schedule. That is sufficient to identify where the extra wall time
concentrated.

### Best recent run (`26m 27.5s`)

Approximate reconstructed critical lane:

- makespan: `1,259,627 ms`
- critical-lane unit count: `43`

Dominant critical-path segments:

- `unit-fast-batch-17`: `126,932 ms`
- `unit-fast-batch-30`: `120,694 ms`
- `unit-fast-batch-3`: `120,057 ms`
- `unit-isolated-agent.skips-delivery-without-whatsapp-recipient-besteffortdeliver-true-memory-isolated`: `95,993 ms`
- `unit-package-contract-guardrails-isolated`: `54,389 ms`

Interpretation:

- the good run still had a heavy shared early/mid path
- the tail also contained a real memory-isolated segment
- but the suite was still compact enough that the critical lane stayed below
  about `21 min`

### Intermediate slower run (`32m 10.1s`)

Approximate reconstructed critical lane:

- makespan: `1,419,034 ms`
- critical-lane unit count: `38`

Dominant critical-path segments:

- `unit-fast-batch-40`: `165,008 ms`
- `unit-fast-batch-54`: `98,341 ms`
- `unit-fast-batch-22`: `95,426 ms`
- `unit-fast-batch-50`: `87,193 ms`
- `unit-fast-batch-23`: `70,106 ms`
- `unit-isolated-agent.skips-delivery-without-whatsapp-recipient-besteffortdeliver-true-memory-isolated`: `42,837 ms`

Interpretation:

- this run regressed because a smaller set of giant shared batches became
  dominant
- adaptive `3`-way parallelism did engage here, but it only masked part of the
  damage

### Current slow run (`41m 41.7s`)

Approximate reconstructed critical lane:

- makespan: `1,830,590 ms`
- critical-lane unit count: `84`

Reason totals on the reconstructed critical lane:

- `unit-fast-shared`: `1,497,680 ms`
- `unit-timed-heavy`: `142,409 ms`
- `unit-isolated-manifest`: `90,502 ms`
- `unit-memory-isolated`: `56,434 ms`
- `unit-timed-dedicated`: `43,565 ms`

Interpretation:

- the current regression is overwhelmingly a shared-batch critical-path
  problem
- the critical lane now contains far more units than before
- heavy lanes also got slower and now materially contribute near the tail
- the memory-isolated tail is no longer the main villain

## Lane-Class Analysis

### Best recent run (`26m 27.5s`)

- shared: `59` units, `1,872,997 ms` total, `31,746 ms` average
- memory-isolated: `11` units, `338,950 ms` total, `30,814 ms` average
- isolated: `10` units, `152,457 ms` total, `15,246 ms` average
- dedicated: `8` units, `93,176 ms` total, `11,647 ms` average
- heavy: `6` units, `58,190 ms` total, `9,698 ms` average

### Intermediate slower run (`32m 10.1s`)

- shared: `68` units, `3,482,917 ms` total, `51,219 ms` average
- memory-isolated: `12` units, `282,612 ms` total, `23,551 ms` average
- isolated: `10` units, `183,862 ms` total, `18,386 ms` average
- dedicated: `8` units, `207,081 ms` total, `25,885 ms` average
- heavy: `6` units, `85,659 ms` total, `14,277 ms` average

### Current slow run (`41m 41.7s`)

- shared: `208` units, `4,469,479 ms` total, `21,488 ms` average
- memory-isolated: `12` units, `238,776 ms` total, `19,898 ms` average
- isolated: `10` units, `179,983 ms` total, `17,998 ms` average
- dedicated: `8` units, `189,358 ms` total, `23,670 ms` average
- heavy: `6` units, `401,314 ms` total, `66,886 ms` average

### What changed

From the best run to the current slow run:

- shared total work increased by about `2,596,482 ms`
- heavy total work increased by about `343,124 ms`
- dedicated total work increased by about `96,182 ms`
- memory-isolated total work actually dropped by about `100,174 ms`

That means the regression is not coming from the old memory-isolated tail that
used to dominate discussion. It is now mostly:

1. much larger shared-batch aggregate work
2. a new heavy-lane regression

## Post-Fix Full-Suite Findings

Final post-fix full-suite artifact:

- `.local/gate-metrics/latest/test.json`

Recovered plan shape:

- selected units: `99`
- shared: `63`
- isolated: `11`
- dedicated: `7`
- heavy: `6`
- memory-isolated: `12`
- adaptive safe-mode top-level parallelism: `3`

This is materially back in the earlier good-plan range:

- best recent run: `94` selected / `59` shared
- intermediate run: `104` selected / `68` shared
- regressed slow run: `244` selected / `208` shared
- post-fix run: `99` selected / `63` shared

Largest remaining post-fix outliers:

- `unit-fast-batch-35`: `162,688 ms`, import/setup dominated
- `unit-heartbeat-runner.returns-default-unset-dedicated`: `118,216 ms`,
  import/setup dominated
- `unit-heavy-6`: `91,615 ms`, still genuinely expensive
- `unit-fast-batch-30`: `89,155 ms`, import/setup dominated
- `unit-outbound-dedicated`: `82,231 ms`, import/setup dominated
- `unit-fast-batch-48`: `79,809 ms`, import/setup dominated

Interpretation:

- the planner-created shared-plan explosion is no longer the dominant problem
- `unit-heavy-*` is mostly secondary after the fix, with `unit-heavy-6` as the
  only clear remaining heavy-lane outlier
- the next throughput tranche should target the remaining real import-heavy
  outliers directly, not add more broad planner complexity

## Import/Setup Versus Test-Body Findings

The older good artifacts do not include phase breakdowns. The current slow
artifact does, and it is decisive.

Across all `244` units in the current slow run:

- aggregate import/setup time: `5,495,393 ms` (`91.59 min`)
- aggregate test-body time: `527,025 ms` (`8.78 min`)

That means the current suite is still overwhelmingly dominated by
import/setup-style cost.

Representative offenders in the current slow run:

### `unit-fast-batch-108`

- elapsed: `157,783 ms`
- dominance: `import-setup-dominated`
- import/setup: `156,780 ms`
- test body: `1,320 ms`
- grouping: `src/infra/outbound`

### `unit-fast-batch-139`

- elapsed: `69,342 ms`
- dominance: `import-setup-dominated`
- import/setup: `79,120 ms`
- test body: `1,300 ms`
- grouping: `src/plugin-sdk/command-auth`

### `unit-fast-batch-153`

- elapsed: `67,276 ms`
- dominance: `import-setup-dominated`
- import/setup: `83,380 ms`
- test body: `55 ms`
- grouping: `src/plugins/runtime`

### `unit-fast-batch-89`

- elapsed: `66,062 ms`
- dominance: `import-setup-dominated`
- import/setup: `67,040 ms`
- test body: `10,080 ms`
- grouping: `src/infra/heartbeat-runner`

Dedicated-lane comparison is also informative:

- `unit-isolated-agent.direct-delivery-core-channels-dedicated`
  - earlier slower state: about `96,074 ms`
  - current slow run: `28,481 ms`
- `unit-outbound-dedicated`
  - current slow run: `81,942 ms`, almost entirely import/setup-dominated

Interpretation:

- some previously bad dedicated surfaces actually improved
- the wall time was lost because import/setup-heavy shared work exploded and
  moved onto a much longer shared critical path

## Planner And Estimate Findings

### 1. The current dirty tree adds an extra safe-mode split stage

Current uncommitted planner changes add:

- `splitUnknownHeavySafeModeUnitBatch(...)`

This new stage runs before the older cohesive safe-mode split and can split
large unknown-heavy batches again. That is the most direct code-level
explanation for the jump from `68` shared units to `208`.

### 2. The current dirty tree also teaches the planner from coarse shared-batch observations

Current uncommitted executor/history changes now persist:

- `observationMode: "batch-coarse"`

Those observations are then loaded as timing data and surfaced as
`local-batch-observed`.

Current local unit timing history:

- file count: `1,186`
- many entries now come from `batch-coarse` rather than true per-file timing

### 3. The new “observed” numbers are still too coarse to price startup tax

The slowest current shared batches illustrate the problem:

- `unit-fast-batch-108` took `157.8s`
  - but its top estimated files are only about `2.6s`, `2.5s`, `2.1s`, `1.9s`
- `unit-fast-batch-153` took `67.3s`
  - but its top estimated files are about `7.4s`, `2.6s`, `1.9s`

These batches are marked as `local-batch-observed`, but the actual elapsed time
is overwhelmingly import/setup overhead that is not being priced correctly at
the per-file level.

So the planner has more numbers, but not better numbers for the thing that
matters most. The current dirty tree creates more splitting while still
underpricing the shared startup tax.

## A. What got slower

The single full-suite `pnpm test` run got slower.

It regressed from:

- `1,587,529 ms` (`26m 27.5s`)

to:

- `2,501,669 ms` (`41m 41.7s`)

The regression is in the current dirty tree, not just in the last committed
workflow state. The intermediate landed state had already regressed to about
`32.17 min`, but the current in-progress tree pushed it much further to
`41.7 min`.

## B. Where the extra wall time came from

The extra wall time came mainly from:

1. the shared-batch prefix becoming much larger
2. the shared-batch prefix remaining import/setup dominated
3. `unit-heavy-*` becoming materially slower

The old memory-isolated tail improved in aggregate and is no longer the main
source of regression.

## C. Whether concurrency helped or hurt

Concurrency helped, but it did not save the run.

Evidence:

- best run: `topLevelParallel=2`
- intermediate slower run: `topLevelParallel=3`
- current slow run: `topLevelParallel=3`

So adaptive concurrency did engage in the runs that matter. The regression is
not “promotion failed and we stayed at 2.” If anything, `3` masked part of the
damage caused by the worse plan shape.

## D. Whether planner packing/estimation contributed

Yes.

The planner currently has two problems at the same time:

1. it fragments the shared unit surface much more aggressively than before
2. it relies on coarse inferred “observed” timings that still do not model the
   shared import/setup tax well

That combination creates many more startup-heavy batches without producing a
better critical path.

## E. Whether import/setup dominance is still the main issue

Yes.

In the current slow run, aggregate import/setup time across all units is about
`91.59 min`, while aggregate test-body time is only about `8.78 min`.

The suite is still fundamentally import/setup dominated.

## F. The smallest likely cause set

The smallest likely explanation set is:

1. current dirty-tree planner changes exploded the shared unit count from `68`
   to `208`
2. those additional shared units each paid more import/setup startup tax
3. coarse batch-derived “observed” timings were treated as stronger planning
   evidence than they deserve
4. `unit-heavy-*` also regressed sharply and added meaningful tail time

That set is sufficient to explain most of the extra ~`15 min`.

## G. The next fix tranche that should be attempted

The next fix tranche should be narrow and single-metric:

1. target the current dirty-tree shared-plan explosion first
2. test whether removing or sharply constraining the new unknown-heavy
   full-suite split stage reduces wall-clock time
3. downweight or exclude `batch-coarse` timing history from full-suite shared
   packing until import/setup tax is modeled honestly
4. re-measure `unit-heavy-*` only after the shared-plan rollback/fix, because
   those lanes are the secondary contributor

Success bar for that tranche:

- improve full-suite `pnpm test` wall-clock time on this host
- do not broaden back into general workflow work until that metric moves in the
  right direction

## H. What should be explicitly deferred until after that fix tranche

Defer these until the full-suite regression is fixed:

- more broad Turbo/package extraction work
- remote-cache rollout decisions
- further workflow ceremony/policy work
- new speculative planner features
- any new throughput tranche not directly tied to the full-suite runtime

## Confidence And Missing Evidence

Confidence: medium-high

Why not absolute:

- older good artifacts do not include the newer phase-breakdown and reason
  fields, so some comparisons rely on unit-id classification and reconstructed
  lane scheduling
- the final corrected-tree landing rerun was interrupted, so there is no newer
  completed full-suite artifact after the last reuse-classifier fix

Why confidence is still high:

- the unit-count jump is large and explicit
- the shared-batch jump is large and explicit
- the import/setup dominance in the slow run is explicit
- the current dirty-tree planner diff contains a new split stage exactly where
  the plan explosion happened
