---
summary: "Usage, cache, and prompt-shape observability for model-memory context assembly."
title: "Usage And Cache Ledger"
---

# Usage And Cache Ledger

## Objective

Provide enough observability to understand cost, cache behavior, prompt bloat, and segment churn.

## Core rule

The usage and cache ledger is observational only.

It must not become semantic authority.

## Required measurement types

The ledger should store both:

- provider-normalized usage counters
- segment-level prompt-shape hashes

Counters alone show total cost.

Hashes show which prompt layer changed.

## `context_runs`

One row per model run.

Suggested fields:

- run id
- session id
- agent id
- provider
- model
- assembled timestamp
- stable-layer hash
- semi-stable-layer hash
- volatile-layer hash
- estimated input tokens
- actual input tokens
- actual output tokens
- cache read tokens
- cache write tokens
- estimated cost
- cache retention mode
- prompt cache key when available
- compaction used flag
- pruning used flag

## `context_run_segments`

One row per assembled segment.

Suggested fields:

- run id
- segment order
- segment type
- source artifact id or projection version id
- source kind
- segment hash
- estimated tokens
- dropped flag
- trimmed flag
- drop or trim reason

## Segment types

Typical segment types:

- bootstrap
- user pack
- project pack
- session summary
- retrieval pack
- recent turns
- tool results
- system addition

## Hash purpose

Prompt-shape hashes are used to answer:

- which layer changed
- whether the stable prefix remained stable
- which segment caused cache misses
- which segment caused token growth

They are not used to infer semantic meaning.

## Sampling policy

Full prompt capture, if ever needed for debugging, should be sampled and tightly controlled.

The normal ledger should rely on counters and hashes rather than full prompt text.

## Cross-check policy

The ledger should be designed so its counters can be cross-checked against OpenClaw runtime usage reporting where available.
