---
summary: "Feature, integration, and production landing gates plus the faster runtime proof lane"
read_when:
  - Landing bounded feature work on the VPS feels too slow
  - You need to know which gate tier to run
  - You are changing the build, test, or proof workflow
title: "Landing Gate Tiers"
---

# Landing Gate Tiers

This doc defines the lighter-weight landing model for VPS feature work.

The goal is straightforward:

- stop paying the full production landing loop for ordinary bounded slices
- make runtime proof fast and explicit
- keep the strongest gates available for broader or production-facing changes

## Why This Exists

The current landing loop on the live VPS is too expensive for ordinary bounded
feature work.

Observed shape on the current host:

- `pnpm test`
  - roughly `35m`
- `pnpm build`
  - roughly `84s`
- runtime proof / gateway landing
  - still lacks durable timing, but remains coupled to an image-oriented Docker
    runtime path

The biggest problem is not one slow build phase.

The biggest problem is that ordinary feature work is still paying too much of
the production-grade validation path.

## Gate Tiers

### 1. Feature Landing Gate

Purpose:

- the default landing bar for bounded feature work
- optimized for honest local confidence without paying the full production loop

Runs:

- strongest nearby targeted tests
- `pnpm gate:feature`
- `pnpm check:types` when the change touches runtime or typed code
- `pnpm build:runtime:fast` when the touched surface is runtime/build-sensitive
- `pnpm runtime:proof:fast` when the slice changes live runtime behavior and
  needs non-production proof

Does not run by default:

- full `pnpm test`
- production image build
- production gateway restart

Risk class covered:

- bounded feature work with known touched surfaces
- most repo code changes that are not broad cross-cutting refactors

Risk class not covered:

- full suite parity across unrelated surfaces
- production image/promotion assurance

### 2. Broader Integration Gate

Purpose:

- the middle tier between feature work and production promotion
- used when the change crosses multiple surfaces or the blast radius is
  materially broader than one local slice

Runs:

- everything in the feature landing gate
- `pnpm gate:integration`
- broader planner-backed test coverage matched to touched surfaces, for example:
  - `pnpm test --surface unit`
  - `pnpm test --surface gateway`
  - `pnpm test --surface extensions`
  - `pnpm test --surface channels`
- full `pnpm build` when the touched surface can affect build output or
  published/runtime contracts

Does not run by default:

- full production promotion
- production image rebuild/restart unless this gate is being used as the final
  pre-production bar

Risk class covered:

- cross-surface code changes
- plugin/runtime/gateway changes with broader integration risk

### 3. Production Landing Gate

Purpose:

- the full pre-push / pre-promotion bar for production-facing landing

Runs:

- `pnpm gate:production`
- production image build when code in the runtime image changed
- production restart / rollout
- `/readyz` proof

Risk class covered:

- production promotion
- broad refactors
- anything that truly needs the whole suite and the real image-based runtime
  path

## Fast Runtime Proof Lane

Use a dedicated proof runtime lane with:

- build input:
  - `pnpm build:runtime:fast`
- restart/proof input:
  - `pnpm runtime:proof:fast`
  - a proof gateway that consumes the repo's built runtime output directly
    instead of requiring a fresh image build every time
- proof check:
  - restart the proof gateway
  - wait for `/readyz`
  - run the narrow proof command or scenario for the slice

### Valid Use

Valid for:

- VPS feature proof
- non-production runtime validation
- repeated iteration during a bounded slice

Not valid for:

- final production promotion
- release image confidence
- any situation where the exact built image artifact itself is the thing being
  verified

This lane is valid for bounded VPS feature proof. It is not the production
promotion path and it does not replace the full image-based rollout.

## Incremental Build Fix

### Problem

Several build stamps currently live inside generated output trees:

- `dist/plugin-sdk/.openclaw-plugin-sdk-dts-stamp.json`
- per-plugin runtime-deps stamps inside `dist/extensions/...`
- overlay stamps inside `dist-runtime/extensions/...`

Those generated trees are recreated or cleaned by earlier build steps.

Result:

- supposedly incremental later phases lose their cache metadata and rerun

Persistent stamps now live in a repo-local non-generated cache root:

- `.local/build-stamps/plugin-sdk-dts.json`
- `.local/build-stamps/runtime-deps/<plugin-id>.json`
- `.local/build-stamps/runtime-overlay/<plugin-id>.json`

Invalidation rules:

- the true source fingerprint changes
- a required output is missing
- a plugin disappears from the built tree
- the build logic version changes

The stamp should not be invalidated just because `dist/` or `dist-runtime/`
were refreshed by an earlier phase.

## Timing Instrumentation

Heavy gates now emit durable timing artifacts:

- location:
  - `.local/gate-metrics/latest/build.json`
  - `.local/gate-metrics/history/<timestamp>-build.json`
- contents:
  - total duration
  - per-phase durations
  - git/tree fingerprint
  - whether phases were cache hits or real work

Test runs emit durable artifacts too:

- location:
  - `.local/gate-metrics/latest/test.json`
  - `.local/gate-metrics/history/<timestamp>-test.json`
- contents:
  - total wall time
  - plan shape
  - per-lane durations
  - infra/test failure classification
  - per-lane peak RSS

Current temp artifacts should stop being the only durable timing source.

Runtime proof emits:

- build duration
- restart duration
- `/readyz` time-to-ready
- `/healthz` snapshot time
- proof-command duration
- image build duration when relevant

Artifacts live under:

- `.local/gate-metrics/latest/*.json`
- `.local/gate-metrics/history/*.json`

Use those artifacts to compare:

- `pnpm build`
- `pnpm build:runtime:fast`
- `pnpm test`
- `pnpm runtime:proof:fast`

## Commands

Use these commands directly:

- `pnpm gate:feature`
- `pnpm gate:integration`
- `pnpm gate:production`
- `pnpm build:runtime:fast`
- `pnpm runtime:proof:fast`

Typical bounded runtime slice:

1. targeted tests
2. `pnpm gate:feature`
3. `pnpm build:runtime:fast`
4. `pnpm runtime:proof:fast`

Broader integration slice:

1. strongest targeted tests
2. `pnpm gate:integration`
3. any extra surface-specific `pnpm test --surface ...` runs that the change needs

Production-facing landing:

1. `pnpm gate:production`
2. image build / restart / `/readyz` proof

- latest test time
- latest proof time
- last cache-hit vs full-work build

## Minimal Implementation Slices

### Slice A — Measurement First

- persist build timing artifacts
- persist test timing artifacts
- add a runtime-proof timing wrapper/artifact model

### Slice B — Build Cache Hygiene

- move plugin-sdk dts stamp out of `dist`
- move runtime-deps stamps out of `dist/extensions`
- move overlay stamps out of `dist-runtime`

### Slice C — Fast Runtime Build

- add a first-class `pnpm build:runtime:fast`
- make it skip unchanged expensive phases honestly
- make it explicit that it is not the full production build

### Slice D — Fast Runtime Proof Lane

- add a proof gateway path that can consume repo build output without forcing a
  new image build every iteration
- require `/readyz` as the proof gate

### Slice E — Gate Tier Rollout

- document the three gate tiers
- add helper commands or runbook shortcuts
- update operator workflow guidance

## Rollout / Verification Plan

Recommended rollout order:

1. measurement artifacts first
2. build stamp relocation
3. fast runtime build path
4. proof lane
5. gate-tier documentation and operator adoption

Verification expectations:

- compare before/after build timings on unchanged trees
- compare before/after runtime proof loop timings
- prove the feature landing gate remains honest on representative slices
- keep the production landing gate unchanged until the new lower tiers are
  validated

## Resume Plan For The Paused Feature Pass

Once this proposal is accepted, there are two valid next steps:

1. implement the workflow improvements first, then return to the paused feature
   closeout
2. return directly to the paused feature closeout, then improve the workflow in
   a separate pass

If we return directly to the paused feature closeout:

- no more feature implementation is needed
- only the final scoped commits, pushes, and final report remain

If we implement the workflow improvements first:

- keep the paused feature tree untouched
- re-run only the gates invalidated by the workflow work before final feature
  closeout
