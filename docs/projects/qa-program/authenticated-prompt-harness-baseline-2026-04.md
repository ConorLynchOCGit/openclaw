---
summary: "Baseline note for the April 19, 2026 authenticated prompt-harness tranche."
title: "Authenticated Prompt Harness Baseline 2026-04"
---

# Authenticated Prompt Harness Baseline 2026-04

## Objective

Record the exact state before the sanctioned authenticated prompt-execution
harness was added and the previously blocked operator/UI test tranche was
rerun.

## Repo and runtime baseline

- live repo root:
  - `/root/services/openclaw-roles/live`
- branch:
  - `main`
- `HEAD` at baseline:
  - `a743cc82d2b9c2b00aa6b179ff3261ac1a888878`
- ahead/behind vs `origin/main`:
  - `0 / 0`

## Sanctioned proof already available before this tranche

- `node scripts/operator-ui-proof.mjs --json`
- `pnpm --dir ui exec node ../scripts/tailnet-auth-bootstrap-probe.mjs`
- `pnpm --dir ui exec node ../scripts/tailnet-authenticated-browser-proof.mjs`

Those scripts already proved:

- live selector payload truth was clean
- the approved Tailnet origin loaded the real Control UI
- shared-token bootstrap ordering worked
- fresh secure remote browsers legitimately hit `PAIRING_REQUIRED`
- repo-backed approval of the exact pending browser device reached authenticated
  UI state on reload

## Canonical matrix state before the harness

The pre-harness master matrix recorded:

- unique tests:
  - `38`
- passing:
  - `9`
- failing:
  - `0`
- blocked because no sanctioned authenticated prompt-execution lane existed:
  - `29`

## Exact blocked tranche

- `ui-session-selector-labeling`
- `ui-session-selector-hygiene-after-runs`
- `ui-operator-review-session-presence`
- `ui-fresh-main-bootstrap`
- `ui-main-browser-tool-path`
- `ui-main-brave-path`
- `ui-main-firecrawl-fetch-path`
- `ui-main-delegated-research`
- `ui-web-researcher-cold-start`
- `ui-builder-pack-behavior`
- `ui-researcher-pack-behavior`
- `ui-writer-pack-behavior`
- `ui-x-manager-context-boundary`
- `ui-topology-grounding-prompts`
- `ui-live-progress-chat`
- `ui-detached-replay-on-return`
- `ui-replay-dedupe-second-follow-up`
- `ui-session-ui-vs-chat-parity`
- `ui-daily-continuity-artifact`
- `ui-model-memory-token-capture-retrieval`
- `ui-model-memory-preference-capture-retrieval`
- `ui-model-memory-daily-summary-canary`
- `ui-deep-ingest-run`
- `ui-live-ingest-progress`
- `ui-detached-ingest-replay`
- `ui-daily-weekly-review-artifacts`
- `ui-github-digest-lane`
- `ui-weekly-maintenance-debt-guard`
- `ui-intake-surface`

## Baseline conclusion

The open seam at this point was no longer Tailnet auth/bootstrap. It was the
absence of a sanctioned browser-visible prompt-execution lane that could:

- open authenticated Main or specialist sessions
- submit real prompts through the Control UI
- capture rendered transcript evidence
- preserve session context across follow-up turns
- grade transcript-visible operator/UI tests without dropping back to a
  human-only pass
