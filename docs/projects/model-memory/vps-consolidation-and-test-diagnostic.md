---
summary: "Inventory and cleanup classification for the live VPS deployment, test surfaces, and stale operator runners."
title: "VPS Consolidation And Test Diagnostic"
---

# VPS Consolidation And Test Diagnostic

## Scope

This diagnostic covers the live VPS state that currently hosts OpenClaw and the
runner and test surfaces that materially affect deployment clarity, operator
clarity, and landing time.

The diagnostic target is not every historical artifact on the machine. The
target is the set of surfaces that can still change or confuse the active
deployment path.

## Current VPS Inventory

### OpenClaw repo and path surfaces before cleanup

- canonical git checkout: `/root/services/openclaw-roles/live`
- duplicate non-git tree: `/root/services/openclaw-roles/dev`
- compatibility symlink: `/root/services/openclaw`
- compatibility symlink: `/root/services/openclaw-upgrade-2026.3.24`

Inventory count before cleanup:

- repo/path surfaces in play: `4`
- canonical git checkouts: `1`
- duplicate non-canonical product trees: `1`
- compatibility aliases: `2`

### OpenClaw container and image surfaces before cleanup

- active runtime container: `openclaw-runtime`
- stale sidecar container: `openclaw-cli`
- active OpenClaw image: `openclaw:local`

Inventory count before cleanup:

- OpenClaw containers: `2`
- running OpenClaw containers: `1`
- OpenClaw images: `1`

### Active deployment truth before cleanup

- live compose root: `/root/services/openclaw-roles/live`
- live compose file: `/root/services/openclaw-roles/live/docker-compose.yml`
- live container/image pair: `openclaw-runtime` on `openclaw:local`
- live runtime config already points memory authority at `model-memory`
- live compose still mounted the dev tree into the runtime as `imports/product_dev`
- live compose still defined the stale `openclaw-cli` service

## GitHub CLI Diagnostic

### Result

- `gh` was not installed before this sweep
- `gh` is now installed locally via `apt`
- verified command: `gh version`

### Auth posture

- `gh auth status -h github.com` reported not logged in
- no existing `GH_TOKEN` or `GITHUB_TOKEN` was present in the VPS shell
- no existing `~/.config/gh/hosts.yml` was present

Operational conclusion:

- local GitHub CLI is now available on-server
- authenticated `gh` usage still requires an operator login step
- this replaces SSH-to-GitHub host workflows as the expected tool surface, but
  it does not change Git remote push transport by itself

## Test and Runner Diagnostic

## Baseline facts

- total `*.test.ts` files in the repo: `2123`
- top-level test distribution:
  - `src`: `1759`
  - `extensions`: `305`
  - `ui`: `45`
  - `test`: `11`
  - `vendor`: `1`
- default `pnpm test` runner: `scripts/test-parallel.mjs`
- default `pnpm test` is already scoped; it does not execute all `2123` tests
- static count of files covered by the default unit config include set: about `810`

## Major gate-bloat findings

1. The 30 to 40 minute landing experience is not caused by `pnpm check`.
   The baseline `pnpm check` failed in about `17s` on formatting drift.
2. `pnpm test` is not bloated by all repo tests. It is already a curated unit
   lane plus a dedicated isolated lane for setup-heavy or contention-heavy
   suites.
3. Deployment sprawl is a real source of operator and filesystem overhead:
   the live runtime still carried the dev tree into the container and the host
   still documented both `product_live` and `product_dev`.
4. The most obvious runner clutter is not in the default test lane. It is in
   manual proof, trace, and legacy operator surfaces that survive long after the
   buildout phase.
5. There is no active Turborepo task graph in this repo. Optimization work
   belongs in PNPM caching, Docker layer stability, and host hygiene instead.
6. A hotspot sample over the default unit lane showed about `22.4%` of the
   wall time still lived under the retired legacy-memory stack in `src/memory/**`.
   That work is now split into an explicit `pnpm test:legacy-memory` lane so the
   default landing test no longer pays for retired runtime surfaces.

## Reviewed runner and test surface classification

The reviewed set here is the runner surface that still affects live operator
work, repo verification, or repo clutter:

- `24` model-memory wrapper scripts under `scripts/model-memory-*.ts`
- `10` core gate and test harness surfaces:
  - `scripts/test-parallel.mjs`
  - `scripts/test-hotspots.mjs`
  - `scripts/test-perf-budget.mjs`
  - `vitest.unit.config.ts`
  - `vitest.extensions.config.ts`
  - `vitest.gateway.config.ts`
  - `vitest.e2e.config.ts`
  - `vitest.channels.config.ts`
  - `vitest.live.config.ts`
  - `vitest.legacy-memory.config.ts`

Reviewed runner-surface total: `34`

### Classification counts

- `runtime_necessary`: `0`
- `build_or_validation_necessary`: `16`
- `keep_but_disable`: `16`
- `remove`: `2`

Interpretation:

- none of the reviewed standalone runner entrypoints are required for the live
  runtime to function
- the live runtime depends on service modules, not on proof wrappers
- most runner clutter is valid to keep as operator-only/manual surfaces, not as
  default gates

### Build or validation necessary

- `scripts/test-parallel.mjs`
- `vitest.unit.config.ts`
- `vitest.extensions.config.ts`
- `vitest.gateway.config.ts`
- `vitest.e2e.config.ts`
- `vitest.channels.config.ts`
- `vitest.legacy-memory.config.ts`
- `scripts/model-memory-collision-hinge-trace.ts`
- `scripts/model-memory-core-claim-delta-measurement.ts`
- `scripts/model-memory-duplicate-audit.ts`
- `scripts/model-memory-duplicate-benchmark.ts`
- `scripts/model-memory-duplicate-review.ts`
- `scripts/model-memory-live-vs-replay-parity.ts`
- `scripts/model-memory-proof-phase.ts`
- `scripts/model-memory-zero-candidate-recovery-eval.ts`
- `scripts/model-memory-zero-candidate-text-search-diagnostic.ts`

### Keep but disable by default

- `vitest.live.config.ts`
- `scripts/test-hotspots.mjs`
- `scripts/test-perf-budget.mjs`
- `scripts/model-memory-cache-diff.ts`
- `scripts/model-memory-context-trace.ts`
- `scripts/model-memory-document-ingestion-runner.ts`
- `scripts/model-memory-document-ingestion-tool-smoke.ts`
- `scripts/model-memory-durable-prompt-proof.ts`
- `scripts/model-memory-large-document-evidence.ts`
- `scripts/model-memory-manual-ui-smoke-pack.ts`
- `scripts/model-memory-population-wave.ts`
- `scripts/model-memory-rebuild-diff.ts`
- `scripts/model-memory-retrieval-package-review.ts`
- `scripts/model-memory-retrieval-trace.ts`
- `scripts/model-memory-session-turn-proof.ts`
- `scripts/model-memory-thesis-hole-evaluation.ts`

### Remove

- `scripts/model-memory-agents-stage-trace.ts`
- `scripts/model-memory-ordinary-turn-stage-trace.ts`

These two stage-trace wrappers had no current repo references and are superseded
by the remaining proof and trace surfaces.

## Host operator runner findings

The stale host runner problem is more serious than the repo runner clutter.

The following scheduled host jobs still depend on the old dev tree and
`memory-middleware` surfaces:

- `memory_projection_report.sh`
- `memory_soak_db_report.sh`
- `memory_performance_report.sh`
- `daily_memory_evidence_rollup.sh`
- `daily_operator_review_prep.sh`
- `daily_operator_review_sync_artifact.sh`
- `weekly_operator_review_prep.sh`
- `weekly_operator_review_sync_artifact.sh`
- `weekly_operator_review_telegram_bridge.sh`

Classification for this host-only legacy operator chain:

- `runtime_necessary`: `0`
- `build_or_validation_necessary`: `0`
- `keep_but_disable`: `9`
- `remove`: `0`

Reason:

- they are not needed for the active runtime
- they still encode legacy `memory-middleware` and dev-tree assumptions
- deleting them immediately would remove operator history and script context
- disabling them is the safe immediate move during consolidation

## Cleanup recommendations

### Keep

- the scoped `pnpm test` harness and Vitest config split
- the new explicit `pnpm test:legacy-memory` lane for the retired legacy-memory stack
- the current `model-memory` audit, review, benchmark, parity, and proof runners
- the live repo checkout at `/root/services/openclaw-roles/live`
- the `openclaw-runtime` container and `openclaw:local` image

### Disable

- the host cron chain that still shells into legacy `memory-middleware` and the
  dev tree
- manual-only runner surfaces should stay callable directly, not become default
  landing gates

### Remove

- stale `openclaw-cli` container/service
- the live compose bind mount for `/root/services/openclaw-roles/dev`
- the duplicate dev tree after validation and backup
- the legacy upgrade-path symlink after validation
- obsolete stage-trace wrapper scripts with no active references
- repo-root Docker compose backup files and root checkpoint clutter

## Verification policy after cleanup

### Normal dev verification

- `pnpm check`
- scoped tests for touched areas
- manual or proof runners only when the touched change actually needs them

### Pre-landing verification

- `pnpm check`
- `pnpm test`
- `pnpm build`

### Operator-only and manual flows

- hotspot timing
- performance-budget checks
- manual UI smoke
- retrieval and trace probes
- large-document or population-wave proof runners

Those remain valid tools. They do not belong on the default landing path.
