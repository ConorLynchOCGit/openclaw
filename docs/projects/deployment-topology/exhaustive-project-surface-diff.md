---
summary: "Per-project diff of legacy workspace project surfaces against the canonical repo."
title: "Exhaustive Project Surface Diff"
---

# Exhaustive Project Surface Diff

This document compares every legacy workspace project surface against the
canonical live repo and current live runtime.

It is project-surface focused. The master recovery classifications live in the
recovery manifest.

## Project surface diff

| Legacy project surface        | Function summary                                                           | Current canonical repo state                                                                                                                       | Current runtime or host state                                                                                                       | Classification          | Recovery direction                                                                          |
| ----------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| `projects/github/`            | GitHub digest SQL, webhook ingest workflow exports, Telegram digest bridge | canonical repo now owns the digest SQL, workflow JSON, digest script, and Telegram helper under `ops/github/` and `ops/telegram/`                  | live host cron now runs the committed repo-owned digest script                                                                      | `already_present`       | keep the committed automation lane aligned with the live webhook and digest contract        |
| `projects/intake/`            | generic intake schema, routing contract, workflow exports                  | canonical intake project workspace now exists under `docs/projects/intake-routing/`, with committed schema and workflow assets under `ops/intake/` | live webhook-gateway export set still contains `Generic Intake` and `Intake Router`; local ingress probe returns `401 Unauthorized` | `already_present`       | keep the committed intake assets aligned with the live webhook-gateway lane                 |
| `projects/live_app_patches/`  | runtime hotfix lineage, replay notes, restored specialist seeds            | canonical repo now carries a tranche-specific patch-lineage record under deployment-topology                                                       | bundles still exist in the legacy workspace and remain historical proof                                                             | `already_present`       | keep the canonical lineage record updated while later tranches extract remaining proof      |
| `projects/ops/`               | operator review prep, cron hygiene, memory reporting, maintenance jobs     | active automation now lives in committed `ops/host/` and `ops/reviews/`; standalone legacy memory-reporting cron lane is retired                   | live host cron now runs the committed repo-owned copies for the active scripts                                                      | `already_present`       | keep the restored review-support lane aligned and close the remaining daily output bug      |
| `projects/maintenance/`       | maintenance debt register, test matrix, workspace refactor foundation      | canonical maintenance workspace now exists under `docs/projects/maintenance/`                                                                      | live weekly maintenance cron now points at the canonical repo docs                                                                  | `already_present`       | keep the maintenance control inputs aligned with the live weekly guard                      |
| `projects/memory/`            | legacy memory coordination project                                         | replaced by `docs/projects/model-memory/` and `extensions/model-memory/`                                                                           | not needed as a live forward implementation surface                                                                                 | `intentionally_retired` | keep as archive-only historical context                                                     |
| `projects/roles/`             | role-library adaptation and specialist role specs                          | retained subset now lives under `docs/projects/agent-foundation/specs/role-library-adaptations.md`                                                 | mapped live agents now exist and use canonized runtime-source packs                                                                 | `already_present`       | keep the retained lineage under agent-foundation rather than reviving a second project      |
| `projects/web_stack/`         | Main browsing routing and web-research delegation specs                    | canonical repo now owns the higher-level browsing and delegation contract in runtime code plus durable recovery docs                               | live runtime is ready to consume the restored contract after rebuild                                                                | `already_present`       | keep the contract aligned with the live runtime and future agent-pack work                  |
| `projects/workflows/`         | x-manager workflow outlines and approval-queue schema                      | active subset is already absorbed into `docs/agents/x-manager/runtime/context/` and the canonized `x-manager` runtime-source pack                  | live `x-manager` behavior now reads from the canonized pack rather than legacy workflow notes                                       | `already_present`       | keep the active subset under the x-manager pack; treat the old outlines as historical proof |
| `projects/channel_identity/`  | channel/account identity framework and personal profile notes              | no standalone canonical workspace restored; active account-specific subset is absorbed into `docs/agents/x-manager/runtime/context/accounts/`      | no separate live runtime lane depends on a standalone channel-identity project                                                      | `intentionally_retired` | keep the broader framework archive-only unless later live use proves otherwise              |
| `projects/build-performance/` | Turbo/build-performance planning and host execution posture                | retained subset now lives under `docs/projects/turborepo/specs/legacy-build-performance-surface.md`                                                | no separate live runtime lane depends on the old standalone project                                                                 | `already_present`       | keep retained planning folded into the turborepo project                                    |

## Observations

- the worst losses are not the low-level browser/search plugins; they are the
  durable operating contracts and workflow assets that sat above them
- `projects/ops/`, `projects/github/`, `projects/intake/`, and
  `projects/live_app_patches/` are the highest-signal legacy project surfaces
  because they contain either still-live automation or the only surviving copy
  of prior implementation work
- `projects/maintenance/` is not harmless background material because the live
  weekly maintenance job still depends on documents from that surface
