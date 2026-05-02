---
name: work-queue-ux-review
description: Use when designing, reviewing, or refactoring OpenClaw Work Queue, proactivity, skills, tool-improvement, planning, lifecycle, artifact, or agent-work UX. Guides product-first questioning, information architecture, lifecycle modeling, implementation planning, and UX acceptance checks before patching UI components.
---

# Work Queue UX Review

Use this skill when a task touches OpenClaw's Work Queue, proactivity inbox,
heartbeat surfacing, skill candidates, skill improvements, tool improvements,
generated plans, Codex handoff prompts, artifact detail views, or future
agent-work management.

## Core Rule

Do not patch isolated cards or buttons until the product job, surface
allocation, and lifecycle behavior are clear.

The target product model is a top-level `Work Queue`:

- chat and heartbeat are lightweight surfacing/handoff surfaces
- Work Queue is the canonical durable work surface
- object detail owns artifacts, revisions, evidence, prompts, and history
- future execution/agent controls stay hidden until real execution exists

## Required Workflow

1. Identify the user job and current failure.
2. Ask recommendation-backed questions when product goals are unclear.
3. Decide or update the product brief.
4. Decide or update information architecture and surface allocation.
5. Decide or update lifecycle and interaction state.
6. Write an implementation plan before UI changes when the change is structural.
7. Only then patch UI, gateway, runtime, or tests.

## Canonical Docs

Read or update these docs when the task is product/UX-structural:

- `docs/projects/model-memory/specs/proactivity-and-skills-ux-product-brief.md`
- `docs/projects/model-memory/specs/work-queue-information-architecture.md`
- `docs/projects/model-memory/specs/work-queue-interaction-lifecycle-state-model.md`
- `docs/projects/model-memory/specs/work-queue-ux-implementation-plan.md`

## Current Product Contract

- Top-level page: `Work Queue`.
- Default view: active prioritized work across lanes.
- Lanes: Build Plans, Skills, Tooling, User Review, Diagnostics, Dismissed.
- Desktop: split-pane list/detail.
- Mobile/narrow: full detail route.
- Chat/heartbeat: compact summaries only; route into Work Queue.
- Detail: stable deep link and durable object state.
- Evidence: hidden per-item drawer.
- Diagnostics: hidden from normal workflow.
- Dismissal: cooldown; reappear only on new evidence/material change.
- Priority: model-owned band plus local ordering; manual override is
  user-authoritative.
- Finalized means ready for manual execution, not done.
- No disabled execution controls before execution exists.

## Shared Lifecycle

Visible lifecycle states:

- `new`
- `drafting`
- `drafted`
- `needs_revision`
- `finalized`
- `dismissed`
- `superseded`
- `failed`

Default grouping:

- Active: `new`, `drafted`, `needs_revision`, user-visible `failed`
- Ready to Execute: `finalized`
- Dismissed: `dismissed`
- Diagnostics: background failures/degraded/blocked/invalid
- Hidden merge history: `superseded`

## Action Semantics

- `Draft plan`: create versioned plan artifact and open detail.
- `Draft skill`: create review-only skill draft artifact and open detail.
- `Request revision`: inline detail input, new artifact version, old versions preserved.
- `Finalize`: lock current version, generate Codex-ready prompt, move to Ready to Execute.
- `Copy Codex prompt`: copy finalized prompt; draft prompts must be labeled draft.
- `Mark complete`: retire finalized item after external manual execution.
- `Dismiss`: one-click cooldown with optional reason after click.
- `Restore`: return dismissed item to last actionable state.
- `Open in chat`: handoff only; canonical state remains Work Queue.

## Artifact Requirements

Build plan artifacts should include:

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
- Codex-ready prompt

Skill artifacts should include:

- `SKILL.md` draft
- trigger/resolver notes
- expected inputs/outputs
- safety boundaries
- test checklist
- eval checklist
- integration notes
- provenance
- Codex-ready prompt or implementation prompt

## Review Checklist

When reviewing or implementing UX, verify:

- Does this route users to the canonical Work Queue object?
- Is full artifact content in detail, not truncated cards?
- Are chat/heartbeat compact and non-duplicative?
- Are diagnostics hidden by default?
- Are lifecycle-changing actions confirmed by server state?
- Are failures attached to visible objects when user-initiated?
- Are toasts dismissible and not the source of truth?
- Are artifact revisions versioned instead of overwritten?
- Are finalized items still visible as Ready to Execute?
- Is there no execution UI before execution exists?
- Does deterministic code avoid semantic priority/classification/dedupe judgment?

## Output Pattern

For substantial UX changes, report:

- product decision
- surface allocation
- lifecycle behavior
- implementation files changed
- validation run
- remaining UX risks
