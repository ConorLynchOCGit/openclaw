---
title: "Memory Overview"
summary: "How OpenClaw remembers things across sessions"
read_when:
  - You want to understand how memory works
  - You want to know what memory files to write
---

# Memory Overview

The current live OpenClaw memory runtime is **model-memory**, not the older
markdown-plus-memory-search stack.

Production cutover posture:

- `plugins.entries.model-memory.enabled = true`
- `plugins.entries.model-memory.config.live.enabled = true`
- `plugins.slots.memory = "none"`
- `agents.defaults.memorySearch.enabled = false`

## What is authoritative now

`model-memory` is the only active memory authority for:

- capture
- retrieval
- context injection
- projections
- packet assembly

The canonical project docs live under
[Model Memory](/projects/model-memory).

Start with:

- [Model Memory](/projects/model-memory)
- [Model Memory Status](/projects/model-memory/STATUS)
- [Legacy Retirement Proof](/projects/model-memory/final-legacy-retirement-proof)
- [Continuity Preservation And Retirement](/projects/model-memory/continuity-preservation-and-retirement)

## What still exists but is not authority

Some continuity files still exist in the workspace, but they are no longer the
runtime authority for memory retrieval:

- `MEMORY.md`
- `memory/YYYY-MM-DD.md`
- `USER.md`

These now fall into three categories:

- human-owned continuity
- projection or bootstrap surfaces
- migration/export surfaces retained during retirement

They must not be confused with the active memory database and runtime read
models.

## Legacy stack status

The older stack built around:

- `memory_search`
- `memory_get`
- `memory-core`
- `memory-lancedb`
- markdown continuity as primary authority

is in active retirement.

Some legacy code and docs still exist in the repo for deletion-tranche work,
but they are not the canonical live architecture.

## Use this page for one thing

Use this page only to understand the current boundary:

- live runtime memory = `model-memory`
- workspace markdown continuity = preserved continuity, not active authority
- legacy memory plugin stack = retirement debt

## Further reading

- [Model Memory](/projects/model-memory)
- [Model Memory Specs](/projects/model-memory/specs)
- [Legacy Memory Retirement Execution](/projects/model-memory/legacy-memory-retirement-execution)
- [Legacy Retirement Proof](/projects/model-memory/final-legacy-retirement-proof)
- [USER.md And Projected Context Contract](/projects/model-memory/user-md-and-projected-context-contract)
