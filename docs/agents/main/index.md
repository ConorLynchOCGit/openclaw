---
summary: "Canonical runtime-source pack for the shared main workspace."
title: "Main"
---

# Main

`main` is the shared high-trust operator agent for the canonical OpenClaw
workspace.

## Durable pack

1. [Identity](/agents/main/Identity)
2. [Startup](/agents/main/Startup)
3. [Tools](/agents/main/Tools)
4. [Permissions](/agents/main/Permissions)
5. [Skills](/agents/main/Skills)
6. [Status](/agents/main/Status)

## Runtime compatibility sources

- `docs/agents/main/runtime/AGENTS.md`
- `docs/agents/main/runtime/SOUL.md`
- `docs/agents/main/runtime/IDENTITY.md`
- `docs/agents/main/runtime/TOOLS.md`
- `docs/agents/main/runtime/USER.md`

## Current rule

- these files are the durable authored source for the shared main workspace
- runtime compatibility assembly still layers generated canonical sections and
  model-memory overlays on top of them
- `chief` shares the same workspace but now has its own durable identity and
  control pack
