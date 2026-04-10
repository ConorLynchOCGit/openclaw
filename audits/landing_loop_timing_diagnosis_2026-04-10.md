# Landing Loop Timing Diagnosis — 2026-04-10

## Summary

The real problem is not a single slow build step.

The current end-to-end feature landing loop on this host is slow because three
costs stack together:

1. full `pnpm test` is now stable but still takes roughly thirty-five minutes
   under constrained-host safe mode
2. `pnpm build` still reruns work that should be incrementally skipped
3. the runtime proof / gateway landing path is still effectively coupled to the
   image-based Docker Compose runtime, so ordinary feature proof does not have a
   fast dedicated lane

The net effect is that ordinary feature work drifts into near-production
validation cost.

## Measured Or Reconstructed Timing Breakdown

### `pnpm test`

Measured on this host during the paused feature pass:

- command:
  - `pnpm test`
- planner mode:
  - constrained full-repo safe mode
  - top-level parallel disabled
  - one batch at a time
- observed wall-clock span:
  - start: `2026-04-10 12:22:04 UTC`
  - end: `2026-04-10 12:57:33 UTC`
  - total: roughly `35m 29s`

Representative observed lane costs during that green run:

- `unit-fast-batch-14`
  - about `97.8s`
- `unit-fast-batch-15`
  - about `106.6s`
- `unit-fast-batch-23`
  - about `97.2s`
- `unit-fast-batch-25`
  - about `108.5s`
- `unit-fast-batch-26`
  - about `109.4s`
- isolated heavy lanes:
  - `unit-deliver-memory-isolated`
    - about `89.7s`
  - `unit-isolated-agent.skips-delivery-without-whatsapp-recipient-besteffortdeliver-true-memory-isolated`
    - about `90.9s`
  - `unit-package-contract-guardrails-isolated`
    - about `53.0s`

Confirmed result:

- the full suite is now infra-stable on this host
- the remaining issue is throughput, not worker OOM/termination

### `pnpm build`

Measured on this host during the paused feature pass:

- command:
  - `pnpm build`
- observed wall-clock span:
  - start: `2026-04-10 12:20:32 UTC`
  - end: `2026-04-10 12:21:56 UTC`
  - total: roughly `84s`

Measured phase costs from gate output:

- `build:canvas:a2ui:bundle`
  - `0.78s`
- `build:tsdown`
  - `8.52s`
- `build:runtime-postbuild`
  - `25.89s`
  - subphase hotspot:
    - `bundled-plugin-runtime-deps`
      - `25.70s`
- `build:plugin-sdk:dts`
  - `42.74s`
- later asset/write phases plus UI build
  - roughly `6s` combined, with `build:ui` about `2.96s`

### Runtime proof / gateway landing / restart

This pass did not rerun a live gateway restart/build solely for timing capture.
Current timing for that path is therefore reconstructed from the real operator
surface, not freshly measured.

Confirmed current posture:

- the live Docker Compose runtime runs an image, not bind-mounted repo build
  output
- `docker-compose.yml` points the gateway service at
  `image: ${OPENCLAW_IMAGE:-openclaw:local}`
- the container command still executes `dist/index.js` inside that image
- ordinary code changes therefore tend to require an image build somewhere in
  the path before `docker compose up -d --no-build openclaw-gateway` is useful

Confirmed timing gap:

- the repo currently has no durable first-class timing artifact for:
  - Docker image build duration
  - gateway restart duration
  - `/readyz` time-to-ready
  - production vs proof lane runtime proof cost

That missing timing is itself part of the problem.

## Necessary Cost vs Wasted Cost

### Necessary Cost

Necessary cost in the current loop:

- targeted regression tests near the touched surface
- `pnpm check:fast`
- `pnpm check:types` for typed/runtime changes
- some form of runtime build for runtime-sensitive changes
- some form of runtime proof with `/readyz`

### Confirmed Accidental Repeated Cost

Confirmed accidental repeated cost inside `pnpm build`:

- `scripts/plugin-sdk-dts-build.mjs`
  - stores its stamp at
    `dist/plugin-sdk/.openclaw-plugin-sdk-dts-stamp.json`
- `scripts/stage-bundled-plugin-runtime-deps.mjs`
  - stores per-plugin runtime-deps stamps inside generated plugin dirs under
    `dist/extensions/...`
- `scripts/stage-bundled-plugin-runtime.mjs`
  - stores overlay stamps under `dist-runtime/extensions/...`
- earlier build phases recreate or clean generated output trees
- result:
  - later “incremental” phases lose their cache metadata and rerun

This is real repeated cost, but it is not the dominant 20-minute problem.

### Wrong Default Workflow Cost

The larger cost is wrong-default workflow cost:

- the current operator loop still drifts toward:
  - `pnpm test`
  - `pnpm build`
  - image-oriented runtime landing/proof
- that is too expensive for ordinary bounded feature work on this host
- the repo has guidance to “use the smallest honest gate,” but it does not yet
  provide a clear feature landing lane plus a fast runtime proof lane that
  operators can trust as a first-class workflow

## Confirmed Hotspots

Primary hotspot:

- full `pnpm test` throughput under constrained-host safe mode

Secondary hotspots:

- `build:plugin-sdk:dts`
- `runtime-postbuild -> bundled-plugin-runtime-deps`

Structural runtime-proof hotspot:

- no fast proof lane decoupled from the image-oriented compose runtime

## Missing Instrumentation Gaps

Current instrumentation gaps:

- build phases print timings to stdout, but no durable JSON or rolling history
  is kept
- test planner writes a summary artifact to a temp directory, then removes it by
  default
- runtime proof / compose restart / `/readyz` timing is not recorded as a
  durable artifact
- repo-heavy lock status tells you what is running, but not how long the common
  gates took historically
- current operator guidance does not give a single durable timing source for:
  - `pnpm test`
  - `pnpm build`
  - image build
  - container restart
  - readiness time

## Root Cause

The current workflow conflates three distinct validation needs:

1. feature landing confidence
2. broader integration confidence
3. production promotion confidence

Because there is no clean first-class split, operators end up paying the most
expensive path too often.

## Diagnosis Conclusion

The real solution is not “make `pnpm build` one minute faster.”

The real solution needs all three of these:

1. gate tiering so ordinary feature work does not default to the full production
   loop
2. a fast runtime proof lane that does not require image rebuilds for every
   bounded feature slice
3. incremental build stamp relocation so the unavoidable build work is actually
   incremental
