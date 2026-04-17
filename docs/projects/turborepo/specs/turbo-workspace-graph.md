---
summary: "Spec for expanding turbo.json from a narrow UI lane into a real OpenClaw workspace graph."
title: "Turbo Workspace Graph"
---

# Turbo Workspace Graph

## Goal

Expand `turbo.json` from the current UI-only lane into a real workspace task
graph backed by actual package-owned tasks.

## Starting point

Current state:

- `turbo` installed
- `turbo.json` exists
- UI-scoped tasks:
  - `turbo:build`
  - `turbo:test`
- root entrypoints:
  - `pnpm turbo:ui:build`
  - `pnpm turbo:ui:test`

## Target state

A broader graph where:

- multiple workspace packages own explicit tasks
- Turbo orchestrates those tasks with real dependencies
- outputs are declared only where they are real and stable
- caching is enabled only where it is semantically safe

## Required design topics

1. task naming conventions
2. package task dependency relationships
3. cacheable versus non-cacheable task classes
4. output declarations
5. local-only versus CI-meaningful Turbo lanes

## Guardrails

- do not invent outputs for tasks that have none
- do not mark unstable tests as cacheable
- do not hide root-global checks behind package-local names
- do not turn Turbo into a second package manager

## Required outputs

- proposed `turbo.json` task families
- proposed package script naming conventions
- dependency ordering for:
  - build
  - test
  - check
- cache policy by task type

## Success criteria

- the graph reflects real workspace behavior
- the graph is expandable without rewriting it immediately
- Turbo becomes a truthful orchestrator rather than a decorative wrapper
