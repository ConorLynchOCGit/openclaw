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
- the project now also owns the canonical backlog and result ledger for
  operator-facing UI validation that crosses runtime proof, browser proof, and
  human-only checks
- the project now also owns the canonical deduplicated matrix for those tests:
  - [Master Human UI Test Matrix](/projects/qa-program/master-human-ui-test-matrix)
- the April 19, 2026 master pass established:
  - same-pass helper proof for live selector payload cleanliness
  - same-pass Tailnet browser proof for authenticated Control UI state
  - same-pass root-gate dry-run proof for `check`, `test`, and `build`
  - a still-large blocked tranche of prompt-driven operator/UI tests
- the authenticated prompt-harness tranche closed the old missing-harness
  seam and the live fix-and-rerun follow-up burned down the non-memory failures:
  - sanctioned prompt-execution harness exists for Main and visible specialist
    lanes through the approved Tailnet Control UI
  - the current 38-test matrix now grades as:
    - `32` pass
    - `2` fail
    - `4` blocked_by_environment
  - the remaining backlog is now intentionally narrow:
    - ordinary-turn model-memory token capture or retrieval exactness
    - detached ingest replay
    - the four previously classified environment blockers

## Immediate next move

- keep project planning in this workspace
- keep executable QA assets in `qa/`
- evolve the scenario pack and harness without letting planning drift back into
  scattered free-floating files
- keep the operator UI backlog and executed-result ledger current as deployment
  and Control UI behavior changes
- use the master matrix and authenticated harness proof instead of ad hoc
  checklist scanning the next time a full operator pass is requested
- keep the now-green operator/UI rows closed with the sanctioned harness and
  live runtime proof
- take the next product pass narrowly against:
  - token capture and later retrieval exactness
  - detached ingest replay
- separately unblock the four environment-dependent rows when their
  prerequisites exist
