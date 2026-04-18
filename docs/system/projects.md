---
summary: "Pointer index for canonical project workspaces and project-pack rules."
title: "System Projects"
---

# System Projects

Canonical project workspaces live only under `docs/projects/`.

Registered top-level projects live directly under `docs/projects/<project-id>/`.
Project-owned nested workstreams may keep their own local packs under that
parent project when they remain owned by the parent and are not treated as
separate registry entries.

Workspace-native operator packs under `/root/.openclaw/workspace/projects/` are
allowed as a separate coordination layer, but they are not canonical project
workspaces and must never be registered as if they were `docs/projects/*`.

Use the project registry and the project index together:

- [Projects Index](/projects)
- [Project Registry](/system/registries/projects)
- [Workspace Topology Project Pack Compliance](/projects/workspace-topology/project-pack-compliance)

Required project base pack:

- `index.md`
- `STARTUP.md`
- `STATUS.md`
- `CURRENT_SLICE.md`
- `DECISIONS.md`
- `roadmap.md`
- `specs/index.md`

Allowed project status values:

- `active`
- `queued`
- `dormant`
- `archived`
- `superseded`
