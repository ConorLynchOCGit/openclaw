---
summary: "Current ordered build-plan pointer surface for cross-project execution sequencing."
title: "System Build Plan"
---

# System Build Plan

This is the current ordered execution view across registered projects.

## Current order

1. [Workspace Topology](/projects/workspace-topology)
   because it defines the canonical roots, registries, and drift checks.
2. [Agent Foundation](/projects/agent-foundation)
   because agent durable packs depend on the topology and registry model.
3. [Model Memory](/projects/model-memory)
   because the system is already live and now sits in operational follow-through.
4. [Turborepo](/projects/turborepo)
   because package-graph work should follow the structural cleanup instead of
   racing ahead of it.

## Build-plan rule

- global ordering lives here
- detailed implementation sequencing lives in each project workspace
