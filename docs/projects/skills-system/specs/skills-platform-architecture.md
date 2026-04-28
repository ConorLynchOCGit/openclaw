---
summary: "Layered architecture for the proactivity-integrated OpenClaw Skills Platform."
title: "Skills Platform Architecture"
---

# Skills Platform Architecture

## Objective

Define the full system shape for skills as lifecycle-managed capabilities.

OpenClaw skills are not just files in `skills/`. They are managed artifacts
that move through candidate detection, drafting, validation, canarying,
promotion, maintenance, and rollback.

## Layers

### 1. Skill source and loader layer

Uses the existing OpenClaw primitives:

- `SKILL.md` loading
- workspace, project, user, shared, bundled, and extra-dir precedence
- per-agent allowlists
- plugin-provided skills
- metadata gating
- ClawHub install/update
- installer dangerous-code scanning

This layer decides what is loadable and visible. It does not decide what should
be created or promoted next.

### 2. Candidate detection layer

Detects repeated useful work, repeated corrections, recurring failures,
repeated command sequences, and recurring operator patterns from bounded
evidence.

Inputs may include:

- OpenClaw sessions
- Codex sessions
- operator digests
- validation lanes
- recurring proactivity items

### 3. Skill candidate ledger

Stores typed bounded candidate records with deterministic ids, evidence
summaries, recurrence windows, risk tier, lifecycle state, eval status, and
proactivity linkage.

The ledger is not semantic truth and must not store raw transcripts or raw
examples.

### 4. Skillifier / scaffold / package builder

Turns a candidate into a draft skill package with:

- `SKILL.md`
- optional scripts, references, and assets
- runtime-specific metadata
- tests and eval fixtures
- provenance, vetting, install, and rollback reports

### 5. Vetting and risk classification

Classifies skills by risk and determines the highest autonomy level they may
reach.

### 6. Skill evals and resolver coverage

Proves:

- the right skill triggers
- the wrong skill does not trigger
- the agent reads `SKILL.md`
- workflow and permission contracts hold
- prompt-injection and sandbox boundaries are respected

### 7. Cross-runtime packaging adapters

Maintains one source-of-truth skill package with adapters for:

- OpenClaw workspace/shared/plugin install targets
- Codex `$CODEX_HOME/skills`
- optional Codex UI metadata

### 8. Installation and enablement scopes

Supports bounded enablement targets such as:

- one session
- one agent
- one workspace
- shared local machine scope
- plugin bundle scope

### 9. Canary and shadow mode

Allows drafted skills to run in limited scopes before broader promotion.

### 10. Proactivity surfacing

Skill candidates use the existing proactivity surfaces:

- inline follow-up cards
- heartbeat / operator briefing
- inbox / actionable views
- handoff flows
- later Skills Studio UI

### 11. Versioning and rollback

All automatic changes must happen on a branch, worktree, or isolated package
path with provenance and a disable/revert plan.

### 12. Health and maintenance loop

The platform should later maintain itself by pruning stale candidates, flagging
broken skills, adding eval coverage from failures, and creating repair items.

## Non-goals

This architecture does not authorize:

- broad autonomous sending
- autonomous action execution
- raw transcript persistence
- fuzzy semantic truth promotion
- keyword routers as the sole runtime authority
