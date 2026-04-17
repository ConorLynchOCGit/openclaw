---
summary: "Spec for preserving clean landing semantics while moving OpenClaw toward a real Turbo workspace graph."
title: "Landing Gate Mapping"
---

# Landing Gate Mapping

## Goal

Prove that the repo can expand its Turbo graph without losing clarity around
the final landing gates.

## Core requirement

After graph expansion, maintainers still need simple answers to:

- what does `pnpm check` mean?
- what does `pnpm test` mean?
- what does `pnpm build` mean?
- which parts are package-local versus repo-global?

## Required mapping

Map each landing gate to:

1. underlying package-owned tasks
2. underlying repo-global tasks
3. transitional root wrappers, if any

## Validation questions

1. Does `pnpm check` remain the authoritative full repo check surface?
2. Does `pnpm test` still represent the required full-suite posture?
3. Does `pnpm build` still protect published and runtime surfaces?
4. Can Turbo accelerate execution without changing semantic meaning?

## Rules

- do not let Turbo obscure the required landing bar
- do not replace required root-global checks with partial package checks
- do not assume cached completion is equivalent unless inputs and outputs are
  truly covered

## Required outputs

- a gate-to-task mapping table
- a list of root-global checks that must remain explicit
- a list of package-owned tasks that can be orchestrated through Turbo
- a validation sequence for any future implementation sprint

## Success criteria

- landing semantics stay explicit
- maintainers can reason about local, landing, and CI gates
- Turbo expansion improves execution without confusing policy
