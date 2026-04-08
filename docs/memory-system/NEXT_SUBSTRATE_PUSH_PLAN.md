# Next Substrate Push Plan

## Purpose

This doc records the honest next move after flattening batch v6 landed the
remaining core flattening slices.

## What is now already landed

The following batches are already landed:

- flattening batches v1-v6
- substrate support batch v1

Most importantly, the repo now has live landings for:

- full ingestion control-plane flattening
- prompt-facing application-selection / behavior-planning
- hybrid retrieval + semantic-routing control decisions
- recurring-procedure staged substrate redesign
- declarative correction-policy execution kinds / target kinds
- proof lifecycle/artifact adapter dispatch
- registry authority cleanup
- memory-family contract / boundary cleanup
- deeper retrieval SQL normalization for approved-vs-reviewable-candidate
  simple memory-object reads

## What flattening batch v6 changed

- the registry now owns workflow-family mapping and phrase proof-family
  ownership
- plugin-sdk now owns the shared memory-family policy contract directly
- approved-vs-reviewable-candidate `get` / `list` / `basic` reads now share
  one bounded scaffold where the read surfaces already align

## Remaining recommended sequence

### Next major phase

1. reduced-profile self-improving capture reevaluation
2. bounded reduced-profile self-improving capture first tranche if the
   reevaluation stays honest
3. learned-guidance advisory planning only after that
4. new families only after those phases

### Later bounded cleanup only if justified

- artifact / read-model convergence if procedure and memory-object storage
  still feel too separate under later pressure
- narrower retrieval cleanup only if later work exposes honest remaining
  duplication

## Updated likely slice count

Honest estimate now:

- remaining core flattening slices: 0
- next major roadmap phase before any new family work: reduced-profile
  self-improving capture reevaluation and then its bounded first tranche
- later bounded cleanup remains conditional, not precommitted

## What should land next

The next implementation slice should now be:

- reduced-profile self-improving capture reevaluation

Why:

- the old substrate blockers for registry authority and cross-boundary family
  policy are now landed
- the next honest question is whether reduced-profile self-improving capture
  can use those shared substrates without creating a fresh parallel system
- learned-guidance advisory planning and new families are still later than that

## What can be parallelized

Once reduced-profile self-improving capture reevaluation is stable:

- bounded reduced-profile self-improving capture first-tranche implementation
- later artifact/read-model convergence reevaluation if capture pressure
  exposes it

During implementation, only parallelize slices with genuinely disjoint write
scopes or clearly one-way dependencies.

## What should not be parallelized prematurely

- learned-guidance advisory planning implementation
- new family implementation
- broad artifact/read-model redesign before reduced-profile self-improving
  capture reevaluation says it is necessary

## Validation posture

Higher-risk next phase:

- reduced-profile self-improving capture reevaluation and first bounded tranche

Moderate-risk later follow-up:

- artifact/read-model convergence if later pressure shows it is still needed

## What not to do during the remaining push

- do not enable reduced-profile self-improving capture blindly
- do not enable learned-guidance advisory planning yet
- do not add new memory families yet
- do not erase real family-policy differences
- do not accept “the flattening checklist is done” as proof that rollout risk
  is gone

## Recommended grouping from here

If you want the cheapest credible remaining order, use this grouping:

1. reevaluate reduced-profile self-improving capture on the now-flatter
   substrate
2. land the smallest honest bounded first tranche if that reevaluation stays
   positive
3. only then consider learned-guidance advisory planning
4. only later bounded hardening that still remains honest after those phases
   land

## Exit criteria before moving on

Before new families:

- proofing remains adapter-driven
- registry authority is honest
- memory-family policy crosses core/middleware/plugin boundaries cleanly
- reduced-profile self-improving capture is proven on the shared substrate

## Next implementation slice

- reduced-profile self-improving capture reevaluation
