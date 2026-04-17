---
summary: "Evidence-backed audit of functionality that existed before consolidation but is now missing, degraded, or only preserved outside the canonical repo."
title: "Missing Functionality Recovery Audit"
---

# Missing Functionality Recovery Audit

This audit diagnoses functionality drift introduced during repo consolidation
and topology migration.

It does not assume every archived surface should come back. It separates:

- functionality that is still healthy in the canonical repo
- functionality that still lives only in runtime or host state
- functionality that is partially degraded
- functionality that is absent from the repo and needs deliberate restoration
- archive residue that should stay archive-only

Companion matrix:

- [Missing Functionality Recovery Matrix](/projects/deployment-topology/missing-functionality-recovery-matrix)
- [Exhaustive Recovery Manifest](/projects/deployment-topology/exhaustive-recovery-manifest)
- [Exhaustive Project Surface Diff](/projects/deployment-topology/exhaustive-project-surface-diff)
- [Exhaustive Host Automation Diff](/projects/deployment-topology/exhaustive-host-automation-diff)
- [Exhaustive Live Patch Diff](/projects/deployment-topology/exhaustive-live-patch-diff)

## Evidence sources reviewed

Primary evidence:

1. pre-pointer roadmap: `/root/.openclaw/workspace/core/ROADMAP.md`
2. live workspace project tree: `/root/.openclaw/workspace/projects/**`
3. live workspace runbooks: `/root/.openclaw/workspace/runbooks/**`
4. live workspace archives: `/root/.openclaw/workspace/archives/**`
5. live host crontab
6. live `openclaw-runtime` container commands and state

Cross-check evidence:

1. `/root/backups/openclaw-structure-freeze-2026-03-24/**`
2. `/root/backups/openclaw-roadmap-freeze-2026-03-23/**`
3. `/root/backups/openclaw-context-freeze-2026-03-23/**`

Why the roadmap was useful but insufficient:

- it proved that a capability had once been considered built or minimally live
- it did not prove whether the canonical repo still represented that capability
- it did not distinguish repo truth from runtime-only survival
- it did not tell us which capabilities were later disabled, degraded, or left
  behind during VPS consolidation

## Capability extraction summary

The completed or minimally-live roadmap phases that materially affected this
audit were:

- Phase 2: GitHub webhook and digest workflow
- Phase 3: generic intake endpoint
- Phase 3 routing extension: DB-first intake router
- Phase 5: health checks and scheduled work
- Phase 6A and 6B: public web research and browser runtime
- Phase 8: Git-backed durability and freeze publication
- Phase 9: scheduled operator value completion
- Phase 10: multi-agent foundation
- Phase 10.5: role-library adaptation
- Phase 10.6: standalone `x-manager` proof
- Phase 10.7: transition, soak-use, and internal platform operating model
- Phase 11.5: maintenance and audit discipline

## Repo-side classification counts

- `repo_present_and_coherent`: 1
- `repo_present_but_degraded`: 6
- `repo_present_but_hidden_or_unlinked`: 0
- `runtime_only_missing_from_repo`: 7
- `missing_from_repo`: 2
- `unclear_needs_runtime_check`: 0

## Runtime-side classification counts

- `live_and_operational`: 5
- `live_but_degraded`: 5
- `live_but_runtime_only`: 4
- `configured_but_broken`: 0
- `not_live_but_recoverable`: 2
- `retired_or_dead`: 0

## What is clearly still fine

One major completed-roadmap capability is still canonically present in the repo:

- the bundled browser and Brave plugin code remains present under
  `extensions/browser/` and `extensions/brave/`

That said, the runtime posture for that capability is still degraded because the
live container reports stale plugin-config warnings.

## What still exists only in runtime or host state

The most important runtime-only survivors are:

- GitHub digest automation under `/root/.openclaw/workspace/projects/github/`
- webhook-gateway host probes under `/root/services/webhook-gateway/`
- live patch durability bundles under
  `/root/.openclaw/workspace/projects/live_app_patches/`
- operational runbooks under `/root/.openclaw/workspace/runbooks/`
- several maintenance and hygiene scripts under
  `/root/.openclaw/workspace/projects/ops/`
- the populated human-authored `USER.md` files in the shared workspace and the
  restored specialist workspaces
- the `x-manager` account voice packs for Conor Lynch personal and American
  Atomics under the restored `context/accounts/` tree

These are not safely represented by pointer docs alone. They are active or
recently-active operational assets that the canonical repo still needs to absorb
deliberately.

## What appears genuinely missing from the canonical repo

These capability surfaces have strong prior evidence but no current canonical
repo home:

- generic intake endpoint and DB-first intake router project surfaces
- role-library adaptation specs under the former `projects/roles/` tree

The intake case is especially important because it combines schema, workflow
exports, routing logic, and runbook context. A pointer mention would not be an
adequate substitute.

The same now applies to:

- the Main browsing and web-research delegation contract
- session-selector label and visibility guardrails
- specialist-agent `USER.md` and brand-voice context surfaces

## Highest-risk gaps

### 1. Runtime-only operational automation

Why it matters:

- the live VPS still depends on host scripts and workspace project assets that
  are not committed in the canonical repo
- if the host is rebuilt or the workspace is cleaned too aggressively, those
  capabilities are easy to lose again

Examples:

- GitHub digest automation
- webhook-gateway probes
- disk, Docker, cache, and build hygiene jobs
- live patch bundles

Recommended next restoration move:

- create canonical project workspaces plus committed ops asset directories for
  the GitHub, hygiene, and live-patch lanes before any more cleanup

### 2. Disabled-after-consolidation operator review and memory-reporting jobs

Why it matters:

- the operator-review artifact pipeline and memory observability were built to
  externalize state, not just to generate one-off reports
- several of those jobs are still disabled in host cron after VPS consolidation

Evidence:

- host crontab comments marked `DISABLED_AFTER_VPS_CONSOLIDATION`
- matching live scripts still exist under `/root/.openclaw/workspace/projects/ops/`

Recommended next restoration move:

- restore the host-side prep, sync, and bridge layers into the canonical repo
- decide which jobs should be re-enabled versus intentionally retired

### 3. Specialist-agent durable surfaces are still mostly host-only

Why it matters:

- `web-researcher` and `x-manager` are now live again, but their durable seeds
  still depend mainly on host workspaces and preserved runtime patch bundles
- `x-manager` specifically includes populated `USER.md`, approval rules, and
  account-specific voice/context documents that materially affect output quality
- that is operationally better than missing, but not canonically safe

Evidence:

- live runtime config and `openclaw agents list --json`
- restored host workspaces
- restored `USER.md` files in the specialist workspaces
- restored `x-manager/context/accounts/conor_lynch_personal.md`
- restored `x-manager/context/accounts/american_atomics.md`
- preserved patch bundles under `projects/live_app_patches/`

Recommended next restoration move:

- bring the durable seeds into the future agent slice instead of depending on
  host-only recovery material

### 4. Intake substrate may have been lost as canonical repo truth

Why it matters:

- the intake work was more than notes; it included SQL, workflow exports, and a
  routing contract
- if the canonical repo does not absorb that work, future ingress or automation
  rebuilds will start from partial memory instead of prior implementation

Recommended next restoration move:

- create a dedicated intake project workspace and restore the schema, specs, and
  workflow exports first

### 5. Current runtime config drift is masking some capabilities

Why it matters:

- some capabilities are not absent in code, but the runtime is still degraded
  because the active config points at stale plugin entries

Evidence:

- live `openclaw agents list --json` warnings for `brave`, `firecrawl`,
  `browser`, and `memory-middleware`

Recommended next restoration move:

- separate repo restoration from runtime rehab
- fix stale live config after the missing repo surfaces are canonized, or in the
  same slice if the restored capability depends on it

Important correction:

- `memory-middleware` is not a restoration target
- it is the one legacy lane that should stay retired after the repo merger
- the correct action there is stale-config cleanup, not feature recovery

## Status after the exhaustive pass

This document remains useful as the broad diagnosis layer, but it is no longer
the strict execution manifest.

The strict next-sprint backlog now lives in:

- [Exhaustive Recovery Manifest](/projects/deployment-topology/exhaustive-recovery-manifest)

That stricter manifest adds:

- per-surface project diffing
- per-agent-pack diffing
- live patch family diffing
- host automation diffing
- exact restoration versus canonization buckets

### 6. Main browsing and session-selector guardrails are only partially retained

Why it matters:

- we built operator-facing behavior around how Main browses, when it must
  delegate to `web-researcher`, and how the session selector should label and
  expose important sessions
- losing those guardrails creates immediate user-facing regressions even when
  the lower-level plugin code still exists

Evidence:

- live workspace `AGENTS.md` and `TOOLS.md` still contain the
  `agent:web-researcher:main` delegation rules
- `projects/web_stack/web_research_delegation_spec.md` still exists in the old
  workspace
- current repo `ui/src/ui/app-render.helpers.ts` preserves the canonical
  `Main Session` override, but the broader specialist-session label/visibility
  behavior survives mainly in old patch bundles and runbook notes
- the user-visible runtime recently collapsed to showing only Main

Recommended next restoration move:

- restore the Main browsing/delegation contract into canonical repo docs and
  runtime code
- restore the broader session-selector visibility/label guardrails so the UI
  reflects the intended specialist-session model again

## Recovery buckets

### `must_restore_now`

- generic intake endpoint and DB-first intake router
- scheduled operator review artifact pipeline
- memory soak, projection, and performance reporting
- live patch durability and freeze publication
- Main public-web browsing and delegation contract
- session-selector label and visibility guardrails

### `runtime_only_should_be_canonized`

- GitHub webhook and digest automation
- webhook-gateway probes and workflow drift checks
- cron health rollup, session hygiene, and maintenance guard surfaces
- disk, cache, Docker, and build hygiene automation
- human-authored workspace and agent `USER.md` profiles
- `web-researcher` specialist-agent durable surfaces
- `x-manager` specialist-agent durable surfaces
- runbooks and operating-model surfaces

### `should_restore_next`

- browser and Brave runtime rehab
- role-library adaptation specs

### `intentionally_retired`

- legacy `memory-middleware` as an active functional lane

This is the one explicit non-restoration surface identified so far. The old
config residue should be cleaned up, but the functionality itself should not be
brought back as a separate surviving subsystem.

### `archive_only`

- builder proof residue such as
  `/root/.openclaw/workspace/archives/builder_workspace_residue/**`
- one-off dry-run proof notes under
  `/root/.openclaw/workspace/archives/phase10_builder_dry_run/**`

These preserve historical proof, but they are not missing product/runtime
capabilities that need to be restored as active surfaces.

### `unclear_needs_owner_decision`

- `projects/channel_identity/`
- `projects/build-performance/`
- `projects/maintenance/`
- `projects/web_stack/`
- `projects/workflows/`

These old workspace project surfaces were real enough to matter, but this audit
did not collect enough evidence to finalize their exact canonical target shape
without a dedicated restoration slice.

## Recommended next restoration boundary

The next recovery sprint should not try to restore everything at once.

The clean sequence is:

1. restore the missing project workspaces and committed ops assets for:
   - GitHub automation
   - intake routing
   - operator review plus hygiene automation
   - live patch durability
   - Main browsing/delegation contract
   - session-selector guardrails
   - specialist-agent durable `USER.md` and voice/context sources
2. reclassify and re-enable the disabled host jobs that are still desired
3. repair stale live runtime config for browser, Brave, and old
   `memory-middleware` entries
4. move specialist-agent durable seeds into the future agent slice so they no
   longer depend on host-only patch bundles
5. then audit the secondary old workspace projects (`channel_identity`,
   `build-performance`, `workflows`, and similar) for final target shape
