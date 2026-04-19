---
summary: "Preservation rules for human-owned continuity during legacy-memory retirement."
title: "Continuity Preservation And Retirement"
---

# Continuity Preservation And Retirement

Legacy memory retirement must not destroy human-owned continuity simply because
the old runtime wrote to some of the same file names.

## Human-owned continuity surfaces

The following surfaces remain human-owned continuity until an explicit future
cut is approved:

| Surface                                   | Ownership                    | Current role                                             |
| ----------------------------------------- | ---------------------------- | -------------------------------------------------------- |
| workspace `MEMORY.md`                     | human-owned                  | curated long-term continuity and bootstrap memory source |
| workspace `memory/*.md`                   | human-owned daily continuity | daily notes, operator continuity, daily-summary input    |
| workspace `USER.md`                       | human-owned                  | durable operator preferences and identity/context notes  |
| `.openclaw/model-memory/projections/*.md` | runtime/model-memory         | generated bootstrap projection artifacts with provenance |

## Preservation rules

1. Human-authored content is never silently overwritten.
2. Generated content may only occupy an explicit generated zone or derived
   artifact path.
3. Ingestion into model-memory does not transfer authorship.
4. Export/snapshot must happen before any delete action on continuity files or
   legacy sqlite stores.
5. The existence of a model-memory projection does not authorize deletion of
   the human-authored file that informed it.

## Overwrite policy

| Surface       | Policy         |
| ------------- | -------------- |
| `MEMORY.md`   | `no_overwrite` |
| `memory/*.md` | `no_overwrite` |
| `USER.md`     | `no_overwrite` |

### Separate generated artifact path

Generated projections may still exist, but for workspace continuity files the
generated output should prefer a separate artifact path when the file is meant
to remain fully human-owned.

Current live example:

- workspace `MEMORY.md` stays human-authored
- compiled `memory-md` output is injected through
  `.openclaw/model-memory/projections/<target>-<hash>.md`

That preserves continuity ownership without discarding bootstrap semantics.

### `no_overwrite`

`memory/*.md` and `USER.md` remain directly operator-editable source surfaces.
The system may read them and ingest them, but it may not replace them with a
projection file or rewrite their contents as a side effect of capture,
retrieval, or bootstrap generation.

## Daily-summary interaction

Current daily-summary behavior still depends on finalized daily continuity
artifacts under `memory/*.md`.

That means:

- `memory/*.md` cannot be treated as disposable legacy trash yet
- the `session-memory` hook remains an allowed continuity producer because it
  finalizes canonical daily markdown artifacts on `/new` and `/reset`
- deleting the daily continuity directory itself is not allowed in this sprint

## Retirement gates for continuity files

The legacy continuity files may only be deleted after all of the following are
true:

1. one-time export/snapshot completed
2. required historical content has been ingested or otherwise preserved
3. daily-summary ingestion no longer depends on the live markdown files, or the
   replacement contract is proven
4. operator-facing continuity expectations are rewritten around the new
   surfaces
5. a separate delete authorization is made explicitly

## Current decision

For this sprint:

- preserve `MEMORY.md`
- preserve `memory/*.md`
- preserve `USER.md`
- keep the `session-memory` hook wired as a continuity producer
- snapshot legacy sqlite stores
- keep semantic capture, retrieval, and context authority in `model-memory`

That cleanly separates:

- human continuity
- ingested semantic truth
- continuity-producing markdown automation
