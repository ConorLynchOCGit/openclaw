---
summary: "Startup brief for the Turborepo workspace project."
title: "Turborepo Startup"
---

# Turborepo Startup

## Mission

Convert the current narrow Turbo posture into a real workspace task graph that
improves local and VPS landing performance without weakening the repo's actual
verification bar.

## Starting truth

- `turbo` is installed in the repo root
- `turbo.json` exists
- the currently honest Turbo lane is UI-scoped only
- the repo still relies heavily on root-owned monolithic scripts
- many workspace packages do not yet own explicit `build`, `test`, or `check`
  scripts

## Problem statement

OpenClaw is still paying the cost of root-level monoliths for most important
gates. That means Turbo cannot yet do maximal real orchestration because there
is not enough package-owned task structure to orchestrate.

## Project outcomes

This project should produce:

1. an inventory of which workspace packages can own `build`, `test`, and
   `check`
2. a decomposition plan for the root monoliths
3. a real `turbo.json` expansion plan
4. a validation contract showing how:
   - `pnpm check`
   - `pnpm test`
   - `pnpm build`
     still map cleanly onto the Turbo-expanded workspace graph

## Success criteria

- the repo has a clear package-task ownership map
- Turbo expansion is tied to real workspace tasks, not wrappers around
  monolithic root commands
- landing-gate expectations remain explicit
- future implementation work can proceed slice-by-slice without losing the
  architecture

## Non-goals

- replacing PNPM with Turbo
- claiming every repo task should become a package-local task
- changing CI or landing policy before the task graph exists
- treating browser/system dependency setup as a Turbo architecture decision

## Initial startup checklist

1. inventory workspace packages and existing scripts
2. classify task ownership candidates
3. identify which root tasks can be decomposed safely
4. define the target Turbo graph phases
5. define the landing-gate mapping and validation plan
