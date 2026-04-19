---
summary: "Low-overhead runtime assertions for critical deployment seams."
title: "Runtime Assertion Harnesses"
---

# Runtime Assertion Harnesses

## Purpose

Use lightweight runtime assertions for critical seams that do not need a full
Vitest shard spin-up every time.

## Current harnesses

### Build fingerprint

```bash
node scripts/check-runtime-build-fingerprint.mjs
```

Proves:

- local built artifact exists
- live gateway responds
- live gateway headers match the local build signature

### Daily continuity

```bash
node scripts/check-daily-memory-continuity.mjs --json
```

Proves:

- same-day continuity file exists
- the expected header exists
- canonical session append entries can be counted

### Auth path resolution

```bash
node scripts/check-auth-sources.mjs --provider openai-codex
```

Proves:

- the canonical auth-path register resolves
- the expected redacted storage paths are present

## Authority boundary

These harnesses do not replace focused tests. They exist to cheaply prove live
or host-coupled seams that previously failed silently.
