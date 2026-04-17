---
summary: "Active slice for the agent-foundation project."
title: "Agent Foundation Current Slice"
---

# Agent Foundation Current Slice

## Active slice

`slice_1_runtime_source_pack_canonization`

## Current task

Carry the runtime reconciliation forward by canonizing the remaining live
runtime-source packs into repo-owned durable sources that still materialize into
the live workspaces.

## Immediate future slice

`slice_1_5_richer_agent_pack_population`

Goals:

- extend the bounded runtime-source seeds into richer durable packs where
  current evidence justifies it
- align durable packs with `.agents/` machine-readable registry entries
- decide which still-lightweight packs need authored `USER.md`, `BOOTSTRAP.md`,
  or role-local context later
- carry forward the live runtime inventory and the canonized runtime-source
  packs instead of starting from the older bootstrap-only registry stub
- use
  [Compatibility Source Migration Plan](/projects/agent-foundation/compatibility-source-migration-plan)
  as the explicit migration order for shared versus per-agent authored sources
