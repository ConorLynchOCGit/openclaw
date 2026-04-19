---
summary: "Execution boundary for adopting the MMV2 ingestion draft through document ingestion before ordinary-turn unification."
title: "MMV2 Document-Ingest-First Adoption Plan"
---

# MMV2 Document-Ingest-First Adoption Plan

## Immediate boundary

This draft should not be implemented everywhere at once.

Recommended first proving lane:

- document ingestion only
- replayable document corpus first
- side-by-side comparison against the current live ingest results

## Why document-first

- documents provide stable replay inputs
- span fidelity and segmentation behavior are easier to audit
- composite artifacts such as procedures and checklists are common in document
  sources
- it reduces ambiguity before ordinary-turn capture is rewritten

## What should stay out of the first implementation slice

- ordinary-turn runtime replacement
- live write-path cutover
- database migration without a shadow lane
- prompt replacement in production capture
- projection or retrieval changes that assume MMV2 output already exists

## Suggested proving sequence

1. preserve the GPT contract in docs
2. build a shadow document-ingest runner for MMV2
3. run a representative document corpus through v1 and MMV2
4. compare atomic precision, composite capture rate, leakage, and write safety
5. only then decide whether to extend MMV2 to ordinary turns

## Proof focus areas

- preference versus directive separation
- procedure capture rate
- procedure child leakage suppression
- source span exactness
- admission conservatism
- reconciliation correctness under changed preferences and scoped rules
