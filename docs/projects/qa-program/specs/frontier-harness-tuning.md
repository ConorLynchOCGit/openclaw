---
summary: "Canonical frontier harness tuning loop and subset ordering for QA."
title: "Frontier Harness Tuning"
---

# Frontier Harness Tuning

Use the frontier subset to tune harness behavior before broad small-model or
full-suite passes.

## Goals

- verify tool-first behavior on short approval turns
- verify model switching does not kill tool use
- verify repo-reading and discovery still finish with a concrete report
- verify replay-unsafety truth under compaction pressure
- collect manual personality notes without letting style hide execution
  regressions

## Frontier subset

- `approval-turn-tool-followthrough`
- `model-switch-tool-continuity`
- `source-docs-discovery-report`

Longer spot-checks:

- `compaction-retry-mutating-tool`
- `subagent-handoff`

## Baseline order

1. GPT first
2. Claude second
3. Gemini third
4. whole seed suite only after the frontier subset is stable
