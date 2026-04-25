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
That clean-room boundary remains, and the repo has now completed the
MMV2-native storage cutover plus the first post-cutover hot-path cleanup.

Current status:

- MMV2-native SQL storage is live semantic truth:
  - `model_memory.ingest_sources`
  - `model_memory.ingest_segments`
  - `model_memory.durable_memories`
  - `model_memory.memory_events`
  - `model_memory.memory_edges`
- active live write hot paths persist MMV2 live memory batches by default
- active rebuild/read hot paths consume MMV2 durable truth through native
  runtime records by default
- the canonical Phase-2 blocker list is now
  [Pre-Phase-2 Gate Ledger](/projects/model-memory/pre-phase-2-gate-ledger)
- Phase 2 is authorized, and the 2026-04-25 feature-bucket/spec decision lock
  is the current planning authority before implementation slicing
- legacy five-kind canonical storage is retired from active truth
- legacy-shaped write/read compatibility remains soak-window fallback only
- old v1 and pre-MMV2 cutover docs are historical design provenance, not
  current live authority
- next work is implementation slicing for the locked Phase 2 buckets

## Project docs

1. [Pre-Phase-2 Gate Ledger](/projects/model-memory/pre-phase-2-gate-ledger)
2. [Roadmap](/projects/model-memory/roadmap)
3. [Status](/projects/model-memory/STATUS)
4. [Decisions](/projects/model-memory/DECISIONS)
5. [Current Slice](/projects/model-memory/CURRENT_SLICE)
6. [Cutover Thesis](/projects/model-memory/cutover-thesis)
7. [Spec Index](/projects/model-memory/specs)
8. [Spec Closure Review](/projects/model-memory/SPEC_CLOSURE_REVIEW)
9. [Build Plan](/projects/model-memory/build-plan)
10. [Proof Corpus Plan](/projects/model-memory/proof-corpus-plan)
11. [Large Document Ingestion Inventory](/projects/model-memory/document-ingestion-inventory)
12. [Implementation Guardrails](/projects/model-memory/implementation-guardrails)
13. [Validation Loop](/projects/model-memory/validation-loop)
14. [Implementation Slices 1 Through 5 Checklist](/projects/model-memory/implementation-slices-1-5-checklist)
15. [Bootstrap Input Audit](/projects/model-memory/bootstrap-input-audit)
16. [Cutover And Retirement Plan](/projects/model-memory/cutover-retirement-plan)
17. [Cutover Plan](/projects/model-memory/cutover-plan)
18. [Cutover Checklist](/projects/model-memory/cutover-checklist)
19. [72 Hour Watch](/projects/model-memory/cutover-72h-watch)
20. [VPS Consolidation And Test Diagnostic](/projects/model-memory/vps-consolidation-and-test-diagnostic)
21. [VPS Runtime Consolidation Plan](/projects/model-memory/vps-runtime-consolidation-plan)
22. [VPS PNPM And Build Optimization Plan](/projects/model-memory/vps-pnpm-turbo-optimization-plan)
23. [Model Memory Ops Reporting Lane](/projects/model-memory/ops-reporting-lane)
24. [Document Read And Ingest Arbitration](/projects/model-memory/specs/document-read-and-ingest-arbitration)
25. [Deep Document Ingest Targets 2026-04](/projects/model-memory/document-ingest-targets-2026-04-deep-pass)
26. [Deep Document Ingest Runbook](/projects/model-memory/deep-document-ingest-runbook)
27. [Deep Ingest Verification Plan](/projects/model-memory/deep-ingest-verification-plan)
28. [Deep Memory Soak Human Tests](/projects/model-memory/deep-memory-soak-human-tests)
29. [Soft-Source Ingestion And Authority](/projects/model-memory/specs/soft-source-ingestion-and-authority)
30. [Memory Maintenance Loop](/projects/model-memory/specs/memory-maintenance-loop)
31. [Graph Derived Runtime Model](/projects/model-memory/specs/graph-derived-runtime-model)
32. [Subject Capsules And Dense Ingestion](/projects/model-memory/specs/subject-capsules-and-dense-ingestion)
33. [Proactive Memory Planner](/projects/model-memory/specs/proactive-memory-planner)
34. [Skill And Tool Synthesis](/projects/model-memory/specs/skill-and-tool-synthesis)
35. [Cache And Projection Policy](/projects/model-memory/specs/cache-and-projection-policy)
36. [Kind Primary Schema Migration](/projects/model-memory/specs/kind-primary-schema-migration)
37. [Graph Schema And Runtime Dependencies](/projects/model-memory/specs/graph-schema-and-runtime-dependencies)
38. [Project State Capsule Schema](/projects/model-memory/specs/project-state-capsule-schema)
39. [Planner Review Artifacts And Surfacing](/projects/model-memory/specs/planner-review-artifacts-and-surfacing)
40. [Skill And Tool Candidate Evaluation](/projects/model-memory/specs/skill-and-tool-candidate-evaluation)
41. [Prompt Contract Phase 2 Migration](/projects/model-memory/specs/prompt-contract-phase2-migration)
42. [Second-Pass Privacy And Prompt-Injection Hardening](/projects/model-memory/specs/second-pass-privacy-prompt-injection-hardening)
43. [Phase 2 Execution Roadmap](/projects/model-memory/phase-2-execution-roadmap)
44. [Deep Ingest Interruption Root Cause](/projects/model-memory/deep-ingest-interruption-root-cause)
45. [Model Driven Packet Assembly Evaluation](/projects/model-memory/specs/model-driven-packet-assembly-evaluation)
46. [Packet Compiler And Budgeting](/projects/model-memory/specs/packet-compiler-and-budgeting)
47. [Memory Capture Seams](/projects/model-memory/specs/memory-capture-seams)
48. [Memory Ops Closed Loop](/projects/model-memory/specs/memory-ops-closed-loop)
49. [Memory Retrieval Runtime](/projects/model-memory/specs/memory-retrieval-runtime)
50. [Packet And Kind Balance Proof Pack](/projects/model-memory/packet-and-kind-balance-proof-pack)
51. [Model Memory Evidence](/projects/model-memory/evidence)
52. [Memory Residue Audit](/projects/model-memory/memory-residue-audit)
53. [Legacy Memory Retirement Execution](/projects/model-memory/legacy-memory-retirement-execution)
54. [Continuity Preservation And Retirement](/projects/model-memory/continuity-preservation-and-retirement)
55. [USER.md And Projected Context Contract](/projects/model-memory/user-md-and-projected-context-contract)
56. [Legacy Continuity Export And Ingest](/projects/model-memory/legacy-continuity-export-and-ingest)
57. [Legacy Retirement Proof](/projects/model-memory/final-legacy-retirement-proof)
58. [Document Ingest Pipeline Walkthrough](/projects/model-memory/document-ingest-pipeline-walkthrough)
59. [Representative Corpus Rule Vs Fact Benchmark](/projects/model-memory/representative-corpus-rule-vs-fact-benchmark)
60. [Rule Vs Fact Benchmark Scorecard](/projects/model-memory/rule-vs-fact-benchmark-scorecard)
61. [Rule Vs Fact Variant Design](/projects/model-memory/rule-vs-fact-variant-design)
62. [Rule Vs Fact Benchmark Findings](/projects/model-memory/rule-vs-fact-benchmark-findings)
63. [Rule Vs Fact Next Change Recommendation](/projects/model-memory/rule-vs-fact-next-change-recommendation)
64. [Memory Build Status And Next Steps](/projects/model-memory/memory-build-status-and-next-steps)
65. [Daily Memory Grounding Repair](/projects/model-memory/daily-memory-grounding-repair)
66. [Daily Continuity Health](/projects/model-memory/daily-continuity-health)
67. [Memory Bootstrap Ownership Split Baseline 2026-04](/projects/model-memory/memory-bootstrap-ownership-split-baseline-2026-04)
68. [Memory Bootstrap Ownership Contract](/projects/model-memory/memory-bootstrap-ownership-contract)
69. [MEMORY.md Bootstrap Review 2026-04](/projects/model-memory/memory-md-bootstrap-review-2026-04)
70. [Memory Bootstrap Semantics Restoration Baseline 2026-04](/projects/model-memory/memory-bootstrap-semantics-restoration-baseline-2026-04)
71. [Memory Bootstrap Semantics Contract](/projects/model-memory/memory-bootstrap-semantics-contract)
72. [MMV2 Ingestion Specs](/projects/model-memory/specs/mmv2)
73. [MMV2 First Execution Sprint Checklist](/projects/model-memory/mmv2-first-execution-sprint-checklist)
74. [MMV2 Corpus Evaluation Baseline 2026-04](/projects/model-memory/mmv2-corpus-evaluation-baseline-2026-04)
75. [MMV2 Real Model Eval Baseline 2026-04](/projects/model-memory/mmv2-real-model-eval-baseline-2026-04)

## Scope

Initial implementation scope:

- document ingestion
- ordinary-turn user capture
- standalone runtime with optional shadow mode
- same Supabase/Postgres server, new logical database
- runtime read-model, projection, context-engine, and usage/cache architecture specified before implementation

Current operational scope:

- soak-window observation of MMV2-native storage and hot paths
- quarantine/removal planning for fallback compatibility
- ordinary-turn MMV2 evaluation coverage
- file-pack/provider variance stabilization
- capture seam expansion planning and implementation
- closed-loop memory ops instrumentation planning and implementation
- Memory Retrieval Runtime replacement for fresh-session recall, memory packs,
  projection digests, source weighting, and direct retrieval telemetry
- deep substrate population through the canonical ingest, verification, and
  prompt-set docs
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
- immediate memory priorities before broader Phase 2 derived features are now:
  - implement Memory Retrieval Runtime
  - rerun the clean soak with direct retrieval telemetry
  - finish fallback compatibility quarantine/removal after clean retrieval soak
  - update ordinary-turn MMV2 evaluation coverage
  - stabilize file-pack/provider variance
  - implement primary capture seams
  - implement closed-loop memory ops instrumentation
- the reviewed implementation order now exists in:
  - [Phase 2 Execution Roadmap](/projects/model-memory/phase-2-execution-roadmap)
- the current Phase 2 decision-lock specs now include:
  - [Soft-Source Ingestion And Authority](/projects/model-memory/specs/soft-source-ingestion-and-authority)
  - [Memory Maintenance Loop](/projects/model-memory/specs/memory-maintenance-loop)
- the original Main-run interruption record now exists in:
  - [Deep Ingest Interruption Root Cause](/projects/model-memory/deep-ingest-interruption-root-cause)
- the current packet and kind-balance proof obligations now live in:
  - [Packet And Kind Balance Proof Pack](/projects/model-memory/packet-and-kind-balance-proof-pack)
- the current rule-vs-fact benchmark lane now lives in:
  - [Document Ingest Pipeline Walkthrough](/projects/model-memory/document-ingest-pipeline-walkthrough)
  - [Representative Corpus Rule Vs Fact Benchmark](/projects/model-memory/representative-corpus-rule-vs-fact-benchmark)
  - [Rule Vs Fact Benchmark Scorecard](/projects/model-memory/rule-vs-fact-benchmark-scorecard)
  - [Rule Vs Fact Variant Design](/projects/model-memory/rule-vs-fact-variant-design)
  - [Rule Vs Fact Benchmark Findings](/projects/model-memory/rule-vs-fact-benchmark-findings)
  - [Rule Vs Fact Next Change Recommendation](/projects/model-memory/rule-vs-fact-next-change-recommendation)
  - [Memory Build Status And Next Steps](/projects/model-memory/memory-build-status-and-next-steps)
- retained evidence for the packet-quality lane is now normalized in:
  - [Model Memory Evidence](/projects/model-memory/evidence)
- the current residue/debt boundary is now recorded in:
  - [Memory Residue Audit](/projects/model-memory/memory-residue-audit)
- the current retirement-execution and continuity-preservation record now live in:
  - [Legacy Memory Retirement Execution](/projects/model-memory/legacy-memory-retirement-execution)
  - [Continuity Preservation And Retirement](/projects/model-memory/continuity-preservation-and-retirement)
  - [USER.md And Projected Context Contract](/projects/model-memory/user-md-and-projected-context-contract)
  - [Legacy Continuity Export And Ingest](/projects/model-memory/legacy-continuity-export-and-ingest)
  - [Legacy Retirement Proof](/projects/model-memory/final-legacy-retirement-proof)
  - [Daily Memory Grounding Repair](/projects/model-memory/daily-memory-grounding-repair)
  - [Daily Continuity Health](/projects/model-memory/daily-continuity-health)
- the current bootstrap-memory ownership split for curated `MEMORY.md` now
  lives in:
  - [Memory Bootstrap Ownership Split Baseline 2026-04](/projects/model-memory/memory-bootstrap-ownership-split-baseline-2026-04)
  - [Memory Bootstrap Ownership Contract](/projects/model-memory/memory-bootstrap-ownership-contract)
  - [MEMORY.md Bootstrap Review 2026-04](/projects/model-memory/memory-md-bootstrap-review-2026-04)
- the follow-on bootstrap-semantics restoration for `memory-md` now lives in:
  - [Memory Bootstrap Semantics Restoration Baseline 2026-04](/projects/model-memory/memory-bootstrap-semantics-restoration-baseline-2026-04)
  - [Memory Bootstrap Semantics Contract](/projects/model-memory/memory-bootstrap-semantics-contract)
- the MMV2 evaluation lane now remains separate from live persistence:
  - corpus contract:
    - `extensions/model-memory/src/mmv2/proof-corpus.ts`
  - scripted phase-aware runner:
    - `extensions/model-memory/src/mmv2/proof-runner.ts`
  - real-model phase-aware runner:
    - `extensions/model-memory/src/mmv2/proof-runner-real.ts`
  - write-realism simulation:
    - `extensions/model-memory/src/mmv2/write-simulation.ts`
  - failed-case adjudication surface:
    - `extensions/model-memory/src/mmv2/adjudication.ts`
  - disposable script/report entrypoint:
    - `scripts/run-mmv2-document-corpus.mjs`
  - disposable artifacts:
    - `.artifacts/model-memory/mmv2/`
  - current scoring split:
    - phase correctness
    - write-policy realism
  - ordinary-turn MMV2 evaluation coverage is a near-term roadmap item
  - live DB writes from proof/file-pack artifacts remain prohibited
