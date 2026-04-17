---
summary: "Current status for the workspace-topology project."
title: "Workspace Topology Status"
---

# Workspace Topology Status

## Overall

State: `phase_3_runtime_canonicalization_implemented`

The accepted structure decisions are recorded durably, the roadmap and memory
mapping slices are implemented, and the first runtime-canonicalization path is
now live in the repo.

## Confirmed current state

- canonical project workspace root already exists:
  - `docs/projects/`
- existing project workspaces now cover the active and queued topology-owned
  surfaces, including:
  - `docs/projects/model-memory/`
  - `docs/projects/workspace-topology/`
  - `docs/projects/agent-foundation/`
  - `docs/projects/deployment-topology/`
  - `docs/projects/maintenance/`
  - `docs/projects/qa-program/`
  - `docs/projects/turborepo/`
  - `docs/projects/intake-routing/`
- canonical `docs/system/` root now exists
- canonical `docs/agents/` root now exists
- scattered project-like material has now been explicitly classified for later
  migration
- bounded runtime-source agent packs now exist in this repo under
  `docs/agents/`
- registered project workspaces are now base-pack compliant
- durable/generated ownership is now a repo-wide written policy
- deterministic topology and pack checks now exist in `scripts/`
- roadmap-like surfaces are now being normalized into:
  - canonical project workspaces
  - `docs/system/roadmap-ideas.md`
- runtime bootstrap compatibility files are now explicitly inventoried and
  mapped
- runtime bootstrap compatibility files are now materialized from canonical
  durable sources before bootstrap loading
- post-compaction `AGENTS.md` refresh now uses the same canonicalization path
- memory topology now explicitly preserves:
  - durable human-owned sources
  - DB-backed `model-memory` projections
  - daily memory files
- `MEMORY.md` assembly now includes a generated pointer layer for DB-backed
  memory plus daily-memory references
- bootstrap-file registry is now consumed by repo code rather than existing as
  docs-only metadata
- bootstrap-file registry now also records seed policy metadata for eager seed
  versus runtime-refresh behavior
- topology/bootstrap checks are now wired into the default `pnpm check` path
- runtime repo-import parity now has a direct hardening check in the topology
  gate
- deployment-topology extraction is no longer a roadmap gap; it now has its own
  canonical project workspace

## Delivered in this slice

- `docs/system/` pointer/control root
- project and agent registries
- runtime inventory registry foothold
- bootstrap-file registry foothold
- project-pack compliance normalization
- scattered-material inventory
- roadmap pointer-gap inventory
- first topology drift-check scripts
- repo-wide durable/generated ownership policy
- registry-driven runtime compatibility-file assembly
- default-gate topology integration through `pnpm check:topology`
- deployment-topology project extraction

## Immediate next move

Keep topology enforcement and runtime adoption aligned, then land the canonical
path-resolution and runtime-arbitration slice immediately after the current
deep document-ingest pass.

That slice must:

- add one shared resolver in runtime/tool code
- patch the document-ingest lane first
- separate read-target ownership from write-target ownership
- remove the need for prompt-level import-path remembering

After that, [Agent Foundation](/projects/agent-foundation) can own the richer
per-agent pack population slice on a more stable runtime floor.

## Dependency notes

- This project delivered the topology and registry floor that later agent-pack
  work depends on.
- [Agent Foundation](/projects/agent-foundation) can now use that floor instead
  of recreating topology decisions inside the agent slice.
