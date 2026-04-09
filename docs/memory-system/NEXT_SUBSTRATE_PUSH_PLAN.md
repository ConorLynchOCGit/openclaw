# Next Substrate Push Plan

## Purpose

This doc records the honest next substrate move after:

- the bounded self-improving and inline advisory batches landed
- the Main routing / learned-guidance / retrieval proof work landed
- multi-memory per-turn capture landed on the current substrate
- the repo finished the current-functionality proof loop strongly enough to
  stop pretending the current rigid family-heavy shape is the long-term model

## What is already landed

The following are already landed:

- flattening batches v1-v6
- pre-capture hardening batch v1
- reduced-profile self-improving and advisory batch v1

Most importantly, the repo now has live landings for:

- shared ingestion / review / proof substrate
- shared family-policy contract ownership
- request-path hardening
- prompt/token-efficiency hardening
- write-path action-stage hardening
- reduced-profile self-improving capture on the shared candidate substrate
- inline learned-guidance advisory planning on approved-preferred retrieval
- conversational candidate review preparation for pending candidate-state
  memory objects
- proactive execution that can turn candidate-review follow-up into those
  conversational prompts
- mode-aligned advanced-tool registration so disabled promotion/governance
  scaffolding does not stay visible as fake live capability

## Current bounded live posture

The newly landed functional seams remain intentionally bounded:

- `selfImprovingCapture.mode = candidate-only`
- `learnedGuidanceAdvisoryPlanning.mode = inline-only`

Current tranche boundaries:

- self-improving capture is workflow-guidance-only
- self-improving capture is candidate-only
- self-improving capture now has an explicit generalized workflow-guidance
  rollout scope
- self-improving capture now also requires an explicit `off-production` or
  `production-canary` rollout target before activation
- learned-guidance planning is approved-preferred and may surface candidate
  guidance as provisional inline advice
- learned-guidance planning is inline-only
- learned-guidance planning is advisory-only
- learned-guidance planning now has an explicit generalized workflow-guidance
  scope and a bounded default suggestion budget
- learned-guidance planning now also requires an explicit `off-production` or
  `production-canary` rollout target before activation
- candidate follow-up now has a conversational review path in chat instead of
  assuming hidden operator review
- proactive candidate-review follow-up now returns those chat review prompts
  directly instead of a blocked execution result
- proactive procedure-validation and skill-governance follow-up now return
  bounded conversational prompts instead of operator-only follow-up labels

Current reevaluation judgment:

- self-improving capture should stay narrow
- learned-guidance planning should stay narrow
- neither seam should widen before automated eval plus rollbackable canary
  evidence exists
- explicit docs-localization and file-reference packet shapes are now
  promotion-eligible under bounded follow-through
- vague shorthand packet shapes should stay narrow and candidate-heavy
- production/default posture still remains off for the narrow self-improving
  and learned-guidance seams

## Remaining recommended sequence

### Next major phase

1. replace rigid family-owned memory surfaces with generic adaptable seams
2. migrate toward 4 canonical durable memory kinds:
   - `User`
   - `Feedback`
   - `Project`
   - `Reference`
3. preserve the current family-specific semantics as metadata, derived views,
   and compatibility adapters during migration
4. only after that canonicalization work is real should the repo resume any
   broader family or domain expansion

### Later bounded cleanup only if justified

- artifact / read-model convergence if later rollout or new-family pressure
  shows the procedure-versus-memory-object split is still too awkward
- narrower retrieval cleanup only if later work exposes honest remaining
  duplication

## What should land next

The first retirement tranche is now landed:

- write-stage routing is canonical-family aware in the tool-submit path
- workflow and response-style phrase induction now share one reviewed adapter
  seam
- one frozen response-style paraphrase fast lane was removed
- project-fact and workflow-ingestion resolution is flatter
- project-workflow semantic-embedding promotion now uses one profile-driven
  helper
- canonical compatibility records no longer inherit obsolete `typedFastPaths`

The next implementation slices should now be:

- collapse the remaining family-specific correction/promotion helpers inside
  `extensions/memory-middleware/src/tools/candidate-submit.ts` behind one
  canonical promotion engine
- continue internal detector-profile cleanup inside
  `extensions/memory-middleware/src/memory-ingestion-resolver.ts`
- push `extensions/memory-middleware/src/write-action-stages.ts` from
  canonical-family-aware routing to a fuller canonical multi-candidate write
  pipeline with less compatibility inference

The canonical-core tranche is now already landed:

- canonical record/envelope contract
- facet/metadata model
- family-policy compatibility builders
- canonical ingestion candidate contract
- canonical retrieval/ranking contract

The next follow-through tranche is now landed:

- hybrid retrieval control decisions derive operative hints/fallbacks from
  canonical retrieval plans first
- learned-guidance planning prefers canonical workflow-guidance records and
  canonical retrieval plans first
- critical tool-submission and self-improving capture seams now submit
  canonical ingestion candidates first
- hybrid retrieval execution now reads canonical metadata first under the
  canonical control surface
- retrieval control and candidate submission now share one canonical-first
  metadata reader
- Main routing now uses a dedicated canonical-memory planner surface instead
  of a bounded OpenAI-wrapper classifier

Why:

- current user-visible behavior is now proven well enough that the main risk is
  architectural rigidity
- the current six-family substrate still duplicates policy, routing, and
  metadata meaning in too many places
- multi-memory capture removed one practical limitation, but it did not remove
  the deeper family-heavy structure that makes the system expensive to scale
- future work should not add more family-specific seams on top of that

## What should not be parallelized prematurely

- broader self-improving family expansion
- learned-guidance background scheduling or proactive execution
- new family implementation before canonicalization
- broad artifact/read-model redesign before rollout pressure says it is needed
- autonomous skill procurement / vetting / install without a separate
  governance decision

## Exit criteria before moving on

Before new families:

- canonical kinds exist as the durable storage model
- family-specific behavior is mostly adapters or derived views rather than the
  primary substrate
- ingestion, retrieval, and application no longer re-derive most policy from
  family-specific string switches
- provenance and audit stay explicit during migration
- the compatibility layer is strong enough to preserve current live behavior

## Next implementation slice

The last shared workflow-guidance mixed-era bridge is now retired from the
hot retrieval/planning path, workflow auto-review supersession now uses the
shared correction engine, and three previously named workflow lessons now
flow through generalized workflow semantics instead of the compat catalog.

The next slice should now:

- extract the remaining family-specific correction/supersession wrappers in
  `extensions/memory-middleware/src/tools/candidate-submit.ts` onto one
  narrower canonical helper layer
- move the remaining workflow detector entrypoints in
  `extensions/memory-middleware/src/memory-ingestion-resolver.ts` onto one
  fuller profile-registered registry
- continue demoting `src/plugin-sdk/memory-family-policy.ts` so only
  compatibility/derived-view helpers need the broad family definitions
- finish the canonical multi-candidate write substrate in
  `extensions/memory-middleware/src/write-action-stages.ts`
- retire more mixed-era read scaffolding from
  `extensions/memory-middleware/src/db/hybrid-memory-surface-scaffolding.ts`
  once the remaining read paths are capture-class-first
- decide lesson by lesson whether the remaining bounded explicit
  environment/provider detectors in
  `extensions/memory-middleware/src/workflow-improvement-semantic.ts`
  should be generalized further or kept as compatibility-only logic

That follow-through slice is now also landed locally:

- `candidate-submit.ts` now uses a narrower shared approved-memory correction
  helper for more of its correction/supersession flow
- project-fact semantic detection now runs through a profile-registered
  detector registry
- middleware runtime seams now consume internal runtime-policy views instead
  of live `memory-family-policy.ts` reads
- write-stage routing now matches canonical write lanes instead of repeating
  mixed family/category conditions
- the last hybrid read `lessonFamily` fallback is gone from the active
  project-family read scaffolding
- workflow auto-review policy now resolves from canonical capture metadata
  instead of importing the family-policy compatibility seam
- three repo/process workflow lessons now flow through generalized workflow
  guidance instead of staying named compat entries

The next slice should now:

- extract the remaining family-specific correction/supersession wrappers in
  `extensions/memory-middleware/src/tools/candidate-submit.ts`
- finish the remaining detector-registry cleanup in
  `extensions/memory-middleware/src/memory-ingestion-resolver.ts`
- keep shrinking `src/plugin-sdk/memory-family-policy.ts` until broad family
  definitions are only a compatibility bridge
- keep pushing `extensions/memory-middleware/src/write-action-stages.ts`
  toward a full canonical multi-candidate write substrate
- decide whether the four remaining explicit compat-catalog entries are truly
  permanent compatibility data or can be generalized/deleted later:
  - `python_command_unavailable`
  - `gateway_tools_invoke_forbidden`
  - `openai_embeddings_api_key_required`
  - `anthropic_context1m_eligible_credential_required`

That runtime-target consolidation slice is now also landed locally:

- the normal runtime database posture is now documented as one shared
  Supabase-backed Postgres target using schema `memory_middleware`
- the earlier persistent local rollout container
  `memory-middleware-readonly-rollout-pg` is now retired from normal
  operational posture
- disposable `pgvector/pgvector:pg16` containers remain only as
  integration-test or bounded-rehearsal infrastructure

The next slice should now:

- finish the remaining detector-registry unification in
  `extensions/memory-middleware/src/memory-ingestion-resolver.ts`
- keep shrinking `src/plugin-sdk/memory-family-policy.ts` until broad family
  definitions are a pure compatibility bridge
- remove the remaining mixed-era compatibility-family inference from
  `extensions/memory-middleware/src/db/hybrid-memory-surface-scaffolding.ts`
  and adjacent query seams

That cleanup slice is now also landed locally:

- the persistent local rollout Postgres target is retired from normal
  operational posture in the active docs
- the intended runtime posture is now one shared Supabase-backed Postgres
  target plus disposable local test DBs only
- project-fact, recurring-procedure, and workflow ingestion now share one
  detector-registry helper
- middleware policy-view and proof/type consumers now lean further toward the
  public plugin-SDK surface instead of the middleware registry bridge
- the fake multi-operation candidate write plan is gone; the write substrate
  now executes one explicit canonical write operation directly
- hybrid read family classification no longer infers project-family identity
  from `factFamily` or `fieldKey`

The next slice should now:

- finish extracting the remaining correction/supersession wrappers in
  `extensions/memory-middleware/src/tools/candidate-submit.ts`
- decide whether response-style should keep its current special semantic path
  or move onto a shared `forget`-capable registry seam
- decide entry by entry whether the four remaining bounded explicit
  environment/provider workflow detectors in
  `extensions/memory-middleware/src/workflow-improvement-semantic.ts`
  are still justified
