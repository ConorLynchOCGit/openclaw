---
summary: "Layered verification plan for the 2026-04 deep document-ingest pass and the later memory-soak checks."
title: "Deep Ingest Verification Plan"
---

# Deep Ingest Verification Plan

## Objective

Define the exact evidence path for verifying the deep document-ingest run and
the later soak checks across all major `model-memory` seams.

This plan explicitly distinguishes:

1. documents processed
2. memory stored
3. projections rebuilt
4. retrieval usable
5. context engine visible
6. cache behavior observable
7. prompt ingestion working
8. daily-summary ingestion working

## Canonical ingest artifacts

- target list:
  `docs/projects/model-memory/document-ingest-targets-2026-04-deep-pass.md`
- runbook:
  `docs/projects/model-memory/deep-document-ingest-runbook.md`
- checkpoint:
  `checkpoints/model-memory/model-memory-deep-pass-2026-04.json`
- summary artifacts:
  - `docs/projects/model-memory/evidence/deep-document-ingest-2026-04-run.md`
  - `docs/projects/model-memory/evidence/deep-document-ingest-2026-04-run.json`

## Evidence matrix

| Capability                | Primary evidence                                                                                | Exact checks                                                  | Success criteria                                                                                                  | Failure criteria                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| document ingest execution | checkpoint JSON + summary artifacts                                                             | confirm `status`, `totals`, and per-source results            | run reaches `completed` or `completed_with_failures`; attempted count matches corpus count; failures are explicit | checkpoint missing, attempted count low, or files silently disappear |
| source persistence        | `model_memory.sources` and `model_memory.source_windows`                                        | compare counts and recent rows after run                      | source count and recent rows increase after the run; `source_kind = document` dominates the deep pass             | no count increase, or recent rows do not reflect the run             |
| memory storage            | `model_memory.memory_objects`, `model_memory.memory_support_items`, `model_memory.write_events` | inspect counts and recent write-event rows                    | object and write-event counts increase; recent rows reflect the run window                                        | no storage growth or only errors without recorded writes             |
| projection rebuild        | `runtime_context.workspace_projection_versions`                                                 | inspect new projection-version rows after the run             | projection versions advance after chunk rebuilds                                                                  | no projection movement after a non-empty ingest                      |
| retrieval usability       | retrieval trace artifacts + retrieval tables + human prompts                                    | run a post-ingest retrieval trace and inspect retrieval rows  | retrieval artifacts show populated requests and result items tied to the new substrate                            | retrieval artifacts stay empty or ignore the new corpus              |
| context engine visibility | context trace artifacts + `runtime_context.context_runs` and `context_run_segments`             | run a post-ingest context trace and inspect context rows      | context trace shows projection/context artifacts using the new substrate                                          | context traces never reference the updated memory surfaces           |
| cache/reuse behavior      | cache-diff artifact + repeated retrieval prompts                                                | run cache diff after repeated retrieval checks                | repeated runs show observable stable/semi-stable reuse behavior                                                   | repeated retrievals always rebuild as if no cache path exists        |
| prompt ingestion          | session log + ordinary-turn rows + later retrieval prompt                                       | perform prompt capture test, then later retrieval             | prompt capture produces later retrievable memory or an explicit write attempt trace                               | no capture evidence and no later retrieval                           |
| daily-summary ingestion   | daily summary file + `source_kind = daily_continuity` rows + later retrieval                    | finalize a daily summary with a canary line, then probe later | daily continuity appears as a source kind and later retrieval can surface it appropriately                        | no daily-continuity ingestion evidence or later retrieval ignores it |

## Immediate post-run checks

### 1. Check the run record

```bash
jq '.status, .totals' checkpoints/model-memory/model-memory-deep-pass-2026-04.json
```

```bash
jq -r '.sources[] | select(.status != "completed") | [.displayPath, .status, (.errorMessage // "-")] | @tsv' \
  checkpoints/model-memory/model-memory-deep-pass-2026-04.json
```

```bash
jq -r '.sources[] | [.displayPath, .capturedClaimCount, (.writeDecisionCounts | tojson)] | @tsv' \
  checkpoints/model-memory/model-memory-deep-pass-2026-04.json | sed -n '1,20p'
```

Success:

- the run record exists
- `docsAttempted` matches the corpus count
- failures, if any, are explicit
- interrupted runs expose `status = "interrupted"` and a populated `runError`

Failure:

- missing checkpoint
- attempted count lower than the corpus count without explicit exclusions
- empty or obviously partial source results

### 2. Check live DB counts

Run these in the live Supabase SQL editor or an equivalent `psql` session
against the live `model_memory` database.

```sql
select count(*) as source_count from model_memory.sources;
select source_kind, count(*) as count
from model_memory.sources
group by 1
order by 1;
select count(*) as source_window_count from model_memory.source_windows;
select count(*) as memory_object_count from model_memory.memory_objects;
select count(*) as support_item_count from model_memory.memory_support_items;
select count(*) as write_event_count from model_memory.write_events;
select count(*) as projection_version_count from runtime_context.workspace_projection_versions;
```

```sql
select external_source_id, source_kind, created_at
from model_memory.sources
order by created_at desc
limit 20;
```

```sql
select decision, created_at
from model_memory.write_events
order by created_at desc
limit 20;
```

Success:

- counts move upward after the ingest run
- recent rows clearly belong to the new run window

Failure:

- no movement in source, object, write-event, or projection counts after a
  non-empty run

## Retrieval, context, and cache checks after ingestion

### Retrieval trace

```bash
MODEL_MEMORY_RETRIEVAL_PROBE_ID=deep-pass-2026-04 node --import tsx scripts/model-memory-retrieval-trace.ts
```

Expected outputs:

- `docs/projects/model-memory/evidence/retrieval-trace-deep-pass-2026-04.json`
- `docs/projects/model-memory/evidence/retrieval-trace-deep-pass-2026-04.md`

Success:

- artifact is written
- retrieval request/result rows exist
- the retrieved package reflects the newly ingested corpus

### Context trace

```bash
MODEL_MEMORY_CONTEXT_PROBE_ID=deep-pass-2026-04 node --import tsx scripts/model-memory-context-trace.ts
```

Expected outputs:

- `docs/projects/model-memory/evidence/context-trace-deep-pass-2026-04.json`
- `docs/projects/model-memory/evidence/context-trace-deep-pass-2026-04.md`

Success:

- artifact is written
- context runs and segments are persisted
- projection/context artifacts reflect the current corpus rather than a stale
  pre-ingest state

### Cache diff

```bash
MODEL_MEMORY_CONTEXT_PROBE_ID=deep-pass-2026-04 node --import tsx scripts/model-memory-cache-diff.ts
```

Expected outputs:

- `docs/projects/model-memory/evidence/cache-diff-report.json`
- `docs/projects/model-memory/evidence/cache-diff-report.md`

Success:

- the artifact shows stable or semi-stable reuse behavior after repeated probes

Failure:

- the artifact shows no meaningful reuse path or indicates total churn where a
  repeated retrieval should have reused stable context

## Later checks for the other two ingestion modes

### Prompt-ingestion lane

Evidence sources:

- session transcript from the capture prompt
- recent `model_memory.sources` rows with `source_kind = ordinary_turn`
- recent `model_memory.write_events`
- later retrieval prompt results

Recommended DB query:

```sql
select external_source_id, source_kind, created_at
from model_memory.sources
where source_kind = 'ordinary_turn'
order by created_at desc
limit 20;
```

Success:

- a prompt capture creates new ordinary-turn source rows or clearly logged write
  attempts
- a later fresh session can retrieve the canary memory

### Daily-summary-ingestion lane

Evidence sources:

- finalized daily summary file under `memory/YYYY-MM-DD.md`
- recent `model_memory.sources` rows with `source_kind = daily_continuity`
- recent `model_memory.write_events`
- later retrieval prompt results

Recommended DB query:

```sql
select external_source_id, source_kind, created_at
from model_memory.sources
where source_kind = 'daily_continuity'
order by created_at desc
limit 20;
```

Success:

- the finalized daily summary is ingested as `daily_continuity`
- later retrieval can surface the intended canary note without treating daily
  continuity as stronger than the primary source

## Capability-to-proof mapping

- document ingest acceptance:
  - checkpoint JSON
  - summary artifacts
  - `model_memory.sources`
  - `model_memory.source_windows`
- memory object creation:
  - `model_memory.memory_objects`
  - `model_memory.memory_support_items`
  - `model_memory.write_events`
- projection updates:
  - `runtime_context.workspace_projection_versions`
- retrieval usability:
  - retrieval trace artifacts
  - `runtime_context.retrieval_requests`
  - `runtime_context.retrieval_result_sets`
  - `runtime_context.retrieval_result_items`
- context-engine visibility:
  - context trace artifacts
  - `runtime_context.context_runs`
  - `runtime_context.context_run_segments`
- cache or reuse behavior:
  - cache-diff artifact
  - repeated retrieval prompts
- prompt ingestion:
  - session logs
  - `source_kind = ordinary_turn`
- daily-summary ingestion:
  - daily memory file
  - `source_kind = daily_continuity`

## Judgment rule

Do not mark the deep pass successful merely because the ingest tool returns.

Treat the substrate as ready for the next phase only if:

- the run record is complete and auditable
- the DB shows source and write growth
- projections moved
- retrieval and context traces can see the new substrate
- later prompt and daily-summary tests also have an explicit evidence path
