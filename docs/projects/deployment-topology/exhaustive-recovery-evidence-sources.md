---
summary: "Ranked evidence sources for the exhaustive recovery manifest."
title: "Exhaustive Recovery Evidence Sources"
---

# Exhaustive Recovery Evidence Sources

This inventory ranks the evidence surfaces used for the exhaustive recovery
manifest.

It exists so later restoration work can distinguish:

- implementation truth
- live runtime truth
- host-only operational truth
- roadmap or runbook intent
- archive-only historical evidence

## Authority scale

- `primary_live_runtime`: current live runtime or host surface that is actively
  in use
- `primary_implementation`: prior implementation surface that preserves the
  actual built asset
- `secondary_runbook`: operator-facing documentation or workflow guidance
- `secondary_archive`: freeze or snapshot evidence used to confirm drift

## Evidence inventory

| Source path                                                                  | Source type                     | Authority level          | Primary capability domains proved                                                                |
| ---------------------------------------------------------------------------- | ------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| `/root/.openclaw/workspace/projects/github/**`                               | legacy workspace project        | `primary_implementation` | GitHub digest SQL, workflow exports, Telegram bridge script                                      |
| `/root/.openclaw/workspace/projects/intake/**`                               | legacy workspace project        | `primary_implementation` | intake routing schema, routing spec, workflow exports                                            |
| `/root/.openclaw/workspace/projects/live_app_patches/**`                     | legacy workspace patch archive  | `primary_implementation` | session-selector guardrails, web-research delegation, x-manager seed, runtime hotfix lineage     |
| `/root/.openclaw/workspace/projects/ops/**`                                  | legacy workspace project        | `primary_implementation` | operator review prep, cron hygiene, memory reporting, disk and Docker maintenance                |
| `/root/.openclaw/workspace/projects/roles/**`                                | legacy workspace project        | `primary_implementation` | role-library adaptation and specialist role specs                                                |
| `/root/.openclaw/workspace/projects/web_stack/**`                            | legacy workspace project        | `primary_implementation` | Main browsing contract and web-research delegation spec                                          |
| `/root/.openclaw/workspace/projects/workflows/**`                            | legacy workspace project        | `primary_implementation` | x-manager workflow and approval-queue durable outlines                                           |
| `/root/.openclaw/workspace/projects/channel_identity/**`                     | legacy workspace project        | `primary_implementation` | public channel identity framework and account-specific notes                                     |
| `/root/.openclaw/workspace/projects/build-performance/**`                    | legacy workspace project        | `primary_implementation` | Turbo and build-performance planning surfaces                                                    |
| `/root/.openclaw/workspace/projects/maintenance/**`                          | legacy workspace project        | `primary_implementation` | maintenance control docs, debt register, test matrix, memory push spec                           |
| `/root/.openclaw/workspace/AGENTS.md` and peer bootstrap files               | shared runtime workspace pack   | `primary_live_runtime`   | shared bootstrap pack content, Main delegation rules, workspace-level user profile               |
| `/root/.openclaw/workspace/memory/*.md`                                      | shared runtime workspace memory | `primary_live_runtime`   | daily memory ingestion layer                                                                     |
| `/root/.openclaw/workspace/runbooks/**`                                      | live runbooks                   | `secondary_runbook`      | operator model, webhook gateway operations, maintenance sweep expectations                       |
| `/root/openclaw-config/agent-workspaces/**`                                  | live host bind-mounted packs    | `primary_live_runtime`   | specialist agent packs, populated `USER.md`, x-manager account context, restored workspace seeds |
| `/root/openclaw-config/openclaw-sanitized.json`                              | sanitized host config snapshot  | `secondary_archive`      | partial agent/config baseline, pre-runtime sanitized config snapshot                             |
| `docker exec openclaw-runtime openclaw config get agents --json`             | live runtime config             | `primary_live_runtime`   | actual current configured agents, tool policies, workspace mapping                               |
| `docker exec openclaw-runtime openclaw agents list --json`                   | live runtime view               | `primary_live_runtime`   | currently configured runtime agents plus stale plugin warnings                                   |
| `crontab -l`                                                                 | live host scheduler             | `primary_live_runtime`   | active and disabled host-side automation                                                         |
| `/root/services/webhook-gateway/**`                                          | live host service tree          | `primary_live_runtime`   | n8n sync check, DB probe, gateway service assets                                                 |
| `/root/backups/openclaw-roadmap-freeze-2026-03-23/ROADMAP.md`                | roadmap freeze                  | `secondary_archive`      | completed capability claims and historical sequencing                                            |
| `/root/backups/openclaw-structure-freeze-2026-03-24/**`                      | structure freeze                | `secondary_archive`      | pre-consolidation bootstrap pack, runbooks, project layout                                       |
| `docs/projects/deployment-topology/missing-functionality-recovery-audit.md`  | prior canonical audit           | `secondary_runbook`      | earlier recovery synthesis that this exhaustive pass tightens                                    |
| `docs/projects/deployment-topology/missing-functionality-recovery-matrix.md` | prior canonical matrix          | `secondary_runbook`      | earlier capability classification baseline                                                       |

## Current rule

- prefer live runtime and direct implementation evidence over memory or
  historical chatter
- use roadmap and freeze copies to prove prior existence, not current health
- do not treat sanitized host config snapshots as fully authoritative when the
  live runtime disagrees
- restoration work should cite the strongest available evidence surface per item
