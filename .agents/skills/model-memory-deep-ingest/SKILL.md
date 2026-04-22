---
name: model-memory-deep-ingest
description: Resume, seed, monitor, pause, or diagnose OpenClaw model-memory MMV2 deep document ingestion. Use for curated corpus ingestion, checkpoint recovery, retrying failed sources, DB evidence review, projection rebuild/materialization checks, and no-dark-data guardrails. Do not use for ordinary eval/proof output or semantic-forest shortcuts.
---

# Model-Memory Deep Ingest

Use this skill for MMV2 document ingestion work only. The source of truth is the live repo runbook and runner, not legacy captured-object fallback paths.

## Read First

- `docs/projects/model-memory/deep-document-ingest-runbook.md`
- `docs/projects/model-memory/document-ingest-targets-2026-04-deep-pass.md`
- `docs/projects/model-memory/CURRENT_SLICE.md`
- `docs/projects/model-memory/STATUS.md`
- `/root/.openclaw/workspace/memory/YYYY-MM-DD.md` for the current checkpoint note

## Guardrails

- Use the live repo at `/root/services/openclaw-roles/live`.
- Do not ingest proof artifacts, file-pack/eval output, raw prompts, full transcripts, raw tool logs, secrets, `.artifacts/`, or `.openclaw-memory-ops/` JSONL.
- Do not add topic heuristics, semantic forests, fuzzy write-path correction, or legacy collision fallback to make ingestion pass.
- Do not write evaluation/proof output into the live durable-memory DB.
- Root `USER.md` and `MEMORY.md` are human-owned compatibility files; never projection-write back into them.
- Ingest failures are classified, not hidden by broad retries.

## Default Workflow

1. Confirm no duplicate runner is active:

```bash
ps -eo pid,ppid,stat,etime,cmd | rg 'model-memory-document-ingestion-runner|MODEL_MEMORY_RUNNER|pnpm exec tsx scripts/model-memory-document' || true
```

2. Inspect the latest checkpoint and daily note before changing state.
3. Record root `USER.md` / `MEMORY.md` hashes before a live ingest or projection rebuild.
4. Use the canonical MMV2 runner:

```bash
MODEL_MEMORY_RUNNER_ID=<run-id> \
MODEL_MEMORY_RUNNER_CHECKPOINT=checkpoints/model-memory/<checkpoint>.json \
pnpm exec tsx scripts/model-memory-document-ingestion-runner.ts \
  --manifest <manifest-or-target-list>
```

5. For failed-source retry only, use the bounded retry flag from the runner:

```bash
MODEL_MEMORY_RUNNER_RETRY_FAILED=1 \
MODEL_MEMORY_RUNNER_CHECKPOINT=checkpoints/model-memory/<checkpoint>.json \
pnpm exec tsx scripts/model-memory-document-ingestion-runner.ts \
  --manifest <manifest-or-target-list>
```

6. Pause with a normal process signal, then verify checkpoint state reports no running source.
7. After ingest, record DB counts for sources, segments, durable memories, events, and edges.
8. Rebuild read models/projections only through the normal runtime path; verify projection artifacts remain artifact-only.
9. Write a short daily-note checkpoint with attempted/completed/failed/pending counts and failed-source classifications.

## Failure Classes

- corpus issue
- extraction/provider JSON-boundary issue
- canonicalization issue
- admission issue
- DB/persistence issue
- projection/rebuild issue
- timeout/resource issue

Do not solve these by broad semantic matching. If a source is too large or unstable, split/retry that source or defer it with the exact blocker.
