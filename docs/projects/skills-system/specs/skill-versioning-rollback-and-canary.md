---
summary: "Version-control, canary, and rollback contract for automatic skill changes."
title: "Skill Versioning, Rollback, And Canary"
---

# Skill Versioning, Rollback, And Canary

## Objective

Make automatic skill work safe by requiring explicit versioning, canary scope,
and rollback behavior.

## Versioning rules

- generated skill drafts or edits must happen on a branch, worktree, or
  isolated package path
- every automatic change must include provenance and rollback instructions
- human-authored skill content must not be auto-deleted without explicit
  approval
- destination write rules remain path-specific; versioning does not override
  destination authority

Milestone 3 draft rule:

- workspace-local draft packages are isolated package paths, not promoted
  runtime enablement
- each draft must record a bounded rollback plan that removes or disables the
  draft package only

## Registry state

The platform should track at least:

- active version
- previous version
- risk tier
- eval state
- canary state
- source candidate id
- rollback state

## Canary rules

- canary or shadow mode must use a bounded scope
- the same canonical ids must connect candidate, package, canary, and install
- canary entry requires tier-appropriate evals, resolver/trigger tests,
  check-resolvable-style health report, vetting, package E2E, provenance, and
  rollback metadata
- failed canaries must auto-disable or demote the skill
- failed canaries should create a proactivity repair item
- canary success can be promotion evidence, but it is not deterministic
  semantic authority; promotion still follows model/operator review and the
  autonomy policy for the risk tier

## Rollback rules

- low-risk auto-promoted skills must be easy to disable
- rollback must be operator-legible and immediate
- revert path and disable path must both be recorded when relevant
- rollback proof must be part of package E2E or canary validation before
  promotion
- cross-runtime installs must record rollback paths for each runtime target
