---
summary: "Active slice for the maintenance workspace."
title: "Maintenance Current Slice"
---

# Maintenance Current Slice

## Active slice

`pre-phase2-repository-and-ingestion-orchestration-split`

## Goals

1. split `extensions/model-memory/src/db/mmv2-native-repository.ts` into
   smaller internal modules so the root file becomes a clear persistence seam
   instead of an all-in-one repository monolith
2. split `extensions/model-memory/src/ingestion/shared-pipeline.ts` into
   responsibility-scoped sibling modules without changing validation,
   quarantine, telemetry, or closeout behavior
3. preserve current MMV2 write/read behavior, per-candidate persistence
   isolation, and no-dark-data reporting rules while keeping the public export
   surface stable
4. rerun the Phase-2 entry validation pack after the extraction so the cleanup
   lane proves it did not reopen a pre-Phase-2 gate
5. leave the next cleanup slice ready to target `RC-005` helper
   centralization once the repository/pipeline split remains green

## Current status

- `RC-003` completed with repository helpers under
  `extensions/model-memory/src/db/mmv2-native-repository/`
- `RC-003` completed with shared-pipeline helpers under
  `extensions/model-memory/src/ingestion/shared-pipeline/`
- the latest fresh Phase-2 safety rerun remained green at
  `.artifacts/model-memory/phase2-entry-validation/2026-04-24-cleanup-rerun-05/`
- the next planned cleanup slice is `RC-005` helper centralization
