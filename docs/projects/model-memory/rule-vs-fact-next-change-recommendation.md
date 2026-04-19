---
summary: "Recommended next production move after the fixed 10-document rule-vs-fact benchmark."
title: "Rule Vs Fact Next Change Recommendation"
---

# Rule Vs Fact Next Change Recommendation

## Recommendation

The next production change was prompt simplification first, and that patch is
now the correct production baseline.

Do not start with schema surgery, collision rewrites, or post-write correction
heuristics.

## Status

The prompt-first production patch has now been shipped into the live
document-ingest prompt contracts and rerun against the same fixed 10-document
corpus.

Observed production-shaped rerun totals:

- pass 1:
  - `reference = 6`
  - `rule = 140`
  - `procedure = 4`
  - `fact = 7`
- pass 2:
  - `reference = 3`
  - `rule = 64`
  - `fact = 3`

That confirms the first production move was the right one.

## Exact next move

After the shipped prompt-first change, the next narrow production review seam
is canonicalization, not extraction.

Target it narrowly:

- review pass-2 rule-to-fact collapse
- keep `kind` primary
- keep `canonicalClass` as secondary bookkeeping
- preserve rule when pass 1 already classified a durable normative claim as a
  rule unless the payload is genuinely invalid
- prefer narrow canonicalization repair over a broader schema rewrite

## Why this should go first

Because it produced the cleanest win with the fewest moving parts:

- baseline pass 1:
  - `rule = 40`
  - `fact = 13`
- prompt-only pass 1:
  - `rule = 54`
  - `fact = 6`
- prompt-only pass 2 then preserved almost all of that shift:
  - `rule = 53`
  - `fact = 6`

That was the highest-leverage simplification result from the benchmark, and the
production-shaped rerun reinforced it.

Variant B now runs cleanly after the benchmark harness was fixed, but it still
does not beat this recommendation as a first production move.

Why:

- its improved totals come through a benchmark-only normalization path, not a
  production seam we want to ship directly
- it still collapses at least one rule-shaped candidate into a fact-shaped
  canonical object
- it flattens nearly every canonical class to `project`, which is too blunt to
  treat as the first production schema move

## What should not change yet

Do not change these first:

- do not add deterministic rule-upconversion heuristics after capture
- do not rewrite collision adjudication as the first response
- do not remove `canonicalClass` from storage yet
- do not ship the benchmark-only schema normalizer from variant B
- do not ship the benchmark-only candidate-envelope normalizer from variant B
- do not add extra ontological labels or new semantic categories

## Narrow production scope

The next patch should stay narrow:

1. tighten pass-2 canonicalization so rule-shaped candidates do not collapse to
   fact without a real semantic reason
2. add regression coverage for the observed rule-to-fact leakage docs
3. keep extraction, collision, and write policy unchanged while measuring the
   pass-2 effect

## Immediate follow-on after that patch

After the canonicalization patch lands, rerun the same fixed corpus and check
three things:

1. whether rule-heavy docs remain rule-heavy without extra schema changes
2. whether pass 2 still drops or rewrites rule-heavy docs excessively
3. whether the remaining skew is now small enough that a later class-kind
   decoupling patch can be done cleanly

## Secondary recommendation

Treat class-kind decoupling as the next review seam after the prompt-only
patch, not as the first production patch.

The benchmark supports this order:

- class-kind rigidity is real
- but prompt simplification moved the distribution materially without touching
  schema shape
- the final Variant B run still relies on benchmark-only normalization and
  leaves canonicalization leakage in place

## Rejected alternative

Rejected for now:

- "Add more deterministic compensation logic to rewrite facts into rules after
  canonicalization."

Reason:

- that adds complexity before the simpler prompt-contract fix has been taken
- the benchmark did not show that extra machinery is needed as the first move
