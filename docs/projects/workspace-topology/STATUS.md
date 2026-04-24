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
- registered project workspaces now match the full canonical `docs/projects/*`
  tree recorded in
  [Runtime Project Surfaces](/projects/workspace-topology/runtime-project-surfaces),
  including `operator-experience/` and the other active engineering buckets
- canonical `docs/system/` root now exists
- canonical `docs/agents/` root now exists
- scattered project-like material has now been explicitly classified for later
  migration
- bounded runtime-source agent packs now exist in this repo under
  `docs/agents/`
- registered project workspaces are now base-pack compliant; the last missing
  pack file was `docs/projects/operator-experience/specs/index.md`
- the latest topology audit found registry drift in docs surfaces, not a
  materially incoherent project-bucket split; no new top-level project
  workspace is justified right now
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
- the canonical daily-note generation and ownership contract is now explicitly
  written down in
  [Daily Note Generation Contract](/projects/workspace-topology/daily-note-generation-contract)
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
- project-owned nested workstreams can now keep local packs under a registered
  parent project without becoming separate top-level registry entries
- the live runtime project split is now explicit:
  - `docs/projects/*` is the canonical engineering project layer
  - most `workspace/projects/*` paths are now compatibility aliases into the
    canonical import-mounted repo tree
  - `workspace/projects/ops/` remains the one justified writable compatibility
    surface because it still owns `generated_current/` and a few stable host
    script paths
- cross-root operator artifacts now resolve through explicit registered
  resources instead of relying on workspace-first fuzzy search
- default broad search remains intentionally pruned away from
  `.openclaw-memory-ops/**`; the explicit resource resolver is the supported
  route for Memory Ops, generated-current aliases, and archived operator
  reports
- the canonical downstream repo identity is now explicit:
  `ConorLynchOCGit/openclaw-platform` owns the product/work tree,
  `ConorLynchOCGit/openclaw-integration` is the clean upstream-sync surface,
  and the legacy fork `ConorLynchOCGit/openclaw` is no longer the canonical
  repo home

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
workspace-project alias reconciliation and continuity-hook restore.

That slice must:

- add one shared resolver in runtime/tool code
- patch the document-ingest lane first
- separate read-target ownership from write-target ownership
- remove the need for prompt-level import-path remembering
- keep repo-owned project truth and workspace operator packs distinct by policy

After that, [Agent Foundation](/projects/agent-foundation) can own the richer
per-agent pack population slice on a more stable runtime floor.

## Dependency notes

- This project delivered the topology and registry floor that later agent-pack
  work depends on.
- [Agent Foundation](/projects/agent-foundation) can now use that floor instead
  of recreating topology decisions inside the agent slice.
