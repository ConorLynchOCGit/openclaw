---
summary: "Proof and benchmark design for model-memory."
title: "Proof And Benchmark"
---

# Proof And Benchmark

## Core rule

Proof must be object-native.

## Primary proof mode

Each test owns:

- exact source input
- adjudicated expected objects

The harness compares:

- canonical class
- kind
- normalized payload
- scope
- provenance quality
- review mode
- audit metadata only where an audit-specific test explicitly targets it

It does not compare:

- rendered statements
- exact phrasing
- shared fake-memory catalogs
- freeform rationale text

## Secondary proof mode

Stored real model outputs may be used as replay artifacts for selected audited cases.

These are secondary evidence, not the only truth surface.

## Disallowed proof patterns

- replay keyed by content strings
- shared semantic fixture worlds
- substring benchmark scoring
- exact statement matching as semantic proof
- fixed rationale phrases carrying semantic content

## Benchmark dimensions

Benchmarks should measure:

- precision
- recall
- omission rate
- false positive rate
- duplicate collapse quality
- retrieval result quality
- provenance quality
- review-mode quality
- drift across prompt/model versions

Retrieval benchmarks must compare retrieved object sets against adjudicated relevant object sets.

They must not score on:

- exact keyword hits
- exact statement fragments
- compatibility category matches
- fixed memory-string triggers

## Proof drift policy

Bounded semantic equivalence is allowed in proof.

That means harmless phrasing drift may pass if the normalized semantic object is equivalent.

That does not change the strict write-path identity policy.
