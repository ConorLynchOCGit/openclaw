---
summary: "Phase 2 prompt-contract migration notes for kind-primary extraction and downstream graph and capsule work."
title: "Prompt Contract Phase 2 Migration"
---

# Prompt Contract Phase 2 Migration

## Objective

Capture the prompt-contract changes implied by the Phase 2 move to:

- `kind` primary
- graph-derived runtime
- capsules
- planner and synthesis surfaces

2026-04-22 MMV2 alignment:

- prompt-contract updates must preserve MMV2 durable memories/events/edges as
  truth and projections/retrieval packs as derived artifacts
- correction/supersession remains structural; prompt examples must not teach
  fuzzy topical replacement
- examples must avoid topic-specific shortcuts such as `validation reports`
  unless the example is explicitly labeled as arbitrary placeholder text
- runtime diagnostics should prefer ids, hashes, statuses, and reason codes
  over raw prompt or transcript text

## Remaining Implementation Details

- prompt-injection risk thresholds for document ingest vs ordinary turns
- final prompt/schema rollout order for `kind`-primary extraction vs downstream
  derivation
- final config and kill-switch names

2026-04-25 Phase 2 decision lock:

- `kind` is the primary semantic axis for Phase 2 design; `canonicalClass` is
  secondary or derived
- prompt contracts must carry source authority tier and source profile id where
  lower-authority or soft-source material can enter admission, retrieval,
  graph, capsule, planner, skill, or tool synthesis flows
- derived prompt artifacts may use bounded evidence snippets only when source
  policy permits it; raw prompts, full transcripts, raw tool logs, secrets, and
  private phrases remain hard rejects
- external imperative text is evidence or a redacted security finding, never an
  instruction

## Required audits

The following contracts must be reviewed:

- `semantic_extraction`
- `semantic_collision_adjudication`
- `retrieval_request_interpretation`
- packet-compiler render contracts for:
  - `memory-md`
  - `user_memory_pack`
  - `project_memory_pack`
  - `procedure_memory_pack`
  - `retrieval_pack`
- any new capsule compilation prompt if introduced later
- any planner candidate ranking prompt if introduced later

## Extraction migration

The extraction contract should stop treating `canonicalClass` as a co-equal
primary semantic choice.

It should instead:

- emphasize `kind`
- preserve provenance and structure
- allow `canonicalClass` to become secondary or derived

The extraction audit must also investigate why live capture is not presently
yielding active `rule` records.

That review should test whether the issue is caused by:

- prompt framing
- schema/output bias
- adjudication or write-path filtering
- activation/materialization loss
- or real source-corpus imbalance

## Injection and trust rule

External ingested text must be treated as untrusted evidence, not instructions,
in all Phase 2 prompt contracts.

## Non-goal

This spec does not itself redefine the live prompts.

It defines the migration work that must happen before a full Phase 2 rollout.

## Packet-contract migration

Packet generation must stop behaving like one prompt per artifact with bespoke
rules hidden in each surface.

Phase 2 prompt migration should move packet prompts toward one shared contract:

- explicit packet purpose
- explicit target budget
- section caps
- kind-aware basket shaping when relevant
- included-source accounting
- dropped-source accounting

The `MEMORY.md` experiment is the first evidence lane for this migration.
