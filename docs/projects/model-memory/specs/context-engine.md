---
summary: "Context-engine design for assembling memory-driven context inside OpenClaw."
title: "Context Engine"
---

# Context Engine

## Objective

Define the runtime context engine that consumes model-memory outputs without becoming a second semantic system.

## Core rule

The context engine assembles context.

It does not define semantic truth.

## Input layers

The context engine consumes:

- compiled bootstrap projections
- dynamic memory packs
- session working-state artifacts
- retrieval results
- recent turns
- recent tool results

## Context layering

The engine should treat context in three layers:

- stable bootstrap layer
- semi-stable memory-pack layer
- volatile live-run layer

This layering exists to support prompt budgeting and cache stability.

## Bootstrap

`bootstrap(session)` should do only cheap setup:

- resolve session scope
- resolve agent id
- resolve default project scope
- load active projection versions
- load latest session working-state artifact ids

It should not do heavy retrieval.

## Ingest batch

`ingestBatch(turn)` should:

- run the canonical memory write path
- update session working state
- mark affected projection targets dirty
- mark affected pack caches dirty

It must not invent a second semantic write path.

## Assemble

`assemble(run)` should:

1. resolve provider/model and token budget
2. load stable projection hashes
3. load semi-stable packs
4. load session summary pack if available
5. load retrieval/context packs if retrieval is implemented and enabled
6. assemble recent turns and tool results
7. estimate tokens
8. trim lower-priority segments when required
9. return ordered messages plus, at most, a very small `systemPromptAddition`

## Phase boundary

Phase 3 context assembly must work without retrieval.

Before retrieval is implemented, `assemble(run)` is limited to:

- bootstrap projections
- non-retrieval dynamic packs
- session working-state artifacts
- recent turns
- recent tool results

Retrieval-enhanced assembly begins only after the retrieval phase is implemented and enabled.

## Trimming order

When the budget is exceeded, the default trim order should be:

1. old tool results
2. large payload attachments
3. lower-priority project and reference pack items
4. older turns already covered by summary

The engine should preserve the stable prefix when practical to support prompt caching.

## Compaction

Phase 1 recommendation:

- the custom engine does not own compaction
- compaction delegates to the OpenClaw runtime

Later, the system may add model-memory-owned session-summary artifacts without changing this initial boundary.

## After turn

`afterTurn(run)` should persist:

- usage and cache counters
- segment hashes
- projection versions used
- dirty projection rebuild jobs
- session working-state updates

## Subagents

Subagents may not see the same bootstrap surfaces as the main agent.

Therefore:

- critical standing rules that delegated agents must obey cannot live only in `USER.md` or `MEMORY.md`
- those rules must also be projectable into child-visible generated `AGENTS.md` sections or child-specific dynamic packs

The spec should account for subagent visibility now, even if implementation comes later.
