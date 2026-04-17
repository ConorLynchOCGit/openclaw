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
22. [Model Memory Ops Reporting Lane](/projects/model-memory/ops-reporting-lane)
23. [Document Read And Ingest Arbitration](/projects/model-memory/specs/document-read-and-ingest-arbitration)
24. [Deep Document Ingest Targets 2026-04](/projects/model-memory/document-ingest-targets-2026-04-deep-pass)
25. [Deep Document Ingest Runbook](/projects/model-memory/deep-document-ingest-runbook)
26. [Deep Ingest Verification Plan](/projects/model-memory/deep-ingest-verification-plan)
27. [Deep Memory Soak Human Tests](/projects/model-memory/deep-memory-soak-human-tests)
28. [Graph Derived Runtime Model](/projects/model-memory/specs/graph-derived-runtime-model)
29. [Subject Capsules And Dense Ingestion](/projects/model-memory/specs/subject-capsules-and-dense-ingestion)
30. [Proactive Memory Planner](/projects/model-memory/specs/proactive-memory-planner)
31. [Skill And Tool Synthesis](/projects/model-memory/specs/skill-and-tool-synthesis)
32. [Cache And Projection Policy](/projects/model-memory/specs/cache-and-projection-policy)
33. [Kind Primary Schema Migration](/projects/model-memory/specs/kind-primary-schema-migration)
34. [Graph Schema And Runtime Dependencies](/projects/model-memory/specs/graph-schema-and-runtime-dependencies)
35. [Project State Capsule Schema](/projects/model-memory/specs/project-state-capsule-schema)
36. [Planner Review Artifacts And Surfacing](/projects/model-memory/specs/planner-review-artifacts-and-surfacing)
37. [Skill And Tool Candidate Evaluation](/projects/model-memory/specs/skill-and-tool-candidate-evaluation)
38. [Prompt Contract Phase 2 Migration](/projects/model-memory/specs/prompt-contract-phase2-migration)
39. [Phase 2 Execution Roadmap](/projects/model-memory/phase-2-execution-roadmap)
40. [Deep Ingest Interruption Root Cause](/projects/model-memory/deep-ingest-interruption-root-cause)

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
- deep substrate population and the upcoming human soak flow through the
  canonical ingest, verification, and prompt-set docs
- a bundled operator skill now exists for the canonical deep ingest flow:
  - `skills/model-memory-deep-ingest/SKILL.md`
- first-cut user-transparent arbitration between long-document reads and
  background document ingest for repeated or capped workspace text reads
- the next conceptual planning pack now exists for post-soak Phase 2 design:
  - graph-derived runtime model
  - subject capsules and dense ingestion
  - proactive planner
  - skill and tool synthesis
  - cache and projection policy
- the reviewed implementation order now exists in:
  - [Phase 2 Execution Roadmap](/projects/model-memory/phase-2-execution-roadmap)
- the original Main-run interruption record now exists in:
  - [Deep Ingest Interruption Root Cause](/projects/model-memory/deep-ingest-interruption-root-cause)
