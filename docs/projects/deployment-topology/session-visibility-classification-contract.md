---
summary: "Metadata-driven contract for which sessions are operator-visible versus hidden internal/proof/system rows."
title: "Session Visibility Classification Contract"
---

# Session Visibility Classification Contract

## Goal

Make selector visibility depend on explicit session class metadata instead of
name-based string filters alone.

## Canonical metadata fields

- `visibilityClass`
  - `operator`
  - `internal`
  - `proof`
  - `system`
- `retentionClass`
  - `standard`
  - `internal_short`
  - `proof_short`
  - `system_short`

## Current derivation rules

### `system`

- synthetic heartbeat sessions
- synthetic global/unknown system rows

### `proof`

- unnamed `main` proof sessions such as `agent:main:codex-*`
- other unnamed proof-labeled rows migrated from legacy state

### `internal`

- unnamed non-main internal worker/subagent rows
- internal/background/system-surface rows that are not operator-facing

### `operator`

- normal user-visible sessions
- any explicitly named session with user-facing metadata
- live main-child sessions that are intentionally part of operator workflows

## Selector rule

Hide only:

- `proof`
- `internal`
- `system`

Keep visible:

- `operator`

## Persistence rule

Legacy stores may derive the fields on load, but migrated entries persist the
metadata so selector behavior does not depend on repeated heuristic guessing.
