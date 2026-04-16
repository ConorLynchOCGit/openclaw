---
summary: "Current slice for model-memory."
title: "Model Memory Current Slice"
---

# Current Slice

## Slice

`post-cutover-72-hour-stabilization`

## Goal

Run the first 72 hours after the aggressive full cutover from the legacy memory
stack to `model-memory`:

- `model-memory` becomes the primary memory authority
- rollback goes to native no-memory behavior, not back to the legacy stack
- observability and sampled review become the main safety controls
- legacy memory retirement is explicit and time-bounded

## Current outcome

- the production flip has been executed:
  - `model-memory` live runtime enabled
  - database configured
  - `plugins.slots.memory = "none"`
  - `agents.defaults.memorySearch.enabled = false`
- the gateway/runtime has been rebuilt and restarted on the live path
- status now reports:
  - `Model memory = enabled`
  - `legacy slot = off`
  - `legacy search = off`
- the 72-hour operational surfaces now live in:
  - [Cutover Plan](/projects/model-memory/cutover-plan)
  - [Cutover Checklist](/projects/model-memory/cutover-checklist)
  - [72 Hour Watch](/projects/model-memory/cutover-72h-watch)
  - [Cutover Day 0 Verification](/projects/model-memory/evidence/post-cutover/day-0-cutover-verification)

## Current judgment

- current project judgment:
  - `production_cutover_flip_executed`
- this is now an operating judgment:
  - the live runtime is on `model-memory`
  - the next step is the active 72-hour watch plus sampled review
