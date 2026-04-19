---
summary: "Stage-by-stage scorecard contract for the rule-vs-fact benchmark."
title: "Rule Vs Fact Benchmark Scorecard"
---

# Rule Vs Fact Benchmark Scorecard

This scorecard defines what must be measured for the baseline and every
benchmark variant.

The scorecard exists because final active-object counts are not enough to
diagnose where rule under-capture enters the system.

## Per-document measurements

For every source document record:

- source document path
- line count
- window count
- pass-1 candidate count by `candidateType`
- pass-2 accepted canonical object count by `kind`
- pass-2 accepted canonical object count by `canonicalClass`
- validation reject count
- validation reject reasons
- repair-path invocations
  - `pass_1_repair`
  - `pass_2_repair`
- collision gate totals
  - raw candidate count
  - retained candidate count
  - pruned candidate count
- collision or bounded adjudication outcomes
- write outcomes
  - `write`
  - `attach_support`
  - `supersede`
  - `ignore`
- final active-object delta by `kind`
- final active-object delta by `canonicalClass`
- `MEMORY.md` or related projection result
  - projection path
  - whether content changed
  - line count
  - bullet count
  - short content excerpt

## Raw evidence to preserve

For every source document preserve:

- stage traces for pass 1 and pass 2
- raw candidate and canonicalization outputs where feasible
- collision gate observations
- bounded adjudication observations
- final write-decision summaries

## Variant-level totals

For every variant aggregate:

- total windows
- candidate count by `candidateType`
- canonicalized count by `kind`
- canonicalized count by `canonicalClass`
- total validation rejects
- total write-decision counts
- total adjudication-outcome counts
- total active-object delta by `kind`

## Interpretation rules

Use the following interpretation posture:

- if `rule` is already missing in pass 1, the skew is upstream
- if pass 1 has `rule` but accepted canonical objects lose it, the skew is in
  canonicalization or schema validation
- if accepted canonical objects contain `rule` but final active deltas do not,
  the skew is in collision or write behavior
- if active deltas contain `rule` but `MEMORY.md` or related projections do not
  reflect it, the skew is in projection or materialization

## Non-goals

This scorecard does not try to produce a gold-standard recall score for all
possible claims in every document.

It is designed to answer one narrower question well:

- where does rule under-capture enter the live pipeline

## Expected output locations

Canonical evidence should be written under:

- `docs/projects/model-memory/evidence/rule-vs-fact-benchmark/`

At minimum preserve:

- a machine-readable JSON report
- a human-readable Markdown summary
