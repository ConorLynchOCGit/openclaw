# Current Slice

## Active slice

Memory spec-pack and implementation sequencing pass before the next major code
slice

## Objective

Prepare the memory system for fast, coherent implementation by turning the new
roadmap into a discoverable spec pack.

This slice is about:

- separating:
  - what is already built and live
  - what is built but not yet normal production behavior
  - what is not built yet
- writing implementation-ready specs for the major not-built families
- writing productionization plans for the built-off-production governance
  surfaces
- defining sequencing, guardrails, and premortem coverage before more feature
  code begins
- updating the roadmap and entrypoint docs so fresh sessions can find the
  architecture and spec pack immediately

## Required work

1. Inventory the remaining roadmap families as:
   - `built_live`
   - `built_offprod_or_partial`
   - `not_built`
2. Write dedicated specs for the major not-built families.
3. Write productionization plans for already-built but not-yet-online
   governance surfaces.
4. Add sequencing guidance and premortem guardrails.
5. Update:

- `docs/memory-system/STATUS.md`
- `docs/memory-system/DECISIONS.md`
- `docs/memory-system/OPEN_QUESTIONS.md`
- `docs/memory-system/CURRENT_SLICE.md`
- `docs/memory-system/README.md`
- `docs/memory-system/memory-roadmap.md`
- `docs/memory-system/feature-inventory.md`
- `docs/memory-system/specs/README.md`

## Out of scope

- implementation code for new memory features
- production posture changes
- enabling new runtime behavior
- enabling self-improving capture
- enabling actual installation
- automatic Skill Vetter invocation
- runtime memory-slot takeover

## Acceptance criteria

- a canonical feature inventory exists
- the major not-built families each have implementation-ready specs
- built-off-production governance surfaces have explicit productionization
  plans
- sequencing and premortem docs exist
- the roadmap and entrypoint docs point to the new spec pack

## Notes

This slice does not broaden into full autonomous memory behavior or begin new
feature implementation.
