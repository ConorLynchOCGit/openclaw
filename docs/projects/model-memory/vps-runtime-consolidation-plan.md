---
summary: "Safe migration plan from the current multi-surface VPS state to one canonical OpenClaw repo, image, and runtime container."
title: "VPS Runtime Consolidation Plan"
---

# VPS Runtime Consolidation Plan

## Goal

Converge the VPS onto one unambiguous OpenClaw deployment shape:

- one canonical repo path
- one canonical OpenClaw image
- one canonical OpenClaw runtime container
- no shadow dev-tree mount in the live runtime
- no stale CLI sidecar container on the active path

## Current state

- canonical git checkout: `/root/services/openclaw-roles/live`
- compatibility symlink: `/root/services/openclaw-roles/dev -> /root/services/openclaw-roles/live`
- no extra proof/debug git worktrees remain under `/tmp`
- active container: `openclaw-runtime`
- no stale OpenClaw sidecar container is currently running
- active image: `openclaw:local`
- live runtime mounts only:
  - `product_live`
- live compose still defines the stale `openclaw-cli` service

## Target state

- canonical repo: `/root/services/openclaw-roles/live`
- canonical image: `openclaw:local`
- canonical runtime container: `openclaw-runtime`
- live compose only mounts the canonical live repo
- no `product_dev` curated import in the runtime workspace
- no extra OpenClaw container on the live VPS
- no duplicate dev tree or detached proof worktree left on the host after validation
- no stale compatibility aliases beyond the intentional `dev -> live` symlink

## Safety posture

Before deleting anything:

1. confirm the active container is `openclaw-runtime` from the live compose root
2. keep the canonical live repo untouched and versioned
3. back up the duplicate dev tree into `/root/backups/`
4. update compose and runtime workspace metadata first
5. recreate only the canonical gateway container
6. verify health before pruning stale host surfaces

## Migration sequence

1. Record baseline inventory.
   - current repos/path aliases
   - current containers
   - current images
   - current runtime config
2. Keep the host runtime on the canonical container only.

- do not start `openclaw-cli`
- do not treat the generic compose-side CLI helper as a second live runtime

3. Update the runtime workspace metadata.

- confirm the runtime workspace still exposes only `product_live`
- remove stale pre-cleanup wording from operator docs

4. Rebuild and recreate the canonical gateway runtime.
   - use the live repo compose root only
   - verify the container is healthy
5. Verify post-recreate state.
   - `docker compose ps`
   - inspect the running container mounts
   - verify the runtime workspace no longer advertises `product_dev`
6. Back up the duplicate dev tree.
   - create a timestamped archive under `/root/backups/`
7. Prune stale surfaces.
   - remove host-local stale repo and runtime clutter
   - remove detached proof/debug git worktrees after they are no longer needed
   - only remove the generic `openclaw-cli` compose definition in a product-wide
     follow-up that also updates Docker docs and helper scripts
   - remove local repo-root checkpoint and compose-backup clutter
8. Disable stale legacy host cron/report jobs.
   - keep scripts on disk for now
   - remove the jobs from crontab so they stop depending on the deleted dev tree
9. Validate final state.
   - one canonical repo path left in active use
   - one running OpenClaw container
   - one OpenClaw image
   - no dev-tree dependency in active runtime mounts

## Rollback posture

This consolidation rollback is operational, not architectural.

If the cleanup breaks the runtime:

1. restore the live compose file from git
2. restore the runtime workspace metadata from the pre-cleanup backup
3. redeploy `openclaw-gateway` from the live repo
4. restore the archived dev tree from `/root/backups/` only if the runtime
   still depends on it unexpectedly

Rollback does not require keeping the duplicate dev tree mounted by default.

## Deletion order

Delete only after the recreated gateway is healthy:

1. duplicate dev tree backup archive created successfully
2. duplicate dev tree removed
3. stale compatibility aliases pruned as justified
4. root checkpoint and compose-backup clutter removed

## Current execution status

The VPS is already at the intended canonical deployment shape in active use:

- one canonical repo checkout
- one active OpenClaw image
- one active OpenClaw runtime container
- no remaining detached proof/debug worktrees under `/tmp`
- no remaining stale OpenClaw repo tree in active use
- stale temp test homes and Docker build cache have been pruned from the host

What remains intentionally in place:

- the compatibility symlink `dev -> live` until operator references no longer
  depend on it
- active supporting service containers (`pgvector`, `n8n`, `caddy`)
- rollback/archive material under `/root/backups`, including the retired dev
  tree backup

The remaining cleanup is now mostly operator-surface and host-hygiene work, not
multi-runtime migration.

## Preservation of model-memory

The consolidation must preserve:

- live `model-memory` runtime wiring
- live `model-memory` database configuration
- live `model-memory` operator and proof docs in the canonical repo
- existing model-memory evidence artifacts in `docs/projects/model-memory/evidence/`

This migration is about removing shadow deployment surfaces, not about changing
the memory architecture again.
