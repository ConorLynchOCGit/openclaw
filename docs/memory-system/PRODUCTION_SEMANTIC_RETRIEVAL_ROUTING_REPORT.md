# Production Semantic Retrieval Routing Report

## Scope

This report covers the first live working-context semantic retrieval slice.

Chosen slice:

- nearby recurring-procedure asks only

Not included in this slice:

- response-style semantic retrieval
- explicit project-fact semantic retrieval
- workflow-improvement semantic retrieval
- environment-constraint semantic retrieval
- candidate semantic retrieval
- generic embedding-first retrieval

## Live boundary

The live routing posture after this slice is:

- `memory_object_search_hybrid` remains the default working-context retrieval
  tool
- clear recurring-procedure asks remain hybrid-first
- nearby recurring-procedure asks may use semantic fallback only when:
  - `scope = include_validated_procedures`
  - `kind = procedure`
  - hybrid does not already have a strong typed validated-procedure match
- only validated procedures are eligible for this semantic fallback
- candidate rows remain excluded
- semantic routing remains suggestion-first for nearby procedure asks

Implementation surfaces:

- `extensions/memory-middleware/src/tools/memory-object-search-hybrid.ts`
- `extensions/memory-middleware/src/semantic-retrieval-routing.ts`
- `extensions/memory-middleware/src/tools/procedure-validate.ts`
- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/db/queries.ts`
- `extensions/memory-core/src/memory/search-manager.ts`

## Embedding posture

This slice did introduce a bounded family-owned embedding write path.

Current live embedding posture:

- validated procedure source memory objects can receive semantic embeddings
- embeddings are generated only from validated recurring-procedure artifacts
- the live proof used:
  - `embeddingModel = text-embedding-3-small`
  - `embeddingVersion = c53a957db9784cf10e1b59c12d8766b670f2861e286ecb700894032b4b532e9d`
- the proof environment used the configured `memorySearch` remote seam via
  OpenRouter-backed OpenAI-compatible embeddings

This did not introduce:

- candidate embedding writes
- a generic search-everything embedding ingestion platform
- semantic retrieval as the default path for unrelated families

## Isolated proof

Proof context:

- `projectId = af076922-9862-47b4-8d3f-32ce1a9d527e`
- `agentId = 775d9727-30e1-48a9-b9ff-2408ea033beb`
- `sessionId = ef3cf7d9-b63e-4442-9068-d99abdc1d903`

Validated procedures reused:

- deploy procedure `6d163b62-2d14-46ef-b0c4-f86220f2cc8b`
- release procedure `b2c44a62-b554-4236-9af9-cf24f8c740c8`

Source memory objects:

- deploy source memory `1e280c9d-3844-46d1-8c67-c65667e70f7d`
- release source memory `060145cc-7f6e-464d-a198-3669d11a1723`

Embedding proof row:

- source memory object `1e280c9d-3844-46d1-8c67-c65667e70f7d`
- `embeddingModel = text-embedding-3-small`
- `embeddingVersion = c53a957db9784cf10e1b59c12d8766b670f2861e286ecb700894032b4b532e9d`

Exact proof queries and results:

1. `what should we double check before launch`
   - raw hybrid: `[]`
   - routed result: deploy procedure `6d163b62-2d14-46ef-b0c4-f86220f2cc8b`
   - matched fields: `semantic_embedding`, `semantic_fallback`
2. `what should I review before shipping this`
   - raw hybrid: `[]`
   - routed result: release procedure `b2c44a62-b554-4236-9af9-cf24f8c740c8`
   - matched fields: `semantic_embedding`, `semantic_fallback`
3. `how do we roll this out carefully`
   - raw hybrid: `[]`
   - routed result: deploy procedure `6d163b62-2d14-46ef-b0c4-f86220f2cc8b`
   - matched fields: `semantic_embedding`, `semantic_fallback`
4. `what do you recommend before release`
   - raw hybrid top result: release procedure `b2c44a62-b554-4236-9af9-cf24f8c740c8`
   - routed result unchanged
   - matched fields: `procedure_key_match`
5. `give me my deploy checklist`
   - raw hybrid top result: deploy procedure `6d163b62-2d14-46ef-b0c4-f86220f2cc8b`
   - routed result unchanged
   - matched fields: `procedure_key_match`, `trigram_similarity`
6. `give me my release checklist`
   - raw hybrid top result: release procedure `b2c44a62-b554-4236-9af9-cf24f8c740c8`
   - routed result unchanged
   - matched fields: `procedure_key_match`, `trigram_similarity`

Isolated proof conclusion:

- nearby conceptual procedure asks improved materially
- exact checklist asks still stayed hybrid-first
- semantic routing remained bounded to validated procedures only

## Production proof

Proof context:

- `projectId = c5120fe9-b48c-411e-9fe9-c10757a0ac9a`
- validated procedure `ed5dd44a-6ea9-4055-88d0-2e6d7bc05017`
- source memory object `80d1acb9-394d-4c8f-aab5-e4e29b06373b`
- rollback tag:
  - `openclaw:pre-semantic-retrieval-routing-20260406T022538Z`

Production embedding row after bounded upsert:

- `memoryObjectId = 80d1acb9-394d-4c8f-aab5-e4e29b06373b`
- `embeddingModel = text-embedding-3-small`
- `embeddingVersion = c53a957db9784cf10e1b59c12d8766b670f2861e286ecb700894032b4b532e9d`
- `updatedAt = 2026-04-06 02:40:16.901187+00`

Exact production proof queries and results:

1. `give me my release checklist`
   - raw hybrid top result:
     - `validatedProcedureId = ed5dd44a-6ea9-4055-88d0-2e6d7bc05017`
     - `readSurface = validated_procedure_read_model`
     - matched fields: `procedure_key_match`, `trigram_similarity`
   - routed result unchanged
   - winning route: hybrid
2. `what should I review before shipping this`
   - raw hybrid: `[]`
   - routed top result:
     - `validatedProcedureId = ed5dd44a-6ea9-4055-88d0-2e6d7bc05017`
     - `readSurface = validated_procedure_read_model`
     - matched fields: `semantic_embedding`, `semantic_fallback`
   - winning route: semantic fallback
3. `what should I review before shipping this` with
   `scope = approved_only`
   - raw hybrid: `[]`
   - routed result: `[]`
   - proof point:
     - validated procedures remained hidden when the scope did not explicitly
       allow them

Production observability evidence:

- semantic fallback only ran after hybrid returned no strong typed procedure hit
- exact release ask kept the typed result on top
- nearby release ask used `semantic_embedding` plus `semantic_fallback`
- no candidate rows were exposed

## Health checks

Before and after the production proof:

- `http://127.0.0.1:28789/healthz` returned `{"ok":true,"status":"live"}`
- `http://127.0.0.1:37789/healthz` returned `{"ok":true,"status":"live"}`

## Validation and remaining limits

Validation for this slice also included targeted tests, `pnpm check`,
`pnpm build`, and `git diff --check`.

Remaining limits after this slice:

- semantic routing is live only for nearby recurring-procedure asks
- environment constraints remain hybrid-only for now
- workflow-improvement tool-gotcha guidance remains hybrid-only for now
- exact project facts remain hybrid-only
- response-style remains hybrid-first
- candidate semantic retrieval remains disabled
- generic embedding-first retrieval remains out of scope
