---
summary: "Turborepo-first validation command map, cache policy, and fast/full lane workflow."
title: "Validation Pipeline"
---

# Validation Pipeline

OpenClaw validation keeps the public command names stable while routing broad
work through Turbo-managed task graphs.

## Command Map

- `pnpm check` runs the root Turbo check graph, then package-owned UI checks.
- `pnpm build` runs package-owned UI/diffs builds through Turbo, then the
  ordered root build graph.
- `pnpm test` runs the root full-suite Turbo shard graph when no file or
  changed-file target is supplied.
- `pnpm test:file <paths...>` remains the narrow file-targeted Vitest lane.
- `pnpm turbo run test:root:extensions:all --filter=openclaw --concurrency=4`
  runs extension tests as per-extension Turbo tasks. The compatibility command
  `pnpm test:root:extensions` still exists, but the full root test graph uses
  the split aggregate for cacheable resume behavior.
- The pre-commit hook still calls `pnpm check` unless `FAST_COMMIT` or the
  existing docs-only bypass applies.

## Fast Lane

- Use `pnpm test:file <changed test files>` for focused test feedback.
- Use `pnpm exec oxlint <changed files>` for touched JavaScript/TypeScript
  files when a full lint is not needed.
- Use `git diff --check` before staging.
- Use package-specific Turbo lanes when the ownership is clear:
  `pnpm turbo:ui:build`, `pnpm turbo:ui:test`, `pnpm turbo:diffs:build`.
- Use `pnpm turbo run test:root:extensions:<name> --filter=openclaw` to resume
  a failed extension project without rerunning the full extension suite.

## Full Lane

- `pnpm check` is the landing-quality static gate.
- `pnpm build` is the landing-quality build gate.
- `pnpm test` is the landing-quality root full-suite test gate when feasible.
- Repeating a Turbo-backed gate should show cache hits for unchanged cacheable
  tasks. Remote caching is not required by this repo-local workflow.
- Extension tests are split into cacheable project tasks under
  `test:root:extensions:*`; this prevents one large extension shard from
  invalidating all extension work and makes failed-project reruns narrow.

## Cache Policy

- Cacheable root checks include conflict-marker checks, topology checks,
  generated-config freshness checks, import-cycle checks, lint lanes, `tsgo`,
  and package-boundary artifact preparation.
- Package-boundary preparation declares its generated d.ts outputs so Turbo can
  restore them safely before dependent type checks.
- Root build/postbuild tasks remain non-cacheable because they mutate shared
  `dist` outputs and postbuild sidecars in an ordered chain.
- Live-network, Docker-daemon, tailnet, browser, and runtime-proof tasks must
  stay outside the default cached validation graph unless they gain explicit
  deterministic inputs and declared outputs.

## Parallelism Policy

- Root check and root test graphs use bounded Turbo concurrency.
- Root full-suite tests preserve local worker budgeting so Turbo can run test
  shards in parallel without multiplying Vitest worker counts uncontrollably.
- Extension project tasks inherit the existing local worker budgeting from
  `scripts/run-vitest.mjs`; the split graph increases Turbo-level parallelism
  while keeping each Vitest project bounded.
- Generated package-boundary artifacts are ordered before `tsgo`; mutable build
  and postbuild steps stay ordered.

## Known Follow-Ups

- Decompose root postbuild into package-owned or artifact-owned tasks before
  making more of the build graph cacheable.
- Split any hanging or environment-dependent Vitest shards out of the default
  local full-suite path only with explicit coverage-preserving replacement
  lanes.
- Consider remote Turbo cache only after cache keys, outputs, and secret
  handling are reviewed for CI and developer machines.
