# Runtime Target Consolidation And Final Flattening Batch V1

This local-only tranche continued from the current dirty retirement tree and
finished the next practical cleanup passes across the touched runtime/docs
area.

It landed:

1. retirement of the persistent local rollout Postgres target from normal
   operational posture in the active memory-system docs
2. explicit standardization on one real runtime database target:
   shared Supabase-backed Postgres, schema `memory_middleware`
3. retention of local `pgvector/pgvector:pg16` only as disposable test or
   bounded-rehearsal infrastructure
4. a fuller shared semantic-detector registry helper in
   `memory-ingestion-resolver.ts` used by project-fact, recurring-procedure,
   and workflow ingestion paths
5. further demotion of the middleware family-policy bridge so runtime policy
   views and several type/proof consumers now read the public plugin-SDK
   surface directly
6. an explicit canonical write-plan executor in `write-action-stages.ts`
   instead of centering the substrate on one direct submit call
7. retirement of more mixed-era read-family inference by removing
   `factFamily` / `fieldKey` family deduction from the active hybrid read
   scaffold and query-side project-family classification

What this changed:

- the repo no longer presents a second persistent runtime database lane as a
  co-equal operating model
- the touched resolver paths now share one registry-style semantic detector
  helper instead of repeating per-family detector loops
- the middleware runtime leans less on the broad family-registry bridge and
  more on direct narrow plugin-SDK policy views
- the write substrate now has an explicit plan/execution seam, which is a
  more honest base for future multi-candidate writes
- hybrid read classification now prefers canonical compatibility, then explicit
  legacy family ids, and only then a narrow capture-class compatibility
  fallback

What still remains after this batch:

- some correction/supersession wrappers still remain in
  `extensions/memory-middleware/src/tools/candidate-submit.ts`
- response-style still keeps a separate semantic branch because it owns
  deterministic phrase matching plus `forget` handling
- `src/plugin-sdk/memory-family-policy.ts` still exports broad family
  definitions as the public compatibility bridge
- `extensions/memory-middleware/src/write-action-stages.ts` now plans writes,
  but the live plan still emits one primary operation
- four explicit workflow compatibility entries still remain in
  `extensions/memory-middleware/src/workflow-improvement-compat-catalog.ts`
