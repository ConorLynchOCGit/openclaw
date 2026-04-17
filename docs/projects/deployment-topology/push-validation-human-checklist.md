---
summary: "Canonical human validation matrix for the restored live deployment before commit or push."
title: "Push Validation Human Checklist"
---

# Push Validation Human Checklist

This is the canonical human validation matrix for the restored live OpenClaw
deployment.

Use it before landing restoration work that changes runtime behavior, specialist
packs, scheduler surfaces, or deployment-critical operator flows.

The dedicated post-ingest `model-memory` substrate and soak sequence now lives
separately in:

- [Deep Memory Soak Human Tests](/projects/model-memory/deep-memory-soak-human-tests)
- [Final Human Validation Prompts](/projects/deployment-topology/final-human-validation-prompts)

Use that document for the deeper prompt-ingestion, document-ingestion,
daily-summary-ingestion, retrieval, context, projection, and cache checks that
go beyond the deployment push gate.

## Stage meanings

- `before_commit` means the behavior should be checked before creating a landing
  commit for the tranche
- `before_push` means the behavior must be checked against the live gateway
  before pushing
- `post_push_monitoring` means the surface can be watched after push rather than
  blocking the push itself

## Required matrix

| Surface                           | Prompt or operator action                                                                                                                                   | Expected result                                                                                                                 | Failure condition                                                                                                  | Stage                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Main direct browsing              | In Main, ask: `Open https://example.com in the browser tool and tell me the page title only.`                                                               | Uses the browser path and replies with `Example Domain` or the exact current title only                                         | Falls back to web fetch/search, errors, or cannot open the page                                                    | `before_push`          |
| Main Brave path                   | In Main, ask: `Use Brave search to find the official OpenClaw plugin docs page and give me the exact URL.`                                                  | Uses the Brave-backed search path and returns the official docs URL                                                             | Search tool path is unavailable, wrong provider is used, or result is obviously incorrect                          | `before_push`          |
| Main Firecrawl path               | In Main, ask: `Use Firecrawl or the canonical fetch path to read https://docs.openclaw.ai/tools/plugin and list the first three top-level sections.`        | Returns sections from the live docs page without browser-only fallback                                                          | Firecrawl/fetch path fails, returns empty output, or clearly ignores the page                                      | `before_push`          |
| Main delegation to web-researcher | In Main, ask for a bounded comparative research task: `Compare the OpenClaw plugin docs architecture pages with Mintlify navigation docs and cite sources.` | Main delegates to `web-researcher` or uses the intended delegated research path without leaking internal session chatter        | Reports `web-researcher` missing, fails to delegate, or leaks hidden internal conversation turns                   | `before_push`          |
| Session selector labeling         | Open the session selector in the live gateway                                                                                                               | Visible specialist sessions use the intended labels, including `Main Session` for the shared lane                               | Labels regress to raw ids, confusing names, or stale hidden-session labels                                         | `before_push`          |
| Session selector visibility       | Open the session selector after fresh startup and after a few test runs                                                                                     | Hidden or internal sessions such as heartbeat, Telegram, and unknown internal lanes do not appear                               | Hidden/internal sessions are visible to the operator                                                               | `before_push`          |
| Web-researcher cold start         | Start a fresh `web-researcher` task from Main or directly if supported                                                                                      | Session starts cleanly, no `EACCES`, and the agent can read its runtime pack                                                    | Startup fails, pack files are unreadable, or delegation says no usable session exists                              | `before_push`          |
| X-manager context presence        | Ask `x-manager` for a bounded draft or approval-packaging task for a supported account                                                                      | Response respects approval-only behavior and reflects the correct account voice context                                         | Missing account context, no approval boundary, or behavior that looks generic and ungrounded                       | `before_push`          |
| Fresh `/new` bootstrap            | Start a new Main session with `/new`                                                                                                                        | Startup context loads without bootstrap truncation warnings and without hostile/untrusted instructions taking over the greeting | Truncation warning appears, startup context is malformed, or the model follows untrusted daily-memory instructions | `before_push`          |
| Shared bootstrap authored profile | In a fresh Main session, ask a small personalized prompt that depends on authored shared bootstrap context                                                  | Behavior reflects the shared authored profile and current runtime bootstrap pack                                                | Response acts like the shared profile is missing or detached from the runtime pack                                 | `before_push`          |
| Model-memory capture              | In a fresh Main session, say `Remember this exact token for a later test: saffron-orbit-17.` then finish the session                                        | A memory write or capture attempt is visible in the intended model-memory path                                                  | No capture occurs and no attempt is visible in the memory architecture                                             | `before_push`          |
| Model-memory retrieval            | In a later fresh Main session, ask `What token did I ask you to remember earlier?`                                                                          | The system retrieves or correctly surfaces the stored token through the model-memory path                                       | No retrieval occurs, or retrieval obviously ignores the earlier capture                                            | `before_push`          |
| `/readyz` published route         | Curl or open the published `/readyz` route                                                                                                                  | Returns a real readiness response, not the control UI shell                                                                     | Returns HTML shell, wrong route content, or non-ready failure without a real incident                              | `before_push`          |
| GitHub digest lane                | Run the live GitHub digest trigger manually if safe, or inspect the next scheduled result after the cron fires                                              | The canonized repo-owned digest assets produce the expected Telegram-ready summary lane                                         | Host-only legacy assets are still required, or the digest fails end-to-end                                         | `post_push_monitoring` |
| Daily operator review             | Run the daily prep, native cron run, sync, and artifact path                                                                                                | A fresh daily artifact is written and the sync path succeeds from the latest successful run transcript                          | Prep works but artifact sync fails, or the native session does not yield a usable artifact body                    | `before_push`          |
| Weekly operator review            | Run the weekly prep, native cron run, sync, and Telegram preview path                                                                                       | Weekly artifact and Telegram preview succeed from canonized repo-owned assets                                                   | Sync fails, Telegram preview fails, or the path still depends on stale host-only assets                            | `before_push`          |
| Weekly maintenance debt guard     | Trigger or inspect the weekly maintenance guard against the canonized maintenance inputs                                                                    | Output references the committed maintenance docs and current control inputs                                                     | It still reads legacy workspace-only inputs or cannot produce output                                               | `before_push`          |
| Builder pack behavior             | Start a bounded Builder task after canonization                                                                                                             | Builder starts from the canonized runtime pack and responds with implementation-oriented behavior                               | Pack is unreadable, missing, or clearly still host-only drift                                                      | `before_push`          |
| Researcher pack behavior          | Start a bounded Researcher task after canonization                                                                                                          | Researcher starts from the canonized runtime pack and performs bounded research behavior                                        | Pack is unreadable, missing, or still broken at startup                                                            | `before_push`          |
| Writer pack behavior              | Start a bounded Writer task after canonization                                                                                                              | Writer starts from the canonized runtime pack and responds with writing-focused behavior                                        | Pack is unreadable, missing, or behavior is obviously not the specialized writer lane                              | `before_push`          |
| Intake surface                    | If intake is restored, submit the smallest safe test payload through the retained route or workflow                                                         | The retained intake contract accepts the payload and routes it per the canonized spec                                           | Route is missing, schema is unclear, or the flow still exists only in legacy assets                                | `before_push`          |

## Monitoring-only follow-up

- re-check the next naturally scheduled GitHub digest delivery after push
- re-check the next naturally scheduled daily operator review after push
- re-check the next naturally scheduled weekly operator review after push
- confirm no hidden internal sessions reappear in the selector after several new
  sessions and cron runs
