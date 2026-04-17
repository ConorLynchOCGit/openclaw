---
summary: "Roadmap for the workspace-topology project."
title: "Workspace Topology Roadmap"
---

# Workspace Topology Roadmap

## Ordered phases

1. bootstrap the canonical `docs/system/` root
2. define registries and required pack rules
3. generalize the durable-vs-generated ownership contract
4. classify scattered project-like material across the repo
5. migrate scattered docs into canonical roots
6. verify project pack compliance for existing projects
7. add deterministic drift-check scripts
8. add runtime-sprawl prevention surfaces for repos, containers, and images
9. normalize roadmap pointers so project-like efforts point to real workspaces
10. hand off to [Agent Foundation](/projects/agent-foundation) once the
    topology layer is stable
11. align runtime bootstrap compatibility files with canonical durable sources
12. preserve DB-backed and daily memory layers while that alignment lands
13. keep the runtime assembler, registry, and default-gate enforcement aligned
    as later agent packs are introduced
14. continue migrating remaining runtime compatibility content toward canonical
    durable sources without creating a second truth system
15. after the current deep document-ingest pass, add canonical path resolution,
    runtime arbitration, and explicit read-versus-write ownership so
    repo-coupled orchestration stops depending on prompt-level path memory

## Cross-project dependency

This project should complete its structural slices before the major execution
phase of [Agent Foundation](/projects/agent-foundation).
