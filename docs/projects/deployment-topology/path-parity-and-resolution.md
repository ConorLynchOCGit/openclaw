---
summary: "Canonical path-resolution order for repo docs, imports, bundled skills, and baked /app paths."
title: "Path Parity And Resolution"
---

# Path Parity And Resolution

## Problem

Main-side ingest and skill execution had already failed because callers were
resolving different path surfaces:

- repo import mount
- baked `/app`
- workspace paths
- bundled skill prompt paths

## Canonical resolver

- `src/infra/repo-canonical-paths.ts`

## Resolution order for repo-owned canonical content

1. workspace import
   - `imports/product_live/content/...`
2. package root
   - live repo checkout fallback
3. explicit import path
4. baked `/app/...` normalized back to the repo-canonical logical path

## Bundled skill rule

If a skill comes from the bundled OpenClaw runtime surface, normalize prompt
paths back to the canonical repo-owned path:

- `/app/skills/<skill>/SKILL.md` -> `skills/<skill>/SKILL.md`

## Current proof surfaces

- `src/infra/repo-canonical-paths.test.ts`
- `src/agents/pi-tools.read.repo-canonical.test.ts`
