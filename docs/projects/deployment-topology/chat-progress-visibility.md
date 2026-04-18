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

Examples:

- `Working: Document ingest 42/304`
- `Queued: waiting for execution slot`
- `Completed: Daily operator review sync`
- `Failed (1): browser probe`

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

Progress comes from runtime-owned structured events that already exist for the
current turn.

## Current limits

This change improves direct chat visibility immediately, but it is not the full
end-state for progress UX.

Still deferred:

- richer structured progress rendering in the chat UI itself
- a dedicated task/progress pane
- replay of historical progress after reconnect
- cross-turn task continuity UI for detached work

Those are follow-on hardening/UI work, not blockers for the current fix.

## Proof path

Repo-backed proof:

- [dispatch-from-config.test.ts](/root/services/openclaw-roles/live/src/auto-reply/reply/dispatch-from-config.test.ts)
  now covers bounded live item progress in direct chat even when verbose mode is
  off

Live proof still needed:

- run a long-lived direct-chat task
- verify that chat receives bounded `Working:` / `Completed:` status lines
- verify the user no longer needs the session UI to distinguish active work
  from a real stall
