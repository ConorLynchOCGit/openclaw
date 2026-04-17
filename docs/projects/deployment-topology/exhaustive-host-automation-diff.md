---
summary: "Diff of host automation surfaces against canonical repo assets."
title: "Exhaustive Host Automation Diff"
---

# Exhaustive Host Automation Diff

This document audits host-side automation that still exists on the VPS.

It distinguishes:

- active live automations that survive only on the host
- disabled-but-real automations that were previously part of the operating
  model
- automations already represented canonically

## Host automation diff

| Automation surface                                     | Mechanism and current state                                                                          | Current canonical repo state                                                                                                                                     | Classification          | Next action                                                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| GitHub Telegram digest                                 | active root crontab job running committed repo script `ops/github/github_digest_telegram.sh`         | canonical repo now owns the digest script, SQL, workflow exports, and Telegram bridge helper                                                                     | `already_present`       | keep the committed assets aligned with the live cron entry and webhook inputs                   |
| `n8n_sync_check.sh`                                    | active root crontab job running committed repo script `ops/host/n8n_sync_check.sh`                   | committed canonical copy now exists under `ops/host/` plus deployment docs                                                                                       | `already_present`       | keep the probe aligned with the live gateway service contract                                   |
| `db_probe.sh`                                          | active root crontab job running committed repo script `ops/host/db_probe.sh`                         | committed canonical copy now exists under `ops/host/` plus deployment docs                                                                                       | `already_present`       | keep the probe aligned with the live gateway service contract                                   |
| daily operator review prep and sync                    | active root crontab jobs now running committed repo scripts under `ops/reviews/`                     | repo now owns the prep and sync scripts, and sync now resolves the latest successful native cron-run transcript                                                  | `already_present`       | keep the repo-owned scripts aligned with the native daily review session contract               |
| weekly operator review prep, sync, and Telegram bridge | active root crontab jobs now running committed repo scripts under `ops/reviews/`                     | repo now owns the prep, sync, and bridge scripts                                                                                                                 | `already_present`       | keep the restored weekly review support lane aligned with the native review session             |
| Daily Operator Review native cron                      | active OpenClaw-native cron inside `openclaw-runtime`                                                | canonically documented in `scheduled-programs.md`                                                                                                                | `already_present`       | keep documented; no restoration needed                                                          |
| Weekly Operator Review native cron                     | active OpenClaw-native cron inside `openclaw-runtime`                                                | canonically documented in `scheduled-programs.md`                                                                                                                | `already_present`       | keep documented; no restoration needed                                                          |
| Weekly Maintenance Debt Guard native cron              | active OpenClaw-native cron inside `openclaw-runtime`; payload now points at canonical repo docs     | canonical maintenance workspace and runbook now exist                                                                                                            | `already_present`       | keep the live job payload aligned with the canonical maintenance docs                           |
| cron health rollup and session hygiene                 | active root crontab jobs now running committed repo scripts under `ops/host/`                        | repo owns the actual scripts and their deployment docs                                                                                                           | `already_present`       | keep the scripts and archive-note contract aligned                                              |
| inactive workflow review                               | active root crontab job now running committed repo script `ops/host/n8n_inactive_workflow_review.sh` | repo owns the actual script and deployment docs                                                                                                                  | `already_present`       | keep the script and workflow-ownership contract aligned                                         |
| disk, Docker, cache, and build hygiene jobs            | active root crontab jobs now running committed repo scripts under `ops/host/`                        | repo owns the executable scripts plus runbook posture                                                                                                            | `already_present`       | keep the hygiene lane aligned with the live host schedule                                       |
| memory reporting jobs                                  | disabled host crontab jobs retained only as historical references                                    | canonical retirement boundary now exists under `model-memory` docs                                                                                               | `intentionally_retired` | keep the standalone legacy cron lane retired                                                    |
| `supabase_db_backup.sh`                                | active root crontab job now running committed repo script `ops/host/supabase_db_backup.sh`           | committed canonical copy now exists under `ops/host/` plus deployment docs                                                                                       | `already_present`       | keep the backup lane aligned with the live DB and artifact contract                             |
| `webhook-gateway` service tree                         | live host service at `/root/services/webhook-gateway/`                                               | canonical repo now owns the retained probe and intake assets that this repo still depends on; the broader service tree remains an explicit external-ops boundary | `already_present`       | keep the boundary explicit and avoid treating the separate service tree as a hidden rescue case |

## Observations

- the active host automation lane is now substantially canonized into committed
  repo assets
- the operator-review support path is now fully canonized and proven through the
  current prep, sync, and weekly Telegram bridge assets
- the broader `webhook-gateway` service tree is now treated as an explicit
  external-ops boundary rather than a hidden canonization gap inside this repo
