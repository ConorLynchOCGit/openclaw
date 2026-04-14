---
summary: "Object-native retrieval and context-injection design for model-memory."
title: "Retrieval And Context Injection"
---

# Retrieval And Context Injection

## Objective

Define the read path for `model-memory` without reintroducing detector-era or string-matching architecture.

The retrieval system must:

- operate on stored semantic objects
- use the same canonical-class-first ontology as writes
- avoid fixed memory strings as retrieval authority
- avoid compatibility categories as retrieval truth
- support later context injection without changing runtime truth

## Core rule

Retrieval is object-native.

That means:

- queries are interpreted into structured retrieval requests
- candidate recall operates over stored objects and indexed object projections
- returned results are semantic objects with provenance

Retrieval is not:

- keyword-trigger lookup against known memories
- exact statement matching
- family/category lookup
- compatibility back-mapping

## Retrieval pipeline

1. query adapter
2. model retrieval-request interpretation
3. deterministic candidate recall
4. optional model reranking
5. context packing
6. object-native return

## Query adapter

The query adapter builds a retrieval envelope from the consumer surface.

Allowed sources later include:

- turn-time context injection requests
- operator/admin lookup
- shadow comparison workflows

The envelope may include:

- `queryText`
- `requestPurpose`
- `scope`
- `session metadata`
- `project metadata`
- `maxResults`

The query adapter must not:

- hardcode known memory subjects
- branch on exact remembered phrases
- infer canonical class from detector-era categories

## Retrieval-request interpretation

The model interprets the retrieval envelope into a structured retrieval request.

This model-owned step must record:

- `contractName = retrieval_request_interpretation`
- `contractVersion`
- `modelId`

Required output fields:

- `goal`
- `canonicalClasses`
- `kinds?`
- `scopeConstraints?`
- `subjectHints?`
- `contentHints?`
- `desiredResultCount`
- `requestConfidence`

The retrieval interpreter prompt must remain structural and use placeholder-only examples if examples are needed at all.

## Candidate recall

Candidate recall is deterministic.

V1 candidate recall should use:

- scope filters
- canonical class filters
- kind filters
- normalized subject and title projections
- normalized text search over stored object payload projection
- provenance/source constraints where relevant

V1 candidate recall must not use:

- fuzzy semantic merge logic
- fixed memory-string registries
- category-family lookup tables
- exact rendered statement matching

Optional future recall lanes may include embeddings, but only as candidate generation aids. They must not replace object-native truth.

## Reranking

Reranking is optional.

If used, the model may rerank recalled candidates for a specific query goal.

If reranking is enabled, this model-owned step must record:

- `contractName = retrieval_reranking`
- `contractVersion`
- `modelId`

The reranker may decide:

- which candidates are most relevant
- which candidates should be packed into the final context window

The reranker must not:

- invent new memories
- rewrite stored memory meaning
- recover meaning from compatibility labels

## Context injection

Context injection is a packaging layer on top of retrieval.

It should package:

- the semantic object
- compact payload fields
- scope
- provenance summary

It should not package:

- compatibility-era category labels as primary truth
- rendered memory statements as the only representation

Consumers should receive object-native context first, with optional rendered text only as a secondary presentation aid.

## Result contract

Each retrieval result should carry:

- `objectId`
- `canonicalClass`
- `kind`
- `payload`
- `scope?`
- `provenanceSummary`
- `retrievalReasonCodes`
- `rankBand`

`retrievalReasonCodes` must be closed, generic codes such as:

- `scope_match`
- `class_match`
- `subject_match`
- `text_match`
- `rerank_selected`

They must not carry concrete memory content.

They are explanatory audit metadata only and must not become ranking or semantic truth in a later pipeline stage.

## Proof policy

Retrieval proof must be object-native.

Tests and benchmarks should define:

- the query envelope
- the adjudicated relevant object set
- the expected packed result set or rank band

They must not prove retrieval by:

- exact keyword triggers
- exact statement fragments
- known-memory fixture catalogs
- compatibility family matches

## Benchmark policy

Retrieval benchmarks should score:

- relevant-object recall
- top-k precision
- ranking quality
- scope-filter correctness
- canonical-class correctness
- packing quality

They should not score:

- exact word overlap
- exact rendered statement match
- repo-lore phrase detection

## Storage requirements

The storage layer must support retrieval with:

- normalized payload projections for text search
- indexes on canonical class, kind, and common scope fields
- retrieval request and retrieval result-set audit records

## Deferred work

- retrieval implementation
- live context injection integration
- embedding-assisted candidate generation
- operator retrieval interfaces
