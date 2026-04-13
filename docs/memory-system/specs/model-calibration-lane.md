# Model Calibration Lane

## Problem statement

A live-model benchmark alone does not prove readiness. The repo also needs an
explicit calibration lane that turns benchmark results into acceptance
decisions for prompt, schema, confidence, and rationale policy.

## Goals

- define a measurable acceptance bar
- summarize benchmark quality in a reusable calibration result
- make prompt and validation policy evidence-based instead of anecdotal
- make it impossible to claim readiness while ontology or validator seams still
  fail the strengthened corpus

## Non-goals

- final runtime cutover in Pass 1
- cost optimization or large-scale model experimentation in Pass 1

## Architecture boundary

Calibration is the acceptance-control layer over live-model benchmark results.
It is not the model runtime itself and it is not a heuristic semantic fallback.

## Proposed data contracts

- `MemorySemanticCalibrationThresholds`
- `MemorySemanticCalibrationResult`
- threshold fields for:
  - passing-case rate
  - blocking-issue count
  - minor-issue count

## Runtime ownership

- `memory-semantic-calibration.ts` owns calibration logic
- benchmark harnesses feed calibration
- roadmap and readiness decisions should read calibration outputs instead of
  relying on freeform qualitative claims alone

## Migration strategy

1. define threshold defaults
2. compute readiness from benchmark reports
3. use the result to gate stronger runtime-retirement claims in later passes

## Validation strategy

- targeted calibration tests
- targeted benchmark reruns that prove pass and fail behavior

## Current landed state

- calibration now reads the object-native benchmark report directly
- closure acceptance uses the stored live-proof artifact instead of narrative
  claims
- the current closure proof satisfied the bar on:
  - model: `openrouter/openai/gpt-5.4`
  - prompt: `memory-semantic-v5`
  - artifact: `audits/memory_live_model_benchmark_2026-04-13T01-34Z.json`

## Risks and open questions

- initial thresholds are necessarily conservative and may need later tuning
- calibration can become cosmetic if the gold corpus is weak
- calibration is not enough by itself; Phase 2 still stays blocked if the model
  contract or validator boundary remain detector-shaped

## Rewrite targets

- freeform readiness claims that should instead point to measured benchmark
  results

## Deletion targets

- unsupported “the model seems better” claims with no corpus-backed acceptance
  bar
