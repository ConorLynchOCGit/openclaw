# Host Structure Normalization Execution

Date: 2026-04-12

## Purpose

Record the concrete normalization changes made after the first-principles host
structure diagnosis, including what was normalized now, what was left in place,
and why.

## Exact Changes Made

### 1. Canonical workspace root hardened

The canonical live operator workspace remains:

- `/root/.openclaw/workspace`

This was hardened in the live workspace guidance:

- live workspace `AGENTS.md`
- live workspace `core/INDEX.md`
- live workspace `core/WORKSPACE_STRUCTURE.md`

These now explicitly state:

- `/root/.openclaw/workspace` is the canonical operator workspace root
- `/root/openclaw-workspace` is not the live canonical workspace

### 2. Alternate workspace root demoted to seed/template status

The separate repo at `/root/openclaw-workspace` was not removed, but it was
demoted explicitly to seed/bootstrap status via:

- `/root/openclaw-workspace/AGENTS.md`
- `/root/openclaw-workspace/BOOTSTRAP.md`
- `/root/openclaw-workspace/README.md`

The intent is now explicit:

- this repo is for seed/bootstrap/template structure
- active projects, imports, audits, and runbooks belong in the canonical live
  workspace instead

### 3. Explicit product repo role model normalized into physical worktree roots

Created role-owned host roots:

- `/root/services/openclaw-roles/live`
- `/root/services/openclaw-roles/dev`

These are now the actual product worktree directories:

- `/root/services/openclaw-roles/live` = live role worktree
- `/root/services/openclaw-roles/dev` = dev role worktree

The product split was verified to already be backed by Git worktrees of the
same repository before the move, and this tranche normalized the physical
directories to match those roles.

Added:

- `/root/services/openclaw-roles/README.md`

The historical paths now remain only as compatibility symlinks:

- `/root/services/openclaw` -> `/root/services/openclaw-roles/live`
- `/root/services/openclaw-upgrade-2026.3.24` -> `/root/services/openclaw-roles/dev`

This makes the role split explicit in the real filesystem rather than only
through an alias layer.

### 4. Canonical curated import names normalized to role-based names

The canonical curated product imports in the live workspace were renamed from
historical/function-mixed names to explicit role names:

- `imports/product_live/`
- `imports/product_dev/`
- `imports/config_dr/`

The manifest now treats those as the canonical curated imports.

### 5. Live/runtime mount destinations rolled to the canonical role imports

The active compose mounts were updated so the runtime now mounts directly to:

- `imports/product_live/content`
- `imports/product_dev/content`
- `imports/config_dr/content`

The source roots remain the real underlying worktree/config paths, while the
workspace-visible destinations now teach the normalized role model.

Implementation note:

- the role-owned roots under `/root/services/openclaw-roles/` are now the real
  bind-mount sources for the live runtime
- the workspace-side `imports/*/content` paths must remain plain directories so
  the child bind mounts attach correctly inside the container

### 6. Old compatibility import names pruned from the active workspace layer

After the runtime was verified green on the new destinations, the old
workspace import directories were removed:

- `imports/live_openclaw_stack/`
- `imports/engineering_repo/`

Those names are no longer part of the active workspace navigation model.

### 7. Runtime-state vs workspace boundary clarified

Added:

- `/root/.openclaw/README.md`

This documents the boundary:

- `/root/.openclaw` = runtime-state root
- `/root/.openclaw/workspace` = canonical live operator workspace root

The live workspace manifest and indexes were also updated so `runtime_state`
describes itself as the runtime-state root, not as a generic workspace stand-in.

### 8. Canonical workspace routing updated to the new product-dev import

Updated high-signal workspace routing surfaces to use `imports/product_dev` as
the canonical repo-coupled implementation entrypoint instead of
`imports/engineering_repo`.

This includes:

- live workspace `AGENTS.md`
- live workspace `memory/INDEX.md`
- live workspace `projects/memory/INDEX.md`
- live workspace `projects/maintenance/INDEX.md`
- live workspace import/index docs

### 9. Engineering-side source routing updated

Updated engineering repo Main-session source resolution, local compose guidance,
and the document-ingestion proof script to emit/use the normalized canonical
import name:

- `imports/product_dev/...`

instead of:

- `imports/engineering_repo/...`

This keeps runtime/source-selection logic aligned with the normalized workspace
structure.

## Current Normalized Target State

The structure is materially closer to the intended model:

- one canonical operator workspace root:
  - `/root/.openclaw/workspace`
- one runtime-state root:
  - `/root/.openclaw`
- explicit host-level product role roots:
  - `/root/services/openclaw-roles/live`
  - `/root/services/openclaw-roles/dev`
- explicit live/dev roles expressed by the actual product Git worktree paths
- canonical curated product imports:
  - `imports/product_live`
  - `imports/product_dev`
- active runtime/container mounts now target the canonical product import names
- old product import compatibility aliases removed from the active workspace
- historical product paths retained only as compatibility symlinks
- separate config/DR repo preserved

## Partial Steps vs Full Target

### Achieved now

- canonical workspace root made explicit
- alternate workspace repo demoted to seed/template status
- physical live/dev product worktree roots normalized under
  `/root/services/openclaw-roles/`
- historical product-root names demoted to compatibility symlinks
- canonical curated import names normalized to role-based names
- live/runtime mounts rolled to the canonical product import names
- old compatibility import names pruned from the active workspace
- runtime-state vs workspace boundary documented explicitly
- engineering-side source routing updated to canonical import names

### Not fully completed in this pass

- broader historical-name cleanup outside the normalized high-signal surfaces
  remains follow-on work

## What Remains For Follow-On Normalization

1. Continue repo-wide vocabulary cleanup so non-canonical historical names are
   reduced outside the highest-signal routing layer.
2. Normalize or retire generated/current-context docs that still mention the old
   import names where those files are intended to remain operator-facing.

## Why Residue Was Intentionally Left In Place

The remaining residue is mostly naming-oriented and historical:

- historical-name references still exist in older audits/generated artifacts
  that are no longer the canonical routing layer
- historical product-root symlinks remain in place for compatibility while
  operator/runtime surfaces transition cleanly

That residue is now edge-owned rather than still being the primary model.

## Bottom Line

This pass did not complete the entire first-principles target model, but it did
change the structure in substance:

- the canonical workspace root is now explicit
- the non-canonical workspace repo is explicitly demoted
- live/dev product roles now have explicit physical host roots backed by the
  existing worktrees
- curated product imports now have canonical role-based names
- the live runtime mounts now land on the canonical role-based import names
- the old compatibility import names were pruned from the active workspace
- the historical product-root names were demoted to compatibility symlinks
- runtime state and workspace are now explicitly distinguished

The system is materially closer to a first-principles structure than it was at
the start of the pass.
