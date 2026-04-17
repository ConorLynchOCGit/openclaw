---
summary: "Spec for aligning durable agent docs with machine-readable .agents registry entries."
title: "Agent Registry Alignment"
---

# Agent Registry Alignment

## Goal

Align durable agent workspaces with the machine-readable `.agents/` runtime
surface.

## Required alignment

For each durable agent workspace under `docs/agents/<agent>/`, there must be a
matching machine-readable registry/config surface under `.agents/`.

## Required outputs

- canonical agent id
- durable docs path
- runtime config path
- skill set reference
- permission/tool policy classification

## Success criteria

- durable and machine-readable agent representations stay linked
- drift between prose and runtime config becomes detectable
