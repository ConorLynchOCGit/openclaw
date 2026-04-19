---
summary: "Stage-by-stage benchmark results for rule-vs-fact document-ingest variants."
title: "Rule Vs Fact Benchmark Results"
---

# Rule Vs Fact Benchmark Results

Generated at: 2026-04-18T12:57:05.895Z

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
- candidate counts by type: {"rule":10}
- canonicalized counts by kind: {"rule":5}
- validation rejects: 0
- write decisions: {"write":5}
- adjudication outcomes: {"no_candidates":5}

| document                | windows | pass1 candidates | accepted kinds | accepted classes | rejects | writes        | active delta | memory projection       |
| ----------------------- | ------: | ---------------- | -------------- | ---------------- | ------: | ------------- | ------------ | ----------------------- |
| `docs/system/memory.md` |       1 | `{"rule":10}`    | `{"rule":5}`   | `{"project":5}`  |       0 | `{"write":5}` | `{"rule":5}` | `MEMORY.md (2 bullets)` |

## variant_a_prompt_simplification

- hypothesis: Rule undercapture is primarily upstream and improves if candidate extraction and canonicalization treat kind as primary and normativity as first-class.
- simplification tested: Prompt-only simplification: classify by kind first, prefer rule for normative text, and treat canonicalClass as secondary bookkeeping.
- total windows: 1
- candidate counts by type: {"rule":15}
- canonicalized counts by kind: {"rule":7}
- validation rejects: 0
- write decisions: {"write":7}
- adjudication outcomes: {"no_candidates":5,"local_conflict_hold_ambiguous":2}

| document                | windows | pass1 candidates | accepted kinds | accepted classes | rejects | writes        | active delta | memory projection       |
| ----------------------- | ------: | ---------------- | -------------- | ---------------- | ------: | ------------- | ------------ | ----------------------- |
| `docs/system/memory.md` |       1 | `{"rule":15}`    | `{"rule":7}`   | `{"project":7}`  |       0 | `{"write":7}` | `{"rule":5}` | `MEMORY.md (2 bullets)` |

## variant_b_schema_plus_prompt_simplification

- hypothesis: A bounded canonicalization simplification helps beyond prompt-only changes by removing the model burden of class assignment and normalizing brittle rule payload output.
- simplification tested: Prompt simplification plus a canonicalization normalizer that derives canonicalClass from kind/sourceKind and repairs minimal rule payload shape.
- total windows: 1
- candidate counts by type: {"fact":2,"rule":10}
- canonicalized counts by kind: {"fact":1,"rule":5}
- validation rejects: 0
- write decisions: {"write":6}
- adjudication outcomes: {"no_candidates":5,"local_conflict_hold_ambiguous":1}

| document                | windows | pass1 candidates       | accepted kinds        | accepted classes | rejects | writes        | active delta          | memory projection       |
| ----------------------- | ------: | ---------------------- | --------------------- | ---------------- | ------: | ------------- | --------------------- | ----------------------- |
| `docs/system/memory.md` |       1 | `{"fact":2,"rule":10}` | `{"fact":1,"rule":5}` | `{"project":6}`  |       0 | `{"write":6}` | `{"fact":1,"rule":4}` | `MEMORY.md (2 bullets)` |
