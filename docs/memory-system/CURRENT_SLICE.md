# Current Slice

## Active slice

Flattening batch v4

## Objective

Land the next three main control-plane flattening slices after substrate support
batch v1:

- full ingestion control-plane flattening
- application-selection / behavior-planning layer
- retrieval + semantic-routing control-plane flattening

## What just landed in flattening batch v4

### Slice 10 — full ingestion control-plane flattening

- all six landed families now resolve through the shared ingestion substrate
- transcript-side auto-capture and tool-side candidate submission now reuse the
  same family resolution flow for response style, project facts, recurring
  procedures, and the workflow-family cluster
- shared canonical match conversion now sits in one ingestion seam instead of
  being duplicated across transcript and tool callers

### Slice 11 — application-selection / behavior-planning layer

- durable-memory application selection is now a structured runtime artifact for
  the current prompt-facing boundary
- prompt rendering now consumes:
  - query intent
  - selected items
  - suppressed items
  - rendering hints
- prompt rendering is no longer the practical source of family application
  posture for durable-memory guidance
- this landing is still prompt-surface scoped rather than the final
  retrieval-fed per-memory-item selection substrate

### Slice 12 — retrieval + semantic-routing control-plane flattening

- hybrid retrieval now uses one shared control decision for:
  - normalized query hints
  - project-family shaping
  - semantic fallback family selection
- the hybrid tool no longer sprays every semantic fallback family for clearly
  scoped asks
- `db/queries.ts` now reads shared retrieval-control decisions instead of
  re-deriving query hints and project-intent reshaping locally

## What batch v4 actually removed or reduced

- the remaining separate response-style transcript/tool ingestion path
- the remaining separate project-fact transcript/tool ingestion path
- the remaining separate recurring-procedure transcript/tool ingestion path
- prompt-section family-policy branching as the effective durable-memory
  application owner
- duplicated hybrid query-intent inference across the query layer and tool
  wrapper
- unconditional semantic fallback routing from the hybrid tool

## What batch v4 did not replace

- recurring procedures still retain too much staged subsystem shape
- correction policy is still not fully declarative
- proofing is still registry-plus-switch
- registry authority and memory-family boundary cleanup are still ahead
- application selection is now structural at the prompt-facing layer, but not
  yet the final retrieval-fed per-memory-item substrate

## What remains major substrate work

### Remaining blockers before reduced-profile self-improving capture

1. recurring-procedure staged substrate redesign
2. correction-policy cleanup

### Remaining blockers before adding new families

3. proof-runner adapterization
4. registry authority cleanup
5. memory-family contract / boundary cleanup

### Could fix later

- more aggressive normalization of retrieval SQL generation once the retrieval
  control plane is stronger
- better artifact / read-model convergence if procedure and memory-object
  storage still feel too separate after the staged redesign

## What is now live but still partial

- application-selection layer
  - live for prompt-facing family posture selection and suppression
  - not yet the final retrieval-fed per-memory-item application substrate
- retrieval + semantic-routing control plane
  - live for hybrid query intent, project-family shaping, and semantic fallback
    family routing
  - not yet the end-state for all later retrieval normalization work
- registry-driven proof inspection
  - still helper-and-switch based rather than adapter-driven

## Must remain intentionally different

- procedures remain `suggestion_first` and direct-use only on clear ask
- project facts remain explicit, scoped, and stricter than generic guidance
- response style remains bounded and not broad personality memory
- unmet needs remain recommendation-only
- semantic routing remains hybrid-first and family-gated
- phrase induction remains family-eligible, not universal

## Explicitly not next

Still not next:

- reduced-profile self-improving capture integration
- learned-guidance advisory planning
- new cross-domain families

Those phases still wait for the remaining substrate work above.

## The next main implementation slice

The next main implementation slice should now be:

- recurring-procedure staged substrate redesign

Reason:

- procedure posture differences are real, but too much implementation shape is
  still separate
- procedure lifecycle, retrieval, correction, and proof concerns are still the
  biggest remaining family-specific subsystem
- self-improving capture should not land until procedures are a staged family on
  the shared substrate rather than a quasi-separate product
