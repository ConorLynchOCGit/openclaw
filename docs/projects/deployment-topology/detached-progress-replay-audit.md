---
summary: "Audit and implementation record for replaying detached/background task progress back into the active chat turn."
title: "Detached Progress Replay Audit"
---

# Detached Progress Replay Audit

## Problem

Detached and background work already had structured runtime state, but that
state did not reappear in chat when the user returned to the active session.

The result was a misleading UX:

- the task registry knew the task was still active
- the session UI could show chokepoints or active runs
- the direct chat turn still looked dead

## What existed already

Stable internal progress already lived in two runtime-owned places:

- task registry state:
  - `TaskRecord.status`
  - `TaskRecord.progressSummary`
  - `TaskRecord.lastEventAt`
  - `TaskRecord.ownerKey`
  - `TaskRecord.runId`
- reply-run state:
  - session-owned reply phase
  - bounded progress text
  - recent terminal outcome summary

Stable identity already existed for replay:

- session-scoped ownership via `ownerKey`
- task identity via `taskId`
- replayable freshness via `lastEventAt` or reply-run `updatedAt`

The missing seam was not storage. It was bounded replay into the next active
direct-chat turn.

## Gap before this slice

Before this slice:

- in-turn lifecycle/item/tool progress surfaced in chat
- detached/background task state stayed in internal runtime state only
- terminal delivery could still queue system events or direct notices
- there was no bounded replay of current detached status when the user came back

That meant the product had:

- foreground progress
- terminal notifications
- but no reconnect or reattach progress visibility

## Runtime seam chosen

The fix belongs at the runtime boundary between:

- task registry current state
- and direct-chat dispatch

Implemented seam:

- task-registry replay candidate selection in
  [task-registry.ts](/root/services/openclaw-roles/live/src/tasks/task-registry.ts)
- reply-run replay candidate selection in
  [reply-run-registry.ts](/root/services/openclaw-roles/live/src/auto-reply/reply/reply-run-registry.ts)
- replay injection in
  [dispatch-from-config.ts](/root/services/openclaw-roles/live/src/auto-reply/reply/dispatch-from-config.ts)

This keeps replay:

- runtime-owned
- structured
- bounded
- separate from freeform assistant commentary

## Implemented behavior

The runtime now:

1. looks up session-owned replay candidates from the task registry at dispatch
   start
2. looks up session-owned replay candidates from the reply-run registry for
   detached or resumed work that never persisted task-registry state
3. selects only visible active work and undelivered recent terminal outcomes
4. formats bounded current-state labels such as:
   - `Queued: ...`
   - `Working: ...`
   - `Stalled: ...`
   - `Completed: ...`
   - `Failed: ...`
5. emits those labels through the existing live progress lane
6. records replay delivery state so the same detached
   state is not replayed again on every turn

## Replay guards

The replay path is intentionally bounded:

- session scope only
- active-turn direct-chat visibility rules still apply
- no raw log playback
- no historical transcript reconstruction
- current-state replay only
- replay capped to the top visible work items, not the full registry
- stale current state suppressed through `lastReplayedEventAt` for task-registry
  work and replay timestamps for reply-run work

## Current coverage

Covered now:

- session-owned detached background tasks with live `progressSummary`
- session-owned detached or resumed reply runs with bounded progress text
- queued detached work
- running detached work
- stalled detached work when the progress summary carries stall markers
- recent undelivered terminal results when they still need bounded foreground
  recap

Still not covered:

- raw historical progress playback
- dedicated detached-task UI panes
- cron work that never reattaches to the current chat session
- arbitrary background logs that do not flow through either the task registry or
  the reply-run registry

## Proof path

Repo-backed proof:

- [dispatch-from-config.test.ts](/root/services/openclaw-roles/live/src/auto-reply/reply/dispatch-from-config.test.ts)
  now covers detached-task replay, detached reply-run replay, recent completed
  reply-run replay, and replay dedupe
- [task-registry.store.sqlite.ts](/root/services/openclaw-roles/live/src/tasks/task-registry.store.sqlite.ts)
  persists `lastReplayedEventAt`
- [task-registry.ts](/root/services/openclaw-roles/live/src/tasks/task-registry.ts)
  now computes bounded replay candidates from current task state
- [reply-run-registry.ts](/root/services/openclaw-roles/live/src/auto-reply/reply/reply-run-registry.ts)
  now persists bounded active and recent reply-run progress snapshots for replay

## Result

This slice closes the active-turn reconnect gap for session-owned detached work.
Current replay authority is:

- task registry for task-backed work
- reply-run registry for detached or resumed reply execution that does not enter
  task-backed storage

Follow-on UX work still exists, but it is no longer a replay-gap blocker for
session-owned detached/background execution:

- a cross-session task pane
- full replay history
- richer UI rendering than bounded status recap
