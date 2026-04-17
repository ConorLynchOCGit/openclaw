---
summary: "Diff of legacy and live agent workspace packs against current canonical durable sources."
title: "Exhaustive Agent Pack Diff"
---

# Exhaustive Agent Pack Diff

This document compares the legacy and live agent workspace packs against the
canonical repo.

The goal is to separate:

- runtime packs that still exist only on host state
- runtime packs that are active and need canonization
- packs that are present only as stale leftovers
- packs whose target ownership still needs an explicit decision

## Agent pack diff

| Agent pack or surface                                      | Prior durable files or context                                                                                                 | Current canonical repo state                                                                                                           | Current runtime or host state                                                                                                        | Classification    | Next action                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------- |
| shared workspace pack (`main` plus shared bootstrap files) | `AGENTS.md`, `IDENTITY.md`, `MEMORY.md`, `SOUL.md`, `TOOLS.md`, `USER.md`, `memory/*.md`                                       | canonical runtime-source files now exist under `docs/agents/main/runtime/`, with the shared authored bootstrap pack owned in repo docs | live shared workspace pack has been resynced from the canonical repo-owned runtime-source files                                      | `already_present` | keep the shared pack aligned as the canonical authored source for Main and Chief               |
| `builder` dedicated pack                                   | `AGENTS.md`, `HEARTBEAT.md`, `IDENTITY.md`, `SOUL.md`, `TOOLS.md`                                                              | canonical runtime-source files now exist under `docs/agents/builder/runtime/`                                                          | live runtime uses `/home/node/.openclaw/agent-workspaces/builder`; runtime-source seed now matches the live pack                     | `already_present` | keep the seed aligned until a richer authored Builder pack is justified                        |
| `researcher` dedicated pack                                | `AGENTS.md`, `HEARTBEAT.md`, `IDENTITY.md`, `SOUL.md`, `TOOLS.md`                                                              | canonical runtime-source files now exist under `docs/agents/researcher/runtime/`                                                       | live runtime uses `/home/node/.openclaw/agent-workspaces/researcher`; runtime-source seed now matches the live pack                  | `already_present` | keep the seed aligned and decide separately whether to initialize or retire later              |
| `writer` dedicated pack                                    | `AGENTS.md`, `HEARTBEAT.md`, `IDENTITY.md`, `SOUL.md`, `TOOLS.md`                                                              | canonical runtime-source files now exist under `docs/agents/writer/runtime/`                                                           | live runtime uses `/home/node/.openclaw/agent-workspaces/writer`; runtime-source seed now matches the live pack                      | `already_present` | keep the seed aligned until a richer authored Writer pack is justified                         |
| `web-researcher` dedicated pack                            | `AGENTS.md`, `BOOTSTRAP.md`, `HEARTBEAT.md`, `IDENTITY.md`, `SOUL.md`, `TOOLS.md`, `USER.md`                                   | canonical runtime-source files now exist under `docs/agents/web-researcher/runtime/`                                                   | live runtime workspace was resynced from the canonical repo-owned runtime-source files                                               | `already_present` | keep the pack canonized and extend it in the later broader agent-pack slice                    |
| `x-manager` dedicated pack and context                     | `AGENTS.md`, `HEARTBEAT.md`, `IDENTITY.md`, `SOUL.md`, `TOOLS.md`, `USER.md`, account context, approval policy, platform rules | canonical runtime-source files and account context now exist under `docs/agents/x-manager/runtime/`                                    | live runtime workspace was resynced from the canonical repo-owned runtime-source files and account context                           | `already_present` | keep the pack canonized and extend it in the later broader agent-pack slice                    |
| `chief` dedicated pack                                     | `AGENTS.md`, `HEARTBEAT.md`, `IDENTITY.md`, `SOUL.md`, `TOOLS.md`                                                              | no separate canonical Chief pack exists, because Chief intentionally shares the canonical Main pack under `docs/agents/main/`          | a historical dedicated Chief pack still exists on host state, but live runtime intentionally maps Chief to the shared main workspace | `already_present` | keep Chief on the shared Main pack unless a later slice intentionally promotes a separate pack |

## Key findings

- the biggest agent-pack loss was not that the agents vanished entirely; it was
  that their durable authored surfaces had not yet been canonized into
  repo-owned sources
- `web-researcher` and `x-manager` were the richest specialist packs and are
  now the first canonized specialist-pack footholds under `docs/agents/`
- `builder`, `researcher`, and `writer` now also have bounded canonical
  runtime-source seeds, which closes the repo-missing pack drift even though
  they remain light packs
- the populated `USER.md` surfaces matter because they encode behavioral
  constraints and brand or task context, not cosmetic prose
- the remaining host-only Chief pack is historical residue; the live ownership
  model is now explicit, with Chief intentionally sharing the canonical Main
  workspace pack
