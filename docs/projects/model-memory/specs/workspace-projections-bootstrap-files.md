---
summary: "Deterministic projection of model-memory into workspace bootstrap files and runtime bootstrap artifacts."
title: "Workspace Projections And Bootstrap Files"
---

# Workspace Projections And Bootstrap Files

## Objective

Define how canonical memory truth becomes runtime-consumable bootstrap files,
runtime projection artifacts, and generated workspace sections.

## Core rule

Bootstrap projection ownership is code-driven and auditable.

The compiler may use deterministic render or model-assisted render depending on
packet policy, but:

- semantic truth still comes from canonical memory objects
- the generated file boundary remains code-owned
- every build must preserve provenance and dropped-item accounting

## Source of truth

Bootstrap projections are derived from:

- canonical memory objects
- runtime read models
- projection policies

They are not themselves semantic truth.

## Bootstrap file policy

V1 allowed targets:

- `memory-md` as a generated bootstrap projection artifact
- generated `USER.md`
- generated sections inside `AGENTS.md`

Deferred:

- generated sections inside `TOOLS.md`
- project-local generated docs

Not owned by projection by default:

- `SOUL.md`
- `IDENTITY.md`

## Existing file ingestion requirement

Before replacing existing `MEMORY.md` or `USER.md` content with generated
projections, current human-authored content must be:

- audited
- ingested into canonical memory storage where appropriate
- reviewed for anything that should remain human-owned

The system must not blindly overwrite previously hand-authored memory content.

## Ownership zones

Mixed files should use explicit generated and human-owned sections when the live
contract still permits a mixed file.

Example:

```md
<!-- BEGIN GENERATED: model-memory -->

...

<!-- END GENERATED: model-memory -->

<!-- BEGIN HUMAN -->

...

<!-- END HUMAN -->
```

The compiler owns only the generated zone.

If an allowed projection target file already exists, only the generated zone may
be rewritten.

If an allowed projection target file does not yet exist, the compiler may
create it in accordance with the target policy.

Current explicit exception:

- workspace `MEMORY.md` is no longer a mixed generated file in the live
  contract
- curated `MEMORY.md` remains human-owned
- `memory-md` still exists as a projection target, but it now reaches bootstrap
  context through its separate generated artifact path under
  `.openclaw/model-memory/projections/`

## Runtime-owned output location

Generated artifacts should live under a dedicated runtime-owned directory first.

The canonical runtime-owned root is:

- `.openclaw/model-memory/`

Recommended subdirectories:

- `.openclaw/model-memory/artifacts/`
- `.openclaw/model-memory/projections/`
- `.openclaw/model-memory/session/`

Projection into top-level bootstrap files should happen through controlled
generated zones or separate generated runtime artifact paths, not by treating
repo docs as a cache surface.

Canonical generated storage lives under `.openclaw/model-memory/`.

Top-level bootstrap files are rendered views, not the primary generated store.
For `memory-md`, the current live rendered view is the generated runtime
artifact path, not the curated workspace file.

The rich projection catalog pages added on 2026-04-22 are artifact-only
runtime views under `.openclaw/model-memory/projections/`. They cover:

- `user_profile_page`
- `project_page`
- `procedure_page`
- `source_page`
- `decision_log`
- `timeline_page`
- `entity_page`
- `dashboard`
- `agent_digest`
- `projection_digest`

These pages must preserve source memory/event/edge ids, content hashes,
freshness, stale markers, conflict markers, and retrieval digest metadata.
They are never allowed to write generated content back into root `USER.md` or
`MEMORY.md`.

## Phase 2 knowledge artifact root

Phase 2 graph and capsule artifacts should use a derived knowledge namespace:

- `.openclaw/knowledge/`

The first approved subdirectory is:

- `.openclaw/knowledge/capsules/`

This path is for compiled knowledge artifacts, not canonical memory truth.
MMV2 SQL remains the source of truth, and `.openclaw/model-memory/` remains the
current root for existing model-memory projection/runtime artifacts.

Before implementation, workspace topology docs should record
`.openclaw/knowledge/` as a generated/derived artifact root. Generated knowledge
artifacts must follow the same rules as projection artifacts:

- content-hash-addressed output
- source memory, event, and edge ids in digests
- freshness, stale, and conflict markers
- no generated write-back into root `USER.md` or `MEMORY.md`
- no bypass around admission, reconciliation, or structural correction

## What belongs in bootstrap files

Compile into bootstrap files only when the memory is:

- stable across many sessions
- behavior-shaping before task reasoning begins
- high-confidence
- low-churn
- worth the token cost on repeated runs

Bootstrap packets should be built through the shared packet compiler, with
packet-specific policy for each file:

- `memory-md` requires strong basket shaping, section caps, and explicit
  dropped-item accounting
- `USER.md` favors stable standing preferences and constraints
- generated `AGENTS.md` sections favor critical rules and operational
  procedures that delegated runs must inherit

## What belongs in dynamic packs

Use dynamic packs when the memory is:

- project-specific
- task-specific
- medium-churn
- not worth permanent bootstrap placement

## What stays retrieval-only

Keep retrieval-only when the memory is:

- reference-heavy
- detail-heavy
- low-frequency
- too large for bootstrap or dynamic-pack default inclusion

`reference` should remain mostly retrieval-first by default.

## Projection outputs

Typical projection outputs may include:

- `memory-md` executive digest surfaced as a generated runtime bootstrap
  artifact
- `USER.md` standing user preferences
- `AGENTS.md` generated critical standing rules
- project-local projection artifacts later

## Projection compiler inputs

The compiler should accept:

- target id
- scope key
- allowed canonical classes
- allowed kinds
- ranking policy
- token budget
- formatting template
- packet class
- compiler mode
- section caps

## Projection compiler outputs

Each generated projection version should record:

- target id
- version id
- source object ids or slot/set ids
- content hash
- token estimate
- built timestamp
- canonical artifact path under `.openclaw/model-memory/`
- dropped source ids when any were excluded during compile
- compiler version and packet policy version
