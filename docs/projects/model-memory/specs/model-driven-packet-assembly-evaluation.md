---
summary: "Evaluation contract for testing model-driven assembly of memory packets before cutover."
title: "Model Driven Packet Assembly Evaluation"
---

# Model Driven Packet Assembly Evaluation

## Objective

Test whether a model-driven compiler can produce better bounded packet output
than the current deterministic packet renderers.

The first experiment targets `memory-md`.

## Why start here

`memory-md` is the most visible failure case today:

- its target budget is small
- its generated content can grow far past target
- bootstrap injection surfaces the quality failure immediately
- it is easy to evaluate both structurally and qualitatively

If this lane performs well, the same pattern can be evaluated for:

- `user_memory_pack`
- `project_memory_pack`
- `procedure_memory_pack`
- `retrieval_pack`

This experiment is now treated as the first proof lane for the generalized
packet compiler rather than as a `MEMORY.md`-only exception.

## Experiment contract

The experiment uses a bounded, real, over-budget basket of live `model-memory`
objects that are eligible for `memory-md`.

The model receives:

- packet purpose
- target output budget
- hard output structure
- the over-budget source basket

The model must return:

- one bounded `MEMORY.md`-style markdown packet
- explicit included sections
- explicit dropped ids
- quality notes

## Output contract

The first-pass model-driven compiler should aim for:

- preferred output length: `850` to `1100` tokens
- hard ceiling: `1200` tokens
- no invention
- no raw historical narrative unless operationally necessary
- preserved operator-critical rules and procedures
- deduped overlapping facts
- stale or niche entries dropped

Required packet structure:

- `# MEMORY.md`
- `## Standing Context`
- `## Current Priorities`
- `## Active Procedures`

## Evaluation posture

The first pass uses the configured nano lane to test whether a cheap compiler
can already beat the current deterministic renderers on quality-per-token.

The resulting packet is then reviewed qualitatively by a stronger frontier
model before any production integration decision is made.

## Success criteria

The experiment is a candidate for broader rollout only if the nano-generated
packet is:

- materially more concise than the deterministic packet
- clearly more bootstrap-usable
- free of obvious invention
- preserving the highest-value operator constraints
- acceptable to a frontier-model qualitative review

## Non-goals

This experiment does not yet change production packet assembly.

It is an evidence-gathering lane for:

- compile-time budget enforcement
- model-driven selection quality
- future generalized packet compiler design
- shared packet rails and packet-policy budgeting
