---
summary: "Contract for canonical repo project workspaces and the remaining workspace compatibility aliases."
title: "Runtime Project Surfaces"
---

# Runtime Project Surfaces

OpenClaw may still see both `docs/projects/*` and `workspace/projects/*` paths
in the live environment, but they no longer represent two competing project
registries.

## Canonical repo project workspaces

Authoritative engineering project workspaces live under:

- `docs/projects/<project-id>/` in the live repo
- `/app/docs/projects/<project-id>/` when baked into the runtime image
- `/home/node/.openclaw/workspace/imports/product_live/content/docs/projects/<project-id>/`
  through the canonical repo import mount

These surfaces are the only canonical project workspaces.

They currently include:

- `agent-foundation`
- `build-performance`
- `channel-identity`
- `deployment-topology`
- `github`
- `intake-routing`
- `live-app-patches`
- `maintenance`
- `model-memory`
- `operator-experience`
- `ops`
- `qa-program`
- `roles`
- `skills-system`
- `turborepo`
- `web-stack`
- `workflows`
- `workspace-topology`

## Workspace compatibility aliases

The live workspace still exposes project paths under:

- `/root/.openclaw/workspace/projects/` on the host
- `/home/node/.openclaw/workspace/projects/` in the runtime container

Most of these paths should now be import-backed compatibility aliases that
resolve to the canonical repo project workspace. They exist to preserve older
runbook paths, agent instructions, and operational habits while the system
converges on a single canonical tree.

Canonical alias mappings:

| Workspace compatibility path | Canonical project workspace       |
| ---------------------------- | --------------------------------- |
| `projects/build-performance` | `docs/projects/build-performance` |
| `projects/channel_identity`  | `docs/projects/channel-identity`  |
| `projects/github`            | `docs/projects/github`            |
| `projects/intake`            | `docs/projects/intake-routing`    |
| `projects/live_app_patches`  | `docs/projects/live-app-patches`  |
| `projects/maintenance`       | `docs/projects/maintenance`       |
| `projects/memory`            | `docs/projects/model-memory`      |
| `projects/roles`             | `docs/projects/roles`             |
| `projects/web_stack`         | `docs/projects/web-stack`         |
| `projects/workflows`         | `docs/projects/workflows`         |

## The justified writable exception

`projects/ops/` remains a real workspace-owned compatibility surface because it
still needs writable runtime state for `generated_current/` and a stable host
path for long-lived cron/report entry points.

Even there, the project definition and durable operator docs belong to
`docs/projects/ops/`, while the workspace path should increasingly act as a
thin compatibility wrapper over committed repo assets plus writable generated
artifacts.

## Ownership rule

Ownership is now determined by source-of-truth function:

| Surface type                                                                 | Authoritative home                                                           |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| project docs, startup/status/current-slice packs, specs, decisions, roadmaps | repo-owned `docs/projects/*`                                                 |
| repo-owned runnable bundled skills                                           | repo-owned `skills/*`                                                        |
| committed automation assets, schemas, workflows, helper scripts              | repo-owned `ops/*`, `scripts/*`, and related code paths                      |
| runtime-generated current artifacts                                          | workspace-owned writable locations such as `projects/ops/generated_current/` |
| compatibility aliases for old runbook paths                                  | `workspace/projects/*` pointing back to canonical repo surfaces              |

Skills-specific implication:

- `docs/projects/skills-system/*` owns policy, specs, reports, and roadmap
  truth
- `skills/*` owns repo-bundled runnable skill packages
- workspace and user skill roots own scoped overlays or generated packages only
  within the destination authority rules defined by the Skills System project

## Resolution rule inside OpenClaw

1. If a task is asking about implementation truth, prefer canonical repo
   project surfaces.
2. If a task is asking about legacy workspace `projects/*` paths, resolve them
   through the canonical alias target first.
3. If a task is mixed, read repo-owned project docs for implementation facts and
   workspace overlays only as supporting context.
4. Only treat a workspace path as authoritative when it is the explicit
   runtime-generated writable surface by contract.

## Runtime visibility rule

OpenClaw should be able to reach canonical repo projects through either:

- baked `/app/docs/projects/*` content, or
- the canonical repo import mount under
  `/home/node/.openclaw/workspace/imports/product_live/content/docs/projects/*`

If `/app` is stale but the canonical import mount is current, the import mount
still carries implementation truth. That is a build-freshness problem, not a
project-ownership ambiguity.

## Compatibility normalization rule

Compatibility aliases should preserve enough shape that older runbooks remain
legible:

- `INDEX.md`
- `STARTUP.md`
- `STATUS.md`
- `CURRENT_SLICE.md`
- `DECISIONS.md`
- `roadmap.md`
- `specs/INDEX.md`

In practice, the preferred runtime posture is:

- one canonical project tree in `docs/projects/*`
- import-backed compatibility aliases for older workspace project names
- one narrow writable `ops` compatibility surface where generated artifacts
  still need host ownership
