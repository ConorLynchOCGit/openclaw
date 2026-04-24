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
- the second implementation packet has split
  `src/agents/model-memory.live-runtime.ts` into responsibility-scoped sibling
  modules under `src/agents/model-memory/live-runtime/` while keeping the
  existing export surface stable
- the third implementation packet has split
  `extensions/model-memory/src/db/mmv2-native-repository.ts` into helper
  modules for codecs, source persistence, durable record persistence, batch
  persistence, transaction helpers, and legacy compatibility projection
- the same packet has split
  `extensions/model-memory/src/ingestion/shared-pipeline.ts` into helper
  modules for failure policy, prompt planning, candidate validation,
  no-dark-data checks, telemetry, closeout shaping, and pipeline orchestration
- the repository extraction surfaced a real compatibility mismatch in the
  runtime-facing legacy projection: projected identity and slot keys now align
  with `deriveMemoryIdentity`, which restores slot-based supersession behavior
  for MMV2-backed legacy write-policy flows
- the fourth implementation packet has centralized the duplicated model-memory
  helper families that were still spread across runtime gating, runtime-state
  spools, MMV2 JSON parsing, MMV2 sentence normalization, and
  ingestion/validation hashing
- that helper packet introduced:
  - `src/agents/model-memory/value-readers.ts`
  - `src/agents/model-memory/runtime-state-helpers.ts`
  - `extensions/model-memory/src/structured-json.ts`
  - `extensions/model-memory/src/mmv2/text-normalization.ts`
  - `extensions/model-memory/src/hashing.ts`
- a fresh post-slice Phase-2 rerun stayed green at
  `.artifacts/model-memory/phase2-entry-validation/2026-04-24-cleanup-rerun-06/`
- after `RC-005`, the remaining `RC-004` proof/harness isolation work is no
  longer treated as the next planned packet because it does not currently
  clear the diminishing-returns bar for pre-Phase-2 cleanup
- a bounded post-cleanup audit confirmed `RC-004` should stay deferred because
  reopening it now would be proof-surface churn rather than risk reduction
- the same audit closed `MD-013` as stale debt: the current CLI session
  resolver keeps `--to` on `agent:main:main` even under channel-scoped DM
  config, so there is no live `unknown` transport token to replace
- the same audit found real topology drift in workspace-topology registry docs
  plus an omitted `operator-experience` registry entry and one missing
  project-pack file under `docs/projects/operator-experience/`; those are now
  corrected, and no new project bucket split cleared the justification bar

## Immediate next move

- keep the debt register current
- keep the QA matrix aligned with the real maintenance packet bar
- treat the pre-Phase-2 cleanup wave as complete unless fresh evidence makes
  `RC-004` or another bounded hygiene slice materially valuable again
- start or resume Phase 2 work on the current green safety posture rather than
  continuing cleanup for its own sake
