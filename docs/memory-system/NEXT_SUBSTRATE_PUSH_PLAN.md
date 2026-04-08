# Next Substrate Push Plan

## Purpose

This doc turns the accepted post-v3 architecture review into the concrete
execution order for the remaining substrate push after flattening batch v4.

## What is now already landed

The following batches are already landed:

- flattening batches v1-v4
- substrate support batch v1

Most importantly, the repo now has live landings for:

- full ingestion control-plane flattening
- prompt-facing application-selection / behavior-planning
- hybrid retrieval + semantic-routing control decisions

## Remaining recommended slice sequence

### Remaining blockers before reduced-profile self-improving capture

1. recurring-procedure staged substrate redesign
2. correction-policy cleanup

### Remaining blockers before new families

3. proof-runner adapterization
4. registry authority cleanup
5. memory-family contract / boundary cleanup

### Later improvements

6. deeper retrieval SQL normalization once the retrieval/routing control plane
   is stronger
7. artifact / read-model convergence if procedure and memory-object storage
   still feel too separate after the staged redesign

## Updated likely slice count

Honest estimate now:

- before reduced-profile self-improving capture: 2 major slices remain
- before new families: 5 major slices remain
- plus later bounded follow-up hardening only if code reality still warrants it

## What should land next

The next implementation slice should now be:

- recurring-procedure staged substrate redesign

Why:

- procedure posture differences are real, but too much implementation shape is
  still separate
- procedure lifecycle, retrieval, correction, and proof concerns are still the
  largest remaining family-specific subsystem
- self-improving capture should not land until procedures behave like a staged
  family on the shared substrate rather than a quasi-separate product

## What can be parallelized

Once the recurring-procedure staged substrate contract is stable:

- correction-policy cleanup design
- proof-runner adapter design
- registry authority cleanup design
- memory-family contract boundary design

During implementation, only parallelize slices with genuinely disjoint write
scopes or clearly one-way dependencies.

## What should not be parallelized prematurely

- self-improving capture implementation
- new family implementation
- deep proof-runner refactors before the procedure redesign is stable
- aggressive SQL normalization before the post-procedure retrieval shape is
  stable

## Validation posture

Higher-risk remaining slices that should expect broader validation:

- recurring-procedure staged substrate redesign
- proof-runner adapterization
- memory-family contract / boundary cleanup

Moderate-risk remaining slices:

- correction-policy cleanup
- registry authority cleanup

The support batch and flattening batch v4 are already landed. They reduced
proof burden and control-plane duplication, but they did not replace the
remaining procedure, proof, registry, and boundary work.

## What not to do during the remaining push

- do not enable reduced-profile self-improving capture
- do not enable learned-guidance advisory planning
- do not add new memory families
- do not erase real family-policy differences
- do not accept “shared helper” as proof that a duplicated system is gone
- do not leave procedures as a quasi-separate product while claiming the
  family substrate is finished

## Recommended grouping from here

If you want the cheapest credible remaining order, use this grouping:

1. recurring-procedure staged substrate redesign
2. correction-policy cleanup
3. proof-runner adapterization
4. registry authority cleanup + memory-family contract / boundary cleanup
5. only later bounded hardening that still remains honest after those slices
   land

## Exit criteria before moving on

Before reduced-profile self-improving capture:

- procedures preserve distinct posture without remaining a quasi-separate
  subsystem
- correction policy is declarative enough for later learned capture pressure

Before new families:

- proofing no longer scales through switches
- registry authority is honest
- memory-family policy crosses core/middleware/plugin boundaries cleanly

## Next implementation slice

- recurring-procedure staged substrate redesign
