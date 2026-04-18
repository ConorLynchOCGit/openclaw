---
summary: "Contract for canonical repo project workspaces versus workspace-native operator project packs."
title: "Runtime Project Surfaces"
---

# Runtime Project Surfaces

OpenClaw currently sees two different project trees in the live environment.
They are not equivalent, and they should not be treated as competing canonical
sources.

## Canonical repo project workspaces

Authoritative engineering project workspaces live under:

- `docs/projects/<project-id>/` in the live repo
- `/app/docs/projects/<project-id>/` when baked into the runtime image
- `/home/node/.openclaw/workspace/imports/product_live/content/docs/projects/<project-id>/`
  through the canonical repo import mount

These surfaces are the only canonical implementation project workspaces.

They currently include:

- `agent-foundation`
- `deployment-topology`
- `intake-routing`
- `maintenance`
- `model-memory`
- `qa-program`
- `skills-system`
- `turborepo`
- `workspace-topology`

## Workspace-native operator project packs

The live workspace also has operator-owned project packs under:

- `/root/.openclaw/workspace/projects/` on the host
- `/home/node/.openclaw/workspace/projects/` in the runtime container

These are **not** canonical engineering project workspaces. They are a
workspace-native coordination layer for operator guidance, host-local runbooks,
historical patch families, and runtime-adjacent pointers.

Current workspace-native operator packs:

- `build-performance`
- `channel_identity`
- `github`
- `intake`
- `live_app_patches`
- `maintenance`
- `memory`
- `ops`
- `roles`
- `web_stack`
- `workflows`

## Ownership rule

When these two layers overlap, ownership is determined by function, not by path
coincidence.

| Surface type                                                                                   | Authoritative home           |
| ---------------------------------------------------------------------------------------------- | ---------------------------- |
| implementation architecture, product rollout status, canonical project specs                   | repo-owned `docs/projects/*` |
| workspace re-entry, operator runbooks, host-local generated context, historical patch families | workspace `projects/*`       |

Examples:

- `docs/projects/model-memory/` is the canonical implementation project
  workspace.
- `workspace/projects/memory/` is an operator coordination pack that points
  back to the canonical repo project.
- `docs/projects/maintenance/` owns the maintained engineering project.
- `workspace/projects/maintenance/` remains an operator-facing coordination pack
  for local maintenance process material.

## Resolution rule inside OpenClaw

1. If a task is asking about implementation truth, prefer canonical repo
   project surfaces.
2. If a task is asking about workspace coordination or host-local operational
   context, prefer workspace project packs.
3. If a task is mixed, read repo-owned project docs for implementation facts and
   workspace packs only as supporting context.
4. Never answer implementation questions from `workspace/projects/*` alone when
   a canonical repo project exists for the same domain.

## Runtime visibility rule

OpenClaw should be able to reach canonical repo projects through either:

- baked `/app/docs/projects/*` content, or
- the canonical repo import mount under
  `/home/node/.openclaw/workspace/imports/product_live/content/docs/projects/*`

If `/app` is stale but the canonical import mount is current, the import mount
still carries implementation truth. That is a build-freshness problem, not a
project-ownership ambiguity.

## Workspace project-pack normalization

Workspace-native operator packs should follow a lightweight pack shape so they
remain predictable for agents:

- `INDEX.md`
- `STARTUP.md`
- `STATUS.md`
- `CURRENT_SLICE.md`
- `DECISIONS.md`
- `roadmap.md`
- `specs/INDEX.md`

This mirrors the canonical repo pack enough for navigation consistency while
still remaining a workspace-owned coordination layer rather than a registered
repo project.

## Current adoption decision

The correct reconciliation is:

- keep `docs/projects/*` as the only canonical project registry
- keep `workspace/projects/*` as a distinct operator project-pack layer
- normalize the workspace packs so they are structurally legible
- route overlapping domains like `memory` and `maintenance` back to their
  canonical repo project homes for implementation truth
