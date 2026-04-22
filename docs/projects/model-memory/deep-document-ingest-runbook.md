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

If individual sources fail because of provider, timeout, or JSON-boundary
errors and the rest of the run continues, retry only failed sources with the
same run id and checkpoint by setting:

```text
MODEL_MEMORY_RUNNER_RETRY_FAILED=1
```

After a runner/funnel fix, retry only the fixed failure classes rather than the
entire failed set:

```text
MODEL_MEMORY_RUNNER_RETRY_FAILED=1
MODEL_MEMORY_RUNNER_RETRY_FAILED_CLASSES=provider_empty_response,provider_json_boundary
```

Keep `resume=true`, keep the same checkpoint path, and prefer conservative
`maxConcurrency=1` unless the provider and database are already stable. This
retries failed source records while preserving completed source records and
avoids manually editing checkpoint or durable-memory DB state.

## Direct runner resume notes

The repo-local runner can also be resumed directly when OpenClaw operator
execution is not the right control surface. Use the runner plan JSON, not the
human corpus manifest JSON. The 2026-04-22b pass uses:

```bash
MODEL_MEMORY_RUNNER_RUN_ID=model-memory-deep-pass-2026-04-22b \
MODEL_MEMORY_RUNNER_RECORD_PATH=checkpoints/model-memory/model-memory-deep-pass-2026-04-22b.json \
MODEL_MEMORY_RUNNER_PLAN_PATH=.artifacts/model-memory/document-ingest/2026-04-22-corpus/runner-plan.json \
MODEL_MEMORY_RUNNER_MAX_CONCURRENCY=2 \
MODEL_MEMORY_RUNNER_CHUNK_SIZE=10 \
pnpm exec tsx scripts/model-memory-document-ingestion-runner.ts
```

Do not pass the corpus `manifest.json` as the runner plan. The manifest records
operator metadata; the runner expects a source plan with `relativePath` entries.

Before resuming:

- confirm no duplicate runner is active
- back up the checkpoint into the corpus artifact directory
- record root `USER.md` / `MEMORY.md` hashes
- record before DB counts
- confirm provider credits and account limits are sufficient
- leave provider preflight enabled unless intentionally debugging the preflight
  itself

If the provider returns a credit/capacity error such as OpenRouter `402`, stop
the runner instead of allowing every pending source to fail with the same
provider class. Resume only after credits are restored. Use bounded
`MODEL_MEMORY_RUNNER_RETRY_FAILED=1` for failed sources and do not broad-retry
completed sources.

The runner now includes an enabled-by-default failure circuit breaker. It stops
the run before the checkpoint is flooded with low-signal failures when provider
or extraction infrastructure is unhealthy.

Circuit-breaker controls:

```bash
# default: enabled; set to 0 only for controlled debugging
MODEL_MEMORY_RUNNER_FAILURE_CIRCUIT_BREAKER=1

# defaults shown
MODEL_MEMORY_RUNNER_MAX_PROVIDER_BOUNDARY_FAILURES_PER_CHUNK=5
MODEL_MEMORY_RUNNER_MAX_CONSECUTIVE_PROVIDER_BOUNDARY_FAILURES=4
MODEL_MEMORY_RUNNER_MAX_CHUNK_FAILURE_RATIO=0.8
MODEL_MEMORY_RUNNER_MIN_CHUNK_ATTEMPTS_FOR_FAILURE_RATIO=6
```

Provider and retry controls:

```bash
# default: enabled; performs a tiny JSON request before corpus work starts
MODEL_MEMORY_RUNNER_PREFLIGHT=1

# strict retry cap for missing-text provider responses; default: 1
MODEL_MEMORY_RUNNER_EMPTY_RESPONSE_RETRIES=1

# optional fallback model/provider for empty-response retry or preflight fallback
MODEL_MEMORY_RUNNER_ALTERNATE_MODEL=openrouter/openai/gpt-5.4-mini

# optional cost telemetry estimate printed with progress
MODEL_MEMORY_RUNNER_ESTIMATED_COST_PER_SOURCE_USD=0.02
```

Large-source splitting controls:

```bash
# default: enabled for fresh runs; existing checkpoint source ids are preserved
MODEL_MEMORY_RUNNER_SPLIT_LARGE_SOURCES=1

# default: 4x MODEL_MEMORY_EVIDENCE_MAX_WORDS_PER_WINDOW
MODEL_MEMORY_RUNNER_MAX_WORDS_PER_SOURCE=12000
```

Circuit-breaker classes:

- provider credit/capacity errors, including OpenRouter `402`, interrupt
  immediately
- repeated missing-text provider responses interrupt the chunk/run before more
  sources are consumed
- repeated provider JSON-boundary or connection failures count toward the same
  provider-boundary threshold
- very high chunk failure ratios interrupt the run even if the individual
  failures are mixed

When the circuit breaker trips, do not lower admission realism or add semantic
matching. Classify the failure, fix or wait out the provider/runner issue, then
resume with explicit bounded retry.

Failed-source quarantine reports:

- the runner writes `<checkpoint>.failed-sources.json` by default
- override with `MODEL_MEMORY_RUNNER_FAILED_SOURCE_REPORT_PATH`
- generate a report without provider calls by setting
  `MODEL_MEMORY_RUNNER_REPORT_ONLY=1`
- reports include source id, display path, chunk, failure class, a bounded error
  excerpt, class counts, and the retry-class environment knob
- treat malformed JSON repair output, canonicalization invalid output,
  provider-boundary errors, and DB persistence failures as quarantine classes
  until the matching code path is fixed

DB edge persistence:

- invalid MMV2 memory edges are validated before insert
- edges whose endpoints are missing are deferred into bounded event payload
  metadata instead of violating `memory_edges` foreign keys
- deferred edges do not supersede or mutate target memory state

Observed 2026-04-22b performance posture:

- serial concurrency 1 was stable but too slow for the full corpus
- concurrency 3 increased transient `Connection terminated unexpectedly`
  failures
- concurrency 2 was the best observed balance before provider credits were
  exhausted
- provider health preflight, missing-text retry caps, alternate model fallback,
  adaptive large-source splitting, failed-source quarantine reports, class
  filtered retry, progress/cost telemetry, and FK-safe edge deferral are now
  implemented as runner/funnel hardening
- remaining future work: adaptive concurrency, per-source timeout/stuck-source
  detection, and a dry-run cost/size estimate before the next large pass

## Immediate follow-up

Once the run finishes, move directly to:

- `docs/projects/model-memory/deep-ingest-verification-plan.md`

That plan separates:

- proof that files were processed
- proof that memory was stored
- proof that projections changed
- proof that retrieval and context behavior can now see the new substrate
