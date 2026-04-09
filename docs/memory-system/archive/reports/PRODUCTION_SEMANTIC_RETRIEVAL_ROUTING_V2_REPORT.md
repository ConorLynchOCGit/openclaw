# Production Semantic Retrieval Routing V2 Report

## Scope

This report covers the second live working-context semantic retrieval slice.

Chosen slice:

- approved environment-constraint guidance only

Not included in this slice:

- workflow-improvement tool-gotcha semantic retrieval
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
- approved environment-constraint guidance is now the second live semantic
  fallback family only when:
  - `scope = approved_only`
  - `kind = project`
  - hybrid does not already have a strong typed environment-constraint match
- only approved supported environment-constraint lesson keys are eligible:
  - `python_command_unavailable`
  - `gateway_tools_invoke_forbidden`
- workflow-improvement tool gotchas remain hybrid-first
- candidate rows remain excluded
- workflow guidance remains guidance-only

Implementation surfaces:

- `extensions/memory-middleware/src/tools/memory-object-search-hybrid.ts`
- `extensions/memory-middleware/src/semantic-retrieval-routing.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`
- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/db/queries.ts`

## Embedding posture

This slice introduced a second bounded family-owned embedding write path.

Current live embedding posture:

- validated recurring-procedure source memory objects can still receive
  semantic embeddings
- approved environment-constraint source memory objects can now also receive
  semantic embeddings
- embeddings are still family-owned and bounded, not generic search-everything
  ingestion
- the live proof used:
  - `embeddingModel = text-embedding-3-small`
  - `embeddingVersion = c53a957db9784cf10e1b59c12d8766b670f2861e286ecb700894032b4b532e9d`

This did not introduce:

- candidate embedding writes
- semantic retrieval for workflow-improvement tool gotchas
- semantic retrieval as the default path for unrelated families

## Isolated proof

Proof context:

- `projectId = 26170b22-6af9-49f6-be26-09309157b2ff`
- approved environment-constraint memory object:
  - `6eab02be-eb38-47fd-b322-017293daca64`
- lesson key:
  - `python_command_unavailable`

Exact isolated proof queries and results:

1. `python command not available use node tsx here`
   - raw hybrid top result:
     - `memoryObjectId = 6eab02be-eb38-47fd-b322-017293daca64`
     - matched fields:
       - `auto_capture_lesson_match`
       - `fts_search_document`
       - `trigram_similarity`
   - routed result unchanged
   - winning route: hybrid
2. `what should I use for quick local scripting here`
   - raw hybrid: `[]`
   - routed top result:
     - `memoryObjectId = 6eab02be-eb38-47fd-b322-017293daca64`
     - matched fields:
       - `semantic_embedding`
       - `semantic_fallback`
   - winning route: semantic fallback

Isolated embedding row after bounded backfill:

- `memoryObjectId = 6eab02be-eb38-47fd-b322-017293daca64`
- `embeddingModel = text-embedding-3-small`
- `embeddingVersion = c53a957db9784cf10e1b59c12d8766b670f2861e286ecb700894032b4b532e9d`
- metadata:
  - `source = semantic_retrieval_routing_v2`
  - `family = workflow_environment_constraint`
  - `lessonKey = python_command_unavailable`
  - `mode = approved_memory_backfill_embedding`
- `updatedAt = 2026-04-06 03:42:25.798639+00`

Isolated proof conclusion:

- the conceptual environment-constraint ask materially improved
- the strong exact environment-constraint ask stayed hybrid-first
- semantic routing remained bounded to approved supported environment
  constraints only

## Production proof

Proof context:

- `projectId = fe109afb-fce1-44d6-b5df-78060f900968`
- approved environment-constraint memory object:
  - `040d161c-7cf9-4ec0-8138-574d9677e9ee`
- lesson key:
  - `gateway_tools_invoke_forbidden`
- rollback tag:
  - `openclaw:pre-semantic-retrieval-routing-v2-20260406T031528Z`

Exact production proof queries and results:

1. `gateway /tools/invoke forbidden use direct runtime invocation here`
   - raw hybrid top result:
     - `memoryObjectId = 040d161c-7cf9-4ec0-8138-574d9677e9ee`
     - matched fields:
       - `auto_capture_lesson_match`
       - `fts_search_document`
       - `trigram_similarity`
   - routed result unchanged
   - winning route: hybrid
2. `how should I reach tool calls from this gateway`
   - raw hybrid top result:
     - `memoryObjectId = 040d161c-7cf9-4ec0-8138-574d9677e9ee`
     - matched fields:
       - `trigram_similarity`
   - routed top result:
     - `memoryObjectId = 040d161c-7cf9-4ec0-8138-574d9677e9ee`
     - matched fields:
       - `trigram_similarity`
       - `semantic_embedding`
       - `semantic_fallback`
   - winning route: semantic fallback augmentation

Production embedding row after bounded backfill:

- `memoryObjectId = 040d161c-7cf9-4ec0-8138-574d9677e9ee`
- `embeddingModel = text-embedding-3-small`
- `embeddingVersion = c53a957db9784cf10e1b59c12d8766b670f2861e286ecb700894032b4b532e9d`
- metadata:
  - `source = semantic_retrieval_routing_v2`
  - `family = workflow_environment_constraint`
  - `lessonKey = gateway_tools_invoke_forbidden`
  - `mode = approved_memory_backfill_embedding`
- `updatedAt = 2026-04-06 03:43:15.629278+00`

Production observability evidence:

- strong typed environment-constraint matches stayed hybrid-first
- the conceptual production ask gained:
  - `semantic_embedding`
  - `semantic_fallback`
- candidate rows were not exposed
- workflow guidance remained guidance-only

## Health checks

Before and after the production proof:

- `http://127.0.0.1:28789/healthz` returned `{"ok":true,"status":"live"}`
- `http://127.0.0.1:37789/healthz` returned `{"ok":true,"status":"live"}`

## Validation and remaining limits

Validation for this slice also included targeted tests, `pnpm check`,
`pnpm build`, and `git diff --check`.

Remaining limits after this slice:

- workflow-improvement tool gotchas remain hybrid-only
- repeated API workaround memory is not live yet
- broader workflow-improvement semantic retrieval is not live yet
- explicit project facts remain hybrid-first
- response-style remains hybrid-first
- candidate semantic retrieval remains disabled
- generic embedding-first retrieval remains out of scope
