---
summary: "Retained durable subset of the old build-performance project surface."
title: "Legacy Build Performance Surface"
---

# Legacy Build Performance Surface

This spec folds the still-relevant subset of the old
`projects/build-performance/` surface into the `turborepo` project.

## Retained durable content

- Turbo should expand through real package-owned task structure, not cosmetic
  wrappers
- constrained-host `pnpm test` throughput work remains a separate concern from
  Turbo graph ownership
- landing gates must stay mapped back to:
  - `pnpm check`
  - `pnpm test`
  - `pnpm build`
- build-performance investigation should stay focused on measurable bottlenecks
  such as:
  - import-heavy shared batches
  - runtime proof wait time
  - expensive build phases like `build:plugin-sdk:dts`

## Canonical ownership outcome

- keep active build-graph and gate-ownership planning under
  `docs/projects/turborepo/`
- treat the old single-file project surface as absorbed here rather than
  reviving it as a standalone workspace
