---
summary: "Detailed review artifact and surfacing contract for the proactive planner."
title: "Planner Review Artifacts And Surfacing"
---

# Planner Review Artifacts And Surfacing

## Objective

Define the concrete review artifact and surfacing contract that lets planner
outputs appear inside ordinary OpenClaw workflow instead of a hidden queue.

## Candidate artifact

Each candidate should include:

- `candidateId`
- `candidateType`
- `targetId`
- `projectId`
- `summary`
- `recommendedAction`
- `urgency`
- `relevanceSignals`
- `surfacingLane`
- `requiresApproval`
- `evidenceRefs`
- `createdAt`
- `lastSurfacedAt`
- `status`
- `expiresAt`
- `pinned`
- `recurrenceCount`

## Surfacing lanes

- `must_surface`
- `context_surface`
- `background_only`

## Channel contract

### Turn

Show only when:

- the candidate overlaps the active work strongly enough
- or it is `must_surface`

### Heartbeat

Show:

- all pending `must_surface`
- summary counts for other pending classes

Heartbeat is also the first runtime surface for proactive planner maintenance.
When planner work exists, heartbeat should report bounded activity instead of
returning only `HEARTBEAT_OK`.

Heartbeat may surface:

- skill candidates
- tool candidates
- workflow candidates
- dirty graph, capsule, projection, or cache state
- repeated retrieval misses
- stale or conflicted derived artifacts
- high-risk privacy or prompt-injection quarantine summaries

Heartbeat may trigger reversible derived maintenance when enabled by policy. It
must not silently write canonical MMV2 truth, install skills, enable tools,
promote workflows, or reveal raw prompts, transcripts, tool logs, secrets, or
private phrases.

### Daily operator review

Show:

- grouped pending candidates
- top-ranked by urgency and age
- enough evidence to act

## Identity rule

The same `candidateId` must appear across turn, heartbeat, and daily review so
operator cognition is not wasted on duplicated but renamed items.

## Dedupe and expiry

Planner candidates should dedupe by stable candidate id, target id, candidate
type, source evidence refs, and recommended action.

Repeated findings should update recurrence count and last-seen time instead of
creating new candidate rows.

Stale candidates should expire when:

- the affected source memory ids are no longer active
- the graph, capsule, projection, or cache state no longer reproduces the issue
- the recommendation has been rejected
- the configured TTL passes with no renewed evidence

Default lifecycle:

- unresolved candidates remain active for `30` days
- archived candidates remain available for `90` days
- recurrence renews the active window
- explicit pinning prevents expiry until the candidate is unpinned or resolved

Phase 2 v1 stores review items as bounded artifacts plus a lightweight runtime
index. A dedicated review inbox UI is now active in the Control UI, but the
primary chat workspace remains preserved:

- chat chrome exposes a compact `Proactivity` entry point with actionable count
- the full Proactivity Inbox opens in the side drawer, not inside the transcript
- the default view shows actionable suggestions only
- sent, snoozed, and dismissed items are history views
- auto-send simulations, blocked preflight, blocked candidates, proof metadata,
  and why-not-shown records live behind Diagnostics
- actionable suggestions must include `planTitle`, `problem`,
  `proposedMessage`, `userBenefit`, `evidenceSummary`, `confidence`, and
  `blockedIfMissing`
- generic placeholder-only candidates are not actionable
- active-context surfacing uses exact user/project/session/operator/task matches
  and records why-not-shown diagnostics for mismatches
- Approve & Send sends only the reviewed or edited proposed message and remains
  explicit; the inbox must show success/failure feedback after the action
