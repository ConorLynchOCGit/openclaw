---
summary: "Implementation contract for curated MEMORY.md ownership, generated overlays, and runtime bootstrap injection."
title: "Memory Bootstrap Ownership Contract"
---

# Memory Bootstrap Ownership Contract

## Contract

`MEMORY.md` is now a curated human-owned durable memory surface again.

It is no longer the place where runtime-generated standing context, recall
indexes, or DB-backed memory projections are assembled back onto disk.

## Ownership split

### Curated `MEMORY.md`

This file owns:

- durable user/operator preferences
- infrastructure posture
- workflow principles
- operating-model boundaries
- long-term lessons and cautions

Editing boundary:

- human-owned
- promoted from durable lessons
- intentionally concise

### `docs/system/memory.md`

This file owns:

- workspace recall routing
- active and queued project pointers
- scheduled-flow routing
- runtime memory-layer inventory

Editing boundary:

- durable docs owner
- not bootstrap-generated

### DB-backed `model-memory` overlay

This runtime surface owns:

- generated memory projection artifacts
- retrieval/context overlay inputs
- runtime-only generated memory packets

Editing boundary:

- runtime-generated
- not written back into curated `MEMORY.md`

## Runtime injection contract

Default bootstrap memory grounding now comes from separate layers:

1. curated workspace `MEMORY.md`
2. separate compiled `memory-md` bootstrap projection artifact path under
   `.openclaw/model-memory/projections/*`
3. separate DB-backed `model-memory` runtime overlay context files
4. recall/index docs in their owning durable docs, not in curated memory

Implementation rule:

- bootstrap canonicalization may clean generated compatibility zones out of
  `MEMORY.md`
- bootstrap canonicalization must not add generated compatibility zones back
  into `MEMORY.md`
- generated recall scaffolding belongs in separate docs/overlays, not in the
  curated file
- compiled `memory-md` projection output may still reach bootstrap context, but
  only as a separate generated runtime artifact rather than an on-disk
  `MEMORY.md` rewrite

## Cache rule

Session-scoped bootstrap snapshots must not be authoritative over freshly
canonicalized bootstrap files.

Current rule:

- canonicalized files win by bootstrap filename for the current run
- this prevents a stale cached `MEMORY.md` snapshot from surviving after the
  ownership split has already been materialized to disk

## Regression guardrails

The following are regressions:

- generated `model-memory` standing-context blocks reappearing in curated
  `MEMORY.md`
- generated recall-index scaffolding reappearing in curated `MEMORY.md`
- compiled memory-digest blocks being treated as curated durable memory
- bootstrap cache serving an older mixed-purpose `MEMORY.md` after
  canonicalization

## Budget posture

Budget policy remains:

- split by ownership first
- only consider modest bootstrap-budget increases after the curated file is
  clean and measured

Current landing posture:

- no budget increase was required to make the curated file fit cleanly
- the structural ownership split is the primary fix
