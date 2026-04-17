---
summary: "Inventory of current memory-bearing surfaces and their target homes in the revised topology."
title: "Memory Surface Inventory"
---

# Memory Surface Inventory

This inventory preserves the intended three-layer memory architecture:

1. durable human-owned memory-bearing sources
2. DB-backed `model-memory` generative projection
3. daily memory files as episodic and ingestion layer

## Important current truth

This repo does not currently contain a tracked top-level `MEMORY.md` or tracked
repo-local `memory/` daily directory.

That means this slice is primarily about:

- runtime contract documentation
- canonical target-home definition
- compatibility mapping
- runtime compatibility assembly that preserves the generated memory pointer
  layer without flattening it into authored docs

rather than relocating a repo-tracked memory corpus.

## Current memory-bearing surfaces in this repo

| Surface                                                                                            | Class                          | Current role                                                  | Target home                                                                  |
| -------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `docs/system/memory.md`                                                                            | system control/pointer         | global memory control surface                                 | remains `docs/system/memory.md`                                              |
| `docs/concepts/memory.md`                                                                          | public product doc             | user-facing memory concept doc                                | stays as public product documentation                                        |
| `docs/cli/memory.md`                                                                               | public operator doc            | CLI/operator behavior                                         | stays as public operator documentation                                       |
| `extensions/model-memory/src/runtime/projections/targets.ts`                                       | generated projection contract  | defines generated `MEMORY.md`, `USER.md`, `AGENTS.md` targets | remains code truth for projection targets until runtime alignment extends it |
| `docs/projects/model-memory/specs/workspace-projections-bootstrap-files.md`                        | architecture spec              | documents generated bootstrap projection policy               | remains model-memory architecture source                                     |
| `extensions/memory-core/**` and `src/memory-host-sdk/**` references to `MEMORY.md` / `memory/*.md` | runtime compatibility behavior | reads curated memory and daily memory                         | remains runtime compatibility behavior until later cutover or refactor       |

## Target memory content classes

| Content class                      | Target canonical home                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| system evergreen knowledge         | `docs/system/` durable docs                                                                            |
| project evergreen knowledge        | `docs/projects/<project>/` durable docs                                                                |
| agent evergreen knowledge          | future `docs/agents/<agent-id>/` durable docs                                                          |
| DB-backed generative memory digest | generated runtime artifact under `.openclaw/model-memory/` plus runtime-facing compatibility rendering |
| daily episodic memory              | `memory/*.md` in the workspace runtime layer; preserved as official ingestion input                    |
| archive/history                    | explicit archive surfaces when durable but no longer active                                            |

## Canonicalization rule

- do not flatten DB-backed generated memory into hand-authored docs
- do not flatten daily memory into evergreen docs
- do not force public docs like `docs/concepts/memory.md` into runtime truth
- runtime-facing `MEMORY.md` should become a compatibility artifact that cleanly
  reflects durable and generated sources
- assembled `MEMORY.md` should point to generated memory rather than pretending
  the pointer block is the memory itself
