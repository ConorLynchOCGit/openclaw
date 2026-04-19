---
summary: "Operational checks for detecting stale runtime images and stale gateway code."
title: "Runtime Image Drift Detection"
---

# Runtime Image Drift Detection

## Drift classes

- repo code newer than built image
- image newer than running container
- container running but not serving the expected build signature

## Current detection path

1. inspect local `dist/build-info.json`
2. recreate the runtime image and container through the compose runbook
3. run:

```bash
node scripts/check-runtime-build-fingerprint.mjs
```

## Required evidence

- local build signature
- live `X-OpenClaw-Build-Signature`
- live `X-OpenClaw-Version`
- optional live `X-OpenClaw-Commit`
