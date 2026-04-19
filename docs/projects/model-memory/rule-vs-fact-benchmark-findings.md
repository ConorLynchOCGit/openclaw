---
summary: "Evidence-backed findings from the fixed 10-document rule-vs-fact benchmark."
title: "Rule Vs Fact Benchmark Findings"
---

# Rule Vs Fact Benchmark Findings

## Bottom line

The dominant source of fact-over-rule skew in the current document-ingest path
is upstream candidate extraction, not downstream collision/write behavior.

Class-kind coupling is still relevant, but this benchmark shows it is a
secondary amplifier rather than the first-order cause.

The combined schema-plus-prompt simplification variant now runs cleanly after a
benchmark-harness fix, but it still should not be the next production move.

It improved final rule counts, but it did so through a benchmark-only
normalizer path that still leaves a rule-to-fact collapse in canonicalization
and heavily flattens `canonicalClass`.

## Corpus and run

- fixed corpus:
  - [Representative Corpus Rule Vs Fact Benchmark](/projects/model-memory/representative-corpus-rule-vs-fact-benchmark)
- scorecard:
  - [Rule Vs Fact Benchmark Scorecard](/projects/model-memory/rule-vs-fact-benchmark-scorecard)
- variant design:
  - [Rule Vs Fact Variant Design](/projects/model-memory/rule-vs-fact-variant-design)
- raw evidence:
  - [`docs/projects/model-memory/evidence/rule-vs-fact-benchmark/2026-04-18-openrouter/benchmark-report.json`](/root/services/openclaw-roles/live/docs/projects/model-memory/evidence/rule-vs-fact-benchmark/2026-04-18-openrouter/benchmark-report.json)
  - [`docs/projects/model-memory/evidence/rule-vs-fact-benchmark/2026-04-18-openrouter/benchmark-report.md`](/root/services/openclaw-roles/live/docs/projects/model-memory/evidence/rule-vs-fact-benchmark/2026-04-18-openrouter/benchmark-report.md)
  - [`docs/projects/model-memory/evidence/rule-vs-fact-benchmark/2026-04-18-production-prompt-first/benchmark-report.json`](/root/services/openclaw-roles/live/docs/projects/model-memory/evidence/rule-vs-fact-benchmark/2026-04-18-production-prompt-first/benchmark-report.json)
  - [`docs/projects/model-memory/evidence/rule-vs-fact-benchmark/2026-04-18-production-prompt-first/benchmark-report.md`](/root/services/openclaw-roles/live/docs/projects/model-memory/evidence/rule-vs-fact-benchmark/2026-04-18-production-prompt-first/benchmark-report.md)
  - [`docs/projects/model-memory/evidence/rule-vs-fact-benchmark/2026-04-18-openrouter-variant-b-final/benchmark-report.json`](/root/services/openclaw-roles/live/docs/projects/model-memory/evidence/rule-vs-fact-benchmark/2026-04-18-openrouter-variant-b-final/benchmark-report.json)
  - [`docs/projects/model-memory/evidence/rule-vs-fact-benchmark/2026-04-18-openrouter-variant-b-final/benchmark-report.md`](/root/services/openclaw-roles/live/docs/projects/model-memory/evidence/rule-vs-fact-benchmark/2026-04-18-openrouter-variant-b-final/benchmark-report.md)

## Variant totals

### Baseline

- pass 1 candidate counts:
  - `rule = 40`
  - `fact = 13`
  - `procedure = 3`
- pass 2 canonicalized counts:
  - `rule = 37`
  - `fact = 11`
  - `procedure = 1`
- write path:
  - `write = 48`
  - adjudication outcomes:
    - `no_candidates = 43`
    - `direct_distinct = 5`

### Variant A: prompt simplification only

- pass 1 candidate counts:
  - `rule = 54`
  - `fact = 6`
  - `procedure = 5`
  - `preference = 1`
- pass 2 canonicalized counts:
  - `rule = 53`
  - `fact = 6`
  - `procedure = 5`
  - `preference = 1`
- write path:
  - `write = 60`
  - adjudication outcomes:
    - `no_candidates = 57`
    - `local_conflict_hold_ambiguous = 3`

### Variant B: schema-plus-prompt simplification

- pass 1 candidate counts:
  - `rule = 64`
  - `fact = 6`
  - `procedure = 1`
- pass 2 canonicalized counts:
  - `rule = 61`
  - `fact = 8`
  - `procedure = 1`
- write path:
  - `write = 70`
  - adjudication outcomes:
    - `no_candidates = 63`
    - `local_conflict_hold_ambiguous = 5`
    - `direct_distinct = 2`

### Production-shaped rerun after shipping the prompt-first change

- pass 1 candidate counts:
  - `reference = 6`
  - `rule = 140`
  - `procedure = 4`
  - `fact = 7`
- pass 2 canonicalized counts:
  - `reference = 3`
  - `rule = 64`
  - `fact = 3`
- write path:
  - `write = 69`
  - `attach_support = 1`
  - adjudication outcomes:
    - `no_candidates = 63`
    - `local_conflict_hold_ambiguous = 1`
    - `direct_distinct = 5`

Interpretation:

- the shipped production prompt change improved the corpus materially without a
  schema rewrite
- rules increased sharply at pass 1 while facts fell sharply
- pass 2 still leaks some rule-shaped material, but the dominant gain is
  clearly upstream

## Stage diagnosis

### 1. Pass 1 candidate extraction is the first-order source of skew

Evidence:

- baseline pass 1 still produces a non-trivial fact share on rule-bearing
  policy docs:
  - `docs/projects/workspace-topology/runtime-project-surfaces.md`
    - baseline pass 1: `fact = 3`, `rule = 2`
    - variant A pass 1: `rule = 5`, `fact = 0`
  - `docs/projects/model-memory/specs/document-read-and-ingest-arbitration.md`
    - baseline pass 1: `fact = 3`, `rule = 4`
    - variant A pass 1: `rule = 5`, `fact = 0`, `procedure = 3`

Interpretation:

- those gains happened before any schema simplification could act on accepted
  canonical objects
- that means the main lever is still how pass 1 interprets normativity and
  durable operator contracts

Conclusion:

- rule under-capture is already entering the system in pass 1

### 2. Pass 2 canonicalization remains a secondary amplifier, not the main cause

Evidence:

- baseline:
  - pass 1 = `rule 40 / fact 13 / procedure 3`
  - pass 2 = `rule 37 / fact 11 / procedure 1`
- variant A:
  - pass 1 = `rule 54 / fact 6 / procedure 5 / preference 1`
  - pass 2 = `rule 53 / fact 6 / procedure 5 / preference 1`

Additional evidence from final variant B:

- pass 1 = `rule 64 / fact 6 / procedure 1`
- pass 2 = `rule 61 / fact 8 / procedure 1`

Interpretation:

- once pass 1 is improved, pass 2 still preserves most of the rule-heavy
  distribution
- but pass 2 is still capable of collapsing a rule candidate into a fact-shaped
  canonical object

Conclusion:

- canonicalization contributes to the skew, but it is not the dominant seam

Additional evidence from the production-shaped rerun:

- `docs/projects/model-memory/specs/kind-primary-schema-migration.md`
  - pass 1: `rule = 8`, `procedure = 4`
  - pass 2: `rule = 3`
- `docs/projects/workspace-topology/runtime-project-surfaces.md`
  - pass 1: `rule = 7`
  - pass 2: `0 accepted objects`

Interpretation:

- pass 1 is now much more willing to call durable normative material a rule
- pass 2 is still more lossy than it should be on dense rule-bearing docs
- that keeps canonicalization as the next seam to tighten, but not the first
  one to patch

### 3. Collision adjudication and write policy are not the main cause on this corpus

Evidence:

- baseline adjudication:
  - `no_candidates = 43`
  - `direct_distinct = 5`
- variant A adjudication:
  - `no_candidates = 57`
  - `local_conflict_hold_ambiguous = 3`
- variant B adjudication:
  - `attach_support = 2`

Interpretation:

- most objects never entered a high-pressure merge decision at all
- the write path is not where fact-heavy objects are being broadly converted
  or hidden

Conclusion:

- downstream collision logic is not the first production seam to change for
  this problem

### 4. Projection/materialization is reflective, not causal

Evidence:

- `MEMORY.md` excerpts changed in line with upstream capture distribution
- no projection evidence showed a rule-rich canonical set being re-rendered as
  a fact-only output

Conclusion:

- projection quality still matters, but it is not the stage where this skew is
  introduced

## Exact example of a rule collapsing into a fact-shaped outcome

The clearest benchmark example is
`docs/projects/workspace-topology/runtime-project-surfaces.md`.

Baseline pass 1 treated several normative workspace-topology statements as
facts:

- `Canonical engineering project workspaces live under docs/projects/<project-id>/...`
- `workspace/projects/* compatibility paths primarily act as import-backed aliases...`
- `projects/ops/ is an exception: it remains a real writable compatibility surface...`

Under prompt-only simplification, the same document shifted to a rule-first
interpretation:

- `Treat docs/projects/<project-id>/ as the only canonical engineering project workspaces.`
- `Only treat a workspace path as authoritative when it is the explicit runtime-generated writable surface by contract.`
- `Treat only projects/ops/ as a real workspace-owned compatibility surface; other workspace projects/* paths should be import-backed compatibility aliases...`

This is the same policy surface moving from descriptive fact packaging to
directive rule packaging without any schema change.

## What variant A proved

Variant A proved that a prompt-only, kind-first framing is enough to move the
distribution materially:

- facts dropped from `13` to `6`
- rules increased from `40` to `54`
- pass 2 preserved almost all of the gain

That is the strongest evidence in this run.

## What variant B proved

Variant B now runs cleanly after the benchmark harness stopped letting numeric
confidence values die in the pass-1 repair contract.

That fixed the harness, not the production memory pipeline.

After the harness fix, Variant B showed:

- pass 1 candidate counts:
  - `rule = 64`
  - `fact = 6`
  - `procedure = 1`
- pass 2 canonicalized counts:
  - `rule = 61`
  - `fact = 8`
  - `procedure = 1`
- validation rejects:
  - `0`

Interpretation:

- the combined variant can produce more final rule-shaped output than the
  baseline
- but that is not a clean attribution win over prompt-only simplification,
  because Variant B shares Variant A's prompt posture and also relies on a
  benchmark-only normalizer path
- it still shows canonicalization leakage:
  - in `docs/projects/model-memory/specs/kind-primary-schema-migration.md`,
    pass 1 produced four `rule` candidates and one `procedure`, but pass 2
    emitted one of those rule-shaped claims as a `fact`
- it also over-flattens class bookkeeping:
  - final canonical classes were `project = 69`, `feedback = 1`

Conclusion:

- Variant B is useful evidence that canonicalization remains a secondary review
  seam
- it is not yet a cleaner first production patch than prompt-only
  simplification
- the earlier confidence-envelope mismatch was a benchmark harness bug and has
  already been fixed; it is no longer the explanation for the current skew

## First-order versus secondary causes

First-order cause:

- pass-1 candidate extraction and retention behavior
  - especially normativity detection
  - especially `shouldStore` decisions on rule-bearing statements

Secondary amplifier:

- class-kind coupling and pass-2 packaging pressure

Not first-order on this corpus:

- collision adjudication
- write policy
- projection rendering

## Rejected conclusions

Rejected:

- "The write path is merging rules away."
  - not supported by the benchmark totals
- "A schema rewrite should be the first move."
  - variant B did not earn that conclusion
- "We need more deterministic compensation logic first."
  - prompt-only simplification already moved the distribution materially
