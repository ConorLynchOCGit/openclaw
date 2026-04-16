---
summary: "Execution checklist for the aggressive model-memory cutover."
title: "Model Memory Cutover Checklist"
---

# Model Memory Cutover Checklist

Current state:

- `production_cutover_flip_executed`
- see [Cutover Day 0 Verification](/projects/model-memory/evidence/post-cutover/day-0-cutover-verification)
- active runbook: [72 Hour Watch](/projects/model-memory/cutover-72h-watch)

## Pre-deploy

- confirm the landed runtime seam is present in the build:
  - live bootstrap/context overlay
  - live assistant-turn capture
  - explicit `model-memory` enable/disable config
- confirm `model-memory` live-runtime wiring is merged
- confirm explicit `model-memory` disablement switch is merged
- confirm legacy memory slot can be set to `"none"`
- confirm legacy memory search can be disabled in production config
- confirm status/doctor/operator surfaces can report cutover state
- confirm post-cutover review owners for days 1 through 3
- confirm fast-follow hotfix owner

## Deploy

- completed on `2026-04-15` UTC
- deploy the build containing:
  - live `model-memory` runtime wiring
  - disablement switch
  - observability/reporting seams
- apply production config:
  - `plugins.slots.memory = "none"`
  - `agents.defaults.memorySearch.enabled = false`
  - enable `model-memory` live runtime
- restart the gateway/runtime if required by the final implementation seam

## First 15 minutes

- completed for day 0
- verify `model-memory` runtime is active
- verify no legacy memory plugin is active
- verify capture/write counters move
- verify retrieval/context surfaces remain healthy
- verify write-path failures are zero

## First hour

- active on day 0
- inspect recent write decisions
- inspect `attach_support`
- inspect `conflict_hold`
- inspect ambiguous adjudication outcomes
- inspect duplicate-active-object candidate trend

## Daily for 72 hours

- active for days 1 through 3
- run the daily sampled review basket
- review duplicate-active-object candidate growth
- review fresh active-object growth versus support growth
- review cross-kind same-core outcomes
- classify any issue as:
  - hotfix
  - next-day fix
  - backlog

## Disablement criteria

- systemic write-path failures
- clearly unsafe merge behavior
- repeated obvious duplicate escapes at an operationally unacceptable rate
- compounding duplicate active-object growth confirmed by sample review

## Disablement action

- disable `model-memory`
- keep `plugins.slots.memory = "none"`
- keep legacy memory search disabled
- continue in native no-memory mode while fixing forward

## After stabilization window

- declare cutover stable if the 72-hour watch completes without disablement
- begin deletion of legacy code and docs
- remove legacy slot-default assumptions
- remove legacy operator/status/doc surfaces
