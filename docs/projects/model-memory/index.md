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
- the first repo-side retirement cuts are now also done:
  - bundled `session-memory` hook retained as continuity-producing automation
  - startup fallback to legacy QMD/plugin memory removed
  - legacy top-level memory docs rewritten away from canonical status
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
41. [Model Driven Packet Assembly Evaluation](/projects/model-memory/specs/model-driven-packet-assembly-evaluation)
42. [Packet Compiler And Budgeting](/projects/model-memory/specs/packet-compiler-and-budgeting)
43. [Packet And Kind Balance Proof Pack](/projects/model-memory/packet-and-kind-balance-proof-pack)
44. [Model Memory Evidence](/projects/model-memory/evidence)
45. [Memory Residue Audit](/projects/model-memory/memory-residue-audit)
46. [Legacy Memory Retirement Execution](/projects/model-memory/legacy-memory-retirement-execution)
47. [Continuity Preservation And Retirement](/projects/model-memory/continuity-preservation-and-retirement)
48. [USER.md And Projected Context Contract](/projects/model-memory/user-md-and-projected-context-contract)
49. [Legacy Continuity Export And Ingest](/projects/model-memory/legacy-continuity-export-and-ingest)
50. [Legacy Retirement Proof](/projects/model-memory/final-legacy-retirement-proof)
51. [Document Ingest Pipeline Walkthrough](/projects/model-memory/document-ingest-pipeline-walkthrough)
52. [Representative Corpus Rule Vs Fact Benchmark](/projects/model-memory/representative-corpus-rule-vs-fact-benchmark)
53. [Rule Vs Fact Benchmark Scorecard](/projects/model-memory/rule-vs-fact-benchmark-scorecard)
54. [Rule Vs Fact Variant Design](/projects/model-memory/rule-vs-fact-variant-design)
55. [Rule Vs Fact Benchmark Findings](/projects/model-memory/rule-vs-fact-benchmark-findings)
56. [Rule Vs Fact Next Change Recommendation](/projects/model-memory/rule-vs-fact-next-change-recommendation)
57. [Memory Build Status And Next Steps](/projects/model-memory/memory-build-status-and-next-steps)
58. [Daily Memory Grounding Repair](/projects/model-memory/daily-memory-grounding-repair)
59. [Daily Continuity Health](/projects/model-memory/daily-continuity-health)
60. [Memory Bootstrap Ownership Split Baseline 2026-04](/projects/model-memory/memory-bootstrap-ownership-split-baseline-2026-04)
61. [Memory Bootstrap Ownership Contract](/projects/model-memory/memory-bootstrap-ownership-contract)
62. [MEMORY.md Bootstrap Review 2026-04](/projects/model-memory/memory-md-bootstrap-review-2026-04)
63. [Memory Bootstrap Semantics Restoration Baseline 2026-04](/projects/model-memory/memory-bootstrap-semantics-restoration-baseline-2026-04)
64. [Memory Bootstrap Semantics Contract](/projects/model-memory/memory-bootstrap-semantics-contract)
65. [MMV2 Ingestion Draft Specs](/projects/model-memory/specs/mmv2)
66. [MMV2 First Execution Sprint Checklist](/projects/model-memory/mmv2-first-execution-sprint-checklist)

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
- the immediate memory priority before those broader waves is now:
  - packet compiler quality and packet-system unification
  - `kind`-primary migration
  - kind-balance repair, especially the missing active `rule` problem
- the reviewed implementation order now exists in:
  - [Phase 2 Execution Roadmap](/projects/model-memory/phase-2-execution-roadmap)
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
