---
summary: "Draft MMV2 ingestion spec pack captured from the GPT document-ingest redesign conversation."
title: "MMV2 Ingestion Draft Specs"
---

# MMV2 Ingestion Draft Specs

This subtree captures the proposed document-ingestion-first `model-memory`
ingestion v2 contract from the GPT design conversation supplied by the user.

It is intentionally separate from the live v1 spec pack.

Status:

- draft proposal only
- not the live runtime contract
- partially implemented in a document-only shadow lane
- intended to preserve the GPT phase structure before any code changes begin

Current evaluation lane:

- document-only MMV2 corpus contract:
  - `extensions/model-memory/src/mmv2/proof-corpus.ts`
- document-only MMV2 proof runner:
  - `extensions/model-memory/src/mmv2/proof-runner.ts`
- disposable report entrypoint:
  - `scripts/run-mmv2-document-corpus.mjs`
- current artifact output root:
  - `.artifacts/model-memory/mmv2/`
- still out of scope:
  - ordinary-turn MMV2 evaluation
  - live DB writes
  - v1 cutover

## Pack contents

1. [Overview And Design Principles](/projects/model-memory/specs/mmv2/overview-and-design-principles)
2. [Phase 0 Raw Ingest Envelope](/projects/model-memory/specs/mmv2/phase-0-raw-ingest-envelope)
3. [Phase 1 Preprocessing And Segmentation](/projects/model-memory/specs/mmv2/phase-1-preprocessing-and-segmentation)
4. [Phase 2 Capture Routing](/projects/model-memory/specs/mmv2/phase-2-capture-routing)
5. [Phase 3A Atomic Extraction](/projects/model-memory/specs/mmv2/phase-3a-atomic-extraction)
6. [Phase 3B Composite Extraction](/projects/model-memory/specs/mmv2/phase-3b-composite-extraction)
7. [Phase 4 Canonicalization](/projects/model-memory/specs/mmv2/phase-4-canonicalization)
8. [Phase 5 Admission](/projects/model-memory/specs/mmv2/phase-5-admission)
9. [Phase 6 Reconciliation](/projects/model-memory/specs/mmv2/phase-6-reconciliation)
10. [Phase 7 Recording](/projects/model-memory/specs/mmv2/phase-7-recording)
11. [Phase 8 Post-Write Audit](/projects/model-memory/specs/mmv2/phase-8-post-write-audit)
12. [Prompt Pack](/projects/model-memory/specs/mmv2/prompt-pack)
13. [Classifier Instructions Baseline](/projects/model-memory/specs/mmv2/classifier-instructions-baseline)
14. [Reference JSON Examples](/projects/model-memory/specs/mmv2/reference-json-examples)
15. [Slippage And Repair Policy](/projects/model-memory/specs/mmv2/slippage-and-repair-policy)
16. [Schema Delta V1 To V2](/projects/model-memory/specs/mmv2/schema-delta-v1-to-v2)
17. [Document-Ingest-First Adoption Plan](/projects/model-memory/specs/mmv2/document-ingest-first-adoption-plan)
18. [GPT Source Alignment Review](/projects/model-memory/specs/mmv2/gpt-source-alignment-review)
19. [MMV2 First Execution Sprint Checklist](/projects/model-memory/mmv2-first-execution-sprint-checklist)

## Working rules for this pack

- preserve the GPT phase ordering exactly
- preserve the GPT object shapes and prompt drafts as faithfully as possible
- mark all repo-side normalizations explicitly
- keep the live v1 contract discoverable rather than overwritten
- do not treat this pack as implementation approval by itself
