---
summary: "Immediate and longer-term spec for OpenClaw operator UX quality-of-life work."
title: "Operator UX QoL Roadmap"
---

# Operator UX QoL Roadmap

## Problem

The current operator loop has weak observability. Long tasks can appear idle, queued prompts can feel lost, memory events can clutter the transcript, and host permission state is not obvious. This makes OpenClaw feel unreliable even when work is progressing.

## Project Ownership

Operator Experience owns the UX and workflow layer.

Related projects:

- Workspace Topology owns canonical path resolution and host-operator access mechanics.
- Model Memory owns MMV2 retrieval, capture, projection, and memory event semantics.
- Agent Foundation owns agent/tool/skill packaging and role behavior.

## Quick Wins

### Persistent Elapsed-Time Status

Show elapsed time on the active working card and keep it stable in the feed.

Status: first pass implemented in the chat view.

Requirements:

- Show immediately on queued/running prompts.
- Update at low frequency, such as once per second.
- Preserve reduced-motion compatibility.
- Fall back to `running` when detailed phases are unavailable.

Validation:

- UI test for queued-to-running-to-complete transition.
- Manual proof that a long task has visible elapsed time.

### Cancel and Retry on Working Card

Expose run control where backend support exists.

Status: cancel first pass is wired where abort support exists. Retry renders as unavailable with an explicit reason until durable replay support exists.

Requirements:

- Cancel for queued and running runs when cancellation is supported.
- Retry for failed/completed runs when replay inputs are safe.
- Disabled state with tooltip when unsupported.

Validation:

- Queue cancellation test.
- Retry action test against a harmless failed run fixture.

### Memory and Retrieval Timeline Chips

Render memory activity as structured timeline chips/cards.

Status: first pass implemented for structured model-memory activity messages and legacy `[Memory Activity]` compatibility messages.

Chip types:

- retrieval checked
- pack injected
- projection digest used
- capture skipped
- memory written
- retrieval empty
- miss diagnostic

Expanded metadata:

- retrieval request/result ids
- selected memory ids
- excluded ids and reasons
- projection ids
- capture event ids
- pack ids

Privacy rules:

- No raw prompt text.
- No full transcript.
- No raw tool logs.
- No private phrase or secret values.

### Host-Operator Mode Badge

Show current host permission state in the shell/header and per-run diagnostics.

Status: first pass implemented in the operator diagnostics panel. Live backend tool-status telemetry remains pending.

States:

- ordinary
- host-operator read-only
- host-operator write-enabled
- host-operator exec-enabled
- disabled by kill switch

Badge should include the active scope when relevant:

- `live_repo`
- `operator_workspace`

### Copy Diagnostic Bundle

Provide a one-click redacted bundle for debugging.

Status: first pass implemented in working cards and operator diagnostics.

Include:

- run id
- session id
- queue state
- current phase
- elapsed time
- tool names and statuses
- retrieval/capture ids and counts
- host-operator mode and audit ids
- relevant artifact paths
- client build/version when available

Exclude by default:

- raw prompts
- full transcripts
- raw tool logs
- secrets
- private phrases
- root `USER.md` and `MEMORY.md` content

## Medium Work

### Durable Run-History Page

Persist redacted run summaries so operators can review long-running and failed work after the feed moves on.

Status: pending dedicated page. The chat view now includes a first-pass redacted run-history summary from loaded sessions.

### Retrieval Proof Explorer

Expose why a response did or did not use durable memory.

Status: pending dedicated explorer. The chat view now includes a first-pass retrieval proof summary from visible memory activity events.

Must show:

- query hash or redacted query label
- request/result ids
- selected memories
- excluded candidates and reasons
- projection digest sources
- `memory_existed_but_excluded` diagnostics

### Projection Artifact Browser

Browse materialized projection artifacts without treating them as truth.

Status: pending dedicated browser. The chat view now includes a first-pass projection artifact summary from visible memory/projection activity events.

Must show:

- projection id/type
- artifact path
- content hash
- freshness
- source memory/event/edge ids
- stale/conflict markers

### Permission-Mode Switcher

Let the operator intentionally switch from ordinary mode into host-operator read-only, write-enabled, or exec-enabled mode.

Rules:

- No default blanket host access.
- Every escalation needs visible state and audit logging.
- Write and exec remain separately kill-switch gated.

### Queue Manager

Manage queued and background work.

Capabilities:

- view queue
- cancel queued work
- edit before start when safe
- retry failed work
- pause/resume long jobs
- show blocked state and reason

### Proactivity Inbox

Make proactive memory review visible without taking over the chat transcript.

Status: product-correctness remediation keeps Proactivity as a compact chat
chrome entry point and opens the full inbox in the side drawer. The next
correction treats proactive items as work opportunities, not messages by
default.

Must show:

- actionable count separate from history and diagnostics
- concrete plan title, problem, proposed next step or message, expected value,
  evidence summary, and confidence
- intent-specific CTAs: Plan this, Investigate, Draft next steps, Start scoped
  task, Open in current chat, Add to Daily Review, and Send message only for
  message candidates
- clear explanation of what each CTA will do before it starts
- status after handoff: planning_started, planned, investigating, drafted,
  execution_proposed, done, dismissed, snoozed, or blocked
- success/failure feedback after handoff or `chat.inject`
- Open in chat / View sent message after successful handoff or send
- sent/snoozed/dismissed history separate from actionable work
- diagnostics for blocked/preflight/simulation/why-not-shown items behind a
  Diagnostics view
- one canonical state per work item across inbox, heartbeat, contextual
  surfacing, and history
- same-session duplicates must collapse before they crowd actionable surfaces
- primary proactivity copy must read like user-facing work, not like system
  telemetry or control-plane scaffolding
- inline follow-up and heartbeat cards must follow the same bounded width and
  hierarchy rhythm as the assistant transcript cards
- no duplicate `Suggested action` / `Proposed next step` copy in the primary
  card when the item is a planning handoff
- `Plan this` behaves as a pure handoff action, not a send-like action

### Proactivity Heartbeat / Daily Review

Make proactive memory part of the normal operating loop rather than a hidden
diagnostic card.

Must show:

- a clean user-facing “What would help this user today?” briefing generated
  from hidden structured context rather than pre-rendered system text
- distinct surface treatment for:
  - top opportunities
  - reverse prompts
  - draft-ready items
  - follow-up / stale-outcome nudges
  - self-healing candidates
- supporting provenance/evidence behind disclosure rather than in the primary
  body
- bounded cards that match the chat layout rhythm instead of dashboard or
  debug-card sprawl

- visible “What would help this user today?” section in the Daily Operator
  Review / Heartbeat location
- top ranked proactive work cards with plan title, why now, proposed next step,
  expected value, evidence summary, confidence/limitations, and provenance
- the same candidate/work item ids used by the inbox and contextual chat cards
- direct path to start the next useful work step or open the inbox detail
- why-not-shown diagnostics only behind diagnostics/debug detail
- the same lifecycle state shown in the inbox for the same work item id

Must not show:

- raw prompts, full transcripts, raw tool logs, secrets, or private phrases
- proof/debug artifacts in the primary actionable count
- generic placeholder-only suggestions as actionable cards
- static bundled/default/doc-seeded fallback candidates as primary actionable
  cards; those belong in diagnostics unless a live signal promotes them
- auto-send or action execution without a separate approved capability decision

### Live Generation Before Rollout

Operator UX work must not repeat the proactivity failure mode where safe
surfacing infrastructure outpaced useful generation. For proactivity, Skills,
tools, and workflow synthesis, a primary product surface should not be expanded
until a real work event produces a useful bounded item without manual
proof-fixture seeding.

The UX-ready item must show:

- what happened in real work
- why it matters now
- what the agent can do next
- the smallest safe next step
- expected user value
- provenance and confidence/limitations

Static fallback candidates, simulations, proof metadata, and blocked
preflights stay in diagnostics and never inflate primary counts.

### Generator-first proactivity reset

The next operator-facing proactivity pass is explicitly usefulness-first:

- a normal roadmap/planning prompt should be able to create a new proactivity
  opportunity without manual seeding
- a normal assistant answer with concrete next steps should create structured
  inbox items automatically
- top heartbeat items may arrive with bounded `Draft ready` planning or
  investigation briefs
- stale/resolved/superseded items should disappear automatically from primary
  actionable UX
- recurring asks, repeated errors, manual workarounds, and postponed decisions
  should create bounded follow-up opportunities

This is the guardrail for Skills and later buckets too: operator UX should not
grow broader control surfaces until useful generation from real work is proven.

The next ambient proactivity correction is specifically about normal workflow:

- same-session assistant answers should produce visible follow-up surfaces
  without the user opening the inbox
- same-session assistant answers must come from authoritative assistant-final
  capture, not operational assistant noise or placeholder summaries
- heartbeat should show a bounded proactive review when live opportunities
  exist instead of remaining a legacy `HEARTBEAT_OK` no-op
- persisted proactivity state should survive refresh/restart and auto-retire
  handled items

### Diff, Test, and Build Status Cards

Represent engineering work as structured status cards instead of prose.

Status: first-pass command classification is implemented for visible tool messages. Full command lifecycle cards remain pending.

Cards:

- git status
- diff summary
- test command
- build command
- runtime pickup
- push/commit state

## Longer-Term Spec

The target shape is an operator console that unifies:

- current run status
- durable run history
- queue manager
- host permission mode
- git/diff/test/build state
- artifacts and reports
- memory/retrieval/projection evidence
- diagnostic bundle export

The console should keep the main transcript readable while preserving full operational detail one click away.

## Guardrails

- Do not store raw prompts, full transcripts, raw tool logs, secrets, or private phrases in diagnostic or memory activity records by default.
- Do not show generated projection output as canonical truth.
- Do not let host-operator mode imply broad host filesystem access.
- Do not hide unsupported actions. Show disabled controls with exact reason.

## Acceptance

- A user can always tell whether a run is queued, running, blocked, failed, or complete.
- A user can inspect memory/retrieval/capture activity without transcript spam.
- A user can export a useful diagnostic bundle without leaking sensitive content.
- A user can see whether Main has ordinary or host-operator permissions before asking it to touch files.
