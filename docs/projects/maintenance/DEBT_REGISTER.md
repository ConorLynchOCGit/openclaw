---
summary: "Active bounded maintenance debt inventory used by the weekly maintenance guard."
title: "Maintenance Debt Register"
---

# Maintenance Debt Register

## Purpose

Track open bounded maintenance follow-ups without turning maintenance into a
parallel roadmap.

## Fields

- `id`
- `category`
- `status`
- `risk`
- `owner_or_surface`
- `description`
- `next_action`
- `notes`

## Status values

- `open`
- `planned`
- `in_progress`
- `blocked`
- `deferred`
- `closed`

## Category values

- `content-alignment`
- `ui`
- `delivery`
- `ownership`
- `retention`
- `runbook`
- `qa-sentinel`
- `repo-hygiene`

## Current open items

### MD-014

- `id`: `MD-014`
- `category`: `repo-hygiene`
- `status`: `closed`
- `risk`: `high`
- `owner_or_surface`: `model-memory runtime/public boundary`
- `description`: the default MMV2 runtime/public path still crosses explicit
  legacy admin/proof seams and rollback toggles that should be isolated more
  aggressively before Phase 2 feature growth resumes.
- `next_action`: keep any surviving compatibility exports explicit and out of
  the default runtime facade; revisit only if a later slice proves more
  retirement is worth the compatibility churn.
- `notes`: diagnosis backlog item `RC-001`; default plugin-sdk runtime facade
  no longer loads `legacy-admin-api`, and `extensions/model-memory/src/runtime-api.ts`
  no longer exports the legacy fallback registry.

### MD-015

- `id`: `MD-015`
- `category`: `repo-hygiene`
- `status`: `in_progress`
- `risk`: `medium`
- `owner_or_surface`: `model-memory hot-path orchestration`
- `description`: several Phase-2-critical files remain oversized orchestration
  seams, especially `model-memory.live-runtime.ts`,
  `mmv2-native-repository.ts`, and `shared-pipeline.ts`.
- `next_action`: validate the extracted live-runtime seam with a fresh Phase-2
  rerun, then execute `RC-003` so repository and shared-pipeline concerns are
  split into smaller modules without behavior change.
- `notes`: diagnosis backlog item `RC-002` has landed via
  `src/agents/model-memory/live-runtime/*`; remaining hot-path extraction debt
  is now concentrated in `RC-003`.

### MD-016

- `id`: `MD-016`
- `category`: `repo-hygiene`
- `status`: `planned`
- `risk`: `medium`
- `owner_or_surface`: `model-memory validation and helper duplication`
- `description`: session-turn proof, entry-validation harness code, and several
  runtime helpers still duplicate parsing, shaping, and status-mapping logic
  that should be centralized before more Phase 2 features land on top.
- `next_action`: execute the helper-centralization slice after the large-file
  extraction packets are green.
- `notes`: diagnosis backlog items `RC-004` and `RC-005`.

### MD-013

- `id`: `MD-013`
- `category`: `repo-hygiene`
- `status`: `open`
- `risk`: `low`
- `owner_or_surface`: `CLI session routing`
- `description`: CLI-originated direct Main sessions still derive a
  non-canonical `unknown` channel token because the CLI does not carry a real
  source transport channel.
- `next_action`: decide whether CLI-originated direct sessions should keep the
  current `unknown` token or move to an explicit synthetic token such as `cli`,
  then apply the narrow session-key update only if that convention is accepted.
- `notes`: this is an ergonomics debt item, not the earlier canonical-Main
  precedence bug.

## Historical note

Closed legacy maintenance items remain valid historical evidence in the legacy
workspace and archive surfaces, but this canonical register tracks the live
open debt that still matters operationally.
