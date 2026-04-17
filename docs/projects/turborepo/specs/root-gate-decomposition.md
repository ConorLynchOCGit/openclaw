---
summary: "Spec for splitting the current root build, test, and check monoliths into cleaner ownership seams."
title: "Root Gate Decomposition"
---

# Root Gate Decomposition

## Goal

Split the current root-owned gate monoliths into cleaner ownership seams while
preserving the landing bar.

## Current problem

The root scripts currently aggregate many different kinds of work:

- package-local build work
- repo-global architecture checks
- repo-global baseline generation and verification
- lint and policy checks
- test orchestration

That makes selective Turbo orchestration weak because task ownership is not
clean.

## Required decomposition model

Each root gate must be decomposed into:

1. package-local tasks
2. repo-global tasks
3. transitional wrapper tasks

## Required outputs

For each of:

- `pnpm check`
- `pnpm test`
- `pnpm build`

record:

- current substeps
- intended owning package or root surface
- whether the step can move out of the root
- whether the step should remain root-global permanently

## Rules

- do not move repo-global contract checks into arbitrary packages
- do not create package-local wrappers that still secretly run root monoliths
- preserve current landing semantics while refactoring

## Transitional design

It is acceptable to keep root wrappers temporarily if they become thin,
well-defined orchestrators over clearer underlying tasks.

It is not acceptable to call the current root monolith "Turbo-ready" without
decomposition.

## Success criteria

- root scripts are explainable in ownership terms
- package-local work is separated from truly global work
- the next implementation slices become clear and bounded
