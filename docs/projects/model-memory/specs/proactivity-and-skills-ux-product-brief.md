---
summary: "Product brief for the Proactivity and Skills Work Queue UX."
title: "Proactivity And Skills UX Product Brief"
---

# Proactivity And Skills UX Product Brief

This brief defines the product goal, surface model, and near-term UX contract
for OpenClaw proactivity, skill candidates, skill improvements, tool
improvements, and generated build plans.

It is intentionally product-first. The current implementation has surfaced
button-level bugs and card-level inconsistencies, but those are symptoms of a
larger missing contract: proactive work needs one durable object model and one
canonical work surface rather than transient chat cards carrying too much
state.

## Product Thesis

OpenClaw needs a canonical `Work Queue`.

The queue is the durable surface where model-discovered opportunities become
reviewable, prioritizable, refinable, finalized, and eventually executable work
objects. Chat and heartbeat should surface high-value items in the user's
normal flow, but they should not be the canonical workspace for plans, skill
drafts, revision loops, provenance, or future execution state.

The long-term goal is autonomous work discovery and execution:

- OpenClaw observes user work, Codex sessions, documents, memory state, runtime
  events, and agent outputs.
- Models identify useful opportunities for build plans, skills, tools,
  workflow improvements, and user-review tasks.
- Models validate, deduplicate, prioritize, and route those opportunities into
  the Work Queue.
- The system drafts plans, skills, tests, evals, prompts, and execution
  packages.
- Agents execute low-risk or approved work autonomously.
- The user reviews exceptions, approvals, strategy, high-risk changes, and
  results.

The near-term pre-Milestone-4 goal is manual execution with durable preparation:

- OpenClaw surfaces validated proactive plans, skill candidates, existing-skill
  enhancements, tool candidates, and user-review tasks.
- The user can draft, revise, and finalize a plan or skill draft.
- Finalized plans and skill drafts produce durable artifacts and Codex-ready
  prompts.
- The user manually carries finalized work to Codex or another execution
  environment.
- No broad skill install, auto-promotion, outbound sending, or autonomous
  action execution occurs in this lane.

## Work Episode Outcome Pack Input Contract

Proactivity and skill candidate review should use structured work outcomes, not
raw chat or Codex transcript mining.

The preferred and only normal candidate-review substrate is a
`work_episode_outcome_pack.v1` emitted after meaningful Codex or OpenClaw task
work. This is a global closeout protocol, not a Model Memory-only feature.
Model Memory is the current storage/discovery owner and first consumer. A pack
records bounded summaries of files touched, tests run,
failures/fixes, final outcome, unresolved questions, follow-up candidates, and
skill improvement evidence. It carries refs, hashes, provenance, and safety
flags, but it must not contain raw full transcripts, raw provider prompts, raw
tool logs, hidden reasoning, secrets, or unbounded session logs.

If no eligible outcome pack exists, candidate review should not proactively
generate plan or skill cards. Raw OpenClaw/Codex windows are not fallback
substrate for creating new Work Queue candidates. This avoids converting
heartbeat scaffolding, proof prompts, acknowledgements, and synthetic UI test
traffic into low-signal work items.

Pre-Milestone-4 storage is intentionally simple:

- file artifacts for proof, debugging, and export
- indexed OpenClaw state entries for runtime consumption

DB-backed storage should replace or back the state index once Work Queue object
storage hardens.

Every eligible unreviewed pack should eventually be consumed idempotently,
oldest first, within a bounded per-run budget. Candidate value, class,
duplicate/merge judgment, priority banding, visible copy, and surfacing remain
model-owned.

Accepted candidates should automatically receive an initial draft artifact. The
user starts from review, revision, and finalization rather than manually
clicking `Draft plan` or `Draft skill`.

This auto-draft behavior applies to proactive plans, new skill candidates, and
existing skill enhancements. Skill and enhancement drafts are review-only:
install, promotion, auto-enablement, and execution remain blocked in this
pre-Milestone-4 lane.

Manual Codex/OpenClaw emission helpers and the generic OpenClaw closeout service
write pack artifacts. Runtime discovery also accepts Execution Platform
closeout packs when bridge/runtime work emits `work_episode_outcome_pack.v1`
into the same artifact root. Slice 8M wires automatic closeout into real
Execution Platform bridge live-run paths and adds a next-run gate for missing
prior closeout. Those packs are the normal substrate for proactivity and skill
review after meaningful execution platform work; runtime job completion or
Codex process completion alone is not enough to treat the user goal as
complete.

Missing closeout after meaningful Codex/OpenClaw/Execution Platform work is a
process gap. Candidate review should wait for the structured pack or a bounded
explicit waiver instead of mining raw transcript tails.
Runtime discovery indexes those artifacts on the next pack scan using structural
`episodeId + contentHash` idempotency. The helpers do not need to mutate the
OpenClaw state index directly in this slice.

Live gateway/UI validation remains a separate gate after direct pack
consumption, auto-draft, and quality proofs are green.

## Primary User Jobs

The Work Queue must support these user jobs:

1. See the most useful next work without hunting through chat history.
2. Understand why an item matters at a glance.
3. Turn a surfaced opportunity into a concrete plan, skill draft, tool draft,
   or manual task.
4. Give feedback to improve the draft.
5. Finalize a durable artifact that survives `/new`, chat deletion, refreshes,
   gateway rebuilds, and future agent handoff.
6. Export or copy a Codex-ready prompt for manual execution today.
7. Preserve enough state that future autonomous execution can attach approvals,
   assignments, runs, results, canaries, rollback, and usage learning.
8. Avoid duplicate cards, stale recommendations, diagnostics noise, and
   transient chat-only artifacts.

## Canonical Surfaces

### Work Queue Page

`Work Queue` is the canonical page name.

`Proactivity` is too narrow because the surface will also hold user tasks,
agent-assigned work, approvals, skill drafts, tool improvements, and execution
outcomes. `Operations` is too broad and obscures the concrete queue behavior.

The Work Queue page owns:

- active opportunities
- grouped lanes and filters
- priority and ordering
- draft status
- finalized artifacts
- revision state
- Codex-ready prompts
- hidden diagnostics access
- durable object history

### Chat And Heartbeat

Chat and heartbeat are lightweight surfacing surfaces.

They should show only the top 1-3 validated queue items or clearly labeled
high-confidence fresh candidates. They should link into the canonical Work
Queue object detail rather than trying to host the full lifecycle.

Heartbeat should primarily summarize already validated queue items. Fresh
unqueued recommendations are allowed only when model confidence is high and the
item is explicitly labeled as a new candidate rather than an accepted work item.

### Object Detail View

Each item should have a canonical object detail view.

The detail view may be a dedicated page, right-side panel, or modal route, but
it must be durable and deep-linkable. It is the single source of truth for:

- current state
- full compiled plan or skill draft summary
- revision thread
- generated Codex prompt
- recommendation and alternatives
- evidence drawer
- provenance, refs, and hashes
- lifecycle history
- future approval and execution records

Cards should never be the only place to view a compiled plan. Cards should show
a concise summary and a `View full plan` or `View draft` action.

### Diagnostics

Diagnostics should be hidden from the normal queue by default.

Blocked, degraded, malformed, and diagnostic-only items should not compete with
real work. They should remain available through an explicit diagnostics view,
debug drawer, proof artifact, or admin mode.

## Lane Model

The Work Queue is one page with grouped lanes.

Default view should be a unified prioritized queue with lane labels. Users can
filter by lane when needed.

Initial lanes:

- `Build Plans`
- `Skills`
- `Tooling`
- `User Review`
- `Diagnostics`

The lane model keeps one operational surface while acknowledging that object
types have different lifecycles.

## Object Classes

Initial object classes:

- `proactive_plan`
- `new_skill_candidate`
- `existing_skill_enhancement`
- `tool_candidate`
- `tool_enhancement`
- `user_review_task`
- `merge_or_demotion`
- `diagnostic`

Model-owned classification decides the object class. Deterministic code may
validate schemas, ids, refs, source authority, and safety, but it must not
decide whether an opportunity is skill-shaped, plan-shaped, tool-shaped, useful,
or worth surfacing.

## Near-Term Lifecycle

Pre-Milestone-4 should use a minimal lifecycle that still maps cleanly to the
future autonomous state.

Required states:

- `new`
- `drafting`
- `drafted`
- `needs_revision`
- `finalized`
- `dismissed`
- `superseded`
- `failed`

State meanings:

- `new`: model-reviewed candidate is accepted for surfacing.
- `drafting`: a plan or draft artifact is being generated.
- `drafted`: a durable draft artifact exists and can be reviewed.
- `needs_revision`: the user requested changes to the current draft.
- `finalized`: the user accepted the artifact as ready for manual execution or
  future execution handoff.
- `dismissed`: the item is cooled down and should not reappear unless new
  evidence or materially changed context appears.
- `superseded`: model-owned merge adjudication or explicit user action
  determined another item should represent the work.
- `failed`: model, validation, artifact, or system failure blocked the object;
  normal users should see this only in diagnostics or attached error state.

Execution approval controls should be hidden until execution exists. Disabled
future-execution buttons create false affordances and dilute the pre-Milestone-4
manual handoff workflow.

## Core Interactions

### Draft Plan

`Draft plan` should create a durable plan artifact and open the object detail
view.

The plan artifact should survive chat reset and should not depend on the
originating session transcript being visible. It should include a concise card
summary and a full plan body in the detail view.

### Request Revision

`Request revision` should open a revision input in the object detail view.

The revision should create a new artifact version or update the artifact with
clear version history. A no-op click is a UX failure. A chat handoff may be
offered, but the canonical revision should remain attached to the object.

### Finalize Plan

`Finalize plan` should lock the current reviewed artifact as ready for manual
execution and generate a Codex-ready prompt.

The result should be visible on the object, not only in a transient notification.
The user should be able to return later and retrieve the finalized plan and
prompt.

### Draft Skill

`Draft skill` should create a durable review-only skill draft package.

Minimum output:

- `SKILL.md` draft
- trigger and resolver notes
- expected inputs and outputs
- safety boundaries
- test checklist
- eval checklist
- integration notes
- provenance and source evidence
- rollback or rejection notes

Install and promotion remain blocked until later milestones.

### Dismiss

`Dismiss` means cooldown, not permanent rejection.

Dismissed items should reappear only when new evidence arrives, the context
materially changes, or the user explicitly restores them. A timer may prevent
immediate resurfacing, but time alone should not force a dismissed item back
into the active queue.

### Notifications

Notifications should be transient, dismissible toasts plus durable card-local
status.

Persistent notification bars without a close path are not acceptable. If an
action changes object state, that state belongs on the object detail and card,
not only in global chrome.

## Prioritization Model

Priority should be model-owned with manual override.

The user can pin, boost, defer, or dismiss. Manual priority changes should be
preserved as user-authoritative state and should be visible in the object
history.

OpenClaw should not feed the entire queue and priority stack to the model for
every new item. Prioritization should use two small model-owned passes.

### Intrinsic Priority Pass

The model evaluates the new item in isolation using a bounded rubric.

Rubric dimensions:

- user value
- urgency
- strategic leverage
- risk reduction
- dependency unblock
- effort and complexity
- confidence

Output is a priority band, not a global rank.

Suggested bands:

- `critical_now`
- `high`
- `medium`
- `low`
- `background`

### Local Placement Pass

Deterministic recall selects only structurally relevant comparison items:

- same or adjacent priority band
- same lane
- same project or scope
- active or recently updated
- explicit dependency or source-ref relationship
- exact user pins or overrides where relevant

The model adjudicates placement only within that limited set.

This follows the same architecture rule as MMV2 memory reconciliation:
deterministic recall narrows possible candidates; the model owns semantic
priority and placement judgment.

## Generated Codex Prompt Contract

Finalized plans and finalized skill drafts should generate a Codex-ready prompt
for manual execution in the current pre-Milestone-4 system.

Minimum plan prompt sections:

1. Objective
2. Scope and non-goals
3. Repo and working location
4. Current state
5. Source context and evidence references
6. Implementation steps
7. Validation commands
8. Safety boundaries
9. Expected artifacts
10. Final report format

Evidence links are references, not executable instructions. The prompt should
avoid raw full transcripts, raw tool logs, hidden reasoning, secrets, and
private phrases.

## Content Principles

Cards should be concise decision surfaces.

Default card fields:

- title
- object class and lane
- why this matters
- recommended next action
- status
- priority band

Hidden by default:

- source refs
- hashes
- timestamps
- model diagnostics
- failure details
- evidence packet details
- route/config metadata

Titles should use normal title case or sentence case, not slug text, hyphenated
fragments, or generated file-like labels.

## Success Metrics

The Work Queue UX should optimize for:

- high-quality surfaced opportunities rather than volume
- low duplicate rate
- clear next action
- fast triage from chat or heartbeat into the queue
- high draft-to-finalize rate
- reliable retrieval of finalized artifacts and Codex prompts
- low interruption unless the item is high-value or time-sensitive
- no diagnostics noise in normal workflows
- no loss of work when the chat session changes
- smooth migration path to agent execution and approvals

## Explicit Non-Goals Before Milestone 4

Do not implement:

- autonomous action execution
- outbound sending
- broad skill installation
- skill auto-promotion
- agent swarm execution
- full centralized hardened work queue with assignment semantics
- execution approval controls
- Skills Studio UI

Do implement or preserve:

- model-owned candidate discovery
- model-owned skill/plan/tool classification
- model-owned dedupe and prioritization
- durable draft artifacts
- durable finalized artifacts
- Codex-ready prompts
- hidden diagnostics
- model-authored visible card copy
- no deterministic semantic fallback

## Open Questions For The Next Documents

These should be resolved in the Information Architecture and Interaction State
Model documents:

- Should object detail be a full page, side panel, or adaptive panel depending
  on viewport?
- What exact filters and saved views should the Work Queue expose?
- What is the default sort when model priority, user pinning, recency, and lane
  conflict?
- What artifact versioning UI is needed for revision history?
- Should finalized Codex prompts be copied, downloaded, opened in a chat
  handoff, or all three?
- How should model-owned prioritization explain itself without overwhelming the
  card?
- What exact evidence belongs in the default evidence drawer?
- What is the future migration path from manual Codex prompt to agent-assigned
  execution?

## Slice 8P-Correction Closeout Contract Update

`work_episode_outcome_pack.v1` remains the global closeout protocol for
meaningful OpenClaw/Codex work episodes. Model Memory is the current consumer
and discovery surface, but it is not the owner of the concept.

Manual/non-bridge OpenClaw/Codex work now has a practical closeout path:

- `src/infra/manual-work-episode-closeout.ts`
- `scripts/openclaw-emit-manual-work-closeout.mjs`

The script emits bounded pack evidence from structured input. It must not
persist raw transcripts, raw prompts, hidden reasoning, secrets, raw logs, or
unbounded command/tool output.

Proactivity and skill review should prefer the pack over transcript tails. A
missing pack after meaningful work is a process gap and should block candidate
generation when the missing evidence would affect the review.

The app-level assistant finalization hook is still pending. Until that hook is
wired, meaningful manual work should use the manual closeout service/script.

## Slice 8R Skill Audit Evidence Boundary

Skill audit lint is rule coverage evidence only. It can show that required
phrases, prohibited actions, runtime-boundary statements, and validation
expectations are present or missing, but it cannot prove skill quality.

Proactivity and skill review must not treat deterministic lint as "deep
critique", best-in-class proof, or qualitative review. Qualitative skill review
must be a separate human-reviewed or explicitly model-reviewed artifact labeled
as judgment.
