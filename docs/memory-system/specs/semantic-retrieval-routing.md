# Semantic Retrieval Routing

## Purpose

Document the current semantic-routing posture and clarify why it should now be
absorbed into the broader retrieval/routing control-plane work.

## Current live posture

Live today:

- hybrid-first retrieval remains the default
- semantic fallback exists for bounded family/query classes
- semantic routing remains family-gated

## Why this spec is now explicitly partial

The current semantic-routing implementation is still too sidecar-shaped.

It depends on:

- hardcoded eligible lesson-key groups
- separate family fallback paths
- routing policy that is not yet fully registry-authoritative

That is acceptable as a bounded live bridge. It is not the final routing
architecture.

## Relationship to the next retrieval phase

The next target is specified in:

- `/memory-system/specs/retrieval-and-routing-control-plane`

That work should absorb semantic fallback eligibility and routing into one
governable control plane while preserving:

- hybrid-first posture
- family gating
- approved-only user-facing behavior

## What remains intentionally different

- semantic routing remains family-gated
- exact typed wins still outrank conceptual similarity where that is the right
  product behavior
- procedures keep their clearer retrieval threshold

## Implementation rule

Do not treat the current semantic-routing sidecar as the final routing
architecture. It is a bounded bridge that should be folded into the broader
retrieval/routing control plane.
