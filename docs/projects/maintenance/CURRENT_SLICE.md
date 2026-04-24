---
summary: "Active slice for the maintenance workspace."
title: "Maintenance Current Slice"
---

# Maintenance Current Slice

## Active slice

`pre-phase2-live-runtime-orchestration-split`

## Goals

1. split `src/agents/model-memory.live-runtime.ts` into smaller internal
   modules so the root file becomes a clear orchestration seam instead of a
   single hot-path monolith
2. preserve current behavior across capture, retrieval, dirty-state, rebuild,
   and tool-result proof paths while keeping the public export surface stable
3. rerun the Phase-2 entry validation pack after the extraction so the cleanup
   lane proves it did not reopen a pre-Phase-2 gate
4. leave the next cleanup slice ready to target `RC-003` repository and shared
   ingestion pipeline extraction if the runtime split remains green
