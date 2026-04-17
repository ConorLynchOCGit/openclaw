---
summary: "Stable decisions for the intake-routing project."
title: "Intake Routing Decisions"
---

# Intake Routing Decisions

## 2026-04-16 - keep intake as a retained live lane

Decision:

- `intake-routing` remains a retained capability
- it is not archived or retired just because usage is currently light

Reasoning:

- the live webhook-gateway export set still contains `Generic Intake` and
  `Intake Router`
- the live ingress route still answers on `/webhook/intake`
- the live DB still carries the intake and operator-work-queue tables

## 2026-04-16 - store executable intake assets under `ops/intake/`

Decision:

- executable schema and workflow exports live under `ops/intake/`
- durable contract and operator guidance live under
  `docs/projects/intake-routing/`

Reasoning:

- the schema and n8n workflow JSON are operational assets, not prose-only docs
- the contract and deployment guidance still need a readable canonical home
