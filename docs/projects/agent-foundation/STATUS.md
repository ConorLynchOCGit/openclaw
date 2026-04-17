---
summary: "Current status for the agent-foundation project."
title: "Agent Foundation Status"
---

# Agent Foundation Status

## Overall

State: `runtime_inventory_reconciled`

The durable agent-workspace structure is still a future slice, but the live
runtime agent set has now been reconciled into repo truth and the bounded live
runtime-source packs are now canonized under `docs/agents/`.

## Confirmed current state

- skill definitions exist under `.agents/skills/**`
- a few lightweight agent descriptors exist under skill-local `agents/*.yaml`
- bounded canonical `docs/agents/` footholds now exist for:
  - `builder`
  - `main`
  - `researcher`
  - `web-researcher`
  - `writer`
  - `x-manager`
- the retained subset of the old role-library adaptation surface now lives
  under `docs/projects/agent-foundation/specs/role-library-adaptations.md`
- the live VPS runtime currently includes seven configured agents
- two specialized live agents (`web-researcher`, `x-manager`) had drifted into
  missing dedicated workspace dirs before this reconciliation slice repaired
  them
- `researcher` remains configured but uninitialized
- the next richer pack-population slice now has an explicit ownership map in
  [Compatibility Source Migration Plan](/projects/agent-foundation/compatibility-source-migration-plan)
- the stricter recovery pass now shows that richer durable agent-pack content
  beyond the runtime-source seeds still needs later population, but the live
  non-main runtime packs are no longer repo-missing

## Immediate next move

Use the reconciled live runtime inventory and the canonized runtime-source packs
as the entry point for the later agent-pack population slice, then:

1. extend `docs/agents/` beyond the current runtime-source footholds
2. define the registry-backed durable pack per live agent
3. fully populate the highest-priority remaining agent packs first
4. decide whether `researcher` should be initialized or retired explicitly
5. use [Exhaustive Agent Pack Diff](/projects/agent-foundation/exhaustive-agent-pack-diff)
   as the recovery baseline instead of rediscovering the pack drift later
