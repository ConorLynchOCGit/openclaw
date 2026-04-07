# Registry-Driven Proof Inspection

## Purpose

Document the partially landed proof-family registry work and clarify what
remains before proofing is honestly adapter-driven.

## Current landed value

Batch v3 improved proofing by:

- making proof-family definitions explicit
- reducing some prior proof-runner splitting
- sharing lifecycle-artifact extraction helpers

That is real progress.

## Why this spec is now explicitly partial

The current proof architecture is still:

- registry-plus-switch

It is not yet:

- adapter-driven proof inspection
- fully registry-authoritative proof policy

## Current-state gap

The proof runner still requires implementation knowledge for:

- lifecycle inspection dispatch
- artifact extraction dispatch
- expectation field requirements

That means adding families or artifact modes can still expand proof-runner
structure.

## Relationship to the next proof phase

The target architecture is specified in:

- `/memory-system/specs/proof-runner-adapterization`

That future work should replace the current registry-plus-switch structure with
registered proof adapters while preserving backward-compatible proof output.

## What remains valid from the current layer

- proof-family definitions are still useful
- shared proof helpers are still useful
- backward-compatible proof output remains the right constraint

## What remains incomplete

- adapter registration
- lifecycle/artifact adapter dispatch
- stronger proof policy source of truth
- elimination of separate competing proof-policy tables where possible

## Implementation rule

Do not call proofing fully registry-driven until adding families or artifact
types no longer requires expanding proof-runner switches.
