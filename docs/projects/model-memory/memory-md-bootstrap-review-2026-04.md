---
summary: "Concrete review of what the canonical non-generated MEMORY.md is injecting into bootstrap, why it is truncating, and what should stay versus move."
title: "MEMORY.md Bootstrap Review 2026-04"
---

# MEMORY.md Bootstrap Review 2026-04

## Before the ownership split

- canonical file reviewed: `/root/.openclaw/workspace/MEMORY.md`
- prior raw size from the earlier review:
  - `53,348` characters
- prior normalized injected size in the live runtime after generated-block
  stripping:
  - `21,580` characters
- prior live truth after the 2026-04-19 bootstrap-report fix:
  - fresh `/new` no longer shows `[Bootstrap truncation warning]`
  - the previous warning was a false positive caused by comparing injected
    normalized content against the full on-disk file

The important point is still structural, not cosmetic: the file being injected
by default is doing two jobs at once, even though the warning seam itself is
now fixed.

## What the file contained before the split

Section start points from the reviewed file:

- generated `model-memory` block starts at the first `# MEMORY.md` on line `1`
- generated standing context starts at `## Standing Context` on line `4`
- generated procedures start at line `146`
- generated `openclaw-canonical` block starts at line `154`
- human-curated durable content does not start until the second `# MEMORY.md`
  on line `268`
- human-curated durable memory begins at `## Long-Term Context` on line `270`

That meant the first ~267 lines were generated runtime scaffolding before the
human-curated long-term memory even begins.

## Landed state after the split

Current landed measurements:

- current raw size:
  - `21,353` characters
- current normalized injected size:
  - `21,352` characters
- current structural start points:
  - `# MEMORY.md` starts on line `1`
  - `## Long-Term Context` starts on line `3`
- generated standing-context blocks, recall-index scaffolding, and compiled
  digest material are no longer present in the curated file

The structural ownership problem is now materially improved:

- curated durable memory is now the file body
- generated recall/index material is no longer mixed into the on-disk curated
  memory surface
- the file now fits the default per-file bootstrap budget without requiring a
  budget increase

## Categories currently present

### Keep in curated MEMORY.md by default

These are the parts that are actually doing durable memory work:

- user/operator preferences and durable collaboration style
- stable infrastructure posture
- durable workflow principles
- operating-model boundaries
- roadmap-adjacent durable cautions
- durable lessons from prior phases

Concrete examples from the current file:

- `### User`
- `### Infrastructure Principles`
- `### Workflow Principles`
- `### Operating Model`
- `## Phase 9 — Scheduled Operator Surfaces`
- `## Durable Architecture Lessons — Model Policy`

### Move out of curated MEMORY.md default bootstrap ownership

These sections are real information, but they are not good default long-term
memory content:

- generated `model-memory` standing-context block
- giant generated standing-context bullet floods
- config/API/test command reference bullets
- generated canonical path pointers
- workspace recall index duplication
- user-facing scheduled-flow indexes
- generated compiled memory projection footer

Concrete examples from the current file:

- the first generated `# MEMORY.md` block
- `## Standing Context`
- `## Procedures`
- `## Canonical Durable Sources`
- `## Workspace Recall Index`
- `## User-Facing Scheduled Flows`
- `## Generated Memory Pointers`
- `## Compiled Memory Digest`

These belong in one of:

- generated bootstrap overlays
- pointer/index artifacts
- runbooks
- project docs

## What was explicitly wrong

One human-curated line was plainly wrong for default bootstrap:

- the curated `### User` section previously retained the stale test token
  `saffron-orbit-17`

That has now been removed from curated long-term memory and replaced with a
rule:

- do not retain ephemeral prompt-test tokens in curated long-term memory by
  default

This matters because stale test tokens in curated bootstrap memory can directly
contaminate later retrieval prompts.

## What was fixed

The warning seam had already been fixed in code:

- the bootstrap report now measures normalized injected content rather than the
  full raw file
- generated-block stripping is no longer misreported as truncation
- the live runtime now reports `MEMORY.md` accurately and does not show the old
  false warning on fresh `/new`

This landing adds the structural fix:

- `src/agents/bootstrap-canonicalization.ts` no longer writes generated
  `model-memory` or `openclaw-canonical` zones back into `MEMORY.md`
- `src/agents/bootstrap-files.ts` now overlays freshly canonicalized bootstrap
  files over any stale session-scoped bootstrap snapshot by filename
- the live workspace `/root/.openclaw/workspace/MEMORY.md` has been restored to
  curated durable content only

## Exact runtime/bootstrap result

After the landing:

- curated `MEMORY.md` stays curated on disk
- compiled `memory-md` projection now reaches bootstrap context as a separate
  generated artifact under `.openclaw/model-memory/projections/*`
- DB-backed generated memory remains available through the separate live
  `model-memory` bootstrap overlay path
- recall/index routing remains owned by `docs/system/memory.md`
- current runs no longer depend on stale cached bootstrap snapshots to discover
  the cleaned memory surface

## Why the file was pressure-prone

The earlier warning was not just a budget problem.

Primary cause:

- generated standing-context content is crowding out the actual human-curated
  durable memory

Secondary cause before the split:

- the current bootstrap path still pointed at one mixed-purpose file whose raw
  content was much larger than the actually useful curated payload

The landed diagnosis is therefore:

- content shape was wrong
- the warning seam was already fixed
- the ownership split, not a budget increase, was the correct primary fix

## Recommended default posture

### Keep

- curated human-owned durable memory
- stable user/operator preferences
- infrastructure and workflow principles
- durable lessons and cautions

### Move or derive

- generated standing context
- generated pointer/index sections
- runbook-style procedure bullets
- test command inventories
- large generated recall indexes

### Bootstrap policy recommendation

Recommended primary fix:

- derive or preserve a slimmer bootstrap-facing memory surface by ownership
  instead of injecting the previous catch-all `MEMORY.md` wholesale

Recommended secondary fix:

- modestly raise bootstrap budgets only after the file-content split is in
  place, not as the sole fix

## Landed implementation direction

1. `MEMORY.md` is now human-curated and structurally clean again.
2. Generated standing-context material no longer gets materialized back into
   the curated file.
3. The compiled `memory-md` bootstrap packet is injected through its separate
   generated artifact path instead of the workspace file.
4. DB-backed generated memory remains a separate runtime overlay surface.
5. Project/runbook routing remains in owning docs instead of curated memory.
6. Bootstrap budgets were left unchanged because the post-split file now fits
   cleanly.

## Bottom line

The current runtime warning seam remains fixed, and the structural ownership
problem is now fixed materially enough to land:

- curated `MEMORY.md` is again a curated durable memory surface
- generated runtime scaffolding no longer owns the top of the file
- the correct response was the ownership split, not a budget increase
