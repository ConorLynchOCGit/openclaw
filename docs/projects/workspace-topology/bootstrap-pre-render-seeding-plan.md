---
summary: "Plan and first execution step for deciding what bootstrap material should be seeded early versus refreshed at runtime."
title: "Bootstrap Pre-Render Seeding Plan"
---

# Bootstrap Pre-Render Seeding Plan

## Current problem

The runtime materialization path works, but the system still lacks an explicit
registry-backed statement of which bootstrap files should be eagerly seeded and
which must remain runtime-refreshed overlays.

## Current evidence

- runtime-source packs now materialize correctly into the live workspaces
- truncation handling was fixed, but some files still need runtime refresh
  because they combine durable authored content with generated overlays
- the bootstrap-file registry previously tracked ownership and projection mode,
  but not seed timing

## Chosen direction

- eagerly seed stable authored compatibility files where the output should exist
  before first user interaction
- keep projection-heavy files runtime-refreshed where they mix authored and
  generated content
- use registry metadata instead of ad hoc comments or operator memory

## Bounded first execution step completed in this sprint

The bootstrap-file registry now records seed policy metadata for every tracked
file class:

- `seedMode`
- `seedTiming`

That metadata is now validated by repo code in
`src/agents/bootstrap-file-registry.ts`.

The current seed posture is now explicit:

- eager seed:
  - `SOUL.md`
  - `IDENTITY.md`
  - `TOOLS.md`
- eager seed with runtime refresh:
  - `AGENTS.md`
- selective seed with projection overlay:
  - `USER.md`
  - `MEMORY.md`
- runtime-only seed:
  - `BOOTSTRAP.md`
- direct runtime input:
  - `memory/*.md`

## Next steps

1. teach the materializer to surface seed-policy decisions in generated
   diagnostics
2. decide whether lean authored pack files should be pre-rendered at workspace
   sync time for more agents
3. measure whether more eager seeding reduces first-session bootstrap churn

## Blocks agent work

No. The registry is now explicit enough to support the next agent slice without
making pre-render seeding mandatory first.
