# Live App Patches Index

Purpose

Guide to the patch-only durability layer for live app/runtime overrides.

These families are preserved because they capture local override lineage, rollback-adjacent state, or live drift investigations that were not promoted into a maintained upstream fork at the time.

## Families

### `openclaw-2026.3.24/`

Patch-only durability for the canonical OpenClaw app repo local overrides around the 2026.3.24 upgrade state.

### `openclaw-runtime-2026-03-27/`

Early runtime patch family tied to Phase 10 builder runtime proof.

### `openclaw-runtime-2026-03-28/`

Runtime patch family tied to the first `x-manager` setup slice.

### `openclaw-runtime-2026-03-29/`

Patch family for UI/session labeling and `x-manager` context approval materials.

### `openclaw-runtime-2026-03-30/`

Largest patch family.

Contains:

- web-routing fixes
- browser/runtime fixes
- delegation-contract fixes
- session visibility and selector fixes
- historical pre-rollback drift capture

Review this family carefully before normalizing it. It has the highest chance of mixed historical and rollback-adjacent value.

### `webhook-gateway-2026-03-27/`

Patch-only durability for the separate webhook-gateway stack.

## Use Rules

- do not treat all patch families as cleanup targets
- prefer family-level review before file-level pruning
- if a patch family is still the only durable record of a live override, leave it alone
- if normalization is needed later, classify by family first, not by random file age

<!-- OPENCLAW:MEMORY-PROJECTION:START memory-projection:project-memory-digest:live_app_patches -->

## Compiled Project Memory

- No eligible approved memory is currently projected.
<!-- OPENCLAW:MEMORY-PROJECTION:END memory-projection:project-memory-digest:live_app_patches -->
