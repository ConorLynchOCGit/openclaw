# Implementation Sequencing

## Purpose

This document turns the roadmap and spec pack into an execution order optimized
for:

- speed
- low rework
- low production risk
- high user-visible value

## Recommended implementation order

1. quick-win governance productionization tranche
2. memory application and user-control rules
3. semantic event detector v1
4. ambiguity / clarify-abstain behavior
5. candidate confirmation lifecycle
6. messy-language eval framework
7. response-style profile completion
8. phrase induction v1
9. recurring procedure memory
10. broader project memory expansion
11. workflow improvement / tool-gotcha memory
12. unmet-need planning
13. wait-tranche governance productionization
14. reduced-profile self-improving capture enablement
15. any broader automation discussion

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
- phrase induction is more valuable after the first semantic families exist
- workflow improvements and unmet-need planning are useful but lower direct
  user value
- self-improving capture should wait until native taxonomy and review quality
  are strong

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

### Before reduced-profile self-improving capture enablement

- semantic event detector is live for first families
- phrase induction exists or a deliberate alternative is documented
- messy-language eval is already in use
- candidate noise is acceptably low

## What can proceed in parallel

Safe parallel tracks after the shared prerequisites are met:

- phrase induction + messy-language eval
- project-memory expansion + workflow-improvement-memory
- governance productionization docs + runbook updates

## What must not proceed in parallel

- semantic detector implementation and self-improving enablement
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
- workflow-improvement memory
- governance productionization
- premortem / guardrail work

## High risk vs low risk

### Higher risk

- semantic detector
- behavior application
- wait-tranche governance productionization
- self-improving capture enablement
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
