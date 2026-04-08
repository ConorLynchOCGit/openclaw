# Next Substrate Push Plan

## Purpose

This doc turns the accepted post-v3 architecture review into the concrete
execution order for the remaining substrate push after flattening batch v5.

## What is now already landed

The following batches are already landed:

- flattening batches v1-v5
- substrate support batch v1

Most importantly, the repo now has live landings for:

- full ingestion control-plane flattening
- prompt-facing application-selection / behavior-planning
- hybrid retrieval + semantic-routing control decisions
- recurring-procedure staged substrate redesign
- declarative correction-policy execution kinds / target kinds
- proof lifecycle/artifact adapter dispatch

## Remaining recommended slice sequence

### Remaining main substrate slices

1. registry authority cleanup
2. memory-family contract / boundary cleanup

### Later improvements

3. deeper retrieval SQL normalization once the retrieval/routing control plane
   is stronger
4. artifact / read-model convergence if procedure and memory-object storage
   still feel too separate after the staged redesign

## Updated likely slice count

Honest estimate now:

- before the next honest reevaluation of reduced-profile self-improving
  capture: 1 major slice remains
- before new families: 2 major slices remain
- plus later bounded follow-up hardening only if code reality still warrants it

## What should land next

The next implementation slice should now be:

- registry authority cleanup

Why:

- the registry now governs more live runtime policy, but it is still not
  authoritative enough to be called the honest control plane
- phrase proof families and other remaining surfaces still sit outside the main
  family registry path
- reduced-profile self-improving capture remains intentionally deferred until
  the registry authority slice proves this boundary is real

## What can be parallelized

Once registry authority cleanup is stable:

- memory-family contract boundary design
- any bounded reduced-profile self-improving capture reevaluation

During implementation, only parallelize slices with genuinely disjoint write
scopes or clearly one-way dependencies.

## What should not be parallelized prematurely

- reduced-profile self-improving capture implementation
- new family implementation
- broad boundary changes before registry authority cleanup is stable
- aggressive SQL normalization before the post-procedure retrieval shape is
  stable

## Validation posture

Higher-risk remaining slices that should expect broader validation:

- registry authority cleanup
- memory-family contract / boundary cleanup

Moderate-risk remaining slices:

- any bounded reduced-profile self-improving capture reevaluation

The support batch plus flattening batches v4-v5 are already landed. They
reduced proof burden and control-plane duplication, but they did not replace
the remaining registry and boundary work.

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

1. registry authority cleanup
2. memory-family contract / boundary cleanup
3. only then reevaluate reduced-profile self-improving capture
4. only later bounded hardening that still remains honest after those slices
   land

## Exit criteria before moving on

Before new families:

- proofing remains adapter-driven
- registry authority is honest
- memory-family policy crosses core/middleware/plugin boundaries cleanly

## Next implementation slice

- registry authority cleanup
