# Canonical Local Retirement Deep Review Batch V1

## Summary

This local-only batch continued the canonical retirement program without
deploying, committing, or pushing.

It focused on four active retirement seams:

1. `extensions/memory-middleware/src/tools/candidate-submit.ts`
2. `extensions/memory-middleware/src/memory-ingestion-resolver.ts`
3. `src/plugin-sdk/memory-family-policy.ts`
4. `extensions/memory-middleware/src/write-action-stages.ts`

It also included a hyper-critical review of the wider memory runtime and docs
to find keyword-specific, lesson-key-specific, provider-specific, and
nostalgia-kept logic that was still acting like architecture.

## What the review found

The biggest remaining hidden rigidity was no longer just family-policy
switching. The repo still had a second layer of keyword-bound runtime behavior
in the workflow-improvement retrieval path:

- `extensions/memory-middleware/src/retrieval-intent.ts` still inferred
  workflow fallback behavior from provider- and incident-specific phrases.
- `extensions/memory-middleware/src/retrieval-control-plane.ts` had already
  been shifted to capture classes, but SQL scoring still compared against
  `lessonKey`.
- `extensions/memory-middleware/src/db/queries.ts` and
  `extensions/memory-middleware/src/db/hybrid-memory-surface-scaffolding.ts`
  still treated lesson-key matching as the ranking fast lane even after the
  retrieval hint was made capture-class-driven.
- `extensions/memory-middleware/src/write-action-stages.ts` still lacked an
  honest way to express multi-lane stage matching, which left one
  duplicate-protection stage effectively dead.

The review also confirmed that the provider-specific OpenAI/Anthropic workflow
lessons are now primarily a semantic catalog problem, not a routing/control
plane problem. That is still transitional, but it is materially narrower than
before this batch.

## What changed

### 1. Retrieval and ranking stopped depending on workflow lesson keys

- retrieval intent now emits generic workflow capture-class hints instead of
  lesson-key hints
- hybrid SQL scaffolding now exposes a canonical-first
  `autoCaptureCaptureClassExpression`
- hybrid ranking now scores on capture class where the retrieval decision is
  capture-class-driven

This removed the runtime mismatch where canonical planning spoke in capture
classes while SQL ranking still spoke in lesson keys.

### 2. `candidate-submit.ts` moved further behind the correction engine

- workflow clustered auto-review supersession now uses a smaller shared helper
  that delegates to `executeMemoryObjectCorrectionPlan(...)`
- project-fact correction auto-promotion now uses the same shared helper
- response-style, project-fact, and recurring-procedure auto-promotion reads
  were moved further onto canonical-first metadata readers instead of raw
  `autoCapture` traversal

This did not finish the full canonical correction/supersession engine, but it
removed another layer of family-owned promotion choreography from
`candidate-submit.ts`.

### 3. `memory-ingestion-resolver.ts` got flatter again

- workflow review-mode selection no longer depends on which detector family
  fired
- detector results now flow through capture-class-driven review-mode resolution
- workflow family resolution now depends on capture metadata instead of
  lesson-family-specific routing

There are still multiple semantic detectors, but more of the decision-making is
now generic capture metadata rather than detector identity.

### 4. `memory-family-policy.ts` shrank further

- canonical compatibility records no longer expose `workflowLessonFamilies`
- the obsolete `typedFastPaths` public compatibility field was removed from
  `src/plugin-sdk/memory-canonical-core.ts`
- workflow-lesson-family capture metadata lookup now uses a narrow precomputed
  compatibility map instead of reading back through the full family definition

This keeps the family-policy seam closer to compatibility and derived-view
ownership instead of letting it remain a shadow runtime authority.

### 5. `write-action-stages.ts` got a real multi-lane match shape

- candidate stage matching now supports `anyOf`
- the tool-submit duplicate guard now honestly matches either:
  - response-style family
  - or project/workflow capture categories

This fixed a real architectural bug: one duplicate-protection stage was trying
to express OR semantics through a purely conjunctive matcher and was therefore
dead.

### 6. Provider-specific query hinting was generalized

`extensions/memory-middleware/src/retrieval-intent.ts` no longer treats
provider names as the main workflow API-workaround retrieval trigger.

It now prefers generic auth/profile/credential and long-context-workaround
signals. This keeps provider-specific workflow memories from acting like a
hard-coded routing substrate.

## Keyword-specific and provider-specific logic status

### Removed or demoted from architecture in this batch

- workflow retrieval hinting no longer routes on specific provider names
- workflow hybrid ranking no longer depends on lesson-key matching for the new
  capture-class hint path
- write-stage duplicate protection no longer relies on an impossible
  family-plus-category conjunction
- canonical compatibility no longer carries dead `typedFastPaths` or
  `workflowLessonFamilies`

### Still remaining, but now clearly bounded

- `extensions/memory-middleware/src/workflow-improvement-semantic.ts` still
  contains a hard-coded supported-lesson catalog, including provider-specific
  lessons such as:
  - `openai_embeddings_api_key_required`
  - `anthropic_context1m_eligible_credential_required`
- those lesson keys still exist as capture semantics and compatibility/data
  identifiers
- they no longer need to drive retrieval planning or fallback ranking

## Remaining honest gaps

1. `candidate-submit.ts` still contains family-shaped correction and
   supersession wrappers, even though more of the real work is now routed
   through the correction engine.
2. `memory-ingestion-resolver.ts` still contains multiple semantic detector
   families instead of a purely profile-registered detector substrate.
3. `memory-family-policy.ts` is smaller, but still remains a compatibility seam
   with more historical surface than the long-term substrate should keep.
4. `workflow-improvement-semantic.ts` is still a hard-coded lesson catalog.
   The architecture now depends on it less, but the catalog itself still needs
   a later genericization or explicit compatibility containment pass.

## Recommended next slice

1. extract the remaining family-specific correction and supersession wrappers in
   `extensions/memory-middleware/src/tools/candidate-submit.ts` behind one
   narrower canonical helper layer
2. keep collapsing workflow semantic detectors toward a profile-registered
   substrate in `extensions/memory-middleware/src/memory-ingestion-resolver.ts`
3. decide whether the supported workflow lesson catalog in
   `extensions/memory-middleware/src/workflow-improvement-semantic.ts` should:
   - remain as explicit compatibility data only
   - or be generalized into a less provider/incident-specific semantic rule
     substrate
