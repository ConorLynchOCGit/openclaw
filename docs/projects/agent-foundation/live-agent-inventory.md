---
summary: "Durable inventory of the live runtime agent set, workspace state, and current visibility status."
title: "Live Agent Inventory"
---

# Live Agent Inventory

This inventory is based on the actual live runtime evidence, not the bootstrap
registry stub.

Primary evidence sources:

- live container: `openclaw-runtime`
- live config: `/home/node/.openclaw/openclaw.json`
- live gateway inventory: `docker exec openclaw-runtime openclaw agents list --json`
- live state roots under `/home/node/.openclaw/agents/`
- live workspace mount under `/home/node/.openclaw/agent-workspaces/`

## Current live inventory

| id               | display name     | configured | runtime state | workspace path                                         | workspace state                                        | session state                     | current visibility                                                                    | status                                          |
| ---------------- | ---------------- | ---------- | ------------- | ------------------------------------------------------ | ------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `main`           | `OpenClaw`       | yes        | present       | `/home/node/.openclaw/workspace`                       | present (shared canonical workspace)                   | canonical sessions present        | visible in `agents.list`; visible in session-driven surfaces                          | `live_and_initialized`                          |
| `chief`          | `OpenClaw`       | yes        | present       | `/home/node/.openclaw/workspace`                       | present (shared canonical workspace)                   | canonical sessions present        | visible in `agents.list`; visible in session-driven surfaces                          | `live_and_initialized`                          |
| `builder`        | `Builder`        | yes        | present       | `/home/node/.openclaw/agent-workspaces/builder`        | present                                                | canonical sessions present        | visible in `agents.list`; visible in session-driven surfaces                          | `live_and_initialized`                          |
| `researcher`     | `Researcher`     | yes        | present       | `/home/node/.openclaw/agent-workspaces/researcher`     | present                                                | no `sessions.json` present        | visible in `agents.list`; absent from session-driven surfaces                         | `configured_but_uninitialized`                  |
| `web-researcher` | `Web Researcher` | yes        | present       | `/home/node/.openclaw/agent-workspaces/web-researcher` | missing before this reconciliation slice; restored now | canonical session history present | visible in `agents.list`; session history exists; dedicated workspace had drifted out | `configured_but_broken_workspace` before repair |
| `writer`         | `Writer`         | yes        | present       | `/home/node/.openclaw/agent-workspaces/writer`         | present                                                | canonical sessions present        | visible in `agents.list`; visible in session-driven surfaces                          | `live_and_initialized`                          |
| `x-manager`      | `(none)`         | yes        | present       | `/home/node/.openclaw/agent-workspaces/x-manager`      | missing before this reconciliation slice; restored now | canonical session history present | visible in `agents.list`; session history exists; dedicated workspace had drifted out | `configured_but_broken_workspace` before repair |

## Current interpretation

- The live runtime really does include multiple non-main agents.
- The old bootstrap-only agent registry was stale and materially misleading.
- `researcher` is configured with a valid dedicated workspace but has not been
  initialized into a canonical session store.
- `web-researcher` and `x-manager` were not retired. They were still configured
  live, still had runtime state and historical sessions, but their dedicated
  workspace directories had drifted out of the mounted workspace tree.

## Why a runtime surface can show only Main

The current repo has two different visibility contracts:

- the agent inventory surface uses `agents.list`
- the chat/session selector uses `sessions.list`

That matters because the session selector is not a configured-agent list. It is
a session-driven surface. When `sessions.list` is absent, stale, or has not
loaded yet, the selector falls back to the current `sessionKey`, which is
typically the canonical Main session. In that degraded state, the UI can show
only `Main Session` even though the live gateway inventory still includes the
full configured agent set.

## Immediate repair result from this slice

- durable registry now reflects the real live runtime agent set
- `web-researcher` dedicated workspace restored from the preserved runtime patch
  bundle
- `x-manager` dedicated workspace restored from the preserved runtime seed and
  context bundle
- `researcher` remains configured but uninitialized and should be treated as a
  separate follow-up from missing-workspace drift
