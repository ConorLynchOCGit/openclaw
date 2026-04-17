---
summary: "Spec for the canonical system, project, and agent durable document topology."
title: "System And Document Topology"
---

# System And Document Topology

## Goal

Define the canonical durable document topology for OpenClaw.

## Required structure

```text
docs/system/
docs/projects/
docs/agents/
.agents/
qa/
```

## Ownership classes

- `docs/system/`
  - global durable control docs
- `docs/projects/`
  - project-local durable workspaces
- `docs/agents/`
  - agent-local durable workspaces
- `.agents/`
  - machine-readable agent runtime and skill surfaces
- `qa/`
  - executable QA assets and scenario packs only

## Pointer rules

- pointer docs stay shallow
- global system docs point to project and agent workspaces
- project docs point to project-local deep docs
- agent docs point to agent-local deep docs and machine-readable config where
  appropriate

## Success criteria

- document classes no longer blur together
- navigation and enforcement can both operate on the same topology
