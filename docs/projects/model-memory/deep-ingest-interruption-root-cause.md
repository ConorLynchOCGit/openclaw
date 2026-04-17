---
summary: "Timeline and root-cause record for the 2026-04 Main-session deep document-ingest interruption."
title: "Deep Ingest Interruption Root Cause"
---

# Deep Ingest Interruption Root Cause

This document records the exact interruption class behind the original Main
OpenClaw deep document-ingest run.

## Conclusion

The original run was not stopped because heartbeat explicitly canceled or reset
the ingest worker.

The run failed because the background ingest worker reached its chunk-end
derived-runtime rebuild and hit a Postgres primary-key collision on
`runtime_context.active_memory_slots`.

The heartbeat activity matters because it overlapped with the same Main session
in the same time window, and the live runtime rebuild path was available on both
the interactive ordinary-turn lane and the bulk-ingest lane without any
cross-process serialization.

That means heartbeat created a real overlap window, but the proven fatal event
was the runtime rebuild uniqueness failure, not a generic heartbeat reset.

## Exact artifacts and identifiers

- Main session log:
  `/root/.openclaw/agents/main/sessions/9196a3c3-7038-422d-960b-9f1ee4a13ada.jsonl`
- Background async worker session:
  `briny-prairie`
- Original run id:
  `model-memory-deep-pass-2026-04`
- Original checkpoint:
  `/root/.openclaw/workspace/checkpoints/model-memory/model-memory-deep-pass-2026-04.json`
- Workspace-authored summary artifact:
  `/root/.openclaw/workspace/docs/projects/model-memory/evidence/deep-document-ingest-2026-04-run.md`

## Proven timeline

### 1. Ingest was already active

The Main session launched the canonical ingest with:

- `runId = model-memory-deep-pass-2026-04`
- `recordPath = checkpoints/model-memory/model-memory-deep-pass-2026-04.json`
- `chunkSize = 10`
- `maxConcurrency = 1`

Evidence:

- Main session log entry at `2026-04-17T01:49:01.252Z`
- repeated prompt replay at `2026-04-17T01:51:12.214Z`

### 2. Heartbeat overlapped while the worker was still running

Heartbeat request entered the same Main session at:

- `2026-04-17T02:37:21.577Z`

During heartbeat handling, Main checked the ingest checkpoint and observed the
run still healthy:

- checkpoint status: `running`
- checkpoint `updatedAt`: `2026-04-17T02:37:32.218Z`
- totals: `117 attempted / 117 completed / 0 failed / 507 captured claims`

Evidence:

- Main session log entries `198` through `204`

### 3. Heartbeat wrote the daily note while ingest was still live

Main wrote the daily workspace memory note at:

- `2026-04-17T02:37:55.867Z`

Evidence:

- Main session log entry `206`

### 4. The actual failure arrived from the async worker

The Main session later received the async completion notice:

- system message timestamp: `2026-04-17T02:38:34.301Z`
- async completion text reports:
  - process session `briny-prairie`
  - exit code `1`
  - duplicate-key failure on `slot_key`

Evidence:

- Main session log entry `208`

The worker process record in the session log shows:

- `briny-prairie completed 44m29s :: npx tsx`

Evidence:

- Main session log entry `212`

### 5. The checkpoint and summary match the worker failure

The checkpoint stopped at:

- `docsAttempted = 120`
- `docsCompleted = 120`
- `docsFailed = 0`
- `updatedAt = 2026-04-17T02:38:26.020Z`

The workspace summary records the exact interruption:

- phase: `runtime_rebuild_after_source_120`
- error:
  `duplicate key value violates unique constraint "active_memory_slots_pkey"`
- detail:
  `Key (slot_key)=(slot_00159ce7e43067e85c6e8d45) already exists.`
- table:
  `runtime_context.active_memory_slots`
- last completed file:
  `docs/projects/model-memory/specs/post-cutover-hierarchical-retrieval.md`
- next pending file:
  `docs/projects/model-memory/specs/prompt-contract.md`

Evidence:

- checkpoint JSON under `/root/.openclaw/workspace/checkpoints/model-memory/`
- workspace summary artifact under
  `/root/.openclaw/workspace/docs/projects/model-memory/evidence/`

## Why heartbeat looked like the cause

Heartbeat and ingest shared the same Main-session narrative window:

- heartbeat checked the ingest while it was still running
- heartbeat wrote the daily note shortly before the crash notice arrived
- the user-visible async completion was delivered back into Main after the
  heartbeat interaction

That makes heartbeat look causal from the outside.

What the logs actually prove is narrower:

- the background worker kept running while heartbeat was active
- the worker exited only when its own async process hit the duplicate-key
  failure
- the failure happened during derived-runtime rebuild, not during session reset,
  `/new`, `/reset`, or transcript compaction

## Actual interruption class

The real interruption class was:

- unsynchronized concurrent derived-runtime rebuilds against the shared
  `runtime_context` tables

Relevant code paths:

- bulk ingest chunk-end rebuild:
  `extensions/model-memory/src/admin/document-ingestion-runner-service.ts`
- live document-ingest rebuild:
  `extensions/model-memory/src/live-document-ingestion-service.ts`
- live ordinary-turn rebuild:
  `extensions/model-memory/src/live-ordinary-turn-capture-service.ts`
- rebuild implementation:
  `extensions/model-memory/src/runtime-rebuild-orchestrator.ts`
- runtime table writes:
  `extensions/model-memory/src/db/runtime-context-repository.ts`

Before the fix, rebuild writers were not serialized across processes or runtime
lanes.

## Fix direction

The prevention fix is:

- serialize derived-runtime rebuilds with a runtime rebuild advisory lock
- persist `interrupted` run state and `runError` details when a long-running
  ingest exits on rebuild failure

That hardens the actual failure seam instead of asking operators to avoid
heartbeat or other routine runtime activity.
