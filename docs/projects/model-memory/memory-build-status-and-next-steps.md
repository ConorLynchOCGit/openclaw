---
summary: "Current re-entry handoff for the model-memory build after the rule-vs-fact benchmark tranche."
title: "Memory Build Status And Next Steps"
---

# Memory Build Status And Next Steps

## Authority Status

Status: `historical_rule_vs_fact_handoff`

This file preserves the rule-vs-fact benchmark handoff that preceded the
MMV2-native storage cutover and post-cutover hot-path cleanup. It remains useful
for benchmark lineage, but it is no longer the current roadmap owner.

Current roadmap authority now lives in:

- [Current Slice](/projects/model-memory/CURRENT_SLICE)
- [Roadmap](/projects/model-memory/roadmap)
- [Phase 2 Execution Roadmap](/projects/model-memory/phase-2-execution-roadmap)
- [Memory Capture Seams](/projects/model-memory/specs/memory-capture-seams)
- [Memory Ops Closed Loop](/projects/model-memory/specs/memory-ops-closed-loop)

## Current production truth

The first production fix from the rule-vs-fact benchmark has already shipped.

That fix was prompt-first, not schema-first.

Why:

- the benchmark showed pass-1 candidate extraction was the first seam skewing
  toward `fact`
- prompt-only simplification produced the cleanest gain with the fewest moving
  parts
- collision and write policy were not the dominant seam on the 10-document
  benchmark corpus

Primary implementation surface:

- `extensions/model-memory/src/semantic-extraction-prompt.ts`

## Current benchmark conclusion

The durable benchmark record lives under:

- [Rule Vs Fact Benchmark Findings](/projects/model-memory/rule-vs-fact-benchmark-findings)
- [Rule Vs Fact Next Change Recommendation](/projects/model-memory/rule-vs-fact-next-change-recommendation)
- [Benchmark Evidence](/projects/model-memory/evidence/rule-vs-fact-benchmark)

The current judgment is:

- pass-1 extraction was the first seam to fix
- that production-shaped fix materially improved `rule` capture
- the next narrow seam is pass-2 canonicalization
- the next review target is rule-to-fact collapse in pass 2
- this is not evidence for a broad schema rewrite

## Current posture on kind vs class

- `kind` remains the preferred primary semantic axis
- `canonicalClass` remains secondary or derived
- class-kind coupling is still treated as a secondary amplifier rather than the
  first production lever

That means the next memory work should keep reducing coupled semantic
commitments rather than adding new deterministic compensation logic.

## Current evidence snapshot

The production-shaped prompt-first rerun preserved this benchmark outcome:

- pass 1:
  - `rule = 140`
  - `fact = 7`
  - `procedure = 4`
  - `reference = 6`
- pass 2:
  - `rule = 64`
  - `fact = 3`
  - `reference = 3`
- writes:
  - `write = 69`
  - `attach_support = 1`
- final active delta:
  - `rule = 62`
  - `fact = 3`
  - `reference = 3`

This is the current production reference point, not a speculative target.

## What should not change yet

- do not broaden into a full schema rewrite
- do not reintroduce more rigid class-kind coupling
- do not add deterministic complexity to compensate for a seam that is already
  improving through simplification
- do not treat canonicalization as the first move before remeasuring the
  prompt-first production path further

## Harness and auth lessons

- the benchmark path exposed that auth-discovery proof is not the same thing as
  runtime hydration
- the auth register is now a discovery and proof surface, not a secret-injection
  mechanism
- benchmark and proof runners still need to resolve credentials from the actual
  runtime auth sources they execute under

## Immediate next steps

1. measure the remaining pass-2 rule-to-fact collapse on the same 10-document
   corpus
2. implement the narrowest canonicalization fix that preserves `kind`-first
   semantics
3. rerun the same corpus and compare stage-by-stage deltas
4. only revisit broader schema surgery if pass-2 leakage remains materially high
   after that narrow fix

## Open proof items

- prove the next pass-2 change on the same fixed benchmark corpus
- keep packet-compiler work separate from this narrow ingest-fix tranche
- continue tracking kind-balance proof obligations in:
  - [Packet And Kind Balance Proof Pack](/projects/model-memory/packet-and-kind-balance-proof-pack)
