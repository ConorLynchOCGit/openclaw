---
summary: "Startup brief for the agent-foundation project."
title: "Agent Foundation Startup"
---

# Agent Foundation Startup

## Mission

Create durable, explicit agent workspaces so sub-agents have:

- real identity docs
- explicit permissions
- explicit tool posture
- explicit skill posture
- durable memory pointer docs
- machine-readable registry alignment

## Accepted starting truth

- the repo currently has skill docs under `.agents/skills/**`
- the repo currently has only lightweight agent descriptors in a few places
- the repo does not yet contain a full durable agent pack per agent
- the durable human-owned agent root will be:
  - `docs/agents/`
- the machine-readable runtime root remains:
  - `.agents/`

## Key design choice

Repeatable workflows should canonize into skills by default.

That means:

- `Workflows.md` is not part of the required base pack
- if a workflow is repeatable and executable, it should usually become a skill
- durable agent docs should point to required skills rather than duplicating a
  parallel workflow system unnecessarily

## Open research requirement

Identity docs must be richer than one-line labels. This project includes
further research on how to build `Identity.md` for agent-specific utility and
behavior.

## Exit criteria

- durable agent pack contract exists
- machine-readable registry alignment exists
- the highest-priority agents have fully populated durable packs
