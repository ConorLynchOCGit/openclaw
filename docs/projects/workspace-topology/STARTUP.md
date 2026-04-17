---
summary: "Startup brief for the workspace-topology project."
title: "Workspace Topology Startup"
---

# Workspace Topology Startup

## Mission

Normalize OpenClaw's durable file structure so that:

- all projects live under one canonical project root
- global durable control docs live under one canonical system root
- agent durable docs live under one canonical agent root
- generated sections are bounded explicitly
- drift from the intended structure is detected deterministically

## Accepted starting truth

- `docs/projects/` already exists and is the best canonical project root
- `docs/projects/model-memory/` and `docs/projects/turborepo/` already use the
  project-workspace pattern
- project-like planning material is still scattered outside `docs/projects/`
- there is no repo-wide system root yet for global durable control docs
- there is no repo-wide durable agent-doc root yet
- the `model-memory` project already contains the seed of a durable-vs-generated
  ownership model, but it has not been generalized into a repo-wide contract

## Target shape

```text
docs/system/
docs/projects/
docs/agents/
.agents/
qa/
```

## Scope

This project covers:

- durable doc topology
- project centralization
- scattered-doc classification and migration
- registries
- doc-pack scaffolding rules
- drift-check scripts
- runtime-sprawl prevention surfaces for repos, containers, and images

This project does not cover:

- full authoring of every agent durable pack
- broad runtime feature work unrelated to structure

## Exit criteria

- the canonical structure exists
- scattered project-like material has been classified and moved intelligently
- registries exist
- project pack compliance is checkable
- durable-vs-generated boundaries are documented and enforceable
- runtime sprawl checks exist
