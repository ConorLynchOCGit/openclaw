---
summary: "Baseline for the MEMORY.md ownership split and runtime bootstrap cleanup landing."
title: "Memory Bootstrap Ownership Split Baseline 2026-04"
---

# Memory Bootstrap Ownership Split Baseline 2026-04

## Repo baseline

- repo root confirmed: `/root/services/openclaw-roles/live`
- branch: `main`
- starting `HEAD` for this pass:
  - `a743cc82d2b9c2b00aa6b179ff3261ac1a888878`
- ahead/behind versus `origin/main` at pass start:
  - `0 / 0`

## Starting MEMORY.md truth

- canonical workspace file reviewed:
  - `/root/.openclaw/workspace/MEMORY.md`
- raw size at the start of this pass:
  - `57,288` characters
- structural start points at the start of this pass:
  - generated `model-memory` block at line `1`
  - generated `openclaw-canonical` block at line `190`
  - human-curated `# MEMORY.md` did not begin until line `304`
  - `## Long-Term Context` did not begin until line `306`
- exact contradiction at pass start:
  - the bootstrap warning seam had already been corrected
  - but the canonical workspace `MEMORY.md` was still structurally mixed-purpose
  - generated standing context, recall index, and memory-digest material were
    still living ahead of the curated durable memory body

## Runtime seam confirmed

- the mixed ownership was not just a stale workspace file
- `src/agents/bootstrap-canonicalization.ts` was still materializing generated
  `model-memory` and `openclaw-canonical` zones back into workspace
  `MEMORY.md`
- `src/agents/bootstrap-files.ts` could still reuse a stale session-scoped
  bootstrap snapshot after canonicalization unless fresh files were explicitly
  overlaid by name

## Vitest baseline

- current targeted Vitest symptom already reproduced before this landing:
  - focused runs paid more in setup/environment/import than in assertions for
    tiny seams
- concrete example already established:
  - `timeout 90s pnpm exec vitest run ui/src/ui/views/sessions.test.ts --reporter=verbose`
  - about `1.20s` total
  - largest component was environment/setup rather than assertion work
- repo-owned profiling helpers already present:
  - `scripts/run-vitest-profile.mjs`
  - `scripts/test-hotspots.mjs`
  - `scripts/test-unit-fast-audit.mjs`

## Landing target

This pass therefore needed to do four exact things:

1. stop writing generated bootstrap scaffolding back into curated `MEMORY.md`
2. make current runs use freshly canonicalized bootstrap files even when a
   session snapshot already existed
3. restore the live workspace `MEMORY.md` to curated durable content only
4. land one lightweight non-Vitest proof lane for the narrow bootstrap-memory
   seam before re-profiling Vitest
