---
summary: "Inventory of the real runtime bootstrap-file contract that OpenClaw currently consumes."
title: "Runtime Bootstrap File Inventory"
---

# Runtime Bootstrap File Inventory

This inventory describes the bootstrap-file contract OpenClaw actually uses
today, based on the current code and docs.

## Core runtime facts

- `src/agents/workspace.ts` declares the recognized bootstrap filenames
- `src/agents/system-prompt.ts` injects bootstrap context in a fixed order
- `src/agents/bootstrap-canonicalization.ts` now materializes compatibility
  files from canonical durable sources before bootstrap loading
- `src/hooks/bundled/bootstrap-extra-files/HOOK.md` documents the recognized
  filenames for extra injection
- `scripts/lib/workspace-bootstrap-smoke.mjs` verifies default workspace
  bootstrap creation
- `docs/start/openclaw.md` documents the operator-visible behavior
- `src/auto-reply/reply/post-compaction-context.ts` and
  `src/agents/pi-hooks/compaction-safeguard.ts` specially process `AGENTS.md`
- `src/auto-reply/reply/post-compaction-context.ts` refreshes `AGENTS.md`
  through the canonical materializer before reading the reinjected sections

## File-class inventory

| File class     | Runtime status                          | Main role                           | Special processing                                                                            |
| -------------- | --------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `AGENTS.md`    | seeded by default; runtime-facing       | primary operating instructions      | post-compaction reinjection reads structured sections from it; subagents still receive it     |
| `SOUL.md`      | seeded by default; runtime-facing       | persona, tone, stance               | injected in normal main-agent context; not the place for heavy operating procedures           |
| `TOOLS.md`     | seeded by default; runtime-facing       | user/tool conventions               | injected in main-agent and subagent context                                                   |
| `IDENTITY.md`  | seeded by default; runtime-facing       | agent identity summary              | injected in main-agent context; CLI identity flows also reference it                          |
| `USER.md`      | seeded by default; runtime-facing       | durable user profile/context        | injected in main-agent context                                                                |
| `HEARTBEAT.md` | optional runtime file                   | heartbeat-specific dynamic context  | treated as dynamic context file, below cache boundary when possible                           |
| `BOOTSTRAP.md` | first-run/onboarding compatibility file | one-time startup ritual marker      | created only for new workspaces and resumes onboarding flows                                  |
| `MEMORY.md`    | optional runtime file                   | curated long-term memory view       | preferred over lowercase `memory.md`; normal bootstrap context includes it when present       |
| `memory.md`    | legacy fallback                         | lowercase compatibility memory view | used only when `MEMORY.md` is absent                                                          |
| `memory/*.md`  | official daily/episodic layer           | daily memory and ingestion input    | not part of normal bootstrap injection; used by memory systems and retrieval/ingestion layers |

## Injection order

Current prompt-context order from `src/agents/system-prompt.ts`:

1. `AGENTS.md`
2. `SOUL.md`
3. `IDENTITY.md`
4. `USER.md`
5. `TOOLS.md`
6. `BOOTSTRAP.md`
7. `MEMORY.md`

Dynamic runtime file:

- `HEARTBEAT.md`

## Required versus optional

- seeded/default workspace pack:
  - `AGENTS.md`
  - `SOUL.md`
  - `TOOLS.md`
  - `IDENTITY.md`
  - `USER.md`
  - `HEARTBEAT.md`
  - `BOOTSTRAP.md`
- optional:
  - `MEMORY.md`
  - `memory.md`
- separate daily/episodic layer:
  - `memory/*.md`

## Canonicalization implication

The revised topology preserves these runtime-facing filenames as compatibility
artifacts.

The repo now has a real assembly path for those compatibility files, but the
runtime still consumes the top-level filenames directly.
