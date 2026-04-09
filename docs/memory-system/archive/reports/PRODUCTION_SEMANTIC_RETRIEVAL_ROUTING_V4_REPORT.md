# Production Semantic Retrieval Routing V4 Report

## Scope

This report covers the fourth live working-context semantic retrieval slice.

Chosen slice:

- approved API workaround guidance only

Bounded supported lesson keys:

- `openai_embeddings_api_key_required`
- `anthropic_context1m_eligible_credential_required`

Not included in this slice:

- semantic retrieval for `git_stash_unsafe`
- response-style semantic retrieval
- explicit project-fact semantic retrieval
- broader workflow-improvement semantic retrieval
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
- approved workflow-improvement tool-gotcha guidance remains the third live
  semantic fallback family
- approved API workaround guidance is now the fourth live semantic fallback
  family only when:
  - `scope = approved_only`
  - `kind = project`
  - hybrid does not already have a strong typed project match
- only approved supported API workaround lesson keys are eligible:
  - `openai_embeddings_api_key_required`
  - `anthropic_context1m_eligible_credential_required`
- exact API workaround asks still stay hybrid-first
- candidate rows remain excluded
- workflow guidance remains guidance-only

Implementation surfaces:

- `extensions/memory-middleware/src/tools/memory-object-search-hybrid.ts`
- `extensions/memory-middleware/src/semantic-retrieval-routing.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`
- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`

## Embedding posture

This slice introduced a fourth bounded family-owned embedding write path.

Current live embedding posture:

- validated recurring-procedure source memory objects can still receive
  semantic embeddings
- approved environment-constraint source memory objects can still receive
  semantic embeddings
- approved workflow-improvement tool-gotcha source memory objects can still
  receive semantic embeddings
- approved API workaround source memory objects can now also receive semantic
  embeddings for the supported lesson keys
- embeddings are still family-owned and bounded, not generic
  search-everything ingestion
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
- `projectId = c3d49413-d6a7-4ba3-b926-b931303e8787`
- approved API workaround memory object:
  - `2f926bbd-bf63-4739-bb8e-ded78126552d`
- lesson key:
  - `openai_embeddings_api_key_required`

Exact isolated proof queries and results:

1. `does semantic memory search need an openai api key with codex oauth`
   - routed top result:
     - `memoryObjectId = 2f926bbd-bf63-4739-bb8e-ded78126552d`
     - matched fields:
       - `auto_capture_lesson_match`
       - `trigram_similarity`
   - winning route: hybrid
2. `why is semantic memory search still failing after ChatGPT sign-in`
   - routed top result:
     - `memoryObjectId = 2f926bbd-bf63-4739-bb8e-ded78126552d`
     - matched fields:
       - `trigram_similarity`
       - `semantic_embedding`
       - `semantic_fallback`
   - winning route: semantic fallback

Isolated embedding row after bounded backfill:

- `memoryObjectId = 2f926bbd-bf63-4739-bb8e-ded78126552d`
- `embeddingModel = text-embedding-3-small`
- `embeddingVersion = c53a957db9784cf10e1b59c12d8766b670f2861e286ecb700894032b4b532e9d`
- metadata:
  - `source = semantic_retrieval_routing_v4`
  - `family = workflow_api_workaround`
  - `lessonKey = openai_embeddings_api_key_required`
  - `mode = approved_memory_backfill_embedding`
- `updatedAt = 2026-04-06 16:42:16.901+00`

Isolated proof conclusion:

- the conceptual API workaround ask materially improved
- the strong exact API workaround ask stayed hybrid-first
- semantic routing remained bounded to approved supported API workaround
  lesson keys only

## Production proof

Proof context:

- config:
  - `/root/.openclaw/openclaw.json`
- `projectId = a2b0e2f6-71fd-4bff-a153-522ff4d0d3a4`
- approved API workaround memory object:
  - `e4e1e2e1-cb77-4242-b53b-84ad18c8105b`
- lesson key:
  - `anthropic_context1m_eligible_credential_required`
- rollback tag:
  - `openclaw:pre-semantic-retrieval-routing-v4-20260406T170719Z`

Exact production proof queries and results:

1. `what should I do when Anthropic long context says extra usage required`
   - routed top result:
     - `memoryObjectId = e4e1e2e1-cb77-4242-b53b-84ad18c8105b`
     - matched fields:
       - `auto_capture_lesson_match`
       - `trigram_similarity`
   - winning route: hybrid
2. `why are big Anthropic prompts failing here`
   - routed top result:
     - `memoryObjectId = e4e1e2e1-cb77-4242-b53b-84ad18c8105b`
     - matched fields:
       - `semantic_embedding`
       - `semantic_fallback`
   - winning route: semantic fallback

Production embedding row after bounded backfill:

- `memoryObjectId = e4e1e2e1-cb77-4242-b53b-84ad18c8105b`
- `embeddingModel = text-embedding-3-small`
- `embeddingVersion = c53a957db9784cf10e1b59c12d8766b670f2861e286ecb700894032b4b532e9d`
- metadata:
  - `source = semantic_retrieval_routing_v4`
  - `family = workflow_api_workaround`
  - `lessonKey = anthropic_context1m_eligible_credential_required`
  - `mode = approved_memory_source_embedding`

Production observability evidence:

- strong typed API workaround matches stayed hybrid-first
- the conceptual production ask gained:
  - `semantic_embedding`
  - `semantic_fallback`
- candidate rows were not exposed
- workflow guidance remained guidance-only

## Auth wording clarification

This slice also tightened the user-facing wording for the OpenAI embeddings
workaround.

Current precise product statement:

- `openai-codex` OAuth profiles do not satisfy OpenClaw's embeddings auth path
  directly
- if a ChatGPT / Codex sign-in also yielded a usable OpenAI API key and that
  key is configured as `OPENAI_API_KEY` or `models.providers.openai.apiKey`,
  OpenAI embeddings can still work

## Health checks

Before and after the production proof:

- `http://127.0.0.1:28789/healthz` returned `{"ok":true,"status":"live"}`
- `http://127.0.0.1:37789/healthz` returned `{"ok":true,"status":"live"}`

## Validation and remaining limits

Validation for this slice also included targeted tests, `pnpm check`,
`pnpm build`, and `git diff --check`.

Remaining limits after this slice:

- `git_stash_unsafe` remains hybrid-only
- broader API workaround memory is not live yet
- broader workflow-improvement semantic retrieval is not live yet
- explicit project facts remain hybrid-first
- response-style remains hybrid-first
- candidate semantic retrieval remains disabled
- generic embedding-first retrieval remains out of scope
