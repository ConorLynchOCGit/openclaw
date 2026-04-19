---
summary: "Human-readable wrapper for the bootstrap agent registry."
title: "Agents Registry"
---

# Agents Registry

Canonical machine-readable source:

- `docs/system/registries/agents.yaml`

Current scope:

- live runtime agent inventory now reconciled from the actual VPS runtime
- the live durable pack layer now exists for:
  - `chief`
  - `main`
  - `builder`
  - `researcher`
  - `web-researcher`
  - `writer`
  - `x-manager`
- each live agent now has the required durable base pack files
- lightweight skill-local runtime descriptors under `.agents/skills/**/agents/*.yaml`
  still exist, but they are not the whole live agent inventory

Primary live runtime reference:

- [Current Agent Inventory](/projects/agent-foundation/current-agent-inventory)
