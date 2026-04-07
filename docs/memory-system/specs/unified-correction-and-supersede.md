# Unified Correction And Supersede

## Purpose

Document the currently landed correction/supersede substrate and clarify what
remains incomplete.

## Current landed value

The current correction/supersede work now provides:

- shared correction planning for several bounded families
- shared approved-memory supersede execution for several paths
- shared lineage writing for those paths

That is real substrate progress.

## Why this spec is now explicitly partial

The current layer is not yet the final correction-policy substrate.

It still contains:

- legacy stringly/runtime-coupled gating
- incomplete declarative policy coverage
- incomplete procedure fit
- incomplete unmet-need conservative posture modeling

## Relationship to the next correction phase

The next target is specified in:

- `/memory-system/specs/correction-policy-cleanup`

That work should make correction posture declarative and remove the remaining
legacy control-flow smell.

## What remains valid from the current layer

- shared planning direction
- shared lineage direction
- bounded family differences remain appropriate

## What remains incomplete

- declarative immediate-versus-held policy
- procedure staged-substrate fit
- removal of legacy string gates
- final proof alignment

## Implementation rule

Do not describe correction-policy cleanup as if it were already done. The
current shared layer is a partial bridge that still needs a stronger control
plane.
