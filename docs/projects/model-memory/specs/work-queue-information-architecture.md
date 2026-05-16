---
summary: "Information architecture and surface allocation for the Work Queue UX."
title: "Work Queue Information Architecture"
---

# Work Queue Information Architecture

This document defines where proactivity, skill candidates, skill improvements,
tool improvements, build plans, user-review tasks, diagnostics, artifacts, and
future execution state should live in the OpenClaw UI.

It follows the product direction in
[Proactivity And Skills UX Product Brief](/projects/model-memory/specs/proactivity-and-skills-ux-product-brief):
the canonical user-facing surface is a top-level `Work Queue`, while chat and
heartbeat are lightweight surfacing and handoff surfaces.

This is not the lifecycle/button contract. Exact state transitions and button
behavior belong in the follow-on Interaction And Lifecycle State Model.

## Core Architecture Decision

OpenClaw should expose `Work Queue` as a top-level sidebar page.

The page should feel like a task manager plus a lightweight operations
dashboard. Its primary job is actionable work management, not passive analytics
and not transient inbox triage.

`Work Queue` owns durable work objects:

- proactive build plans
- new skill candidates
- existing-skill enhancements
- tool candidates
- tool improvements
- user-review tasks
- future personal to-dos
- future human-in-the-loop agent tasks
- future approval and execution items

The current proactivity inbox should be treated as an implementation precursor,
not the final information architecture.

## Navigation Model

### Top-Level Sidebar

Add a top-level sidebar navigation item:

- `Work Queue`

Rationale:

- It will become central infrastructure for plans, skills, tools, approvals,
  personal tasks, and multi-agent work.
- It should not be hidden under chat because its objects must survive chat
  reset, session changes, and deleted transcripts.
- It should not be named `Proactivity` because the target surface is broader
  than proactive suggestions.

### Route

Recommended route:

- `/work-queue`

Object detail routes should be stable and deep-linkable:

- `/work-queue/:objectId`

The implementation may initially use hash or query routing if that matches the
current UI shell, but the product contract is stable object addressing.

## Default Work Queue View

The default Work Queue page should show all active prioritized work across
lanes.

It should not open to a single lane by default. The system should help the user
see the best work across build plans, skills, tools, and user-review items.

Default view requirements:

- show active items only
- group or label every item by lane
- sort by model-owned priority band plus local ordering
- respect manual user pins, boosts, and defers
- show a bounded top set first
- expose `Show more` per lane or globally
- provide lane filters and search
- hide diagnostics, blocked, degraded, superseded, and dismissed items by
  default

When there are many active items, the default view should not dump the whole
queue. It should show a prioritized first page with a `Show more` action that
loads the next bounded set, such as 5-10 more items per lane.

## Lane Model

The Work Queue is one page with grouped lanes and filters.

Initial lanes:

- `Build Plans`
- `Skills`
- `Tooling`
- `User Review`
- `Diagnostics`
- `Dismissed`

Lane behavior:

- `Build Plans`: proactive plans, project plans, release gates, investigation
  plans, refactor plans, and generated implementation prompts.
- `Skills`: new skill candidates and existing-skill enhancements.
- `Tooling`: tool candidates, tool improvements, workflow automation, and
  integration improvements.
- `User Review`: questions, approvals, clarification requests, manual handoff
  tasks, and future human-in-the-loop agent tasks.
- `Diagnostics`: blocked, degraded, failed, invalid, unsafe, or proof/debug
  objects.
- `Dismissed`: cooled-down items hidden from normal active/history views.

`Diagnostics` and `Dismissed` should not appear in the default active view.

## Split-Pane Layout

Desktop layout should be split-pane:

- queue list on the left
- selected object detail on the right

The split-pane supports fast triage while keeping durable object detail visible.

Desktop layout should avoid giant cards. Cards should be compact decision
surfaces; full artifacts live in the detail panel.

Narrow/mobile layout should navigate from list to full detail page.

## Queue List Item Content

Queue list items should show only what is needed to decide whether to open or
act on an item.

Default visible fields:

- title
- lane
- object class
- priority band
- current status
- one-line value statement
- recommended next step
- age or freshness signal when useful
- manual pin/defer indicator when set

Hidden by default:

- source refs
- hashes
- timestamps
- raw evidence
- route/model diagnostics
- failure traces
- full compiled plan
- full skill draft
- full Codex prompt

Titles should use normal title case or sentence case. They should not look like
slugs, file names, source refs, or hyphenated generated fragments.

## Object Detail View

Each work object has one canonical detail view.

The object detail view owns:

- full title
- lane and object class
- priority band and manual override state
- current lifecycle state
- full summary
- current recommended action
- artifact versions
- full compiled plan or skill/tool draft
- generated Codex-ready prompt
- revision input and revision history
- durable status messages
- evidence drawer
- object history
- future agent assignment/execution records

The detail view should be stable and deep-linkable. It must survive `/new`,
chat deletion, refresh, and gateway rebuilds.

## Execution Platform Runtime Queue Integration

2026-05-14 update: the Work Queue surface is now shared by Model Memory
proactivity and Execution Platform runtime work. Model Memory still owns
memory-derived and skill-derived opportunity discovery, but the durable queue
truth is the Execution Platform DB-backed Work Queue.

Model-generated opportunity seeds should not be shown as thin cards that force
the owner to reconstruct the work. A useful seed must carry bounded source
refs and a model-authored explanation of why it matters, what type of work it
suggests, risks, limitations, and the likely next planning step. When accepted,
the seed should become a review-gated Work Queue item and then expand into a
Planning Capsule before any runtime compilation.

The visible queue identity is owner-facing title plus DB-derived queue
position. Internal ids, hashes, runtime job ids, graph ids, and model refs
belong in the evidence drawer and detail metadata.

The detail surface must be able to show:

- Planning Capsule versions and revision state.
- parent/child action graph.
- dynamic Runtime Work Graph child nodes.
- role/model/worker refs.
- Kimi/Codex/file-edit worker attempts and validation evidence.
- human decision nodes and resume state.
- Closeout Capsule opportunity seeds.
- proactivity follow-up queue items.

This preserves the original Work Queue product thesis while making the
Execution Platform runtime graph the live execution/readback substrate.

## Candidate Input And Queue Admission

Normal proactivity and skill admission should start from a structured Work
Episode Outcome Pack, not raw transcript windows.

Outcome packs are emitted by meaningful Codex/OpenClaw task closeout and then
indexed into OpenClaw state. Heartbeat and runtime passes may consume eligible
unreviewed packs, but they should not mine recent OpenClaw chat or Codex
session tails as a fallback when no pack exists.

Surface allocation:

- Codex/OpenClaw task closeout owns emitting bounded work outcome evidence.
- Runtime owns structural pack indexing, eligibility, idempotency, and budgeted
  consumption.
- The model owns candidate usefulness, class, merge/demotion, priority, and
  user-facing copy.
- Work Queue owns the durable object, draft artifact, revision, finalization,
  Codex prompt, and history.
- Chat and heartbeat only summarize validated Work Queue items and link to
  detail.

Accepted candidates should enter Work Queue with an initial draft artifact when
possible. The default user path is `review -> revise -> finalize`, not `review
card -> click Draft -> wait -> review`.

Existing skill enhancements use the same durable Work Queue path as new skill
candidates. They appear in the `Skills` lane as review-only draft artifacts,
not as installable/promotable skills.

Pack emission helpers write file artifacts for Codex/OpenClaw task closeout.
The runtime indexes those artifacts during the next discovery pass; immediate
state mutation by the helper is not required for this slice.

## Artifact Placement

Artifacts belong in object detail, not chat.

### Plan Artifacts

Plan object detail should include:

- current plan summary
- full compiled plan
- recommendation
- alternatives/options when present
- revision history
- finalized version
- generated Codex-ready prompt

Cards may show a short plan summary, but must not be the only way to access the
compiled plan.

### Skill Artifacts

Skill object detail should include:

- `SKILL.md` draft summary
- trigger and resolver notes
- expected inputs and outputs
- safety boundaries
- test checklist
- eval checklist
- integration notes
- provenance
- rollback or rejection notes
- generated Codex-ready prompt or future implementation prompt

Install and promotion controls remain absent until their lifecycle exists.

### Tool Artifacts

Tool object detail should include:

- tool improvement objective
- affected tool or integration
- expected behavior change
- safety boundary
- validation checklist
- generated Codex-ready prompt

### User Review Artifacts

User-review detail should include:

- question or requested decision
- why user input is needed
- options/recommendation when available
- consequences of no answer
- source evidence drawer

## Revision And Finalization Surface Allocation

Drafting, revision, and finalization happen in Work Queue object detail.

Chat and heartbeat may link to an object, but they should not duplicate full
draft/revision/finalization UI.

### Drafting

`Draft plan`, `Draft skill`, and similar actions should be initiated from the
Work Queue detail view.

If a compact chat or heartbeat surface offers an action, it should route the
user into the Work Queue detail view first rather than managing draft state in
chat.

### Revision

Primary revision input belongs inline in object detail.

Agents and chat sessions may eventually edit or revise these objects through
APIs, but those edits must update the same durable object, artifact versions,
and history. They must not create separate chat-only draft state.

### Finalization

Finalized artifacts are immutable versions.

An item can be reopened into a new draft or `needs_revision` state, but that
creates a new version. The interface should not clutter normal cards with every
possible status action. Detailed version and reopen controls belong in object
detail.

### Codex Prompt

Finalized plans and skill drafts should expose:

- durable prompt view
- copy prompt action
- export action when cheap
- open-in-chat handoff when cheap

Minimum first implementation:

- durable prompt view
- copy prompt action

## Chat Surface Allocation

Chat should be a lightweight surfacing and handoff surface.

Chat may show:

- compact summary of up to 1-3 validated queue items
- a clear `Open in Work Queue` link or action
- high-confidence fresh candidate only when clearly labeled as new/unvalidated
- response text that references queue items in natural language

Chat should not show:

- full queue
- full compiled plans
- full skill drafts
- permanent lifecycle controls
- diagnostics buckets
- raw provenance
- disabled future execution controls

The user should never lose a plan, draft, or prompt because a chat was reset.

## Heartbeat Surface Allocation

Heartbeat should mostly show validated queue items.

Default heartbeat behavior:

- summarize top validated queue items when they are relevant
- keep summaries compact and model-authored
- link into Work Queue
- avoid dumping cards into the heartbeat response
- avoid diagnostics unless explicitly requested

Fresh unqueued recommendations may appear in heartbeat only when:

- model confidence is high
- the item is clearly labeled as a new candidate
- the candidate is queued or can be queued through a Work Queue path
- it does not bypass normal model-owned validation, dedupe, or priority

The strategic direction is to prioritize autonomous validation so heartbeat can
surface fewer raw candidates over time.

## Evidence And Provenance Allocation

Evidence is per-item by default.

Each object detail view should have an `Evidence` drawer containing:

- source refs
- source authority
- source hashes
- model route summaries when relevant
- proposal/admission/prioritization summaries
- safe bounded evidence snippets
- validation reports

Evidence should be hidden in normal cards.

Queue-level ranking explanation can be added later, but the first
implementation should avoid cluttering the queue with global provenance and
ranking diagnostics.

## Diagnostics Allocation

Diagnostics are hidden by default.

Diagnostics should include:

- blocked model outputs
- invalid model outputs
- unavailable model routes
- degraded source availability
- unsafe output demotions
- duplicate/merge adjudication reports
- proof/debug cards
- stale lifecycle objects
- hidden/degraded cards

Diagnostics may be exposed through:

- hidden lane/filter in Work Queue
- admin/debug-only page
- object evidence drawer
- proof artifacts

They should not appear in normal active work.

## Priority And Triage Allocation

Priority should be visible as bands plus local ordering.

Do not use opaque global numeric ranks as the primary UI. They imply false
precision and encourage overfitting.

Visible priority state:

- priority band
- optional manual pin/boost/defer marker
- optional concise priority rationale in detail

Model-owned prioritization uses two bounded passes:

1. Intrinsic priority pass evaluates the new item in isolation.
2. Local placement pass compares the item only against structurally recalled
   neighbors in the same or adjacent priority band, same lane/project/scope,
   recent active set, or explicit dependency/source-ref neighborhood.

Deterministic code may recall possible comparison items structurally. The model
owns importance and placement judgment.

Manual user priority overrides are user-authoritative and should be preserved.

## Search, Filters, And Show More

Required controls:

- lane filter
- status filter
- priority band filter
- search by title/summary
- `Show more`
- dismissed archive/filter
- diagnostics filter hidden by default

Default active view should show a bounded top set. `Show more` should load the
next bounded set rather than expanding every historical item at once.

## Future Autonomous Execution Mapping

The Work Queue IA must leave room for future autonomy without showing broken
controls now.

Future object detail slots:

- assigned agent
- agent swarm/workflow
- approval requirement
- execution plan
- execution run
- validation result
- rollback/canary status
- outcome summary
- follow-up tasks

Pre-Milestone-4 UI should not show disabled execution controls. Execution
approval and execution actions should appear only when real execution exists.

## Current Implementation Bridge

The current proactivity inbox can be used as source data during migration.

Implementation should move toward:

- one durable work-object identity
- one top-level Work Queue route
- one stable detail route per object
- compact chat/heartbeat summaries that link into Work Queue
- hidden diagnostics
- versioned artifacts
- finalized Codex prompts

Existing proactivity cards should be treated as presentation views over durable
objects, not the durable objects themselves.

## Acceptance Criteria For IA Implementation

The first implementation of this IA is acceptable when:

- `Work Queue` appears as a top-level navigation item
- default view shows active prioritized work across lanes
- lanes and filters are visible and usable
- diagnostics and dismissed items are hidden by default
- desktop uses list/detail split-pane
- narrow screens can navigate into full detail
- every displayed object has a stable detail address
- compiled plans and skill drafts are viewable in detail without truncation
- finalized artifacts expose a durable Codex prompt and copy action
- chat and heartbeat route into Work Queue rather than duplicating lifecycle UI
- evidence is behind an item-level drawer
- no disabled execution controls appear
- model-owned priority and model-owned dedupe remain semantically authoritative
- deterministic UI code only renders, filters by explicit lifecycle/scope, and
  transports model-authored fields

## Follow-On Document

The next document should be `Interaction And Lifecycle State Model`.

It must define:

- exact lifecycle states
- allowed transitions
- button behavior
- async loading/error behavior
- draft/revision/finalization artifact versioning
- notification behavior
- dismissal/resurfacing semantics
- Codex prompt generation behavior
- agent/API mutation paths for future autonomous workflows
