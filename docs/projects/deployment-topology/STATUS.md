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
    fixes that now exist in repo and need continued live proof coverage:
  - isolated cron jobs now honor explicit `sessionKey` values when persisting
    their base session identity, which is the required fix for named daily and
    weekly operator-review sessions
  - direct-chat long-running work now emits bounded live progress summaries from
    native runtime events instead of looking silently stalled
  - this pass broadened that progress lane further:
    - lifecycle start/fallback/error events now surface in chat
    - generic tool `progressText` updates now surface in chat
    - detached/background session-owned progress now replays into the next
      active direct-chat turn from:
      - task-registry state
      - reply-run state for detached or resumed reply execution
    - exact coverage is recorded in
      [Chat Progress Coverage Audit](/projects/deployment-topology/chat-progress-coverage-audit)
    - exact replay seam is recorded in
      [Detached Progress Replay Audit](/projects/deployment-topology/detached-progress-replay-audit)
- the current build/test optimization truth is now explicit:
  - scoped and direct Vitest runs now get explicit module-cache reuse instead of
    relying only on the old full-suite path
  - Turbo is no longer UI-only in practice:
    - `openclaw-control-ui` and `@openclaw/diffs` now expose a real package-task
      graph for `build`
    - UI package `test` is now Turbo-cacheable
  - exact diagnosis and chosen fixes are recorded in
    [PNPM Turbo Build Optimization Audit](/projects/deployment-topology/pnpm-turbo-build-optimization-audit)
- the current proof residue is now tracked explicitly instead of staying spread
  across status notes:
  - [Incomplete And Follow-On Proof Pack](/projects/deployment-topology/incomplete-and-follow-on-proof-pack)
- the live operator-surface validation path now has one explicit unresolved
  safety boundary:
  - Codex-side Control UI self-testing must stay Tailnet-compliant and must not
    weaken gateway origin policy just to make local browser automation easier
  - the planning boundary for that work now lives in
    [Tailscale-Compliant Self-Testing Plan](/projects/deployment-topology/tailscale-compliant-self-testing-plan)
- the session selector hygiene lane is now proven at live gateway payload level:
  - the repo added metadata-driven repair for legacy validation/proof rows that
    leaked through `visibilityClass: "operator"`
  - the live gateway was rebuilt onto that patched source
  - the sanctioned proof helper now reports:
    - `sessionsList.count: 31`
    - `codexRowCount: 0`
  - the remaining open question is browser/authenticated UI confirmation, not
    selector payload truth
  - the evidence path lives in:
    - [Tailnet UI Validation Baseline](/projects/deployment-topology/tailnet-ui-validation-baseline)
    - [Control UI Session Cache Refresh Diagnosis](/projects/deployment-topology/control-ui-session-cache-refresh-diagnosis)
    - [Session Selector Visibility Cleanup](/projects/deployment-topology/session-selector-visibility-cleanup)
    - [Sanctioned Operator Proof Helper](/projects/deployment-topology/sanctioned-operator-proof-helper)
- runtime rollout proof is now separated cleanly from local repo truth:
  - the gateway readiness surface now exposes a deployed build signature header
  - the local-vs-live fingerprint check now passes against the rebuilt gateway
  - exact contracts live in:
    - [Live Rollout Proof Contract](/projects/deployment-topology/live-rollout-proof-contract)
    - [Deployed Build Signature Contract](/projects/deployment-topology/deployed-build-signature-contract)
- session visibility is now metadata-driven, not just string-filtered:
  - `visibilityClass` and `retentionClass` are normalized into migrated store rows
  - operator-visible selector proof now excludes internal/proof rows:
    - live `sessions.list` proof returned `count = 40`, `codexCount = 0`,
      `nonOperatorCount = 0`
  - exact contracts live in:
    - [Session Visibility Classification Contract](/projects/deployment-topology/session-visibility-classification-contract)
    - [Internal Session Retention Policy](/projects/deployment-topology/internal-session-retention-policy)
- the canonical auth discovery lane now exists:
  - topology-owned auth path registry is now the durable entrypoint for
    OpenAI Codex, OpenRouter, Supabase, Brave, Firecrawl, GitHub, and N8N
  - exact docs live in:
    - [Auth Resolution Register](/projects/deployment-topology/auth-resolution-register)
- path parity and low-overhead runtime proof now have explicit project homes:
  - [Path Parity And Resolution](/projects/deployment-topology/path-parity-and-resolution)
  - [Gateway Regression Test Matrix](/projects/deployment-topology/gateway-regression-test-matrix)
  - [Runtime Assertion Harnesses](/projects/deployment-topology/runtime-assertion-harnesses)
- rollout/detection hardening now explicitly includes image drift and runtime
  observability:
  - [Runtime Image Drift Detection](/projects/deployment-topology/runtime-image-drift-detection)
  - [Runtime Observability And Drift](/projects/deployment-topology/runtime-observability-and-drift)
- a sanctioned non-browser proof path now exists for operator-surface checks:
  - [Sanctioned Operator Proof Helper](/projects/deployment-topology/sanctioned-operator-proof-helper)
- Tailnet-native browser automation is now proven on the sanctioned path:
  - approved-origin reachability works
  - shared-token bootstrap works
  - fresh secure browsers still create a real Control UI device and can hit
    `PAIRING_REQUIRED`
  - the repo now has a sanctioned proof path that approves that exact browser
    device and reloads the same context into authenticated UI state
  - exact evidence lives in:
    - [Tailnet Native Playwright Attempt](/projects/deployment-topology/tailnet-native-playwright-attempt)
    - [Tailnet Authenticated Browser Bootstrap Baseline](/projects/deployment-topology/tailnet-authenticated-browser-bootstrap-baseline)
    - [Tailnet Authenticated Browser Bootstrap Diagnosis](/projects/deployment-topology/tailnet-authenticated-browser-bootstrap-diagnosis)
    - [Tailnet Authenticated Browser Proof](/projects/deployment-topology/tailnet-authenticated-browser-proof)
- the sanctioned authenticated prompt-execution lane now exists on top of that
  approved-device browser path:
  - repo-backed browser harness:
    - `scripts/lib/operator-browser-harness.mjs`
  - direct prompt runner:
    - `scripts/operator-prompt-harness.mjs`
  - bulk rerun driver:
    - `scripts/rerun-blocked-operator-ui-tests.mjs`
  - exact contracts and proof live in:
    - [Authenticated Operator Prompt Harness Spec](/projects/deployment-topology/authenticated-operator-prompt-harness-spec)
    - [Authenticated Operator Prompt Harness Test Plan](/projects/deployment-topology/authenticated-operator-prompt-harness-test-plan)
    - [Authenticated Operator Prompt Harness Proof](/projects/deployment-topology/authenticated-operator-prompt-harness-proof)
- the cross-project operator UI inventory is now canonized under QA Program:
  - [Master Human UI Test Matrix](/projects/qa-program/master-human-ui-test-matrix)
  - [Operator UI Validation Results 2026-04](/projects/qa-program/operator-ui-validation-results-2026-04)
- the old “missing prompt harness” blocker is now closed:
  - the former 29 blocked operator/UI rows were rerun through the authenticated
    harness and now grade as:
    - `10` pass
    - `15` fail
    - `4` blocked_by_environment
  - the remaining gaps are now concrete runtime/product failures:
    - operator-review session exposure
    - fresh bootstrap truncation
    - browser-vs-fetch routing in Main
    - delegation proof through the canonical researcher lane
    - Builder and Writer `EACCES`
    - missing Researcher selector lane
    - progress/replay/parity failures
    - token capture/retrieval drift
    - ingest start/progress/replay failures
    - selector label regression after sustained activity

## Immediate next move

- keep the canonical deployment docs here
- keep repo-vs-container adoption and scheduled-program truth aligned with the
  live runtime
- keep the repaired GitHub lane monitored for the next organic canonical repo
  event
- keep the approved-device Tailnet browser proof path stable and build follow-on
  browser assertions on top of that real pairing contract
- use the new QA master matrix and authenticated harness proof when driving the
  next fix tranches; the remaining gaps are no longer test-lane gaps
- fix the operator-review, specialist-pack, progress/replay, model-memory, and
  ingest failures directly before spending more time on new checklist expansion
- fix the host-side loopback gateway RPC probe abnormal-close (`1006`) so the
  host CLI proof path matches the now-working compose-run gateway RPC path
- widen structured progress emission only for lanes that still never enter
  task-registry or reply-run state
- keep the Turbo graph honest while the next tranche focuses on broader package
  ownership, not root-gate decomposition itself
- hand the richer per-agent pack expansion off to
  [Agent Foundation](/projects/agent-foundation)
- use `post-restoration-cleanup.md` only for later hardening and verification,
  not for unresolved rescue or source-of-truth gaps
