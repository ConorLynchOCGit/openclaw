---
summary: "Spec for inventorying which OpenClaw workspace packages can own build, test, and check tasks."
title: "Workspace Task Inventory"
---

# Workspace Task Inventory

## Goal

Identify which workspace packages can honestly own `build`, `test`, and
`check` tasks instead of relying on the root monolith by default.

## Required outputs

For every workspace package:

- package name
- path
- current scripts:
  - `build`
  - `test`
  - `check`
  - `lint`
  - adjacent task scripts if relevant
- current ownership classification:
  - `ready_now`
  - `needs_split`
  - `root_only`
  - `not_applicable`

## Classification rules

### `ready_now`

Use when the package already has enough local task ownership to become part of
the Turbo graph with minimal follow-up.

### `needs_split`

Use when the package is a plausible owner, but the current logic still lives in
root scripts or mixed global flows.

### `root_only`

Use when the task is fundamentally repo-global or contract-global, for example:

- repo-wide boundary inventories
- global export drift baselines
- full plugin SDK artifact generation

### `not_applicable`

Use when a package simply does not need a given task.

## Questions this inventory must answer

1. Which packages already own real `build` tasks?
2. Which packages already own real `test` tasks?
3. Which packages could own local `check` tasks with modest refactoring?
4. Which root-owned checks must remain global?
5. Which workspace areas are the highest-value next expansion targets after
   `ui`?

## Success criteria

- package-task ownership is explicit
- the next Turbo expansion targets are evidence-backed
- the root monolith can be discussed in terms of concrete ownership seams
