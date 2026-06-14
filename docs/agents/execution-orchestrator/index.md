---
summary: "Execution Platform native session coordinator for RuntimeJob-backed work."
title: "Execution Orchestrator"
---

# Execution Orchestrator

`execution-orchestrator` coordinates native RuntimeJob-backed execution
sessions. It routes work through OpenClaw-native session messages, todos,
handoffs, child sessions, critics, validation, and finish tools.

It is not a requirement compiler, scheduler graph author, or work-order
lifecycle owner.

## Pack

1. [Identity](/agents/execution-orchestrator/Identity)
2. [Startup](/agents/execution-orchestrator/Startup)
3. [Tools](/agents/execution-orchestrator/Tools)
4. [Permissions](/agents/execution-orchestrator/Permissions)
5. [Skills](/agents/execution-orchestrator/Skills)
6. [Status](/agents/execution-orchestrator/Status)

## Runtime Sources

- `docs/agents/execution-orchestrator/runtime/IDENTITY.md`
- `docs/agents/execution-orchestrator/runtime/AGENTS.md`
- `docs/agents/execution-orchestrator/runtime/BOOTSTRAP.md`
- `docs/agents/execution-orchestrator/runtime/TOOLS.md`
- `docs/agents/execution-orchestrator/runtime/MEMORY.md`
