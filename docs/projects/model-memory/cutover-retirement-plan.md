---
summary: "Planned cutover, retirement, and deletion path from the legacy memory stack to model-memory."
title: "Model Memory Cutover And Retirement Plan"
---

# Model Memory Cutover And Retirement Plan

## Objective

Define the full path from parallel clean-room implementation to:

- production cutover onto `model-memory`
- retirement of the legacy memory stack
- deletion of legacy code and runtime state

This plan exists before implementation so cutover is designed deliberately rather than improvised after the new runtime already exists.

## Current implementation status

The repo now has the runtime seams needed to begin retirement execution:

- live `model-memory` bootstrap/context integration exists
- live assistant-turn capture exists
- an explicit `model-memory` live enable/disable seam exists
- gateway startup no longer needs legacy QMD startup when live `model-memory`
  is enabled
- status and doctor can report the cutover posture directly

The production flip is now complete.

What remains is the time-bounded stability window and then deletion work, not
more core cutover plumbing.

## Core judgment

The legacy memory stack in this repo is not one package.

It is a distributed system surface that currently includes:

- core memory runtime under `src/memory/`
- bundled memory plugins:
  - `extensions/memory-core/`
  - `extensions/memory-lancedb/`
- plugin-sdk public seams:
  - `src/plugin-sdk/memory-core.ts`
  - `src/plugin-sdk/memory-lancedb.ts`
- agent-facing memory tools and wiring:
  - `src/agents/tools/memory-tool.ts`
  - `src/agents/memory-search.ts`
  - `src/agents/system-prompt.ts`
  - `src/agents/tool-catalog.ts`
- CLI and operational commands:
  - `src/cli/memory-cli.ts`
  - `src/gateway/server-startup-memory.ts`
  - `src/gateway/server-methods/doctor.ts`
  - `src/commands/status.scan.ts`
- workspace-memory automation:
  - `src/hooks/bundled/session-memory/handler.ts`
- docs and config surfaces:
  - `docs/concepts/memory.md`
  - `docs/cli/memory.md`
  - `docs/automation/hooks.md`
  - `src/config/types.memory.ts`
  - plugin slot/config help for legacy memory surfaces

Cutover must retire that whole surface, not just one library.

## Hard rules

- no production cutover before the new system proves document ingestion, ordinary-turn capture, retrieval, projection, and context assembly end-to-end
- no dual semantic authority after cutover
- no permanent coexistence where both systems remain active and user-visible
- no legacy write path after cutover
- no legacy retrieval truth after cutover
- no indefinite "deprecated but still wired" phase
- deletion is part of the plan, not an optional cleanup

## Desired end state

After completion:

- `model-memory` is the only active memory system
- memory truth lives in the new logical database and derived runtime layers
- agent memory tooling reads from `model-memory`
- runtime bootstrap projections and packs replace legacy workspace-memory authority
- the legacy semantic memory plugins, managers, docs, and config surfaces are removed
- continuity-producing markdown hooks are either preserved or replaced by an
  equivalent daily-artifact contract before removal
- old memory runtime state is exported if needed, then deleted from the VPS

## Legacy surface inventory

### Runtime code to retire

- `src/memory/`
- `src/agents/tools/memory-tool.ts`
- `src/agents/memory-search.ts`
- `src/cli/memory-cli.ts`
- `src/gateway/server-startup-memory.ts`
- `src/gateway/server-methods/doctor.ts`
- `src/hooks/bundled/session-memory/handler.ts` unless an equivalent canonical
  daily-artifact producer replaces it first

### Bundled plugins to retire

- `extensions/memory-core/`
- `extensions/memory-lancedb/`

### Public SDK seams to retire or replace

- `src/plugin-sdk/memory-core.ts`
- `src/plugin-sdk/memory-lancedb.ts`

### Config and slot surfaces to retire or rewrite

- `plugins.slots.memory`
- `agents.defaults.memorySearch.*`
- `memory.backend`
- legacy memory-specific help, labels, and validation

### Docs to retire or rewrite

- `docs/concepts/memory.md`
- `docs/cli/memory.md`
- `docs/automation/hooks.md`
- any onboarding or status docs that describe `MEMORY.md`, `memory/*.md`, QMD, sqlite memory search, or session-memory as the canonical memory architecture

### Runtime state to delete from hosts later

- legacy workspace memory files or continuity surfaces that may later move or
  change ownership:
  - `MEMORY.md`
  - `memory/*.md`
- legacy search state such as:
  - sqlite memory indexes under the OpenClaw state dir
  - QMD state under agent runtime directories
  - LanceDB memory stores if deployed anywhere

Those paths must be exported or snapshotted first if any historical retention is required.

## Preconditions before cutover planning becomes executable

The following must exist in `model-memory` before any production cutover begins:

1. document ingestion end-to-end
2. ordinary-turn capture end-to-end
3. deterministic write path
4. retrieval end-to-end
5. projection compiler for bootstrap surfaces
6. context engine integration for the intended runtime path
7. audited proof corpus green for cutover scope
8. operational observability for write rate, retrieval quality, drift, and false positives

If any of those are missing, cutover planning may continue on paper, but production execution must not start.

## Cutover phases

## Phase A - legacy freeze

Goal:

- stop growing the old system while the new one is being built

Actions:

- treat the legacy memory stack as maintenance-only
- do not add new product behavior to:
  - `src/memory/`
  - `extensions/memory-core/`
  - `extensions/memory-lancedb/`
  - legacy memory docs
- redirect all new memory architecture work into `extensions/model-memory`

Exit bar:

- no new feature work lands in the legacy memory stack after this decision

## Phase B - ingestion and bootstrap preservation

Goal:

- make sure cutover does not destroy human-authored memory content

Actions:

- audit live workspace `MEMORY.md` and `memory/*.md` usage on real environments
- define one-time ingestion/export tooling from legacy markdown memory into `model-memory`
- define the preservation rule for anything that should remain human-owned rather than be normalized into canonical objects
- define how current `USER.md` and future projected `USER.md` interact

Exit bar:

- there is a written migration path for existing workspace memory content
- no human-authored memory will be overwritten blindly during projection activation

## Phase C - shadow mode and parity evidence

Goal:

- prove the new system against live inputs without changing user-visible behavior

Actions:

- enable shadow mode behind an explicit flag
- mirror live document and turn inputs into `model-memory`
- keep legacy memory behavior user-visible during this phase
- collect comparison telemetry for:
  - capture rate
  - false positives
  - omission rate
  - retrieval usefulness
  - projection usefulness

Hard rule:

- shadow mode must not write back into legacy memory
- legacy memory must not shape `model-memory` semantics

Exit bar:

- shadow telemetry is stable enough to show the new system can replace the legacy one
- major false-positive or omission failure modes are understood

## Phase D - surface-by-surface replacement

Goal:

- replace the legacy surface in a controlled order instead of one giant flip

Replacement order:

1. bootstrap and projection surfaces
   - activate generated `MEMORY.md`, `USER.md`, and `AGENTS.md` sections as derived views
2. agent retrieval tools
   - replace legacy `memory_search` and `memory_get` behavior with `model-memory` retrieval and targeted object-backed reads
3. agent system-prompt guidance
   - remove instructions that treat workspace markdown memory as the canonical truth source
4. CLI and admin surfaces
   - replace `openclaw memory ...` behavior with `model-memory` admin and inspection commands
5. status and doctor surfaces
   - point operational reporting to the new system
6. startup services and background initialization
   - remove legacy QMD/sqlite startup behavior
7. session-memory hook behavior
   - preserve the markdown-write hook while canonical daily continuity artifacts
     still depend on it
   - only replace or remove it after a proven equivalent daily-artifact
     producer exists

Rule:

- do not replace a downstream surface until the upstream `model-memory` capability is already proven

Exit bar:

- every user-visible or operator-visible memory surface points to `model-memory`
- the legacy stack is no longer on the active path

## Phase E - production cutover

Goal:

- make `model-memory` the only live memory authority

Actions:

- switch the default active memory behavior to `model-memory`
- remove legacy memory plugins from default slots and startup assumptions
- stop legacy memory writes
- stop legacy memory retrieval from agent tools and runtime
- keep rollback capability only for a short explicit stabilization window

Hard rule:

- after production cutover, there must be exactly one semantic memory authority

Exit bar:

- all active runtime memory behavior uses `model-memory`
- rollback decision window is explicit and time-bounded

## Phase F - retirement

Goal:

- remove legacy runtime support after the stabilization window

Actions:

- remove legacy config wiring:
  - `plugins.slots.memory`
  - legacy memory-search config surfaces
  - `memory.backend`
- remove legacy plugin registration and loader references
- remove legacy tool registration paths
- rewrite docs so they no longer describe workspace markdown memory as the core system
- remove legacy tests that only prove the retired stack

Exit bar:

- the repo no longer documents or wires the legacy stack as a supported runtime path

## Phase G - deletion

Goal:

- delete legacy code and host state completely

Repo deletion targets:

- `src/memory/`
- `extensions/memory-core/`
- `extensions/memory-lancedb/`
- plugin-sdk subpaths that exist only for those plugins
- legacy memory CLI, tool, search, startup, and hook code
- legacy docs and config help that no longer apply

Host-state deletion targets:

- legacy markdown memory files after export or migration
- legacy sqlite memory indexes
- legacy QMD runtime state
- legacy LanceDB stores

Exit bar:

- legacy code is deleted from `main`
- legacy runtime data is deleted from the VPS
- no production path can still call the old stack

## Required evidence before production cutover

Minimum evidence set:

- proof corpus green for ingestion, write-path behavior, retrieval, and projection
- shadow-mode evidence from live traffic
- operational metrics for false positives and omission behavior
- retrieval quality evidence good enough to replace `memory_search`
- bootstrap projection evidence good enough to replace workspace-memory authority
- migration/export tooling tested on real sample legacy data

## Rollback policy

Rollback is allowed only during the explicit stabilization window immediately
after production cutover.

Rollback must:

- disable `model-memory` directly
- preserve all `model-memory` data written during the cutover window
- keep the legacy memory stack disabled on the active path
- fall back to native no-memory behavior instead of restoring the old
  heuristic memory stack

After the stabilization window closes, the plan is forward-fix only and then
delete the legacy stack.

## VPS purge plan

The final host cleanup must happen as an explicit operational step, not as an implied side effect of a code merge.

Required steps:

1. export or snapshot any legacy memory data that still matters
2. disable the legacy runtime path on the host
3. verify no legacy memory process or background updater is still active
4. delete legacy memory state directories and indexes
5. verify the new system is the only active memory path

The purge is not complete until both repo code and deployed runtime state are gone.

## Non-goals

- no attempt to preserve legacy semantic architecture inside `model-memory`
- no permanent compatibility bridge that keeps the old system alive indefinitely
- no migration that treats old markdown/vector artifacts as the new semantic truth without re-normalization
- no dual-memory product state where users and operators must reason about two active systems

## Planning outputs still needed later

This document defines the retirement strategy.

Before production execution, we still need:

- a cutover runbook
- a rollback runbook
- a host purge runbook for the VPS
- a final deletion checklist mapped to exact files and operational paths

Those are now being defined by:

- [Cutover Plan](/projects/model-memory/cutover-plan)
- [Cutover Checklist](/projects/model-memory/cutover-checklist)
