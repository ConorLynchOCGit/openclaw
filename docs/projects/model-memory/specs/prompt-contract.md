---
summary: "Prompt contract for model-memory semantic extraction."
title: "Prompt Contract"
---

# Prompt Contract

## Objective

Treat every model-owned prompt as a versioned API contract, not as an ad hoc instruction blob.

## Covered model-owned contracts

This rule applies to every model-owned step in the system, including:

- semantic extraction
- retrieval-request interpretation
- retrieval reranking when enabled
- session-summary generation when enabled

## Core rules

Each model-owned prompt must:

- define its task and output contract explicitly
- remain structural rather than lore-driven
- require JSON-only output when the output is machine-consumed
- use closed enums and closed codes where applicable
- be strict enough that outputs are auditable and benchmarkable

Each model-owned prompt must not:

- preload concrete memories
- include repo lore
- teach category routing by examples
- contain compatibility-era families

## Extraction-specific rules

Semantic extraction prompts must additionally:

- define durable memory
- define the allowed canonical classes
- define the allowed kinds
- define required fields
- define provenance requirements
- instruct the model to prefer ignore over speculation

## Example policy

Allowed:

- placeholder-only examples such as `<subject>`, `<value>`, `<resource>`, `<recommended-action>`

Not allowed:

- repo URLs
- branch names
- workflow titles
- checklist titles
- rationale phrases that encode concrete memories

## Versioning

Every model-owned contract must carry:

- `contractName`
- `contractVersion`
- `modelId`

Every persisted output from a model-owned step must record those fields.

Example contract names:

- `semantic_extraction`
- `retrieval_request_interpretation`
- `retrieval_reranking`
- `session_summary_generation`

## Output requirements

Each model-owned prompt must require:

- JSON only when the output is machine-consumed
- no markdown fences
- no extra explanatory prose

Extraction prompts must additionally require:

- explicit canonical class
- provenance spans for every captured object

## Retry policy

If output is malformed:

- one repair pass may be attempted for shape correction only
- repair must not reinterpret semantics

If repair fails:

- reject the output

## Separation of concerns

The relevant prompt decides:

- whether durable memory exists
- what the semantic objects are

Deterministic runtime policy decides:

- whether the result is structurally valid
- whether it is written immediately
- whether it is deduped or superseded by exact normalized identity
