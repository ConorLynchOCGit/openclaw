---
summary: "Observability, calibration, and drift monitoring for model-memory."
title: "Observability And Calibration"
---

# Observability And Calibration

## Objective

Make model behavior measurable so prompt quality and drift are visible.

## Required telemetry

- capture rate
- ignore rate
- false positive rate from audited review
- duplicate rate
- supersession rate
- retrieval request volume
- retrieval candidate-set size
- retrieval hit rate against audited cases
- retrieval packing size
- canonical-class distribution
- kind distribution
- confidence distribution
- review-mode distribution
- contract-name distribution
- contract-version distribution
- model-version distribution

## Required artifacts

- benchmark reports by prompt version
- benchmark reports by model id
- sampled write traces with provenance
- shadow-mode comparison reports when shadow mode exists
- usage and cache ledger reports by stable, semi-stable, and volatile segment hashes

## Calibration loop

When a prompt or model changes, compare:

- benchmark score deltas
- class distribution drift
- confidence drift
- false positive drift

If drift exceeds policy thresholds, the release should be blocked or explicitly reviewed.

The same observability layer should also answer:

- which projection changed
- which dynamic pack changed
- whether cache misses came from stable or volatile context
- which segment caused token growth

## Guardrails

The project should eventually include invariant tests that block:

- shared semantic fixture catalogs
- prompt examples with concrete memories
- exact-string replay dispatch in shared proof helpers
- benchmark scoring by exact rendered wording
- projection layers taking semantic authority away from canonical objects
