---
summary: "MMV2 ingestion spec pack and current live/evaluation boundary."
title: "MMV2 Ingestion Specs"
---

# MMV2 Ingestion Specs

This subtree captures the MMV2 ingestion contract that started as a
document-ingestion-first design and is now the live direction for
`model-memory`.

The original GPT phase structure is preserved for design provenance, but MMV2
is no longer just a draft/shadow lane.

Status:

- MMV2-native SQL storage is live semantic truth
- document ingest is MMV2-native on the active path
- active write/read hot paths have crossed over to MMV2-native contracts
- legacy compatibility remains soak-window fallback only
- ordinary-turn MMV2 evaluation coverage still needs to catch up to the live
  path
- proof/file-pack/split artifacts remain evaluation-only and do not write to
  the live durable-memory DB

Implemented/live surfaces:

- MMV2-native durable tables:
  - `model_memory.ingest_sources`
  - `model_memory.ingest_segments`
  - `model_memory.durable_memories`
  - `model_memory.memory_events`
  - `model_memory.memory_edges`
- live MMV2 recording batches and native repository persistence
- first-class composite and conflict durability
- native runtime records derived from MMV2 durable truth
- file-pack and proof evaluation artifacts for document-ingest quality

Still-needed evaluation coverage:

- document-only MMV2 corpus contract:
  - `extensions/model-memory/src/mmv2/proof-corpus.ts`
- scripted document-only MMV2 proof runner:
  - `extensions/model-memory/src/mmv2/proof-runner.ts`
- real-model document-only MMV2 proof runner:
  - `extensions/model-memory/src/mmv2/proof-runner-real.ts`
- write-realism simulation:
  - `extensions/model-memory/src/mmv2/write-simulation.ts`
- failed-case adjudication surface:
  - `extensions/model-memory/src/mmv2/adjudication.ts`
- disposable report entrypoint:
  - `scripts/run-mmv2-document-corpus.mjs`
- current artifact output root:
  - `.artifacts/model-memory/mmv2/`
- current scoring split:
  - phase correctness
  - write-policy realism
- ordinary-turn MMV2 evaluation coverage remains a near-term roadmap item
- file-pack/provider variance stabilization remains a near-term roadmap item

Future extensions:

- primary capture seam expansion:
  - [Memory Capture Seams](/projects/model-memory/specs/memory-capture-seams)
- closed-loop operational instrumentation:
  - [Memory Ops Closed Loop](/projects/model-memory/specs/memory-ops-closed-loop)
- Phase 2 derived graph, capsule, hierarchical retrieval, planner, synthesis,
  and cache/projection features

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

## Working Rules For This Pack

- preserve the GPT phase ordering exactly
- preserve the GPT object shapes and prompt drafts as faithfully as possible
- mark all repo-side normalizations explicitly
- keep historical v1 contracts discoverable as history rather than current
  authority
- do not use evaluation artifacts as production writes
- do not weaken evidence grounding or conflict durability for compatibility
- do not add detector-era taxonomies as runtime truth
