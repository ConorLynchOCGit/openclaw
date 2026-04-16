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

### OpenClaw repo and path surfaces after the latest cleanup pass

- canonical git checkout: `/root/services/openclaw-roles/live`
- compatibility symlink: `/root/services/openclaw-roles/dev -> /root/services/openclaw-roles/live`
- no extra proof/debug git worktrees remain under `/tmp`

Inventory count now:

- repo/path surfaces in play: `2`
- canonical git checkouts: `1`
- duplicate non-canonical product trees: `0`
- compatibility aliases: `1`

Notable removals already completed:

- `/root/services/openclaw`
- `/root/services/openclaw-upgrade-2026.3.24`
- duplicate non-git dev tree replacement; `dev` now resolves to the live checkout
- `/tmp/openclaw-main-check`
- `/tmp/openclaw-origin-main`

### OpenClaw container and image surfaces after the latest cleanup pass

- active runtime container: `openclaw-runtime`
- generic compose still defines a non-running sidecar service: `openclaw-cli`
- active OpenClaw image: `openclaw:local`

Inventory count now:

- OpenClaw containers: `1`
- running OpenClaw containers: `1`
- OpenClaw images: `1`
- total Docker images still present for active supporting services: `4`

### Active deployment truth now

- live compose root: `/root/services/openclaw-roles/live`
- live compose file: `/root/services/openclaw-roles/live/docker-compose.yml`
- live container/image pair: `openclaw-runtime` on `openclaw:local`
- live runtime config already points memory authority at `model-memory`
- live runtime mounts only the canonical live repo as `imports/product_live/content`
- live runtime no longer mounts a duplicate `product_dev` tree
- live deployment is already single-container in practice even though the repo's
  generic compose file still contains the stale `openclaw-cli` service template

## GitHub CLI Diagnostic

### Result

- `gh` is installed locally on the VPS
- verified command: `gh --version`

### Auth posture

- `gh auth status` reported not logged in
- no existing `GH_TOKEN` or `GITHUB_TOKEN` was present in the VPS shell
- no existing `~/.config/gh/hosts.yml` was present

Operational conclusion:

- local GitHub CLI is now available on-server
- authenticated `gh` usage still requires one operator login step:
  `gh auth login --hostname github.com`
- this replaces SSH-to-GitHub host workflows as the expected tool surface, but
  the current git remotes still include SSH push URLs until auth and transport
  are updated deliberately
- the repo can still be pushed over the existing git remote transport while
  `gh` auth remains operator-blocked

## Test and Runner Diagnostic

## Baseline facts

- total `*.test.ts` files in the repo: `2123`
- top-level test distribution:
  - `src`: `1759`
  - `extensions`: `305`
  - `ui`: `45`
  - `test`: `11`
  - `vendor`: `1`
- default `pnpm test` runner: `scripts/test-projects.mjs`
- default `pnpm test` is already scoped; it does not execute all `2123` tests
- static count of files covered by the default unit config include set: about `810`

## Major gate-bloat findings

1. The 30 to 40 minute landing experience is not caused by `pnpm check`.
   The baseline `pnpm check` failed in about `17s` on formatting drift.
2. `pnpm test` is not bloated by all repo tests. It is already a curated unit
   lane plus a dedicated isolated lane for setup-heavy or contention-heavy
   suites.
3. Deployment sprawl is a real source of operator and filesystem overhead:
   most of the old repo-path sprawl is now gone, but the repo still defines the
   stale `openclaw-cli` sidecar service and still documents some earlier
   pre-cleanup state.
4. The most obvious runner clutter is not in the default test lane. It is in
   manual proof, trace, and legacy operator surfaces that survive long after the
   buildout phase.
5. There is no active Turborepo task graph in this repo. Optimization work
   belongs in PNPM caching, Docker layer stability, and host hygiene instead.
6. A hotspot sample over the default unit lane showed about `22.4%` of the
   wall time still lived under the retired legacy-memory stack in `src/memory/**`.
   That work is now split into an explicit `pnpm test:legacy-memory` lane so the
   default landing test no longer pays for retired runtime surfaces.
7. On this VPS there is no active Turborepo task graph at all. Optimization is
   PNPM-store, Docker-layer, and host-hygiene work, not `turbo` tuning.

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

- no additional repo runner removals were required in this continuation because
  the obsolete stage-trace wrappers identified earlier are already absent from
  the canonical checkout

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

- the stale `openclaw-cli` compose service from the active VPS deployment path;
  do not rewrite the product-wide generic Docker UX in the same change unless
  the Docker docs and helper scripts are updated together
- repo-root Docker compose backup files and root checkpoint clutter

## Executed cleanup and optimization in this continuation

- confirmed the host is already down to one canonical OpenClaw runtime
  container and one canonical OpenClaw image in active use
- removed the two stale clean-room git worktrees under `/tmp` after verifying
  both were clean and not active deployment paths
- confirmed the legacy memory/operator cron chain remains disabled
- removed `3758` stale `/tmp/openclaw-test-home-*` directories plus stale
  compile-cache and wrapper temp artifacts
- removed the unused `postgres:17-alpine` image
- pruned all Docker build cache on the host
- executed `pnpm store prune`
- reconfirmed there is no real Turborepo graph in the canonical repo, so the
  remaining optimization lane is PNPM/cache/build hygiene only

Measured before/after on this VPS:

- root filesystem used: `47G -> 37G`
- Docker build cache: `8.436G -> 0B`
- Docker images: `5 -> 4`
- PNPM store: `10G -> 2.4G`
- `/tmp`: `4.3G -> 166M`
- `/root/.cache`: `1.2G -> 771M`
- canonical repo `node_modules`: `3.9G -> 3.9G`
- retained rollback/archive surface left intentionally in place: `/root/backups`
  at about `14G`, including `openclaw-roles-dev-retired-20260415T232235Z`

## Landing-state verification after cleanup

Final repo gates on the cleaned host:

- `pnpm check`: green
- `pnpm build`: green
- `OPENCLAW_TEST_PROJECTS_PARALLEL=8 pnpm test`: green

BlueBubbles note:

- the isolated BlueBubbles shard exits cleanly on its own
- the final full-suite rerun also closed cleanly after the oxlint cleanup and
  host cleanup pass

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
