# Native Memory Governance And Rollout

## Purpose

Define governance, circularity protection, continuity-file posture, and rollout
verification for native file integration.

## Governance rules

### Rule 1 — no dual truth

The DB remains canonical durable truth.

### Rule 2 — no raw instruction promotion

Raw recalled text must not be promoted directly into prompt-shaping files.

### Rule 3 — approved-only default

Projection eligibility starts at approved durable memory.

### Rule 4 — compact by design

Prompt-facing files stay small and role-specific.

### Rule 5 — explicit ownership

Generated zones and human-owned zones must be separable and auditable.

## Circularity protection

Compiled projection files can otherwise create a second recall loop:

1. DB memory is projected into files
2. native file-memory indexing reads those files
3. later retrieval treats the projection as a new source

That is not acceptable.

### Required v1 posture

- compiler-owned projection files should be excluded from default native
  file-memory indexing
- compiler-owned projection files should not feed middleware ingestion
- continuity files and human-authored project docs may remain searchable

## Daily continuity model

The native workspace currently has a mismatch between:

- startup instructions that expect `memory/YYYY-MM-DD.md`
- a session-memory hook that writes `memory/YYYY-MM-DD-slug.md`

### Chosen posture

Keep both layers, with distinct roles:

- `memory/YYYY-MM-DD-*.md`
  - raw continuity leaves
- `memory/YYYY-MM-DD.md`
  - canonical compiled daily continuity digest for startup continuity
- `archives/daily_memory_evidence/YYYY-MM-DD.md`
  - operator-review evidence layer

The daily continuity file is not the canonical durable memory store. It is a
workspace continuity artifact.

## Refresh triggers

The exact trigger mechanism may vary, but rollout should prefer bounded refresh
over blind per-turn rewriting.

Recommended v1 trigger classes:

- explicit projection compile command
- bounded refresh after approved-memory changes
- bounded refresh after project-memory changes

## Observability requirements

The projection system must support:

- changed vs unchanged compile result
- per-file update counts
- per-destination source counts
- omitted-item diagnostics when budgets cut content
- stale projection detection
- provenance from generated sections back to canonical memory

## Rollout stages

### Stage 1

- compile shared-workspace projections
- verify budgets and no circular indexing

### Stage 2

- compile project-local projections
- verify project scoping and pointer behavior

### Stage 3

- later, add selected agent-specific projections

## Verification gates

Before a rollout slice is accepted, verify:

- canonical DB memory is unchanged except where intentionally written
- generated zones are deterministic
- human-owned zones are untouched
- native `memory_search` does not index compiler-owned projections by default
- prompt size remains within intended limits
- startup continuity works with the canonical daily continuity file
- project-local projections do not leak irrelevant cross-project detail

## Deferred items

These remain explicitly deferred:

- reverse sync from files to DB
- full agent-specific projection rollout
- schema changes for projection-specific flags unless implementation proves they
  are needed
- any broader redesign of native session-memory hook behavior beyond the daily
  continuity contract
