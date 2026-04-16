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

## Real-source admission posture

For repeated real-source runs, proof admission is not gated on exact candidate
overlap or exact object-set equality.

The bar is instead:

- structural validity
- provenance quality
- recurrence of the same core durable claims often enough to trust the case
- bounded active-object growth across repeated runs
- no leakage of provisional or `conflict_hold` objects into default runtime
  reads
- honest source suitability for proof

Historical comparison runs may still record low candidate overlap or object-set
drift. Those observations remain useful diagnostics, but they are not the
current admission gate.

## Proof honesty for support-only churn

Proof must label the class of probe it actually executed before interpreting
rebuild or cache motion.

Required classes:

- `pure_attach_support`
- `same_source_rerun_mixed`
- `whole_source_reingest`
- `transient_retrieval_artifact_growth`

If no true support-only source was observed:

- the proof lane must report
  `support_only_probe_blocked_no_true_support_only_source`
- it must not fall back to some unrelated saturation rerun and call that
  support-only churn

If the current preserved corpus still needs a true support-only probe:

- the proof lane may replay one known existing active object with existing
  support using a deterministic synthetic source/window
- that replay is allowed only to prove `pure_attach_support` behavior
- the proof artifact must state:
  - that the probe was synthetic existing-object replay
  - which target object/case was selected
  - whether stable surfaces changed under that replay

Stable-surface reporting must distinguish:

- stable canonical/runtime rebuild behavior
- transient retrieval-pack artifact growth
- real stable-surface motion caused by:
  - source membership changes
  - support/provenance summaries
  - ordering instability
  - timestamp/run-id pollution
  - retrieval-pack bleed-through
