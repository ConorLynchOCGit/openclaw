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

Workspace paths under `/root/.openclaw/workspace/projects/` now exist only as
runtime compatibility aliases or writable operator overlays that point back to
the canonical project registry.

That means:

- canonical project ownership lives in `docs/projects/*`
- the import-mounted repo copy is the authoritative runtime read surface when
  `/app` is stale
- workspace aliases may remain for compatibility, but they are not a second
  project registry
- only narrow writable overlays such as `projects/ops/generated_current/`
  should remain host-owned when runtime-generated artifacts require it

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
