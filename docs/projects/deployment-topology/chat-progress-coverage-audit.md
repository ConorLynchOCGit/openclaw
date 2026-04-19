---
summary: "Evidence-backed audit of which long-running runtime lanes currently surface bounded progress in chat."
title: "Chat Progress Coverage Audit"
---

# Chat Progress Coverage Audit

## Current judgment

The renderer is no longer the main limiter. For direct-chat and session-owned
detached work, the missing piece was replayable structured state.

This pass broadens coverage at the shared runtime seam and closes the old
session-owned detached replay gap. Progress is still not universal for
non-session or non-structured work.

## Covered now

### Reply lifecycle events

- Surface:
  - embedded/direct-chat reply execution
- Progress source:
  - runtime lifecycle events forwarded through
    `src/auto-reply/reply/agent-runner-execution.ts`
- Chat-visible now:
  - yes
- Event types:
  - `start`
  - `fallback`
  - `fallback_cleared`
  - `error`
- Examples:
  - `Working: processing request`
  - `Working: retrying with fallback model ...`
- Fix in this sprint:
  - lifecycle events now flow into
    `src/auto-reply/reply/dispatch-from-config.ts`

### Command execution updates

- Surface:
  - runtime-owned command lanes that already emit command output
- Progress source:
  - command output and completion events
- Chat-visible now:
  - yes
- Event types:
  - command `start`
  - command `end`
  - command `error`
- Notes:
  - bounded summaries existed already and remain the canonical path

### Tool item updates with text payloads

- Surface:
  - tool lanes that emit `onUpdate` text
- Progress source:
  - tool partial/update payloads converted into item progress text
- Chat-visible now:
  - yes
- Event types:
  - item `update`
  - item `end`
  - item `error`
- Fix in this sprint:
  - generic tool item updates now keep `progressText` in
    `src/agents/pi-embedded-subscribe.handlers.tools.ts`
- High-value lane covered:
  - model-memory document ingest

### Plan and approval events

- Surface:
  - plan updates and approval requests
- Progress source:
  - existing structured runtime events
- Chat-visible now:
  - yes
- Event types:
  - plan `update`
  - approval `requested`
- Notes:
  - these were already wired and remain unchanged

## Partially covered

### Foreground cron/admin runs invoked through direct chat

- Surface:
  - manual runs that stay attached to the current turn
- Progress source:
  - whatever command/tool events that path emits
- Chat-visible now:
  - partial
- Missing:
  - no universal per-job progress contract
  - command-only lanes can still look sparse between major transitions
- Fix path:
  - emit structured item updates from long-running admin tools, not only final
    command output

### Benchmark and memory-admin tool lanes

- Surface:
  - benchmark/evaluation and memory-admin flows exposed through tools
- Progress source:
  - tool updates only when the tool implementation calls `onUpdate`
- Chat-visible now:
  - partial
- Missing:
  - some runners still log internally without emitting item updates
- Fix path:
  - adopt the same bounded `onUpdate` contract used by document ingest

## Covered now

### Detached or background session work

- Surface:
  - long-running detached jobs
  - resumed background work
- Progress source:
  - internal task-registry state such as `progressSummary`
  - internal reply-run state for detached or resumed reply execution
- Chat-visible now:
  - yes, in bounded current-state form
- Event types:
  - replayed `Queued`
  - replayed `Working`
  - replayed `Stalled`
  - replayed `Completed`
  - replayed `Failed`
- Current guardrails:
  - replayed from stable runtime state, not logs
  - deduped through `lastReplayedEventAt` or reply-run replay timestamps
  - bounded to visible session-owned work
  - no historical transcript playback
- Remaining gap:
  - detailed historical replay is still missing
  - background work with no task-registry or reply-run state is still outside
    this lane

### Native cron runs outside the current turn

- Surface:
  - OpenClaw-native cron activity not running inside the user’s direct chat
- Progress source:
  - cron run records and artifacts
- Chat-visible now:
  - no
- Missing:
  - no turn-local progress stream by design
- Fix path:
  - expose status through operator review surfaces or a dedicated task pane, not
    direct-chat streaming

### Cross-turn replay and reconnect

- Surface:
  - work still running after reconnect or after the user returns later
- Chat-visible now:
  - yes, in bounded current-state form for session-owned work
- Present now:
  - reconnect-safe bounded replay for:
    - registry-backed session tasks
    - reply-run-backed detached reply execution
- Missing:
  - richer replay UI
  - non-registry/non-reply-run job continuity
  - historical progress playback beyond current-state recap

## Guardrails

- direct chat remains the primary visible progress target
- ordinary group-chat contexts stay quiet by default
- duplicate labels are suppressed inside the dispatcher
- live progress is capped per turn so chat does not become a raw log stream

## Current result

This sprint moved progress from:

- renderer-ready but emitter-dependent in a narrow set of lanes

to:

- shared direct-chat lifecycle coverage
- shared generic tool-update coverage
- bounded detached/background replay for session-owned registry and reply-run
  work
- explicit documentation of the remaining non-structured and historical replay
  gap

That materially reduces false “it stalled” perception for the touched lanes,
but richer cross-turn task UX is still an open follow-on item.
