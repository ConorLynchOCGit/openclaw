---
summary: "Stage-by-stage benchmark results for rule-vs-fact document-ingest variants."
title: "Rule Vs Fact Benchmark Results"
---

# Rule Vs Fact Benchmark Results

Generated at: 2026-04-18T13:05:40.722Z

Model: `openrouter/openai/gpt-5.4-nano`
Candidate model: `openrouter/openai/gpt-5.4-nano`
Request seed: `7`
Request timeout: `120000` ms
Max words per window: `1500`

## Corpus

- `docs/system/memory.md`
  - why: System recall index with explicit memory-layer policy and workspace inventory.
  - semantic mix: Topology facts plus durable memory-layer rules.
  - expected dominant kinds: fact, rule, reference
  - must capture: System Memory is the workspace recall index for OpenClaw. | Generated memory must not flatten authored docs. | The memory layers include human-owned sources, DB-backed model-memory projection, and daily memory files as an ingestion layer.

## baseline

- hypothesis: Current live prompts and canonicalization behavior continue to undercapture rules relative to facts.
- simplification tested: None. This preserves the current live path.
- total windows: 1
- candidate counts by type: {}
- canonicalized counts by kind: {}
- validation rejects: 1
- write decisions: {}
- adjudication outcomes: {}

| document                | windows | pass1 candidates | accepted kinds | accepted classes | rejects | writes | active delta | memory projection       |
| ----------------------- | ------: | ---------------- | -------------- | ---------------- | ------: | ------ | ------------ | ----------------------- |
| `docs/system/memory.md` |       1 | `{}`             | `{}`           | `{}`             |       1 | `{}`   | `{}`         | `MEMORY.md (2 bullets)` |
