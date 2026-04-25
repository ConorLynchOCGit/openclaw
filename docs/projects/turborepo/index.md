---
summary: "Workspace project for expanding OpenClaw from a narrow Turbo lane into a real package-task graph."
title: "Turborepo"
---

# Turborepo

This project workspace exists to turn the current narrow Turbo setup into a
real, measurable workspace task graph for OpenClaw.

Current reality:

- `turbo` is installed
- `turbo.json` exists
- the current Turbo lane is still intentionally bounded, but no longer UI-only:
  - `openclaw-control-ui`
  - `@openclaw/diffs`
- root landing gates are now decomposed:
  - root-owned work runs through explicit Turbo-managed root stages
  - package-owned UI/diffs work runs through Turbo inside the root wrappers

The goal of this project is not to wrap those monoliths cosmetically. The goal
is to define real package-owned tasks, expand the workspace graph honestly, and
keep the final landing bar coherent.

## Project docs

1. [Startup](/projects/turborepo/STARTUP)
2. [Status](/projects/turborepo/STATUS)
3. [Current Slice](/projects/turborepo/CURRENT_SLICE)
4. [Decisions](/projects/turborepo/DECISIONS)
5. [Roadmap](/projects/turborepo/roadmap)
6. [Spec Index](/projects/turborepo/specs)
7. [Root Gate Decomposition Audit](/projects/turborepo/root-gate-decomposition-audit)
8. [Vitest Optimization Audit 2026-04](/projects/turborepo/vitest-optimization-audit-2026-04)
9. [Validation Pipeline](/projects/turborepo/validation-pipeline)

## Scope

This project covers:

- workspace package task ownership
- root-gate decomposition
- realistic `turbo.json` expansion
- landing-gate mapping back to:
  - `pnpm check`
  - `pnpm test`
  - `pnpm build`

This project does not cover:

- fake Turbo adoption for optics
- unrelated product architecture changes
- weakening required landing gates

Current supporting lane:

- lightweight repo-owned proof can now cover narrow bootstrap-memory seams
  without paying a fresh Vitest environment for each tiny iteration
- that lane now also covers the deterministic `memory-md` bootstrap projection
  selection seam
