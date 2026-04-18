---
summary: "Explicit proof checklist for the remaining incomplete deployment/runtime validations after the current hardening tranche."
title: "Incomplete And Follow-On Proof Pack"
---

# Incomplete And Follow-On Proof Pack

This file collects the deployment/runtime items that are either newly fixed in
repo code or still incomplete from the last human-validation pass.

It exists so these items stop living as scattered notes in status docs and
session transcripts.

## Deployment/runtime proof items

| Item                                             | Current status                          | Evidence path                                                                                                                                                                                  | Validation path                                                                                                                                                                                            | Proof complete when                                                                                                            |
| ------------------------------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Named operator-review session persistence        | `repo_fixed_not_live_proven`            | [server-cron.ts](/root/services/openclaw-roles/live/src/gateway/server-cron.ts), [run.ts](/root/services/openclaw-roles/live/src/cron/isolated-agent/run.ts)                                   | Run the daily and weekly native cron lanes after rollout, then inspect `/root/.openclaw/agents/main/sessions/sessions.json` for `agent:main:daily-operator-review` and `agent:main:weekly-operator-review` | New cron runs persist the named base sessions and selector/discovery uses those names instead of opaque `cron:<jobId>` aliases |
| Chat-visible queue/progress                      | `repo_fixed_not_live_proven`            | [dispatch-from-config.ts](/root/services/openclaw-roles/live/src/auto-reply/reply/dispatch-from-config.ts), [Chat Progress Visibility](/projects/deployment-topology/chat-progress-visibility) | Run one long direct-chat task that emits item/command progress and capture the visible `Working:` / `Completed:` updates in chat                                                                           | The operator can see bounded progress in chat without opening the session UI                                                   |
| Delegated research comparison prompt             | `incomplete`                            | [Final Human Validation Results](/projects/deployment-topology/final-human-validation-results)                                                                                                 | Re-run: `Compare the OpenClaw plugin docs architecture pages with Mintlify navigation docs and cite sources.`                                                                                              | A full answer is recorded and cites real sources rather than stopping mid-run                                                  |
| Researcher specialist-pack routing               | `incomplete`                            | [Final Human Validation Results](/projects/deployment-topology/final-human-validation-results)                                                                                                 | Re-run: `Researcher: identify the three strongest primary sources for OpenClaw plugin architecture.`                                                                                                       | The turn executes through the intended specialist lane rather than Main silently substituting itself                           |
| Daily-summary canary retrieval                   | `incomplete`                            | [Final Human Validation Results](/projects/deployment-topology/final-human-validation-results)                                                                                                 | Seed a canary into the finalized daily summary, then re-run the retrieval prompt in a fresh Main session                                                                                                   | The canary is retrievable through the supported daily-summary path                                                             |
| Daily/weekly operator-review selector visibility | `not_rechecked_after_named-session-fix` | current live session store still shows generic cron aliases                                                                                                                                    | After rollout, re-open the selector after real daily/weekly runs                                                                                                                                           | Named operator-review sessions appear with stable labels and the old opaque aliases stop being the active truth                |

## Safe residue retired in this tranche

The current tranche included bounded cleanup that was safe to perform without
changing live operator data ownership:

- stale marketplace research residue was not kept:
  - the quarantined `task-progress-stream` package was downloaded into `/tmp`,
    reviewed, and deleted after inspection
- stale documentation residue about isolated cron identity is being retired:
  - isolated jobs no longer need to be described as always living under opaque
    `cron:<jobId>` base session aliases
- incomplete-proof residue is now centralized here instead of remaining spread
  across ad hoc notes

## Not included here

This proof pack is for deployment/runtime follow-through.

Memory packet-quality and kind-balance proof lives in:

- [Packet And Kind Balance Proof Pack](/projects/model-memory/packet-and-kind-balance-proof-pack)
