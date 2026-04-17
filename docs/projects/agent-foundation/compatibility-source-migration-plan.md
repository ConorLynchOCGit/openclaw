---
summary: "Plan and first execution step for moving compatibility-file sources out of transitional shared docs and into per-agent durable pack homes."
title: "Compatibility Source Migration Plan"
---

# Compatibility Source Migration Plan

## Current problem

The runtime assembly path is working, but some authored source material still
enters compatibility files through shared docs before it is owned by richer
per-agent packs.

## Current evidence

- `docs/agents/` now contains bounded runtime-source packs for:
  - `main`
  - `builder`
  - `researcher`
  - `web-researcher`
  - `writer`
  - `x-manager`
- `docs/system/agents.md` still carries shared runtime assembly rules that are
  intentionally broader than any one agent pack
- `builder`, `researcher`, and `writer` still have lean runtime-source seeds
  without richer authored `USER.md` or `BOOTSTRAP.md` surfaces

## Chosen direction

- keep shared assembly rules in `docs/system/agents.md`
- move agent-specific authored compatibility sources into `docs/agents/<id>/`
  as the richer pack-population slice proceeds
- treat `docs/system/agents.md` as policy and assembly guidance, not as the
  durable home for agent-local authored material

## Bounded first execution step completed in this sprint

An explicit source inventory and migration order now exists:

| Surface                                      | Current durable source                                                    | Target durable home                   | Timing              |
| -------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------- | ------------------- |
| shared runtime assembly rules                | `docs/system/agents.md`                                                   | remains shared                        | keep shared         |
| main authored profile and behavior           | `docs/agents/main/runtime/*`                                              | `docs/agents/main/` richer pack       | next agent slice    |
| builder authored compatibility sources       | `docs/agents/builder/runtime/*`                                           | `docs/agents/builder/` richer pack    | next agent slice    |
| researcher authored compatibility sources    | `docs/agents/researcher/runtime/*`                                        | `docs/agents/researcher/` richer pack | next agent slice    |
| writer authored compatibility sources        | `docs/agents/writer/runtime/*`                                            | `docs/agents/writer/` richer pack     | next agent slice    |
| specialist authored context already promoted | `docs/agents/web-researcher/runtime/*`, `docs/agents/x-manager/runtime/*` | keep per-agent                        | already in progress |

This removes the ambiguity about which remaining sources are truly shared versus
which should migrate into per-agent pack ownership.

## Next steps

1. populate richer authored pack content for the lean agents first
2. add agent-local `USER.md` or `BOOTSTRAP.md` only where evidence justifies it
3. shrink any shared transitional prose once the per-agent pack owns it

## Blocks agent work

No. This is now the front door of the next agent-focused slice rather than a
pre-agent blocker.
