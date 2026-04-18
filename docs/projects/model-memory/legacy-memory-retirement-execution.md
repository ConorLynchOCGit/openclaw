---
summary: "Execution inventory for retiring the legacy memory stack after production cutover."
title: "Legacy Memory Retirement Execution"
---

# Legacy Memory Retirement Execution

This document records the exact legacy-memory surfaces still present after the
`model-memory` production cutover, the correct action for each surface, and the
current proof state.

## Baseline

Repo baseline on `main` at review time:

- git root: `/root/services/openclaw-roles/live`
- live runtime container: `openclaw-runtime`
- live runtime config:
  - `plugins.slots.memory = "none"`
  - `agents.defaults.memorySearch.enabled = false`
  - `plugins.entries.model-memory.enabled = true`
  - `plugins.entries.model-memory.config.live.enabled = true`

Observed runtime continuity/state surfaces still present:

- `/root/.openclaw/workspace/MEMORY.md`
- `/root/.openclaw/workspace/memory/`
- `/root/.openclaw/memory/*.sqlite`
- no live QMD directories found
- no live LanceDB directories found

## Already retired before this slice

These user-listed legacy paths were already gone at the start of this sprint.

| Surface                           | Current state  | Why this matters                                                          |
| --------------------------------- | -------------- | ------------------------------------------------------------------------- |
| `src/memory/`                     | already absent | the old core runtime tree is no longer present as a top-level source root |
| `src/agents/tools/memory-tool.ts` | already absent | the older dedicated agent memory tool file is already gone                |
| `src/cli/memory-cli.ts`           | already absent | the older standalone memory CLI entrypoint is already gone                |

## Runtime code and config surfaces

| Surface                                                                     | Current role                                                                                                   | Retirement action    | Safe now                  | Proof needed before removal                                                                      |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/hooks/bundled/session-memory/handler.ts`                               | `/new` and `/reset` hook that finalizes canonical daily markdown continuity under `<workspace>/memory/`        | `preserve`           | yes                       | keep continuity-production role explicit while semantic authority stays in `model-memory`        |
| `src/hooks/bundled/session-memory/HOOK.md`                                  | user-facing hook metadata for the same continuity automation                                                   | `preserve`           | yes                       | hook remains discoverable and accurately documented                                              |
| `src/hooks/bundled/session-memory/handler.test.ts`                          | tests for the continuity-producing hook                                                                        | `preserve`           | yes                       | tests must continue to prove dated artifact creation and transcript fallback behavior            |
| `src/agents/memory-search.ts`                                               | resolves legacy memory-search config and storage path behavior                                                 | `replace`            | no                        | active config/schema/tool surfaces must stop depending on `agents.defaults.memorySearch.*` first |
| `src/gateway/server-startup-memory.ts`                                      | gateway startup seam; legacy QMD fallback removed in this sprint, file now only arms model-memory live runtime | `partially_replaced` | done for startup fallback | deeper status/doctor/config cleanup still needed                                                 |
| `src/commands/status.scan-memory.ts`                                        | still reports legacy memory-search status                                                                      | `replace`            | no                        | status output contract must be reworked around model-memory-only truth                           |
| `src/commands/doctor-memory-search.ts`                                      | still audits and repairs legacy memory-search / dreaming surfaces                                              | `replace`            | no                        | operator doctor flow must have a model-memory-native replacement                                 |
| `src/gateway/server-methods/doctor.ts`                                      | still exposes dreaming/legacy memory artifact maintenance paths                                                | `replace`            | no                        | doctor RPC contract must be narrowed or rewritten                                                |
| `src/plugin-sdk/memory-core.ts`                                             | legacy public SDK facade for bundled `memory-core`                                                             | `delete`             | no                        | downstream imports and plugin-sdk docs must be removed first                                     |
| `src/plugin-sdk/memory-lancedb.ts`                                          | legacy public SDK facade for bundled `memory-lancedb`                                                          | `delete`             | no                        | downstream imports/docs/tests must be removed first                                              |
| `src/gateway/tools-invoke-http.ts` (`memory_search`/`memory_get` gate text) | still advertises legacy memory tool enablement                                                                 | `replace`            | no                        | tool catalog and gateway tool availability must be rewritten first                               |
| `src/agents/tool-catalog.ts` (`memory_search`, `memory_get`)                | still exposes legacy memory tools as first-class tools                                                         | `replace`            | no                        | model-memory retrieval/read contract must replace tool-facing behavior first                     |
| `src/agents/system-prompt.ts` (`buildMemoryPromptSection`)                  | still allows legacy plugin prompt contribution into the system prompt                                          | `replace`            | no                        | prompt contract must point only to model-memory retrieval/context behavior                       |

## Bundled plugin surfaces

| Surface                      | Current role                                                                                                 | Retirement action | Safe now | Proof needed before removal                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------- | -------- | ----------------------------------------------------------------------------- |
| `extensions/memory-core/`    | legacy bundled semantic search, `memory_search`, `memory_get`, dreaming, flush-plan, public-artifact runtime | `delete`          | no       | loader, QA, config schema, docs, and tool surfaces still reference it heavily |
| `extensions/memory-lancedb/` | legacy bundled memory plugin with install-on-demand runtime                                                  | `delete`          | no       | plugin loader/tests/docs still reference the package and slot behavior        |

## CLI, status, loader, and config compatibility surfaces

| Surface                                                                                                       | Current role                                                                      | Retirement action | Safe now | Proof needed before removal                                                             |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------- | -------- | --------------------------------------------------------------------------------------- |
| `plugins.slots.memory`                                                                                        | compatibility slot still recognized even though live cutover keeps it at `"none"` | `delete`          | no       | plugin loader and status output must stop assuming a memory slot exists                 |
| `agents.defaults.memorySearch.*`                                                                              | compatibility config remains parseable though disabled in live config             | `delete`          | no       | config schema/help/validation and all runtime readers must be removed together          |
| `memory.backend`                                                                                              | legacy backend selector still documented and validated                            | `delete`          | no       | doctor/status/config migration flows must stop referring to builtin/qmd memory backends |
| `src/plugins/slots.ts` default `memory: "memory-core"`                                                        | old slot default remains encoded in plugin slot logic                             | `replace`         | no       | slot registry must stop carrying a memory slot at all                                   |
| `src/plugins/config-state.ts`, `src/plugins/loader.ts`, `src/plugins/channel-plugin-ids.ts`                   | still carry legacy memory plugin assumptions                                      | `replace`         | no       | plugin activation/runtime must be model-memory-only before removal                      |
| `src/config/schema.*`, `src/config/validation.ts`, `src/config/schema.help.ts`, `src/config/schema.labels.ts` | still expose legacy memory configuration and help                                 | `replace`         | no       | user-facing config surface must be rewritten after runtime readers are removed          |

## Docs and onboarding surfaces

| Surface                                                                                                                                         | Current role                                                                                  | Retirement action | Safe now | Proof needed before removal                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------- | -------- | ------------------------------------------------------ |
| `docs/concepts/memory.md`                                                                                                                       | now rewritten to state model-memory as current authority and legacy memory as retirement debt | `rewritten`       | done     | none                                                   |
| `docs/cli/memory.md`                                                                                                                            | now rewritten as a retirement/compatibility note instead of current authority docs            | `rewritten`       | done     | none                                                   |
| `docs/automation/hooks.md`                                                                                                                      | documents `session-memory` as an available bundled continuity hook                            | `rewritten`       | done     | keep authority wording aligned                         |
| `docs/help/faq.md`, `docs/reference/memory-config.md`, `docs/gateway/configuration-reference.md`, `docs/tools/plugin.md`, `docs/tools/index.md` | still contain legacy user-facing memory search, slot, or backend guidance                     | `rewrite`         | no       | config/runtime code removal sequence must settle first |

## Host/runtime state surfaces

| Surface                               | Current role                                          | Retirement action       | Safe now                      | Proof needed before removal                                         |
| ------------------------------------- | ----------------------------------------------------- | ----------------------- | ----------------------------- | ------------------------------------------------------------------- |
| `/root/.openclaw/workspace/MEMORY.md` | human-owned continuity plus generated projection zone | `preserve`              | yes                           | preservation and overwrite rules documented                         |
| `/root/.openclaw/workspace/memory/`   | daily continuity and daily-summary source surface     | `preserve_then_migrate` | no                            | one-time export/ingest and daily-summary dependency review complete |
| `/root/.openclaw/memory/*.sqlite`     | legacy sqlite memory stores                           | `export_then_delete`    | yes for export, no for delete | snapshot complete and no runtime reader remains                     |
| QMD state                             | not found in live runtime                             | `none`                  | yes                           | keep absence documented                                             |
| LanceDB state                         | not found in live runtime                             | `none`                  | yes                           | keep absence documented                                             |

## Current blocker set

The full repo-side deletion tranche is not yet complete because the remaining
legacy stack is still threaded through these coupled areas:

1. plugin loader and slot assumptions
2. tool catalog and prompt guidance (`memory_search`, `memory_get`)
3. status/doctor/config schema/help surfaces
4. QA and runtime tests that still assume `memory-core` exists
5. remaining lower-level docs and SDK surfaces that still describe or export the legacy stack
6. any future attempt to retire `session-memory` must first replace its daily
   continuity artifact contract

Those are not paper blockers; they are direct code dependencies found in the
current repo.

## What this sprint can execute safely

- snapshot continuity and legacy sqlite state
- preserve the `session-memory` hook and keep it documented as continuity-only
- remove the legacy gateway startup fallback to QMD/plugin memory
- implement richer Skill Vetting artifact/reporting
- rewrite the highest-signal legacy docs so model-memory is the stated
  authority
- record exact remaining blocker seams for the deeper `memory-core` /
  `memorySearch` deletion tranche
