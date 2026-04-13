# Gold Judgment Corpus

## Problem statement

A live benchmark without a maintained judgment corpus still drifts toward
ad hoc examples and optimistic interpretation. The repo needs durable expected
captures and durable expected omissions.

## Goals

- keep a maintained in-repo corpus of hand-judged benchmark cases
- cover documents and turns
- cover stable preferences, operator corrections, procedures, project or
  workflow facts, routing cases, and explicit omissions
- include duplicate/paraphrase cases, mixed-signal docs, and validator-overreach
  sentinel cases

## Non-goals

- representing the full future production corpus in Pass 1
- replacing audited real-document review with synthetic fixtures only

## Architecture boundary

The gold corpus is an evaluation artifact, not a runtime dependency.
It defines what the benchmark harness should judge, not what the planner is
allowed to emit.

## Proposed data contracts

- `MemorySemanticGoldCase`
- `MemorySemanticGoldExpectedCandidate`
- `MemorySemanticGoldForbiddenCandidate`
- `MEMORY_SEMANTIC_GOLD_CORPUS`

## Runtime ownership

- `memory-semantic-gold-corpus.ts` owns the current maintained corpus
- benchmark harnesses consume the corpus directly
- audited real docs remain part of the corpus instead of living only in
  narrative reports

## Migration strategy

1. create the structured gold corpus
2. seed it with both synthetic and real cases
3. include omission and borderline negatives
4. add duplicate, scope-carrying, and validator-overreach cases so the corpus
   can fail intermediate architecture honestly
5. grow it in later passes when new lanes are added

## Validation strategy

- targeted corpus integrity tests
- targeted benchmark runs against corpus subsets
- explicit category-coverage and omission-coverage checks

## Risks and open questions

- the corpus can become stale if real operator review is not folded back into
  it
- overly narrow statements can make the corpus brittle, while overly vague
  statements can make it ceremonial
- the corpus is not strong enough if it cannot catch validator-owned semantic
  reconstruction

## Rewrite targets

- ad hoc benchmark fixtures that should instead live in a maintained corpus

## Deletion targets

- benchmark setups that only test positive captures and ignore expected
  omissions
