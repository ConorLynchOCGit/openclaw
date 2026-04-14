---
summary: "Audit of current MEMORY.md and USER.md related inputs before projection work."
title: "Model Memory Bootstrap Input Audit"
---

# Model Memory Bootstrap Input Audit

## Objective

Record the current repo-tracked `MEMORY.md` and `USER.md` related inputs before any projection compiler work begins.

## Search result

Repo-tracked files searched:

- `MEMORY.md`
- `USER.md`
- `AGENTS.md`

Findings:

- no repo-tracked top-level `MEMORY.md` exists in the live repo
- no repo-tracked top-level `USER.md` exists in the live repo
- the relevant repo-tracked bootstrap-related files currently present are:
  - `AGENTS.md`
  - `docs/reference/templates/USER.md`
  - `docs/reference/templates/AGENTS.md`

## Current surfaces

### `AGENTS.md`

Role:

- real repo instruction surface
- not a candidate for blind overwrite by model-memory

Implication:

- any future generated `AGENTS.md` content must live in controlled generated zones only
- the existing human-owned instruction surface remains authoritative outside those zones

### `docs/reference/templates/USER.md`

Role:

- documentation template for manual workspace bootstrap

Implication:

- this is not live runtime truth
- it is documentation input only

### `docs/reference/templates/AGENTS.md`

Role:

- documentation template for manual workspace bootstrap

Implication:

- this is not live runtime truth
- it is documentation input only

## Audit judgment

There is no repo-tracked top-level `MEMORY.md` or `USER.md` in the live repo that needs immediate preservation before implementation.

However, the projection compiler must still assume that real workspace-local `MEMORY.md` and `USER.md` files may exist outside the repo-tracked docs.

## Pre-projection requirement

Before enabling generated projections in any actual workspace:

- inspect the actual workspace-local `MEMORY.md` and `USER.md`
- ingest durable content into canonical memory storage where appropriate
- mark any content that must remain human-owned
- create generated zones rather than overwriting whole files

## Implementation consequence

The projection compiler can be implemented before live replacement, but projection activation must remain gated on a real workspace-local file audit.
