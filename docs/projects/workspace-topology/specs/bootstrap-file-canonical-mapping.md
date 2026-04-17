---
summary: "Canonical durable-to-runtime mapping for workspace bootstrap compatibility files."
title: "Bootstrap File Canonical Mapping"
---

# Bootstrap File Canonical Mapping

## Goal

Define how canonical durable docs map onto runtime-facing bootstrap
compatibility files without breaking current OpenClaw behavior.

## Core rule

Runtime-facing workspace files remain compatibility artifacts until runtime is
explicitly reworked to consume different surfaces.

The revised topology must not create a parallel dead doc system.

## File-class mapping

### `AGENTS.md`

- runtime-facing role:
  primary operating instructions
- structural mode:
  rich operational document
- canonical durable sources:
  - repo-global operating policy under `docs/system/`
  - later agent-local durable packs under `docs/agents/`
  - selected project-local operating constraints where relevant
- compatibility artifact:
  `AGENTS.md`
- projection strategy:
  assembled compatibility document with stable section structure; mixed
  human/generated zones may remain during transition, especially where
  `model-memory` already projects bounded generated sections
- rule:
  `AGENTS.md` must not collapse into a shallow pointer page

### `SOUL.md`

- runtime-facing role:
  persona, tone, stance, hard identity limits
- structural mode:
  lean identity-focused document
- canonical durable sources:
  future `docs/agents/<agent-id>/` durable identity pack
- compatibility artifact:
  `SOUL.md`
- projection strategy:
  derived lean compatibility file
- rule:
  keep process-heavy procedures out of `SOUL.md`

### `IDENTITY.md`

- runtime-facing role:
  compact identity summary
- structural mode:
  lean
- canonical durable sources:
  future `docs/agents/<agent-id>/Identity.md`
- compatibility artifact:
  `IDENTITY.md`
- projection strategy:
  derived compatibility file

### `USER.md`

- runtime-facing role:
  durable user profile and standing preferences
- structural mode:
  lean-to-moderate
- canonical durable sources:
  durable user-facing memory-bearing sources plus projection policy
- compatibility artifact:
  `USER.md`
- projection strategy:
  generated or derived compatibility file; `model-memory` already has a target
  for it

### `TOOLS.md`

- runtime-facing role:
  tool conventions and operator-maintained usage constraints
- structural mode:
  lean operational note file
- canonical durable sources:
  future `docs/agents/<agent-id>/Tools.md` plus project-local tool notes where
  justified
- compatibility artifact:
  `TOOLS.md`
- projection strategy:
  derived compatibility file later; not yet owned by `model-memory` projection
  by default

### `BOOTSTRAP.md`

- runtime-facing role:
  first-run or resumed onboarding compatibility surface
- structural mode:
  startup and onboarding note
- canonical durable sources:
  onboarding/runtime bootstrap policy surfaces
- compatibility artifact:
  `BOOTSTRAP.md`
- projection strategy:
  compatibility file remains runtime-owned as needed

### `MEMORY.md`

- runtime-facing role:
  curated long-term memory artifact
- structural mode:
  runtime memory artifact, not a pointer page
- canonical durable sources:
  - durable human-owned memory-bearing docs
  - DB-backed `model-memory` generated digest
- compatibility artifact:
  `MEMORY.md`
- projection strategy:
  generated or assembled runtime-facing artifact; `model-memory` already owns a
  generated target for this file class
- rule:
  do not flatten this into `docs/system/memory.md`

### `memory/*.md`

- runtime-facing role:
  daily episodic memory and ingestion layer
- structural mode:
  daily log and episodic memory
- canonical durable source:
  the daily files themselves remain official runtime inputs
- compatibility artifact:
  none; this layer remains directly meaningful
- projection strategy:
  preserve as official ingestion layer, not as discarded residue

## Transition rule

Current runtime truth is still centered on the compatibility filenames.

The repo now implements the first-pass deterministic assembly path in
`src/agents/bootstrap-canonicalization.ts`, using
`docs/system/registries/bootstrap-files.yaml` as the concrete file-class
contract.

Current implemented behavior:

- compatibility files are materialized in the workspace before bootstrap-file
  loading
- `AGENTS.md` preserves human-owned operational sections while gaining a
  canonical durable-source block
- `MEMORY.md` preserves the generated `model-memory` projection zone and gains a
  canonical generated-pointer block that points to:
  - the DB-backed generated memory projection layer
  - the daily memory ingestion layer
  - the documented memory-layer and memory-rule surfaces

Remaining gap:

- canonical durable sources are still relatively shallow for agent-specific
  content because the later `docs/agents/` population slice has not run yet
