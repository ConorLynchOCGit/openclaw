---
summary: "Workspace recall index for system docs, active projects, queued projects, and runtime memory layers."
title: "System Memory"
---

# System Memory

This is the workspace recall index for OpenClaw.

It gives agents and sessions a fast path to the system control docs, the active
and queued project workspaces, the loose-idea holding layer, and the runtime
memory layers that support recall.

It must not collapse the workspace into one project, and it must not flatten
generated memory into authored docs.

## Read this first

- [System Roadmap](/system/roadmap)
- [Build Plan](/system/build-plan)
- [System Projects](/system/projects)
- [System Agents](/system/agents)
- [Deployment](/system/deployment)

## Active workspaces

- [Workspace Topology](/projects/workspace-topology)
  [Startup](/projects/workspace-topology/STARTUP)
  [Current Slice](/projects/workspace-topology/CURRENT_SLICE)
  [Status](/projects/workspace-topology/STATUS)
- [Model Memory](/projects/model-memory)
  [Startup](/projects/model-memory/STARTUP)
  [Current Slice](/projects/model-memory/CURRENT_SLICE)
  [Status](/projects/model-memory/STATUS)
- [Deployment Topology](/projects/deployment-topology)
  [Startup](/projects/deployment-topology/STARTUP)
  [Current Slice](/projects/deployment-topology/CURRENT_SLICE)
  [Status](/projects/deployment-topology/STATUS)
- [Maintenance](/projects/maintenance)
  [Startup](/projects/maintenance/STARTUP)
  [Current Slice](/projects/maintenance/CURRENT_SLICE)
  [Status](/projects/maintenance/STATUS)
- [QA Program](/projects/qa-program)
  [Startup](/projects/qa-program/STARTUP)
  [Current Slice](/projects/qa-program/CURRENT_SLICE)
  [Status](/projects/qa-program/STATUS)

## Queued workspaces

- [Agent Foundation](/projects/agent-foundation)
  [Startup](/projects/agent-foundation/STARTUP)
  [Current Slice](/projects/agent-foundation/CURRENT_SLICE)
  [Status](/projects/agent-foundation/STATUS)
- [Turborepo](/projects/turborepo)
  [Startup](/projects/turborepo/STARTUP)
  [Current Slice](/projects/turborepo/CURRENT_SLICE)
  [Status](/projects/turborepo/STATUS)
- [Intake Routing](/projects/intake-routing)
  [Startup](/projects/intake-routing/STARTUP)
  [Current Slice](/projects/intake-routing/CURRENT_SLICE)
  [Status](/projects/intake-routing/STATUS)

## Loose idea holding layer

- [System Roadmap Ideas](/system/roadmap-ideas)

## User-facing scheduled flows

- [Automation & Tasks](/automation)
- [Scheduled Tasks](/automation/cron-jobs)
- [Heartbeat](/gateway/heartbeat)
- [Background Tasks](/automation/tasks)
- [cron CLI](/cli/cron)
- [Deployment Scheduled Programs](/projects/deployment-topology/scheduled-programs)

## Memory layers

1. durable human-owned memory-bearing sources
2. DB-backed `model-memory` generative projection
3. daily memory files as episodic and ingestion layer

## Runtime memory layers and inventories

- deep document-ingest corpus:
  [Deep Document Ingest Targets 2026-04](/projects/model-memory/document-ingest-targets-2026-04-deep-pass)
- deep document-ingest runbook:
  [Deep Document Ingest Runbook](/projects/model-memory/deep-document-ingest-runbook)
- deep ingest verification plan:
  [Deep Ingest Verification Plan](/projects/model-memory/deep-ingest-verification-plan)
- deep memory soak prompt set:
  [Deep Memory Soak Human Tests](/projects/model-memory/deep-memory-soak-human-tests)
- full-stack human validation prompt pack:
  [Final Human Validation Prompts](/projects/deployment-topology/final-human-validation-prompts)
- Phase 2 execution order:
  [Phase 2 Execution Roadmap](/projects/model-memory/phase-2-execution-roadmap)
- deep ingest interruption diagnosis:
  [Deep Ingest Interruption Root Cause](/projects/model-memory/deep-ingest-interruption-root-cause)
- projection architecture:
  [Workspace Projections And Bootstrap Files](/projects/model-memory/specs/workspace-projections-bootstrap-files)
- document access arbitration proposal:
  [Document Read And Ingest Arbitration](/projects/model-memory/specs/document-read-and-ingest-arbitration)
- memory migration inventory:
  [Memory Surface Inventory](/projects/workspace-topology/memory-surface-inventory)
- runtime bootstrap inventory:
  [Runtime Bootstrap File Inventory](/projects/workspace-topology/runtime-bootstrap-file-inventory)
- recovery backlog for lost or host-only operational surfaces:
  [Missing Functionality Recovery Audit](/projects/deployment-topology/missing-functionality-recovery-audit)
- strict recovery backlog:
  [Exhaustive Recovery Manifest](/projects/deployment-topology/exhaustive-recovery-manifest)
- canonized GitHub digest lane:
  [GitHub Automation](/projects/deployment-topology/github-automation)
- GitHub source repair proof:
  [GitHub Digest Source Repair](/projects/deployment-topology/github-digest-source-repair)
- tranche-1 proof and recovery lineage:
  [Tranche 1 Patch Lineage](/projects/deployment-topology/tranche-1-patch-lineage)
- specialist agent pack recovery:
  [Exhaustive Agent Pack Diff](/projects/agent-foundation/exhaustive-agent-pack-diff)
- human validation for restored memory-adjacent runtime behavior:
  [Push Validation Human Checklist](/projects/deployment-topology/push-validation-human-checklist)

## Current rule

- `docs/system/memory.md` is the durable workspace recall index
- detailed project content belongs in project workspaces, not in this file
- curated runtime-facing `MEMORY.md` remains a human-owned durable memory
  source, not a replacement for this durable recall index
- DB-backed generated memory projection and recall/pointer scaffolding must flow
  through separate runtime overlays or owning docs, not be materialized back
  into curated `MEMORY.md`
- active and queued project emphasis should follow
  `docs/system/registries/projects.yaml`, not ad hoc edits here
- DB-backed `model-memory` projections remain part of the architecture
- daily memory files remain official ingestion inputs and must not be treated as
  disposable residue
