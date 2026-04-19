---
summary: "Canonical contract for workspace daily note generation, ownership, and continuity use."
title: "Daily Note Generation Contract"
---

# Daily Note Generation Contract

## Goal

Keep workspace continuity grounded in one canonical daily note per day without
confusing that surface with per-session leaf notes or model-generated memory
projections.

## Canonical files

- canonical daily note: `memory/YYYY-MM-DD.md`
- session leaf note: `memory/YYYY-MM-DD-<slug>.md`

## Distinct roles

### `memory/YYYY-MM-DD.md`

This is the canonical same-day continuity file.

Use it for:

- same-day operator grounding
- daily review anchoring
- human-readable day-level continuity

### `memory/YYYY-MM-DD-<slug>.md`

This is a per-session leaf artifact.

Use it for:

- provenance
- detailed leaf-session recall
- debugging or reconstructing what was captured at a session boundary

## Generation trigger

Current runtime trigger:

- retained `session-memory` hook on `/new` and `/reset`

Current required behavior:

1. write the slugged leaf note
2. append a structured entry into the canonical day file

## Ownership boundary

Auto-generated:

- structured session entry blocks
- metadata lines
- session leaf pointer
- bounded conversation summary

Human-owned:

- handwritten daily notes
- operator annotations
- later edits to the canonical daily note

## Mutation rule

- canonical daily note is append-only from automation
- existing human content must not be overwritten
- generation may create the file when absent
- generation must dedupe by session id for repeat handling of the same session

## Relation to model-memory

- `model-memory` remains the live semantic memory authority
- daily markdown notes are continuity surfaces, not semantic truth authority
- model-memory and daily-summary lanes may ingest from these continuity
  artifacts, but the artifacts themselves do not replace database-backed
  memory authority

## Relation to operator review

Operator review truth order for same-day grounding:

1. `memory/YYYY-MM-DD.md` when present
2. same-day supporting leaf notes
3. archived daily evidence artifacts when the canonical daily note is missing

## Failure handling

If the canonical daily note is missing:

- do not silently treat the day as grounded
- record the gap explicitly
- repair the generation path
- backfill only from exact same-day evidence

## Current repair reference

The `2026-04-18` continuity gap and runtime repair are recorded in:

- [Daily Memory Grounding Repair](/projects/model-memory/daily-memory-grounding-repair)
