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
- duplicate non-git product tree: `/root/services/openclaw-roles/dev`
- compatibility aliases:
  - `/root/services/openclaw`
  - `/root/services/openclaw-upgrade-2026.3.24`
- active container: `openclaw-runtime`
- stale sidecar container: `openclaw-cli`
- active image: `openclaw:local`
- live runtime still mounts both:
  - `product_live`
  - `product_dev`

## Target state

- canonical repo: `/root/services/openclaw-roles/live`
- canonical image: `openclaw:local`
- canonical runtime container: `openclaw-runtime`
- live compose only mounts the canonical live repo
- no `product_dev` curated import in the runtime workspace
- no `openclaw-cli` service or container
- no duplicate dev tree left on the host after validation
- no historical upgrade symlink left on the host after validation

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
2. Update the live repo compose file.
   - remove the `openclaw-cli` service
   - remove the `product_dev` bind mount
3. Update the runtime workspace metadata.
   - remove `product_dev` from the curated import manifest
   - remove `product_dev` references from the workspace index and AGENTS-facing docs
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
   - remove the stopped `openclaw-cli` container
   - remove the duplicate dev tree
   - remove the historical upgrade symlink
   - remove local repo-root checkpoint and compose-backup clutter
8. Disable stale legacy host cron/report jobs.
   - keep scripts on disk for now
   - remove the jobs from crontab so they stop depending on the deleted dev tree
9. Validate final state.
   - one canonical repo path left in active use
   - one running OpenClaw container
   - one OpenClaw image
   - no dev-tree dependency in compose or workspace imports

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

1. stopped `openclaw-cli` container
2. duplicate dev tree backup archive created successfully
3. duplicate dev tree removed
4. historical upgrade symlink removed
5. root checkpoint and compose-backup clutter removed

## Preservation of model-memory

The consolidation must preserve:

- live `model-memory` runtime wiring
- live `model-memory` database configuration
- live `model-memory` operator and proof docs in the canonical repo
- existing model-memory evidence artifacts in `docs/projects/model-memory/evidence/`

This migration is about removing shadow deployment surfaces, not about changing
the memory architecture again.
