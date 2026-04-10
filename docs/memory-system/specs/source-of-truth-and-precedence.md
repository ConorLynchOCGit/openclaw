# Source Of Truth And Precedence

## Purpose

Define the truth hierarchy and conflict rules for canonical DB memory, compiled
native files, human-authored docs, and continuity artifacts.

## Truth classes

### Class A — canonical durable truth

Owned by the `memory_middleware` Postgres substrate.

Examples:

- approved durable memory objects
- provenance records
- review state
- links
- project/agent/session association

### Class B — generated projection truth

Owned by the compiler within explicitly marked generated zones only.

Examples:

- generated `USER.md` sections
- generated `TOOLS.md` sections
- generated `MEMORY.md` digest sections
- generated project-local summary sections

### Class C — human-authored operational truth

Owned by humans in explicitly human-authored sections or files.

Examples:

- hand-written `AGENTS.md` operating policy
- hand-maintained `SOUL.md`
- project docs not owned by the compiler

### Class D — continuity/evidence artifacts

Useful and durable, but not canonical durable-memory truth.

Examples:

- `memory/YYYY-MM-DD-*.md`
- `memory/YYYY-MM-DD.md`
- `archives/daily_memory_evidence/YYYY-MM-DD.md`

## Precedence hierarchy

When the same topic appears in multiple places, precedence is:

1. explicit human-authored operating policy
2. canonical approved DB memory
3. compiler-owned generated projections derived from canonical DB memory
4. continuity/evidence artifacts
5. raw transcript or unstabilized session residue

## Why generated projections sit below canonical DB memory

Generated files are derived views.

They may:

- be stale
- be truncated to fit budget
- omit lower-priority detail

That is acceptable because they are not the canonical durable store.

## Conflict rules

### Human-authored policy vs projected memory

Human-authored policy wins.

Examples:

- hand-maintained safety instruction in `AGENTS.md`
- hand-maintained persona guidance in `SOUL.md`

### Canonical DB memory vs generated projection

Canonical DB memory wins.

If the projection disagrees, the projection is stale and must be regenerated.

### Continuity artifacts vs canonical DB memory

Canonical DB memory wins for durable factual memory.

Continuity artifacts may still be useful as evidence or narrative context.

### Human-authored project docs vs generated project summaries

If a project file has explicit human-owned sections, those sections win over the
generated projection.

## Override model

### Human overrides

Allowed only in designated human-authored zones.

### Generated zones

Not for freeform editing.

Edits there are treated as one of:

- drift to overwrite
- drift to flag

Implementation should choose one explicit policy and log it.

## No reverse sync in v1

Freeform edits in projection files do not mutate canonical DB memory.

If later reverse sync is ever considered, it must be a separate decision and
explicit workflow, not an ambient side effect.

## Approved-only projection rule

By default, only approved durable memory is projection-eligible.

Candidate, corrected, rejected, and superseded states are not prompt-facing
projection targets in v1.

## Audit requirement

The projection system must be able to show:

- which canonical records contributed to which generated section
- when a file was last compiled
- whether a projection is stale relative to canonical memory
