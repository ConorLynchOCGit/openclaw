---
summary: "Current slice for model-memory."
title: "Model Memory Current Slice"
---

# Current Slice

## Slice

`post-cutover-72-hour-stabilization`

## Goal

Run the first 72 hours after the aggressive full cutover from the legacy memory
stack to `model-memory`:

- `model-memory` becomes the primary memory authority
- rollback goes to native no-memory behavior, not back to the legacy stack
- observability and sampled review become the main safety controls
- legacy memory retirement is explicit and time-bounded

## Current outcome

- the production flip has been executed:
  - `model-memory` live runtime enabled
  - database configured
  - `plugins.slots.memory = "none"`
  - `agents.defaults.memorySearch.enabled = false`
- the gateway/runtime has been rebuilt and restarted on the live path
- status now reports:
  - `Model memory = enabled`
  - `legacy slot = off`
  - `legacy search = off`
- the 72-hour operational surfaces now live in:
  - [Cutover Plan](/projects/model-memory/cutover-plan)
  - [Cutover Checklist](/projects/model-memory/cutover-checklist)
  - [72 Hour Watch](/projects/model-memory/cutover-72h-watch)
  - [Cutover Day 0 Verification](/projects/model-memory/evidence/post-cutover/day-0-cutover-verification)
- the next operator-facing readiness package now exists:
  - [Deep Document Ingest Targets 2026-04](/projects/model-memory/document-ingest-targets-2026-04-deep-pass)
  - [Deep Document Ingest Runbook](/projects/model-memory/deep-document-ingest-runbook)
  - [Deep Ingest Verification Plan](/projects/model-memory/deep-ingest-verification-plan)
  - [Deep Memory Soak Human Tests](/projects/model-memory/deep-memory-soak-human-tests)
  - bundled operator skill:
    - `skills/model-memory-deep-ingest/SKILL.md`
- the first-cut read-versus-ingest dedupe seam is now implemented:
  - [Document Read And Ingest Arbitration](/projects/model-memory/specs/document-read-and-ingest-arbitration)
  - host-side workspace text reads now auto-schedule deduped ingest only for
    capped, continued, or repeated reads
- the first-pass Phase 2 conceptual spec pack now exists for review before
  execution:
  - [Graph Derived Runtime Model](/projects/model-memory/specs/graph-derived-runtime-model)
  - [Subject Capsules And Dense Ingestion](/projects/model-memory/specs/subject-capsules-and-dense-ingestion)
  - [Proactive Memory Planner](/projects/model-memory/specs/proactive-memory-planner)
  - [Skill And Tool Synthesis](/projects/model-memory/specs/skill-and-tool-synthesis)
  - [Cache And Projection Policy](/projects/model-memory/specs/cache-and-projection-policy)
  - companion specs:
    - [Kind Primary Schema Migration](/projects/model-memory/specs/kind-primary-schema-migration)
    - [Graph Schema And Runtime Dependencies](/projects/model-memory/specs/graph-schema-and-runtime-dependencies)
    - [Project State Capsule Schema](/projects/model-memory/specs/project-state-capsule-schema)
    - [Planner Review Artifacts And Surfacing](/projects/model-memory/specs/planner-review-artifacts-and-surfacing)
    - [Skill And Tool Candidate Evaluation](/projects/model-memory/specs/skill-and-tool-candidate-evaluation)
    - [Prompt Contract Phase 2 Migration](/projects/model-memory/specs/prompt-contract-phase2-migration)
  - first-pass schema posture:
    - `kind` primary
    - `canonicalClass` secondary or derived
  - first capsule flavor:
    - `project_state`
  - review surfacing posture:
    - turn when contextually relevant
    - heartbeat
    - daily operator review
    - explicit three-lane surfacing:
      - `must_surface`
      - `context_surface`
      - `background_only`
  - security rollout posture:
    - metadata specified now
    - strong enforcement delayed to a second pass after base-system testing
- the reviewed execution order is now recorded in:
  - [Phase 2 Execution Roadmap](/projects/model-memory/phase-2-execution-roadmap)
- the original Main-run deep ingest interruption is now recorded in:
  - [Deep Ingest Interruption Root Cause](/projects/model-memory/deep-ingest-interruption-root-cause)
- the current ingest hardening posture is:
  - derived-runtime rebuilds must serialize across interactive capture and
    batch ingest
  - interrupted ingest runs must persist truthful checkpoint state and run-level
    error metadata

## Current judgment

- current project judgment:
  - `production_cutover_flip_executed`
- this is now an operating judgment:
  - the live runtime is on `model-memory`
  - the next step is the active 72-hour watch plus the deep ingest and human
    soak verification flow
  - parallel to that operational work, the next architectural review lane is
    the Phase 2 spec pack above
  - the next topology hardening item immediately after the deep ingest pass is:
    - [Canonical Path Resolution And Runtime Arbitration](/projects/workspace-topology/specs/canonical-path-resolution-and-runtime-arbitration)
  - read-versus-ingest overlap is now narrowed by runtime arbitration instead
    of leaving both tools fully independent
