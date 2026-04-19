---
summary: "Disciplined variant design for the rule-vs-fact benchmark."
title: "Rule Vs Fact Variant Design"
---

# Rule Vs Fact Variant Design

This benchmark deliberately uses a small variant set.

The goal is attribution, not maximizing the number of ideas tested at once.

## Variant set

### `baseline`

Hypothesis:

- current live behavior will show where the skew already enters the system

Files changed:

- none

What is being tested:

- the current live prompt contracts
- the current live canonicalization schema
- the current live collision and write path

What is intentionally not changed:

- prompt text
- canonicalization normalization
- validator logic
- write policy
- collision adjudication logic

### `variant_a_prompt_simplification`

Hypothesis:

- rule under-capture is primarily upstream and improves if prompts classify by
  `kind` first and treat normativity as rule-shaped by default

Files changed:

- candidate extraction prompt contract
- canonicalization prompt contract

What is being tested:

- prompt-only simplification
- stronger kind-first framing
- lower semantic pressure from class-kind coupling

What is intentionally not changed:

- schema
- validator
- collision logic
- write policy

Key simplifications:

- decide `kind` first
- treat canonical class as secondary bookkeeping
- prefer `rule` for durable normative text
- if rule field split is uncertain, use `recommendedAction` rather than
  downgrading to `fact`

### `variant_b_schema_plus_prompt_simplification`

Hypothesis:

- prompt simplification alone will not fully solve the issue if final
  canonicalization is still brittle

Files changed:

- candidate extraction prompt contract
- canonicalization prompt contract
- benchmark-only candidate-envelope normalizer
- benchmark-only canonicalization normalizer

What is being tested:

- prompt simplification
- plus one bounded canonicalization simplification seam

What is intentionally not changed:

- production schema migration
- validator implementation
- write policy
- collision adjudication logic

Key simplifications:

- normalize candidate-envelope confidence values into the accepted
  `weak|medium|strong` contract inside the benchmark harness so pass-1
  comparison stays valid
- derive `canonicalClass` from `kind` and source type inside the benchmark
  normalizer instead of asking the model to carry full class authority
- normalize minimal rule payloads into `recommendedAction` when the model has
  clearly emitted a rule but used a looser directive field

Important boundary:

- the candidate-envelope normalizer is a benchmark harness compatibility fix,
  not a proposed production semantic rule

## What this round explicitly refuses to add

This round does not add:

- new ontology layers
- new deterministic rescue heuristics in collision logic
- additional memory classes
- family registries
- benchmark-specific semantic post-filters beyond the bounded variant-b
  canonicalization normalizer
- broad write-policy rewrites

## Why the variant set stays small

A larger matrix would make attribution weaker.

This round is intentionally trying to answer:

1. is the skew already present in pass 1
2. if not, does prompt simplification fix most of it
3. if prompt simplification is not enough, does a bounded canonicalization
   simplification help

Only after that should the system consider broader schema or write-path changes.
