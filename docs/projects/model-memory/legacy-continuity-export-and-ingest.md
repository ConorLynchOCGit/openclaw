---
summary: "One-time export and preservation record for continuity and legacy sqlite memory state."
title: "Legacy Continuity Export And Ingest"
---

# Legacy Continuity Export And Ingest

This document records the one-time preservation step completed before further
legacy-memory retirement actions.

## Source surfaces

- `/root/.openclaw/workspace/MEMORY.md`
- `/root/.openclaw/workspace/memory/`
- `/root/.openclaw/memory/*.sqlite`

Observed absent legacy runtime state:

- QMD directories: none found
- LanceDB directories: none found

## Snapshot artifact location

Preservation snapshot created at:

- `/root/.openclaw/workspace/archives/model-memory/legacy-memory-retirement-2026-04-18T021926Z`

Contained artifacts:

- `MEMORY.md`
- `workspace-memory.tar.gz`
- `legacy-sqlite-memory.tar.gz`
- `manifests/snapshot-summary.env`
- `manifests/sha256.txt`

## Snapshot summary

- workspace `MEMORY.md` present: `yes`
- workspace daily memory dir present: `yes`
- sqlite files snapshotted: `15`
- QMD dirs found: `0`
- LanceDB dirs found: `0`

## SHA256 manifest

The snapshot directory includes:

- `manifests/sha256.txt`

That manifest is the integrity anchor for the preserved continuity/export set.

## One-time ingest posture

This sprint does **not** claim that all preserved markdown continuity was
re-ingested as a special migration pass.

Current honest posture:

- model-memory already ingests and reasons over canonical sources and daily
  continuity in normal operation
- this sprint completed the preservation snapshot needed before deletion work
- any targeted one-time ingest from preserved markdown archives remains a
  follow-on step if deletion of the live continuity files is later authorized

## Safe actions enabled by this export

- preservation and audit of continuity-producing markdown hooks before deeper
  retirement work
- removal of stale docs that describe markdown continuity as the semantic memory
  authority
- continued proof that model-memory is the active authority while continuity
  files remain preserved

## Actions still blocked after this export

- deleting live `MEMORY.md`
- deleting live `memory/*.md`
- deleting legacy sqlite stores from `/root/.openclaw/memory/`

Those require the broader repo/runtime deletion tranche to complete first.
