---
summary: "Current status for the deployment-topology project."
title: "Deployment Topology Status"
---

# Deployment Topology Status

## Overall

State: `active`

The repo now treats deployment topology as its own canonical project workspace
rather than a model-memory side lane.

## Current truth

- the live VPS has already been materially consolidated in practice
- runtime inventory policy exists under `docs/system/deployment.md`
- git remote and GitHub CLI posture have dedicated durable docs
- PNPM/build hygiene for the VPS has dedicated durable docs
- the live scheduler surface is split between host cron and OpenClaw-native cron
- the canonical repo docs previously did not durably inventory that mixed
  scheduler surface
- a broader post-consolidation functionality-loss diagnosis is now required
  because major prior operational surfaces still survive only in the live
  workspace, host scripts, or archive evidence
- the project now also carries an exhaustive recovery manifest that separates:
  - true missing functionality
  - runtime-only survivors
  - already-present repo surfaces
  - intentionally retired lanes
  - owner-decision gaps
- tranche 1 has now restored the highest-risk user-visible lane first:
  - Main browsing and delegation contract
  - specialist session-selector guardrails
  - GitHub digest canonical assets
  - `web-researcher` durable runtime sources
  - `x-manager` durable runtime sources
  - tranche-specific patch-lineage preservation
- the current pass has now:
  - created the canonical `docs/projects/maintenance/` workspace for the live
    maintenance control inputs
  - canonized the current operator runbooks under
    `docs/projects/deployment-topology/runbooks/`
  - added a secret-safe canonical representation of the live config layer
  - restored repo-owned operator-review support scripts under `ops/reviews/`
  - repointed live host cron to the committed review-support scripts
  - repointed the weekly maintenance native cron payload to canonical repo docs
  - proved the weekly review prep, sync, and Telegram-summary preview path
  - fixed the daily review session-output bug by making sync read the latest
    successful native cron-run transcript instead of a stale legacy session alias
  - proved the daily and weekly review artifact sync paths end-to-end
  - canonized the bounded runtime-source packs for `builder`, `researcher`, and
    `writer` under `docs/agents/` and resynced the live deployment surfaces
  - explicitly retired the old standalone memory-reporting cron lane rather
    than reviving it as a primary reporting surface
  - added a real `build:` path to `docker-compose.yml` for the live runtime
  - rebuilt `openclaw:local` and recreated `openclaw-runtime` from the
    canonical live repo
  - proved that all canonical `docs/projects/*` workspaces now exist in the
    running container
  - reran the daily and weekly operator-review prep scripts against the
    corrected runtime/container state
  - removed stale raw GitHub digest log carryover from the weekly review
    context so the GitHub ingress section now distinguishes canonical and
    non-canonical repo visibility
- a dedicated post-restoration cleanup backlog now exists for:
  - untested migrated or restored surfaces
  - end-to-end verification still pending after rescue work
  - post-rescue rollout hardening beyond the now-live compose build path
- the GitHub digest source lane is now repaired end-to-end on the live ingress
  side:
  - the public Funnel webhook path now serves the live production workflow
  - correctly signed canonical `openclaw/openclaw` deliveries now persist in
    `inbound_events`
  - the repair record lives in
    [GitHub Digest Source Repair](/projects/deployment-topology/github-digest-source-repair)
- the runtime container now exposes the full tracked live repo through the
  canonical import mount with parity against the host checkout
- the remaining follow-on items are no longer deployment rescue blockers:
  - compatibility-source migration into richer per-agent packs
  - bootstrap pre-render seeding policy expansion
  - stronger topology enforcement beyond the current checks
- the current repo tranche now also contains two operator/runtime hardening
  fixes that still need live rerun proof after rollout:
  - isolated cron jobs now honor explicit `sessionKey` values when persisting
    their base session identity, which is the required fix for named daily and
    weekly operator-review sessions
  - direct-chat long-running work now emits bounded live progress summaries from
    native runtime events instead of looking silently stalled
- the current proof residue is now tracked explicitly instead of staying spread
  across status notes:
  - [Incomplete And Follow-On Proof Pack](/projects/deployment-topology/incomplete-and-follow-on-proof-pack)

## Immediate next move

- keep the canonical deployment docs here
- keep repo-vs-container adoption and scheduled-program truth aligned with the
  live runtime
- keep the repaired GitHub lane monitored for the next organic canonical repo
  event
- rerun the remaining incomplete human-validation prompts and the new
  session-identity/chat-progress proofs after rollout
- hand the richer per-agent pack expansion off to
  [Agent Foundation](/projects/agent-foundation)
- use `post-restoration-cleanup.md` only for later hardening and verification,
  not for unresolved rescue or source-of-truth gaps
