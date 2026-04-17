---
summary: "Global pointer surface for cross-project structural decisions."
title: "System Decisions"
---

# System Decisions

These are the active cross-project structural decisions already in force.

1. `docs/system/` is the canonical global durable-doc root.
2. `docs/projects/` is the only canonical project workspace root.
3. `docs/agents/` will be the canonical durable human-owned agent root.
4. `.agents/` remains the machine-readable agent/runtime root.
5. Repeatable executable workflows should become skills by default.
6. Durable and generated content must use bounded ownership rather than
   whole-file replacement by default.

Decision sources:

- [Workspace Topology Decisions](/projects/workspace-topology/DECISIONS)
- [Agent Foundation Decisions](/projects/agent-foundation/DECISIONS)
- [Model Memory Decisions](/projects/model-memory/DECISIONS)
