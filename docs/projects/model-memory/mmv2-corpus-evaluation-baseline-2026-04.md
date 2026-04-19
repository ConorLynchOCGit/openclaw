---
summary: "Baseline record for the first MMV2 document-corpus evaluation lane."
title: "MMV2 Corpus Evaluation Baseline 2026-04"
---

# MMV2 Corpus Evaluation Baseline 2026-04

## Live baseline

- git root confirmed as `/root/services/openclaw-roles/live`
- current branch head at baseline review:
  - `e39919c6f31c7584ef287cd39f23bca2605146a8`
- ahead / behind versus `origin/main` at baseline review:
  - ahead `1`
  - behind `0`
- current MMV2 document shadow lane already exists under:
  - `extensions/model-memory/src/mmv2/`
- current v1 proof surfaces already exist under:
  - `extensions/model-memory/src/proof/proof-corpus.ts`
  - `extensions/model-memory/src/proof/proof-runner.ts`

## Current MMV2 boundary before this sprint

- `ingestDocumentV2Shadow(...)` can execute one document through:
  - raw ingest
  - segmentation
  - routing
  - atomic extraction
  - composite extraction
  - suppression
  - canonicalization
  - admission
  - reconciliation
  - shadow recording
  - post-write audit
- shadow recording remains in-memory only:
  - `recordShadowMemoryBatch(...)` returns shadow records and events
  - no live durable-memory DB write occurs
- live v1 seams remain separate and still authoritative for production:
  - `ingestDocument(...)`
  - `captureOrdinaryTurn(...)`

## Exact evaluation gap before this sprint

- MMV2 can shadow-ingest a document
- MMV2 does not yet have a dedicated replayable corpus contract
- MMV2 does not yet have phase-by-phase comparison helpers
- MMV2 does not yet have a dedicated proof runner that reports per-phase failures
- MMV2 does not yet emit disposable evaluation artifacts for corpus runs
- MMV2 reconciliation is not yet proven through seeded-neighbor corpus cases

## Sprint target

Build the first real MMV2 document-only corpus-evaluation lane that:

- calls `ingestDocumentV2Shadow(...)`
- evaluates every major phase explicitly
- exercises seeded-neighbor reconciliation
- writes disposable report artifacts under a bounded report path
- leaves the live v1 runtime and live DB write path untouched
