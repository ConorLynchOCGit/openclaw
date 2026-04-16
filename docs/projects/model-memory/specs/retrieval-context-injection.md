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

For broad operator, workflow, reference, and architecture questions:

- deterministic retrieval is the guardrail baseline
- the model step must not force canonical classes or kinds unless the envelope
  clearly supports that narrowing
- the model step must not shrink `desiredResultCount` below the envelope
  `maxResults`
- invented abstract hint terms that are not grounded in the query text must be
  filtered out before the request steers live retrieval

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

Retrieval-request modeling is not assumed to add value by default.

Proof must compare:

- deterministic candidate recall and ranking before the retrieval-request model
  step
- the interpreted request after the model step
- the final retrieval package that reaches context assembly

If the retrieval-request model step repeatedly over-constrains, misroutes, or
degrades accepted relevant objects compared with the deterministic baseline,
that is a blocker rather than a success.

If the model step is neutral, that is acceptable as an interim posture.

If it is additive, that improvement must show up in the same review lane before
the model step is allowed to claim architectural value.

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
- post-cutover hierarchical or multi-pass retrieval for long multi-objective
  prompts

The current retrieval architecture is intentionally a single-request lane.

If the system later adds hierarchical retrieval for broad planning or
multi-objective prompts, that work must remain:

- object-native
- bounded
- explicitly benchmarked against deterministic single-pass retrieval

That extension is specified separately in
[Post-Cutover Hierarchical Retrieval](/projects/model-memory/specs/post-cutover-hierarchical-retrieval).
