---
summary: "Native chat-visible progress design for long-running work, informed by a quarantined review of the ClawHub task-progress-stream skill."
title: "Chat Progress Visibility"
---

# Chat Progress Visibility

## Problem

Long-running work could look stalled from the ordinary chat view even when the
runtime was still making progress.

That gap was especially visible when:

- work was queued behind chokepoints
- a run emitted internal progress events but the chat showed no visible status
- the user had to open the session UI to verify that the task was still active

The product problem was not missing internal state. It was weak user-visible
surfacing of that state.

## External skill review

The ClawHub skill `task-progress-stream` was reviewed through a quarantined
download-and-delete pass.

Reviewed package contents:

- `SKILL.md`
- `_meta.json`
- `scripts/task_progress_stream.js`

Observed behavior:

- runs arbitrary shell commands through `/bin/bash -lc`
- tails arbitrary files
- writes status and log files to a local output directory
- injects progress summaries into chat by spawning the external `openclaw` CLI
  and calling `chat.inject`

Security and coherence judgment:

- marketplace page already flagged the skill as suspicious
- the package does what it advertises, but it solves the problem with a broad
  and unsafe execution surface
- it is not acceptable as a direct install or code-copy candidate for the live
  repo

What was kept:

- the narrow product idea that compact progress summaries should appear in chat
  while long-running work is active

What was explicitly not adopted:

- arbitrary command execution
- arbitrary log tailing
- external CLI-mediated chat injection
- automatic streaming of raw stdout or last-log lines into chat
- unbounded status-file creation as part of the user-facing progress path

The quarantined package was deleted after review. It is not part of the live
runtime.

## Native design

OpenClaw already had the right internal event seams:

- item events
- command-output events
- plan updates
- approval events

The missing piece was routing a bounded subset of that telemetry into direct
chat as short status messages.

The native implementation now uses the existing event stream instead of
installing a parallel runner.

Primary runtime seam:

- [dispatch-from-config.ts](/root/services/openclaw-roles/live/src/auto-reply/reply/dispatch-from-config.ts)

## Current behavior

For direct chats, and forum-style contexts where thread visibility matters, the
reply dispatcher now emits bounded progress text for:

- item progress
- command start / command completion
- command failure
- lifecycle start
- fallback / fallback cleared
- lifecycle error

Examples:

- `Working: Document ingest 42/304`
- `Working: processing request`
- `Working: retrying with fallback model openrouter/openai/gpt-5.4-mini`
- `Queued: waiting for execution slot`
- `Completed: Daily operator review sync`
- `Failed (1): browser probe`

Important contract:

- freeform commentary is not the live progress lane in ordinary chat delivery
- commentary is intentionally suppressed in several runtime paths
- if a long-running workflow needs visible progress, it must emit structured
  tool or item updates
- the model-memory document-ingest lane now forwards runner progress through
  the tool-update seam instead of only logging progress internally

Coverage status:

- this is not universal yet
- the chat renderer can show bounded progress for runtime-owned structured
  events
- shared lifecycle events from the reply runner now surface even when a turn has
  not emitted tool progress yet
- generic tool item updates now preserve `progressText`, not only `exec` output
- only tasks that actually emit those structured lifecycle/item/tool/command
  updates will surface visible progress in chat
- the model-memory document-ingest lane is wired correctly
- generic text-emitting tools now benefit automatically from the same path
- detached/background task replay for session-owned work is now present on the
  next active direct-chat turn from:
  - task-registry state
  - reply-run state for detached or resumed reply execution

Current controls:

- dedupe identical progress labels within `3s`
- cap visible live progress updates at `8` per turn
- keep the old verbose plan-update behavior separate
- continue suppressing noisy progress in ordinary group-chat contexts by
  default

The goal is visibility, not a second transcript.

## Why this is safer than task-progress-stream

This design stays inside the existing runtime ownership model:

- no new shell-execution surface
- no external progress injector
- no arbitrary log-tail permission
- no extra credentials path
- no uncontrolled leaking of stdout/stderr into chat

Progress now comes from two runtime-owned sources:

- current-turn structured lifecycle/item/tool/command events
- bounded detached-task replay derived from:
  - the task registry on the next active direct-chat turn
  - the reply-run registry on the next active direct-chat turn

## Current limits

This change closes the runtime replay gap for session-owned direct-chat work,
but it is not the full end-state for progress UX.

Still deferred:

- richer structured progress rendering in the chat UI itself
- a dedicated task/progress pane
- replay of detailed historical progress after reconnect
- cross-turn task continuity UI beyond bounded current-state replay
- native cron/background progress replay for work that never attaches to the
  current direct-chat session
- long-running lanes that still log internally without emitting structured
  lifecycle/item/tool updates

Those are follow-on hardening/UI work, not blockers for the current fix.

## Next tranche sketch: richer historical replay UI

The next meaningful improvement is not more dispatcher text. It is a bounded UI
surface for historical and reconnect-aware task state.

The intended shape is:

- a dedicated task/progress panel in the live UI
- per-task status chips for:
  - `queued`
  - `running`
  - `stalled`
  - `completed`
  - `failed`
- a stable task identity that survives reconnect and tab refresh
- a compact event timeline per task:
  - start time
  - latest progress summary
  - last update time
  - terminal outcome
- a distinction between:
  - live current-state replay in the chat transcript
  - richer historical replay in the task/progress panel

The UI should not become a second transcript. The chat lane should keep bounded
status recap, while the richer panel should answer:

- what is still running
- what just finished
- what stalled
- what happened since I was gone

Implementation boundary:

- runtime owns the canonical structured task state
- chat keeps bounded summary injection
- UI owns historical rendering, reconnect continuity, and drill-down

Suggested implementation slices:

1. expose replayable task summaries through a stable session/task query surface
2. add a live UI task panel that reads current and recent task state
3. add bounded historical timeline entries for task state transitions
4. add operator affordances for:
   - filter to active tasks
   - filter to recent failures
   - jump from chat recap to task detail
5. only after that, consider cron/task surfaces that never attach to direct chat

Success criteria for that tranche:

- a returning user can tell what happened without opening internal session
  internals
- active work and recent terminal work are distinguishable visually
- replay remains structured, bounded, and deduped
- the chat transcript stays compact

## Proof path

Repo-backed proof:

- [dispatch-from-config.test.ts](/root/services/openclaw-roles/live/src/auto-reply/reply/dispatch-from-config.test.ts)
  now covers:
  - bounded lifecycle progress in direct chat even when there are no tool events
  - bounded detached-task replay into the next active direct-chat turn
- [pi-embedded-subscribe.handlers.tools.test.ts](/root/services/openclaw-roles/live/src/agents/pi-embedded-subscribe.handlers.tools.test.ts)
  now covers generic tool-item `progressText` surfacing
- [Detached Progress Replay Audit](/projects/deployment-topology/detached-progress-replay-audit)
  records the runtime-owned replay seam and replay guards
- [Chat Progress Coverage Audit](/projects/deployment-topology/chat-progress-coverage-audit)
  records the exact covered and uncovered lanes

Live proof still needed:

- run a long-lived direct-chat task
- verify that chat receives bounded `Working:` / `Completed:` status lines
- verify the user no longer needs the session UI to distinguish active work
  from a real stall
