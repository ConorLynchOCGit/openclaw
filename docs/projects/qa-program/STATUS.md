---
summary: "Current status for the QA Program project."
title: "QA Program Status"
---

# QA Program Status

## Overall

State: `active`

The QA scenario and harness lane is now recognized as a canonical project
workspace instead of being tracked only through scattered planning files.

## Confirmed current state

- canonical authored scenario truth already lives in `qa/scenarios/`
- scenario architecture and harness direction were previously split across:
  - `docs/refactor/qa.md`
  - `qa/frontier-harness-plan.md`
  - `qa/new-scenarios-2026-04.md`
- frontier tuning and scenario expansion are active enough to justify a project
  workspace

## Immediate next move

- keep project planning in this workspace
- keep executable QA assets in `qa/`
- evolve the scenario pack and harness without letting planning drift back into
  scattered free-floating files
