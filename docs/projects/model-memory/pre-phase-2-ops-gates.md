---
summary: "Operator runbook for model-memory pre-Phase-2 traceability and DB gate checks."
title: "Pre-Phase-2 Ops Gates"
---

# Pre-Phase-2 Ops Gates

This runbook is the operator surface for the pre-Phase-2 traceability and DB
gate slice.

Use it to answer four questions before Phase 2 starts:

1. Can a safe memory path be traced end to end?
2. Are the pre-Phase-2 SLOs explicitly green, yellow, or red?
3. Is the DB a plausible bottleneck under current memory load?
4. Are vacuum/analyze freshness or dead-tuple buildup already degrading
   planner/runtime behavior?

## Safe Trace-ID Contract

The shared trace id is a safe correlation id, not semantic truth.

- prefix: `memory_trace_`
- maximum length: `96`
- accepted character set:
  `memory_trace_[A-Za-z0-9_.:@/-]+`
- raw prompt text, raw transcript text, raw tool output, and unbounded source
  text are never written into the trace id

Current builders:

- ordinary-turn:
  - `memory_trace_turn_<digest>`
  - digest input is the SHA-256 of normalized turn text plus safe session/agent
    identity fields
- tool-result:
  - `memory_trace_tool_<digest>`
  - digest input is the SHA-256 of safe session/agent/run/tool identity fields

Current propagation surfaces:

- gateway/live runtime turn entry
- capture seam activity
- capture job snapshots/events
- closeout artifacts
- runtime-dirty marks and rebuild-completed events
- retrieval request scope as `memoryTraceId`
- retrieval pack structured payload
- retrieval and context-injection activity

This is sufficient to correlate one safe operator turn through capture,
persistence-side scheduling, rebuild, retrieval, and final injection without
opening raw content.

## Operator Commands

Primary DB gate report:

```bash
node --import tsx scripts/model-memory-phase2-db-gates.ts
```

Suggested artifact capture:

```bash
mkdir -p .artifacts/model-memory/pre-phase-2-db-gates
node --import tsx scripts/model-memory-phase2-db-gates.ts \
  > .artifacts/model-memory/pre-phase-2-db-gates/$(date -u +%Y-%m-%dT%H%M%SZ).json
```

The report is read-only. It does not mutate semantic truth, and it runs the
DB runtime with `applyMigrations: false`.

## SLO Gates

The pre-Phase-2 SLO definitions are:

- `capture_job_p95_latency_ms`
  - class: `blocker`
  - green: `<= 15000`
  - yellow: `<= 45000`
  - red: `> 45000`
- `capture_failure_rate_pct`
  - class: `blocker`
  - green: `< 1`
  - yellow: `< 5`
  - red: `>= 5`
- `pool_wait_p95_ms`
  - class: `blocker`
  - green: `<= 250`
  - yellow: `<= 1000`
  - red: `> 1000`
- `projection_freshness_lag_seconds`
  - class: `blocker`
  - green: `<= 60`
  - yellow: `<= 300`
  - red: `> 300`
- `retrieval_miss_rate_pct`
  - class: `warning`
  - green: `<= 25`
  - yellow: `<= 40`
  - red: `> 40`
- `stale_projection_count`
  - class: `blocker`
  - green: `= 0`
  - yellow: `<= 5`
  - red: `> 5`
- `provider_schema_failure_rate_pct`
  - class: `blocker`
  - green: `= 0`
  - yellow: `< 1`
  - red: `>= 1`
- `no_dark_data_scan_failures`
  - class: `blocker`
  - green: `= 0`
  - red: `> 0`

Interpretation:

- blocker metric at `red`: Phase 2 is blocked
- blocker metric at `yellow`: do not enter Phase 2 without an explicit
  mitigation or sign-off recorded in the gate review
- warning metric at `red`: treat as a likely gate failure unless a bounded
  explanation and mitigation already exists
- warning metric at `yellow`: investigate before Phase-2 entry review

## DB Baseline Report

The DB gate report returns:

- `slos`
  - the canonical pre-Phase-2 SLO definitions above
- `pool`
  - current DB pool snapshot and lane stats
- `pgStatStatements`
  - read-only top query-family baseline for memory-relevant SQL
- `maintenanceHealth`
  - read-only dead-tuple/analyze-freshness report for memory-critical tables

### `pg_stat_statements`

The query-family baseline groups observed query families into:

- `capture_persistence`
- `retrieval_runtime`
- `projection_runtime`
- `audit_or_ops`

Per-family output includes:

- `calls`
- `meanExecTimeMs`
- `maxExecTimeMs`
- `rows`
- `sharedBlocksRead`
- `sharedBlocksHit`
- `tempBlocks`

Graceful unavailable states are explicit:

- `not_installed`
- `not_accessible`
- `query_failed`
- `no_memory_queries_observed`

If `pg_stat_statements` is unavailable, that is not itself semantic failure,
but it does leave the DB bottleneck picture incomplete for Phase-2 review.

## Maintenance Health Report

The maintenance report is derived from `pg_stat_user_tables` plus table size
metadata for memory-critical relations only.

Current approximation:

- `dead_tuple_and_analyze_freshness`

It reports:

- dead tuple count and percentage
- modifications since analyze and percentage
- last vacuum / autovacuum timestamps
- last analyze / auto-analyze timestamps
- severity classifications:
  - `deadTupleSeverity`
  - `analyzeSeverity`
  - `bloatRiskSeverity`
  - `overallSeverity`

This is a read-only approximation, not an invasive exact bloat calculator.
Use it to decide whether stale planner stats or tuple cleanup posture are
plausible causes of retrieval or capture slowdown.

## Phase-2 Entry Blocking Rules

Treat the traceability/DB gate slice as green only when:

- safe `memory_trace_*` ids are present on the active memory path surfaces for
  the operator flow under review
- the DB gate report runs successfully
- blocker SLOs are not red
- maintenance health has no unexplained red finding on memory-critical tables
- any `pg_stat_statements` unavailability is explicitly recorded if the
  extension is not present or not accessible

This slice does not replace the later recovery/restore proof or the final
Phase-2 validation pack. It is the observability baseline that those later
gates depend on.
