# Current Slice

## Active slice

Substrate support batch v1

## Objective

Land the bounded support work that should happen soon around the post-v3
substrate push:

- memory testability hardening
- retrieval SQL scaffolding reduction
- stringly control-flow cleanup

This slice exists to make the larger control-plane flattening work cheaper to
implement and easier to prove without pretending that the main flattening work
is already done.

## What just landed in support batch v1

### Memory testability hardening

- retrieval-intent classification now lives in a dedicated helper seam
- current durable-memory guidance planning is now explicit and unit-testable
- semantic fallback eligibility now has pure decision helpers

### Retrieval SQL scaffolding reduction

- approved and reviewable-candidate hybrid memory-object search now shares one
  surface scaffold for metadata expressions, read-surface projection, and
  review-state projection
- approved-only artifact visibility and explicit candidate-state filtering
  remain distinct where they are genuinely different

### Stringly control-flow cleanup

- the correction engine no longer gates immediate bounded correction on a raw
  auto-promotion profile string
- callers now pass an explicit correction-promotion policy union instead

## What this support batch de-risked

- future retrieval/routing work can now unit-test intent normalization and
  semantic fallback eligibility without large integration harnesses
- future application-selection work now has a real guidance-plan seam to build
  on rather than only prompt rendering loops
- future retrieval control-plane work now starts from one shared hybrid
  memory-object surface scaffold instead of two near-identical SQL builders
- future correction-policy cleanup no longer has the correction engine itself
  branching on a freeform profile string

## What this support batch did not replace

- no new ingestion control plane exists yet
- no real application-selection layer exists yet
- retrieval and semantic routing are still not one control plane
- recurring procedures still keep too much historical subsystem shape
- proofing is still registry-plus-switch
- registry authority and boundary cleanup are still ahead

## What remains major substrate work

### Blockers before reduced-profile self-improving capture

1. full ingestion control-plane flattening
2. real application-selection / behavior-planning layer
3. retrieval + semantic-routing control-plane flattening
4. recurring-procedure staged substrate redesign
5. correction-policy cleanup

### Blockers before adding new families

6. proof-runner adapterization
7. registry authority cleanup
8. memory-family contract / boundary cleanup

### Recently landed support work

- memory testability hardening
- retrieval SQL scaffolding reduction
- stringly control-flow cleanup

### Could fix later

- more aggressive normalization of retrieval SQL generation once the
  control-plane rewrite is landed
- better artifact / read-model convergence if procedure and memory-object
  storage still feel too separate after the staged redesign

## What is partially landed rather than complete enough

- behavior-profile layer
  - partially landed as shared prompt-policy support
  - not yet a true application-selection planner
- registry-driven proof inspection
  - partially landed as proof-family definitions plus shared helpers
  - not yet a true adapter-driven proof substrate
- retrieval feature framework
  - partially landed as shared score composition
  - not yet the full retrieval/routing control plane
- unified ingestion resolver
  - partially landed for the workflow family cluster
  - not yet the single ingestion control plane for all six families
- unified correction / supersede
  - partially landed for several bounded paths
  - not yet fully declarative or free of stringly gating

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

Those phases now wait for the stronger substrate work listed above, not just
for one narrow closeout slice.

## The next main implementation slice

The next main implementation slice should still be:

- full ingestion control-plane flattening

Reason:

- the support batch reduced proof burden, not the main control-plane debt
- ingestion is still the largest duplicated family-control seam
- it still blocks cleaner application selection and retrieval/routing
  unification
