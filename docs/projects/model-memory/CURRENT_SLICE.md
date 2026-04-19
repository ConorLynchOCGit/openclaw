---
summary: "Current slice for model-memory."
title: "Model Memory Current Slice"
---

# Current Slice

## Slice

`packet-compiler-kind-balance-and-retirement-execution`

## Goal

Turn the successful `MEMORY.md` packet experiments into one shared packet
compiler design, and make packet quality plus kind-primary/kind-balance the top
memory priority before broader Phase 2 implementation.

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
- the next implementation priority is now explicit:
  - [Packet Compiler And Budgeting](/projects/model-memory/specs/packet-compiler-and-budgeting)
  - packet-system rollout across bootstrap, dynamic packs, and retrieval packs
  - `kind`-primary prompt and schema migration
  - investigation and repair of missing active `rule` generation
  - proof tracking in:
    - [Packet And Kind Balance Proof Pack](/projects/model-memory/packet-and-kind-balance-proof-pack)
  - retained evidence and bounded residue tracking in:
    - [Model Memory Evidence](/projects/model-memory/evidence)
    - [Memory Residue Audit](/projects/model-memory/memory-residue-audit)
- the retirement-execution boundary is now explicit:
  - [Legacy Memory Retirement Execution](/projects/model-memory/legacy-memory-retirement-execution)
  - [Continuity Preservation And Retirement](/projects/model-memory/continuity-preservation-and-retirement)
  - [USER.md And Projected Context Contract](/projects/model-memory/user-md-and-projected-context-contract)
  - [Legacy Continuity Export And Ingest](/projects/model-memory/legacy-continuity-export-and-ingest)
  - [Legacy Retirement Proof](/projects/model-memory/final-legacy-retirement-proof)
- the first execution cuts in that retirement tranche are now complete:
  - bundled `session-memory` hook restored and retained as continuity
    production
  - canonical daily-note generation repaired so the hook now writes
    `memory/YYYY-MM-DD.md` again
  - direct hook docs/tests restored and authority wording corrected
  - gateway startup no longer arms legacy QMD/plugin memory
  - top-level memory concept and CLI docs now point at model-memory as the live
    authority
  - exact repair record:
    - [Daily Memory Grounding Repair](/projects/model-memory/daily-memory-grounding-repair)
    - [Daily Continuity Health](/projects/model-memory/daily-continuity-health)
- the bootstrap-memory ownership split is now explicit and landed:
  - curated `MEMORY.md` is again a human-owned durable memory surface
  - generated recall/pointer scaffolding is no longer materialized back into
    curated `MEMORY.md`
  - compiled `memory-md` bootstrap semantics are restored through a separate
    generated artifact path under `.openclaw/model-memory/projections/*`
  - current-run bootstrap resolution now overlays canonicalized files over any
    stale session snapshot by filename
- the first MMV2 document-only corpus-evaluation lane is now the active proving
  surface for ingestion-v2 draft work:
  - corpus contract:
    - `extensions/model-memory/src/mmv2/proof-corpus.ts`
  - phase-aware proof runner:
    - `extensions/model-memory/src/mmv2/proof-runner.ts`
  - disposable report script:
    - `scripts/run-mmv2-document-corpus.mjs`
  - artifact output root:
    - `.artifacts/model-memory/mmv2/`
  - current proof boundary:
    - seeded-neighbor reconciliation covered
    - ordinary-turn MMV2 still out of scope
    - live DB writes still out of scope
- the original Main-run deep ingest interruption is now recorded in:
  - [Deep Ingest Interruption Root Cause](/projects/model-memory/deep-ingest-interruption-root-cause)
- the current ingest hardening posture is:
  - derived-runtime rebuilds must serialize across interactive capture and
    batch ingest
  - interrupted ingest runs must persist truthful checkpoint state and run-level
    error metadata
- the current rule-vs-fact benchmark tranche is now recorded in:
  - [Document Ingest Pipeline Walkthrough](/projects/model-memory/document-ingest-pipeline-walkthrough)
  - [Representative Corpus Rule Vs Fact Benchmark](/projects/model-memory/representative-corpus-rule-vs-fact-benchmark)
  - [Rule Vs Fact Benchmark Scorecard](/projects/model-memory/rule-vs-fact-benchmark-scorecard)
  - [Rule Vs Fact Variant Design](/projects/model-memory/rule-vs-fact-variant-design)
  - [Rule Vs Fact Benchmark Findings](/projects/model-memory/rule-vs-fact-benchmark-findings)
  - [Rule Vs Fact Next Change Recommendation](/projects/model-memory/rule-vs-fact-next-change-recommendation)
- current benchmark judgment:
  - pass-1 candidate extraction was the first production seam to change
  - the prompt-first production change is now shipped
  - prompt-only simplification beat the schema-plus-prompt experimental variant
  - collision/write simplification is not the first move on this corpus
  - the next narrow seam is pass-2 canonicalization review
  - current re-entry handoff lives in:
    - [Memory Build Status And Next Steps](/projects/model-memory/memory-build-status-and-next-steps)

## Current judgment

- current project judgment:
  - `production_cutover_live_with_packet-quality-priority`
- the live runtime remains on `model-memory`
- live runtime authority is proven; full repo-side deletion of `memory-core` /
  `memorySearch` seams is still a blocker set, not a completed fact
- operational soak and ingest work continues, but the next architecture slice
  is no longer vague:
  - unify packet assembly
  - improve packet quality at build time rather than trimming late
  - migrate toward `kind` primary
  - repair kind balance so packets do not reflect a distorted corpus
  - begin with prompt-contract simplification before schema surgery
  - review pass-2 canonicalization before any broader schema rewrite
