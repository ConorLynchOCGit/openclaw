---
summary: "Current status for the maintenance workspace."
title: "Maintenance Status"
---

# Maintenance Status

## Overall

State: `active`

The maintenance lane now has a canonical project workspace because the live
weekly maintenance guard depends on explicit control inputs.

## Confirmed current state

- the weekly maintenance guard is live in OpenClaw-native cron
- the debt register and QA matrix are the main durable control inputs for that
  job
- those control inputs previously survived only in the legacy workspace
- the canonical repo now owns the active maintenance control surface
- a new maintenance-owned cleanup/refactor program is now the canonical home
  for pre-Phase-2 codebase diagnosis and slice planning
- the first diagnosis artifact pack was generated at
  `.artifacts/refactor-prephase2/2026-04-24/diagnosis/`
- that diagnosis ranked the first wave as:
  `RC-002 live runtime split`, `RC-003 repository/shared-pipeline extraction`,
  `RC-001 boundary narrowing`, `RC-005 helper centralization`, `RC-004 proof/harness isolation`
- the cleanup lane is intentionally scoped to Phase-2-critical leverage first,
  not broad repo churn
- the first implementation packet has already narrowed the model-memory default
  boundary by moving legacy/admin plugin-sdk exports into
  `src/plugin-sdk/model-memory-legacy.ts` and keeping `runtime-api.ts`
  runtime-only

## Immediate next move

- keep the debt register current
- keep the QA matrix aligned with the real maintenance packet bar
- close any remaining high-leverage legacy boundary stragglers only if they are
  still on the default live path
- otherwise move to `RC-002` and split `src/agents/model-memory.live-runtime.ts`
  in a behavior-preserving extraction packet
