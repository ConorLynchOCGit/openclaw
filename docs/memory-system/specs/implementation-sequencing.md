# Implementation Sequencing

## Purpose

This document turns the roadmap and spec pack into an execution order optimized
for:

- low rework
- low rollout risk
- high future-family leverage
- minimal new parallel systems

## Current sequencing conclusion

The six landed families are now close enough to practical parity to move
forward, but not similar enough in implementation shape to justify immediate:

- reduced-profile self-improving capture
- learned-guidance advisory planning
- broad family expansion

The next major phase is flattening the family substrate.

## Completed order so far

Historical completed order:

1. bounded governance and candidate substrate
2. bounded semantic family rollout
3. generalized workflow lesson learning
4. generalized lesson auto-review
5. reviewed phrase induction for approved generic workflow lessons
6. generalized lesson retrieval and application expansion
7. project-rule learning
8. unmet-need planning
9. existing-family parity batches
10. cross-family retrieval / repair / phrase / envelope parity closeout

## Recommended next order

1. flattening phase:
   - family-definition registry
     - landed in batch v1
   - unified ingestion resolver
     - landed in batch v1 for the workflow-family cluster
   - unified clustered lifecycle
     - landed in batch v1 for memory-object lifecycle inspection
   - unified correction / supersede engine
   - unified phrase-pattern engine
   - retrieval feature framework
   - behavior-profile layer
   - registry-driven proof inspection
2. reduced-profile self-improving capture integration
3. learned-guidance advisory planning
4. cross-domain family expansion tranche 1:
   - decision + rationale
   - observation / result / finding
   - terminology / ontology / canonical definition
   - entity profile
5. cross-domain family expansion tranche 2:
   - risk / hazard / safety constraint
   - metric / baseline / threshold
   - hypothesis / open question
   - audience / stakeholder model
   - source trust / authority ranking
   - exception / edge-case rule

## Why this order is recommended

- practical parity solved the biggest user-facing inconsistency
- flattening solves the biggest execution-cost and scalability problem
- self-improving capture should land on top of flatter family plumbing
- advisory planning should land on top of flatter retrieval/application
  plumbing
- cross-domain family expansion should not resume while family policy is still
  scattered across branches

## Must flatten now

The following are the highest-leverage flattening steps and should be treated as
the near-term execution core:

1. family-definition registry
2. unified ingestion resolver
3. unified clustered lifecycle
4. unified correction / supersede engine
5. retrieval feature framework
6. behavior-profile layer

These directly reduce the cost of future families.

Current completion inside that core:

- registry: landed
- ingestion: landed for the workflow-family cluster
- clustered lifecycle: landed for memory-object inspection
- correction / supersede: next

## Can flatten later inside the same phase

- unified phrase-pattern engine
- registry-driven proof inspection

These still matter, but they can follow after registry/ingestion/lifecycle if a
later implementation slice needs tighter staging.

## Must remain intentionally family-specific

- procedures remain `suggestion_first` and direct-use only on clear ask
- project facts remain explicit and stricter than generic guidance
- response style remains bounded
- semantic routing remains family-gated
- phrase induction remains family-eligible rather than universal

## Hard prerequisites before flattening implementation starts

- the architecture docs for flattening are checked in
- the family-definition registry shape is settled enough to code
- the current families are documented in terms of:
  - what is live
  - what flattening absorbs
  - what remains family policy
- the active roadmap and current-slice docs no longer say
  reduced-profile self-improving capture is immediately next

## Hard prerequisites before reduced-profile self-improving capture

- family-definition registry is live
- ingestion no longer depends on two divergent family-resolution stacks for the
  active families
- clustered lifecycle and correction behavior are no longer spread across near-
  duplicate paths for the active families
- retrieval/application policy is flatter than it is today

## Hard prerequisites before learned-guidance advisory planning

- reduced-profile self-improving capture is production-proven
- behavior-profile layer and retrieval framework are stable enough that
  advisory logic is not compensating for prompt-section policy sprawl

## Hard prerequisites before new cross-domain families

- flattening phase is materially complete
- reduced-profile self-improving capture is integrated on the flattened
  substrate
- advisory planning is stable enough to reuse the same substrate

## What can proceed in parallel

Once the family-definition registry contract is stable:

- registry spec refinement and proof-inspection design
- phrase-pattern engine design and behavior-profile design
- family-spec updates and roadmap/status alignment

During implementation, keep runtime slices narrow enough that shared substrate
changes can still be proven honestly.

## What must not proceed in parallel

- broad family expansion during flattening
- self-improving capture implementation before the registry/ingestion/lifecycle
  flattening core exists
- advisory-planning implementation before behavior-profile and retrieval
  flattening exist

## Proof posture

Every flattening slice must prove both:

1. no regression in current family behavior
2. real reduction in accidental parallelism

Flattening slices are not honest if they only move code around without proving
that shared substrate is now serving multiple families.
