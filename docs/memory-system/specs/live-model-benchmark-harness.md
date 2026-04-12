# Live Model Benchmark Harness

## Problem statement

The repo had comparison and benchmark helpers, but the primary semantic proof
surface still relied too much on heuristic or scripted surrogate logic. That
is not a truthful benchmark for a model-native architecture.

## Goals

- make the primary benchmark path exercise the real model interpretation seam
- support replayable evaluation over frozen fixtures and audited real documents
- report class-aware expected-versus-actual results

## Non-goals

- removing every deterministic comparison helper from the repo
- guaranteeing zero model variance in every future environment

## Architecture boundary

The benchmark harness is not the runtime planner. It is the evaluation control
plane that runs normalized inputs through the real interpretation boundary and
judges the result against hand-authored expectations.

## Proposed data contracts

- `MemorySemanticBenchmarkIssue`
- `MemorySemanticBenchmarkCandidateSummary`
- `MemorySemanticBenchmarkCaseResult`
- `MemorySemanticBenchmarkReport`
- `MEMORY_SEMANTIC_BENCHMARK_CRITERIA`

## Runtime ownership

- `memory-live-benchmark.ts` owns benchmark execution and report assembly
- `scripts/memory-live-benchmark.ts` owns operator-facing live runs
- older heuristic comparison helpers remain baseline or diagnostic surfaces
  only and must not be presented as the primary proof

## Migration strategy

1. add a dedicated live benchmark harness
2. point it at the real planner and interpreter seam
3. feed it gold-corpus cases and audited real docs
4. keep heuristic comparison helpers only as baselines or diagnostics

## Validation strategy

- targeted harness tests with scripted interpreters for plumbing
- targeted live dry-run executions through the real interpreter
- explicit report criteria for counts, categories, omissions, provenance, and
  dedupe

## Risks and open questions

- live-model benchmarks need stable fixture handling and careful reporting to
  stay reviewable
- cost and latency controls are deferred to later passes

## Rewrite targets

- `extensions/memory-middleware/src/memory-live-benchmark.ts`
- `scripts/memory-live-benchmark.ts`
- comparison docs that still overclaim scripted or heuristic proof as the
  primary benchmark

## Deletion targets

- claims that rule-based semantic surrogates are the primary benchmark truth
