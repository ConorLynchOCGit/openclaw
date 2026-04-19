---
summary: "Safe posture for Docker image/cache cleanup, stale-image detection, and build-cache control."
title: "Docker Image And Cache Hygiene"
---

# Docker Image And Cache Hygiene

## Observed baseline

At this sprint baseline, Docker reported large reclaimable image/build-cache
volume.

Key facts observed:

- image storage was heavily reclaimable
- build cache was materially large
- no dangling images were the main problem
- the bigger issue was long-lived build cache and stale runtime drift

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

## Hygiene rule

Do not treat cache cleanup as rollout proof.

Cleanup reduces disk churn; it does not prove the gateway is serving the new
build.
