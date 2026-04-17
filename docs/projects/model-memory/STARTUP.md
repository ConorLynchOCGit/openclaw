---
summary: "Fast-start reading path for the model-memory workspace."
title: "Model Memory Startup"
---

# Model Memory Startup

Read these first when resuming work on `model-memory`.

## First-pass read order

1. [Model Memory](/projects/model-memory)
2. [Status](/projects/model-memory/STATUS)
3. [Current Slice](/projects/model-memory/CURRENT_SLICE)
4. [Roadmap](/projects/model-memory/roadmap)
5. [Decisions](/projects/model-memory/DECISIONS)

## Operational cutover surfaces

Use these next when the work touches live runtime or follow-through after the
cutover:

1. [Cutover Thesis](/projects/model-memory/cutover-thesis)
2. [Cutover Plan](/projects/model-memory/cutover-plan)
3. [Cutover Checklist](/projects/model-memory/cutover-checklist)
4. [72 Hour Watch](/projects/model-memory/cutover-72h-watch)
5. [Model Memory Ops Reporting Lane](/projects/model-memory/ops-reporting-lane)

## Architecture and projection surfaces

Use these when the work touches projections, context assembly, or durable versus
generated ownership:

1. [Spec Index](/projects/model-memory/specs)
2. [Workspace Projections Bootstrap Files](/projects/model-memory/specs/workspace-projections-bootstrap-files)
3. [Bootstrap Input Audit](/projects/model-memory/bootstrap-input-audit)
4. [Graph Derived Runtime Model](/projects/model-memory/specs/graph-derived-runtime-model)
5. [Subject Capsules And Dense Ingestion](/projects/model-memory/specs/subject-capsules-and-dense-ingestion)
6. [Proactive Memory Planner](/projects/model-memory/specs/proactive-memory-planner)
7. [Skill And Tool Synthesis](/projects/model-memory/specs/skill-and-tool-synthesis)
8. [Cache And Projection Policy](/projects/model-memory/specs/cache-and-projection-policy)
9. [Kind Primary Schema Migration](/projects/model-memory/specs/kind-primary-schema-migration)
10. [Project State Capsule Schema](/projects/model-memory/specs/project-state-capsule-schema)
11. [Planner Review Artifacts And Surfacing](/projects/model-memory/specs/planner-review-artifacts-and-surfacing)
12. [Skill And Tool Candidate Evaluation](/projects/model-memory/specs/skill-and-tool-candidate-evaluation)
13. [Prompt Contract Phase 2 Migration](/projects/model-memory/specs/prompt-contract-phase2-migration)
14. [Phase 2 Execution Roadmap](/projects/model-memory/phase-2-execution-roadmap)

## Ingest and hardening surfaces

Use these when the work touches deep corpus population, interruption analysis,
or operator run/resume behavior:

1. [Deep Document Ingest Runbook](/projects/model-memory/deep-document-ingest-runbook)
2. [Deep Ingest Verification Plan](/projects/model-memory/deep-ingest-verification-plan)
3. [Deep Ingest Interruption Root Cause](/projects/model-memory/deep-ingest-interruption-root-cause)

## Current operating posture

- `model-memory` is already on the live path
- rollback is native no-memory mode
- remaining work is stabilization, observability, follow-up fixes, and legacy
  retirement
- the first-pass Phase 2 conceptual spec pack now exists and should be read
  before any graph, capsule, proactive-planner, or self-improvement
  implementation work begins
