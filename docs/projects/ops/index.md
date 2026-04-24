# Ops Index

Purpose

Guide to recurring operator scripts and generated current context.

## Scripts

### Review pipeline

- `ops/reviews/daily_memory_evidence_rollup.sh`
- `workspace/projects/ops/memory_projection_report.sh`
- `ops/reviews/daily_operator_review_prep.sh`
- `ops/reviews/daily_operator_review_sync_artifact.sh`
- `ops/reviews/weekly_operator_review_prep.sh`
- `ops/reviews/weekly_operator_review_sync_artifact.sh`
- `ops/reviews/weekly_operator_review_telegram_bridge.sh`

### Maintenance / hygiene

- `ops/host/build_runtime_hygiene_report.sh`
- `ops/host/cache_hygiene.sh`
- `ops/host/disk_maintenance.sh`
- `ops/host/docker_hygiene_cleanup.sh`
- `ops/host/cron_health_rollup.sh`
- `ops/host/cron_session_hygiene_report.sh`
- `workspace/projects/ops/memory_performance_report.sh`
- `workspace/projects/ops/memory_soak_db_report.sh`
- `ops/host/n8n_inactive_workflow_review.sh`
- `ops/host/supabase_db_backup.sh`
- `ops/host/lib/postgres_client.sh`
  - shared canonical Postgres client image selection for host-side DB probes, reports, and backups

### Delivery helper

- `ops/telegram/send_chief_telegram.sh`

## Generated current context

Under `workspace/projects/ops/generated_current/`:

- `daily_operator_review_context_current.md`
- `memory_ops_health_report_current.md`
- `memory_projection_report_current.json`
- `memory_projection_summary_current.md`
- `memory_projection_orchestration_current.json`
- `memory_projection_orchestration_current.md`
- `weekly_review_context_current.md`
- `weekly_review_telegram_summary_current.txt`

These are live working artifacts, not archive records. The writable
`workspace/projects/ops/` overlay remains justified specifically for these
generated-current outputs and a small set of host paths that have not yet been
fully repointed.

The Memory Ops current report alias is intentionally a generated convenience
surface. Canonical ownership remains the live repo evidence artifact at
`.openclaw-memory-ops/reports/latest.md`.

## Dedicated report sessions

- `Daily Operator Review`
  - agent `main`
  - session key `agent:main:daily-operator-review`
- `Weekly Operator Review`
  - agent `main`
  - session key `agent:main:weekly-operator-review`
- `Weekly Maintenance Debt Guard`
  - agent `chief`
  - session key `agent:chief:weekly-maintenance-debt-guard`

## Use Rules

- scripts here are active operational surfaces
- `generated_current/` is a working layer, not a durable archive layer
- if a proof-worthy run should persist, promote it into `archives/`
- recurring operator reports should land in the dedicated sessions above, not in generic `main`

<!-- OPENCLAW:MEMORY-PROJECTION:START memory-projection:project-memory-digest:ops -->

## Compiled Project Memory

- No eligible approved memory is currently projected.
<!-- OPENCLAW:MEMORY-PROJECTION:END memory-projection:project-memory-digest:ops -->
