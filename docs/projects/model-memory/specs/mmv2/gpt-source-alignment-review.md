---
summary: "Coverage and consistency review of the MMV2 draft pack against the original GPT ingestion notes and the current repo contract."
title: "MMV2 GPT Source Alignment Review"
---

# MMV2 GPT Source Alignment Review

## Review objective

Confirm that the repo-side MMV2 draft pack:

- preserves the original GPT phase structure
- preserves the GPT JSON schemas and prompt drafts
- makes repo-side normalizations explicit
- distinguishes the draft contract from the live v1 system

## Coverage matrix

| GPT source item                                          | Repo MMV2 location                                                  | Status   |
| -------------------------------------------------------- | ------------------------------------------------------------------- | -------- |
| phase overview and ontology                              | `overview-and-design-principles.md`                                 | captured |
| Step 0 schema                                            | `phase-0-raw-ingest-envelope.md`                                    | captured |
| Step 1 schema and segmentation rules                     | `phase-1-preprocessing-and-segmentation.md`                         | captured |
| Step 2 schema and routing prompt                         | `phase-2-capture-routing.md`, `prompt-pack.md`                      | captured |
| Step 3A schema and prompt                                | `phase-3a-atomic-extraction.md`, `prompt-pack.md`                   | captured |
| Step 3B schema and prompt                                | `phase-3b-composite-extraction.md`, `prompt-pack.md`                | captured |
| Step 4 schema and prompt                                 | `phase-4-canonicalization.md`, `prompt-pack.md`                     | captured |
| Step 5 schema and prompt                                 | `phase-5-admission.md`, `prompt-pack.md`                            | captured |
| Step 6 schemas and prompt                                | `phase-6-reconciliation.md`, `prompt-pack.md`                       | captured |
| Step 7 schemas and recording rules                       | `phase-7-recording.md`                                              | captured |
| Step 8 schema and audit rules                            | `phase-8-post-write-audit.md`                                       | captured |
| first-response classifier instructions block             | `classifier-instructions-baseline.md`, `prompt-pack.md`             | captured |
| first-response semantic role tests and routing signals   | `classifier-instructions-baseline.md`                               | captured |
| first-response preference-vs-directive examples          | `classifier-instructions-baseline.md`, `reference-json-examples.md` | captured |
| first-response composite artifact and promotion examples | `classifier-instructions-baseline.md`, `reference-json-examples.md` | captured |
| first-response shared envelope examples                  | `reference-json-examples.md`                                        | captured |
| first-response storage and retrieval layering guidance   | `classifier-instructions-baseline.md`                               | captured |
| first-response recommended prompt stack and invariants   | `classifier-instructions-baseline.md`                               | captured |
| slippage classes and repairs                             | `slippage-and-repair-policy.md`                                     | captured |
| v1 to v2 contract difference                             | `schema-delta-v1-to-v2.md`                                          | captured |
| document-first proving boundary                          | `document-ingest-first-adoption-plan.md`                            | captured |

## Repo-side normalizations

These are documentation normalizations only. They are not intended to change the
proposal semantics.

1. The GPT draft uses both stage numbering and step numbering language.
   Repo docs use phase titles for readability, but preserve the exact order.
2. Prompts are centralized in `prompt-pack.md` to avoid duplicating large
   prompt bodies in every phase doc.
3. The overview doc calls out the ambiguity around whether post-write audit is
   the ninth stage or the terminal Step 8. This was preserved, not resolved by
   invention.

## Fidelity findings

### Preserved exactly or near-exactly

- ontology names
- phase ordering
- schema field names
- admission and reconciliation decision labels
- slippage taxonomy
- the prompt bodies captured in `prompt-pack.md`
- the earlier classifier-instruction block from the first GPT response
- the example object shapes used to explain intended semantics

### Source issues preserved intentionally

- the composite extraction schema contains the original `risk_flags` enum entry
  `contacret`, which appears to be a GPT typo rather than a repo correction
- multiple schema `const` values still end in `v1`, including
  `memory_ingest.v1` and `durable_memory.v1`; those were preserved from the GPT
  draft instead of being silently rewritten to `v2`
- the draft still contains some tension between "Nano proposes" and the amount
  of deterministic override logic allowed after the model call

## Consistency findings against current repo docs

### Major contradiction with live ontology

Current live docs and code still describe the v1 five-kind system. Exact repo
surfaces include:

- `preference`
- `fact`
- `rule`
- `procedure`
- `reference`

Primary repo sources:

- `docs/projects/model-memory/specs/ontology-schema.md`
- `extensions/model-memory/src/semantic-schema.ts`

The MMV2 pack is not an incremental edit to that system. It is a genuine
replacement candidate.

### Major contradiction with current live source adapters

Current repo docs describe a unified source adapter posture for:

- document ingestion
- ordinary-turn capture
- daily continuity recovery

Primary repo source:

- `docs/projects/model-memory/specs/source-adapters.md`

The MMV2 pack is intentionally scoped document-first for adoption even though
its long-term design still aims at shared ingestion.

### Major contradiction with current prompt-migration docs

Existing Phase 2 migration docs focus on:

- `kind` becoming primary
- packet/compiler changes
- graph and capsule follow-through

Primary repo sources:

- `docs/projects/model-memory/specs/prompt-contract-phase2-migration.md`
- `docs/projects/model-memory/phase-2-execution-roadmap.md`
- `docs/projects/model-memory/rule-vs-fact-next-change-recommendation.md`

The MMV2 draft goes deeper and earlier. It rewrites the ingest ontology and
pipeline itself rather than only refining prompt shape around the live kinds.

## Implementation-readiness conclusion

This draft pack is now durable enough to serve as the source specification for a
future shadow implementation pass.

It is not yet the live model-memory contract.

Required before implementation:

- explicit decision on v1 coexistence or translation
- explicit decision on storage write model
- explicit decision on whether `canonicalClass` survives at all
- proof-corpus acceptance criteria for document-first shadow runs

Completeness note:

- the repo now captures both the second-response phase prompt stack and the
  first-response classifier guidance layer
- what remains outside the spec pack are only the explanatory research
  citations and surrounding prose, not missing prompt or schema material
