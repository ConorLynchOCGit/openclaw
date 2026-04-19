---
summary: "Visibility rule and runtime fix for hiding stray internal codex sessions from the operator selector."
title: "Session Selector Visibility Cleanup"
---

# Session Selector Visibility Cleanup

## Problem

The normal operator-visible session selector was surfacing stray `codex-`
session rows that were not real user-facing sessions.

This was an operator hygiene failure because the selector is supposed to show
meaningful conversation/session choices, not internal proof or smoke rows.

## Evidence

Session-store evidence source:

- `/root/.openclaw/agents/main/sessions/sessions.json`

Exact entries found during the audit:

- `agent:main:codex-call-proof`
- `agent:main:codex-live-progress-generic`
- `agent:main:codex-live-progress-generic2`
- `agent:main:codex-live-progress-generic4`
- `agent:main:codex-live-progress-generic5`
- `agent:main:codex-live-proof-smoke2`

Shared characteristic:

- `requestKey` starts with `codex-`
- no `displayName`
- no `subject`
- no `label`

## Classification

These are classified as:

- internal proof or testing sessions
- persisted in the main session store
- not intended for the normal operator selector

They are **not** classified as:

- legitimate operator sessions
- merely ugly labels that should remain visible

## Runtime seam fixed

Affected runtime surfaces:

- [session-utils.ts](/root/services/openclaw-roles/live/src/gateway/session-utils.ts)
- [session-utils.search.test.ts](/root/services/openclaw-roles/live/src/gateway/session-utils.search.test.ts)

Implemented rule:

- hide a session row from the selector only when all of the following are true:
  - session key parses as `agent:main:*`
  - request key starts with `codex-`
  - the stored row has no user-facing metadata:
    - `displayName`
    - `subject`
    - `label`

## Why the rule is narrow

This avoids the two failure modes that mattered here:

- over-broad filtering that hides legitimate operator sessions
- cosmetic renaming that keeps internal proof rows visible

Example preserved intentionally:

- a session like `agent:main:codex-workbench` remains visible if it has a
  real `displayName`

## Validation path

Targeted test:

- `pnpm exec vitest run src/gateway/session-utils.search.test.ts`

What the test proves:

- internal `codex-*` rows without visible metadata are hidden
- a user-facing `codex-*` row with `displayName` still appears

## Current selector contract

Visible in the normal operator selector:

- legitimate operator sessions
- cron and specialist sessions that remain intentionally visible
- any `codex-*` row with explicit user-facing metadata

Hidden from the normal operator selector:

- internal proof/test `codex-*` rows without user-facing metadata

## Tailnet/operator posture

This change is selector classification only.

It does **not**:

- widen gateway origin policy
- weaken Tailnet-safe operator posture
- alter session auth or routing trust boundaries
