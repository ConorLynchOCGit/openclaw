---
summary: "Practical observability path for stuck builds, stale runtime drift, and continuity health."
title: "Runtime Observability And Drift"
---

# Runtime Observability And Drift

## Current practical signals

- `docker compose up -d --build --force-recreate openclaw-gateway`
- `curl -sf http://127.0.0.1:28789/readyz -D - -o /dev/null`
- `node scripts/check-runtime-build-fingerprint.mjs`
- `node scripts/check-daily-memory-continuity.mjs --json`
- `docker system df`

## What each signal answers

- build path moving or stuck
- gateway reachable or not
- live build stale or current
- same-day continuity healthy or missing
- image/build-cache churn expanding or not

## Important distinction

- a healthy container is not the same as a current container
- a rebuilt image is not the same as a recreated container
- a present daily-memory file is not the same as healthy same-day generation unless the check runs the same day
