---
name: model-memory-deep-ingest
description: Run, resume, or monitor the canonical model-memory bulk document-ingest pass from the repo-owned target list and runbook. Use when asked to seed the memory substrate, execute the deep ingest pass, continue an interrupted ingest run, verify ingest progress, or check whether a bulk ingest is stalled.
user-invocable: false
metadata: { "openclaw": { "emoji": "🧠" } }
---

# model-memory-deep-ingest

Use this skill for the canonical bulk memory-substrate ingest flow.

Do not use it for ordinary one-off file reads, ad hoc summarization, or a
single-file ingest request.

## Canonical sources

Read these docs first:

- `docs/projects/model-memory/deep-document-ingest-runbook.md`
- `docs/projects/model-memory/document-ingest-targets-2026-04-deep-pass.md`

Read this only when the user asks to verify or audit the result:

- `docs/projects/model-memory/deep-ingest-verification-plan.md`

## Execution workflow

1. Read the runbook and follow its exact control values.
2. Read the target-list document and extract only the exact file paths listed
   under its `Target files` sections.
3. Use the canonical `model_memory_document_ingest` operator surface over that
   ordered list.
4. Preserve the runbook contract:
   - keep the declared `runId`
   - keep the declared checkpoint path
   - keep `resume: true` for a continuation
   - keep per-source failures recorded instead of silently skipping them
5. Write the required run artifacts named by the runbook.

## Monitoring workflow

If the ingest is already in progress and the user asks whether it is stuck:

1. Inspect the active session log and the checkpoint file if present.
2. Treat the run as active when timestamps, source status, or completed/chunk
   totals continue to advance.
3. Treat the run as stalled only when repeated checks show no session-log
   progress and no checkpoint movement.
4. Report the last concrete progress evidence, not a guess.

## Guardrails

- Do not switch to proof scripts, smoke scripts, or alternate ingest paths when
  the user asked for the canonical bulk pass.
- Do not start by reading ingestion implementation files just to understand the
  tool. Read the runbook and target list first, then execute the canonical
  ingest call.
- Only inspect implementation files if the canonical ingest path fails,
  contradicts the runbook contract, or returns an unclear runtime error.
- Do not reorder the source list.
- Do not silently drop unreadable files.
- Do not mint a new `runId` or checkpoint path for what is actually a resumed
  run.

## Completion contract

Before calling the run done, confirm these artifacts exist:

- `checkpoints/model-memory/model-memory-deep-pass-2026-04.json`
- `docs/projects/model-memory/evidence/deep-document-ingest-2026-04-run.md`
- `docs/projects/model-memory/evidence/deep-document-ingest-2026-04-run.json`

Final status must be reported as one of:

- `completed`
- `completed_with_failures`
- `interrupted`

## After the run

If the user asks whether ingest really worked, move to:

- `docs/projects/model-memory/deep-ingest-verification-plan.md`

That plan separates:

- file processing proof
- stored-memory proof
- projection/context proof
- later retrieval and cache proof
