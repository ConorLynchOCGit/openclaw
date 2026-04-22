---
summary: "Baseline record for the MMV2 real-model document evaluation expansion."
title: "MMV2 Real Model Eval Baseline 2026-04"
---

# MMV2 Real Model Eval Baseline 2026-04

## Live baseline

- git root confirmed as `/root/services/openclaw-roles/live`
- current branch head at baseline review:
  - `0024edfebbcdab12041741e9c20841a2b82172a7`
- ahead / behind versus `origin/main` at baseline review:
  - ahead `0`
  - behind `0`
- current MMV2 evaluation files already exist:
  - `extensions/model-memory/src/mmv2/proof-corpus.ts`
  - `extensions/model-memory/src/mmv2/proof-runner.ts`
  - `scripts/run-mmv2-document-corpus.mjs`

## Current scripted proof before this sprint

- the MMV2 document-only shadow lane already runs end to end through:
  - raw ingest
  - segmentation
  - routing
  - atomic extraction
  - composite extraction
  - suppression
  - canonicalization
  - admission
  - seeded-neighbor reconciliation
  - shadow recording
  - post-write audit
- the scripted proof runner already evaluates those phases explicitly
- scripted corpus artifacts already write to:
  - `.artifacts/model-memory/mmv2/`
- live v1 seams remain separate and authoritative:
  - `ingestDocument(...)`
  - `captureOrdinaryTurn(...)`

## Exact limit before this sprint

- scripted phase packets prove the shadow funnel contract
- scripted phase packets do not prove actual model behavior
- the current shadow recorder can overstate realistic final writes because it
  still materializes shadow durable objects for outcomes that should be:
  - merge without a new durable object
  - no-op keep-existing
  - conflict hold
- there is no distinct score separating:
  - phase correctness
  - realistic final write behavior
- failed cases do not yet have a dedicated adjudication surface

## Sprint target

Extend MMV2 document evaluation so the same corpus can run in both scripted and
real-model modes, while preserving phase-aware reporting and adding a separate
post-reconciliation write simulation that shows what would actually be written
under realistic final semantics.
