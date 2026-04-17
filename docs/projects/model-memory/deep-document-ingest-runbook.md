---
summary: "Operator runbook for the 2026-04 deep document-ingest pass through the canonical OpenClaw model-memory ingest surface."
title: "Deep Document Ingest Runbook"
---

# Deep Document Ingest Runbook

## Objective

Run the 2026-04 deep document-ingest pass through the canonical OpenClaw
operator surface, not through an ad hoc proof script.

Canonical source plan:

- `docs/projects/model-memory/document-ingest-targets-2026-04-deep-pass.md`

Canonical run artifacts:

- checkpoint JSON:
  `checkpoints/model-memory/model-memory-deep-pass-2026-04.json`
- operator-authored Markdown summary:
  `docs/projects/model-memory/evidence/deep-document-ingest-2026-04-run.md`
- operator-authored JSON summary:
  `docs/projects/model-memory/evidence/deep-document-ingest-2026-04-run.json`

## Preconditions

- use the live OpenClaw deployment
- confirm `/readyz` is healthy before posting the prompt
- do not change the corpus ordering during the run
- do not delete or overwrite prior evidence artifacts unless you are explicitly
  replacing this exact pass

If the checkpoint already exists and you want a genuinely new run, change the
`runId`, checkpoint path, and evidence artifact names together. Do not destroy
historical records just to rerun the pass.

## Canonical operator prompt

Paste the following into OpenClaw:

```text
Read docs/projects/model-memory/document-ingest-targets-2026-04-deep-pass.md and use only the exact file paths listed under its “Target files” sections.

Run the canonical model-memory document-ingest operator surface over that full ordered list with these exact controls:
- runId: model-memory-deep-pass-2026-04
- recordPath: checkpoints/model-memory/model-memory-deep-pass-2026-04.json
- chunkSize: 10
- maxConcurrency: 1
- resume: true
- modelId: openrouter/openai/gpt-5.4-nano
- candidateModelId: openrouter/openai/gpt-5.4-nano
- requestTimeoutMs: 180000
- requestSeed: 7
- maxWordsPerWindow: 1500

Requirements:
- use the canonical model-memory document-ingest path, not a proof script or alternate ingest flow
- do not silently skip unreadable or failing files
- preserve per-source failures in the run record and continue when safe
- keep the source order from the target-list document
- after the run completes, write:
  - docs/projects/model-memory/evidence/deep-document-ingest-2026-04-run.md
  - docs/projects/model-memory/evidence/deep-document-ingest-2026-04-run.json
- in those summary artifacts include:
  - runId
  - checkpoint path
  - docs attempted, completed, and failed
  - total captured claims
  - ignored and rejected window counts
  - aggregate write decisions
  - exact failed file paths with error messages
  - the first 20 completed file paths with captured-claim totals and write decisions
- finish by telling me one of: completed, completed_with_failures, or interrupted
```

## Expected outputs

The run is successful enough to move into verification if all of the following
exist:

- `checkpoints/model-memory/model-memory-deep-pass-2026-04.json`
- `docs/projects/model-memory/evidence/deep-document-ingest-2026-04-run.md`
- `docs/projects/model-memory/evidence/deep-document-ingest-2026-04-run.json`
- a final assistant message that reports one of:
  - `completed`
  - `completed_with_failures`
  - `interrupted`

The checkpoint JSON should include:

- `runId`
- `status`
- `runError` when the run ends interrupted
- `sources`
- `chunks`
- `totals`

The Markdown or JSON summary should include:

- exact corpus size attempted
- total completed and failed files
- a failure list, if any
- the checkpoint path
- enough per-source detail to spot-check the run without opening the full
  checkpoint file immediately

## Failure signs

Treat the run as failed or incomplete if any of the following happen:

- OpenClaw uses a non-canonical ingest path
- the source list is truncated or reordered without explanation
- unreadable files vanish from the result instead of being recorded as failed
- the checkpoint file is missing
- the final summary omits failed files or hides `completed_with_failures`
- the run reports success but `docsAttempted` is materially lower than the
  corpus count in the target-list document

## Resume rule

If the run is interrupted:

- repost the same prompt unchanged
- keep `runId = model-memory-deep-pass-2026-04`
- keep the same checkpoint path
- keep `resume = true`
- inspect `runError` in the checkpoint before assuming a prompt/session problem

After the rebuild-race hardening on `2026-04-17`, a long-running ingest should
no longer depend on avoiding heartbeat or other routine runtime activity. The
relevant failure mode to inspect first is now the checkpoint's own
`status`/`runError`, not transcript folklore.

That preserves chunk resumability and avoids double-counting a new run as if it
were a continuation of a different execution.

## Immediate follow-up

Once the run finishes, move directly to:

- `docs/projects/model-memory/deep-ingest-verification-plan.md`

That plan separates:

- proof that files were processed
- proof that memory was stored
- proof that projections changed
- proof that retrieval and context behavior can now see the new substrate
