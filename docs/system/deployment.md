---
summary: "Canonical deployment posture and runtime-sprawl prevention surface."
title: "System Deployment"
---

# System Deployment

OpenClaw should converge toward one canonical deployment shape in active use:

- one canonical repo checkout
- one canonical runtime container
- one canonical runtime image

This page is the durable policy surface for that posture.

Related implementation footholds:

- [Runtime Inventory Registry](/system/registries/runtime-inventory)
- `scripts/check-runtime-inventory.mjs`
- [Scheduled Programs](/projects/deployment-topology/scheduled-programs)
- [Deployment Runbooks](/projects/deployment-topology/runbooks)
- [Live Config Representation](/projects/deployment-topology/live-config-representation)
- [GitHub Automation](/projects/deployment-topology/github-automation)
- [Repo Vs Container Project Adoption Audit](/projects/deployment-topology/repo-vs-container-project-adoption-audit)
- [Pre-Agent Prerequisites Audit](/projects/deployment-topology/pre-agent-prerequisites-audit)
- [Tranche 1 Patch Lineage](/projects/deployment-topology/tranche-1-patch-lineage)
- [Archive Retention Audit](/projects/deployment-topology/archive-retention-audit)
- [Missing Functionality Recovery Audit](/projects/deployment-topology/missing-functionality-recovery-audit)
- [Exhaustive Recovery Manifest](/projects/deployment-topology/exhaustive-recovery-manifest)
- [Push Validation Human Checklist](/projects/deployment-topology/push-validation-human-checklist)

Current rule:

- deployment sprawl is treated as drift, not harmless clutter
- cleanup should be measured before deletion
- active runtime assets must not be pruned casually
- host cron and OpenClaw-native cron are both part of the live deployment
  surface and must be inventoried together
- runtime-only operational assets do not count as canonically retained just
  because they still exist on the VPS
- restored tranche-1 assets should move from host-only survival into committed
  repo ownership plus live runtime adoption
- live rebuild and recreate should now run through the compose build path from
  the canonical live repo, not from a stale prebuilt image alone
- active host cron assets should run from committed repo-owned scripts under
  `ops/host/`, not from the legacy workspace tree
- the strict backlog for post-consolidation recovery now lives in the
  exhaustive manifest rather than only in the earlier broad audit
- landing restored deployment work should use the canonical human validation
  matrix rather than relying on ad hoc chat-only test notes
