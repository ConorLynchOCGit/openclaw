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
- `pnpm validate:push:fast` is the inner-loop push gate. It runs the
  classified changed/domain tests plus lightweight static validation
  (`git diff --check`, JSON parsing for changed JSON, and `oxlint` for changed
  JavaScript/TypeScript files).
- `pnpm validate:push` is the normal local pre-push gate for narrow branch
  work. It runs classified changed/domain tests, `pnpm check`, and
  `pnpm build`.
- `pnpm validate:push:full` is the strongest local pre-push gate short of
  exhaustive `pnpm test`. It uses the same safe classification as
  `validate:push`, then runs `pnpm check` and `pnpm build`.
- Domain lanes provide focused coverage for active Model Memory work:
  `pnpm test:model-memory`, `pnpm test:gateway-memory`, and
  `pnpm test:retrieval`.
- `pnpm test:model-memory:push` is a de-duplicated Model Memory push lane that
  unions Model Memory extension, gateway/session memory, retrieval/context,
  proof, capsule, graph, agent/tool integration, and bootstrap projection
  coverage without chaining overlapping broad configs repeatedly.
- `pnpm turbo run test:root:extensions:all --filter=openclaw --concurrency=4`
  runs extension tests as per-extension Turbo tasks. The compatibility command
  `pnpm test:root:extensions` still exists, but the full root test graph uses
  the split aggregate for cacheable resume behavior.
- The pre-commit hook still calls `pnpm check` unless `FAST_COMMIT` or the
  existing docs-only bypass applies.

## Fast Lane

- Use `pnpm test:file <changed test files>` for focused test feedback.
- Use `pnpm validate:push:fast` during inner-loop work when you need the
  quickest safe local signal.
- Use `pnpm validate:push` before pushing normal narrow implementation slices.
  It classifies changed files by domain and intentionally avoids the root-config
  changed-file fallback that can expand into the exhaustive shard graph.
- Use `pnpm validate:push:full` when a local branch is ready for handoff and
  you want the strongest non-exhaustive local push gate.
- Use `pnpm exec oxlint <changed files>` for touched JavaScript/TypeScript
  files when a full lint is not needed.
- Use `git diff --check` before staging.
- Use package-specific Turbo lanes when the ownership is clear:
  `pnpm turbo:ui:build`, `pnpm turbo:ui:test`, `pnpm turbo:diffs:build`.
- Use `pnpm turbo run test:root:extensions:<name> --filter=openclaw` to resume
  a failed extension project without rerunning the full extension suite.

## Domain Lanes

- `pnpm test:model-memory` is Turbo-backed by
  `test:domain:model-memory` and covers the Model Memory extension, Model
  Memory agent integration tests, the model-memory tool surface, gateway memory
  startup/session tests, and the bootstrap projection Node test.
- `pnpm test:gateway-memory` is Turbo-backed by
  `test:domain:gateway-memory` and covers gateway/session memory capture,
  session send behavior, live-runtime memory seams, ordinary-turn persistence,
  shadow adapters, and live document ingestion service tests.
- `pnpm test:retrieval` is Turbo-backed by `test:domain:retrieval` and covers
  Model Memory retrieval, request interpretation, runtime retrieval/context
  modules, runtime graph/read-model tests, project-state capsule tests, derived
  artifacts, and proof harness tests.
- `pnpm test:model-memory:push` is Turbo-backed by
  `test:domain:model-memory:push` and is the preferred Phase 2 local push lane
  for Model Memory slices because it runs the union once instead of invoking
  overlapping gateway, agents, extensions, retrieval, and proof configs through
  multiple command paths.
- These lanes are additive developer lanes. They do not remove any tests from
  `pnpm test`.

## Push Classification

- Model Memory changes run `pnpm test:model-memory:push`.
- Gateway memory/session changes run `pnpm test:gateway-memory`; retrieval is
  added only when retrieval/context/proof/capsule/graph paths changed and the
  de-duplicated Model Memory push lane is not already selected.
- Retrieval, capsule, graph, context, derived-artifact, and proof changes run
  `pnpm test:retrieval` unless they are already covered by
  `test:model-memory:push`.
- Validation-pipeline changes such as `package.json`, `turbo.json`,
  `scripts/test-projects.mjs`, `scripts/test-domain-lane.mjs`,
  `scripts/validate-push.mjs`, `test/vitest/**`, and Turborepo docs run the
  de-duplicated Model Memory push lane instead of raw `test:changed`.
- Unknown root/config changes fall back to `test:model-memory:push` plus the
  static/build gate for normal/full modes. This is intentionally broader than a
  smoke test but avoids accidental expansion into known slow environmental
  shards.
- Ordinary non-root source and test changes can still use `pnpm test:changed`
  when classification finds no higher-signal domain lane.

## Full Lane

- `pnpm check` is the landing-quality static gate.
- `pnpm build` is the landing-quality build gate.
- `pnpm test` is the exhaustive root test suite and should be treated as a
  CI/nightly/pre-merge/release-level gate rather than the default local
  pre-push gate for every narrow slice.
- Repeating a Turbo-backed gate should show cache hits for unchanged cacheable
  tasks. Remote caching is not required by this repo-local workflow.
- The Model Memory domain lanes are first-class Turbo tasks with explicit
  inputs and no declared outputs. They are cacheable because they are local
  deterministic test commands and do not touch browser, tailnet, Docker, live
  network, or mutable external-service state.
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
  `dist` outputs and postbuild sidecars in an ordered chain. The root build now
  runs the existing decomposed `build:root:*` chain through Turbo instead of
  using the monolithic postbuild wrapper as the default root build aggregate.
- Live-network, Docker-daemon, tailnet, browser, and runtime-proof tasks must
  stay outside the default cached validation graph unless they gain explicit
  deterministic inputs and declared outputs.
- Domain lane cache keys include their runner scripts, Vitest configs, and
  owned Model Memory/gateway/retrieval source and test paths. Changing unrelated
  areas should allow Turbo to replay those domain lanes across adjacent slices.

## Root Shard Findings

- The old monolithic extension shard is split into per-extension Turbo tasks.
- `vitest.extension-bluebubbles.config.ts` previously hung when a root
  validation edit expanded through the raw changed-file shard graph. Local push
  gates now quarantine that path by classifying validation/root/config changes
  into explicit domain lanes instead of invoking broad changed-root expansion.
  The bluebubbles shard remains in exhaustive `pnpm test`; coverage was not
  removed.
- Remaining large root aggregates are `core-runtime` and `agentic`. They are
  already composed from multiple Vitest project configs, but the Turbo graph
  still treats each aggregate as a single cache unit.
- Do not split those aggregates blindly. The next safe split should mirror the
  extension approach only after a concrete failure, hang, or cache-miss profile
  shows a specific aggregate is wasting local iteration time.

## Build/Postbuild Plan

- The root build graph now uses the existing individual `build:root:*` tasks
  up to `build:root:write-cli-compat`.
- These tasks intentionally remain non-cacheable until each output is declared
  precisely and nondeterministic side effects are isolated.
- Best next candidates for cacheable decomposition are idempotent writers with
  narrow outputs: hook metadata copy, export HTML template copy, CLI compat
  sidecars, and build-info/startup metadata after output keys are reviewed.

## Remote Cache Readiness

- Remote Turbo cache is not configured in this repo-local workflow.
- Do not enable remote cache until cache keys, environment passthrough, output
  paths, and secret exposure are reviewed for CI and developer machines.
- Current non-cacheable categories must remain local-only: live network, Docker,
  tailnet/browser proof, wall-clock-sensitive reports, and mutable shared
  postbuild outputs.

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

- Continue decomposing root postbuild outputs before making more of the build
  graph cacheable.
- Split any hanging or environment-dependent Vitest shards out of the default
  local full-suite path only with explicit coverage-preserving replacement
  lanes.
- Consider remote Turbo cache only after cache keys, outputs, and secret
  handling are reviewed for CI and developer machines.
