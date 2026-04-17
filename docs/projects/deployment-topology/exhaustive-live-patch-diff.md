---
summary: "Diff of live patch bundles against current repo and runtime state."
title: "Exhaustive Live Patch Diff"
---

# Exhaustive Live Patch Diff

This document audits the live patch families preserved under the legacy
workspace.

The goal is to separate:

- patch bundles whose underlying capability already landed in the repo
- patch bundles that still encode missing durable functionality
- patch bundles that remain valuable historical proof only

## Patch family diff

| Patch family                  | Primary function captured                                                                        | Current canonical repo state                                                                                     | Current runtime or host state                                                                        | Classification               | Recovery direction                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `openclaw-2026.3.24`          | earlier session-selector/UI rendering fixes, including `ui-src-ui-app-render.helpers.ts.patch`   | current repo now carries the tranche-1 specialist-session label and hidden-session guardrails                    | historical patch family still exists as proof, but the tranche-1 behavior no longer depends on it    | `already_present`            | keep as historical proof only for tranche-1 surfaces                       |
| `openclaw-runtime-2026-03-27` | builder runtime pack and phase-10 builder runtime patch                                          | builder runtime config exists, but durable builder pack content is not canonized                                 | host bind mount still carries the builder workspace seed                                             | `must_canonize_from_runtime` | use the patch family as evidence while canonizing the builder durable pack |
| `openclaw-runtime-2026-03-28` | x-manager runtime enablement and workspace seed                                                  | canonical repo now owns the x-manager runtime sources and account context under `docs/agents/x-manager/runtime/` | live workspace was resynced from canonical repo-owned sources                                        | `already_present`            | keep as historical proof only for tranche-1 surfaces                       |
| `openclaw-runtime-2026-03-29` | specialist session labels plus x-manager approval and brand-context files                        | current repo now owns both the session-UI guardrails and the x-manager context files                             | host workspace and runtime now consume the canonized equivalents                                     | `already_present`            | keep as historical proof only for tranche-1 surfaces                       |
| `openclaw-runtime-2026-03-30` | Main browsing, web-research delegation, session visibility, browser access, agent boundary fixes | current repo now owns the restored Main browsing contract and web-research delegation guidance                   | patch family remains useful proof, but the runtime no longer needs it as the primary source of truth | `already_present`            | keep as historical proof only for tranche-1 surfaces                       |
| `webhook-gateway-2026-03-27`  | `db_probe.sh` and `n8n_sync_check.sh` gateway probes                                             | repo does not currently own the live gateway probe scripts                                                       | host cron still runs the concrete scripts from `/root/services/webhook-gateway/`                     | `must_canonize_from_runtime` | canonize the gateway probe scripts and their operational contract          |

## Current rule

- do not restore patch files blindly into the repo as the final form
- use patch families to recover the underlying durable functionality and then
  replace them with canonical repo-owned sources
- keep the patch families themselves as historical evidence until the recovery
  lane is complete
