---
summary: "Active slice for the maintenance workspace."
title: "Maintenance Current Slice"
---

# Maintenance Current Slice

## Active slice

`pre-phase2-model-memory-boundary-narrowing`

## Goals

1. keep the cleanup/refactor program canonically owned by maintenance docs plus
   the generated diagnosis artifacts under
   `.artifacts/refactor-prephase2/2026-04-24/diagnosis/`
2. narrow the default MMV2 runtime/plugin-sdk boundary so legacy admin/proof
   seams are explicit instead of piggybacking on the normal runtime facade
3. leave the next cleanup slice ready to target the highest-ranked hot-path
   orchestration extraction work
