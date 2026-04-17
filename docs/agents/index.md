---
summary: "Canonical durable root for agent-specific human-owned source material."
title: "Agents"
---

# Agents

`docs/agents/` is the canonical durable root for agent-specific human-owned
source material.

Current tranche status:

- `main` now has a canonical shared runtime-source pack for the live shared
  workspace
- `builder`, `researcher`, and `writer` now also have canonical runtime-source
  footholds that match the current live runtime packs
- `web-researcher` and `x-manager` now have canonical runtime-source footholds
- their runtime-facing compatibility files are materialized from
  `docs/agents/<agent-id>/runtime/**`
- the later broader agent slice still owns richer pack population beyond these
  canonized runtime-source seeds

## Current agents with canonical runtime sources

- [Builder](/agents/builder)
- [Main](/agents/main)
- [Researcher](/agents/researcher)
- [Web Researcher](/agents/web-researcher)
- [Writer](/agents/writer)
- [X Manager](/agents/x-manager)
