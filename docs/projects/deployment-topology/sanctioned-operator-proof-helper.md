---
summary: "Repo-backed non-browser helper for sanctioned operator proof against the live gateway."
title: "Sanctioned Operator Proof Helper"
---

# Sanctioned Operator Proof Helper

## Purpose

Give Codex a safe non-browser proof lane against the live gateway without
weakening the Tailnet-safe origin/auth posture.

## Canonical entrypoint

```bash
node scripts/operator-ui-proof.mjs --json
```

## What it proves

The helper uses repo-owned gateway surfaces rather than raw ad hoc probing. It
collects:

- `gateway probe` result
- `sessions.list` result
- `health` summary
- readiness/build-signature headers
- current allowed-origin config snapshot

## Current output highlights

The JSON report includes:

- approved origin(s) from config
- the probe target URLs being used
- build-signature/readiness headers
- session-list count
- codex/proof-row summary
- recent-session health summary

## What it can prove now

- whether the live gateway is reachable through the sanctioned proof path
- whether the current session selector payload still includes proof-like rows
- whether readiness/build-signature headers are live
- whether recent-session summaries disagree with session-list truth

## What it does not replace

This helper does not replace true browser validation for:

- stale row eviction in rendered selector state
- actual visible chat transcript behavior
- browser storage/hydration problems
- Tailnet-native UI automation

## Current reason it matters

This helper made the stale-row lane falsifiable. It showed that the four visible
rows still existed in live selector truth and were not only phantom browser
state.
