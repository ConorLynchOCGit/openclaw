---
summary: "Spec for the required durable pack of each OpenClaw agent."
title: "Agent Durable Pack"
---

# Agent Durable Pack

## Goal

Define the required durable files for each agent.

## Required files

- `index.md`
- `Identity.md`
- `Startup.md`
- `Tools.md`
- `Permissions.md`
- `Skills.md`
- `Status.md`

## Optional files

- `Decisions.md`
- `Examples.md`
- `Interfaces.md`
- `Workflows.md` only when the workflow is intentionally operator-facing and
  should not yet be encoded as a skill

## Required sections

### `Identity.md`

- `## Mission`
- `## Optimize For`
- `## In Bounds`
- `## Out Of Bounds`
- `## Escalation`
- `## Quality Bar`

### `Startup.md`

- `## Required Context`
- `## First Reads`
- `## Stop Conditions`

### `Tools.md`

- `## Preferred Tools`
- `## Constraints`

### `Permissions.md`

- `## Allowed`
- `## Escalate`
- `## Forbidden`

### `Skills.md`

- `## Required Skills`
- `## Optional Skills`

### `Status.md`

- `## Maturity`
- `## Gaps`
- `## Follow-Up`

## Rules

- these files are durable, human-owned docs
- they live under `docs/agents/<agent>/`
- machine-readable runtime config belongs in `.agents/`
- runtime compatibility files may still live under `docs/agents/<agent>/runtime/`
  while the runtime bootstrap layer still consumes those names directly
- do not create filler files only to satisfy the pack; optional files should
  exist only when they carry real durable meaning

## Success criteria

- each agent has a complete durable control surface
- agent role, authority, and constraints are no longer implicit
