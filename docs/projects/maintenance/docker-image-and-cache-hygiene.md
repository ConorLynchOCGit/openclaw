---
summary: "Safe posture for Docker image/cache cleanup, stale-image detection, and build-cache control."
title: "Docker Image And Cache Hygiene"
---

# Docker Image And Cache Hygiene

## Observed baseline

At this sprint baseline, Docker reported large reclaimable image/build-cache
volume. The 2026-04-21 cleanup found the same pattern had regressed: repeated
live gateway builds were accumulating BuildKit cache faster than scheduled
cleanup reclaimed it.

Key facts observed:

- live host disk before the fresh cleanup: `237G` used / `150G` free
- fresh measured build-cache pressure: `197.5GB`
- `/var/lib` was the top filesystem consumer at `195G`
- dangling images/volumes/networks were not the main problem
- the bigger issue was repeated BuildKit cache accumulation from rebuild churn
- current live image `openclaw:local` and rollback image
  `openclaw:rollback-memory-soak-20260421T175907Z` were preserved

## Safe cleanup posture

Safe first:

- inspect `docker system df`
- inspect `docker image ls`
- inspect the running container image id

Safe cleanup candidates:

- old builder cache not tied to the running container
- stale images no longer referenced by any container

Unsafe to do blindly:

- broad image deletion without checking running-container references
- anything that would break the current Tailnet-safe runtime path

## Repo-backed cleanup path

This repo now owns a bounded cleanup path:

- dry-run:
  - `bash scripts/docker/hygiene.sh`
- apply:
  - `bash scripts/docker/hygiene.sh --apply`
- sanctioned rebuild path:
  - `bash scripts/docker/rebuild-gateway.sh`

The hygiene script removes only:

- dangling anonymous volumes
- dangling images
- unused non-default networks
- unused BuildKit cache

Current default cache policy:

- prune unused cache older than `2h`
- retain only `25GB` of reserved unused cache

Host scheduled hygiene policy:

- daily disk maintenance and weekly Docker cleanup prune BuildKit cache older
  than `24h`
- both retain `25GB` reserved BuildKit cache
- the retention and reserved-space settings are environment-overridable:
  - `BUILDKIT_RETENTION_HOURS`
  - `BUILDKIT_RESERVED_SPACE`

## Observed cleanup result

Observed in this pass:

- earlier cleanup:
  - filesystem: `182G` used / `206G` free
  - build cache: `141.3GB`
- earlier after bounded cleanup:
  - filesystem: `120G` used / `267G` free
  - build cache: `74.86GB`

That reclaimed roughly `62G` of disk while leaving the live runtime healthy.

Fresh 2026-04-21 cleanup:

- before cleanup:
  - filesystem: `237G` used / `150G` free
  - build cache: `197.5GB`
- action:
  - `docker builder prune --force --filter until=24h --reserved-space 25GB`
  - `docker image prune --force`
- after cleanup:
  - filesystem: `184G` used / `203G` free
  - build cache: `140.1GB`
- reclaimed:
  - BuildKit prune reported `57.34GB`
  - dangling image prune reported `0B`

Regression diagnosis:

- scheduled host cleanup still used a `168h` BuildKit retention window
- scheduled build/runtime hygiene reporting was also calling missing repo
  scripts, so the report path was failing instead of reliably surfacing bloat
- the repair restores repo-local inventory/verification scripts and tightens
  scheduled BuildKit cleanup to a configurable `24h` retention with
  `25GB` reserved-space protection

## Hygiene rule

Do not treat cache cleanup as rollout proof.

Cleanup reduces disk churn; it does not prove the gateway is serving the new
build.

## Rebuild protocol

Normal live rebuilds should no longer be done as an undocumented bare compose
habit.

Preferred protocol:

1. run `bash scripts/docker/rebuild-gateway.sh`
2. let it rebuild and recreate `openclaw-gateway`
3. wait for `http://127.0.0.1:28789/healthz`
4. let the bounded hygiene pass prune stale BuildKit residue
5. then run the separate rollout-proof checks

That keeps disk pressure bounded without confusing hygiene with runtime proof.
