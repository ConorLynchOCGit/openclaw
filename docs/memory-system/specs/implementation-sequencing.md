# Implementation Sequencing

## Purpose

This document turns the roadmap and spec pack into an execution order optimized
for:

- speed
- low rework
- low production risk
- high user-visible value

## Recommended implementation order

Historical completed order:

1. quick-win governance productionization tranche
2. memory application and user-control rules
3. semantic event detector v1
4. ambiguity / clarify-abstain behavior
5. candidate confirmation lifecycle
6. messy-language eval framework
7. response-style profile completion
8. recurring procedure memory
9. broader project memory expansion
10. workflow improvement / tool-gotcha memory
11. family-aware semantic retrieval routing
12. pre-feature delivery enablement tranche
13. generalized supervised lesson learning v1
14. generalized lesson auto-review and promotion v1
15. reviewed phrase induction for approved generic lessons
16. generalized lesson retrieval/application expansion
17. broader project-rule learning on the same generic lesson pipeline
18. unmet-need planning v1 on the same generic lesson pipeline

Recommended next execution order after the generalized-learning pivot:

19. existing-family parity and genericization completion
20. reduced-profile self-improving capture integration
21. later learned-guidance advisory planning
22. cross-domain family expansion tranche 1:
    decision + rationale, observation / result / finding, terminology /
    ontology / canonical definition, and entity profile
23. cross-domain family expansion tranche 2:
    risk / hazard / safety constraint, metric / baseline / threshold,
    hypothesis / open question, audience / stakeholder model, source trust /
    authority ranking, and exception / edge-case rule
24. any broader automation discussion

Current sequencing note:

- the pre-feature delivery enablement tranche is complete
- the narrowly bounded project-memory expansion v3 slice is now also landed
- the broader workflow-improvement memory v2 slice is now also landed
- the first generalized supervised lesson learning slice is now also landed
- generalized lesson auto-review and promotion v1 is now also landed
- reviewed phrase induction for approved generic lessons is now also landed
- generalized lesson retrieval/application expansion is now also landed
- broader project-rule learning on the same generic lesson pipeline is now
  also landed
- unmet-need planning v1 on the same generic lesson pipeline is now also
  landed
- the program is no longer primarily advancing by enumerating one lesson key
  at a time
- the next implementation slice should be:
  - cross-family retrieval/application parity closeout after the
    response-style parity tranche
- the next follow-up slices after that should be:
  - reduced-profile self-improving capture integration after the already
    landed families are closer to parity
  - later learned-guidance advisory planning after self-improving candidate
    provenance and generic retrieval posture are mature enough
  - then domain-neutral family expansion guided by
    `/memory-system/specs/cross-domain-memory-families`

## Why this order is recommended

- some governance families are already built enough to produce quick
  operational closure before new feature implementation
- the quick-win tranche stays manual/internal and stops short of
  approval/install semantics
- behavior application and user control must be settled before broad semantic
  capture, or later phases will feel inconsistent and hard to repair
- semantic detection without ambiguity rules, candidate confirmation rules,
  and evals is too risky
- response-style memory is the highest-frequency visible win
- procedure memory is a strong second visible win
- family-aware semantic retrieval routing becomes more useful only after the
  first bounded semantic families are already live
- once the early semantic-routing and workflow slices are live, the next
  source of delay shifts from missing feature design to repeated proof and
  rollout friction; the delivery enablement tranche is meant to remove that
  drag before the remaining user-facing families continue
- generalized supervised lesson learning becomes more valuable once the
  bounded workflow and project families have already proven their lifecycle
  seams
- phrase induction is more valuable after approved generic lessons exist and
  auto-review can turn broader lessons into durable approved inputs
- generalized lesson retrieval/application is more valuable after broader
  approved lessons exist and before later families broaden
- broader project-rule learning and unmet-need planning should reuse the
  generic lesson pipeline rather than starting from new bespoke candidate
  models
- once project-rule learning is live, unmet-need planning becomes the next
  broader family because it extends the same substrate without broadening into
  autonomy
- before self-improving capture or cross-domain expansion, the already-landed
  families should be brought closer to the same maturity level across:
  - natural-language capture
  - canonicalization
  - clustering and dedupe
  - machine review and promotion
  - repair and supersede
  - retrieval and application quality
- self-improving capture should wait until native taxonomy, auto-review,
  backlog control, and existing-family parity are stronger
- after family parity, self-improving capture, and learned-guidance advisory
  planning are live, future expansion should prefer domain-neutral families
  over longer software-only tails
- decision, finding, terminology, and entity families should land before more
  specialized long-tail lesson families because they travel better across
  multiple knowledge domains

## Hard prerequisites

### Before quick-win governance productionization

- family-by-family quick-win vs wait classification exists
- each quick-win family still stops short of approval/install semantics
- runbook and rollback notes are part of the tranche, not deferred to later

### Before semantic detector work

- behavior application rules exist
- ambiguity policy exists
- candidate confirmation lifecycle exists
- messy-language eval plan exists

### Before recurring procedure memory

- behavior application rules exist
- at least one response-style family is stable under semantic capture

### Before generalized lesson auto-review and promotion

- generalized lesson candidate formation is live
- normalized generic lesson shape is stable enough to cluster
- duplicate suppression exists
- proof runner can capture the generic path honestly

### Before reviewed phrase induction for approved generic lessons

- generalized lesson auto-review is live
- approved generic lessons exist without manual promotion as the normal path
- generic lesson retrieval is still hybrid-first

### Before generalized lesson retrieval/application expansion

- generalized lesson auto-review is live
- at least one approved generic lesson family is stable
- prompt/application seams already attribute applied memory

### Before reduced-profile self-improving capture integration

- semantic event detector is live for first families
- generalized lesson auto-review is live
- phrase induction exists or a deliberate alternative is documented
- messy-language eval is already in use
- candidate noise is acceptably low
- the currently landed families are closer to parity on lifecycle and
  retrieval/application quality than they are today

### Before family-aware semantic retrieval routing

- at least two bounded semantic families are already live
- hybrid retrieval is stable for those families
- approved-only behavior rules are already proven
- semantic retrieval remains approved-only plus explicit validated-procedure
  scope

## What can proceed in parallel

Safe parallel tracks after the shared prerequisites are met:

- phrase induction + messy-language eval
- generalized lesson retrieval/application docs + broader family design
- family-aware semantic retrieval routing spec work + later conceptual family
  design
- governance productionization docs + runbook updates
- repo-global landing hygiene work + memory-program proof harness work, once
  the delivery enablement tranche is active

## What must not proceed in parallel

- generalized lesson auto-review and self-improving enablement
- behavior-application changes and broad production rollout

## High user value vs low user value

### Highest user value

- response-style profile completion
- recurring procedure memory
- broader project memory

### Medium user value

- user repair/control
- semantic detector
- behavior application

### Lower direct user value but still important

- phrase induction
- generalized lesson auto-review
- governance productionization
- premortem / guardrail work

## High risk vs low risk

### Higher risk

- generalized lesson auto-review
- behavior application
- wait-tranche governance productionization
- self-improving capture integration
- any productionization that touches live governance posture

### Lower risk

- quick-win governance productionization
- messy-language eval harness
- phrase induction candidate store
- roadmap/spec/runbook updates

## Proof environment first

The following must be proven in the isolated proof environment first:

- any quick-win governance family whose docs/config changed before production
  proof
- semantic detector outputs
- ambiguity outcomes
- response-style profile application
- procedure memory retrieval/use
- broader project-memory fields
- unmet-need recommendation artifacts

## Production early-implementation restrictions

Do not touch on production during early implementation:

- pairing/auth experiments
- new scheduler classes
- self-improving enablement
- procurement/install automation
- actual installation

The quick-win governance tranche is the only allowed productionization work
before the next major user-facing semantic slice.

## Good enough to start coding

For a spec to be ready for code:

- scope is bounded
- current seams are identified
- candidate vs approved behavior is explicit
- rollout posture is explicit
- proof requirements are explicit
- non-goals are explicit

If any of those are missing, finish the spec first.
