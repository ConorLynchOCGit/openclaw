---
summary: "Post-restoration cleanup and verification backlog to finish after the remaining rescue cases land."
title: "Post-Restoration Cleanup"
---

# Post-Restoration Cleanup

This file tracks the cleanup and verification work that should be completed
after the remaining rescue cases are migrated or canonized.

These items are intentionally separated from the strict rescue manifest so the
restoration backlog stays focused on missing or runtime-only functionality.

Before any landing push, run the canonical human validation matrix:

- [Push Validation Human Checklist](/projects/deployment-topology/push-validation-human-checklist)

## Current rule

- finish the remaining rescue cases first
- then execute this cleanup tranche as a structured verification and rollout-hardening pass
- do not treat these items as already complete just because adjacent rescue work landed

## Untested Or Not-Fully-Tested Restored Surfaces

### Scheduled programs

- GitHub digest end-to-end live delivery after canonization, not just script presence and cron repointing
- Daily Operator Review full trigger, prep, run, artifact, and delivery path
- Weekly Operator Review full trigger, prep, run, artifact, and delivery path
- Weekly Maintenance Debt Guard against the canonized control inputs after those inputs land

### Specialist agents and restored packs

- `x-manager` end-to-end behavior with restored durable pack, approval policy, and voice/account context
- `writer` cold-start and runtime behavior from its restored or canonized pack
- `researcher` cold-start and runtime behavior after the session-permission repair
- `builder` cold-start and runtime behavior once its durable pack is canonized
- `chief` shared-workspace ownership model under real operator use after the broader agent-pack work lands

### Memory architecture

- model-memory end-to-end capture across multiple fresh sessions
- model-memory retrieval behavior in fresh sessions after new capture events
- cross-session persistence checks for freshly captured durable memory
- startup-context behavior after new daily memory writes
- full verification that the repaired `MEMORY.md` bootstrap path and the live model-memory seams stay aligned

### Host automation and ops assets

- every canonized host automation asset should be exercised against its real trigger path, not only checked for repo presence
- every migrated cron script should be validated for current paths, permissions, outputs, and delivery targets
- every restored or canonized runbook-backed operational lane should be checked from trigger through artifact output

### External-provider and browsing seams

- Brave live path under repeated real queries
- Firecrawl live path after the remaining warning and secret-snapshot drift is cleaned up
- browser live path beyond the current smoke coverage, including reset-profile robustness on mounted profiles
- Main to `web-researcher` delegation path under fresh sessions and repeated use

## Rollout And Deployment Cleanup

- keep the explicit compose build path aligned with the live runbook
- validate the published route on the env-resolved host port, not by assuming
  the container port is the published port
- keep build arguments, image tags, and runbook examples aligned so operators do
  not recreate from a stale local image again

## Exit Criteria

- no restored high-risk surface remains only spot-checked
- no active rollout path depends on implicit image state
- restored functionality is verified from real trigger to real outcome
- deployment docs describe the real rebuild and recreate contract without ambiguity
