---
summary: "Capability matrix for functionality that existed before consolidation and now needs canonization, repair, or explicit retirement."
title: "Missing Functionality Recovery Matrix"
---

# Missing Functionality Recovery Matrix

This matrix tracks capabilities that were evidenced in the pre-pointer workspace
and compares them against the current canonical repo and current live runtime.

Authoritative roadmap baseline for this audit:

- `/root/.openclaw/workspace/core/ROADMAP.md`

Supporting evidence surfaces:

- `/root/.openclaw/workspace/projects/**`
- `/root/.openclaw/workspace/runbooks/**`
- `/root/.openclaw/workspace/archives/**`
- `/root/backups/openclaw-structure-freeze-2026-03-24/**`
- live host crontab
- live `openclaw-runtime` container state

Strict successor artifacts:

- [Exhaustive Recovery Manifest](/projects/deployment-topology/exhaustive-recovery-manifest)
- [Exhaustive Project Surface Diff](/projects/deployment-topology/exhaustive-project-surface-diff)
- [Exhaustive Host Automation Diff](/projects/deployment-topology/exhaustive-host-automation-diff)
- [Exhaustive Live Patch Diff](/projects/deployment-topology/exhaustive-live-patch-diff)
- [Exhaustive Agent Pack Diff](/projects/agent-foundation/exhaustive-agent-pack-diff)

## Capability matrix

| Capability                                                          | Prior evidence                                                                                                                                                                   | Repo status                                                                                                                                                                  | Runtime status                                                                                                                                                                      | Recovery classification            | Recommended canonical repo home                                                                  |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| GitHub webhook and digest automation                                | Phase 2 in `/root/.openclaw/workspace/core/ROADMAP.md`; `/root/.openclaw/workspace/projects/github/**`                                                                           | `runtime_only_missing_from_repo` — current repo has scheduler docs, but no canonical GitHub automation project workspace, SQL, workflow exports, or digest script            | `live_but_runtime_only` — host crontab still runs `/root/.openclaw/workspace/projects/github/github_digest_telegram.sh` and workspace still holds SQL plus workflow exports         | `runtime_only_should_be_canonized` | `docs/projects/github-automation/` plus committed `ops/github/` assets                           |
| Generic intake endpoint and DB-first intake router                  | Phases 3 and 3 routing extension in `/root/.openclaw/workspace/core/ROADMAP.md`; `/root/.openclaw/workspace/projects/intake/**`                                                  | `missing_from_repo` — no canonical intake project workspace, workflow exports, schema SQL, or routing spec in the repo                                                       | `not_live_but_recoverable` — canonical workspace artifacts still exist, but this sprint did not prove live n8n ownership for the intake flows                                       | `must_restore_now`                 | `docs/projects/intake-routing/` plus committed `ops/intake/` artifacts                           |
| Webhook-gateway probes and workflow drift checks                    | Phase 5 and runbook evidence in `/root/.openclaw/workspace/runbooks/webhook_gateway_runbook.md`; `/root/services/webhook-gateway/{n8n_sync_check.sh,db_probe.sh}`                | `runtime_only_missing_from_repo` — current repo has policy docs but not the actual scripts or gateway runbook content                                                        | `live_and_operational` — host crontab still runs both scripts daily and the webhook-gateway service tree is still present                                                           | `runtime_only_should_be_canonized` | `docs/projects/deployment-topology/` plus committed `ops/webhook-gateway/` assets                |
| Scheduled operator review artifact pipeline                         | Phase 9, runbook evidence, and `/root/.openclaw/workspace/projects/ops/{daily_operator_review_prep.sh,weekly_operator_review_prep.sh,weekly_operator_review_telegram_bridge.sh}` | `repo_present_but_degraded` — repo now inventories the schedules, but not the prep, sync, archive, or Telegram bridge scripts                                                | `live_but_degraded` — native review sessions are still live, but multiple host-side prep/sync/bridge jobs remain disabled after VPS consolidation                                   | `must_restore_now`                 | `docs/projects/deployment-topology/` plus committed `ops/operator-reviews/` assets               |
| Cron health rollup, session hygiene, and maintenance guard surfaces | Phase 5, Phase 9, Phase 11.5, and `/root/.openclaw/workspace/projects/ops/{cron_health_rollup.sh,cron_session_hygiene_report.sh,n8n_inactive_workflow_review.sh}`                | `runtime_only_missing_from_repo` — repo tracks the outcomes in docs, but not the actual scripts or artifact pipeline                                                         | `live_and_operational` — host crontab still runs the health rollup, session hygiene, and inactive-workflow review jobs                                                              | `runtime_only_should_be_canonized` | `docs/projects/deployment-topology/` plus committed `ops/maintenance/` assets                    |
| Disk, cache, Docker, and build hygiene automation                   | Phase 10.7 queue, Phase 11.5, and `/root/.openclaw/workspace/projects/ops/{disk_maintenance.sh,docker_hygiene_cleanup.sh,cache_hygiene.sh,build_runtime_hygiene_report.sh}`      | `runtime_only_missing_from_repo` — repo documents the hygiene posture, but not the live scripts and archive contracts that actually run it                                   | `live_and_operational` — host crontab still runs daily disk/build hygiene and scheduled Docker/cache cleanup jobs                                                                   | `runtime_only_should_be_canonized` | `docs/projects/deployment-topology/` plus committed `ops/hygiene/` assets                        |
| Memory soak, projection, and performance reporting                  | Phase 10.7, `/root/.openclaw/workspace/projects/ops/{memory_soak_db_report.sh,memory_performance_report.sh,memory_projection_report.sh}`, and matching archives                  | `repo_present_but_degraded` — repo has `model-memory` architecture docs, but not the operational reporting scripts or archive/report surfaces                                | `live_but_degraded` — the reporting artifacts still exist in the workspace, but several reporting crons are currently disabled after consolidation                                  | `must_restore_now`                 | `docs/projects/model-memory/` plus committed `ops/model-memory/` assets                          |
| Human-authored workspace and agent `USER.md` profiles               | Phase 1 context layer in `/root/.openclaw/workspace/core/ROADMAP.md`; `/root/.openclaw/workspace/USER.md`; restored `web-researcher/USER.md` and `x-manager/USER.md`             | `runtime_only_missing_from_repo` — current repo has bootstrap-assembly plumbing, but not the actual canonical durable user-profile content that the live workspaces carry    | `live_but_runtime_only` — the live workspace and restored specialist workspaces still contain populated `USER.md` files                                                             | `runtime_only_should_be_canonized` | `docs/system/` plus future `docs/agents/<id>/` durable sources that project into `USER.md`       |
| Browser and Brave public-web stack                                  | Phase 6A and 6B in `/root/.openclaw/workspace/core/ROADMAP.md`; current repo contains `extensions/brave/` and `extensions/browser/`                                              | `repo_present_and_coherent` — the bundled plugin code exists in the canonical repo                                                                                           | `live_but_degraded` — live `openclaw agents list --json` still warns about stale plugin config for `brave`, `browser`, and `memory-middleware`, so the runtime posture is not clean | `should_restore_next`              | existing repo code plus deployment/runtime rehab docs under `docs/projects/deployment-topology/` |
| Main public-web browsing and delegation contract                    | Phase 6A/6B plus `/root/.openclaw/workspace/AGENTS.md`, `/root/.openclaw/workspace/TOOLS.md`, `projects/web_stack/web_research_delegation_spec.md`, and live patch bundles       | `repo_present_but_degraded` — the repo has Brave, Firecrawl, and browser code, but the higher-level Main-to-`web-researcher` browsing contract is not fully canonized        | `live_but_degraded` — the live workspace still carries the delegation rules, but the canonical repo is not the obvious source of truth for them                                     | `must_restore_now`                 | `docs/projects/deployment-topology/` plus `docs/projects/agent-foundation/` and runtime code     |
| `web-researcher` specialist agent                                   | Phase 10.6-adjacent evidence in `/root/.openclaw/workspace/projects/web_stack/web_research_delegation_spec.md`, runtime patches, and restored live workspace                     | `repo_present_but_degraded` — repo now inventories the live agent, but the dedicated workspace seed and durable agent pack are still not canonically represented in-repo     | `live_and_operational` — configured in the live runtime and the missing mounted workspace was restored in the host bind mount                                                       | `runtime_only_should_be_canonized` | future `docs/agents/web-researcher/` plus committed workspace seed/template assets               |
| `x-manager` specialist agent                                        | Phase 10.6 in `/root/.openclaw/workspace/core/ROADMAP.md`, runtime patches, restored workspace seed, `x-manager/USER.md`, and account voice docs under `context/accounts/*.md`   | `repo_present_but_degraded` — repo inventories the live agent, but the dedicated workspace seed, populated `USER.md`, account rules, and approval surfaces are host-only     | `live_and_operational` — configured in the live runtime and the missing mounted workspace was restored in the host bind mount                                                       | `runtime_only_should_be_canonized` | future `docs/agents/x-manager/` plus committed workspace seed/template assets                    |
| Session-selector label and visibility guardrails                    | Phase 6B and 10.6 runbook notes, `ui-session-selector-labels.patch`, `real-session-selector-fix.patch`, and `/root/.openclaw/workspace/runbooks/openclaw_runbook.md`             | `repo_present_but_degraded` — the repo keeps the canonical `Main Session` override and cron-hide control, but broader specialist-session label/visibility guardrails drifted | `live_but_degraded` — the user-visible runtime still showed only Main, proving the current surface is not representing the intended specialist-session model cleanly                | `must_restore_now`                 | `ui/src/ui/` plus deployment/agent documentation                                                 |
| Role library adaptation and role specs                              | Phase 10.5 in `/root/.openclaw/workspace/core/ROADMAP.md`; `/root/.openclaw/workspace/projects/roles/**`                                                                         | `missing_from_repo` — no canonical role-library or adapted-role workspace exists in the repo now                                                                             | `not_live_but_recoverable` — the operational proofs existed, but the role-spec surfaces now survive mainly in the old workspace and archives                                        | `should_restore_next`              | `docs/projects/agent-foundation/` or a dedicated `docs/projects/role-library/` workspace         |
| Live patch durability and freeze publication                        | Phase 8 and `/root/.openclaw/workspace/projects/live_app_patches/**`                                                                                                             | `runtime_only_missing_from_repo` — no canonical committed home exists for the captured live patches, runtime patch READMEs, or replay notes                                  | `live_but_runtime_only` — the patch bundles are still present in the live workspace and were needed to restore non-main agents                                                      | `must_restore_now`                 | `docs/projects/deployment-topology/` plus committed `ops/live-patches/` assets                   |
| Runbooks and operating-model surfaces                               | Phase 3.5, Phase 7, Phase 10.7, Phase 11.5, and `/root/.openclaw/workspace/runbooks/**`                                                                                          | `runtime_only_missing_from_repo` — the canonical repo does not yet contain the operational runbooks that the live workspace still depends on                                 | `live_but_runtime_only` — the runbooks remain present and are still being used as the best operator reference on the VPS                                                            | `runtime_only_should_be_canonized` | `docs/projects/deployment-topology/` plus a canonical runbook surface                            |

## Secondary project-surface gaps

The old workspace also carried project surfaces that are not yet mapped into the
canonical repo as project workspaces:

- `projects/channel_identity/`
- `projects/build-performance/`
- `projects/maintenance/`
- `projects/web_stack/`
- `projects/workflows/`

These are currently best classified as `unclear_needs_owner_decision` for exact
target shape, but they should not remain invisible.

## Explicit non-restoration

The legacy `memory-middleware` surface is intentionally not a restoration target.

- old live config still contains stale `memory-middleware` entries
- the replacement path is the current `model-memory` architecture
- the correct action is runtime-config cleanup, not feature restoration

## Matrix status

This matrix is now the broad capability summary layer.

The strict execution backlog and exhaustive counts now live in:

- [Exhaustive Recovery Manifest](/projects/deployment-topology/exhaustive-recovery-manifest)
