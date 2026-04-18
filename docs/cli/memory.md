---
summary: "CLI reference for `openclaw memory` (status/index/search/promote/promote-explain/rem-harness)"
read_when:
  - You want to index or search semantic memory
  - You’re debugging memory availability or indexing
  - You want to promote recalled short-term memory into `MEMORY.md`
title: "memory"
---

# `openclaw memory`

This command family belongs to the **legacy memory plugin stack**.

After the `model-memory` production cutover, production config keeps:

- `plugins.slots.memory = "none"`
- `agents.defaults.memorySearch.enabled = false`

That means `openclaw memory ...` is no longer the live memory authority.

In the current live runtime:

- `model-memory` owns memory capture, retrieval, and context assembly
- `openclaw memory ...` is a compatibility or forensic/admin surface only
- disabled or unavailable results can be intentional

Related:

- Memory concept: [Memory](/concepts/memory)
- Memory wiki: [Memory Wiki](/plugins/memory-wiki)
- Wiki CLI: [wiki](/cli/wiki)
- Plugins: [Plugins](/tools/plugin)

## What to use instead

For the live memory system, use:

- [Model Memory](/projects/model-memory)
- [Model Memory Status](/projects/model-memory/STATUS)
- [Deep Ingest Verification Plan](/projects/model-memory/deep-ingest-verification-plan)
- [Legacy Retirement Proof](/projects/model-memory/final-legacy-retirement-proof)

## Current posture

If you run `openclaw memory ...` on the live production profile, one of these is
expected:

- the command reports disabled legacy memory surfaces
- the command exposes compatibility/admin information only
- the command is eventually removed as the retirement tranche completes

## Retirement note

This page now exists mainly so operators do not mistake the legacy CLI for the
current memory system.

The canonical live architecture is documented under
[Model Memory](/projects/model-memory), and the legacy CLI is part of the
retirement/deletion tranche tracked in
[Legacy Memory Retirement Execution](/projects/model-memory/legacy-memory-retirement-execution).
