---
summary: "Deterministic projection of model-memory into workspace bootstrap files."
title: "Workspace Projections And Bootstrap Files"
---

# Workspace Projections And Bootstrap Files

## Objective

Define how canonical memory truth becomes runtime-consumable bootstrap files and generated workspace sections.

## Core rule

The projection compiler is deterministic and code-driven.

It must not use the model to rewrite bootstrap files.

## Source of truth

Bootstrap projections are derived from:

- canonical memory objects
- runtime read models
- projection policies

They are not themselves semantic truth.

## Bootstrap file policy

V1 allowed targets:

- generated `MEMORY.md`
- generated `USER.md`
- generated sections inside `AGENTS.md`

Deferred:

- generated sections inside `TOOLS.md`
- project-local generated docs

Not owned by projection by default:

- `SOUL.md`
- `IDENTITY.md`

## Existing file ingestion requirement

Before replacing existing `MEMORY.md` or `USER.md` content with generated projections, current human-authored content must be:

- audited
- ingested into canonical memory storage where appropriate
- reviewed for anything that should remain human-owned

The system must not blindly overwrite previously hand-authored memory content.

## Ownership zones

Mixed files should use explicit generated and human-owned sections.

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

If an allowed projection target file already exists, only the generated zone may be rewritten.

If an allowed projection target file does not yet exist, the compiler may create it in accordance with the target policy.

## Runtime-owned output location

Generated artifacts should live under a dedicated runtime-owned directory first.

The canonical runtime-owned root is:

- `.openclaw/model-memory/`

Recommended subdirectories:

- `.openclaw/model-memory/artifacts/`
- `.openclaw/model-memory/projections/`
- `.openclaw/model-memory/session/`

Projection into top-level bootstrap files should happen through controlled generated zones, not by treating repo docs as a cache surface.

Canonical generated storage lives under `.openclaw/model-memory/`.

Top-level bootstrap files are rendered views, not the primary generated store.

## What belongs in bootstrap files

Compile into bootstrap files only when the memory is:

- stable across many sessions
- behavior-shaping before task reasoning begins
- high-confidence
- low-churn
- worth the token cost on repeated runs

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

- `MEMORY.md` executive digest
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

## Projection compiler outputs

Each generated projection version should record:

- target id
- version id
- source object ids or slot/set ids
- content hash
- token estimate
- built timestamp
- canonical artifact path under `.openclaw/model-memory/`
