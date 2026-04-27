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

Heartbeat / Daily Operator Review is a product surface, not a diagnostics-only
surface. It must include a visible “What would help this user today?” section
when top proactive work opportunities exist. Each top item should render as a
concrete plan card with the same candidate/work item id used by the inbox and
chat contextual card.

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
- direct intent-specific CTAs for the next useful work step

## Identity rule

The same `candidateId` must appear across turn, heartbeat, and daily review so
operator cognition is not wasted on duplicated but renamed items.

For work-item based proactivity, the same deterministic `workItemId` should also
appear across the inbox, heartbeat, daily review, contextual card, chat handoff,
and outcome telemetry.

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
- proactive cards are work opportunities by default. The primary CTA should be
  intent-specific: Plan this, Investigate, Draft next steps, Start scoped task,
  Open in current chat, Add to Daily Review, or Send message only for actual
  message candidates
- planning, investigation, drafting, and scoped-task CTAs start a bounded
  user-visible handoff in chat and update the work item outcome state; they do
  not call `chat.inject`, send external messages, or execute actions
- `Plan this` is a pure handoff action. It must not create a send-like record,
  require edit-before-start, or remain simultaneously actionable and
  historical.
- Send message remains explicit for `message_candidate` items only; the inbox
  must show success/failure feedback after any send action
- diagnostics such as auto-send simulation, blocked preflight, proof metadata,
  and why-not-shown records must remain outside the primary actionable count
- history views must reflect canonical lifecycle transitions for the same
  deterministic work item id; synthetic placeholder history rows are not a
  valid UX model
- the primary card keeps one concise next-step line and moves redundant detail
  into disclosure

## Live generation gate

Review surfacing is not proof of usefulness by itself. A planner/proactivity
item may enter the primary actionable inbox, heartbeat, or contextual chat card
only when a live work signal produced it. Static bundled/default/doc-seeded
items are diagnostics/fallbacks and must carry a reason such as
`static_default_candidate_demoted`.

Live signals may come from:

- ordinary-turn capture
- session/runtime events
- task or queue state
- maintenance-loop output
- project-state capsules
- derived memory artifacts
- operator feedback events
- gateway delivery or error events

Primary actionable items require concrete content fields: title, why now,
proposed next step, expected user value, evidence summary, confidence or
limitations, provenance/source profile/authority/hash metadata, freshness or
conflict labels, and no-dark-data pass. Generic placeholders are diagnostics,
not opportunities.

This gate applies to future Skills, tools, and workflow synthesis work too:
real useful candidate generation must be proven before adding broad rollout,
default-promotion, auto-installation, or dashboard scaffolding.

## Acceptance-Oriented Surfacing

The review surface must now support the proactivity live-usefulness acceptance
sequence:

- Primary inbox/actionable counts include only live, unsuppressed actionable
  work opportunities.
- Heartbeat / Daily Operator Review is a primary workflow-boundary surface for
  top ranked “What would help this user today?” items, not a diagnostics-only
  report.
- Contextual cards appear only on exact active context match.
- Suppressed, repeated, stale, blocked, or static fallback items remain in
  Diagnostics with why-not-shown reason codes.
- Planning/investigation/drafting CTAs start bounded chat handoffs with
  expected output contracts and never call `chat.inject`.
- Acceptance reports must aggregate generation, surfacing, handoff, feedback,
  dismissal, snooze, suppression, leakage, unsafe action, autonomous-send, and
  static fallback metrics to decide whether proactivity can move to Skills.

## Handoff formatting contract

Operator-visible handoff text must read like a clean structured request, not a
raw concatenated template. Required sections:

- opening line
- why now
- bounded context
- evidence summary
- expected output
- safety boundary

## Ledger-backed review surfaces

The next proactivity pass replaces queue-first surfacing with ledger-first
surfacing.

- Assistant-output-derived opportunities are first-class review inputs when the
  output contains bounded, concrete next-step content.
- For assistant-output-derived opportunities, authoritative transcript sync must
  persist only substantive assistant final answers. Operational assistant
  markers and placeholder fallback summaries are not valid review sources.
- The same canonical opportunity id must drive inbox, heartbeat, contextual
  cards, history, autonomous drafts, and follow-up.
- Review surfaces must be able to show `draft_ready` state for top heartbeat
  opportunities without requiring the operator to open the inbox first.
- Already-resolved, superseded, stale, or reopened items must update the same
  canonical opportunity/work item record instead of creating parallel truths.
- Why-not-shown diagnostics stay available, but primary usefulness is judged by
  whether real work and real agent output create useful surfaced items.

## Ambient workflow surfacing

- Inline “Follow-ups from this answer” surfacing is a required first-class
  review surface for eligible assistant finals in the active chat.
- Heartbeat must show a bounded proactive review whenever canonical live
  opportunity state has actionable items, and fall back to `HEARTBEAT_OK` only
  when no bounded opportunity exists.
- The same canonical item id must be preserved across inline chat surfacing,
  inbox, heartbeat, contextual cards, and handoff.
