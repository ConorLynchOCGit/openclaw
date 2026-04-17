---
summary: "Pointer index for agent durable docs, runtime bootstrap compatibility files, and the agent-foundation project."
title: "System Agents"
---

# System Agents

The agent layer is split on purpose.

- `docs/agents/` is the future durable human-owned agent root
- `.agents/` remains the machine-readable runtime and skill root
- runtime bootstrap compatibility files still remain active today:
  - `AGENTS.md`
  - `SOUL.md`
  - `IDENTITY.md`
  - `USER.md`
  - `TOOLS.md`
  - `BOOTSTRAP.md`

Current runtime assembly path:

- `src/agents/bootstrap-canonicalization.ts` materializes the runtime-facing
  compatibility files from canonical durable sources before bootstrap context is
  loaded
- `src/auto-reply/reply/post-compaction-context.ts` refreshes `AGENTS.md`
  through the same materializer before reading compaction-reinjected sections

Current pointers:

- implementation project:
  [Agent Foundation](/projects/agent-foundation)
- current canonical specialist packs:
  [Agents](/agents)
- shared live workspace pack:
  [Main](/agents/main)
- canonized dedicated runtime-source packs:
  [Builder](/agents/builder),
  [Researcher](/agents/researcher),
  [Writer](/agents/writer),
  [Web Researcher](/agents/web-researcher),
  [X Manager](/agents/x-manager)
- live runtime reconciliation:
  [Live Agent Inventory](/projects/agent-foundation/live-agent-inventory)
- current runtime machine root:
  `.agents/`
- registry bootstrap surface:
  [Agent Registry](/system/registries/agents)
- runtime bootstrap inventory:
  [Runtime Bootstrap File Inventory](/projects/workspace-topology/runtime-bootstrap-file-inventory)
- bootstrap mapping spec:
  [Bootstrap File Canonical Mapping](/projects/workspace-topology/specs/bootstrap-file-canonical-mapping)
- next compatibility-source migration slice:
  [Compatibility Source Migration Plan](/projects/agent-foundation/compatibility-source-migration-plan)
- active machine registry:
  [Bootstrap Files Registry](/system/registries/bootstrap-files)
- broader post-consolidation recovery audit:
  [Missing Functionality Recovery Audit](/projects/deployment-topology/missing-functionality-recovery-audit)
- strict specialist-pack recovery baseline:
  [Exhaustive Agent Pack Diff](/projects/agent-foundation/exhaustive-agent-pack-diff)

Current rule:

- do not try to make YAML and durable narrative do the same job
- `AGENTS.md` must remain a runtime-facing operational document rather than a
  shallow pointer page
- the shared main workspace pack is now canonized under `docs/agents/main/`
- the bounded runtime-source packs for Builder, Researcher, and Writer are now
  canonized under `docs/agents/` and should no longer be treated as host-only
  truth
- Chief intentionally shares the main workspace pack unless a later slice
  promotes a dedicated Chief pack explicitly
- durable sources and runtime compatibility files must be mapped explicitly and
  assembled through one repo path
- live runtime agents must be inventoried honestly even before the later
  `docs/agents/` pack-population slice is complete
