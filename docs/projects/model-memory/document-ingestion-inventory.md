---
summary: "Pre-cutover inventory for large-document ingestion testing in model-memory."
title: "Model Memory Document Ingestion Inventory"
---

# Model Memory Document Ingestion Inventory

## Objective

Define the first pre-cutover large-document ingestion test inventory for
`model-memory`.

This starts from the legacy memory roadmap's last honest post-soak direction:

- a separate corpus-ingestion-and-compilation capability for larger source sets
- examples named there:
  - research papers
  - articles
  - repos
  - datasets
  - curated source packs

For `model-memory`, that broad idea is retained, but the execution posture is
different:

- object-native proof, not exact-string proof
- model-owned semantics, not fixed-memory-string recognizers
- local audited cases, not a shared memory world
- provenance and omission quality measured explicitly

## Core rules

- use large-source testing to evaluate chunking, extraction, omission,
  provenance, duplicate suppression, and rebuild behavior
- do not use large-source testing to smuggle repo lore or fixed memory strings
  into prompts or benchmarks
- score expected objects, omissions, and write-path outcomes
- allow concrete document content only as local case data owned by the test
  inventory
- keep the legacy memory docs out of the primary ingestion corpus except where
  they are needed as historical migration inputs

## Phase 1 inventory

Phase 1 should stay inside the live repo and begin with large, dense, and
operationally important sources.

### Tier 1 - single-document pilots

These are the first bounded large-document cases to audit end to end.

1. `AGENTS.md`
   - approx 260 lines
   - reason:
     - dense standing instruction surface
     - useful for preference, rule, and reference extraction behavior
     - good stress case for omission discipline because much of it is policy,
       not durable memory
2. `docs/help/testing.md`
   - approx 407 lines
   - reason:
     - long procedural guidance with repeated operational detail
     - good stress case for procedure extraction and duplicate collapse
3. `docs/gateway/configuration.md`
   - approx 546 lines
   - reason:
     - large structured reference material
     - good stress case for reference extraction versus over-capturing rules or
       facts
4. `docs/gateway/protocol.md`
   - approx 256 lines
   - reason:
     - dense architecture and contract material
     - good stress case for reference extraction with scope-sensitive
       provenance
5. `docs/projects/model-memory/specs/database-schema-v1.md`
   - approx 542 lines
   - reason:
     - large internal design document
     - good stress case for extracting durable architecture facts without
       turning implementation detail into fake memory catalogs
6. `docs/projects/model-memory/proof-corpus-plan.md`
   - approx 337 lines
   - reason:
     - dense specification of expected semantic objects and omissions
     - good stress case for distinguishing proof fixtures from actual durable
       operational memory

### Tier 2 - curated in-repo source packs

These packs should be tested only after Tier 1 document pilots are judged
stable enough.

1. `docs/projects/model-memory/specs/`
   - reason:
     - coherent architecture pack for one project
     - exercises pack-level chunking and dedupe across related documents
2. `docs/help/`
   - reason:
     - multiple operational guides with overlapping workflow guidance
     - useful for duplicate and supersession pressure
3. `docs/gateway/`
   - reason:
     - large reference-heavy domain with broad surface area
     - useful for retrieval quality and scope filtering once retrieval
       validation is in the loop
4. `docs/reference/templates/`
   - reason:
     - compact but structured bootstrap surfaces
     - useful for projection-related ingestion tests and bootstrap preservation

### Tier 3 - repo and mixed-source packs

These are not the first execution wave, but they are the next honest category
because the old roadmap explicitly called out repos and curated source packs.

1. selected code-and-doc packs for `extensions/model-memory/`
2. selected code-and-doc packs for `src/plugin-sdk/`
3. selected mixed operational packs that combine:
   - docs
   - package manifests
   - agent instruction surfaces

Rule:

- do not treat a whole repo pack as one semantic blob
- normalize structurally into windows and compare object output, omission, and
  provenance quality

### Tier 4 - external non-repo sources

These are explicitly later and should begin only after the in-repo inventory is
green enough to trust.

1. research papers
2. articles
3. datasets
4. external curated source packs

Rule:

- external-source testing must not be used to quietly redefine the prompt
  contract with example memories from those sources

## What is not in the primary inventory

- deprecated legacy memory-system docs as a forward architecture corpus
- exact-string benchmark fixtures
- replay keyed by rendered statements
- documents chosen only because the current model already matches their wording

Legacy memory docs may still be sampled later for migration and retirement
tooling, but they are historical inputs, not the target architecture corpus.

## First execution order

1. `AGENTS.md`
2. `docs/help/testing.md`
3. `docs/gateway/configuration.md`
4. `docs/gateway/protocol.md`
5. `docs/projects/model-memory/specs/database-schema-v1.md`
6. `docs/projects/model-memory/proof-corpus-plan.md`

## Acceptance bar for this inventory phase

Before moving from single-document pilots into larger packs, the test phase
should show:

- object-native capture quality that is explainable from the source
- omission discipline on non-durable material
- no benchmark fallback to exact text or known-string triggers
- stable provenance spans and source-window coverage
- duplicate suppression that does not collapse distinct durable objects
- bounded semantic convergence across repeated runs rather than exact rerun
  equality
- no prompt drift toward concrete-memory examples

## Follow-through

Once the first execution wave is audited, update:

- `docs/projects/model-memory/proof-corpus-plan.md`
- `docs/projects/model-memory/STATUS.md`
- `docs/projects/model-memory/CURRENT_SLICE.md`

with the exact large-document cases admitted into the active proof set.

## Tier 1 execution outcome - 2026-04-14

Tier 1 was executed through the live `model-memory` document-ingestion path.

Evidence artifact:

- [Large Document Tier 1 Evidence](/projects/model-memory/evidence/large-document-tier1)

Observed rerun result on the explicit nano/nano lane:

- all six Tier 1 documents were executed in the declared order
- the evidence lane now uses `openrouter/openai/gpt-5.4-nano` instead of
  `openrouter/auto`
- all six Tier 1 documents now persist canonical objects with structured
  provenance
- the prior prompt-contract and provenance rejection set was cleared by prompt
  tightening plus a one-shot model-owned structural repair pass
- rerunning the same Tier 1 cases still creates too much fresh active growth
  instead of bounded semantic convergence
- no Tier 1 document is admitted into audited proof yet

This means the inventory itself remains valid, but the current live
large-document extraction path is still not yet convergent enough in aggregate
for proof admission.

## First 100 population wave outcome - 2026-04-14

The next broader population wave was executed on explicit nano/nano through the
real DB-backed path.

Evidence artifacts:

- [First 100 Population Plan](/projects/model-memory/evidence/first-100-population-plan)
- [First 100 Population Run](/projects/model-memory/evidence/first-100-population-run)

Observed result:

- total eligible sources under the accepted ordering logic: `221`
- selected and attempted in the first wave: `100`
- completed: `98`
- failed: `2`
- Tier 1 and Tier 2 were exhausted first
- Tier 3 `extensions/model-memory` production files filled the remaining slots
  needed to reach 100
- persisted totals:
  - canonical objects: `312`
  - support items: `316`
  - active objects: `294`
  - `conflict_hold` objects: `18`
  - provisional objects: `0`
- support attachment was observed in the live population wave:
  - `docs/projects/model-memory/specs/usage-cache-ledger.md`
  - `docs/gateway/openresponses-http-api.md`
  - `docs/reference/templates/TOOLS.md`
- contained failures:
  - `docs/help/faq.md` timed out
  - `extensions/model-memory/src/model-execution.ts` returned invalid semantic
    extraction JSON

Current interpretation:

- this inventory is now good enough to populate the database for downstream
  retrieval/context/rebuild/projection/cache testing
- the wave does not by itself admit any new real-source cases into audited
  proof
