---
summary: "Canonical global durable-doc root for repo-wide control surfaces."
title: "System"
---

# System

`docs/system/` is the canonical global durable-doc root for OpenClaw.

It exists to hold shallow control and pointer documents, not deep project
content.

Use this area for:

- global roadmap and build-plan pointers
- cross-project decision pointers
- project and agent registries
- repo-wide policy surfaces
- deployment and topology control surfaces

Primary entry points:

1. [Memory](/system/memory)
2. [Roadmap](/system/roadmap)
3. [Roadmap Ideas](/system/roadmap-ideas)
4. [Build Plan](/system/build-plan)
5. [Projects](/system/projects)
6. [Agents](/system/agents)
7. [Decisions](/system/decisions)
8. [Deployment](/system/deployment)
9. [Authentication](/system/authentication)

Current cross-project live seam to note:

- memory bootstrap ownership and `memory-md` bootstrap projection are now split
  intentionally:
  - curated continuity remains in workspace `MEMORY.md`
  - generated bootstrap projection lives under
    `.openclaw/model-memory/projections/*`
