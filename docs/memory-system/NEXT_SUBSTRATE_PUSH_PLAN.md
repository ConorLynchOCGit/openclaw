# Next Substrate Push Plan

## Purpose

This doc turns the accepted post-v3 architecture review into the concrete
execution order for the next substrate push.

It exists so implementation can proceed without rediscovering sequence, scope,
or non-goals slice by slice.

## Recommended remaining slice sequence

### Blockers before reduced-profile self-improving capture

1. full ingestion control-plane flattening
2. real application-selection / behavior-planning layer
3. retrieval + semantic-routing control-plane flattening
4. recurring-procedure staged substrate redesign
5. correction-policy cleanup

### Blockers before new families

6. proof-runner adapterization
7. registry authority cleanup
8. memory-family contract / boundary cleanup

### Recently landed support work

9. memory testability hardening
10. retrieval SQL scaffolding reduction
11. stringly-control-flow cleanup

### Later improvements

12. deeper retrieval SQL normalization once the retrieval/routing control plane
    is stronger
13. artifact / read-model convergence if procedure and memory-object storage
    still feel too separate after the staged redesign

## Likely slice count

Honest estimate:

- before reduced-profile self-improving capture: 5 major slices
- before new families: 8 major slices
- plus later bounded follow-up hardening only if code reality still warrants it

## What should land first

The next implementation slice should be:

- full ingestion control-plane flattening

Why:

- it is still the largest duplicated family-control seam
- it unlocks cleaner application selection and later retrieval/routing
  unification
- it also reduces the risk that later self-improving capture lands on multiple
  ingestion paths

## What can be parallelized

Once the ingestion-control-plane contract is stable:

- application-selection planning work
- retrieval/routing planning work
- proof-runner adapter design
- registry authority cleanup design
- testability hardening design

During implementation, only parallelize slices with genuinely disjoint write
scopes or clearly one-way dependencies.

## What should not be parallelized prematurely

- self-improving capture implementation
- new family implementation
- deep proof-runner refactors before the retrieval/application plan is stable
- aggressive SQL normalization before the retrieval/routing control plane is
  defined

## Validation posture

Higher-risk slices that should expect broader validation:

- retrieval + semantic-routing control-plane flattening
- recurring-procedure staged substrate redesign
- proof-runner adapterization
- memory-family contract / boundary cleanup

Moderate-risk slices:

- full ingestion control-plane flattening
- application-selection / behavior-planning layer
- correction-policy cleanup

The first support batch is already landed. It de-risked proof and cleanup, but
it did not replace the main control-plane slices.

## What not to do during this push

- do not enable reduced-profile self-improving capture
- do not enable learned-guidance advisory planning
- do not add new memory families
- do not erase real family-policy differences
- do not accept “shared helper” as proof that a duplicated system is gone
- do not leave runtime policy split between registry, prompt prose, SQL
  heuristics, and sidecar routing if the slice claims to flatten that seam

## Recommended grouping

If you want the cheapest credible execution order, use this grouping:

1. full ingestion control-plane flattening
2. application-selection / behavior-planning layer
3. retrieval + semantic-routing control-plane flattening
4. recurring-procedure staged substrate redesign
5. correction-policy cleanup
6. proof-runner adapterization
7. registry authority cleanup + memory-family contract / boundary cleanup
8. only later bounded hardening that still remains honest after the main
   slices land

## Exit criteria before moving on

Before reduced-profile self-improving capture:

- one ingestion control plane exists for the active families
- application selection is structurally represented
- retrieval/routing is one governable control plane
- procedures preserve distinct posture without remaining a quasi-separate
  subsystem
- correction policy is declarative enough for later learned capture pressure

Before new families:

- proofing no longer scales through switches
- registry authority is honest
- memory-family policy crosses core/middleware/plugin boundaries cleanly

## Next implementation slice

- full ingestion control-plane flattening

The support work is now landed. The next slice should stay on the main
substrate path.
