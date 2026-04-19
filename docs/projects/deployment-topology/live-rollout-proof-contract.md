---
summary: "Contract separating local code, built image, running container, and live gateway behavior."
title: "Live Rollout Proof Contract"
---

# Live Rollout Proof Contract

## Purpose

Stop declaring runtime-facing work complete from repo-local proof alone.

## Required stages

1. Repo proof
   - confirm the intended code is present in the live checkout
2. Local validation proof
   - run the narrowest tests or runtime assertions for the changed seam
3. Build proof
   - rebuild the runtime image from the intended tree
   - refresh `dist/build-info.json`
4. Container proof
   - recreate the live runtime container from the rebuilt image
5. Live behavior proof
   - query the gateway probe surface and confirm the running build fingerprint
   - verify the user-visible behavior that motivated the change

## Canonical machine proof command

```bash
node scripts/check-runtime-build-fingerprint.mjs
```

This command compares:

- local `dist/build-info.json`
- live gateway `X-OpenClaw-Build-Signature` probe header

## Probe rule

Use `/readyz` as the machine-usable rollout proof surface.

- local or authenticated detailed `/ready` may expose structured build payload
- `/readyz` must always expose at least the build-signature headers

## Anti-patterns

- do not treat “the code is in git status” as rollout proof
- do not treat a successful local unit test as live proof
- do not treat a rebuilt image as live proof if the container was not recreated
