---
summary: "Operator runbook for model-memory pre-Phase-2 recovery, restore, and reconcile gates."
title: "Pre-Phase-2 Recovery Gates"
---

# Pre-Phase-2 Recovery Gates

This runbook is the operator surface for the pre-Phase-2 recovery and restore
gate.

Use it to answer five questions before Phase 2 starts:

1. What state is memory-critical and must survive restart or restore?
2. Do corrupt runtime-state files degrade safely instead of blinding the
   subsystem?
3. Can operational state be backed up and restored in isolation?
4. Is durable MMV2 DB restore proven separately from file-backed spools?
5. After restore, does the system classify itself as clean, replay-required,
   rebuild-required, blocked-busy, or quarantined-corrupt?

## Memory-Critical State Inventory

The minimum state inventory is:

- `durable_mmv2_db`
  - class: `semantic_truth`
  - restart action: `resume`
  - notes: canonical MMV2 truth in PostgreSQL-backed tables
- `capture_jobs`
  - class: `operational_state`
  - restart action: `replay`
  - notes: safe file-backed capture job snapshots and JSONL events
- `runtime_dirty`
  - class: `operational_state`
  - restart action: `rebuild`
  - notes: runtime dirty/rebuild spool for projection and retrieval freshness
- `projection_artifacts`
  - class: `derived_artifact`
  - restart action: `rebuild`
  - notes: materialized workspace projection markdown/json/index outputs
- `provider_scorecards`
  - class: `operational_state`
  - restart action: `resume`
  - notes: safe contract/schema/latency/token/cache scorecards

Interpretation rule:

- semantic truth must be restorable
- operational state must be replayable or resumable
- derived artifacts may be rebuilt, but must never silently masquerade as
  current if they are missing, stale, or corrupt

## Reconcile Classes

The restore/restart report now uses explicit reconcile classes:

- `clean`
  - state is readable and no replay/rebuild action is required
- `replay_required`
  - unfinished capture work exists and must be resumed/replayed
- `rebuild_required`
  - runtime-dirty or projection state requires rebuild before Phase-2 entry
- `blocked_busy`
  - a required file surface is temporarily unreadable due to lock/busy state
- `quarantined_corrupt`
  - corruption was detected or prior quarantine residue exists
- `stale_but_servable`
  - reserved only if we intentionally decide a stale-but-safe serving posture
    is acceptable; this slice does not rely on it

Phase-2 entry rule:

- any class other than `clean` is a blocker until explicitly cleared or signed
  off

## Failure Classes Covered

Crash/restart hardening now covers:

- partial JSON writes
- truncated JSONL
- locked/busy file reads
- replay-required capture jobs
- rebuild-required dirty/projection state
- quarantine retention cleanup

Current tolerant-read behavior:

- capture job sibling files no longer disappear because one job file is corrupt
- runtime-dirty state/events fall back safely and quarantine corrupt residue
- provider scorecard history no longer poisons summary rebuild if one JSONL
  line is bad

## Operator Command

Primary recovery report:

```bash
node --import tsx scripts/model-memory-phase2-recovery-gates.ts
```

Suggested artifact capture:

```bash
mkdir -p .artifacts/model-memory/pre-phase-2-recovery-gates
node --import tsx scripts/model-memory-phase2-recovery-gates.ts \
  > .artifacts/model-memory/pre-phase-2-recovery-gates/$(date -u +%Y-%m-%dT%H%M%SZ).json
```

The report is read-safe:

- it does not mutate semantic MMV2 truth
- it runs the DB runtime with `applyMigrations: false`
- it inspects runtime-state spools without auto-repairing them

The report answers:

- what roots are being inspected
- which surface is clean, replay-required, rebuild-required, blocked, or
  quarantined
- which recoveries/quarantine paths exist
- whether logical DB backup tooling (`pg_dump`, `pg_restore`) is present

## Backup / Restore Proof Posture

Two proof lanes now exist:

1. Operational file-backed state proof
   - isolated temp runtime-state roots
   - isolated workspace projection root
   - backup manifest plus restore roundtrip
   - post-restore reconcile must return `clean`
2. Durable MMV2 DB proof
   - isolated `pg-mem` test database
   - migration apply
   - snapshot via `db.backup()`
   - mutate state after snapshot
   - restore snapshot
   - prove the post-restore durable rows match the pre-mutation snapshot

This is intentional:

- operational spool proof should not touch live state
- semantic DB restore proof should not depend on whatever tooling happens to be
  installed on the current host

## Live Logical Backup Procedure

Automated tests use isolated `pg-mem`.
For live PostgreSQL backup/restore posture, the recommended logical commands
remain:

```bash
pg_dump -Fc "$MODEL_MEMORY_DATABASE_URL" > model-memory.dump
pg_restore --clean --if-exists --no-owner --dbname "$MODEL_MEMORY_DATABASE_URL" model-memory.dump
```

Use those only in approved operator procedures.
Do not use the recovery-gates script itself as a live restore tool.

## What Counts As Green

Treat the recovery/restore slice as green only when:

- the focused recovery suite is green
- the recovery report runs successfully
- no surface reports `replay_required`, `rebuild_required`, `blocked_busy`, or
  `quarantined_corrupt`
- the isolated operational backup/restore proof returns `clean`
- the isolated durable MMV2 DB restore proof is green

## Remaining Work After This Slice

This runbook does not replace the final Phase-2 validation pack.

After recovery/restore is green, the remaining blocker is:

- Phase-2 entry validation pack
  - controlled load test
  - retrieval quality evals independent of capture
  - no-dark-data adversarial checks
  - final go/no-go report
