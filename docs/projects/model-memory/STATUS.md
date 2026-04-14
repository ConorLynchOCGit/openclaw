---
summary: "Current implementation status for model-memory."
title: "Model Memory Status"
---

# Model Memory Status

## Overall

State: `implementation`

The clean-room parallel package now exists at `extensions/model-memory/` with implementation slices 1 through 15 completed on fast lanes. The system is still standalone and not cut over, but the package now covers executable schema migrations, database-backed repositories, model-execution boundaries, live document and ordinary-turn ingestion services, deterministic rebuild orchestration, harness-facing projection/context integration, and observational shadow/inspection/calibration/readiness surfaces.

The live database lane is now materially complete for the current package
scope:

- the logical database `model_memory` now exists on the shared
  Supabase/Postgres server
- `extensions/model-memory/migrations/0001_model_memory_init.sql` has been
  applied there
- both canonical `model_memory` tables and derived `runtime_context` tables
  are present on that logical database

## Completed

- canonical project docs area chosen: `docs/projects/model-memory/`
- central docs index will link to `/projects`
- project index, roadmap, status, decisions, current slice, and spec index created
- pre-implementation pack created:
  - spec closure review
  - build plan
  - detailed database schema doc
  - proof corpus plan
  - implementation guardrails
  - validation loop
  - slices 1 through 5 execution checklist
  - bootstrap input audit
- legacy cutover and retirement planning now specified
- retrieval and context-injection design now specified at the architecture level
- four-pillar runtime architecture now specified:
  - harness
  - context engine
  - memory layer
  - usage/cache layer
- v1 scope locked:
  - document ingestion
  - ordinary-turn user capture
  - standalone runtime
  - optional shadow mode later
- database boundary locked:
  - same Postgres/Supabase server
  - new logical database
- ontology direction locked:
  - canonical classes: `user`, `feedback`, `project`, `reference`
  - internal kinds: `preference`, `fact`, `rule`, `procedure`, `reference`
- schema tightening locked:
  - `ruleSubtype` removed from v1
  - `rationaleCodes` retained only as optional audit metadata
- projection/runtime-layer direction locked:
  - runtime read models are derived, not semantic truth
  - generated bootstrap files are downstream consumers
  - usage/cache ledger stores counters plus segment hashes
- merge policy direction locked:
  - bounded semantic equivalence allowed in proof
  - deterministic normalized identity required on writes
  - no fuzzy merge in live write path for v1
- slices 1 through 5 implemented and validated:
  - semantic schema and validator
  - prompt-contract and storage contracts
  - document source adapter and ingestion flow
  - ordinary-turn source adapter and capture flow
  - deterministic identity, dedupe, supersession, and write policy
  - derived runtime read models and context artifacts
- slices 6 through 10 implemented and validated:
  - deterministic projection compiler and generated-zone file ownership
  - no-retrieval context engine plus usage/cache ledger
  - reusable audited proof runner and object-native benchmark harness
  - model-owned retrieval request interpretation with deterministic object-native retrieval
  - retrieval packs as derived context artifacts
  - observational-only shadow mode and runtime comparison reporting
- slices 11 through 15 implemented and validated:
  - executable `model_memory` and `runtime_context` SQL migrations
  - database-backed canonical and runtime-context repositories
  - database-backed write and retrieval stores for live paths
  - provider-agnostic real model execution boundaries for extraction and retrieval-request interpretation
  - live document and ordinary-turn ingestion services wired through persistence
  - deterministic rebuild orchestration for slots, sets, context artifacts, and projection versions
  - harness-facing integration for bootstrap projections, context assembly, retrieval-pack gating, and usage normalization
  - live shadow adapters for document and ordinary-turn surfaces
  - operator inspection, calibration reporting, and readiness-gate evaluation
- pre-cutover large-document ingestion inventory created for the next
  operational evidence phase
- Tier 1 large-document evidence rerun executed on 2026-04-14 through the live
  database-backed path with explicit small-model extraction:
  [Large Document Tier 1 Evidence](/projects/model-memory/evidence/large-document-tier1)
- the evidence lane now defaults to `openrouter/openai/gpt-5.4-nano`
  instead of `openrouter/auto`
- all six Tier 1 documents were executed in the declared order on the explicit
  small model
- the most recent rerun materially improved structural validity again:
  - all six Tier 1 documents now persist canonical objects with structured
    provenance
  - the structural reject set for the remaining four documents was cleared by
    prompt-contract tightening plus a one-shot model-owned structural repair
    pass
- the new blocker is now semantic stability and proof admission quality:
  - every Tier 1 document still produced new writes on rerun instead of clean
    duplicate collapse
  - bootstrap-sensitive and proof-contamination-sensitive sources still
    over-capture content that is not automatically admissible into audited proof
- no large real-source cases are admitted into the audited proof set yet
  because rerun instability and source sensitivity still block honest
  adjudication
- a seeded representative pass-1 model comparison was then executed on
  2026-04-14 against:
  - `docs/help/testing.md`
  - `docs/gateway/protocol.md`
  - control lane:
    - pass 1 = `openrouter/openai/gpt-5.4-nano`
    - pass 2 = `openrouter/openai/gpt-5.4-nano`
  - comparison lane:
    - pass 1 = `openrouter/openai/gpt-5-mini`
    - pass 2 = `openrouter/openai/gpt-5.4-nano`
  - fixed request seed = `7`
  - evidence artifact:
    [Representative Pass-1 Model Comparison](/projects/model-memory/evidence/representative-pass1-model-comparison-seed7)
- that representative comparison materially clarified the current blocker:
  - pass-1-on-mini reduced coarse instability versus nano:
    - `docs/help/testing.md` held capture count at `9 / 9` instead of
      `9 / 7`
    - `docs/gateway/protocol.md` avoided the nano reject path and held at
      `9 / 8` instead of `0 / 6`
  - however, candidate-set stability did not recover:
    - same-seed candidate overlap remained near zero on both representative
      documents
    - canonicalization still drifted because unstable candidate sets continued
      to feed pass 2
- no broader Tier 1 rerun was justified by that comparison sprint
- no real-source proof admissions were justified by that comparison sprint
- repo-wide type lane blocker drift encountered during implementation was cleared in:
  - `extensions/llm-task/src/llm-task-tool.ts`
  - `src/tui/tui-session-actions.test.ts`

## In progress

- no implementation slice is currently open
- the active operational phase is pre-cutover evidence gathering:
  - large-document candidate-layer determinism repair after structural validity
    recovery
  - pass-1 model isolation completed; the lane is still blocked even after a
    bounded mini comparison
  - proof-corpus expansion only after real large-source cases become
    admissible
  - bootstrap-surface ingestion validation
  - shadow-readiness evidence hardening

## Not started

- migration/export tooling for legacy workspace memory
- cutover runbook
- rollback runbook
- VPS purge runbook
- large-document audited execution wave that persists admissible canonical
  objects

## Risks

- prompt quality can become the new hidden architecture if not treated as a versioned contract
- proof can regress into exact-text replay if fixture policy is not enforced
- identity rules can become a new semantic forest if fuzzy merge leaks into the write path
- projection or context layers can become a second ontology if they are not kept explicitly derived
- projection activation can still lose human-owned workspace content if the generated-zone boundary is weakened later
- cutover can accidentally promote projections, retrieval packs, or shadow reports into truth if the canonical-object boundary is not held
- live rollout can drift into indefinite coexistence if shadow-readiness evidence does not become an explicit gate for replacement and deletion
- retirement can drift into indefinite coexistence if the deletion phase is not treated as a hard exit criterion
- large-document ingestion can create false confidence if the test inventory
  stays too small, too synthetic, or too biased toward known-good internal
  wording
- live large-document extraction is no longer at total failure on Tier 1
  sources, but the rerun-created-new-objects behavior shows the project is
  still blocked on large-source semantic stability, duplicate identity quality,
  and proof admission quality
- fixed request seeds do not currently yield stable large-document candidate
  sets even on the bounded `gpt-5-mini` pass-1 comparison lane, so provider
  nondeterminism and/or prompt-boundary drift are still active blockers before
  broader evidence spend
