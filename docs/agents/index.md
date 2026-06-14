---
summary: "Canonical durable root for agent-specific human-owned source material."
title: "Agents"
---

# Agents

`docs/agents/` is the canonical durable root for agent-specific human-owned
source material.

Current tranche status:

- the live runtime agent set is now mirrored here explicitly
- each live agent now has a durable base pack
- runtime compatibility files still live under `docs/agents/<agent-id>/runtime/**`
  where applicable while the bootstrap layer still consumes those names
- `docs/agents/registry.yaml` is the durable machine-checkable map for the
  live agent set

## Current agents

- [Main](/agents/main)
- [Chief](/agents/chief)
- [Builder](/agents/builder)
- [Researcher](/agents/researcher)
- [Web Researcher](/agents/web-researcher)
- [Writer](/agents/writer)
- [X Manager](/agents/x-manager)

## Execution Platform agents

- [Execution Orchestrator](/agents/execution-orchestrator)
- [Execution Coding](/agents/execution-coding)
- [Execution Critic](/agents/execution-critic)
- [Execution Context Scout](/agents/execution-context-scout)
- [Execution Validation Scout](/agents/execution-validation-scout)
