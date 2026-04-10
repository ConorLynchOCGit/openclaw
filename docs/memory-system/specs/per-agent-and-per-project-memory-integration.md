# Per-Agent And Per-Project Memory Integration

## Purpose

Define how canonical durable memory projects into:

- the shared workspace
- project-local docs
- agent-specific workspaces

without forcing every agent or project into the same complexity tier.

## Shared-workspace-first posture

The first implementation tranche should land:

1. shared-workspace bootstrap projections
2. project-local projections

Agent-specific projections come later.

## Shared workspace

Primary shared targets:

- `USER.md`
- `TOOLS.md`
- `MEMORY.md`
- human-maintained `AGENTS.md` policy updates where needed

Use the shared workspace for:

- cross-project durable context
- user-profile defaults
- default workflow conventions

## Project-local integration

Project-local docs are the main home for project memory.

### Why

- project detail should not consume global bootstrap budget
- project memory often needs more structure and depth than prompt-facing files
- project scope is the natural place for decisions, current state, and durable
  constraints

### Expected v1 posture

Project-local memory integration should publish compact, high-signal project
views into existing project folders rather than inventing a second project store
in top-level bootstrap files.

## Agent workspace tiers

Agent workspaces are heterogeneous today, so they should not all receive the
same treatment.

### Tier A — shared-workspace agents

Examples:

- `main`
- `chief`

Use shared projections first.

### Tier B — role-specific agent workspaces

Example:

- `x-manager`

These may later justify dedicated role-specific projections.

### Tier C — generic-template agent workspaces

Example:

- `builder` as currently structured

Do not add bespoke projections in tranche 1 unless a real role-specific memory
packet already exists and needs it.

## Agent-specific projection timing

### v1

Do not land general per-agent projections yet.

### later tranche

When agent-specific projections land, they should rely on:

- existing agent workspaces
- stronger agent-scoped DB memory
- explicit destination rules

They should not use agent state directories as the projection destination.

## Project vs agent precedence

When both an agent-specific rule and a project-specific rule exist:

- project-local operating reality wins for that project
- shared global defaults still remain the baseline outside that project

## Future prerequisite for agent-specific projections

Later agent-specific work should strengthen DB scoping for:

- applies-to-agent
- role-specific projection eligibility
- projection suppression for irrelevant agents

This is intentionally deferred until after the shared + project build is stable.
