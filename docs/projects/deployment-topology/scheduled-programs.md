---
summary: "Durable inventory of live host-side and OpenClaw-native scheduled programs on the VPS."
title: "Scheduled Programs"
---

# Scheduled Programs

This inventory records the actual scheduled-program surface in the live VPS.
The live deployment currently uses both:

- host-level root cron
- OpenClaw-native cron inside `openclaw-runtime`

Treating only one of those as canonical would lose real operational behavior.

## Live host cron programs

| name                                        | purpose                                                                                    | mechanism                                                                              | cadence / timezone                     | target delivery                                                          | source-of-truth inputs                                                                                             | live status | evidence                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------- | --------------------------- |
| `n8n_sync_check.sh`                         | detect drift between live n8n workflows and workspace-owned canonical workflow JSON        | root crontab -> committed repo `ops/host/n8n_sync_check.sh`                            | daily `09:00` `America/Nassau`         | Telegram alert via `ops/telegram/send_chief_telegram.sh` on failure only | live n8n export + workspace workflow JSON                                                                          | enabled     | `crontab -l`, script header |
| `db_probe.sh`                               | verify required webhook/intake/operator queue DB tables are present                        | root crontab -> committed repo `ops/host/db_probe.sh`                                  | daily `09:05` `America/Nassau`         | Telegram alert via `ops/telegram/send_chief_telegram.sh` on failure only | n8n DB env + direct SQL probe                                                                                      | enabled     | `crontab -l`, script header |
| `github_digest_telegram.sh`                 | deliver the daily GitHub update to Telegram                                                | root crontab -> committed repo `ops/github/github_digest_telegram.sh`                  | weekdays `09:10` `America/Nassau`      | Telegram via `ops/telegram/send_chief_telegram.sh`                       | `ops/github/GITHUB_DIGEST_QUERY.sql` scoped to `openclaw/openclaw` + n8n Postgres env from `webhook-gateway-n8n-1` | enabled     | `crontab -l`, script body   |
| `cron_health_rollup.sh`                     | summarize host cron + native OpenClaw cron health into a durable archive note              | root crontab -> committed repo `ops/host/cron_health_rollup.sh`                        | weekdays `09:12` `America/Nassau`      | archive note only                                                        | host crontab + `openclaw cron list --all --json` + native run history                                              | enabled     | `crontab -l`, script header |
| `cron_session_hygiene_report.sh`            | audit live session-store accumulation and canonical vs temporary session mix               | root crontab -> committed repo `ops/host/cron_session_hygiene_report.sh`               | weekly `09:14` Monday `America/Nassau` | archive note only                                                        | native cron list + host crontab + live session stores                                                              | enabled     | `crontab -l`, script header |
| `n8n_inactive_workflow_review.sh`           | review inactive live n8n workflows against canonical workflow ownership                    | root crontab -> committed repo `ops/host/n8n_inactive_workflow_review.sh`              | weekly `09:16` Monday `America/Nassau` | archive note only                                                        | live n8n export + `projects/*/workflows/*.json`                                                                    | enabled     | `crontab -l`, script header |
| `weekly_operator_review_prep.sh`            | refresh the weekly review working context before the native weekly review session          | root crontab -> committed repo `ops/reviews/weekly_operator_review_prep.sh`            | weekly `09:18` Monday `America/Nassau` | workspace working context only                                           | daily memory evidence, cron/runtime/session evidence, ingress and workflow probes                                  | enabled     | `crontab -l`, script header |
| `weekly_operator_review_sync_artifact.sh`   | persist the weekly review body from the dedicated session into the durable weekly artifact | root crontab -> committed repo `ops/reviews/weekly_operator_review_sync_artifact.sh`   | weekly `09:21` Monday `America/Nassau` | archive note only                                                        | latest successful `Weekly Operator Review` cron-run transcript                                                     | enabled     | `crontab -l`, script body   |
| `weekly_operator_review_telegram_bridge.sh` | generate and send the compact weekly Telegram summary from the synced weekly artifact      | root crontab -> committed repo `ops/reviews/weekly_operator_review_telegram_bridge.sh` | weekly `09:23` Monday `America/Nassau` | Telegram via `ops/telegram/send_chief_telegram.sh`                       | synced weekly operator review artifact                                                                             | enabled     | `crontab -l`, script body   |
| `supabase_db_backup.sh`                     | create a runtime database backup and metadata bundle                                       | root crontab -> committed repo `ops/host/supabase_db_backup.sh`                        | daily `09:25` `America/Nassau`         | backup artifact + archive note                                           | runtime DB URL from `/root/.openclaw/openclaw.json` + Postgres dump                                                | enabled     | `crontab -l`, script header |
| `daily_operator_review_prep.sh`             | refresh the daily review working context before the native daily review session            | root crontab -> committed repo `ops/reviews/daily_operator_review_prep.sh`             | daily `08:43` `America/Nassau`         | workspace working context only                                           | daily memory evidence, cron/runtime/session evidence, and current workspace status                                 | enabled     | `crontab -l`, script header |
| `daily_operator_review_sync_artifact.sh`    | persist the daily review body from the dedicated session into the durable daily artifact   | root crontab -> committed repo `ops/reviews/daily_operator_review_sync_artifact.sh`    | daily `08:47` `America/Nassau`         | archive note only                                                        | latest successful `Daily Operator Review` cron-run transcript                                                      | enabled     | `crontab -l`, script body   |
| `daily_memory_continuity_finalizer.sh`      | ensure the canonical daily memory note exists when exact same-day durable evidence exists  | root crontab -> committed repo `ops/reviews/daily_memory_continuity_finalizer.sh`      | daily `23:55` `America/Nassau`         | archive note only                                                        | same-day leaf notes, daily operator review artifacts, daily memory evidence, DB evidence, and cron summaries       | enabled     | `crontab -l`, script body   |
| `disk_maintenance.sh`                       | prune stale builder cache and measure disk pressure                                        | root crontab -> committed repo `ops/host/disk_maintenance.sh`                          | daily `08:50` `America/Nassau`         | archive note only                                                        | `df`, `docker system df`, `docker builder prune`                                                                   | enabled     | `crontab -l`, script header |
| `build_runtime_hygiene_report.sh`           | produce a runtime/build hygiene report from the live host posture                          | root crontab -> committed repo `ops/host/build_runtime_hygiene_report.sh`              | daily `08:55` `America/Nassau`         | archive note only                                                        | repo `scripts/build_runtime_inventory.mjs` + `scripts/verify_build_runtime_hygiene.mjs`                            | enabled     | `crontab -l`, script header |
| `docker_hygiene_cleanup.sh --apply`         | remove safe stale Docker residue on a bounded schedule                                     | root crontab -> committed repo `ops/host/docker_hygiene_cleanup.sh --apply`            | weekly `08:30` Sunday `America/Nassau` | cleanup + archive note                                                   | dangling anonymous volumes, stale networks, dangling images                                                        | enabled     | `crontab -l`, script header |
| `cache_hygiene.sh --apply`                  | prune stale cache surfaces on a bounded schedule                                           | root crontab -> committed repo `ops/host/cache_hygiene.sh --apply`                     | monthly `08:35` day 1 `America/Nassau` | cleanup + archive note                                                   | pnpm store, npm cache, Playwright cache, disk pressure                                                             | enabled     | `crontab -l`, script header |

## Live OpenClaw-native cron programs

| name                            | purpose                                                        | mechanism                                  | cadence / timezone                     | target delivery       | source-of-truth inputs                                                                                                                                                                                                                                                            | live status | evidence                              |
| ------------------------------- | -------------------------------------------------------------- | ------------------------------------------ | -------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------- |
| `Daily Operator Review`         | generate the daily operator review into its dedicated session  | OpenClaw-native cron in `openclaw-runtime` | daily `08:45` `America/Nassau`         | isolated session only | generated daily review context plus canonical deployment and system docs and current daily memory evidence                                                                                                                                                                        | enabled     | `/home/node/.openclaw/cron/jobs.json` |
| `Weekly Operator Review`        | generate the weekly operator review into its dedicated session | OpenClaw-native cron in `openclaw-runtime` | weekly `09:20` Monday `America/Nassau` | isolated session only | generated weekly review context plus canonical deployment and system docs, recovery manifest, and current daily memory evidence                                                                                                                                                   | enabled     | `/home/node/.openclaw/cron/jobs.json` |
| `Weekly Maintenance Debt Guard` | perform the bounded maintenance debt review in Chief           | OpenClaw-native cron in `openclaw-runtime` | weekly `04:05` Monday `America/Nassau` | isolated session only | workspace-visible mirrors of the canonical maintenance docs: `/home/node/.openclaw/workspace/projects/maintenance/DEBT_REGISTER.md`, `/home/node/.openclaw/workspace/runbooks/maintenance_sweep_runbook.md`, `/home/node/.openclaw/workspace/projects/maintenance/TEST_MATRIX.md` | enabled     | `/home/node/.openclaw/cron/jobs.json` |

The operator-review lane is now mixed by design:

- OpenClaw-native cron owns the review generation in the dedicated sessions
- host cron owns the prep, sync, and weekly Telegram-summary support steps
- host cron owns the daily memory continuity finalizer because it maintains
  workspace artifacts rather than generating a model-authored review
- those support scripts now run from committed repo-owned assets under
  `ops/reviews/`

Weekly maintenance note:

- the native maintenance cron currently points Chief at workspace-visible
  mirrors of the canonized maintenance docs because that dedicated session
  surface still cannot reliably read `/app/docs/**` directly
- the underlying authored sources remain canonical under `docs/projects/` and
  `docs/projects/deployment-topology/runbooks/`

GitHub digest status note:

- the scheduled program is canonically represented and runs from committed
  repo-owned assets
- the digest query is scoped to `openclaw/openclaw`, and canonical repo events
  now reach the repaired ingest lane

## Disabled-and-retired host cron entries

These are still present in the host crontab as commented historical references:

- `memory_soak_db_report.sh`
- `memory_performance_report.sh`
- `memory_projection_report.sh --write-sync`
- `daily_memory_evidence_rollup.sh`

These should be treated as disabled historical surfaces, not active live
programs.
