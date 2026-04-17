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

## Required audits

The following contracts must be reviewed:

- `semantic_extraction`
- `semantic_collision_adjudication`
- `retrieval_request_interpretation`
- any new capsule compilation prompt if introduced later
- any planner candidate ranking prompt if introduced later

## Extraction migration

The extraction contract should stop treating `canonicalClass` as a co-equal
primary semantic choice.

It should instead:

- emphasize `kind`
- preserve provenance and structure
- allow `canonicalClass` to become secondary or derived

## Injection and trust rule

External ingested text must be treated as untrusted evidence, not instructions,
in all Phase 2 prompt contracts.

## Non-goal

This spec does not itself redefine the live prompts.

It defines the migration work that must happen before a full Phase 2 rollout.
