# Production Semantic Retrieval Routing V3 Report

## Scope

This report covers the third live working-context semantic retrieval slice.

Chosen slice:

- approved workflow-improvement tool-gotcha guidance only

Bounded supported lesson keys:

- `vitest_wrapper_required`
- `scripts_committer_required`

Not included in this slice:

- semantic retrieval for `git_stash_unsafe`
- response-style semantic retrieval
- explicit project-fact semantic retrieval
- broader workflow-improvement semantic retrieval
- API workaround semantic retrieval
- candidate semantic retrieval
- generic embedding-first retrieval

## Live boundary

The live routing posture after this slice is:

- `memory_object_search_hybrid` remains the default working-context retrieval
  tool
- nearby recurring-procedure asks remain the first live semantic fallback
  family
- approved environment-constraint guidance remains the second live semantic
  fallback family
- approved workflow-improvement tool-gotcha guidance is now the third live
  semantic fallback family only when:
  - `scope = approved_only`
  - `kind = project`
  - hybrid does not already have a strong typed project match
- only approved supported tool-gotcha lesson keys are eligible:
  - `vitest_wrapper_required`
  - `scripts_committer_required`
- exact tool-gotcha asks still stay hybrid-first
- `git_stash_unsafe` remains hybrid-only
- candidate rows remain excluded
- workflow guidance remains guidance-only

Implementation surfaces:

- `extensions/memory-middleware/src/tools/memory-object-search-hybrid.ts`
- `extensions/memory-middleware/src/semantic-retrieval-routing.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`
- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`

## Embedding posture

This slice introduced a third bounded family-owned embedding write path.

Current live embedding posture:

- validated recurring-procedure source memory objects can still receive
  semantic embeddings
- approved environment-constraint source memory objects can still receive
  semantic embeddings
- approved workflow-improvement tool-gotcha source memory objects can now
  also receive semantic embeddings for the supported lesson keys
- embeddings are still family-owned and bounded, not generic search-everything
  ingestion
- the live proof used:
  - `embeddingModel = text-embedding-3-small`
  - `embeddingVersion = c53a957db9784cf10e1b59c12d8766b670f2861e286ecb700894032b4b532e9d`

This did not introduce:

- candidate embedding writes
- semantic retrieval for `git_stash_unsafe`
- semantic retrieval as the default path for unrelated families

## Isolated proof

Proof context:

- config:
  - `/root/.openclaw-slice7-proof/openclaw.json`
- `projectId = 9438ec9a-cae0-4c6f-9f65-88f897565c0c`
- approved workflow-improvement memory object:
  - `dc43fc85-a1ae-448e-8413-4e7ec3dd3152`
- lesson key:
  - `vitest_wrapper_required`

Exact isolated proof queries and results:

1. `how should I run this vitest file safely in this repo`
   - raw hybrid top result:
     - `memoryObjectId = dc43fc85-a1ae-448e-8413-4e7ec3dd3152`
     - matched fields:
       - `auto_capture_lesson_match`
       - `trigram_similarity`
   - routed result unchanged
   - winning route: hybrid
2. `what is the safe way to run one test file here`
   - raw hybrid: `[]`
   - routed top result:
     - `memoryObjectId = dc43fc85-a1ae-448e-8413-4e7ec3dd3152`
     - matched fields:
       - `semantic_embedding`
       - `semantic_fallback`
   - winning route: semantic fallback

Isolated embedding row after bounded backfill:

- `memoryObjectId = dc43fc85-a1ae-448e-8413-4e7ec3dd3152`
- `embeddingModel = text-embedding-3-small`
- `embeddingVersion = c53a957db9784cf10e1b59c12d8766b670f2861e286ecb700894032b4b532e9d`
- metadata:
  - `source = semantic_retrieval_routing_v3`
  - `family = workflow_tool_gotcha`
  - `lessonKey = vitest_wrapper_required`
  - `mode = approved_memory_backfill_embedding`
- `updatedAt = 2026-04-06 04:09:28.331366+00`

Isolated proof conclusion:

- the conceptual tool-gotcha ask materially improved
- the strong exact tool-gotcha ask stayed hybrid-first
- semantic routing remained bounded to approved supported tool-gotcha lesson
  keys only

## Production proof

Proof context:

- config:
  - `/root/.openclaw/openclaw.json`
- `projectId = db5fdd6d-927e-4a1d-a3a8-edd0d4690c25`
- approved workflow-improvement memory object:
  - `50ef7dea-9216-4bfc-9ad4-745b6d52436d`
- lesson key:
  - `scripts_committer_required`

Exact production proof queries and results:

1. `how should I make a scoped commit here`
   - raw hybrid top result:
     - `memoryObjectId = 50ef7dea-9216-4bfc-9ad4-745b6d52436d`
     - matched fields:
       - `auto_capture_lesson_match`
       - `trigram_similarity`
   - routed result unchanged
   - winning route: hybrid
2. `how do I keep staging narrow in this repo`
   - raw hybrid: `[]`
   - routed top result:
     - `memoryObjectId = 50ef7dea-9216-4bfc-9ad4-745b6d52436d`
     - matched fields:
       - `semantic_embedding`
       - `semantic_fallback`
   - winning route: semantic fallback

Production embedding row after bounded backfill:

- `memoryObjectId = 50ef7dea-9216-4bfc-9ad4-745b6d52436d`
- `embeddingModel = text-embedding-3-small`
- `embeddingVersion = c53a957db9784cf10e1b59c12d8766b670f2861e286ecb700894032b4b532e9d`
- metadata:
  - `source = semantic_retrieval_routing_v3`
  - `family = workflow_tool_gotcha`
  - `lessonKey = scripts_committer_required`
  - `mode = approved_memory_backfill_embedding`
- `updatedAt = 2026-04-06 04:10:25.789589+00`

Production observability evidence:

- strong typed tool-gotcha matches stayed hybrid-first
- the conceptual production ask gained:
  - `semantic_embedding`
  - `semantic_fallback`
- candidate rows were not exposed
- workflow guidance remained guidance-only
- `git_stash_unsafe` remained outside this live semantic slice

## Health checks

Before and after the production proof:

- `http://127.0.0.1:28789/healthz` returned `{"ok":true,"status":"live"}`
- `http://127.0.0.1:37789/healthz` returned `{"ok":true,"status":"live"}`

## Validation and remaining limits

Validation for this slice also included targeted tests, `pnpm check`,
`pnpm build`, and `git diff --check`.

Remaining limits after this slice:

- `git_stash_unsafe` remains hybrid-only
- repeated API workaround memory is not live yet
- broader workflow-improvement semantic retrieval is not live yet
- explicit project facts remain hybrid-first
- response-style remains hybrid-first
- candidate semantic retrieval remains disabled
- generic embedding-first retrieval remains out of scope
