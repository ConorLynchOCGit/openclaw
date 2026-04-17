---
summary: "Canonical tranche-1 patch-lineage record for browsing, session UI, and specialist-pack restoration."
title: "Tranche 1 Patch Lineage"
---

# Tranche 1 Patch Lineage

This document preserves the patch families that materially informed tranche 1.

## Primary evidence families

- `openclaw-runtime-2026-03-29`
  - specialist session labels
  - x-manager context recovery proof
- `openclaw-runtime-2026-03-30`
  - Main browsing rules
  - web-research delegation rules
  - session visibility policy
  - browser-access and capability-boundary fixes

## Canonization status

- `main-web-routing-authoritative-fix*.patch`
  - restored into canonical runtime guidance and docs-backed browsing contract
- `web-research-delegation-wiring.patch`
  - used as evidence for canonical `web-researcher` delegation rules
- `real-session-selector-fix.patch`
  - used as evidence for session-selector labeling and visibility restoration
- `session-selector-visibility-policy.patch`
  - used as evidence for default hidden-session policy
- `session-ui-cleanup-unified-hide-rule.patch`
  - used as evidence for the shared hidden-session rule

## Still historical

- raw patch files remain historical proof and rollback-adjacent evidence
- the canonical repo should prefer restored runtime code and durable docs over
  replaying patches directly
