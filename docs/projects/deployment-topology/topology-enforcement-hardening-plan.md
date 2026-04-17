---
summary: "Plan and first execution step for preventing future repo-container-image drift instead of only documenting it after the fact."
title: "Topology Enforcement Hardening Plan"
---

# Topology Enforcement Hardening Plan

## Current problem

The rescue program restored parity, but the deployment still relied mostly on
registries and audits. Hard prevention of future repo-to-container drift needed
one more concrete enforcement seam.

## Current evidence

- `docker-compose.yml` now has real `build:` stanzas
- `docs/projects/deployment-topology/repo-vs-container-project-adoption-audit.md`
  proved the project-workspace adoption path
- the runtime already exposes the canonical live repo through the
  `imports/product_live/content` bind mount
- there was no check that the runtime container still mounted that repo path
  correctly or that the tracked-file parity still held

## Chosen direction

- keep the existing topology registries and audits
- add a direct runtime import-mount check to the topology verification lane
- continue treating hardening as a deployment-topology responsibility rather
  than pushing it into agent content slices

## Bounded first execution step completed in this sprint

A new runtime hardening check now exists:

- `scripts/check-runtime-repo-import-mount.mjs`

It verifies:

1. `openclaw-runtime` has the canonical bind mount at
   `/home/node/.openclaw/workspace/imports/product_live/content`
2. that bind mount points at the current live repo checkout
3. the bind mount remains read-only
4. the tracked-file count in the runtime import mount matches the host repo

The check is now wired into `pnpm check:topology`.

## Next steps

1. decide whether mount-source mismatches should become a release or rollout
   gate as well
2. add an explicit image-vs-import visibility report if future drift recurs
3. consider a compose-level policy check for canonical import mounts

## Blocks agent work

No. This is now active hardening, not a pre-agent blocker.
