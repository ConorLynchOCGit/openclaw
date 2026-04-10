# Native OpenClaw Memory Integration

## Purpose

Define how the canonical `memory_middleware` Postgres memory system integrates
with OpenClaw's native file-based memory and bootstrap surfaces without
creating dual truth, token bloat, or prompt-instruction drift.

This spec is intentionally documentation-first. It defines the integration
model that later implementation slices must follow.

## Current repo fit

The current system already has two memory regimes:

1. native file/session continuity surfaces
   - `AGENTS.md`
   - `USER.md`
   - `TOOLS.md`
   - `SOUL.md`
   - `MEMORY.md`
   - `memory/*.md`
   - native `memory_search`
2. middleware-backed durable memory and retrieval
   - `memory_candidate_submit`
   - `memory_object_search_hybrid`
   - approved/candidate memory objects in Postgres

The missing piece is not another store. It is a formal projection and
precedence model between the DB substrate and the native files.

## Chosen integration model

The memory system uses three layers.

### 1. Canonical durable memory layer

Canonical truth lives in the `memory_middleware` Postgres store.

This includes:

- durable memory objects
- provenance
- review state
- confidence
- links
- project/agent/session association
- retrieval/search metadata

This layer is authoritative for durable memory state.

### 2. Native compiled projection layer

Selected approved canonical memory may be compiled into OpenClaw-native files.

These files are:

- prompt-facing
- human-readable
- role-specific
- intentionally compressed

They are not a peer database and do not reverse-sync in v1.

### 3. Turn-time retrieval layer

The current retrieval system remains responsible for situational recall:

- what matters for this query
- what matters for this turn
- what should be retrieved dynamically instead of injected every time

Compiled files answer a different question:

- what should already shape reasoning before dynamic retrieval starts

## Design rules

### Postgres remains canonical

No native file becomes a second canonical durable-memory owner.

### Compiled files are selective

The compiler promotes only bounded, approved, high-signal material that is
worth paying prompt budget for.

### Prompt files are not mirrors

Do not mirror the whole DB into markdown.

### No reverse sync in v1

Human file edits do not automatically mutate canonical DB memory in the first
implementation tranche.

### Daily continuity is distinct from durable memory

Daily/session continuity files remain a continuity artifact layer.

## Native surface roles

### `AGENTS.md`

Policy surface only.

Use it for:

- memory operating rules
- precedence
- destination rules
- writeback/promotion rules
- safety constraints

Do not use it as a projection destination for factual memory rows.

### `USER.md`

Primary projection target for stable user-profile memory.

### `TOOLS.md`

Primary projection target for durable workflow/tool-use preferences.

### `MEMORY.md`

Compact cross-project digest plus pointers.

### `SOUL.md`

Human-authored persona surface in v1.

### project-local docs

Primary projection destination for rich project detail.

### `memory/*.md`

Continuity leaves and daily continuity artifacts, not canonical durable memory.

## Non-goals

This spec does not authorize:

- broad bootstrap widening for every session class
- reverse sync from markdown into canonical durable memory
- direct candidate-state projection into prompt files
- raw recalled text becoming standing instructions
- treating native file-memory search as the canonical durable memory layer

## Implementation consequences

Any later build slice implementing native file integration must preserve:

- DB canonical ownership
- one-way projection in v1
- explicit generated-zone ownership
- prompt-budget caps
- circularity protection
- rollout-safe observability
