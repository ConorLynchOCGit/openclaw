---
summary: "Audit of archived consolidation material that was missing, retained, or intentionally left out from the canonical live repo/runtime posture."
title: "Archive Retention Audit"
---

# Archive Retention Audit

This audit uses archived consolidation material as evidence, not as automatic
truth.

The goal is to separate:

- functionality that was accidentally dropped and needed restoration
- functionality that should come back later
- functionality that was intentionally retired
- archive residue that should remain historical only

## Findings

| finding                                                                              | archived source                                                                                                                         | prior function                                                                         | current status before this slice                                                                                            | classification           | action                                                                          |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| `web-researcher` dedicated workspace pack                                            | `projects/live_app_patches/openclaw-runtime-2026-03-30/web-researcher-agent-runtime.patch`, backup `web-researcher-*.md` files          | standalone public-web retrieval specialist workspace                                   | live runtime config still referenced it, session history still existed, current mounted workspace dir was missing           | `must_restore_now`       | restored workspace pack now                                                     |
| `x-manager` dedicated workspace seed and context                                     | `projects/live_app_patches/openclaw-runtime-2026-03-28/x-manager-workspace-seed/**`, runbook Phase 10.6 notes, `x-manager-context-*.md` | standalone X drafting/reply/approval specialist workspace                              | live runtime config still referenced it, canonical session history still existed, current mounted workspace dir was missing | `must_restore_now`       | restored bounded workspace seed now                                             |
| daily GitHub Telegram digest                                                         | archived root crontab snapshots, `cron-logs/github_digest.log`, live script still present                                               | weekday GitHub summary sent to Telegram                                                | still live in root crontab but absent from canonical repo-side deployment inventory                                         | `must_restore_now`       | recorded now in `scheduled-programs.md`                                         |
| mixed host cron operational lane                                                     | archived crontab snapshots + live crontab + workspace `projects/ops/*.sh`                                                               | n8n sync, DB probe, cron health, session hygiene, DB backup, disk/cache/docker hygiene | still live but not durably inventoried in canonical repo docs                                                               | `must_restore_now`       | recorded now in `scheduled-programs.md`                                         |
| weekly operator review Telegram bridge                                               | archived crontab snapshots and current commented crontab line                                                                           | deliver weekly review summary to Telegram after prep/sync chain                        | explicitly commented out after VPS consolidation                                                                            | `intentionally_left_out` | keep documented as disabled history, do not restore automatically               |
| daily memory evidence rollup and memory soak/performance/projection report host jobs | archived crontab snapshots and current commented crontab lines                                                                          | host-side memory observability support jobs from earlier rollout shape                 | explicitly commented out after VPS consolidation                                                                            | `intentionally_left_out` | keep as disabled history unless memory-ops posture is reintroduced deliberately |
| old native writer/builder/chief smoke cron jobs visible only in run logs             | `/home/node/.openclaw/cron/runs/*.jsonl`, archived run histories                                                                        | earlier proof/smoke lanes for runtime validation                                       | not present in current jobs.json, only historical runs remain                                                               | `archive_only`           | do not restore as live jobs                                                     |
| `researcher` agent runtime                                                           | live config + live workspace + missing `sessions.json`                                                                                  | specialist agent with dedicated workspace                                              | configured and workspace-present, but not initialized into a canonical session store                                        | `should_restore_next`    | decide whether to initialize or retire explicitly in the next agent slice       |

## Summary

- The most important accidental losses were the missing mounted workspace dirs
  for `web-researcher` and `x-manager`.
- The most important missing durable documentation was the host-side scheduled
  program lane, especially the GitHub Telegram digest.
- Several older cron surfaces were not accidentally lost; they were explicitly
  disabled and should stay documented as disabled history unless reactivated by
  a deliberate operator decision.
