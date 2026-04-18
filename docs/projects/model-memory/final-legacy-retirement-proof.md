---
summary: "Current proof state for model-memory authority and the remaining legacy-memory blocker set."
title: "Legacy Retirement Proof"
---

# Legacy Retirement Proof

This proof document is intentionally honest: the live runtime authority cut is
proven, but the full repo-side legacy deletion tranche is still in progress.

## Proven now

### Live runtime authority

The live config proves `model-memory` is the only active memory authority:

- `plugins.entries.model-memory.enabled = true`
- `plugins.entries.model-memory.config.live.enabled = true`
- `plugins.slots.memory = "none"`
- `agents.defaults.memorySearch.enabled = false`

### Live runtime process

Current live containers:

- `openclaw-runtime` up and healthy
- `memory-middleware-readonly-rollout-pg` still present as unrelated residual
  container state, not the active memory authority

### Legacy runtime state snapshot

Snapshot completed at:

- `/root/.openclaw/workspace/archives/model-memory/legacy-memory-retirement-2026-04-18T021926Z`

### Executed retirement cuts in this sprint

- restored and preserved the bundled `session-memory` hook as a continuity
  producer for canonical daily markdown artifacts
- rewrote the highest-signal legacy docs so they no longer present the old
  stack as current authority
- removed the gateway startup fallback that armed legacy QMD/plugin memory

## Not yet proven complete

The full retirement is not complete yet because the repo still contains
surviving legacy code and config seams, including:

- `extensions/memory-core/`
- `extensions/memory-lancedb/`
- `src/agents/memory-search.ts`
- `src/commands/doctor-memory-search.ts`
- `src/plugin-sdk/memory-core.ts`
- `src/plugin-sdk/memory-lancedb.ts`

## Direct observations used

| Command or observation                                  | Result                                                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| host config snapshot of `/root/.openclaw/openclaw.json` | `plugins.slots.memory = "none"` and `agents.defaults.memorySearch.enabled = false` |
| `docker ps`                                             | `openclaw-runtime` healthy                                                         |
| runtime continuity state audit                          | `MEMORY.md` and `memory/` still present; sqlite stores still present               |
| runtime-state search under `/root/.openclaw`            | no QMD dirs, no LanceDB dirs                                                       |
| repo audit                                              | `src/hooks/bundled/session-memory/**` present and restored as continuity producer  |
| repo audit                                              | `src/gateway/server-startup-memory.ts` no longer initializes QMD/plugin memory     |

## Current conclusion

Today’s truth is:

- `model-memory` is the only **active** memory authority in the live runtime
- legacy continuity/state has been preserved
- markdown continuity production is still allowed where it feeds canonical
  daily artifacts and ingestion
- the full **repo-side deletion tranche** is still incomplete

That is the correct current proof boundary.
