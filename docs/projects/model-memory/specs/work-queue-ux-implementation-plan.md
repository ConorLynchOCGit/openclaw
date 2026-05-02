---
summary: "First implementation plan for the Work Queue UX."
title: "Work Queue UX Implementation Plan"
---

# Work Queue UX Implementation Plan

This plan turns the Work Queue product, information architecture, and lifecycle
contracts into a first buildable implementation slice.

Inputs:

- [Proactivity And Skills UX Product Brief](/projects/model-memory/specs/proactivity-and-skills-ux-product-brief)
- [Work Queue Information Architecture](/projects/model-memory/specs/work-queue-information-architecture)
- [Work Queue Interaction And Lifecycle State Model](/projects/model-memory/specs/work-queue-interaction-lifecycle-state-model)

The goal is to replace isolated proactivity-card patches with one durable Work
Queue surface that can support today's manual Codex execution workflow and
future autonomous agent execution.

## Scope

Build the first Work Queue UI slice:

- top-level `Work Queue` sidebar route
- active prioritized list grouped by lane
- desktop split-pane list/detail layout
- stable object detail links
- existing proactivity/skill records adapted into work objects
- diagnostics and dismissed items hidden by default
- full plan/skill artifact display without card truncation
- version-aware artifact view
- finalized Codex prompt view and copy action
- inline revision input
- manual `Mark complete` for externally executed finalized items
- dismissible toast notifications plus durable object-local status

Non-goals:

- autonomous execution
- outbound sending
- broad skill install
- skill auto-promotion
- Skills Studio UI
- agent swarm assignment
- disabled future execution controls

## Architecture Boundary

The first slice can reuse existing proactivity and skill state, but the UI must
present it as durable Work Queue objects.

Implementation should add an adapter layer rather than spreading queue-specific
mapping across UI components.

Recommended shape:

- `WorkQueueObject`: UI read model over proactivity opportunities, skill
  candidates, draft artifacts, lifecycle overrides, priority state, and
  evidence refs.
- `WorkQueueArtifactVersion`: typed artifact version for plans, skills, tools,
  and user-review objects.
- `WorkQueueLane`: `build_plan`, `skills`, `tooling`, `user_review`,
  `diagnostics`, `dismissed`.
- `WorkQueueStatus`: visible lifecycle state from the interaction model.

The adapter may initially be client-side if that is cheaper, but the target is a
gateway/server read model so chat, heartbeat, queue, and future agents all use
one object contract.

## Phase 1: Route And Navigation

Add top-level navigation:

- label: `Work Queue`
- route: `/work-queue`

Acceptance:

- Work Queue appears in sidebar navigation.
- Loading the route does not require opening chat.
- The route can deep-link to a selected object.
- Chat reset or `/new` does not remove access to the selected object.

## Phase 2: Work Object Adapter

Create a bounded adapter over current data.

Inputs:

- proactivity queue items
- proactivity inbox items where still needed
- model-reviewed plan candidates
- skill candidates and skill draft records
- lifecycle overrides
- planned artifacts
- skillifier draft artifacts
- merge/supersession records
- model-authored card briefs

Adapter output:

- stable object id
- lane
- object class
- title
- model-authored summary
- current lifecycle state
- priority band
- manual priority override state
- latest artifact version summary
- source/evidence refs
- diagnostics flags hidden from default view

Acceptance:

- raw candidates do not appear as `new`.
- accepted model-reviewed items appear as Work Queue objects.
- superseded items are hidden from normal active view.
- diagnostics/degraded items are hidden from normal active view.
- existing skill and plan cards map to stable object ids.

## Phase 2A: Outcome Pack Candidate Input

Candidate review should consume `work_episode_outcome_pack.v1` records only.

Implementation requirements:

- index emitted pack artifacts into OpenClaw state
- dedupe by `episodeId + contentHash`
- mark packs `eligible`, `ineligible`, or `unsafe` by structural validation
- consume every eligible unreviewed pack oldest first within a per-run budget
- persist review status and review artifact path per pack
- do not fall back to raw OpenClaw/Codex transcript windows when no pack exists

Accepted candidates from pack review should pass through model-owned
merge/adjudication and then auto-create first draft artifacts:

- proactive plan -> build-plan draft plus Codex-ready prompt draft
- new skill candidate -> review-only skill draft package
- existing skill enhancement -> review-only enhancement draft

The Work Queue default state for accepted pack-derived candidates should be
`drafted` / `Draft Ready`, not `new`, unless draft generation fails and a
visible failure report is attached.

Draft failure handling requirements:

- user-visible/item-level draft failures remain attached to the Work Queue
  object
- detail shows bounded failure status and retry context
- background-only failures remain diagnostics-only unless they block visible
  work
- raw logs, raw provider prompts, hidden reasoning, and secrets are not shown

Emission helper indexing contract:

- Codex/OpenClaw helpers write pack artifacts
- runtime discovery indexes helper-emitted artifacts on the next pass
- idempotency is structural by `episodeId + contentHash`
- DB-backed indexing remains a later Work Queue storage hardening step

## Phase 3: Active List And Lane Grouping

Build default Work Queue list.

Default view:

- active items first
- `Ready to Execute` summary for finalized items
- grouped or labeled by lane
- priority band visible
- manual pin/boost/defer indicator visible when set
- `Show more` pagination
- search/filter controls

Initial filters:

- all active
- build plans
- skills
- tooling
- user review
- ready to execute
- dismissed
- diagnostics

Acceptance:

- no diagnostics in default view
- no dismissed items in default view
- no superseded duplicates in default view
- 30+ items do not dump into one unbounded list
- `Show more` changes view pagination only, not lifecycle state

## Phase 4: Split-Pane Detail

Implement desktop split-pane:

- list on the left
- detail panel on the right

Narrow screens:

- list navigates to full detail view

Detail shows:

- full object title
- lane and object class
- lifecycle state
- priority band and manual override
- full summary
- current recommended action
- artifact versions
- current artifact body
- open questions
- generated Codex prompt when available
- object-local durable status
- evidence drawer
- history summary

Acceptance:

- compiled plans are not truncated in detail
- skill drafts are not truncated in detail
- detail can be deep-linked
- evidence is hidden by default
- object ids are hidden except in evidence/debug drawer

## Phase 5: Plan And Skill Artifact Views

Plan detail must show:

- objective
- scope and non-goals
- current state
- implementation approach
- step-by-step plan
- likely affected files/modules
- risks and unknowns
- open questions
- validation commands
- rollback/recovery notes
- expected artifacts
- Codex-ready prompt draft/final prompt

Skill detail must show:

- `SKILL.md` draft summary/body
- trigger/resolver notes
- expected inputs and outputs
- safety boundaries
- test checklist
- eval checklist
- integration notes
- provenance
- Codex-ready prompt draft/final prompt

Acceptance:

- cards show summaries; detail shows full artifacts
- versions are preserved
- finalized version is immutable
- revised versions are new artifacts, not overwrites

## Phase 6: Actions

Implement or adapt these actions in Work Queue detail:

- `Draft plan`
- `Draft skill`
- `Request revision`
- `Finalize`
- `Copy Codex prompt`
- `Dismiss`
- `Restore`
- `Mark complete`

Rules:

- chat/heartbeat route into Work Queue detail before drafting
- lifecycle-changing actions wait for server confirmation
- user-initiated failures remain attached to visible objects
- background failures go diagnostics-only unless they block visible work
- no execution approval or execution action appears pre-Milestone-4

Acceptance:

- `Request revision` opens an inline input and writes a new version on submit
- `Finalize` moves the item to `Ready to Execute`
- `Copy Codex prompt` is available for finalized items
- `Mark complete` removes finalized items from `Ready to Execute` after manual
  execution evidence/note
- no undismissable global notification bars remain

## Phase 7: Chat And Heartbeat Integration

Chat and heartbeat should show compact summaries only.

Behavior:

- top 1-3 validated queue items
- concise model-authored text
- `Open in Work Queue`
- no full lifecycle UI
- no full artifact bodies
- no diagnostics
- fresh candidates only if high-confidence and clearly labeled as new

Acceptance:

- heartbeat can surface useful existing queue items
- chat/heartbeat does not duplicate draft/finalize/revision controls
- every surfaced item links to stable Work Queue detail

## Phase 8: Priority

Implement display and storage for:

- model priority band
- local ordering
- manual pin/boost/defer override

Do not feed the whole queue to the model.

Target prioritization flow:

1. Intrinsic priority pass: model scores item in isolation into a band.
2. Local placement pass: deterministic structural recall selects same/adjacent
   band, same lane/project/scope, recent active items, and explicit dependency
   neighbors; model adjudicates local placement.

Acceptance:

- priority is visible without global numeric false precision
- manual overrides are user-authoritative
- deterministic code does not decide semantic importance

## Phase 9: Validation

Focused tests:

- route/navigation renders Work Queue
- adapter maps current proactivity items into work objects
- diagnostics/dismissed/superseded hidden by default
- split-pane detail renders full artifacts
- `Request revision` opens input and creates a new version
- `Finalize` moves item to `Ready to Execute`
- `Copy Codex prompt` copies finalized prompt
- `Mark complete` retires finalized item from ready list
- chat/heartbeat link into Work Queue
- no disabled execution controls
- user-initiated failure remains visible with retry/failure report

Recommended commands:

```bash
pnpm test:file ui/src/ui/app-proactivity.test.ts ui/src/ui/views/chat.test.ts
pnpm test:file src/gateway/server-methods/model-memory-proactivity.test.ts
pnpm test:file src/infra/model-memory-proactivity-runtime.test.ts
node scripts/model-memory-phase2-deterministic-judgment-audit.mjs --fail-on-value-judgment
pnpm exec oxlint <changed files>
node scripts/run-oxlint.mjs <changed files>
pnpm tsgo:full
git diff --check
```

Live validation after local checks:

- rebuild gateway only after local validation passes
- verify Work Queue route
- verify compact heartbeat/chat links
- verify full plan detail
- verify skill draft detail
- verify revision/finalize/copy/mark-complete flows
- verify diagnostics hidden by default

## Implementation Order

1. Add read model/adapter and unit tests.
2. Add route/sidebar navigation.
3. Add list/detail split-pane.
4. Move existing proactivity card actions into detail.
5. Add artifact version display and Codex prompt copy.
6. Fix chat/heartbeat to link to Work Queue.
7. Hide diagnostics/dismissed/superseded by default.
8. Add failure/toast behavior.
9. Run local tests.
10. Rebuild gateway and run live UX proof.

## Completion Criteria

The first Work Queue slice is complete when:

- Work Queue is top-level navigation
- default view shows active prioritized objects grouped by lane
- object detail is stable and deep-linkable
- compiled plans and skill drafts are fully visible
- revision and finalization produce versioned artifacts
- finalized items stay visible as `Ready to Execute`
- finalized Codex prompts can be copied
- completed external work can be manually retired
- chat/heartbeat route into Work Queue instead of duplicating lifecycle UI
- diagnostics are hidden from normal workflow
- no deterministic semantic fallback is introduced
- no execution controls appear before execution exists
