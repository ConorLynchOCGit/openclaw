# Registry-Driven Proof Inspection

## Purpose

Document the historical bridge from batch v3 proof-family registry work into
the adapterized proof substrate that landed in flattening batch v5.

## Current landed value

Batch v3 improved proofing by:

- making proof-family definitions explicit
- reducing some prior proof-runner splitting
- sharing lifecycle-artifact extraction helpers

Batch v5 then completed the main proof-runner adapterization:

- lifecycle inspection dispatch now resolves through registered adapters
- artifact extraction now resolves through registered adapters
- the six main family proof definitions now derive from family registry policy

That is real progress.

## What is still explicitly partial

The current proof architecture is now adapter-driven.

It is not yet fully registry-authoritative proof policy.

The remaining gap is that some proof policy still sits outside the main family
registry path, especially for phrase-only proof families.

That means adding families or artifact modes can still expand proof-runner
policy surfaces more than the final design should allow.

## Relationship to the next proof phase

The current adapterized architecture is specified in:

- `/memory-system/specs/proof-runner-adapterization`

The next remaining proof-related authority work is specified in:

- `/memory-system/specs/registry-authority-cleanup`

## What remains valid from the current layer

- proof-family definitions are still useful
- shared proof helpers are still useful
- backward-compatible proof output remains the right constraint

## What remains incomplete

- stronger proof policy source of truth
- elimination of separate competing proof-policy tables where possible

## Implementation rule

Do not call proofing fully registry-driven until adding families or artifact
types no longer requires expanding proof-policy surfaces outside the honest
registry control plane.
