---
summary: "Clean-room model-memory project workspace."
title: "Model Memory"
---

# Model Memory

`model-memory` is a clean-room memory system project being built to replace the
legacy memory stack.

The project goals are strict:

- maximum model leverage
- minimum hand-written semantic logic
- one unified semantic pipeline for document ingestion and ordinary-turn user capture
- no detector-era architecture
- no keyword or phrase routing as semantic authority
- no compatibility categories in runtime truth

The target system inside OpenClaw has four pillars:

- harness
- context engine
- memory layer
- usage/cache layer

This project is intentionally isolated from the legacy memory implementation.
That clean-room boundary remains, and the repo has now completed the production
cutover flip onto `model-memory`.

Current status:

- slices 1 through 15 are implemented in `extensions/model-memory/`
- the live logical database `model_memory` is provisioned on the shared Supabase/Postgres server
- the initial package migration has been applied to that logical database
- the claim-plus-support architecture is now implemented:
  - durable objects plus support items
  - lifecycle and activation state
  - bounded duplicate adjudication
  - daily continuity recovery as a provisional secondary lane
  - active-only default runtime reads
- the live runtime seam now exists:
  - bootstrap/context overlay
  - live assistant-turn capture
  - explicit enable/disable switch
- the target production cutover posture is now live:
  - `plugins.slots.memory = "none"`
  - `agents.defaults.memorySearch.enabled = false`
- the production flip has been executed and verified:
  - `model-memory` is live
  - rollback is native no-memory mode
  - legacy slot remains off
- remaining work is operational:
  - run the 72-hour watch
  - perform sampled review and fast-follow fixes
  - retire legacy code after the stability window

## Project docs

1. [Roadmap](/projects/model-memory/roadmap)
2. [Status](/projects/model-memory/STATUS)
3. [Decisions](/projects/model-memory/DECISIONS)
4. [Current Slice](/projects/model-memory/CURRENT_SLICE)
5. [Cutover Thesis](/projects/model-memory/cutover-thesis)
6. [Spec Index](/projects/model-memory/specs)
7. [Spec Closure Review](/projects/model-memory/SPEC_CLOSURE_REVIEW)
8. [Build Plan](/projects/model-memory/build-plan)
9. [Proof Corpus Plan](/projects/model-memory/proof-corpus-plan)
10. [Large Document Ingestion Inventory](/projects/model-memory/document-ingestion-inventory)
11. [Implementation Guardrails](/projects/model-memory/implementation-guardrails)
12. [Validation Loop](/projects/model-memory/validation-loop)
13. [Implementation Slices 1 Through 5 Checklist](/projects/model-memory/implementation-slices-1-5-checklist)
14. [Bootstrap Input Audit](/projects/model-memory/bootstrap-input-audit)
15. [Cutover And Retirement Plan](/projects/model-memory/cutover-retirement-plan)
16. [Cutover Plan](/projects/model-memory/cutover-plan)
17. [Cutover Checklist](/projects/model-memory/cutover-checklist)
18. [72 Hour Watch](/projects/model-memory/cutover-72h-watch)
19. [VPS Consolidation And Test Diagnostic](/projects/model-memory/vps-consolidation-and-test-diagnostic)
20. [VPS Runtime Consolidation Plan](/projects/model-memory/vps-runtime-consolidation-plan)
21. [VPS PNPM And Build Optimization Plan](/projects/model-memory/vps-pnpm-turbo-optimization-plan)

## Scope

Initial implementation scope:

- document ingestion
- ordinary-turn user capture
- standalone runtime with optional shadow mode
- same Supabase/Postgres server, new logical database
- runtime read-model, projection, context-engine, and usage/cache architecture specified before implementation

Current operational scope:

- 72-hour stabilization watch
- sampled post-cutover review and fast-follow fixes
- legacy retirement and deletion
