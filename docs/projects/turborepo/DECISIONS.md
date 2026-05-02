---
summary: "Stable decisions for the Turborepo workspace project."
title: "Turborepo Decisions"
---

# Turborepo Decisions

## 2026-04-16 - treat Turbo as a real workspace-graph project, not a wrapper exercise

Decision:

- Turbo work must be driven by package-owned task structure
- the project will not treat root-script wrappers as success
- root monoliths may remain temporarily, but only as transitional surfaces

Reasoning:

- Turbo only earns its keep when it can orchestrate real task ownership
- wrapping existing monoliths would add complexity without meaningful
  selectivity, caching, or ownership clarity

## 2026-04-16 - keep landing gates authoritative during the transition

Decision:

- the project must preserve clear mapping to:
  - `pnpm check`
  - `pnpm test`
  - `pnpm build`
- Turbo expansion is not allowed to weaken the landing bar

Reasoning:

- the point of the project is better orchestration, not lower standards
- maintainers still need a stable answer to "what must be green before push"

## 2026-04-16 - use a project-doc workspace under `docs/projects/turborepo/`

Decision:

- Turbo planning and implementation docs live under
  `docs/projects/turborepo/`
- the structure mirrors the established `model-memory` project pattern:
  - startup
  - status
  - current slice
  - decisions
  - roadmap
  - specs

Reasoning:

- this keeps the work durable and discoverable
- the repo already uses `docs/projects/model-memory/` as the clearest project
  workspace pattern

## 2026-04-16 - absorb the old build-performance project surface here

Decision:

- the retained subset of `projects/build-performance/` is now canonized under
  `docs/projects/turborepo/`
- the old standalone build-performance project does not come back as its own
  workspace

Reasoning:

- the still-relevant content is build-graph and landing-gate planning
- that content belongs with the current Turbo and gate-ownership project

## 2026-04-25 - only cut local landing gates over to Turbo-first after ownership is real

Decision:

- the eventual target is Turbo-first local `pnpm test` and `pnpm build`
  orchestration
- that cutover must not happen while most of the meaningful test/build graph is
  still root-owned
- until then, the custom local scheduler remains the canonical local speed path
  for the root-heavy Vitest graph

Reasoning:

- Turbo wins when the graph reflects real ownership and cacheable boundaries
- forcing Turbo to front a mostly root-owned graph would add indirection without
  delivering the full selectivity or cache value we want
- the correct sequence is ownership extraction first, Turbo-first cutover
  second
