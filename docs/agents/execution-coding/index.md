---
summary: "Durable source pack for the OpenClaw Execution Platform node implementation agent."
title: "Execution Coding"
---

# Execution Coding

`execution-coding` is the primary implementation agent for executable Runtime
Work Graph nodes.

## Durable Pack

1. [Identity](/agents/execution-coding/Identity)
2. [Startup](/agents/execution-coding/Startup)
3. [Tools](/agents/execution-coding/Tools)
4. [Permissions](/agents/execution-coding/Permissions)
5. [Skills](/agents/execution-coding/Skills)
6. [Status](/agents/execution-coding/Status)

## Runtime Compatibility Sources

- `docs/agents/execution-coding/runtime/AGENTS.md`
- `docs/agents/execution-coding/runtime/BOOTSTRAP.md`
- `docs/agents/execution-coding/runtime/IDENTITY.md`
- `docs/agents/execution-coding/runtime/MEMORY.md`
- `docs/agents/execution-coding/runtime/TOOLS.md`

## Source Rule

This repo-owned pack is the durable source for execution-coding identity and
runtime compatibility files. Runtime copies under `.openclaw/agents` are
materializations, not independent source truth.
