---
summary: "Execution ledger for the April 19, 2026 operator-facing UI validation tranches, including the authenticated prompt-harness rerun and the live fix-and-rerun follow-up."
title: "Operator UI Validation Results 2026-04"
---

# Operator UI Validation Results 2026-04

## Current canonical source

The deduplicated inventory lives in:

- [Master Human UI Test Matrix](/projects/qa-program/master-human-ui-test-matrix)

This results file records what was actually executed in the April 19, 2026
validation passes.

## Tranche summary

### Earlier proof tranche

That tranche proved:

- live selector payload cleanliness
- readiness/build-signature visibility
- Tailnet browser reachability
- shared-token bootstrap ordering
- approved-device authenticated browser state
- root-gate dry-run visibility

### Authenticated prompt-harness tranche

This tranche added the missing sanctioned browser-visible prompt lane:

- reusable library:
  - `scripts/lib/operator-browser-harness.mjs`
- direct CLI runner:
  - `scripts/operator-prompt-harness.mjs`
- rerun driver:
  - `scripts/rerun-blocked-operator-ui-tests.mjs`

Initial rerun evidence source:

- `/tmp/rerun-blocked-operator-ui-tests.json`

Initial rerun window:

- started:
  - `2026-04-19T12:48:39.921Z`
- finished:
  - `2026-04-19T13:00:13.037Z`

Initial rerun counts for the previously blocked 29 tests:

- `pass = 10`
- `fail = 15`
- `blocked_by_environment = 4`

### Live fix-and-rerun follow-up

The follow-up pass closed the non-memory failures through the same sanctioned
authenticated browser lane, plus one live runtime rebuild:

- fresh browser rerun:
  - `node scripts/targeted-operator-ui-rerun.mjs`
- direct specialist and routing proofs:
  - `node scripts/operator-prompt-harness.mjs ...`
- live rebuild and hygiene:
  - `bash scripts/docker/rebuild-gateway.sh`
- post-rebuild runtime proof:
  - `node dist/index.js gateway call sessions.list --params '{"includeGlobal":true,"includeUnknown":true}' --json`

Current matrix state after the follow-up:

- `pass = 32`
- `fail = 2`
- `blocked_by_environment = 4`

## Harness proof highlights

### Main authenticated prompt proof

The direct harness CLI successfully drove Main through the real authenticated UI
and captured transcript-visible output.

Representative command:

```bash
node scripts/operator-prompt-harness.mjs \
  --session main \
  --prompt 'Reply with exactly HARNESS_CLI and nothing else.' \
  --json
```

Representative observed truth:

- effective session key resolved to:
  - `agent:main:main`
- rendered selected label:
  - `Main Session`
- assistant reply:
  - `HARNESS_CLI`

### Specialist authenticated prompt proof

The same harness executed specialist lanes directly:

- `agent:researcher:main` returned:
  - `RESEARCHER_OK`
- `agent:builder:main` returned:
  - `BUILDER_OK`
- `agent:writer:main` returned:
  - `WRITER_OK`

### Same-session reuse proof

The harness successfully preserved a persistent authenticated browser context
and executed follow-up turns in the same Main session.

## Historical passes from the initial rerun

| Test ID                                        | Exact evidence                                                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `ui-session-selector-labeling`                 | selector rendered stable human labels for the currently visible Main and specialist sessions              |
| `ui-main-brave-path`                           | Main returned `https://docs.openclaw.ai/tools/plugin` with transcript tool evidence `web_search`          |
| `ui-main-firecrawl-fetch-path`                 | Main returned `Quick start`, `Plugin types`, `Official plugins` with transcript tool evidence `web_fetch` |
| `ui-web-researcher-cold-start`                 | `agent:web-researcher:main` returned `Example Domain` cleanly                                             |
| `ui-x-manager-context-boundary`                | `x-manager` produced an approval package and kept manual approval boundaries explicit                     |
| `ui-topology-grounding-prompts`                | Main cleanly distinguished workspace topology from deployment topology                                    |
| `ui-replay-dedupe-second-follow-up`            | second follow-up did not replay the prior detached state                                                  |
| `ui-daily-continuity-artifact`                 | same-day continuity artifact path remained current during the continuity-producing session                |
| `ui-model-memory-preference-capture-retrieval` | later retrieval correctly surfaced the terse-bullets preference                                           |
| `ui-weekly-maintenance-debt-guard`             | authenticated weekly-maintenance lane returned a usable maintenance-debt summary                          |

## Resolved in the live follow-up

The following rows were red in the initial rerun and are now green with current
evidence:

| Test ID                                  | Exact current evidence                                                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `ui-session-selector-hygiene-after-runs` | targeted authenticated rerun kept proof rows hidden and preserved the human label `Weekly Maintenance Debt Guard`                        |
| `ui-operator-review-session-presence`    | targeted rerun plus the post-rebuild `Sessions` view showed `Daily Operator Review` and `Weekly Operator Review`                         |
| `ui-fresh-main-bootstrap`                | fresh `/new` now opens with `Hey Conor. I’m OpenClaw, sharp and ready, what do you want to tackle?` and no truncation warning            |
| `ui-main-browser-tool-path`              | authenticated Main returned `Example Domain` and transcript tool evidence was `browser`                                                  |
| `ui-main-delegated-research`             | canonical `agent:web-researcher:main updatedAt` moved from `1776617498317` to `1776619450320` during the sourced comparison run          |
| `ui-builder-pack-behavior`               | authenticated `agent:builder:main` prompt returned `BUILDER_OK`                                                                          |
| `ui-researcher-pack-behavior`            | operator-visible `Researcher` lane returned `RESEARCHER_OK`                                                                              |
| `ui-writer-pack-behavior`                | authenticated `agent:writer:main` prompt returned `WRITER_OK`                                                                            |
| `ui-live-progress-chat`                  | targeted authenticated rerun observed bounded progress evidence in the transcript tail for the long-running Main task                    |
| `ui-detached-replay-on-return`           | follow-up `Status?` replayed bounded detached state instead of collapsing to a generic terminal line                                     |
| `ui-session-ui-vs-chat-parity`           | post-fix rerun showed the `Sessions` view projecting task-derived queued, running, and completed state in line with the chat-visible run |
| `ui-deep-ingest-run`                     | targeted authenticated rerun visibly started the ingest or benchmark lane through Main                                                   |
| `ui-live-ingest-progress`                | the same targeted rerun surfaced bounded ingest progress in the rendered transcript                                                      |

### Live runtime restore: canonical Main session row

The user-reported regression that the `Main` agent no longer showed its
canonical `main` session is now fixed live:

- runtime proof:
  - `sessions.list` now includes:
    - `key = agent:main:main`
    - `visibilityClass = operator`
- rendered proof:
  - the authenticated `Sessions` table again includes the restored Main row
    alongside the operator-review rows

## Remaining failures

### F1 — Ordinary-turn token capture still does not retrieve the exact stored token

- test:
  - `ui-model-memory-token-capture-retrieval`
- evidence:
  - the capture turn wrote the token into workspace continuity, but the later
    retrieval turn replied:
    - `I don’t have a reliable remembered token for that phase in this session.`
- failure mode:
  - same-pass ordinary-turn memory capture was not reliably recovered through
    the authenticated UI lane
- likely root cause:
  - capture or retrieval is not consistently using the intended model-memory
    storage-and-recall path for ordinary turns
- seam involved:
  - ordinary-turn model-memory capture and later retrieval

### F2 — Detached ingest replay is still absent on return

- test:
  - `ui-detached-ingest-replay`
- evidence:
  - the ingest start and live-progress legs now pass, but the follow-up replay
    leg still fails to restate the ingest state on return
- failure mode:
  - no bounded ingest recap on return
- likely root cause:
  - ingest work is still not represented in the detached replay lane the same
    way as the generic background-task lane
- seam involved:
  - ingest replay / detached status lane

## Blocked by environment

| Test ID                                | Exact blocker                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `ui-model-memory-daily-summary-canary` | no eligible finalized daily-summary canary was available in this pass          |
| `ui-daily-weekly-review-artifacts`     | this pass did not run fresh daily/weekly operator-review jobs end to end       |
| `ui-github-digest-lane`                | no safe same-pass GitHub digest trigger or fresh digest artifact was exercised |
| `ui-intake-surface`                    | no sanctioned authenticated intake route was surfaced in the Control UI shell  |

## Net state after the follow-up

Across the full 38-test matrix, the current state is now:

- `32` pass
- `2` fail
- `4` blocked_by_environment

The old blocker is still gone:

- there is a sanctioned authenticated prompt-execution harness

The remaining work is now intentionally narrow:

- one model-memory capture or retrieval defect
- one ingest detached-replay defect
- four exact environment blockers
