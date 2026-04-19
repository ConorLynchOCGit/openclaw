---
summary: "Baseline for restoring memory-md bootstrap semantics after the curated MEMORY.md ownership split."
title: "Memory Bootstrap Semantics Restoration Baseline 2026-04"
---

# Memory Bootstrap Semantics Restoration Baseline 2026-04

## Repo baseline

- git root confirmed:
  - `/root/services/openclaw-roles/live`
- baseline commit at start of pass:
  - `2052f7af32609f0764cb26a9418cd88b24ae5eab`
- `origin/main...HEAD` at start:
  - `0 0`

## Current workspace memory truth

- curated workspace file reviewed:
  - `/root/.openclaw/workspace/MEMORY.md`
- current file is structurally clean again:
  - `# MEMORY.md` begins at line `1`
  - `## Long-Term Context` begins at line `3`
- generated standing-context and recall-index scaffolding are no longer present
  in the curated workspace file

## Current implementation truth

### What is clean now

- `src/agents/bootstrap-files.ts` resolves workspace bootstrap files and then
  appends `modelMemoryOverlay.contextFiles`
- `src/agents/bootstrap-canonicalization.ts` no longer writes generated
  standing-context or recall scaffolding back into curated `MEMORY.md`
- current curated workspace `MEMORY.md` is therefore human-owned again

### What is at risk now

- `src/agents/model-memory.live-runtime.ts` still compiles workspace
  projections, including `memory-md`
- `extensions/model-memory/src/runtime/projections/targets.ts` still defines
  `memory-md` as a valid projection target
- `extensions/model-memory/src/runtime/projections/render-memory-md.ts` still
  renders the standing-context and procedures packet for that target
- but the live runtime overlay currently exposes only context artifacts under
  `modelMemoryOverlay.contextFiles`
- those context artifacts currently come from:
  - `user_memory_pack`
  - `project_memory_pack`
  - `procedure_memory_pack`
  - `session_summary_pack`

## Starting contradiction

- curated `MEMORY.md` ownership is now cleaner and more defensible
- but compiled `memory-md` bootstrap semantics may have been lost from the
  actual injected runtime context
- the repo therefore risks being cleaner on disk while being weaker at startup
  grounding

## Starting doc contradiction

Several model-memory docs still describe the older generated-zone contract as if
it were the live implementation:

- `docs/projects/model-memory/specs/workspace-projections-bootstrap-files.md`
- `docs/projects/model-memory/continuity-preservation-and-retirement.md`
- `docs/projects/model-memory/DECISIONS.md`
- `docs/projects/model-memory/roadmap.md`

The implementation now needs to converge on one clear live contract:

1. curated `MEMORY.md` stays human-owned
2. compiled `memory-md` remains a valid projection target
3. compiled `memory-md` reaches bootstrap context through a separate generated
   runtime artifact path instead of by mutating the workspace file
