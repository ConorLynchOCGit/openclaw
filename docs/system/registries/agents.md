---
summary: "Human-readable wrapper for the bootstrap agent registry."
title: "Agents Registry"
---

# Agents Registry

Canonical machine-readable source:

- `docs/system/registries/agents.yaml`

Current scope:

- live runtime agent inventory now reconciled from the actual VPS runtime
- bounded `docs/agents/` runtime sources now exist for:
  - `main`
  - `builder`
  - `researcher`
  - `web-researcher`
  - `writer`
  - `x-manager`
- fuller durable `docs/agents/` pack population still remains a later slice
- lightweight skill-local runtime descriptors under `.agents/skills/**/agents/*.yaml`
  still exist, but they are not the whole live agent inventory

Primary live runtime reference:

- [Live Agent Inventory](/projects/agent-foundation/live-agent-inventory)
