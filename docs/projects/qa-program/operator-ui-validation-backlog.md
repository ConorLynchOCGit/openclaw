---
summary: "Canonical remaining-work view for operator-facing UI validations after the live fix-and-rerun pass."
title: "Operator UI Validation Backlog"
---

# Operator UI Validation Backlog

## Current canonical source

The full deduplicated inventory lives in:

- [Master Human UI Test Matrix](/projects/qa-program/master-human-ui-test-matrix)

This backlog is the shorter remaining-work view after the authenticated
prompt-harness pass and the live fix-and-rerun follow-up.

## Classification legend

- `automated_and_runnable_now`
- `blocked_by_environment`
- `obsolete_or_superseded`

## Remaining backlog after the live fix-and-rerun pass

| Canonical test ID                         | Surface                                                  | Current best method                                   | Classification               | Current note                                                                                          |
| ----------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `ui-model-memory-token-capture-retrieval` | ordinary-turn token capture and later retrieval          | rerunnable authenticated Tailnet browser harness      | `automated_and_runnable_now` | later retrieval returned the wrong remembered token                                                   |
| `ui-detached-ingest-replay`               | detached ingest replay                                   | rerunnable authenticated Tailnet browser harness      | `automated_and_runnable_now` | ingest start and live progress now pass, but the follow-up replay still does not restate ingest state |
| `ui-model-memory-daily-summary-canary`    | daily-summary canary retrieval                           | authenticated harness when eligible summary exists    | `blocked_by_environment`     | no eligible finalized daily-summary canary was available in this pass                                 |
| `ui-daily-weekly-review-artifacts`        | fresh daily/weekly operator-review artifacts and preview | fresh review job execution plus authenticated browser | `blocked_by_environment`     | this pass did not run fresh daily/weekly review jobs end to end                                       |
| `ui-github-digest-lane`                   | fresh GitHub digest lane observation                     | safe digest trigger or next scheduled digest window   | `blocked_by_environment`     | no safe same-pass digest trigger or fresh digest artifact was exercised                               |
| `ui-intake-surface`                       | retained intake route                                    | authenticated browser once a sanctioned route exists  | `blocked_by_environment`     | no authenticated intake route was surfaced in the Control UI shell                                    |

## Immediate next tranche

1. keep this pass closed on the non-memory fixes that are already live and
   re-proven:
   - selector hygiene
   - operator-review visibility
   - fresh `/new` bootstrap cleanliness
   - Main browser and delegation routing
   - specialist lane readability
   - progress/replay/parity
   - ingest start and live progress
2. push the remaining memory-adjacent defects into the next focused fix slice:
   - exact token capture and later retrieval
   - detached ingest replay
3. rerun the still-blocked environment rows once:
   - eligible daily-summary canary exists
   - fresh daily/weekly review jobs are run
   - a safe GitHub digest trigger or scheduled event occurs
   - intake exposes a sanctioned authenticated UI route
