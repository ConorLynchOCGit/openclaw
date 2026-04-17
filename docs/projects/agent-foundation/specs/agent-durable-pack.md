---
summary: "Spec for the required durable pack of each OpenClaw agent."
title: "Agent Durable Pack"
---

# Agent Durable Pack

## Goal

Define the required durable files for each agent.

## Required files

- `index.md`
- `STARTUP.md`
- `Identity.md`
- `Memory.md`
- `Permissions.md`
- `Tools.md`
- `Skills.md`
- `STATUS.md`
- `DECISIONS.md`
- `roadmap.md`

## Rules

- these files are durable, human-owned docs
- they live under `docs/agents/<agent>/`
- machine-readable runtime config belongs in `.agents/`

## Success criteria

- each agent has a complete durable control surface
- agent role, authority, and constraints are no longer implicit
