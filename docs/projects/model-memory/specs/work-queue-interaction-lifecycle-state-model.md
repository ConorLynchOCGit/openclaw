---
summary: "Interaction and lifecycle state model for Work Queue objects."
title: "Work Queue Interaction And Lifecycle State Model"
---

# Work Queue Interaction And Lifecycle State Model

This document defines the shared lifecycle, object actions, artifact versioning,
failure behavior, notifications, and manual execution retirement model for the
OpenClaw Work Queue.

It follows:

- [Proactivity And Skills UX Product Brief](/projects/model-memory/specs/proactivity-and-skills-ux-product-brief)
- [Work Queue Information Architecture](/projects/model-memory/specs/work-queue-information-architecture)

This is the contract that should guide implementation of plan, skill, tool, and
user-review object behavior. It intentionally avoids broad autonomous execution
and skill promotion, which remain outside the pre-Milestone-4 boundary.

## Shared Lifecycle States

The canonical shared lifecycle states are:

- `new`
- `drafting`
- `drafted`
- `needs_revision`
- `finalized`
- `dismissed`
- `superseded`
- `failed`

Internal implementation states such as `blocked`, `pending_review`,
`diagnostic`, and provider-specific error states should not appear in the
normal UI. They may exist in diagnostics, audit artifacts, evidence drawers, or
server-side records.

## State Meanings

### `new`

`new` means the item has been model-reviewed, deduplicated, accepted into the
Work Queue, and is ready for user review.

Raw model candidates are not `new`. Raw candidates remain outside the normal UI
until model-owned validation, dedupe/merge adjudication, safety checks, and
surface eligibility pass.

### `drafting`

`drafting` is a transient visible action state on the selected object.

It should not create a separate queue bucket. It appears while a plan, skill,
tool, or review artifact is being generated or revised.

### `drafted`

`drafted` means a durable artifact version exists and needs user review.

The same state applies across lanes:

- build plan drafted
- skill draft ready
- tool improvement draft ready
- user-review response drafted

Lane-specific copy may differ, but the lifecycle state is shared.

In the pack-first candidate-review flow, accepted candidates should usually
enter this state immediately because the system auto-creates the first review
draft after model-owned admission and merge adjudication. `new` remains valid
for legacy/manual items or cases where drafting fails closed, but it should not
be the normal state for newly accepted pack-derived plans or skills.

Existing skill enhancements follow the same rule as new skill candidates: once
model-owned review classifies an accepted candidate as an
`existing_skill_enhancement`, the system should create a review-only
enhancement draft and surface the item as `drafted` / `Skill draft ready`.

### `needs_revision`

`needs_revision` means the current artifact needs changes before finalization.

It should be visible as a compact status chip and in object detail. It should
not create a separate top-level queue tab.

### `finalized`

`finalized` means the current artifact version is locked and ready for manual
execution or future execution handoff.

`finalized` does not mean done. In the current system, the user still needs to
manually execute the generated Codex prompt or carry out the work elsewhere.

Finalized items should remain visible in a `Ready to Execute` section or filter
until manually retired.

### `dismissed`

`dismissed` means cooled down, not permanently rejected.

Dismissed items leave the default active view. They can reappear only when new
evidence arrives, the context materially changes, or the user explicitly
restores them.

### `superseded`

`superseded` means another object now represents the work.

Superseded items should not appear in the normal queue. They may appear in the
surviving object's merge history, diagnostics, or evidence/debug views.

### `failed`

`failed` means a model/tool/artifact operation failed.

Failure display depends on cause:

- user-initiated failure remains attached to the visible object with retry and
  bounded failure report
- background/system failure goes to diagnostics unless it affects an object the
  user is actively viewing

Visible user-initiated failures should not vanish into diagnostics.

For pre-Milestone-4 pack-derived items, draft-generation failures caused by a
user-visible or item-level action should remain attached to the Work Queue
object. The detail view should show bounded failure status and retry context.
Raw stack traces, raw tool logs, provider prompts, hidden reasoning, and secrets
must remain out of the user-facing failure report.

## Queue Grouping

Default UI grouping:

- `Active`: `new`, `drafted`, `needs_revision`, and user-visible `failed`
- `Ready to Execute`: `finalized`
- `Dismissed`: `dismissed`
- `Diagnostics`: background failures, degraded items, invalid output, blocked
  items, unsafe output, and debug/proof artifacts
- hidden merge history: `superseded`

The default Work Queue view should focus on `Active` plus a bounded `Ready to
Execute` summary when finalized items are waiting on manual execution.

## Shared Transition Model

Allowed core transitions:

- `new -> drafting`
- `drafting -> drafted`
- `drafting -> failed`
- `drafted -> drafting`
- `drafted -> needs_revision`
- `needs_revision -> drafting`
- `drafted -> finalized`
- `needs_revision -> finalized`
- `finalized -> needs_revision`
- `new -> dismissed`
- `drafted -> dismissed`
- `needs_revision -> dismissed`
- `dismissed -> previous_actionable_state`
- `new -> superseded`
- `drafted -> superseded`
- `needs_revision -> superseded`
- any user-visible actionable state -> `failed` for user-initiated failures

The implementation may have additional internal states, but user-visible
behavior should map back to this small lifecycle.

## Action Behavior

### Open

`Open` selects the object and shows its detail view.

Open does not mutate lifecycle state.

### Draft Plan

`Draft plan`:

1. Transitions `new -> drafting`.
2. Calls the model/tool route for plan drafting.
3. Writes a versioned build-plan artifact.
4. Transitions `drafting -> drafted`.
5. Opens or refreshes the object detail view.

Chat and heartbeat should route the user to Work Queue detail before drafting.
They should not host duplicate drafting UI.

For pack-derived accepted candidates, first draft creation is automatic. A
manual `Draft plan` action should not be shown when a draft artifact already
exists.

### Draft Skill

`Draft skill`:

1. Transitions `new -> drafting`.
2. Calls the bounded skill draft route.
3. Writes a versioned skill draft artifact.
4. Transitions `drafting -> drafted`.
5. Opens or refreshes the object detail view.

Install and promotion remain unavailable and hidden.

For pack-derived accepted candidates, first skill or enhancement draft creation
is automatic and review-only. A manual `Draft skill` action should not be shown
when a draft package already exists.

### Request Revision

`Request revision` opens inline revision input in object detail.

On submit:

1. Capture the user's revision request as a durable history event.
2. Transition to `drafting`.
3. Generate a new artifact version.
4. Return to `drafted` when complete.
5. Return to `needs_revision` if model output is incomplete but still
   reviewable.
6. Attach a visible failure report if the user-initiated revision fails.

Old artifact versions are never overwritten.

### Finalize

`Finalize`:

1. Locks the current artifact version.
2. Generates or updates the Codex-ready prompt.
3. Transitions to `finalized`.
4. Shows a dismissible success toast.
5. Shows durable object-local status.
6. Moves the object to `Ready to Execute`.

Finalize does not auto-copy the prompt.

### Reopen For Revision

`Reopen for revision` creates a new draft version from a finalized artifact.

The finalized version remains immutable. The object transitions to
`needs_revision` or `drafting` depending on whether the user has already
submitted revision instructions.

This action belongs in object detail, not in compact cards.

### Copy Codex Prompt

`Copy Codex prompt` copies the finalized prompt.

The main prompt copy action should require a finalized artifact. Draft prompts
may be exposed only as `Copy draft prompt` and must be clearly labeled as
draft-quality.

### Open In Chat

`Open in chat` is a handoff action, not the canonical artifact view.

The Work Queue object remains canonical. Chat can discuss, refine, or execute
manual follow-up, but any durable edits must write back to the same object
history and artifact version model.

### Dismiss

`Dismiss`:

1. Moves the item to `dismissed`.
2. Starts or records a cooldown.
3. Removes the item from normal active views.
4. Offers an optional reason after click.

Dismissal is reversible.

Dismiss should not be available on finalized items. Finalized items are waiting
for manual execution or retirement, not dismissal.

### Restore

`Restore` returns a dismissed item to its last actionable state, usually `new`
or `drafted`.

Restore records a history event.

### Mark Complete

`Mark complete` or `Mark executed` retires a finalized item after the user
manually executes it outside OpenClaw.

It should:

1. Require the object to be `finalized`.
2. Ask for optional execution evidence, such as Codex summary, PR link, commit
   hash, artifact path, or short note.
3. Record a history event.
4. Remove the object from `Ready to Execute`.

This is not execution approval and should not imply OpenClaw performed the
work. It is manual completion tracking for the current pre-execution system.

The state model may later add `completed` or `retired`, but the first
implementation can treat completion as archival state outside the primary
eight-state lifecycle if that keeps the visible model simpler.

### Show More

`Show more` is purely view pagination.

It must not mutate lifecycle state or priority.

## Artifact Versioning

All drafted artifacts are versioned.

Required version metadata:

- artifact id
- object id
- version number
- artifact type
- lifecycle state when generated
- source candidate id
- generated by model/tool route
- generated at
- content hash
- previous version id when applicable
- user revision request id when applicable

Never overwrite prior versions.

The current version is the latest active draft or the finalized version,
depending on lifecycle state.

## Build Plan Artifact Payload

A build-plan artifact should include:

- objective
- scope and non-goals
- current state or known context
- proposed implementation approach
- step-by-step execution plan
- files/modules likely affected
- data/schema/config changes, if any
- UX/API/runtime behavior changes, if any
- safety boundaries
- risks and unknowns
- open questions for the user
- recommended decision if the user does not answer
- validation plan with exact commands
- rollback/recovery notes
- expected artifacts
- Codex-ready prompt draft

The finalized version should include the final Codex-ready prompt.

## Skill Artifact Payload

A skill draft artifact should include:

- `SKILL.md` draft
- trigger and resolver notes
- expected inputs and outputs
- safety boundaries
- test checklist
- eval checklist
- integration notes
- provenance and source evidence
- rollback or rejection notes
- Codex-ready prompt draft or implementation prompt

Install and promotion are not shown until later lifecycle milestones.

## Tool Artifact Payload

A tool artifact should include:

- tool or integration target
- objective
- scope and non-goals
- proposed behavior change
- affected APIs/config/runtime paths
- safety boundaries
- validation checklist
- rollback/recovery notes
- Codex-ready prompt draft

## Open Questions Section

Object detail should support an `Open questions` section.

Purpose:

- make planning uncertainty visible
- let the model ask targeted questions needed to finalize the artifact
- allow the user to answer in the revision flow
- preserve answers as durable object history

Behavior:

- questions are generated by the model as part of draft artifacts
- each question may include a recommended default
- unanswered questions do not block finalization if the model provided a safe
  recommended decision, but the UI should make the assumption visible
- answers submitted inline become revision input
- chat may help discuss answers, but canonical answers must write back to the
  object

## Failure Handling

Failures must preserve user trust and object continuity.

### User-Initiated Failure

If the user clicks a visible action and it fails:

- keep the object visible
- show status on the object
- show a dismissible error toast
- attach a bounded failure report to object history
- provide retry when safe
- do not hide the item in diagnostics only

### Background Failure

If a background model/tool/system step fails without direct user action:

- keep it out of normal active views
- record diagnostics
- surface only if it blocks a visible object or materially affects queue
  correctness

### Failure Report

Failure reports should include:

- action attempted
- stage that failed
- bounded error summary
- route/tool involved
- retry eligibility
- timestamp
- artifact/log reference when safe

Failure reports must not include raw provider prompts, raw transcripts, raw tool
logs, hidden reasoning, secrets, or private phrases.

## Notifications

Notifications use two layers:

- transient dismissible toast
- durable object-local status

Rules:

- success toasts auto-dismiss after a few seconds
- error toasts remain until dismissed or until the object detail is opened
- no undismissable global notification bars
- lifecycle-changing actions must leave durable object-local state
- toasts are not the source of truth

## Priority State

Priority is separate from lifecycle.

Priority fields:

- model priority band
- model priority rationale
- local placement context
- manual pin/boost/defer override
- user override reason when provided

Manual priority overrides are user-authoritative.

Priority changes do not create lifecycle transitions, but they should create
history entries.

## History Model

Every meaningful state change should create a lightweight history event.

History event fields:

- event id
- actor type: user, model, system, agent
- actor id when available
- timestamp
- previous state
- next state
- action name
- artifact version id when relevant
- reason or bounded summary when provided
- source refs/hashes when relevant

Object ids and internal refs are hidden in normal UI and visible only in
evidence/debug views.

## Agent And Chat Mutation Path

Future agents and chat sessions may revise Work Queue objects, but they must
use the same durable object APIs.

Rules:

- no chat-only plan state
- no agent-only draft state
- all revisions create artifact versions
- all lifecycle changes create history entries
- model-owned judgment remains model-owned
- deterministic code validates structure, refs, schemas, provenance, and safety
  only

This supports the future state where agent swarms and multi-agent workflows can
own parts of the queue without losing work or bypassing the object lifecycle.

## Hidden Future Execution Lifecycle

Execution states are future extensions and should not appear as disabled UI
controls before execution exists.

Future states may include:

- queued for execution
- assigned
- running
- awaiting approval
- canarying
- rolled back
- completed

Pre-Milestone-4 UI should expose only manual completion tracking for finalized
items.

## UI Copy Guidelines

Lifecycle status copy should be lane-specific while preserving shared state.

Examples:

- `drafted` for build plan: `Plan drafted`
- `drafted` for skill: `Skill draft ready`
- `finalized` for build plan: `Ready to execute manually`
- `finalized` for skill: `Skill prompt ready`
- `needs_revision` for build plan: `Plan needs revision`
- `needs_revision` for skill: `Skill draft needs revision`

Cards should not expose internal ids or backend status names.

## Acceptance Criteria

The lifecycle implementation is acceptable when:

- `new` items are model-reviewed, deduped, and accepted, not raw candidates
- drafting is visible only as a transient selected-object state
- plan and skill artifacts are versioned
- revision never overwrites prior versions
- finalized artifacts are immutable
- finalized items remain visible as `Ready to Execute`
- users can copy finalized Codex prompts
- users can manually mark finalized items complete after external execution
- user-initiated failures remain attached to visible objects
- background failures go diagnostics-only unless they block visible work
- notifications are dismissible and never the source of truth
- dismissed items are reversible and resurface only with new evidence/material
  context change
- superseded items are hidden from normal UI
- priority changes are separate from lifecycle
- every meaningful transition writes history
- chat and future agents mutate the same durable object model
- no execution controls appear before execution exists
