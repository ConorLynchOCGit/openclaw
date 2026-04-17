---
summary: "Repo-wide workspace, document-topology, registry, and drift-enforcement project."
title: "Workspace Topology"
---

# Workspace Topology

`workspace-topology` is the project for cleaning up OpenClaw's durable file
structure, centralizing project workspaces, and making documentation topology
deterministic and enforceable.

This project owns the repo-wide durable structure decisions:

- `docs/system/` as the global durable-doc root
- `docs/projects/` as the only canonical project workspace root
- `docs/agents/` as the durable human-owned agent workspace root
- `.agents/` as the machine-readable agent/runtime surface

This project also owns:

- migration of scattered project-like docs into canonical locations
- project and agent registries
- durable-vs-generated ownership policy
- drift-check scripts for topology and runtime-sprawl prevention
- project pack compliance normalization
- roadmap pointer-gap recording for future workspace creation
- runtime compatibility-file canonicalization from durable sources
- bootstrap-file registry activation and default-gate enforcement

## Project docs

1. [Startup](/projects/workspace-topology/STARTUP)
2. [Status](/projects/workspace-topology/STATUS)
3. [Current Slice](/projects/workspace-topology/CURRENT_SLICE)
4. [Decisions](/projects/workspace-topology/DECISIONS)
5. [Roadmap](/projects/workspace-topology/roadmap)
6. [Spec Index](/projects/workspace-topology/specs)
7. [Project Pack Compliance](/projects/workspace-topology/project-pack-compliance)
8. [Scattered Material Inventory](/projects/workspace-topology/scattered-material-inventory)
9. [Roadmap Pointer Gaps](/projects/workspace-topology/roadmap-pointer-gaps)
10. [Roadmap Surface Inventory](/projects/workspace-topology/roadmap-surface-inventory)
11. [Runtime Bootstrap File Inventory](/projects/workspace-topology/runtime-bootstrap-file-inventory)
12. [Memory Surface Inventory](/projects/workspace-topology/memory-surface-inventory)
13. [Bootstrap File Canonical Mapping](/projects/workspace-topology/specs/bootstrap-file-canonical-mapping)
14. [Bootstrap Pre-Render Seeding Plan](/projects/workspace-topology/bootstrap-pre-render-seeding-plan)
15. [Canonical Path Resolution And Runtime Arbitration](/projects/workspace-topology/specs/canonical-path-resolution-and-runtime-arbitration)

## Relationship to other projects

- This project goes first.
- [Agent Foundation](/projects/agent-foundation) depends on the doc topology
  and registry model defined here.
