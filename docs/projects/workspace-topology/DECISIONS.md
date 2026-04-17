---
summary: "Stable decisions for the workspace-topology project."
title: "Workspace Topology Decisions"
---

# Workspace Topology Decisions

## 2026-04-16 - use three durable roots plus one machine root

Decision:

- the canonical durable structure is:
  - `docs/system/`
  - `docs/projects/`
  - `docs/agents/`
- the machine-readable agent/runtime surface remains:
  - `.agents/`

Reasoning:

- project-local, system-global, and agent-local durable docs are distinct
  classes
- `.agents/` should remain operational and machine-readable rather than mixing
  prose governance with runtime configuration

## 2026-04-16 - `docs/projects/` is the only canonical project workspace root

Decision:

- all project workspaces must live under `docs/projects/`
- project folders in other locations are migration debt

Reasoning:

- `docs/projects/` already exists and is the strongest working pattern in the
  repo
- centralization is required before deterministic drift enforcement is possible

## 2026-04-16 - pointer docs must stay shallow and link to granular end docs

Decision:

- top-level durable control docs are pointer indexes
- extensive detail belongs in project-local or agent-local deeper docs
- the main roadmap must point to real project workspaces, including for future
  and past roadmap entries

Reasoning:

- pointer docs should orchestrate and navigate, not become dumping grounds
- this keeps durable docs stable and easier to maintain

## 2026-04-16 - generalize the model-memory durable-vs-generated contract

Decision:

- the repo-wide durable-vs-generated ownership contract will extend the
  `model-memory` projection idea instead of inventing a separate incompatible
  system
- generated content must live inside explicit generated zones
- durable content remains human-owned outside those zones

Reasoning:

- `model-memory` already established the seed principle:
  generated projections should use bounded generated zones instead of replacing
  whole files
- the correct move is generalization and enforcement, not reinvention

## 2026-04-16 - use registries and deterministic drift checks

Decision:

- project and agent registries are required
- topology, pack compliance, durable/generated boundaries, and runtime sprawl
  must all become machine-checkable

Reasoning:

- folder conventions alone drift
- the repo needs deterministic enforcement, not informal expectations

## 2026-04-16 - roadmap ideas need a canonical holding layer

Decision:

- loose roadmap idea detail should not disappear when the global roadmap becomes
  a pointer index
- not every idea deserves its own project workspace immediately
- `docs/system/roadmap-ideas.md` is the canonical holding layer for those loose
  ideas

Reasoning:

- deleting detail would make the new topology lossy
- creating weak project folders for every idea would create junk structure

## 2026-04-16 - runtime bootstrap files remain compatibility artifacts

Decision:

- runtime-facing files such as `AGENTS.md`, `SOUL.md`, `IDENTITY.md`,
  `USER.md`, `TOOLS.md`, `BOOTSTRAP.md`, and `MEMORY.md` remain compatibility
  artifacts until runtime is explicitly reworked
- `AGENTS.md` must remain a structurally rich operational document and must not
  become a shallow pointer page
- canonical durable docs and runtime compatibility files need an explicit
  mapping surface

Reasoning:

- the runtime still directly consumes these filenames today
- pretending otherwise would create a parallel dead documentation layer

## 2026-04-16 - memory topology must preserve generated and daily layers

Decision:

- DB-backed `model-memory` projections remain part of the intended memory
  architecture
- daily memory files remain an official episodic and ingestion layer
- `docs/system/memory.md` is a pointer/control surface, not the memory artifact

Reasoning:

- the repo already carries a real projection model
- daily memory is operationally meaningful and cannot be flattened away

## 2026-04-16 - runtime bootstrap compatibility files are assembled through one registry-driven path

Decision:

- runtime-facing compatibility files are no longer maintained only by manual
  convention
- `docs/system/registries/bootstrap-files.yaml` is the machine-readable contract
  for concrete bootstrap file classes
- `src/agents/bootstrap-canonicalization.ts` is the first-pass assembly path
  that materializes compatibility files from canonical durable sources and
  `model-memory` projection output
- `AGENTS.md` remains structurally rich while `MEMORY.md` must include the
  generated memory pointer layer explicitly

Reasoning:

- documenting the mapping without an assembler would leave a parallel truth
  system that drifts
- the repo already had `model-memory` projection seams worth reusing, so the
  correct move was extension rather than reinvention
